#!/bin/bash
# DIVE V3 - Keycloak Realm Import Script
# 
# This script processes realm JSON templates with environment variable substitution
# and prepares them for Keycloak's native --import-realm feature.
#
# Usage: Called as entrypoint before Keycloak starts
#
# Environment Variables:
#   KEYCLOAK_CLIENT_SECRET - Client secret for dive-v3-client-broker
#   ADMIN_PASSWORD - Password for admin users (default: DiveAdmin2025!)
#   TEST_USER_PASSWORD - Password for test users (default: DiveTest2025!)
#   APP_URL - Frontend application URL (default: https://localhost:3000)
#   API_URL - Backend API URL (default: https://localhost:4000)
#   USA_IDP_URL - URL for USA IdP (default: https://keycloak:8443)
#   USA_IDP_CLIENT_SECRET - Client secret for USA IdP federation
#   INSTANCE_CODE - Instance code (USA, FRA, GBR, etc.)
#
# Best Practice: Keycloak's native import is idempotent and handles existing realms

set -e

REALM_TEMPLATE_DIR="/opt/keycloak/realm-templates"
REALM_IMPORT_DIR="/opt/keycloak/data/import"
REALM_TEMPLATE="${REALM_TEMPLATE_DIR}/dive-v3-broker.json"

# Ensure import directory exists
mkdir -p "${REALM_IMPORT_DIR}"

# Generate random secret (fallback if openssl not available)
generate_secret() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -base64 24 | tr -d '/+=' | head -c 32
    else
        # Fallback: use /dev/urandom
        cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 32
    fi
}

# Default values for environment variables
# IMPORTANT: These should be set via docker-compose environment variables
# NOTE: Passwords must meet the password policy (16+ chars with complexity)
export KEYCLOAK_CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-$(generate_secret)}"
# NIST 800-63B compliant passwords (16+ chars, mixed case, digits, special)
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-DiveAdminSecure2025!}"
export TEST_USER_PASSWORD="${TEST_USER_PASSWORD:-DiveTestSecure2025!}"
export APP_URL="${APP_URL:-https://localhost:3000}"
export API_URL="${API_URL:-https://localhost:4000}"
export USA_IDP_URL="${USA_IDP_URL:-https://keycloak:8443}"
export USA_IDP_CLIENT_SECRET="${USA_IDP_CLIENT_SECRET:-$(generate_secret)}"
export INSTANCE_CODE="${INSTANCE_CODE:-USA}"

echo "[DIVE] Preparing realm import..."
echo "[DIVE] Instance: ${INSTANCE_CODE}"
echo "[DIVE] App URL: ${APP_URL}"
echo "[DIVE] API URL: ${API_URL}"

# Check if template exists
if [ ! -f "${REALM_TEMPLATE}" ]; then
    echo "[DIVE] WARNING: Realm template not found at ${REALM_TEMPLATE}"
    echo "[DIVE] Skipping realm import - Keycloak will start with empty realm"
else
    echo "[DIVE] Processing realm template..."
    
    # Substitute environment variables in the template
    # Using sed with temp file approach (works on minimal containers)
    TEMP_FILE="${REALM_IMPORT_DIR}/realm.tmp"
    
    # Read template, substitute variables, write to import location
    sed \
        -e "s|\${KEYCLOAK_CLIENT_SECRET}|${KEYCLOAK_CLIENT_SECRET}|g" \
        -e "s|\${ADMIN_PASSWORD}|${ADMIN_PASSWORD}|g" \
        -e "s|\${TEST_USER_PASSWORD}|${TEST_USER_PASSWORD}|g" \
        -e "s|\${APP_URL}|${APP_URL}|g" \
        -e "s|\${API_URL}|${API_URL}|g" \
        -e "s|\${USA_IDP_URL}|${USA_IDP_URL}|g" \
        -e "s|\${USA_IDP_CLIENT_SECRET}|${USA_IDP_CLIENT_SECRET}|g" \
        "${REALM_TEMPLATE}" > "${REALM_IMPORT_DIR}/dive-v3-broker.json"
    
    echo "[DIVE] Realm template processed successfully"
    echo "[DIVE] Admin password length: ${#ADMIN_PASSWORD} chars"
    echo "[DIVE] Test password length: ${#TEST_USER_PASSWORD} chars"
    echo "[DIVE] Realm file: ${REALM_IMPORT_DIR}/dive-v3-broker.json"
fi

# Check for instance-specific realm file
INSTANCE_LOWER=$(echo "$INSTANCE_CODE" | tr '[:upper:]' '[:lower:]')
INSTANCE_REALM="${REALM_TEMPLATE_DIR}/dive-v3-broker-${INSTANCE_LOWER}.json"
if [ -f "${INSTANCE_REALM}" ]; then
    echo "[DIVE] Found instance-specific realm: ${INSTANCE_REALM}"
    # Apply environment variable substitution to instance-specific realm
    sed \
        -e "s|\${KEYCLOAK_CLIENT_SECRET}|${KEYCLOAK_CLIENT_SECRET}|g" \
        -e "s|\${ADMIN_PASSWORD}|${ADMIN_PASSWORD}|g" \
        -e "s|\${TEST_USER_PASSWORD}|${TEST_USER_PASSWORD}|g" \
        -e "s|\${APP_URL}|${APP_URL}|g" \
        -e "s|\${API_URL}|${API_URL}|g" \
        -e "s|\${USA_IDP_URL}|${USA_IDP_URL}|g" \
        -e "s|\${USA_IDP_CLIENT_SECRET}|${USA_IDP_CLIENT_SECRET}|g" \
        "${INSTANCE_REALM}" > "${REALM_IMPORT_DIR}/dive-v3-broker.json"
    echo "[DIVE] Using instance-specific realm configuration"
fi

echo "[DIVE] Realm import preparation complete"
echo "[DIVE] Starting Keycloak with --import-realm..."

# Execute the original Keycloak entrypoint with import-realm flag
exec /opt/keycloak/bin/kc.sh "$@" --import-realm
