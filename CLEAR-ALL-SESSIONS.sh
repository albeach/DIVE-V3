#!/bin/bash

# Clear All Sessions - Complete Reset
# Date: October 21, 2025
# Purpose: Delete all database sessions, browser cookies, and frontend cache

set -e

echo "🧹 Clearing All Sessions - Complete Reset"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Delete all sessions from PostgreSQL database
echo "📍 Step 1: Clearing PostgreSQL sessions table..."
docker exec -it dive-v3-postgres psql -U postgres -d dive_v3_app -c "DELETE FROM sessions;" || {
    echo -e "${YELLOW}⚠️  Could not clear sessions (database might be empty or not running)${NC}"
}
docker exec -it dive-v3-postgres psql -U postgres -d dive_v3_app -c "DELETE FROM accounts;" || {
    echo -e "${YELLOW}⚠️  Could not clear accounts (database might be empty or not running)${NC}"
}
docker exec -it dive-v3-postgres psql -U postgres -d dive_v3_app -c "DELETE FROM users;" || {
    echo -e "${YELLOW}⚠️  Could not clear users (database might be empty or not running)${NC}"
}
echo -e "${GREEN}✅ Database sessions cleared${NC}"
echo ""

# Step 2: Clear frontend .next cache
echo "📍 Step 2: Clearing frontend build cache..."
if [ -d "/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend/.next" ]; then
    rm -rf /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend/.next
    echo -e "${GREEN}✅ Frontend .next cache deleted${NC}"
else
    echo -e "${YELLOW}⚠️  .next directory not found (already clean)${NC}"
fi
echo ""

# Step 3: Instructions for browser
echo "📍 Step 3: Clear browser cookies (MANUAL STEP):"
echo ""
echo "  1. Open http://localhost:3000 in browser"
echo "  2. Open DevTools (F12 or Cmd+Option+I)"
echo "  3. Go to: Application > Storage"
echo "  4. Click 'Clear site data' button"
echo "  5. Close all localhost:3000 tabs"
echo "  6. Close DevTools"
echo ""
echo "  OR use this Chrome command:"
echo "  chrome://settings/siteData?searchSubpage=localhost:3000"
echo ""

echo "=========================================="
echo "🎉 Session cleanup complete!"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "  1. Clear browser cookies (see above)"
echo "  2. Restart frontend: cd frontend && npm run dev"
echo "  3. Open http://localhost:3000 (should show login page)"
echo "  4. Login fresh"
echo "  5. Try accessing documents"
echo ""


