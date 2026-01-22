#!/usr/bin/env bash
# =============================================================================
# DEPRECATED: Use utilities/help.sh instead
# =============================================================================
# This shim exists for backward compatibility during migration
# Will be removed in v6.0.0
# =============================================================================

[ -n "$DIVE_HELP_SHIM_WARNED" ] || {
    echo "[DEPRECATION WARNING] help.sh is deprecated. Use utilities/help.sh" >&2
    export DIVE_HELP_SHIM_WARNED=1
}

source "$(dirname "${BASH_SOURCE[0]}")/utilities/help.sh"
