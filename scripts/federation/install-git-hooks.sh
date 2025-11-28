#!/bin/bash
# =============================================================================
# DIVE V3 - Git Hooks Installer
# =============================================================================
# Purpose: Install pre-commit hooks to prevent manual edits to generated files
# Usage: ./scripts/federation/install-git-hooks.sh
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GIT_HOOKS_DIR="$PROJECT_ROOT/.git/hooks"
PRE_COMMIT_HOOK="$GIT_HOOKS_DIR/pre-commit"
SOURCE_HOOK="$SCRIPT_DIR/pre-commit-hook.sh"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  DIVE V3 Git Hooks Installer"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if .git directory exists
if [ ! -d "$PROJECT_ROOT/.git" ]; then
    echo -e "${RED}✗ ERROR: Not a git repository${NC}"
    echo "  Run this script from within the DIVE V3 git repository"
    exit 1
fi

# Check if hooks directory exists
if [ ! -d "$GIT_HOOKS_DIR" ]; then
    echo -e "${YELLOW}⚠ Creating git hooks directory${NC}"
    mkdir -p "$GIT_HOOKS_DIR"
fi

# Backup existing pre-commit hook if it exists
if [ -f "$PRE_COMMIT_HOOK" ]; then
    backup_file="$PRE_COMMIT_HOOK.backup-$(date +%Y%m%d-%H%M%S)"
    echo -e "${YELLOW}⚠ Backing up existing pre-commit hook${NC}"
    echo "  Backup: $backup_file"
    cp "$PRE_COMMIT_HOOK" "$backup_file"
fi

# Copy the pre-commit hook
echo -e "${BLUE}ℹ${NC} Installing pre-commit hook..."
cp "$SOURCE_HOOK" "$PRE_COMMIT_HOOK"
chmod +x "$PRE_COMMIT_HOOK"

echo -e "${GREEN}✓${NC} Pre-commit hook installed successfully!"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  What This Hook Does"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "The pre-commit hook will:"
echo "  1. Prevent commits of auto-generated files (.tfvars, docker-compose.yml)"
echo "  2. Validate federation-registry.json before committing changes"
echo "  3. Ensure configuration consistency"
echo ""
echo "To make configuration changes:"
echo "  1. Edit config/federation-registry.json"
echo "  2. Run: ./scripts/federation/generate-tfvars.sh"
echo "  3. Run: ./scripts/federation/generate-docker-compose.sh <instance>"
echo "  4. Commit the registry change (generated files regenerate on deploy)"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo -e "${GREEN}✓✓✓ Git hooks installation complete! ✓✓✓${NC}"
echo ""

