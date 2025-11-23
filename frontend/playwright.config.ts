import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration for DIVE V3
 * 
 * Tests classification equivalency across 4 IdP realms (USA, FRA, DEU, CAN)
 * covering upload, viewing, authorization, and compliance dashboard scenarios.
 * 
 * CERTIFICATE STRATEGY:
 * - Local: Assumes docker-compose services are running (HTTPS at localhost:3000)
 * - CI: Uses HTTP server started manually in GitHub Actions workflow
 * 
 * To run locally:
 * 1. Start services: docker-compose up -d
 * 2. Run tests: npm run test:e2e
 * 
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    testDir: './src/__tests__/e2e',
    fullyParallel: false, // Run tests sequentially to avoid race conditions
    forbidOnly: !!process.env.CI, // Fail CI if test.only is committed
    retries: process.env.CI ? 2 : 0, // Retry failed tests in CI
    workers: 1, // Single worker to ensure clean state between tests
    reporter: [
        ['html', { outputFolder: 'playwright-report' }],
        ['json', { outputFile: 'playwright-report/results.json' }],
        ['list']
    ],

    use: {
        // Use Cloudflare Zero Trust tunnel URLs (running on remote computer)
        baseURL: process.env.BASE_URL || 'https://dev-app.dive25.com',
        trace: 'on-first-retry', // Collect trace on first retry
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        actionTimeout: 15000,
        navigationTimeout: 30000,
        // Cloudflare provides valid certificates
        ignoreHTTPSErrors: false,
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    /**
     * HYBRID WEB SERVER STRATEGY:
     * 
     * 1. CI Mode (process.env.CI):
     *    - Server started manually in GitHub Actions workflow
     *    - Uses HTTP via 'npm run dev:http'
     *    - webServer: undefined (no automatic startup)
     * 
     * 2. Local Docker Mode (default, recommended):
     *    - Assumes docker-compose services are already running
     *    - Tests connect to https://localhost:3000 (dive-v3-frontend container)
     *    - webServer: undefined (no automatic startup)
     *    - Run: docker-compose up -d && npm run test:e2e
     * 
     * 3. Local Standalone Mode (USE_STANDALONE=1):
     *    - Starts HTTP server directly (no docker, no certificates needed)
     *    - webServer: starts 'npm run dev:http'
     *    - Run: USE_STANDALONE=1 npm run test:e2e
     *    - NOTE: Requires all backend services available
     */
    webServer: process.env.CI || !process.env.USE_STANDALONE ? undefined : {
        command: 'npm run dev:http',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120000, // 2 minutes to start
        stdout: 'ignore',
        stderr: 'pipe',
    },
});

