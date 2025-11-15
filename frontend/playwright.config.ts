import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration for DIVE V3
 * 
 * Tests classification equivalency across 4 IdP realms (USA, FRA, DEU, CAN)
 * covering upload, viewing, authorization, and compliance dashboard scenarios.
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
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry', // Collect trace on first retry
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        actionTimeout: 15000,
        navigationTimeout: 30000,
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    /**
     * Start dev server before running tests (only if not already running)
     * In CI, we manually start the server, so skip this
     */
    webServer: process.env.CI ? undefined : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120000, // 2 minutes to start
        stdout: 'ignore',
        stderr: 'pipe',
    },
});

