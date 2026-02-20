#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Shared Pipeline Utilities
# =============================================================================
# Deduplicated health checks, service SSOT, and secret loading for both
# hub and spoke deployment pipelines.
#
# Phase 2 of CLI Pipeline Overhaul (PR #681 = Phase 1)
# =============================================================================
# Version: 1.0.0
# Date: 2026-02-20
# =============================================================================

# Prevent multiple sourcing
if [ -n "${PIPELINE_UTILS_LOADED:-}" ]; then
    return 0
fi
export PIPELINE_UTILS_LOADED=1

# Ensure common functions are loaded
DEPLOYMENT_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$DEPLOYMENT_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# SERVICE NAME SSOT
# =============================================================================
# Canonical service lists for hub and spoke deployments.
# All verification, health checks, and startup code MUST reference these.
# =============================================================================

# Hub services: ordered by dependency level (infrastructure → core → application)
# shellcheck disable=SC2034  # Used by sourcing modules (hub-services.sh, verification.sh)
readonly PIPELINE_HUB_INFRA_SERVICES="postgres mongodb redis vault-seal"
# shellcheck disable=SC2034
readonly PIPELINE_HUB_CORE_SERVICES="keycloak opa opal-server opal-client backend"
# shellcheck disable=SC2034
readonly PIPELINE_HUB_APP_SERVICES="frontend kas"
# shellcheck disable=SC2034
readonly PIPELINE_HUB_OPTIONAL_SERVICES="otel-collector"
# shellcheck disable=SC2034
readonly PIPELINE_HUB_ALL_SERVICES="postgres mongodb redis vault-seal keycloak opa opal-server opal-client backend frontend kas otel-collector"

# Spoke services: ordered by dependency level
# shellcheck disable=SC2034
readonly PIPELINE_SPOKE_INFRA_SERVICES="postgres mongodb redis"
# shellcheck disable=SC2034
readonly PIPELINE_SPOKE_CORE_SERVICES="keycloak opa opal-client backend"
# shellcheck disable=SC2034
readonly PIPELINE_SPOKE_APP_SERVICES="frontend kas"
# shellcheck disable=SC2034
readonly PIPELINE_SPOKE_ALL_SERVICES="postgres mongodb redis keycloak opa opal-client backend frontend kas"

# Service timeouts (seconds) — SSOT for both hub and spoke
# Overridable via environment variables (e.g., TIMEOUT_KEYCLOAK=300)
pipeline_get_service_timeout() {
    local service="$1"
    case "$service" in
        postgres)        echo "${TIMEOUT_POSTGRES:-60}" ;;
        mongodb)         echo "${TIMEOUT_MONGODB:-90}" ;;
        redis)           echo "${TIMEOUT_REDIS:-30}" ;;
        redis-blacklist) echo "${TIMEOUT_REDIS:-30}" ;;
        vault-seal)      echo "${TIMEOUT_VAULT_SEAL:-30}" ;;
        vault-1|vault-2|vault-3|vault-dev) echo "${TIMEOUT_VAULT:-60}" ;;
        keycloak)        echo "${TIMEOUT_KEYCLOAK:-180}" ;;
        opa)             echo "${TIMEOUT_OPA:-30}" ;;
        opal-server)     echo "${TIMEOUT_OPAL:-60}" ;;
        opal-client)     echo "${TIMEOUT_OPAL:-60}" ;;
        backend)         echo "${TIMEOUT_BACKEND:-120}" ;;
        frontend)        echo "${TIMEOUT_FRONTEND:-90}" ;;
        kas)             echo "${TIMEOUT_KAS:-60}" ;;
        authzforce)      echo "${TIMEOUT_AUTHZFORCE:-90}" ;;
        otel-collector)  echo "${TIMEOUT_OTEL:-30}" ;;
        caddy)           echo "${TIMEOUT_CADDY:-30}" ;;
        *)               echo "60" ;;
    esac
}

# =============================================================================
# CONTAINER HEALTH CHECK PRIMITIVES
# =============================================================================
# Single-point functions for Docker container inspection.
# Replaces 10+ duplicated docker inspect patterns across the codebase.
# =============================================================================

##
# Get the health status of a single container.
#
# Arguments:
#   $1 - Full container name (e.g., dive-hub-postgres)
#
# Returns:
#   Prints health status: "healthy", "unhealthy", "starting", "none", or "not_found"
#   Exit code 0 always (caller checks output string)
##
pipeline_get_container_health() {
    local container="$1"
    local health
    health=$(${DOCKER_CMD:-docker} inspect "$container" \
        --format='{{.State.Health.Status}}' 2>/dev/null || echo "not_found")
    # Trim whitespace (docker sometimes adds trailing newline)
    echo "${health}" | tr -d '[:space:]'
}

##
# Check if a container exists (running or stopped).
#
# Arguments:
#   $1 - Full container name
#
# Returns:
#   0 if container exists, 1 otherwise
##
pipeline_container_exists() {
    local container="$1"
    ${DOCKER_CMD:-docker} ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$"
}

##
# Check if a container is currently running.
#
# Arguments:
#   $1 - Full container name
#
# Returns:
#   0 if container is running, 1 otherwise
##
pipeline_container_running() {
    local container="$1"
    ${DOCKER_CMD:-docker} ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$"
}

##
# Get the run state of a container (running, exited, etc.).
#
# Arguments:
#   $1 - Full container name
#
# Returns:
#   Prints state: "running", "exited", "dead", "created", or "not_found"
##
pipeline_get_container_state() {
    local container="$1"
    ${DOCKER_CMD:-docker} inspect "$container" \
        --format='{{.State.Status}}' 2>/dev/null || echo "not_found"
}

# =============================================================================
# HEALTH CHECK WAIT LOOP
# =============================================================================
# Single canonical wait-for-healthy function replacing 7+ duplicated loops
# across hub-phases.sh, hub-services.sh, spoke-containers.sh, and verification.
# =============================================================================

##
# Wait for a container to become healthy with configurable timeout and interval.
#
# Arguments:
#   $1 - Full container name (e.g., dive-hub-vault-1)
#   $2 - Timeout in seconds (default: 60)
#   $3 - Poll interval in seconds (default: 2)
#
# Options (via environment):
#   PIPELINE_HEALTH_BACKOFF=1  - Enable exponential backoff (interval doubles each miss)
#   PIPELINE_HEALTH_MAX_INTERVAL=30 - Max interval when backoff is enabled
#
# Returns:
#   0 - Container is healthy
#   1 - Timeout or container not found
##
pipeline_wait_for_healthy() {
    local container="$1"
    local timeout="${2:-60}"
    local interval="${3:-2}"
    local backoff="${PIPELINE_HEALTH_BACKOFF:-0}"
    local max_interval="${PIPELINE_HEALTH_MAX_INTERVAL:-30}"

    local elapsed=0
    local current_interval="$interval"

    while [ "$elapsed" -lt "$timeout" ]; do
        local health
        health=$(pipeline_get_container_health "$container")

        case "$health" in
            healthy)
                return 0
                ;;
            not_found)
                log_verbose "Container $container not found"
                return 1
                ;;
            unhealthy)
                log_verbose "$container: unhealthy ($elapsed/${timeout}s)"
                ;;
            starting|none|"")
                # Container exists but health check hasn't completed yet
                log_verbose "$container: health=$health ($elapsed/${timeout}s)"
                ;;
        esac

        sleep "$current_interval"
        elapsed=$((elapsed + current_interval))

        # Exponential backoff if enabled
        if [ "$backoff" = "1" ] && [ "$current_interval" -lt "$max_interval" ]; then
            current_interval=$((current_interval * 2))
            if [ "$current_interval" -gt "$max_interval" ]; then
                current_interval="$max_interval"
            fi
        fi
    done

    return 1
}

##
# Wait for a container to become healthy OR assume healthy if running without
# health check after a grace period. This is used by the hub service startup
# where some services may not define Docker HEALTHCHECK.
#
# Arguments:
#   $1 - Full container name
#   $2 - Timeout in seconds (default: 60)
#   $3 - Poll interval in seconds (default: 3)
#   $4 - Grace period for no-healthcheck containers (default: 10)
#
# Returns:
#   0 - Container is healthy or running (within grace period)
#   1 - Timeout, not found, or stopped
##
pipeline_wait_for_healthy_or_running() {
    local container="$1"
    local timeout="${2:-60}"
    local interval="${3:-3}"
    local grace="${4:-10}"

    local elapsed=0

    while [ "$elapsed" -lt "$timeout" ]; do
        local state
        state=$(pipeline_get_container_state "$container")

        case "$state" in
            not_found)
                log_verbose "Container $container not found"
                return 1
                ;;
            running)
                local health
                health=$(pipeline_get_container_health "$container")
                health=$(echo "$health" | tr -d '[:space:]')

                if [ "$health" = "healthy" ]; then
                    return 0
                elif [ "$health" = "none" ] || [ -z "$health" ] || [ "$health" = "" ]; then
                    # No health check defined — running is good enough after grace period
                    if [ "$elapsed" -ge "$grace" ]; then
                        log_verbose "$container running (no healthcheck, assuming healthy after ${grace}s)"
                        return 0
                    fi
                fi
                ;;
            *)
                log_verbose "$container: state=$state ($elapsed/${timeout}s)"
                ;;
        esac

        # Progress indicator every 15s
        if [ $((elapsed % 15)) -eq 0 ] && [ "$elapsed" -gt 0 ]; then
            log_verbose "$container: Still waiting ($elapsed/${timeout}s)"
        fi

        sleep "$interval"
        elapsed=$((elapsed + interval))
    done

    return 1
}

# =============================================================================
# BATCH HEALTH CHECKS
# =============================================================================

##
# Check health of multiple containers in a single Docker API call.
# More efficient than checking one at a time.
#
# Arguments:
#   $1 - Container prefix (e.g., dive-hub, dive-spoke-gbr)
#   $2... - Service names (e.g., postgres keycloak backend)
#
# Output:
#   Prints "service_name:health_status" lines to stdout
#
# Returns:
#   0 - All services healthy
#   1 - One or more services not healthy
##
pipeline_batch_health_check() {
    local prefix="$1"
    shift
    local services=("$@")

    if [ ${#services[@]} -eq 0 ]; then
        return 0
    fi

    local all_healthy=true

    for service in "${services[@]}"; do
        local container="${prefix}-${service}"
        local health
        health=$(pipeline_get_container_health "$container")

        echo "${service}:${health}"

        if [ "$health" != "healthy" ]; then
            all_healthy=false
        fi
    done

    $all_healthy
}

# =============================================================================
# RETRY WITH BACKOFF
# =============================================================================

##
# Execute a command with retry and exponential backoff.
# Replaces 3+ identical retry patterns in phase-verification.sh.
#
# Arguments:
#   $1 - Max attempts (default: 3)
#   $2 - Initial delay in seconds (default: 5)
#   $3... - Command to execute (function name + args)
#
# Returns:
#   0 - Command succeeded within max_attempts
#   1 - All attempts failed
##
pipeline_retry_with_backoff() {
    local max_attempts="${1:-3}"
    local initial_delay="${2:-5}"
    shift 2
    local cmd=("$@")

    local attempt=0
    local delay="$initial_delay"

    while [ "$attempt" -lt "$max_attempts" ]; do
        if "${cmd[@]}"; then
            return 0
        fi

        attempt=$((attempt + 1))
        if [ "$attempt" -lt "$max_attempts" ]; then
            log_verbose "Attempt $attempt/$max_attempts failed, retrying in ${delay}s..."
            sleep "$delay"
            delay=$((delay * 2))
        fi
    done

    log_verbose "Command failed after $max_attempts attempts"
    return 1
}

# =============================================================================
# SECRET LOADING & VALIDATION
# =============================================================================

##
# Load and validate secrets for a deployment phase.
# Single canonical function replacing scattered load_secrets calls.
#
# This function:
#   1. Calls load_secrets (from docker-helpers.sh)
#   2. Validates that required secrets are non-empty
#   3. Validates that no placeholder values remain
#   4. Reports specific missing secrets
#
# Arguments:
#   $1 - Deployment type: "hub" or "spoke"
#   $2 - Instance code (e.g., USA, GBR) — only needed for spoke
#
# Returns:
#   0 - Secrets loaded and validated
#   1 - Missing or invalid secrets
##
pipeline_ensure_secrets_loaded() {
    local deployment_type="${1:-hub}"
    local instance_code="${2:-USA}"
    local code_upper
    code_upper=$(upper "$instance_code")

    # Step 1: Call the existing load_secrets function
    if type load_secrets &>/dev/null; then
        if ! load_secrets; then
            log_error "Failed to load secrets via load_secrets()"
            return 1
        fi
    fi

    # Step 2: Source .env file for the deployment type
    local env_file
    if [ "$deployment_type" = "hub" ]; then
        env_file="${DIVE_ROOT}/.env.hub"
    else
        local code_lower
        code_lower=$(lower "$instance_code")
        env_file="${DIVE_ROOT}/instances/${code_lower}/.env"
    fi

    if [ -f "$env_file" ]; then
        set -a
        # shellcheck disable=SC1090
        source "$env_file"
        set +a
    fi

    # Step 3: Validate required secrets based on deployment type
    local missing=0
    local placeholders=0

    if [ "$deployment_type" = "hub" ]; then
        local required_vars=(
            "KEYCLOAK_ADMIN_PASSWORD"
            "POSTGRES_PASSWORD_USA"
            "MONGO_PASSWORD_USA"
            "REDIS_PASSWORD_USA"
        )
    else
        local required_vars=(
            "KEYCLOAK_ADMIN_PASSWORD"
            "POSTGRES_PASSWORD_${code_upper}"
            "MONGO_PASSWORD_${code_upper}"
            "REDIS_PASSWORD_${code_upper}"
        )
    fi

    for var_name in "${required_vars[@]}"; do
        local value="${!var_name:-}"

        # Check for empty
        if [ -z "$value" ]; then
            log_error "Required secret not set: $var_name"
            missing=$((missing + 1))
            continue
        fi

        # Check for placeholder values
        if [[ "$value" == *"PLACEHOLDER"* ]] || \
           [[ "$value" == *"changeme"* ]] || \
           [[ "$value" == *"__PLACEHOLDER__"* ]] || \
           [[ "$value" == "TODO"* ]]; then
            log_error "Secret contains placeholder value: $var_name"
            placeholders=$((placeholders + 1))
        fi
    done

    if [ $missing -gt 0 ] || [ $placeholders -gt 0 ]; then
        log_error "Secret validation failed: $missing missing, $placeholders placeholders"
        return 1
    fi

    return 0
}

##
# Load a single secret value for an instance.
# Checks environment variable first, then falls back to .env file.
#
# Arguments:
#   $1 - Secret base name (e.g., MONGO_PASSWORD)
#   $2 - Instance code (e.g., GBR)
#   $3 - Optional .env file path (default: auto-detect from instance)
#
# Output:
#   Prints secret value to stdout
#
# Returns:
#   0 - Secret found
#   1 - Secret not found
##
pipeline_load_secret() {
    local secret_name="$1"
    local instance_code="$2"
    local env_file="${3:-}"
    local code_upper
    code_upper=$(upper "$instance_code")

    # Build instance-specific var name
    local var_name="${secret_name}_${code_upper}"
    local value="${!var_name:-}"

    # Try environment variable first
    if [ -n "$value" ]; then
        echo "$value"
        return 0
    fi

    # Auto-detect env file if not provided
    if [ -z "$env_file" ]; then
        local code_lower
        code_lower=$(lower "$instance_code")
        if [ "$instance_code" = "USA" ] || [ "$instance_code" = "HUB" ]; then
            env_file="${DIVE_ROOT}/.env.hub"
        else
            env_file="${DIVE_ROOT}/instances/${code_lower}/.env"
        fi
    fi

    # Fall back to .env file
    if [ -f "$env_file" ]; then
        value=$(grep "^${var_name}=" "$env_file" 2>/dev/null | cut -d= -f2- | tr -d '"' || echo "")
        if [ -n "$value" ]; then
            echo "$value"
            return 0
        fi
    fi

    return 1
}

# =============================================================================
# CONTAINER NAME HELPERS
# =============================================================================

##
# Build a container name from a compose project prefix and service name.
# Ensures consistent naming across all pipeline code.
#
# Arguments:
#   $1 - Deployment type: "hub" or "spoke"
#   $2 - Service name (e.g., postgres, keycloak)
#   $3 - Instance code (only needed for spoke, e.g., GBR)
#
# Output:
#   Prints the full container name (e.g., dive-hub-postgres, dive-spoke-gbr-postgres)
##
pipeline_container_name() {
    local deployment_type="$1"
    local service="$2"
    local instance_code="${3:-}"

    if [ "$deployment_type" = "hub" ]; then
        echo "${COMPOSE_PROJECT_NAME:-dive-hub}-${service}"
    else
        local code_lower
        code_lower=$(lower "$instance_code")
        echo "dive-spoke-${code_lower}-${service}"
    fi
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

# Service SSOT
export -f pipeline_get_service_timeout

# Health check primitives
export -f pipeline_get_container_health
export -f pipeline_container_exists
export -f pipeline_container_running
export -f pipeline_get_container_state

# Health check wait loops
export -f pipeline_wait_for_healthy
export -f pipeline_wait_for_healthy_or_running

# Batch operations
export -f pipeline_batch_health_check

# Retry
export -f pipeline_retry_with_backoff

# Secret loading
export -f pipeline_ensure_secrets_loaded
export -f pipeline_load_secret

# Naming
export -f pipeline_container_name

log_verbose "Pipeline utilities module loaded"
