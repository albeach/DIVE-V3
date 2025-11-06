#!/bin/bash

###############################################################################
# DIVE V3 - Remote JWT & Authorization Diagnostic Utility
###############################################################################
# This script performs deep diagnostic analysis to identify the exact cause
# of JWT validation failures and authorization issues on remote deployments.
#
# Usage: ./scripts/diagnose-remote-jwt.sh
# Output: Creates diagnostic-report-TIMESTAMP.log
###############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Output file
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_FILE="diagnostic-report-${TIMESTAMP}.log"

# Logging functions
log() {
    echo -e "$1" | tee -a "$OUTPUT_FILE"
}

log_section() {
    log ""
    log "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    log "${BLUE}║ $1${NC}"
    log "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    log ""
}

log_subsection() {
    log "${CYAN}─── $1 ───${NC}"
}

log_success() {
    log "${GREEN}✓${NC} $1"
}

log_warning() {
    log "${YELLOW}⚠${NC}  $1"
}

log_error() {
    log "${RED}✗${NC} $1"
}

log_info() {
    log "${CYAN}ℹ${NC}  $1"
}

# Check if we're in the project root
if [ ! -f docker-compose.yml ]; then
    log_error "docker-compose.yml not found"
    echo "Please run this script from the DIVE V3 project root"
    exit 1
fi

log_section "DIVE V3 JWT & Authorization Diagnostic Utility"
log_info "Starting diagnostic at: $(date)"
log_info "Output file: $OUTPUT_FILE"
log ""

###############################################################################
# Section 1: System & Network Information
###############################################################################
log_section "1. SYSTEM & NETWORK INFORMATION"

log_subsection "1.1 Server Identity"
log "Hostname: $(hostname)"
log "FQDN: $(hostname -f 2>/dev/null || echo 'N/A')"
log "IP Addresses:"
ip addr show 2>/dev/null | grep -E "inet " | awk '{print "  " $2}' | tee -a "$OUTPUT_FILE" || \
    hostname -I 2>/dev/null | tr ' ' '\n' | sed 's/^/  /' | tee -a "$OUTPUT_FILE"
log ""

log_subsection "1.2 DNS Resolution"
log "Localhost resolution:"
getent hosts localhost 2>/dev/null | tee -a "$OUTPUT_FILE" || log "  N/A"
log "Keycloak container resolution (from host):"
getent hosts keycloak 2>/dev/null | tee -a "$OUTPUT_FILE" || log "  Container name not resolvable from host (expected)"
log ""

###############################################################################
# Section 2: Docker Services Status
###############################################################################
log_section "2. DOCKER SERVICES STATUS"

log_subsection "2.1 Container Status"
docker compose ps 2>&1 | tee -a "$OUTPUT_FILE"
log ""

log_subsection "2.2 Container Health Checks"
for service in postgres keycloak mongo redis opa backend nextjs; do
    status=$(docker compose ps $service --format "{{.Status}}" 2>/dev/null || echo "NOT RUNNING")
    if [[ "$status" == *"healthy"* ]]; then
        log_success "$service: $status"
    elif [[ "$status" == *"unhealthy"* ]]; then
        log_error "$service: $status"
    elif [[ "$status" == *"Up"* ]]; then
        log_warning "$service: $status (no health check)"
    else
        log_error "$service: $status"
    fi
done
log ""

###############################################################################
# Section 3: Keycloak Configuration
###############################################################################
log_section "3. KEYCLOAK CONFIGURATION"

log_subsection "3.1 Environment Variables (from docker-compose.yml)"
log "KC_HOSTNAME:"
grep "KC_HOSTNAME:" docker-compose.yml | head -1 | tee -a "$OUTPUT_FILE"
log "KC_HOSTNAME_STRICT:"
grep "KC_HOSTNAME_STRICT:" docker-compose.yml | head -1 | tee -a "$OUTPUT_FILE" || log "  Not set"
log "KC_HTTP_ENABLED:"
grep "KC_HTTP_ENABLED:" docker-compose.yml | head -1 | tee -a "$OUTPUT_FILE"
log ""

log_subsection "3.2 Keycloak Realm Configuration (via API)"
log_info "Attempting to fetch realm configuration..."

# Get admin token
ADMIN_TOKEN=$(docker compose exec -T keycloak curl -s -X POST \
    "http://localhost:8080/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=admin" \
    -d "grant_type=password" 2>/dev/null | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4) || true

if [ -n "$ADMIN_TOKEN" ]; then
    log_success "Admin token acquired"
    
    # Get broker realm info
    log ""
    log "Broker realm issuer:"
    docker compose exec -T keycloak curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
        "http://localhost:8080/admin/realms/dive-v3-broker" 2>/dev/null | \
        grep -o '"realm":"[^"]*"' | tee -a "$OUTPUT_FILE" || log "  Failed to fetch"
    
    log ""
    log "Broker realm frontendUrl:"
    FRONTEND_URL=$(docker compose exec -T keycloak curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
        "http://localhost:8080/admin/realms/dive-v3-broker" 2>/dev/null | \
        grep -o '"frontendUrl":"[^"]*"' || echo "Not set")
    log "  $FRONTEND_URL"
else
    log_warning "Could not acquire admin token - Keycloak may not be ready"
fi
log ""

log_subsection "3.3 JWKS Endpoint Accessibility"
log "Testing JWKS endpoint (HTTP - internal):"
JWKS_HTTP=$(docker compose exec -T keycloak curl -s -w "\nHTTP_CODE:%{http_code}" \
    "http://localhost:8080/realms/dive-v3-broker/protocol/openid-connect/certs" 2>/dev/null || echo "FAILED")
if [[ "$JWKS_HTTP" == *"HTTP_CODE:200"* ]]; then
    log_success "HTTP JWKS endpoint accessible"
    echo "$JWKS_HTTP" | head -5 | tee -a "$OUTPUT_FILE"
else
    log_error "HTTP JWKS endpoint failed"
    log "$JWKS_HTTP"
fi
log ""

log "Testing JWKS endpoint (HTTPS - external):"
JWKS_HTTPS=$(docker compose exec -T keycloak curl -s -k -w "\nHTTP_CODE:%{http_code}" \
    "https://localhost:8443/realms/dive-v3-broker/protocol/openid-connect/certs" 2>/dev/null || echo "FAILED")
if [[ "$JWKS_HTTPS" == *"HTTP_CODE:200"* ]]; then
    log_success "HTTPS JWKS endpoint accessible"
    echo "$JWKS_HTTPS" | head -5 | tee -a "$OUTPUT_FILE"
else
    log_error "HTTPS JWKS endpoint failed"
    log "$JWKS_HTTPS"
fi
log ""

###############################################################################
# Section 4: Backend Configuration
###############################################################################
log_section "4. BACKEND CONFIGURATION"

log_subsection "4.1 Backend Environment Variables"
log "KEYCLOAK_URL:"
docker compose exec -T backend env 2>/dev/null | grep "KEYCLOAK_URL=" | tee -a "$OUTPUT_FILE" || log "  Not set"
log "KEYCLOAK_REALM:"
docker compose exec -T backend env 2>/dev/null | grep "KEYCLOAK_REALM=" | tee -a "$OUTPUT_FILE" || log "  Not set"
log "KEYCLOAK_JWKS_URI:"
docker compose exec -T backend env 2>/dev/null | grep "KEYCLOAK_JWKS_URI=" | tee -a "$OUTPUT_FILE" || log "  Not set"
log "OPA_URL:"
docker compose exec -T backend env 2>/dev/null | grep "OPA_URL=" | tee -a "$OUTPUT_FILE" || log "  Not set"
log "NODE_TLS_REJECT_UNAUTHORIZED:"
docker compose exec -T backend env 2>/dev/null | grep "NODE_TLS_REJECT_UNAUTHORIZED=" | tee -a "$OUTPUT_FILE" || log "  Not set"
log ""

log_subsection "4.2 Backend Connectivity Tests"
log "Backend → Keycloak HTTP:"
BACKEND_KC_HTTP=$(docker compose exec -T backend curl -s -w "\nHTTP_CODE:%{http_code}" \
    "http://keycloak:8080/realms/dive-v3-broker" 2>/dev/null | tail -1 || echo "FAILED")
if [[ "$BACKEND_KC_HTTP" == *"200"* ]]; then
    log_success "Backend can reach Keycloak HTTP"
else
    log_error "Backend cannot reach Keycloak HTTP: $BACKEND_KC_HTTP"
fi

log "Backend → Keycloak HTTPS:"
BACKEND_KC_HTTPS=$(docker compose exec -T backend curl -s -k -w "\nHTTP_CODE:%{http_code}" \
    "https://keycloak:8443/realms/dive-v3-broker" 2>/dev/null | tail -1 || echo "FAILED")
if [[ "$BACKEND_KC_HTTPS" == *"200"* ]]; then
    log_success "Backend can reach Keycloak HTTPS"
else
    log_error "Backend cannot reach Keycloak HTTPS: $BACKEND_KC_HTTPS"
fi

log "Backend → OPA:"
BACKEND_OPA=$(docker compose exec -T backend curl -s -w "\nHTTP_CODE:%{http_code}" \
    "http://opa:8181/health" 2>/dev/null | tail -1 || echo "FAILED")
if [[ "$BACKEND_OPA" == *"200"* ]]; then
    log_success "Backend can reach OPA"
else
    log_error "Backend cannot reach OPA: $BACKEND_OPA"
fi
log ""

###############################################################################
# Section 5: OPA Status
###############################################################################
log_section "5. OPA (OPEN POLICY AGENT) STATUS"

log_subsection "5.1 OPA Health"
OPA_HEALTH=$(docker compose exec -T backend curl -s "http://opa:8181/health" 2>/dev/null || echo "FAILED")
if [ "$OPA_HEALTH" == "{}" ]; then
    log_success "OPA is healthy"
else
    log_error "OPA health check failed: $OPA_HEALTH"
fi
log ""

log_subsection "5.2 OPA Policies Loaded"
log "Policies directory contents:"
docker compose exec -T opa ls -lah /policies 2>/dev/null | tee -a "$OUTPUT_FILE" || log_error "Cannot list policies"
log ""

log "Loaded policies (via API):"
docker compose exec -T backend curl -s "http://opa:8181/v1/policies" 2>/dev/null | \
    grep -o '"id":"[^"]*"' | tee -a "$OUTPUT_FILE" || log_warning "No policies loaded or API failed"
log ""

###############################################################################
# Section 6: Sample JWT Token Analysis
###############################################################################
log_section "6. JWT TOKEN ANALYSIS"

log_subsection "6.1 Test Token Generation"
log_info "Attempting to generate test token via Keycloak..."

# Try to get a token for testuser
TEST_TOKEN=$(docker compose exec -T keycloak curl -s -X POST \
    "http://localhost:8080/realms/dive-v3-broker/protocol/openid-connect/token" \
    -d "client_id=dive-v3-client-broker" \
    -d "client_secret=8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L" \
    -d "username=admin-dive" \
    -d "password=Password123!" \
    -d "grant_type=password" 2>/dev/null | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4) || true

if [ -n "$TEST_TOKEN" ]; then
    log_success "Test token acquired"
    log ""
    
    log_subsection "6.2 Token Structure Analysis"
    log "Token header (decoded):"
    echo "$TEST_TOKEN" | cut -d. -f1 | base64 -d 2>/dev/null | jq . 2>/dev/null | tee -a "$OUTPUT_FILE" || \
        echo "$TEST_TOKEN" | cut -d. -f1 | base64 -d 2>/dev/null | tee -a "$OUTPUT_FILE"
    log ""
    
    log "Token payload (decoded):"
    PAYLOAD=$(echo "$TEST_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null || echo "{}")
    echo "$PAYLOAD" | jq . 2>/dev/null | tee -a "$OUTPUT_FILE" || echo "$PAYLOAD" | tee -a "$OUTPUT_FILE"
    log ""
    
    log_subsection "6.3 Critical Claims Analysis"
    log "Issuer (iss):"
    echo "$PAYLOAD" | jq -r '.iss' 2>/dev/null | sed 's/^/  /' | tee -a "$OUTPUT_FILE"
    
    log "Audience (aud):"
    echo "$PAYLOAD" | jq -r '.aud' 2>/dev/null | sed 's/^/  /' | tee -a "$OUTPUT_FILE"
    
    log "Subject (sub):"
    echo "$PAYLOAD" | jq -r '.sub' 2>/dev/null | sed 's/^/  /' | tee -a "$OUTPUT_FILE"
    
    log "Authorized Party (azp):"
    echo "$PAYLOAD" | jq -r '.azp' 2>/dev/null | sed 's/^/  /' | tee -a "$OUTPUT_FILE"
    
    log "ACR (Authentication Context Class Reference):"
    echo "$PAYLOAD" | jq -r '.acr' 2>/dev/null | sed 's/^/  /' | tee -a "$OUTPUT_FILE"
    
    log "AMR (Authentication Methods Reference):"
    echo "$PAYLOAD" | jq -r '.amr' 2>/dev/null | sed 's/^/  /' | tee -a "$OUTPUT_FILE"
    
    log "Clearance:"
    echo "$PAYLOAD" | jq -r '.clearance' 2>/dev/null | sed 's/^/  /' | tee -a "$OUTPUT_FILE"
    
    log "Country of Affiliation:"
    echo "$PAYLOAD" | jq -r '.countryOfAffiliation' 2>/dev/null | sed 's/^/  /' | tee -a "$OUTPUT_FILE"
    
    log ""
    
    log_subsection "6.4 Token Validation Test (Backend)"
    log_info "Testing token validation via backend API..."
    
    # Save token for manual testing
    echo "$TEST_TOKEN" > test-token.txt
    log_info "Token saved to: test-token.txt"
    
else
    log_warning "Could not generate test token - user may not exist or credentials invalid"
    log_info "This is OK if system is fresh - just means we can't test with real token"
fi
log ""

###############################################################################
# Section 7: Recent Backend Logs
###############################################################################
log_section "7. RECENT BACKEND LOGS (Last 50 lines)"

log_subsection "7.1 Backend Startup & Configuration"
docker compose logs backend --tail 50 2>&1 | tee -a "$OUTPUT_FILE"
log ""

log_subsection "7.2 JWT/Auth Related Errors (Last 100 lines)"
JWT_ERRORS=$(docker compose logs backend --tail 100 2>&1 | grep -iE "jwt|token|unauthorized|forbidden|invalid|expired" || echo "No JWT-related errors found")
log "$JWT_ERRORS"
log ""

###############################################################################
# Section 8: Recent Keycloak Logs
###############################################################################
log_section "8. RECENT KEYCLOAK LOGS (Last 50 lines)"

docker compose logs keycloak --tail 50 2>&1 | tee -a "$OUTPUT_FILE"
log ""

log_subsection "8.1 Keycloak Errors (Last 100 lines)"
KC_ERRORS=$(docker compose logs keycloak --tail 100 2>&1 | grep -iE "error|exception|failed|warn" || echo "No errors found")
log "$KC_ERRORS"
log ""

###############################################################################
# Section 9: Recent OPA Logs
###############################################################################
log_section "9. RECENT OPA LOGS (Last 30 lines)"

docker compose logs opa --tail 30 2>&1 | tee -a "$OUTPUT_FILE"
log ""

###############################################################################
# Section 10: Resource Access Test
###############################################################################
log_section "10. RESOURCE ACCESS TEST"

if [ -n "$TEST_TOKEN" ]; then
    log_subsection "10.1 Testing /api/resources endpoint"
    log_info "Attempting to fetch resources with test token..."
    
    RESOURCE_RESPONSE=$(docker compose exec -T backend curl -s -w "\nHTTP_CODE:%{http_code}" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        "http://localhost:4000/api/resources" 2>/dev/null || echo "FAILED")
    
    HTTP_CODE=$(echo "$RESOURCE_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
    BODY=$(echo "$RESOURCE_RESPONSE" | grep -v "HTTP_CODE:")
    
    log "HTTP Status Code: $HTTP_CODE"
    log "Response Body:"
    echo "$BODY" | jq . 2>/dev/null | head -30 | tee -a "$OUTPUT_FILE" || echo "$BODY" | head -30 | tee -a "$OUTPUT_FILE"
    
    if [[ "$HTTP_CODE" == "200" ]]; then
        log_success "Resource access successful"
    elif [[ "$HTTP_CODE" == "401" ]]; then
        log_error "Unauthorized (401) - JWT validation likely failing"
    elif [[ "$HTTP_CODE" == "403" ]]; then
        log_warning "Forbidden (403) - JWT valid but authorization denied"
    else
        log_error "Unexpected status code: $HTTP_CODE"
    fi
else
    log_warning "Skipping resource access test (no test token available)"
fi
log ""

###############################################################################
# Section 11: Configuration Mismatch Detection
###############################################################################
log_section "11. CONFIGURATION MISMATCH DETECTION"

log_subsection "11.1 Hostname Consistency Check"

KC_HOSTNAME=$(grep "KC_HOSTNAME:" docker-compose.yml | head -1 | awk '{print $2}' | tr -d '\r')
KEYCLOAK_JWKS_URI=$(docker compose exec -T backend env 2>/dev/null | grep "KEYCLOAK_JWKS_URI=" | cut -d= -f2 | tr -d '\r')

log "KC_HOSTNAME from docker-compose: $KC_HOSTNAME"
log "KEYCLOAK_JWKS_URI from backend: $KEYCLOAK_JWKS_URI"

if [ -n "$TEST_TOKEN" ]; then
    TOKEN_ISSUER=$(echo "$PAYLOAD" | jq -r '.iss' 2>/dev/null | tr -d '\r')
    log "Token issuer (iss claim): $TOKEN_ISSUER"
    
    # Extract hostname from issuer
    ISSUER_HOSTNAME=$(echo "$TOKEN_ISSUER" | sed -E 's|https?://([^:/]+).*|\1|')
    log "Extracted issuer hostname: $ISSUER_HOSTNAME"
    
    # Check consistency
    if [[ "$ISSUER_HOSTNAME" == "$KC_HOSTNAME" ]]; then
        log_success "Hostname consistency: PASS (issuer matches KC_HOSTNAME)"
    else
        log_error "Hostname consistency: FAIL (issuer '$ISSUER_HOSTNAME' != KC_HOSTNAME '$KC_HOSTNAME')"
        log ""
        log_warning "THIS IS LIKELY YOUR PROBLEM!"
        log_info "Keycloak is issuing tokens with hostname '$ISSUER_HOSTNAME'"
        log_info "But KC_HOSTNAME is configured as '$KC_HOSTNAME'"
        log_info "JWT validation will fail due to issuer mismatch"
        log ""
        log_info "Recommended fix:"
        log "  1. Run: ./scripts/fix-remote-hostname.sh"
        log "  2. Or manually set KC_HOSTNAME: $ISSUER_HOSTNAME in docker-compose.yml"
    fi
else
    log_warning "Cannot check hostname consistency (no test token)"
fi
log ""

###############################################################################
# Section 12: Summary & Recommendations
###############################################################################
log_section "12. DIAGNOSTIC SUMMARY & RECOMMENDATIONS"

log_subsection "12.1 Service Health Summary"
SERVICES_OK=0
SERVICES_FAIL=0

for service in postgres keycloak mongo redis opa backend nextjs; do
    status=$(docker compose ps $service --format "{{.Status}}" 2>/dev/null || echo "NOT RUNNING")
    if [[ "$status" == *"healthy"* ]] || [[ "$status" == *"Up"* ]]; then
        ((SERVICES_OK++))
    else
        ((SERVICES_FAIL++))
    fi
done

log "Services: $SERVICES_OK OK, $SERVICES_FAIL Failed"

if [ $SERVICES_FAIL -gt 0 ]; then
    log_error "Some services are not running properly"
    log_info "Fix: docker compose up -d (restart failed services)"
fi
log ""

log_subsection "12.2 Identified Issues"
ISSUES_FOUND=0

# Check for hostname mismatch
if [ -n "$TEST_TOKEN" ] && [ "$ISSUER_HOSTNAME" != "$KC_HOSTNAME" ]; then
    ((ISSUES_FOUND++))
    log_error "Issue #$ISSUES_FOUND: Hostname Mismatch"
    log "  Token issuer: $ISSUER_HOSTNAME"
    log "  KC_HOSTNAME:  $KC_HOSTNAME"
    log "  Impact: JWT validation will fail"
    log "  Fix: Run ./scripts/fix-remote-hostname.sh"
    log ""
fi

# Check for OPA connectivity
if [[ "$BACKEND_OPA" != *"200"* ]]; then
    ((ISSUES_FOUND++))
    log_error "Issue #$ISSUES_FOUND: Backend cannot reach OPA"
    log "  Impact: Authorization decisions will fail"
    log "  Fix: docker compose restart opa backend"
    log ""
fi

# Check for Keycloak connectivity
if [[ "$BACKEND_KC_HTTPS" != *"200"* ]]; then
    ((ISSUES_FOUND++))
    log_error "Issue #$ISSUES_FOUND: Backend cannot reach Keycloak HTTPS"
    log "  Impact: JWKS retrieval may fail"
    log "  Fix: Check certificates and NODE_TLS_REJECT_UNAUTHORIZED setting"
    log ""
fi

if [ $ISSUES_FOUND -eq 0 ]; then
    log_success "No critical configuration issues detected"
    log_info "If you're still experiencing JWT errors, check recent backend logs above"
else
    log_warning "$ISSUES_FOUND issue(s) detected - see recommendations above"
fi
log ""

log_subsection "12.3 Next Steps"
log "1. Review the full diagnostic report: $OUTPUT_FILE"
log "2. Address any issues identified in section 12.2"
log "3. If issues persist, share this diagnostic report for further analysis"
log "4. Test resource access after applying fixes"
log ""

log_section "DIAGNOSTIC COMPLETE"
log_info "Report saved to: $OUTPUT_FILE"
log_info "Share this file if you need further assistance"
log ""

# Print summary to console
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}║              Diagnostic Complete! ✓                            ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Report saved to:${NC} $OUTPUT_FILE"
echo ""
if [ $ISSUES_FOUND -gt 0 ]; then
    echo -e "${YELLOW}Issues found:${NC} $ISSUES_FOUND"
    echo -e "${CYAN}Review section 12.2 for details and fixes${NC}"
else
    echo -e "${GREEN}No critical issues detected${NC}"
fi
echo ""

