#!/usr/bin/env bash
# =============================================================================
# ENV FILE CLEANUP SCRIPT
# =============================================================================
# Removes legacy/conflicting .env files that violate DIVE V3 conventions
#
# CORRECT PATTERN (per docs):
#   - .env.hub                      (hub secrets)
#   - instances/<code>/.env         (spoke secrets)
#   - .env.example                  (template, checked into git)
#   - .env.secrets.example          (template, checked into git)
#
# INCORRECT PATTERNS (to be removed):
#   - .env.local, .env.cloudflare, .env.mkcert
#   - backend/.env (should use GCP secrets)
#   - frontend/.env.* (should use NEXTAUTH_URL from docker-compose)
#   - external-idps/.env (unused)
#
# Usage:
#   ./scripts/cleanup-env-files.sh              # Interactive mode (asks before deleting)
#   ./scripts/cleanup-env-files.sh --force      # Auto-delete without prompts
#   ./scripts/cleanup-env-files.sh --dry-run    # Show what would be deleted
# =============================================================================

set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIVE_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Flags
DRY_RUN=false
FORCE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run|-n)
            DRY_RUN=true
            shift
            ;;
        --force|-f)
            FORCE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--dry-run] [--force]"
            echo ""
            echo "Remove legacy .env files that conflict with DIVE V3 conventions"
            echo ""
            echo "Options:"
            echo "  --dry-run, -n    Show what would be deleted (no changes)"
            echo "  --force, -f      Delete without confirmation"
            echo "  --help, -h       Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Run with --help for usage"
            exit 1
            ;;
    esac
done

echo -e "${BOLD}==============================================================================${NC}"
echo -e "${BOLD}DIVE V3 Environment File Cleanup${NC}"
echo -e "${BOLD}==============================================================================${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}🔍 DRY RUN MODE - No files will be deleted${NC}"
    echo ""
fi

# =============================================================================
# FIND LEGACY ENV FILES
# =============================================================================

LEGACY_FILES=()

# Root-level legacy files
ROOT_LEGACY=(
    ".env.local"
    ".env.cloudflare"
    ".env.mkcert"
    ".env.secrets"
)

for file in "${ROOT_LEGACY[@]}"; do
    if [ -f "$file" ]; then
        LEGACY_FILES+=("$file")
    fi
done

# Backend legacy files
if [ -f "backend/.env" ]; then
    LEGACY_FILES+=("backend/.env")
fi

# Frontend legacy files
for file in frontend/.env.*; do
    if [ -f "$file" ] && [[ ! "$file" =~ \.example$ ]]; then
        LEGACY_FILES+=("$file")
    fi
done

# External IdPs legacy files
if [ -f "external-idps/.env" ]; then
    LEGACY_FILES+=("external-idps/.env")
fi

# =============================================================================
# DISPLAY FINDINGS
# =============================================================================

if [ ${#LEGACY_FILES[@]} -eq 0 ]; then
    echo -e "${GREEN}✅ No legacy .env files found!${NC}"
    echo ""
    echo "Your environment is clean and follows DIVE V3 conventions:"
    echo "  ✓ .env.hub (hub secrets)"
    echo "  ✓ instances/<code>/.env (spoke secrets)"
    echo ""
    exit 0
fi

echo -e "${YELLOW}Found ${#LEGACY_FILES[@]} legacy .env file(s):${NC}"
echo ""

for file in "${LEGACY_FILES[@]}"; do
    echo "  ❌ $file"
done

echo ""
echo -e "${BOLD}These files violate DIVE V3 conventions and should be removed.${NC}"
echo ""
echo -e "${BOLD}CORRECT PATTERN:${NC}"
echo "  .env.hub                  → Hub secrets (auto-generated)"
echo "  instances/<code>/.env     → Spoke secrets (auto-generated)"
echo "  .env.example              → Template (checked into git)"
echo ""
echo -e "${BOLD}WHY REMOVE THESE:${NC}"
echo "  • .env.local              → Conflicts with docker-compose environment"
echo "  • .env.cloudflare         → Should be in cloudflared/config.yml"
echo "  • .env.mkcert             → Certificates are in certs/ directory"
echo "  • backend/.env            → Backend uses GCP Secret Manager"
echo "  • frontend/.env.*         → Frontend uses NEXTAUTH_URL from compose"
echo "  • external-idps/.env      → Unused legacy file"
echo ""

# =============================================================================
# CONFIRM DELETION
# =============================================================================

if [ "$DRY_RUN" = true ]; then
    echo -e "${BLUE}💡 Dry run complete. No files were deleted.${NC}"
    echo "Run without --dry-run to actually delete these files."
    exit 0
fi

if [ "$FORCE" = false ]; then
    echo -e "${BOLD}Do you want to delete these files? (y/N)${NC}"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

# =============================================================================
# DELETE FILES
# =============================================================================

echo ""
echo -e "${BOLD}Deleting legacy files...${NC}"
echo ""

DELETED_COUNT=0
for file in "${LEGACY_FILES[@]}"; do
    if rm -f "$file"; then
        echo -e "  ${GREEN}✓${NC} Deleted: $file"
        DELETED_COUNT=$((DELETED_COUNT + 1))
    else
        echo -e "  ${RED}✗${NC} Failed to delete: $file"
    fi
done

echo ""
echo -e "${GREEN}✅ Cleanup complete: ${DELETED_COUNT}/${#LEGACY_FILES[@]} files deleted${NC}"
echo ""

# =============================================================================
# VERIFY CORRECT FILES EXIST
# =============================================================================

echo -e "${BOLD}Verifying correct files...${NC}"
echo ""

ALL_GOOD=true

if [ -f ".env.hub" ]; then
    echo -e "  ${GREEN}✓${NC} .env.hub (hub secrets)"
else
    echo -e "  ${YELLOW}⚠${NC}  .env.hub missing (run: ./dive secrets load)"
    ALL_GOOD=false
fi

if [ -f ".env.example" ]; then
    echo -e "  ${GREEN}✓${NC} .env.example (template)"
else
    echo -e "  ${RED}✗${NC} .env.example missing (should be in git)"
    ALL_GOOD=false
fi

# Check instance directories
INSTANCE_COUNT=0
for instance_dir in instances/*/; do
    if [ -d "$instance_dir" ]; then
        _code=$(basename "$instance_dir")
        if [ -f "${instance_dir}.env" ]; then
            INSTANCE_COUNT=$((INSTANCE_COUNT + 1))
        fi
    fi
done

if [ $INSTANCE_COUNT -gt 0 ]; then
    echo -e "  ${GREEN}✓${NC} ${INSTANCE_COUNT} spoke instance(s) with .env files"
else
    echo -e "  ${YELLOW}⚠${NC}  No spoke instances found (this is OK for hub-only deployments)"
fi

echo ""

if [ "$ALL_GOOD" = true ]; then
    echo -e "${GREEN}🎉 Your environment is now clean and follows DIVE V3 conventions!${NC}"
else
    echo -e "${YELLOW}⚠️  Some required files are missing. See messages above.${NC}"
fi

echo ""
echo -e "${BOLD}Next steps:${NC}"
echo "  1. Review .gitignore to ensure it blocks these files"
echo "  2. Run: ./dive secrets load"
echo "  3. Run: ./dive hub up"
echo ""
