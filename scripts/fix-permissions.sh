#!/bin/bash

###############################################################################
# Fix File Permissions - DIVE V3
# Fixes permission issues when pulling from git or running Docker
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "========================================"
echo "  DIVE V3 - Fix File Permissions"
echo "========================================"
echo ""

# Get current user
CURRENT_USER=$(whoami)
echo "Current user: $CURRENT_USER"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Project root: $PROJECT_ROOT"
echo ""

# Check if we need sudo
if [ "$CURRENT_USER" == "root" ]; then
    echo -e "${YELLOW}⚠ Running as root - be careful!${NC}"
    SUDO=""
else
    SUDO="sudo"
    echo "Will use sudo for permission changes"
fi

echo ""
echo "This will:"
echo "  1. Change ownership of project to: $CURRENT_USER"
echo "  2. Fix directory permissions (755)"
echo "  3. Fix file permissions (644)"
echo "  4. Make scripts executable"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted"
    exit 0
fi

echo ""
echo "Fixing permissions..."

# Change ownership to current user
echo -n "Changing ownership to $CURRENT_USER..."
$SUDO chown -R $CURRENT_USER:$CURRENT_USER "$PROJECT_ROOT"
echo -e " ${GREEN}✓${NC}"

# Fix directory permissions
echo -n "Fixing directory permissions..."
find "$PROJECT_ROOT" -type d -exec chmod 755 {} \; 2>/dev/null
echo -e " ${GREEN}✓${NC}"

# Fix file permissions
echo -n "Fixing file permissions..."
find "$PROJECT_ROOT" -type f -exec chmod 644 {} \; 2>/dev/null
echo -e " ${GREEN}✓${NC}"

# Make scripts executable
echo -n "Making scripts executable..."
chmod +x "$PROJECT_ROOT"/scripts/*.sh 2>/dev/null || true
echo -e " ${GREEN}✓${NC}"

# Fix git directory permissions
if [ -d "$PROJECT_ROOT/.git" ]; then
    echo -n "Fixing git directory..."
    $SUDO chown -R $CURRENT_USER:$CURRENT_USER "$PROJECT_ROOT/.git"
    echo -e " ${GREEN}✓${NC}"
fi

echo ""
echo -e "${GREEN}✓ Permissions fixed!${NC}"
echo ""
echo "You can now:"
echo "  git pull"
echo "  docker compose up -d"
echo "  ./scripts/fix-nextauth-database.sh"
echo ""

