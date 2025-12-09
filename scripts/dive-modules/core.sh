#!/bin/bash
# =============================================================================
# DIVE V3 CLI - Core Commands Module
# =============================================================================
# Commands: up, down, restart, logs, ps, exec
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CORE COMMANDS
# =============================================================================

cmd_up() {
    print_header
    check_docker || exit 1
    check_certs || exit 1
    load_secrets || exit 1
    ensure_required_secrets_nonlocal || exit 1
    apply_env_profile
    
    log_step "Starting DIVE V3 Stack..."
    
    # Choose compose file based on environment
    COMPOSE_FILE="docker-compose.yml"
    [ "$ENVIRONMENT" = "pilot" ] && COMPOSE_FILE="docker-compose.pilot.yml"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose -f $COMPOSE_FILE up -d"
        log_dry "Would verify Keycloak realm dive-v3-broker and bootstrap if missing"
        log_dry "Would health-check backend/frontend after start"
        log_dry "Would verify IdPs are present (non-empty) and fail if missing"
    else
        dc up -d
        wait_for_keycloak || { log_error "Keycloak did not become ready"; exit 1; }
        ensure_broker_realm || { log_error "Broker realm bootstrap failed"; exit 1; }
        ensure_idps_present || { log_error "No IdPs found; aborting startup"; exit 1; }
        ensure_webauthn_policy
        wait_for_backend || { log_error "Backend did not become ready"; exit 1; }
        wait_for_frontend || { log_error "Frontend did not become ready"; exit 1; }
    fi
    
    log_success "Stack started"
    echo ""
    echo "  Frontend: https://localhost:3000"
    echo "  Backend:  https://localhost:4000"
    echo "  Keycloak: https://localhost:8443"
    echo "  OPAL:     https://localhost:7002"
}

# Fail fast when running non-local profiles without required secrets
ensure_required_secrets_nonlocal() {
    case "$ENVIRONMENT" in
        local|dev)
            return 0
            ;;
    esac
    local missing=0
    for v in POSTGRES_PASSWORD KEYCLOAK_ADMIN_PASSWORD MONGO_PASSWORD AUTH_SECRET KEYCLOAK_CLIENT_SECRET; do
        if [ -z "${!v}" ]; then
            log_error "Missing required secret for env '$ENVIRONMENT': $v"
            missing=$((missing+1))
        fi
    done
    [ $missing -eq 0 ]
}

# Wait for Keycloak to be reachable before running realm checks
wait_for_keycloak() {
    log_step "Waiting for Keycloak to become ready..."
    local retries=12 # 12 * 5s = 60s
    local count=0
    local health_url="${KEYCLOAK_HEALTH_URL:-https://localhost:8443/realms/master}"
    while [ $count -lt $retries ]; do
        local code
        code=$(curl -k -s -o /dev/null -w "%{http_code}" --max-time 5 "$health_url" || echo "000")
        if [ "$code" = "200" ]; then
            log_success "Keycloak is reachable (code $code)"
            return 0
        fi
        sleep 5
        count=$((count + 1))
        log_verbose "Keycloak not ready yet (attempt $count/$retries, code=$code, url=$health_url)"
    done
    return 1
}

# Wait for backend HTTPS health
wait_for_backend() {
    log_step "Waiting for backend to become ready..."
    local retries=12
    local count=0
    while [ $count -lt $retries ]; do
        if curl -kfs --max-time 5 "https://localhost:4000/health" >/dev/null 2>&1; then
            log_success "Backend is reachable"
            return 0
        fi
        sleep 5
        count=$((count + 1))
        log_verbose "Backend not ready yet (attempt $count/$retries)"
    done
    return 1
}

# Wait for frontend HTTPS root
wait_for_frontend() {
    log_step "Waiting for frontend to become ready..."
    local retries=12
    local count=0
    while [ $count -lt $retries ]; do
        if curl -kfs --max-time 5 "https://localhost:3000/" >/dev/null 2>&1; then
            log_success "Frontend is reachable"
            return 0
        fi
        sleep 5
        count=$((count + 1))
        log_verbose "Frontend not ready yet (attempt $count/$retries)"
    done
    return 1
}

# Check if the broker realm exists
broker_realm_exists() {
    local realm_url="${KEYCLOAK_ISSUER:-https://localhost:8443/realms/dive-v3-broker}"
    local code
    code=$(curl -k -s -o /dev/null -w "%{http_code}" --max-time 5 "$realm_url" || echo "000")
    [ "$code" = "200" ]
}

# Bootstrap broker realm via kcadm inside the Keycloak container if missing
bootstrap_broker_realm() {
    local realm="dive-v3-broker"
    local keycloak_container="dive-v3-keycloak"
    local admin_user="${KEYCLOAK_ADMIN_USERNAME:-admin}"
    local admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-}"
    local public_url="${NEXT_PUBLIC_KEYCLOAK_URL:-https://localhost:8443}"
    local frontend_url="${NEXT_PUBLIC_BASE_URL:-https://localhost:3000}"
    local client_id="${KEYCLOAK_CLIENT_ID:-dive-v3-client-broker}"
    local client_secret="${KEYCLOAK_CLIENT_SECRET:-}"

    if [ -z "$admin_pass" ] || [ -z "$client_secret" ]; then
        log_error "Missing KEYCLOAK_ADMIN_PASSWORD or KEYCLOAK_CLIENT_SECRET; cannot bootstrap realm."
        return 1
    fi

    log_step "Bootstrapping Keycloak broker realm (${realm}) via kcadm..."

    # Login to master realm
    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master \
        --user "$admin_user" --password "$admin_pass" >/dev/null 2>&1

    # Create realm if not present
    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh create realms -s realm="$realm" -s enabled=true \
        -s displayName="DIVE V3 Broker" \
        -s 'loginTheme="dive-v3"' \
        -s "attributes.frontendUrl=${public_url}" \
        -s "attributes.adminUrl=${public_url}" \
        --config /opt/keycloak/data/.keycloak/kcadm.config >/dev/null 2>&1 || true

    # Ensure client exists/updated
    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh create clients -r "$realm" \
        -s clientId="$client_id" \
        -s protocol=openid-connect \
        -s publicClient=false \
        -s standardFlowEnabled=true \
        -s directAccessGrantsEnabled=false \
        -s "redirectUris=[\"${frontend_url}/*\",\"https://localhost:3000/*\"]" \
        -s "webOrigins=[\"${frontend_url}\",\"https://localhost:3000\"]" \
        -s "secret=${client_secret}" \
        --config /opt/keycloak/data/.keycloak/kcadm.config >/dev/null 2>&1 || true

    log_success "Broker realm ensured (dive-v3-broker)"
}

ensure_broker_realm() {
    if broker_realm_exists; then
        log_success "Broker realm present (dive-v3-broker)"
        return 0
    fi
    bootstrap_broker_realm
}

ensure_webauthn_policy() {
    # WebAuthn RP ID alignment for local and CF/cloud. Derive rpId from:
    # 1) KEYCLOAK_RP_ID env (explicit override)
    # 2) NEXT_PUBLIC_KEYCLOAK_URL host (if present)
    # 3) fallback to localhost
    local keycloak_container="${KEYCLOAK_CONTAINER:-dive-v3-keycloak}"
    local admin_user="${KEYCLOAK_ADMIN_USERNAME:-admin}"
    local admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-}"
    local max_retries=6
    local delay=5
    local rp_id="${KEYCLOAK_RP_ID:-}"

    if [ -z "$rp_id" ] && [ -n "${NEXT_PUBLIC_KEYCLOAK_URL:-}" ]; then
        rp_id=$(echo "$NEXT_PUBLIC_KEYCLOAK_URL" | sed 's#https\?://##' | cut -d/ -f1)
    fi
    rp_id="${rp_id:-localhost}"

    if [ -z "$admin_pass" ]; then
        log_warn "Skipping WebAuthn policy (missing KEYCLOAK_ADMIN_PASSWORD)"
        return 0
    fi

    log_step "Applying WebAuthn policy (rpId=${rp_id})..."

    for i in $(seq 1 "$max_retries"); do
        if docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh config credentials \
            --server http://localhost:8080 --realm master --user "$admin_user" --password "$admin_pass" >/dev/null 2>&1; then
            break
        fi
        [ "$i" -eq "$max_retries" ] && { log_warn "WebAuthn policy: kcadm auth failed after ${max_retries} attempts"; return 0; }
        sleep "$delay"
    done

    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh update realms/dive-v3-broker \
      -s webAuthnPolicyRpId="${rp_id}" \
      -s 'webAuthnPolicyRpEntityName=DIVE V3' \
      -s 'webAuthnPolicySignatureAlgorithms=["ES256","RS256"]' \
      -s webAuthnPolicyUserVerificationRequirement=required \
      -s webAuthnPolicyAttestationConveyancePreference=none \
      -s webAuthnPolicyAuthenticatorAttachment=cross-platform \
      -s webAuthnPolicyRequireResidentKey=No \
      -s webAuthnPolicyCreateTimeout=300 \
      -s webAuthnPolicyAvoidSameAuthenticatorRegister=false \
      >/dev/null 2>&1 || log_warn "WebAuthn policy apply failed"

    local rp
    rp=$(docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh get realms/dive-v3-broker --fields webAuthnPolicyRpId --format csv 2>/dev/null | tail -1 || true)
    if [ "$rp" = "$rp_id" ]; then
        log_success "WebAuthn policy set (rpId=${rp})"
    else
        log_warn "WebAuthn policy verify mismatch (got='${rp}', expected='${rp_id}')"
    fi
}

# Ensure there is at least one IdP configured; hard-fail if empty
ensure_idps_present() {
    log_step "Verifying IdPs exist in broker realm..."
    local count
    count=$(docker exec dive-v3-backend curl -sk --user "${KEYCLOAK_ADMIN_USERNAME:-admin}:${KEYCLOAK_ADMIN_PASSWORD}" \
        -H "Content-Type: application/json" \
        -X GET "https://keycloak:8443/admin/realms/dive-v3-broker/identity-provider/instances" | jq 'length' 2>/dev/null || echo "0")

    if [ "$count" = "0" ] || [ -z "$count" ]; then
        log_warn "No IdPs found in realm dive-v3-broker (count=$count) - bootstrapping default IdP..."
        bootstrap_default_idp || return 1
        count=$(docker exec dive-v3-backend curl -sk --user "${KEYCLOAK_ADMIN_USERNAME:-admin}:${KEYCLOAK_ADMIN_PASSWORD}" \
            -H "Content-Type: application/json" \
            -X GET "https://keycloak:8443/admin/realms/dive-v3-broker/identity-provider/instances" | jq 'length' 2>/dev/null || echo "0")
        if [ "$count" = "0" ] || [ -z "$count" ]; then
            log_error "No IdPs found after bootstrap attempt"
            return 1
        fi
    fi

    log_success "IdPs present (count=$count)"
    return 0
}

# Bootstrap a basic Keycloak OIDC IdP (self) for local flow
bootstrap_default_idp() {
    local admin_user="${KEYCLOAK_ADMIN_USERNAME:-admin}"
    local admin_pass="${KEYCLOAK_ADMIN_PASSWORD}"
    local client_id="${KEYCLOAK_CLIENT_ID:-dive-v3-client-broker}"
    local client_secret="${KEYCLOAK_CLIENT_SECRET}"
    local issuer="https://localhost:8443/realms/dive-v3-broker"
    local redirect="https://localhost:3000/api/auth/callback/keycloak"

    if [ -z "$admin_pass" ] || [ -z "$client_secret" ]; then
        log_error "Cannot bootstrap IdP: missing KEYCLOAK_ADMIN_PASSWORD or KEYCLOAK_CLIENT_SECRET"
        return 1
    fi

    # Create an OIDC identity provider pointing to the same realm (local loopback)
    docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user "$admin_user" --password "$admin_pass" >/dev/null 2>&1

    # Ensure client exists (create/update)
    docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh create clients -r dive-v3-broker \
        -s clientId="$client_id" \
        -s name="DIVE V3 Frontend" \
        -s enabled=true \
        -s clientAuthenticatorType=client-secret \
        -s secret="$client_secret" \
        -s standardFlowEnabled=true \
        -s directAccessGrantsEnabled=false \
        -s publicClient=false \
        -s protocol=openid-connect \
        -s 'redirectUris=["https://localhost:3000/*"]' \
        -s 'webOrigins=["https://localhost:3000"]' >/dev/null 2>&1 || true

    docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh create identity-provider/instances \
        -r dive-v3-broker \
        -s alias="kc-local" \
        -s providerId="keycloak-oidc" \
        -s enabled=true \
        -s trustEmail=true \
        -s storeToken=true \
        -s addReadTokenRoleOnCreate=true \
        -s firstBrokerLoginFlowAlias="first broker login" \
        -s 'config.useJwksUrl="true"' \
        -s "config.issuer=${issuer}" \
        -s "config.clientId=${client_id}" \
        -s "config.clientSecret=${client_secret}" \
        -s "config.defaultScope=openid profile email" >/dev/null 2>&1 || true

    # Ensure redirect URI is allowed on the client
    docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh update clients -r dive-v3-broker \
        -s "redirectUris+=[\"${redirect}\",\"${redirect}*\"]" \
        -s "webOrigins+=[\"https://localhost:3000\"]" \
        -q "clientId=${client_id}" >/dev/null 2>&1 || true

    log_info "Bootstrapped default IdP alias kc-local"
}

cmd_down() {
    log_step "Stopping containers..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose -f docker-compose.yml down"
        log_dry "docker compose -f docker-compose.pilot.yml down"
    else
        docker compose -f docker-compose.yml down 2>/dev/null || true
        docker compose -f docker-compose.pilot.yml down 2>/dev/null || true
    fi
    
    log_success "Stack stopped"
}

cmd_restart() {
    local service="${1:-}"
    
    if [ -n "$service" ]; then
        log_step "Restarting $service..."
        run docker compose restart "$service"
    else
        cmd_down
        sleep 2
        cmd_up
    fi
}

cmd_logs() {
    local service="${1:-}"
    local lines="${2:-100}"
    
    if [ -n "$service" ]; then
        docker compose logs -f --tail="$lines" "$service"
    else
        docker compose logs -f --tail="$lines"
    fi
}

cmd_ps() {
    echo -e "${CYAN}Running DIVE Containers:${NC}"
    docker ps --filter "name=dive" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "No containers running"
}

cmd_exec() {
    local container="$1"
    shift
    local cmd="${*:-bash}"
    
    if [ -z "$container" ]; then
        echo "Usage: ./dive exec <container> [command]"
        echo "Containers: frontend, backend, keycloak, postgres, mongo, redis, opa, opal-server"
        return 1
    fi
    
    # Map short names to container names
    case "$container" in
        fe|frontend) container="dive-pilot-frontend" ;;
        be|backend)  container="dive-pilot-backend" ;;
        kc|keycloak) container="dive-pilot-keycloak" ;;
        pg|postgres) container="dive-pilot-postgres" ;;
        mongo|mongodb) container="dive-pilot-mongo" ;;
        redis)       container="dive-pilot-redis" ;;
        opa)         container="dive-pilot-opa" ;;
        opal|opal-server) container="dive-pilot-opal-server" ;;
    esac
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker exec -it $container $cmd"
    else
        docker exec -it "$container" $cmd
    fi
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_core() {
    local action="${1:-help}"
    shift || true
    
    case "$action" in
        up)      cmd_up "$@" ;;
        down)    cmd_down "$@" ;;
        restart) cmd_restart "$@" ;;
        logs)    cmd_logs "$@" ;;
        ps)      cmd_ps "$@" ;;
        exec)    cmd_exec "$@" ;;
        *)       module_core_help ;;
    esac
}

module_core_help() {
    echo -e "${BOLD}Core Commands:${NC}"
    echo "  up                  Start the stack"
    echo "  down                Stop the stack"
    echo "  restart [service]   Restart stack or specific service"
    echo "  logs [service]      View logs (follow mode)"
    echo "  ps                  List running containers"
    echo "  exec <svc> [cmd]    Execute command in container"
}



