#!/usr/bin/env bash
# =============================================================================
# Phase 9: Federation Sovereignty Tests
#
# Verifies that external-facing URLs resolve to proper FQDNs when
# DIVE_DOMAIN_SUFFIX or HUB_EXTERNAL_ADDRESS is set, and fall back
# to localhost only in local mode.
# =============================================================================

set -euo pipefail

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# TAP-format test runner
TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

pass() { TEST_COUNT=$((TEST_COUNT + 1)); PASS_COUNT=$((PASS_COUNT + 1)); echo "ok $TEST_COUNT - $1"; }
fail() { TEST_COUNT=$((TEST_COUNT + 1)); FAIL_COUNT=$((FAIL_COUNT + 1)); echo "not ok $TEST_COUNT - $1"; echo "  ---"; echo "  $2"; echo "  ---"; }
skip() { TEST_COUNT=$((TEST_COUNT + 1)); SKIP_COUNT=$((SKIP_COUNT + 1)); echo "ok $TEST_COUNT - # SKIP $1"; }

# ─────────────────────────────────────────────────────────────────────────────
# Load helpers from common.sh (we need resolve_spoke_public_url, etc.)
# ─────────────────────────────────────────────────────────────────────────────

# Minimal stub for functions common.sh needs but are not needed for URL tests
log_info()    { :; }
log_warn()    { :; }
log_error()   { :; }
log_success() { :; }
log_verbose() { :; }
log_step()    { :; }
export -f log_info log_warn log_error log_success log_verbose log_step

# Source common.sh with ENVIRONMENT=local to avoid side effects
export ENVIRONMENT=local
export DIVE_ROOT

# Extract just the helper functions by sourcing common.sh
# We override get_instance_ports to avoid real docker calls
get_instance_ports() {
    local code="$1"
    case "${code^^}" in
        GBR) echo "SPOKE_FRONTEND_PORT=3010; SPOKE_BACKEND_PORT=4010; SPOKE_KEYCLOAK_HTTPS_PORT=8453; SPOKE_KAS_PORT=9010" ;;
        FRA) echo "SPOKE_FRONTEND_PORT=3020; SPOKE_BACKEND_PORT=4020; SPOKE_KEYCLOAK_HTTPS_PORT=8463; SPOKE_KAS_PORT=9020" ;;
        *)   echo "SPOKE_FRONTEND_PORT=3000; SPOKE_BACKEND_PORT=4000; SPOKE_KEYCLOAK_HTTPS_PORT=8443; SPOKE_KAS_PORT=9000" ;;
    esac
}
export -f get_instance_ports

lower() { echo "$1" | tr '[:upper:]' '[:lower:]'; }
export -f lower

# Source the URL resolution helpers directly from common.sh
# We can't source all of common.sh (too many side effects), so extract the functions
eval "$(sed -n '/^resolve_spoke_public_url()/,/^export -f resolve_spoke_public_url/p' "${DIVE_ROOT}/scripts/dive-modules/common.sh")"
eval "$(sed -n '/^resolve_hub_public_url()/,/^export -f resolve_hub_public_url/p' "${DIVE_ROOT}/scripts/dive-modules/common.sh")"

echo "TAP version 13"
echo "# Phase 9: Federation Sovereignty Tests"

# ─────────────────────────────────────────────────────────────────────────────
# Section 1: resolve_spoke_public_url
# ─────────────────────────────────────────────────────────────────────────────

echo "# resolve_spoke_public_url — local mode"

# Test 1: Local mode returns localhost:port for app
unset DIVE_DOMAIN_SUFFIX HUB_EXTERNAL_ADDRESS 2>/dev/null || true
result=$(resolve_spoke_public_url "GBR" "app")
if [ "$result" = "https://localhost:3010" ]; then
    pass "spoke app URL: localhost:port in local mode"
else
    fail "spoke app URL: expected https://localhost:3010, got $result" "local mode should fallback to localhost"
fi

# Test 2: Local mode returns localhost:port for idp
result=$(resolve_spoke_public_url "GBR" "idp")
if [ "$result" = "https://localhost:8453" ]; then
    pass "spoke idp URL: localhost:port in local mode"
else
    fail "spoke idp URL: expected https://localhost:8453, got $result" "local mode should fallback to localhost"
fi

# Test 3: Local mode returns localhost:port for api
result=$(resolve_spoke_public_url "GBR" "api")
if [ "$result" = "https://localhost:4010" ]; then
    pass "spoke api URL: localhost:port in local mode"
else
    fail "spoke api URL: expected https://localhost:4010, got $result" "local mode should fallback to localhost"
fi

# Test 4: Local mode returns localhost:port for kas
result=$(resolve_spoke_public_url "GBR" "kas")
if [ "$result" = "https://localhost:9010" ]; then
    pass "spoke kas URL: localhost:port in local mode"
else
    fail "spoke kas URL: expected https://localhost:9010, got $result" "local mode should fallback to localhost"
fi

echo "# resolve_spoke_public_url — domain suffix mode (Caddy)"

# Test 5: DIVE_DOMAIN_SUFFIX generates FQDN for app
export DIVE_DOMAIN_SUFFIX="dev.dive25.com"
unset HUB_EXTERNAL_ADDRESS 2>/dev/null || true
result=$(resolve_spoke_public_url "GBR" "app")
if [ "$result" = "https://dev-gbr-app.dive25.com" ]; then
    pass "spoke app FQDN: Caddy domain suffix"
else
    fail "spoke app FQDN: expected https://dev-gbr-app.dive25.com, got $result" "DIVE_DOMAIN_SUFFIX should generate FQDN"
fi

# Test 6: DIVE_DOMAIN_SUFFIX generates FQDN for idp
result=$(resolve_spoke_public_url "GBR" "idp")
if [ "$result" = "https://dev-gbr-idp.dive25.com" ]; then
    pass "spoke idp FQDN: Caddy domain suffix"
else
    fail "spoke idp FQDN: expected https://dev-gbr-idp.dive25.com, got $result" "DIVE_DOMAIN_SUFFIX should generate FQDN"
fi

# Test 7: Case-insensitive instance code
result=$(resolve_spoke_public_url "fra" "api")
if [ "$result" = "https://dev-fra-api.dive25.com" ]; then
    pass "spoke api FQDN: lowercase instance code"
else
    fail "spoke api FQDN: expected https://dev-fra-api.dive25.com, got $result" "should lowercase instance code"
fi

echo "# resolve_spoke_public_url — IP mode"

# Test 8: HUB_EXTERNAL_ADDRESS generates IP:port URL
unset DIVE_DOMAIN_SUFFIX 2>/dev/null || true
export HUB_EXTERNAL_ADDRESS="192.168.1.100"
result=$(resolve_spoke_public_url "GBR" "idp")
if [ "$result" = "https://192.168.1.100:8453" ]; then
    pass "spoke idp URL: IP mode with HUB_EXTERNAL_ADDRESS"
else
    fail "spoke idp URL: expected https://192.168.1.100:8453, got $result" "IP mode should use HUB_EXTERNAL_ADDRESS:port"
fi

# Test 9: DIVE_DOMAIN_SUFFIX takes priority over HUB_EXTERNAL_ADDRESS
export DIVE_DOMAIN_SUFFIX="dev.dive25.com"
export HUB_EXTERNAL_ADDRESS="192.168.1.100"
result=$(resolve_spoke_public_url "GBR" "app")
if [ "$result" = "https://dev-gbr-app.dive25.com" ]; then
    pass "DIVE_DOMAIN_SUFFIX takes priority over HUB_EXTERNAL_ADDRESS"
else
    fail "DIVE_DOMAIN_SUFFIX priority: expected FQDN, got $result" "domain suffix should win over IP"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Section 2: resolve_hub_public_url
# ─────────────────────────────────────────────────────────────────────────────

echo "# resolve_hub_public_url — local mode"

# Test 10: Local mode returns localhost for idp
unset DIVE_DOMAIN_SUFFIX HUB_EXTERNAL_ADDRESS HUB_KC_URL HUB_API_URL 2>/dev/null || true
export KEYCLOAK_HTTPS_PORT=8443
export BACKEND_PORT=4000
result=$(resolve_hub_public_url "idp")
if [ "$result" = "https://localhost:8443" ]; then
    pass "hub idp URL: localhost in local mode"
else
    fail "hub idp URL: expected https://localhost:8443, got $result" "local mode fallback"
fi

# Test 11: Local mode returns localhost for api
result=$(resolve_hub_public_url "api")
if [ "$result" = "https://localhost:4000" ]; then
    pass "hub api URL: localhost in local mode"
else
    fail "hub api URL: expected https://localhost:4000, got $result" "local mode fallback"
fi

echo "# resolve_hub_public_url — domain suffix mode"

# Test 12: Domain suffix generates FQDN
export DIVE_DOMAIN_SUFFIX="dev.dive25.com"
unset HUB_KC_URL HUB_API_URL HUB_EXTERNAL_ADDRESS 2>/dev/null || true
result=$(resolve_hub_public_url "idp")
if [ "$result" = "https://dev-usa-idp.dive25.com" ]; then
    pass "hub idp FQDN: Caddy domain suffix"
else
    fail "hub idp FQDN: expected https://dev-usa-idp.dive25.com, got $result" "domain suffix for hub"
fi

# Test 13: Hub API URL via domain suffix
result=$(resolve_hub_public_url "api")
if [ "$result" = "https://dev-usa-api.dive25.com" ]; then
    pass "hub api FQDN: Caddy domain suffix"
else
    fail "hub api FQDN: expected https://dev-usa-api.dive25.com, got $result" "domain suffix for hub api"
fi

echo "# resolve_hub_public_url — explicit env vars take priority"

# Test 14: HUB_KC_URL takes priority for idp
export HUB_KC_URL="https://custom-keycloak.example.com"
result=$(resolve_hub_public_url "idp")
if [ "$result" = "https://custom-keycloak.example.com" ]; then
    pass "hub idp URL: explicit HUB_KC_URL takes priority"
else
    fail "hub idp URL: expected https://custom-keycloak.example.com, got $result" "explicit env var should win"
fi

# Test 15: HUB_API_URL takes priority for api
export HUB_API_URL="https://custom-api.example.com"
result=$(resolve_hub_public_url "api")
if [ "$result" = "https://custom-api.example.com" ]; then
    pass "hub api URL: explicit HUB_API_URL takes priority"
else
    fail "hub api URL: expected https://custom-api.example.com, got $result" "explicit env var should win"
fi

echo "# resolve_hub_public_url — IP mode"

# Test 16: IP mode with HUB_EXTERNAL_ADDRESS
unset DIVE_DOMAIN_SUFFIX HUB_KC_URL HUB_API_URL 2>/dev/null || true
export HUB_EXTERNAL_ADDRESS="10.0.0.1"
result=$(resolve_hub_public_url "idp")
if [ "$result" = "https://10.0.0.1:8443" ]; then
    pass "hub idp URL: IP mode"
else
    fail "hub idp URL: expected https://10.0.0.1:8443, got $result" "IP mode for hub"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Section 3: Source file verification — no hardcoded localhost in external URLs
# ─────────────────────────────────────────────────────────────────────────────

echo "# Source verification — federation/setup.sh"

# Test 17: No hardcoded localhost spoke URLs in federation/setup.sh
setup_file="${DIVE_ROOT}/scripts/dive-modules/federation/setup.sh"
if ! grep -n 'spoke_url="https://localhost' "$setup_file" >/dev/null 2>&1; then
    pass "federation/setup.sh: no hardcoded localhost spoke URLs"
else
    fail "federation/setup.sh: found hardcoded localhost spoke URLs" "$(grep -n 'spoke_url="https://localhost' "$setup_file")"
fi

# Test 18: Uses resolve_spoke_public_url
if grep -q 'resolve_spoke_public_url' "$setup_file"; then
    pass "federation/setup.sh: uses resolve_spoke_public_url"
else
    fail "federation/setup.sh: should use resolve_spoke_public_url" "helper not found in source"
fi

# Test 19: Uses resolve_hub_public_url
if grep -q 'resolve_hub_public_url' "$setup_file"; then
    pass "federation/setup.sh: uses resolve_hub_public_url"
else
    fail "federation/setup.sh: should use resolve_hub_public_url" "helper not found in source"
fi

echo "# Source verification — spoke-compose-generator.sh"

# Test 20: No hardcoded localhost base_url in compose generator
gen_file="${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-compose-generator.sh"
if ! grep -n 'base_url="https://localhost' "$gen_file" >/dev/null 2>&1; then
    pass "spoke-compose-generator.sh: no hardcoded localhost base_url"
else
    fail "spoke-compose-generator.sh: found hardcoded localhost" "$(grep -n 'base_url="https://localhost' "$gen_file")"
fi

# Test 21: Uses resolve_spoke_public_url
if grep -q 'resolve_spoke_public_url' "$gen_file"; then
    pass "spoke-compose-generator.sh: uses resolve_spoke_public_url"
else
    fail "spoke-compose-generator.sh: should use resolve_spoke_public_url" "helper not found"
fi

echo "# Source verification — spoke-federation.sh"

# Test 22: No hardcoded localhost spoke discovery URL
fed_file="${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-federation.sh"
if ! grep -n 'spoke_discovery_url="https://localhost' "$fed_file" >/dev/null 2>&1; then
    pass "spoke-federation.sh: no hardcoded localhost spoke OIDC URL"
else
    fail "spoke-federation.sh: found hardcoded localhost OIDC URL" "$(grep -n 'spoke_discovery_url="https://localhost' "$fed_file")"
fi

# Test 23: No hardcoded localhost hub_public_url
if ! grep -n 'hub_public_url=.*localhost' "$fed_file" >/dev/null 2>&1; then
    pass "spoke-federation.sh: no hardcoded localhost hub_public_url"
else
    fail "spoke-federation.sh: found hardcoded localhost hub_public_url" "$(grep -n 'hub_public_url=.*localhost' "$fed_file")"
fi

echo "# Source verification — common.sh spoke_config_get"

# Test 24: spoke_config_get uses resolve helpers, not hardcoded localhost for baseUrl
common_file="${DIVE_ROOT}/scripts/dive-modules/common.sh"
# The case branch and resolve call are on adjacent lines; check that baseUrl doesn't use localhost
if grep -A1 'endpoints.baseUrl|baseUrl)' "$common_file" | grep -q 'resolve_spoke_public_url'; then
    pass "common.sh: spoke_config_get baseUrl uses resolve helper"
else
    fail "common.sh: spoke_config_get baseUrl should use resolve helper" "$(grep -A1 'endpoints.baseUrl' "$common_file")"
fi

# Test 25: spoke_config_get apiUrl uses resolve helper
if grep -A1 'endpoints.apiUrl|apiUrl)' "$common_file" | grep -q 'resolve_spoke_public_url'; then
    pass "common.sh: spoke_config_get apiUrl uses resolve helper"
else
    fail "common.sh: spoke_config_get apiUrl should use resolve helper" "$(grep -A1 'endpoints.apiUrl' "$common_file")"
fi

echo "# Source verification — phase-configuration.sh"

# Test 26: Hub connectivity uses resolve_hub_public_url
config_file="${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/phase-configuration.sh"
if grep -q 'resolve_hub_public_url' "$config_file"; then
    pass "phase-configuration.sh: uses resolve_hub_public_url"
else
    fail "phase-configuration.sh: should use resolve_hub_public_url" "helper not found"
fi

echo "# Source verification — hub-services.sh"

# Test 27: AMR mapper uses resolve_hub_public_url
hub_svc_file="${DIVE_ROOT}/scripts/dive-modules/deployment/hub-services.sh"
if grep '_hub_ensure_amr_mapper_exists' "$hub_svc_file" | head -1 | grep -q 'resolve_hub_public_url' 2>/dev/null || \
   grep -A5 '_hub_ensure_amr_mapper_exists()' "$hub_svc_file" | grep -q 'resolve_hub_public_url'; then
    pass "hub-services.sh: AMR mapper uses resolve_hub_public_url"
else
    fail "hub-services.sh: AMR mapper should use resolve_hub_public_url" "check _hub_ensure_amr_mapper_exists"
fi

# Test 28: hub_verify_realm uses resolve_hub_public_url
if grep -A5 'hub_verify_realm()' "$hub_svc_file" | grep -q 'resolve_hub_public_url'; then
    pass "hub-services.sh: hub_verify_realm uses resolve_hub_public_url"
else
    fail "hub-services.sh: hub_verify_realm should use resolve_hub_public_url" "check hub_verify_realm"
fi

echo "# Source verification — core.sh"

# Test 29: ensure_client_https_redirects uses resolve_hub_public_url
core_file="${DIVE_ROOT}/scripts/dive-modules/core.sh"
if grep -q 'resolve_hub_public_url' "$core_file"; then
    pass "core.sh: uses resolve_hub_public_url"
else
    fail "core.sh: should use resolve_hub_public_url" "helper not found"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Section 4: Ensure shared network is production-aware
# ─────────────────────────────────────────────────────────────────────────────

echo "# Network management — ensure_shared_network"

# Test 30: ensure_shared_network source skips production
if grep -A5 'ensure_shared_network()' "$common_file" | grep -q 'local|dev|staging'; then
    pass "ensure_shared_network: only creates network for local/dev/staging"
else
    fail "ensure_shared_network: should skip production environments" "missing environment guard"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Section 5: Helper function existence
# ─────────────────────────────────────────────────────────────────────────────

echo "# Helper functions defined and exported"

# Test 31: resolve_spoke_public_url is exported
if grep -q 'export -f resolve_spoke_public_url' "$common_file"; then
    pass "resolve_spoke_public_url: exported from common.sh"
else
    fail "resolve_spoke_public_url: not exported" "must be export -f for subshells"
fi

# Test 32: resolve_hub_public_url is exported
if grep -q 'export -f resolve_hub_public_url' "$common_file"; then
    pass "resolve_hub_public_url: exported from common.sh"
else
    fail "resolve_hub_public_url: not exported" "must be export -f for subshells"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo "1..$TEST_COUNT"
echo "# Tests: $TEST_COUNT  Passed: $PASS_COUNT  Failed: $FAIL_COUNT  Skipped: $SKIP_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo "# FAIL"
    exit 1
fi
echo "# OK"
