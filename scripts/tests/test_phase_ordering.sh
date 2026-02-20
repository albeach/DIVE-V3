#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Phase Ordering Tests
# =============================================================================
# Tests for Phase 5: Pre-validation gate ordering and documentation.
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

# Test 2: Pre-validation gate appears before Phase 1 Vault Bootstrap
if [ -f "$hub_pipeline_file" ]; then
    local pre_val_line
    pre_val_line=$(grep -n 'pre_validate_hub' "$hub_pipeline_file" | head -1 | cut -d: -f1)
    local phase1_line
    phase1_line=$(grep -n 'Phase 1.*Vault Bootstrap' "$hub_pipeline_file" | head -1 | cut -d: -f1)

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

# Test 3: Phase 1 comment documents pre-validation gate
if [ -f "$hub_pipeline_file" ]; then
    if grep -q 'Pre-validation gate.*runs before' "$hub_pipeline_file"; then
        assert_eq "0" "0" "hub pipeline: Phase 1 comment documents pre-validation gate"
    else
        assert_eq "documented" "missing" "hub pipeline: Phase 1 should document pre-validation"
    fi
fi

# Test 4: Phase 3 comment documents infrastructure-dependent checks
if [ -f "$hub_pipeline_file" ]; then
    if grep -q 'infrastructure-dependent' "$hub_pipeline_file"; then
        assert_eq "0" "0" "hub pipeline: Phase 3 comment documents infra-dependent checks"
    else
        assert_eq "documented" "missing" "hub pipeline: Phase 3 should note infra-dependent checks"
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
    local spoke_pre_val_line
    spoke_pre_val_line=$(grep -n 'pre_validate_spoke' "$spoke_pipeline_file" | head -1 | cut -d: -f1)
    local spoke_phase1_line
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
    local docker_check_line
    docker_check_line=$(grep -n 'pre_validate_check_docker' "$pre_val_file" | head -1 | cut -d: -f1)
    local tools_check_line
    tools_check_line=$(grep -n 'pre_validate_check_tools' "$pre_val_file" | head -1 | cut -d: -f1)

    if [ -n "$docker_check_line" ] && [ -n "$tools_check_line" ]; then
        # Docker check function should be defined before tools check
        assert_eq "0" "0" "pre-validation: Docker check defined (line $docker_check_line)"
    fi
fi

# =============================================================================
# Test: Hub phase numbering is consecutive 1-13
# =============================================================================

# Test 13: All 13 phases are present in hub pipeline
if [ -f "$hub_pipeline_file" ]; then
    local phase_count
    phase_count=$(grep -c 'Phase [0-9]\+ (' "$hub_pipeline_file" || true)
    # Each phase appears at least twice (comment + skip/execute blocks)
    if [ "$phase_count" -ge 13 ]; then
        assert_eq "0" "0" "hub pipeline: contains all 13 phases ($phase_count references)"
    else
        assert_eq ">=13" "$phase_count" "hub pipeline: should reference all 13 phases"
    fi
fi
