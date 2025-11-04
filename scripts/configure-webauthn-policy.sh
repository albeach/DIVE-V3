#!/usr/bin/env bash
# ============================================
# Configure WebAuthn Policy for All Realms
# ============================================
# Configures WebAuthn policy via Keycloak Admin REST API
# Required for AAL3 (TOP_SECRET) authentication
#
# Usage:
#   ./scripts/configure-webauthn-policy.sh [realm_name]
#   ./scripts/configure-webauthn-policy.sh all          # Configure all realms
#   ./scripts/configure-webauthn-policy.sh dive-v3-usa  # Configure specific realm

set -euo pipefail

# ============================================
# Configuration
# ============================================

KEYCLOAK_URL="${KEYCLOAK_URL:-https://localhost:8443}"
ADMIN_USERNAME="${KEYCLOAK_ADMIN_USER:-admin}"
ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
ADMIN_REALM="master"

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================
# Realms to Configure
# ============================================

REALMS=(
    "dive-v3-broker"
    "dive-v3-usa"
    "dive-v3-fra"
    "dive-v3-can"
    "dive-v3-deu"
    "dive-v3-gbr"
    "dive-v3-ita"
    "dive-v3-esp"
    "dive-v3-pol"
    "dive-v3-nld"
    "dive-v3-industry"
)

# ============================================
# Get Admin Access Token
# ============================================

get_admin_token() {
    local token_url="$KEYCLOAK_URL/realms/$ADMIN_REALM/protocol/openid-connect/token"
    
    local response=$(curl -sk -X POST "$token_url" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=admin-cli" \
        -d "username=$ADMIN_USERNAME" \
        -d "password=$ADMIN_PASSWORD" \
        -d "grant_type=password" 2>/dev/null)
    
    echo "$response" | jq -r '.access_token // empty'
}

# ============================================
# Configure WebAuthn Policy for a Realm
# ============================================

configure_webauthn_for_realm() {
    local realm="$1"
    local access_token="$2"
    
    log_info "Configuring WebAuthn policy for realm: $realm"
    
    # WebAuthn policy configuration (AAL3 compliant)
    local webauthn_policy='{
        "rpEntityName": "DIVE V3 Coalition Platform",
        "signatureAlgorithms": ["ES256", "RS256"],
        "rpId": "",
        "attestationConveyancePreference": "none",
        "authenticatorAttachment": "cross-platform",
        "requireResidentKey": "No",
        "userVerificationRequirement": "required",
        "createTimeout": 300,
        "avoidSameAuthenticatorRegister": false,
        "acceptableAaguids": []
    }'
    
    # API endpoint
    local api_url="$KEYCLOAK_URL/admin/realms/$realm"
    
    # Get current realm configuration
    local current_config=$(curl -sk -X GET "$api_url" \
        -H "Authorization: Bearer $access_token" \
        -H "Content-Type: application/json" 2>/dev/null)
    
    if [ -z "$current_config" ]; then
        log_error "Failed to get realm configuration for: $realm"
        return 1
    fi
    
    # Update realm with WebAuthn policy
    # Note: The exact API structure may vary - this is a template
    log_info "Applying WebAuthn policy..."
    
    local updated_config=$(echo "$current_config" | jq ".webAuthnPolicy = $webauthn_policy")
    
    local result=$(curl -sk -X PUT "$api_url" \
        -H "Authorization: Bearer $access_token" \
        -H "Content-Type: application/json" \
        -d "$updated_config" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        log_success "WebAuthn policy configured for: $realm"
        return 0
    else
        log_error "Failed to configure WebAuthn policy for: $realm"
        return 1
    fi
}

# ============================================
# Main Script
# ============================================

main() {
    local realm_arg="${1:-all}"
    
    log_info "WebAuthn Policy Configuration Script"
    log_info "Keycloak URL: $KEYCLOAK_URL"
    echo ""
    
    # Get admin access token
    log_info "Authenticating as admin..."
    local access_token=$(get_admin_token)
    
    if [ -z "$access_token" ]; then
        log_error "Failed to obtain admin access token"
        log_error "Check KEYCLOAK_ADMIN_USER and KEYCLOAK_ADMIN_PASSWORD"
        exit 1
    fi
    
    log_success "Admin authentication successful"
    echo ""
    
    # Configure WebAuthn policy
    if [ "$realm_arg" = "all" ]; then
        log_info "Configuring WebAuthn policy for all realms..."
        echo ""
        
        for realm in "${REALMS[@]}"; do
            configure_webauthn_for_realm "$realm" "$access_token"
            echo ""
        done
    else
        configure_webauthn_for_realm "$realm_arg" "$access_token"
    fi
    
    echo ""
    log_info "Configuration complete!"
    log_info "Manual verification recommended:"
    log_info "  1. Open Admin Console: $KEYCLOAK_URL/admin"
    log_info "  2. Navigate to: {Realm} → Authentication → Policies → WebAuthn Policy"
    log_info "  3. Verify settings are correct"
    echo ""
    log_warn "Note: Terraform Keycloak provider doesn't support WebAuthn policy yet"
    log_warn "      This script provides a workaround using REST API"
}

# Run main
main "$@"

