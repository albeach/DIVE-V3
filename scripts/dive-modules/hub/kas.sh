#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - KAS (Key Access Service) Management Module
# =============================================================================
# Comprehensive KAS management across Hub and all Spoke instances.
#
# Commands:
#   status [instance]           - Show KAS service status
#   health [instance]           - Detailed health check (OPA, JWKS, dependencies)
#   logs [instance]             - View KAS logs (with follow mode)
#   config [instance]           - Show current KAS configuration
#   restart [instance]          - Restart KAS service
#   registry list               - List all registered KAS instances
#   registry show <id>          - Show details for a KAS instance
#   registry health             - Health check all registered KAS
#   federation status           - Show federation status
#   federation verify           - Verify cross-KAS connectivity
#   federation test <src> <dst> - Test key request between KAS instances
#   cache status                - Show DEK cache statistics
#   cache flush                 - Flush DEK cache (dangerous)
#   metrics                     - Query KAS Prometheus metrics
#   audit [--last N]            - Query KAS audit logs
#
# Usage:
#   ./dive kas status               # Hub KAS status
#   ./dive kas health               # Detailed hub health
#   ./dive kas logs -f              # Follow KAS logs
#   ./dive kas registry list        # List all KAS instances
#   ./dive kas federation status    # Federation health
#   ./dive kas metrics              # Prometheus metrics
# =============================================================================

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load environment variables
load_gcp_secrets "${INSTANCE:-usa}" 2>/dev/null || true

# =============================================================================
# CONSTANTS
# =============================================================================

# KAS port allocations for NATO countries (base port 8080 + offset)
declare -A NATO_KAS_PORTS=(
    ["usa"]="8080"   # Hub: standard KAS port
    ["fra"]="8081"   # FRA: +1
    ["gbr"]="8082"   # GBR: +2
    ["deu"]="8083"   # DEU: +3
    ["can"]="8084"   # CAN: +4
    ["ita"]="8085"   # ITA: +5
    ["esp"]="8086"   # ESP: +6
    ["nld"]="8087"   # NLD: +7
    ["bel"]="8088"   # BEL: +8
    ["dnk"]="8089"   # DNK: +9
    ["nor"]="8090"   # NOR: +10
    ["swe"]="8091"   # SWE: +11
    ["pol"]="8092"   # POL: +12
    ["rou"]="8093"   # ROU: +13
    ["cze"]="8094"   # CZE: +14
    ["hun"]="8095"   # HUN: +15
    ["svn"]="8096"   # SVN: +16
    ["hrv"]="8097"   # HRV: +17
    ["bgr"]="8098"   # BGR: +18
    ["grc"]="8099"   # GRC: +19
    ["prt"]="8100"   # PRT: +20
    ["aut"]="8101"   # AUT: +21
    ["che"]="8102"   # CHE: +22
    ["fin"]="8103"   # FIN: +23
    ["est"]="8104"   # EST: +24
    ["lva"]="8105"   # LVA: +25
    ["ltu"]="8106"   # LTU: +26
    ["svk"]="8107"   # SVK: +27
    ["alb"]="8108"   # ALB: +28
    ["mne"]="8109"   # MNE: +29
    ["mkd"]="8110"   # MKD: +30
    ["srb"]="8111"   # SRB: +31
    ["tur"]="8112"   # TUR: +32
)

# KAS registry file location
KAS_REGISTRY_FILE="${DIVE_ROOT}/config/kas-registry.json"

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

# Inline logging functions provided by common.sh (log_success_inline, log_error_inline, log_warn_inline)

# Get KAS port for instance
get_kas_port() {
    local instance="${1:-usa}"
    echo "${NATO_KAS_PORTS[$instance]:-8080}"
}

# Get KAS container name for instance
get_kas_container() {
    local instance="${1:-usa}"

    if [ "$instance" = "usa" ]; then
        # Hub KAS container
        echo "dive-hub-kas"
    else
        # Spoke KAS container (format: dive-{instance}-kas)
        echo "dive-${instance}-kas"
    fi
}

# Get KAS internal URL for instance
get_kas_url() {
    local instance="${1:-usa}"
    local port
    port="$(get_kas_port "$instance")"

    echo "https://localhost:${port}"
}

# Execute command inside KAS container
kas_exec() {
    local instance="${1:-usa}"
    local command="$2"
    local container

    container="$(get_kas_container "$instance")"

    if [ "$DRY_RUN" = true ]; then
        log_dry "docker exec $container $command"
        return 0
    fi

    # Check if container exists and is running
    if ! docker ps --format "table {{.Names}}" | grep -q "^${container}$"; then
        echo "ERROR: KAS container '$container' not running"
        return 1
    fi

    docker exec "$container" $command
}

# Query KAS endpoint using wget (available in container)
kas_query() {
    local instance="${1:-usa}"
    local endpoint="${2:-/health}"
    local container

    container="$(get_kas_container "$instance")"

    if [ "$DRY_RUN" = true ]; then
        log_dry "docker exec $container wget --no-check-certificate -qO- https://localhost:8080${endpoint}"
        return 0
    fi

    # Check if container exists
    if ! docker ps --format "table {{.Names}}" | grep -q "^${container}$"; then
        return 1
    fi

    docker exec "$container" wget --no-check-certificate -qO- "https://localhost:8080${endpoint}" 2>/dev/null
}

# Check if KAS is responding
kas_ping() {
    local instance="${1:-usa}"
    local response

    response="$(kas_query "$instance" "/health" 2>/dev/null)"
    if echo "$response" | grep -q '"status":"healthy"'; then
        return 0
    else
        return 1
    fi
}

# =============================================================================
# CORE COMMANDS
# =============================================================================

# Show KAS status for a specific instance
kas_status() {
    local instance="${1:-usa}"

    echo -e "${BOLD}KAS Status - ${instance^^}${NC}"
    echo "Container: $(get_kas_container "$instance")"
    echo "Port: $(get_kas_port "$instance")"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would check KAS status for $instance"
        return 0
    fi

    local container
    container="$(get_kas_container "$instance")"

    # Check if container is running
    if ! docker ps --format "table {{.Names}}" | grep -q "^${container}$"; then
        log_error "KAS container '$container' is not running"
        echo ""
        echo "Start the KAS service with:"
        if [ "$instance" = "usa" ]; then
            echo "  ./dive hub deploy"
        else
            echo "  ./dive --instance $instance spoke up --with-kas"
        fi
        return 1
    fi

    log_success "KAS container is running"
    echo ""

    # Get health info
    local health
    health="$(kas_query "$instance" "/health" 2>/dev/null)"

    if [ -n "$health" ] && echo "$health" | jq -e '.' >/dev/null 2>&1; then
        echo -e "${BOLD}Service Info:${NC}"
        echo "$health" | jq -r '"  Version: \(.version // "N/A")"'
        echo "$health" | jq -r '"  Status: \(.status)"'
        echo "$health" | jq -r '"  Message: \(.message // "N/A")"'
        
        echo ""
        echo -e "${BOLD}Features:${NC}"
        echo "$health" | jq -r '.features[]? // empty' | while read -r feature; do
            echo "  • $feature"
        done

        echo ""
        echo -e "${BOLD}DEK Cache:${NC}"
        echo "$health" | jq -r '"  Cache size: \(.dekCacheSize // 0) keys"'
    else
        log_error "Could not query KAS health endpoint"
        echo "Container is running but KAS may not be responding"
    fi
}

# Detailed KAS health check
kas_health() {
    local instance="${1:-usa}"

    echo -e "${BOLD}KAS Health Check - ${instance^^}${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would perform detailed KAS health check for $instance"
        return 0
    fi

    local checks_passed=0
    local total_checks=0
    local container
    container="$(get_kas_container "$instance")"

    # Check 1: Container running
    total_checks=$((total_checks + 1))
    echo -n "Container running: "
    if docker ps --format "table {{.Names}}" | grep -q "^${container}$"; then
        log_success_inline "PASS"
        checks_passed=$((checks_passed + 1))
    else
        log_error_inline "FAIL"
        echo ""
        echo -e "${BOLD}Health Summary:${NC}"
        echo "Checks passed: $checks_passed/$total_checks"
        log_error "KAS container not running"
        return 1
    fi

    # Check 2: Health endpoint responding
    total_checks=$((total_checks + 1))
    echo -n "Health endpoint: "
    local health
    health="$(kas_query "$instance" "/health" 2>/dev/null)"
    if [ -n "$health" ] && echo "$health" | jq -e '.status == "healthy"' >/dev/null 2>&1; then
        log_success_inline "PASS"
        checks_passed=$((checks_passed + 1))
    else
        log_error_inline "FAIL"
    fi

    # Check 3: OPA connectivity
    total_checks=$((total_checks + 1))
    echo -n "OPA connectivity: "
    local opa_response
    opa_response="$(docker exec "$container" wget --no-check-certificate -qO- http://opa:8181/health 2>/dev/null || echo "")"
    if echo "$opa_response" | grep -q "{}"; then
        log_success_inline "PASS"
        checks_passed=$((checks_passed + 1))
    else
        log_warn_inline "WARN (may be external)"
    fi

    # Check 4: Backend API connectivity
    total_checks=$((total_checks + 1))
    echo -n "Backend API: "
    local backend_response
    backend_response="$(docker exec "$container" wget --no-check-certificate -qO- https://backend:4000/health 2>/dev/null || echo "")"
    if echo "$backend_response" | grep -q "healthy"; then
        log_success_inline "PASS"
        checks_passed=$((checks_passed + 1))
    else
        log_warn_inline "WARN (may be unavailable)"
    fi

    # Check 5: Metrics endpoint
    total_checks=$((total_checks + 1))
    echo -n "Metrics endpoint: "
    local metrics_response
    metrics_response="$(kas_query "$instance" "/metrics" 2>/dev/null)"
    if [ -n "$metrics_response" ] && echo "$metrics_response" | grep -q "kas_"; then
        log_success_inline "PASS"
        checks_passed=$((checks_passed + 1))
    else
        log_warn_inline "WARN"
    fi

    # Check 6: TLS/HTTPS
    total_checks=$((total_checks + 1))
    echo -n "HTTPS enabled: "
    if kas_query "$instance" "/health" >/dev/null 2>&1; then
        log_success_inline "PASS"
        checks_passed=$((checks_passed + 1))
    else
        log_error_inline "FAIL"
    fi

    # Check 7: DEK Cache operational
    total_checks=$((total_checks + 1))
    echo -n "DEK cache: "
    if [ -n "$health" ] && echo "$health" | jq -e '.dekCacheSize != null' >/dev/null 2>&1; then
        local cache_size
        cache_size=$(echo "$health" | jq -r '.dekCacheSize')
        log_success_inline "PASS ($cache_size keys)"
        checks_passed=$((checks_passed + 1))
    else
        log_warn_inline "WARN (could not check)"
    fi

    # Summary
    echo ""
    echo -e "${BOLD}Health Summary:${NC}"
    echo "Checks passed: $checks_passed/$total_checks"

    if [ "$checks_passed" -ge $((total_checks - 2)) ]; then
        log_success "KAS health check passed"
        return 0
    elif [ "$checks_passed" -ge $((total_checks / 2)) ]; then
        log_warn "Some health checks failed (non-critical)"
        return 0
    else
        log_error "Critical health checks failed"
        return 1
    fi
}

# View KAS logs
kas_logs() {
    local instance="${1:-usa}"
    local follow=false
    local lines=100

    # Parse arguments
    shift || true
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -f|--follow)
                follow=true
                shift
                ;;
            -n|--lines)
                lines="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done

    local container
    container="$(get_kas_container "$instance")"

    if [ "$DRY_RUN" = true ]; then
        if [ "$follow" = true ]; then
            log_dry "docker logs -f --tail $lines $container"
        else
            log_dry "docker logs --tail $lines $container"
        fi
        return 0
    fi

    echo -e "${BOLD}KAS Logs - ${instance^^}${NC}"
    echo "Container: $container"
    echo ""

    if [ "$follow" = true ]; then
        docker logs -f --tail "$lines" "$container" 2>&1
    else
        docker logs --tail "$lines" "$container" 2>&1
    fi
}

# Show KAS configuration
kas_config() {
    local instance="${1:-usa}"

    echo -e "${BOLD}KAS Configuration - ${instance^^}${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would show KAS configuration for $instance"
        return 0
    fi

    local container
    container="$(get_kas_container "$instance")"

    if ! docker ps --format "table {{.Names}}" | grep -q "^${container}$"; then
        log_error "KAS container '$container' is not running"
        return 1
    fi

    echo -e "${BOLD}Environment Variables:${NC}"
    docker exec "$container" env 2>/dev/null | grep -E "^(KAS_|OPA_|KEYCLOAK_|BACKEND_|HTTPS_|NODE_)" | sort | while read -r line; do
        # Mask sensitive values
        key=$(echo "$line" | cut -d= -f1)
        value=$(echo "$line" | cut -d= -f2-)
        if echo "$key" | grep -qiE "(password|secret|key|token)"; then
            echo "  $key=***MASKED***"
        else
            echo "  $key=$value"
        fi
    done

    echo ""
    echo -e "${BOLD}KAS Registry:${NC}"
    if [ -f "$KAS_REGISTRY_FILE" ]; then
        echo "  File: $KAS_REGISTRY_FILE"
        echo "  Version: $(jq -r '.version' "$KAS_REGISTRY_FILE" 2>/dev/null || echo "N/A")"
        echo "  KAS Servers: $(jq -r '.kasServers | length' "$KAS_REGISTRY_FILE" 2>/dev/null || echo "0")"
        echo "  Federation: $(jq -r '.federationTrust.crossKASEnabled' "$KAS_REGISTRY_FILE" 2>/dev/null || echo "N/A")"
    else
        log_warn "KAS registry file not found at $KAS_REGISTRY_FILE"
    fi

    echo ""
    echo -e "${BOLD}Network Configuration:${NC}"
    docker inspect "$container" --format '{{range .NetworkSettings.Networks}}  Network: {{.NetworkID | printf "%.12s"}}... ({{.IPAddress}}){{"\n"}}{{end}}' 2>/dev/null
}

# Restart KAS service
kas_restart() {
    local instance="${1:-usa}"

    echo -e "${BOLD}Restart KAS - ${instance^^}${NC}"
    echo ""

    local container
    container="$(get_kas_container "$instance")"

    if [ "$DRY_RUN" = true ]; then
        log_dry "docker restart $container"
        return 0
    fi

    if ! docker ps -a --format "table {{.Names}}" | grep -q "^${container}$"; then
        log_error "KAS container '$container' not found"
        return 1
    fi

    log_info "Restarting KAS container: $container"
    if docker restart "$container" >/dev/null 2>&1; then
        log_success "KAS container restarted"
        
        # Wait for health check
        log_info "Waiting for KAS to become healthy..."
        local attempts=0
        local max_attempts=30
        
        while [ $attempts -lt $max_attempts ]; do
            sleep 2
            if kas_ping "$instance"; then
                log_success "KAS is healthy"
                return 0
            fi
            attempts=$((attempts + 1))
        done
        
        log_warn "KAS did not become healthy within timeout"
        return 1
    else
        log_error "Failed to restart KAS container"
        return 1
    fi
}

# =============================================================================
# EXTENDED COMMANDS (registry, federation, cache, metrics, audit, security, certs)
# =============================================================================
source "$(dirname "${BASH_SOURCE[0]}")/kas-extended.sh"

# =============================================================================
# HELP FUNCTION
# =============================================================================

module_kas_help() {
    cat << EOF
${BOLD}DIVE V3 KAS (Key Access Service) Management Commands${NC}

${BOLD}USAGE:${NC}
  ./dive kas <command> [instance] [options]

${BOLD}CORE COMMANDS:${NC}
  status [instance]           Show KAS service status (default: usa/hub)
  health [instance]           Detailed health check (OPA, JWKS, dependencies)
  logs [instance] [-f]        View KAS logs (with optional follow mode)
  config [instance]           Show current KAS configuration
  restart [instance]          Restart KAS service

${BOLD}REGISTRY COMMANDS:${NC}
  registry list               List all registered KAS instances
  registry show <kas-id>      Show details for a specific KAS instance
  registry health             Health check all registered KAS instances

${BOLD}FEDERATION COMMANDS:${NC}
  federation status           Show federation configuration and status
  federation verify           Verify all cross-KAS trust relationships
  federation test <src> <dst> Test federation between specific KAS instances

${BOLD}CACHE COMMANDS:${NC}
  cache status                Show DEK cache statistics
  cache flush                 Flush DEK cache (restarts KAS)

${BOLD}MONITORING COMMANDS:${NC}
  metrics [instance]          Show KAS Prometheus metrics
  alerts                      Show KAS alert status and configured rules
  audit [--last N]            Query KAS audit logs (default: last 50)

${BOLD}SECURITY COMMANDS:${NC}
  security-audit              Run comprehensive security audit
  certs status                Show certificate status and expiry
  certs rotate                Rotate certificates (with backup)
  test                        Run KAS test suite

${BOLD}INSTANCES:${NC}
  usa, fra, gbr, deu, can, ita, esp, nld, bel, dnk, nor, swe, pol, rou, cze, hun,
  svn, hrv, bgr, grc, prt, aut, che, fin, est, lva, ltu, svk, alb, mne, mkd, srb, tur

${BOLD}EXAMPLES:${NC}
  ./dive kas status                      # Hub KAS status
  ./dive kas health                      # Detailed hub health check
  ./dive kas logs -f                     # Follow hub KAS logs
  ./dive kas registry list               # List all registered KAS
  ./dive kas registry show fra-kas       # Show France KAS details
  ./dive kas registry health             # Health check all KAS
  ./dive kas federation status           # Show federation status
  ./dive kas federation verify           # Verify all trust relationships
  ./dive kas federation test usa-kas fra-kas  # Test USA-France federation
  ./dive kas metrics                     # Show Prometheus metrics
  ./dive kas audit --last 100            # Show last 100 audit events

${BOLD}NOTES:${NC}
  - KAS implements NATO ACP-240 Key Access Service
  - Policy-bound encryption: OPA re-evaluation before key release
  - All key access events are audit logged
  - Use --dry-run to see what would be executed without running commands
  - KAS registry is defined in config/kas-registry.json

EOF
}

# =============================================================================
# MODULE ENTRY POINT
# =============================================================================

module_kas() {
    local subcommand="${1:-help}"
    shift || true

    print_header

    case "$subcommand" in
        # Core commands
        status)
            kas_status "$@"
            ;;
        health)
            kas_health "$@"
            ;;
        logs)
            kas_logs "${INSTANCE:-usa}" "$@"
            ;;
        config)
            kas_config "$@"
            ;;
        restart)
            kas_restart "$@"
            ;;

        # Registry commands
        registry)
            local reg_cmd="${1:-list}"
            shift || true
            case "$reg_cmd" in
                list)
                    kas_registry_list "$@"
                    ;;
                show)
                    kas_registry_show "$@"
                    ;;
                health)
                    kas_registry_health "$@"
                    ;;
                *)
                    log_error "Unknown registry command '$reg_cmd'"
                    echo "Available: list, show, health"
                    exit 1
                    ;;
            esac
            ;;

        # Federation commands
        federation|fed)
            local fed_cmd="${1:-status}"
            shift || true
            case "$fed_cmd" in
                status)
                    kas_federation_status "$@"
                    ;;
                verify)
                    kas_federation_verify "$@"
                    ;;
                test)
                    kas_federation_test "$@"
                    ;;
                *)
                    log_error "Unknown federation command '$fed_cmd'"
                    echo "Available: status, verify, test"
                    exit 1
                    ;;
            esac
            ;;

        # Cache commands
        cache)
            local cache_cmd="${1:-status}"
            shift || true
            case "$cache_cmd" in
                status)
                    kas_cache_status "$@"
                    ;;
                flush)
                    kas_cache_flush "$@"
                    ;;
                *)
                    log_error "Unknown cache command '$cache_cmd'"
                    echo "Available: status, flush"
                    exit 1
                    ;;
            esac
            ;;

        # Monitoring commands
        metrics)
            kas_metrics "$@"
            ;;
        alerts)
            kas_alerts "$@"
            ;;
        audit)
            kas_audit "${INSTANCE:-usa}" "$@"
            ;;

        # Security commands
        security-audit|security|audit-security)
            kas_security_audit "$@"
            ;;

        # Certificate commands
        certs|certificates)
            kas_certs "$@"
            ;;

        # Test command
        test)
            kas_test "$@"
            ;;

        # Help
        help|--help|-h)
            module_kas_help
            ;;

        # Unknown command
        *)
            log_error "Unknown KAS command '$subcommand'"
            echo ""
            module_kas_help
            exit 1
            ;;
    esac
}
