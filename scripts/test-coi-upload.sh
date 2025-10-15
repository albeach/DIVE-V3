#!/bin/bash
# Test COI Upload Fix
# Verifies that uploads with COI now work correctly

set -e

echo "🧪 Testing COI Upload Fix..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if backend is running
echo -e "${BLUE}📡 Checking backend status...${NC}"
if ! curl -s http://localhost:4000/health > /dev/null 2>&1; then
    echo -e "${RED}❌ Backend not running!${NC}"
    echo "Start backend:"
    echo "  cd backend && npm run dev"
    exit 1
fi
echo -e "${GREEN}✅ Backend running${NC}"
echo ""

# Enable debug logging
echo -e "${BLUE}🔍 Enabling debug logging for this test...${NC}"
export LOG_LEVEL=debug

echo -e "${YELLOW}📋 Test Instructions:${NC}"
echo ""
echo "1. Go to: http://localhost:3000/upload"
echo ""
echo "2. Check COI section header:"
echo "   - Should show: ✅ Your COIs: [list]"
echo "   - OR: ⚠️ You have no COI memberships"
echo ""
echo "3. Upload a test file with:"
echo "   - Classification: UNCLASSIFIED or SECRET"
echo "   - Countries: USA, GBR, CAN, AUS, NZL (FVEY countries)"
echo "   - COI: FVEY (if you have it)"
echo ""
echo "4. Watch terminal for debug logs showing:"
echo "   - uploaderCOI_type: 'object'"
echo "   - uploaderCOI_isArray: true"
echo "   - subject_acpCOI_isArray: true"
echo ""
echo "5. Expected Results:"
echo "   ✅ If you have FVEY: Upload succeeds"
echo "   ⚠️ If you don't have FVEY: Warning shown, remove COI to proceed"
echo "   ✅ If no COI selected: Upload succeeds"
echo ""

echo -e "${BLUE}📊 Watch backend logs in real-time:${NC}"
echo "  tail -f backend/logs/app.log | grep -E 'COI|upload'"
echo ""

echo -e "${GREEN}🚀 Ready to test! Follow instructions above.${NC}"
echo ""
echo "After testing, check logs for:"
echo "  1. 'Processing upload request' with uploaderCOI_isArray: true"
echo "  2. 'OPA input for upload' with subject_acpCOI_isArray: true"
echo "  3. 'Upload authorization decision' with allow: true"
echo ""

