#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Unified Spoke Secret Management
# =============================================================================
# Centralized secret management with clear precedence:
#   1. GCP Secret Manager (SSOT for production)
#   2. .env file (local fallback)
#   3. Generate new (initialization only)
#
# Consolidates 5+ duplicate secret loading implementations into one.
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-13
# =============================================================================

# Prevent multiple sourcing
# BEST PRACTICE (2026-01-18): Only skip if functions actually exist
# Don't rely solely on guard variable - it can be set even if load failed
if type spoke_secrets_load &>/dev/null && \
   type spoke_secrets_validate &>/dev/null && \
   type spoke_secrets_generate &>/dev/null; then
    # Functions already available - module was loaded successfully before
    return 0
fi

# Mark as loaded (set at END after functions defined, not here)
# This will be set at the end of the module after all functions are defined

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Ensure SECRETS_PROVIDER is set
# Remote mode: must come from environment variable (no .env.hub on spoke)
# Local mode: fall back to reading from .env.hub on same machine
if [ -z "${SECRETS_PROVIDER:-}" ] && [ "${DEPLOYMENT_MODE:-local}" != "remote" ] && [ -f "${DIVE_ROOT}/.env.hub" ]; then
    _line=""
    while IFS= read -r _line; do
        case "$_line" in
            SECRETS_PROVIDER=*|VAULT_CLI_ADDR=*|VAULT_ADDR=*)
                export "$_line" ;;
        esac
    done < "${DIVE_ROOT}/.env.hub"
fi
# Default to vault (was gcp, fixed to match config/dive-defaults.env SSOT)
SECRETS_PROVIDER="${SECRETS_PROVIDER:-vault}"

# Source secrets module for vault functions when using Vault provider
if [ "$SECRETS_PROVIDER" = "vault" ] && [ -z "${DIVE_CONFIGURATION_SECRETS_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../../configuration/secrets.sh"
fi

# =============================================================================
# CONSTANTS
# =============================================================================

# Required secrets for a spoke instance
readonly SPOKE_REQUIRED_SECRETS=(
    "POSTGRES_PASSWORD"
    "MONGO_PASSWORD"
    "REDIS_PASSWORD"
    "KEYCLOAK_ADMIN_PASSWORD"
    "KEYCLOAK_CLIENT_SECRET"
    "AUTH_SECRET"
)

# Optional secrets (not blocking)
readonly SPOKE_OPTIONAL_SECRETS=(
    "JWT_SECRET"
    "NEXTAUTH_SECRET"
    "OPAL_TOKEN"
)

# Secret strength requirements
readonly SPOKE_SECRET_MIN_LENGTH=12
readonly SPOKE_AUTH_SECRET_MIN_LENGTH=32

# =============================================================================
# MAIN SECRET LOADING FUNCTION
# =============================================================================

##
# Load secrets for a spoke instance with clear precedence
# Precedence: GCP Secret Manager > .env file > Generate new
#
# Arguments:
#   $1 - Instance code (e.g., NZL)
#   $2 - Mode: "load" (default), "generate", "validate"
#
# Returns:
#   0 - Success
#   1 - Failure
#
# Side effects:
#   Sets environment variables for all secrets
##
spoke_secrets_load() {
    local instance_code="$1"
    local mode="${2:-load}"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    local ssot_name="GCP Secret Manager"
    [ "$SECRETS_PROVIDER" = "vault" ] && ssot_name="HashiCorp Vault"

    log_step "Loading secrets for $code_upper (SSOT: $ssot_name)"

    case "$mode" in
        load)
            # Try primary provider first (Vault or GCP)
            if [ "$SECRETS_PROVIDER" = "vault" ]; then
                if spoke_secrets_load_from_vault "$instance_code"; then
                    log_success "Loaded secrets from HashiCorp Vault"
                    spoke_secrets_sync_to_env "$instance_code"
                    return 0
                fi
            else
                if spoke_secrets_load_from_gcp "$instance_code"; then
                    log_success "Loaded secrets from GCP Secret Manager"
                    spoke_secrets_sync_to_env "$instance_code"
                    return 0
                fi
            fi

            # Fallback to .env
            if spoke_secrets_load_from_env "$instance_code"; then
                log_warn "Using .env secrets ($ssot_name unavailable) - may be stale"
                return 0
            fi

            # In load mode, don't generate - fail
            orch_record_error "$SPOKE_ERROR_SECRET_LOAD" "$ORCH_SEVERITY_CRITICAL" \
                "All secret sources failed for $code_upper" "secrets" \
                "$(spoke_error_get_remediation $SPOKE_ERROR_SECRET_LOAD $instance_code)"
            return 1
            ;;

        generate)
            # Generate new secrets
            if spoke_secrets_generate "$instance_code"; then
                log_success "Generated new secrets for $code_upper"

                # Upload to primary provider if available
                if [ "$SECRETS_PROVIDER" = "vault" ]; then
                    spoke_secrets_upload_to_vault "$instance_code"
                elif check_gcloud 2>/dev/null; then
                    spoke_secrets_upload_to_gcp "$instance_code"
                fi

                # Also save to .env
                spoke_secrets_sync_to_env "$instance_code"
                return 0
            fi

            log_error "Failed to generate secrets for $code_upper"
            return 1
            ;;

        validate)
            # Just validate loaded secrets
            spoke_secrets_validate "$instance_code"
            return $?
            ;;

        *)
            log_error "Unknown secret mode: $mode"
            return 1
            ;;
    esac
}

# =============================================================================
# GCP SECRET MANAGER INTEGRATION
# =============================================================================

##
# Load secrets from GCP Secret Manager
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
##
# Map environment variable name to GCP secret name (SSOT naming convention)
# Per .cursorrules: dive-v3-<type>-<instance>
# NOTE: Spokes use -password suffix, Hub uses shortened names
##
_map_env_to_gcp_secret() {
    local env_var="$1"
    local instance_code="$2"

    case "$env_var" in
        POSTGRES_PASSWORD)
            echo "dive-v3-postgres-password-${instance_code}"
            ;;
        MONGO_PASSWORD)
            echo "dive-v3-mongo-password-${instance_code}"
            ;;
        REDIS_PASSWORD)
            echo "dive-v3-redis-password-${instance_code}"
            ;;
        KEYCLOAK_ADMIN_PASSWORD)
            echo "dive-v3-keycloak-admin-password-${instance_code}"
            ;;
        KEYCLOAK_CLIENT_SECRET)
            echo "dive-v3-keycloak-client-secret-${instance_code}"
            ;;
        AUTH_SECRET)
            echo "dive-v3-auth-secret-${instance_code}"
            ;;
        JWT_SECRET)
            echo "dive-v3-jwt-secret-${instance_code}"
            ;;
        NEXTAUTH_SECRET)
            echo "dive-v3-nextauth-secret-${instance_code}"
            ;;
        *)
            # Fallback to transformation (for unknown secrets)
            echo "dive-v3-$(echo "$env_var" | tr '[:upper:]' '[:lower:]' | tr '_' '-')-${instance_code}"
            ;;
    esac
}

spoke_secrets_load_from_gcp() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    # Check GCP availability
    if ! check_gcloud 2>/dev/null; then
        log_verbose "GCP not available for secret loading"
        return 1
    fi

    local project="${GCP_PROJECT:-dive25}"
    local secrets_loaded=0
    local secrets_failed=0
    local failed_secrets=()  # Track which secrets failed

    log_verbose "Loading secrets from GCP project: $project"

    # Load each required secret using SSOT naming convention
    for base_secret in "${SPOKE_REQUIRED_SECRETS[@]}"; do
        # Use SSOT mapping function instead of naive transformation
        local gcp_secret_name=$(_map_env_to_gcp_secret "$base_secret" "$code_lower")
        local env_var_name="${base_secret}_${code_upper}"

        # Try to fetch from GCP
        local secret_value
        secret_value=$(gcloud secrets versions access latest --secret="$gcp_secret_name" --project="$project" 2>/dev/null)

        if [ -n "$secret_value" ]; then
            export "${env_var_name}=${secret_value}"
            secrets_loaded=$((secrets_loaded + 1))
            log_verbose "Loaded $env_var_name from GCP ($gcp_secret_name)"
        else
            # Try shared secret (for instance-agnostic secrets like redis-blacklist)
            local shared_secret_name="dive-v3-$(echo "$base_secret" | tr '[:upper:]' '[:lower:]' | tr '_' '-')"
            secret_value=$(gcloud secrets versions access latest --secret="$shared_secret_name" --project="$project" 2>/dev/null)

            if [ -n "$secret_value" ]; then
                export "${env_var_name}=${secret_value}"
                secrets_loaded=$((secrets_loaded + 1))
                log_verbose "Loaded $env_var_name from shared GCP secret"
            else
                secrets_failed=$((secrets_failed + 1))
                failed_secrets+=("$base_secret")
                log_verbose "GCP secret not found: $gcp_secret_name (also tried $shared_secret_name)"
            fi
        fi
    done

    # Also load optional secrets (don't fail if missing)
    for base_secret in "${SPOKE_OPTIONAL_SECRETS[@]}"; do
        # Use SSOT mapping function
        local gcp_secret_name=$(_map_env_to_gcp_secret "$base_secret" "$code_lower")
        local env_var_name="${base_secret}_${code_upper}"

        local secret_value
        secret_value=$(gcloud secrets versions access latest --secret="$gcp_secret_name" --project="$project" 2>/dev/null)

        if [ -n "$secret_value" ]; then
            export "${env_var_name}=${secret_value}"
            log_verbose "Loaded optional $env_var_name from GCP ($gcp_secret_name)"
        fi
    done

    # Also set base variable names (without instance suffix) for compatibility
    for base_secret in "${SPOKE_REQUIRED_SECRETS[@]}"; do
        local env_var_name="${base_secret}_${code_upper}"
        if [ -n "${!env_var_name:-}" ]; then
            local value="${!env_var_name:-}"
            export "${base_secret}=${value}"
        fi
    done

    if [ $secrets_loaded -ge ${#SPOKE_REQUIRED_SECRETS[@]} ]; then
        log_info "Loaded $secrets_loaded secrets from GCP"

        # ==========================================================================
        # FEDERATION SECRETS: Load USA client secret for spokes (NOT all USA secrets)
        # ==========================================================================
        # CRITICAL FIX (2026-01-28): Only load the client secret for federation
        # We do NOT need USA's database passwords (postgres, mongo, redis)
        # ==========================================================================
        if [ "$code_upper" != "USA" ]; then
            log_verbose "Loading USA client secret for federation..."

            # Try the instance-suffixed name first (SSOT naming)
            local usa_client_secret
            usa_client_secret=$(gcloud secrets versions access latest \
                --secret="dive-v3-keycloak-client-secret-usa" --project="$project" 2>/dev/null)

            # Fallback to shared secret name
            if [ -z "$usa_client_secret" ]; then
                usa_client_secret=$(gcloud secrets versions access latest \
                    --secret="dive-v3-keycloak-client-secret" --project="$project" 2>/dev/null)
            fi

            if [ -n "$usa_client_secret" ]; then
                export "KEYCLOAK_CLIENT_SECRET_USA=${usa_client_secret}"
                log_verbose "✓ Loaded KEYCLOAK_CLIENT_SECRET_USA for federation"
            else
                log_warn "Could not load USA client secret - spoke→hub federation may not work"
                log_verbose "  Solution: Ensure Hub deployment generated this secret"
            fi
        fi

        return 0
    else
        log_warn "Only loaded $secrets_loaded/${#SPOKE_REQUIRED_SECRETS[@]} required secrets from GCP"

        # IMPROVED (2026-01-28): Report which GCP secret names failed (not just base names)
        # This makes it clear which instance-suffixed secrets need to be created
        if [ ${#failed_secrets[@]} -gt 0 ]; then
            local missing_gcp_names=()
            for secret in "${failed_secrets[@]}"; do
                local gcp_name=$(_map_env_to_gcp_secret "$secret" "$code_lower")
                missing_gcp_names+=("$gcp_name")
            done

            log_warn "Missing GCP secrets: ${missing_gcp_names[*]}"
            log_verbose "To create missing secrets in GCP, run:"
            for gcp_name in "${missing_gcp_names[@]}"; do
                log_verbose "  gcloud secrets create $gcp_name --project=$project"
                log_verbose "  echo -n 'YOUR_SECRET' | gcloud secrets versions add $gcp_name --data-file=- --project=$project"
            done
        fi

        return 1
    fi
}

##
# Upload secrets to GCP Secret Manager
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_secrets_upload_to_gcp() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local project="${GCP_PROJECT:-dive25}"

    if ! check_gcloud 2>/dev/null; then
        log_warn "GCP not available for secret upload"
        return 1
    fi

    log_info "Uploading secrets to GCP Secret Manager"

    for base_secret in "${SPOKE_REQUIRED_SECRETS[@]}"; do
        local env_var_name="${base_secret}_${code_upper}"
        local secret_value="${!env_var_name}"

        if [ -n "$secret_value" ]; then
            local gcp_secret_name="dive-v3-$(echo "$base_secret" | tr '[:upper:]' '[:lower:]' | tr '_' '-')-${code_lower}"

            # Create secret if it doesn't exist
            if ! gcloud secrets describe "$gcp_secret_name" --project="$project" &>/dev/null; then
                gcloud secrets create "$gcp_secret_name" --project="$project" --replication-policy="automatic" 2>/dev/null
            fi

            # Add new version
            echo -n "$secret_value" | gcloud secrets versions add "$gcp_secret_name" --project="$project" --data-file=- 2>/dev/null
            log_verbose "Uploaded $gcp_secret_name to GCP"
        fi
    done

    log_success "Secrets uploaded to GCP"
    return 0
}

# =============================================================================
# HASHICORP VAULT INTEGRATION
# =============================================================================

##
# Map environment variable name to Vault path
# Arguments:
#   $1 - Environment variable name (e.g., POSTGRES_PASSWORD)
#   $2 - Instance code (e.g., deu)
# Returns:
#   Vault category and path as "category:path:field"
##
_map_env_to_vault_path() {
    local env_var="$1"
    local instance_code="$2"

    case "$env_var" in
        POSTGRES_PASSWORD)     echo "core:${instance_code}/postgres:password" ;;
        MONGO_PASSWORD)        echo "core:${instance_code}/mongodb:password" ;;
        REDIS_PASSWORD)        echo "core:${instance_code}/redis:password" ;;
        KEYCLOAK_ADMIN_PASSWORD) echo "core:${instance_code}/keycloak-admin:password" ;;
        KEYCLOAK_CLIENT_SECRET)  echo "auth:${instance_code}/keycloak-client:secret" ;;
        AUTH_SECRET)           echo "auth:${instance_code}/nextauth:secret" ;;
        JWT_SECRET)            echo "auth:${instance_code}/jwt:secret" ;;
        NEXTAUTH_SECRET)       echo "auth:${instance_code}/nextauth-explicit:secret" ;;
        OPAL_TOKEN)            echo "opal:master-token:token" ;;
        *)                     echo "" ;;
    esac
}

##
# Load secrets from HashiCorp Vault
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_secrets_load_from_vault() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    # CLI runs on host — use VAULT_CLI_ADDR (host-accessible) over VAULT_ADDR (Docker-internal)
    if [ -n "${VAULT_CLI_ADDR:-}" ]; then
        export VAULT_ADDR="$VAULT_CLI_ADDR"
    fi

    # Authenticate with AppRole if credentials available
    if [ -n "${VAULT_ROLE_ID:-}" ] && [ -n "${VAULT_SECRET_ID:-}" ]; then
        vault_approle_login "$VAULT_ROLE_ID" "$VAULT_SECRET_ID" || true
    fi

    # Check Vault availability
    if ! vault_is_authenticated; then
        log_verbose "Vault not available for secret loading"
        return 1
    fi

    local secrets_loaded=0
    local secrets_failed=0
    local failed_secrets=()

    log_verbose "Loading secrets from Vault"

    # Load each required secret
    for base_secret in "${SPOKE_REQUIRED_SECRETS[@]}"; do
        local vault_mapping=$(_map_env_to_vault_path "$base_secret" "$code_lower")
        local env_var_name="${base_secret}_${code_upper}"

        if [ -z "$vault_mapping" ]; then
            secrets_failed=$((secrets_failed + 1))
            failed_secrets+=("$base_secret")
            continue
        fi

        # Parse category:path:field
        local category="${vault_mapping%%:*}"
        local rest="${vault_mapping#*:}"
        local path="${rest%%:*}"
        local field="${rest#*:}"

        local secret_value
        secret_value=$(vault_get_secret "$category" "$path" "$field" 2>/dev/null)

        if [ -n "$secret_value" ]; then
            export "${env_var_name}=${secret_value}"
            secrets_loaded=$((secrets_loaded + 1))
            log_verbose "Loaded $env_var_name from Vault ($category/$path)"
        else
            # Try shared path fallback
            local shared_path="shared/${path##*/}"
            secret_value=$(vault_get_secret "$category" "$shared_path" "$field" 2>/dev/null)

            if [ -n "$secret_value" ]; then
                export "${env_var_name}=${secret_value}"
                secrets_loaded=$((secrets_loaded + 1))
                log_verbose "Loaded $env_var_name from shared Vault path"
            else
                secrets_failed=$((secrets_failed + 1))
                failed_secrets+=("$base_secret")
                log_verbose "Vault secret not found: $category/$path"
            fi
        fi
    done

    # Load optional secrets (don't fail if missing)
    for base_secret in "${SPOKE_OPTIONAL_SECRETS[@]}"; do
        local vault_mapping=$(_map_env_to_vault_path "$base_secret" "$code_lower")
        local env_var_name="${base_secret}_${code_upper}"

        if [ -z "$vault_mapping" ]; then
            continue
        fi

        local category="${vault_mapping%%:*}"
        local rest="${vault_mapping#*:}"
        local path="${rest%%:*}"
        local field="${rest#*:}"

        local secret_value
        secret_value=$(vault_get_secret "$category" "$path" "$field" 2>/dev/null)

        if [ -n "$secret_value" ]; then
            export "${env_var_name}=${secret_value}"
            log_verbose "Loaded optional $env_var_name from Vault"
        fi
    done

    # Set base variable names (without instance suffix) for compatibility
    for base_secret in "${SPOKE_REQUIRED_SECRETS[@]}"; do
        local env_var_name="${base_secret}_${code_upper}"
        if [ -n "${!env_var_name:-}" ]; then
            local value="${!env_var_name:-}"
            export "${base_secret}=${value}"
        fi
    done

    if [ $secrets_loaded -ge ${#SPOKE_REQUIRED_SECRETS[@]} ]; then
        log_info "Loaded $secrets_loaded secrets from Vault"

        # Load USA client secret for federation (spokes only)
        if [ "$code_upper" != "USA" ]; then
            log_verbose "Loading USA client secret for federation..."

            local usa_client_secret
            usa_client_secret=$(vault_get_secret "auth" "usa/keycloak-client" "secret" 2>/dev/null)

            # Fallback to shared
            if [ -z "$usa_client_secret" ]; then
                usa_client_secret=$(vault_get_secret "auth" "shared/keycloak-client" "secret" 2>/dev/null)
            fi

            if [ -n "$usa_client_secret" ]; then
                export "KEYCLOAK_CLIENT_SECRET_USA=${usa_client_secret}"
                log_verbose "Loaded KEYCLOAK_CLIENT_SECRET_USA for federation"
            else
                log_warn "Could not load USA client secret - spoke→hub federation may not work"
            fi
        fi

        return 0
    else
        log_warn "Only loaded $secrets_loaded/${#SPOKE_REQUIRED_SECRETS[@]} required secrets from Vault"

        if [ ${#failed_secrets[@]} -gt 0 ]; then
            log_warn "Missing Vault secrets: ${failed_secrets[*]}"
            log_verbose "Ensure secrets are migrated with: ./scripts/migrate-secrets-gcp-to-vault.sh"
        fi

        return 1
    fi
}

##
# Upload secrets to HashiCorp Vault
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_secrets_upload_to_vault() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    if ! vault_is_authenticated; then
        log_warn "Vault not available for secret upload"
        return 1
    fi

    log_info "Uploading secrets to HashiCorp Vault"

    for base_secret in "${SPOKE_REQUIRED_SECRETS[@]}"; do
        local env_var_name="${base_secret}_${code_upper}"
        local secret_value="${!env_var_name}"

        if [ -n "$secret_value" ]; then
            local vault_mapping=$(_map_env_to_vault_path "$base_secret" "$code_lower")
            if [ -z "$vault_mapping" ]; then
                continue
            fi

            local category="${vault_mapping%%:*}"
            local rest="${vault_mapping#*:}"
            local path="${rest%%:*}"
            local field="${rest#*:}"

            local json_value="{\"${field}\":\"${secret_value}\"}"
            vault_set_secret "$category" "$path" "$json_value"
            log_verbose "Uploaded $base_secret to Vault ($category/$path)"
        fi
    done

    log_success "Secrets uploaded to Vault"
    return 0
}

# =============================================================================
# LOCAL .ENV FILE INTEGRATION
# =============================================================================

##
# Load secrets from .env file
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success (all required secrets loaded)
#   1 - Failure (missing required secrets)
##
spoke_secrets_load_from_env() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local env_file="$spoke_dir/.env"

    # USA/hub secrets: prefer .env.hub (SSOT) over instances/usa/.env
    if [ "$code_upper" = "USA" ] && [ -f "${DIVE_ROOT}/.env.hub" ]; then
        env_file="${DIVE_ROOT}/.env.hub"
        log_verbose "USA instance: using .env.hub as secrets source"
    fi

    if [ ! -f "$env_file" ]; then
        log_verbose "No .env file found at: $env_file"
        return 1
    fi

    log_verbose "Loading secrets from: $env_file"

    # Source the .env file (preserve Hub URL vars from being clobbered by stale .env)
    local _save_hub_api="${HUB_API_URL:-}" _save_hub_kc="${HUB_KC_URL:-}"
    local _save_hub_opal="${HUB_OPAL_URL:-}" _save_hub_vault="${HUB_VAULT_URL:-}"
    local _save_hub_ext="${HUB_EXTERNAL_ADDRESS:-}" _save_deploy_mode="${DEPLOYMENT_MODE:-}"
    set -a
    source "$env_file"
    set +a
    # Restore Hub URL vars (env exports take priority over stale .env values)
    [ -n "$_save_hub_api" ] && export HUB_API_URL="$_save_hub_api"
    [ -n "$_save_hub_kc" ] && export HUB_KC_URL="$_save_hub_kc"
    [ -n "$_save_hub_opal" ] && export HUB_OPAL_URL="$_save_hub_opal"
    [ -n "$_save_hub_vault" ] && export HUB_VAULT_URL="$_save_hub_vault"
    [ -n "$_save_hub_ext" ] && export HUB_EXTERNAL_ADDRESS="$_save_hub_ext"
    [ -n "$_save_deploy_mode" ] && export DEPLOYMENT_MODE="$_save_deploy_mode"

    # Check if required secrets are loaded
    local missing_secrets=()

    for base_secret in "${SPOKE_REQUIRED_SECRETS[@]}"; do
        local env_var_name="${base_secret}_${code_upper}"
        local value="${!env_var_name:-}"

        if [ -z "$value" ]; then
            # Try without instance suffix
            value="${!base_secret}"
            if [ -n "$value" ]; then
                export "${env_var_name}=${value}"
            fi
        fi

        if [ -z "${!env_var_name}" ]; then
            missing_secrets+=("$env_var_name")
        fi
    done

    if [ ${#missing_secrets[@]} -gt 0 ]; then
        log_warn "Missing secrets from .env: ${missing_secrets[*]}"
        return 1
    fi

    log_info "Loaded ${#SPOKE_REQUIRED_SECRETS[@]} secrets from .env"
    return 0
}

##
# Sync secrets to .env file
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
##
spoke_secrets_sync_to_env() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local env_file="$spoke_dir/.env"

    # Ensure directory exists
    mkdir -p "$spoke_dir"

    # Create backup if file exists
    if [ -f "$env_file" ]; then
        cp "$env_file" "${env_file}.bak.$(date +%Y%m%d-%H%M%S)"
    fi

    log_verbose "Syncing secrets to: $env_file"

    # Update or add each secret
    for base_secret in "${SPOKE_REQUIRED_SECRETS[@]}"; do
        local env_var_name="${base_secret}_${code_upper}"
        local value="${!env_var_name:-}"

        if [ -n "$value" ]; then
            if [ -f "$env_file" ] && grep -q "^${env_var_name}=" "$env_file"; then
                # Update existing
                sed -i.tmp "s|^${env_var_name}=.*|${env_var_name}=${value}|" "$env_file"
                rm -f "${env_file}.tmp"
            else
                # Append new
                echo "${env_var_name}=${value}" >> "$env_file"
            fi
        fi
    done

    # ==========================================================================
    # SHARED BLACKLIST REDIS PASSWORD (ACP-240 Cross-Instance Token Revocation)
    # ==========================================================================
    # This secret is shared across all instances (Hub + all spokes) for
    # federation-wide token revocation. Load from Hub's .env or GCP.
    # ==========================================================================
    local blacklist_password=""

    # Try to load from Hub's .env first (local development)
    if [ -f "${DIVE_ROOT}/.env.hub" ]; then
        blacklist_password=$(grep "^REDIS_PASSWORD_BLACKLIST=" "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d'=' -f2)
    fi

    # Try GCP if not found locally
    if [ -z "$blacklist_password" ] && check_gcloud 2>/dev/null; then
        blacklist_password=$(gcloud secrets versions access latest --secret="dive-v3-redis-blacklist" --project="${GCP_PROJECT:-dive25}" 2>/dev/null || true)
    fi

    # Sync blacklist password to spoke .env if available
    if [ -n "$blacklist_password" ]; then
        if [ -f "$env_file" ] && grep -q "^REDIS_PASSWORD_BLACKLIST=" "$env_file"; then
            sed -i.tmp "s|^REDIS_PASSWORD_BLACKLIST=.*|REDIS_PASSWORD_BLACKLIST=${blacklist_password}|" "$env_file"
            rm -f "${env_file}.tmp"
        else
            echo "" >> "$env_file"
            echo "# Shared Blacklist Redis (from Hub - for cross-instance token revocation)" >> "$env_file"
            echo "REDIS_PASSWORD_BLACKLIST=${blacklist_password}" >> "$env_file"
        fi
        log_verbose "Synced shared blacklist Redis password"
    else
        log_warn "Could not load shared blacklist Redis password - cross-instance token revocation will be limited"
    fi

    # ==========================================================================
    # OPAL_AUTH_MASTER_TOKEN (Required for OPAL client/server authentication)
    # ==========================================================================
    # CRITICAL FIX (2026-01-28): OPAL master token MUST come from Hub, NOT generated locally
    # Root cause: Each spoke was generating its own token, causing authentication failures
    # Solution: Source token from Hub's .env.hub (SINGLE SOURCE OF TRUTH)
    # ==========================================================================
    if ! grep -q "^OPAL_AUTH_MASTER_TOKEN=" "$env_file" 2>/dev/null; then
        local hub_env_file="${DIVE_ROOT}/.env.hub"
        local opal_token=""

        if [ -f "$hub_env_file" ]; then
            opal_token=$(grep "^OPAL_AUTH_MASTER_TOKEN=" "$hub_env_file" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")

            if [ -n "$opal_token" ]; then
                echo "" >> "$env_file"
                echo "# OPAL Master Token (sourced from Hub - SSOT)" >> "$env_file"
                echo "OPAL_AUTH_MASTER_TOKEN=${opal_token}" >> "$env_file"
                log_verbose "Sourced OPAL_AUTH_MASTER_TOKEN from Hub (SSOT)"
            else
                log_warn "Hub OPAL master token not found in $hub_env_file"
                log_warn "Spokes will not be able to authenticate with Hub OPAL server"
                log_warn "Deploy Hub first to generate the master token"
            fi
        else
            log_warn "Hub .env file not found: $hub_env_file"
            log_warn "Deploy Hub first to generate OPAL master token (SSOT)"
        fi
    fi

    # ==========================================================================
    # CORS CONFIGURATION (Computed from spoke config SSOT)
    # ==========================================================================
    # BEST PRACTICE FIX (2026-02-06): Dynamically compute CORS origins from instance endpoints
    # No hardcoded URLs - derives from spoke config SSOT to ensure consistency
    # ==========================================================================
    if ! grep -q "^ENABLE_FEDERATION_CORS=" "$env_file" 2>/dev/null; then
        echo "" >> "$env_file"
        echo "# CORS Configuration (Federation Mode)" >> "$env_file"
        echo "# Allows cross-origin requests from all federated instances" >> "$env_file"
        echo "# SECURITY: JWT authentication enforces security, not CORS" >> "$env_file"
        echo "ENABLE_FEDERATION_CORS=true" >> "$env_file"
        log_verbose "Enabled federation CORS mode"
    fi

    # Compute CORS_ALLOWED_ORIGINS from SSOT (dynamic, not hardcoded)
    if ! grep -q "^CORS_ALLOWED_ORIGINS=" "$env_file" 2>/dev/null; then
        # Extract all endpoint URLs from spoke_config_get
        local base_url=$(spoke_config_get "$instance_code" "endpoints.baseUrl" "https://localhost:3000")
        local api_url=$(spoke_config_get "$instance_code" "endpoints.apiUrl" "https://localhost:4000")
        local idp_url=$(spoke_config_get "$instance_code" "endpoints.idpUrl" "https://localhost:8443")
        local idp_public_url=$(spoke_config_get "$instance_code" "endpoints.idpPublicUrl")

        # Build CORS origins list (unique values only)
        local cors_origins="$base_url,$api_url,$idp_url"
        [ -n "$idp_public_url" ] && cors_origins="$cors_origins,$idp_public_url"

        # Add Hub URLs for federation
        cors_origins="$cors_origins,https://localhost:3000,https://localhost:4000,https://localhost:8443"

        echo "# Computed from spoke config SSOT (auto-generated)" >> "$env_file"
        echo "CORS_ALLOWED_ORIGINS=${cors_origins}" >> "$env_file"
        log_verbose "Generated CORS_ALLOWED_ORIGINS from spoke config SSOT"
    fi

    # ==========================================================================
    # DATABASE_URL (Required for Frontend PostgreSQL audit persistence)
    # ==========================================================================
    # CLARIFICATION (2026-01-28): This is the PostgreSQL database connection string
    # Used by: Frontend's NextAuth for session management and audit logs
    # Format: postgresql://username:password@host:port/database
    # Instance-specific: Uses POSTGRES_PASSWORD_{INSTANCE} from GCP secrets
    # ==========================================================================
    if ! grep -q "^DATABASE_URL=" "$env_file" 2>/dev/null; then
        local postgres_pass_var="POSTGRES_PASSWORD_${code_upper}"
        local postgres_pass="${!postgres_pass_var:-}"

        if [ -n "$postgres_pass" ]; then
            echo "" >> "$env_file"
            echo "# PostgreSQL Database URL for Frontend NextAuth (audit persistence)" >> "$env_file"
            echo "DATABASE_URL=postgresql://postgres:${postgres_pass}@postgres-${code_lower}:5432/dive_v3?sslmode=require" >> "$env_file"
            log_verbose "Generated DATABASE_URL for Frontend NextAuth (PostgreSQL)"
        else
            log_warn "Cannot generate DATABASE_URL - POSTGRES_PASSWORD_${code_upper} not available"
        fi
    fi

    log_verbose "Secrets synced to .env"
    return 0
}


# Load secret generation, validation & sync functions
source "$(dirname "${BASH_SOURCE[0]}")/spoke-secrets-sync.sh"
