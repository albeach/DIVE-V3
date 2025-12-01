#!/bin/bash
# =============================================================================
# DIVE V3 - Git Pre-Commit Hook
# =============================================================================
# Purpose: Prevent manual edits to generated files and validate registry
# Installation: ./scripts/federation/install-git-hooks.sh
# =============================================================================

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# Configuration
PROJECT_ROOT="$(git rev-parse --show-toplevel)"

# Generated file patterns (these should never be manually committed)
GENERATED_FILES=(
    "terraform/instances/*.tfvars"
    "instances/*/docker-compose.yml"
)

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  DIVE V3 Pre-Commit Validation"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check for manual edits to generated files
echo "Checking for manual edits to generated files..."
for pattern in "${GENERATED_FILES[@]}"; do
    if git diff --cached --name-only | grep -qE "$pattern"; then
        matching_files=$(git diff --cached --name-only | grep -E "$pattern")
        echo -e "${RED}✗ ERROR: Cannot commit generated files${NC}"
        echo ""
        echo "The following generated files are staged for commit:"
        echo "$matching_files" | while read file; do
            echo "  - $file"
        done
        echo ""
        echo -e "${YELLOW}These files are auto-generated and should not be manually edited.${NC}"
        echo ""
        echo "To make changes:"
        echo "  1. Edit config/federation-registry.json"
        echo "  2. Run: ./scripts/federation/generate-tfvars.sh"
        echo "  3. Run: ./scripts/federation/generate-docker-compose.sh <instance>"
        echo "  4. Commit the registry change (generated files are gitignored)"
        echo ""
        exit 1
    fi
done
echo -e "${GREEN}✓${NC} No generated files in commit"

# Validate federation registry if it's being committed
if git diff --cached --name-only | grep -q "config/federation-registry.json"; then
    echo ""
    echo "Validating federation-registry.json..."
    
    if [ ! -f "$PROJECT_ROOT/scripts/federation/validate-config.sh" ]; then
        echo -e "${YELLOW}⚠${NC} Validation script not found, skipping validation"
    else
        if ! "$PROJECT_ROOT/scripts/federation/validate-config.sh" > /dev/null 2>&1; then
            echo -e "${RED}✗ ERROR: federation-registry.json validation failed${NC}"
            echo ""
            echo "Run for details:"
            echo "  ./scripts/federation/validate-config.sh --verbose"
            echo ""
            exit 1
        fi
        echo -e "${GREEN}✓${NC} federation-registry.json is valid"
    fi
fi

echo ""
echo -e "${GREEN}✓✓✓ Pre-commit validation passed! ✓✓✓${NC}"
echo ""
exit 0




