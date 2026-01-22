#!/usr/bin/env bash
# =============================================================================
# DEPRECATED: Use federation/setup.sh instead
# =============================================================================
# This shim exists for backward compatibility during migration
# Will be removed in v6.0.0
# =============================================================================

[ -n "$DIVE_FED_SHIM_WARNED" ] || {
    echo "[DEPRECATION WARNING] federation.sh is deprecated. Use federation/setup.sh" >&2
    export DIVE_FED_SHIM_WARNED=1
}

source "$(dirname "${BASH_SOURCE[0]}")/federation/setup.sh"
