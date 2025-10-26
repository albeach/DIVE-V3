#!/bin/bash
###############################################################################
# Terraform User Attribute Sync Script
###############################################################################
# Called by Terraform provisioner to ensure user attributes persist in Keycloak
# Workaround for Terraform Provider 5.5.0 bug where attributes don't sync
#
# CRITICAL: Also restarts Keycloak to flush cache (kc.cache=local issue)
#
# Usage: terraform-sync-attributes.sh USER_ID REALM_NAME ATTRIBUTE_JSON
###############################################################################

set -e

USER_ID="$1"
REALM="$2"
ATTRIBUTE_JSON="$3"

if [ -z "$USER_ID" ] || [ -z "$REALM" ]; then
    echo "[Terraform] ERROR: Missing required parameters"
    echo "Usage: $0 USER_ID REALM_NAME ATTRIBUTE_JSON"
    exit 1
fi

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
RESTART_KEYCLOAK="${RESTART_KEYCLOAK:-true}"

echo "[Terraform] Syncing attributes for user $USER_ID in realm $REALM"

# Get admin token
TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" 2>/dev/null | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "[Terraform] ERROR: Failed to get admin token from Keycloak"
    exit 1
fi

# Update user attributes via REST API
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
  "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$ATTRIBUTE_JSON")

if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then
    echo "[Terraform] ✅ User attributes synced successfully (HTTP $HTTP_CODE)"
    
    # CRITICAL FIX: Restart Keycloak to flush cache
    # Keycloak 23.0.7 with kc.cache=local caches user attributes
    # Without restart, attributes are in DB but not visible via API
    if [ "$RESTART_KEYCLOAK" = "true" ]; then
        echo "[Terraform] Restarting Keycloak to flush cache..."
        docker restart dive-v3-keycloak >/dev/null 2>&1 || true
        sleep 5
        echo "[Terraform] Keycloak restarted, cache flushed"
    fi
    
    # Verify attributes were set (after restart)
    TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
      -d "username=admin" \
      -d "password=admin" \
      -d "grant_type=password" \
      -d "client_id=admin-cli" 2>/dev/null | jq -r '.access_token')
    
    CURRENT_ATTRS=$(curl -s -X GET \
      "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID" \
      -H "Authorization: Bearer $TOKEN" 2>/dev/null | jq -c '.attributes')
    
    echo "[Terraform] Current attributes (post-restart): $CURRENT_ATTRS"
    exit 0
else
    echo "[Terraform] ❌ ERROR: Failed to sync attributes (HTTP $HTTP_CODE)"
    exit 1
fi

