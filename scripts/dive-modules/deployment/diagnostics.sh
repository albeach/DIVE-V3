#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Deployment Diagnostics
# =============================================================================
# Shared diagnostic functions for hub and spoke deployments.
# Provides:
#   - Container status and resource usage
#   - Certificate expiry checks
#   - Port availability verification
#   - Disk space for Docker volumes
#   - Recent log tail collection
#
# Used by: ./dive hub diagnose, ./dive spoke diagnose CODE
# =============================================================================
# Version: 1.0.0
# Date: 2026-02-20
# =============================================================================

# Prevent multiple sourcing
if [ -n "${PIPELINE_DIAGNOSTICS_LOADED:-}" ]; then
    return 0
fi
export PIPELINE_DIAGNOSTICS_LOADED=1

# =============================================================================
# CONTAINER DIAGNOSTICS
# =============================================================================

##
# Check Docker container status for a compose project
#
# Arguments:
#   $1 - Compose project name (e.g., "dive-hub", "dive-spoke-gbr")
#
# Returns:
#   Formatted container status table on stdout
##
diag_container_status() {
    local project="$1"

    echo "  Container Status ($project)"
    echo "  ─────────────────────────────────────────────────────────────────────────────"

    if ! command -v docker &>/dev/null; then
        echo "  [!] Docker not available"
        return 1
    fi

    local containers
    containers=$(docker ps -a --filter "label=com.docker.compose.project=$project" \
        --format "{{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null)

    if [ -z "$containers" ]; then
        echo "  No containers found for project: $project"
        return 0
    fi

    printf "  %-35s %-25s %s\n" "Container" "Status" "Ports"
    echo "  ─────────────────────────────────────────────────────────────────────────────"

    local total=0 running=0 stopped=0
    while IFS=$'\t' read -r name status ports; do
        total=$((total + 1))
        if echo "$status" | grep -qi "up"; then
            running=$((running + 1))
            printf "  %-35s %-25s %s\n" "$name" "$status" "${ports:--}"
        else
            stopped=$((stopped + 1))
            printf "  %-35s %-25s %s\n" "$name" "$status" "${ports:--}"
        fi
    done <<< "$containers"

    echo ""
    echo "  Total: $total | Running: $running | Stopped: $stopped"
}

##
# Check Docker resource usage for a compose project
#
# Arguments:
#   $1 - Compose project name
##
diag_container_resources() {
    local project="$1"

    echo "  Resource Usage ($project)"
    echo "  ─────────────────────────────────────────────────────────────────────────────"

    if ! command -v docker &>/dev/null; then
        echo "  [!] Docker not available"
        return 1
    fi

    local container_ids
    container_ids=$(docker ps -q --filter "label=com.docker.compose.project=$project" 2>/dev/null)

    if [ -z "$container_ids" ]; then
        echo "  No running containers found"
        return 0
    fi

    printf "  %-30s %10s %10s %10s\n" "Container" "CPU %" "Mem Usage" "Mem %"
    echo "  ─────────────────────────────────────────────────────────────────────────────"

    # Use docker stats --no-stream for a snapshot
    # shellcheck disable=SC2086
    docker stats --no-stream --format "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" \
        $container_ids 2>/dev/null | while IFS=$'\t' read -r name cpu mem mem_pct; do
        printf "  %-30s %10s %10s %10s\n" "$name" "$cpu" "$mem" "$mem_pct"
    done
}

# =============================================================================
# CERTIFICATE DIAGNOSTICS
# =============================================================================

##
# Check certificate expiry dates
#
# Arguments:
#   $1 - Certificate directory path
#   $2 - Label for the certificate set (e.g., "Hub", "Spoke GBR")
##
diag_cert_expiry() {
    local cert_dir="$1"
    local label="${2:-Certificates}"

    echo "  Certificate Expiry ($label)"
    echo "  ─────────────────────────────────────────────────────────────────────────────"

    if [ ! -d "$cert_dir" ]; then
        echo "  [!] Certificate directory not found: $cert_dir"
        return 1
    fi

    local found=0
    local cert_file
    while IFS= read -r cert_file; do
        [ -z "$cert_file" ] && continue
        [ ! -f "$cert_file" ] && continue
        found=$((found + 1))

        local expiry_date expiry_epoch now_epoch days_left
        expiry_date=$(openssl x509 -enddate -noout -in "$cert_file" 2>/dev/null | sed 's/notAfter=//')
        if [ -z "$expiry_date" ]; then
            printf "  %-40s %s\n" "$(basename "$cert_file")" "[!] Cannot parse"
            continue
        fi

        # Calculate days until expiry
        if expiry_epoch=$(date -j -f "%b %d %H:%M:%S %Y %Z" "$expiry_date" +%s 2>/dev/null) || \
           expiry_epoch=$(date -d "$expiry_date" +%s 2>/dev/null); then
            now_epoch=$(date +%s)
            days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

            local status_indicator=""
            if [ "$days_left" -le 0 ]; then
                status_indicator="EXPIRED"
            elif [ "$days_left" -le 7 ]; then
                status_indicator="CRITICAL (<7d)"
            elif [ "$days_left" -le 30 ]; then
                status_indicator="WARNING (<30d)"
            else
                status_indicator="OK"
            fi

            printf "  %-40s %s (%d days) [%s]\n" \
                "$(basename "$cert_file")" "$expiry_date" "$days_left" "$status_indicator"
        else
            printf "  %-40s %s\n" "$(basename "$cert_file")" "$expiry_date"
        fi
    done < <(find "$cert_dir" -name "*.pem" -o -name "*.crt" 2>/dev/null | sort)

    if [ "$found" -eq 0 ]; then
        echo "  No certificate files found"
    fi
}

# =============================================================================
# PORT DIAGNOSTICS
# =============================================================================

##
# Check if required ports are available or in use
#
# Arguments:
#   $1 - Space-separated list of ports to check
#   $2 - Label (e.g., "Hub", "Spoke GBR")
##
diag_port_check() {
    local ports="$1"
    local label="${2:-Ports}"

    echo "  Port Availability ($label)"
    echo "  ─────────────────────────────────────────────────────────────────────────────"

    local port
    for port in $ports; do
        local status="available"
        local process_info=""

        if command -v lsof &>/dev/null; then
            process_info=$(lsof -i ":$port" -sTCP:LISTEN -t 2>/dev/null | head -1)
            if [ -n "$process_info" ]; then
                status="in use (PID: $process_info)"
            fi
        elif command -v ss &>/dev/null; then
            if ss -tlnp 2>/dev/null | grep -q ":$port "; then
                status="in use"
            fi
        fi

        printf "  Port %-6s %s\n" "$port" "$status"
    done
}

# =============================================================================
# DISK SPACE DIAGNOSTICS
# =============================================================================

##
# Check disk space for Docker volumes and data directories
#
# Arguments:
#   $1 - Deployment type (hub|spoke)
#   $2 - Instance code (for spoke, e.g., GBR)
##
diag_disk_space() {
    local deploy_type="$1"
    local instance_code="${2:-}"

    echo "  Disk Space"
    echo "  ─────────────────────────────────────────────────────────────────────────────"

    # Check Docker disk usage
    if command -v docker &>/dev/null; then
        local docker_usage
        docker_usage=$(docker system df 2>/dev/null)
        if [ -n "$docker_usage" ]; then
            echo "  Docker System:"
            echo "$docker_usage" | while IFS= read -r line; do
                echo "    $line"
            done
            echo ""
        fi
    fi

    # Check data directory size
    local data_dir
    if [ "$deploy_type" = "hub" ]; then
        data_dir="${DIVE_ROOT}/data/hub"
    else
        local code_lower
        code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
        data_dir="${DIVE_ROOT}/instances/${code_lower}"
    fi

    if [ -d "$data_dir" ]; then
        local dir_size
        dir_size=$(du -sh "$data_dir" 2>/dev/null | awk '{print $1}')
        echo "  Data directory: $data_dir ($dir_size)"
    fi

    # Check log directory size
    local log_dir="${DIVE_ROOT}/.dive-state/logs"
    if [ -d "$log_dir" ]; then
        local log_size log_count
        log_size=$(du -sh "$log_dir" 2>/dev/null | awk '{print $1}')
        log_count=$(find "$log_dir" -name "*.jsonl" 2>/dev/null | wc -l | tr -d ' ')
        echo "  Log directory:  $log_dir ($log_size, $log_count files)"
    fi
}

# =============================================================================
# LOG TAIL DIAGNOSTICS
# =============================================================================

##
# Collect recent log tails from containers
#
# Arguments:
#   $1 - Compose project name
#   $2 - Number of lines per container (default: 5)
##
diag_log_tails() {
    local project="$1"
    local lines="${2:-5}"

    echo "  Recent Logs ($project, last $lines lines each)"
    echo "  ─────────────────────────────────────────────────────────────────────────────"

    if ! command -v docker &>/dev/null; then
        echo "  [!] Docker not available"
        return 1
    fi

    local container_names
    container_names=$(docker ps --filter "label=com.docker.compose.project=$project" \
        --format "{{.Names}}" 2>/dev/null | sort)

    if [ -z "$container_names" ]; then
        echo "  No running containers found"
        return 0
    fi

    local name
    while IFS= read -r name; do
        [ -z "$name" ] && continue
        echo ""
        echo "  --- $name ---"
        docker logs --tail "$lines" "$name" 2>&1 | while IFS= read -r line; do
            echo "    $line"
        done
    done <<< "$container_names"
}

# =============================================================================
# FULL DIAGNOSTIC REPORT
# =============================================================================

##
# Generate a comprehensive diagnostic report
#
# Arguments:
#   $1 - Deployment type (hub|spoke)
#   $2 - Instance code
##
diag_full_report() {
    local deploy_type="$1"
    local instance_code="$2"
    local code_upper
    code_upper=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')
    local code_lower
    code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')

    local project
    if [ "$deploy_type" = "hub" ]; then
        project="dive-hub"
    else
        project="dive-spoke-${code_lower}"
    fi

    echo ""
    echo "==============================================================================="
    echo "  DIVE Diagnostic Report — ${deploy_type^^} ${code_upper}"
    echo "  Generated: $(date)"
    echo "==============================================================================="
    echo ""

    # 1. Container status
    diag_container_status "$project"
    echo ""

    # 2. Resource usage
    diag_container_resources "$project"
    echo ""

    # 3. Certificate expiry
    local cert_dir
    if [ "$deploy_type" = "hub" ]; then
        cert_dir="${DIVE_ROOT}/certs/hub"
    else
        cert_dir="${DIVE_ROOT}/certs/spokes/${code_lower}"
    fi
    diag_cert_expiry "$cert_dir" "${deploy_type^^} ${code_upper}"
    echo ""

    # 4. Port check
    local ports=""
    if [ "$deploy_type" = "hub" ]; then
        ports="443 8443 8080 5432 27017 6379 8181 8200"
    else
        # Spoke ports vary by instance — check common ones
        ports="443 8443 8080 27017 6379"
    fi
    diag_port_check "$ports" "${deploy_type^^} ${code_upper}"
    echo ""

    # 5. Disk space
    diag_disk_space "$deploy_type" "$code_upper"
    echo ""

    # 6. Recent logs
    diag_log_tails "$project" 5
    echo ""

    echo "==============================================================================="
    echo "  End of Diagnostic Report"
    echo "==============================================================================="
    echo ""
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f diag_container_status
export -f diag_container_resources
export -f diag_cert_expiry
export -f diag_port_check
export -f diag_disk_space
export -f diag_log_tails
export -f diag_full_report
