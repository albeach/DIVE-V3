#!/usr/bin/env bash
# =============================================================================
# Quick Validation: Orchestration Database Integration
# =============================================================================

set -eo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DIVE V3 Orchestration Database - Quick Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Database exists
echo -n "✓ Database exists ... "
if docker exec dive-hub-postgres psql -U postgres -l 2>/dev/null | grep -q orchestration; then
    echo -e "${GREEN}OK${NC}"
else
    echo "FAIL"
    exit 1
fi

# 2. Tables created
echo -n "✓ Tables created (7) ... "
TABLE_COUNT=$(docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)
if [ "$TABLE_COUNT" -eq 7 ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo "FAIL (found $TABLE_COUNT)"
    exit 1
fi

# 3. Helper functions work
echo -n "✓ Helper functions operational ... "
if docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c \
    "SELECT get_current_state('test');" 2>/dev/null | grep -q "UNKNOWN"; then
    echo -e "${GREEN}OK${NC}"
else
    echo "FAIL"
    exit 1
fi

# 4. Can insert test data
echo -n "✓ Can write state ... "
docker exec dive-hub-postgres psql -U postgres -d orchestration -c \
    "DELETE FROM deployment_states WHERE instance_code = 'tst';
     INSERT INTO deployment_states (instance_code, state) VALUES ('tst', 'DEPLOYING');" \
    >/dev/null 2>&1
if docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c \
    "SELECT state FROM deployment_states WHERE instance_code = 'tst';" 2>/dev/null | grep -q "DEPLOYING"; then
    echo -e "${GREEN}OK${NC}"
else
    echo "FAIL"
    exit 1
fi

# 5. Hub integration enabled
echo -n "✓ Hub deployment integrated ... "
if grep -q "ORCH_DB_ENABLED" scripts/dive-modules/hub/deploy.sh 2>/dev/null; then
    echo -e "${GREEN}OK${NC}"
else
    echo "FAIL"
    exit 1
fi

# Cleanup
docker exec dive-hub-postgres psql -U postgres -d orchestration -c \
    "DELETE FROM deployment_states WHERE instance_code = 'tst';" >/dev/null 2>&1

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ All Validation Checks PASSED${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next: Deploy hub to see database logging"
echo "  ./dive hub deploy"
echo ""
echo "View deployment history:"
echo "  docker exec dive-hub-postgres psql -U postgres -d orchestration -c \\"
echo "    \"SELECT state, timestamp FROM deployment_states WHERE instance_code = 'usa' ORDER BY timestamp DESC LIMIT 5;\""
echo ""
