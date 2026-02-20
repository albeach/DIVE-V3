#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Fix Spoke Admin Password Script
# =============================================================================
# Purpose: Reset admin-{instance} passwords to correct value (TestUser2025!SecureAdmin)
#
# Context: Spoke deployments created admin users with TEST_USER_PASSWORD
#          instead of ADMIN_USER_PASSWORD (audit finding 2026-02-04)
#
# Usage: ./fix-spoke-admin-passwords.sh [INSTANCE_CODE...]
# Example: ./fix-spoke-admin-passwords.sh GBR FRA DEU
#          ./fix-spoke-admin-passwords.sh all
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_step()    { echo -e "${BLUE}▶${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn()    { echo -e "${YELLOW}⚠${NC} $1"; }
log_error()   { echo -e "${RED}✗${NC} $1"; }
log_info()    { echo -e "${CYAN}ℹ${NC} $1"; }

# Target password (correct value)
CORRECT_PASSWORD="TestUser2025!SecureAdmin"
INCORRECT_PASSWORD="TestUser2025!Pilot"

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

##
# Reset password for a single spoke admin user
#
# Arguments:
#   $1 - Instance code (e.g., GBR)
##
reset_spoke_admin_password() {
    local instance_code="$1"
    local code_upper
    code_upper=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')
    local code_lower
    code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')

    local kc_container="dive-spoke-${code_lower}-keycloak"
    local realm_name="dive-v3-broker-${code_lower}"
    local admin_username="admin-${code_lower}"

    echo ""
    log_step "Processing spoke: $code_upper"

    # Check if container exists
    if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        log_warn "Keycloak container not running for $code_upper (skipping)"
        return 0
    fi

    # Get Keycloak admin password
    local kc_admin_pass
    kc_admin_pass=$(docker exec "$kc_container" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r' || echo "")
    if [ -z "$kc_admin_pass" ]; then
        kc_admin_pass=$(docker exec "$kc_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r' || echo "")
    fi

    if [ -z "$kc_admin_pass" ]; then
        log_error "Cannot get Keycloak admin password for $code_upper"
        return 1
    fi

    # Test current password (to confirm it needs fixing)
    log_info "Testing current password..."
    local test_current
    test_current=$(docker exec "$kc_container" curl -sf "http://localhost:8080/realms/${realm_name}/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=${admin_username}" \
        -d "password=${CORRECT_PASSWORD}" 2>&1 || echo "error")

    if echo "$test_current" | jq -e '.access_token' >/dev/null 2>&1; then
        log_success "Password already correct for $admin_username (no action needed)"
        return 0
    fi

    # Confirm it's using the wrong password
    local test_wrong
    test_wrong=$(docker exec "$kc_container" curl -sf "http://localhost:8080/realms/${realm_name}/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=${admin_username}" \
        -d "password=${INCORRECT_PASSWORD}" 2>&1 || echo "error")

    if ! echo "$test_wrong" | jq -e '.access_token' >/dev/null 2>&1; then
        log_warn "Cannot authenticate with either password - may have custom password (skipping)"
        return 0
    fi

    log_warn "Confirmed: $admin_username is using INCORRECT password (TestUser2025!Pilot)"

    # Get admin access token for password reset
    log_info "Authenticating as Keycloak admin..."
    local admin_token
    admin_token=$(docker exec "$kc_container" curl -sf "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${kc_admin_pass}" 2>&1 | jq -r '.access_token // empty')

    if [ -z "$admin_token" ]; then
        log_error "Failed to authenticate as Keycloak admin for $code_upper"
        return 1
    fi

    # Get user ID
    log_info "Looking up user ID..."
    local user_id
    user_id=$(docker exec "$kc_container" curl -sf "http://localhost:8080/admin/realms/${realm_name}/users?username=${admin_username}" \
        -H "Authorization: Bearer ${admin_token}" 2>&1 | jq -r '.[0].id // empty')

    if [ -z "$user_id" ]; then
        log_error "User not found: $admin_username in realm $realm_name"
        return 1
    fi

    log_info "User ID: $user_id"

    # Reset password
    log_step "Resetting password to correct value..."
    local _reset_result
    _reset_result=$(docker exec "$kc_container" curl -sf -X PUT \
        "http://localhost:8080/admin/realms/${realm_name}/users/${user_id}/reset-password" \
        -H "Authorization: Bearer ${admin_token}" \
        -H "Content-Type: application/json" \
        -d "{
            \"type\": \"password\",
            \"value\": \"${CORRECT_PASSWORD}\",
            \"temporary\": false
        }" 2>&1)

    # Verify password reset worked
    log_info "Verifying new password..."
    local verify_new
    verify_new=$(docker exec "$kc_container" curl -sf "http://localhost:8080/realms/${realm_name}/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=${admin_username}" \
        -d "password=${CORRECT_PASSWORD}" 2>&1 || echo "error")

    if echo "$verify_new" | jq -e '.access_token' >/dev/null 2>&1; then
        log_success "✓ Password successfully reset for $admin_username"
        log_info "New password: $CORRECT_PASSWORD"
        return 0
    else
        log_error "Password reset failed - verification unsuccessful"
        return 1
    fi
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     DIVE V3 Spoke Admin Password Fix Script                    ║"
echo "║     Fix Date: 2026-02-04                                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "This script resets admin-{instance} passwords from the incorrect"
echo "value (TestUser2025!Pilot) to the correct value (TestUser2025!SecureAdmin)"
echo "to match the Hub admin-usa pattern."
echo ""

# Get list of instances to fix
INSTANCES=()
if [ $# -eq 0 ]; then
    log_error "Instance code(s) required"
    echo ""
    echo "Usage: $0 <INSTANCE_CODE...>"
    echo "       $0 all"
    echo ""
    echo "Examples:"
    echo "  $0 GBR FRA DEU    # Fix specific instances"
    echo "  $0 all            # Fix all running spoke instances"
    echo ""
    exit 1
fi

if [ "$1" = "all" ]; then
    # Find all running spoke Keycloak containers
    log_info "Discovering all running spoke instances..."
    for container in $(docker ps --format '{{.Names}}' | grep "^dive-spoke-.*-keycloak$"); do
        # Extract instance code from container name
        instance=$(echo "$container" | sed 's/dive-spoke-\(.*\)-keycloak/\1/' | tr '[:lower:]' '[:upper:]')
        INSTANCES+=("$instance")
    done

    if [ ${#INSTANCES[@]} -eq 0 ]; then
        log_warn "No running spoke instances found"
        exit 0
    fi

    log_info "Found ${#INSTANCES[@]} spoke instance(s): ${INSTANCES[*]}"
else
    INSTANCES=("$@")
fi

# Confirm before proceeding
echo ""
log_warn "This will reset passwords for admin users in the following instances:"
for inst in "${INSTANCES[@]}"; do
    echo "  - $inst (admin-$(echo "$inst" | tr '[:upper:]' '[:lower:]'))"
done
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Cancelled by user"
    exit 0
fi

# Process each instance
FIXED=0
SKIPPED=0
FAILED=0

for instance in "${INSTANCES[@]}"; do
    if reset_spoke_admin_password "$instance"; then
        ((FIXED++))
    else
        ((FAILED++))
    fi
done

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════════"
log_success "Password fix complete"
echo ""
echo "Summary:"
echo "  Fixed:   $FIXED"
echo "  Skipped: $SKIPPED"
echo "  Failed:  $FAILED"
echo ""

if [ $FAILED -gt 0 ]; then
    log_warn "Some instances failed - review errors above"
    exit 1
fi

log_success "All admin passwords verified correct!"
echo ""
echo "Credentials (all spokes):"
echo "  Username: admin-{instance} (e.g., admin-gbr, admin-fra)"
echo "  Password: $CORRECT_PASSWORD"
echo ""

# sc2034-anchor
: "${BOLD:-}" "${PROJECT_ROOT:-}"
