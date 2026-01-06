#!/usr/local/bin/bash
# =============================================================================
# Phase 1: Native Login Flow Audit Script
# =============================================================================
# Purpose: Validate current state of native login enrichment
# - Check browser flow binding
# - Audit user attributes
# - Verify protocol mappers
# - Test MFA enforcement
#
# Usage: ./tests/native-login-audit-phase1.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_step()  { echo -e "${BLUE}▶${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_info()  { echo -e "${CYAN}ℹ${NC} $1"; }

# Configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-https://localhost:8443}"
REALM_NAME="${REALM_NAME:-dive-v3-broker-usa}"
CLIENT_ID="${CLIENT_ID:-dive-v3-broker-usa}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-}"

# Get admin password from environment
if [ -z "$ADMIN_PASSWORD" ]; then
    log_error "KEYCLOAK_ADMIN_PASSWORD not set"
    log_info "Please run: export KEYCLOAK_ADMIN_PASSWORD=<password>"
    exit 1
fi

# Get admin access token
log_step "Getting admin access token..."
TOKEN=$(curl -sk "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=${ADMIN_USER}" \
    -d "password=${ADMIN_PASSWORD}" \
    -d "grant_type=password" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
    log_error "Failed to get admin token"
    exit 1
fi

log_success "Admin token obtained"
echo ""

# =============================================================================
# Task 1: Audit Browser Flow Binding
# =============================================================================
log_step "Task 1: Auditing browser flow binding..."
echo ""

# Get realm configuration
REALM_CONFIG=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}" \
    -H "Authorization: Bearer $TOKEN")

BROWSER_FLOW=$(echo "$REALM_CONFIG" | jq -r '.browserFlow')
log_info "Realm browser flow: ${BROWSER_FLOW}"

# Get all authentication flows
FLOWS=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/authentication/flows" \
    -H "Authorization: Bearer $TOKEN")

# Check if custom MFA flow exists
CUSTOM_FLOW=$(echo "$FLOWS" | jq -r '.[] | select(.alias | contains("Classified") or contains("MFA") or contains("AAL")) | .alias' | head -1)

if [ -n "$CUSTOM_FLOW" ]; then
    log_success "Custom MFA flow found: ${CUSTOM_FLOW}"

    # Check if it's bound to realm
    if [ "$BROWSER_FLOW" == "$CUSTOM_FLOW" ]; then
        log_success "✅ Custom flow IS bound to realm"
    else
        log_warn "❌ Custom flow NOT bound to realm (using: ${BROWSER_FLOW})"
        log_info "Gap identified: Browser flow binding issue"
    fi
else
    log_warn "No custom MFA flow detected"
    log_info "Expected flow name containing: 'Classified', 'MFA', or 'AAL'"
fi

echo ""

# =============================================================================
# Task 2: Audit User Attributes
# =============================================================================
log_step "Task 2: Auditing user attributes..."
echo ""

TEST_USERS=("testuser-usa-1" "testuser-usa-2" "testuser-usa-3" "testuser-usa-4" "testuser-usa-5")
EXPECTED_CLEARANCES=("UNCLASSIFIED" "RESTRICTED" "CONFIDENTIAL" "SECRET" "TOP_SECRET")

echo "User Attribute Audit Report:"
echo "=============================="
echo ""

for i in "${!TEST_USERS[@]}"; do
    username="${TEST_USERS[$i]}"
    expected_clearance="${EXPECTED_CLEARANCES[$i]}"

    USER_DATA=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users?username=${username}" \
        -H "Authorization: Bearer $TOKEN" | jq -r '.[0]')

    if [ -z "$USER_DATA" ] || [ "$USER_DATA" == "null" ]; then
        log_warn "User not found: ${username}"
        continue
    fi

    # Extract attributes
    CLEARANCE=$(echo "$USER_DATA" | jq -r '.attributes.clearance[0] // "MISSING"')
    UNIQUE_ID=$(echo "$USER_DATA" | jq -r '.attributes.uniqueID[0] // "MISSING"')
    FIRST_NAME=$(echo "$USER_DATA" | jq -r '.firstName // "MISSING"')
    LAST_NAME=$(echo "$USER_DATA" | jq -r '.lastName // "MISSING"')
    AAL_LEVEL=$(echo "$USER_DATA" | jq -r '.attributes.aal_level[0] // "MISSING"')
    AMR=$(echo "$USER_DATA" | jq -r '.attributes.amr // []')

    # Check for pseudonym pattern (should be ocean-themed)
    PSEUDONYM_CHECK="❌"
    if [[ "$FIRST_NAME" =~ ^[A-Z][a-z]+$ ]] && [[ "$LAST_NAME" =~ ^[A-Z][a-z]+$ ]]; then
        PSEUDONYM_CHECK="✅"
    fi

    # Check for clean uniqueID (no -001 suffix)
    UNIQUE_ID_CHECK="❌"
    if [[ "$UNIQUE_ID" == "$username" ]]; then
        UNIQUE_ID_CHECK="✅"
    fi

    # Check clearance match
    CLEARANCE_CHECK="❌"
    if [ "$CLEARANCE" == "$expected_clearance" ]; then
        CLEARANCE_CHECK="✅"
    fi

    echo "User: ${username}"
    echo "  Clearance: ${CLEARANCE} ${CLEARANCE_CHECK} (expected: ${expected_clearance})"
    echo "  uniqueID: ${UNIQUE_ID} ${UNIQUE_ID_CHECK} (should be: ${username})"
    echo "  Name: ${FIRST_NAME} ${LAST_NAME} ${PSEUDONYM_CHECK}"
    echo "  AAL Level: ${AAL_LEVEL}"
    echo "  AMR: ${AMR}"
    echo ""
done

# =============================================================================
# Task 3: Audit Protocol Mappers
# =============================================================================
log_step "Task 3: Auditing protocol mappers for broker client..."
echo ""

# Get broker client ID
CLIENT_UUID=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients?clientId=${CLIENT_ID}" \
    -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

if [ -z "$CLIENT_UUID" ] || [ "$CLIENT_UUID" == "null" ]; then
    log_error "Broker client not found: ${CLIENT_ID}"
    exit 1
fi

# Get protocol mappers
MAPPERS=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
    -H "Authorization: Bearer $TOKEN")

echo "Protocol Mapper Audit:"
echo "======================="
echo ""

# Check for ACR mapper
ACR_MAPPER=$(echo "$MAPPERS" | jq -r '.[] | select(.name | contains("acr") or contains("ACR")) | .name' | head -1)
if [ -n "$ACR_MAPPER" ]; then
    log_success "✅ ACR mapper found: ${ACR_MAPPER}"
    ACR_TYPE=$(echo "$MAPPERS" | jq -r ".[] | select(.name == \"${ACR_MAPPER}\") | .protocolMapper")
    log_info "   Mapper type: ${ACR_TYPE}"
else
    log_warn "❌ ACR mapper NOT found"
    log_info "Gap identified: Missing ACR protocol mapper"
fi

# Check for AMR mapper
AMR_MAPPER=$(echo "$MAPPERS" | jq -r '.[] | select(.name | contains("amr") or contains("AMR")) | .name' | head -1)
if [ -n "$AMR_MAPPER" ]; then
    log_success "✅ AMR mapper found: ${AMR_MAPPER}"
    AMR_TYPE=$(echo "$MAPPERS" | jq -r ".[] | select(.name == \"${AMR_MAPPER}\") | .protocolMapper")
    log_info "   Mapper type: ${AMR_TYPE}"
else
    log_warn "❌ AMR mapper NOT found"
    log_info "Gap identified: Missing AMR protocol mapper"
fi

# Check for pseudonym mappers (given_name, family_name)
GIVEN_NAME_MAPPER=$(echo "$MAPPERS" | jq -r '.[] | select(.name | contains("given_name") or contains("firstName")) | .name' | head -1)
if [ -n "$GIVEN_NAME_MAPPER" ]; then
    log_success "✅ Given name mapper found: ${GIVEN_NAME_MAPPER}"
else
    log_warn "⚠ Given name mapper not found (may use default)"
fi

FAMILY_NAME_MAPPER=$(echo "$MAPPERS" | jq -r '.[] | select(.name | contains("family_name") or contains("lastName")) | .name' | head -1)
if [ -n "$FAMILY_NAME_MAPPER" ]; then
    log_success "✅ Family name mapper found: ${FAMILY_NAME_MAPPER}"
else
    log_warn "⚠ Family name mapper not found (may use default)"
fi

echo ""

# =============================================================================
# Task 4: Summary Report
# =============================================================================
log_step "Phase 1 Audit Summary"
echo ""

echo "Findings:"
echo "========="
echo ""

echo "1. Browser Flow Binding:"
if [ "$BROWSER_FLOW" == "$CUSTOM_FLOW" ] && [ -n "$CUSTOM_FLOW" ]; then
    log_success "   ✅ Custom MFA flow correctly bound"
else
    log_warn "   ❌ Browser flow may need rebinding"
fi

echo ""
echo "2. User Attributes:"
echo "   - Pseudonyms: Review output above for ocean-themed names"
echo "   - uniqueID: Review output above for clean format (no -001)"
echo "   - Clearance: Review output above for correct values"

echo ""
echo "3. Protocol Mappers:"
if [ -n "$ACR_MAPPER" ] && [ -n "$AMR_MAPPER" ]; then
    log_success "   ✅ ACR and AMR mappers present"
else
    log_warn "   ❌ Some mappers may be missing"
fi

echo ""
log_success "Phase 1 audit complete!"
echo ""
log_info "Next steps:"
echo "  1. Review findings above"
echo "  2. Test MFA enforcement with: ./dive hub deploy && test login"
echo "  3. Proceed to Phase 2 if gaps confirmed"
echo ""
