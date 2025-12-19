#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Spoke Setup Verification
# =============================================================================
# Verifies that a spoke is fully configured:
#   - Users: testuser-{code}-[1-4] and admin-{code}
#   - Resources: Sample documents in MongoDB
#   - Federation: Cross-border client secrets synced
#
# Usage: ./verify-spoke-setup.sh <INSTANCE_CODE>
# Usage: ./verify-spoke-setup.sh all  (verify all running spokes)
# =============================================================================

# Don't exit on error - we want to verify all spokes even if one fails
# set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTANCE_CODE="${1:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_pass() { echo -e "  ${GREEN}✓${NC} $1"; }
log_fail() { echo -e "  ${RED}✗${NC} $1"; }
log_warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
log_info() { echo -e "  ${BLUE}ℹ${NC} $1"; }

verify_spoke() {
    local CODE_LOWER=$(echo "$1" | tr '[:upper:]' '[:lower:]')
    local CODE_UPPER=$(echo "$1" | tr '[:lower:]' '[:upper:]')

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  🏴 ${CODE_UPPER} - Spoke Verification"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local ERRORS=0
    local WARNINGS=0

    # =========================================================================
    # Check containers
    # =========================================================================
    echo ""
    echo "  📦 Containers:"

    # New naming pattern: dive-spoke-lva-keycloak (not lva-keycloak-lva-1)
    local KC_CONTAINER="dive-spoke-${CODE_LOWER}-keycloak"
    local MONGO_CONTAINER="dive-spoke-${CODE_LOWER}-mongodb"
    local BACKEND_CONTAINER="dive-spoke-${CODE_LOWER}-backend"
    local FRONTEND_CONTAINER="dive-spoke-${CODE_LOWER}-frontend"

    for container in "$KC_CONTAINER" "$MONGO_CONTAINER" "$BACKEND_CONTAINER" "$FRONTEND_CONTAINER"; do
        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            log_pass "$container running"
        else
            log_fail "$container not running"
            ERRORS=$((ERRORS + 1))
        fi
    done

    # Skip further checks if Keycloak isn't running
    if ! docker ps --format '{{.Names}}' | grep -q "^${KC_CONTAINER}$"; then
        echo ""
        echo "  ❌ Cannot verify further - Keycloak not running"
        return 1
    fi

    # =========================================================================
    # Check users
    # =========================================================================
    echo ""
    echo "  👥 Users:"

    # Get Keycloak port
    local SPOKE_KC_PORT=$(docker port "${KC_CONTAINER}" 8443/tcp 2>/dev/null | sed 's/.*://' | head -1)
    if [[ -z "$SPOKE_KC_PORT" ]]; then
        # Fallback to known ports
        case "$CODE_UPPER" in
            ALB) SPOKE_KC_PORT=8444 ;; BEL) SPOKE_KC_PORT=8445 ;; DNK) SPOKE_KC_PORT=8450 ;;
            NOR) SPOKE_KC_PORT=8465 ;; POL) SPOKE_KC_PORT=8466 ;; FRA) SPOKE_KC_PORT=8446 ;;
            GBR) SPOKE_KC_PORT=8447 ;; DEU) SPOKE_KC_PORT=8448 ;; *) SPOKE_KC_PORT=8444 ;;
        esac
    fi

    # Get admin token
    local KC_PASS=$(docker exec "$KC_CONTAINER" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null)
    local TOKEN=$(curl -sk -X POST "https://localhost:${SPOKE_KC_PORT}/realms/master/protocol/openid-connect/token" \
        -d "username=admin" -d "password=${KC_PASS}" \
        -d "grant_type=password" -d "client_id=admin-cli" 2>/dev/null | jq -r '.access_token')

    if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
        log_fail "Could not authenticate with Keycloak"
        ERRORS=$((ERRORS + 1))
    else
        local REALM="dive-v3-broker-${CODE_LOWER}"
        local USERS=$(curl -sk "https://localhost:${SPOKE_KC_PORT}/admin/realms/${REALM}/users?max=10" \
            -H "Authorization: Bearer $TOKEN" 2>/dev/null)

        # Check expected users
        local EXPECTED_USERS=("testuser-${CODE_LOWER}-1" "testuser-${CODE_LOWER}-2" "testuser-${CODE_LOWER}-3" "testuser-${CODE_LOWER}-4" "admin-${CODE_LOWER}")
        for user in "${EXPECTED_USERS[@]}"; do
            if echo "$USERS" | jq -e ".[] | select(.username == \"$user\")" > /dev/null 2>&1; then
                local clearance=$(echo "$USERS" | jq -r ".[] | select(.username == \"$user\") | .attributes.clearance[0] // \"none\"")
                log_pass "$user [$clearance]"
            else
                log_fail "$user MISSING"
                ERRORS=$((ERRORS + 1))
            fi
        done
    fi

    # =========================================================================
    # Check resources
    # =========================================================================
    echo ""
    echo "  📄 Resources:"

    local MONGO_PASS=$(docker exec "$MONGO_CONTAINER" printenv MONGO_INITDB_ROOT_PASSWORD 2>/dev/null)
    local DB_NAME="dive-v3-${CODE_LOWER}"

    if [[ -n "$MONGO_PASS" ]]; then
        local RESOURCE_COUNT=$(docker exec "$MONGO_CONTAINER" mongosh --quiet \
            "mongodb://admin:${MONGO_PASS}@localhost:27017/${DB_NAME}?authSource=admin" \
            --eval "db.resources.countDocuments()" 2>/dev/null)

        if [[ "$RESOURCE_COUNT" =~ ^[0-9]+$ ]] && [[ "$RESOURCE_COUNT" -gt 0 ]]; then
            log_pass "$RESOURCE_COUNT resources seeded"
        else
            log_warn "No resources found - run: ./scripts/spoke-init/seed-resources.sh ${CODE_UPPER}"
            WARNINGS=$((WARNINGS + 1))
        fi
    else
        log_fail "Could not get MongoDB credentials"
        ERRORS=$((ERRORS + 1))
    fi

    # =========================================================================
    # Check federation (if Hub is running)
    # =========================================================================
    echo ""
    echo "  🔗 Federation:"

    if docker ps --format '{{.Names}}' | grep -q 'dive-hub-keycloak'; then
        # Get Hub token
        local HUB_PASS=$(docker exec dive-hub-backend printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null)
        local HUB_TOKEN=$(curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" \
            -d "username=admin" -d "password=${HUB_PASS}" \
            -d "grant_type=password" -d "client_id=admin-cli" 2>/dev/null | jq -r '.access_token')

        if [[ -n "$HUB_TOKEN" && "$HUB_TOKEN" != "null" ]]; then
            # Check if Hub has this spoke's IdP
            local IDP_EXISTS=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/${CODE_LOWER}-idp" \
                -H "Authorization: Bearer $HUB_TOKEN" 2>/dev/null | jq -r '.alias // empty')

            if [[ -n "$IDP_EXISTS" ]]; then
                log_pass "Hub has ${CODE_LOWER}-idp configured"
            else
                log_warn "Hub missing ${CODE_LOWER}-idp - run: ./scripts/spoke-init/sync-federation-secrets.sh ${CODE_UPPER}"
                WARNINGS=$((WARNINGS + 1))
            fi

            # Check if spoke has usa-idp
            local SPOKE_USA_IDP=$(curl -sk "https://localhost:${SPOKE_KC_PORT}/admin/realms/${REALM}/identity-provider/instances/usa-idp" \
                -H "Authorization: Bearer $TOKEN" 2>/dev/null | jq -r '.alias // empty')

            if [[ -n "$SPOKE_USA_IDP" ]]; then
                log_pass "Spoke has usa-idp configured"
            else
                log_info "Spoke doesn't have usa-idp (optional)"
            fi
        else
            log_warn "Could not get Hub token"
            WARNINGS=$((WARNINGS + 1))
        fi
    else
        log_info "Hub not running - skipping federation check"
    fi

    # =========================================================================
    # Summary
    # =========================================================================
    echo ""
    if [[ $ERRORS -eq 0 && $WARNINGS -eq 0 ]]; then
        echo "  ✅ ${CODE_UPPER} is fully configured!"
        return 0
    elif [[ $ERRORS -eq 0 ]]; then
        echo "  ⚠️  ${CODE_UPPER} has $WARNINGS warning(s)"
        return 0
    else
        echo "  ❌ ${CODE_UPPER} has $ERRORS error(s) and $WARNINGS warning(s)"
        return 1
    fi
}

# Main execution
if [[ -z "$INSTANCE_CODE" ]]; then
    echo "Usage: $0 <INSTANCE_CODE>"
    echo "       $0 all       # Verify all running spokes"
    exit 1
fi

if [[ "$INSTANCE_CODE" == "all" ]]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║         DIVE V3 - All Spokes Verification                    ║"
    echo "╚══════════════════════════════════════════════════════════════╝"

    TOTAL_PASS=0
    TOTAL_FAIL=0

    # Find all running spoke Keycloak containers (pattern: dive-spoke-xxx-keycloak)
    for kc in $(docker ps --format '{{.Names}}' | grep -E '^dive-spoke-[a-z]{3}-keycloak$' | sort); do
        CODE=$(echo "$kc" | sed 's/dive-spoke-//' | sed 's/-keycloak//')
        # Skip USA (Hub is dive-hub-keycloak)
        if verify_spoke "$CODE"; then
            TOTAL_PASS=$((TOTAL_PASS + 1))
        else
            TOTAL_FAIL=$((TOTAL_FAIL + 1))
        fi
    done

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Summary: $TOTAL_PASS passed, $TOTAL_FAIL failed"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
    verify_spoke "$INSTANCE_CODE"
fi
