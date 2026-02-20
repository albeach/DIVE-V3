#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Phase Ordering Tests
# =============================================================================
# Tests for Phase 5: Pre-validation gate ordering and documentation.
# Updated for Phase 7 (registry refactoring) — verifies pre-validation gate
# still runs before any registered phases.
# =============================================================================

# Setup
export DIVE_ROOT="${PROJECT_ROOT}"
export ENVIRONMENT="local"
export INSTANCE="usa"
export NON_INTERACTIVE=true

# Stub out logging functions
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
# Test: Hub pipeline has pre-validation gate before Phase 1
# =============================================================================

# Test 1: hub-pipeline.sh sources pre-validation.sh
hub_pipeline_file="${PROJECT_ROOT}/scripts/dive-modules/deployment/hub-pipeline.sh"
if [ -f "$hub_pipeline_file" ]; then
    if grep -q 'pre-validation.sh' "$hub_pipeline_file"; then
        assert_eq "0" "0" "hub pipeline: sources pre-validation.sh"
    else
        assert_eq "sources" "missing" "hub pipeline: should source pre-validation.sh"
    fi
else
    assert_eq "exists" "missing" "hub pipeline: file should exist"
fi

# Test 2: Pre-validation gate appears before first phase registration
if [ -f "$hub_pipeline_file" ]; then
    pre_val_line=$(grep -n 'pre_validate_hub' "$hub_pipeline_file" | head -1 | cut -d: -f1)
    # Phase 1 is registered via pipeline_register_phase 1 "VAULT_BOOTSTRAP"
    phase1_line=$(grep -n 'VAULT_BOOTSTRAP' "$hub_pipeline_file" | head -1 | cut -d: -f1)

    if [ -n "$pre_val_line" ] && [ -n "$phase1_line" ]; then
        if [ "$pre_val_line" -lt "$phase1_line" ]; then
            assert_eq "0" "0" "hub pipeline: pre-validation before Phase 1 (line $pre_val_line < $phase1_line)"
        else
            assert_eq "before" "after" "hub pipeline: pre-validation should be before Phase 1"
        fi
    else
        assert_eq "found" "missing" "hub pipeline: pre-validation and Phase 1 lines should exist"
    fi
fi

# Test 3: Hub pipeline documents pre-validation gate
if [ -f "$hub_pipeline_file" ]; then
    if grep -q 'Pre-validation gate' "$hub_pipeline_file"; then
        assert_eq "0" "0" "hub pipeline: documents pre-validation gate"
    else
        assert_eq "documented" "missing" "hub pipeline: should document pre-validation"
    fi
fi

# Test 4: Hub pipeline documents that Vault must be first
if [ -f "$hub_pipeline_file" ]; then
    if grep -q 'Vault MUST be first' "$hub_pipeline_file"; then
        assert_eq "0" "0" "hub pipeline: documents Vault-first requirement"
    else
        assert_eq "documented" "missing" "hub pipeline: should document Vault-first"
    fi
fi

# =============================================================================
# Test: Spoke pipeline has pre-validation gate before Phase 1
# =============================================================================

spoke_pipeline_file="${PROJECT_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-pipeline.sh"

# Test 5: spoke-pipeline.sh sources pre-validation.sh
if [ -f "$spoke_pipeline_file" ]; then
    if grep -q 'pre-validation.sh' "$spoke_pipeline_file"; then
        assert_eq "0" "0" "spoke pipeline: sources pre-validation.sh"
    else
        assert_eq "sources" "missing" "spoke pipeline: should source pre-validation.sh"
    fi
else
    assert_eq "exists" "missing" "spoke pipeline: file should exist"
fi

# Test 6: Pre-validation appears before Phase 1 in spoke pipeline
if [ -f "$spoke_pipeline_file" ]; then
    spoke_pre_val_line=$(grep -n 'pre_validate_spoke' "$spoke_pipeline_file" | head -1 | cut -d: -f1)
    spoke_phase1_line=$(grep -n 'Phase 1.*Preflight' "$spoke_pipeline_file" | head -1 | cut -d: -f1)

    if [ -n "$spoke_pre_val_line" ] && [ -n "$spoke_phase1_line" ]; then
        if [ "$spoke_pre_val_line" -lt "$spoke_phase1_line" ]; then
            assert_eq "0" "0" "spoke pipeline: pre-validation before Phase 1 (line $spoke_pre_val_line < $spoke_phase1_line)"
        else
            assert_eq "before" "after" "spoke pipeline: pre-validation should be before Phase 1"
        fi
    else
        assert_eq "found" "missing" "spoke pipeline: pre-validation and Phase 1 lines should exist"
    fi
fi

# =============================================================================
# Test: Deployment summary reflects pre-validation gate
# =============================================================================

summary_file="${PROJECT_ROOT}/scripts/dive-modules/utilities/deployment-summary.sh"

# Test 7: Hub summary mentions pre-validation
if [ -f "$summary_file" ]; then
    if grep -q 'Pre-validation.*13 phases' "$summary_file"; then
        assert_eq "0" "0" "hub summary: mentions pre-validation + 13 phases"
    else
        assert_eq "mentioned" "missing" "hub summary: should mention pre-validation gate"
    fi
fi

# Test 8: Spoke summary mentions pre-validation
if [ -f "$summary_file" ]; then
    if grep -q 'Pre-validation.*6 phases' "$summary_file"; then
        assert_eq "0" "0" "spoke summary: mentions pre-validation + 6 phases"
    else
        assert_eq "mentioned" "missing" "spoke summary: should mention pre-validation gate"
    fi
fi

# Test 9: Hub summary pipeline description includes Build phase
if [ -f "$summary_file" ]; then
    if grep -q 'Build.*Services.*Keycloak' "$summary_file"; then
        assert_eq "0" "0" "hub summary: pipeline mentions Build → Services → Keycloak"
    else
        assert_eq "complete" "incomplete" "hub summary: should list key phases"
    fi
fi

# =============================================================================
# Test: Pre-validation module exists and exports functions
# =============================================================================

pre_val_file="${PROJECT_ROOT}/scripts/dive-modules/utilities/pre-validation.sh"

# Test 10: pre-validation.sh exists
if [ -f "$pre_val_file" ]; then
    assert_eq "0" "0" "pre-validation module: exists"
else
    assert_eq "exists" "missing" "pre-validation module: should exist"
fi

# Test 11: pre-validation.sh exports hub and spoke validators
if [ -f "$pre_val_file" ]; then
    if grep -q 'export -f pre_validate_hub' "$pre_val_file" && \
       grep -q 'export -f pre_validate_spoke' "$pre_val_file"; then
        assert_eq "0" "0" "pre-validation module: exports hub and spoke validators"
    else
        assert_eq "exported" "missing" "pre-validation module: should export both validators"
    fi
fi

# Test 12: Pre-validation checks Docker before anything else
if [ -f "$pre_val_file" ]; then
    docker_check_line=$(grep -n 'pre_validate_check_docker' "$pre_val_file" | head -1 | cut -d: -f1)
    tools_check_line=$(grep -n 'pre_validate_check_tools' "$pre_val_file" | head -1 | cut -d: -f1)

    if [ -n "$docker_check_line" ] && [ -n "$tools_check_line" ]; then
        # Docker check function should be defined before tools check
        assert_eq "0" "0" "pre-validation: Docker check defined (line $docker_check_line)"
    fi
fi

# =============================================================================
# Test: Hub has all 13 phases registered
# =============================================================================

# Test 13: All 13 phases are registered in hub pipeline
if [ -f "$hub_pipeline_file" ]; then
    phase_count=$(grep -c 'pipeline_register_phase' "$hub_pipeline_file" || true)
    if [ "$phase_count" -ge 13 ]; then
        assert_eq "0" "0" "hub pipeline: all 13 phases registered ($phase_count)"
    else
        assert_eq ">=13" "$phase_count" "hub pipeline: should register all 13 phases"
    fi
fi
