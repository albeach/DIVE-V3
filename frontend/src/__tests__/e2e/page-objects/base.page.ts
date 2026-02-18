/**
 * Base Page Object
 *
 * Common functionality for all DIVE pages
 */

import { Page } from '@playwright/test';

export class BasePage {
  constructor(protected page: Page) {}

  /**
   * Navigate to a relative path
   */
  async goto(path: string = '') {
    await this.page.goto(path);
  }

  /**
   * Wait for page to be fully loaded
   */
  async waitForLoad() {
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    // Look for common authenticated user indicators
    const userIndicators = this.page.locator('[data-testid*="user"], [data-testid*="profile"], [data-testid*="account"]');
    return await userIndicators.count() > 0;
  }

  /**
   * Get current user information
   */
  async getCurrentUser(): Promise<{ name?: string; clearance?: string; country?: string }> {
    const user = {
      name: await this.page.locator('[data-testid="user-name"], [data-testid="user-info"]').textContent(),
      clearance: await this.page.locator('[data-testid="user-clearance"]').textContent(),
      country: await this.page.locator('[data-testid="user-country"]').textContent()
    };
    return user;
  }

  /**
   * Check if page has expected title
   */
  async hasCorrectTitle(expectedTitle: string): Promise<boolean> {
    const title = await this.page.title();
    return title.includes(expectedTitle);
  }

  /**
   * Take screenshot for debugging
   */
  async takeScreenshot(name: string) {
    await this.page.screenshot({ path: `debug-${name}.png`, fullPage: true });
  }

  /**
   * Wait for element to be visible
   */
  async waitForElement(selector: string, timeout = 5000) {
    await this.page.waitForSelector(selector, { timeout, state: 'visible' });
  }

  /**
   * Check if element exists
   */
  async elementExists(selector: string): Promise<boolean> {
    return await this.page.locator(selector).count() > 0;
  }

  /**
   * Get page URL
   */
  getCurrentUrl(): string {
    return this.page.url();
  }

  /**
   * Navigate back
   */
  async goBack() {
    await this.page.goBack();
  }

  /**
   * Reload page
   */
  async reload() {
    await this.page.reload();
  }
}

