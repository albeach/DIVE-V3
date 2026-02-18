#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Common Utilities (Docker & Network Helpers)
# =============================================================================
# Extracted from common.sh (Phase 13e)
# =============================================================================

[ -n "${DIVE_COMMON_DOCKER_LOADED:-}" ] && return 0

# =============================================================================
# SECRETS LOADING (used by multiple modules)
# =============================================================================

# Ensure required GCP secrets exist, generating them if necessary
ensure_gcp_secrets_exist() {
    local instance="${1:-usa}"
    local inst_lc
    inst_lc=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    local project="${GCP_PROJECT:-dive25}"

    log_step "Ensuring GCP secrets exist for $(upper "$instance")..."

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would check/create secrets in GCP Secret Manager"
        return 0
    fi

    check_gcloud || { log_error "GCP authentication required"; return 1; }

    # Function to generate a secure password
    generate_secure_password() {
        openssl rand -base64 32 | tr -d '/+=' | head -c 24
    }

    # Function to create secret if it doesn't exist
    create_secret_if_missing() {
        local secret_name="$1"
        local description="$2"

        if ! gcloud secrets describe "$secret_name" --project="$project" >/dev/null 2>&1; then
            local password
            password=$(generate_secure_password)
            log_info "Creating GCP secret: $secret_name"

            echo -n "$password" | gcloud secrets create "$secret_name" \
                --project="$project" \
                --data-file=- \
                --description="$description" \
                --labels=environment="$ENVIRONMENT",instance="$inst_lc",managed-by=dive-cli,created-by="$(whoami)@$(hostname)",created-at="$(date -u +%Y%m%d-%H%M%S)"
        fi
    }

    # Create instance-specific secrets
    create_secret_if_missing "dive-v3-postgres-${inst_lc}" "PostgreSQL password for ${instance} database"
    create_secret_if_missing "dive-v3-keycloak-${inst_lc}" "Keycloak admin password for ${instance}"
    create_secret_if_missing "dive-v3-mongodb-${inst_lc}" "MongoDB root password for ${instance}"
    create_secret_if_missing "dive-v3-auth-secret-${inst_lc}" "JWT/Auth secret for ${instance}"

    # Create shared secrets (only once)
    create_secret_if_missing "dive-v3-keycloak-client-secret" "Shared Keycloak client secret"
    create_secret_if_missing "dive-v3-redis-blacklist" "Shared Redis blacklist password"

    log_success "All GCP secrets verified/created for $(upper "$instance")"
}

load_gcp_secrets() {
    local instance="${1:-usa}"
    # Normalize instance to lowercase for secret names (secrets use lowercase suffixes)
    local inst_lc
    inst_lc=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    # Use configured project, default to dive25 if not set
    local project="${GCP_PROJECT:-dive25}"

    # Debug: show which project/instance we will query (verbose-only to avoid stdout pollution)
    log_verbose "[secrets-debug] project=${project} instance=${inst_lc}"

    log_step "Loading secrets from GCP Secret Manager ($(upper "$instance"))..."

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would fetch: dive-v3-postgres-${instance}"
        log_dry "Would fetch: dive-v3-keycloak-${instance}"
        log_dry "Would fetch: dive-v3-mongodb-${instance}"
        export POSTGRES_PASSWORD="<gcp-secret>"
        export KEYCLOAK_ADMIN_PASSWORD="<gcp-secret>"
        export MONGO_PASSWORD="<gcp-secret>"
        export AUTH_SECRET="<gcp-secret>"
        export KEYCLOAK_CLIENT_SECRET="<gcp-secret>"
        return 0
    fi

    check_gcloud || { log_error "GCP authentication required for environment '$ENVIRONMENT'"; return 1; }

    # Try secrets using documented naming; fall back to legacy variants if present.
    # CRITICAL: Do NOT overwrite existing values from .env if GCP fetch fails
    fetch_first_secret() {
        local var_ref="$1"
        shift
        local name
        for name in "$@"; do
            if value=$(gcloud secrets versions access latest --secret="$name" --project="$project" 2>/dev/null); then
                eval "$var_ref=\"\$value\""
                log_verbose "[secrets-debug] loaded $name (len=${#value})"
                return 0
            fi
        done
        # Don't clear existing value - it might be set from .env
        # Only set to empty if variable is truly unset
        eval "local existing_val=\"\${$var_ref:-}\""
        if [ -z "$existing_val" ]; then
            eval "$var_ref=\"\""
        fi
        return 1
    }

    # CRITICAL: Only load from GCP if not already set (preserve .env values)
    [ -z "${POSTGRES_PASSWORD:-}" ] && fetch_first_secret POSTGRES_PASSWORD "dive-v3-postgres-${inst_lc}"
    [ -z "${KEYCLOAK_ADMIN_PASSWORD:-}" ] && fetch_first_secret KEYCLOAK_ADMIN_PASSWORD "dive-v3-keycloak-${inst_lc}"
    [ -z "${MONGO_PASSWORD:-}" ] && fetch_first_secret MONGO_PASSWORD "dive-v3-mongodb-${inst_lc}"
    [ -z "${AUTH_SECRET:-}" ] && fetch_first_secret AUTH_SECRET "dive-v3-auth-secret-${inst_lc}"
    [ -z "${KEYCLOAK_CLIENT_SECRET:-}" ] && fetch_first_secret KEYCLOAK_CLIENT_SECRET "dive-v3-keycloak-client-secret" "dive-v3-keycloak-client-secret-${inst_lc}"
    [ -z "${REDIS_PASSWORD:-}" ] && fetch_first_secret REDIS_PASSWORD "dive-v3-redis-blacklist" "dive-v3-redis-${inst_lc}"

    # Export instance-suffixed variables for spoke docker-compose files
    # CRITICAL: Only overwrite if we have a non-empty value (preserve .env values)
    local inst_uc=$(echo "$instance" | tr '[:lower:]' '[:upper:]')
    [ -n "$POSTGRES_PASSWORD" ] && eval "export POSTGRES_PASSWORD_${inst_uc}='${POSTGRES_PASSWORD}'"
    [ -n "$KEYCLOAK_ADMIN_PASSWORD" ] && eval "export KEYCLOAK_ADMIN_PASSWORD_${inst_uc}='${KEYCLOAK_ADMIN_PASSWORD}'"
    [ -n "$MONGO_PASSWORD" ] && eval "export MONGO_PASSWORD_${inst_uc}='${MONGO_PASSWORD}'"
    [ -n "$AUTH_SECRET" ] && eval "export AUTH_SECRET_${inst_uc}='${AUTH_SECRET}'"
    [ -n "$KEYCLOAK_CLIENT_SECRET" ] && eval "export KEYCLOAK_CLIENT_SECRET_${inst_uc}='${KEYCLOAK_CLIENT_SECRET}'"
    [ -n "$REDIS_PASSWORD" ] && eval "export REDIS_PASSWORD_${inst_uc}='${REDIS_PASSWORD}'"
    [ -n "$REDIS_PASSWORD" ] && export REDIS_PASSWORD_BLACKLIST="${REDIS_PASSWORD}"

    # Make secrets available to child processes (docker compose, terraform)
    export POSTGRES_PASSWORD KEYCLOAK_ADMIN_PASSWORD MONGO_PASSWORD AUTH_SECRET KEYCLOAK_CLIENT_SECRET REDIS_PASSWORD

    # For Hub deployment, also load spoke passwords for federation
    # FIX: Only load spoke passwords when actually needed (federation setup), not during clean slate hub deployment
    # Spoke passwords are only needed when:
    #   1. Setting up federation with existing spokes (federation-link.sh, federation-setup.sh)
    #   2. Spoke registration operations
    # They are NOT needed during initial clean slate hub deployment
    if [ "$inst_lc" = "usa" ] || [ "$inst_lc" = "hub" ]; then
        # Only load spoke passwords if explicitly requested via LOAD_SPOKE_PASSWORDS=true
        # OR if we're in a context where federation is being set up (detected via function call context)
        # Default: Skip during clean slate hub deployment to avoid unnecessary GCP calls
        if [ "${LOAD_SPOKE_PASSWORDS:-false}" = "true" ] || [ "${FEDERATION_SETUP:-false}" = "true" ]; then
            local provisioned_spokes
            provisioned_spokes=$(dive_get_provisioned_spokes)
            if [ -z "$provisioned_spokes" ]; then
                log_verbose "No provisioned spokes found — skipping spoke password loading"
            else
                log_verbose "Loading spoke Keycloak passwords for federation operations..."
            fi
            for spoke in $provisioned_spokes; do
                local spoke_uc=$(echo "$spoke" | tr '[:lower:]' '[:upper:]')
                local spoke_password
                if spoke_password=$(gcloud secrets versions access latest --secret="dive-v3-keycloak-${spoke}" --project="$project" 2>/dev/null); then
                    eval "export KEYCLOAK_ADMIN_PASSWORD_${spoke_uc}='${spoke_password}'"
                    log_verbose "[secrets-debug] loaded KEYCLOAK_ADMIN_PASSWORD_${spoke_uc} (len=${#spoke_password})"
                else
                    log_verbose "Could not load KEYCLOAK_ADMIN_PASSWORD_${spoke_uc} (spoke may not exist yet)"
                fi
            done
        else
            # Clean slate hub deployment - skip spoke password loading
            # They will be loaded on-demand when federation is actually set up
            log_verbose "Skipping spoke password loading (clean slate hub deployment - not needed until federation setup)"
        fi
    fi

    # Align NextAuth/JWT to AUTH secret unless explicitly provided
    [ -n "$AUTH_SECRET" ] && export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-$AUTH_SECRET}"
    [ -n "$AUTH_SECRET" ] && export JWT_SECRET="${JWT_SECRET:-$AUTH_SECRET}"

    # KC_ADMIN_PASSWORD is the SSOT naming convention for docker-compose
    export KC_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD"

    # OPAL authentication token - generate from AUTH_SECRET if not explicitly set
    if [ -z "${OPAL_AUTH_MASTER_TOKEN:-}" ] && [ -n "$AUTH_SECRET" ]; then
        # Generate a deterministic token from AUTH_SECRET for OPAL
        export OPAL_AUTH_MASTER_TOKEN=$(echo -n "opal-${AUTH_SECRET}" | openssl dgst -sha256 | awk '{print $2}' | cut -c1-64)
    fi

    # Terraform variables
    export TF_VAR_keycloak_admin_password="$KEYCLOAK_ADMIN_PASSWORD"
    export TF_VAR_client_secret="$KEYCLOAK_CLIENT_SECRET"
    export TF_VAR_test_user_password="${TF_VAR_test_user_password:-$KEYCLOAK_ADMIN_PASSWORD}"
    export TF_VAR_admin_user_password="${TF_VAR_admin_user_password:-$KEYCLOAK_ADMIN_PASSWORD}"
    # Pilot/default Keycloak URL (matches KC_HOSTNAME=localhost in docker-compose)
    export KEYCLOAK_URL="${KEYCLOAK_URL:-https://localhost:${KEYCLOAK_HTTPS_PORT:-8443}}"
    export KEYCLOAK_ADMIN_USERNAME="${KEYCLOAK_ADMIN_USERNAME:-admin}"
    # Verify critical secrets
    local missing=0
    [ -z "$POSTGRES_PASSWORD" ] && log_warn "Missing: POSTGRES_PASSWORD" && ((missing++))
    [ -z "$KEYCLOAK_ADMIN_PASSWORD" ] && log_warn "Missing: KEYCLOAK_ADMIN_PASSWORD" && ((missing++))
    [ -z "$MONGO_PASSWORD" ] && log_warn "Missing: MONGO_PASSWORD" && ((missing++))
    [ -z "$AUTH_SECRET" ] && log_warn "Missing: AUTH_SECRET" && ((missing++))
    [ -z "$KEYCLOAK_CLIENT_SECRET" ] && log_warn "Missing: KEYCLOAK_CLIENT_SECRET" && ((missing++))
    [ -z "$REDIS_PASSWORD" ] && log_warn "Missing: REDIS_PASSWORD" && ((missing++))

    if [ $missing -gt 0 ]; then
        log_error "Failed to load $missing critical secret(s)"
        return 1
    fi

    # Mirror base secrets into instance-scoped env vars expected by generated compose
    local inst_uc
    inst_uc=$(echo "$inst_lc" | tr '[:lower:]' '[:upper:]')
    map_if_empty() {
        local target_var="$1"
        local source_val="$2"
        eval "local current_val=\${$target_var:-}"
        if [ -z "$current_val" ] && [ -n "$source_val" ]; then
            export "$target_var=$source_val"
        fi
    }
    map_if_empty "POSTGRES_PASSWORD_${inst_uc}" "$POSTGRES_PASSWORD"
    map_if_empty "MONGO_PASSWORD_${inst_uc}" "$MONGO_PASSWORD"
    map_if_empty "REDIS_PASSWORD_${inst_uc}" "$REDIS_PASSWORD"
    map_if_empty "KEYCLOAK_ADMIN_PASSWORD_${inst_uc}" "$KEYCLOAK_ADMIN_PASSWORD"
    map_if_empty "KEYCLOAK_CLIENT_SECRET_${inst_uc}" "$KEYCLOAK_CLIENT_SECRET"
    map_if_empty "NEXTAUTH_SECRET_${inst_uc}" "$NEXTAUTH_SECRET"

    # Note: Environment variables are now available for docker-compose
    # The --env-file flag ensures .env.hub is still used as fallback
    log_success "Secrets loaded from GCP"

    log_success "Secrets loaded from GCP"
    return 0
}

load_local_defaults() {
    # SECURITY: Load from .env.hub if available (contains GCP-synced secrets)
    # No hardcoded defaults - secrets MUST be in .env file or GCP Secret Manager

    local env_file="${DIVE_ROOT}/.env.hub"

    if [ -f "$env_file" ] && [ -s "$env_file" ]; then
        log_warn "⚠️  USING LOCAL ENV FILE: $env_file"
        log_warn "This file should contain GCP-synced secrets (use ./dive secrets sync)"

        # Export variables from .env.hub
        set -a
        source "$env_file" 2>/dev/null || {
            log_error "Failed to source $env_file"
            return 1
        }
        set +a

        log_success "Secrets loaded from local env file"
        return 0
    fi

    log_error "FATAL: No secrets available (no GCP access and no .env.hub file)"
    log_error ""
    log_error "To fix this issue:"
    log_error "  1. Ensure GCP authentication: gcloud auth application-default login"
    log_error "  2. Run: ./dive secrets sync ${INSTANCE:-usa}"
    log_error ""
    log_error "Or manually create .env.hub with required secrets"
    return 1
}

##
# Activate GCP service account for secret access
# Automatically uses service account key from gcp/ directory if available
#
# Returns:
#   0 if GCP is authenticated (user or service account)
#   1 if GCP is not available
##
activate_gcp_service_account() {
    local instance="${1:-usa}"
    local inst_lc
    inst_lc=$(echo "$instance" | tr '[:upper:]' '[:lower:]')

    # Check if already authenticated
    if gcloud auth application-default print-access-token &>/dev/null 2>&1; then
        log_verbose "GCP already authenticated (user or service account)"
        return 0
    fi

    # Try to use service account key if available
    local sa_key_file="${DIVE_ROOT}/gcp/${inst_lc}-sa-key.json"

    if [ -f "$sa_key_file" ]; then
        log_info "Activating GCP service account from $sa_key_file..."

        # Set GOOGLE_APPLICATION_CREDENTIALS for automatic authentication
        export GOOGLE_APPLICATION_CREDENTIALS="$sa_key_file"

        # Verify service account works
        if gcloud auth application-default print-access-token &>/dev/null 2>&1; then
            log_success "GCP service account activated successfully"
            return 0
        else
            log_warn "Service account key found but authentication failed"
            unset GOOGLE_APPLICATION_CREDENTIALS
            return 1
        fi
    fi

    # Try usa key as fallback (hub can access all spokes)
    local usa_sa_key="${DIVE_ROOT}/gcp/usa-sa-key.json"
    if [ "$inst_lc" != "usa" ] && [ -f "$usa_sa_key" ]; then
        log_info "Using USA service account as fallback..."
        export GOOGLE_APPLICATION_CREDENTIALS="$usa_sa_key"

        if gcloud auth application-default print-access-token &>/dev/null 2>&1; then
            log_success "GCP service account activated (usa fallback)"
            return 0
        else
            unset GOOGLE_APPLICATION_CREDENTIALS
        fi
    fi

    log_verbose "No service account key found, user authentication required"
    return 1
}

load_secrets() {
    # Source .env.hub to pick up SECRETS_PROVIDER and Vault config
    if [ -z "${SECRETS_PROVIDER:-}" ] && [ -f "${DIVE_ROOT}/.env.hub" ]; then
        local _line
        while IFS= read -r _line; do
            case "$_line" in
                SECRETS_PROVIDER=*|VAULT_ADDR=*|VAULT_CLI_ADDR=*|VAULT_TOKEN=*|CERT_PROVIDER=*)
                    export "$_line" ;;
            esac
        done < "${DIVE_ROOT}/.env.hub"
    fi

    # Vault provider: load secrets from Vault, skip GCP/AWS entirely
    if [ "${SECRETS_PROVIDER:-}" = "vault" ]; then
        # CLI scripts run on host — use VAULT_CLI_ADDR (host-accessible) over VAULT_ADDR (Docker-internal)
        if [ -n "${VAULT_CLI_ADDR:-}" ]; then
            export VAULT_ADDR="$VAULT_CLI_ADDR"
        fi
        # Load token from .vault-token if not already set
        if [ -z "${VAULT_TOKEN:-}" ] && [ -f "${DIVE_ROOT}/.vault-token" ]; then
            export VAULT_TOKEN=$(cat "${DIVE_ROOT}/.vault-token")
        fi

        log_info "Loading secrets from HashiCorp Vault..."
        if [ -z "${DIVE_CONFIGURATION_SECRETS_LOADED:-}" ]; then
            source "${DIVE_ROOT}/scripts/dive-modules/configuration/secrets.sh"
        fi
        if secrets_load_for_instance "${INSTANCE:-USA}"; then
            log_success "Secrets loaded from Vault"
            return 0
        fi
        log_warn "Vault secret loading failed - falling back to environment variables"
        # Fall through to allow ALLOW_INSECURE_LOCAL_DEVELOPMENT to work
    fi

    case "$ENVIRONMENT" in
        local|dev)
            # ENHANCED: Automatically try service account before user auth
            local gcp_available=false

            if command -v gcloud >/dev/null 2>&1; then
                # First try to activate service account (silent)
                if activate_gcp_service_account "$INSTANCE" 2>/dev/null; then
                    gcp_available=true
                    log_verbose "Using GCP service account for secrets"
                # Then check if user is authenticated
                elif gcloud auth application-default print-access-token &>/dev/null; then
                    gcp_available=true
                    log_verbose "Using GCP user authentication for secrets"
                fi
            fi

            # Prefer GCP secrets if available (can be overridden)
            local want_gcp=false
            if [ "$ENVIRONMENT" = "dev" ]; then
                # Dev: Use GCP by default if available
                if [ "${DEV_USE_GCP_SECRETS:-${USE_GCP_SECRETS:-auto}}" = "auto" ]; then
                    want_gcp="$gcp_available"
                elif [ "${DEV_USE_GCP_SECRETS:-${USE_GCP_SECRETS:-true}}" = "true" ]; then
                    want_gcp=true
                fi
            else
                # Local: Explicit opt-in or auto-detect
                if [ "${USE_GCP_SECRETS:-auto}" = "auto" ]; then
                    want_gcp="$gcp_available"
                elif [ "${USE_GCP_SECRETS:-}" = "true" ]; then
                    want_gcp=true
                fi
            fi

            if [ "$want_gcp" = true ]; then
                if [ "$gcp_available" = false ]; then
                    # Try one more time with explicit activation (with output)
                    if activate_gcp_service_account "$INSTANCE"; then
                        gcp_available=true
                    else
                        log_error "❌ GCP secrets requested but authentication failed"
                        log_error ""
                        log_error "Options:"
                        log_error "  1. User authentication: gcloud auth application-default login"
                        log_error "  2. Service account: Place key in gcp/${INSTANCE,,}-sa-key.json"
                        log_error "  3. Local development: export ALLOW_INSECURE_LOCAL_DEVELOPMENT=true"
                        log_error ""
                        return 1
                    fi
                fi
                ensure_gcp_secrets_exist "$INSTANCE" || return 1
                load_gcp_secrets "$INSTANCE" || return 1
                return 0
            fi

            # Local development without GCP - require explicit opt-in
            if [ "${ALLOW_INSECURE_LOCAL_DEVELOPMENT:-false}" = "true" ]; then
                log_warn "⚠️  USING INSECURE LOCAL DEVELOPMENT MODE ⚠️"
                log_warn "This should NEVER be used in shared or production environments"
                load_local_defaults
            else
                log_error "❌ No GCP Secret Manager access"
                if [ "$gcp_available" = false ] && command -v gcloud >/dev/null 2>&1; then
                    log_error ""
                    log_error "Authentication Options:"
                    log_error "  1. User auth:    gcloud auth application-default login"
                    log_error "  2. Service acct: Place key in gcp/${INSTANCE,,}-sa-key.json"
                    log_error "  3. Auto-detect:  export USE_GCP_SECRETS=auto (default)"
                    log_error "  4. Local dev:    export ALLOW_INSECURE_LOCAL_DEVELOPMENT=true"
                    log_error ""
                elif ! command -v gcloud >/dev/null 2>&1; then
                    log_error ""
                    log_error "GCP CLI not found. Install with:"
                    log_error "  https://cloud.google.com/sdk/docs/install"
                    log_error ""
                    log_error "Or use local development mode:"
                    log_error "  export ALLOW_INSECURE_LOCAL_DEVELOPMENT=true"
                    log_error ""
                fi
                return 1
            fi
            ;;
        gcp|pilot|prod|staging)
            # Production: Activate service account, then load secrets
            activate_gcp_service_account "$INSTANCE" || {
                log_error "Failed to activate service account in $ENVIRONMENT environment"
                return 1
            }
            load_gcp_secrets "$INSTANCE" || return 1
            ;;
        *)
            log_error "Unknown environment: $ENVIRONMENT"
            return 1
            ;;
    esac
}


export DIVE_COMMON_DOCKER_LOADED=1
