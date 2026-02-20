#!/usr/bin/env bash
# =============================================================================
# Tests for URL Resolution & Keycloak API Abstraction (Phase 1)
# =============================================================================
# Tests: resolve_spoke_internal_url, resolve_hub_internal_url,
#        resolve_keycloak_admin_url, is_spoke_local
# Pure function tests — no Docker, no network, no external dependencies.
# =============================================================================

# Source common.sh with stubs for Docker-dependent functions
export DIVE_ROOT="$PROJECT_ROOT"
export ENVIRONMENT="${ENVIRONMENT:-local}"
export INSTANCE="${INSTANCE:-usa}"
export DRY_RUN="${DRY_RUN:-false}"
export QUIET="${QUIET:-true}"

# Stub docker to avoid errors during source
docker() {
    # Simulate: docker ps --format ... returns nothing (no containers)
    if [ "$1" = "ps" ]; then
        echo ""
        return 0
    fi
    return 1
}
export -f docker

source "$PROJECT_ROOT/scripts/dive-modules/common.sh" 2>/dev/null || true

# =============================================================================
# is_spoke_local() tests
# =============================================================================

# USA is always local
(
    result=$(is_spoke_local "USA" && echo "true" || echo "false")
    assert_eq "true" "$result" "is_spoke_local: USA is always local"
)

# Spoke with SPOKE_CUSTOM_DOMAIN set → external
(
    export SPOKE_CUSTOM_DOMAIN="gbr.mod.uk"
    result=$(is_spoke_local "GBR" && echo "true" || echo "false")
    assert_eq "false" "$result" "is_spoke_local: GBR with SPOKE_CUSTOM_DOMAIN is external"
    unset SPOKE_CUSTOM_DOMAIN
)

# Spoke with per-spoke domain → external
(
    export SPOKE_GBR_DOMAIN="gbr.mod.uk"
    result=$(is_spoke_local "GBR" && echo "true" || echo "false")
    assert_eq "false" "$result" "is_spoke_local: GBR with SPOKE_GBR_DOMAIN is external"
    unset SPOKE_GBR_DOMAIN
)

# Spoke with explicit external marker
(
    export SPOKE_FRA_EXTERNAL="true"
    result=$(is_spoke_local "FRA" && echo "true" || echo "false")
    assert_eq "false" "$result" "is_spoke_local: FRA with SPOKE_FRA_EXTERNAL=true is external"
    unset SPOKE_FRA_EXTERNAL
)

# Spoke with no markers and no container → external (no docker container found)
(
    result=$(is_spoke_local "DEU" && echo "true" || echo "false")
    assert_eq "false" "$result" "is_spoke_local: DEU with no container is external"
)

# =============================================================================
# resolve_spoke_internal_url() tests
# =============================================================================

# Priority 1: Explicit per-spoke override
(
    export SPOKE_GBR_INTERNAL_IDP_URL="https://keycloak-internal.gbr.mod.uk"
    result=$(resolve_spoke_internal_url "GBR" "idp")
    assert_eq "https://keycloak-internal.gbr.mod.uk" "$result" "resolve_spoke_internal_url: explicit override takes priority"
    unset SPOKE_GBR_INTERNAL_IDP_URL
)

# Priority 1: API service override
(
    export SPOKE_FRA_INTERNAL_API_URL="https://api-internal.fra.mil.fr"
    result=$(resolve_spoke_internal_url "FRA" "api")
    assert_eq "https://api-internal.fra.mil.fr" "$result" "resolve_spoke_internal_url: API override for FRA"
    unset SPOKE_FRA_INTERNAL_API_URL
)

# Priority 2: Per-spoke custom domain
(
    export SPOKE_GBR_DOMAIN="gbr.mod.uk"
    result=$(resolve_spoke_internal_url "GBR" "idp")
    assert_eq "https://idp.gbr.mod.uk" "$result" "resolve_spoke_internal_url: per-spoke domain → idp.{domain}"
    unset SPOKE_GBR_DOMAIN
)

(
    export SPOKE_GBR_DOMAIN="gbr.mod.uk"
    result=$(resolve_spoke_internal_url "GBR" "api")
    assert_eq "https://api.gbr.mod.uk" "$result" "resolve_spoke_internal_url: per-spoke domain → api.{domain}"
    unset SPOKE_GBR_DOMAIN
)

# Priority 3: Active session SPOKE_CUSTOM_DOMAIN
(
    export SPOKE_CUSTOM_DOMAIN="test.example.com"
    result=$(resolve_spoke_internal_url "GBR" "idp")
    assert_eq "https://idp.test.example.com" "$result" "resolve_spoke_internal_url: SPOKE_CUSTOM_DOMAIN → idp.{domain}"
    unset SPOKE_CUSTOM_DOMAIN
)

# Priority 5: Co-located Docker container hostname (no overrides, USA always local)
# Note: We test this by ensuring no external markers are set for USA
(
    unset SPOKE_CUSTOM_DOMAIN
    unset SPOKE_USA_DOMAIN
    unset SPOKE_USA_EXTERNAL
    # For USA, is_spoke_local returns true, so we get container hostname
    result=$(resolve_spoke_internal_url "USA" "idp")
    assert_eq "https://dive-spoke-usa-keycloak:8443" "$result" "resolve_spoke_internal_url: co-located fallback uses container hostname"
)

# Priority 4: External spoke without custom domain — falls through to resolve_spoke_public_url
(
    unset SPOKE_CUSTOM_DOMAIN
    unset SPOKE_GBR_DOMAIN
    # GBR has no container (docker stub returns nothing), so is_spoke_local returns false
    # resolve_spoke_public_url with no DIVE_DOMAIN_SUFFIX and no HUB_EXTERNAL_ADDRESS → localhost
    unset DIVE_DOMAIN_SUFFIX
    unset HUB_EXTERNAL_ADDRESS
    result=$(resolve_spoke_internal_url "GBR" "idp")
    assert_contains "$result" "https://" "resolve_spoke_internal_url: external spoke returns HTTPS URL"
)

# =============================================================================
# resolve_hub_internal_url() tests
# =============================================================================

# Priority 1: Explicit override
(
    export HUB_INTERNAL_IDP_URL="https://hub-keycloak-internal.dive25.com"
    result=$(resolve_hub_internal_url "idp")
    assert_eq "https://hub-keycloak-internal.dive25.com" "$result" "resolve_hub_internal_url: explicit override takes priority"
    unset HUB_INTERNAL_IDP_URL
)

(
    export HUB_INTERNAL_API_URL="https://hub-api-internal.dive25.com"
    result=$(resolve_hub_internal_url "api")
    assert_eq "https://hub-api-internal.dive25.com" "$result" "resolve_hub_internal_url: API override"
    unset HUB_INTERNAL_API_URL
)

# Priority 2: DIVE_DOMAIN_SUFFIX uses public URL
(
    export DIVE_DOMAIN_SUFFIX="dev.dive25.com"
    unset HUB_INTERNAL_IDP_URL
    result=$(resolve_hub_internal_url "idp")
    assert_eq "https://dev-usa-idp.dive25.com" "$result" "resolve_hub_internal_url: domain suffix → public URL"
    unset DIVE_DOMAIN_SUFFIX
)

# Priority 2: HUB_EXTERNAL_ADDRESS uses public URL
(
    export HUB_EXTERNAL_ADDRESS="182.30.104.73"
    unset HUB_INTERNAL_IDP_URL
    unset DIVE_DOMAIN_SUFFIX
    result=$(resolve_hub_internal_url "idp")
    assert_eq "https://182.30.104.73:8443" "$result" "resolve_hub_internal_url: external address → public URL"
    unset HUB_EXTERNAL_ADDRESS
)

# Priority 3: Co-located Docker container hostname (no domain suffix, no external)
(
    unset HUB_INTERNAL_IDP_URL
    unset DIVE_DOMAIN_SUFFIX
    unset HUB_EXTERNAL_ADDRESS
    result=$(resolve_hub_internal_url "idp")
    assert_eq "https://dive-hub-keycloak:8443" "$result" "resolve_hub_internal_url: co-located fallback"
)

# Service port mapping
(
    unset HUB_INTERNAL_API_URL
    unset DIVE_DOMAIN_SUFFIX
    unset HUB_EXTERNAL_ADDRESS
    result=$(resolve_hub_internal_url "api")
    assert_eq "https://dive-hub-keycloak:4000" "$result" "resolve_hub_internal_url: api port is 4000"
)

(
    unset HUB_INTERNAL_OPAL_URL
    unset DIVE_DOMAIN_SUFFIX
    unset HUB_EXTERNAL_ADDRESS
    result=$(resolve_hub_internal_url "opal")
    assert_eq "https://dive-hub-keycloak:7002" "$result" "resolve_hub_internal_url: opal port is 7002"
)

# =============================================================================
# resolve_keycloak_admin_url() tests
# =============================================================================

# USA (hub) is always local when no external markers
(
    unset HUB_EXTERNAL_ADDRESS
    unset DIVE_DOMAIN_SUFFIX
    result=$(resolve_keycloak_admin_url "USA")
    assert_eq "local://dive-hub-keycloak" "$result" "resolve_keycloak_admin_url: USA returns local:// prefix"
)

# USA with custom container name
(
    export HUB_KEYCLOAK_CONTAINER="my-custom-keycloak"
    result=$(resolve_keycloak_admin_url "USA")
    assert_eq "local://my-custom-keycloak" "$result" "resolve_keycloak_admin_url: USA respects HUB_KEYCLOAK_CONTAINER"
    unset HUB_KEYCLOAK_CONTAINER
)

# External spoke returns public URL (no local:// prefix)
(
    export SPOKE_GBR_DOMAIN="gbr.mod.uk"
    result=$(resolve_keycloak_admin_url "GBR")
    assert_eq "https://idp.gbr.mod.uk" "$result" "resolve_keycloak_admin_url: external GBR returns public URL"
    unset SPOKE_GBR_DOMAIN
)

# External spoke via DIVE_DOMAIN_SUFFIX
(
    export SPOKE_FRA_EXTERNAL="true"
    export DIVE_DOMAIN_SUFFIX="dev.dive25.com"
    result=$(resolve_keycloak_admin_url "FRA")
    assert_eq "https://dev-fra-idp.dive25.com" "$result" "resolve_keycloak_admin_url: external FRA via domain suffix"
    unset SPOKE_FRA_EXTERNAL
    unset DIVE_DOMAIN_SUFFIX
)

# =============================================================================
# Integration: URL resolution consistency
# =============================================================================

# Ensure internal URL matches public URL pattern for external spokes with domain suffix
(
    export SPOKE_GBR_DOMAIN="gbr.mod.uk"
    internal=$(resolve_spoke_internal_url "GBR" "idp")
    public=$(resolve_spoke_public_url "GBR" "idp")
    # Internal should use custom domain, public may use DIVE_DOMAIN_SUFFIX
    assert_eq "https://idp.gbr.mod.uk" "$internal" "integration: internal URL uses custom domain"
    unset SPOKE_GBR_DOMAIN
)

# Verify dual-URL strategy: public != internal for co-located spokes
(
    unset SPOKE_CUSTOM_DOMAIN
    unset SPOKE_USA_DOMAIN
    unset DIVE_DOMAIN_SUFFIX
    unset HUB_EXTERNAL_ADDRESS
    # Hub internal should be container hostname in pure local mode
    hub_internal=$(resolve_hub_internal_url "idp")
    hub_public=$(resolve_hub_public_url "idp")
    # In pure local mode both resolve to different things potentially
    assert_contains "$hub_internal" "dive-hub-keycloak" "integration: hub internal is container hostname in local mode"
    assert_contains "$hub_public" "localhost" "integration: hub public is localhost in local mode"
)
