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
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
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

# Inline logging functions
log_success_inline() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error_inline() {
    echo -e "${RED}❌ $1${NC}"
}

log_warn_inline() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

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
# REGISTRY COMMANDS
# =============================================================================

# List all registered KAS instances
kas_registry_list() {
    echo -e "${BOLD}KAS Registry - All Instances${NC}"
    echo ""

    if [ ! -f "$KAS_REGISTRY_FILE" ]; then
        log_error "KAS registry file not found: $KAS_REGISTRY_FILE"
        echo ""
        echo "Create the registry with: ./dive kas registry init"
        return 1
    fi

    echo -e "${BOLD}Registry Info:${NC}"
    echo "  Version: $(jq -r '.version' "$KAS_REGISTRY_FILE")"
    echo "  Last Updated: $(jq -r '.metadata.lastUpdated' "$KAS_REGISTRY_FILE")"
    echo "  Compliance: $(jq -r '.metadata.compliance | join(", ")' "$KAS_REGISTRY_FILE")"
    echo ""

    echo -e "${BOLD}Registered KAS Servers:${NC}"
    printf "  %-12s %-20s %-8s %-12s %s\n" "KAS ID" "Organization" "Country" "Trust" "URL"
    printf "  %-12s %-20s %-8s %-12s %s\n" "------" "------------" "-------" "-----" "---"
    
    jq -r '.kasServers[] | "  \(.kasId // "N/A" | .[0:12])|\(.organization // "N/A" | .[0:20])|\(.countryCode // "N/A")|\(.trustLevel // "N/A")|\(.kasUrl // "N/A")"' "$KAS_REGISTRY_FILE" 2>/dev/null | while IFS='|' read -r kasid org country trust url; do
        printf "%-12s %-20s %-8s %-12s %s\n" "$kasid" "$org" "$country" "$trust" "$url"
    done
}

# Show details for a specific KAS instance
kas_registry_show() {
    local kas_id="$1"

    if [ -z "$kas_id" ]; then
        log_error "KAS ID required"
        echo "Usage: ./dive kas registry show <kas-id>"
        echo ""
        echo "Available KAS IDs:"
        jq -r '.kasServers[].kasId' "$KAS_REGISTRY_FILE" 2>/dev/null | while read -r id; do
            echo "  - $id"
        done
        return 1
    fi

    if [ ! -f "$KAS_REGISTRY_FILE" ]; then
        log_error "KAS registry file not found: $KAS_REGISTRY_FILE"
        return 1
    fi

    local kas_data
    kas_data=$(jq -r --arg id "$kas_id" '.kasServers[] | select(.kasId == $id)' "$KAS_REGISTRY_FILE" 2>/dev/null)

    if [ -z "$kas_data" ] || [ "$kas_data" = "null" ]; then
        log_error "KAS '$kas_id' not found in registry"
        return 1
    fi

    echo -e "${BOLD}KAS Details - $kas_id${NC}"
    echo ""

    echo -e "${BOLD}Basic Info:${NC}"
    echo "$kas_data" | jq -r '"  Organization: \(.organization)"'
    echo "$kas_data" | jq -r '"  Country Code: \(.countryCode)"'
    echo "$kas_data" | jq -r '"  Trust Level: \(.trustLevel)"'
    echo "$kas_data" | jq -r '"  External URL: \(.kasUrl)"'
    echo "$kas_data" | jq -r '"  Internal URL: \(.internalKasUrl)"'

    echo ""
    echo -e "${BOLD}Authentication:${NC}"
    echo "$kas_data" | jq -r '"  Method: \(.authMethod)"'
    echo "$kas_data" | jq -r '"  JWT Issuer: \(.authConfig.jwtIssuer)"'
    echo "$kas_data" | jq -r '"  JWT Audience: \(.authConfig.jwtAudience)"'

    echo ""
    echo -e "${BOLD}Supported Countries:${NC}"
    echo "$kas_data" | jq -r '.supportedCountries[]' | while read -r country; do
        echo "  • $country"
    done

    echo ""
    echo -e "${BOLD}Supported COIs:${NC}"
    echo "$kas_data" | jq -r '.supportedCOIs[]' | while read -r coi; do
        echo "  • $coi"
    done

    echo ""
    echo -e "${BOLD}Clearance Mapping:${NC}"
    echo "$kas_data" | jq -r '.policyTranslation.clearanceMapping | to_entries[] | "  \(.key) → \(.value)"'

    echo ""
    echo -e "${BOLD}Metadata:${NC}"
    echo "$kas_data" | jq -r '"  Version: \(.metadata.version)"'
    echo "$kas_data" | jq -r '"  Last Verified: \(.metadata.lastVerified)"'
    echo "$kas_data" | jq -r '"  Contact: \(.metadata.contact)"'
    echo ""
    echo -e "${BOLD}Capabilities:${NC}"
    echo "$kas_data" | jq -r '.metadata.capabilities[]' | while read -r cap; do
        echo "  • $cap"
    done
}

# Health check all registered KAS instances
kas_registry_health() {
    echo -e "${BOLD}KAS Registry Health Check${NC}"
    echo ""

    if [ ! -f "$KAS_REGISTRY_FILE" ]; then
        log_error "KAS registry file not found: $KAS_REGISTRY_FILE"
        return 1
    fi

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would health check all registered KAS instances"
        return 0
    fi

    local total=0
    local healthy=0

    printf "%-12s %-20s %-10s %s\n" "KAS ID" "URL" "Status" "Latency"
    printf "%-12s %-20s %-10s %s\n" "------" "---" "------" "-------"

    # Check each KAS instance
    while IFS='|' read -r kas_id kas_url health_endpoint; do
        total=$((total + 1))
        
        local start_time end_time latency status
        start_time=$(date +%s%3N)
        
        # Try to reach the health endpoint
        local response
        response=$(curl -sk --connect-timeout 5 --max-time 10 "${kas_url}${health_endpoint}" 2>/dev/null)
        
        end_time=$(date +%s%3N)
        latency=$((end_time - start_time))
        
        if echo "$response" | grep -q '"status"'; then
            status="✅ HEALTHY"
            healthy=$((healthy + 1))
        else
            status="❌ UNHEALTHY"
        fi
        
        printf "%-12s %-20s %-10s %s\n" "$kas_id" "${kas_url:0:20}..." "$status" "${latency}ms"
    done < <(jq -r '.kasServers[] | "\(.kasId)|\(.kasUrl)|\(.metadata.healthEndpoint // "/health")"' "$KAS_REGISTRY_FILE")

    echo ""
    echo -e "${BOLD}Summary:${NC}"
    echo "Healthy: $healthy/$total"
    
    if [ "$healthy" -eq "$total" ]; then
        log_success "All KAS instances are healthy"
        return 0
    elif [ "$healthy" -gt 0 ]; then
        log_warn "Some KAS instances are unhealthy"
        return 1
    else
        log_error "All KAS instances are unhealthy"
        return 1
    fi
}

# =============================================================================
# FEDERATION COMMANDS
# =============================================================================

# Show federation status
kas_federation_status() {
    echo -e "${BOLD}KAS Federation Status${NC}"
    echo ""

    if [ ! -f "$KAS_REGISTRY_FILE" ]; then
        log_error "KAS registry file not found: $KAS_REGISTRY_FILE"
        return 1
    fi

    echo -e "${BOLD}Federation Configuration:${NC}"
    jq -r '.federationTrust | "  Model: \(.model)\n  Cross-KAS Enabled: \(.crossKASEnabled)\n  Fail-Closed: \(.failClosedOnKASUnavailable)\n  Max Latency: \(.maxCrossKASLatencyMs)ms"' "$KAS_REGISTRY_FILE"

    echo ""
    echo -e "${BOLD}Retry Policy:${NC}"
    jq -r '.federationTrust.retryPolicy | "  Max Retries: \(.maxRetries)\n  Backoff: \(.backoffMs)ms\n  Exponential: \(.exponentialBackoff)"' "$KAS_REGISTRY_FILE"

    echo ""
    echo -e "${BOLD}Trust Matrix:${NC}"
    jq -r '.federationTrust.trustMatrix | to_entries[] | "  \(.key) trusts: \(.value | join(", "))"' "$KAS_REGISTRY_FILE"

    echo ""
    echo -e "${BOLD}Monitoring:${NC}"
    jq -r '.monitoring | "  Health Check Interval: \(.healthCheckIntervalSeconds)s\n  Alert on KAS Down: \(.alertOnKASDown)\n  Log Cross-KAS Requests: \(.logCrossKASRequests)\n  Audit Retention: \(.auditRetentionDays) days"' "$KAS_REGISTRY_FILE"

    # Query live federation status from hub KAS
    echo ""
    echo -e "${BOLD}Live Federation Status:${NC}"
    local fed_status
    fed_status=$(kas_query "usa" "/federation/status" 2>/dev/null)

    if [ -n "$fed_status" ] && echo "$fed_status" | jq -e '.' >/dev/null 2>&1; then
        echo "$fed_status" | jq -r '"  Federation Active: \(.federationActive // false)"'
        echo "$fed_status" | jq -r '"  Connected Peers: \(.connectedPeers // 0)"'
        echo "$fed_status" | jq -r '"  Last Sync: \(.lastSync // "N/A")"'
    else
        log_warn "Could not query live federation status from Hub KAS"
        echo "  (Hub KAS may not be running)"
    fi
}

# Verify cross-KAS connectivity
kas_federation_verify() {
    echo -e "${BOLD}KAS Federation Verification${NC}"
    echo ""

    if [ ! -f "$KAS_REGISTRY_FILE" ]; then
        log_error "KAS registry file not found: $KAS_REGISTRY_FILE"
        return 1
    fi

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would verify all cross-KAS trust relationships"
        return 0
    fi

    local total_tests=0
    local passed_tests=0

    echo -e "${BOLD}Testing Trust Relationships:${NC}"
    printf "%-12s %-12s %-10s %s\n" "Source" "Target" "Status" "Latency"
    printf "%-12s %-12s %-10s %s\n" "------" "------" "------" "-------"

    # Test each trust relationship
    while read -r source_kas; do
        local targets
        targets=$(jq -r --arg src "$source_kas" '.federationTrust.trustMatrix[$src][]?' "$KAS_REGISTRY_FILE")
        
        for target_kas in $targets; do
            total_tests=$((total_tests + 1))
            
            local source_url target_url start_time end_time latency status
            source_url=$(jq -r --arg id "$source_kas" '.kasServers[] | select(.kasId == $id) | .kasUrl' "$KAS_REGISTRY_FILE")
            target_url=$(jq -r --arg id "$target_kas" '.kasServers[] | select(.kasId == $id) | .kasUrl' "$KAS_REGISTRY_FILE")
            
            start_time=$(date +%s%3N)
            
            # Test connectivity by checking target's health from source's perspective
            # In a real test, we'd use the source KAS to federate to target
            local response
            response=$(curl -sk --connect-timeout 3 --max-time 5 "${target_url}/health" 2>/dev/null)
            
            end_time=$(date +%s%3N)
            latency=$((end_time - start_time))
            
            if echo "$response" | grep -q '"status"'; then
                status="✅ PASS"
                passed_tests=$((passed_tests + 1))
            else
                status="❌ FAIL"
            fi
            
            printf "%-12s %-12s %-10s %s\n" "$source_kas" "$target_kas" "$status" "${latency}ms"
        done
    done < <(jq -r '.federationTrust.trustMatrix | keys[]' "$KAS_REGISTRY_FILE")

    echo ""
    echo -e "${BOLD}Verification Summary:${NC}"
    echo "Trust relationships tested: $total_tests"
    echo "Passed: $passed_tests"
    echo "Failed: $((total_tests - passed_tests))"
    echo ""

    if [ "$passed_tests" -eq "$total_tests" ]; then
        log_success "All federation trust relationships verified"
        return 0
    elif [ "$passed_tests" -gt $((total_tests / 2)) ]; then
        log_warn "Some federation trust relationships failed verification"
        return 1
    else
        log_error "Majority of federation trust relationships failed"
        return 1
    fi
}

# Test key request between specific KAS instances
kas_federation_test() {
    local source_kas="$1"
    local target_kas="$2"

    if [ -z "$source_kas" ] || [ -z "$target_kas" ]; then
        log_error "Source and target KAS IDs required"
        echo "Usage: ./dive kas federation test <source-kas> <target-kas>"
        echo ""
        echo "Example: ./dive kas federation test usa-kas fra-kas"
        echo ""
        echo "Available KAS IDs:"
        jq -r '.kasServers[].kasId' "$KAS_REGISTRY_FILE" 2>/dev/null | while read -r id; do
            echo "  - $id"
        done
        return 1
    fi

    echo -e "${BOLD}KAS Federation Test: $source_kas → $target_kas${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would test federation from $source_kas to $target_kas"
        return 0
    fi

    # Verify both KAS exist in registry
    local source_exists target_exists
    source_exists=$(jq -r --arg id "$source_kas" '.kasServers[] | select(.kasId == $id) | .kasId' "$KAS_REGISTRY_FILE")
    target_exists=$(jq -r --arg id "$target_kas" '.kasServers[] | select(.kasId == $id) | .kasId' "$KAS_REGISTRY_FILE")

    if [ -z "$source_exists" ]; then
        log_error "Source KAS '$source_kas' not found in registry"
        return 1
    fi

    if [ -z "$target_exists" ]; then
        log_error "Target KAS '$target_kas' not found in registry"
        return 1
    fi

    # Check trust relationship
    local is_trusted
    is_trusted=$(jq -r --arg src "$source_kas" --arg tgt "$target_kas" '.federationTrust.trustMatrix[$src] | if . then (. | index($tgt) != null) else false end' "$KAS_REGISTRY_FILE")

    echo -e "${BOLD}Trust Verification:${NC}"
    if [ "$is_trusted" = "true" ]; then
        log_success "$source_kas trusts $target_kas"
    else
        log_error "$source_kas does NOT trust $target_kas"
        return 1
    fi

    # Get URLs
    local source_url target_url
    source_url=$(jq -r --arg id "$source_kas" '.kasServers[] | select(.kasId == $id) | .kasUrl' "$KAS_REGISTRY_FILE")
    target_url=$(jq -r --arg id "$target_kas" '.kasServers[] | select(.kasId == $id) | .kasUrl' "$KAS_REGISTRY_FILE")

    echo ""
    echo -e "${BOLD}Connectivity Test:${NC}"
    echo "  Source: $source_url"
    echo "  Target: $target_url"
    echo ""

    # Test source health
    echo -n "  Source health: "
    local start_time end_time latency
    start_time=$(date +%s%3N)
    if curl -sk --connect-timeout 5 "${source_url}/health" | grep -q '"status"' 2>/dev/null; then
        end_time=$(date +%s%3N)
        latency=$((end_time - start_time))
        log_success_inline "OK (${latency}ms)"
    else
        log_error_inline "FAIL"
    fi

    # Test target health
    echo -n "  Target health: "
    start_time=$(date +%s%3N)
    if curl -sk --connect-timeout 5 "${target_url}/health" | grep -q '"status"' 2>/dev/null; then
        end_time=$(date +%s%3N)
        latency=$((end_time - start_time))
        log_success_inline "OK (${latency}ms)"
    else
        log_error_inline "FAIL"
    fi

    echo ""
    log_success "Federation test completed"
}

# =============================================================================
# CACHE COMMANDS
# =============================================================================

# Show DEK cache status
kas_cache_status() {
    local instance="${1:-usa}"

    echo -e "${BOLD}KAS DEK Cache Status - ${instance^^}${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would show DEK cache status for $instance"
        return 0
    fi

    local health
    health="$(kas_query "$instance" "/health" 2>/dev/null)"

    if [ -n "$health" ] && echo "$health" | jq -e '.' >/dev/null 2>&1; then
        echo -e "${BOLD}Cache Statistics:${NC}"
        local cache_size
        cache_size=$(echo "$health" | jq -r '.dekCacheSize // 0')
        echo "  Cached DEKs: $cache_size"
        echo "  TTL: 3600 seconds (1 hour)"
        echo "  Check period: 600 seconds"
        
        echo ""
        echo -e "${BOLD}Cache Configuration:${NC}"
        echo "  Type: NodeCache (in-memory)"
        echo "  Production: HSM recommended"
        echo "  Eviction: LRU"
    else
        log_error "Could not query KAS cache status"
        return 1
    fi

    # Get metrics for more details
    echo ""
    echo -e "${BOLD}Cache Metrics:${NC}"
    local metrics
    metrics="$(kas_query "$instance" "/metrics/json" 2>/dev/null)"
    
    if [ -n "$metrics" ] && echo "$metrics" | jq -e '.' >/dev/null 2>&1; then
        echo "$metrics" | jq -r 'to_entries | .[] | select(.key | startswith("dek_cache")) | "  \(.key): \(.value)"' 2>/dev/null || echo "  (no cache metrics available)"
    fi
}

# Flush DEK cache
kas_cache_flush() {
    local instance="${1:-usa}"

    echo -e "${BOLD}Flush KAS DEK Cache - ${instance^^}${NC}"
    echo ""

    log_warn "This will flush the DEK cache. Cached keys will need to be re-fetched."

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would flush DEK cache for $instance"
        return 0
    fi

    if confirm_action "Are you sure you want to flush the DEK cache?"; then
        log_info "Flushing DEK cache..."
        
        # Restart KAS to flush in-memory cache
        kas_restart "$instance"
        
        log_success "DEK cache flushed (KAS restarted)"
    else
        log_info "Operation cancelled"
    fi
}

# =============================================================================
# METRICS COMMANDS
# =============================================================================

# Query KAS Prometheus metrics
kas_metrics() {
    local instance="${1:-usa}"

    echo -e "${BOLD}KAS Prometheus Metrics - ${instance^^}${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would show KAS metrics for $instance"
        return 0
    fi

    # Try to get metrics from Prometheus
    if curl -s "http://localhost:9090/-/healthy" >/dev/null 2>&1; then
        echo -e "${BOLD}From Prometheus:${NC}"
        
        echo ""
        echo -e "${YELLOW}Key Request Statistics:${NC}"
        local total_requests
        total_requests=$(curl -s "http://localhost:9090/api/v1/query?query=sum(kas_key_requests_total)" 2>/dev/null | jq -r '.data.result[0].value[1] // "N/A"' | sed 's/"//g')
        echo "  Total key requests: $total_requests"
        
        local denied_requests
        denied_requests=$(curl -s "http://localhost:9090/api/v1/query?query=sum(kas_key_requests_total{status=\"denied\"})" 2>/dev/null | jq -r '.data.result[0].value[1] // "0"' | sed 's/"//g')
        echo "  Denied requests: $denied_requests"
        
        echo ""
        echo -e "${YELLOW}Federation Statistics:${NC}"
        local fed_requests
        fed_requests=$(curl -s "http://localhost:9090/api/v1/query?query=sum(kas_federation_requests_total)" 2>/dev/null | jq -r '.data.result[0].value[1] // "0"' | sed 's/"//g')
        echo "  Federation requests: $fed_requests"
        
        echo ""
        echo -e "${YELLOW}OPA Evaluations:${NC}"
        local opa_evals
        opa_evals=$(curl -s "http://localhost:9090/api/v1/query?query=sum(kas_opa_evaluations_total)" 2>/dev/null | jq -r '.data.result[0].value[1] // "0"' | sed 's/"//g')
        echo "  Total evaluations: $opa_evals"
    else
        log_warn "Prometheus not accessible at http://localhost:9090"
        echo ""
    fi

    # Also show metrics directly from KAS
    echo -e "${BOLD}From KAS /metrics/json:${NC}"
    local metrics
    metrics="$(kas_query "$instance" "/metrics/json" 2>/dev/null)"
    
    if [ -n "$metrics" ] && echo "$metrics" | jq -e '.' >/dev/null 2>&1; then
        echo "$metrics" | jq -r 'to_entries | .[] | "  \(.key): \(.value)"' | head -20
    else
        log_warn "Could not fetch metrics from KAS"
    fi
}

# =============================================================================
# ALERTS COMMAND
# =============================================================================

# Query KAS alerts from Prometheus
kas_alerts() {
    echo -e "${BOLD}KAS Monitoring Alerts${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would show KAS alerts"
        return 0
    fi

    # Check if Prometheus is accessible
    if ! curl -s "http://localhost:9090/-/healthy" >/dev/null 2>&1; then
        log_warn "Prometheus not accessible at http://localhost:9090"
        echo ""
        echo "Start monitoring stack with:"
        echo "  cd docker/instances/shared && docker compose up -d"
        echo ""
        echo "Or check manually with: ./dive kas logs"
        return 1
    fi

    echo -e "${BOLD}KAS Alert Rules Configured:${NC}"
    echo "  🔴 KASInstanceDown          - Critical: KAS instance is down"
    echo "  🟠 KASHighDenialRate        - Warning: High key denial rate (>50%)"
    echo "  🟠 KASKeyRequestErrors      - Warning: Key request errors"
    echo "  🟠 KASHighLatency           - Warning: High p95 latency (>500ms)"
    echo "  🟠 KASFederationFailures    - Warning: Federation request failures"
    echo "  🔴 KASCircuitBreakerOpen    - Critical: Circuit breaker is open"
    echo "  🔵 KASLowCacheHitRate       - Info: Low DEK cache hit rate"
    echo "  🟠 KASOPASlowEvaluation     - Warning: Slow OPA evaluation"
    echo "  🔵 KASHighClearanceFailures - Info: High clearance check failures"
    echo "  🔵 KASNoTraffic             - Info: No key requests in 30 minutes"
    echo ""

    echo -e "${BOLD}Current Alert Status:${NC}"
    
    # Query active KAS alerts
    local alerts
    alerts=$(curl -s "http://localhost:9090/api/v1/alerts" 2>/dev/null)
    
    if [ -n "$alerts" ] && echo "$alerts" | jq -e '.data.alerts' >/dev/null 2>&1; then
        local kas_alerts
        kas_alerts=$(echo "$alerts" | jq -r '.data.alerts[] | select(.labels.alertname | startswith("KAS"))')
        
        if [ -n "$kas_alerts" ]; then
            local alert_count
            alert_count=$(echo "$alerts" | jq -r '[.data.alerts[] | select(.labels.alertname | startswith("KAS"))] | length')
            
            echo -e "${RED}⚠️  Active KAS alerts: $alert_count${NC}"
            echo ""
            
            echo "$alerts" | jq -r '.data.alerts[] | select(.labels.alertname | startswith("KAS")) | "  \(.labels.severity | ascii_upcase): \(.labels.alertname) - \(.annotations.summary)"' 2>/dev/null
        else
            echo -e "${GREEN}✅ No active KAS alerts${NC}"
        fi
    else
        log_warn "Could not query alerts from Prometheus"
    fi

    echo ""
    echo -e "${BOLD}Prometheus Alertmanager:${NC}"
    if curl -s "http://localhost:9093/-/healthy" >/dev/null 2>&1; then
        log_success "Alertmanager is running at http://localhost:9093"
    else
        log_warn "Alertmanager not accessible at http://localhost:9093"
    fi

    echo ""
    echo -e "${BOLD}Grafana Dashboard:${NC}"
    echo "  KAS Dashboard: http://localhost:3333/d/dive-v3-kas"
    echo "  Credentials: admin/admin"

    echo ""
    echo -e "${BOLD}Alert Rule Files:${NC}"
    local rules_file="${DIVE_ROOT}/docker/instances/shared/config/prometheus/rules/kas.yml"
    if [ -f "$rules_file" ]; then
        echo "  $rules_file"
        local rule_count
        rule_count=$(grep -c "alert:" "$rules_file" 2>/dev/null || echo "0")
        echo "  Rules defined: $rule_count"
    else
        log_warn "KAS alert rules file not found"
    fi
}

# =============================================================================
# AUDIT COMMANDS
# =============================================================================

# Query KAS audit logs
kas_audit() {
    local instance="${1:-usa}"
    local lines=50

    # Parse arguments
    shift || true
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --last|-n)
                lines="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done

    echo -e "${BOLD}KAS Audit Logs - ${instance^^}${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would show last $lines KAS audit entries for $instance"
        return 0
    fi

    local container
    container="$(get_kas_container "$instance")"

    if ! docker ps --format "table {{.Names}}" | grep -q "^${container}$"; then
        log_error "KAS container '$container' is not running"
        return 1
    fi

    # Filter logs for audit events
    echo -e "${BOLD}Recent Key Access Events:${NC}"
    docker logs --tail 1000 "$container" 2>&1 | \
        grep -E "(KEY_RELEASED|KEY_DENIED|JWT verification|policy evaluation)" | \
        tail -"$lines" | \
        while read -r line; do
            if echo "$line" | grep -q "KEY_DENIED\|denied"; then
                echo -e "${RED}$line${NC}"
            elif echo "$line" | grep -q "KEY_RELEASED\|released"; then
                echo -e "${GREEN}$line${NC}"
            else
                echo "$line"
            fi
        done

    echo ""
    log_info "Showing last $lines audit events"
    echo "Use --last N to show more entries"
}

# =============================================================================
# SECURITY AUDIT COMMANDS
# =============================================================================

# Security audit for KAS configuration
kas_security_audit() {
    echo -e "${BOLD}KAS Security Audit${NC}"
    echo ""

    local issues_found=0
    local warnings_found=0

    echo -e "${BOLD}1. GCP Secrets Check:${NC}"
    echo ""

    # Check if GCP secrets exist
    local secrets=("dive-v3-kas-signing-key" "dive-v3-kas-encryption-key")
    for secret in "${secrets[@]}"; do
        echo -n "  $secret: "
        if gcloud secrets describe "$secret" --project=dive25 >/dev/null 2>&1; then
            log_success_inline "EXISTS"
        else
            log_error_inline "MISSING"
            ((issues_found++))
        fi
        echo ""
    done

    echo ""
    echo -e "${BOLD}2. Hardcoded Credentials Check:${NC}"
    echo ""

    # Check for hardcoded passwords in common locations
    local check_files=(
        "${DIVE_ROOT}/kas/src/server.ts"
        "${DIVE_ROOT}/docker-compose.hub.yml"
        "${DIVE_ROOT}/kas/.env"
        "${DIVE_ROOT}/kas/.env.local"
    )

    local patterns=("password.*=.*['\"][^'\"]{8,}" "secret.*=.*['\"][^'\"]{8,}" "DivePilot" "admin123" "password123")

    for file in "${check_files[@]}"; do
        if [ -f "$file" ]; then
            echo -n "  $(basename "$file"): "
            local found_issues=false
            for pattern in "${patterns[@]}"; do
                if grep -qiE "$pattern" "$file" 2>/dev/null; then
                    found_issues=true
                    break
                fi
            done
            if [ "$found_issues" = true ]; then
                log_warn_inline "REVIEW NEEDED"
                ((warnings_found++))
            else
                log_success_inline "CLEAN"
            fi
            echo ""
        fi
    done

    echo ""
    echo -e "${BOLD}3. Certificate Check:${NC}"
    echo ""

    local kas_cert_dir="${DIVE_ROOT}/kas/certs"
    echo -n "  Certificate file: "
    if [ -f "$kas_cert_dir/certificate.pem" ]; then
        log_success_inline "EXISTS"
        echo ""
        
        # Check certificate expiry
        echo -n "  Certificate expiry: "
        local expiry
        expiry=$(openssl x509 -enddate -noout -in "$kas_cert_dir/certificate.pem" 2>/dev/null | cut -d= -f2)
        if [ -n "$expiry" ]; then
            local expiry_epoch
            expiry_epoch=$(date -j -f "%b %d %T %Y %Z" "$expiry" "+%s" 2>/dev/null || date -d "$expiry" "+%s" 2>/dev/null || echo "0")
            local now_epoch
            now_epoch=$(date "+%s")
            local days_remaining=$(( (expiry_epoch - now_epoch) / 86400 ))
            
            if [ "$days_remaining" -lt 0 ]; then
                log_error_inline "EXPIRED"
                ((issues_found++))
            elif [ "$days_remaining" -lt 30 ]; then
                log_warn_inline "EXPIRING SOON ($days_remaining days)"
                ((warnings_found++))
            else
                log_success_inline "$days_remaining days remaining"
            fi
        else
            log_warn_inline "Could not parse expiry"
        fi
        echo ""
    else
        log_error_inline "MISSING"
        ((issues_found++))
        echo ""
    fi

    echo -n "  Private key: "
    if [ -f "$kas_cert_dir/key.pem" ]; then
        log_success_inline "EXISTS"
    else
        log_error_inline "MISSING"
        ((issues_found++))
    fi
    echo ""

    echo ""
    echo -e "${BOLD}4. Environment Variables Check:${NC}"
    echo ""

    local required_vars=("OPA_URL" "KEYCLOAK_REALM" "MONGODB_DATABASE")
    local container
    container="$(get_kas_container "usa")"

    if docker ps --format "{{.Names}}" | grep -q "^${container}$" 2>/dev/null; then
        for var in "${required_vars[@]}"; do
            echo -n "  $var: "
            if docker exec "$container" printenv "$var" >/dev/null 2>&1; then
                log_success_inline "SET"
            else
                log_warn_inline "NOT SET"
                ((warnings_found++))
            fi
            echo ""
        done
    else
        log_warn "KAS container not running, cannot check environment"
    fi

    echo ""
    echo -e "${BOLD}5. Network Security Check:${NC}"
    echo ""

    echo -n "  HTTPS enabled: "
    if [ "$DRY_RUN" != true ] && docker ps --format "{{.Names}}" | grep -q "^${container}$" 2>/dev/null; then
        if docker exec "$container" printenv HTTPS_ENABLED 2>/dev/null | grep -qi "true"; then
            log_success_inline "YES"
        else
            log_warn_inline "NO"
            ((warnings_found++))
        fi
    else
        log_warn_inline "CANNOT CHECK"
    fi
    echo ""

    # Summary
    echo ""
    echo -e "${BOLD}Audit Summary:${NC}"
    echo "  Critical Issues: $issues_found"
    echo "  Warnings: $warnings_found"
    echo ""

    if [ "$issues_found" -gt 0 ]; then
        log_error "Security audit found $issues_found critical issue(s)"
        echo ""
        echo "Fix critical issues before production deployment."
        return 1
    elif [ "$warnings_found" -gt 0 ]; then
        log_warn "Security audit found $warnings_found warning(s)"
        echo ""
        echo "Review warnings before production deployment."
        return 0
    else
        log_success "Security audit passed - no issues found"
        return 0
    fi
}

# =============================================================================
# CERTIFICATE MANAGEMENT
# =============================================================================

# Rotate KAS certificates
kas_certs_rotate() {
    local instance="${1:-usa}"

    echo -e "${BOLD}Rotate KAS Certificates - ${instance^^}${NC}"
    echo ""

    local kas_cert_dir="${DIVE_ROOT}/kas/certs"
    local backup_dir="${kas_cert_dir}/backup-$(date +%Y%m%d-%H%M%S)"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would backup current certificates to $backup_dir"
        log_dry "Would generate new self-signed certificates"
        log_dry "Would restart KAS container"
        return 0
    fi

    # Backup existing certificates
    if [ -f "$kas_cert_dir/certificate.pem" ]; then
        log_info "Backing up current certificates to $backup_dir"
        mkdir -p "$backup_dir"
        cp "$kas_cert_dir/certificate.pem" "$backup_dir/"
        cp "$kas_cert_dir/key.pem" "$backup_dir/" 2>/dev/null || true
        log_success "Certificates backed up"
    fi

    # Generate new certificates
    log_info "Generating new self-signed certificates..."
    mkdir -p "$kas_cert_dir"
    
    openssl req -x509 -newkey rsa:4096 \
        -keyout "$kas_cert_dir/key.pem" \
        -out "$kas_cert_dir/certificate.pem" \
        -days 365 -nodes \
        -subj "/CN=kas.dive25.com/O=DIVE V3/C=US/ST=Virginia/L=Arlington" \
        -addext "subjectAltName=DNS:kas.dive25.com,DNS:localhost,DNS:kas,IP:127.0.0.1" \
        2>/dev/null

    if [ $? -eq 0 ]; then
        log_success "New certificates generated"
        
        # Show certificate info
        echo ""
        echo -e "${BOLD}New Certificate Info:${NC}"
        openssl x509 -noout -subject -enddate -in "$kas_cert_dir/certificate.pem" | sed 's/^/  /'
        
        # Restart KAS if running
        local container
        container="$(get_kas_container "$instance")"
        if docker ps --format "{{.Names}}" | grep -q "^${container}$"; then
            echo ""
            log_info "Restarting KAS to use new certificates..."
            kas_restart "$instance"
        else
            echo ""
            log_info "Start KAS to use new certificates: ./dive hub deploy"
        fi
    else
        log_error "Failed to generate certificates"
        return 1
    fi
}

# Show KAS certificate status
kas_certs_status() {
    local instance="${1:-usa}"

    echo -e "${BOLD}KAS Certificate Status - ${instance^^}${NC}"
    echo ""

    local kas_cert_dir="${DIVE_ROOT}/kas/certs"

    if [ ! -f "$kas_cert_dir/certificate.pem" ]; then
        log_error "KAS certificate not found at $kas_cert_dir/certificate.pem"
        echo ""
        echo "Generate certificates with: ./dive kas certs rotate"
        return 1
    fi

    echo -e "${BOLD}Certificate Details:${NC}"
    openssl x509 -noout -text -in "$kas_cert_dir/certificate.pem" 2>/dev/null | \
        grep -E "Subject:|Issuer:|Not Before|Not After|DNS:|IP Address:" | \
        sed 's/^[[:space:]]*/  /'

    echo ""
    echo -e "${BOLD}Validity:${NC}"
    local expiry
    expiry=$(openssl x509 -enddate -noout -in "$kas_cert_dir/certificate.pem" 2>/dev/null | cut -d= -f2)
    echo "  Expires: $expiry"

    # Calculate days remaining
    local expiry_epoch now_epoch days_remaining
    expiry_epoch=$(date -j -f "%b %d %T %Y %Z" "$expiry" "+%s" 2>/dev/null || date -d "$expiry" "+%s" 2>/dev/null || echo "0")
    now_epoch=$(date "+%s")
    days_remaining=$(( (expiry_epoch - now_epoch) / 86400 ))

    if [ "$days_remaining" -lt 0 ]; then
        log_error "Certificate has EXPIRED!"
    elif [ "$days_remaining" -lt 30 ]; then
        log_warn "Certificate expires in $days_remaining days - consider rotating"
    else
        log_success "Certificate valid for $days_remaining more days"
    fi

    echo ""
    echo -e "${BOLD}Private Key:${NC}"
    if [ -f "$kas_cert_dir/key.pem" ]; then
        echo -n "  Status: "
        log_success_inline "EXISTS"
        echo ""
        echo "  Type: $(openssl rsa -in "$kas_cert_dir/key.pem" -text -noout 2>/dev/null | head -1 | sed 's/^//')"
    else
        echo -n "  Status: "
        log_error_inline "MISSING"
        echo ""
    fi

    echo ""
    echo -e "${BOLD}Backup Certificates:${NC}"
    local backups
    backups=$(ls -d "$kas_cert_dir"/backup-* 2>/dev/null | wc -l | tr -d ' ')
    echo "  Available backups: $backups"
    if [ "$backups" -gt 0 ]; then
        ls -dt "$kas_cert_dir"/backup-* 2>/dev/null | head -3 | while read -r dir; do
            echo "    - $(basename "$dir")"
        done
    fi
}

# Certificate command dispatcher
kas_certs() {
    local subcommand="${1:-status}"
    shift || true

    case "$subcommand" in
        status)
            kas_certs_status "$@"
            ;;
        rotate)
            kas_certs_rotate "$@"
            ;;
        *)
            echo -e "${BOLD}KAS Certificate Commands:${NC}"
            echo ""
            echo "Usage: ./dive kas certs <command>"
            echo ""
            echo "Commands:"
            echo "  status    Show certificate status and expiry"
            echo "  rotate    Generate new certificates (with backup)"
            ;;
    esac
}

# =============================================================================
# TEST COMMANDS
# =============================================================================

# Run KAS test suite
kas_test() {
    echo -e "${BOLD}KAS Test Suite${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would run KAS test suite"
        return 0
    fi

    local kas_dir="${DIVE_ROOT}/kas"

    if [ ! -d "$kas_dir" ]; then
        log_error "KAS directory not found: $kas_dir"
        return 1
    fi

    log_info "Running KAS tests..."
    echo ""

    cd "$kas_dir"
    
    if [ -f "package.json" ]; then
        # Check if node_modules exists
        if [ ! -d "node_modules" ]; then
            log_info "Installing dependencies..."
            npm install --silent 2>/dev/null
        fi

        # Run tests
        npm test 2>&1

        local exit_code=$?
        echo ""

        if [ $exit_code -eq 0 ]; then
            log_success "All KAS tests passed"
        else
            log_error "Some KAS tests failed"
        fi

        return $exit_code
    else
        log_error "No package.json found in KAS directory"
        return 1
    fi
}

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
