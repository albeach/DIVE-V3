import { Page, Locator, expect } from '@playwright/test';
import { TEST_CONFIG } from '../fixtures/test-config';

/**
 * Page object for the Admin Onboarding Tour
 *
 * The onboarding page renders an AdminOnboardingTour overlay component
 * with step-by-step guided navigation (Next/Back/Skip/Complete).
 * There are NO form fields — it's an informational tour.
 */
export class AdminOnboardingPage {
  readonly page: Page;
  readonly tourCard: Locator;
  readonly stepCounter: Locator;
  readonly stepTitle: Locator;
  readonly stepDescription: Locator;
  readonly stepContent: Locator;
  readonly nextButton: Locator;
  readonly backButton: Locator;
  readonly skipButton: Locator;
  readonly closeButton: Locator;
  readonly completeButton: Locator;
  readonly progressBars: Locator;
  readonly actionLink: Locator;

  constructor(page: Page) {
    this.page = page;

    // The tour card is a fixed-position overlay
    this.tourCard = page
      .locator('.fixed .rounded-2xl.shadow-2xl')
      .or(page.locator('[class*="fixed"][class*="z-"]').locator('.rounded-2xl'))
      .or(page.locator('div.fixed').filter({ has: page.locator('h3') }));

    // "Step X of Y" text
    this.stepCounter = page
      .getByText(/step \d+ of \d+/i)
      .or(page.locator('text=/Step \\d+/i'));

    // Tour step title (<h3>)
    this.stepTitle = page
      .locator('h3').first()
      .or(page.getByRole('heading', { level: 3 }));

    // Step description (first <p> in header section)
    this.stepDescription = page
      .locator('.text-white\\/90')
      .or(page.locator('p').filter({ hasText: /.{20,}/ }).first());

    // Step content (paragraph in the content area)
    this.stepContent = page
      .locator('.text-slate-700, .dark\\:text-slate-300')
      .or(page.locator('p.leading-relaxed'));

    // Navigation buttons
    this.nextButton = page
      .getByRole('button', { name: /next/i })
      .or(page.locator('button').filter({ hasText: /next/i }));

    this.backButton = page
      .getByRole('button', { name: /back/i })
      .or(page.locator('button').filter({ hasText: /back/i }));

    this.skipButton = page
      .getByRole('button', { name: /skip tour/i })
      .or(page.locator('button').filter({ hasText: /skip/i }));

    this.closeButton = page
      .getByRole('button', { name: /close tour/i })
      .or(page.locator('button[aria-label="Close tour"]'));

    this.completeButton = page
      .getByRole('button', { name: /complete/i })
      .or(page.locator('button').filter({ hasText: /complete/i }));

    // Progress bar segments
    this.progressBars = page.locator('.rounded-full.h-1\\.5, .h-1\\.5.rounded-full');

    // Action link in tour step
    this.actionLink = page
      .locator('a').filter({ has: page.locator('svg') })
      .or(page.locator('a[href]').filter({ hasText: /.+/ }));
  }

  async goto() {
    await this.page.goto('/admin/onboarding?start=1', {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
    });
    await this.page.waitForLoadState('networkidle');
  }

  async isTourVisible(): Promise<boolean> {
    return await this.stepTitle.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION }).catch(() => false);
  }

  async clickNext() {
    // On the last step, the button says "Complete" instead of "Next"
    const nextOrComplete = this.nextButton.or(this.completeButton);
    await nextOrComplete.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  }

  async clickBack() {
    await this.backButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  }

  async clickSkip() {
    await this.skipButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  }

  async clickClose() {
    await this.closeButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  }

  async getCurrentStepNumber(): Promise<number> {
    const counterText = await this.stepCounter.textContent() ?? '';
    const match = counterText.match(/step\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
  }

  async getTotalSteps(): Promise<number> {
    const counterText = await this.stepCounter.textContent() ?? '';
    const match = counterText.match(/of\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
  }

  async getStepTitle(): Promise<string> {
    return (await this.stepTitle.textContent()) ?? '';
  }
}
