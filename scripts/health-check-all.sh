#!/bin/bash
# =============================================================================
# DIVE V3 - Comprehensive Health Check Script
# =============================================================================
# This script performs comprehensive health checks across all 4 instances
# and optionally triggers auto-rollback on failure.
#
# Usage:
#   ./scripts/health-check-all.sh [OPTIONS]
#
# Options:
#   --instance <name>   Check specific instance only (usa|fra|gbr|deu|all)
#   --service <name>    Check specific service only (frontend|backend|keycloak|opa|kas|all)
#   --auto-rollback     Enable auto-rollback on critical failures
#   --json              Output results in JSON format
#   --quiet             Suppress non-error output
#   --timeout <secs>    HTTP timeout (default: 10)
#   --retries <num>     Number of retries (default: 3)
#
# Exit Codes:
#   0 - All checks passed
#   1 - Some checks failed (non-critical)
#   2 - Critical failures (rollback triggered if enabled)
#
# Examples:
#   ./scripts/health-check-all.sh                          # Check all instances
#   ./scripts/health-check-all.sh --instance usa           # Check USA only
#   ./scripts/health-check-all.sh --auto-rollback          # Enable auto-rollback
#   ./scripts/health-check-all.sh --json                   # JSON output for CI
#
# =============================================================================

set -uo pipefail

# Configuration from federation-registry.json (SSOT)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REGISTRY_FILE="$PROJECT_ROOT/config/federation-registry.json"

# Default options
INSTANCE="all"
SERVICE="all"
AUTO_ROLLBACK=false
JSON_OUTPUT=false
QUIET=false
TIMEOUT=10
RETRIES=3

# Colors (disabled in JSON mode)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Results tracking
declare -A RESULTS
CRITICAL_FAILURES=0
WARNINGS=0
PASSED=0

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --instance)
            INSTANCE="$2"
            shift 2
            ;;
        --service)
            SERVICE="$2"
            shift 2
            ;;
        --auto-rollback)
            AUTO_ROLLBACK=true
            shift
            ;;
        --json)
            JSON_OUTPUT=true
            # Disable colors for JSON mode
            RED='' GREEN='' YELLOW='' BLUE='' CYAN='' NC=''
            shift
            ;;
        --quiet)
            QUIET=true
            shift
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --retries)
            RETRIES="$2"
            shift 2
            ;;
        -h|--help)
            head -45 "$0" | grep -E "^#" | tail -n +2 | sed 's/^# //'
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Logging functions
log_info() {
    [[ "$QUIET" == "false" && "$JSON_OUTPUT" == "false" ]] && echo -e "${GREEN}✅${NC} $1"
}

log_warn() {
    [[ "$QUIET" == "false" && "$JSON_OUTPUT" == "false" ]] && echo -e "${YELLOW}⚠️${NC}  $1"
}

log_error() {
    [[ "$JSON_OUTPUT" == "false" ]] && echo -e "${RED}❌${NC} $1" >&2
}

log_debug() {
    [[ "$QUIET" == "false" && "$JSON_OUTPUT" == "false" ]] && echo -e "${BLUE}🔍${NC} $1"
}

# Get instance configuration from SSOT
get_instance_domain() {
    local inst="$1"
    jq -r ".instances.${inst}.deployment.domain // empty" "$REGISTRY_FILE"
}

get_instance_type() {
    local inst="$1"
    jq -r ".instances.${inst}.type // empty" "$REGISTRY_FILE"
}

# HTTP health check with retries
http_check() {
    local url="$1"
    local expected_status="${2:-200}"
    local description="$3"
    
    local attempt=0
    local status_code=""
    local response_time=""
    
    while [[ $attempt -lt $RETRIES ]]; do
        ((attempt++))
        
        local start_time=$(date +%s%N)
        status_code=$(curl -sk -o /dev/null -w "%{http_code}" \
            --max-time "$TIMEOUT" \
            --connect-timeout 5 \
            "$url" 2>/dev/null || echo "000")
        local end_time=$(date +%s%N)
        
        response_time=$(( (end_time - start_time) / 1000000 ))  # Convert to ms
        
        if [[ "$status_code" =~ ^($expected_status|200|301|302)$ ]]; then
            RESULTS["$description"]="pass:$status_code:${response_time}ms"
            ((PASSED++))
            return 0
        fi
        
        [[ $attempt -lt $RETRIES ]] && sleep 2
    done
    
    RESULTS["$description"]="fail:$status_code:${response_time}ms"
    return 1
}

# Docker container health check (for local instances)
docker_check() {
    local container="$1"
    local description="$2"
    
    local status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "not_found")
    
    if [[ "$status" == "healthy" ]]; then
        RESULTS["$description"]="pass:healthy"
        ((PASSED++))
        return 0
    elif [[ "$status" == "starting" ]]; then
        RESULTS["$description"]="warn:starting"
        ((WARNINGS++))
        return 0
    else
        RESULTS["$description"]="fail:$status"
        return 1
    fi
}

# Check a single instance
check_instance() {
    local inst="$1"
    local inst_upper=$(echo "$inst" | tr '[:lower:]' '[:upper:]')
    local domain=$(get_instance_domain "$inst")
    local inst_type=$(get_instance_type "$inst")
    
    [[ "$JSON_OUTPUT" == "false" ]] && echo ""
    [[ "$JSON_OUTPUT" == "false" ]] && echo -e "${CYAN}━━━ Instance: $inst_upper ($domain) ━━━${NC}"
    
    # Frontend check
    if [[ "$SERVICE" == "all" || "$SERVICE" == "frontend" ]]; then
        local frontend_url="https://${inst}-app.${domain}"
        if http_check "$frontend_url" "200" "${inst_upper}_frontend"; then
            log_info "Frontend: ${frontend_url} (${RESULTS[${inst_upper}_frontend]#*:})"
        else
            log_error "Frontend: ${frontend_url} - FAILED"
            ((CRITICAL_FAILURES++))
        fi
    fi
    
    # Backend health check
    if [[ "$SERVICE" == "all" || "$SERVICE" == "backend" ]]; then
        local backend_url="https://${inst}-api.${domain}/health"
        if http_check "$backend_url" "200" "${inst_upper}_backend"; then
            log_info "Backend:  ${backend_url} (${RESULTS[${inst_upper}_backend]#*:})"
        else
            log_error "Backend:  ${backend_url} - FAILED"
            ((CRITICAL_FAILURES++))
        fi
    fi
    
    # Keycloak health check
    if [[ "$SERVICE" == "all" || "$SERVICE" == "keycloak" ]]; then
        local keycloak_url="https://${inst}-idp.${domain}/health/ready"
        if http_check "$keycloak_url" "200" "${inst_upper}_keycloak"; then
            log_info "Keycloak: ${keycloak_url} (${RESULTS[${inst_upper}_keycloak]#*:})"
        else
            log_error "Keycloak: ${keycloak_url} - FAILED"
            ((CRITICAL_FAILURES++))
        fi
    fi
    
    # Local-only checks (OPA, KAS, Docker containers)
    if [[ "$inst_type" == "local" ]]; then
        # OPA check (via Docker)
        if [[ "$SERVICE" == "all" || "$SERVICE" == "opa" ]]; then
            local opa_container="dive-v3-opa"
            [[ "$inst" != "usa" ]] && opa_container="dive-v3-opa-${inst}"
            
            if docker_check "$opa_container" "${inst_upper}_opa"; then
                log_info "OPA:      Docker container healthy"
            else
                log_warn "OPA:      Docker container ${RESULTS[${inst_upper}_opa]#*:}"
                ((WARNINGS++))
            fi
        fi
        
        # KAS check (via Docker)
        if [[ "$SERVICE" == "all" || "$SERVICE" == "kas" ]]; then
            local kas_container="dive-v3-kas"
            [[ "$inst" != "usa" ]] && kas_container="dive-v3-kas-${inst}"
            
            if docker_check "$kas_container" "${inst_upper}_kas"; then
                log_info "KAS:      Docker container healthy"
            else
                log_warn "KAS:      Docker container ${RESULTS[${inst_upper}_kas]#*:}"
                ((WARNINGS++))
            fi
        fi
    fi
}

# Check shared services (monitoring stack)
check_shared_services() {
    [[ "$JSON_OUTPUT" == "false" ]] && echo ""
    [[ "$JSON_OUTPUT" == "false" ]] && echo -e "${CYAN}━━━ Shared Services ━━━${NC}"
    
    # Prometheus
    if docker_check "prometheus" "SHARED_prometheus"; then
        log_info "Prometheus:    healthy"
    else
        log_warn "Prometheus:    ${RESULTS[SHARED_prometheus]#*:}"
    fi
    
    # Grafana
    if docker_check "grafana" "SHARED_grafana"; then
        log_info "Grafana:       healthy"
    else
        log_warn "Grafana:       ${RESULTS[SHARED_grafana]#*:}"
    fi
    
    # Alertmanager
    if docker_check "alertmanager" "SHARED_alertmanager"; then
        log_info "Alertmanager:  healthy"
    else
        log_warn "Alertmanager:  ${RESULTS[SHARED_alertmanager]#*:}"
    fi
    
    # Blacklist Redis
    if docker_check "blacklist-redis" "SHARED_blacklist_redis"; then
        log_info "Blacklist Redis: healthy"
    else
        log_warn "Blacklist Redis: ${RESULTS[SHARED_blacklist_redis]#*:}"
    fi
}

# Trigger rollback for failed instance
trigger_rollback() {
    local inst="$1"
    
    log_warn "Triggering rollback for $inst..."
    
    if [[ -x "$SCRIPT_DIR/rollback.sh" ]]; then
        "$SCRIPT_DIR/rollback.sh" "$inst" || {
            log_error "Rollback failed for $inst"
            return 1
        }
        log_info "Rollback completed for $inst"
    else
        log_error "Rollback script not found: $SCRIPT_DIR/rollback.sh"
        return 1
    fi
}

# Output JSON results
output_json() {
    echo "{"
    echo "  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
    echo "  \"summary\": {"
    echo "    \"passed\": $PASSED,"
    echo "    \"warnings\": $WARNINGS,"
    echo "    \"critical_failures\": $CRITICAL_FAILURES"
    echo "  },"
    echo "  \"results\": {"
    
    local first=true
    for key in "${!RESULTS[@]}"; do
        [[ "$first" == "false" ]] && echo ","
        first=false
        
        IFS=':' read -r status code latency <<< "${RESULTS[$key]}"
        echo -n "    \"$key\": {\"status\": \"$status\", \"code\": \"$code\", \"latency\": \"$latency\"}"
    done
    
    echo ""
    echo "  },"
    echo "  \"auto_rollback\": $AUTO_ROLLBACK"
    echo "}"
}

# Main execution
main() {
    # Header
    if [[ "$JSON_OUTPUT" == "false" && "$QUIET" == "false" ]]; then
        echo ""
        echo "╔══════════════════════════════════════════════════════════════╗"
        echo "║       DIVE V3 - Comprehensive Health Check                   ║"
        echo "╚══════════════════════════════════════════════════════════════╝"
        echo ""
        echo "  Timestamp:    $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        echo "  Instance:     $INSTANCE"
        echo "  Service:      $SERVICE"
        echo "  Auto-Rollback: $AUTO_ROLLBACK"
        echo "  Timeout:      ${TIMEOUT}s"
        echo "  Retries:      $RETRIES"
    fi
    
    # Validate SSOT exists
    if [[ ! -f "$REGISTRY_FILE" ]]; then
        log_error "Federation registry not found: $REGISTRY_FILE"
        exit 2
    fi
    
    # Check instances
    local instances=()
    if [[ "$INSTANCE" == "all" ]]; then
        instances=(usa fra gbr deu)
    else
        instances=("$INSTANCE")
    fi
    
    for inst in "${instances[@]}"; do
        check_instance "$inst"
    done
    
    # Check shared services (only if checking all or local instances)
    if [[ "$INSTANCE" == "all" ]]; then
        check_shared_services
    fi
    
    # Summary
    if [[ "$JSON_OUTPUT" == "true" ]]; then
        output_json
    else
        echo ""
        echo "╔══════════════════════════════════════════════════════════════╗"
        echo "║                    Health Check Summary                      ║"
        echo "╚══════════════════════════════════════════════════════════════╝"
        echo ""
        echo -e "  ${GREEN}Passed:${NC}            $PASSED"
        echo -e "  ${YELLOW}Warnings:${NC}          $WARNINGS"
        echo -e "  ${RED}Critical Failures:${NC} $CRITICAL_FAILURES"
        echo ""
        
        if [[ $CRITICAL_FAILURES -gt 0 ]]; then
            if [[ "$AUTO_ROLLBACK" == "true" ]]; then
                echo -e "${RED}⚠️  Critical failures detected! Initiating auto-rollback...${NC}"
                echo ""
                
                for inst in "${instances[@]}"; do
                    # Check if this instance has critical failures
                    for key in "${!RESULTS[@]}"; do
                        if [[ "$key" == "${inst^^}_"* && "${RESULTS[$key]}" == fail* ]]; then
                            trigger_rollback "$inst"
                            break
                        fi
                    done
                done
            else
                echo -e "${RED}⚠️  Critical failures detected!${NC}"
                echo "Run with --auto-rollback to enable automatic recovery."
            fi
            echo ""
            exit 2
        elif [[ $WARNINGS -gt 0 ]]; then
            echo -e "${YELLOW}⚠️  Some warnings detected. Review above output.${NC}"
            echo ""
            exit 1
        else
            echo -e "${GREEN}✅ All health checks passed!${NC}"
            echo ""
            exit 0
        fi
    fi
}

main "$@"


