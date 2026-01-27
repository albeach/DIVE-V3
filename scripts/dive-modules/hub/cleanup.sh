#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Hub Cleanup Sub-Module
# =============================================================================
# Hub legacy resource cleanup functions
# Direct-loaded by hub.sh for immediate availability
# =============================================================================

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Mark this sub-module as loaded
export DIVE_HUB_CLEANUP_LOADED=1

# =============================================================================
# CONSTANTS (inherit from hub.sh if not set)
# =============================================================================

HUB_KEYCLOAK_URL="${HUB_KEYCLOAK_URL:-https://localhost:${KEYCLOAK_HTTPS_PORT:-8443}}"
FEDERATION_ADMIN_KEY="${FEDERATION_ADMIN_KEY:-dive-hub-admin-key}"

# =============================================================================
# HUB CLEANUP-LEGACY COMMAND
# =============================================================================
# Removes orphaned realms (e.g., dive-v3-broker without -usa suffix) that may
# cause conflicts or confusion. Also cleans up legacy client references.
# =============================================================================

hub_cleanup_legacy() {
    print_header
    echo -e "${BOLD}DIVE Hub - Cleanup Legacy Resources${NC}"
    echo ""

    local dry_run=false
    if [ "${1:-}" = "--dry-run" ]; then
        dry_run=true
        log_info "DRY RUN MODE - No changes will be made"
        echo ""
    fi

    local hub_kc="${COMPOSE_PROJECT_NAME:-dive-hub}-keycloak"

    # Check if Keycloak is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${hub_kc}$"; then
        log_error "Hub Keycloak is not running"
        log_info "Start it with: ./dive hub up"
        return 1
    fi

    # Get admin credentials
    local admin_pass
    admin_pass=$(get_keycloak_password "$hub_kc")
    if [ -z "$admin_pass" ]; then
        log_error "Cannot retrieve Keycloak admin password"
        return 1
    fi

    # Configure kcadm credentials
    log_step "Authenticating with Keycloak..."
    if ! docker exec "$hub_kc" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user admin --password "$admin_pass" 2>/dev/null; then
        log_error "Failed to authenticate with Keycloak"
        return 1
    fi

    local cleaned=0

    # ==========================================================================
    # Step 1: Find and remove legacy realms
    # ==========================================================================
    log_step "Scanning for legacy realms..."
    echo ""

    # Legacy realm patterns to remove:
    # - dive-v3-broker (without country suffix) - conflicts with instance-specific realms
    local legacy_realms=("dive-v3-broker")

    for realm in "${legacy_realms[@]}"; do
        if docker exec "$hub_kc" /opt/keycloak/bin/kcadm.sh get realms/"$realm" 2>/dev/null | grep -q '"realm"'; then
            echo -e "  ${YELLOW}Found legacy realm:${NC} $realm"
            if [ "$dry_run" = true ]; then
                echo -e "    ${CYAN}[DRY RUN]${NC} Would delete realm: $realm"
            else
                echo -n "    Deleting... "
                if docker exec "$hub_kc" /opt/keycloak/bin/kcadm.sh delete realms/"$realm" 2>/dev/null; then
                    echo -e "${GREEN}✓${NC}"
                    ((cleaned++))
                else
                    echo -e "${RED}✗ Failed${NC}"
                fi
            fi
        fi
    done

    # ==========================================================================
    # Step 2: Find clients with generic IDs in dive-v3-broker-usa realm
    # ==========================================================================
    log_step "Scanning for legacy clients in dive-v3-broker-usa..."
    echo ""

    local hub_realm="dive-v3-broker-usa"
    local legacy_clients=("dive-v3-client" "dive-v3-broker")

    for client_id in "${legacy_clients[@]}"; do
        local client_uuid
        client_uuid=$(docker exec "$hub_kc" /opt/keycloak/bin/kcadm.sh get clients -r "$hub_realm" \
            --fields id,clientId 2>/dev/null | jq -r ".[] | select(.clientId==\"${client_id}\") | .id")

        if [ -n "$client_uuid" ]; then
            echo -e "  ${YELLOW}Found legacy client:${NC} $client_id"
            if [ "$dry_run" = true ]; then
                echo -e "    ${CYAN}[DRY RUN]${NC} Would delete client: $client_id"
            else
                echo -n "    Deleting... "
                if docker exec "$hub_kc" /opt/keycloak/bin/kcadm.sh delete "clients/${client_uuid}" -r "$hub_realm" 2>/dev/null; then
                    echo -e "${GREEN}✓${NC}"
                    ((cleaned++))
                else
                    echo -e "${RED}✗ Failed${NC}"
                fi
            fi
        fi
    done

    # ==========================================================================
    # Step 3: Scan for orphaned IdPs (pointing to non-existent spokes)
    # ==========================================================================
    log_step "Scanning for orphaned IdPs..."
    echo ""

    local all_idps
    all_idps=$(docker exec "$hub_kc" /opt/keycloak/bin/kcadm.sh get identity-provider/instances \
        -r "$hub_realm" 2>/dev/null | jq -r '.[].alias')

    local orphaned_idps=()
    for idp_alias in $all_idps; do
        # Skip internal IdPs
        [[ "$idp_alias" =~ ^(local|master|admin) ]] && continue

        # Extract country code
        local country_code="${idp_alias%-idp}"
        [ "$country_code" = "$idp_alias" ] && continue  # No -idp suffix, skip

        # Check if spoke exists (look for instance directory)
        if [ ! -d "${DIVE_ROOT}/instances/${country_code}" ]; then
            # Also check if spoke container is running
            if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-spoke-${country_code}-keycloak"; then
                orphaned_idps+=("$idp_alias")
            fi
        fi
    done

    if [ ${#orphaned_idps[@]} -gt 0 ]; then
        echo -e "  ${YELLOW}Found orphaned IdPs (no matching spoke):${NC}"
        for idp in "${orphaned_idps[@]}"; do
            echo "    - $idp"
        done
        echo ""
        if [ "$dry_run" = true ]; then
            echo -e "  ${CYAN}[DRY RUN]${NC} Would prompt for IdP removal"
        else
            echo -n "  Remove orphaned IdPs? [y/N]: "
            read -r confirm
            if [[ "$confirm" =~ ^[Yy] ]]; then
                for idp in "${orphaned_idps[@]}"; do
                    echo -n "    Deleting $idp... "
                    if docker exec "$hub_kc" /opt/keycloak/bin/kcadm.sh delete \
                        "identity-provider/instances/${idp}" -r "$hub_realm" 2>/dev/null; then
                        echo -e "${GREEN}✓${NC}"
                        ((cleaned++))
                    else
                        echo -e "${RED}✗ Failed${NC}"
                    fi
                done
            else
                echo "  Skipped IdP cleanup"
            fi
        fi
    else
        echo "  No orphaned IdPs found"
    fi

    # ==========================================================================
    # Step 4: Clean up policy data legacy entries
    # ==========================================================================
    log_step "Scanning for legacy trusted issuer URLs..."
    echo ""

    local policy_data="${DIVE_ROOT}/policies/data.json"
    if [ -f "$policy_data" ]; then
        # Find URLs with missing port (https://localhost:/ pattern)
        local invalid_urls
        invalid_urls=$(jq -r '.trusted_issuers | keys[] | select(contains("https://localhost:/"))' "$policy_data" 2>/dev/null)

        if [ -n "$invalid_urls" ]; then
            local count=$(echo "$invalid_urls" | wc -l | tr -d ' ')
            echo -e "  ${YELLOW}Found $count invalid issuer URLs (missing port)${NC}"
            if [ "$dry_run" = true ]; then
                echo -e "  ${CYAN}[DRY RUN]${NC} Would remove entries with https://localhost:/ pattern"
            else
                echo -n "    Cleaning invalid URLs... "
                # Remove entries matching the pattern
                jq 'del(.trusted_issuers | to_entries[] | select(.key | contains("https://localhost:/")) | .key as $k | $k) | .trusted_issuers |= with_entries(select(.key | contains("https://localhost:/") | not))' \
                    "$policy_data" > "${policy_data}.tmp" && mv "${policy_data}.tmp" "$policy_data"
                echo -e "${GREEN}✓ Removed $count entries${NC}"
                ((cleaned += count))
            fi
        else
            echo "  No invalid issuer URLs found"
        fi
    fi

    # Summary
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    if [ "$dry_run" = true ]; then
        echo -e "${CYAN}DRY RUN complete - no changes were made${NC}"
        echo ""
        echo "To apply changes, run without --dry-run:"
        echo "  ./dive hub cleanup-legacy"
    else
        if [ "$cleaned" -gt 0 ]; then
            echo -e "${GREEN}✓ Cleaned up $cleaned legacy resource(s)${NC}"
            echo ""
            echo "Restart Hub to apply changes:"
            echo "  ./dive hub down && ./dive hub up"
        else
            echo -e "${GREEN}✓ No legacy resources found - Hub is clean${NC}"
        fi
    fi
    echo ""
}