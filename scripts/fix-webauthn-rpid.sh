#!/usr/bin/env bash
# ============================================
# Fix WebAuthn Relying Party ID Configuration
# ============================================
# This script configures the WebAuthn Policy for all realms using the Keycloak Admin REST API
# 
# Problem: Empty rpId causes internal server errors on production domains
# Solution: Set rpId to 'dive25.com' (the effective domain)
#
# Reference: https://www.keycloak.org/docs/latest/server_admin/#webauthn_server_administration_guide
# Keycloak docs: "The ID must be the origin's effective domain"
#
# Version: 1.0.0
# Author: DIVE V3 Team
# Date: November 10, 2025

set -euo pipefail

# ============================================
# Configuration
# ============================================

# Keycloak URLs
KEYCLOAK_URL="${KEYCLOAK_URL:-https://dev-auth.dive25.com}"
KEYCLOAK_PUBLIC_URL="${NEXT_PUBLIC_KEYCLOAK_URL:-https://dev-auth.dive25.com}"

# Admin credentials (read from environment or use defaults)
ADMIN_USER="${KEYCLOAK_ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

# WebAuthn Relying Party ID
# For production: use the effective domain (dive25.com)
# For localhost: leave empty string
RP_ID="${WEBAUTHN_RP_ID:-dive25.com}"

# List of all realms that need WebAuthn configuration
REALMS=(
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
  "dive-v3-broker"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================
# Functions
# ============================================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get admin access token
get_admin_token() {
    log_info "Authenticating with Keycloak Admin API..."
    
    local response
    response=$(curl -sSL -k \
        -d "client_id=admin-cli" \
        -d "username=$ADMIN_USER" \
        -d "password=$ADMIN_PASSWORD" \
        -d "grant_type=password" \
        "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token")
    
    echo "$response" | jq -r '.access_token'
}

# Configure WebAuthn Policy for a realm
configure_webauthn_policy() {
    local realm=$1
    local token=$2
    
    log_info "Configuring WebAuthn Policy for realm: $realm"
    
    # WebAuthn Policy configuration (AAL3 compliant)
    local policy_json=$(cat <<EOF
{
  "rpEntityName": "DIVE V3 Coalition Platform",
  "rpId": "${RP_ID}",
  "signatureAlgorithms": ["ES256", "RS256"],
  "attestationConveyancePreference": "none",
  "authenticatorAttachment": "cross-platform",
  "requireResidentKey": "No",
  "userVerificationRequirement": "required",
  "createTimeout": 300,
  "avoidSameAuthenticatorRegister": false,
  "acceptableAaguids": []
}
EOF
)
    
    # Update WebAuthn Policy via Admin REST API
    local response
    local http_code
    
    response=$(curl -sSL -k -w "\n%{http_code}" \
        -X PUT \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d "$policy_json" \
        "${KEYCLOAK_URL}/admin/realms/${realm}/authentication/webauthn-policy" 2>&1)
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [[ "$http_code" == "204" ]] || [[ "$http_code" == "200" ]]; then
        log_info "✅ Successfully configured WebAuthn Policy for $realm"
        return 0
    else
        log_error "❌ Failed to configure WebAuthn Policy for $realm (HTTP $http_code)"
        echo "$body"
        return 1
    fi
}

# ============================================
# Main Script
# ============================================

main() {
    echo ""
    echo "================================================"
    echo "  DIVE V3 - WebAuthn Policy Configuration Fix  "
    echo "================================================"
    echo ""
    echo "Keycloak URL: $KEYCLOAK_URL"
    echo "Relying Party ID: $RP_ID"
    echo "Realms to configure: ${#REALMS[@]}"
    echo ""
    
    # Validate required tools
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        log_error "jq is required but not installed"
        exit 1
    fi
    
    # Get admin token
    ADMIN_TOKEN=$(get_admin_token)
    
    if [[ -z "$ADMIN_TOKEN" ]] || [[ "$ADMIN_TOKEN" == "null" ]]; then
        log_error "Failed to obtain admin token. Check your credentials."
        exit 1
    fi
    
    log_info "Successfully authenticated as admin"
    echo ""
    
    # Configure WebAuthn policy for each realm
    local success_count=0
    local failure_count=0
    
    for realm in "${REALMS[@]}"; do
        if configure_webauthn_policy "$realm" "$ADMIN_TOKEN"; then
            ((success_count++))
        else
            ((failure_count++))
        fi
        echo ""
    done
    
    # Summary
    echo "================================================"
    echo "  Configuration Summary"
    echo "================================================"
    echo "✅ Successfully configured: $success_count realms"
    echo "❌ Failed: $failure_count realms"
    echo ""
    
    if [[ $failure_count -eq 0 ]]; then
        log_info "All realms configured successfully!"
        log_info ""
        log_info "Next steps:"
        log_info "1. Test TOP_SECRET user login: testuser-pol-ts"
        log_info "2. You should now see the WebAuthn registration page"
        log_info "3. Register a passkey (e.g., 1Password, YubiKey, Windows Hello)"
        log_info "4. Complete authentication to access the application"
        echo ""
        exit 0
    else
        log_error "Some realms failed to configure. Review the errors above."
        exit 1
    fi
}

# Run main function
main

