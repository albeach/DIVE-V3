#!/usr/bin/env bash
# =============================================================================
# DEPRECATED: Use deployment/spoke.sh instead
# =============================================================================
# This shim exists for backward compatibility during migration
# Will be removed in v6.0.0
# =============================================================================

[ -n "$DIVE_SPOKE_SHIM_WARNED" ] || {
    echo "[DEPRECATION WARNING] spoke.sh is deprecated. Use deployment/spoke.sh" >&2
    export DIVE_SPOKE_SHIM_WARNED=1
}

source "$(dirname "${BASH_SOURCE[0]}")/deployment/spoke.sh"
