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
if [ -n "$SPOKE_SECRETS_LOADED" ]; then
    return 0
fi
export SPOKE_SECRETS_LOADED=1

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../../common.sh"
    export DIVE_COMMON_LOADED=1
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

    log_step "Loading secrets for $code_upper (SSOT: GCP Secret Manager)"

    case "$mode" in
        load)
            # Try GCP first (SSOT)
            if spoke_secrets_load_from_gcp "$instance_code"; then
                log_success "Loaded secrets from GCP Secret Manager"
                spoke_secrets_sync_to_env "$instance_code"
                return 0
            fi

            # Fallback to .env
            if spoke_secrets_load_from_env "$instance_code"; then
                log_warn "Using .env secrets (GCP unavailable) - may be stale"
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

                # Upload to GCP if available
                if check_gcloud 2>/dev/null; then
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
##
_map_env_to_gcp_secret() {
    local env_var="$1"
    local instance_code="$2"

    case "$env_var" in
        POSTGRES_PASSWORD)
            echo "dive-v3-postgres-${instance_code}"
            ;;
        MONGO_PASSWORD)
            echo "dive-v3-mongodb-${instance_code}"
            ;;
        REDIS_PASSWORD)
            echo "dive-v3-redis-${instance_code}"
            ;;
        KEYCLOAK_ADMIN_PASSWORD)
            echo "dive-v3-keycloak-${instance_code}"
            ;;
        KEYCLOAK_CLIENT_SECRET)
            echo "dive-v3-client-secret-${instance_code}"
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
        local value="${!env_var_name}"
        if [ -n "$value" ]; then
            export "${base_secret}=${value}"
        fi
    done

    if [ $secrets_loaded -ge ${#SPOKE_REQUIRED_SECRETS[@]} ]; then
        log_info "Loaded $secrets_loaded secrets from GCP"
        return 0
    else
        log_warn "Only loaded $secrets_loaded/${#SPOKE_REQUIRED_SECRETS[@]} required secrets from GCP"
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

    if [ ! -f "$env_file" ]; then
        log_verbose "No .env file found at: $env_file"
        return 1
    fi

    log_verbose "Loading secrets from: $env_file"

    # Source the .env file
    set -a
    source "$env_file"
    set +a

    # Check if required secrets are loaded
    local missing_secrets=()

    for base_secret in "${SPOKE_REQUIRED_SECRETS[@]}"; do
        local env_var_name="${base_secret}_${code_upper}"
        local value="${!env_var_name}"

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
        local value="${!env_var_name}"

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

    log_verbose "Secrets synced to .env"
    return 0
}

# =============================================================================
# SECRET GENERATION
# =============================================================================

##
# Generate new secrets for an instance
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
##
spoke_secrets_generate() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")

    log_info "Generating new secrets for $code_upper"

    # Generate each required secret
    local POSTGRES_PASSWORD_NEW=$(openssl rand -base64 16 | tr -d '/+=')
    local MONGO_PASSWORD_NEW=$(openssl rand -base64 16 | tr -d '/+=')
    local REDIS_PASSWORD_NEW=$(openssl rand -base64 16 | tr -d '/+=')
    local KEYCLOAK_ADMIN_PASSWORD_NEW=$(openssl rand -base64 16 | tr -d '/+=')
    local KEYCLOAK_CLIENT_SECRET_NEW=$(openssl rand -base64 24 | tr -d '/+=')
    local AUTH_SECRET_NEW=$(openssl rand -base64 32)

    # Export with instance suffix (SINGLE SOURCE OF TRUTH)
    # Docker compose templates use: ${POSTGRES_PASSWORD_NZL} format
    export "POSTGRES_PASSWORD_${code_upper}=${POSTGRES_PASSWORD_NEW}"
    export "MONGO_PASSWORD_${code_upper}=${MONGO_PASSWORD_NEW}"
    export "REDIS_PASSWORD_${code_upper}=${REDIS_PASSWORD_NEW}"
    export "KEYCLOAK_ADMIN_PASSWORD_${code_upper}=${KEYCLOAK_ADMIN_PASSWORD_NEW}"
    export "KEYCLOAK_CLIENT_SECRET_${code_upper}=${KEYCLOAK_CLIENT_SECRET_NEW}"
    export "AUTH_SECRET_${code_upper}=${AUTH_SECRET_NEW}"

    # Generate optional secrets
    export "JWT_SECRET_${code_upper}=$(openssl rand -base64 32 | tr -d '/+=')"
    export "NEXTAUTH_SECRET_${code_upper}=$(openssl rand -base64 32)"

    log_success "Generated ${#SPOKE_REQUIRED_SECRETS[@]} new secrets"
    return 0
}

# =============================================================================
# SECRET VALIDATION
# =============================================================================

##
# Validate that all required secrets are loaded and meet strength requirements
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - All secrets valid
#   1 - Validation failed
##
spoke_secrets_validate() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")

    log_verbose "Validating secrets for $code_upper"

    local missing_secrets=()
    local weak_secrets=()

    for base_secret in "${SPOKE_REQUIRED_SECRETS[@]}"; do
        local env_var_name="${base_secret}_${code_upper}"
        local value="${!env_var_name}"

        # Check if set
        if [ -z "$value" ]; then
            missing_secrets+=("$env_var_name")
            continue
        fi

        # Check strength
        local min_length=$SPOKE_SECRET_MIN_LENGTH
        if [[ "$base_secret" == "AUTH_SECRET" ]] || [[ "$base_secret" == *"JWT"* ]]; then
            min_length=$SPOKE_AUTH_SECRET_MIN_LENGTH
        fi

        if [ ${#value} -lt $min_length ]; then
            weak_secrets+=("$env_var_name (${#value} chars, min $min_length)")
        fi

        # Check for common weak patterns
        if [[ "$value" =~ ^(password|admin|secret|123456|qwerty) ]]; then
            weak_secrets+=("$env_var_name (common weak pattern)")
        fi
    done

    # Report results
    if [ ${#missing_secrets[@]} -gt 0 ]; then
        log_error "Missing required secrets: ${missing_secrets[*]}"
    fi

    if [ ${#weak_secrets[@]} -gt 0 ]; then
        log_warn "Weak secrets detected: ${weak_secrets[*]}"
    fi

    if [ ${#missing_secrets[@]} -eq 0 ] && [ ${#weak_secrets[@]} -eq 0 ]; then
        log_success "All secrets validated successfully"
        return 0
    else
        orch_record_error "$SPOKE_ERROR_SECRET_VALIDATION" "$ORCH_SEVERITY_HIGH" \
            "Secret validation failed for $code_upper" "secrets" \
            "$(spoke_error_get_remediation $SPOKE_ERROR_SECRET_VALIDATION $instance_code)"
        return 1
    fi
}

# =============================================================================
# SECRET SYNCHRONIZATION
# =============================================================================

##
# Synchronize secrets between components (Keycloak, frontend, etc.)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_secrets_sync() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Synchronizing secrets for $code_upper"

    # Step 1: Ensure secrets are loaded
    if ! spoke_secrets_load "$instance_code"; then
        return 1
    fi

    # Step 2: Sync to .env file
    spoke_secrets_sync_to_env "$instance_code" || return 1

    # Step 3: Sync Keycloak client secret
    spoke_secrets_sync_keycloak_client "$instance_code" || return 1

    # Step 4: Sync federation secrets (if Hub is available)
    spoke_secrets_sync_federation "$instance_code" || true  # Non-blocking

    log_success "Secret synchronization complete"
    return 0
}

##
# Sync Keycloak client secret with frontend configuration
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_secrets_sync_keycloak_client() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local env_file="$spoke_dir/.env"

    local kc_container="dive-spoke-${code_lower}-keycloak"

    # Check if Keycloak container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        log_verbose "Keycloak container not running, skipping client secret sync"
        return 0
    fi

    log_verbose "Syncing Keycloak client secret"

    # Get admin password
    local kc_pass
    kc_pass=$(docker exec "$kc_container" printenv KC_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    if [ -z "$kc_pass" ]; then
        kc_pass=$(docker exec "$kc_container" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    fi

    if [ -z "$kc_pass" ]; then
        log_warn "Cannot get Keycloak admin password"
        return 1
    fi

    # Get admin token
    local admin_token
    admin_token=$(docker exec "$kc_container" curl -sf \
        -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "username=admin" \
        -d "password=${kc_pass}" \
        -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

    if [ -z "$admin_token" ]; then
        log_warn "Cannot get Keycloak admin token"
        return 1
    fi

    # Get client secret from Keycloak
    local realm_name="dive-v3-broker-${code_lower}"
    local client_id="dive-v3-broker-${code_lower}"

    # Get client UUID
    local client_uuid
    client_uuid=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $admin_token" \
        "http://localhost:8080/admin/realms/${realm_name}/clients?clientId=${client_id}" 2>/dev/null | \
        grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

    if [ -z "$client_uuid" ]; then
        log_verbose "Client not found: $client_id"
        return 0
    fi

    # Get actual client secret
    local actual_secret
    actual_secret=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $admin_token" \
        "http://localhost:8080/admin/realms/${realm_name}/clients/${client_uuid}/client-secret" 2>/dev/null | \
        grep -o '"value":"[^"]*' | cut -d'"' -f4)

    if [ -n "$actual_secret" ]; then
        # Update environment and .env file
        export "KEYCLOAK_CLIENT_SECRET_${code_upper}=${actual_secret}"
        export "AUTH_KEYCLOAK_SECRET_${code_upper}=${actual_secret}"

        if [ -f "$env_file" ]; then
            sed -i.tmp "s|^KEYCLOAK_CLIENT_SECRET_${code_upper}=.*|KEYCLOAK_CLIENT_SECRET_${code_upper}=${actual_secret}|" "$env_file"
            sed -i.tmp "s|^AUTH_KEYCLOAK_SECRET_${code_upper}=.*|AUTH_KEYCLOAK_SECRET_${code_upper}=${actual_secret}|" "$env_file"
            rm -f "${env_file}.tmp"
        fi

        log_success "Keycloak client secret synchronized"
    fi

    return 0
}

##
# Sync federation secrets between Hub and Spoke
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_secrets_sync_federation() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    # Check if Hub is running
    local hub_kc_container="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
    if ! docker ps --format '{{.Names}}' | grep -q "^${hub_kc_container}$"; then
        log_verbose "Hub Keycloak not running, skipping federation secret sync"
        return 0
    fi

    log_verbose "Syncing federation secrets with Hub"

    # Load federation sync module if available
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/federation-setup.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/federation-setup.sh" 2>/dev/null || true

        if type sync_hub_to_spoke_secrets &>/dev/null; then
            sync_hub_to_spoke_secrets "$code_upper" 2>/dev/null || true
        fi
    fi

    log_verbose "Federation secret sync complete"
    return 0
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

##
# Test secret accessibility in running containers
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - All secrets accessible
#   1 - Some secrets not accessible
##
spoke_secrets_test_accessibility() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_verbose "Testing secret accessibility in containers"

    local containers=("backend-${code_lower}" "keycloak-${code_lower}")
    local test_passed=true

    for service in "${containers[@]}"; do
        local container_name="dive-spoke-${service}"

        if docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
            # Check if container has required env vars
            for secret in "POSTGRES_PASSWORD" "AUTH_SECRET"; do
                local value
                value=$(docker exec "$container_name" env 2>/dev/null | grep "^${secret}=" | cut -d= -f2)

                if [ -z "$value" ]; then
                    log_warn "Secret $secret not accessible in $container_name"
                    test_passed=false
                fi
            done
        fi
    done

    if [ "$test_passed" = true ]; then
        log_verbose "All secrets accessible in containers"
        return 0
    else
        return 1
    fi
}

##
# Generate a secret validation report
#
# Arguments:
#   $1 - Instance code
##
spoke_secrets_generate_report() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local report_file="${DIVE_ROOT}/logs/secret-validation-${code_lower}-$(date +%Y%m%d-%H%M%S).log"

    mkdir -p "${DIVE_ROOT}/logs"

    {
        echo "=== DIVE V3 Secret Validation Report ==="
        echo "Instance: $code_upper"
        echo "Timestamp: $(date)"
        echo ""
        echo "Required Secrets:"

        for base_secret in "${SPOKE_REQUIRED_SECRETS[@]}"; do
            local env_var_name="${base_secret}_${code_upper}"
            local value="${!env_var_name}"

            if [ -n "$value" ]; then
                local masked="${value:0:4}****${value: -4}"
                echo "  $env_var_name: $masked (length: ${#value})"
            else
                echo "  $env_var_name: NOT SET"
            fi
        done

        echo ""
        echo "Optional Secrets:"

        for base_secret in "${SPOKE_OPTIONAL_SECRETS[@]}"; do
            local env_var_name="${base_secret}_${code_upper}"
            local value="${!env_var_name}"

            if [ -n "$value" ]; then
                echo "  $env_var_name: SET (length: ${#value})"
            else
                echo "  $env_var_name: NOT SET"
            fi
        done

        echo ""
        echo "=== End Report ==="
    } > "$report_file"

    log_info "Secret report saved to: $report_file"
}
