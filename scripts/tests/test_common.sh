#!/usr/bin/env bash
# =============================================================================
# Tests for common.sh utility functions
# =============================================================================
# Pure function tests — no Docker, no network, no external dependencies.
# =============================================================================

# Source common.sh with stubs for Docker-dependent functions
export DIVE_ROOT="$PROJECT_ROOT"
export ENVIRONMENT="${ENVIRONMENT:-local}"
export INSTANCE="${INSTANCE:-usa}"
export DRY_RUN="${DRY_RUN:-false}"
export QUIET="${QUIET:-true}"

# Stub docker to avoid errors during source
docker() { return 1; }
export -f docker

source "$PROJECT_ROOT/scripts/dive-modules/common.sh" 2>/dev/null || true

# ─── upper() / lower() ───────────────────────────────────────────────────────

assert_eq "USA" "$(upper 'usa')" "upper: lowercase to uppercase"
assert_eq "HELLO WORLD" "$(upper 'hello world')" "upper: mixed input"
assert_eq "" "$(upper '')" "upper: empty string"

assert_eq "fra" "$(lower 'FRA')" "lower: uppercase to lowercase"
assert_eq "hello world" "$(lower 'HELLO WORLD')" "lower: mixed input"
assert_eq "" "$(lower '')" "lower: empty string"

# ─── container_name() ────────────────────────────────────────────────────────

# Hub context
ENVIRONMENT="local"
CONTAINER_PREFIX=""
result=$(container_name "keycloak" "USA")
assert_eq "dive-hub-keycloak" "$result" "container_name: USA maps to dive-hub"

result=$(container_name "keycloak" "HUB")
assert_eq "dive-hub-keycloak" "$result" "container_name: HUB maps to dive-hub"

# Spoke context
result=$(container_name "keycloak" "FRA")
assert_eq "dive-spoke-fra-keycloak" "$result" "container_name: FRA maps to dive-spoke-fra"

result=$(container_name "backend" "DEU")
assert_eq "dive-spoke-deu-backend" "$result" "container_name: DEU maps to dive-spoke-deu"

# Explicit prefix override
CONTAINER_PREFIX="custom-prefix"
result=$(container_name "redis")
assert_eq "custom-prefix-redis" "$result" "container_name: explicit prefix override"
CONTAINER_PREFIX=""

# Pilot environment
ENVIRONMENT="pilot"
result=$(container_name "backend")
assert_eq "dive-pilot-backend" "$result" "container_name: pilot environment prefix"
ENVIRONMENT="local"

# ─── is_production_mode() ────────────────────────────────────────────────────

DIVE_ENV="local"
unset KUBERNETES_SERVICE_HOST
if is_production_mode; then
    assert_eq "false" "true" "is_production_mode: local should be false"
else
    assert_eq "not-production" "not-production" "is_production_mode: local returns false"
fi

DIVE_ENV="production"
if is_production_mode; then
    assert_eq "production" "production" "is_production_mode: production returns true"
else
    assert_eq "true" "false" "is_production_mode: production should be true"
fi
DIVE_ENV="local"

# ─── _vault_get_profile() ────────────────────────────────────────────────────

DIVE_ENV="dev"
assert_eq "vault-dev" "$(_vault_get_profile)" "vault_get_profile: dev returns vault-dev"

DIVE_ENV="development"
assert_eq "vault-dev" "$(_vault_get_profile)" "vault_get_profile: development returns vault-dev"

DIVE_ENV="staging"
assert_eq "vault-ha" "$(_vault_get_profile)" "vault_get_profile: staging returns vault-ha"

DIVE_ENV="production"
assert_eq "vault-ha" "$(_vault_get_profile)" "vault_get_profile: production returns vault-ha"

DIVE_ENV="local"
assert_eq "vault-ha" "$(_vault_get_profile)" "vault_get_profile: local returns vault-ha"

# ─── _vault_is_dev_mode() ────────────────────────────────────────────────────

DIVE_ENV="dev"
if _vault_is_dev_mode; then
    assert_eq "dev" "dev" "vault_is_dev_mode: dev returns true"
else
    assert_eq "true" "false" "vault_is_dev_mode: dev should be true"
fi

DIVE_ENV="production"
if _vault_is_dev_mode; then
    assert_eq "false" "true" "vault_is_dev_mode: production should be false"
else
    assert_eq "not-dev" "not-dev" "vault_is_dev_mode: production returns false"
fi
DIVE_ENV="local"

# ─── json_get_field() ────────────────────────────────────────────────────────

# Create temp JSON file for testing
TEST_JSON=$(mktemp)
cat > "$TEST_JSON" << 'TESTJSON'
{
    "hubUrl": "https://hub.dive25.com",
    "version": "3.0.0",
    "endpoints": {
        "baseUrl": "https://localhost:3000",
        "apiUrl": "https://localhost:4000"
    },
    "enabled": true
}
TESTJSON

assert_eq "https://hub.dive25.com" "$(json_get_field "$TEST_JSON" "hubUrl")" "json_get_field: top-level string"
assert_eq "3.0.0" "$(json_get_field "$TEST_JSON" "version")" "json_get_field: version field"
assert_eq "true" "$(json_get_field "$TEST_JSON" "enabled")" "json_get_field: boolean field"
assert_eq "https://localhost:3000" "$(json_get_field "$TEST_JSON" "endpoints.baseUrl")" "json_get_field: nested field"
assert_eq "default-val" "$(json_get_field "$TEST_JSON" "nonExistent" "default-val")" "json_get_field: missing field returns default"
assert_eq "fallback" "$(json_get_field "/nonexistent/file.json" "key" "fallback")" "json_get_field: missing file returns default"

rm -f "$TEST_JSON"

# Cleanup: remove docker stub so subsequent test suites get real docker
unset -f docker 2>/dev/null || true
