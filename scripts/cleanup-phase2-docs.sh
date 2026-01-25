#!/bin/bash
# DIVE V3 Phase 2 Cleanup - Archive historical session documents
# Created: 2026-01-25
# Purpose: Archive old completion reports and session summaries (keep only 2026-01-25 and later)

set -e

WORKSPACE_ROOT="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3"
cd "$WORKSPACE_ROOT"

echo "🗑️  DIVE V3 Extended Cleanup - Phase 2"
echo "========================================="
echo ""

# Create archive directory
ARCHIVE_DIR="docs-archive-20260125"
mkdir -p "$ARCHIVE_DIR"
echo "📦 Archive directory: $ARCHIVE_DIR"
echo ""

# Keep files from 2026-01-25 and later, archive everything else
CUTOFF_DATE="2026-01-25"

echo "📅 Keeping files from $CUTOFF_DATE and later"
echo "📦 Archiving older files..."
echo ""

# Function to check if filename contains recent date
is_recent_file() {
    local file="$1"
    # Check if filename contains 2026-01-25 or 2026-01-26
    if [[ "$file" =~ 2026-01-2[56] ]]; then
        return 0  # Recent
    fi
    return 1  # Old
}

# 1. Archive COMPLETE documents
echo "1️⃣  Processing *COMPLETE*.md files..."
count=0
while IFS= read -r -d '' file; do
    if is_recent_file "$file"; then
        echo "   ⏭️  Keeping: $(basename "$file")"
    else
        echo "   📦 Archiving: $file"
        mv "$file" "$ARCHIVE_DIR/"
        ((count++))
    fi
done < <(find docs -type f -name "*COMPLETE*.md" -print0 2>/dev/null)
echo "   ✅ Archived: $count files"
echo ""

# 2. Archive REPORT documents
echo "2️⃣  Processing *REPORT*.md files..."
count=0
while IFS= read -r -d '' file; do
    if is_recent_file "$file"; then
        echo "   ⏭️  Keeping: $(basename "$file")"
    else
        echo "   📦 Archiving: $file"
        mv "$file" "$ARCHIVE_DIR/"
        ((count++))
    fi
done < <(find docs -type f -name "*REPORT*.md" -print0 2>/dev/null)
echo "   ✅ Archived: $count files"
echo ""

# 3. Archive RESULTS documents
echo "3️⃣  Processing *RESULTS*.md files..."
count=0
while IFS= read -r -d '' file; do
    if is_recent_file "$file"; then
        echo "   ⏭️  Keeping: $(basename "$file")"
    else
        echo "   📦 Archiving: $file"
        mv "$file" "$ARCHIVE_DIR/"
        ((count++))
    fi
done < <(find docs -type f -name "*RESULTS*.md" -print0 2>/dev/null)
echo "   ✅ Archived: $count files"
echo ""

# 4. Archive SESSION documents
echo "4️⃣  Processing SESSION_*.md files..."
count=0
while IFS= read -r -d '' file; do
    if is_recent_file "$file"; then
        echo "   ⏭️  Keeping: $(basename "$file")"
    else
        echo "   📦 Archiving: $file"
        mv "$file" "$ARCHIVE_DIR/"
        ((count++))
    fi
done < <(find docs -type f -name "SESSION_*.md" -print0 2>/dev/null)
echo "   ✅ Archived: $count files"
echo ""

# 5. Remove specific old fix docs
echo "5️⃣  Removing old fix documentation..."
OLD_FIX_FILES=(
    "docs/fixes/DEPLOYMENT-COMPLETE.txt"
    "docs/fixes/CRITICAL-FIXES-COMPLETE.md"
    "docs/fixes/deployment-complete.md"
    "docs/fixes/ACR-AMR-LOA-USA-HUB-COMPLETE.md"
    "docs/fixes/DYNAMIC-POLICY-DATA-COMPLETE.md"
    "docs/fixes/DEPLOYMENT-VERIFICATION-REPORT.md"
)

for file in "${OLD_FIX_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        echo "   📦 Archiving: $file"
        mv "$file" "$ARCHIVE_DIR/"
    fi
done
echo "   ✅ Done"
echo ""

# 6. Remove old security scan reports
echo "6️⃣  Removing old security scan reports..."
if [[ -f "docs/trivy-backend-report.txt" ]]; then
    echo "   📦 Archiving: docs/trivy-backend-report.txt"
    mv "docs/trivy-backend-report.txt" "$ARCHIVE_DIR/"
fi
echo "   ✅ Done"
echo ""

# 7. Archive root-level completion files
echo "7️⃣  Archiving root-level completion documents..."
ROOT_FILES=(
    "TERRAFORM_REFACTORING_COMPLETE.md"
    "HUB_DEPLOYMENT_FIXES_COMPLETE.md"
    "MODERNIZATION_COMPLETE.md"
    "TESTING_RESULTS.md"
)

for file in "${ROOT_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        echo "   📦 Archiving: $file"
        mv "$file" "$ARCHIVE_DIR/"
    fi
done
echo "   ✅ Done"
echo ""

# Count results
ARCHIVED_COUNT=$(find "$ARCHIVE_DIR" -type f 2>/dev/null | wc -l | tr -d ' ')
ARCHIVE_SIZE=$(du -sh "$ARCHIVE_DIR" 2>/dev/null | cut -f1)

echo "======================================"
echo "✅ PHASE 2 CLEANUP COMPLETE"
echo "======================================"
echo ""
echo "📊 Summary:"
echo "   📦 Files archived: $ARCHIVED_COUNT"
echo "   💾 Archive size: $ARCHIVE_SIZE"
echo "   📁 Location: $ARCHIVE_DIR/"
echo ""
echo "📦 Create compressed archive:"
echo "   tar czf ${ARCHIVE_DIR}.tar.gz $ARCHIVE_DIR/"
echo ""
echo "🧹 After verification, remove:"
echo "   rm -rf $ARCHIVE_DIR/"
echo ""
echo "🔍 Verify changes:"
echo "   git status | head -50"
echo ""
