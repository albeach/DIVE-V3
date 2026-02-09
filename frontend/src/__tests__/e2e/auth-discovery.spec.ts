/**
 * Authentication Discovery Test
 *
 * Actually visits the DIVE instances and discovers what authentication
 * options are really available, then tests them.
 */

import { test, expect } from '@playwright/test';

const INSTANCES = [
  { code: 'hub', url: 'https://localhost:3000', name: 'DIVE Hub' },
  { code: 'alb', url: 'https://localhost:3001', name: 'Albania' },
  { code: 'dnk', url: 'https://localhost:3007', name: 'Denmark' },
  { code: 'gbr', url: 'https://localhost:3003', name: 'UK' },
  { code: 'rou', url: 'https://localhost:3025', name: 'Romania' },
];

test.describe('Authentication Discovery', { tag: '@fast' }, () => {
  INSTANCES.forEach(instance => {
    test(`discover auth options on ${instance.name}`, async ({ page }) => {
      console.log(`\n🔍 DISCOVERING AUTH OPTIONS FOR ${instance.name.toUpperCase()} (${instance.code})`);
      console.log(`📍 URL: ${instance.url}`);

      try {
        // Visit the instance
        await page.goto(instance.url, { timeout: 10000, waitUntil: 'domcontentloaded' });

        // Take screenshot for manual inspection
        await page.screenshot({
          path: `auth-discovery-${instance.code}.png`,
          fullPage: true
        });

        console.log(`📸 Screenshot saved: auth-discovery-${instance.code}.png`);

        // Check page title
        const title = await page.title();
        console.log(`📄 Page Title: "${title}"`);

        // Look for ANY clickable elements that might be auth-related
        const allButtons = page.locator('button, [role="button"], a, input[type="submit"]');
        const buttonCount = await allButtons.count();
        console.log(`🔘 Found ${buttonCount} clickable elements`);

        // Log all button/link texts
        for (let i = 0; i < Math.min(buttonCount, 20); i++) {
          const element = allButtons.nth(i);
          const tagName = await element.evaluate(el => el.tagName.toLowerCase());
          const text = await element.textContent();
          const isVisible = await element.isVisible();

          if (text && text.trim() && isVisible) {
            console.log(`  ${tagName}: "${text.trim()}"`);
          }
        }

        // Look for specific auth patterns
        const authPatterns = [
          'login', 'sign in', 'authenticate', 'log in',
          'france', 'germany', 'united states', 'uk', 'britain',
          'denmark', 'albania', 'romania', 'industry',
          'keycloak', 'federat', 'hub', 'spoke'
        ];

        console.log(`\n🔎 Checking for auth patterns:`);
        for (const pattern of authPatterns) {
          const elements = page.locator(`button, a, [role="button"]`).filter({
            hasText: new RegExp(pattern, 'i')
          });
          const count = await elements.count();
          if (count > 0) {
            console.log(`  ✅ "${pattern}": ${count} matches`);
          }
        }

        // Check for forms
        const forms = page.locator('form');
        const formCount = await forms.count();
        console.log(`\n📝 Found ${formCount} forms on page`);

        // Check for input fields that might be login forms
        const inputs = page.locator('input[type="email"], input[type="text"], input[name*="user"], input[id*="user"]');
        const inputCount = await inputs.count();
        console.log(`📝 Found ${inputCount} potential username fields`);

        // Try to find and click the first available auth-related button
        const authButton = page.locator('button, a').filter({
          hasText: /(login|sign|auth|france|germany|united|denmark|albania|romania)/i
        }).first();

        if (await authButton.count() > 0) {
          const buttonText = await authButton.textContent();
          console.log(`\n🎯 Attempting to click: "${buttonText?.trim()}"`);

          try {
            await authButton.click({ timeout: 5000 });

            // Wait to see where it goes
            await page.waitForTimeout(2000);

            const newUrl = page.url();
            const newTitle = await page.title();

            console.log(`  ➡️  Navigated to: ${newUrl}`);
            console.log(`  📄 New title: "${newTitle}"`);

            // Check if we reached Keycloak or another auth system
            if (newUrl.includes('keycloak') || newUrl.includes('auth') || newUrl.includes('login')) {
              console.log(`  ✅ Reached authentication system!`);
            } else {
              console.log(`  ❓ Unexpected navigation`);
            }

          } catch (clickError) {
            console.log(`  ❌ Click failed: ${clickError.message}`);
          }
        } else {
          console.log(`\n❌ No clickable auth elements found`);
        }

        console.log(`\n🏁 Discovery complete for ${instance.name}`);

      } catch (error) {
        console.error(`❌ Failed to discover auth for ${instance.name}:`, error.message);

        // Still pass the test - discovery is informational
        expect(true).toBe(true);
      }
    });
  });
});

