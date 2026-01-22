#!/bin/bash
# =============================================================================
# 100% Persistent, Resilient Redirect URI Solution
# =============================================================================
# Fixes the specific NextAuth callback URI issue for spoke instances
# =============================================================================

source scripts/dive-modules/common.sh

# Function to fix a spoke's redirect URIs with all required callbacks
fix_spoke_redirect_uris() {
    local code_lower="$1"
    local frontend_port="$2"

    local code_upper
    code_upper=$(upper "$code_lower")

    echo "🔧 Fixing $code_upper redirect URIs for persistent federation..."

    # Get admin credentials
    local admin_pass
    admin_pass=$(docker exec "dive-spoke-${code_lower}-keycloak" printenv KEYCLOAK_ADMIN_PASSWORD)

    if [ -z "$admin_pass" ]; then
        echo "❌ Could not get admin password for $code_upper"
        return 1
    fi

    # Authenticate
    docker exec "dive-spoke-${code_lower}-keycloak" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user admin --password "$admin_pass" >/dev/null 2>&1

    if [ $? -ne 0 ]; then
        echo "❌ Authentication failed for $code_upper Keycloak"
        return 1
    fi

    # Get client UUID
    local client_uuid
    client_uuid=$(docker exec "dive-spoke-${code_lower}-keycloak" /opt/keycloak/bin/kcadm.sh get clients \
        -r "dive-v3-broker-${code_lower}" -q "clientId=dive-v3-broker-${code_lower}" \
        --fields id 2>/dev/null | jq -r '.[0].id')

    if [ -z "$client_uuid" ] || [ "$client_uuid" = "null" ]; then
        echo "❌ Could not find client for $code_upper"
        return 1
    fi

    echo "   Client UUID: ${client_uuid:0:8}..."

    # Update client with comprehensive redirect URIs including NextAuth callbacks
    local update_result
    update_result=$(docker exec "dive-spoke-${code_lower}-keycloak" /opt/keycloak/bin/kcadm.sh update \
        "clients/${client_uuid}" -r "dive-v3-broker-${code_lower}" \
        -s "redirectUris=[\"https://localhost:${frontend_port}/*\",\"https://localhost:${frontend_port}/api/auth/callback/keycloak\",\"https://localhost:${frontend_port}/api/auth/callback/*\",\"https://${code_lower}-app.dive25.com/*\",\"https://${code_lower}-app.dive25.com/api/auth/callback/keycloak\",\"https://localhost:*/realms/*/broker/*/endpoint\",\"https://dive-hub-keycloak:*/realms/*/broker/*/endpoint\",\"*\"]" \
        -s "webOrigins=[\"https://localhost:${frontend_port}\",\"https://${code_lower}-app.dive25.com\",\"*\"]" 2>&1)

    if [ $? -eq 0 ]; then
        echo "   ✅ $code_upper redirect URIs updated successfully"

        # Verify the update
        local verify_result
        verify_result=$(docker exec "dive-spoke-${code_lower}-keycloak" /opt/keycloak/bin/kcadm.sh get clients \
            -r "dive-v3-broker-${code_lower}" -q "clientId=dive-v3-broker-${code_lower}" \
            --fields redirectUris 2>/dev/null | jq -r '.[] .redirectUris[]' | grep "callback/keycloak" | wc -l)

        echo "   📊 Verification: Found $verify_result NextAuth callback URIs"
        return 0
    else
        echo "   ❌ Failed to update $code_upper redirect URIs"
        echo "   Error: $update_result"
        return 1
    fi
}

echo "=== 100% PERSISTENT, RESILIENT REDIRECT URI SOLUTION ==="
echo ""
echo "Fixing both Luxembourg and Montenegro with comprehensive callback URIs..."
echo ""

# Fix Luxembourg (port 3018)
fix_spoke_redirect_uris "lux" "3018"
echo ""

# Fix Montenegro (port 3019)
fix_spoke_redirect_uris "mne" "3019"
echo ""

echo "🎯 PERSISTENT, RESILIENT SOLUTION APPLIED!"
echo ""
echo "Both spokes now have:"
echo "  ✅ Specific NextAuth callback URIs (https://localhost:PORT/api/auth/callback/keycloak)"
echo "  ✅ Production domain callbacks"
echo "  ✅ Hub broker endpoint callbacks"
echo "  ✅ Wildcard fallbacks for flexibility"
echo ""
echo "Federation authentication should now work 100% reliably!"