#!/usr/bin/env bash
# =============================================================================
# DIVE V3 — EC2 Bootstrap Script
# =============================================================================
# Installs all dependencies on a fresh EC2 instance (Amazon Linux 2023 or
# Ubuntu 24.04) so that the full hub-spoke stack can run via Docker Compose.
#
# Delegates to scripts/dive-modules/bootstrap.sh for tool installation.
# This script adds EC2-specific setup: user creation, repo cloning, system
# tuning, swap, and firewall configuration.
#
# Usage:
#   curl -sSL <raw-github-url>/scripts/aws/bootstrap-ec2.sh | bash
#   -- or --
#   ./scripts/aws/bootstrap-ec2.sh            # after cloning the repo
#
# Supports:
#   - Amazon Linux 2023 (al2023)
#   - Ubuntu 22.04 / 24.04
#
# What gets installed:
#   Docker Engine + Compose v2, Node.js 24 (via nvm), mkcert, jq, curl, git,
#   rsync, AWS CLI v2, Terraform 1.13.4, Vault CLI 1.21.0, OPA CLI 1.12.3
# =============================================================================
set -euo pipefail

# =============================================================================
# CONFIGURATION (override via environment)
# =============================================================================
DIVE_USER="${DIVE_USER:-ubuntu}"
DIVE_DIR="${DIVE_DIR:-/opt/dive-v3}"
DIVE_REPO="${DIVE_REPO:-https://github.com/albeach/DIVE-V3.git}"
DIVE_BRANCH="${DIVE_BRANCH:-main}"

# =============================================================================
# HELPERS (minimal — bootstrap.sh has the full set once available)
# =============================================================================
_ec2_log()  { echo -e "\033[0;32m[EC2-BOOTSTRAP]\033[0m $*"; }
_ec2_warn() { echo -e "\033[1;33m[EC2-BOOTSTRAP]\033[0m $*"; }
_ec2_err()  { echo -e "\033[0;31m[EC2-BOOTSTRAP]\033[0m $*" >&2; }
_ec2_die()  { _ec2_err "$@"; exit 1; }

# =============================================================================
# 1. ENSURE GIT + REPO (needed before we can source bootstrap.sh)
# =============================================================================
_ec2_ensure_git() {
    if command -v git >/dev/null 2>&1; then
        return 0
    fi

    _ec2_log "Installing git (needed to clone repo)..."
    if [ -f /etc/os-release ]; then
        # shellcheck source=/dev/null
        . /etc/os-release
        case "$ID" in
            ubuntu)
                export DEBIAN_FRONTEND=noninteractive
                sudo apt-get update -qq
                sudo apt-get install -y -qq git
                ;;
            amzn)
                sudo dnf install -y -q git
                ;;
            *)
                _ec2_die "Unsupported OS: $ID"
                ;;
        esac
    fi
}

_ec2_ensure_repo() {
    if [ -d "$DIVE_DIR/.git" ]; then
        _ec2_log "DIVE V3 repo exists at $DIVE_DIR — pulling latest..."
        sudo chown -R "$(whoami)" "$DIVE_DIR" 2>/dev/null || true
        git -C "$DIVE_DIR" fetch origin "$DIVE_BRANCH" 2>/dev/null || true
        git -C "$DIVE_DIR" reset --hard "origin/$DIVE_BRANCH" 2>/dev/null || true
        return 0
    fi

    _ec2_log "Cloning DIVE V3 repo to $DIVE_DIR..."
    sudo mkdir -p "$DIVE_DIR"
    sudo chown "$(whoami)" "$DIVE_DIR"
    git clone --branch "$DIVE_BRANCH" "$DIVE_REPO" "$DIVE_DIR"
}

# =============================================================================
# 2. USER + DIRECTORY SETUP (EC2-specific)
# =============================================================================
_ec2_setup_user() {
    # Add current user to docker group
    sudo usermod -aG docker "$(whoami)" 2>/dev/null || true

    # Fix ownership
    sudo chown -R "$(whoami)" "$DIVE_DIR"

    # Create required directories
    mkdir -p \
        "$DIVE_DIR/instances" \
        "$DIVE_DIR/data" \
        "$DIVE_DIR/certs" \
        "$DIVE_DIR/.dive-state" \
        "$DIVE_DIR/.dive-locks" \
        "$DIVE_DIR/.dive-checkpoint"

    _ec2_log "User and directories configured"
}

# =============================================================================
# MAIN
# =============================================================================
main() {
    echo ""
    echo "============================================================"
    echo "  DIVE V3 — EC2 Bootstrap"
    echo "============================================================"
    echo ""

    # Phase 1: Get git and repo (so we can source bootstrap.sh)
    _ec2_ensure_git
    _ec2_ensure_repo

    # Phase 2: Delegate to the modular bootstrap system
    export DIVE_ROOT="$DIVE_DIR"

    # Source common.sh for logging functions (bootstrap.sh needs them)
    if [ -f "$DIVE_DIR/scripts/dive-modules/common.sh" ]; then
        source "$DIVE_DIR/scripts/dive-modules/common.sh"
    else
        _ec2_die "common.sh not found at $DIVE_DIR/scripts/dive-modules/common.sh"
    fi

    if [ -f "$DIVE_DIR/scripts/dive-modules/bootstrap.sh" ]; then
        source "$DIVE_DIR/scripts/dive-modules/bootstrap.sh"
        cmd_bootstrap --full
    else
        _ec2_die "bootstrap.sh not found at $DIVE_DIR/scripts/dive-modules/bootstrap.sh"
    fi

    # Phase 3: EC2-specific setup (user, directories)
    _ec2_setup_user

    echo ""
    echo "============================================================"
    echo "  EC2 Bootstrap complete!"
    echo "============================================================"
    echo ""
    echo "  Project directory: $DIVE_DIR"
    echo ""
    echo "  Next steps:"
    echo "    cd $DIVE_DIR"
    echo "    ./dive hub deploy"
    echo ""
}

main "$@"
