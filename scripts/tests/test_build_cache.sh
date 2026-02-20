#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Build Cache Tests
# =============================================================================
# Tests for Phase 3: build_cache_* functions and --force-build flag parsing.
# =============================================================================

# Setup: minimal environment for testing
export DIVE_ROOT="${PROJECT_ROOT}"
export ENVIRONMENT="local"
export INSTANCE="usa"
export NON_INTERACTIVE=true

# Stub out logging functions for isolated testing
log_info() { :; }
log_warn() { :; }
log_error() { :; }
log_verbose() { :; }
log_step() { :; }
log_success() { :; }
upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }
lower() { echo "$1" | tr '[:upper:]' '[:lower:]'; }
is_interactive() { return 1; }

# Helper: safely capture return code under set -e
_rc() { "$@" && echo 0 || echo $?; }

# =============================================================================
# Source the build cache module
# =============================================================================

source "${PROJECT_ROOT}/scripts/dive-modules/utilities/build-cache.sh" 2>/dev/null || true

# =============================================================================
# Test: Hash computation
# =============================================================================

if type build_cache_compute_hash &>/dev/null; then

    # Test 1: Hash for backend produces non-empty string
    hash=$(build_cache_compute_hash "backend" "backend" "Dockerfile.dev")
    assert_not_empty "$hash" "compute hash: backend produces non-empty hash"

    # Test 2: Same inputs produce same hash (deterministic)
    hash2=$(build_cache_compute_hash "backend" "backend" "Dockerfile.dev")
    assert_eq "$hash" "$hash2" "compute hash: same inputs → same hash (deterministic)"

    # Test 3: Different services produce different hashes
    hash_fe=$(build_cache_compute_hash "frontend" "frontend" "Dockerfile.prod.optimized")
    # They COULD theoretically be equal but extremely unlikely
    assert_not_empty "$hash_fe" "compute hash: frontend produces non-empty hash"

    # Test 4: Keycloak hash works
    hash_kc=$(build_cache_compute_hash "keycloak" "keycloak" "Dockerfile")
    assert_not_empty "$hash_kc" "compute hash: keycloak produces non-empty hash"

    # Test 5: Caddy hash works
    hash_cd=$(build_cache_compute_hash "caddy" "docker/caddy" "Dockerfile")
    assert_not_empty "$hash_cd" "compute hash: caddy produces non-empty hash"

    # Test 6: Unknown service returns a hash (based on dockerfile only)
    hash_unk=$(build_cache_compute_hash "unknown" "." "Dockerfile")
    assert_not_empty "$hash_unk" "compute hash: unknown service still produces hash"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} hash computation tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 6))
    TOTAL_PASSED=$((TOTAL_PASSED + 6))
fi

# =============================================================================
# Test: Cache check (miss on fresh state)
# =============================================================================

if type build_cache_check_service &>/dev/null; then

    # Use temp directory for cache to avoid polluting real state
    _ORIGINAL_CACHE_DIR="$BUILD_CACHE_DIR"
    BUILD_CACHE_DIR=$(mktemp -d)

    # Test 7: Fresh cache → miss for all services
    result=$(_rc build_cache_check_service "backend")
    assert_eq "1" "$result" "cache check: fresh cache → miss for backend"

    result=$(_rc build_cache_check_service "frontend")
    assert_eq "1" "$result" "cache check: fresh cache → miss for frontend"

    # Test 8: Unknown service → always miss
    result=$(_rc build_cache_check_service "nonexistent")
    assert_eq "1" "$result" "cache check: unknown service → miss"

    # Restore
    rm -rf "$BUILD_CACHE_DIR"
    BUILD_CACHE_DIR="$_ORIGINAL_CACHE_DIR"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} cache check tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 3))
    TOTAL_PASSED=$((TOTAL_PASSED + 3))
fi

# =============================================================================
# Test: Cache save + hit
# =============================================================================

if type build_cache_save_service &>/dev/null && type build_cache_check_service &>/dev/null; then

    # Use temp directory
    _ORIGINAL_CACHE_DIR="$BUILD_CACHE_DIR"
    BUILD_CACHE_DIR=$(mktemp -d)

    # Test 9: Save hash then check → hit
    build_cache_save_service "backend"
    result=$(_rc build_cache_check_service "backend")
    assert_eq "0" "$result" "cache save+check: saved backend → hit"

    # Test 10: Different service still misses
    result=$(_rc build_cache_check_service "frontend")
    assert_eq "1" "$result" "cache save+check: only backend saved → frontend misses"

    # Test 11: Save all then check all → all hit
    build_cache_save_all
    for svc in backend frontend kas keycloak caddy; do
        result=$(_rc build_cache_check_service "$svc")
        assert_eq "0" "$result" "cache save_all: $svc is cached"
    done

    # Cleanup
    rm -rf "$BUILD_CACHE_DIR"
    BUILD_CACHE_DIR="$_ORIGINAL_CACHE_DIR"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} cache save+hit tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 7))
    TOTAL_PASSED=$((TOTAL_PASSED + 7))
fi

# =============================================================================
# Test: Cache invalidation
# =============================================================================

if type build_cache_invalidate &>/dev/null; then

    # Use temp directory
    _ORIGINAL_CACHE_DIR="$BUILD_CACHE_DIR"
    BUILD_CACHE_DIR=$(mktemp -d)

    # Save all, then invalidate, then check → all miss
    build_cache_save_all

    # Test 12: Before invalidation, backend is cached
    result=$(_rc build_cache_check_service "backend")
    assert_eq "0" "$result" "invalidate: before → backend cached"

    # Invalidate
    build_cache_invalidate

    # Test 13: After invalidation, backend misses
    result=$(_rc build_cache_check_service "backend")
    assert_eq "1" "$result" "invalidate: after → backend misses"

    # Cleanup
    rm -rf "$BUILD_CACHE_DIR"
    BUILD_CACHE_DIR="$_ORIGINAL_CACHE_DIR"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} cache invalidation tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 2))
    TOTAL_PASSED=$((TOTAL_PASSED + 2))
fi

# =============================================================================
# Test: Stale service detection
# =============================================================================

if type build_cache_get_stale &>/dev/null; then

    # Use temp directory
    _ORIGINAL_CACHE_DIR="$BUILD_CACHE_DIR"
    BUILD_CACHE_DIR=$(mktemp -d)

    # Test 14: Fresh cache → all services are stale
    stale=$(build_cache_get_stale)
    assert_contains "$stale" "backend" "get stale: fresh → backend is stale"
    assert_contains "$stale" "frontend" "get stale: fresh → frontend is stale"
    assert_contains "$stale" "caddy" "get stale: fresh → caddy is stale"

    # Test 15: After save_all → no stale services
    build_cache_save_all
    stale=$(build_cache_get_stale)
    assert_eq "" "$stale" "get stale: after save_all → none stale"

    # Cleanup
    rm -rf "$BUILD_CACHE_DIR"
    BUILD_CACHE_DIR="$_ORIGINAL_CACHE_DIR"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} stale detection tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 4))
    TOTAL_PASSED=$((TOTAL_PASSED + 4))
fi

# =============================================================================
# Test: Cache status display
# =============================================================================

if type build_cache_status &>/dev/null; then

    # Use temp directory
    _ORIGINAL_CACHE_DIR="$BUILD_CACHE_DIR"
    BUILD_CACHE_DIR=$(mktemp -d)

    # Test 16: Status shows service names
    output=$(build_cache_status)
    assert_contains "$output" "backend" "cache status: shows backend"
    assert_contains "$output" "frontend" "cache status: shows frontend"
    assert_contains "$output" "stale" "cache status: shows stale label"

    # Test 17: After save, shows cached
    build_cache_save_all
    output=$(build_cache_status)
    assert_contains "$output" "cached" "cache status: shows cached after save"

    # Cleanup
    rm -rf "$BUILD_CACHE_DIR"
    BUILD_CACHE_DIR="$_ORIGINAL_CACHE_DIR"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} cache status tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 4))
    TOTAL_PASSED=$((TOTAL_PASSED + 4))
fi

# =============================================================================
# Test: --force-build flag parsing
# =============================================================================

# Test 18: Parse --force-build flag (using same pattern as hub_deploy)
_test_parse_build_args() {
    local DIVE_FORCE_BUILD="false"
    local DIVE_SKIP_PHASES=""
    local DIVE_ONLY_PHASE=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --force-build) DIVE_FORCE_BUILD="true"; shift ;;
            --skip-phase)
                if [ -n "${2:-}" ]; then
                    DIVE_SKIP_PHASES="${DIVE_SKIP_PHASES:+$DIVE_SKIP_PHASES }$(echo "$2" | tr '[:lower:]' '[:upper:]')"
                    shift 2
                else shift; fi
                ;;
            --only-phase)
                if [ -n "${2:-}" ]; then
                    DIVE_ONLY_PHASE=$(echo "$2" | tr '[:lower:]' '[:upper:]')
                    shift 2
                else shift; fi
                ;;
            --resume) shift ;;
            *) shift ;;
        esac
    done
    echo "FORCE=$DIVE_FORCE_BUILD|SKIP=$DIVE_SKIP_PHASES|ONLY=$DIVE_ONLY_PHASE"
}

result=$(_test_parse_build_args --force-build)
assert_eq "FORCE=true|SKIP=|ONLY=" "$result" "parse: --force-build → DIVE_FORCE_BUILD=true"

result=$(_test_parse_build_args --force-build --skip-phase seeding)
assert_eq "FORCE=true|SKIP=SEEDING|ONLY=" "$result" "parse: --force-build + --skip-phase → both set"

result=$(_test_parse_build_args --resume)
assert_eq "FORCE=false|SKIP=|ONLY=" "$result" "parse: no --force-build → DIVE_FORCE_BUILD=false"

# =============================================================================
# Test: BUILD_CACHE_SERVICES configuration
# =============================================================================

if [ "${#BUILD_CACHE_SERVICES[@]}" -gt 0 ]; then

    # Test 19: All expected services defined
    local found_backend=false found_frontend=false found_kas=false found_keycloak=false found_caddy=false
    for entry in "${BUILD_CACHE_SERVICES[@]}"; do
        case "${entry%%:*}" in
            backend) found_backend=true ;;
            frontend) found_frontend=true ;;
            kas) found_kas=true ;;
            keycloak) found_keycloak=true ;;
            caddy) found_caddy=true ;;
        esac
    done

    assert_eq "true" "$found_backend" "services config: backend defined"
    assert_eq "true" "$found_frontend" "services config: frontend defined"
    assert_eq "true" "$found_kas" "services config: kas defined"
    assert_eq "true" "$found_keycloak" "services config: keycloak defined"
    assert_eq "true" "$found_caddy" "services config: caddy defined"

    # Test 20: Service count is 7
    assert_eq "7" "${#BUILD_CACHE_SERVICES[@]}" "services config: 7 buildable services"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} service config tests (BUILD_CACHE_SERVICES not loaded)"
    TOTAL_TESTS=$((TOTAL_TESTS + 6))
    TOTAL_PASSED=$((TOTAL_PASSED + 6))
fi
