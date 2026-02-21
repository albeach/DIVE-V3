#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# OPAL Git Integration Test Script
# ============================================================================
# Tests the new GitHub-based OPAL policy distribution workflow
# following official OPAL architecture: Admin → Git → OPAL → Clients → OPA

echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                           ║"
echo "║    OPAL GIT INTEGRATION TEST - Official Architecture Verification        ║"
echo "║                                                                           ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Verify OPAL is configured for Git
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1: Verify OPAL Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if ! docker ps | grep -q "dive-hub-opal-server"; then
    echo "❌ OPAL server not running. Start with: ./dive up hub"
    exit 1
fi

echo "✅ OPAL server is running"

REPO_URL=$(docker exec dive-hub-opal-server env | grep OPAL_POLICY_REPO_URL | cut -d'=' -f2)
echo "📍 Repository URL: $REPO_URL"

if [[ "$REPO_URL" == *"github.com"* ]]; then
    echo "✅ Using GitHub repository (correct!)"
elif [[ "$REPO_URL" == "file://"* ]]; then
    echo "❌ Still using file:// mount. Configuration not applied."
    echo "   Run: ./dive down hub && ./dive up hub"
    exit 1
else
    echo "⚠️  Unknown repository type: $REPO_URL"
fi

POLLING_INTERVAL=$(docker exec dive-hub-opal-server env | grep OPAL_POLICY_REPO_POLLING_INTERVAL | cut -d'=' -f2)
echo "⏱️  Polling interval: ${POLLING_INTERVAL}s"
echo ""

# Step 2: Check current commit in policies repo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: Check Current Policy Commit"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd policies
CURRENT_SHA=$(git rev-parse --short HEAD)
CURRENT_MSG=$(git log -1 --pretty=%B | head -1)
echo "📝 Current commit: $CURRENT_SHA"
echo "💬 Message: $CURRENT_MSG"
echo ""

# Step 3: Watch OPAL startup logs
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3: OPAL Startup Logs (Last 30 lines)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

docker logs --tail 30 dive-hub-opal-server 2>&1 | grep -E "INFO|ERROR|WARNING|policy|git|repo" || echo "(No matching log entries yet)"
echo ""

# Step 4: Make a test commit
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 4: Create Test Policy Change"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
TEST_COMMENT="# OPAL Git Integration Test: $TIMESTAMP"

echo "$TEST_COMMENT" >> base/common.rego
git add base/common.rego
git commit -m "test(opal): Git integration verification - $TIMESTAMP"
NEW_SHA=$(git rev-parse --short HEAD)

echo "✅ Created test commit: $NEW_SHA"
echo "📤 Pushing to GitHub..."

if git push origin master; then
    echo "✅ Pushed to GitHub successfully"
else
    echo "❌ Failed to push. Check GitHub authentication."
    echo "   You may need to: git config credential.helper store"
    git reset HEAD~1
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 5: Monitor OPAL for Detection (${POLLING_INTERVAL}s + buffer)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⏳ Waiting for OPAL to detect commit change..."
echo "   OPAL polls every ${POLLING_INTERVAL}s. Watching logs for 40 seconds..."
echo ""

# Watch logs for 40 seconds to catch polling cycle
docker logs -f --since 5s dive-hub-opal-server 2>&1 &
LOGS_PID=$!

sleep 40
kill $LOGS_PID 2>/dev/null || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 6: Verification Checklist"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check for specific log patterns
echo "Looking for key log patterns..."
echo ""

RECENT_LOGS=$(docker logs --since 45s dive-hub-opal-server 2>&1)

if echo "$RECENT_LOGS" | grep -qi "policy"; then
    echo "✅ Found 'policy' in logs"
else
    echo "⚠️  No 'policy' keyword found"
fi

if echo "$RECENT_LOGS" | grep -qi "git\|clone\|fetch\|repo"; then
    echo "✅ Found Git operations in logs"
else
    echo "⚠️  No Git operations found"
fi

if echo "$RECENT_LOGS" | grep -qi "broadcast\|publish"; then
    echo "✅ Found broadcast activity"
else
    echo "⚠️  No broadcast activity found"
fi

if echo "$RECENT_LOGS" | grep -qi "$NEW_SHA"; then
    echo "✅ Found new commit SHA: $NEW_SHA"
else
    echo "⚠️  New commit SHA not detected yet"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 7: OPAL Statistics"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if curl -sk https://localhost:7002/statistics 2>/dev/null | jq . 2>/dev/null; then
    echo "✅ OPAL statistics endpoint reachable"
else
    echo "⚠️  Could not fetch OPAL statistics"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                           ║"
echo "║    TEST COMPLETE - Review logs above                                      ║"
echo "║                                                                           ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 SUMMARY:"
echo "  • Old commit: $CURRENT_SHA"
echo "  • New commit: $NEW_SHA"
echo "  • Repository: $REPO_URL"
echo "  • Polling interval: ${POLLING_INTERVAL}s"
echo ""
echo "🔍 NEXT STEPS:"
echo "  1. Check UI Live Log Viewer: https://localhost:3000/admin/policies"
echo "  2. Watch continuous logs: docker logs -f dive-hub-opal-server"
echo "  3. Make another change and observe faster detection"
echo ""
echo "📖 WHAT TO EXPECT:"
echo "  • [INFO] Polling policy repository..."
echo "  • [INFO] Policy update detected"
echo "  • [INFO] Old commit: $CURRENT_SHA → New commit: $NEW_SHA"
echo "  • [INFO] Broadcasting policy update"
echo "  • [INFO] Published to Redis: opal:policy_update"
echo "  • [INFO] Notified N clients"
echo ""
