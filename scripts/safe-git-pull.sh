#!/bin/bash

###############################################################################
# DIVE V3 - Safely Pull Latest Changes (Resolve Git Conflicts)
###############################################################################
# This script safely handles git conflicts during pull on deployment machines
###############################################################################

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║       DIVE V3 - Safe Git Pull (Resolve Conflicts)           ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if we're in a git repository
if [ ! -d .git ]; then
    echo -e "${RED}Error: Not in a git repository${NC}"
    echo "Run this script from the DIVE V3 project root"
    exit 1
fi

###############################################################################
# Step 1: Fix Docker-Generated File Permissions (if needed)
###############################################################################

echo -e "${CYAN}Step 1: Checking file permissions...${NC}"
echo ""

# Check if any files are owned by UID 1001 (Docker container user)
DOCKER_OWNED_FILES=$(find frontend backend kas -user 1001 2>/dev/null | head -5)
if [ ! -z "$DOCKER_OWNED_FILES" ]; then
    echo -e "${YELLOW}⚠${NC}  Found Docker-generated files (owned by UID 1001)"
    echo "   This is normal after running containers"
    echo ""
    echo "   Fixing permissions..."
    
    CURRENT_USER=$(whoami)
    if [ "$CURRENT_USER" == "root" ]; then
        chown -R $CURRENT_USER:$CURRENT_USER frontend/ backend/ kas/ 2>/dev/null || true
    else
        sudo chown -R $CURRENT_USER:$CURRENT_USER frontend/ backend/ kas/ 2>/dev/null || true
    fi
    
    echo -e "${GREEN}✓${NC} Permissions fixed (you may need to re-run after deployment)"
    echo ""
fi

###############################################################################
# Step 2: Show what files would be overwritten
###############################################################################

echo -e "${CYAN}Step 2: Checking what files Git thinks are changed...${NC}"
echo ""

# Check if there are any changes
if git diff --quiet && git diff --cached --quiet; then
    echo -e "${GREEN}✓${NC} No local changes detected"
    echo ""
    echo "You should be able to pull normally. Trying now..."
    git pull origin main
    echo ""
    echo -e "${GREEN}✓${NC} Successfully pulled latest changes!"
    exit 0
fi

# Show modified files
echo -e "${YELLOW}Modified files:${NC}"
git status --short
echo ""

# Show detailed diff
echo -e "${YELLOW}Detailed changes:${NC}"
git diff --stat
echo ""

###############################################################################
# Step 3: Identify the type of changes
###############################################################################

echo -e "${CYAN}Step 3: Analyzing changes...${NC}"
echo ""

# Check for common deployment-generated files
GENERATED_FILES=(
    "docker-compose.hostname.yml"
    "frontend/.env.local"
    "backend/.env"
    "frontend/tsconfig.tsbuildinfo"
    "backend/dist/"
    "node_modules/"
    ".next/"
)

HAS_GENERATED=0
HAS_SOURCE=0

for file in "${GENERATED_FILES[@]}"; do
    if git status --short | grep -q "$file"; then
        HAS_GENERATED=1
        echo -e "  ${YELLOW}⚠${NC}  Found generated file: $file"
    fi
done

if git diff --name-only | grep -E '\.(ts|tsx|tf|sh|js|json)$' > /dev/null; then
    HAS_SOURCE=1
    echo -e "  ${YELLOW}⚠${NC}  Found source code changes"
fi

echo ""

###############################################################################
# Step 4: Backup current state (safety first!)
###############################################################################

echo -e "${CYAN}Step 4: Creating backup of current state...${NC}"
echo ""

BACKUP_DIR="backups/git-pull-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup modified files
git diff --name-only | while read file; do
    if [ -f "$file" ]; then
        mkdir -p "$BACKUP_DIR/$(dirname "$file")"
        cp "$file" "$BACKUP_DIR/$file"
        echo "  Backed up: $file"
    fi
done

echo ""
echo -e "${GREEN}✓${NC} Backup created: $BACKUP_DIR"
echo ""

###############################################################################
# Step 5: Ask user what to do
###############################################################################

echo -e "${CYAN}Step 5: Choose how to proceed${NC}"
echo ""
echo "Options:"
echo ""
echo "  ${GREEN}1)${NC} Discard ALL local changes and pull latest (RECOMMENDED for deployment)"
echo "     - Your changes will be backed up in: $BACKUP_DIR"
echo "     - Fresh pull from GitHub"
echo "     - Safe for deployment machines"
echo ""
echo "  ${GREEN}2)${NC} Stash changes and pull (keep changes for later)"
echo "     - Saves your changes to git stash"
echo "     - Pull latest from GitHub"
echo "     - You can reapply with: git stash pop"
echo ""
echo "  ${GREEN}3)${NC} Show me the diff first (review changes)"
echo "     - View what would be overwritten"
echo "     - Then choose option 1 or 2"
echo ""
echo "  ${GREEN}4)${NC} Cancel (do nothing)"
echo "     - Exit without making changes"
echo ""

read -p "Select option [1-4] (default: 1): " CHOICE
CHOICE=${CHOICE:-1}

echo ""

###############################################################################
# Step 6: Execute chosen action
###############################################################################

case $CHOICE in
    1)
        echo -e "${YELLOW}Discarding local changes and pulling...${NC}"
        echo ""
        
        # Remove untracked files (like docker-compose.hostname.yml)
        echo "Removing untracked files..."
        git clean -fd
        
        # Discard changes to tracked files
        echo "Discarding changes to tracked files..."
        git reset --hard HEAD
        
        # Pull latest
        echo "Pulling latest from GitHub..."
        git pull origin main
        
        echo ""
        echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║                                                              ║${NC}"
        echo -e "${GREEN}║                  ✓ Pull Successful!                          ║${NC}"
        echo -e "${GREEN}║                                                              ║${NC}"
        echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${CYAN}Your original changes are backed up in:${NC}"
        echo "  $BACKUP_DIR"
        echo ""
        echo -e "${CYAN}Next steps:${NC}"
        echo "  1. Apply Terraform updates: cd terraform && terraform apply"
        echo "  2. Restart services: docker compose restart"
        echo ""
        ;;
        
    2)
        echo -e "${YELLOW}Stashing local changes and pulling...${NC}"
        echo ""
        
        # Stash changes
        echo "Stashing your changes..."
        STASH_MSG="Auto-stash before pull on $(date)"
        git stash push -m "$STASH_MSG"
        
        # Pull latest
        echo "Pulling latest from GitHub..."
        git pull origin main
        
        echo ""
        echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║                                                              ║${NC}"
        echo -e "${GREEN}║                  ✓ Pull Successful!                          ║${NC}"
        echo -e "${GREEN}║                                                              ║${NC}"
        echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${CYAN}Your changes are stashed with message:${NC}"
        echo "  '$STASH_MSG'"
        echo ""
        echo -e "${CYAN}To reapply your changes:${NC}"
        echo "  git stash list      # See all stashes"
        echo "  git stash pop       # Reapply most recent stash"
        echo ""
        echo -e "${CYAN}Backup also available in:${NC}"
        echo "  $BACKUP_DIR"
        echo ""
        ;;
        
    3)
        echo -e "${YELLOW}Showing detailed diff...${NC}"
        echo ""
        git diff
        echo ""
        echo -e "${CYAN}Review complete. Run this script again to proceed.${NC}"
        exit 0
        ;;
        
    4)
        echo -e "${YELLOW}Cancelled. No changes made.${NC}"
        echo ""
        echo "Your backup is available in: $BACKUP_DIR"
        exit 0
        ;;
        
    *)
        echo -e "${RED}Invalid option${NC}"
        exit 1
        ;;
esac

###############################################################################
# Step 7: Verify pull was successful
###############################################################################

echo -e "${CYAN}Verifying pull...${NC}"
echo ""

# Show current commit
CURRENT_COMMIT=$(git rev-parse --short HEAD)
CURRENT_BRANCH=$(git branch --show-current)

echo -e "${GREEN}✓${NC} Current branch: $CURRENT_BRANCH"
echo -e "${GREEN}✓${NC} Current commit: $CURRENT_COMMIT"
echo ""

# Show recent commits
echo "Recent commits:"
git log --oneline -5
echo ""

echo -e "${GREEN}All done! You now have the latest code.${NC}"


