#!/bin/bash

# Simple Multi-IdP Test Script
# Prepares system and opens browser for testing

echo "🔧 Preparing DIVE V3 for Multi-IdP Testing..."
echo ""

# 1. Clean frontend
echo "1. Cleaning frontend build..."
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend
rm -rf .next
echo "✅ Frontend cleaned"
echo ""

# 2. Start frontend in background
echo "2. Starting frontend server..."
npm run dev > /dev/null 2>&1 &
FRONTEND_PID=$!
echo "✅ Frontend starting (PID: $FRONTEND_PID)"
echo "⏳ Waiting for frontend to be ready (10 seconds)..."
sleep 10
echo ""

# 3. Verify frontend is up
if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ Frontend ready at http://localhost:3000"
else
    echo "❌ Frontend not responding"
    echo "Try manually: cd frontend && npm run dev"
    exit 1
fi
echo ""

# 4. Open browser
echo "3. Opening browser..."
open http://localhost:3000
echo "✅ Browser opened"
echo ""

echo "========================================"
echo "✅ System Ready for Testing!"
echo "========================================"
echo ""
echo "Test Credentials:"
echo ""
echo "🇫🇷 France IdP:"
echo "   Username: testuser-fra"
echo "   Password: Password123!"
echo "   Expected: FRA, SECRET, [NATO-COSMIC]"
echo ""
echo "🇨🇦 Canada IdP:"
echo "   Username: testuser-can"
echo "   Password: Password123!"
echo "   Expected: CAN, CONFIDENTIAL, [CAN-US]"
echo ""
echo "🏢 Industry IdP (with enrichment):"
echo "   Username: bob.contractor"
echo "   Password: Password123!"
echo "   Expected: USA (enriched), UNCLASSIFIED (enriched)"
echo ""
echo "Monitor enrichment logs:"
echo "   docker-compose logs -f backend | grep enrichment"
echo ""
echo "========================================"
echo "Click an IdP button to start testing!"
echo "========================================"

