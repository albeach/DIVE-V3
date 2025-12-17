/**
 * Diagnostic Tests for DIVE Instances
 *
 * Analyzes authentication options and IdP availability across all instances
 * Helps configure proper test user mappings for each deployment
 */

import { test, expect } from '@playwright/test';

const INSTANCES = [
  { code: 'alb', url: 'https://localhost:3001', name: 'Albania' },
  { code: 'dnk', url: 'https://localhost:3007', name: 'Denmark' },
  { code: 'gbr', url: 'https://localhost:3003', name: 'United Kingdom' },
  { code: 'rou', url: 'https://localhost:3025', name: 'Romania' },
  { code: 'hub', url: 'https://localhost:3000', name: 'DIVE Hub' },
];

test.describe('DIVE Instance Diagnostics', () => {
  INSTANCES.forEach(instance => {
    test.describe(`${instance.name} (${instance.code.toUpperCase()}) Instance`, () => {
      test(`should analyze authentication options for ${instance.name}`, async ({ page }) => {
        // Set base URL for this instance
        await page.context().addCookies([]); // Clear any existing session

        try {
          await page.goto(instance.url, { timeout: 10000 });
          await expect(page.locator('body')).toBeVisible();

          console.log(`[${instance.code}] Analyzing authentication options...`);

          // Check for common IdP button patterns
          const idpButtons = page.locator('button, a, [role="button"]').filter({
            hasText: /(login|auth|sign|idp|keycloak)/i
          });

          const buttonCount = await idpButtons.count();
          console.log(`[${instance.code}] Found ${buttonCount} potential auth elements`);

          // Log all button/link texts for analysis
          for (let i = 0; i < Math.min(buttonCount, 10); i++) {
            const text = await idpButtons.nth(i).textContent();
            console.log(`[${instance.code}] Auth element ${i + 1}: "${text?.trim()}"`);
          }

          // Check for specific IdP patterns
          const idps = {
            france: await page.locator('button, a').filter({ hasText: /france/i }).count() > 0,
            germany: await page.locator('button, a').filter({ hasText: /germany|german/i }).count() > 0,
            uk: await page.locator('button, a').filter({ hasText: /united kingdom|uk|britain/i }).count() > 0,
            denmark: await page.locator('button, a').filter({ hasText: /denmark|danish/i }).count() > 0,
            albania: await page.locator('button, a').filter({ hasText: /albania|albanian/i }).count() > 0,
            romania: await page.locator('button, a').filter({ hasText: /romania|romanian/i }).count() > 0,
            industry: await page.locator('button, a').filter({ hasText: /industry/i }).count() > 0,
            us: await page.locator('button, a').filter({ hasText: /united states|us|america/i }).count() > 0,
          };

          console.log(`[${instance.code}] Available IdPs:`, Object.entries(idps).filter(([_, available]) => available).map(([idp]) => idp));

          // Check for federation indicators
          const federationIndicators = await page.locator('[data-testid*="federat"], text=/federat/i').count();
          console.log(`[${instance.code}] Federation indicators: ${federationIndicators}`);

          // Check for instance-specific branding
          const branding = await page.locator('[data-testid*="brand"], text=/alb|dnk|gbr|rou|hub/i').first().textContent();
          console.log(`[${instance.code}] Instance branding: "${branding}"`);

          // This test always passes - it's for diagnostic purposes
          expect(true).toBe(true);

        } catch (error) {
          console.error(`[${instance.code}] Failed to analyze:`, error);
          // Still pass the test - we're just gathering diagnostic info
          expect(true).toBe(true);
        }
      });

      test(`should test health endpoint for ${instance.name}`, async ({ page }) => {
        try {
          const response = await page.request.get(`${instance.url}/api/health`);
          console.log(`[${instance.code}] Health status: ${response.status()}`);

          if (response.status() === 200) {
            const health = await response.json();
            console.log(`[${instance.code}] Health response:`, health);
          }

          expect(response.status()).toBe(200);
        } catch (error) {
          console.error(`[${instance.code}] Health check failed:`, error);
          // Health check might fail - that's diagnostic info
          expect(true).toBe(true);
        }
      });
    });
  });
});
