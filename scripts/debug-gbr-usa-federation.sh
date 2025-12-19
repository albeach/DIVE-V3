#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - GBR→USA Federation Debug Tracer
# =============================================================================
# Verifies complete federation chain from GBR IdP to USA Hub
# Tests all hypotheses in parallel with detailed logging
# =============================================================================

set -e

LOG_FILE="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log"
SESSION_ID="debug-session"
RUN_ID="run1"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_debug() {
    local hypothesis_id="$1"
    local location="$2"
    local message="$3"
    local data="$4"
    
    echo "{\"sessionId\":\"${SESSION_ID}\",\"runId\":\"${RUN_ID}\",\"hypothesisId\":\"${hypothesis_id}\",\"location\":\"${location}\",\"message\":\"${message}\",\"data\":${data},\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"
}

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       DIVE V3 - GBR→USA Federation Debug Tracer             ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# HYPOTHESIS E: Verify testuser-gbr-1 attributes in GBR Keycloak
# =============================================================================
echo -e "${YELLOW}[HYPOTHESIS E]${NC} Checking testuser-gbr-1 attributes in GBR..."

GBR_KEYCLOAK_URL="https://keycloak-gbr:8443"
GBR_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD_GBR:-admin}"

# Get admin token from GBR
GBR_TOKEN=$(docker exec gbr-backend-gbr-1 curl -sk -X POST \
    "${GBR_KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${GBR_ADMIN_PASSWORD}" \
    -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

if [[ -z "$GBR_TOKEN" || "$GBR_TOKEN" == "null" ]]; then
    log_debug "E" "debug-gbr-usa-federation.sh:45" "Failed to get GBR admin token" "{\"error\":\"authentication_failed\"}"
    echo -e "${RED}✗ Failed to authenticate with GBR Keycloak${NC}"
    exit 1
fi

log_debug "E" "debug-gbr-usa-federation.sh:51" "GBR admin token obtained" "{\"token_length\":${#GBR_TOKEN}}"

# Get testuser-gbr-1 details
USER_DATA=$(docker exec gbr-backend-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" \
    "${GBR_KEYCLOAK_URL}/admin/realms/dive-v3-broker-gbr/users?username=testuser-gbr-1&exact=true" 2>/dev/null)

USER_ID=$(echo "$USER_DATA" | jq -r '.[0].id // empty')

if [[ -z "$USER_ID" ]]; then
    log_debug "E" "debug-gbr-usa-federation.sh:61" "testuser-gbr-1 not found" "{\"user_exists\":false}"
    echo -e "${RED}✗ testuser-gbr-1 does not exist in GBR${NC}"
    exit 1
fi

USER_ATTRS=$(echo "$USER_DATA" | jq -c '.[0].attributes // {}')
log_debug "E" "debug-gbr-usa-federation.sh:67" "testuser-gbr-1 found with attributes" "{\"user_id\":\"${USER_ID}\",\"attributes\":${USER_ATTRS}}"

echo -e "${GREEN}✓ User found: $USER_ID${NC}"
echo "  Attributes: $USER_ATTRS"

# =============================================================================
# HYPOTHESIS B: Verify dive-v3-cross-border-client in GBR
# =============================================================================
echo ""
echo -e "${YELLOW}[HYPOTHESIS B]${NC} Checking dive-v3-cross-border-client in GBR..."

CLIENT_DATA=$(docker exec gbr-backend-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" \
    "${GBR_KEYCLOAK_URL}/admin/realms/dive-v3-broker-gbr/clients?clientId=dive-v3-cross-border-client" 2>/dev/null)

CLIENT_ID=$(echo "$CLIENT_DATA" | jq -r '.[0].id // empty')

if [[ -z "$CLIENT_ID" ]]; then
    log_debug "B" "debug-gbr-usa-federation.sh:85" "dive-v3-cross-border-client NOT found" "{\"client_exists\":false,\"critical\":true}"
    echo -e "${RED}✗ CRITICAL: Client dive-v3-cross-border-client does NOT exist in GBR${NC}"
    echo -e "${RED}  This client is required for federation!${NC}"
else
    # Get protocol mappers for this client
    MAPPERS=$(docker exec gbr-backend-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" \
        "${GBR_KEYCLOAK_URL}/admin/realms/dive-v3-broker-gbr/clients/${CLIENT_ID}/protocol-mappers/models" 2>/dev/null)
    
    MAPPER_NAMES=$(echo "$MAPPERS" | jq -c '[.[].name]')
    MAPPER_COUNT=$(echo "$MAPPERS" | jq 'length')
    
    log_debug "B" "debug-gbr-usa-federation.sh:96" "dive-v3-cross-border-client found" "{\"client_id\":\"${CLIENT_ID}\",\"mapper_count\":${MAPPER_COUNT},\"mappers\":${MAPPER_NAMES}}"
    
    echo -e "${GREEN}✓ Client exists: $CLIENT_ID${NC}"
    echo "  Protocol Mappers (${MAPPER_COUNT}): $MAPPER_NAMES"
    
    # Check for DIVE attribute mappers specifically
    HAS_CLEARANCE=$(echo "$MAPPERS" | jq '[.[] | select(.name=="clearance")] | length')
    HAS_COUNTRY=$(echo "$MAPPERS" | jq '[.[] | select(.name=="countryOfAffiliation")] | length')
    HAS_UNIQUE=$(echo "$MAPPERS" | jq '[.[] | select(.name=="uniqueID")] | length')
    HAS_COI=$(echo "$MAPPERS" | jq '[.[] | select(.name=="acpCOI")] | length')
    
    if [[ "$HAS_CLEARANCE" == "0" ]] || [[ "$HAS_COUNTRY" == "0" ]] || [[ "$HAS_UNIQUE" == "0" ]]; then
        log_debug "B" "debug-gbr-usa-federation.sh:109" "Missing DIVE attribute mappers" "{\"has_clearance\":${HAS_CLEARANCE},\"has_country\":${HAS_COUNTRY},\"has_uniqueID\":${HAS_UNIQUE},\"has_acpCOI\":${HAS_COI}}"
        echo -e "${YELLOW}  ⚠ Missing DIVE attribute mappers (clearance/country/uniqueID)${NC}"
    else
        log_debug "B" "debug-gbr-usa-federation.sh:112" "DIVE attribute mappers present" "{\"has_clearance\":${HAS_CLEARANCE},\"has_country\":${HAS_COUNTRY},\"has_uniqueID\":${HAS_UNIQUE},\"has_acpCOI\":${HAS_COI}}"
        echo -e "${GREEN}  ✓ DIVE attribute mappers present${NC}"
    fi
fi

# =============================================================================
# HYPOTHESIS A: Verify gbr-federation IdP in USA Hub
# =============================================================================
echo ""
echo -e "${YELLOW}[HYPOTHESIS A]${NC} Checking gbr-federation IdP in USA Hub..."

USA_KEYCLOAK_URL="https://keycloak:8443"
USA_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

# Get admin token from USA Hub
USA_TOKEN=$(docker exec dive-v3-backend-1 curl -sk -X POST \
    "${USA_KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${USA_ADMIN_PASSWORD}" \
    -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

if [[ -z "$USA_TOKEN" || "$USA_TOKEN" == "null" ]]; then
    log_debug "A" "debug-gbr-usa-federation.sh:120" "Failed to get USA admin token" "{\"error\":\"authentication_failed\"}"
    echo -e "${RED}✗ Failed to authenticate with USA Keycloak${NC}"
    exit 1
fi

log_debug "A" "debug-gbr-usa-federation.sh:126" "USA admin token obtained" "{\"token_length\":${#USA_TOKEN}}"

# Check if gbr-federation IdP exists
IDP_DATA=$(docker exec dive-v3-backend-1 curl -sk -H "Authorization: Bearer $USA_TOKEN" \
    "${USA_KEYCLOAK_URL}/admin/realms/dive-v3-broker/identity-provider/instances/gbr-federation" 2>/dev/null)

IDP_ALIAS=$(echo "$IDP_DATA" | jq -r '.alias // empty')

if [[ -z "$IDP_ALIAS" ]]; then
    log_debug "A" "debug-gbr-usa-federation.sh:136" "gbr-federation IdP NOT found in USA Hub" "{\"idp_exists\":false,\"critical\":true}"
    echo -e "${RED}✗ CRITICAL: gbr-federation IdP does NOT exist in USA Hub${NC}"
    echo -e "${RED}  This is the root cause - USA Hub cannot broker GBR users!${NC}"
else
    IDP_CONFIG=$(echo "$IDP_DATA" | jq -c '{alias,displayName,enabled,updateProfileFirstLoginMode,config:{authorizationUrl,tokenUrl,clientId}}')
    log_debug "A" "debug-gbr-usa-federation.sh:142" "gbr-federation IdP found in USA Hub" "{\"idp_config\":${IDP_CONFIG}}"
    
    echo -e "${GREEN}✓ IdP exists: $IDP_ALIAS${NC}"
    echo "  Config: $IDP_CONFIG"
fi

# =============================================================================
# HYPOTHESIS C: Verify gbr-federation attribute import mappers in USA Hub
# =============================================================================
if [[ -n "$IDP_ALIAS" ]]; then
    echo ""
    echo -e "${YELLOW}[HYPOTHESIS C]${NC} Checking attribute import mappers for gbr-federation..."
    
    MAPPERS=$(docker exec dive-v3-backend-1 curl -sk -H "Authorization: Bearer $USA_TOKEN" \
        "${USA_KEYCLOAK_URL}/admin/realms/dive-v3-broker/identity-provider/instances/gbr-federation/mappers" 2>/dev/null)
    
    MAPPER_LIST=$(echo "$MAPPERS" | jq -c '[.[] | {name,identityProviderMapper,config:{claim,userAttribute:"user.attribute"}}]')
    log_debug "C" "debug-gbr-usa-federation.sh:160" "gbr-federation attribute mappers" "{\"mappers\":${MAPPER_LIST}}"
    
    echo -e "${GREEN}✓ Attribute Mappers:${NC}"
    echo "$MAPPER_LIST" | jq -r '.[] | "  - \(.name): \(.config.claim) → \(.config.userAttribute)"'
fi

# =============================================================================
# HYPOTHESIS D: Verify updateProfileFirstLoginMode setting
# =============================================================================
if [[ -n "$IDP_ALIAS" ]]; then
    UPDATE_MODE=$(echo "$IDP_DATA" | jq -r '.updateProfileFirstLoginMode // "missing"')
    log_debug "D" "debug-gbr-usa-federation.sh:172" "updateProfileFirstLoginMode setting" "{\"mode\":\"${UPDATE_MODE}\",\"should_be\":\"off\"}"
    
    if [[ "$UPDATE_MODE" == "on" ]]; then
        echo ""
        echo -e "${YELLOW}[HYPOTHESIS D]${NC} updateProfileFirstLoginMode is ON"
        echo -e "${YELLOW}  This forces Update Account form when attributes are missing${NC}"
    else
        echo ""
        echo -e "${GREEN}[HYPOTHESIS D]${NC} updateProfileFirstLoginMode is OFF (correct)"
    fi
fi

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                     Debug Trace Complete                     ║${NC}"
echo -e "${BLUE}║  All results logged to: ${LOG_FILE}${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
