#!/bin/bash

# Script to verify and fix translation cache issues
# Usage: ./scripts/fix-translation-cache.sh

echo "🔧 DIVE V3 Translation Cache Fixer"
echo "=================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "frontend/package.json" ]; then
    echo -e "${RED}❌ Error: Must run from project root${NC}"
    exit 1
fi

echo "📋 Step 1: Clearing Next.js build cache..."
cd frontend
if [ -d ".next" ]; then
    rm -rf .next
    echo -e "${GREEN}✅ Cleared .next folder${NC}"
else
    echo -e "${YELLOW}⚠️  .next folder not found (may already be clean)${NC}"
fi

echo ""
echo "📋 Step 2: Clearing node modules cache..."
if [ -d "node_modules/.cache" ]; then
    rm -rf node_modules/.cache
    echo -e "${GREEN}✅ Cleared node_modules/.cache${NC}"
else
    echo -e "${YELLOW}⚠️  node_modules/.cache not found${NC}"
fi

echo ""
echo "📋 Step 3: Verifying translation files..."

# Check if translation files exist
TRANSLATIONS_OK=true

for lang in en fr; do
    for namespace in common dashboard resources policies; do
        file="src/locales/${lang}/${namespace}.json"
        if [ -f "$file" ]; then
            echo -e "${GREEN}✅ ${file}${NC}"
        else
            echo -e "${RED}❌ Missing: ${file}${NC}"
            TRANSLATIONS_OK=false
        fi
    done
done

if [ "$TRANSLATIONS_OK" = true ]; then
    echo -e "\n${GREEN}✅ All translation files present${NC}"
else
    echo -e "\n${RED}❌ Some translation files are missing${NC}"
    exit 1
fi

echo ""
echo "📋 Step 4: Checking translation structure..."

# Use jq if available to validate JSON
if command -v jq &> /dev/null; then
    echo "Validating JSON structure..."
    for file in src/locales/en/*.json; do
        if jq empty "$file" 2>/dev/null; then
            echo -e "${GREEN}✅ $(basename $file) - Valid JSON${NC}"
        else
            echo -e "${RED}❌ $(basename $file) - Invalid JSON${NC}"
        fi
    done
else
    echo -e "${YELLOW}⚠️  jq not found, skipping JSON validation${NC}"
    echo "   Install jq: brew install jq (Mac) or apt install jq (Linux)"
fi

echo ""
echo "📋 Step 5: Summary & Next Steps"
echo "================================"
echo ""
echo -e "${GREEN}✅ Translation cache cleared successfully${NC}"
echo ""
echo "Next steps:"
echo "1. Restart your Next.js dev server if it's running"
echo "2. Hard refresh your browser (Cmd+Shift+R on Mac)"
echo "3. Check browser console - translation warnings should be gone"
echo ""
echo "If warnings persist:"
echo "• Clear browser cache completely"
echo "• Try incognito/private browsing mode"
echo "• Check that useTranslation hook has been updated with cache-busting"
echo ""
echo -e "${YELLOW}Note: The fix disables translation caching in development mode${NC}"
echo "      This means translations will always load fresh during development."
echo ""

cd ..
