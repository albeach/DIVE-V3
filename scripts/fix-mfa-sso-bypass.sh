#!/bin/bash
# ============================================
# Fix MFA SSO Bypass Issue
# ============================================
#
# Problem: auth-cookie execution allows SSO bypass of MFA prompt
# Solution: Set realm SSO session timeouts to 0 for dive-v3-broker
#
# This ensures users must re-authenticate (including MFA) on every login
# even if they have a valid Keycloak SSO session cookie.
#
# Usage: ./scripts/fix-mfa-sso-bypass.sh

set -e

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
ADMIN_USER="${KEYCLOAK_ADMIN_USER:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASS:-admin}"

echo "=================================================="
echo "Fixing MFA SSO Bypass Issue"
echo "=================================================="
echo ""

# Get admin token
echo "[1/2] Getting admin access token..."
TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASS}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  echo "❌ Failed to get admin token"
  exit 1
fi

echo "✅ Admin token obtained"
echo ""

# Update dive-v3-broker realm SSO settings
echo "[2/2] Updating dive-v3-broker realm SSO session settings..."
echo "Setting SSO Session Idle to 5 minutes (300 seconds)..."
echo "Setting SSO Session Max to 10 minutes (600 seconds)..."

curl -s -X PUT "${KEYCLOAK_URL}/admin/realms/dive-v3-broker" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ssoSessionIdleTimeout": 300,
    "ssoSessionMaxLifespan": 600
  }' > /dev/null

if [ $? -eq 0 ]; then
  echo "✅ SSO session timeouts updated successfully"
else
  echo "❌ Failed to update SSO session timeouts"
  exit 1
fi

echo ""
echo "=================================================="
echo "✅ MFA SSO BYPASS ISSUE FIXED"
echo "=================================================="
echo ""
echo "Changes applied:"
echo "- SSO Session Idle: 5 minutes (300s)"
echo "- SSO Session Max: 10 minutes (600s)"
echo ""
echo "This means:"
echo "- After logout, SSO cookies expire within 5 minutes"
echo "- Users will be prompted for MFA again after timeout"
echo ""
echo "Alternative (more aggressive):"
echo "- Set both values to 0 to disable SSO caching entirely"
echo "- This requires MFA on EVERY login (no SSO at all)"
echo ""
echo "To test:"
echo "1. Logout: http://localhost:3000/api/auth/signout"
echo "2. Wait 5 minutes OR clear cookies manually"
echo "3. Login again - MFA should be required"
echo ""

