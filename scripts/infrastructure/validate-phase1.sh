#!/bin/bash
#
# DIVE V3 Infrastructure Phase 1 Validation Script
# 
# Validates that Phase 1 fixes are properly implemented:
# - Backend IdP endpoints responding (GAP-001)
# - Federation callbacks working (GAP-002)
# - Services have restart policies (GAP-011)
#
# Usage: ./scripts/infrastructure/validate-phase1.sh
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

log_test() { echo -e "${BLUE}[TEST]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((PASS++)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; ((FAIL++)); }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; ((WARN++)); }

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo ""
echo "================================================================"
echo "  DIVE V3 Phase 1 Validation"
echo "================================================================"
echo ""

# ============================================================================
# TEST 1: Backend IdP Endpoint (GAP-001)
# ============================================================================

echo "--- TEST GROUP 1: Backend IdP Endpoint (GAP-001) ---"
echo ""

test_idp_endpoint() {
    local instance=$1
    local url=$2
    local timeout=${3:-10}
    
    log_test "Testing $instance IdP endpoint: $url"
    
    local response
    local http_code
    
    response=$(curl -sk --max-time "$timeout" -w "\n%{http_code}" "$url" 2>&1) || true
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        # Check if response contains IdP data
        if echo "$body" | grep -q '"alias"\|"name"\|"enabled"'; then
            log_pass "$instance IdP endpoint returns valid IdP list"
        else
            log_warn "$instance IdP endpoint returns 200 but no IdP data"
        fi
    elif [ "$http_code" = "401" ]; then
        log_warn "$instance IdP endpoint requires authentication (expected for protected endpoints)"
    elif [ "$http_code" = "500" ]; then
        log_fail "$instance IdP endpoint returning 500 Internal Server Error"
    elif [ "$http_code" = "000" ]; then
        log_fail "$instance IdP endpoint unreachable (connection refused/timeout)"
    else
        log_fail "$instance IdP endpoint unexpected status: $http_code"
    fi
}

# Test USA (localhost) - Using public endpoint for IdP list
test_idp_endpoint "USA" "https://localhost:4000/api/idps/public"
test_idp_endpoint "USA" "https://usa-api.dive25.com/api/idps/public"

# Test FRA (uses HTTPS internally via mkcert)
test_idp_endpoint "FRA" "https://localhost:4001/api/idps/public"
test_idp_endpoint "FRA" "https://fra-api.dive25.com/api/idps/public"

# Test DEU (uses HTTPS internally via mkcert)
test_idp_endpoint "DEU" "https://localhost:4002/api/idps/public"
test_idp_endpoint "DEU" "https://deu-api.dive25.com/api/idps/public"

echo ""

# ============================================================================
# TEST 2: Federation Flow (GAP-002)
# ============================================================================

echo "--- TEST GROUP 2: Federation Callback Flow (GAP-002) ---"
echo ""

test_keycloak_broker() {
    local instance=$1
    local url=$2
    
    log_test "Testing $instance Keycloak broker endpoint: $url"
    
    local http_code
    http_code=$(curl -sk --max-time 10 -o /dev/null -w "%{http_code}" "$url" 2>&1) || http_code="000"
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "302" ] || [ "$http_code" = "303" ]; then
        log_pass "$instance Keycloak broker accessible (HTTP $http_code)"
    elif [ "$http_code" = "400" ] || [ "$http_code" = "401" ]; then
        log_warn "$instance Keycloak broker requires valid session (expected, HTTP $http_code)"
    elif [ "$http_code" = "502" ]; then
        log_fail "$instance Keycloak broker returning 502 Bad Gateway"
    elif [ "$http_code" = "000" ]; then
        log_fail "$instance Keycloak broker unreachable"
    else
        log_warn "$instance Keycloak broker unexpected status: $http_code"
    fi
}

# Test federation broker endpoints
test_keycloak_broker "USA" "https://usa-idp.dive25.com/realms/dive-v3-broker"
test_keycloak_broker "FRA" "https://fra-idp.dive25.com/realms/dive-v3-broker"
test_keycloak_broker "DEU" "https://deu-idp.dive25.com/realms/dive-v3-broker"

echo ""

# Test cross-instance federation configuration
log_test "Checking USA→DEU federation IdP configuration..."
usa_deu_idp=$(curl -sk "https://usa-idp.dive25.com/admin/realms/dive-v3-broker/identity-provider/instances/deu-federation" 2>&1 || echo "")
if echo "$usa_deu_idp" | grep -q '"alias".*"deu-federation"'; then
    log_pass "USA has DEU federation IdP configured"
else
    log_warn "USA→DEU federation IdP not configured or not accessible"
fi

log_test "Checking USA→FRA federation IdP configuration..."
usa_fra_idp=$(curl -sk "https://usa-idp.dive25.com/admin/realms/dive-v3-broker/identity-provider/instances/fra-federation" 2>&1 || echo "")
if echo "$usa_fra_idp" | grep -q '"alias".*"fra-federation"'; then
    log_pass "USA has FRA federation IdP configured"
else
    log_warn "USA→FRA federation IdP not configured or not accessible"
fi

echo ""

# ============================================================================
# TEST 3: Restart Policies (GAP-011)
# ============================================================================

echo "--- TEST GROUP 3: Container Restart Policies (GAP-011) ---"
echo ""

check_restart_policy() {
    local compose_file=$1
    local instance=$2
    
    log_test "Checking restart policies in $compose_file..."
    
    if [ ! -f "$compose_file" ]; then
        log_warn "$compose_file not found"
        return
    fi
    
    local total_services=$(grep -E "^  [a-z][a-z0-9-]*:" "$compose_file" | wc -l | tr -d ' ')
    local with_restart=$(grep -c "restart:" "$compose_file" || echo 0)
    
    if [ "$with_restart" -ge "$total_services" ]; then
        log_pass "$instance: All services have restart policies ($with_restart/$total_services)"
    elif [ "$with_restart" -gt 0 ]; then
        log_warn "$instance: Some services missing restart policies ($with_restart/$total_services)"
    else
        log_fail "$instance: No services have restart policies configured"
    fi
}

check_restart_policy "docker-compose.yml" "USA"
check_restart_policy "docker-compose.fra.yml" "FRA"
check_restart_policy "docker-compose.deu.yml" "DEU"

echo ""

# ============================================================================
# TEST 4: Cloudflared Configuration (GAP-002 supplement)
# ============================================================================

echo "--- TEST GROUP 4: Cloudflared Tunnel Configuration ---"
echo ""

check_cloudflared_config() {
    local config_file=$1
    local instance=$2
    
    log_test "Checking $instance cloudflared configuration..."
    
    if [ ! -f "$config_file" ]; then
        log_warn "$config_file not found"
        return
    fi
    
    # Check for adequate timeout
    local timeout=$(grep "connectTimeout:" "$config_file" | head -1 | grep -oE '[0-9]+' || echo "0")
    if [ "${timeout:-0}" -ge 60 ]; then
        log_pass "$instance: Connect timeout adequate (${timeout}s)"
    elif [ "${timeout:-0}" -ge 30 ]; then
        log_warn "$instance: Connect timeout may be insufficient (${timeout}s, recommend 60s)"
    else
        log_warn "$instance: Connect timeout not configured or too low"
    fi
    
    # Check for metrics endpoint
    if grep -q "metrics:" "$config_file"; then
        log_pass "$instance: Metrics endpoint configured"
    else
        log_warn "$instance: Metrics endpoint not configured"
    fi
}

check_cloudflared_config "cloudflared/config.yml" "USA"
check_cloudflared_config "cloudflared/config-fra.yml" "FRA"
check_cloudflared_config "cloudflared/config-deu.yml" "DEU"

echo ""

# ============================================================================
# TEST 5: Service Health Checks
# ============================================================================

echo "--- TEST GROUP 5: Docker Service Health ---"
echo ""

if docker ps > /dev/null 2>&1; then
    log_test "Checking Docker container health status..."
    
    # Get container health
    while IFS= read -r line; do
        container=$(echo "$line" | awk '{print $1}')
        health=$(echo "$line" | awk '{print $2}')
        
        case "$health" in
            "healthy")
                log_pass "Container $container: healthy"
                ;;
            "unhealthy")
                log_fail "Container $container: unhealthy"
                ;;
            "starting")
                log_warn "Container $container: still starting"
                ;;
            *)
                log_warn "Container $container: no health check configured"
                ;;
        esac
    done < <(docker ps --format "{{.Names}} {{.Status}}" | grep -E "dive-v3" | while read name status; do
        health="unknown"
        if echo "$status" | grep -q "healthy"; then
            health="healthy"
        elif echo "$status" | grep -q "unhealthy"; then
            health="unhealthy"
        elif echo "$status" | grep -q "starting"; then
            health="starting"
        fi
        echo "$name $health"
    done)
else
    log_warn "Docker not accessible - skipping container health checks"
fi

echo ""

# ============================================================================
# SUMMARY
# ============================================================================

echo "================================================================"
echo "  Phase 1 Validation Summary"
echo "================================================================"
echo ""
echo -e "  ${GREEN}PASSED:${NC} $PASS"
echo -e "  ${RED}FAILED:${NC} $FAIL"
echo -e "  ${YELLOW}WARNINGS:${NC} $WARN"
echo ""

if [ "$FAIL" -eq 0 ]; then
    echo -e "  ${GREEN}✅ Phase 1 validation PASSED${NC}"
    echo "  You may proceed to Phase 2: Security Hardening"
    exit 0
elif [ "$FAIL" -le 2 ]; then
    echo -e "  ${YELLOW}⚠️ Phase 1 validation PARTIALLY PASSED${NC}"
    echo "  Review failed tests before proceeding to Phase 2"
    exit 1
else
    echo -e "  ${RED}❌ Phase 1 validation FAILED${NC}"
    echo "  Critical issues must be resolved before proceeding"
    exit 2
fi

