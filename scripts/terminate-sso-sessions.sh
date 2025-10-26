#!/bin/bash
###############################################################################
# EMERGENCY FIX: TERMINATE ALL SSO SESSIONS FOR admin-dive
###############################################################################
# This script kills all active SSO sessions to force re-authentication with MFA
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
REALM="dive-v3-broker"
USERNAME="admin-dive"

echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║  🚨 EMERGENCY: TERMINATE ALL SSO SESSIONS                     ║${NC}"
echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get admin token
echo -e "${BLUE}[1/4]${NC} Authenticating..."
TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo -e "${RED}❌ Failed to get admin token${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Authenticated${NC}"
echo ""

# Get user ID
echo -e "${BLUE}[2/4]${NC} Looking up user..."
USER_ID=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${USERNAME}" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

if [ -z "$USER_ID" ] || [ "$USER_ID" = "null" ]; then
  echo -e "${RED}❌ User not found${NC}"
  exit 1
fi
echo -e "${GREEN}✅ User found: $USER_ID${NC}"
echo ""

# Get active sessions
echo -e "${BLUE}[3/4]${NC} Checking active sessions..."
SESSIONS=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/sessions" \
  -H "Authorization: Bearer $TOKEN")

SESSION_COUNT=$(echo "$SESSIONS" | jq '. | length')

echo -e "${YELLOW}Found $SESSION_COUNT active SSO sessions${NC}"
echo ""

if [ "$SESSION_COUNT" -eq 0 ]; then
  echo -e "${GREEN}✅ No sessions to terminate${NC}"
  exit 0
fi

# List sessions
echo "Active sessions:"
echo "$SESSIONS" | jq -r '.[] | "  - Session ID: \(.id) | IP: \(.ipAddress) | Started: \(.start)"'
echo ""

# Terminate all sessions
echo -e "${BLUE}[4/4]${NC} Terminating all sessions..."

# Logout the user (terminates ALL sessions)
LOGOUT_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/logout" \
  -H "Authorization: Bearer $TOKEN")

if [ "$LOGOUT_RESPONSE" = "204" ] || [ "$LOGOUT_RESPONSE" = "200" ]; then
  echo -e "${GREEN}✅ All sessions terminated${NC}"
else
  echo -e "${RED}❌ Failed to terminate sessions (HTTP $LOGOUT_RESPONSE)${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ SUCCESS: All SSO sessions terminated                      ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "📋 Next: Clear browser cookies and try logging in again"
echo ""

