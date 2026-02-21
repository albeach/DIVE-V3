#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Policy Management Module (Consolidated)
# =============================================================================
# OPA policy bundle management and OPAL integration
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - policy.sh
#   (Formerly: hub/policy.sh — removed Phase 13b)
#   - spoke/spoke-policy.sh
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_UTILITIES_POLICY_LOADED:-}" ] && return 0
export DIVE_UTILITIES_POLICY_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

UTILITIES_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$UTILITIES_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

POLICIES_DIR="${DIVE_ROOT}/policies"
BUNDLE_DIR="${DIVE_ROOT}/policies/.bundle"
BUNDLE_SIGNING_KEY="${DIVE_ROOT}/certs/bundle-signing/bundle-signing.key"

# =============================================================================
# POLICY BUILD
# =============================================================================

##
# Build OPA policy bundle
#
# Arguments:
#   --sign    Sign the bundle
##
policy_build() {
    local sign=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --sign) sign=true; shift ;;
            *) shift ;;
        esac
    done

    log_info "Building OPA policy bundle..."

    if ! command -v opa >/dev/null 2>&1; then
        log_error "OPA not found. Install: brew install opa"
        return 1
    fi

    mkdir -p "$BUNDLE_DIR"

    # Build bundle
    local bundle_file="${BUNDLE_DIR}/bundle.tar.gz"

    if [ "$sign" = true ] && [ -f "$BUNDLE_SIGNING_KEY" ]; then
        log_info "Building signed bundle..."
        opa build -b "$POLICIES_DIR" \
            --signing-key "$BUNDLE_SIGNING_KEY" \
            --signing-alg RS256 \
            -o "$bundle_file"
    else
        log_info "Building unsigned bundle..."
        opa build -b "$POLICIES_DIR" -o "$bundle_file"
    fi

    if [ -f "$bundle_file" ]; then
        local size
        size=$(du -h "$bundle_file" | cut -f1)
        log_success "Policy bundle built: $bundle_file ($size)"
        return 0
    else
        log_error "Failed to build policy bundle"
        return 1
    fi
}

##
# Push policy bundle to OPAL server
##
policy_push() {
    log_info "Pushing policy bundle to OPAL..."

    local bundle_file="${BUNDLE_DIR}/bundle.tar.gz"

    if [ ! -f "$bundle_file" ]; then
        log_error "Bundle not found. Run: ./dive policy build"
        return 1
    fi

    # Check OPAL server
    local opal_url="https://localhost:${OPAL_PORT:-7002}"

    if ! curl -sf "${opal_url}/healthz" >/dev/null 2>&1; then
        log_error "OPAL server not reachable at $opal_url"
        return 1
    fi

    # Trigger policy refresh
    curl -sf -X POST "${opal_url}/policy/refresh" \
        -H "Content-Type: application/json" \
        -d '{"reason": "Manual policy push"}' >/dev/null 2>&1

    log_success "Policy refresh triggered on OPAL server"
    return 0
}

##
# Run OPA policy tests
#
# Arguments:
#   $1 - Test pattern (optional)
##
policy_test() {
    local pattern="${1:-}"

    log_info "Running OPA policy tests..."

    if ! command -v opa >/dev/null 2>&1; then
        log_error "OPA not found. Install from https://www.openpolicyagent.org/docs/latest/#running-opa"
        return 1
    fi

    local -a test_args=("test" "-v" "--bundle")

    if [ -n "$pattern" ]; then
        test_args+=("--run" "$pattern")
    fi

    test_args+=("${POLICIES_DIR}")

    opa "${test_args[@]}"
}

##
# Show current policy version
##
policy_version() {
    log_info "Policy version information:"

    local manifest="${POLICIES_DIR}/.manifest"

    if [ -f "$manifest" ]; then
        cat "$manifest" | jq '.' 2>/dev/null || cat "$manifest"
    else
        echo "No manifest found"
    fi

    # Show bundle info if exists
    local bundle_file="${BUNDLE_DIR}/bundle.tar.gz"
    if [ -f "$bundle_file" ]; then
        echo ""
        echo "Bundle:"
        echo "  Path: $bundle_file"
        echo "  Size: $(du -h "$bundle_file" | cut -f1)"
        echo "  Modified: $(stat -f "%Sm" "$bundle_file" 2>/dev/null || stat -c "%y" "$bundle_file" 2>/dev/null)"
    fi
}

##
# Show policy distribution status
##
policy_status() {
    echo "=== Policy Status ==="
    echo ""

    # OPAL Server status
    echo "OPAL Server:"
    if curl -sf "https://localhost:${OPAL_PORT:-7002}/healthz" >/dev/null 2>&1; then
        echo "  Status: Healthy"

        local stats
        stats=$(curl -sf "https://localhost:${OPAL_PORT:-7002}/stats" 2>/dev/null)
        if [ -n "$stats" ]; then
            echo "  Connected clients: $(echo "$stats" | jq -r '.clients // "N/A"')"
        fi
    else
        echo "  Status: Not available"
    fi

    echo ""

    # OPA instances
    echo "OPA Instances:"
    for container in $(docker ps --filter "name=opa" --format '{{.Names}}'); do
        local health
        health=$(docker inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
        printf "  %-40s %s\n" "$container" "$health"
    done

    echo ""

    # Bundle info
    echo "Bundle:"
    local bundle_file="${BUNDLE_DIR}/bundle.tar.gz"
    if [ -f "$bundle_file" ]; then
        echo "  Status: Built"
        echo "  Path: $bundle_file"
        echo "  Size: $(du -h "$bundle_file" | cut -f1)"
    else
        echo "  Status: Not built"
        echo "  Run: ./dive policy build"
    fi
}

##
# Refresh policy on all OPAL clients
##
policy_refresh() {
    log_info "Triggering policy refresh on all clients..."

    # Hub OPAL server
    if curl -sf "https://localhost:${OPAL_PORT:-7002}/healthz" >/dev/null 2>&1; then
        curl -sf -X POST "https://localhost:${OPAL_PORT:-7002}/policy/refresh" \
            -H "Content-Type: application/json" \
            -d '{"reason": "Manual refresh"}' >/dev/null 2>&1
        log_success "Hub OPAL refresh triggered"
    fi

    # Spoke OPAL clients (they pull from Hub)
    for container in $(docker ps --filter "name=opal-client" --format '{{.Names}}'); do
        log_verbose "Client $container will sync automatically"
    done

    log_success "Policy refresh complete"
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

##
# Policy module command dispatcher
##
module_policy() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        build)      policy_build "$@" ;;
        push)       policy_push "$@" ;;
        test)       policy_test "$@" ;;
        version)    policy_version "$@" ;;
        status)     policy_status "$@" ;;
        refresh)    policy_refresh "$@" ;;
        help|*)
            echo "Usage: ./dive policy <command> [args]"
            echo ""
            echo "Commands:"
            echo "  build [--sign]    Build OPA policy bundle"
            echo "  push              Push bundle to OPAL server"
            echo "  test [pattern]    Run OPA policy tests"
            echo "  version           Show policy version info"
            echo "  status            Show policy distribution status"
            echo "  refresh           Trigger policy refresh on all clients"
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f policy_build
export -f policy_push
export -f policy_test
export -f policy_version
export -f policy_status
export -f policy_refresh
export -f module_policy

log_verbose "Policy utilities module loaded"
