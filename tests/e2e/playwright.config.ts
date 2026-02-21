/**
 * DIVE V3 - Playwright E2E Test Configuration (Secondary)
 *
 * This config is for the tests/e2e/ directory.
 * CI uses frontend/playwright.config.ts instead.
 *
 * @see https://playwright.dev/docs/test-configuration
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './',
  outputDir: '../../test-results/e2e-artifacts',
  globalSetup: './global-setup',
  fullyParallel: false,  // Run tests sequentially for auth flows
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 1,

  reporter: [
    ['html', { outputFolder: '../../test-results/e2e-report' }],
    ['json', { outputFile: '../../test-results/e2e-results.json' }],
    ['list'],
  ],

  use: {
    baseURL: process.env.FRONTEND_URL || (process.env.CI ? 'https://localhost:3000' : 'http://localhost:3000'),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,  // For self-signed certs in dev
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  // Chromium only — enable others with --project=firefox or --project=webkit
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  timeout: 60000,  // 60s per test (was 120s)

  expect: {
    timeout: 10000,
  },
});
