#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Secrets Management Module
# =============================================================================
# Commands: load, show, list, verify, export
# Manages GCP Secret Manager integration
# =============================================================================

# shellcheck source=common.sh disable=SC1091
# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# SECRETS COMMANDS
# =============================================================================

secrets_load() {
    local instance="${1:-$INSTANCE}"
    load_gcp_secrets "$instance"
    log_success "Secrets loaded into environment"
}

secrets_show() {
    local instance="${1:-$INSTANCE}"
    echo -e "${CYAN}Secrets for $(upper "$instance"):${NC}"
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query: gcloud secrets list --project=$GCP_PROJECT"
    else
        gcloud secrets list --project="$GCP_PROJECT" --filter="name:dive-v3" --format="table(name,createTime)" | grep -i "$instance" || echo "No instance-specific secrets found"
    fi
}

secrets_list() {
    echo -e "${CYAN}All DIVE V3 secrets in GCP:${NC}"
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query: gcloud secrets list --project=$GCP_PROJECT"
    else
        gcloud secrets list --project="$GCP_PROJECT" --filter="name:dive-v3" --format="table(name,createTime)"
    fi
}

secrets_verify() {
    local instance="${1:-$INSTANCE}"
    echo -e "${CYAN}Verifying secrets can be accessed...${NC}"
    load_gcp_secrets "$instance"
    echo ""
    echo -e "  POSTGRES_PASSWORD:        $([ -n "$POSTGRES_PASSWORD" ] && echo -e "${GREEN}✓ loaded${NC}" || echo -e "${RED}✗ missing${NC}")"
    echo -e "  KEYCLOAK_ADMIN_PASSWORD:  $([ -n "$KEYCLOAK_ADMIN_PASSWORD" ] && echo -e "${GREEN}✓ loaded${NC}" || echo -e "${RED}✗ missing${NC}")"
    echo -e "  MONGO_PASSWORD:           $([ -n "$MONGO_PASSWORD" ] && echo -e "${GREEN}✓ loaded${NC}" || echo -e "${RED}✗ missing${NC}")"
    echo -e "  AUTH_SECRET:              $([ -n "$AUTH_SECRET" ] && echo -e "${GREEN}✓ loaded${NC}" || echo -e "${RED}✗ missing${NC}")"
    echo -e "  KEYCLOAK_CLIENT_SECRET:   $([ -n "$KEYCLOAK_CLIENT_SECRET" ] && echo -e "${GREEN}✓ loaded${NC}" || echo -e "${RED}✗ missing${NC}")"
    echo -e "  JWT_SECRET:               $([ -n "$JWT_SECRET" ] && echo -e "${GREEN}✓ loaded${NC}" || echo -e "${RED}✗ missing${NC}")"
    echo -e "  NEXTAUTH_SECRET:          $([ -n "$NEXTAUTH_SECRET" ] && echo -e "${GREEN}✓ loaded${NC}" || echo -e "${RED}✗ missing${NC}")"
}

secrets_export() {
    local unsafe=false
    if [ "${1:-}" = "--unsafe" ]; then
        unsafe=true
        shift
    fi

    local instance="${1:-$INSTANCE}"
    # Export secrets as env vars to stdout (for piping)
    load_gcp_secrets "$instance" >/dev/null 2>&1

    redact() {
        local value="$1"
        if [ "$unsafe" = true ]; then
            echo "$value"
        else
            echo "<redacted>"
        fi
    }

    echo "export POSTGRES_PASSWORD='$(redact "$POSTGRES_PASSWORD")'"
    echo "export KEYCLOAK_ADMIN_PASSWORD='$(redact "$KEYCLOAK_ADMIN_PASSWORD")'"
    echo "export MONGO_PASSWORD='$(redact "$MONGO_PASSWORD")'"
    echo "export AUTH_SECRET='$(redact "$AUTH_SECRET")'"
    echo "export KEYCLOAK_CLIENT_SECRET='$(redact "$KEYCLOAK_CLIENT_SECRET")'"
    echo "export JWT_SECRET='$(redact "$JWT_SECRET")'"
    echo "export NEXTAUTH_SECRET='$(redact "$NEXTAUTH_SECRET")'"
    echo "export TF_VAR_keycloak_admin_password='$(redact "$KEYCLOAK_ADMIN_PASSWORD")'"
    echo "export TF_VAR_client_secret='$(redact "$KEYCLOAK_CLIENT_SECRET")'"

    if [ "$unsafe" != true ]; then
        log_warn "Secrets redacted. Re-run with --unsafe to print raw values."
    fi
}

secrets_lint() {
    local verbose=""
    local fix=""

    # Parse options
    while [[ $# -gt 0 ]]; do
        case $1 in
            --verbose|-v) verbose="--verbose" ;;
            --fix) fix="--fix" ;;
            --ci) verbose="--ci" ;;
            *) ;;
        esac
        shift
    done

    echo -e "${CYAN}Running secret lint scan...${NC}"

    local script_path
    script_path="$(dirname "${BASH_SOURCE[0]}")/../lint-secrets.sh"

    if [ ! -x "$script_path" ]; then
        log_error "Lint script not found: $script_path"
        return 1
    fi

    # Run lint script
    "$script_path" $verbose $fix
    return $?
}

secrets_verify_all() {
    echo -e "${CYAN}Verifying secrets for all instances...${NC}"
    echo ""

    local instances=("usa" "gbr" "fra" "deu" "dnk" "pol" "nor" "esp" "ita" "bel" "alb")
    local failed=0
    local passed=0

    for inst in "${instances[@]}"; do
        local inst_uc
        inst_uc=$(echo "$inst" | tr '[:lower:]' '[:upper:]')

        echo -e "${CYAN}Checking $inst_uc...${NC}"

        # Try to fetch required secrets
        local missing=0
        local secrets=("postgres-$inst" "mongodb-$inst" "keycloak-$inst")

        for secret in "${secrets[@]}"; do
            if ! gcloud secrets versions access latest --secret="dive-v3-$secret" --project="$GCP_PROJECT" >/dev/null 2>&1; then
                echo -e "  ${RED}✗${NC} dive-v3-$secret"
                ((missing++))
            else
                echo -e "  ${GREEN}✓${NC} dive-v3-$secret"
            fi
        done

        if [ $missing -eq 0 ]; then
            ((passed++))
        else
            ((failed++))
        fi
    done

    echo ""
    echo -e "${CYAN}Summary:${NC} ${GREEN}$passed passed${NC}, ${RED}$failed failed${NC}"

    [ $failed -eq 0 ]
}

# =============================================================================
# CONTAINER & ENV SYNC FUNCTIONS (from secret-sync.sh & env-sync.sh)
# =============================================================================

##
# Sync secrets from container environment to .env file
# Ensures .env file matches what containers are actually running with
#
# Arguments:
#   $1 - Instance code (e.g., DEU, BGR, USA)
#
# Returns:
#   0 - Success
#   1 - Failed
##
sync_container_secrets_to_env() {
    local instance_code="${1:?Instance code required}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    ensure_dive_root

    local env_file
    if [ "$code_upper" = "USA" ]; then
        env_file="${DIVE_ROOT}/.env.hub"
    else
        env_file="${DIVE_ROOT}/instances/${code_lower}/.env"
    fi

    if [ ! -f "$env_file" ]; then
        log_error ".env file not found: $env_file"
        return 1
    fi

    log_step "Syncing ${code_upper} secrets: Container → .env file"

    # Backup .env
    cp "$env_file" "${env_file}.bak.$(date +%Y%m%d-%H%M%S)"

    # Get container prefix
    local container_prefix
    if [ "$code_upper" = "USA" ]; then
        container_prefix="dive-hub"
    else
        container_prefix="dive-spoke-${code_lower}"
    fi

    # Sync Keycloak admin password
    local kc_container="${container_prefix}-keycloak"
    if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        local kc_password
        kc_password=$(docker exec "$kc_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null)

        if [ -n "$kc_password" ]; then
            local var_name="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
            update_env_var "$env_file" "$var_name" "$kc_password"
            log_success "Synced $var_name"
        fi
    fi

    # Sync PostgreSQL password
    local pg_container="${container_prefix}-postgres"
    if docker ps --format '{{.Names}}' | grep -q "^${pg_container}$"; then
        local pg_password
        pg_password=$(docker exec "$pg_container" printenv POSTGRES_PASSWORD 2>/dev/null)

        if [ -n "$pg_password" ]; then
            local var_name="POSTGRES_PASSWORD_${code_upper}"
            update_env_var "$env_file" "$var_name" "$pg_password"
            log_success "Synced $var_name"
        fi
    fi

    # Sync MongoDB password
    local mongo_container="${container_prefix}-mongodb"
    if docker ps --format '{{.Names}}' | grep -q "^${mongo_container}$"; then
        local mongo_password
        mongo_password=$(docker exec "$mongo_container" printenv MONGO_INITDB_ROOT_PASSWORD 2>/dev/null)

        if [ -n "$mongo_password" ]; then
            local var_name="MONGO_PASSWORD_${code_upper}"
            update_env_var "$env_file" "$var_name" "$mongo_password"
            log_success "Synced $var_name"
        fi
    fi

    # Sync additional secrets for spokes
    if [ "$code_upper" != "USA" ]; then
        # Sync OPAL client JWT if available
        local opal_container="${container_prefix}-opal-client"
        if docker ps --format '{{.Names}}' | grep -q "^${opal_container}$"; then
            local opal_jwt
            opal_jwt=$(docker exec "$opal_container" printenv OPAL_CLIENT_JWT 2>/dev/null)

            if [ -n "$opal_jwt" ]; then
                local var_name="OPAL_CLIENT_JWT_${code_upper}"
                update_env_var "$env_file" "$var_name" "$opal_jwt"
                log_success "Synced $var_name"
            fi
        fi

        # Sync SPOKE_TOKEN if available
        local backend_container="${container_prefix}-backend"
        if docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
            local spoke_token
            spoke_token=$(docker exec "$backend_container" printenv SPOKE_TOKEN 2>/dev/null)

            if [ -n "$spoke_token" ]; then
                local var_name="SPOKE_TOKEN_${code_upper}"
                update_env_var "$env_file" "$var_name" "$spoke_token"
                log_success "Synced $var_name"
            fi
        fi
    fi

    log_success "Container secrets synced to .env file"
}

##
# Sync secrets from .env file to container environment
# Note: This requires container recreation to take effect
#
# Arguments:
#   $1 - Spoke code (e.g., nld, lux)
#
# Returns:
#   0 - Success
#   1 - Failed
##
sync_spoke_secrets_to_env() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")

    ensure_dive_root

    local spoke_env="${DIVE_ROOT}/instances/${code_lower}/.env"
    local keycloak_container="dive-spoke-${code_lower}-keycloak"

    if [ ! -f "$spoke_env" ]; then
        log_warn "Spoke .env file not found: $spoke_env"
        return 1
    fi

    if ! docker ps --format '{{.Names}}' | grep -q "^${keycloak_container}$"; then
        log_warn "Keycloak container not running: $keycloak_container"
        return 1
    fi

    log_step "Syncing secrets from container to .env file..."

    # Backup .env file
    cp "$spoke_env" "${spoke_env}.bak.$(date +%Y%m%d-%H%M%S)"

    # Get secrets from container
    local kc_pass
    kc_pass=$(docker exec "$keycloak_container" env | grep "^KEYCLOAK_ADMIN_PASSWORD=" | cut -d'=' -f2 | tr -d '\n\r')

    if [ -n "$kc_pass" ]; then
        local secret_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
        if grep -q "^${secret_var}=" "$spoke_env"; then
            sed -i.tmp "s|^${secret_var}=.*|${secret_var}=${kc_pass}|" "$spoke_env"
            rm -f "${spoke_env}.tmp"
            log_success "Updated $secret_var in .env"
        else
            echo "${secret_var}=${kc_pass}" >> "$spoke_env"
            log_success "Added $secret_var to .env"
        fi
    fi

    # Sync additional spoke-specific secrets
    local backend_container="dive-spoke-${code_lower}-backend"
    if docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
        local spoke_token
        spoke_token=$(docker exec "$backend_container" env | grep "^SPOKE_TOKEN=" | cut -d'=' -f2 | tr -d '\n\r')

        if [ -n "$spoke_token" ]; then
            local secret_var="SPOKE_TOKEN_${code_upper}"
            if grep -q "^${secret_var}=" "$spoke_env"; then
                sed -i.tmp "s|^${secret_var}=.*|${secret_var}=${spoke_token}|" "$spoke_env"
                rm -f "${spoke_env}.tmp"
                log_success "Updated $secret_var in .env"
            else
                echo "${secret_var}=${spoke_token}" >> "$spoke_env"
                log_success "Added $secret_var to .env"
            fi
        fi
    fi

    return 0
}

##
# Sync secrets from .env file to container environment
# Note: This requires container recreation to take effect
#
# Arguments:
#   $1 - Spoke code (e.g., nld, lux)
#
# Returns:
#   0 - Success
#   1 - Failed
##
sync_env_to_container() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")

    ensure_dive_root

    local spoke_env="${DIVE_ROOT}/instances/${code_lower}/.env"

    if [ ! -f "$spoke_env" ]; then
        log_warn "Spoke .env file not found: $spoke_env"
        return 1
    fi

    log_info "Note: Environment variables are loaded at container startup"
    log_info "To apply changes, recreate containers with: docker compose up -d --force-recreate"

    return 0
}

# =============================================================================
# GCP SSOT COMMANDS (PUSH/PULL/SYNC)
# =============================================================================

# Helper: Create or update GCP secret
_gcp_secret_upsert() {
    local secret_name="$1"
    local secret_value="$2"
    local project="${3:-${GCP_PROJECT:-dive25}}"

    if [ -z "$secret_value" ]; then
        log_warn "  Skipping $secret_name (empty value)"
        return 0
    fi

    # Check if secret exists
    if gcloud secrets describe "$secret_name" --project="$project" &>/dev/null; then
        # Update existing
        echo -n "$secret_value" | gcloud secrets versions add "$secret_name" \
            --data-file=- --project="$project" &>/dev/null
        log_info "  ✓ Updated: $secret_name"
    else
        # Create new
        echo -n "$secret_value" | gcloud secrets create "$secret_name" \
            --data-file=- \
            --project="$project" \
            --replication-policy="automatic" &>/dev/null
        log_success "  ✓ Created: $secret_name"
    fi
}

secrets_push() {
    local instance="${1:-$INSTANCE}"
    local code_lower=$(lower "$instance")
    local code_upper=$(upper "$instance")
    local project="${GCP_PROJECT:-dive25}"

    ensure_dive_root

    # Determine env file path (hub vs spoke)
    local env_file
    if [ "$code_lower" = "usa" ]; then
        env_file="${DIVE_ROOT}/.env.hub"
    else
        env_file="${DIVE_ROOT}/instances/${code_lower}/.env"
    fi

    if [ ! -f "$env_file" ]; then
        log_error "No .env file found for ${code_upper}: $env_file"
        return 1
    fi

    check_gcloud || { log_error "gcloud not authenticated"; return 1; }

    log_step "Pushing ${code_upper} secrets to GCP Secret Manager (SSOT)..."

    # Read secrets from .env
    local postgres_pass=$(grep "^POSTGRES_PASSWORD_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"' || echo "")
    local mongo_pass=$(grep "^MONGO_PASSWORD_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"' || echo "")
    local redis_pass=$(grep "^REDIS_PASSWORD_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"' || echo "")
    local keycloak_pass=$(grep "^KEYCLOAK_ADMIN_PASSWORD_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"' || echo "")
    local client_secret=$(grep "^KEYCLOAK_CLIENT_SECRET_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"' || echo "")
    local auth_secret=$(grep "^AUTH_SECRET_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"' || echo "")
    local jwt_secret=$(grep "^JWT_SECRET_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"' || echo "")
    local nextauth_secret=$(grep "^NEXTAUTH_SECRET_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"' || echo "")

    # Push to GCP (create if missing, update if exists)
    _gcp_secret_upsert "dive-v3-postgres-${code_lower}" "$postgres_pass" "$project"
    _gcp_secret_upsert "dive-v3-mongodb-${code_lower}" "$mongo_pass" "$project"
    _gcp_secret_upsert "dive-v3-redis-${code_lower}" "$redis_pass" "$project"
    _gcp_secret_upsert "dive-v3-keycloak-${code_lower}" "$keycloak_pass" "$project"
    _gcp_secret_upsert "dive-v3-keycloak-secret-${code_lower}" "$client_secret" "$project"
    _gcp_secret_upsert "dive-v3-auth-secret-${code_lower}" "$auth_secret" "$project"
    _gcp_secret_upsert "dive-v3-jwt-secret-${code_lower}" "$jwt_secret" "$project"
    _gcp_secret_upsert "dive-v3-nextauth-secret-${code_lower}" "$nextauth_secret" "$project"

    log_success "✓ ${code_upper} secrets pushed to GCP Secret Manager"
}

secrets_pull() {
    local instance="${1:-$INSTANCE}"
    local code_lower=$(lower "$instance")
    local code_upper=$(upper "$instance")
    local project="${GCP_PROJECT:-dive25}"

    ensure_dive_root

    # Determine env file path (hub vs spoke)
    local env_file
    if [ "$code_lower" = "usa" ]; then
        env_file="${DIVE_ROOT}/.env.hub"
    else
        env_file="${DIVE_ROOT}/instances/${code_lower}/.env"
    fi

    check_gcloud || { log_error "gcloud not authenticated"; return 1; }

    log_step "Pulling ${code_upper} secrets from GCP Secret Manager (SSOT)..."

    # Load from GCP
    if ! load_gcp_secrets "$code_lower"; then
        log_error "Failed to load secrets from GCP for ${code_upper}"
        return 1
    fi

    # Backup existing .env if it exists
    if [ -f "$env_file" ]; then
        cp "$env_file" "${env_file}.bak.$(date +%Y%m%d-%H%M%S)"
        log_info "Backed up existing .env"
    fi

    # Update .env file with GCP values
    if [ -f "$env_file" ]; then
        # Use sed to update in place
        [ -n "$POSTGRES_PASSWORD" ] && sed -i '' "s|^POSTGRES_PASSWORD_${code_upper}=.*|POSTGRES_PASSWORD_${code_upper}=${POSTGRES_PASSWORD}|" "$env_file"
        [ -n "$MONGO_PASSWORD" ] && sed -i '' "s|^MONGO_PASSWORD_${code_upper}=.*|MONGO_PASSWORD_${code_upper}=${MONGO_PASSWORD}|" "$env_file"
        [ -n "$REDIS_PASSWORD" ] && sed -i '' "s|^REDIS_PASSWORD_${code_upper}=.*|REDIS_PASSWORD_${code_upper}=${REDIS_PASSWORD}|" "$env_file"
        [ -n "$KEYCLOAK_ADMIN_PASSWORD" ] && sed -i '' "s|^KEYCLOAK_ADMIN_PASSWORD_${code_upper}=.*|KEYCLOAK_ADMIN_PASSWORD_${code_upper}=${KEYCLOAK_ADMIN_PASSWORD}|" "$env_file"
        [ -n "$KEYCLOAK_CLIENT_SECRET" ] && sed -i '' "s|^KEYCLOAK_CLIENT_SECRET_${code_upper}=.*|KEYCLOAK_CLIENT_SECRET_${code_upper}=${KEYCLOAK_CLIENT_SECRET}|" "$env_file"
        [ -n "$AUTH_SECRET" ] && sed -i '' "s|^AUTH_SECRET_${code_upper}=.*|AUTH_SECRET_${code_upper}=${AUTH_SECRET}|" "$env_file"
        [ -n "$JWT_SECRET" ] && sed -i '' "s|^JWT_SECRET_${code_upper}=.*|JWT_SECRET_${code_upper}=${JWT_SECRET}|" "$env_file"
        [ -n "$NEXTAUTH_SECRET" ] && sed -i '' "s|^NEXTAUTH_SECRET_${code_upper}=.*|NEXTAUTH_SECRET_${code_upper}=${NEXTAUTH_SECRET}|" "$env_file"
    else
        log_warn "No .env file found to update: $env_file"
    fi

    log_success "✓ ${code_upper} secrets pulled from GCP and written to .env"
}

secrets_sync() {
    local instance="${1:-$INSTANCE}"
    local direction="${2:-bidirectional}"

    case "$direction" in
        push)
            secrets_push "$instance"
            ;;
        pull)
            secrets_pull "$instance"
            ;;
        bidirectional|auto)
            # Check which is newer: GCP or .env
            local code_lower=$(lower "$instance")
            local env_file
            if [ "$code_lower" = "usa" ]; then
                env_file="${DIVE_ROOT}/.env.hub"
            else
                env_file="${DIVE_ROOT}/instances/${code_lower}/.env"
            fi

            if [ ! -f "$env_file" ]; then
                log_info "No .env file - pulling from GCP"
                secrets_pull "$instance"
                return $?
            fi

            # Get file modification time
            local env_modified
            if [[ "$OSTYPE" == "darwin"* ]]; then
                env_modified=$(stat -f %m "$env_file" 2>/dev/null || echo 0)
            else
                env_modified=$(stat -c %Y "$env_file" 2>/dev/null || echo 0)
            fi

            # Get GCP secret last modified time (use keycloak secret as reference)
            local gcp_time
            gcp_time=$(gcloud secrets describe "dive-v3-keycloak-${code_lower}" \
                --format="value(createTime)" --project="${GCP_PROJECT:-dive25}" 2>/dev/null || echo "")

            if [ -z "$gcp_time" ]; then
                log_info "No GCP secrets found - pushing .env to GCP"
                secrets_push "$instance"
            elif [ "$env_modified" -gt 0 ]; then
                # Simple heuristic: if .env is very recent (< 1 hour), push it
                local now=$(date +%s)
                local age=$((now - env_modified))
                if [ $age -lt 3600 ]; then
                    log_info ".env is recent - pushing to GCP"
                    secrets_push "$instance"
                else
                    log_info "GCP is authoritative - pulling to .env"
                    secrets_pull "$instance"
                fi
            else
                secrets_pull "$instance"
            fi
            ;;
        *)
            log_error "Invalid sync direction: $direction (use push, pull, or bidirectional)"
            return 1
            ;;
    esac
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_secrets() {
    local action="${1:-show}"
    shift || true

    case "$action" in
        load)       secrets_load "$@" ;;
        show)       secrets_show "$@" ;;
        list)       secrets_list ;;
        verify)     secrets_verify "$@" ;;
        verify-all) secrets_verify_all ;;
        export)     secrets_export "$@" ;;
        lint)       secrets_lint "$@" ;;
        push)       secrets_push "$@" ;;
        pull)       secrets_pull "$@" ;;
        sync)       secrets_sync "$@" ;;
            sync-container) sync_container_secrets_to_env "$@" ;;
        sync-env)       sync_spoke_secrets_to_env "$@" ;;
        sync-to-env)    sync_env_to_container "$@" ;;
        *)          module_secrets_help ;;
    esac
}

module_secrets_help() {
    echo -e "${BOLD}Secrets Commands:${NC}"
    echo ""
    echo -e "${CYAN}Read Operations:${NC}"
    echo "  load [instance]        Load secrets into environment"
    echo "  show [instance]        Show secrets for instance"
    echo "  list                   List all DIVE secrets in GCP"
    echo "  verify [instance]      Verify secrets can be accessed"
    echo "  verify-all             Verify secrets for all instances"
    echo "  export [--unsafe] [instance]  Export secrets as shell commands"
    echo ""
    echo -e "${CYAN}SSOT Sync Operations:${NC}"
    echo "  push [instance]        Push .env secrets to GCP (Local → GCP)"
    echo "  pull [instance]        Pull GCP secrets to .env (GCP → Local)"
    echo "  sync [instance] [direction]  Sync secrets (bidirectional/push/pull)"
    echo ""
    echo -e "${CYAN}Container & Env Sync:${NC}"
    echo "  sync-container [instance]  Sync container secrets → .env file"
    echo "  sync-env [spoke]          Sync spoke secrets from container → .env"
    echo "  sync-to-env [spoke]       Sync .env → container (requires restart)"
    echo ""
    echo -e "${CYAN}Other:${NC}"
    echo "  lint [--verbose|--fix] Lint codebase for hardcoded secrets"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  ./dive --instance fra secrets push     # Upload FRA secrets to GCP"
    echo "  ./dive --instance gbr secrets pull     # Download GBR secrets from GCP"
    echo "  ./dive --instance pol secrets sync     # Auto-sync (newest wins)"
    echo "  ./dive secrets verify-all              # Check all instances"
    echo ""
    echo "Usage: ./dive secrets [command] [options]"
}
