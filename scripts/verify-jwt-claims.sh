#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Verify JWT Contains DIVE Custom Claims
# =============================================================================
# Verifies that JWT tokens include:
# 1. Standard OIDC claims: given_name, family_name, email, etc.
# 2. DIVE custom claims: countryOfAffiliation, uniqueID, clearance, acpCOI
# =============================================================================

set -e

LOG_FILE="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log"

log_debug() {
  local step="$1"
  local message="$2"
  local data="$3"
  echo "{\"runId\":\"jwt-claims\",\"step\":\"$step\",\"message\":\"$message\",\"data\":$data,\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║    Verifying JWT Contains DIVE Custom Claims                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

GBR_PASS="JvbyzBXVHVdf3ViAcieTMdpO"
GBR_TOKEN=$(docker exec gbr-keycloak-gbr-1 curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" -d "client_id=admin-cli" -d "username=admin" -d "password=${GBR_PASS}" -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

# =============================================================================
# Step 1: Check protocol mappers on GBR client
# =============================================================================
echo "[Step 1/3] Checking GBR Client Protocol Mappers..."
echo ""

GBR_CLIENT=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients?clientId=dive-v3-cross-border-client" 2>/dev/null)
CLIENT_UUID=$(echo "$GBR_CLIENT" | jq -r '.[0].id')
PROTOCOL_MAPPERS=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${CLIENT_UUID}/protocol-mappers/models" 2>/dev/null)

echo "Standard OIDC Mappers:"
echo "$PROTOCOL_MAPPERS" | jq -r '.[] | select(.name | IN("given_name", "family_name", "email", "preferred_username")) | "  ✓ " + .name + ": " + (.config."user.attribute" // .config.property) + " → " + .config."claim.name"'

echo ""
echo "DIVE Custom Claim Mappers:"
DIVE_MAPPERS=$(echo "$PROTOCOL_MAPPERS" | jq -r '.[] | select(.name | IN("clearance", "countryOfAffiliation", "uniqueID", "acpCOI")) | .name')

if [ -z "$DIVE_MAPPERS" ]; then
  echo "  ✗ NO DIVE custom claim mappers found!"
  log_debug "1" "DIVE mappers missing" "{\"critical\":true}"
else
  echo "$DIVE_MAPPERS" | while read mapper; do
    CONFIG=$(echo "$PROTOCOL_MAPPERS" | jq -r --arg name "$mapper" '.[] | select(.name==$name) | "  ✓ " + .name + ": " + .config."user.attribute" + " → " + .config."claim.name"')
    echo "$CONFIG"
  done
  
  MAPPER_COUNT=$(echo "$DIVE_MAPPERS" | wc -l | tr -d ' ')
  log_debug "1" "DIVE mappers found" "{\"count\":$MAPPER_COUNT}"
fi

# Count total mappers
TOTAL_COUNT=$(echo "$PROTOCOL_MAPPERS" | jq 'length')
echo ""
echo "Total Protocol Mappers: $TOTAL_COUNT"

# =============================================================================
# Step 2: Generate actual JWT and inspect claims
# =============================================================================
echo ""
echo "[Step 2/3] Generating JWT Token and Inspecting Claims..."
echo ""

# Enable direct grant temporarily
UPDATED_CLIENT=$(echo "$GBR_CLIENT" | jq '.[0] | .directAccessGrantsEnabled = true')
docker exec gbr-keycloak-gbr-1 curl -sk -X PUT \
  -H "Authorization: Bearer $GBR_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${CLIENT_UUID}" \
  -d "$UPDATED_CLIENT" 2>/dev/null > /dev/null

GBR_SECRET=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${CLIENT_UUID}/client-secret" 2>/dev/null | jq -r '.value')

TOKEN_RESPONSE=$(docker exec gbr-keycloak-gbr-1 curl -sk -X POST \
  "https://localhost:8443/realms/dive-v3-broker-gbr/protocol/openid-connect/token" \
  -d "client_id=dive-v3-cross-border-client" \
  -d "client_secret=$GBR_SECRET" \
  -d "username=testuser-gbr-1" \
  -d "password=TestUser2025!Pilot" \
  -d "grant_type=password" 2>/dev/null)

if echo "$TOKEN_RESPONSE" | jq -e '.access_token' >/dev/null 2>&1; then
  ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')
  
  # Decode JWT (handle base64 padding)
  PAYLOAD=$(echo "$ACCESS_TOKEN" | awk -F'.' '{print $2}')
  
  # Add padding if needed
  case $((${#PAYLOAD} % 4)) in
    2) PAYLOAD="${PAYLOAD}==" ;;
    3) PAYLOAD="${PAYLOAD}=" ;;
  esac
  
  DECODED=$(echo "$PAYLOAD" | base64 -d 2>/dev/null)
  
  if [ $? -eq 0 ]; then
    echo "JWT Claims (Standard OIDC):"
    echo "$DECODED" | jq '{
      iss,
      sub,
      preferred_username,
      email,
      given_name,
      family_name
    }'
    
    echo ""
    echo "JWT Claims (DIVE Custom):"
    echo "$DECODED" | jq '{
      countryOfAffiliation,
      uniqueID,
      clearance,
      acpCOI
    }'
    
    # Check each DIVE claim
    HAS_COUNTRY=$(echo "$DECODED" | jq 'has("countryOfAffiliation")')
    HAS_UUID=$(echo "$DECODED" | jq 'has("uniqueID")')
    HAS_CLEARANCE=$(echo "$DECODED" | jq 'has("clearance")')
    HAS_COI=$(echo "$DECODED" | jq 'has("acpCOI")')
    
    echo ""
    echo "DIVE Claims Present:"
    [ "$HAS_COUNTRY" == "true" ] && echo "  ✓ countryOfAffiliation" || echo "  ✗ countryOfAffiliation MISSING"
    [ "$HAS_UUID" == "true" ] && echo "  ✓ uniqueID" || echo "  ✗ uniqueID MISSING"
    [ "$HAS_CLEARANCE" == "true" ] && echo "  ✓ clearance" || echo "  ✗ clearance MISSING"
    [ "$HAS_COI" == "true" ] && echo "  ✓ acpCOI (optional)" || echo "  ⚠ acpCOI not present (optional)"
    
    log_debug "2" "JWT claims verified" "{\"countryOfAffiliation\":$HAS_COUNTRY,\"uniqueID\":$HAS_UUID,\"clearance\":$HAS_CLEARANCE,\"acpCOI\":$HAS_COI}"
  else
    echo "✗ Failed to decode JWT payload"
    log_debug "2" "JWT decode failed" "{}"
  fi
else
  echo "✗ Failed to generate token"
  echo "$TOKEN_RESPONSE" | jq '.'
  log_debug "2" "Token generation failed" "{}"
fi

# Disable direct grant
UPDATED_CLIENT=$(echo "$GBR_CLIENT" | jq '.[0] | .directAccessGrantsEnabled = false')
docker exec gbr-keycloak-gbr-1 curl -sk -X PUT \
  -H "Authorization: Bearer $GBR_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${CLIENT_UUID}" \
  -d "$UPDATED_CLIENT" 2>/dev/null > /dev/null

# =============================================================================
# Step 3: Verify USA Hub import mappers
# =============================================================================
echo ""
echo "[Step 3/3] Checking USA Hub Import Mappers..."
echo ""

USA_PASS="i8mE9Gjsg3x0KsCCZaG9tQ"
USA_TOKEN=$(docker exec dive-hub-keycloak curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" -d "client_id=admin-cli" -d "username=admin" -d "password=${USA_PASS}" -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

IDP_MAPPERS=$(docker exec dive-hub-keycloak curl -sk -H "Authorization: Bearer $USA_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-idp/mappers" 2>/dev/null)

echo "USA Hub Import Mappers (OIDC → USA):"
echo "$IDP_MAPPERS" | jq -r '.[] | select(.config.claim) | "  ✓ " + .name + ": " + .config.claim + " → " + .config."user.attribute"' | head -10

IMPORT_COUNT=$(echo "$IDP_MAPPERS" | jq 'length')
echo ""
echo "Total Import Mappers: $IMPORT_COUNT"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Summary                                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "JWT Token Structure:"
echo "  ┌─────────────────────────────────────────────────┐"
echo "  │  Standard OIDC Claims (RFC 8693)               │"
echo "  ├─────────────────────────────────────────────────┤"
echo "  │  • iss (issuer)                                 │"
echo "  │  • sub (subject)                                │"
echo "  │  • given_name        (from givenName)           │"
echo "  │  • family_name       (from surname)             │"
echo "  │  • email                                        │"
echo "  │  • preferred_username                           │"
echo "  └─────────────────────────────────────────────────┘"
echo "  ┌─────────────────────────────────────────────────┐"
echo "  │  DIVE Custom Claims (Coalition-Specific)       │"
echo "  ├─────────────────────────────────────────────────┤"
if [ "$HAS_COUNTRY" == "true" ]; then
  echo "  │  ✓ countryOfAffiliation (required)             │"
else
  echo "  │  ✗ countryOfAffiliation (MISSING!)             │"
fi
if [ "$HAS_UUID" == "true" ]; then
  echo "  │  ✓ uniqueID             (required)             │"
else
  echo "  │  ✗ uniqueID             (MISSING!)             │"
fi
if [ "$HAS_CLEARANCE" == "true" ]; then
  echo "  │  ✓ clearance            (required)             │"
else
  echo "  │  ✗ clearance            (MISSING!)             │"
fi
if [ "$HAS_COI" == "true" ]; then
  echo "  │  ✓ acpCOI               (optional)             │"
else
  echo "  │  ⚠ acpCOI               (optional, not set)    │"
fi
echo "  └─────────────────────────────────────────────────┘"
echo ""

if [ "$HAS_COUNTRY" == "true" ] && [ "$HAS_UUID" == "true" ] && [ "$HAS_CLEARANCE" == "true" ]; then
  echo "✅ JWT includes ALL required DIVE claims!"
  echo "✅ Federation ready for authorization decisions"
else
  echo "⚠️ Some required DIVE claims are missing from JWT"
  echo "   Authorization decisions may fail!"
fi

echo ""
log_debug "complete" "Verification complete" "{}"
