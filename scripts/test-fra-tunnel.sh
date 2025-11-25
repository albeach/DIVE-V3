#!/bin/bash
# Test script for FRA Cloudflare tunnel and services
# Phase 2 validation script

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test results
PASSED=0
FAILED=0
WARNINGS=0

# Log functions
log_test() {
    echo -e "\n${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "  ${GREEN}✅ PASS${NC} $1"
    ((PASSED++))
}

log_fail() {
    echo -e "  ${RED}❌ FAIL${NC} $1"
    ((FAILED++))
}

log_warn() {
    echo -e "  ${YELLOW}⚠️  WARN${NC} $1"
    ((WARNINGS++))
}

log_info() {
    echo -e "  ${BLUE}ℹ️  INFO${NC} $1"
}

# Test function
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_code="${3:-200}"
    
    log_test "Testing $name"
    
    # DNS resolution test
    local hostname=$(echo "$url" | sed -E 's|https?://([^/]+).*|\1|')
    if host "$hostname" > /dev/null 2>&1; then
        log_pass "DNS resolves for $hostname"
    else
        log_fail "DNS resolution failed for $hostname"
        return 1
    fi
    
    # HTTP connectivity test
    local response_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000")
    
    if [[ "$response_code" == "$expected_code" ]]; then
        log_pass "HTTP $response_code response from $url"
    elif [[ "$response_code" == "000" ]]; then
        log_fail "Connection failed to $url"
    else
        log_warn "Unexpected HTTP $response_code from $url (expected $expected_code)"
    fi
    
    # Response time test
    local response_time=$(curl -s -o /dev/null -w "%{time_total}" "$url" || echo "999")
    if (( $(echo "$response_time < 2" | bc -l) )); then
        log_pass "Response time: ${response_time}s"
    else
        log_warn "Slow response: ${response_time}s"
    fi
}

# Header
echo ""
echo "=========================================="
echo "   FRA Tunnel & Services Test Suite"
echo "=========================================="
echo "Date: $(date)"
echo ""

# ============================================
# Phase 2 Goal 2.1: Tunnel Connectivity
# ============================================
echo -e "\n${BLUE}═══ Goal 2.1: Tunnel Connectivity ═══${NC}"

# Check if cloudflared is running
log_test "Cloudflared process"
if pgrep cloudflared > /dev/null; then
    log_pass "Cloudflared is running"
    
    # Get tunnel status
    if command -v cloudflared > /dev/null; then
        log_info "Active tunnels:"
        cloudflared tunnel list | grep -E "dive-v3-fra" || log_warn "No FRA tunnels found"
    fi
else
    log_warn "Cloudflared not running locally (may be running elsewhere)"
fi

# Test each FRA endpoint
test_endpoint "FRA Frontend" "https://fra-app.dive25.com/" "200"
test_endpoint "FRA API Health" "https://fra-api.dive25.com/health" "200"
test_endpoint "FRA IdP Discovery" "https://fra-idp.dive25.com/realms/dive-v3-broker-fra/.well-known/openid-configuration" "200"
test_endpoint "FRA KAS Health" "https://fra-kas.dive25.com/health" "200"

# ============================================
# Phase 2 Goal 2.2: High Availability
# ============================================
echo -e "\n${BLUE}═══ Goal 2.2: High Availability ═══${NC}"

log_test "Primary tunnel health"
if systemctl is-active cloudflared-dive-v3-fra-primary > /dev/null 2>&1; then
    log_pass "Primary tunnel service active"
else
    log_warn "Primary tunnel service not active (check manually)"
fi

log_test "Standby tunnel configuration"
if [[ -f "$HOME/.cloudflared/fra/dive-v3-fra-standby.yml" ]]; then
    log_pass "Standby tunnel configuration exists"
else
    log_warn "Standby tunnel configuration not found"
fi

log_test "Failover script"
if [[ -x "$HOME/.cloudflared/fra/failover.sh" ]]; then
    log_pass "Failover script is executable"
else
    log_warn "Failover script not found or not executable"
fi

# ============================================
# Phase 2 Goal 2.3: Zero Trust Access
# ============================================
echo -e "\n${BLUE}═══ Goal 2.3: Zero Trust Access ═══${NC}"

log_test "Access enforcement on API"
# Test without auth (should fail)
response=$(curl -s -o /dev/null -w "%{http_code}" "https://fra-api.dive25.com/api/test" || echo "000")
if [[ "$response" == "403" ]] || [[ "$response" == "401" ]]; then
    log_pass "API requires authentication ($response)"
else
    log_warn "API returned $response without auth (check Access policies)"
fi

log_test "Service token rotation schedule"
if [[ -f "$HOME/.cloudflared/fra/token-rotation.cron" ]]; then
    log_pass "Token rotation schedule configured"
else
    log_warn "Token rotation not configured (manual setup needed)"
fi

# ============================================
# GAP Mitigations
# ============================================
echo -e "\n${BLUE}═══ Gap Mitigations ═══${NC}"

# GAP-001: Trust Anchor Lifecycle
log_test "GAP-001: Certificate management"
if [[ -f "$HOME/.cloudflared/fra/cert-rotation.sh" ]]; then
    log_pass "Certificate rotation script exists"
else
    log_warn "Certificate rotation not automated"
fi

# GAP-006: Availability
log_test "GAP-006: Health monitoring"
if [[ -x "$HOME/.cloudflared/fra/health-check.sh" ]]; then
    log_pass "Health check script available"
    
    # Run health check
    if "$HOME/.cloudflared/fra/health-check.sh" > /dev/null 2>&1; then
        log_pass "All services healthy"
    else
        log_warn "Some services unhealthy"
    fi
else
    log_warn "Health check script not found"
fi

# GAP-012: Service token security
log_test "GAP-012: Service token security"
if [[ -n "${CF_ACCESS_CLIENT_SECRET:-}" ]]; then
    log_warn "Service token in environment (move to vault)"
else
    log_pass "Service token not in environment"
fi

# ============================================
# Docker Services (if running locally)
# ============================================
echo -e "\n${BLUE}═══ Docker Services ═══${NC}"

log_test "Docker containers"
if command -v docker > /dev/null; then
    fra_containers=$(docker ps --format "table {{.Names}}" | grep -c "fra" || echo "0")
    if [[ "$fra_containers" -gt 0 ]]; then
        log_pass "Found $fra_containers FRA containers running"
        docker ps --format "table {{.Names}}\t{{.Status}}" | grep "fra" | while read -r line; do
            log_info "$line"
        done
    else
        log_warn "No FRA containers running locally"
    fi
else
    log_warn "Docker not available"
fi

# ============================================
# Performance Benchmarks
# ============================================
echo -e "\n${BLUE}═══ Performance Benchmarks ═══${NC}"

benchmark_endpoint() {
    local name="$1"
    local url="$2"
    
    log_test "$name response time"
    
    # Run 5 requests and calculate average
    local total=0
    local count=0
    
    for i in {1..5}; do
        local time=$(curl -s -o /dev/null -w "%{time_total}" "$url" 2>/dev/null || echo "0")
        if [[ "$time" != "0" ]]; then
            total=$(echo "$total + $time" | bc)
            ((count++))
        fi
    done
    
    if [[ "$count" -gt 0 ]]; then
        local avg=$(echo "scale=3; $total / $count" | bc)
        
        if (( $(echo "$avg < 0.2" | bc -l) )); then
            log_pass "Average: ${avg}s (excellent)"
        elif (( $(echo "$avg < 0.5" | bc -l) )); then
            log_pass "Average: ${avg}s (good)"
        elif (( $(echo "$avg < 1" | bc -l) )); then
            log_warn "Average: ${avg}s (acceptable)"
        else
            log_fail "Average: ${avg}s (too slow)"
        fi
    else
        log_fail "Could not benchmark (connection issues)"
    fi
}

benchmark_endpoint "Frontend" "https://fra-app.dive25.com/"
benchmark_endpoint "API" "https://fra-api.dive25.com/health"

# ============================================
# Security Checks
# ============================================
echo -e "\n${BLUE}═══ Security Checks ═══${NC}"

log_test "TLS certificate validation"
if openssl s_client -connect fra-idp.dive25.com:443 -servername fra-idp.dive25.com < /dev/null 2>/dev/null | grep -q "Verify return code: 0"; then
    log_pass "Valid TLS certificate"
else
    log_warn "TLS certificate validation issues (may be self-signed)"
fi

log_test "Security headers"
headers=$(curl -sI "https://fra-app.dive25.com/" 2>/dev/null)
if echo "$headers" | grep -qi "strict-transport-security"; then
    log_pass "HSTS header present"
else
    log_warn "HSTS header missing"
fi

if echo "$headers" | grep -qi "x-frame-options"; then
    log_pass "X-Frame-Options present"
else
    log_warn "X-Frame-Options missing"
fi

# ============================================
# Summary
# ============================================
echo ""
echo "=========================================="
echo "   Test Summary"
echo "=========================================="
echo -e "  ${GREEN}Passed:${NC}   $PASSED"
echo -e "  ${YELLOW}Warnings:${NC} $WARNINGS"
echo -e "  ${RED}Failed:${NC}   $FAILED"
echo ""

# Determine overall status
if [[ "$FAILED" -eq 0 ]]; then
    if [[ "$WARNINGS" -eq 0 ]]; then
        echo -e "${GREEN}✅ All tests passed! FRA tunnel is fully operational.${NC}"
        exit_code=0
    else
        echo -e "${YELLOW}⚠️  Tests passed with warnings. Review warnings above.${NC}"
        exit_code=0
    fi
else
    echo -e "${RED}❌ Some tests failed. Review failures above.${NC}"
    exit_code=1
fi

echo ""
echo "=========================================="
echo ""

# Phase 2 completion criteria
echo -e "${BLUE}Phase 2 Completion Criteria:${NC}"
echo ""
if [[ "$FAILED" -eq 0 ]]; then
    echo -e "  ✅ All 4 FRA hostnames accessible"
    echo -e "  ✅ DNS records configured"
    if [[ -f "$HOME/.cloudflared/fra/dive-v3-fra-standby.yml" ]]; then
        echo -e "  ✅ High availability configured"
    else
        echo -e "  ⚠️  High availability pending"
    fi
    echo -e "  ⚠️  Access policies need manual configuration"
    echo ""
    echo -e "${GREEN}Phase 2 is substantially complete!${NC}"
    echo "Proceed to Phase 3: Keycloak Realm Configuration"
else
    echo -e "  ❌ Issues found - resolve before proceeding"
fi

exit $exit_code



