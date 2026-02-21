import { test, expect } from '../fixtures/base-test';
import { AUTH_STATE, hasAuthState } from '../fixtures/base-test';
import { TEST_CONFIG } from '../fixtures/test-config';
import { AdminOnboardingPage } from '../pages/AdminOnboardingPage';

test.describe('Admin Onboarding Tour', () => {
  // Use saved admin session if available
  if (hasAuthState('ADMIN')) {
    test.use({ storageState: AUTH_STATE.ADMIN });
  }

  test.beforeEach(async ({ page }) => {
    test.skip(!hasAuthState('ADMIN'), 'Admin auth state not available');
    const onboardingPage = new AdminOnboardingPage(page);
    // ?start=1 clears localStorage so tour always shows
    await onboardingPage.goto();
  });

  test('tour loads with first step visible', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);

    await test.step('Tour overlay is visible', async () => {
      const isVisible = await onboardingPage.isTourVisible();
      expect(isVisible).toBeTruthy();
    });

    await test.step('Step counter shows step 1', async () => {
      const stepNum = await onboardingPage.getCurrentStepNumber();
      expect(stepNum).toBe(1);
    });

    await test.step('Step title is displayed', async () => {
      const title = await onboardingPage.getStepTitle();
      expect(title.trim().length).toBeGreaterThan(0);
    });
  });

  test('step title changes on navigation', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

    let firstTitle: string;

    await test.step('Capture first step title', async () => {
      firstTitle = await onboardingPage.getStepTitle();
      expect(firstTitle.trim().length).toBeGreaterThan(0);
    });

    await test.step('Navigate to next step', async () => {
      await onboardingPage.clickNext();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
    });

    await test.step('Title has changed', async () => {
      const secondTitle = await onboardingPage.getStepTitle();
      expect(secondTitle).not.toBe(firstTitle);
    });
  });

  test('next button advances step counter', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

    await test.step('Click next button', async () => {
      const stepBefore = await onboardingPage.getCurrentStepNumber();
      await onboardingPage.clickNext();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

      const stepAfter = await onboardingPage.getCurrentStepNumber();
      expect(stepAfter).toBe(stepBefore + 1);
    });
  });

  test('back button goes to previous step', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

    await test.step('Navigate to step 2', async () => {
      await onboardingPage.clickNext();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
      expect(await onboardingPage.getCurrentStepNumber()).toBe(2);
    });

    await test.step('Click back button', async () => {
      await onboardingPage.clickBack();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
      expect(await onboardingPage.getCurrentStepNumber()).toBe(1);
    });
  });

  test('back button is hidden on first step', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

    await test.step('Back button is not visible on step 1', async () => {
      const isVisible = await onboardingPage.backButton.isVisible().catch(() => false);
      expect(isVisible).toBeFalsy();
    });

    await test.step('Back button appears after advancing', async () => {
      await onboardingPage.clickNext();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

      const isVisible = await onboardingPage.backButton.isVisible().catch(() => false);
      expect(isVisible).toBeTruthy();
    });
  });

  test('skip tour dismisses the overlay', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

    await test.step('Skip button is visible', async () => {
      await expect(onboardingPage.skipButton).toBeVisible();
    });

    await test.step('Clicking skip removes the tour', async () => {
      await onboardingPage.clickSkip();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

      const isVisible = await onboardingPage.isTourVisible();
      expect(isVisible).toBeFalsy();
    });
  });

  test('close button dismisses the tour', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

    await test.step('Close button is visible', async () => {
      await expect(onboardingPage.closeButton).toBeVisible();
    });

    await test.step('Clicking close removes the tour', async () => {
      await onboardingPage.clickClose();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

      const isVisible = await onboardingPage.isTourVisible();
      expect(isVisible).toBeFalsy();
    });
  });

  test('navigating through all steps reaches completion', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

    const totalSteps = await onboardingPage.getTotalSteps();
    expect(totalSteps).toBeGreaterThanOrEqual(2);

    await test.step(`Navigate through all ${totalSteps} steps`, async () => {
      for (let step = 1; step < totalSteps; step++) {
        await onboardingPage.clickNext();
        await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
      }
    });

    await test.step('Last step shows Complete button', async () => {
      await expect(onboardingPage.completeButton).toBeVisible();
    });

    await test.step('Clicking Complete dismisses tour', async () => {
      await onboardingPage.completeButton.click();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

      const isVisible = await onboardingPage.isTourVisible();
      expect(isVisible).toBeFalsy();
    });
  });

  test('step counter shows correct total', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

    await test.step('Step counter format is "Step X of Y"', async () => {
      await expect(onboardingPage.stepCounter).toBeVisible();
      const text = await onboardingPage.stepCounter.textContent();
      expect(text).toMatch(/step\s+\d+\s+of\s+\d+/i);
    });

    await test.step('Total steps is reasonable (2-10)', async () => {
      const total = await onboardingPage.getTotalSteps();
      expect(total).toBeGreaterThanOrEqual(2);
      expect(total).toBeLessThanOrEqual(10);
    });
  });

  test('each step has descriptive content', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

    const totalSteps = await onboardingPage.getTotalSteps();

    await test.step('Navigate through steps and verify content', async () => {
      for (let step = 0; step < totalSteps; step++) {
        const title = await onboardingPage.getStepTitle();
        expect(title.trim().length).toBeGreaterThan(0);

        if (step < totalSteps - 1) {
          await onboardingPage.clickNext();
          await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
        }
      }
    });
  });

  test('tour adapts to viewport size', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

    await test.step('Tour is visible at default viewport', async () => {
      expect(await onboardingPage.isTourVisible()).toBeTruthy();
    });

    await test.step('Tour remains visible at tablet viewport', async () => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
      expect(await onboardingPage.isTourVisible()).toBeTruthy();
    });

    await test.step('Tour remains visible at mobile viewport', async () => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
      expect(await onboardingPage.isTourVisible()).toBeTruthy();
    });
  });

  test('keyboard navigation works', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

    await test.step('Enter key on Next button advances step', async () => {
      await onboardingPage.nextButton.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

      const stepNum = await onboardingPage.getCurrentStepNumber();
      expect(stepNum).toBe(2);
    });
  });
});
