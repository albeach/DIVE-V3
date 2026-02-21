/**
 * Resource Form Page Object
 *
 * Handles resource creation and editing forms
 */

import { Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class ResourceFormPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Check if form is loaded
   */
  async isLoaded(): Promise<boolean> {
    return await this.elementExists('form') &&
           (await this.elementExists('[data-testid="resource-form"]') ||
            await this.elementExists('[data-testid*="create"]') ||
            await this.elementExists('[data-testid*="edit"]'));
  }

  /**
   * Fill resource title
   */
  async fillTitle(title: string) {
    const titleInput = this.page.locator('[data-testid="resource-title"], input[name*="title"], #title');
    await expect(titleInput).toBeVisible();
    await titleInput.fill(title);
  }

  /**
   * Select classification
   */
  async selectClassification(classification: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET') {
    const classificationSelect = this.page.locator('[data-testid="classification-select"], select[name*="class"], #classification');
    await expect(classificationSelect).toBeVisible();
    await classificationSelect.selectOption(classification);
  }

  /**
   * Fill resource content/description
   */
  async fillContent(content: string) {
    const contentTextarea = this.page.locator('[data-testid="resource-content"], textarea[name*="content"], #content');
    await expect(contentTextarea).toBeVisible();
    await contentTextarea.fill(content);
  }

  /**
   * Set releasability options
   */
  async setReleasability(countries: string[]) {
    // Clear existing selections first
    const checkboxes = this.page.locator('[data-testid*="releasable"], input[type="checkbox"]');

    // Uncheck all first
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      const checkbox = checkboxes.nth(i);
      if (await checkbox.isChecked()) {
        await checkbox.uncheck();
      }
    }

    // Check desired countries
    for (const country of countries) {
      const countryCheckbox = this.page.locator(`[data-testid*="releasable-${country.toLowerCase()}"], input[value="${country}"]`).first();
      if (await countryCheckbox.count() > 0) {
        await countryCheckbox.check();
      }
    }
  }

  /**
   * Set Community of Interest
   */
  async setCOI(cois: string[]) {
    // Similar to releasability but for COI checkboxes
    const coiCheckboxes = this.page.locator('[data-testid*="coi"], input[type="checkbox"][value*="NATO"], input[type="checkbox"][value*="FVEY"]');

    // Clear existing
    const count = await coiCheckboxes.count();
    for (let i = 0; i < count; i++) {
      const checkbox = coiCheckboxes.nth(i);
      if (await checkbox.isChecked()) {
        await checkbox.uncheck();
      }
    }

    // Set desired COIs
    for (const coi of cois) {
      const coiCheckbox = this.page.locator(`input[value="${coi}"], [data-testid*="coi-${coi.toLowerCase()}"]`).first();
      if (await coiCheckbox.count() > 0) {
        await coiCheckbox.check();
      }
    }
  }

  /**
   * Set embargo date (if supported)
   */
  async setEmbargoDate(date: string) {
    const dateInput = this.page.locator('[data-testid="embargo-date"], input[type="date"], input[name*="embargo"]');
    if (await dateInput.count() > 0) {
      await dateInput.fill(date);
    }
  }

  /**
   * Mark as encrypted (if KAS integration exists)
   */
  async setEncrypted(encrypted: boolean) {
    const encryptedCheckbox = this.page.locator('[data-testid="encrypted"], input[name*="encrypted"]');
    if (await encryptedCheckbox.count() > 0) {
      if (encrypted) {
        await encryptedCheckbox.check();
      } else {
        await encryptedCheckbox.uncheck();
      }
    }
  }

  /**
   * Submit the form
   */
  async submitForm() {
    const submitButton = this.page.locator('[data-testid="submit"], [data-testid="create"], [data-testid="save"], button[type="submit"]').filter({
      hasText: /create|save|submit/i
    }).first();

    await expect(submitButton).toBeVisible();
    await submitButton.click();

    // Wait for navigation or success message
    await this.page.waitForURL(/.*\/resources.*/, { timeout: 10000 });
  }

  /**
   * Cancel the form
   */
  async cancelForm() {
    const cancelButton = this.page.locator('[data-testid="cancel"], button').filter({
      hasText: /cancel|back/i
    }).first();

    if (await cancelButton.count() > 0) {
      await cancelButton.click();
      await this.page.waitForURL(/.*\/resources.*/, { timeout: 5000 });
    }
  }

  /**
   * Check for validation errors
   */
  async getValidationErrors(): Promise<string[]> {
    const errorElements = this.page.locator('[data-testid*="error"], .error, .invalid-feedback, [class*="error"]');
    const errors: string[] = [];

    const count = await errorElements.count();
    for (let i = 0; i < count; i++) {
      const errorText = await errorElements.nth(i).textContent();
      if (errorText) {
        errors.push(errorText.trim());
      }
    }

    return errors;
  }

  /**
   * Check if classification is restricted based on user clearance
   */
  async isClassificationRestricted(classification: string): Promise<boolean> {
    const classificationOption = this.page.locator(`option[value="${classification}"], [data-testid*="classification-${classification}"]`);
    const isDisabled = await classificationOption.getAttribute('disabled') !== null;
    return isDisabled || await classificationOption.count() === 0;
  }

  /**
   * Check required field indicators
   */
  async getRequiredFields(): Promise<string[]> {
    const requiredFields: string[] = [];

    // Look for fields marked as required
    const requiredInputs = this.page.locator('input[required], select[required], textarea[required]');
    const count = await requiredInputs.count();

    for (let i = 0; i < count; i++) {
      const input = requiredInputs.nth(i);
      const name = await input.getAttribute('name') ||
                  await input.getAttribute('id') ||
                  `field-${i}`;
      requiredFields.push(name);
    }

    return requiredFields;
  }

  /**
   * Fill all required fields with test data
   */
  async fillRequiredFields() {
    await this.fillTitle('Test Resource');
    await this.selectClassification('UNCLASSIFIED');
    await this.fillContent('Test content for automated testing');
  }
}

