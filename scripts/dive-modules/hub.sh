#!/usr/bin/env bash
# =============================================================================
# DEPRECATED: Use deployment/hub.sh instead
# =============================================================================
# This shim exists for backward compatibility during migration
# Will be removed in v6.0.0
# =============================================================================

[ -n "$DIVE_HUB_SHIM_WARNED" ] || {
    echo "[DEPRECATION WARNING] hub.sh is deprecated. Use deployment/hub.sh" >&2
    export DIVE_HUB_SHIM_WARNED=1
}

source "$(dirname "${BASH_SOURCE[0]}")/deployment/hub.sh"
