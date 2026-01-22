#!/usr/bin/env bash
# =============================================================================
# DEPRECATED: Use configuration/secrets.sh instead
# =============================================================================
# This shim exists for backward compatibility during migration
# Will be removed in v6.0.0
# =============================================================================

[ -n "$DIVE_SECRETS_SHIM_WARNED" ] || {
    echo "[DEPRECATION WARNING] secrets.sh is deprecated. Use configuration/secrets.sh" >&2
    export DIVE_SECRETS_SHIM_WARNED=1
}

source "$(dirname "${BASH_SOURCE[0]}")/configuration/secrets.sh"
