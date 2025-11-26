#!/usr/bin/env bash
# ============================================
# DIVE V3 - End-to-End Validation Script
# ============================================
# Validates the complete infrastructure across all instances
#
# Test Categories:
# 1. Infrastructure Health
# 2. Authentication Flow  
# 3. Authorization (OPA)
# 4. Federation
# 5. Monitoring
#
# Usage:
#   ./scripts/e2e-validation.sh [--verbose] [--quick]
#
# ============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_ROOT/logs/e2e"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
LOG_FILE="$LOG_DIR/validation-$TIMESTAMP.log"

mkdir -p "$LOG_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Options
VERBOSE=false
QUICK=false

for arg in "$@"; do
    case "$arg" in
        --verbose) VERBOSE=true ;;
        --quick) QUICK=true ;;
    esac
done

# Instances
declare -A INSTANCES
INSTANCES=(
    ["usa"]="https://usa-app.dive25.com|https://usa-idp.dive25.com|https://usa-api.dive25.com"
    ["fra"]="https://fra-app.dive25.com|https://fra-idp.dive25.com|https://fra-api.dive25.com"
    ["deu"]="https://deu-app.prosecurity.biz|https://deu-idp.prosecurity.biz|https://deu-api.prosecurity.biz"
)

# Logging
log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

# Test runner
run_test() {
    local name="$1"
    local cmd="$2"
    local expected="${3:-0}"
    
    if [[ "$VERBOSE" == "true" ]]; then
        log "${BLUE}Running: $cmd${NC}"
    fi
    
    local result
    if result=$(eval "$cmd" 2>&1); then
        exit_code=0
    else
        exit_code=$?
    fi
    
    if [[ "$exit_code" == "$expected" ]]; then
        log "  ${GREEN}✅ PASS${NC}: $name"
        ((TESTS_PASSED++))
        return 0
    else
        log "  ${RED}❌ FAIL${NC}: $name"
        if [[ "$VERBOSE" == "true" ]]; then
            log "    Output: $result"
        fi
        ((TESTS_FAILED++))
        return 1
    fi
}

# HTTP test
http_test() {
    local name="$1"
    local url="$2"
    local expected_code="${3:-200}"
    
    local http_code
    http_code=$(curl -sk -o /dev/null -w "%{http_code}" "$url" --max-time 15 2>/dev/null) || http_code="000"
    
    if [[ "$http_code" == "$expected_code" || "$expected_code" == "2xx" && "$http_code" =~ ^2 ]]; then
        log "  ${GREEN}✅ PASS${NC}: $name (HTTP $http_code)"
        ((TESTS_PASSED++))
        return 0
    else
        log "  ${RED}❌ FAIL${NC}: $name (Expected $expected_code, got $http_code)"
        ((TESTS_FAILED++))
        return 1
    fi
}

# ============================================
# Test Suites
# ============================================

test_infrastructure_health() {
    log ""
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log "${CYAN}1. Infrastructure Health Tests${NC}"
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    for instance in "${!INSTANCES[@]}"; do
        IFS='|' read -r app_url idp_url api_url <<< "${INSTANCES[$instance]}"
        
        log ""
        log "${BLUE}Instance: ${instance^^}${NC}"
        
        http_test "Frontend accessible" "$app_url" "2xx"
        http_test "Keycloak realm accessible" "$idp_url/realms/dive-v3-broker" "2xx"
        http_test "Backend API health" "$api_url/health" "2xx"
    done
}

test_authentication_endpoints() {
    log ""
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log "${CYAN}2. Authentication Endpoint Tests${NC}"
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    for instance in "${!INSTANCES[@]}"; do
        IFS='|' read -r app_url idp_url api_url <<< "${INSTANCES[$instance]}"
        
        log ""
        log "${BLUE}Instance: ${instance^^}${NC}"
        
        # Keycloak OIDC endpoints
        http_test "OIDC well-known config" "$idp_url/realms/dive-v3-broker/.well-known/openid-configuration" "2xx"
        http_test "JWKS endpoint" "$idp_url/realms/dive-v3-broker/protocol/openid-connect/certs" "2xx"
        
        # NextAuth endpoints
        http_test "NextAuth CSRF endpoint" "$app_url/api/auth/csrf" "2xx"
        http_test "NextAuth providers" "$app_url/api/auth/providers" "2xx"
    done
}

test_opa_policies() {
    log ""
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log "${CYAN}3. OPA Policy Tests${NC}"
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    log ""
    log "${BLUE}Running OPA test suite...${NC}"
    
    if command -v opa &> /dev/null; then
        local opa_result
        opa_result=$(opa test "$PROJECT_ROOT/policies/" -v 2>&1) || true
        
        local passed=$(echo "$opa_result" | grep -c "PASS" || echo "0")
        local failed=$(echo "$opa_result" | grep -c "FAIL" || echo "0")
        
        if [[ "$failed" -eq 0 ]]; then
            log "  ${GREEN}✅ PASS${NC}: OPA policy tests ($passed tests passed)"
            ((TESTS_PASSED++))
        else
            log "  ${RED}❌ FAIL${NC}: OPA policy tests ($failed failed, $passed passed)"
            ((TESTS_FAILED++))
        fi
    else
        log "  ${YELLOW}⚠️ SKIP${NC}: OPA not installed locally"
        ((TESTS_SKIPPED++))
    fi
}

test_federation_endpoints() {
    log ""
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log "${CYAN}4. Federation Endpoint Tests${NC}"
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    for instance in "${!INSTANCES[@]}"; do
        IFS='|' read -r app_url idp_url api_url <<< "${INSTANCES[$instance]}"
        
        log ""
        log "${BLUE}Instance: ${instance^^}${NC}"
        
        # Check IdP listing endpoint
        http_test "IdP listing API" "$api_url/api/idps/public" "2xx"
        
        # Check federation broker
        http_test "Broker realm" "$idp_url/realms/dive-v3-broker" "2xx"
    done
}

test_monitoring_infrastructure() {
    log ""
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log "${CYAN}5. Monitoring Infrastructure Tests${NC}"
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    log ""
    log "${BLUE}Status Page${NC}"
    http_test "Public status page" "https://status.dive25.com/" "2xx"
    http_test "Status API endpoint" "https://status.dive25.com/api/status" "2xx"
    http_test "Status health check" "https://status.dive25.com/health" "2xx"
    
    log ""
    log "${BLUE}Local Monitoring${NC}"
    
    # Check local status page container
    if docker ps --filter name=dive-v3-status-page --format '{{.Status}}' 2>/dev/null | grep -q "healthy"; then
        log "  ${GREEN}✅ PASS${NC}: Status page container healthy"
        ((TESTS_PASSED++))
    else
        log "  ${RED}❌ FAIL${NC}: Status page container not healthy"
        ((TESTS_FAILED++))
    fi
    
    # Check scheduled monitoring
    if launchctl list 2>/dev/null | grep -q "dive-v3.health-monitor"; then
        log "  ${GREEN}✅ PASS${NC}: Scheduled monitoring active (LaunchAgent)"
        ((TESTS_PASSED++))
    else
        log "  ${YELLOW}⚠️ SKIP${NC}: Scheduled monitoring not configured"
        ((TESTS_SKIPPED++))
    fi
}

test_security_headers() {
    log ""
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log "${CYAN}6. Security Header Tests${NC}"
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    for instance in "${!INSTANCES[@]}"; do
        IFS='|' read -r app_url idp_url api_url <<< "${INSTANCES[$instance]}"
        
        log ""
        log "${BLUE}Instance: ${instance^^}${NC}"
        
        local headers
        headers=$(curl -sk -I "$app_url" --max-time 10 2>/dev/null) || headers=""
        
        # Check security headers
        if echo "$headers" | grep -qi "x-frame-options"; then
            log "  ${GREEN}✅ PASS${NC}: X-Frame-Options present"
            ((TESTS_PASSED++))
        else
            log "  ${YELLOW}⚠️ WARN${NC}: X-Frame-Options missing"
            ((TESTS_SKIPPED++))
        fi
        
        if echo "$headers" | grep -qi "x-content-type-options"; then
            log "  ${GREEN}✅ PASS${NC}: X-Content-Type-Options present"
            ((TESTS_PASSED++))
        else
            log "  ${YELLOW}⚠️ WARN${NC}: X-Content-Type-Options missing"
            ((TESTS_SKIPPED++))
        fi
        
        if echo "$headers" | grep -qi "strict-transport-security"; then
            log "  ${GREEN}✅ PASS${NC}: HSTS present"
            ((TESTS_PASSED++))
        else
            log "  ${YELLOW}⚠️ WARN${NC}: HSTS missing (Cloudflare may add)"
            ((TESTS_SKIPPED++))
        fi
    done
}

test_database_connectivity() {
    log ""
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log "${CYAN}7. Database Connectivity Tests${NC}"
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    log ""
    log "${BLUE}Local Docker Containers${NC}"
    
    # Check PostgreSQL
    if docker ps --filter name=postgres --format '{{.Status}}' 2>/dev/null | grep -q "healthy\|Up"; then
        log "  ${GREEN}✅ PASS${NC}: PostgreSQL container running"
        ((TESTS_PASSED++))
    else
        log "  ${YELLOW}⚠️ SKIP${NC}: PostgreSQL container not found locally"
        ((TESTS_SKIPPED++))
    fi
    
    # Check MongoDB
    if docker ps --filter name=mongo --format '{{.Status}}' 2>/dev/null | grep -q "healthy\|Up"; then
        log "  ${GREEN}✅ PASS${NC}: MongoDB container running"
        ((TESTS_PASSED++))
    else
        log "  ${YELLOW}⚠️ SKIP${NC}: MongoDB container not found locally"
        ((TESTS_SKIPPED++))
    fi
    
    # Check Redis
    if docker ps --filter name=redis --format '{{.Status}}' 2>/dev/null | grep -q "healthy\|Up"; then
        log "  ${GREEN}✅ PASS${NC}: Redis container running"
        ((TESTS_PASSED++))
    else
        log "  ${YELLOW}⚠️ SKIP${NC}: Redis container not found locally"
        ((TESTS_SKIPPED++))
    fi
}

# ============================================
# Main
# ============================================

main() {
    log "${CYAN}============================================${NC}"
    log "${CYAN}🧪 DIVE V3 End-to-End Validation${NC}"
    log "${CYAN}============================================${NC}"
    log "Timestamp: $(date)"
    log "Log file: $LOG_FILE"
    
    # Run test suites
    test_infrastructure_health
    test_authentication_endpoints
    
    if [[ "$QUICK" == "false" ]]; then
        test_opa_policies
        test_federation_endpoints
        test_monitoring_infrastructure
        test_security_headers
        test_database_connectivity
    fi
    
    # Summary
    log ""
    log "${CYAN}============================================${NC}"
    log "${CYAN}📊 Test Summary${NC}"
    log "${CYAN}============================================${NC}"
    log ""
    log "  ${GREEN}Passed:  $TESTS_PASSED${NC}"
    log "  ${RED}Failed:  $TESTS_FAILED${NC}"
    log "  ${YELLOW}Skipped: $TESTS_SKIPPED${NC}"
    log ""
    
    local total=$((TESTS_PASSED + TESTS_FAILED))
    if [[ "$total" -gt 0 ]]; then
        local pct=$((TESTS_PASSED * 100 / total))
        log "  Pass Rate: ${pct}%"
    fi
    
    log ""
    log "Full log saved to: $LOG_FILE"
    
    if [[ "$TESTS_FAILED" -gt 0 ]]; then
        log ""
        log "${RED}❌ VALIDATION FAILED${NC}"
        exit 1
    else
        log ""
        log "${GREEN}✅ ALL TESTS PASSED${NC}"
        exit 0
    fi
}

main "$@"


