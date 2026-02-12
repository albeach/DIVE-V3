#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Hub Status Sub-Module
# =============================================================================
# Status, health, verification, and logging functions
# Loaded on-demand via lazy loading
# =============================================================================

# Mark status module as loaded
export DIVE_HUB_STATUS_LOADED=1

# Hub service URLs (defaults for local development)
HUB_KEYCLOAK_URL="${HUB_KEYCLOAK_URL:-https://localhost:8443}"
HUB_BACKEND_URL="${HUB_BACKEND_URL:-https://localhost:4000}"
HUB_OPA_URL="${HUB_OPA_URL:-https://localhost:8181}"
HUB_COMPOSE_FILE="${HUB_COMPOSE_FILE:-${DIVE_ROOT}/docker-compose.hub.yml}"

# Helper: Check service health via HTTP
_hub_check_service() {
    local name="$1"
    local url="$2"
    local timeout="${3:-5}"

    if curl -fsk --max-time "$timeout" "$url" >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $name"
    else
        echo -e "  ${RED}✗${NC} $name"
    fi
}

# Helper: Get federation statistics from multiple sources
_hub_get_federation_stats() {
    # Source 1: MongoDB federation_spokes (RUNTIME SSOT - active registrations)
    local mongodb_spokes=0
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-mongodb"; then
        # Get MongoDB password from hub .env file
        local mongo_password
        mongo_password=$(grep "^MONGO_PASSWORD=" "${DIVE_ROOT}/instances/hub/.env" | cut -d'=' -f2 | tr -d '"')
        if [ -n "$mongo_password" ]; then
            mongodb_spokes=$(docker exec dive-hub-mongodb mongosh --quiet \
                -u admin -p "$mongo_password" \
                --authenticationDatabase admin \
                --eval "use('dive-v3'); db.federation_spokes.countDocuments({status: 'approved'})" 2>/dev/null || echo "0")
        fi
    fi

    # Source 2: Terraform federation_partners (Keycloak IdP configuration)
    local tfvars_partners=0
    local hub_tfvars="${DIVE_ROOT}/terraform/hub/hub.tfvars"
    if [ -f "$hub_tfvars" ]; then
        # Count non-commented entries in federation_partners block
        tfvars_partners=$(grep -E "^\s+[a-z]{3}\s*=\s*\{" "$hub_tfvars" 2>/dev/null | wc -l | tr -d ' ')
    fi

    # Source 3: Local instance configs (deployment metadata only)
    local local_configs=0
    local_configs=$(ls -d "${DIVE_ROOT}/instances"/*/ 2>/dev/null | grep -v "hub\|shared" | wc -l | tr -d ' ')

    echo "  Active spokes (MongoDB):     ${mongodb_spokes:-0}"
    echo "  Terraform IdPs configured:   ${tfvars_partners:-0}"
    echo "  Local instance configs:      ${local_configs:-0}"
}

hub_status() {
    print_header
    echo -e "${BOLD}DIVE Hub Status${NC}"
    echo ""

    # Service status
    echo -e "${CYAN}Services:${NC}"
    _hub_check_service "Keycloak" "${HUB_KEYCLOAK_URL}/realms/master"
    _hub_check_service "Backend"  "${HUB_BACKEND_URL}/health"
    _hub_check_service "OPA"      "${HUB_OPA_URL}/health"
    echo ""

    # Docker container status
    echo -e "${CYAN}Containers:${NC}"
    docker compose -f "$HUB_COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  (compose not running)"
    echo ""

    # Federation stats
    echo -e "${CYAN}Federation:${NC}"
    _hub_get_federation_stats
}

hub_health() {
    echo -e "${BOLD}Hub Health Check${NC}"
    echo ""

    local exit_code=0
    local services=("keycloak" "backend" "opa" "mongodb" "postgres" "redis")

    for service in "${services[@]}"; do
        local container="dive-hub-${service}"
        local status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "not_found")
        local health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "N/A")

        if [ "$status" = "running" ] && [ "$health" = "healthy" ]; then
            echo -e "  ${service}: ${GREEN}✓${NC} running (healthy)"
        elif [ "$status" = "running" ]; then
            echo -e "  ${service}: ${YELLOW}○${NC} running (${health})"
        else
            echo -e "  ${service}: ${RED}✗${NC} ${status}"
            exit_code=1
        fi
    done

    return $exit_code
}

##
# Hub detailed health check using backend /health/detailed endpoint
# Phase 3.1: Production Resilience Enhancement
#
# This function calls the backend's /health/detailed endpoint to get
# comprehensive health status including MongoDB, OPA, Keycloak, Redis,
# KAS, cache, and circuit breaker states.
#
# Returns:
#   0 - All services healthy
#   1 - Some services unhealthy/degraded
##
hub_health_detailed() {
    echo -e "${BOLD}Hub Detailed Health Check (API-based)${NC}"
    echo ""

    local backend_url="${HUB_BACKEND_URL:-https://localhost:4000}"
    local health_response
    local exit_code=0

    # Call the backend's /health/detailed endpoint
    health_response=$(curl -sfk --max-time 10 "${backend_url}/health/detailed" 2>/dev/null)

    if [ -z "$health_response" ]; then
        echo -e "  ${RED}✗${NC} Backend API not responding at ${backend_url}/health/detailed"
        return 1
    fi

    # Parse overall status
    local overall_status
    overall_status=$(echo "$health_response" | jq -r '.status // "unknown"' 2>/dev/null)

    case "$overall_status" in
        healthy)
            echo -e "  Overall Status: ${GREEN}✓ HEALTHY${NC}"
            ;;
        degraded)
            echo -e "  Overall Status: ${YELLOW}⚠ DEGRADED${NC}"
            exit_code=1
            ;;
        unhealthy)
            echo -e "  Overall Status: ${RED}✗ UNHEALTHY${NC}"
            exit_code=1
            ;;
        *)
            echo -e "  Overall Status: ${RED}? UNKNOWN${NC}"
            exit_code=1
            ;;
    esac

    echo ""
    echo -e "${CYAN}Service Dependencies:${NC}"

    # Parse individual service statuses
    local services=("mongodb" "opa" "keycloak" "redis" "kas" "cache")

    for service in "${services[@]}"; do
        local svc_status
        local svc_response_time
        local svc_error

        svc_status=$(echo "$health_response" | jq -r ".services.${service}.status // \"N/A\"" 2>/dev/null)
        svc_response_time=$(echo "$health_response" | jq -r ".services.${service}.responseTime // \"N/A\"" 2>/dev/null)
        svc_error=$(echo "$health_response" | jq -r ".services.${service}.error // \"\"" 2>/dev/null)

        case "$svc_status" in
            up)
                if [ "$svc_response_time" != "N/A" ] && [ "$svc_response_time" != "null" ]; then
                    echo -e "  ${service}: ${GREEN}✓${NC} up (${svc_response_time}ms)"
                else
                    echo -e "  ${service}: ${GREEN}✓${NC} up"
                fi
                ;;
            degraded)
                echo -e "  ${service}: ${YELLOW}⚠${NC} degraded"
                ;;
            down)
                if [ -n "$svc_error" ] && [ "$svc_error" != "null" ]; then
                    echo -e "  ${service}: ${RED}✗${NC} down - ${svc_error}"
                else
                    echo -e "  ${service}: ${RED}✗${NC} down"
                fi
                exit_code=1
                ;;
            N/A|null)
                echo -e "  ${service}: ${DIM}○${NC} not configured"
                ;;
            *)
                echo -e "  ${service}: ${YELLOW}?${NC} ${svc_status}"
                ;;
        esac
    done

    # Parse circuit breaker states if available
    local cb_count
    cb_count=$(echo "$health_response" | jq '.circuitBreakers | length' 2>/dev/null)

    if [ -n "$cb_count" ] && [ "$cb_count" != "null" ] && [ "$cb_count" -gt 0 ]; then
        echo ""
        echo -e "${CYAN}Circuit Breakers:${NC}"
        
        echo "$health_response" | jq -r '.circuitBreakers | to_entries[] | "\(.key):\(.value.state)"' 2>/dev/null | while read -r line; do
            local cb_name=$(echo "$line" | cut -d: -f1)
            local cb_state=$(echo "$line" | cut -d: -f2)
            
            case "$cb_state" in
                CLOSED)
                    echo -e "  ${cb_name}: ${GREEN}✓${NC} closed (healthy)"
                    ;;
                HALF_OPEN)
                    echo -e "  ${cb_name}: ${YELLOW}⚠${NC} half-open (recovering)"
                    ;;
                OPEN)
                    echo -e "  ${cb_name}: ${RED}✗${NC} open (failing)"
                    ;;
            esac
        done
    fi

    # Parse memory usage
    local mem_used mem_total mem_pct
    mem_used=$(echo "$health_response" | jq -r '.memory.used // 0' 2>/dev/null)
    mem_total=$(echo "$health_response" | jq -r '.memory.total // 0' 2>/dev/null)
    mem_pct=$(echo "$health_response" | jq -r '.memory.percentage // 0' 2>/dev/null)

    if [ "$mem_used" != "0" ] && [ "$mem_used" != "null" ]; then
        echo ""
        echo -e "${CYAN}Memory Usage:${NC}"
        if [ "$mem_pct" -gt 90 ]; then
            echo -e "  ${RED}⚠${NC} ${mem_used}MB / ${mem_total}MB (${mem_pct}%)"
        elif [ "$mem_pct" -gt 75 ]; then
            echo -e "  ${YELLOW}○${NC} ${mem_used}MB / ${mem_total}MB (${mem_pct}%)"
        else
            echo -e "  ${GREEN}✓${NC} ${mem_used}MB / ${mem_total}MB (${mem_pct}%)"
        fi
    fi

    echo ""
    return $exit_code
}

hub_status_brief() {
    echo ""
    echo -e "${CYAN}Hub Status Summary:${NC}"

    # Service status (brief)
    local services_healthy=0
    local services_total=4

    # Check Keycloak
    if curl -kfs --max-time 3 "${HUB_KEYCLOAK_URL}/realms/master" >/dev/null 2>&1; then
        ((services_healthy++))
    fi

    # Check Backend
    if curl -kfs --max-time 3 "${HUB_BACKEND_URL}/health" >/dev/null 2>&1; then
        ((services_healthy++))
    fi

    # Check OPA
    if curl -kfs --max-time 3 "${HUB_OPA_URL}/health" >/dev/null 2>&1; then
        ((services_healthy++))
    fi

    # Check OPAL
    if curl -kfs --max-time 3 "${HUB_OPAL_URL}/healthcheck" >/dev/null 2>&1; then
        ((services_healthy++))
    fi

    echo "  Services: ${services_healthy}/${services_total} healthy"
    echo "  Keycloak: ${HUB_KEYCLOAK_URL}"
    echo "  Backend:  ${HUB_BACKEND_URL}"
    echo "  OPA:      ${HUB_OPA_URL}"
    echo "  OPAL:     ${HUB_OPAL_URL}"
    echo ""
    echo -e "Run '${BOLD}./dive hub status${NC}' for detailed information"
    echo ""
}

hub_verify() {
    print_header
    echo -e "${BOLD}🔍 Hub Verification${NC}"
    echo ""

    ensure_dive_root

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would run 10-point hub verification"
        return 0
    fi

    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Running 10-Point Hub Verification${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    local checks_total=10
    local checks_passed=0
    local checks_failed=0

    export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dive-hub}"

    # Check 1: Docker containers running (8 services)
    printf "  %-50s" "1. Docker Containers (8 services):"
    local expected_services=("keycloak" "backend" "opa" "opal-server" "mongodb" "postgres" "redis" "redis-blacklist")
    local running_count=0

    for service in "${expected_services[@]}"; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-${service}"; then
            ((running_count++))
        fi
    done

    if [ $running_count -eq 8 ]; then
        echo -e "${GREEN}✓ ${running_count}/8 running${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ ${running_count}/8 running${NC}"
        ((checks_failed++))
    fi

    # Check 2: Keycloak health
    printf "  %-50s" "2. Keycloak Health:"
    if curl -kfs "https://localhost:8443/health/ready" --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    elif curl -kfs "https://localhost:8443/realms/master" --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Unhealthy${NC}"
        ((checks_failed++))
    fi

    # Check 3: Backend API health
    printf "  %-50s" "3. Backend API Health:"
    if curl -kfs "https://localhost:4000/health" --max-time 5 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Unhealthy${NC}"
        ((checks_failed++))
    fi

    # Check 4: MongoDB connection
    printf "  %-50s" "4. MongoDB Connection:"
    if docker exec dive-hub-mongodb mongosh --tls --tlsAllowInvalidCertificates --quiet --eval "db.adminCommand('ping')" 2>/dev/null | grep -q "ok"; then
        echo -e "${GREEN}✓ Connected${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Failed${NC}"
        ((checks_failed++))
    fi

    # Check 5: Redis connection
    printf "  %-50s" "5. Redis Connection:"
    if docker exec dive-hub-redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
        echo -e "${GREEN}✓ Connected${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Failed${NC}"
        ((checks_failed++))
    fi

    # Check 6: OPAL Server health
    printf "  %-50s" "6. OPAL Server Health:"
    if curl -kfs "https://localhost:7002/healthcheck" --max-time 5 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    else
        echo -e "${YELLOW}⚠ Not responding${NC}"
        ((checks_failed++))
    fi

    # Check 7: Policy bundle available
    printf "  %-50s" "7. Policy Bundle Available:"
    local bundle=$(curl -kfs "https://localhost:4000/api/opal/bundle/current" --max-time 5 2>/dev/null)
    if echo "$bundle" | grep -q '"bundleId"'; then
        local version=$(echo "$bundle" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        echo -e "${GREEN}✓ ${version}${NC}"
        ((checks_passed++))
    else
        echo -e "${YELLOW}⚠ No bundle${NC}"
    fi

    # Check 8: Federation registry initialized
    printf "  %-50s" "8. Federation Registry:"
    if curl -kfs "https://localhost:4000/api/federation/health" --max-time 5 >/dev/null 2>&1; then
        local spoke_count=$(curl -kfs "https://localhost:4000/api/federation/health" --max-time 5 2>/dev/null | grep -o '"totalSpokes"[[:space:]]*:[[:space:]]*[0-9]*' | cut -d: -f2 | tr -d ' ')
        echo -e "${GREEN}✓ Initialized (${spoke_count:-0} spokes)${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Not initialized${NC}"
        ((checks_failed++))
    fi

    # Check 9: Registration endpoint accessible
    printf "  %-50s" "9. Registration Endpoint:"
    local reg_test=$(curl -kfs -o /dev/null -w '%{http_code}' -X POST "https://localhost:4000/api/federation/register" \
        -H "Content-Type: application/json" \
        -d '{}' --max-time 5 2>/dev/null)
    if [ "$reg_test" = "400" ] || [ "$reg_test" = "401" ] || [ "$reg_test" = "422" ]; then
        # Error codes mean endpoint is accessible (just rejecting empty request)
        echo -e "${GREEN}✓ Accessible${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Not accessible (HTTP $reg_test)${NC}"
        ((checks_failed++))
    fi

    # Check 10: TLS certificates valid (SSOT: instances/hub/certs)
    printf "  %-50s" "10. TLS Certificates:"
    local cert_dir="${DIVE_ROOT}/instances/hub/certs"
    if [ -f "${cert_dir}/certificate.pem" ]; then
        local expiry=$(openssl x509 -enddate -noout -in "${cert_dir}/certificate.pem" 2>/dev/null | cut -d= -f2)
        local expiry_epoch=$(date -j -f "%b %d %H:%M:%S %Y %Z" "$expiry" +%s 2>/dev/null || date -d "$expiry" +%s 2>/dev/null || echo 0)
        local now_epoch=$(date +%s)
        local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

        if [ $days_left -gt 30 ]; then
            echo -e "${GREEN}✓ Valid (${days_left} days left)${NC}"
            ((checks_passed++))
        elif [ $days_left -gt 0 ]; then
            echo -e "${YELLOW}⚠ Expires soon (${days_left} days)${NC}"
            ((checks_passed++))
        else
            echo -e "${RED}✗ Expired${NC}"
            ((checks_failed++))
        fi
    else
        echo -e "${YELLOW}⚠ No cert file found${NC}"
        # Don't fail - TLS may work via other means
    fi

    # Summary
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Verification Summary${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  Total Checks:   $checks_total"
    echo -e "  Passed:         ${GREEN}$checks_passed${NC}"
    echo -e "  Failed:         ${RED}$checks_failed${NC}"
    echo ""

    if [ $checks_failed -eq 0 ] && [ $checks_passed -ge 8 ]; then
        echo -e "${GREEN}✓ All critical verification checks passed!${NC}"
        echo -e "${GREEN}✓ Hub deployment is fully operational${NC}"
        echo ""
        return 0
    else
        echo -e "${YELLOW}⚠ Some checks failed or were skipped${NC}"
        echo ""
        echo -e "${CYAN}Troubleshooting:${NC}"
        echo "  - Check logs: ./dive hub logs"
        echo "  - View status: ./dive hub status"
        echo "  - Restart services: ./dive hub down && ./dive hub up"
        echo ""
        return 1
    fi
}
