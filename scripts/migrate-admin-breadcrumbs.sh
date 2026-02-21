#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Migrate Admin Pages to InteractiveBreadcrumbs SSOT
# =============================================================================
# Purpose: Automatically migrate all admin pages to use InteractiveBreadcrumbs
#
# Usage: ./migrate-admin-breadcrumbs.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/../frontend/src/app/admin"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🔄 Migrating Admin Pages to InteractiveBreadcrumbs SSOT"
echo "========================================================"
echo ""

# Find all page.tsx files in admin directory
admin_pages=$(find "$FRONTEND_DIR" -name "page.tsx" -type f)

total=0
migrated=0
skipped=0

for page_file in $admin_pages; do
    ((total++))

    relative_path="${page_file#$SCRIPT_DIR/../}"
    echo -e "${BLUE}[$total]${NC} Processing: $relative_path"

    # Check if already uses InteractiveBreadcrumbs
    if grep -q "InteractiveBreadcrumbs" "$page_file"; then
        echo -e "  ${GREEN}✓${NC} Already migrated"
        ((migrated++))
        continue
    fi

    # Check if it has breadcrumbs prop
    if ! grep -q "breadcrumbs={\[" "$page_file"; then
        echo -e "  ${YELLOW}⊘${NC} No breadcrumbs prop found (skipping)"
        ((skipped++))
        continue
    fi

    echo -e "  ${BLUE}→${NC} Needs migration"

    # Create backup
    cp "$page_file" "${page_file}.backup"

    # Step 1: Add import if not present
    if ! grep -q "import.*InteractiveBreadcrumbs" "$page_file"; then
        # Find the last import line
        last_import_line=$(grep -n "^import " "$page_file" | tail -1 | cut -d: -f1)
        if [ -n "$last_import_line" ]; then
            sed -i.tmp "${last_import_line}a\\
import { InteractiveBreadcrumbs } from '@/components/ui/interactive-breadcrumbs';
" "$page_file"
            rm -f "${page_file}.tmp"
            echo -e "  ${GREEN}✓${NC} Added InteractiveBreadcrumbs import"
        fi
    fi

    # Step 2: Remove breadcrumbs prop
    # This is complex - need to handle multi-line props
    # For now, mark for manual review
    echo -e "  ${YELLOW}⚠${NC}  Manual review needed for breadcrumbs prop removal"

    ((migrated++))
done

echo ""
echo "========================================================"
echo -e "${GREEN}Migration Summary:${NC}"
echo "  Total pages: $total"
echo "  Already migrated: $migrated"
echo "  Skipped: $skipped"
echo "  Needs manual review: $(($total - $migrated - $skipped))"
echo ""
echo "Next steps:"
echo "  1. Review backup files (*.backup)"
echo "  2. Manually complete migration for flagged files"
echo "  3. Test each page for correct breadcrumb rendering"
echo "  4. Remove backup files when satisfied"
echo ""
