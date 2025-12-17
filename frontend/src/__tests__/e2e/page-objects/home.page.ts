/**
 * Home Page Object
 *
 * Represents the main landing page with IdP selection
 */

import { Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class HomePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Check if page is loaded correctly
   */
  async isLoaded(): Promise<boolean> {
    await this.waitForLoad();
    return await this.hasCorrectTitle('DIVE');
  }

  /**
   * Get all available IdP buttons
   */
  async getAvailableIdPs(): Promise<string[]> {
    const idpButtons = this.page.locator('button, [role="button"]').filter({
      hasText: /(united states|france|germany|uk|denmark|albania|romania|industry)/i
    });

    const idps: string[] = [];
    const count = await idpButtons.count();

    for (let i = 0; i < count; i++) {
      const text = await idpButtons.nth(i).textContent();
      if (text) {
        idps.push(text.trim());
      }
    }

    return idps;
  }

  /**
   * Click on a specific IdP button
   */
  async selectIdP(idpName: string) {
    const idpButton = this.page.getByRole('button', { name: new RegExp(idpName, 'i') })
      .or(this.page.locator(`button:has-text("${idpName}")`))
      .or(this.page.locator(`[role="button"]:has-text("${idpName}")`))
      .first();

    await expect(idpButton).toBeVisible();
    await idpButton.click();

    // Wait for navigation to auth provider
    await this.page.waitForURL(/.*keycloak.*/, { timeout: 10000 });
  }

  /**
   * Check if federation options are available
   */
  async hasFederationOptions(): Promise<boolean> {
    const federationElements = this.page.locator('[data-testid*="federat"], button, a').filter({
      hasText: /federat|hub|spoke/i
    });

    return await federationElements.count() > 0;
  }

  /**
   * Click federation option
   */
  async selectFederation(target: string) {
    const federationButton = this.page.locator('[data-testid*="federat"], button, a').filter({
      hasText: new RegExp(target, 'i')
    }).first();

    await expect(federationButton).toBeVisible();
    await federationButton.click();

    // Wait for federation redirect
    await this.page.waitForURL(/.*localhost.*/, { timeout: 10000 });
  }

  /**
   * Check for instance-specific branding
   */
  async getInstanceBranding(): Promise<string | null> {
    const brandingElement = this.page.locator('[data-testid*="brand"], [data-testid*="instance"], h1, .branding');
    return await brandingElement.first().textContent();
  }

  /**
   * Check if emergency access options exist
   */
  async hasEmergencyAccess(): Promise<boolean> {
    const emergencyElements = this.page.locator('[data-testid*="emergency"], button, a').filter({
      hasText: /emergency|bypass|admin/i
    });

    return await emergencyElements.count() > 0;
  }
}
