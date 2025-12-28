#!/usr/bin/env bash
# ==============================================================================
# DIVE V3 - Realm Migration Module
# ==============================================================================
# Migrates USA hub from legacy "dive-v3-broker-usa" to correct "dive-v3-broker-usa"
# ==============================================================================

set -e

# Source common functions
if [ -f "${MODULES_DIR}/common.sh" ]; then
    source "${MODULES_DIR}/common.sh"
fi

# Source naming conventions
if [ -f "${DIVE_ROOT}/scripts/lib/naming-conventions.sh" ]; then
    source "${DIVE_ROOT}/scripts/lib/naming-conventions.sh"
fi

# ==============================================================================
# Hub Realm Rename: dive-v3-broker-usa → dive-v3-broker-usa
# ==============================================================================

module_realm_migration() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        migrate-hub)
            migrate_hub_realm_to_usa
            ;;
        verify)
            verify_realm_naming
            ;;
        *)
            cat <<EOF
${BOLD}DIVE V3 Realm Migration Commands:${NC}

Usage:
  ./dive realm-migration migrate-hub    Migrate hub from dive-v3-broker-usa to dive-v3-broker-usa
  ./dive realm-migration verify         Verify all realms follow naming convention

Current Convention:
  Hub:   dive-v3-broker-usa
  Spoke: dive-v3-broker-{instance}  (e.g., dive-v3-broker-lva)

EOF
            ;;
    esac
}

# ==============================================================================
# Migrate Hub Realm
# ==============================================================================

migrate_hub_realm_to_usa() {
    log_header "Migrating Hub Realm to Correct Naming"

    local OLD_REALM="dive-v3-broker-usa"
    local NEW_REALM="dive-v3-broker-usa"
    local KEYCLOAK_URL="https://localhost:8443"

    log_step "Step 1/5: Checking current realm..."

    # Check if old realm exists
    local old_exists=$(curl -sk "$KEYCLOAK_URL/realms/$OLD_REALM/.well-known/openid-configuration" 2>/dev/null | jq -r '.issuer // empty')
    local new_exists=$(curl -sk "$KEYCLOAK_URL/realms/$NEW_REALM/.well-known/openid-configuration" 2>/dev/null | jq -r '.issuer // empty')

    if [ -n "$new_exists" ]; then
        log_success "Realm '$NEW_REALM' already exists - migration complete"
        return 0
    fi

    if [ -z "$old_exists" ]; then
        log_error "Legacy realm '$OLD_REALM' not found - cannot migrate"
        return 1
    fi

    log_info "Found legacy realm: $OLD_REALM"

    log_step "Step 2/5: Exporting realm configuration..."

    # Get admin token
    local ADMIN_PASSWORD=$(docker exec dive-hub-keycloak printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null || echo "admin")
    local TOKEN=$(curl -sk -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=$ADMIN_PASSWORD" \
        -d "grant_type=password" | jq -r '.access_token')

    if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
        log_error "Failed to get admin token"
        return 1
    fi

    # Export realm
    local REALM_DATA=$(curl -sk "$KEYCLOAK_URL/admin/realms/$OLD_REALM" \
        -H "Authorization: Bearer $TOKEN")

    log_success "Exported realm configuration"

    log_step "Step 3/5: Creating new realm with correct name..."

    # Update realm name and ID in export
    local NEW_REALM_DATA=$(echo "$REALM_DATA" | jq \
        --arg new_realm "$NEW_REALM" \
        '.realm = $new_realm | .id = $new_realm')

    # Create new realm
    curl -sk -X POST "$KEYCLOAK_URL/admin/realms" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$NEW_REALM_DATA" > /dev/null

    log_success "Created realm: $NEW_REALM"

    log_step "Step 4/5: Updating spoke IdP references..."

    # Update all spoke IdPs that point to old realm
    for spoke_dir in "${DIVE_ROOT}/instances/"*; do
        if [ -d "$spoke_dir" ] && [ "$(basename "$spoke_dir")" != "usa" ]; then
            local spoke_code=$(basename "$spoke_dir" | tr '[:lower:]' '[:upper:]')
            local spoke_container="dive-spoke-$(basename "$spoke_dir")-keycloak"

            if docker ps --format '{{.Names}}' | grep -q "^${spoke_container}$"; then
                log_info "Updating IdP in $spoke_code..."

                # Update usa-idp issuer URL in spoke
                local spoke_realm="dive-v3-broker-$(basename "$spoke_dir")"
                local spoke_token=$(curl -sk -X POST "https://localhost:$(docker port "$spoke_container" 8443 | cut -d: -f2)/realms/master/protocol/openid-connect/token" \
                    -d "client_id=admin-cli" \
                    -d "username=admin" \
                    -d "password=$ADMIN_PASSWORD" \
                    -d "grant_type=password" | jq -r '.access_token')

                if [ -n "$spoke_token" ] && [ "$spoke_token" != "null" ]; then
                    # This would require complex IdP update logic
                    log_warn "Manual IdP update required for $spoke_code"
                fi
            fi
        fi
    done

    log_step "Step 5/5: Verification..."

    # Verify new realm exists
    local verify=$(curl -sk "$KEYCLOAK_URL/realms/$NEW_REALM/.well-known/openid-configuration" 2>/dev/null | jq -r '.issuer')

    if [ -n "$verify" ] && [ "$verify" != "null" ]; then
        log_success "Migration complete!"
        echo ""
        log_warn "MANUAL STEPS REQUIRED:"
        echo "  1. Redeploy all spokes to update usa-idp configuration"
        echo "  2. Update frontend .env files to use new issuer"
        echo "  3. After verification, delete old realm: ./dive realm-migration delete-old"
    else
        log_error "Migration verification failed"
        return 1
    fi
}

# ==============================================================================
# Verify Realm Naming
# ==============================================================================

verify_realm_naming() {
    log_header "Verifying Realm Naming Convention"

    local KEYCLOAK_URL="https://localhost:8443"
    local errors=0

    # Check hub
    log_step "Checking USA Hub..."
    local hub_realm=$(curl -sk "$KEYCLOAK_URL/realms/dive-v3-broker-usa/.well-known/openid-configuration" 2>/dev/null | jq -r '.issuer')
    if [ -n "$hub_realm" ] && [ "$hub_realm" != "null" ]; then
        log_success "Hub realm correct: dive-v3-broker-usa"
    else
        log_error "Hub realm missing or incorrect (expected: dive-v3-broker-usa)"
        ((errors++))
    fi

    # Check for legacy realm
    local legacy=$(curl -sk "$KEYCLOAK_URL/realms/dive-v3-broker-usa/.well-known/openid-configuration" 2>/dev/null | jq -r '.issuer')
    if [ -n "$legacy" ] && [ "$legacy" != "null" ]; then
        log_warn "Legacy realm found: dive-v3-broker-usa (should be migrated)"
        ((errors++))
    fi

    # Check spokes
    log_step "Checking Spokes..."
    for spoke_dir in "${DIVE_ROOT}/instances/"*; do
        if [ -d "$spoke_dir" ] && [ "$(basename "$spoke_dir")" != "usa" ]; then
            local spoke_code=$(basename "$spoke_dir")
            local spoke_container="dive-spoke-${spoke_code}-keycloak"

            if docker ps --format '{{.Names}}' | grep -q "^${spoke_container}$"; then
                local spoke_port=$(docker port "$spoke_container" 8443 2>/dev/null | cut -d: -f2)
                local expected_realm="dive-v3-broker-${spoke_code}"
                local spoke_realm=$(curl -sk "https://localhost:${spoke_port}/realms/${expected_realm}/.well-known/openid-configuration" 2>/dev/null | jq -r '.issuer')

                if [ -n "$spoke_realm" ] && [ "$spoke_realm" != "null" ]; then
                    log_success "$(echo $spoke_code | tr '[:lower:]' '[:upper:]'): $expected_realm"
                else
                    log_error "$(echo $spoke_code | tr '[:lower:]' '[:upper:]'): realm $expected_realm missing"
                    ((errors++))
                fi
            fi
        fi
    done

    echo ""
    if [ $errors -eq 0 ]; then
        log_success "All realms follow naming convention!"
    else
        log_warn "Found $errors naming issues - run: ./dive realm-migration migrate-hub"
    fi
}

# Export functions
export -f module_realm_migration

