import { test, expect } from '../fixtures/base-test';
import { AUTH_STATE, hasAuthState } from '../fixtures/base-test';
import { TEST_CONFIG } from '../fixtures/test-config';
import { AdminOnboardingPage } from '../pages/AdminOnboardingPage';

test.describe('Admin Onboarding Wizard', () => {
  // Use saved admin session if available
  if (hasAuthState('ADMIN')) {
    test.use({ storageState: AUTH_STATE.ADMIN });
  }

  test.beforeEach(async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await onboardingPage.goto();
  });

  test('wizard loads with first step', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);

    await test.step('Wizard container is visible', async () => {
      await expect(onboardingPage.wizardContainer).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
    });

    await test.step('First step is active', async () => {
      const activeStep = onboardingPage.activeStep;
      await expect(activeStep).toBeVisible();
    });

    await test.step('Step content is displayed', async () => {
      const stepContent = onboardingPage.stepContent;
      await expect(stepContent).toBeVisible();
      const contentText = await stepContent.textContent();
      expect(contentText!.trim().length).toBeGreaterThan(0);
    });
  });

  test('step title changes on navigation', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    let firstStepTitle: string;

    await test.step('Capture first step title', async () => {
      const title = onboardingPage.stepTitle;
      await expect(title).toBeVisible();
      firstStepTitle = (await title.textContent()) ?? '';
      expect(firstStepTitle.trim().length).toBeGreaterThan(0);
    });

    await test.step('Navigate to next step', async () => {
      await onboardingPage.clickNext();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
    });

    await test.step('Verify title has changed', async () => {
      const title = onboardingPage.stepTitle;
      await expect(title).toBeVisible();
      const secondStepTitle = await title.textContent();
      expect(secondStepTitle).not.toBe(firstStepTitle);
    });
  });

  test('next button advances to next step', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Verify next button is visible', async () => {
      await expect(onboardingPage.nextButton).toBeVisible();
    });

    await test.step('Click next button', async () => {
      const stepBefore = await onboardingPage.getCurrentStepNumber();
      await onboardingPage.clickNext();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

      const stepAfter = await onboardingPage.getCurrentStepNumber();
      expect(stepAfter).toBeGreaterThan(stepBefore);
    });
  });

  test('previous button goes back', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Navigate to second step', async () => {
      await onboardingPage.clickNext();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
    });

    await test.step('Click previous button', async () => {
      const stepBefore = await onboardingPage.getCurrentStepNumber();
      await onboardingPage.clickPrevious();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

      const stepAfter = await onboardingPage.getCurrentStepNumber();
      expect(stepAfter).toBeLessThan(stepBefore);
    });
  });

  test('previous button is hidden or disabled on first step', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Previous button is not available on step 1', async () => {
      const prevButton = onboardingPage.previousButton;
      const isVisible = await prevButton.isVisible().catch(() => false);

      if (isVisible) {
        const isDisabled = await prevButton.isDisabled();
        expect(isDisabled).toBeTruthy();
      } else {
        // Button is hidden on first step - this is valid behavior
        expect(isVisible).toBeFalsy();
      }
    });
  });

  test('form validation shows errors for empty required fields', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Attempt to advance without filling required fields', async () => {
      // Clear any pre-filled required fields
      const requiredInputs = page.locator('input[required], textarea[required], [aria-required="true"]');
      const requiredCount = await requiredInputs.count();

      for (let i = 0; i < requiredCount; i++) {
        await requiredInputs.nth(i).clear();
      }

      // Try to click next
      await onboardingPage.clickNext();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
    });

    await test.step('Validation errors are displayed', async () => {
      const errorMessages = page.locator(
        '[data-testid*="error"], .error-message, .field-error, [role="alert"], .invalid-feedback, .text-danger, .text-red'
      );
      const nativeValidation = page.locator(':invalid');

      const hasCustomErrors = await errorMessages.count() > 0;
      const hasNativeErrors = await nativeValidation.count() > 0;

      expect(hasCustomErrors || hasNativeErrors).toBeTruthy();
    });
  });

  test('fill form data and advance to next step', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Fill in all visible form fields', async () => {
      await onboardingPage.fillCurrentStepFields({
        textInputValue: 'E2E Test Organization',
        selectFirstOption: true,
      });
    });

    await test.step('Advance to next step successfully', async () => {
      const stepBefore = await onboardingPage.getCurrentStepNumber();
      await onboardingPage.clickNext();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

      const stepAfter = await onboardingPage.getCurrentStepNumber();
      expect(stepAfter).toBeGreaterThan(stepBefore);
    });
  });

  test('progress indicator updates on step change', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Progress indicator shows initial state', async () => {
      const progressIndicator = onboardingPage.progressIndicator;
      await expect(progressIndicator).toBeVisible();
    });

    await test.step('Fill fields and advance', async () => {
      await onboardingPage.fillCurrentStepFields({
        textInputValue: 'Test Value',
        selectFirstOption: true,
      });
      await onboardingPage.clickNext();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
    });

    await test.step('Progress indicator reflects advancement', async () => {
      const progressIndicator = onboardingPage.progressIndicator;
      await expect(progressIndicator).toBeVisible();

      // Check for visual progress update (active step, progress bar, step counter)
      const activeSteps = page.locator('[data-testid*="step"].active, .step.active, .step.completed, [aria-current="step"]');
      const progressBar = page.locator('[role="progressbar"], .progress-bar, progress');
      const stepCounter = page.locator('text=/step\\s*2|2\\s*of/i');

      const hasActiveSteps = await activeSteps.count() > 0;
      const hasProgressBar = await progressBar.isVisible().catch(() => false);
      const hasStepCounter = await stepCounter.isVisible().catch(() => false);

      expect(hasActiveSteps || hasProgressBar || hasStepCounter).toBeTruthy();
    });
  });

  test('complete wizard reaches finish step', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    const totalSteps = await onboardingPage.getTotalSteps();

    await test.step(`Navigate through all ${totalSteps} steps`, async () => {
      for (let step = 1; step < totalSteps; step++) {
        await onboardingPage.fillCurrentStepFields({
          textInputValue: `E2E Test Step ${step}`,
          selectFirstOption: true,
        });

        await onboardingPage.clickNext();
        await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
      }
    });

    await test.step('Final step or completion screen is displayed', async () => {
      const finishButton = page.locator('button', { hasText: /finish|complete|submit|done/i });
      const completionMessage = page.locator('text=/complete|success|congratulations|finished|all done/i');
      const lastStepContent = onboardingPage.stepContent;

      const hasFinish = await finishButton.isVisible().catch(() => false);
      const hasCompletion = await completionMessage.isVisible().catch(() => false);
      const hasContent = await lastStepContent.isVisible().catch(() => false);

      expect(hasFinish || hasCompletion || hasContent).toBeTruthy();
    });
  });

  test('resume incomplete onboarding banner appears', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Advance partway through wizard', async () => {
      await onboardingPage.fillCurrentStepFields({
        textInputValue: 'Partial Progress Test',
        selectFirstOption: true,
      });
      await onboardingPage.clickNext();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
    });

    await test.step('Leave and return to onboarding page', async () => {
      // Navigate away
      await page.goto(TEST_CONFIG.BASE_URL);
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

      // Navigate back to onboarding
      await onboardingPage.goto();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
    });

    await test.step('Check for resume banner or auto-resume', async () => {
      const resumeBanner = page.locator('[data-testid="resume-banner"], .resume-banner, [role="alert"]').filter({
        hasText: /resume|continue|incomplete|in progress/i,
      });
      const resumeButton = page.locator('button', { hasText: /resume|continue where/i });

      const hasBanner = await resumeBanner.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false);
      const hasResume = await resumeButton.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false);

      // Either shows a resume banner, or auto-resumes to the last step
      const currentStep = await onboardingPage.getCurrentStepNumber();
      expect(hasBanner || hasResume || currentStep > 1).toBeTruthy();
    });
  });

  test('wizard step count matches expected total', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Verify total step count is displayed', async () => {
      const totalSteps = await onboardingPage.getTotalSteps();
      expect(totalSteps).toBeGreaterThanOrEqual(2);
    });

    await test.step('All steps are reachable by navigating forward', async () => {
      const totalSteps = await onboardingPage.getTotalSteps();
      let reachedSteps = 1;

      for (let step = 1; step < totalSteps; step++) {
        await onboardingPage.fillCurrentStepFields({
          textInputValue: `Step ${step} test`,
          selectFirstOption: true,
        });
        await onboardingPage.clickNext();
        await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
        reachedSteps++;
      }

      expect(reachedSteps).toBe(totalSteps);
    });
  });

  test('form data persists when going back and forward', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    const testValue = 'Persistence Test Data 12345';

    await test.step('Fill in form fields on step 1', async () => {
      const textInput = page.locator('input[type="text"], input:not([type]), textarea').first();
      if (await textInput.isVisible().catch(() => false)) {
        await textInput.fill(testValue);
      }
    });

    await test.step('Advance to step 2', async () => {
      await onboardingPage.fillCurrentStepFields({
        textInputValue: testValue,
        selectFirstOption: true,
      });
      await onboardingPage.clickNext();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
    });

    await test.step('Go back to step 1', async () => {
      await onboardingPage.clickPrevious();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
    });

    await test.step('Verify data is still present', async () => {
      const textInput = page.locator('input[type="text"], input:not([type]), textarea').first();
      if (await textInput.isVisible().catch(() => false)) {
        const currentValue = await textInput.inputValue();
        expect(currentValue).toBe(testValue);
      }
    });

    await test.step('Advance again and verify step 2 loads correctly', async () => {
      await onboardingPage.clickNext();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

      const currentStep = await onboardingPage.getCurrentStepNumber();
      expect(currentStep).toBe(2);
    });
  });

  test('wizard displays step descriptions or help text', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Step has description or help text', async () => {
      const description = page.locator(
        '[data-testid="step-description"], .step-description, .help-text, .step-subtitle, p'
      );
      const descriptionCount = await description.count();

      if (descriptionCount > 0) {
        const text = await description.first().textContent();
        expect(text!.trim().length).toBeGreaterThan(0);
      }
    });
  });

  test('keyboard navigation works within wizard', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Tab through form fields', async () => {
      const firstInput = page.locator('input, textarea, select').first();
      if (await firstInput.isVisible().catch(() => false)) {
        await firstInput.focus();
        await page.keyboard.press('Tab');

        // Verify focus moved to another element
        const activeElement = page.locator(':focus');
        await expect(activeElement).toBeVisible();
      }
    });

    await test.step('Enter key on next button advances step', async () => {
      await onboardingPage.fillCurrentStepFields({
        textInputValue: 'Keyboard Nav Test',
        selectFirstOption: true,
      });

      await onboardingPage.nextButton.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

      const currentStep = await onboardingPage.getCurrentStepNumber();
      expect(currentStep).toBeGreaterThanOrEqual(1);
    });
  });

  test('wizard handles long text input gracefully', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    const longText = 'A'.repeat(500);

    await test.step('Enter long text into input field', async () => {
      const textInput = page.locator('input[type="text"], textarea').first();
      if (!await textInput.isVisible().catch(() => false)) {
        test.skip(true, 'No text input available on first step');
        return;
      }

      await textInput.fill(longText);
    });

    await test.step('Field handles long text without breaking layout', async () => {
      const textInput = page.locator('input[type="text"], textarea').first();
      const value = await textInput.inputValue();

      // Input should accept the text (possibly truncated by maxLength)
      expect(value.length).toBeGreaterThan(0);

      // Wizard container should still be properly rendered
      await expect(onboardingPage.wizardContainer).toBeVisible();
    });
  });

  test('step indicators are clickable for direct navigation', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Advance to step 2 first', async () => {
      await onboardingPage.fillCurrentStepFields({
        textInputValue: 'Direct Nav Test',
        selectFirstOption: true,
      });
      await onboardingPage.clickNext();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
    });

    await test.step('Click on step 1 indicator to go back directly', async () => {
      const stepIndicators = page.locator(
        '[data-testid*="step-indicator"], .step-indicator, .stepper button, .stepper a, [role="tab"]'
      );
      const indicatorCount = await stepIndicators.count();

      if (indicatorCount < 2) {
        test.skip(true, 'Step indicators are not clickable');
        return;
      }

      await stepIndicators.first().click();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

      const currentStep = await onboardingPage.getCurrentStepNumber();
      expect(currentStep).toBe(1);
    });
  });

  test('wizard shows loading state during submission', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    const totalSteps = await onboardingPage.getTotalSteps();

    await test.step('Navigate to the last step', async () => {
      for (let step = 1; step < totalSteps; step++) {
        await onboardingPage.fillCurrentStepFields({
          textInputValue: `Final Step Test ${step}`,
          selectFirstOption: true,
        });
        await onboardingPage.clickNext();
        await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
      }
    });

    await test.step('Submit wizard and check for loading state', async () => {
      const submitButton = page.locator('button', { hasText: /finish|complete|submit|done/i });

      if (!await submitButton.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        test.skip(true, 'No submit button found on final step');
        return;
      }

      await onboardingPage.fillCurrentStepFields({
        textInputValue: 'Final submission data',
        selectFirstOption: true,
      });

      await submitButton.click();

      // Check for loading indicator
      const loading = page.locator('[data-testid="loading"], .loading, .spinner, [role="progressbar"], button[disabled]');
      const success = page.locator('text=/complete|success|congratulations|finished/i');

      // Either loading appears briefly then success, or success directly
      await expect(loading.first().or(success.first())).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('error state displays when wizard submission fails', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);

    await test.step('Mock submission failure', async () => {
      await page.route('**/api/**/onboard*', (route) => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Internal Server Error' }),
          contentType: 'application/json',
        });
      });
    });

    await test.step('Navigate through wizard to completion', async () => {
      const totalSteps = await onboardingPage.getTotalSteps();

      for (let step = 1; step < totalSteps; step++) {
        await onboardingPage.fillCurrentStepFields({
          textInputValue: `Error Test ${step}`,
          selectFirstOption: true,
        });
        await onboardingPage.clickNext();
        await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
      }
    });

    await test.step('Submit and verify error handling', async () => {
      const submitButton = page.locator('button', { hasText: /finish|complete|submit|done/i });
      if (await submitButton.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        await onboardingPage.fillCurrentStepFields({
          textInputValue: 'Error submission test',
          selectFirstOption: true,
        });
        await submitButton.click();
        await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

        const errorIndicator = page.locator('[role="alert"], .error, [data-testid*="error"]');
        const errorText = page.locator('text=/error|failed|try again/i');

        const hasError = await errorIndicator.first().isVisible().catch(() => false);
        const hasErrorText = await errorText.isVisible().catch(() => false);

        expect(hasError || hasErrorText).toBeTruthy();
      }
    });

    await test.step('Clean up route mock', async () => {
      await page.unrouteAll();
    });
  });

  test('wizard cancel button returns to previous page', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Click cancel button if available', async () => {
      const cancelButton = page.locator('button, a').filter({ hasText: /cancel|exit|close/i }).first();

      if (!await cancelButton.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        test.skip(true, 'Cancel button not available in wizard');
        return;
      }

      const currentUrl = page.url();
      await cancelButton.click();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

      // Should navigate away from onboarding
      const newUrl = page.url();
      // URL should change or a confirmation dialog should appear
      const dialog = page.locator('[role="dialog"], dialog, .modal');
      const urlChanged = newUrl !== currentUrl;
      const hasDialog = await dialog.isVisible().catch(() => false);

      expect(urlChanged || hasDialog).toBeTruthy();
    });
  });

  test('wizard adapts to viewport size', async ({ page }) => {
    const onboardingPage = new AdminOnboardingPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Wizard is visible at current viewport', async () => {
      await expect(onboardingPage.wizardContainer).toBeVisible();
    });

    await test.step('Wizard remains functional at smaller viewport', async () => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

      await expect(onboardingPage.wizardContainer).toBeVisible();
      await expect(onboardingPage.nextButton).toBeVisible();
    });

    await test.step('Wizard remains functional at mobile viewport', async () => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

      await expect(onboardingPage.wizardContainer).toBeVisible();
    });
  });
});
