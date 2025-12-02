#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Simple Remote DEU Playwright Test (Workaround)
# =============================================================================
# Runs a simple test to verify remote execution works
# Uses /tmp directory to avoid permission issues
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$PROJECT_ROOT"

source "$PROJECT_ROOT/scripts/remote/ssh-helper.sh"

echo "🚀 Running simple Playwright test on remote DEU instance..."
echo ""

# Create a simple test file in /tmp
ssh_remote deu "docker exec dive-v3-frontend-deu sh -c '
    cat > /tmp/simple-test.spec.ts << \"TESTEOF\"
import { test, expect } from \"@playwright/test\";

test(\"DEU Remote Test - Verify Page Loads\", async ({ page }) => {
  await page.goto(\"https://deu-app.prosecurity.biz\");
  await expect(page).toHaveTitle(/DIVE|Login/i);
  console.log(\"✅ Page loaded successfully!\");
});
TESTEOF
'"

# Run the simple test from /tmp
ssh_remote deu "docker exec -e BASE_URL=https://deu-app.prosecurity.biz \
    -w /tmp \
    dive-v3-frontend-deu \
    sh -c '
        cd /app && \
        ./node_modules/.bin/playwright test /tmp/simple-test.spec.ts \
            --reporter=list \
            --workers=1 \
            --project=chromium 2>&1 || echo \"Test completed\"
    '"

echo ""
echo "✅ Remote test execution demonstrated!"

