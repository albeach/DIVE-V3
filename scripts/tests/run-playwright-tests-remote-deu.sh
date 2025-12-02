#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Run Playwright Tests on Remote DEU Instance
# =============================================================================
# Syncs Playwright test files to DEU server and runs them remotely
#
# Usage:
#   ./scripts/tests/run-playwright-tests-remote-deu.sh [test-file]
#
# Examples:
#   ./scripts/tests/run-playwright-tests-remote-deu.sh comprehensive-feature-demo.spec.ts
#   ./scripts/tests/run-playwright-tests-remote-deu.sh remote-instance-setup.spec.ts
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$PROJECT_ROOT"

# Source SSH helper
source "$PROJECT_ROOT/scripts/remote/ssh-helper.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

REMOTE_DIR="/opt/dive-v3"
TEST_FILE="${1:-comprehensive-feature-demo.spec.ts}"

echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  DIVE V3 - Remote DEU Playwright Test Execution               ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Check remote instance health
echo -e "${BLUE}━━━ Step 1: Checking Remote DEU Instance Health ━━━${NC}"
if ssh_remote deu "docker ps --format '{{.Names}}' | grep -q dive-v3-frontend-deu"; then
    echo -e "${GREEN}✅ Remote DEU instance is running${NC}"
else
    echo -e "${RED}❌ Remote DEU instance not running${NC}"
    exit 1
fi
echo ""

# Step 2: Sync Playwright test files
echo -e "${BLUE}━━━ Step 2: Syncing Playwright Test Files to DEU Server ━━━${NC}"
echo "Syncing test files..."

# Create remote directories
ssh_remote deu "mkdir -p ${REMOTE_DIR}/frontend/src/__tests__/e2e/{helpers,pages,fixtures}"

# Sync test files
rsync_remote deu \
    "$PROJECT_ROOT/frontend/src/__tests__/e2e/${TEST_FILE}" \
    "${REMOTE_DIR}/frontend/src/__tests__/e2e/${TEST_FILE}"

# Sync helper files
rsync_remote deu \
    "$PROJECT_ROOT/frontend/src/__tests__/e2e/helpers/" \
    "${REMOTE_DIR}/frontend/src/__tests__/e2e/helpers/"

# Sync page objects
rsync_remote deu \
    "$PROJECT_ROOT/frontend/src/__tests__/e2e/pages/" \
    "${REMOTE_DIR}/frontend/src/__tests__/e2e/pages/"

# Sync fixtures
rsync_remote deu \
    "$PROJECT_ROOT/frontend/src/__tests__/e2e/fixtures/" \
    "${REMOTE_DIR}/frontend/src/__tests__/e2e/fixtures/"

# Sync Playwright config
rsync_remote deu \
    "$PROJECT_ROOT/frontend/playwright.config.ts" \
    "${REMOTE_DIR}/frontend/playwright.config.ts"

echo -e "${GREEN}✅ Test files synced${NC}"
echo ""

# Step 3: Setup test environment in frontend container
echo -e "${BLUE}━━━ Step 3: Setting Up Test Environment ━━━${NC}"
echo "Creating test-results directory with proper permissions..."
ssh_remote deu "docker exec -u root dive-v3-frontend-deu sh -c '
    mkdir -p /tmp/test-results /tmp/playwright-report /app/test-results /app/playwright-report && \
    chmod -R 777 /tmp/test-results /tmp/playwright-report /app/test-results /app/playwright-report && \
    chown -R nextjs:nextjs /tmp/test-results /tmp/playwright-report /app/test-results /app/playwright-report 2>/dev/null || true
'" || echo -e "${YELLOW}⚠️  Could not set permissions${NC}"

# Check if Playwright is available locally (in node_modules)
if ssh_remote deu "docker exec dive-v3-frontend-deu test -f /app/node_modules/.bin/playwright" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Playwright found in node_modules${NC}"
else
    echo "Playwright not found - checking package.json..."
    if ssh_remote deu "docker exec dive-v3-frontend-deu grep -q '@playwright/test' /app/package.json" >/dev/null 2>&1; then
        echo "Installing Playwright dependencies..."
        ssh_remote deu "docker exec dive-v3-frontend-deu sh -c 'cd /app && npm install'"
    else
        echo -e "${YELLOW}⚠️  Playwright not in package.json - tests may fail${NC}"
    fi
fi

# Install Chromium system dependencies (Alpine Linux)
echo "Installing Chromium system dependencies for Alpine..."
ssh_remote deu "docker exec -u root dive-v3-frontend-deu sh -c '
    apk add --no-cache \
        chromium \
        nss \
        freetype \
        harfbuzz \
        ca-certificates \
        ttf-freefont \
        2>&1 | tail -5 || echo \"Dependencies already installed or failed\"
'" || echo "⚠️  Could not install system dependencies"

# Find system Chromium path
CHROMIUM_PATH=$(ssh_remote deu "docker exec dive-v3-frontend-deu sh -c 'which chromium || which chromium-browser || echo /usr/bin/chromium'" | tail -1)
echo "System Chromium found at: ${CHROMIUM_PATH:-not found}"

# Create symlink from Playwright's expected browser location to system Chromium
echo "Creating symlink for Playwright browser detection..."
ssh_remote deu "docker exec -u root dive-v3-frontend-deu sh -c '
    mkdir -p /app/node_modules/playwright-core/.local-browsers/chromium_headless_shell-1194/chrome-linux && \
    ln -sf /usr/bin/chromium /app/node_modules/playwright-core/.local-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell && \
    echo \"✅ Symlink created: Playwright browser -> system Chromium\"
'" || echo "⚠️  Could not create symlink"

# Install Playwright browsers (fallback if system Chromium doesn't work)
echo "Installing Playwright Chromium browser..."
ssh_remote deu "docker exec -e PLAYWRIGHT_BROWSERS_PATH=/tmp/.playwright dive-v3-frontend-deu sh -c '
    cd /app && \
    export PLAYWRIGHT_BROWSERS_PATH=/tmp/.playwright && \
    mkdir -p /tmp/.playwright && \
    ./node_modules/.bin/playwright install chromium 2>&1 | tail -10 || \
    npx playwright install chromium 2>&1 | tail -10
'"
echo ""

# Step 4: Run Playwright tests
echo -e "${BLUE}━━━ Step 4: Running Playwright Tests on Remote DEU Instance ━━━${NC}"
echo "Test file: ${TEST_FILE}"
echo "Remote URL: https://deu-app.prosecurity.biz"
echo ""

# Run tests in frontend container with proper environment and permissions
echo "Setting up directories with proper permissions using sudo..."
# Get user info first
USER_INFO=$(ssh_remote deu "docker exec dive-v3-frontend-deu sh -c 'id -u && id -g && whoami'")
USER_ID=$(echo "$USER_INFO" | head -1)
GROUP_ID=$(echo "$USER_INFO" | head -2 | tail -1)
ACTUAL_USER=$(echo "$USER_INFO" | tail -1)
echo "User: $ACTUAL_USER (uid=$USER_ID, gid=$GROUP_ID)"

# Now set permissions with root access
ssh_remote deu "docker exec -u root dive-v3-frontend-deu sh -c '
    cd /app && \
    # Remove existing directories
    rm -rf /app/test-results /app/playwright-report 2>/dev/null || true && \
    # Create directories
    mkdir -p /app/test-results /app/playwright-report /tmp/.playwright && \
    # Set permissions - make them writable by the user
    chmod -R 777 /app/test-results /app/playwright-report && \
    chown -R ${USER_ID}:${GROUP_ID} /app/test-results /app/playwright-report && \
    # Verify
    ls -ld /app/test-results /app/playwright-report && \
    echo \"✅ Directories created with proper permissions for user ${ACTUAL_USER}\"
'"

# Create custom config that uses /tmp to avoid permission issues and system Chromium
echo "Creating custom Playwright config for remote execution with system Chromium..."
ssh_remote deu "docker exec dive-v3-frontend-deu sh -c '
    cat > /tmp/playwright-remote.config.js << \"CONFIGEOF\"
module.exports = {
  testDir: \"/app/src/__tests__/e2e\",
  outputDir: \"/tmp/test-results\",
  reporter: [[\"list\"]],
  use: {
    baseURL: process.env.BASE_URL || \"https://deu-app.prosecurity.biz\",
    executablePath: \"/usr/bin/chromium\",
  },
  projects: [{ 
    name: \"chromium\", 
    use: {
      executablePath: \"/usr/bin/chromium\",
      // Desktop Chrome viewport settings
      viewport: { width: 1280, height: 720 },
      userAgent: \"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36\",
    } 
  }],
};
CONFIGEOF
    echo \"✅ Custom config created with system Chromium\"
'"

# Run tests with custom config - force use of system Chromium via environment variable
ssh_remote deu "docker exec -e BASE_URL=https://deu-app.prosecurity.biz \
    -e TEST_USER_PASSWORD=TestUser2025!Pilot \
    -e PLAYWRIGHT_BROWSERS_PATH=0 \
    -e PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
    -w /app \
    dive-v3-frontend-deu \
    sh -c '
        cd /app && \
        export PLAYWRIGHT_BROWSERS_PATH=0 && \
        export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium && \
        mkdir -p /tmp/test-results /tmp/playwright-report && \
        echo \"🚀 Running Playwright tests on remote DEU instance...\" && \
        echo \"Test file: ${TEST_FILE}\" && \
        echo \"Base URL: https://deu-app.prosecurity.biz\" && \
        echo \"Using system Chromium: /usr/bin/chromium\" && \
        echo \"PLAYWRIGHT_BROWSERS_PATH: \$PLAYWRIGHT_BROWSERS_PATH\" && \
        echo \"PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: \$PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH\" && \
        echo \"\" && \
        if [ -f node_modules/.bin/playwright ]; then
            ./node_modules/.bin/playwright test src/__tests__/e2e/${TEST_FILE} \
                --config=/tmp/playwright-remote.config.js \
                --workers=1 \
                --reporter=list 2>&1
        elif command -v npx >/dev/null 2>&1; then
            npx playwright test src/__tests__/e2e/${TEST_FILE} \
                --config=/tmp/playwright-remote.config.js \
                --workers=1 \
                --reporter=list 2>&1
        else
            npm run test:e2e -- src/__tests__/e2e/${TEST_FILE} --config=/tmp/playwright-remote.config.js --reporter=list --workers=1 2>&1
        fi
    '"

RESULT=$?

echo ""
if [ $RESULT -eq 0 ]; then
    echo -e "${GREEN}✅ Playwright tests completed successfully on remote DEU instance!${NC}"
else
    echo -e "${YELLOW}⚠️  Playwright tests completed with exit code: $RESULT${NC}"
    echo "Check output above for details"
fi

exit $RESULT

