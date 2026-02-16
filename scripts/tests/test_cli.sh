#!/usr/bin/env bash
# =============================================================================
# Tests for ./dive CLI entry point
# =============================================================================
# Tests help output, argument parsing, and module loading.
# No Docker or deployed infrastructure required.
# =============================================================================

DIVE="$PROJECT_ROOT/dive"

# ─── Help Output ──────────────────────────────────────────────────────────────

help_output=$("$DIVE" --help 2>&1 || true)
assert_contains "$help_output" "DIVE V3" "cli --help: shows CLI header"
assert_contains "$help_output" "deploy" "cli --help: lists deploy command"
assert_contains "$help_output" "cleanup" "cli --help: lists cleanup command"
assert_contains "$help_output" "status" "cli --help: lists status command"

# ─── Hub Subcommand Help ─────────────────────────────────────────────────────

hub_help=$("$DIVE" hub --help 2>&1 || true)
assert_contains "$hub_help" "hub" "cli hub --help: shows hub in output"

# ─── Spoke Subcommand Help ───────────────────────────────────────────────────

spoke_help=$("$DIVE" spoke --help 2>&1 || true)
assert_contains "$spoke_help" "spoke" "cli spoke --help: shows spoke in output"

# ─── Version / Unknown Command ───────────────────────────────────────────────

unknown_output=$("$DIVE" __nonexistent_command__ 2>&1 || true)
assert_not_empty "$unknown_output" "cli unknown command: produces output"

# ─── Module Loading ──────────────────────────────────────────────────────────

# Source common.sh to verify exports
export DIVE_ROOT="$PROJECT_ROOT"
export QUIET=true
docker() { return 1; }
export -f docker
source "$PROJECT_ROOT/scripts/dive-modules/common.sh" 2>/dev/null || true

assert_not_empty "$(type -t upper 2>/dev/null || echo '')" "module loading: upper() available after sourcing common.sh"
assert_not_empty "$(type -t container_name 2>/dev/null || echo '')" "module loading: container_name() available"
assert_not_empty "$(type -t log_info 2>/dev/null || echo '')" "module loading: log_info() available"
assert_not_empty "$(type -t json_get_field 2>/dev/null || echo '')" "module loading: json_get_field() available"

# ─── Syntax Validation ───────────────────────────────────────────────────────

# Verify all shell modules pass bash -n (syntax check)
syntax_errors=0
while IFS= read -r -d '' file; do
    if ! bash -n "$file" 2>/dev/null; then
        syntax_errors=$((syntax_errors + 1))
    fi
done < <(find "$PROJECT_ROOT/scripts/dive-modules" -name '*.sh' -print0)

assert_eq "0" "$syntax_errors" "syntax check: all dive-modules/*.sh pass bash -n"
