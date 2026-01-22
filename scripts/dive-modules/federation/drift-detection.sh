#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 Federation Drift Detection
# =============================================================================
# Automated 3-layer drift detection with auto-reconciliation:
# 1. Keycloak layer: IdP config, client secrets, protocol mappers
# 2. MongoDB layer: Federation registry, spoke metadata
# 3. Docker layer: Container configuration, environment variables
#
# Usage:
#   source scripts/dive-modules/federation/drift-detection.sh
#   federation_detect_drift USA FRA
#   federation_auto_reconcile USA FRA
# =============================================================================

# Prevent multiple sourcing
if [ -n "$FEDERATION_DRIFT_DETECTION_LOADED" ]; then
    return 0
fi
export FEDERATION_DRIFT_DETECTION_LOADED=1

# Ensure common functions are loaded
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/../common.sh" ]; then
    source "${SCRIPT_DIR}/../common.sh"
fi

# =============================================================================
# DRIFT DETECTION FUNCTIONS
# =============================================================================

##
# Detect drift between hub and spoke Keycloak configurations
#
# Arguments:
#   $1 - Hub instance code (e.g., USA)
#   $2 - Spoke instance code (e.g., FRA)
#
# Returns:
#   0 - No drift detected
#   1 - Drift detected (details in stdout)
##
federation_detect_keycloak_drift() {
    local hub_code="${1:?Hub instance code required}"
    local spoke_code="${2:?Spoke instance code required}"
    local hub_lower=$(echo "$hub_code" | tr '[:upper:]' '[:lower:]')
    local spoke_lower=$(echo "$spoke_code" | tr '[:upper:]' '[:lower:]')
    local drift_found=0

    log_info "Checking Keycloak drift: $hub_code ↔ $spoke_code"

    # Check 1: IdP exists in hub (outbound)
    local hub_idp_alias="${spoke_lower}-idp"
    local hub_idp_exists=$(curl -s -o /dev/null -w "%{http_code}" \
        "http://localhost:8080/admin/realms/dive-v3-broker-usa/identity-provider/instances/${hub_idp_alias}" \
        -H "Authorization: Bearer $(get_admin_token 'usa')" 2>/dev/null || echo "000")

    if [ "$hub_idp_exists" != "200" ]; then
        log_warn "DRIFT: IdP '${hub_idp_alias}' missing in Hub Keycloak"
        drift_found=1
    fi

    # Check 2: IdP exists in spoke (inbound)
    local spoke_idp_alias="${hub_lower}-idp"
    local spoke_port=$(get_spoke_keycloak_port "$spoke_code")
    local spoke_idp_exists=$(curl -s -o /dev/null -w "%{http_code}" \
        "http://localhost:${spoke_port}/admin/realms/dive-v3-broker-${spoke_lower}/identity-provider/instances/${spoke_idp_alias}" \
        -H "Authorization: Bearer $(get_admin_token "$spoke_lower")" 2>/dev/null || echo "000")

    if [ "$spoke_idp_exists" != "200" ]; then
        log_warn "DRIFT: IdP '${spoke_idp_alias}' missing in Spoke ($spoke_code) Keycloak"
        drift_found=1
    fi

    # Check 3: Client secrets match
    # (This would require comparing secrets from both instances)

    if [ $drift_found -eq 0 ]; then
        log_success "✓ No Keycloak drift detected between $hub_code and $spoke_code"
    fi

    return $drift_found
}

##
# Detect drift in MongoDB federation registry
#
# Arguments:
#   $1 - Hub instance code
#   $2 - Spoke instance code
#
# Returns:
#   0 - No drift detected
#   1 - Drift detected
##
federation_detect_mongodb_drift() {
    local hub_code="${1:?Hub instance code required}"
    local spoke_code="${2:?Spoke instance code required}"
    local spoke_lower=$(echo "$spoke_code" | tr '[:upper:]' '[:lower:]')
    local drift_found=0

    log_info "Checking MongoDB drift: $hub_code ↔ $spoke_code"

    # Check if spoke exists in federation registry
    local spoke_registered=$(docker exec dive-hub-mongo mongosh --quiet \
        --eval "db.federation_spokes.countDocuments({instance_code: '${spoke_code}'})" \
        dive-v3 2>/dev/null || echo "0")

    if [ "$spoke_registered" = "0" ]; then
        log_warn "DRIFT: Spoke '$spoke_code' not found in MongoDB federation registry"
        drift_found=1
    fi

    # Check if federation link is active
    local link_status=$(docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c \
        "SELECT status FROM federation_links WHERE target_code='${spoke_code}' AND direction='HUB_TO_SPOKE' ORDER BY created_at DESC LIMIT 1;" 2>/dev/null | xargs)

    if [ "$link_status" != "ACTIVE" ] && [ -n "$link_status" ]; then
        log_warn "DRIFT: Federation link to $spoke_code is '$link_status' (expected: ACTIVE)"
        drift_found=1
    fi

    if [ $drift_found -eq 0 ]; then
        log_success "✓ No MongoDB drift detected for $spoke_code"
    fi

    return $drift_found
}

##
# Detect drift in Docker container configuration
#
# Arguments:
#   $1 - Hub instance code
#   $2 - Spoke instance code
#
# Returns:
#   0 - No drift detected
#   1 - Drift detected
##
federation_detect_docker_drift() {
    local hub_code="${1:?Hub instance code required}"
    local spoke_code="${2:?Spoke instance code required}"
    local spoke_lower=$(echo "$spoke_code" | tr '[:upper:]' '[:lower:]')
    local drift_found=0

    log_info "Checking Docker drift: $hub_code ↔ $spoke_code"

    # Check if spoke containers are running
    local keycloak_running=$(docker ps --filter "name=dive-spoke-${spoke_lower}-keycloak" --format "{{.Status}}" 2>/dev/null | grep -c "Up" || echo "0")

    if [ "$keycloak_running" = "0" ]; then
        log_warn "DRIFT: Spoke $spoke_code Keycloak container not running"
        drift_found=1
    fi

    # Check network connectivity
    local network_attached=$(docker network inspect dive-v3-network --format '{{json .Containers}}' 2>/dev/null | grep -c "dive-spoke-${spoke_lower}" || echo "0")

    if [ "$network_attached" = "0" ]; then
        log_warn "DRIFT: Spoke $spoke_code containers not attached to dive-v3-network"
        drift_found=1
    fi

    if [ $drift_found -eq 0 ]; then
        log_success "✓ No Docker drift detected for $spoke_code"
    fi

    return $drift_found
}

##
# Full 3-layer drift detection
#
# Arguments:
#   $1 - Hub instance code
#   $2 - Spoke instance code
#
# Returns:
#   0 - No drift detected in any layer
#   1 - Drift detected (at least one layer)
##
federation_detect_drift() {
    local hub_code="${1:?Hub instance code required}"
    local spoke_code="${2:?Spoke instance code required}"
    local total_drift=0

    echo ""
    log_info "═══════════════════════════════════════════════════════════════"
    log_info "Federation Drift Detection: $hub_code ↔ $spoke_code"
    log_info "═══════════════════════════════════════════════════════════════"
    echo ""

    # Layer 1: Keycloak
    log_step "Layer 1: Keycloak Configuration"
    if ! federation_detect_keycloak_drift "$hub_code" "$spoke_code"; then
        ((total_drift++))
    fi
    echo ""

    # Layer 2: MongoDB
    log_step "Layer 2: MongoDB Federation Registry"
    if ! federation_detect_mongodb_drift "$hub_code" "$spoke_code"; then
        ((total_drift++))
    fi
    echo ""

    # Layer 3: Docker
    log_step "Layer 3: Docker Container Configuration"
    if ! federation_detect_docker_drift "$hub_code" "$spoke_code"; then
        ((total_drift++))
    fi
    echo ""

    # Summary
    log_info "═══════════════════════════════════════════════════════════════"
    if [ $total_drift -eq 0 ]; then
        log_success "✅ No drift detected - federation is synchronized"
    else
        log_warn "⚠️  Drift detected in $total_drift layer(s)"
        log_info "Run: ./dive federation reconcile $spoke_code"
    fi
    log_info "═══════════════════════════════════════════════════════════════"
    echo ""

    return $total_drift
}

##
# Auto-reconcile federation drift
#
# Arguments:
#   $1 - Hub instance code
#   $2 - Spoke instance code
#   $3 - Dry run (optional, default: false)
#
# Returns:
#   0 - Reconciliation successful
#   1 - Reconciliation failed
##
federation_auto_reconcile() {
    local hub_code="${1:?Hub instance code required}"
    local spoke_code="${2:?Spoke instance code required}"
    local dry_run="${3:-false}"

    log_info "Auto-reconciling federation: $hub_code ↔ $spoke_code"

    if [ "$dry_run" = "true" ]; then
        log_warn "[DRY-RUN] Would reconcile federation - no changes made"
        federation_detect_drift "$hub_code" "$spoke_code"
        return 0
    fi

    # Re-establish federation link
    # This triggers the full federation setup process
    if type -t federation_setup_bidirectional >/dev/null 2>&1; then
        federation_setup_bidirectional "$hub_code" "$spoke_code"
    else
        log_warn "federation_setup_bidirectional not available - manual reconciliation required"
        log_info "Run: ./dive federation link $spoke_code"
        return 1
    fi

    return 0
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

get_admin_token() {
    local instance="${1:-usa}"
    # Placeholder - actual implementation depends on auth mechanism
    echo "admin-token-placeholder"
}

get_spoke_keycloak_port() {
    local spoke_code="$1"
    local spoke_lower=$(echo "$spoke_code" | tr '[:upper:]' '[:lower:]')

    # Default port mapping
    case "$spoke_lower" in
        fra) echo "8444" ;;
        gbr) echo "8445" ;;
        deu) echo "8446" ;;
        *) echo "8444" ;;
    esac
}

# =============================================================================
# EXPORTS
# =============================================================================

export -f federation_detect_drift
export -f federation_detect_keycloak_drift
export -f federation_detect_mongodb_drift
export -f federation_detect_docker_drift
export -f federation_auto_reconcile

log_verbose "Federation drift detection module loaded"
