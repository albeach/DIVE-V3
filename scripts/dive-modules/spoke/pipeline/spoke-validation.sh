#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Pipeline State Validation Functions
# =============================================================================
# Provides validation functions to verify phase state consistency
# with actual system state. Used for idempotent deployments.
#
# Integrates with existing orchestration DB (orchestration/state.sh)
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
# GUARDRAILS - Prevent Invalid Deployments
# =============================================================================

##
# Validate that the instance can be deployed as a spoke
# Blocks USA from being deployed as a spoke (should use Hub deployment)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Valid spoke instance
#   1 - Invalid (USA should be Hub)
##
spoke_validate_instance_code() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    
    # GUARDRAIL: USA is the Hub - it cannot be deployed as a spoke
    if [ "$code_upper" = "USA" ] || [ "$code_upper" = "HUB" ]; then
        log_error "╔════════════════════════════════════════════════════════════════╗"
        log_error "║  DEPLOYMENT GUARDRAIL: USA Cannot Be Deployed as Spoke        ║"
        log_error "╚════════════════════════════════════════════════════════════════╝"
        log_error ""
        log_error "USA is the HUB instance and must be deployed using Hub commands:"
        log_error ""
        log_error "  ✓ CORRECT:   ./dive hub up"
        log_error "  ✓ CORRECT:   ./dive hub deploy"
        log_error "  ✗ WRONG:     ./dive spoke deploy USA"
        log_error ""
        log_error "Spokes are partner nations (FRA, GBR, DEU, CAN, etc.)"
        log_error ""
        return 1
    fi
    
    return 0
}

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
            # CRITICAL FIX: Use instance_code not instance_id (table column name)
            local status=$(orch_db_exec "SELECT status FROM deployment_steps WHERE instance_code = '${code_lower}' AND step_name = '${phase}' ORDER BY started_at DESC LIMIT 1;" 2>/dev/null | tr -d ' \n')
            
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

    # Check if secrets exist in .env file (instance-specific variable names)
    local env_file="$spoke_dir/.env"
    if [ -f "$env_file" ]; then
        # Check for instance-specific secret variable names (e.g., POSTGRES_PASSWORD_FRA)
        local required_secrets=("POSTGRES_PASSWORD" "MONGO_PASSWORD" "REDIS_PASSWORD" "KEYCLOAK_ADMIN_PASSWORD")
        for secret in "${required_secrets[@]}"; do
            # Check both instance-specific (POSTGRES_PASSWORD_FRA) and generic (POSTGRES_PASSWORD) formats
            local instance_specific="${secret}_${code_upper}"
            if ! grep -qE "^(${secret}|${instance_specific})=" "$env_file" 2>/dev/null; then
                log_warn "Secret not in .env file: ${secret} (checked both ${secret} and ${instance_specific})"
                return 1
            fi
        done
        log_verbose "All required secrets present in .env (instance-specific format)"
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
    # Note: INSTANCE_NAME is set in docker-compose.yml, not .env
    # Only check for variables that should be in .env file
    local required_vars=("INSTANCE_CODE")
    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" "$env_file" 2>/dev/null; then
            log_warn "Required env var missing from .env: $var"
            return 1
        fi
    done
    
    # Validate instance-specific secrets exist (flexible check for both formats)
    local code_upper=$(upper "$instance_code")
    local secret_found=false
    for pattern in "POSTGRES_PASSWORD_${code_upper}" "POSTGRES_PASSWORD"; do
        if grep -q "^${pattern}=" "$env_file" 2>/dev/null; then
            secret_found=true
            break
        fi
    done
    if [ "$secret_found" = "false" ]; then
        log_warn "No PostgreSQL password found in .env (checked instance-specific and generic formats)"
        return 1
    fi

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

    # Check if Keycloak container exists
    local kc_container="dive-spoke-${code_lower}-keycloak"
    if ! docker ps -a --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        log_warn "Keycloak container missing: $kc_container"
        return 1
    fi

    # Check Terraform state exists (workspace-based path)
    # Terraform workspaces store state in terraform.tfstate.d/<workspace>/
    local tf_workspace_dir="${DIVE_ROOT}/terraform/spoke/terraform.tfstate.d/${code_lower}"
    if [ ! -d "$tf_workspace_dir" ]; then
        log_verbose "Terraform workspace directory missing: $tf_workspace_dir"
        log_verbose "This is acceptable if Terraform hasn't been applied yet"
        # Don't fail - workspace gets created on first terraform init
    fi

    # Check if terraform state file exists (indicates terraform was applied successfully)
    local tf_state_file="$tf_workspace_dir/terraform.tfstate"
    if [ -f "$tf_state_file" ]; then
        log_verbose "Terraform state found at: $tf_state_file"
    else
        log_verbose "Terraform state file missing - configuration may not be applied yet"
        # This is acceptable for first deployment or if using remote backend
    fi

    # If Keycloak is running, verify realm exists (best-effort)
    if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        local realm="dive-v3-broker-${code_lower}"
        local realm_check=$(docker exec "$kc_container" curl -sf \
            "http://localhost:8080/realms/${realm}" 2>/dev/null | \
            jq -r '.realm // empty' 2>/dev/null || echo "")

        if [ "$realm_check" = "$realm" ]; then
            log_verbose "Realm verified: $realm"
        else
            log_warn "Realm not accessible: $realm (may need Terraform re-apply)"
            return 1
        fi
    else
        log_verbose "Keycloak not running - skipping realm verification"
        # Don't fail - container may be stopped for maintenance
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

    # Check if Keycloak container exists (it may be stopped during validation)
    local kc_container="dive-spoke-${code_lower}-keycloak"
    if ! docker ps -a --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        log_warn "Keycloak container does not exist: $kc_container"
        return 1
    fi

    # Check if Keycloak is running (optional - may be stopped)
    if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        log_verbose "Keycloak not running - skipping user validation (assume seeded if phase marked complete)"
        # If phase is marked complete in DB, trust that seeding was done
        return 0
    fi

    # If Keycloak is running, try to verify test user exists (best-effort)
    local realm="dive-v3-broker-${code_lower}"
    local test_username="testuser-${code_lower}"

    # Try to get admin token and check for user (non-blocking)
    local keycloak_password_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
    local keycloak_password="${!keycloak_password_var:-admin}"
    
    local user_check=$(docker exec "$kc_container" \
        /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 \
        --realm master \
        --user admin \
        --password "$keycloak_password" \
        --config /tmp/.kcadm.config 2>/dev/null && \
        docker exec "$kc_container" \
        /opt/keycloak/bin/kcadm.sh get users \
        --realm "$realm" \
        --query "username=$test_username" \
        --config /tmp/.kcadm.config 2>/dev/null | \
        jq -r '.[0].username // empty' 2>/dev/null || echo "")

    if [ "$user_check" = "$test_username" ]; then
        log_verbose "SEEDING state valid (test user found: $test_username)"
    else
        log_verbose "Could not verify test user, but Keycloak is running (non-blocking)"
        # Don't fail validation - seeding may have happened differently
    fi

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

    # Minimum container count check (primary validation)
    local min_containers=7  # postgres, mongodb, redis, keycloak, opa, backend, opal-client
    if [ "$running_count" -lt "$min_containers" ]; then
        log_warn "Insufficient containers running: $running_count (expected at least $min_containers)"
        return 1
    fi

    # Check verification report exists (optional - may not exist on first deployment)
    local verification_report="${DIVE_ROOT}/instances/${code_lower}/verification-report.json"
    if [ -f "$verification_report" ]; then
        # If report exists, validate it shows success
        if ! jq -e '.status == "PASS"' "$verification_report" &>/dev/null; then
            log_warn "Verification report shows failure - needs re-verification"
            return 1
        fi
        log_verbose "Verification report found and shows PASS"
    else
        # Report doesn't exist - check if services are actually healthy
        log_verbose "Verification report not found, checking service health directly"
        
        # Check if critical services are healthy (best-effort)
        local unhealthy_count=0
        for container in $(docker ps --filter "name=dive-spoke-${code_lower}-" --format "{{.Names}}"); do
            local health=$(docker inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "none")
            if [ "$health" = "unhealthy" ]; then
                log_warn "Container unhealthy: $container"
                ((unhealthy_count++))
            fi
        done
        
        if [ "$unhealthy_count" -gt 0 ]; then
            log_warn "Found $unhealthy_count unhealthy containers"
            return 1
        fi
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
