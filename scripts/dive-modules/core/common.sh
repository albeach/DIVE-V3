#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Core Common Functions (Consolidated)
# =============================================================================
# This is the canonical location for common.sh
# Sources the original file for backward compatibility during migration
# =============================================================================

# Source the original common.sh from parent directory
# This maintains all SSOT patterns and 1000+ lines of shared utilities
source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"

# Mark as loaded from new location
export DIVE_CORE_COMMON_LOADED=1
