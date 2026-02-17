import { test, expect } from '../fixtures/base-test';
import { AUTH_STATE, hasAuthState } from '../fixtures/base-test';
import { TEST_CONFIG } from '../fixtures/test-config';
import AxeBuilder from '@axe-core/playwright';

test.describe('Dark Mode / Theme Switching', () => {
  test.use({ storageState: AUTH_STATE.AAL1 });

  /**
   * Helper to locate the theme toggle button.
   */
  function themeToggle(page: import('@playwright/test').Page) {
    return page.locator(
      'button[aria-label*="theme" i], ' +
      'button[aria-label*="dark" i], ' +
      'button[aria-label*="light" i], ' +
      'button[aria-label*="mode" i], ' +
      '[data-testid="theme-toggle"], ' +
      '[data-testid="dark-mode-toggle"], ' +
      '.theme-toggle'
    ).first();
  }

  /**
   * Helper to determine if dark mode is currently active.
   */
  async function isDarkMode(page: import('@playwright/test').Page): Promise<boolean> {
    return page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;

      // Check common dark mode indicators
      const hasDarkClass =
        html.classList.contains('dark') ||
        body.classList.contains('dark') ||
        html.classList.contains('dark-mode') ||
        body.classList.contains('dark-mode') ||
        html.getAttribute('data-theme') === 'dark' ||
        body.getAttribute('data-theme') === 'dark' ||
        html.getAttribute('data-color-scheme') === 'dark' ||
        html.getAttribute('data-mode') === 'dark';

      // Check computed background color (dark bg typically has low luminance)
      const bgColor = window.getComputedStyle(body).backgroundColor;
      const rgb = bgColor.match(/\d+/g)?.map(Number) || [255, 255, 255];
      const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
      const isDarkBg = luminance < 0.3;

      return hasDarkClass || isDarkBg;
    });
  }

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_CONFIG.baseUrl);
    await page.waitForLoadState('networkidle');
  });

  test('Theme toggle button is visible on dashboard', async ({ page }) => {
    const toggle = themeToggle(page);
    await expect(toggle).toBeVisible({ timeout: 5000 });

    // Toggle should have accessible name
    const ariaLabel = await toggle.getAttribute('aria-label');
    const title = await toggle.getAttribute('title');
    const text = await toggle.textContent();
    const hasAccessibleName = (ariaLabel && ariaLabel.length > 0) ||
      (title && title.length > 0) ||
      (text && text.trim().length > 0);
    expect(hasAccessibleName).toBeTruthy();
  });

  test('Clicking theme toggle switches to dark mode', async ({ page }) => {
    const darkBefore = await isDarkMode(page);

    const toggle = themeToggle(page);
    await toggle.click();

    // Allow transition time
    await page.waitForTimeout(500);

    const darkAfter = await isDarkMode(page);

    // The mode should have flipped
    expect(darkAfter).not.toEqual(darkBefore);
  });

  test('Dark mode persists across page reload', async ({ page }) => {
    // Ensure we start in light mode, then switch to dark
    if (await isDarkMode(page)) {
      await themeToggle(page).click();
      await page.waitForTimeout(300);
    }

    // Switch to dark mode
    await themeToggle(page).click();
    await page.waitForTimeout(300);
    expect(await isDarkMode(page)).toBeTruthy();

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Dark mode should persist
    expect(await isDarkMode(page)).toBeTruthy();

    // Verify preference was stored
    const storedTheme = await page.evaluate(() => {
      return (
        localStorage.getItem('theme') ||
        localStorage.getItem('color-scheme') ||
        localStorage.getItem('dark-mode') ||
        localStorage.getItem('themeMode') ||
        localStorage.getItem('ui-theme') ||
        ''
      );
    });

    // Some form of dark preference should be stored
    // (empty string is acceptable if using cookie or server-side storage)
    if (storedTheme) {
      expect(storedTheme.toLowerCase()).toMatch(/dark/);
    }
  });

  test('Dark mode applies to dashboard page', async ({ page }) => {
    // Enable dark mode
    if (!(await isDarkMode(page))) {
      await themeToggle(page).click();
      await page.waitForTimeout(300);
    }

    expect(await isDarkMode(page)).toBeTruthy();

    // Verify key dashboard elements have dark styling
    const bgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });

    // Background should be dark (low RGB values)
    const rgb = bgColor.match(/\d+/g)?.map(Number) || [255, 255, 255];
    const maxChannel = Math.max(...rgb);
    expect(maxChannel).toBeLessThan(128);

    // Text should be light-colored for contrast
    const textColor = await page.evaluate(() => {
      const heading = document.querySelector('h1, h2, h3, p');
      if (!heading) return 'rgb(0, 0, 0)';
      return window.getComputedStyle(heading).color;
    });

    const textRgb = textColor.match(/\d+/g)?.map(Number) || [0, 0, 0];
    const minTextChannel = Math.max(...textRgb);
    expect(minTextChannel).toBeGreaterThan(127);
  });

  test('Dark mode applies to resources page', async ({ page }) => {
    // Enable dark mode on dashboard first
    if (!(await isDarkMode(page))) {
      await themeToggle(page).click();
      await page.waitForTimeout(300);
    }

    // Navigate to resources
    await page.goto(`${TEST_CONFIG.baseUrl}/resources`);
    await page.waitForLoadState('networkidle');

    expect(await isDarkMode(page)).toBeTruthy();

    // Body background should be dark
    const bgColor = await page.evaluate(() =>
      window.getComputedStyle(document.body).backgroundColor
    );
    const rgb = bgColor.match(/\d+/g)?.map(Number) || [255, 255, 255];
    const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    expect(luminance).toBeLessThan(0.3);
  });

  test('Dark mode applies to upload page', async ({ page }) => {
    // Enable dark mode
    if (!(await isDarkMode(page))) {
      await themeToggle(page).click();
      await page.waitForTimeout(300);
    }

    await page.goto(`${TEST_CONFIG.baseUrl}/upload`);
    await page.waitForLoadState('networkidle');

    expect(await isDarkMode(page)).toBeTruthy();

    const bgColor = await page.evaluate(() =>
      window.getComputedStyle(document.body).backgroundColor
    );
    const rgb = bgColor.match(/\d+/g)?.map(Number) || [255, 255, 255];
    const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    expect(luminance).toBeLessThan(0.3);
  });

  test('Dark mode applies to admin pages', async ({ page }) => {
    // Enable dark mode
    if (!(await isDarkMode(page))) {
      await themeToggle(page).click();
      await page.waitForTimeout(300);
    }

    await page.goto(`${TEST_CONFIG.baseUrl}/admin`);
    await page.waitForLoadState('networkidle');

    expect(await isDarkMode(page)).toBeTruthy();

    const bgColor = await page.evaluate(() =>
      window.getComputedStyle(document.body).backgroundColor
    );
    const rgb = bgColor.match(/\d+/g)?.map(Number) || [255, 255, 255];
    const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    expect(luminance).toBeLessThan(0.3);
  });

  test('Switching back to light mode works', async ({ page }) => {
    // Ensure dark mode is on
    if (!(await isDarkMode(page))) {
      await themeToggle(page).click();
      await page.waitForTimeout(300);
    }
    expect(await isDarkMode(page)).toBeTruthy();

    // Switch back to light mode
    await themeToggle(page).click();
    await page.waitForTimeout(500);

    expect(await isDarkMode(page)).toBeFalsy();

    // Body background should be light
    const bgColor = await page.evaluate(() =>
      window.getComputedStyle(document.body).backgroundColor
    );
    const rgb = bgColor.match(/\d+/g)?.map(Number) || [255, 255, 255];
    const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    expect(luminance).toBeGreaterThan(0.7);
  });

  test('Theme preference respects prefers-color-scheme media query', async ({ page }) => {
    // Clear any stored preference first
    await page.evaluate(() => {
      localStorage.removeItem('theme');
      localStorage.removeItem('color-scheme');
      localStorage.removeItem('dark-mode');
      localStorage.removeItem('themeMode');
      localStorage.removeItem('ui-theme');
    });

    // Emulate dark color scheme preference
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    await page.waitForLoadState('networkidle');

    const darkWithPref = await isDarkMode(page);

    // Emulate light color scheme preference
    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload();
    await page.waitForLoadState('networkidle');

    const lightWithPref = await isDarkMode(page);

    // The app should respond to the OS preference
    // Dark preference should result in dark mode, light in light mode
    expect(darkWithPref).not.toEqual(lightWithPref);
    expect(darkWithPref).toBeTruthy();
    expect(lightWithPref).toBeFalsy();
  });

  test('No accessibility violations in dark mode (axe-core scan)', async ({ page }) => {
    // Enable dark mode
    if (!(await isDarkMode(page))) {
      await themeToggle(page).click();
      await page.waitForTimeout(500);
    }

    expect(await isDarkMode(page)).toBeTruthy();

    // Run axe-core accessibility scan
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    // Filter to only color-contrast and color-related violations
    const colorViolations = accessibilityScanResults.violations.filter(
      violation =>
        violation.id.includes('color') ||
        violation.id.includes('contrast')
    );

    // Report violations for debugging
    if (colorViolations.length > 0) {
      const summary = colorViolations.map(v => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.length,
      }));
      console.log('Dark mode color/contrast violations:', JSON.stringify(summary, null, 2));
    }

    // No critical or serious color contrast violations
    const criticalViolations = colorViolations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(criticalViolations).toHaveLength(0);

    // Overall accessibility should have no critical violations
    const allCritical = accessibilityScanResults.violations.filter(
      v => v.impact === 'critical'
    );
    expect(allCritical).toHaveLength(0);
  });
});
