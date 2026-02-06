#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Fix Spoke Admin Role Assignment
# =============================================================================
# Purpose: Assign dive-admin role to admin-{instance} users
#
# Context: Spoke admin users were created without dive-admin role assignment
#          This prevents access to /admin routes in the frontend
#          (audit finding 2026-02-04 followup)
#
# Usage: ./fix-spoke-admin-roles.sh [INSTANCE_CODE...]
# Example: ./fix-spoke-admin-roles.sh GBR FRA DEU
#          ./fix-spoke-admin-roles.sh all
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

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

##
# Assign dive-admin role to a spoke admin user
#
# Arguments:
#   $1 - Instance code (e.g., GBR)
##
assign_admin_role() {
    local instance_code="$1"
    local code_upper=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')
    local code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')

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

    # Authenticate with kcadm
    log_info "Authenticating with Keycloak..."
    docker exec "$kc_container" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 \
        --realm master \
        --user admin \
        --password "$kc_admin_pass" >/dev/null 2>&1

    if [ $? -ne 0 ]; then
        log_error "Authentication failed for $code_upper"
        return 1
    fi

    # Check if user exists
    log_info "Checking if $admin_username exists..."
    local user_exists
    user_exists=$(docker exec "$kc_container" /opt/keycloak/bin/kcadm.sh get users \
        -r "$realm_name" \
        -q username="$admin_username" 2>/dev/null | grep -c "\"username\"" || echo "0")

    if [ "$user_exists" = "0" ]; then
        log_warn "User $admin_username not found in realm $realm_name (skipping)"
        return 0
    fi

    # Check if dive-admin role exists
    log_info "Checking if dive-admin role exists..."
    local role_exists
    role_exists=$(docker exec "$kc_container" /opt/keycloak/bin/kcadm.sh get roles/dive-admin \
        -r "$realm_name" 2>/dev/null | jq -r '.name // empty')

    if [ -z "$role_exists" ]; then
        log_warn "dive-admin role not found in realm $realm_name"
        log_warn "Creating dive-admin role..."

        # Create dive-admin role
        docker exec "$kc_container" /opt/keycloak/bin/kcadm.sh create roles \
            -r "$realm_name" \
            -s name=dive-admin \
            -s description="DIVE Admin Access" >/dev/null 2>&1

        if [ $? -ne 0 ]; then
            log_error "Failed to create dive-admin role"
            return 1
        fi

        log_success "✓ Created dive-admin role"
    fi

    # Check if user already has dive-admin role
    log_info "Checking current roles for $admin_username..."
    local has_role
    has_role=$(docker exec "$kc_container" /opt/keycloak/bin/kcadm.sh get-roles \
        -r "$realm_name" \
        --uusername "$admin_username" 2>/dev/null | grep -c "dive-admin" || echo "0")

    if [ "$has_role" != "0" ]; then
        log_success "✓ User $admin_username already has dive-admin role"
        return 0
    fi

    # Assign dive-admin role
    log_step "Assigning dive-admin role to $admin_username..."
    docker exec "$kc_container" /opt/keycloak/bin/kcadm.sh add-roles \
        -r "$realm_name" \
        --uusername "$admin_username" \
        --rolename dive-admin >/dev/null 2>&1

    if [ $? -ne 0 ]; then
        log_error "Failed to assign dive-admin role"
        return 1
    fi

    # Verify role assignment
    log_info "Verifying role assignment..."
    local verify_role
    verify_role=$(docker exec "$kc_container" /opt/keycloak/bin/kcadm.sh get-roles \
        -r "$realm_name" \
        --uusername "$admin_username" 2>/dev/null | grep -c "dive-admin" || echo "0")

    if [ "$verify_role" != "0" ]; then
        log_success "✓ Successfully assigned dive-admin role to $admin_username"
        log_info "User can now access /admin routes in frontend"
        return 0
    else
        log_error "Role assignment verification failed"
        return 1
    fi
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     DIVE V3 Spoke Admin Role Fix Script                        ║"
echo "║     Fix Date: 2026-02-04                                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "This script assigns the dive-admin role to admin-{instance} users"
echo "to enable access to /admin routes in the frontend."
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
log_warn "This will assign dive-admin role to admin users in the following instances:"
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
    if assign_admin_role "$instance"; then
        ((FIXED++))
    else
        ((FAILED++))
    fi
done

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════════"
log_success "Role assignment complete"
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

log_success "All admin users now have dive-admin role!"
echo ""
echo "Admin users can now access /admin routes in the frontend."
echo "They may need to log out and log back in for role changes to take effect."
echo ""
