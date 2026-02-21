#!/usr/bin/env node
/**
 * Dynamic Playwright Configuration Generator
 *
 * Generates Playwright config based on running Docker instances
 * Called by dynamic-test-runner.sh to create instance-specific configs
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Import Playwright devices (we'll use a simple fallback if not available)
let devices;
try {
  devices = require('@playwright/test').devices;
} catch (error) {
  // Fallback device configuration if Playwright isn't available
  devices = {
    'Desktop Chrome': {
      name: 'Desktop Chrome',
      use: {
        channel: 'chrome',
      },
    },
  };
}

// Configuration
const DIVE_ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(DIVE_ROOT, 'frontend');

// Instance mapping (Docker name prefix -> instance code)
const INSTANCE_MAPPING = {
  alb: 'alb',
  dnk: 'dnk',
  gbr: 'gbr',
  rou: 'rou',
  // Add more as needed
};

// Display names for instances
const INSTANCE_NAMES = {
  alb: 'Albania',
  dnk: 'Denmark',
  gbr: 'United Kingdom',
  rou: 'Romania',
  hub: 'DIVE Hub',
  usa: 'United States',
  fra: 'France',
  deu: 'Germany',
  can: 'Canada',
};

/**
 * Detect running instances from Docker
 */
function detectRunningInstances() {
  try {
    const output = execSync('docker ps --format "table {{.Names}}|{{.Ports}}"', { encoding: 'utf8' });
    const lines = output.trim().split('\n').slice(1); // Skip header

    const instances = new Map();
    const instanceUrls = {};

    for (const line of lines) {
      const [name, ports] = line.split('|');

      // Check for hub instance
      if (name.startsWith('dive-hub-frontend')) {
        instances.set('hub', { type: 'hub' });
        instanceUrls.hub_frontend = 'https://localhost:3000';
        instanceUrls.hub_backend = 'https://localhost:4000';
        continue;
      }

      // Check for spoke instances (pattern: xxx-frontend-xxx-1)
      const spokeMatch = name.match(/^([a-z]{3})-(frontend|backend)-([a-z]{3})-.*/);
      if (spokeMatch) {
        const [, instanceCode, serviceType] = spokeMatch;

        if (!instances.has(instanceCode)) {
          instances.set(instanceCode, { type: 'spoke' });
        }

        // Extract port
        const portMatch = ports.match(/0\.0\.0\.0:(\d+)->/);
        if (portMatch) {
          const port = portMatch[1];
          instanceUrls[`${instanceCode}_${serviceType}`] = `https://localhost:${port}`;
        }
      }
    }

    return { instances, instanceUrls };
  } catch (error) {
    console.error('Failed to detect running instances:', error.message);
    process.exit(1);
  }
}

/**
 * Generate Playwright project configuration for an instance
 */
function generateInstanceProject(instanceCode, instanceInfo, instanceUrls) {
  const displayName = INSTANCE_NAMES[instanceCode] || instanceCode.toUpperCase();
  const frontendUrl = instanceUrls[`${instanceCode}_frontend`] || `https://localhost:300${instanceCode === 'hub' ? '0' : instanceCode.charCodeAt(0) - 97}`;
  const backendUrl = instanceUrls[`${instanceCode}_backend`] || frontendUrl.replace('300', '400');

  return {
    name: `${instanceCode}-chromium`,
    use: {
      ...devices['Desktop Chrome'],
      baseURL: frontendUrl,
    },
    testMatch: `**/dynamic/${instanceCode}/**/*.spec.ts`,
    metadata: {
      instance: instanceCode,
      displayName,
      frontendUrl,
      backendUrl,
      type: instanceInfo.type,
    },
  };
}

/**
 * Generate federation project configuration
 */
function generateFederationProject(instances, instanceUrls) {
  // Use hub as the primary instance for federation tests
  const hubUrl = instanceUrls.hub_frontend || 'https://localhost:3000';

  return {
    name: 'federation-chromium',
    use: {
      ...devices['Desktop Chrome'],
      baseURL: hubUrl,
    },
    testMatch: '**/federation/**/*.spec.ts',
    metadata: {
      type: 'federation',
      instances: Array.from(instances.keys()),
      hubUrl,
    },
  };
}

/**
 * Generate dynamic Playwright configuration
 */
function generatePlaywrightConfig() {
  const { instances, instanceUrls } = detectRunningInstances();

  console.log(`🎯 Detected ${instances.size} running instances:`);
  for (const [code, info] of instances) {
    const name = INSTANCE_NAMES[code] || code.toUpperCase();
    console.log(`   ${code}: ${name} (${info.type})`);
  }

  // Generate projects for each instance
  const projects = [];

  // Add individual instance projects
  for (const [instanceCode, instanceInfo] of instances) {
    projects.push(generateInstanceProject(instanceCode, instanceInfo, instanceUrls));
  }

  // Add federation project if hub exists
  if (instances.has('hub')) {
    projects.push(generateFederationProject(instances, instanceUrls));
  }

  // Generate the full config
  const config = {
    testDir: './src/__tests__/e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: [
      ['html', { outputFolder: 'playwright-report' }],
      ['json', { outputFile: 'playwright-report/results.json' }],
      ['list']
    ],
    use: {
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
      video: 'retain-on-failure',
      actionTimeout: 15000,
      navigationTimeout: 30000,
      ignoreHTTPSErrors: true, // For self-signed certs
    },
    projects,
    metadata: {
      generatedAt: new Date().toISOString(),
      detectedInstances: Array.from(instances.keys()),
      instanceUrls,
    },
  };

  return config;
}

/**
 * Write configuration to file
 */
function writeConfig(config, outputPath) {
  const configContent = `// Auto-generated Playwright config for running instances
// Generated: ${new Date().toISOString()}
// Instances: ${config.metadata.detectedInstances.join(', ')}

import { defineConfig, devices } from '@playwright/test';

export default defineConfig(${JSON.stringify(config, null, 2)});
`;

  fs.writeFileSync(outputPath, configContent, 'utf8');
  console.log(`📝 Generated config: ${outputPath}`);
}

/**
 * Create instance-specific test directories
 */
function createInstanceTestDirs(instances) {
  const dynamicTestDir = path.join(FRONTEND_DIR, 'src/__tests__/e2e/dynamic');

  if (!fs.existsSync(dynamicTestDir)) {
    fs.mkdirSync(dynamicTestDir, { recursive: true });
  }

  // Create a basic test file for each instance
  for (const instanceCode of instances.keys()) {
    const instanceDir = path.join(dynamicTestDir, instanceCode);
    const testFile = path.join(instanceDir, 'basic.spec.ts');

    if (!fs.existsSync(instanceDir)) {
      fs.mkdirSync(instanceDir, { recursive: true });
    }

    if (!fs.existsSync(testFile)) {
      const displayName = INSTANCE_NAMES[instanceCode] || instanceCode.toUpperCase();
      const testContent = `/**
 * Auto-generated basic tests for ${displayName} instance
 */

import { test, expect } from '@playwright/test';

test.describe('${displayName} Instance - Basic Functionality', () => {
  test('instance is accessible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('instance shows correct branding', async ({ page }) => {
    await page.goto('/');
    // Add instance-specific branding checks here
  });

  test('instance health check', async ({ page }) => {
    const response = await page.request.get('/api/health');
    expect(response.status()).toBe(200);
  });
});
`;

      fs.writeFileSync(testFile, testContent, 'utf8');
      console.log(`📄 Created test file: ${testFile}`);
    }
  }
}

/**
 * Main execution
 */
function main() {
  console.log('🔍 Scanning for running DIVE instances...');

  const config = generatePlaywrightConfig();
  const configPath = path.join(FRONTEND_DIR, 'playwright.dynamic.config.ts');

  writeConfig(config, configPath);

  const { instances } = detectRunningInstances();
  createInstanceTestDirs(instances);

  console.log('✅ Dynamic configuration generated successfully!');
  console.log(`📊 Ready to test ${instances.size} instances: ${Array.from(instances.keys()).join(', ')}`);
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { generatePlaywrightConfig, detectRunningInstances };
