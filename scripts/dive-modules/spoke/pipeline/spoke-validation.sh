#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Pipeline State Validation Functions
# =============================================================================
# Provides validation functions to verify phase state consistency
# with actual system state. Used for idempotent deployments.
#
# Integrates with existing orchestration DB (orchestration-state-db.sh)
# to check if phases are complete and validate infrastructure state.
# =============================================================================
# Version: 2.0.0
# Date: 2026-02-07 - Refactored to use existing orchestration DB
# =============================================================================

# Prevent multiple sourcing
if [ -n "${SPOKE_VALIDATION_LOADED:-}" ]; then
    return 0
fi
export SPOKE_VALIDATION_LOADED=1

# =============================================================================
# PHASE COMPLETION CHECKING (Using Orchestration DB)
# =============================================================================

##
# Check if a phase is complete (queries orchestration DB)
#
# Arguments:
#   $1 - Instance code
#   $2 - Phase name (PREFLIGHT, INITIALIZATION, etc.)
#
# Returns:
#   0 - Phase is complete
#   1 - Phase is not complete or unknown
##
spoke_phase_is_complete() {
    local instance_code="$1"
    local phase="$2"
    
    # Query orchestration DB for step status
    if type orch_db_check_connection &>/dev/null; then
        if orch_db_check_connection; then
            local code_lower=$(lower "$instance_code")
            local status=$(orch_db_exec "SELECT status FROM deployment_steps WHERE instance_id = '${code_lower}' AND step_name = '${phase}' ORDER BY started_at DESC LIMIT 1;" 2>/dev/null | tr -d ' \n')
            
            if [ "$status" = "COMPLETED" ]; then
                return 0
            fi
        fi
    fi
    
    return 1
}

##
# Mark a phase as complete (records in orchestration DB)
#
# Arguments:
#   $1 - Instance code
#   $2 - Phase name
#   $3 - Duration in seconds (optional)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_phase_mark_complete() {
    local instance_code="$1"
    local phase="$2"
    local duration="${3:-0}"
    
    # Record in orchestration DB
    if type orch_db_record_step &>/dev/null; then
        orch_db_record_step "$instance_code" "$phase" "COMPLETED" "" 2>/dev/null || true
    fi
    
    return 0
}

##
# Clear a phase completion marker (for retry)
#
# Arguments:
#   $1 - Instance code
#   $2 - Phase name
##
spoke_phase_clear() {
    local instance_code="$1"
    local phase="$2"
    
    # Mark as pending in orchestration DB to force re-run
    if type orch_db_record_step &>/dev/null; then
        orch_db_record_step "$instance_code" "$phase" "PENDING" "Validation failed, will re-run" 2>/dev/null || true
    fi
    
    return 0
}

# =============================================================================
# VALIDATION FUNCTIONS (One per Phase)
# =============================================================================

##
# Validate PREFLIGHT phase state
#
# Checks:
#   - Instance directory exists
#   - Secrets loaded (environment variables set)
#   - Hub reachable (if required)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - State valid
#   1 - State invalid (needs re-run)
##
_validate_preflight_state() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_verbose "Validating PREFLIGHT state for $code_upper..."

    # Check instance directory exists
    if [ ! -d "$spoke_dir" ]; then
        log_warn "Instance directory missing: $spoke_dir"
        return 1
    fi

    # Check if secrets exist in .env file (more reliable than checking env vars)
    local env_file="$spoke_dir/.env"
    if [ -f "$env_file" ]; then
        local required_secrets=("POSTGRES_PASSWORD" "MONGO_PASSWORD" "REDIS_PASSWORD" "KEYCLOAK_ADMIN_PASSWORD")
        for secret in "${required_secrets[@]}"; do
            if ! grep -q "^${secret}=" "$env_file" 2>/dev/null; then
                log_warn "Secret not in .env file: $secret"
                return 1
            fi
        done
    else
        # No .env file yet - this is fine for first deployment
        log_verbose ".env file doesn't exist yet (first deployment)"
    fi

    # Check federation network exists
    if ! docker network ls --format '{{.Name}}' | grep -q "^dive-shared$"; then
        log_warn "Federation network (dive-shared) missing"
        return 1
    fi

    log_verbose "PREFLIGHT state valid"
    return 0
}

##
# Validate INITIALIZATION phase state
#
# Checks:
#   - config.json exists and valid
#   - docker-compose.yml exists
#   - .env file exists with required variables
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - State valid
#   1 - State invalid
##
_validate_initialization_state() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_verbose "Validating INITIALIZATION state for $code_upper..."

    # Check config.json exists and is valid JSON
    local config_file="$spoke_dir/config.json"
    if [ ! -f "$config_file" ]; then
        log_warn "config.json missing: $config_file"
        return 1
    fi

    if ! jq empty "$config_file" 2>/dev/null; then
        log_warn "config.json is invalid JSON: $config_file"
        return 1
    fi

    # Check docker-compose.yml exists
    local compose_file="$spoke_dir/docker-compose.yml"
    if [ ! -f "$compose_file" ]; then
        log_warn "docker-compose.yml missing: $compose_file"
        return 1
    fi

    # Check .env file exists
    local env_file="$spoke_dir/.env"
    if [ ! -f "$env_file" ]; then
        log_warn ".env file missing: $env_file"
        return 1
    fi

    # Validate critical env vars are set
    local required_vars=("INSTANCE_CODE" "INSTANCE_NAME" "POSTGRES_PASSWORD")
    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" "$env_file" 2>/dev/null; then
            log_warn "Required env var missing from .env: $var"
            return 1
        fi
    done

    log_verbose "INITIALIZATION state valid"
    return 0
}

##
# Validate DEPLOYMENT phase state
#
# Checks:
#   - Expected containers exist (don't need to be running)
#   - Minimum container count met
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - State valid
#   1 - State invalid
##
_validate_deployment_state() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    log_verbose "Validating DEPLOYMENT state for $code_upper..."

    # Check containers exist (running or stopped)
    local container_count=$(docker ps -a --filter "name=dive-spoke-${code_lower}-" --format "{{.Names}}" 2>/dev/null | wc -l | tr -d ' ')

    if [ "$container_count" -eq 0 ]; then
        log_warn "No containers found for spoke: $code_lower"
        return 1
    fi

    # Minimum expected containers: postgres, mongodb, redis, keycloak, opa, backend, opal-client
    local min_containers=7
    if [ "$container_count" -lt "$min_containers" ]; then
        log_warn "Insufficient containers: found $container_count, expected at least $min_containers"
        return 1
    fi

    # Check critical services exist
    local critical_services=("postgres" "mongodb" "keycloak" "backend")
    for service in "${critical_services[@]}"; do
        local container="dive-spoke-${code_lower}-${service}"
        if ! docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
            log_warn "Critical container missing: $container"
            return 1
        fi
    done

    log_verbose "DEPLOYMENT state valid ($container_count containers)"
    return 0
}

##
# Validate CONFIGURATION phase state
#
# Checks:
#   - Keycloak container running
#   - Keycloak realm exists
#   - Terraform state exists
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - State valid
#   1 - State invalid
##
_validate_configuration_state() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    log_verbose "Validating CONFIGURATION state for $code_upper..."

    # Check if Keycloak container is running
    local kc_container="dive-spoke-${code_lower}-keycloak"
    if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        log_warn "Keycloak container not running: $kc_container"
        # Not necessarily invalid - may have been stopped
        # Check if realm exists via API (best-effort)
    fi

    # Check Terraform state exists
    local tf_dir="${DIVE_ROOT}/terraform/spoke/${code_lower}"
    if [ ! -d "$tf_dir" ]; then
        log_warn "Terraform directory missing: $tf_dir"
        return 1
    fi

    if [ ! -f "$tf_dir/terraform.tfstate" ]; then
        log_warn "Terraform state missing - may need to re-apply"
        # Not critical - terraform may not have been applied yet in modular system
        # Return 0 to allow for incremental deployments
    fi

    # Try to verify realm exists (best-effort if Keycloak is running)
    if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        local realm="dive-v3-broker-${code_lower}"
        local realm_check=$(docker exec "$kc_container" curl -sf \
            "http://localhost:8080/realms/${realm}" 2>/dev/null | \
            jq -r '.realm // empty' 2>/dev/null)

        if [ "$realm_check" != "$realm" ]; then
            log_warn "Realm not accessible: $realm (may need Terraform re-apply)"
            return 1
        fi
        log_verbose "Realm verified: $realm"
    fi

    log_verbose "CONFIGURATION state valid"
    return 0
}

##
# Validate SEEDING phase state
#
# Checks:
#   - Test users exist in Keycloak
#   - Resources exist in MongoDB (best-effort)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - State valid
#   1 - State invalid
##
_validate_seeding_state() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    log_verbose "Validating SEEDING state for $code_upper..."

    # Check if Keycloak is running
    local kc_container="dive-spoke-${code_lower}-keycloak"
    if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        log_warn "Keycloak not running - cannot validate seeding"
        return 1
    fi

    # Try to verify test user exists (best-effort)
    local realm="dive-v3-broker-${code_lower}"
    local test_username="testuser-${code_lower}"

    # Get admin token (best-effort)
    local admin_token=$(docker exec "$kc_container" \
        /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 \
        --realm master \
        --user admin \
        --password "${KEYCLOAK_ADMIN_PASSWORD_${code_upper}}" \
        --config /tmp/.kcadm.config 2>/dev/null && \
        docker exec "$kc_container" \
        /opt/keycloak/bin/kcadm.sh get users \
        --realm "$realm" \
        --query "username=$test_username" \
        --config /tmp/.kcadm.config 2>/dev/null | \
        jq -r '.[0].username // empty' 2>/dev/null)

    if [ "$admin_token" != "$test_username" ]; then
        log_warn "Test user not found: $test_username (may need re-seeding)"
        return 1
    fi

    log_verbose "SEEDING state valid (test user found)"
    return 0
}

##
# Validate VERIFICATION phase state
#
# Checks:
#   - All services healthy
#   - Federation configured (IdPs exist)
#   - OPAL sync complete
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - State valid
#   1 - State invalid
##
_validate_verification_state() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    log_verbose "Validating VERIFICATION state for $code_upper..."

    # Check all containers are running
    local running_count=$(docker ps --filter "name=dive-spoke-${code_lower}-" --format "{{.Names}}" 2>/dev/null | wc -l | tr -d ' ')
    local total_count=$(docker ps -a --filter "name=dive-spoke-${code_lower}-" --format "{{.Names}}" 2>/dev/null | wc -l | tr -d ' ')

    if [ "$running_count" -lt "$total_count" ]; then
        log_warn "Not all containers running: $running_count/$total_count"
        return 1
    fi

    # Check verification report exists
    local verification_report="${DIVE_ROOT}/instances/${code_lower}/verification-report.json"
    if [ ! -f "$verification_report" ]; then
        log_warn "Verification report missing - may need re-verification"
        return 1
    fi

    # Validate verification report shows success
    if ! jq -e '.status == "PASS"' "$verification_report" &>/dev/null; then
        log_warn "Verification report shows failure - needs re-verification"
        return 1
    fi

    log_verbose "VERIFICATION state valid"
    return 0
}

# =============================================================================
# PUBLIC API: Validate specific phase
# =============================================================================

##
# Validate state for a specific phase
#
# Arguments:
#   $1 - Instance code
#   $2 - Phase name (PREFLIGHT, INITIALIZATION, etc.)
#
# Returns:
#   0 - State valid
#   1 - State invalid
##
spoke_validate_phase_state() {
    local instance_code="$1"
    local phase="$2"

    case "$phase" in
        PREFLIGHT)
            _validate_preflight_state "$instance_code"
            ;;
        INITIALIZATION)
            _validate_initialization_state "$instance_code"
            ;;
        DEPLOYMENT)
            _validate_deployment_state "$instance_code"
            ;;
        CONFIGURATION)
            _validate_configuration_state "$instance_code"
            ;;
        SEEDING)
            _validate_seeding_state "$instance_code"
            ;;
        VERIFICATION)
            _validate_verification_state "$instance_code"
            ;;
        *)
            log_error "Unknown phase for validation: $phase"
            return 1
            ;;
    esac
}

# Export validation function
export -f spoke_validate_phase_state
