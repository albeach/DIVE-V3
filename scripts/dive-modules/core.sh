#!/bin/bash
# =============================================================================
# DIVE V3 CLI - Core Commands Module
# =============================================================================
# Commands: up, down, restart, logs, ps, exec
# =============================================================================

# shellcheck source=common.sh disable=SC1091
# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

wait_for_keycloak_admin() {
    local retries=8
    local delay=5
    local code
    local url="${KEYCLOAK_URL_PUBLIC:-${KEYCLOAK_URL:-https://localhost:8443}}/realms/master/protocol/openid-connect/token"

    while [ $retries -gt 0 ]; do
        code=$(curl -k -s -o /dev/null -w "%{http_code}" --max-time 5 \
            -d "grant_type=password" \
            -d "client_id=admin-cli" \
            -d "username=${KEYCLOAK_ADMIN_USERNAME:-admin}" \
            -d "password=${KEYCLOAK_ADMIN_PASSWORD:-}" "$url" || echo "000")
        if [ "$code" = "200" ]; then
            return 0
        fi
        retries=$((retries-1))
        sleep "$delay"
    done
    return 1
}

# Build a JSON array from the provided arguments, ensuring uniqueness and preserving order.
json_array_unique() {
    local -a input_arr=("$@")
    local -a uniq=()
    for item in "${input_arr[@]}"; do
        [ -z "$item" ] && continue
        local found=false
        for existing in "${uniq[@]}"; do
            if [ "$existing" = "$item" ]; then
                found=true
                break
            fi
        done
        [ "$found" = true ] && continue
        uniq+=("$item")
    done
    local json="["
    for i in "${!uniq[@]}"; do
        local v="${uniq[$i]}"
        v=${v//\"/\\\"}
        json+="\"${v}\""
        [ "$i" -lt $((${#uniq[@]}-1)) ] && json+=","
    done
    json+="]"
    echo "$json"
}

# =============================================================================
# CORE COMMANDS
# =============================================================================

cmd_up() {
    print_header
    check_docker || exit 1
    load_secrets || exit 1
    ensure_required_secrets_nonlocal || exit 1
    apply_env_profile
    if [ "$ENVIRONMENT" = "local" ] || [ "$ENVIRONMENT" = "dev" ]; then
        check_certs || exit 1
    else
        log_verbose "Skipping mkcert generation for env ${ENVIRONMENT}"
    fi
    
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
        ensure_terraform || { log_error "Terraform not available"; exit 1; }
        apply_terraform_local || { log_error "Terraform apply failed"; exit 1; }
        ensure_broker_realm || { log_error "Broker realm bootstrap failed"; exit 1; }
        ensure_client_https_redirects || { log_error "Failed to enforce HTTPS redirect URIs"; exit 1; }
        ensure_idps_present || { log_error "No IdPs found; aborting startup"; exit 1; }
        ensure_webauthn_policy
        wait_for_backend || { log_error "Backend did not become ready"; exit 1; }
        wait_for_frontend || { log_error "Frontend did not become ready"; exit 1; }
        auto_seed_resources || log_warn "Resource seeding skipped/failed (non-blocking)"
    fi
    
    log_success "Stack started"
    echo ""
    echo "  Frontend: https://localhost:3000"
    echo "  Backend:  https://localhost:4000"
    echo "  Keycloak: https://localhost:8443"
    echo "  OPAL:     https://localhost:7002"
}

auto_seed_resources() {
    case "$ENVIRONMENT" in
        local|dev) ;;
        *) return 0 ;;
    esac
    local backend_container="${BACKEND_CONTAINER:-$(container_name backend)}"
    local inst_upper
    inst_upper=$(upper "$INSTANCE")
    local seed_count="${SEED_COUNT:-500}"
    log_step "Seeding MongoDB resources (local/dev)..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker exec ${backend_container} npx tsx src/scripts/seed-instance-resources.ts --instance=${inst_upper} --count=${seed_count}"
        return 0
    fi
    docker exec "$backend_container" npx tsx src/scripts/seed-instance-resources.ts --instance="${inst_upper}" --count="${seed_count}" >/dev/null 2>&1 || {
        log_warn "Resource seeding failed"
        return 1
    }
    log_success "Resources seeded"
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
    local keycloak_container="${KEYCLOAK_CONTAINER:-$(container_name keycloak)}"
    local admin_user="${KEYCLOAK_ADMIN_USERNAME:-admin}"
    local admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-}"

    if [ -z "$admin_pass" ]; then
        log_warn "Cannot verify realm (missing KEYCLOAK_ADMIN_PASSWORD); assuming missing"
        return 1
    fi

    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user "$admin_user" --password "$admin_pass" >/dev/null 2>&1 || return 1

    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh get realms/dive-v3-broker >/dev/null 2>&1
}

# Bootstrap broker realm via kcadm inside the Keycloak container if missing
bootstrap_broker_realm() {
    local realm="dive-v3-broker"
    local keycloak_container="dive-v3-keycloak"
    local admin_user="${KEYCLOAK_ADMIN_USERNAME:-admin}"
    local admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-}"
    local public_url="${NEXT_PUBLIC_KEYCLOAK_URL:-https://localhost:8443}"
    local frontend_url="${NEXT_PUBLIC_BASE_URL:-https://localhost:3000}"
    local api_url="${NEXT_PUBLIC_API_URL:-https://localhost:4000}"
    local client_id="${KEYCLOAK_CLIENT_ID:-dive-v3-client-broker}"
    local client_secret="${KEYCLOAK_CLIENT_SECRET:-}"
    local extra_web_origins="${WEB_ORIGINS_EXTRA:-}"

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

    # Build redirect URIs and web origins (support multiple local ports)
    local redirect_candidates=("${frontend_url}/*" "https://localhost:3000/*" "https://localhost:3003/*")
    local web_candidates=("${frontend_url}" "${api_url}" "https://localhost:3000" "https://localhost:3003" "https://localhost:4000" "https://localhost:4003")
    if [ -n "$extra_web_origins" ]; then
        IFS=',' read -r -a _extra_origins <<< "$extra_web_origins"
        for o in "${_extra_origins[@]}"; do
            o="$(echo "$o" | xargs)"
            [ -n "$o" ] && web_candidates+=("$o")
        done
    fi

    local redirects_json
    redirects_json=$(json_array_unique "${redirect_candidates[@]}")
    local web_origins_json
    web_origins_json=$(json_array_unique "${web_candidates[@]}")

    # Ensure client exists/updated
    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh create clients -r "$realm" \
        -s clientId="$client_id" \
        -s protocol=openid-connect \
        -s publicClient=false \
        -s standardFlowEnabled=true \
        -s directAccessGrantsEnabled=false \
        -s "redirectUris=${redirects_json}" \
        -s "webOrigins=${web_origins_json}" \
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

ensure_client_https_redirects() {
    local client_id="${KEYCLOAK_CLIENT_ID:-dive-v3-client-broker}"
    local admin_user="${KEYCLOAK_ADMIN_USERNAME:-admin}"
    local admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-}"
    local keycloak_container="${KEYCLOAK_CONTAINER:-$(container_name keycloak)}"
    local base_url="${NEXT_PUBLIC_BASE_URL:-https://localhost:3000}"
    local api_url="${NEXT_PUBLIC_API_URL:-https://localhost:4000}"
    local extra_web_origins="${WEB_ORIGINS_EXTRA:-}"
    local redirect_candidates=("${base_url}/*" "https://localhost:3000/*" "https://localhost:3003/*")
    local web_candidates=("${base_url}" "${api_url}" "https://localhost:3000" "https://localhost:3003" "https://localhost:4000" "https://localhost:4003")
    if [ -n "$extra_web_origins" ]; then
        IFS=',' read -r -a _extra_origins <<< "$extra_web_origins"
        for o in "${_extra_origins[@]}"; do
            o="$(echo "$o" | xargs)"
            [ -n "$o" ] && web_candidates+=("$o")
        done
    fi

    local redirects
    redirects=$(json_array_unique "${redirect_candidates[@]}")
    local web_origins
    web_origins=$(json_array_unique "${web_candidates[@]}")

    if [ -z "$admin_pass" ]; then
        log_warn "Cannot enforce HTTPS redirects (missing KEYCLOAK_ADMIN_PASSWORD)"
        return 0
    fi

    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user "$admin_user" --password "$admin_pass" >/dev/null 2>&1 || {
        log_warn "kcadm auth failed; skipping redirect enforcement"
        return 0
    }

    local cid
    cid=$(docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh get clients -r dive-v3-broker -q clientId="$client_id" --fields id --format csv 2>/dev/null | tail -1 | tr -d '\r')
    if [ -z "$cid" ]; then
        log_warn "Client $client_id not found; skipping redirect enforcement"
        return 0
    fi

    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh update "clients/${cid}" -r dive-v3-broker \
        -s "redirectUris=${redirects}" \
        -s "webOrigins=${web_origins}" \
        -s "baseUrl=${base_url}" \
        -s "adminUrl=${base_url}" >/dev/null 2>&1 || {
        log_warn "Failed to update client redirect URIs"
        return 0
    }

    log_success "Enforced HTTPS-only redirect URIs for ${client_id}"
}

ensure_webauthn_policy() {
    # WebAuthn RP ID alignment for local and CF/cloud. Derive rpId from:
    # 1) KEYCLOAK_RP_ID env (explicit override)
    # 2) NEXT_PUBLIC_KEYCLOAK_URL host (if present)
    # 3) fallback to localhost
    local keycloak_container="${KEYCLOAK_CONTAINER:-$(container_name keycloak)}"
    local admin_user="${KEYCLOAK_ADMIN_USERNAME:-admin}"
    local admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-}"
    local max_retries=6
    local delay=5
    local rp_id="${KEYCLOAK_RP_ID:-}"

    if [ -z "$rp_id" ] && [ -n "${NEXT_PUBLIC_KEYCLOAK_URL:-}" ]; then
        # Strip scheme/port/path to leave host only for RP ID
        rp_id=$(echo "$NEXT_PUBLIC_KEYCLOAK_URL" | sed 's#^[a-zA-Z]*://##' | cut -d/ -f1 | cut -d: -f1)
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

    local rp retries
    retries=2
    while [ "$retries" -gt 0 ]; do
        rp=$(docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh get realms/dive-v3-broker --format json 2>/dev/null | jq -r '.webAuthnPolicyRpId // ""' || true)
        if [ "$rp" = "$rp_id" ]; then
            log_success "WebAuthn policy set (rpId=${rp})"
            return 0
        fi
        retries=$((retries-1))
        sleep 2
    done
    # Fallback: force string assignment to rpId if initial updates did not stick
    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh update realms/dive-v3-broker \
      --set-strings webAuthnPolicyRpId="${rp_id}" webAuthnPolicyRpEntityName="DIVE V3" >/dev/null 2>&1 || true
    rp=$(docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh get realms/dive-v3-broker --format json 2>/dev/null | jq -r '.webAuthnPolicyRpId // ""' || true)
    if [ "$rp" = "$rp_id" ]; then
        log_success "WebAuthn policy set after fallback (rpId=${rp})"
    else
        log_warn "WebAuthn policy verify mismatch (got='${rp}', expected='${rp_id}')"
    fi
}

ensure_terraform() {
    if ! command -v terraform >/dev/null 2>&1; then
        log_error "Terraform not installed (required for local bootstrap)"
        return 1
    fi
    return 0
}

apply_terraform_local() {
    case "$ENVIRONMENT" in
        local|dev) ;;
        *) return 0 ;;
    esac

    local tf_dir="${DIVE_ROOT}/terraform/pilot"
    local tfvars="${TF_VARS_FILE:-}"
    # Resolve relative tfvars against tf_dir if provided
    if [ -n "$tfvars" ] && [ "${tfvars#"/"}" = "$tfvars" ]; then
        tfvars="${tf_dir}/${tfvars}"
    fi

    log_step "Applying Terraform (local IdPs/bootstrap)..."

    if [ "$DRY_RUN" = true ]; then
        log_dry "cd ${tf_dir} && terraform init && terraform apply -var-file=${tfvars} -auto-approve"
        return 0
    fi

    if [ ! -d "$tf_dir" ]; then
        log_error "Terraform directory not found: ${tf_dir}"
        return 1
    fi

    local var_flag=()
    if [ -f "$tfvars" ]; then
        var_flag=(-var-file "$tfvars")
    else
        log_warn "tfvars not found at ${tfvars}; applying without tfvars (env TF_VAR_* will be used)"
    fi

    local var_args=()
    [ -n "${KEYCLOAK_ADMIN_PASSWORD:-}" ] && var_args+=(-var "keycloak_admin_password=${KEYCLOAK_ADMIN_PASSWORD}")
    [ -n "${KEYCLOAK_CLIENT_SECRET:-}" ] && var_args+=(-var "client_secret=${KEYCLOAK_CLIENT_SECRET}")
    [ -n "${KEYCLOAK_URL_PUBLIC:-${KEYCLOAK_URL:-}}" ] && var_args+=(-var "keycloak_url=${KEYCLOAK_URL_PUBLIC:-$KEYCLOAK_URL}")
    [ -n "${TF_VAR_test_user_password:-}" ] && var_args+=(-var "test_user_password=${TF_VAR_test_user_password}")
    [ -n "${TF_VAR_admin_user_password:-}" ] && var_args+=(-var "admin_user_password=${TF_VAR_admin_user_password}")

    wait_for_keycloak_admin || { log_error "Keycloak admin not reachable for Terraform"; return 1; }

    local attempts=2
    while [ "$attempts" -gt 0 ]; do
        if ( cd "$tf_dir" && \
            terraform init >/dev/null && \
            terraform apply "${var_flag[@]}" "${var_args[@]}" -auto-approve ); then
            log_success "Terraform applied (local)"
            return 0
        fi
        attempts=$((attempts-1))
        log_warn "Terraform apply failed; retrying in 5s (remaining: ${attempts})"
        sleep 5
    done

    log_error "Terraform apply failed after retries"
    return 1
}

# Ensure there is at least one IdP configured; hard-fail if empty
ensure_idps_present() {
    log_step "Verifying IdPs exist in broker realm..."
    local backend_container="${BACKEND_CONTAINER:-$(container_name backend)}"
    local count
    count=$(docker exec "$backend_container" curl -sk --user "${KEYCLOAK_ADMIN_USERNAME:-admin}:${KEYCLOAK_ADMIN_PASSWORD}" \
        -H "Content-Type: application/json" \
        -X GET "https://keycloak:8443/admin/realms/dive-v3-broker/identity-provider/instances" | jq 'length' 2>/dev/null || echo "0")

    if [ "$count" = "0" ] || [ -z "$count" ]; then
        log_warn "No IdPs found in realm dive-v3-broker (count=$count) - bootstrapping default IdP..."
        bootstrap_default_idp || return 1
        count=$(docker exec "$backend_container" curl -sk --user "${KEYCLOAK_ADMIN_USERNAME:-admin}:${KEYCLOAK_ADMIN_PASSWORD}" \
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
    local keycloak_container="${KEYCLOAK_CONTAINER:-$(container_name keycloak)}"
    local issuer="https://localhost:8443/realms/dive-v3-broker"
    local redirect="https://localhost:3000/api/auth/callback/keycloak"

    if [ -z "$admin_pass" ] || [ -z "$client_secret" ]; then
        log_error "Cannot bootstrap IdP: missing KEYCLOAK_ADMIN_PASSWORD or KEYCLOAK_CLIENT_SECRET"
        return 1
    fi

    # Create an OIDC identity provider pointing to the same realm (local loopback)
    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user "$admin_user" --password "$admin_pass" >/dev/null 2>&1

    # Ensure client exists (create/update)
    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh create clients -r dive-v3-broker \
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

    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh create identity-provider/instances \
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
    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh update clients -r dive-v3-broker \
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
        if [ "$#" -gt 0 ]; then
            log_dry "docker exec -it $container $*"
        else
            log_dry "docker exec -it $container bash"
        fi
    else
        if [ "$#" -gt 0 ]; then
            docker exec -it "$container" "$@"
        else
            docker exec -it "$container" bash
        fi
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



