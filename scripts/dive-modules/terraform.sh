#!/usr/bin/env bash
# =============================================================================
# DEPRECATED: Use configuration/terraform.sh instead
# =============================================================================
# This shim exists for backward compatibility during migration
# Will be removed in v6.0.0
# =============================================================================

[ -n "$DIVE_TF_SHIM_WARNED" ] || {
    echo "[DEPRECATION WARNING] terraform.sh is deprecated. Use configuration/terraform.sh" >&2
    export DIVE_TF_SHIM_WARNED=1
}

source "$(dirname "${BASH_SOURCE[0]}")/configuration/terraform.sh"
