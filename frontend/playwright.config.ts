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
        // Zero Trust Architecture: ALWAYS use HTTPS
        // Local development: HTTPS with self-signed certs (mkcert)
        // CI/Remote: HTTPS with valid Cloudflare certs
        // Note: localhost is acceptable in test configuration files
        baseURL: process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL || (process.env.CI ? 'https://dev-app.dive25.com' : 'https://localhost:3000'),
        trace: 'on-first-retry', // Collect trace on first retry
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        actionTimeout: 15000,
        navigationTimeout: 30000,
        // Local: Ignore self-signed certs (mkcert), Remote: Valid Cloudflare certs
        ignoreHTTPSErrors: !process.env.CI,
    },

    projects: [
        // Chromium (Chrome) - Default
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        // Firefox - Multi-browser support
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        // WebKit (Safari) - Multi-browser support
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
        },
        // Hub Instance Tests - Multi-browser
        {
            name: 'hub-chromium',
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.HUB_FRONTEND_URL || 'https://localhost:3000'
            },
            testMatch: '**/hub/**/*.spec.ts',
        },
        {
            name: 'hub-firefox',
            use: {
                ...devices['Desktop Firefox'],
                baseURL: process.env.HUB_FRONTEND_URL || 'https://localhost:3000'
            },
            testMatch: '**/hub/**/*.spec.ts',
        },
        {
            name: 'hub-webkit',
            use: {
                ...devices['Desktop Safari'],
                baseURL: process.env.HUB_FRONTEND_URL || 'http://localhost:3000'
            },
            testMatch: '**/hub/**/*.spec.ts',
        },
        // Spoke Instance Tests - Multi-browser
        {
            name: 'spoke-fra-chromium',
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.FRA_FRONTEND_URL || 'http://localhost:3025'
            },
            testMatch: '**/spoke/fra/**/*.spec.ts',
        },
        {
            name: 'spoke-fra-firefox',
            use: {
                ...devices['Desktop Firefox'],
                baseURL: process.env.FRA_FRONTEND_URL || 'http://localhost:3025'
            },
            testMatch: '**/spoke/fra/**/*.spec.ts',
        },
        {
            name: 'spoke-fra-webkit',
            use: {
                ...devices['Desktop Safari'],
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
        {
            name: 'spoke-gbr-firefox',
            use: {
                ...devices['Desktop Firefox'],
                baseURL: process.env.GBR_FRONTEND_URL || 'http://localhost:3003'
            },
            testMatch: '**/spoke/gbr/**/*.spec.ts',
        },
        {
            name: 'spoke-gbr-webkit',
            use: {
                ...devices['Desktop Safari'],
                baseURL: process.env.GBR_FRONTEND_URL || 'http://localhost:3003'
            },
            testMatch: '**/spoke/gbr/**/*.spec.ts',
        },
        // Federation Tests (cross-instance) - Multi-browser
        {
            name: 'federation-chromium',
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.HUB_FRONTEND_URL || 'http://localhost:3000'
            },
            testMatch: '**/federation/**/*.spec.ts',
        },
        {
            name: 'federation-firefox',
            use: {
                ...devices['Desktop Firefox'],
                baseURL: process.env.HUB_FRONTEND_URL || 'http://localhost:3000'
            },
            testMatch: '**/federation/**/*.spec.ts',
        },
        {
            name: 'federation-webkit',
            use: {
                ...devices['Desktop Safari'],
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
