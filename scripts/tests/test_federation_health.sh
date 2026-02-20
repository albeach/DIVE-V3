#!/usr/bin/env bash
# =============================================================================
# Tests for Federation Health Dashboard & Diagnostics (Phase 7)
# =============================================================================
# Tests: dashboard output format, diagnose command structure, help text,
#        mode detection, domain display, external spoke health probes.
# Pure function tests — no Docker, no network, no external dependencies.
# =============================================================================

export DIVE_ROOT="$PROJECT_ROOT"
export ENVIRONMENT="${ENVIRONMENT:-local}"
export INSTANCE="${INSTANCE:-usa}"
export DRY_RUN="${DRY_RUN:-false}"
export QUIET="${QUIET:-true}"

# Stub docker
docker() {
    if [ "$1" = "ps" ]; then
        echo ""
        return 0
    fi
    return 1
}
export -f docker

source "$PROJECT_ROOT/scripts/dive-modules/common.sh" 2>/dev/null || true
source "$PROJECT_ROOT/scripts/dive-modules/federation/setup.sh" 2>/dev/null || true
source "$PROJECT_ROOT/scripts/dive-modules/federation/health.sh" 2>/dev/null || true

# =============================================================================
# Help text includes new commands
# =============================================================================

(
    if type module_federation &>/dev/null; then
        help_output=$(module_federation help 2>&1)
        assert_contains "$help_output" "diagnose" "help: includes diagnose command"
        assert_contains "$help_output" "dashboard" "help: includes dashboard command"
        assert_contains "$help_output" "Deep diagnostic" "help: diagnose has description"
    else
        assert_eq "ok" "ok" "module_federation not available (skipped)"
    fi
)

# =============================================================================
# federation_health_dashboard function existence
# =============================================================================

(
    if type federation_health_dashboard &>/dev/null; then
        assert_eq "ok" "ok" "dashboard: function exists"
    else
        assert_eq "exists" "missing" "dashboard: function should exist"
    fi
)

(
    if type federation_diagnose &>/dev/null; then
        assert_eq "ok" "ok" "diagnose: function exists"
    else
        assert_eq "exists" "missing" "diagnose: function should exist"
    fi
)

# =============================================================================
# Dashboard output format
# =============================================================================

(
    if type federation_health_dashboard &>/dev/null; then
        # Stub keycloak_admin_api to return empty list
        keycloak_admin_api() { echo "[]"; }
        export -f keycloak_admin_api
        orch_db_check_connection() { return 1; }
        export -f orch_db_check_connection

        output=$(federation_health_dashboard 2>/dev/null || true)
        assert_contains "$output" "Federation Health Dashboard" "dashboard: contains title"
        assert_contains "$output" "SPOKE" "dashboard: contains SPOKE column header"
        assert_contains "$output" "STATUS" "dashboard: contains STATUS column header"
        assert_contains "$output" "MODE" "dashboard: contains MODE column header"
        assert_contains "$output" "DOMAIN" "dashboard: contains DOMAIN column header"
    else
        assert_eq "ok" "ok" "federation_health_dashboard not available (skipped)"
    fi
)

# =============================================================================
# Dashboard shows timestamp
# =============================================================================

(
    if type federation_health_dashboard &>/dev/null; then
        keycloak_admin_api() { echo "[]"; }
        export -f keycloak_admin_api
        orch_db_check_connection() { return 1; }
        export -f orch_db_check_connection

        output=$(federation_health_dashboard 2>/dev/null || true)
        assert_contains "$output" "Timestamp:" "dashboard: shows timestamp"
    fi
)

# =============================================================================
# Dashboard shows total count
# =============================================================================

(
    if type federation_health_dashboard &>/dev/null; then
        keycloak_admin_api() { echo "[]"; }
        export -f keycloak_admin_api
        orch_db_check_connection() { return 1; }
        export -f orch_db_check_connection

        output=$(federation_health_dashboard 2>/dev/null || true)
        assert_contains "$output" "Total federated spokes:" "dashboard: shows total count"
    fi
)

# =============================================================================
# Dashboard handles no federation links gracefully
# =============================================================================

(
    if type federation_health_dashboard &>/dev/null; then
        keycloak_admin_api() { echo "[]"; }
        export -f keycloak_admin_api
        orch_db_check_connection() { return 1; }
        export -f orch_db_check_connection

        output=$(federation_health_dashboard 2>/dev/null || true)
        assert_contains "$output" "No federation links" "dashboard: shows 'no links' when empty"
    fi
)

# =============================================================================
# Diagnose output format
# =============================================================================

(
    if type federation_diagnose &>/dev/null; then
        # Stub all external calls
        keycloak_admin_api() { echo ""; }
        export -f keycloak_admin_api
        keycloak_admin_api_available() { return 1; }
        export -f keycloak_admin_api_available
        curl() { echo ""; return 1; }
        export -f curl

        output=$(federation_diagnose "GBR" 2>/dev/null || true)
        assert_contains "$output" "Federation Diagnostic: GBR" "diagnose: contains title"
        assert_contains "$output" "Mode:" "diagnose: shows mode"
        assert_contains "$output" "Results:" "diagnose: shows results summary"
    else
        assert_eq "ok" "ok" "federation_diagnose not available (skipped)"
    fi
)

# =============================================================================
# Diagnose detects external mode with custom domain
# =============================================================================

(
    if type federation_diagnose &>/dev/null; then
        export SPOKE_GBR_DOMAIN="gbr.mod.uk"
        keycloak_admin_api() { echo ""; }
        export -f keycloak_admin_api
        keycloak_admin_api_available() { return 1; }
        export -f keycloak_admin_api_available
        curl() { echo ""; return 1; }
        export -f curl

        output=$(federation_diagnose "GBR" 2>/dev/null || true)
        assert_contains "$output" "external" "diagnose: detects external mode"
        assert_contains "$output" "gbr.mod.uk" "diagnose: shows custom domain"
        unset SPOKE_GBR_DOMAIN
    else
        assert_eq "ok" "ok" "federation_diagnose not available (skipped)"
    fi
)

# =============================================================================
# Diagnose includes DNS check for external spokes
# =============================================================================

(
    if type federation_diagnose &>/dev/null; then
        export SPOKE_FRA_DOMAIN="fra.defense.gouv.fr"
        keycloak_admin_api() { echo ""; }
        export -f keycloak_admin_api
        keycloak_admin_api_available() { return 1; }
        export -f keycloak_admin_api_available
        curl() { echo ""; return 1; }
        export -f curl
        dig() { echo ""; }
        export -f dig

        output=$(federation_diagnose "FRA" 2>/dev/null || true)
        assert_contains "$output" "DNS" "diagnose: includes DNS check for external spoke"
        assert_contains "$output" "TLS" "diagnose: includes TLS check for external spoke"
        unset SPOKE_FRA_DOMAIN
    else
        assert_eq "ok" "ok" "federation_diagnose not available (skipped)"
    fi
)

# =============================================================================
# Diagnose includes OIDC discovery check
# =============================================================================

(
    if type federation_diagnose &>/dev/null; then
        keycloak_admin_api() { echo ""; }
        export -f keycloak_admin_api
        keycloak_admin_api_available() { return 1; }
        export -f keycloak_admin_api_available
        curl() { echo ""; return 1; }
        export -f curl

        output=$(federation_diagnose "DEU" 2>/dev/null || true)
        assert_contains "$output" "OIDC" "diagnose: includes OIDC discovery check"
    else
        assert_eq "ok" "ok" "federation_diagnose not available (skipped)"
    fi
)

# =============================================================================
# Diagnose includes Hub IdP and Spoke IdP checks
# =============================================================================

(
    if type federation_diagnose &>/dev/null; then
        keycloak_admin_api() { echo ""; }
        export -f keycloak_admin_api
        keycloak_admin_api_available() { return 1; }
        export -f keycloak_admin_api_available
        curl() { echo ""; return 1; }
        export -f curl

        output=$(federation_diagnose "NZL" 2>/dev/null || true)
        assert_contains "$output" "Hub IdP on Spoke" "diagnose: checks Hub IdP on Spoke"
        assert_contains "$output" "Spoke IdP on Hub" "diagnose: checks Spoke IdP on Hub"
    else
        assert_eq "ok" "ok" "federation_diagnose not available (skipped)"
    fi
)

# =============================================================================
# Diagnose includes Policy Sync check
# =============================================================================

(
    if type federation_diagnose &>/dev/null; then
        keycloak_admin_api() { echo ""; }
        export -f keycloak_admin_api
        keycloak_admin_api_available() { return 1; }
        export -f keycloak_admin_api_available
        curl() { echo ""; return 1; }
        export -f curl

        output=$(federation_diagnose "CAN" 2>/dev/null || true)
        assert_contains "$output" "Policy Sync" "diagnose: includes Policy Sync check"
    else
        assert_eq "ok" "ok" "federation_diagnose not available (skipped)"
    fi
)
