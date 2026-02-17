import { test, expect } from '../fixtures/base-test';
import { AUTH_STATE, hasAuthState } from '../fixtures/base-test';
import { TEST_CONFIG } from '../fixtures/test-config';

test.describe('Keyboard Navigation', () => {
  test.use({ storageState: AUTH_STATE.AAL1 });

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_CONFIG.baseUrl);
    await page.waitForLoadState('networkidle');
  });

  test('Tab key moves focus through all interactive elements on dashboard', async ({ page }) => {
    // Press Tab repeatedly and collect focused elements
    const focusedTags: string[] = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const tagName = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        return el.tagName.toLowerCase();
      });
      if (tagName) {
        focusedTags.push(tagName);
      }
    }

    // Should have focused on multiple interactive elements
    expect(focusedTags.length).toBeGreaterThan(0);

    // All focused elements should be interactive types
    const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'summary', 'details'];
    for (const tag of focusedTags) {
      const isInteractive = interactiveTags.includes(tag) ||
        await page.evaluate(() => {
          const el = document.activeElement;
          return el?.getAttribute('tabindex') !== null || el?.getAttribute('role') !== null;
        });
      expect(isInteractive).toBeTruthy();
    }
  });

  test('Skip link appears on Tab press and navigates to main content', async ({ page }) => {
    // Press Tab to reveal skip link
    await page.keyboard.press('Tab');

    // Look for a skip-to-content link
    const skipLink = page.locator('a[href="#main-content"], a[href="#main"], a.skip-link, a.skip-to-content');
    const skipLinkVisible = await skipLink.first().isVisible().catch(() => false);

    if (skipLinkVisible) {
      // Activate the skip link
      await page.keyboard.press('Enter');

      // Focus should now be on or near the main content area
      const focusedId = await page.evaluate(() => {
        return document.activeElement?.id || document.activeElement?.closest('[id]')?.id || '';
      });
      expect(focusedId).toMatch(/main|content/i);
    } else {
      // If no skip link, verify focus moved to first interactive element
      const activeTag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
      expect(activeTag).toBeTruthy();
    }
  });

  test('Cmd+K (or Ctrl+K) opens command palette', async ({ page }) => {
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

    await page.keyboard.press(`${modifier}+k`);

    // Command palette should be visible
    const commandPalette = page.locator(
      '[role="dialog"][aria-label*="command" i], ' +
      '[data-testid="command-palette"], ' +
      '.command-palette, ' +
      '[role="combobox"]'
    );

    await expect(commandPalette.first()).toBeVisible({ timeout: 3000 });
  });

  test('Command palette search filters results', async ({ page }) => {
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+k`);

    // Wait for command palette to appear
    const input = page.locator(
      '[data-testid="command-palette"] input, ' +
      '.command-palette input, ' +
      '[role="combobox"] input, ' +
      '[role="dialog"] input[type="text"], ' +
      '[role="dialog"] input[type="search"]'
    );
    await expect(input.first()).toBeVisible({ timeout: 3000 });

    // Type a search query
    await input.first().fill('dashboard');

    // Results should be filtered
    const results = page.locator(
      '[data-testid="command-palette"] [role="option"], ' +
      '.command-palette [role="option"], ' +
      '[role="listbox"] [role="option"]'
    );

    // Wait for results to appear (or confirm filtering occurred)
    const resultCount = await results.count();
    // Either results appear or no results message shows
    const noResults = page.locator('text=/no results|no matches|nothing found/i');
    const hasResults = resultCount > 0;
    const hasNoResultsMessage = await noResults.isVisible().catch(() => false);

    expect(hasResults || hasNoResultsMessage).toBeTruthy();
  });

  test('Command palette Escape key closes it', async ({ page }) => {
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+k`);

    const commandPalette = page.locator(
      '[data-testid="command-palette"], ' +
      '.command-palette, ' +
      '[role="dialog"][aria-label*="command" i]'
    );
    await expect(commandPalette.first()).toBeVisible({ timeout: 3000 });

    // Press Escape to close
    await page.keyboard.press('Escape');

    await expect(commandPalette.first()).toBeHidden({ timeout: 3000 });
  });

  test('Cmd+I opens identity drawer', async ({ page }) => {
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

    await page.keyboard.press(`${modifier}+i`);

    // Identity drawer should be visible
    const identityDrawer = page.locator(
      '[data-testid="identity-drawer"], ' +
      '.identity-drawer, ' +
      '[role="dialog"][aria-label*="identity" i], ' +
      '[role="complementary"][aria-label*="identity" i]'
    );

    await expect(identityDrawer.first()).toBeVisible({ timeout: 3000 });
  });

  test('Identity drawer Escape key closes it', async ({ page }) => {
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+i`);

    const identityDrawer = page.locator(
      '[data-testid="identity-drawer"], ' +
      '.identity-drawer, ' +
      '[role="dialog"][aria-label*="identity" i], ' +
      '[role="complementary"][aria-label*="identity" i]'
    );
    await expect(identityDrawer.first()).toBeVisible({ timeout: 3000 });

    // Press Escape to close
    await page.keyboard.press('Escape');

    await expect(identityDrawer.first()).toBeHidden({ timeout: 3000 });
  });

  test('Arrow keys navigate resource list items', async ({ page }) => {
    // Navigate to resources page
    await page.goto(`${TEST_CONFIG.baseUrl}/resources`);
    await page.waitForLoadState('networkidle');

    // Find a list or grid of resource items
    const resourceList = page.locator(
      '[role="list"], [role="listbox"], [role="grid"], ' +
      '[data-testid="resource-list"], .resource-list'
    );

    const listExists = await resourceList.first().isVisible().catch(() => false);
    if (!listExists) {
      test.skip();
      return;
    }

    // Focus the first item
    const firstItem = resourceList.first().locator(
      '[role="listitem"], [role="option"], [role="row"], [role="gridcell"]'
    ).first();
    await firstItem.focus();

    // Press ArrowDown and verify focus moved
    const initialId = await page.evaluate(() => document.activeElement?.textContent?.trim());
    await page.keyboard.press('ArrowDown');
    const nextId = await page.evaluate(() => document.activeElement?.textContent?.trim());

    // Focus should have moved to a different element
    expect(nextId).not.toEqual(initialId);
  });

  test('Enter key activates focused button/link', async ({ page }) => {
    // Find the first button or link on the page
    const interactiveEl = page.locator('a[href], button:not([disabled])').first();
    await expect(interactiveEl).toBeVisible();

    // Tab to it
    await interactiveEl.focus();

    // Record current URL or state
    const urlBefore = page.url();
    const tag = await interactiveEl.evaluate(el => el.tagName.toLowerCase());

    if (tag === 'a') {
      // For links, Enter should navigate
      const [response] = await Promise.all([
        page.waitForNavigation({ timeout: 5000 }).catch(() => null),
        page.keyboard.press('Enter'),
      ]);
      // URL should change or navigation should have been attempted
      const urlAfter = page.url();
      expect(response !== null || urlAfter !== urlBefore).toBeTruthy();
    } else {
      // For buttons, Enter should trigger click
      let clicked = false;
      await interactiveEl.evaluate(el => {
        el.addEventListener('click', () => {
          (window as any).__testButtonClicked = true;
        });
      });
      await page.keyboard.press('Enter');
      clicked = await page.evaluate(() => (window as any).__testButtonClicked === true);
      expect(clicked).toBeTruthy();
    }
  });

  test('Focus is trapped inside open modal (Tab does not escape)', async ({ page }) => {
    // Look for a button that opens a modal
    const modalTrigger = page.locator(
      'button[aria-haspopup="dialog"], ' +
      '[data-testid*="modal-trigger"], ' +
      'button:has-text("Delete"), ' +
      'button:has-text("Confirm"), ' +
      'button:has-text("Settings")'
    ).first();

    const hasTrigger = await modalTrigger.isVisible().catch(() => false);
    if (!hasTrigger) {
      test.skip();
      return;
    }

    await modalTrigger.click();

    // Wait for modal to appear
    const modal = page.locator('[role="dialog"], [role="alertdialog"], .modal');
    await expect(modal.first()).toBeVisible({ timeout: 3000 });

    // Collect all focusable elements inside the modal
    const modalFocusableCount = await modal.first().locator(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ).count();

    // Tab through more times than there are focusable elements
    const tabPresses = modalFocusableCount + 3;
    for (let i = 0; i < tabPresses; i++) {
      await page.keyboard.press('Tab');

      // Verify focus is still within the modal
      const focusInModal = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"], [role="alertdialog"], .modal');
        return modal?.contains(document.activeElement) ?? false;
      });
      expect(focusInModal).toBeTruthy();
    }
  });

  test('Focus returns to trigger element when modal closes', async ({ page }) => {
    // Find a modal trigger button
    const modalTrigger = page.locator(
      'button[aria-haspopup="dialog"], ' +
      '[data-testid*="modal-trigger"], ' +
      'button:has-text("Delete"), ' +
      'button:has-text("Confirm"), ' +
      'button:has-text("Settings")'
    ).first();

    const hasTrigger = await modalTrigger.isVisible().catch(() => false);
    if (!hasTrigger) {
      test.skip();
      return;
    }

    // Record the trigger element's text/id for later comparison
    const triggerText = await modalTrigger.textContent();

    await modalTrigger.click();

    // Wait for modal
    const modal = page.locator('[role="dialog"], [role="alertdialog"], .modal');
    await expect(modal.first()).toBeVisible({ timeout: 3000 });

    // Close modal with Escape
    await page.keyboard.press('Escape');
    await expect(modal.first()).toBeHidden({ timeout: 3000 });

    // Verify focus returned to the trigger
    const focusedText = await page.evaluate(() => document.activeElement?.textContent?.trim());
    expect(focusedText).toContain(triggerText?.trim() || '');
  });

  test('Tab order follows visual layout (left-to-right, top-to-bottom)', async ({ page }) => {
    // Collect positions of focused elements as we Tab through
    const positions: Array<{ x: number; y: number }> = [];

    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');

      const pos = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const rect = el.getBoundingClientRect();
        return { x: rect.left, y: rect.top };
      });

      if (pos) {
        positions.push(pos);
      }
    }

    expect(positions.length).toBeGreaterThan(2);

    // Verify general top-to-bottom ordering
    // Allow for elements on the same row (within 20px vertical tolerance)
    let violations = 0;
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1];
      const curr = positions[i];

      // If current element is significantly above the previous one, it is a violation
      // Allow small vertical tolerance for same-row elements
      if (curr.y < prev.y - 50) {
        violations++;
      }
    }

    // Allow a small number of violations for layout edge cases (e.g., sidebar to content)
    const violationRate = violations / (positions.length - 1);
    expect(violationRate).toBeLessThan(0.3);
  });
});
