#!/bin/bash
# DIVE V3 Optional Cleanup - Phase 3
# Created: 2026-01-25
# Purpose: Remove optional items based on usage analysis

WORKSPACE_ROOT="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3"
cd "$WORKSPACE_ROOT" || exit 1

echo "🗑️  DIVE V3 Optional Cleanup - Phase 3"
echo "========================================="
echo ""

# Create archive for items before removal
ARCHIVE_DIR="optional-items-archive-$(date +%Y%m%d)"
mkdir -p "$ARCHIVE_DIR"

# Function to archive and remove
archive_and_remove() {
    local item="$1"
    local description="$2"
    local size
    size=$(du -sh "$item" 2>/dev/null | cut -f1)
    
    if [[ -e "$item" ]]; then
        echo "📦 Archiving: $item ($size) - $description"
        tar czf "$ARCHIVE_DIR/$(basename "$item")-backup.tar.gz" "$item" 2>/dev/null
        rm -rf "$item"
        echo "   ✅ Removed"
    else
        echo "⏭️  Not found: $item"
    fi
    echo ""
}

# Recommended removals based on analysis:

echo "1️⃣  keycloak-docs-mcp/ (77MB) - MCP server for Cursor"
echo "   Recommendation: REMOVE - Large, can reference docs online"
archive_and_remove "keycloak-docs-mcp" "Keycloak MCP documentation server"

echo "2️⃣  examples/ (8.3MB) - STANAG test files"
echo "   Recommendation: REMOVE - Test data, not needed for core functionality"
archive_and_remove "examples" "STANAG 4774/4778 test files"

echo "3️⃣  external-idps/ (156KB) - Mock external IdPs"
echo "   Recommendation: KEEP - Useful for local development"
echo "   ⏭️  Skipping (keeping for dev)"
echo ""

echo "4️⃣  authzforce/ (76KB) - XACML PDP"
echo "   Recommendation: REMOVE - Optional Policies Lab feature, not used"
archive_and_remove "authzforce" "XACML PDP for Policies Lab"

echo "5️⃣  opentdf-mcp-pack/ (~10KB) - OpenTDF attribution"
echo "   Recommendation: REMOVE - Not using OpenTDF features"
archive_and_remove "opentdf-mcp-pack" "OpenTDF attribution"

echo "6️⃣  docs/monitoring/ (~50KB) - External monitoring configs"
echo "   Recommendation: REMOVE - Not using these external services"
archive_and_remove "docs/monitoring" "External monitoring service configs"

# Compress archive
if [[ -d "$ARCHIVE_DIR" ]]; then
    ARCHIVE_COUNT=$(find "$ARCHIVE_DIR" -name "*.tar.gz" | wc -l | tr -d ' ')
    if [[ $ARCHIVE_COUNT -gt 0 ]]; then
        echo "📦 Compressing archive..."
        tar czf "${ARCHIVE_DIR}.tar.gz" "$ARCHIVE_DIR"
        ARCHIVE_SIZE=$(du -sh "${ARCHIVE_DIR}.tar.gz" | cut -f1)
        rm -rf "$ARCHIVE_DIR"
        echo "   ✅ Created: ${ARCHIVE_DIR}.tar.gz ($ARCHIVE_SIZE)"
        echo ""
    fi
fi

echo "======================================"
echo "✅ PHASE 3 CLEANUP COMPLETE"
echo "======================================"
echo ""
echo "📊 Removed Items:"
echo "   • keycloak-docs-mcp/ (77MB)"
echo "   • examples/ (8.3MB)"
echo "   • authzforce/ (76KB)"
echo "   • opentdf-mcp-pack/ (~10KB)"
echo "   • docs/monitoring/ (~50KB)"
echo ""
echo "📦 Kept Items:"
echo "   • external-idps/ (useful for dev)"
echo "   • dive25-landing/ (public landing page)"
echo "   • status-page/ (status dashboard)"
echo ""
echo "💾 Total space saved: ~85MB"
echo ""
echo "📋 Archive created: ${ARCHIVE_DIR}.tar.gz"
echo "   Move to: ~/Documents/DIVE-V3-Archives/"
echo ""
