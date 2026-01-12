#!/bin/bash
# ============================================
# DIVE V3 - Keycloak Realm Import Script (v4.0.0 - Terraform SSOT)
# ============================================
#
# TRUE SSOT IMPLEMENTATION (January 2026):
# Terraform is the Single Source of Truth for all Keycloak configuration.
# JSON realm files are REMOVED from normal operation and kept only for
# emergency disaster recovery scenarios.
#
# NEW BEHAVIOR (v4.0.0):
# - SKIP_REALM_IMPORT=true by default (set in docker-compose)
# - Keycloak always starts empty
# - Terraform creates complete realm configuration from scratch
# - JSON import only for emergency recovery (SKIP_REALM_IMPORT=false)
#
# NORMAL FLOW:
# 1. Keycloak starts empty (no JSON import)
# 2. Run: ./dive tf apply pilot
# 3. Terraform creates complete realm configuration
#
# EMERGENCY RECOVERY ONLY:
# - Set SKIP_REALM_IMPORT=false in docker-compose
# - JSON files provide minimal bootstrap for recovery scenarios
#
# Environment Variables:
#   SKIP_REALM_IMPORT - Set to "true" to skip JSON import (Terraform-only mode)
#   KEYCLOAK_CLIENT_SECRET - Client secret for dive-v3-client-broker
#   ADMIN_PASSWORD - Password for admin users
#   TEST_USER_PASSWORD - Password for test users
#   APP_URL - Frontend application URL
#   API_URL - Backend API URL
#   INSTANCE_CODE - Instance code (USA, FRA, GBR, etc.)
#
# Reference: docs/KEYCLOAK_REFACTORING_SESSION_PROMPT.md

set -e

# ============================================
# TRUE SSOT: Terraform is the Single Source of Truth
# ============================================
if [ "${SKIP_REALM_IMPORT:-false}" = "true" ]; then
    echo "[DIVE] Terraform SSOT Mode - Keycloak starts empty"
    echo "[DIVE] No JSON realm import - all configuration via Terraform"
    echo "[DIVE] Run './dive tf apply pilot' to configure the realm"
    echo "[DIVE] Starting Keycloak..."
    exec /opt/keycloak/bin/kc.sh "$@"
fi

# ============================================
# LEGACY FALLBACK: JSON Import (Emergency Only)
# ============================================
echo "[DIVE] ============================================"
echo "[DIVE] WARNING: Using legacy JSON realm import"
echo "[DIVE] This should only be used for emergency recovery"
echo "[DIVE] Normal operation uses Terraform SSOT"
echo "[DIVE] ============================================"

REALM_TEMPLATE_DIR="/opt/keycloak/realm-templates"
REALM_IMPORT_DIR="/opt/keycloak/data/import"

# Check for bootstrap realm first (for Terraform SSOT)
BOOTSTRAP_REALM="${REALM_TEMPLATE_DIR}/dive-v3-broker-${INSTANCE_CODE}-bootstrap.json"
if [ -f "${BOOTSTRAP_REALM}" ]; then
    REALM_TEMPLATE="${BOOTSTRAP_REALM}"
    echo "[DIVE] Using bootstrap realm for Terraform SSOT: ${BOOTSTRAP_REALM}"
else
    REALM_TEMPLATE="${REALM_TEMPLATE_DIR}/dive-v3-broker.json"
    echo "[DIVE] Using full realm template: ${REALM_TEMPLATE}"
fi

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
export INSTANCE_CODE="${INSTANCE_CODE:-USA}"

# Hub IdP federation (for USA hub to connect to spoke IdPs)
# These are only used when INSTANCE_CODE=USA (hub mode)
export USA_IDP_URL="${USA_IDP_URL:-https://keycloak:8443}"
export USA_IDP_CLIENT_SECRET="${USA_IDP_CLIENT_SECRET:-$(generate_secret)}"

echo "[DIVE] Preparing realm import..."
echo "[DIVE] Instance: ${INSTANCE_CODE}"
echo "[DIVE] App URL: ${APP_URL}"
echo "[DIVE] API URL: ${API_URL}"

# Check if template exists (emergency recovery only)
if [ ! -f "${REALM_TEMPLATE}" ]; then
    echo "[DIVE] WARNING: Realm template not found at ${REALM_TEMPLATE}"
    echo "[DIVE] This is expected in normal Terraform SSOT operation"
    echo "[DIVE] For emergency recovery, copy JSON files from archived-ssot-transition/"
    echo "[DIVE] Skipping realm import - Keycloak will start with empty realm"
else
    echo "[DIVE] EMERGENCY RECOVERY: Processing archived realm template..."
    echo "[DIVE] WARNING: This should only be used for disaster recovery!"
    echo "[DIVE] Normal operation uses Terraform SSOT (SKIP_REALM_IMPORT=true)"

    # Substitute environment variables in the template
    # Using sed with temp file approach (works on minimal containers)

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

    echo "[DIVE] EMERGENCY RECOVERY: Realm template processed"
    echo "[DIVE] Admin password length: ${#ADMIN_PASSWORD} chars"
    echo "[DIVE] Test password length: ${#TEST_USER_PASSWORD} chars"
    echo "[DIVE] Realm file: ${REALM_IMPORT_DIR}/dive-v3-broker.json"
fi

# Import bootstrap realms for Terraform SSOT
# Note: Master realm admin user is created via KC_ADMIN/KC_ADMIN_PASSWORD env vars

INSTANCE_LOWER=$(echo "$INSTANCE_CODE" | tr '[:upper:]' '[:lower:]')
BOOTSTRAP_REALM="${REALM_TEMPLATE_DIR}/dive-v3-broker-${INSTANCE_LOWER}-bootstrap.json"

if [ -f "${BOOTSTRAP_REALM}" ]; then
    echo "[DIVE] Importing ${INSTANCE_CODE} realm bootstrap for Terraform SSOT..."
    sed \
        -e "s|\${KEYCLOAK_CLIENT_SECRET}|${KEYCLOAK_CLIENT_SECRET}|g" \
        -e "s|\${ADMIN_PASSWORD}|${ADMIN_PASSWORD}|g" \
        -e "s|\${TEST_USER_PASSWORD}|${TEST_USER_PASSWORD}|g" \
        -e "s|\${APP_URL}|${APP_URL}|g" \
        -e "s|\${API_URL}|${API_URL}|g" \
        -e "s|\${USA_IDP_URL}|${USA_IDP_URL}|g" \
        -e "s|\${USA_IDP_CLIENT_SECRET}|${USA_IDP_CLIENT_SECRET}|g" \
        "${BOOTSTRAP_REALM}" > "${REALM_IMPORT_DIR}/dive-v3-broker-${INSTANCE_LOWER}.json"
    echo "[DIVE] ${INSTANCE_CODE} realm bootstrap prepared"
fi

# Check if any realm files were prepared for import
if [ -f "${REALM_IMPORT_DIR}/dive-v3-broker-${INSTANCE_LOWER}.json" ] || [ -f "${REALM_IMPORT_DIR}/dive-v3-broker.json" ]; then
    echo "[DIVE] Bootstrap realm import preparation complete"
    echo "[DIVE] Starting Keycloak with --import-realm..."
    # Execute the original Keycloak entrypoint with import-realm flag
    exec /opt/keycloak/bin/kc.sh "$@" --import-realm
else
    echo "[DIVE] Terraform SSOT: No realm files found (as expected)"
    echo "[DIVE] Starting Keycloak empty for Terraform configuration..."
    exec /opt/keycloak/bin/kc.sh "$@"
fi
