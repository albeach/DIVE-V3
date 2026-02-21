#!/usr/bin/env bash
# =============================================================================
# Tests for Guided/Pro CLI Framework
# =============================================================================
# Pure function tests — no Docker, no network, no external dependencies.
# =============================================================================

# Source common.sh with stubs
export DIVE_ROOT="$PROJECT_ROOT"
export ENVIRONMENT="${ENVIRONMENT:-local}"
export INSTANCE="${INSTANCE:-usa}"
export DRY_RUN="${DRY_RUN:-false}"
export QUIET="${QUIET:-true}"

# Stub docker to avoid errors during source
docker() { return 1; }
export -f docker

source "$PROJECT_ROOT/scripts/dive-modules/common.sh" 2>/dev/null || true
source "$PROJECT_ROOT/scripts/dive-modules/guided/framework.sh" 2>/dev/null || true
source "$PROJECT_ROOT/scripts/dive-modules/guided/messages.sh" 2>/dev/null || true

# ─── dive_mode() ─────────────────────────────────────────────────────────────

# Test: explicit DIVE_MODE overrides auto-detection
export DIVE_MODE="guided"
assert_eq "guided" "$(dive_mode)" "dive_mode: DIVE_MODE=guided returns guided"

export DIVE_MODE="pro"
assert_eq "pro" "$(dive_mode)" "dive_mode: DIVE_MODE=pro returns pro"

unset DIVE_MODE

# Test: CI detection forces pro mode
export CI="true"
assert_eq "pro" "$(dive_mode)" "dive_mode: CI=true forces pro"
unset CI

export GITHUB_ACTIONS="true"
assert_eq "pro" "$(dive_mode)" "dive_mode: GITHUB_ACTIONS forces pro"
unset GITHUB_ACTIONS

export JENKINS_URL="http://jenkins.example.com"
assert_eq "pro" "$(dive_mode)" "dive_mode: JENKINS_URL forces pro"
unset JENKINS_URL

# Test: non-interactive forces pro
export DIVE_NON_INTERACTIVE="true"
assert_eq "pro" "$(dive_mode)" "dive_mode: DIVE_NON_INTERACTIVE=true forces pro"
unset DIVE_NON_INTERACTIVE

# ─── is_guided() / is_pro() ──────────────────────────────────────────────────

export DIVE_MODE="guided"
is_guided && _result="yes" || _result="no"
assert_eq "yes" "$_result" "is_guided: returns true when DIVE_MODE=guided"

is_pro && _result="yes" || _result="no"
assert_eq "no" "$_result" "is_pro: returns false when DIVE_MODE=guided"

export DIVE_MODE="pro"
is_pro && _result="yes" || _result="no"
assert_eq "yes" "$_result" "is_pro: returns true when DIVE_MODE=pro"

is_guided && _result="yes" || _result="no"
assert_eq "no" "$_result" "is_guided: returns false when DIVE_MODE=pro"

# ─── guided functions are no-ops in Pro mode ─────────────────────────────────

export DIVE_MODE="pro"

# guided_explain should produce no output in pro mode
_output=$(guided_explain "Test" "Body text" 2>&1)
assert_eq "" "$_output" "guided_explain: no output in pro mode"

# guided_success should produce no output in pro mode
_output=$(guided_success "Test message" 2>&1)
assert_eq "" "$_output" "guided_success: no output in pro mode"

# guided_warn should produce no output in pro mode
_output=$(guided_warn "Title" "Body" 2>&1)
assert_eq "" "$_output" "guided_warn: no output in pro mode"

# guided_error should produce no output in pro mode
_output=$(guided_error "Title" "What happened" "How to fix" 2>&1)
assert_eq "" "$_output" "guided_error: no output in pro mode"

# guided_progress should produce no output in pro mode
_output=$(guided_progress "Phase" "Description" 2>&1)
assert_eq "" "$_output" "guided_progress: no output in pro mode"

# ─── guided functions produce output in Guided mode ──────────────────────────

export DIVE_MODE="guided"

# guided_explain should produce output
_output=$(guided_explain "Test Title" "Some body text" 2>&1)
assert_contains "$_output" "Test Title" "guided_explain: shows title in guided mode"
assert_contains "$_output" "Some body text" "guided_explain: shows body in guided mode"

# guided_success should produce output
_output=$(guided_success "Deploy complete" 2>&1)
assert_contains "$_output" "Deploy complete" "guided_success: shows message in guided mode"

# guided_warn should produce output
_output=$(guided_warn "Warning Title" "Warning body" 2>&1)
assert_contains "$_output" "Warning Title" "guided_warn: shows title in guided mode"

# guided_error should produce output
_output=$(guided_error "Error Title" "What went wrong" "How to fix it" 2>&1)
assert_contains "$_output" "Error Title" "guided_error: shows title in guided mode"
assert_contains "$_output" "How to fix it" "guided_error: shows remediation in guided mode"

# guided_progress should produce output
_output=$(guided_progress "INITIALIZATION" "Setting up the workspace" 2>&1)
assert_contains "$_output" "INITIALIZATION" "guided_progress: shows phase name in guided mode"

# ─── guided_ask defaults in Pro mode ─────────────────────────────────────────

export DIVE_MODE="pro"

# guided_ask should set the default value silently in pro mode
unset TEST_VAR
guided_ask "What is the answer?" TEST_VAR "default_val" "help text" 2>/dev/null
assert_eq "default_val" "$TEST_VAR" "guided_ask: sets default in pro mode"

# ─── guided_step counter ─────────────────────────────────────────────────────

export DIVE_MODE="guided"

# Reset step counter
guided_step_reset 2>/dev/null || true

# Step counter should increment (call directly to avoid subshell isolation)
guided_step "First step" >/dev/null 2>&1
assert_eq "1" "$_GUIDED_STEP" "guided_step: first step sets counter to 1"

guided_step "Second step" >/dev/null 2>&1
assert_eq "2" "$_GUIDED_STEP" "guided_step: second step increments to 2"

# Reset should restart counter
guided_step_reset 2>/dev/null || true
assert_eq "0" "$_GUIDED_STEP" "guided_step_reset: counter resets to 0"

guided_step "After reset" >/dev/null 2>&1
assert_eq "1" "$_GUIDED_STEP" "guided_step: after reset starts at 1"

# ─── Message library loaded ─────────────────────────────────────────────────

assert_not_empty "${GUIDED_MSG_HUB_WHAT:-}" "messages: GUIDED_MSG_HUB_WHAT defined"
assert_not_empty "${GUIDED_MSG_SPOKE_WHAT:-}" "messages: GUIDED_MSG_SPOKE_WHAT defined"
assert_not_empty "${GUIDED_MSG_VAULT_WHAT:-}" "messages: GUIDED_MSG_VAULT_WHAT defined"
assert_not_empty "${GUIDED_MSG_IDP_WHAT:-}" "messages: GUIDED_MSG_IDP_WHAT defined"
assert_not_empty "${GUIDED_MSG_AUTH_CODE_WHAT:-}" "messages: GUIDED_MSG_AUTH_CODE_WHAT defined"
assert_not_empty "${GUIDED_MSG_FEDERATION_WHAT:-}" "messages: GUIDED_MSG_FEDERATION_WHAT defined"
assert_not_empty "${GUIDED_MSG_DOMAIN_WHAT:-}" "messages: GUIDED_MSG_DOMAIN_WHAT defined"

# Clean up
unset DIVE_MODE TEST_VAR
