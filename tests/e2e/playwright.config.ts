/**
 * DIVE V3 - Playwright E2E Test Configuration
 * @see https://playwright.dev/docs/test-configuration
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './',
  fullyParallel: false,  // Run tests sequentially for auth flows
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,  // Single worker for auth state consistency
  
  reporter: [
    ['html', { outputFolder: '../../test-results/e2e-report' }],
    ['json', { outputFile: '../../test-results/e2e-results.json' }],
    ['list'],
  ],
  
  use: {
    baseURL: process.env.FRONTEND_URL || 'https://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,  // For self-signed certs in dev
    
    // Default timeout for actions
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  // Configure projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    // WebKit for Safari-like testing
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Global timeout
  timeout: 120000,  // 2 minutes per test
  
  // Expect timeout
  expect: {
    timeout: 10000,
  },

  // Web server configuration (optional - for CI)
  // webServer: {
  //   command: 'cd ../.. && docker compose up -d',
  //   url: 'https://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120000,
  // },
});

