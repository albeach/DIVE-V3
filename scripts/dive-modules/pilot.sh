#!/usr/bin/env bash
# =============================================================================
# DEPRECATED: Use utilities/pilot.sh instead
# =============================================================================
# This shim exists for backward compatibility during migration
# Will be removed in v6.0.0
# =============================================================================

[ -n "$DIVE_PILOT_SHIM_WARNED" ] || {
    echo "[DEPRECATION WARNING] pilot.sh is deprecated. Use utilities/pilot.sh" >&2
    export DIVE_PILOT_SHIM_WARNED=1
}

source "$(dirname "${BASH_SOURCE[0]}")/utilities/pilot.sh"
