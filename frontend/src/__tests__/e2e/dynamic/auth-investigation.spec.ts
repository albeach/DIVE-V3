/**
 * Authentication Investigation Tests
 *
 * Test to understand what authentication UI elements are actually present
 * on the DIVE instances
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication Investigation', () => {
  test('investigate hub authentication UI', async ({ page }) => {
    await page.goto('https://localhost:3000');

    // Take a screenshot to see what's actually displayed
    await page.screenshot({ path: 'hub-auth-screenshot.png', fullPage: true });

    // Log all buttons and links
    const buttons = await page.locator('button, [role="button"], input[type="submit"]').allTextContents();
    const links = await page.locator('a').allTextContents();

    console.log('Buttons found:', buttons);
    console.log('Links found:', links);

    // Check for common auth patterns
    const pageText = await page.locator('body').textContent();
    console.log('Page contains auth-related text:', pageText?.includes('login') || pageText?.includes('auth') || pageText?.includes('sign'));

    // Try to find any clickable auth elements
    const authElements = page.locator('[data-testid*="auth"], [data-testid*="login"], button, a').filter({
      hasText: /login|auth|sign|idp/i
    });

    const count = await authElements.count();
    console.log(`Found ${count} potential auth elements`);

    for (let i = 0; i < count; i++) {
      const element = authElements.nth(i);
      const text = await element.textContent();
      const tag = await element.evaluate(el => el.tagName.toLowerCase());
      console.log(`Auth element ${i + 1}: <${tag}> ${text?.trim()}`);
    }

    // Always pass - this is investigative
    expect(true).toBe(true);
  });
});
