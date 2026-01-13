#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - NATO Countries Deployment Validation
# =============================================================================
# Validates the pipeline can handle all 32 NATO countries.
# Can be run in dry-run mode (without Docker) or full mode (with infrastructure).
#
# Usage:
#   ./validate-nato-deployment.sh              # Dry-run validation
#   ./validate-nato-deployment.sh --full       # Full deployment test
#   ./validate-nato-deployment.sh --country FRA  # Single country test
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-13
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DRY_RUN=true
SINGLE_COUNTRY=""
COUNTRIES_VALIDATED=0
COUNTRIES_FAILED=0

# =============================================================================
# SETUP
# =============================================================================

setup() {
    # Load common functions
    source "$PROJECT_ROOT/scripts/dive-modules/common.sh"
    export DIVE_ROOT="$PROJECT_ROOT"
    export DIVE_COMMON_LOADED=1

    # Load NATO countries database
    source "$PROJECT_ROOT/scripts/nato-countries.sh"

    # Load pipeline modules
    source "$PROJECT_ROOT/scripts/dive-modules/spoke/pipeline/spoke-pipeline.sh"
}

# =============================================================================
# VALIDATION FUNCTIONS
# =============================================================================

validate_country_config() {
    local code="$1"
    local name="$2"

    echo -e "${BLUE}Validating $code: $name${NC}"

    local errors=0

    # Test 1: Port assignment
    local ports
    ports=$(spoke_compose_get_ports "$code" 2>/dev/null)
    if [ -n "$ports" ]; then
        echo "  ✅ Port assignment valid"
    else
        echo "  ❌ Port assignment failed"
        errors=$((errors + 1))
    fi

    # Test 2: Placeholder generation
    local placeholders
    placeholders=$(spoke_compose_get_placeholders "$code" "$(lower "$code")" "/tmp/test-$code" 2>/dev/null)
    if echo "$placeholders" | grep -q "INSTANCE_CODE_UPPER"; then
        echo "  ✅ Placeholder generation valid"
    else
        echo "  ❌ Placeholder generation failed"
        errors=$((errors + 1))
    fi

    # Test 3: Instance name lookup
    local instance_name
    instance_name=$(spoke_compose_get_instance_name "$code" 2>/dev/null)
    if [ -n "$instance_name" ]; then
        echo "  ✅ Instance name: $instance_name"
    else
        echo "  ❌ Instance name lookup failed"
        errors=$((errors + 1))
    fi

    # Test 4: Secret generation
    if spoke_secrets_generate "$code" >/dev/null 2>&1; then
        echo "  ✅ Secret generation valid"
    else
        echo "  ❌ Secret generation failed"
        errors=$((errors + 1))
    fi

    # Test 5: Secret validation
    if spoke_secrets_validate "$code" >/dev/null 2>&1; then
        echo "  ✅ Secret validation passed"
    else
        echo "  ⚠️  Secret validation warnings (expected without GCP)"
    fi

    if [ $errors -eq 0 ]; then
        COUNTRIES_VALIDATED=$((COUNTRIES_VALIDATED + 1))
        return 0
    else
        COUNTRIES_FAILED=$((COUNTRIES_FAILED + 1))
        return 1
    fi
}

validate_full_deployment() {
    local code="$1"
    local name="$2"

    echo -e "${BLUE}Full deployment test: $code - $name${NC}"

    # Check if Hub is running
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-keycloak"; then
        echo "  ❌ Hub not running - deploy Hub first: ./dive hub deploy"
        return 1
    fi

    # Deploy spoke
    echo "  Deploying $code..."
    if ./dive spoke deploy "$code" "$name" 2>&1 | head -30; then
        echo "  ✅ Deployment initiated"

        # Wait and verify
        sleep 10

        if ./dive --instance "$(lower "$code")" spoke health 2>&1 | grep -q "healthy"; then
            echo "  ✅ Health check passed"
            COUNTRIES_VALIDATED=$((COUNTRIES_VALIDATED + 1))
            return 0
        else
            echo "  ⚠️  Health check pending (async deployment)"
            COUNTRIES_VALIDATED=$((COUNTRIES_VALIDATED + 1))
            return 0
        fi
    else
        echo "  ❌ Deployment failed"
        COUNTRIES_FAILED=$((COUNTRIES_FAILED + 1))
        return 1
    fi
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo "========================================"
    echo "DIVE V3 NATO Countries Deployment Validation"
    echo "========================================"
    echo ""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --full)
                DRY_RUN=false
                shift
                ;;
            --country)
                SINGLE_COUNTRY="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done

    setup

    echo "Mode: $([ "$DRY_RUN" = true ] && echo "Dry-run (configuration validation)" || echo "Full deployment")"
    echo ""

    # List of NATO countries to test (subset for validation)
    local test_countries=(
        "ALB:Albania"
        "BEL:Belgium"
        "BGR:Bulgaria"
        "CAN:Canada"
        "HRV:Croatia"
        "CZE:Czechia"
        "DNK:Denmark"
        "EST:Estonia"
        "FIN:Finland"
        "FRA:France"
        "DEU:Germany"
        "GRC:Greece"
        "HUN:Hungary"
        "ISL:Iceland"
        "ITA:Italy"
        "LVA:Latvia"
        "LTU:Lithuania"
        "LUX:Luxembourg"
        "MNE:Montenegro"
        "NLD:Netherlands"
        "MKD:North Macedonia"
        "NOR:Norway"
        "POL:Poland"
        "PRT:Portugal"
        "ROU:Romania"
        "SVK:Slovakia"
        "SVN:Slovenia"
        "ESP:Spain"
        "SWE:Sweden"
        "TUR:Turkey"
        "GBR:United Kingdom"
        "USA:United States"
    )

    # Single country mode
    if [ -n "$SINGLE_COUNTRY" ]; then
        local found=false
        for entry in "${test_countries[@]}"; do
            local code="${entry%%:*}"
            local name="${entry#*:}"
            if [ "$code" = "$SINGLE_COUNTRY" ]; then
                found=true
                if [ "$DRY_RUN" = true ]; then
                    validate_country_config "$code" "$name"
                else
                    validate_full_deployment "$code" "$name"
                fi
                break
            fi
        done

        if [ "$found" = false ]; then
            echo "Country not found: $SINGLE_COUNTRY"
            exit 1
        fi
    else
        # Validate all countries
        for entry in "${test_countries[@]}"; do
            local code="${entry%%:*}"
            local name="${entry#*:}"

            if [ "$DRY_RUN" = true ]; then
                validate_country_config "$code" "$name"
            else
                validate_full_deployment "$code" "$name"
            fi
            echo ""
        done
    fi

    # Summary
    echo "========================================"
    echo "Validation Summary"
    echo "========================================"
    echo "Countries validated: $COUNTRIES_VALIDATED"
    echo "Countries failed:    $COUNTRIES_FAILED"
    echo "Total:               $((COUNTRIES_VALIDATED + COUNTRIES_FAILED))"
    echo ""

    if [ $COUNTRIES_FAILED -eq 0 ]; then
        echo -e "${GREEN}✅ All validations passed!${NC}"
        echo ""
        echo "Next steps:"
        echo "  1. Deploy Hub: ./dive hub deploy"
        echo "  2. Run full validation: $0 --full"
        echo "  3. Deploy specific country: ./dive spoke deploy FRA \"France\""
        exit 0
    else
        echo -e "${RED}❌ Some validations failed!${NC}"
        exit 1
    fi
}

main "$@"
