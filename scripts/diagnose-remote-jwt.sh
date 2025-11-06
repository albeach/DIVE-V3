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
# Section 6: JWT Token Analysis
###############################################################################
log_section "6. JWT TOKEN ANALYSIS"

log_subsection "6.1 Detect Custom Hostname"
log_info "Detecting actual hostname being used..."

# Try to detect from NEXT_PUBLIC_KEYCLOAK_URL
NEXT_PUBLIC_KC=$(grep "NEXT_PUBLIC_KEYCLOAK_URL:" docker-compose.yml | head -1 | awk '{print $2}' | tr -d '\r' | sed 's|https://||' | sed 's|:.*||')
log "From docker-compose.yml NEXT_PUBLIC_KEYCLOAK_URL: $NEXT_PUBLIC_KC"

# Get current hostname
CURRENT_HOSTNAME=$(hostname)
log "Server hostname: $CURRENT_HOSTNAME"

# Get primary IP
PRIMARY_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "N/A")
log "Server primary IP: $PRIMARY_IP"

log ""
log_warning "IMPORTANT: If you're accessing the frontend via a custom hostname/IP,"
log_warning "please provide it when prompted below for accurate diagnosis."
log ""

# Prompt for actual hostname
read -p "Enter the hostname/IP you use to access the frontend (or press Enter to skip): " USER_HOSTNAME
if [ -n "$USER_HOSTNAME" ]; then
    ACTUAL_HOSTNAME="$USER_HOSTNAME"
    log_success "Using custom hostname: $ACTUAL_HOSTNAME"
else
    ACTUAL_HOSTNAME="$NEXT_PUBLIC_KC"
    log_info "Using hostname from config: $ACTUAL_HOSTNAME"
fi
log ""

log_subsection "6.2 Live Token Capture (from actual hostname)"
log_info "Attempting to capture a real token from the actual hostname..."
log ""
log_warning "IMPORTANT: How to find your JWT token (not the session cookie!)"
log ""
log "Option 1 - From Network Tab (RECOMMENDED):"
log "  1. Open browser to: https://$ACTUAL_HOSTNAME:3000"
log "  2. Login to the application"
log "  3. Open Browser DevTools (F12)"
log "  4. Go to: Network tab"
log "  5. Navigate to any page (e.g., Documents)"
log "  6. Look for API requests to 'resources' or 'api'"
log "  7. Click on a request → Headers tab"
log "  8. Find 'Authorization: Bearer <token>'"
log "  9. Copy ONLY the token part (long string after 'Bearer ')"
log ""
log "Option 2 - From Console:"
log "  1. Open Browser DevTools (F12) → Console tab"
log "  2. Type: document.cookie"
log "  3. Look for a very long JWT token (starts with 'eyJ')"
log "  4. Copy the entire token"
log ""
log "NOTE: The token should start with 'eyJ' and have 3 parts separated by dots (xxx.yyy.zzz)"
log "      Do NOT use the short session cookie (e.g., 'next-auth.session-token=abc123')"
log ""
read -p "Paste your JWT token here (starts with eyJ..., or Enter to skip): " LIVE_TOKEN

if [ -n "$LIVE_TOKEN" ]; then
    # Validate token format (should have 3 parts: header.payload.signature)
    TOKEN_PARTS=$(echo "$LIVE_TOKEN" | grep -o '\.' | wc -l)
    
    if [ "$TOKEN_PARTS" -ne 2 ]; then
        log_error "Invalid token format - JWT should have exactly 2 dots (3 parts)"
        log_warning "You may have pasted a session cookie instead of a JWT token"
        log_info "JWT format: eyJhbGc...xxxxx.eyJpc3M...yyyyy.signature_zzzzz"
        log_info "Skipping live token analysis..."
        LIVE_TOKEN=""
    else
        log_success "Live token captured!"
        log_info "Token length: ${#LIVE_TOKEN} characters"
        
        # Check if it starts with eyJ (base64 encoded JSON header)
        if [[ "$LIVE_TOKEN" == eyJ* ]]; then
            log_success "Token format looks valid (starts with eyJ)"
        else
            log_warning "Token doesn't start with 'eyJ' - may not be a valid JWT"
        fi
        log ""
    fi
fi

if [ -n "$LIVE_TOKEN" ]; then
    log_subsection "6.3 Live Token Analysis"
    log "Decoding token header..."
    
    # Try to decode header with error handling
    HEADER_DECODE=$(echo "$LIVE_TOKEN" | cut -d. -f1 | base64 -d 2>&1)
    if [ $? -eq 0 ]; then
        log "Token header (decoded):"
        echo "$HEADER_DECODE" | jq . 2>/dev/null | tee -a "$OUTPUT_FILE" || echo "$HEADER_DECODE" | tee -a "$OUTPUT_FILE"
    else
        log_error "Failed to decode token header - invalid base64"
        log "Raw header: $(echo "$LIVE_TOKEN" | cut -d. -f1)"
        log ""
        log_warning "This is likely not a valid JWT token"
        log_info "Skipping live token analysis..."
        LIVE_TOKEN=""
    fi
    log ""
fi

if [ -n "$LIVE_TOKEN" ]; then
    log "Decoding token payload..."
    
    # Try to decode payload with error handling
    LIVE_PAYLOAD=$(echo "$LIVE_TOKEN" | cut -d. -f2 | base64 -d 2>&1)
    if [ $? -eq 0 ]; then
        log "Token payload (decoded):"
        echo "$LIVE_PAYLOAD" | jq . 2>/dev/null | tee -a "$OUTPUT_FILE" || echo "$LIVE_PAYLOAD" | tee -a "$OUTPUT_FILE"
        log ""
        
        log_subsection "6.4 Live Token Claims Analysis"
        log "Issuer (iss):"
        LIVE_ISS=$(echo "$LIVE_PAYLOAD" | jq -r '.iss' 2>/dev/null)
        echo "  $LIVE_ISS" | tee -a "$OUTPUT_FILE"
        
        log "Audience (aud):"
        echo "$LIVE_PAYLOAD" | jq -r '.aud' 2>/dev/null | sed 's/^/  /' | tee -a "$OUTPUT_FILE"
        
        log "Subject (sub):"
        echo "$LIVE_PAYLOAD" | jq -r '.sub' 2>/dev/null | sed 's/^/  /' | tee -a "$OUTPUT_FILE"
        
        log "Authorized Party (azp):"
        echo "$LIVE_PAYLOAD" | jq -r '.azp' 2>/dev/null | sed 's/^/  /' | tee -a "$OUTPUT_FILE"
        
        log "ACR (Authentication Context Class Reference):"
        LIVE_ACR=$(echo "$LIVE_PAYLOAD" | jq -r '.acr' 2>/dev/null)
        echo "  $LIVE_ACR" | tee -a "$OUTPUT_FILE"
        
        log "AMR (Authentication Methods Reference):"
        LIVE_AMR=$(echo "$LIVE_PAYLOAD" | jq -r '.amr' 2>/dev/null)
        echo "  $LIVE_AMR" | tee -a "$OUTPUT_FILE"
        
        log "Clearance:"
        echo "$LIVE_PAYLOAD" | jq -r '.clearance' 2>/dev/null | sed 's/^/  /' | tee -a "$OUTPUT_FILE"
        
        log "Country of Affiliation:"
        echo "$LIVE_PAYLOAD" | jq -r '.countryOfAffiliation' 2>/dev/null | sed 's/^/  /' | tee -a "$OUTPUT_FILE"
        
        log "Issued At (iat):"
        IAT=$(echo "$LIVE_PAYLOAD" | jq -r '.iat' 2>/dev/null)
        if [ "$IAT" != "null" ] && [ -n "$IAT" ]; then
            IAT_DATE=$(date -d @$IAT 2>/dev/null || date -r $IAT 2>/dev/null || echo "N/A")
            echo "  $IAT ($IAT_DATE)" | tee -a "$OUTPUT_FILE"
        else
            echo "  N/A" | tee -a "$OUTPUT_FILE"
        fi
        
        log "Expires At (exp):"
        EXP=$(echo "$LIVE_PAYLOAD" | jq -r '.exp' 2>/dev/null)
        if [ "$EXP" != "null" ] && [ -n "$EXP" ]; then
            EXP_DATE=$(date -d @$EXP 2>/dev/null || date -r $EXP 2>/dev/null || echo "N/A")
            NOW=$(date +%s)
            if [ $EXP -lt $NOW ]; then
                echo "  $EXP ($EXP_DATE) - ${RED}EXPIRED${NC}" | tee -a "$OUTPUT_FILE"
            else
                echo "  $EXP ($EXP_DATE) - ${GREEN}Valid${NC}" | tee -a "$OUTPUT_FILE"
            fi
        else
            echo "  N/A" | tee -a "$OUTPUT_FILE"
        fi
        
        log ""
        
        # Save live token for testing
        echo "$LIVE_TOKEN" > live-token.txt
        log_info "Live token saved to: live-token.txt"
        
        # Extract issuer hostname from live token
        LIVE_ISSUER_HOSTNAME=$(echo "$LIVE_ISS" | sed -E 's|https?://([^:/]+).*|\1|')
        log_info "Extracted issuer hostname from live token: $LIVE_ISSUER_HOSTNAME"
    else
        log_error "Failed to decode token payload - invalid base64"
        log "Raw payload: $(echo "$LIVE_TOKEN" | cut -d. -f2 | head -c 50)..."
        log ""
        log_warning "This is likely not a valid JWT token"
        log_info "Skipping live token analysis..."
        LIVE_TOKEN=""
        LIVE_PAYLOAD=""
        LIVE_ISS=""
        LIVE_ISSUER_HOSTNAME=""
    fi
    
else
    log_warning "No live token provided - will use test token instead"
    LIVE_TOKEN=""
    LIVE_PAYLOAD=""
    LIVE_ISS=""
    LIVE_ISSUER_HOSTNAME=""
fi
log ""

log_subsection "6.5 Test Token Generation (via Keycloak API)"
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
    
    log_subsection "6.6 Test Token Claims Analysis"
    TEST_PAYLOAD=$(echo "$TEST_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null || echo "{}")
    
    log "Issuer (iss):"
    TEST_ISS=$(echo "$TEST_PAYLOAD" | jq -r '.iss' 2>/dev/null)
    echo "  $TEST_ISS" | tee -a "$OUTPUT_FILE"
    
    log "ACR (Authentication Context Class Reference):"
    TEST_ACR=$(echo "$TEST_PAYLOAD" | jq -r '.acr' 2>/dev/null)
    echo "  $TEST_ACR" | tee -a "$OUTPUT_FILE"
    
    log "AMR (Authentication Methods Reference):"
    TEST_AMR=$(echo "$TEST_PAYLOAD" | jq -r '.amr' 2>/dev/null)
    echo "  $TEST_AMR" | tee -a "$OUTPUT_FILE"
    
    # Save test token for manual testing
    echo "$TEST_TOKEN" > test-token.txt
    log_info "Test token saved to: test-token.txt"
    
    # Extract issuer hostname from test token
    TEST_ISSUER_HOSTNAME=$(echo "$TEST_ISS" | sed -E 's|https?://([^:/]+).*|\1|')
    log_info "Extracted issuer hostname from test token: $TEST_ISSUER_HOSTNAME"
    
else
    log_warning "Could not generate test token - user may not exist or credentials invalid"
    TEST_TOKEN=""
    TEST_PAYLOAD=""
    TEST_ISS=""
    TEST_ISSUER_HOSTNAME=""
fi
log ""

log_subsection "6.7 Token Comparison (Live vs Test)"
if [ -n "$LIVE_TOKEN" ] && [ -n "$TEST_TOKEN" ]; then
    log "Comparing live token vs test token..."
    log ""
    log "Live token issuer: $LIVE_ISS"
    log "Test token issuer: $TEST_ISS"
    log ""
    
    if [ "$LIVE_ISS" == "$TEST_ISS" ]; then
        log_success "Issuers match - tokens are consistent"
    else
        log_error "Issuer mismatch - tokens from different sources!"
        log_warning "This may indicate configuration changed between token generation and now"
    fi
    log ""
    
    log "Live token ACR: $LIVE_ACR"
    log "Test token ACR: $TEST_ACR"
    log ""
    
    log "Live token AMR: $LIVE_AMR"
    log "Test token AMR: $TEST_AMR"
elif [ -n "$LIVE_TOKEN" ]; then
    log_info "Using live token for analysis (test token unavailable)"
elif [ -n "$TEST_TOKEN" ]; then
    log_info "Using test token for analysis (no live token provided)"
else
    log_warning "No tokens available for analysis"
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

# Use live token if available, otherwise test token
if [ -n "$LIVE_TOKEN" ]; then
    TOKEN_TO_USE="$LIVE_TOKEN"
    TOKEN_TYPE="Live Token"
elif [ -n "$TEST_TOKEN" ]; then
    TOKEN_TO_USE="$TEST_TOKEN"
    TOKEN_TYPE="Test Token"
else
    TOKEN_TO_USE=""
    TOKEN_TYPE=""
fi

if [ -n "$TOKEN_TO_USE" ]; then
    log_subsection "10.1 Testing /api/resources endpoint with $TOKEN_TYPE"
    log_info "Attempting to fetch resources..."
    
    RESOURCE_RESPONSE=$(docker compose exec -T backend curl -s -w "\nHTTP_CODE:%{http_code}" \
        -H "Authorization: Bearer $TOKEN_TO_USE" \
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
        log ""
        log_warning "Common causes for 401 errors:"
        log "  1. Token issuer doesn't match expected issuer (hostname mismatch)"
        log "  2. Token expired"
        log "  3. Token signature invalid (JWKS mismatch)"
        log "  4. Backend can't reach Keycloak JWKS endpoint"
    elif [[ "$HTTP_CODE" == "403" ]]; then
        log_warning "Forbidden (403) - JWT valid but authorization denied"
        log ""
        log_info "Token is valid but OPA denied access. Check:"
        log "  1. User clearance level"
        log "  2. Resource classification"
        log "  3. OPA policy rules"
    else
        log_error "Unexpected status code: $HTTP_CODE"
    fi
else
    log_warning "Skipping resource access test (no token available)"
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
log "Actual hostname you're using: $ACTUAL_HOSTNAME"
log ""

# Determine which token's issuer to use for comparison
if [ -n "$LIVE_ISS" ]; then
    TOKEN_ISSUER="$LIVE_ISS"
    ISSUER_HOSTNAME="$LIVE_ISSUER_HOSTNAME"
    TOKEN_SOURCE="Live Token"
elif [ -n "$TEST_ISS" ]; then
    TOKEN_ISSUER="$TEST_ISS"
    ISSUER_HOSTNAME="$TEST_ISSUER_HOSTNAME"
    TOKEN_SOURCE="Test Token"
else
    TOKEN_ISSUER=""
    ISSUER_HOSTNAME=""
    TOKEN_SOURCE=""
fi

if [ -n "$TOKEN_ISSUER" ]; then
    log "Token issuer (iss claim from $TOKEN_SOURCE): $TOKEN_ISSUER"
    log "Extracted issuer hostname: $ISSUER_HOSTNAME"
    log ""
    
    # Check consistency
    ISSUES_COUNT=0
    
    # Check 1: Does token issuer hostname match KC_HOSTNAME?
    log "Check 1: Token Issuer vs KC_HOSTNAME"
    if [[ "$ISSUER_HOSTNAME" == "$KC_HOSTNAME" ]]; then
        log_success "PASS: Token issuer hostname matches KC_HOSTNAME"
    else
        log_error "FAIL: Token issuer hostname '$ISSUER_HOSTNAME' != KC_HOSTNAME '$KC_HOSTNAME'"
        ((ISSUES_COUNT++))
    fi
    log ""
    
    # Check 2: Does token issuer hostname match actual hostname?
    log "Check 2: Token Issuer vs Actual Hostname"
    if [[ "$ISSUER_HOSTNAME" == "$ACTUAL_HOSTNAME" ]]; then
        log_success "PASS: Token issuer matches actual hostname you're using"
    else
        log_error "FAIL: Token issuer '$ISSUER_HOSTNAME' != Actual hostname '$ACTUAL_HOSTNAME'"
        ((ISSUES_COUNT++))
    fi
    log ""
    
    # Check 3: Does KC_HOSTNAME match actual hostname?
    log "Check 3: KC_HOSTNAME vs Actual Hostname"
    if [[ "$KC_HOSTNAME" == "$ACTUAL_HOSTNAME" ]]; then
        log_success "PASS: KC_HOSTNAME matches actual hostname"
    else
        log_error "FAIL: KC_HOSTNAME '$KC_HOSTNAME' != Actual hostname '$ACTUAL_HOSTNAME'"
        ((ISSUES_COUNT++))
    fi
    log ""
    
    # Root cause analysis
    if [ $ISSUES_COUNT -gt 0 ]; then
        log_error "═══ ROOT CAUSE IDENTIFIED ═══"
        log ""
        log_warning "PROBLEM: Hostname Configuration Mismatch"
        log ""
        log "Your setup:"
        log "  • You access frontend at: https://$ACTUAL_HOSTNAME:3000"
        log "  • Keycloak issues tokens with: iss=$TOKEN_ISSUER"
        log "  • KC_HOSTNAME is configured as: $KC_HOSTNAME"
        log "  • Backend expects tokens from: https://$KC_HOSTNAME:8443/..."
        log ""
        
        if [[ "$KC_HOSTNAME" == "localhost" ]] && [[ "$ACTUAL_HOSTNAME" != "localhost" ]]; then
            log_error "CLASSIC REMOTE DEPLOYMENT ISSUE:"
            log "  KC_HOSTNAME is 'localhost' but you're accessing remotely!"
            log ""
            log_info "FIX: Update KC_HOSTNAME to your actual hostname"
            log "  Run: ./scripts/fix-remote-hostname.sh"
            log "  Or manually set KC_HOSTNAME: $ACTUAL_HOSTNAME in docker-compose.yml"
        elif [[ "$ISSUER_HOSTNAME" != "$KC_HOSTNAME" ]]; then
            log_error "TOKEN ISSUER MISMATCH:"
            log "  Tokens are issued with hostname '$ISSUER_HOSTNAME'"
            log "  But KC_HOSTNAME is configured as '$KC_HOSTNAME'"
            log ""
            log_info "FIX: Update KC_HOSTNAME to match token issuer"
            log "  Run: ./scripts/fix-remote-hostname.sh"
            log "  Or manually set KC_HOSTNAME: $ISSUER_HOSTNAME in docker-compose.yml"
        else
            log_warning "HOSTNAME INCONSISTENCY:"
            log "  Something doesn't match up between your configuration"
            log ""
            log_info "RECOMMENDED: Align all hostnames"
            log "  1. Decide on ONE hostname: $ACTUAL_HOSTNAME"
            log "  2. Run: ./scripts/fix-remote-hostname.sh"
            log "  3. Enter: $ACTUAL_HOSTNAME when prompted"
        fi
        log ""
        log_warning "IMPACT: JWT validation will FAIL with 401 Unauthorized"
        log "  Backend will reject tokens because issuer doesn't match expected value"
        log ""
    else
        log_success "═══ ALL HOSTNAME CHECKS PASSED ═══"
        log ""
        log_info "Hostname configuration is consistent"
        log "  If you're still getting JWT errors, the issue is elsewhere"
        log "  Check backend logs (Section 7) for other error causes"
        log ""
    fi
else
    log_warning "Cannot check hostname consistency (no token available)"
    log ""
    log_info "Expected values:"
    log "  KC_HOSTNAME: $KC_HOSTNAME"
    log "  Actual hostname: $ACTUAL_HOSTNAME"
    log ""
    if [[ "$KC_HOSTNAME" != "$ACTUAL_HOSTNAME" ]]; then
        log_warning "POTENTIAL ISSUE: KC_HOSTNAME doesn't match actual hostname"
        log_info "Consider running: ./scripts/fix-remote-hostname.sh"
    fi
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

