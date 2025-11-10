#!/usr/bin/env bash
set -euo pipefail

# ============================================
# AMR/ACR Claims Testing Script
# ============================================
# Tests that AMR and ACR claims are properly set for both:
# 1. Direct logins to broker realm (session notes)
# 2. Federated logins via IdP brokers (user attributes)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0;33m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-https://keycloak.dive-v3.mil}"
CLIENT_ID="dive-v3-app"

log_info "Starting AMR/ACR Claims Test..."
log_info "Keycloak URL: ${KEYCLOAK_URL}"
log_info ""

# ============================================
# Test 1: Direct Login to Broker Realm
# ============================================
log_info "Test 1: Direct Login to Broker Realm (super_admin)"
log_info "Expected: AMR/ACR from session notes"
log_info ""

read -sp "Enter super_admin password: " SUPER_ADMIN_PASS
echo ""

TOKEN_RESPONSE=$(curl -sk -X POST \
  "${KEYCLOAK_URL}/realms/dive-v3-broker/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=super_admin" \
  -d "password=${SUPER_ADMIN_PASS}" \
  -d "grant_type=password" \
  -d "client_id=${CLIENT_ID}" 2>/dev/null)

if [ $? -ne 0 ]; then
    log_error "Failed to get token for super_admin"
    exit 1
fi

ID_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.id_token // empty')

if [ -z "$ID_TOKEN" ]; then
    log_error "No ID token in response"
    echo "Response: $TOKEN_RESPONSE"
    exit 1
fi

log_success "Got ID token for super_admin"

# Decode token
TOKEN_PAYLOAD=$(echo "$ID_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null || echo "$ID_TOKEN" | cut -d'.' -f2 | base64 -D 2>/dev/null)

AMR=$(echo "$TOKEN_PAYLOAD" | jq -r '.amr // "NOT_PRESENT"')
ACR=$(echo "$TOKEN_PAYLOAD" | jq -r '.acr // "NOT_PRESENT"')
CLEARANCE=$(echo "$TOKEN_PAYLOAD" | jq -r '.clearance // "NOT_PRESENT"')

log_info "Token Claims:"
log_info "  clearance: ${CLEARANCE}"
log_info "  acr: ${ACR}"
log_info "  amr: ${AMR}"
log_info ""

if [ "$AMR" == "NOT_PRESENT" ] || [ "$AMR" == "null" ]; then
    log_error "  ✗ AMR claim is MISSING!"
    log_error "  This indicates session notes are not being read properly."
else
    log_success "  ✓ AMR claim is present"
fi

if [ "$ACR" == "NOT_PRESENT" ] || [ "$ACR" == "null" ]; then
    log_warning "  ⚠️  ACR claim is missing"
else
    log_success "  ✓ ACR claim is present"
fi

log_info ""
log_info "============================================"
log_info ""

# ============================================
# Test 2: Federated Login (Manual - Instructions)
# ============================================
log_info "Test 2: Federated Login via IdP Broker"
log_info "Expected: AMR/ACR from user attributes (mapped from IdP claims)"
log_info ""

log_warning "This test requires manual steps:"
log_info "1. Open browser to: https://dive-v3.mil"
log_info "2. Click 'France (Ministère des Armées)' IdP button"
log_info "3. Login with: testuser-fr / Password123!"
log_info "4. After login, open browser DevTools (F12)"
log_info "5. Go to Application > Session Storage > https://dive-v3.mil"
log_info "6. Find the NextAuth session token"
log_info "7. Or check Network tab for API calls and copy the Authorization header"
log_info ""

read -p "Press Enter when you have the token ready, or Ctrl+C to skip..."

echo ""
read -p "Paste the ID token (jwt.io format): " FED_ID_TOKEN

if [ -n "$FED_ID_TOKEN" ]; then
    # Decode federated token
    FED_TOKEN_PAYLOAD=$(echo "$FED_ID_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null || echo "$FED_ID_TOKEN" | cut -d'.' -f2 | base64 -D 2>/dev/null)
    
    FED_AMR=$(echo "$FED_TOKEN_PAYLOAD" | jq -r '.amr // "NOT_PRESENT"')
    FED_ACR=$(echo "$FED_TOKEN_PAYLOAD" | jq -r '.acr // "NOT_PRESENT"')
    FED_CLEARANCE=$(echo "$FED_TOKEN_PAYLOAD" | jq -r '.clearance // "NOT_PRESENT"')
    FED_COUNTRY=$(echo "$FED_TOKEN_PAYLOAD" | jq -r '.countryOfAffiliation // "NOT_PRESENT"')
    
    log_info "Federated Token Claims:"
    log_info "  clearance: ${FED_CLEARANCE}"
    log_info "  countryOfAffiliation: ${FED_COUNTRY}"
    log_info "  acr: ${FED_ACR}"
    log_info "  amr: ${FED_AMR}"
    log_info ""
    
    if [ "$FED_AMR" == "NOT_PRESENT" ] || [ "$FED_AMR" == "null" ]; then
        log_error "  ✗ AMR claim is MISSING in federated token!"
        log_error "  This indicates the dual mapper fix is not working."
        log_error "  Check that user attributes are being mapped from IdP."
    else
        log_success "  ✓ AMR claim is present in federated token"
    fi
    
    if [ "$FED_ACR" == "NOT_PRESENT" ] || [ "$FED_ACR" == "null" ]; then
        log_warning "  ⚠️  ACR claim is missing in federated token"
    else
        log_success "  ✓ ACR claim is present in federated token"
    fi
else
    log_warning "Skipped federated login test"
fi

log_info ""
log_info "============================================"
log_info ""

# ============================================
# Test 3: Backend API with Token
# ============================================
log_info "Test 3: Backend API Validation"
log_info "Testing if backend accepts token with AMR/ACR"
log_info ""

BACKEND_URL="${BACKEND_URL:-https://api.dive-v3.mil}"

log_info "Testing with direct login token..."
API_RESPONSE=$(curl -sk -X GET \
  "${BACKEND_URL}/api/resources" \
  -H "Authorization: Bearer ${ID_TOKEN}" 2>/dev/null)

if echo "$API_RESPONSE" | grep -q "classification unknown"; then
    log_error "  ✗ Backend rejected token: classification unknown"
    log_error "  This means AMR claim is still not properly validated"
elif echo "$API_RESPONSE" | grep -q "error"; then
    ERROR_MSG=$(echo "$API_RESPONSE" | jq -r '.message // .error')
    log_error "  ✗ Backend returned error: ${ERROR_MSG}"
elif echo "$API_RESPONSE" | jq -e '.resources' > /dev/null 2>&1; then
    RESOURCE_COUNT=$(echo "$API_RESPONSE" | jq -r '.resources | length')
    log_success "  ✓ Backend accepted token! Returned ${RESOURCE_COUNT} resources"
else
    log_warning "  ⚠️  Unexpected response from backend"
    echo "$API_RESPONSE" | jq '.' 2>/dev/null || echo "$API_RESPONSE"
fi

log_info ""
log_info "============================================"
log_info "Summary"
log_info "============================================"
log_info ""

log_info "Next Steps:"
log_info "1. If Test 1 FAILED: Session note mappers not working for direct logins"
log_info "   → Check authentication flow configuration"
log_info "   → Verify ACR/AMR execution configs are set"
log_info ""
log_info "2. If Test 2 FAILED: User attribute mappers not working for federated logins"
log_info "   → Check IdP broker mappers (oidc-user-attribute-idp-mapper)"
log_info "   → Verify AMR/ACR claims exist in national realm tokens"
log_info "   → Check user attributes in Keycloak admin (Users > testuser-fr > Attributes)"
log_info ""
log_info "3. If Test 3 FAILED: Backend validation issue"
log_info "   → Check backend logs for AAL2 validation errors"
log_info "   → Verify normalizeAMR() function in backend"
log_info "   → Clear backend decision cache"
log_info ""

log_success "AMR/ACR test complete!"

