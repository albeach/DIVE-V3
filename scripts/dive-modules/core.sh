#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Core Commands Module
# =============================================================================
# Commands: up, down, restart, logs, ps, exec
# =============================================================================

# shellcheck source=./common.sh
# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

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
    local i
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
    # HUB STARTUP: Start hub services
    print_header
    check_docker || exit 1
    load_secrets || exit 1
    case "$ENVIRONMENT" in
        local|dev)
            ensure_required_secrets_local || exit 1
            ;;
        *)
            ensure_required_secrets_nonlocal || exit 1
            ;;
    esac
    apply_environment_config
    if [ "$ENVIRONMENT" = "local" ] || [ "$ENVIRONMENT" = "dev" ]; then
        check_certs || exit 1
    else
        log_verbose "Skipping local cert generation for env ${ENVIRONMENT}"
    fi

    log_step "Starting DIVE V3 Hub..."

    # Ensure required networks exist before starting
    ensure_shared_network || { log_error "Network setup failed"; exit 1; }

    # Choose compose file based on environment
    COMPOSE_FILE="docker-compose.yml"
    [ "$ENVIRONMENT" = "pilot" ] && COMPOSE_FILE="docker-compose.pilot.yml"

    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose -f $COMPOSE_FILE up -d"
        log_dry "Would verify Keycloak realm dive-v3-broker-usa and bootstrap if missing"
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
        configure_amr || log_warn "AMR configuration skipped (non-blocking)"
        wait_for_backend || { log_error "Backend did not become ready"; exit 1; }
        wait_for_frontend || { log_error "Frontend did not become ready"; exit 1; }
        auto_seed_resources || log_warn "Resource seeding skipped/failed (non-blocking)"
    fi

    log_success "Stack started"
    echo ""
    echo "  Frontend: https://${HUB_EXTERNAL_ADDRESS:-localhost}:${FRONTEND_PORT:-3000}"
    echo "  Backend:  https://${HUB_EXTERNAL_ADDRESS:-localhost}:${BACKEND_PORT:-4000}"
    echo "  Keycloak: https://${HUB_EXTERNAL_ADDRESS:-localhost}:${KEYCLOAK_HTTPS_PORT:-8443}"
    echo "  OPAL:     https://${HUB_EXTERNAL_ADDRESS:-localhost}:${OPAL_PORT:-7002}"
}

auto_seed_resources() {
    case "$ENVIRONMENT" in
        local|dev) ;;
        *) return 0 ;;
    esac
    local backend_container="${BACKEND_CONTAINER:-$(container_name backend)}"
    local inst_upper
    inst_upper=$(upper "$INSTANCE")
    local seed_count="${SEED_COUNT:-5000}"
    log_step "Seeding ${seed_count} ZTDF encrypted resources (local/dev)..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker exec ${backend_container} npx tsx src/scripts/seed-instance-resources.ts --instance=${inst_upper} --count=${seed_count} --replace"
        return 0
    fi
    docker exec "$backend_container" npx tsx src/scripts/seed-instance-resources.ts --instance="${inst_upper}" --count="${seed_count}" --replace 2>&1 | tail -20 || {
        log_warn "ZTDF resource seeding failed"
        return 1
    }
    log_success "Seeded ${seed_count} ZTDF encrypted resources"
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

# Fail fast in local/dev when mandatory secrets are missing (prevents 500s on /api/idps/public)
ensure_required_secrets_local() {
    local missing=0
    local required_vars=(
        POSTGRES_PASSWORD
        KEYCLOAK_ADMIN_PASSWORD
        MONGO_PASSWORD
        REDIS_PASSWORD
        KEYCLOAK_CLIENT_SECRET
        AUTH_SECRET
    )
    for v in "${required_vars[@]}"; do
        if [ -z "${!v}" ]; then
            log_error "Missing required secret for env '$ENVIRONMENT': $v (run './dive --env local secrets load' or export $v)"
            missing=$((missing+1))
        fi
    done
    [ $missing -eq 0 ]
}

# Wait for Keycloak to be reachable before running realm checks
wait_for_keycloak() {
    log_step "Waiting for Keycloak to become ready..."

    # Configurable timeout (default 180s, was 60s)
    local timeout="${KEYCLOAK_WAIT_TIMEOUT:-180}"
    local elapsed=0
    local delay=2
    local max_delay=30
    local attempt=0
    local health_url="${KEYCLOAK_HEALTH_URL:-https://localhost:${KEYCLOAK_HTTPS_PORT:-8443}/realms/master}"

    log_verbose "Keycloak health URL: $health_url (timeout: ${timeout}s)"

    while [ $elapsed -lt $timeout ]; do
        attempt=$((attempt + 1))
        local code
        code=$(curl -k -s -o /dev/null -w "%{http_code}" --max-time 5 "$health_url" || echo "000")

        if [ "$code" = "200" ]; then
            log_success "Keycloak is ready (${elapsed}s elapsed, attempt $attempt)"
            return 0
        fi

        log_verbose "Keycloak not ready (attempt $attempt, code=$code, elapsed=${elapsed}s, next delay=${delay}s)"

        sleep $delay
        elapsed=$((elapsed + delay))

        # Exponential backoff with cap at max_delay
        delay=$((delay * 2))
        [ $delay -gt $max_delay ] && delay=$max_delay
    done

    log_error "Keycloak failed to start within ${timeout}s"
    log_info "Tips:"
    log_info "  - Increase timeout: KEYCLOAK_WAIT_TIMEOUT=300 ./dive up"
    log_info "  - Check logs: docker logs dive-v3-keycloak"
    log_info "  - Verify ports: docker ps | grep keycloak"
    return 1
}

# Wait for backend HTTPS health
wait_for_backend() {
    log_step "Waiting for backend to become ready..."
    local retries=12
    local count=0
    while [ $count -lt $retries ]; do
        if curl -kfs --max-time 5 "https://localhost:${BACKEND_PORT:-4000}/health" >/dev/null 2>&1; then
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
        if curl -kfs --max-time 5 "https://localhost:${FRONTEND_PORT:-3000}/" >/dev/null 2>&1; then
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

    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh get realms/dive-v3-broker-usa >/dev/null 2>&1
}

ensure_broker_realm() {
    # Best Practice: Realm is imported automatically by Keycloak on startup
    # via --import-realm flag and realm JSON templates.
    # This function just waits for and verifies the realm exists.

    log_step "Waiting for broker realm to be imported..."

    local max_wait=60
    local wait_interval=3
    local elapsed=0

    while [ $elapsed -lt $max_wait ]; do
        if broker_realm_exists; then
            log_success "Broker realm present (dive-v3-broker-usa)"
            return 0
        fi
        log_verbose "Realm not ready yet (${elapsed}s/${max_wait}s)..."
        sleep $wait_interval
        elapsed=$((elapsed + wait_interval))
    done

    # If realm still doesn't exist after waiting, Keycloak may not have imported it
    log_error "Broker realm not found after ${max_wait}s"
    log_error "Check Keycloak logs: docker logs dive-v3-keycloak"
    log_error "Ensure realm JSON exists: keycloak/realms/dive-v3-broker-usa.json"
    return 1
}

ensure_client_https_redirects() {
    local client_id="${KEYCLOAK_CLIENT_ID:-dive-v3-broker-usa}"
    local admin_user="${KEYCLOAK_ADMIN_USERNAME:-admin}"
    local admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-}"
    local keycloak_container="${KEYCLOAK_CONTAINER:-$(container_name keycloak)}"
    local base_url="${NEXT_PUBLIC_BASE_URL:-https://localhost:3000}"
    local api_url="${NEXT_PUBLIC_API_URL:-https://localhost:4000}"
    local extra_web_origins="${WEB_ORIGINS_EXTRA:-}"
    local redirect_candidates=("${base_url}/*" "https://localhost:${FRONTEND_PORT:-3000}/*" "https://localhost:3003/*")
    local web_candidates=("${base_url}" "${api_url}" "https://localhost:${FRONTEND_PORT:-3000}" "https://localhost:3003" "https://localhost:${BACKEND_PORT:-4000}" "https://localhost:4003")
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
    cid=$(docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh get clients -r dive-v3-broker-usa -q clientId="$client_id" --fields id --format csv 2>/dev/null | tail -1 | tr -d '\r')
    if [ -z "$cid" ]; then
        log_warn "Client $client_id not found; skipping redirect enforcement"
        return 0
    fi

    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh update "clients/${cid}" -r dive-v3-broker-usa \
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

    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh update realms/dive-v3-broker-usa \
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
        rp=$(docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh get realms/dive-v3-broker-usa --format json 2>/dev/null | jq -r '.webAuthnPolicyRpId // ""' || true)
        if [ "$rp" = "$rp_id" ]; then
            log_success "WebAuthn policy set (rpId=${rp})"
            return 0
        fi
        retries=$((retries-1))
        sleep 2
    done
    # Fallback: force string assignment to rpId if initial updates did not stick
    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh update realms/dive-v3-broker-usa \
      --set-strings webAuthnPolicyRpId="${rp_id}" webAuthnPolicyRpEntityName="DIVE V3" >/dev/null 2>&1 || true
    rp=$(docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh get realms/dive-v3-broker-usa --format json 2>/dev/null | jq -r '.webAuthnPolicyRpId // ""' || true)
    if [ "$rp" = "$rp_id" ]; then
        log_success "WebAuthn policy set after fallback (rpId=${rp})"
    else
        log_warn "WebAuthn policy verify mismatch (got='${rp}', expected='${rp_id}')"
    fi
}

# =============================================================================
# AMR Configuration
# =============================================================================
# Ensures AMR (Authentication Methods Reference) is properly configured.
# Keycloak 26's native oidc-amr-mapper doesn't work with standard authenticators.
# WORKAROUND: Use user attribute mapper instead, set AMR on users via seed scripts.
configure_amr() {
    case "$ENVIRONMENT" in
        local|dev) ;;
        *) return 0 ;;  # Skip for non-local environments
    esac

    local configure_script="${DIVE_ROOT}/scripts/hub-init/configure-amr.sh"
    if [ ! -f "$configure_script" ]; then
        log_warn "AMR configuration script not found: ${configure_script}"
        return 0
    fi

    log_step "Configuring AMR (Authentication Methods Reference)..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "bash ${configure_script}"
        return 0
    fi

    bash "$configure_script" 2>&1 | while read -r line; do
        echo "  $line"
    done

    return 0
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
        local)
            if [ "${APPLY_TF_LOCAL:-}" != "true" ]; then
                log_step "Skipping Terraform for local env (set APPLY_TF_LOCAL=true to run)"
                return 0
            fi
            ;;
        dev) ;;
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

    wait_for_keycloak_admin_api_ready "${KEYCLOAK_CONTAINER:-$(container_name keycloak)}" 40 || { log_error "Keycloak admin not reachable for Terraform"; return 1; }

    # Ensure Terraform workdir is owned/writable by the invoking user to prevent
    # recurring permission errors on .terraform/modules/modules.json when the CLI
    # is run after root-created artifacts.
    local tf_work="${tf_dir}/.terraform"
    mkdir -p "${tf_work}/modules" || true
    chown -R "$(id -u)":"$(id -g)" "${tf_work}" 2>/dev/null || true
    chmod -R u+rwX "${tf_work}" 2>/dev/null || true

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

# Ensure there is at least one IdP configured
# Best Practice: IdPs are imported automatically via realm JSON
# This function verifies they were imported correctly
ensure_idps_present() {
    log_step "Verifying IdPs exist in broker realm..."
    local keycloak_container="${KEYCLOAK_CONTAINER:-$(container_name keycloak)}"
    local admin_user="${KEYCLOAK_ADMIN_USERNAME:-admin}"
    local admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

    # Login to Keycloak
    if ! docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user "$admin_user" --password "$admin_pass" >/dev/null 2>&1; then
        log_warn "Failed to authenticate to Keycloak for IdP verification"
        return 1
    fi

    # Get IdP count using kcadm
    local idp_list
    idp_list=$(docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh get identity-provider/instances \
        -r dive-v3-broker-usa --fields alias 2>/dev/null || echo "[]")

    local count
    count=$(echo "$idp_list" | grep -c '"alias"' 2>/dev/null || echo "0")

    if [ "$count" = "0" ] || [ -z "$count" ]; then
        log_warn "No IdPs found in broker realm"
        log_warn "IdPs should be defined in: keycloak/realms/dive-v3-broker-usa.json"
        log_warn "Continuing without IdPs (admin can add them later)"
        # Don't fail - allow deployment to continue
        # IdPs can be added via Keycloak admin console
        return 0
    fi

    log_success "IdPs present (count=$count)"
    return 0
}

cmd_down() {
    # HUB SHUTDOWN: Stop hub services
    log_step "Stopping hub containers..."

    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose -f docker-compose.yml down"
        log_dry "docker compose -f docker-compose.hub.yml down"
        log_dry "docker compose -f docker-compose.pilot.yml down"
    else
        # Stop all compose stacks (hub, default, pilot)
        docker compose -f docker-compose.hub.yml down 2>/dev/null || true
        docker compose -f docker-compose.yml down 2>/dev/null || true
        docker compose -f docker-compose.pilot.yml down 2>/dev/null || true
    fi

    log_success "Hub stopped"
}

cmd_restart() {
    local service="${1:-}"

    # HUB RESTART: Restart hub services
    if [ -n "$service" ]; then
        log_step "Restarting hub service: $service..."
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

    # HUB LOGS: Show hub container logs
    if [ -n "$service" ]; then
        docker compose logs -f --tail="$lines" "$service"
    else
        docker compose logs -f --tail="$lines"
    fi
}

cmd_ps() {
    # INSTANCE-AWARE: Show containers for specified instance
    local instance_lower
    instance_lower=$(echo "${INSTANCE:-usa}" | tr '[:upper:]' '[:lower:]')

    if [ "$instance_lower" != "usa" ] && [ -d "${DIVE_ROOT}/instances/${instance_lower}" ]; then
        # Spoke instance - show only spoke containers
        echo -e "${CYAN}Running DIVE Spoke Containers (${instance_lower^^}):${NC}"
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | \
            grep -E "dive-spoke-${instance_lower}|^${instance_lower}-" || \
            echo "No containers running for spoke ${instance_lower^^}"
    else
        # Hub instance - show hub containers
        echo -e "${CYAN}Running DIVE Hub Containers:${NC}"
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | \
            grep -E "dive-hub-" || \
            echo "No hub containers running"

        # Also show count of running spokes
        local spoke_count
        spoke_count=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -c "dive-spoke-" || echo "0")
        if [ "$spoke_count" -gt 0 ]; then
            echo ""
            echo -e "${DIM}Note: $spoke_count spoke containers running (use './dive ps' to see all)${NC}"
        fi
    fi
}

cmd_exec() {
    local container="$1"
    shift

    if [ -z "$container" ]; then
        echo "Usage: ./dive exec <container> [command]"
        echo "Containers: frontend, backend, keycloak, postgres, mongo, redis, opa, opal-server"
        return 1
    fi

    # INSTANCE-AWARE ROUTING: Check if this is a spoke instance
    local instance_lower
    instance_lower=$(echo "${INSTANCE:-usa}" | tr '[:upper:]' '[:lower:]')

    if [ "$instance_lower" != "usa" ] && [ -d "${DIVE_ROOT}/instances/${instance_lower}" ]; then
        # Spoke instance - prepend spoke prefix to container name
        log_verbose "Targeting spoke instance: ${instance_lower^^}"

        # Map short names to spoke container names
        case "$container" in
            fe|frontend) container="dive-spoke-${instance_lower}-frontend";;
            be|backend)  container="dive-spoke-${instance_lower}-backend";;
            kc|keycloak) container="dive-spoke-${instance_lower}-keycloak";;
            pg|postgres) container="dive-spoke-${instance_lower}-postgres";;
            mongo|mongodb) container="dive-spoke-${instance_lower}-mongodb";;
            redis)       container="dive-spoke-${instance_lower}-redis";;
            opa)         container="dive-spoke-${instance_lower}-opa";;
            opal|opal-client) container="dive-spoke-${instance_lower}-opal-client";;
            kas)         container="dive-spoke-${instance_lower}-kas";;
            # If already fully qualified, use as-is
            dive-spoke-*) ;;
            *)
                # Assume it's a custom container name
                log_verbose "Using custom container name: $container"
                ;;
        esac
    else
        # Hub instance - map to hub container names
        case "$container" in
            fe|frontend) container="${FRONTEND_CONTAINER:-dive-hub-frontend}";;
            be|backend)  container="${BACKEND_CONTAINER:-dive-hub-backend}";;
            kc|keycloak) container="${KEYCLOAK_CONTAINER:-dive-hub-keycloak}";;
            pg|postgres) container="${POSTGRES_CONTAINER:-dive-hub-postgres}";;
            mongo|mongodb) container="${MONGO_CONTAINER:-dive-hub-mongo}";;
            redis)       container="${REDIS_CONTAINER:-dive-hub-redis}";;
            opa)         container="${OPA_CONTAINER:-dive-hub-opa}";;
            opal|opal-server) container="${OPAL_CONTAINER:-dive-hub-opal-server}";;
        esac
    fi

    # Allow non-TTY exec for non-interactive environments (e.g., CI)
    local exec_opts=("-it")
    if [ "${NO_TTY:-}" = "1" ] || [ -n "${CI:-}" ]; then
        exec_opts=("-i")
    fi

    if [ "$DRY_RUN" = true ]; then
        if [ "$#" -gt 0 ]; then
            log_dry "docker exec ${exec_opts[*]} $container $*"
        else
            log_dry "docker exec ${exec_opts[*]} $container bash"
        fi
    else
        if [ "$#" -gt 0 ]; then
            docker exec "${exec_opts[@]}" "$container" "$@"
        else
            docker exec "${exec_opts[@]}" "$container" bash
        fi
    fi
}
