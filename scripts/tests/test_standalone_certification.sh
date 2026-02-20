#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Standalone Certification Tests
# =============================================================================
# Phase 1 compliance: validates standalone spoke deploy and federation attach
# code paths. Grep-based code structure verification — no Docker required.
#
# Categories:
#   A. Flag parsing (Tests 1-6)
#   B. Pipeline standalone skip logic (Tests 7-12)
#   C. spoke_federate() code structure (Tests 13-20)
#   D. 12-point verification standalone tolerance (Tests 21-26)
#   E. CLI routing & help (Tests 27-31)
#   F. Orchestration metadata (Tests 32-35)
# =============================================================================

# Setup
export DIVE_ROOT="${PROJECT_ROOT}"
export ENVIRONMENT="local"
export NON_INTERACTIVE=true

# Stub logging functions (avoid sourcing common.sh)
log_info() { :; }
log_warn() { :; }
log_error() { :; }
log_verbose() { :; }
log_step() { :; }
log_success() { :; }
upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }
lower() { echo "$1" | tr '[:upper:]' '[:lower:]'; }
is_interactive() { return 1; }

# Helper: grep that returns "found"/"not_found" (safe under set -e)
_grep_check() {
    grep -q "$@" 2>/dev/null && echo "found" || echo "not_found"
}

# Helper: multi-pattern grep (any match = found)
_grep_any() {
    local file="${!#}"
    local args=("${@:1:$#-1}")
    grep -q "${args[@]}" "$file" 2>/dev/null && echo "found" || echo "not_found"
}

# File references
spoke_deploy="${PROJECT_ROOT}/scripts/dive-modules/spoke/spoke-deploy.sh"
phase_config="${PROJECT_ROOT}/scripts/dive-modules/spoke/pipeline/phase-configuration.sh"
phase_verify="${PROJECT_ROOT}/scripts/dive-modules/spoke/pipeline/phase-verification.sh"
spoke_federation="${PROJECT_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-federation.sh"
spoke_verification="${PROJECT_ROOT}/scripts/dive-modules/spoke/verification.sh"
spoke_dispatcher="${PROJECT_ROOT}/scripts/dive-modules/deployment/spoke.sh"
spoke_pipeline="${PROJECT_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-pipeline.sh"

# =============================================================================
# A. Flag Parsing (Tests 1-6)
# =============================================================================

# Test 1: spoke-deploy.sh contains --skip-federation option handler
result=$(_grep_check '\-\-skip-federation)' "$spoke_deploy")
assert_eq "found" "$result" "flag: --skip-federation option handler exists"

# Test 2: --skip-federation sets SKIP_FEDERATION=true
result=$(_grep_check 'SKIP_FEDERATION=true' "$spoke_deploy")
assert_eq "found" "$result" "flag: --skip-federation sets SKIP_FEDERATION=true"

# Test 3: --skip-federation sets DEPLOYMENT_MODE=standalone
result=$(_grep_check 'DEPLOYMENT_MODE="standalone"' "$spoke_deploy")
assert_eq "found" "$result" "flag: --skip-federation sets DEPLOYMENT_MODE=standalone"

# Test 4: Standalone + seed defers seeding
result=$(_grep_check 'SKIP_FEDERATION.*true.*DIVE_ENABLE_SEEDING.*true' "$spoke_deploy")
assert_eq "found" "$result" "flag: standalone + seed triggers seeding deferral"

# Test 5: Standalone sets ORCH_DB_ENABLED=false
result=$(_grep_check 'ORCH_DB_ENABLED=false' "$spoke_deploy")
assert_eq "found" "$result" "flag: standalone sets ORCH_DB_ENABLED=false"

# Test 6: Standalone sets ORCH_DB_SOURCE_OF_TRUTH to file
result=$(_grep_check 'ORCH_DB_SOURCE_OF_TRUTH="file"' "$spoke_deploy")
assert_eq "found" "$result" "flag: standalone sets ORCH_DB_SOURCE_OF_TRUTH=file"

# =============================================================================
# B. Pipeline Standalone Skip Logic (Tests 7-12)
# =============================================================================

# Test 7: phase-configuration.sh detects standalone mode
result=$(_grep_check 'standalone_mode=true' "$phase_config")
assert_eq "found" "$result" "pipeline: phase-configuration detects standalone mode"

# Test 8: phase-configuration.sh skips Hub connectivity in standalone
result=$(_grep_check 'standalone.*skipping Hub connectivity' "$phase_config")
if [ "$result" = "not_found" ]; then
    result=$(_grep_check 'Standalone mode.*skipping.*Hub' "$phase_config")
fi
assert_eq "found" "$result" "pipeline: phase-configuration skips Hub preflight in standalone"

# Test 9: phase-configuration.sh skips federation registration in standalone
result=$(_grep_check 'Standalone mode.*skipping federation' "$phase_config")
if [ "$result" = "not_found" ]; then
    result=$(_grep_check 'standalone.*skipping.*federation' "$phase_config")
fi
assert_eq "found" "$result" "pipeline: phase-configuration skips federation setup in standalone"

# Test 10: phase-verification.sh detects standalone mode
result=$(_grep_check 'standalone_mode=true' "$phase_verify")
assert_eq "found" "$result" "pipeline: phase-verification detects standalone mode"

# Test 11: phase-verification.sh gates federation verification on non-standalone
# The pattern is: deploy mode AND standalone_mode = false → run federation verify
result=$(_grep_check 'standalone_mode.*false' "$phase_verify")
assert_eq "found" "$result" "pipeline: phase-verification gates federation on non-standalone"

# Test 12: Pipeline metadata includes federation_mode in state JSON
result=$(_grep_check 'federation_mode' "$spoke_pipeline")
assert_eq "found" "$result" "pipeline: metadata includes federation_mode field"

# =============================================================================
# C. spoke_federate() Code Structure (Tests 13-20)
# =============================================================================

# Test 13: spoke-federation.sh defines spoke_federate()
result=$(_grep_check '^spoke_federate()' "$spoke_federation")
assert_eq "found" "$result" "federate: spoke_federate() function defined"

# Test 14: Validates instance directory + docker-compose.yml exist
result=$(_grep_check 'docker-compose.yml' "$spoke_federation")
assert_eq "found" "$result" "federate: validates instance dir with docker-compose.yml"

# Test 15: Sets SKIP_FEDERATION=false (reverses standalone)
federate_body=$(sed -n '/^spoke_federate()/,/^[a-z_]*() *{/p' "$spoke_federation" 2>/dev/null || true)
if echo "$federate_body" | grep -q 'SKIP_FEDERATION=false' 2>/dev/null; then
    result="found"
else
    result="not_found"
fi
assert_eq "found" "$result" "federate: sets SKIP_FEDERATION=false on attach"

# Test 16: Supports --auth-code option
result=$(_grep_check '\-\-auth-code)' "$spoke_federation")
assert_eq "found" "$result" "federate: supports --auth-code option"

# Test 17: Supports --seed option
result=$(_grep_check '\-\-seed)' "$spoke_federation")
assert_eq "found" "$result" "federate: supports --seed option"

# Test 18: Supports --seed-count option
result=$(_grep_check '\-\-seed-count)' "$spoke_federation")
assert_eq "found" "$result" "federate: supports --seed-count option"

# Test 19: Supports --domain option for remote Hub
result=$(_grep_check '\-\-domain' "$spoke_federation")
assert_eq "found" "$result" "federate: supports --domain option"

# Test 20: Calls spoke_config_register_in_registries
result=$(_grep_check 'spoke_config_register_in_registries' "$spoke_federation")
assert_eq "found" "$result" "federate: calls spoke_config_register_in_registries"

# =============================================================================
# D. 12-Point Verification Standalone Tolerance (Tests 21-26)
# =============================================================================

# Test 21: spoke/verification.sh defines spoke_verify()
result=$(_grep_check '^spoke_verify()' "$spoke_verification")
assert_eq "found" "$result" "verify: spoke_verify() function defined"

# Test 22: Check 8 (Hub Connectivity) uses WARN when Hub unreachable
check8_section=$(sed -n '/Check 8: Hub Connectivity/,/Check 9/p' "$spoke_verification" 2>/dev/null || true)
if echo "$check8_section" | grep -q 'WARN Unreachable' 2>/dev/null; then
    result="found"
else
    result="not_found"
fi
assert_eq "found" "$result" "verify: Check 8 shows WARN when Hub unreachable"

# Test 23: Check 8 counts Hub unreachable as passed (standalone tolerance)
if echo "$check8_section" | grep 'WARN Unreachable' -A 1 2>/dev/null | grep -q 'checks_passed' 2>/dev/null; then
    result="found"
else
    result="not_found"
fi
assert_eq "found" "$result" "verify: Check 8 counts unreachable as passed (standalone fix)"

# Test 24: Check 10 (Token Validity) counts as passed when no token
check10_section=$(sed -n '/Check 10: Token Validity/,/Check 11/p' "$spoke_verification" 2>/dev/null || true)
if echo "$check10_section" | grep 'No token configured' -A 1 2>/dev/null | grep -q 'checks_passed' 2>/dev/null; then
    result="found"
else
    result="not_found"
fi
assert_eq "found" "$result" "verify: Check 10 counts no-token as passed"

# Test 25: Check 11 (Hub Heartbeat) counts as passed when no token/id
check11_section=$(sed -n '/Check 11: Hub Heartbeat/,/Check 12/p' "$spoke_verification" 2>/dev/null || true)
if echo "$check11_section" | grep 'Skipped (no token/id)' -A 1 2>/dev/null | grep -q 'checks_passed' 2>/dev/null; then
    result="found"
else
    result="not_found"
fi
assert_eq "found" "$result" "verify: Check 11 counts no-token as passed"

# Test 26: Caddy is non-blocking in standalone mode
result=$(_grep_check 'caddy.*standalone_mode.*true' "$phase_verify")
assert_eq "found" "$result" "verify: caddy is non-blocking in standalone mode"

# =============================================================================
# E. CLI Routing & Help (Tests 27-31)
# =============================================================================

# Test 27: deployment/spoke.sh routes federate to spoke_federate
result=$(_grep_check 'federate)' "$spoke_dispatcher")
assert_eq "found" "$result" "cli: dispatcher routes federate command"

result=$(_grep_check 'spoke_federate' "$spoke_dispatcher")
assert_eq "found" "$result" "cli: dispatcher calls spoke_federate function"

# Test 28: Help text includes federate command
result=$(_grep_check 'federate.*CODE' "$spoke_dispatcher")
assert_eq "found" "$result" "cli: help documents federate command"

# Test 29: Help text includes --skip-federation option
result=$(_grep_check '\-\-skip-federation' "$spoke_dispatcher")
assert_eq "found" "$result" "cli: help documents --skip-federation option"

# Test 30: Help text includes --seed option
result=$(_grep_check '\-\-seed' "$spoke_dispatcher")
assert_eq "found" "$result" "cli: help documents --seed option"

# Test 31: Help text includes federate example with --auth-code
result=$(_grep_check 'spoke federate.*auth-code' "$spoke_dispatcher")
assert_eq "found" "$result" "cli: help shows federate --auth-code example"

# =============================================================================
# F. Orchestration Metadata (Tests 32-35)
# =============================================================================

# Test 32: Pipeline computes federation_mode variable
result=$(_grep_check 'federation_mode=' "$spoke_pipeline")
assert_eq "found" "$result" "metadata: pipeline computes federation_mode"

# Test 33: federation_mode set to STANDALONE when SKIP_FEDERATION=true
result=$(_grep_check 'federation_mode="STANDALONE"' "$spoke_pipeline")
assert_eq "found" "$result" "metadata: federation_mode=STANDALONE when standalone"

# Test 34: State JSON includes deployment_mode key (escaped in JSON string)
result=$(_grep_check 'deployment_mode.*:.*deployment_mode' "$spoke_pipeline")
assert_eq "found" "$result" "metadata: state JSON includes deployment_mode"

# Test 35: State JSON includes deployment_profile key (escaped in JSON string)
result=$(_grep_check 'deployment_profile.*:.*federation_mode' "$spoke_pipeline")
assert_eq "found" "$result" "metadata: state JSON includes deployment_profile"

# sc2034-anchor
: "${PROJECT_ROOT:-}" "${YELLOW:-}"
