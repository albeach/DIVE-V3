#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Verify and Fix GBR WebAuthn/ACR/AMR Configuration
# =============================================================================
# Purpose: Diagnose and fix ACR/AMR=0/[] issue for admin-gbr
# =============================================================================

set -e

echo "🔍 GBR Instance - WebAuthn/ACR/AMR Configuration Audit"
echo "================================================================="
echo ""

INSTANCE="gbr"
KC_CONTAINER="keycloak-${INSTANCE}"
REALM="dive-v3-broker-${INSTANCE}"
KC_URL="https://localhost:8474"
USERNAME="admin-gbr"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "📋 Step 1: Check WebAuthn Credentials Registered"
echo "-----------------------------------------------------------------"

# Get admin token
ADMIN_PASS=$(docker exec "$KC_CONTAINER" printenv KC_ADMIN_PASSWORD 2>/dev/null)
if [ -z "$ADMIN_PASS" ]; then
    echo -e "${RED}❌ Cannot get Keycloak admin password${NC}"
    exit 1
fi

# Configure kcadm
docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh config credentials \
  --server "$KC_URL" \
  --realm master \
  --user admin \
  --password "$ADMIN_PASS" > /dev/null 2>&1

# Check WebAuthn credentials
echo -e "${BLUE}→ Checking WebAuthn credentials for $USERNAME...${NC}"
WEBAUTHN_CREDS=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get users \
  -r "$REALM" \
  -q username="$USERNAME" \
  --fields credentials 2>/dev/null | jq '.[] | .credentials[] | select(.type == "webauthn")')

if [ -n "$WEBAUTHN_CREDS" ]; then
    echo -e "${GREEN}✅ WebAuthn credentials found:${NC}"
    echo "$WEBAUTHN_CREDS" | jq '{
        credentialData: .credentialData,
        userLabel: .userLabel,
        createdDate: .createdDate
    }'
else
    echo -e "${RED}❌ NO WebAuthn credentials found${NC}"
    echo "   User needs to register WebAuthn first"
fi

echo ""
echo "📋 Step 2: Check Authentication Flow Configuration"
echo "-----------------------------------------------------------------"

# Get browser flow
echo -e "${BLUE}→ Checking browser authentication flow...${NC}"
BROWSER_FLOW=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get authentication/flows \
  -r "$REALM" 2>/dev/null | jq '.[] | select(.alias == "browser")')

FLOW_ID=$(echo "$BROWSER_FLOW" | jq -r '.id')
echo -e "${GREEN}✅ Browser flow ID: $FLOW_ID${NC}"

# Get flow executions
echo -e "${BLUE}→ Checking WebAuthn configuration in flow...${NC}"
EXECUTIONS=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get "authentication/flows/$FLOW_ID/executions" \
  -r "$REALM" 2>/dev/null)

WEBAUTHN_EXEC=$(echo "$EXECUTIONS" | jq '.[] | select(.displayName | contains("WebAuthn"))')

if [ -n "$WEBAUTHN_EXEC" ]; then
    WEBAUTHN_REQUIREMENT=$(echo "$WEBAUTHN_EXEC" | jq -r '.requirement')
    echo -e "${GREEN}✅ WebAuthn Authenticator found${NC}"
    echo "   Requirement: $WEBAUTHN_REQUIREMENT"
    
    if [ "$WEBAUTHN_REQUIREMENT" != "REQUIRED" ]; then
        echo -e "${YELLOW}⚠️  WARNING: WebAuthn is '$WEBAUTHN_REQUIREMENT', not 'REQUIRED'${NC}"
        echo "   This means WebAuthn is optional, not mandatory"
    fi
else
    echo -e "${RED}❌ WebAuthn Authenticator NOT found in browser flow${NC}"
fi

echo ""
echo "📋 Step 3: Check Protocol Mappers"
echo "-----------------------------------------------------------------"

# Get broker client
echo -e "${BLUE}→ Checking protocol mappers on broker client...${NC}"
CLIENT_ID=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get clients \
  -r "$REALM" \
  -q clientId="dive-v3-broker-${INSTANCE}" \
  --fields id 2>/dev/null | jq -r '.[0].id')

if [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" == "null" ]; then
    echo -e "${RED}❌ Broker client not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Broker client ID: $CLIENT_ID${NC}"

# Check ACR/AMR mappers
MAPPERS=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get "clients/$CLIENT_ID/protocol-mappers/models" \
  -r "$REALM" 2>/dev/null)

ACR_MAPPER=$(echo "$MAPPERS" | jq '.[] | select(.name | contains("acr"))')
AMR_MAPPER=$(echo "$MAPPERS" | jq '.[] | select(.name | contains("amr"))')

if [ -n "$ACR_MAPPER" ]; then
    echo -e "${GREEN}✅ ACR mappers found:${NC}"
    echo "$ACR_MAPPER" | jq -r '.name'
else
    echo -e "${RED}❌ NO ACR mappers found${NC}"
fi

if [ -n "$AMR_MAPPER" ]; then
    echo -e "${GREEN}✅ AMR mappers found:${NC}"
    echo "$AMR_MAPPER" | jq -r '.name'
else
    echo -e "${RED}❌ NO AMR mappers found${NC}"
fi

echo ""
echo "📋 Step 4: Check Current User Sessions"
echo "-----------------------------------------------------------------"

echo -e "${BLUE}→ Checking active sessions for $USERNAME...${NC}"
USER_ID=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get users \
  -r "$REALM" \
  -q username="$USERNAME" \
  --fields id 2>/dev/null | jq -r '.[0].id')

if [ -z "$USER_ID" ] || [ "$USER_ID" == "null" ]; then
    echo -e "${RED}❌ User not found${NC}"
    exit 1
fi

SESSIONS=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get "users/$USER_ID/sessions" \
  -r "$REALM" 2>/dev/null)

SESSION_COUNT=$(echo "$SESSIONS" | jq 'length')
echo -e "${GREEN}✅ Active sessions: $SESSION_COUNT${NC}"

if [ "$SESSION_COUNT" -gt 0 ]; then
    echo "$SESSIONS" | jq -r '.[] | "  Session ID: \(.id) | IP: \(.ipAddress) | Start: \(.start)"'
fi

echo ""
echo "================================================================="
echo "🎯 DIAGNOSIS SUMMARY"
echo "================================================================="
echo ""

# Build diagnosis
ISSUES=()

if [ -z "$WEBAUTHN_CREDS" ]; then
    ISSUES+=("NO_WEBAUTHN_CREDS")
    echo -e "${RED}❌ CRITICAL: No WebAuthn credentials registered${NC}"
    echo "   Solution: User must register WebAuthn at /mfa-setup"
fi

if [ -z "$WEBAUTHN_EXEC" ]; then
    ISSUES+=("NO_WEBAUTHN_IN_FLOW")
    echo -e "${RED}❌ CRITICAL: WebAuthn not configured in authentication flow${NC}"
    echo "   Solution: Run terraform apply to configure flow"
fi

if [ -n "$WEBAUTHN_EXEC" ] && [ "$WEBAUTHN_REQUIREMENT" != "REQUIRED" ]; then
    ISSUES+=("WEBAUTHN_NOT_REQUIRED")
    echo -e "${YELLOW}⚠️  WARNING: WebAuthn is optional, not required${NC}"
    echo "   Solution: Set WebAuthn to REQUIRED for TOP_SECRET users"
fi

if [ "$SESSION_COUNT" -gt 0 ]; then
    ISSUES+=("STALE_SESSION")
    echo -e "${YELLOW}⚠️  WARNING: User has active session(s) from BEFORE WebAuthn setup${NC}"
    echo "   Solution: User must logout and re-authenticate WITH WebAuthn"
fi

if [ ${#ISSUES[@]} -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed!${NC}"
    echo ""
    echo "If ACR/AMR still shows 0/[], the user needs to:"
    echo "  1. Logout completely (clear all sessions)"
    echo "  2. Clear browser cookies"
    echo "  3. Re-authenticate WITH WebAuthn credential"
else
    echo ""
    echo "================================================================="
    echo "🔧 RECOMMENDED FIXES"
    echo "================================================================="
    echo ""
    
    if [[ " ${ISSUES[@]} " =~ " STALE_SESSION " ]]; then
        echo "1️⃣  Clear all sessions for $USERNAME:"
        echo "   docker exec $KC_CONTAINER /opt/keycloak/bin/kcadm.sh delete users/$USER_ID/sessions -r $REALM"
        echo ""
    fi
    
    if [[ " ${ISSUES[@]} " =~ " NO_WEBAUTHN_IN_FLOW " ]]; then
        echo "2️⃣  Re-apply Terraform to configure WebAuthn flow:"
        echo "   cd terraform/spoke-gbr && terraform apply"
        echo ""
    fi
    
    echo "3️⃣  User must re-authenticate:"
        echo "   a. Navigate to https://localhost:3031"
    echo "   b. Logout if logged in"
    echo "   c. Clear browser cookies"
    echo "   d. Login with username/password"
    echo "   e. Browser will prompt for WebAuthn"
    echo "   f. Use physical key or biometric"
    echo "   g. Verify session shows acr='3', amr=['pwd','hwk']"
    echo ""
fi

echo "================================================================="
echo "📝 Full audit saved to: ACR_AMR_WEBAUTHN_AUTHENTICATION_ISSUE.md"
echo "================================================================="
