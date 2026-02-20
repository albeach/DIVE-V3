#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Pre-deployment Validation Gate
# =============================================================================
# Comprehensive validation BEFORE any containers start. Catches Docker not
# running, port conflicts, disk space, and missing tools within seconds
# rather than minutes into a failed deployment.
#
# Usage:
#   pre_validate_hub                    # Full hub pre-validation
#   pre_validate_spoke "GBR"            # Full spoke pre-validation
#   pre_validate_check_docker           # Individual check
#   pre_validate_check_ports "hub"      # Individual check
#   pre_validate_check_disk             # Individual check
#   pre_validate_check_tools            # Individual check
# =============================================================================

# Prevent multiple sourcing
if [ -n "${PRE_VALIDATION_LOADED:-}" ]; then
    return 0
fi
export PRE_VALIDATION_LOADED=1

# =============================================================================
# INDIVIDUAL CHECKS
# =============================================================================

##
# Check if Docker daemon is running and responsive
#
# Returns:
#   0 - Docker is running
#   1 - Docker is not running or not responsive
#
# Output:
#   Docker version and resource info on success
#   Error message on failure
##
pre_validate_check_docker() {
    # Check docker command exists
    if ! command -v docker &>/dev/null; then
        echo "FAIL|Docker command not found. Install Docker: https://docs.docker.com/get-docker/"
        return 1
    fi

    # Check docker daemon is running
    if ! docker info &>/dev/null; then
        echo "FAIL|Docker daemon is not running. Start Docker Desktop or run: sudo systemctl start docker"
        return 1
    fi

    # Get Docker info
    local version cpu mem
    version=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "unknown")
    cpu=$(docker info --format '{{.NCPU}}' 2>/dev/null || echo "?")
    mem=$(docker info --format '{{json .MemTotal}}' 2>/dev/null || echo "0")

    # Convert memory to GB (mem is in bytes)
    local mem_gb="?"
    if [ "$mem" != "0" ] && [ -n "$mem" ]; then
        mem_gb=$(echo "$mem" | awk '{printf "%.0f", $1/1073741824}' 2>/dev/null || echo "?")
    fi

    echo "OK|Docker ${version}, ${cpu} CPU, ${mem_gb}GB RAM"
    return 0
}

##
# Check if required ports are available
#
# Arguments:
#   $1 - Deploy type: "hub" or "spoke"
#   $2 - Instance code (for spoke port lookups)
#
# Returns:
#   0 - All ports available
#   1 - Port conflicts detected
##
pre_validate_check_ports() {
    local deploy_type="${1:-hub}"
    local instance_code="${2:-USA}"
    local conflicts=""

    # Key ports for hub
    local ports_to_check=""
    if [ "$deploy_type" = "hub" ]; then
        ports_to_check="5432 27017 6379 8200 8443 4000 3000 8181"
    else
        # Spoke ports depend on instance, check common ones
        ports_to_check="8443 4000 3000"
    fi

    for port in $ports_to_check; do
        # Check if port is in use (cross-platform: lsof or ss)
        local pid_info=""
        if command -v lsof &>/dev/null; then
            pid_info=$(lsof -i :"$port" -sTCP:LISTEN -t 2>/dev/null | head -1)
        elif command -v ss &>/dev/null; then
            pid_info=$(ss -tlnp "sport = :$port" 2>/dev/null | grep -v "^State" | head -1)
        fi

        if [ -n "$pid_info" ]; then
            local process_name=""
            if command -v lsof &>/dev/null; then
                process_name=$(lsof -i :"$port" -sTCP:LISTEN 2>/dev/null | tail -1 | awk '{print $1"/"$2}')
            fi
            conflicts="${conflicts:+$conflicts, }port $port (${process_name:-in use})"
        fi
    done

    if [ -n "$conflicts" ]; then
        echo "WARN|Port conflicts: $conflicts"
        return 1
    fi

    echo "OK|All required ports available"
    return 0
}

##
# Check available disk space
#
# Returns:
#   0 - Sufficient disk space
#   1 - Low disk space (>90% used)
#
# Output:
#   Disk usage info
##
pre_validate_check_disk() {
    local dive_root="${DIVE_ROOT:-.}"

    # Get disk usage percentage for the DIVE_ROOT filesystem
    local usage_pct
    usage_pct=$(df -P "$dive_root" 2>/dev/null | tail -1 | awk '{print $5}' | tr -d '%')

    if [ -z "$usage_pct" ]; then
        echo "WARN|Could not determine disk usage"
        return 0
    fi

    # Get available space in human-readable format
    local available
    available=$(df -Ph "$dive_root" 2>/dev/null | tail -1 | awk '{print $4}')

    if [ "$usage_pct" -ge 95 ]; then
        echo "FAIL|Disk ${usage_pct}% full (${available} free). Free space before deploying."
        return 1
    elif [ "$usage_pct" -ge 85 ]; then
        echo "WARN|Disk ${usage_pct}% full (${available} free). Consider freeing space."
        return 0
    fi

    echo "OK|Disk ${usage_pct}% used (${available} free)"
    return 0
}

##
# Check required CLI tools are installed
#
# Returns:
#   0 - All required tools present
#   1 - Missing required tools
##
pre_validate_check_tools() {
    local missing=""

    local required_tools="docker jq curl openssl"
    for tool in $required_tools; do
        if ! command -v "$tool" &>/dev/null; then
            missing="${missing:+$missing, }$tool"
        fi
    done

    if [ -n "$missing" ]; then
        echo "FAIL|Missing required tools: $missing"
        return 1
    fi

    echo "OK|All required tools installed (docker, jq, curl, openssl)"
    return 0
}

##
# Check Docker disk usage (images, containers, volumes)
#
# Returns:
#   0 - Docker disk usage acceptable
#   1 - Docker disk usage high
##
pre_validate_check_docker_disk() {
    if ! docker info &>/dev/null; then
        echo "SKIP|Docker not running"
        return 0
    fi

    # Get Docker system disk usage
    local docker_usage
    docker_usage=$(docker system df --format '{{.Size}}' 2>/dev/null | head -1)

    if [ -n "$docker_usage" ]; then
        echo "OK|Docker disk: ${docker_usage} (images)"
    else
        echo "OK|Docker disk usage check skipped"
    fi

    return 0
}

# =============================================================================
# COMPOSITE VALIDATION
# =============================================================================

##
# Run all pre-deployment validations for hub
#
# Returns:
#   0 - All checks passed (or only warnings)
#   1 - Critical failure detected
##
pre_validate_hub() {
    local has_failure=false
    local has_warning=false

    echo ""
    echo "==============================================================================="
    echo "  Pre-deployment Validation"
    echo "==============================================================================="

    # Check Docker
    local result
    result=$(pre_validate_check_docker)
    local status="${result%%|*}"
    local message="${result#*|}"
    if [ "$status" = "FAIL" ]; then
        echo "  [FAIL] Docker:     $message"
        has_failure=true
    elif [ "$status" = "WARN" ]; then
        echo "  [WARN] Docker:     $message"
        has_warning=true
    else
        echo "  [ OK ] Docker:     $message"
    fi

    # Check tools
    result=$(pre_validate_check_tools)
    status="${result%%|*}"
    message="${result#*|}"
    if [ "$status" = "FAIL" ]; then
        echo "  [FAIL] Tools:      $message"
        has_failure=true
    else
        echo "  [ OK ] Tools:      $message"
    fi

    # Check disk space
    result=$(pre_validate_check_disk)
    status="${result%%|*}"
    message="${result#*|}"
    if [ "$status" = "FAIL" ]; then
        echo "  [FAIL] Disk:       $message"
        has_failure=true
    elif [ "$status" = "WARN" ]; then
        echo "  [WARN] Disk:       $message"
        has_warning=true
    else
        echo "  [ OK ] Disk:       $message"
    fi

    # Check ports (non-fatal — Docker containers may already be running)
    result=$(pre_validate_check_ports "hub")
    status="${result%%|*}"
    message="${result#*|}"
    if [ "$status" = "WARN" ]; then
        echo "  [WARN] Ports:      $message"
        has_warning=true
    else
        echo "  [ OK ] Ports:      $message"
    fi

    # Check Docker disk
    result=$(pre_validate_check_docker_disk)
    status="${result%%|*}"
    message="${result#*|}"
    if [ "$status" != "SKIP" ]; then
        echo "  [ OK ] Docker Disk: $message"
    fi

    # Show build cache status if available
    if type build_cache_status &>/dev/null; then
        echo ""
        build_cache_status
    fi

    echo "==============================================================================="

    if [ "$has_failure" = true ]; then
        echo ""
        echo "  Pre-deployment validation FAILED. Fix the issues above before deploying."
        echo ""
        return 1
    fi

    if [ "$has_warning" = true ]; then
        echo ""
        echo "  Pre-deployment validation passed with warnings."
    fi

    return 0
}

##
# Run all pre-deployment validations for spoke
#
# Arguments:
#   $1 - Instance code (e.g., GBR)
#
# Returns:
#   0 - All checks passed
#   1 - Critical failure
##
pre_validate_spoke() {
    local instance_code="${1:-GBR}"
    local has_failure=false
    local has_warning=false

    echo ""
    echo "==============================================================================="
    echo "  Pre-deployment Validation (Spoke: $instance_code)"
    echo "==============================================================================="

    # Check Docker
    local result
    result=$(pre_validate_check_docker)
    local status="${result%%|*}"
    local message="${result#*|}"
    if [ "$status" = "FAIL" ]; then
        echo "  [FAIL] Docker:     $message"
        has_failure=true
    else
        echo "  [ OK ] Docker:     $message"
    fi

    # Check tools
    result=$(pre_validate_check_tools)
    status="${result%%|*}"
    message="${result#*|}"
    if [ "$status" = "FAIL" ]; then
        echo "  [FAIL] Tools:      $message"
        has_failure=true
    else
        echo "  [ OK ] Tools:      $message"
    fi

    # Check disk
    result=$(pre_validate_check_disk)
    status="${result%%|*}"
    message="${result#*|}"
    if [ "$status" = "FAIL" ]; then
        echo "  [FAIL] Disk:       $message"
        has_failure=true
    elif [ "$status" = "WARN" ]; then
        echo "  [WARN] Disk:       $message"
        has_warning=true
    else
        echo "  [ OK ] Disk:       $message"
    fi

    echo "==============================================================================="

    if [ "$has_failure" = true ]; then
        echo ""
        echo "  Pre-deployment validation FAILED."
        echo ""
        return 1
    fi

    return 0
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f pre_validate_hub
export -f pre_validate_spoke
export -f pre_validate_check_docker
export -f pre_validate_check_ports
export -f pre_validate_check_disk
export -f pre_validate_check_tools
export -f pre_validate_check_docker_disk
