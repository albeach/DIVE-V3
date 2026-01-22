#!/usr/bin/env bash
# =============================================================================
# DEPRECATED: Use utilities/sp.sh instead
# =============================================================================
# This shim exists for backward compatibility during migration
# Will be removed in v6.0.0
# =============================================================================

[ -n "$DIVE_SP_SHIM_WARNED" ] || {
    echo "[DEPRECATION WARNING] sp.sh is deprecated. Use utilities/sp.sh" >&2
    export DIVE_SP_SHIM_WARNED=1
}

source "$(dirname "${BASH_SOURCE[0]}")/utilities/sp.sh"
