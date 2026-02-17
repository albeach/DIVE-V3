import { Page, Locator, expect } from '@playwright/test';
import { TEST_CONFIG } from '../fixtures/test-config';

export class AdminOnboardingPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly wizardSteps: Locator;
  readonly currentStep: Locator;
  readonly stepTitle: Locator;
  readonly nextButton: Locator;
  readonly prevButton: Locator;
  readonly finishButton: Locator;
  readonly formFields: Locator;
  readonly validationErrors: Locator;
  readonly progressIndicator: Locator;
  readonly resumeBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page
      .getByRole('heading', { name: /onboarding/i })
      .or(page.getByRole('heading', { name: /setup wizard/i }));
    this.wizardSteps = page
      .getByRole('list', { name: /steps/i })
      .or(page.getByRole('tablist'))
      .or(page.locator('[data-testid="wizard-steps"]'));
    this.currentStep = page
      .locator('[aria-current="step"]')
      .or(page.locator('[data-testid="current-step"]'));
    this.stepTitle = page
      .getByRole('heading', { level: 2 })
      .or(page.locator('[data-testid="step-title"]'));
    this.nextButton = page
      .getByRole('button', { name: /next/i })
      .or(page.getByRole('button', { name: /continue/i }))
      .or(page.locator('[data-testid="next-button"]'));
    this.prevButton = page
      .getByRole('button', { name: /previous/i })
      .or(page.getByRole('button', { name: /back/i }))
      .or(page.locator('[data-testid="prev-button"]'));
    this.finishButton = page
      .getByRole('button', { name: /finish/i })
      .or(page.getByRole('button', { name: /complete/i }))
      .or(page.locator('[data-testid="finish-button"]'));
    this.formFields = page
      .getByRole('group')
      .or(page.locator('[data-testid="form-fields"]'));
    this.validationErrors = page
      .getByRole('alert')
      .or(page.locator('[data-testid="validation-errors"]'));
    this.progressIndicator = page
      .getByRole('progressbar')
      .or(page.locator('[data-testid="progress-indicator"]'));
    this.resumeBanner = page
      .getByRole('banner')
      .filter({ hasText: /resume/i })
      .or(page.getByText(/resume where you left off/i))
      .or(page.locator('[data-testid="resume-banner"]'));
  }

  async goto() {
    await this.page.goto('/admin/onboarding', {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
    });
    await this.page.waitForLoadState('networkidle');
  }

  async verifyLoaded() {
    await expect(this.heading).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async getCurrentStepNumber(): Promise<number> {
    await this.currentStep.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    const stepText = (await this.currentStep.textContent()) ?? '';
    const match = stepText.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  async getStepTitle(): Promise<string> {
    await this.stepTitle.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    return (await this.stepTitle.textContent()) ?? '';
  }

  async goToNextStep() {
    await this.nextButton.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    await this.nextButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForLoadState('networkidle');
  }

  async goToPrevStep() {
    await this.prevButton.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    await this.prevButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForLoadState('networkidle');
  }

  async fillStepForm(data: Record<string, string>) {
    for (const [fieldName, value] of Object.entries(data)) {
      const field = this.page
        .getByRole('textbox', { name: new RegExp(fieldName, 'i') })
        .or(this.page.getByLabel(new RegExp(fieldName, 'i')))
        .or(this.page.locator(`[data-testid="field-${fieldName}"]`));
      await field.waitFor({
        state: 'visible',
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
      await field.fill(value);
    }
  }

  async verifyValidationError(field: string, message: string) {
    const errorLocator = this.page
      .getByRole('alert')
      .filter({ hasText: new RegExp(message, 'i') })
      .or(
        this.page
          .locator(`[data-testid="error-${field}"]`)
          .filter({ hasText: new RegExp(message, 'i') })
      );
    await expect(errorLocator.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async completeWizard() {
    await this.finishButton.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    await this.finishButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForLoadState('networkidle');
  }

  async verifyProgress(percentage: number) {
    await this.progressIndicator.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    const ariaValue = await this.progressIndicator.getAttribute('aria-valuenow');
    if (ariaValue !== null) {
      expect(parseInt(ariaValue, 10)).toBe(percentage);
    } else {
      const text = (await this.progressIndicator.textContent()) ?? '';
      expect(text).toContain(`${percentage}`);
    }
  }

  async resumeIncomplete() {
    await this.resumeBanner.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    const resumeButton = this.resumeBanner
      .getByRole('button', { name: /resume/i })
      .or(this.resumeBanner.getByRole('link', { name: /resume/i }))
      .or(this.resumeBanner.locator('[data-testid="resume-button"]'));
    await resumeButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForLoadState('networkidle');
  }
}
