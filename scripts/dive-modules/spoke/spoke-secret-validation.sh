#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Secret Validation Module
# =============================================================================
# Validates that secrets are properly loaded and accessible before deployment
# Prevents deployments with missing or invalid secrets
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Mark this module as loaded
export DIVE_SPOKE_SECRET_VALIDATION_LOADED=1

# =============================================================================
# SECRET VALIDATION FUNCTIONS
# =============================================================================

##
# Validate that all required secrets are loaded
#
# Arguments:
#   $1 - instance code (lowercase)
#
# Returns:
#   0 - All secrets valid
#   1 - Missing or invalid secrets
##
spoke_validate_secrets() {
    local code_lower="${1:-$INSTANCE}"
    if [ -z "$code_lower" ]; then
        log_error "Instance code required. Use --instance <CODE> or provide as parameter"
        return 1
    fi
    local code_lower=$(lower "$code_lower")
    local code_upper=$(upper "$code_lower")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_verbose "Validating secrets for $code_upper..."

    local missing_secrets=()
    local invalid_secrets=()
    local validation_passed=true

    # Required secrets for each instance
    local required_secrets=(
        "POSTGRES_PASSWORD_${code_upper}"
        "MONGO_PASSWORD_${code_upper}"
        "REDIS_PASSWORD_${code_upper}"
        "KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
        "KEYCLOAK_CLIENT_SECRET_${code_upper}"
        "AUTH_SECRET_${code_upper}"
    )

    # Check environment variables
    for secret in "${required_secrets[@]}"; do
        local secret_value="${!secret}"

        if [ -z "$secret_value" ]; then
            missing_secrets+=("$secret")
            validation_passed=false
        else
            # Basic validation for secret strength
            if ! spoke_validate_secret_strength "$secret" "$secret_value"; then
                invalid_secrets+=("$secret")
                validation_passed=false
            fi
        fi
    done

    # Additional validation for JWT secrets (must be base64url compatible)
    local jwt_secret_var="JWT_SECRET_${code_upper}"
    local jwt_secret_value="${!jwt_secret_var}"
    if [ -n "$jwt_secret_value" ]; then
        if ! spoke_validate_jwt_secret "$jwt_secret_value"; then
            invalid_secrets+=("$jwt_secret_var")
            validation_passed=false
        fi
    fi

    # Additional validation for NextAuth secrets
    local nextauth_secret_var="NEXTAUTH_SECRET_${code_upper}"
    local nextauth_secret_value="${!nextauth_secret_var}"
    if [ -n "$nextauth_secret_value" ]; then
        if ! spoke_validate_nextauth_secret "$nextauth_secret_value"; then
            invalid_secrets+=("$nextauth_secret_var")
            validation_passed=false
        fi
    fi

    # Report results
    if [ "${#missing_secrets[@]}" -gt 0 ]; then
        log_error "Missing required secrets:"
        for secret in "${missing_secrets[@]}"; do
            log_error "  ❌ $secret"
        done
        log_error "Run: ./dive secrets load --instance $code_lower"
    fi

    if [ "${#invalid_secrets[@]}" -gt 0 ]; then
        log_error "Invalid secrets (weak or malformed):"
        for secret in "${invalid_secrets[@]}"; do
            log_error "  ❌ $secret"
        done
    fi

    if [ "$validation_passed" = true ]; then
        log_success "All secrets validated successfully"
        return 0
    else
        log_error "Secret validation failed"
        return 1
    fi
}

##
# Validate secret strength and format
#
# Arguments:
#   $1 - secret name
#   $2 - secret value
#
# Returns:
#   0 - Valid
#   1 - Invalid
##
spoke_validate_secret_strength() {
    local secret_name="$1"
    local secret_value="$2"

    # Minimum length requirements
    local min_length=12

    # Check length
    if [ ${#secret_value} -lt $min_length ]; then
        log_warn "Secret $secret_name is too short (${#secret_value} chars, minimum $min_length)"
        return 1
    fi

    # Check for common weak patterns
    case "$secret_name" in
        *"PASSWORD"*|*"SECRET"*)
            # Passwords should not contain common weak patterns
            if [[ "$secret_value" =~ ^(password|admin|secret|123456|qwerty) ]]; then
                log_warn "Secret $secret_name contains common weak pattern"
                return 1
            fi

            # Should contain mix of character types
            if ! [[ "$secret_value" =~ [A-Z] ]] || ! [[ "$secret_value" =~ [a-z] ]] || ! [[ "$secret_value" =~ [0-9] ]]; then
                log_warn "Secret $secret_name should contain uppercase, lowercase, and numeric characters"
                return 1
            fi
            ;;
    esac

    return 0
}

##
# Validate JWT secret (must be base64url compatible)
#
# Arguments:
#   $1 - secret value
#
# Returns:
#   0 - Valid
#   1 - Invalid
##
spoke_validate_jwt_secret() {
    local secret_value="$1"

    # JWT secrets should be base64url compatible (no padding, specific characters)
    if ! [[ "$secret_value" =~ ^[A-Za-z0-9_-]+$ ]]; then
        log_warn "JWT secret contains invalid characters (must be base64url compatible)"
        return 1
    fi

    # Should be sufficiently long for security
    if [ ${#secret_value} -lt 32 ]; then
        log_warn "JWT secret is too short (${#secret_value} chars, recommended 32+)"
        return 1
    fi

    return 0
}

##
# Validate NextAuth secret
#
# Arguments:
#   $1 - secret value
#
# Returns:
#   0 - Valid
#   1 - Invalid
##
spoke_validate_nextauth_secret() {
    local secret_value="$1"

    # NextAuth secrets should be strong random strings
    if [ ${#secret_value} -lt 32 ]; then
        log_warn "NextAuth secret is too short (${#secret_value} chars, recommended 32+)"
        return 1
    fi

    return 0
}

##
# Test secret accessibility in containers
#
# Arguments:
#   $1 - instance code (lowercase)
#
# Returns:
#   0 - All secrets accessible
#   1 - Some secrets not accessible
##
spoke_test_secret_accessibility() {
    local code_lower="$1"
    local code_upper=$(upper "$code_lower")

    log_verbose "Testing secret accessibility in containers..."

    local containers=("backend-${code_lower}" "keycloak-${code_lower}")
    local inaccessible_secrets=()
    local test_passed=true

    for container in "${containers[@]}"; do
        local container_name="dive-spoke-${container}"

        if docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
            log_verbose "Testing secrets in $container_name..."

            # Test critical secrets
            local test_secrets=("KEYCLOAK_ADMIN_PASSWORD" "AUTH_SECRET")

            for secret in "${test_secrets[@]}"; do
                local container_value
                container_value=$(docker exec "$container_name" env | grep "^${secret}=" | cut -d= -f2 | tr -d '\n\r"')

                if [ -z "$container_value" ]; then
                    inaccessible_secrets+=("$container:$secret")
                    test_passed=false
                fi
            done

            # Test instance-specific secrets
            local instance_secrets=("POSTGRES_PASSWORD_${code_upper}" "MONGO_PASSWORD_${code_upper}")

            for secret in "${instance_secrets[@]}"; do
                local container_value
                container_value=$(docker exec "$container_name" env | grep "^${secret}=" | cut -d= -f2 | tr -d '\n\r"')

                if [ -z "$container_value" ]; then
                    inaccessible_secrets+=("$container:$secret")
                    test_passed=false
                fi
            done
        else
            log_verbose "Container $container_name not running, skipping accessibility test"
        fi
    done

    if [ "${#inaccessible_secrets[@]}" -gt 0 ]; then
        log_error "Secrets not accessible in containers:"
        for secret in "${inaccessible_secrets[@]}"; do
            log_error "  ❌ $secret"
        done
        test_passed=false
    fi

    if [ "$test_passed" = true ]; then
        log_verbose "All secrets accessible in containers"
        return 0
    else
        log_error "Secret accessibility test failed"
        return 1
    fi
}

##
# Comprehensive secret validation (combines all checks)
#
# Arguments:
#   $1 - instance code (lowercase)
#
# Returns:
#   0 - All validations passed
#   1 - Some validations failed
##
spoke_validate_secrets_comprehensive() {
    local code_lower="${1:-$INSTANCE}"
    if [ -z "$code_lower" ]; then
        log_error "Instance code required. Use --instance <CODE> or provide as parameter"
        return 1
    fi
    local code_lower=$(lower "$code_lower")

    log_info "Running comprehensive secret validation for $code_lower..."

    local all_passed=true

    # First, ensure secrets are loaded
    if ! check_gcloud || ! load_gcp_secrets "$code_lower" 2>/dev/null; then
        log_warn "Could not load secrets from GCP, checking local .env..."
        local env_file="${DIVE_ROOT}/instances/${code_lower}/.env"
        if [ -f "$env_file" ]; then
            # Source the .env file to load secrets
            set -a
            source "$env_file"
            set +a
            log_info "Loaded secrets from local .env file"
        else
            log_error "No secret source available (GCP or .env)"
            return 1
        fi
    fi

    # 1. Validate secret loading
    if ! spoke_validate_secrets "$code_lower"; then
        all_passed=false
    fi

    # 2. Test secret accessibility (if containers are running)
    local running_count=$(docker ps --filter "name=dive-spoke-${code_lower}" --format '{{.Names}}' | wc -l)
    if [ "$running_count" -gt 0 ]; then
        if ! spoke_test_secret_accessibility "$code_lower"; then
            all_passed=false
        fi
    else
        log_info "Containers not running, skipping accessibility test"
    fi

    if [ "$all_passed" = true ]; then
        log_success "Comprehensive secret validation passed"
        return 0
    else
        log_error "Comprehensive secret validation failed"
        return 1
    fi
}

##
# Generate secret validation report
#
# Arguments:
#   $1 - instance code (lowercase)
##
spoke_generate_secret_report() {
    local code_lower="$1"
    local code_upper=$(upper "$code_lower")
    local report_file="${DIVE_ROOT}/logs/secret-validation-${code_lower}-$(date +%Y%m%d-%H%M%S).log"

    echo "=== DIVE V3 Secret Validation Report ===" > "$report_file"
    echo "Instance: $code_upper ($code_lower)" >> "$report_file"
    echo "Timestamp: $(date)" >> "$report_file"
    echo "" >> "$report_file"

    echo "Environment Variables:" >> "$report_file"
    echo "---------------------" >> "$report_file"

    # List all instance-specific environment variables
    local secrets=(
        "POSTGRES_PASSWORD_${code_upper}"
        "MONGO_PASSWORD_${code_upper}"
        "REDIS_PASSWORD_${code_upper}"
        "KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
        "KEYCLOAK_CLIENT_SECRET_${code_upper}"
        "AUTH_SECRET_${code_upper}"
        "JWT_SECRET_${code_upper}"
        "NEXTAUTH_SECRET_${code_upper}"
    )

    for secret in "${secrets[@]}"; do
        local value="${!secret}"
        if [ -n "$value" ]; then
            local masked_value="${value:0:4}****${value: -4}"
            echo "$secret: $masked_value (length: ${#value})" >> "$report_file"
        else
            echo "$secret: NOT SET" >> "$report_file"
        fi
    done

    echo "" >> "$report_file"
    echo "Container Accessibility:" >> "$report_file"
    echo "-----------------------" >> "$report_file"

    # Test container accessibility
    local containers=("backend-${code_lower}" "keycloak-${code_lower}")
    for container in "${containers[@]}"; do
        local container_name="dive-spoke-${container}"
        echo "Container: $container_name" >> "$report_file"

        if docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
            echo "  Status: Running" >> "$report_file"

            # Check key secrets
            local check_secrets=("KEYCLOAK_ADMIN_PASSWORD" "AUTH_SECRET")
            for secret in "${check_secrets[@]}"; do
                local container_value
                container_value=$(docker exec "$container_name" env 2>/dev/null | grep "^${secret}=" | cut -d= -f2 | tr -d '\n\r"')
                if [ -n "$container_value" ]; then
                    echo "  $secret: Set (length: ${#container_value})" >> "$report_file"
                else
                    echo "  $secret: NOT ACCESSIBLE" >> "$report_file"
                fi
            done
        else
            echo "  Status: Not running" >> "$report_file"
        fi
        echo "" >> "$report_file"
    done

    echo "=== End Report ===" >> "$report_file"

    log_info "Secret validation report saved to: $report_file"
}

# =============================================================================
# INTEGRATION FUNCTIONS
# =============================================================================

##
# Enhanced secret loading with validation
#
# Arguments:
#   $1 - instance code (lowercase)
#
# Returns:
#   0 - Secrets loaded and validated
#   1 - Failed to load or validate secrets
##
spoke_load_and_validate_secrets() {
    local code_lower="$1"

    log_verbose "Loading and validating secrets for $code_lower..."

    # First try to load from GCP
    local load_success=false
    if check_gcloud && load_gcp_secrets "$code_lower" 2>/dev/null; then
        log_verbose "Loaded secrets from GCP Secret Manager"
        load_success=true
    elif [ -f "${DIVE_ROOT}/instances/${code_lower}/.env" ]; then
        log_verbose "Loading secrets from local .env file"
        # Secrets should already be loaded by sourcing .env earlier
        load_success=true
    else
        log_error "No secret source available (GCP or .env)"
        return 1
    fi

    # Validate the loaded secrets
    if ! spoke_validate_secrets_comprehensive "$code_lower"; then
        log_error "Secret validation failed"
        spoke_generate_secret_report "$code_lower"
        return 1
    fi

    log_success "Secrets loaded and validated successfully"
    return 0
}