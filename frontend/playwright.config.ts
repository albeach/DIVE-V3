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
    fullyParallel: true, // ✅ ENABLED: Run independent tests in parallel (40-50% faster CI)
    forbidOnly: !!process.env.CI, // Fail CI if test.only is committed
    retries: process.env.CI ? 2 : 0, // Retry failed tests in CI
    workers: process.env.CI ? 4 : 2, // ✅ INCREASED: 4 workers in CI, 2 locally
    reporter: [
        ['html', { outputFolder: 'playwright-report' }],
        ['json', { outputFile: 'playwright-report/results.json' }],
        ['list']
    ],

    use: {
        // Zero Trust Architecture: ALWAYS use HTTPS
        // Local development: HTTPS with self-signed certs (mkcert)
        // CI/Remote: HTTPS with valid Cloudflare certs
        // Note: localhost/127.0.0.1 acceptable in test config (same pattern as playwright docs)
        baseURL: process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL || (process.env.GITHUB_ACTIONS ? 'https://dev-app.dive25.com' : 'https://localhost:3000'),
        trace: 'on-first-retry', // Collect trace on first retry
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        actionTimeout: 15000,
        navigationTimeout: 30000,
        // Local: Accept self-signed certs (mkcert), GitHub Actions: Require valid certs
        // Uses GITHUB_ACTIONS instead of CI to avoid blocking local dev when CI=1 is set
        ignoreHTTPSErrors: !process.env.GITHUB_ACTIONS,
    },

    // ✅ Test timeout increased from 15s to 30s for complex flows (Keycloak, OPA, DB operations)
    timeout: 30000,

    // ✅ Test tag support for selective execution (e.g., TEST_TAG=@smoke npm test)
    grep: process.env.TEST_TAG ? new RegExp(process.env.TEST_TAG) : undefined,

    projects: [
        // ✅ Chromium only by default for faster CI (40-50% reduction)
        // Firefox and WebKit can be enabled via --project flag if needed
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        // Commented out for faster CI - enable manually with: --project=firefox
        // {
        //     name: 'firefox',
        //     use: { ...devices['Desktop Firefox'] },
        // },
        // Commented out for faster CI - enable manually with: --project=webkit
        // {
        //     name: 'webkit',
        //     use: { ...devices['Desktop Safari'] },
        // },
        // Hub Instance Tests - Chromium only (enable other browsers with --project flag)
        {
            name: 'hub-chromium',
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.HUB_FRONTEND_URL || 'https://localhost:3000'
            },
            testMatch: '**/hub/**/*.spec.ts',
        },
        // Spoke Instance Tests - Chromium only
        {
            name: 'spoke-fra-chromium',
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.FRA_FRONTEND_URL || 'http://localhost:3025'
            },
            testMatch: '**/spoke/fra/**/*.spec.ts',
        },
        {
            name: 'spoke-gbr-chromium',
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.GBR_FRONTEND_URL || 'http://localhost:3003'
            },
            testMatch: '**/spoke/gbr/**/*.spec.ts',
        },
        // Federation Tests - Chromium only
        {
            name: 'federation-chromium',
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.HUB_FRONTEND_URL || 'http://localhost:3000'
            },
            testMatch: '**/federation/**/*.spec.ts',
        },
    ],

    /**
     * HYBRID WEB SERVER STRATEGY:
     *
     * 1. CI Mode (process.env.CI):
     *    - Server started manually in GitHub Actions workflow
     *    - Uses HTTPS via Cloudflare tunnel
     *    - webServer: undefined (no automatic startup)
     *
     * 2. Local Docker Mode (default, recommended):
     *    - Assumes docker-compose services are already running
     *    - Tests connect to http://localhost:3000 (dive-v3-frontend container)
     *    - webServer: undefined (no automatic startup)
     *    - Run: docker-compose up -d && npm run test:e2e
     *
     * 3. Local Standalone Mode (USE_STANDALONE=1):
     *    - Starts HTTP server directly (no docker, no certificates needed)
     *    - webServer: starts 'npm run dev:http'
     *    - Run: USE_STANDALONE=1 npm run test:e2e
     *    - NOTE: Requires all backend services available
     *
     * 4. Hub-Spoke Mode (DIVE_INSTANCE=hub|fra|gbr|deu):
     *    - Tests run against specific instance
     *    - Use environment variables to configure URLs
     *    - Run: DIVE_INSTANCE=hub npm run test:e2e:hub
     *    - Run: DIVE_INSTANCE=fra npm run test:e2e:spoke
     */
    webServer: process.env.CI ? undefined : (process.env.USE_STANDALONE ? {
        command: 'npm run dev:http',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120000, // 2 minutes to start
        stdout: 'ignore',
        stderr: 'pipe',
    } : undefined),
});
