#!/usr/bin/env bash
# =============================================================================
# DEPRECATED: Use utilities/policy.sh instead
# =============================================================================
# This shim exists for backward compatibility during migration
# Will be removed in v6.0.0
# =============================================================================

[ -n "$DIVE_POLICY_SHIM_WARNED" ] || {
    echo "[DEPRECATION WARNING] policy.sh is deprecated. Use utilities/policy.sh" >&2
    export DIVE_POLICY_SHIM_WARNED=1
}

source "$(dirname "${BASH_SOURCE[0]}")/utilities/policy.sh"
