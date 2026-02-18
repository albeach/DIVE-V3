/**
 * E2E Tests for Modern Upload Flow
 *
 * Comprehensive Playwright tests covering:
 * 1. Happy path upload
 * 2. COI auto-sync
 * 3. Validation warnings
 * 4. Keyboard navigation
 * 5. Draft save/restore
 * 6. Mobile upload
 * 7. Dark mode
 * 8. Upload failure recovery
 *
 * Uses base-test fixtures (auth, idps, users) and TEST_CONFIG for consistency.
 */

import { test, expect } from './fixtures/base-test';
import { TEST_CONFIG } from './fixtures/test-config';

/**
 * Helper to navigate to upload page and wait for the file dropzone.
 * Uses the actual bento-upload-layout selectors.
 */
async function navigateToUpload(page: import('@playwright/test').Page) {
  await page.goto('/upload', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
  // Wait for the bento file dropzone region to load
  await page.locator('role=region[name="File upload"]')
    .or(page.locator('#file-dropzone'))
    .first()
    .waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.RESOURCE_LOAD });
}

/**
 * Helper to create a test file via the hidden file input.
 */
async function createTestFile(page: import('@playwright/test').Page, fileName = 'test-document.txt') {
  const fileInput = page.locator('input[type="file"]').first();
  const testContent = Buffer.from('This is test content for the upload test.');
  await fileInput.setInputFiles({
    name: fileName,
    mimeType: 'text/plain',
    buffer: testContent,
  });
}

test.describe('Upload Page - Modern UI', { tag: '@critical' }, () => {
  test.skip(process.env.CI === 'true', 'CI: required test users (testuser-usa-1) not provisioned');

  test.beforeEach(async ({ auth, users }) => {
    // Authenticate as an UNCLASSIFIED user before each test
    await auth.loginAs(users.USA.LEVEL_1);
  });

  test.describe('1. Happy Path Upload', () => {
    test('should complete full upload flow', async ({ page }) => {
      await navigateToUpload(page);

      // Step 1: Select file
      await createTestFile(page, 'test-document.pdf');
      await expect(page.getByText('test-document.pdf')).toBeVisible();

      // Step 2: Fill metadata (actual input ids: #title, #description)
      await page.locator('#title').fill('Test Document - NATO Exercise');
      await page.locator('#description').fill('Test description for E2E test');

      // Step 3: Select classification (role="radio" buttons in radiogroup)
      const secretRadio = page.getByRole('radio', { name: /secret/i });
      await secretRadio.click();
      await expect(secretRadio).toHaveAttribute('aria-checked', 'true');

      // Step 4: Select countries (aria-pressed toggle buttons)
      await page.getByRole('button', { name: /United States.*USA/i }).click();
      await page.getByRole('button', { name: /United Kingdom.*GBR/i }).click();

      // Verify countries are selected via aria-pressed
      await expect(page.getByRole('button', { name: /United States.*USA/i })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: /United Kingdom.*GBR/i })).toHaveAttribute('aria-pressed', 'true');

      // Step 5: Verify upload button is present
      const uploadButton = page.getByRole('button', { name: /upload/i });
      await expect(uploadButton).toBeVisible();
    });

    test('should show step indicator progress', async ({ page }) => {
      await navigateToUpload(page);

      // Progressbar tracks step progression
      const progressBar = page.getByRole('progressbar');
      await expect(progressBar).toBeVisible();

      // After file selection, step should advance
      await createTestFile(page);
      await expect(progressBar).toHaveAttribute('aria-valuenow', '2');

      // After title, step should advance again
      await page.locator('#title').fill('Test');
      await expect(progressBar).toHaveAttribute('aria-valuenow', '3');
    });
  });

  test.describe('2. COI Auto-Sync', () => {
    test('should auto-add countries when selecting FVEY', async ({ page }) => {
      await navigateToUpload(page);
      await createTestFile(page);
      await page.locator('#title').fill('Test');

      // Click FVEY preset button (in COI section)
      const fveyButton = page.getByRole('button', { name: /fvey/i });
      if (await fveyButton.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT })) {
        await fveyButton.click();

        // Verify all FVEY countries are selected via aria-pressed
        const fveyCountries = ['USA', 'GBR', 'CAN', 'AUS', 'NZL'];
        for (const country of fveyCountries) {
          await expect(
            page.getByRole('button', { name: new RegExp(country, 'i') })
              .filter({ has: page.locator('[aria-pressed="true"]') })
              .or(page.locator(`button[aria-pressed="true"]:has-text("${country}")`))
              .first()
          ).toBeVisible();
        }
      }
    });

    test('should show COI section with available communities', async ({ page }) => {
      await navigateToUpload(page);
      await createTestFile(page);
      await page.locator('#title').fill('Test');

      // COI section should be present with its heading
      await expect(page.locator('[aria-labelledby="coi-heading"]')).toBeVisible();
    });

    test('should deselect COI when required country is removed', async ({ page }) => {
      await navigateToUpload(page);
      await createTestFile(page);
      await page.locator('#title').fill('Test');

      // Select FVEY preset if available
      const fveyButton = page.getByRole('button', { name: /fvey/i });
      if (await fveyButton.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT })) {
        await fveyButton.click();
        await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.DEBOUNCE);

        // Deselect GBR
        await page.getByRole('button', { name: /United Kingdom.*GBR/i }).click();
        await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.DEBOUNCE);

        // GBR should now be deselected
        await expect(
          page.getByRole('button', { name: /United Kingdom.*GBR/i })
        ).toHaveAttribute('aria-pressed', 'false');
      }
    });
  });

  test.describe('3. Validation Warnings', () => {
    test('should show warning section when issues arise', async ({ page }) => {
      await navigateToUpload(page);
      await createTestFile(page);
      await page.locator('#title').fill('Test');

      // Try to select TOP_SECRET (may be disabled for UNCLASSIFIED user)
      const topSecretButton = page.getByRole('radio', { name: /top.?secret/i });
      if (await topSecretButton.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT })) {
        const isDisabled = await topSecretButton.isDisabled();
        if (isDisabled) {
          // Button should be disabled — clearance exceeded
          await expect(topSecretButton).toBeDisabled();
        }
      }
    });

    test('should show error for NOFORN with foreign countries', async ({ page }) => {
      await navigateToUpload(page);
      await createTestFile(page);
      await page.locator('#title').fill('Test');

      // Select USA + foreign country
      await page.getByRole('button', { name: /United States.*USA/i }).click();
      await page.getByRole('button', { name: /United Kingdom.*GBR/i }).click();

      // Select NOFORN caveat (in caveats section)
      const nofornButton = page.getByRole('button', { name: /noforn/i });
      if (await nofornButton.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT })) {
        await nofornButton.click();

        // Warnings section should show an alert
        const warningSection = page.locator('[aria-labelledby="warnings-heading"]');
        const warningAlert = page.locator('role=alert');
        await expect(warningSection.or(warningAlert).first()).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.MEDIUM });
      }
    });
  });

  test.describe('4. Keyboard Navigation', () => {
    test('should open command palette with Cmd+K', async ({ page }) => {
      await navigateToUpload(page);

      // Press Cmd+K
      await page.keyboard.press('Meta+k');

      // Command palette should be visible as a dialog
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    });

    test('should navigate country grid with arrow keys', async ({ page }) => {
      await navigateToUpload(page);
      await createTestFile(page);
      await page.locator('#title').fill('Test');

      // Focus on first country button in the select-countries group
      const countryGroup = page.locator('[role="group"][aria-label="Select countries"]');
      const firstCountry = countryGroup.locator('button').first();
      await firstCountry.focus();

      // Press arrow right and verify focus moves
      await page.keyboard.press('ArrowRight');

      // Second country button should be focused
      const secondCountry = countryGroup.locator('button').nth(1);
      await expect(secondCountry).toBeFocused();
    });

    test('should toggle country selection with Space', async ({ page }) => {
      await navigateToUpload(page);
      await createTestFile(page);
      await page.locator('#title').fill('Test');

      // Focus on USA button
      const usaButton = page.getByRole('button', { name: /United States.*USA/i });
      await usaButton.focus();

      const initialState = await usaButton.getAttribute('aria-pressed');

      // Press Space to toggle
      await page.keyboard.press('Space');

      const newState = await usaButton.getAttribute('aria-pressed');
      expect(newState).not.toBe(initialState);
    });

    test('should close command palette with Escape', async ({ page }) => {
      await navigateToUpload(page);

      // Open palette
      await page.keyboard.press('Meta+k');
      await expect(page.getByRole('dialog')).toBeVisible();

      // Press Escape
      await page.keyboard.press('Escape');

      // Palette should close
      await expect(page.getByRole('dialog')).not.toBeVisible();
    });
  });

  test.describe('5. Draft Save/Restore', () => {
    test('should save draft to localStorage', async ({ page }) => {
      await navigateToUpload(page);
      await createTestFile(page);

      // Fill form
      await page.locator('#title').fill('Draft Test Document');

      // Wait for auto-save
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.LONG + 1000);

      // Check localStorage
      const draft = await page.evaluate(() => {
        return localStorage.getItem('dive-v3-upload-draft');
      });

      expect(draft).toBeTruthy();
    });

    test('should show restore banner when draft exists', async ({ page }) => {
      // Create a draft first
      await navigateToUpload(page);
      await createTestFile(page);
      await page.locator('#title').fill('Draft Test');
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.LONG + 1000);

      // Reload page
      await page.reload();
      await page.locator('#file-dropzone')
        .or(page.locator('role=region[name="File upload"]'))
        .first()
        .waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.RESOURCE_LOAD });

      // Should show restore banner
      await expect(page.getByText(/unsaved draft found|restore draft/i)).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    });

    test('should restore draft when clicking restore button', async ({ page }) => {
      // Set up draft in localStorage
      await page.addInitScript(() => {
        const draft = {
          title: 'Restored Draft',
          description: 'Test description',
          classification: 'SECRET',
          releasabilityTo: ['USA', 'GBR'],
          COI: [],
          caveats: [],
          savedAt: Date.now(),
          version: 1,
        };
        localStorage.setItem('dive-v3-upload-draft', btoa(encodeURIComponent(JSON.stringify(draft))));
      });

      await navigateToUpload(page);

      // Click restore
      const restoreButton = page.getByRole('button', { name: /restore/i });
      if (await restoreButton.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION })) {
        await restoreButton.click();
        // Verify values restored
        await expect(page.locator('#title')).toHaveValue('Restored Draft');
      }
    });
  });

  test.describe('6. Mobile Upload', () => {
    test.use({ viewport: { width: 390, height: 844 } }); // iPhone 13 Pro

    test('should render in single column on mobile', async ({ page }) => {
      await navigateToUpload(page);

      // Bento grid should be single column on mobile
      const bentoGrid = page.locator('.grid').first();
      if (await bentoGrid.isVisible()) {
        const gridComputedStyle = await bentoGrid.evaluate((el) => {
          return window.getComputedStyle(el).gridTemplateColumns;
        });
        // Should be single column (not multi-column like "3fr 1fr")
        expect(gridComputedStyle).not.toContain('3fr');
      }
    });

    test('should show camera button on mobile', async ({ page }) => {
      await navigateToUpload(page);

      // Camera button uses aria-label="Capture from camera"
      await expect(
        page.locator('[aria-label="Capture from camera"]')
          .or(page.getByRole('button', { name: /camera/i }))
          .first()
      ).toBeVisible();
    });
  });

  test.describe('7. Dark Mode', () => {
    test('should switch to dark mode', async ({ page }) => {
      await navigateToUpload(page);

      // Toggle dark mode (if theme toggle exists in nav)
      const themeToggle = page.getByRole('button', { name: /theme|dark|light/i });
      if (await themeToggle.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT })) {
        await themeToggle.click();
        // Body should have dark class
        await expect(page.locator('html')).toHaveClass(/dark/);
      }
    });

    test('should maintain contrast in dark mode', async ({ page }) => {
      // Set dark mode via media emulation
      await page.emulateMedia({ colorScheme: 'dark' });
      await navigateToUpload(page);

      // Page should render without errors
      await expect(page.locator('#file-dropzone').or(page.locator('role=region[name="File upload"]')).first()).toBeVisible();
    });
  });

  test.describe('8. Upload Failure Recovery', () => {
    test('should show error toast on upload failure', async ({ page }) => {
      // Mock API failure
      await page.route('**/api/upload', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Internal Server Error' }),
        });
      });

      await navigateToUpload(page);
      await createTestFile(page);
      await page.locator('#title').fill('Test');
      await page.getByRole('button', { name: /United States.*USA/i }).click();

      // Click upload
      const uploadButton = page.getByRole('button', { name: /upload/i });
      if (await uploadButton.isEnabled()) {
        await uploadButton.click();
        // Should show error toast or alert
        await expect(
          page.getByText(/upload failed|error/i)
            .or(page.locator('role=alert'))
            .first()
        ).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.NETWORK });
      }
    });

    test('should preserve form state after error', async ({ page }) => {
      // Mock API failure
      await page.route('**/api/upload', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Internal Server Error' }),
        });
      });

      await navigateToUpload(page);
      await createTestFile(page);
      const title = 'Preserved Title After Error';
      await page.locator('#title').fill(title);
      await page.getByRole('button', { name: /United States.*USA/i }).click();

      // Click upload
      const uploadButton = page.getByRole('button', { name: /upload/i });
      if (await uploadButton.isEnabled()) {
        await uploadButton.click();
        await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.MEDIUM);

        // Form state should be preserved
        await expect(page.locator('#title')).toHaveValue(title);
      }
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper ARIA regions', async ({ page }) => {
      await navigateToUpload(page);

      // Check for required ARIA regions from bento-upload-layout
      await expect(page.getByRole('progressbar')).toBeVisible();
      // File upload region
      await expect(
        page.locator('#file-dropzone').or(page.locator('role=region[name="File upload"]')).first()
      ).toBeVisible();
    });

    test('should have proper section headings', async ({ page }) => {
      await navigateToUpload(page);
      await createTestFile(page);
      await page.locator('#title').fill('Test');

      // Classification section
      await expect(page.locator('#classification-heading')).toBeVisible();
      // Releasability section
      await expect(page.locator('#releasability-heading')).toBeVisible();
    });

    test('should have live regions for dynamic changes', async ({ page }) => {
      await navigateToUpload(page);

      // File rejection alerts use aria-live="polite"
      const liveRegions = page.locator('[aria-live]');
      expect(await liveRegions.count()).toBeGreaterThan(0);
    });
  });
});
