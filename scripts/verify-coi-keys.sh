#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 - COI Keys Verification Script
# =============================================================================
# Verifies that COI Keys are properly initialized in the hub
# Auto-initializes if missing
# =============================================================================

set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DIVE_ROOT

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}🔍 Verifying COI Keys Database${NC}"
echo "=================================="
echo ""

# Check if backend container is running
BACKEND_CONTAINER="${BACKEND_CONTAINER:-dive-hub-backend}"
if ! docker ps --format '{{.Names}}' | grep -q "^${BACKEND_CONTAINER}$"; then
    echo -e "${RED}❌ Backend container not running: ${BACKEND_CONTAINER}${NC}"
    echo ""
    echo "Start the hub first: ./dive hub up"
    exit 1
fi

# Check COI Keys count via API
COI_COUNT=$(curl -ks https://localhost:4000/api/coi-keys/statistics 2>/dev/null | jq -r '.total // 0')
COUNTRY_COUNT=$(curl -ks https://localhost:4000/api/coi-keys/statistics 2>/dev/null | jq -r '.totalCountries // 0')

echo "📊 Current Status:"
echo "  COIs:      ${COI_COUNT}"
echo "  Countries: ${COUNTRY_COUNT}"
echo ""

# Expected minimums
MIN_COIS=15
MIN_COUNTRIES=40

if [ "$COI_COUNT" -ge "$MIN_COIS" ] && [ "$COUNTRY_COUNT" -ge "$MIN_COUNTRIES" ]; then
    echo -e "${GREEN}✅ COI Keys properly initialized!${NC}"
    echo ""
    echo "Sample COIs:"
    curl -ks https://localhost:4000/api/coi-keys 2>/dev/null | \
        jq -r '.cois[] | "\(.icon) \(.coiId) - \(.name) (\(.memberCountries | length) members)"' | \
        head -10
    echo ""
    echo "Countries include:"
    curl -ks https://localhost:4000/api/coi-keys/countries 2>/dev/null | \
        jq -r '.countries | join(", ")' | fold -s -w 70 | head -5
    echo "..."
    echo ""
    exit 0
else
    echo -e "${YELLOW}⚠️  COI Keys appear uninitialized or incomplete${NC}"
    echo ""
    echo "Expected: ≥${MIN_COIS} COIs, ≥${MIN_COUNTRIES} countries"
    echo "Found:    ${COI_COUNT} COIs, ${COUNTRY_COUNT} countries"
    echo ""
    echo -e "${CYAN}🔧 Auto-initializing COI Keys...${NC}"
    echo ""

    docker exec "$BACKEND_CONTAINER" npx tsx src/scripts/initialize-coi-keys.ts 2>&1 | tail -20

    if [ $? -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✅ COI Keys initialized successfully!${NC}"
        echo ""

        # Verify again
        NEW_COI_COUNT=$(curl -ks https://localhost:4000/api/coi-keys/statistics 2>/dev/null | jq -r '.total // 0')
        NEW_COUNTRY_COUNT=$(curl -ks https://localhost:4000/api/coi-keys/statistics 2>/dev/null | jq -r '.totalCountries // 0')

        echo "📊 New Status:"
        echo "  COIs:      ${NEW_COI_COUNT}"
        echo "  Countries: ${NEW_COUNTRY_COUNT}"
        echo ""
        exit 0
    else
        echo ""
        echo -e "${RED}❌ COI Keys initialization failed${NC}"
        echo ""
        echo "Manual fix:"
        echo "  docker exec ${BACKEND_CONTAINER} npx tsx src/scripts/initialize-coi-keys.ts"
        echo ""
        exit 1
    fi
fi

