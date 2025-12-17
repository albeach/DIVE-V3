/**
 * Resources Page Object
 *
 * Handles resource listing, viewing, creating, editing, and deleting
 */

import { Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class ResourcesPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to resources page
   */
  async goto() {
    await this.page.goto('/resources');
    await this.waitForLoad();
  }

  /**
   * Check if resources page is loaded
   */
  async isLoaded(): Promise<boolean> {
    return await this.elementExists('[data-testid="resource-list"]') ||
           await this.elementExists('[data-testid="resources-container"]');
  }

  /**
   * Get all visible resources
   */
  async getVisibleResources(): Promise<Array<{
    id: string;
    title: string;
    classification: string;
    releasableTo: string[];
    coi: string[];
  }>> {
    const resources: Array<{
      id: string;
      title: string;
      classification: string;
      releasableTo: string[];
      coi: string[];
    }> = [];

    const resourceElements = this.page.locator('[data-testid="resource-item"], .resource-card, .resource-row');

    const count = await resourceElements.count();
    for (let i = 0; i < count; i++) {
      const element = resourceElements.nth(i);

      const id = await element.getAttribute('data-resource-id') ||
                 await element.locator('[data-testid="resource-id"]').textContent() || '';

      const title = await element.locator('[data-testid="resource-title"], .resource-title, h3, h4').first().textContent() || '';

      const classification = await element.getAttribute('data-classification') ||
                           await element.locator('[data-testid="classification"], .classification').textContent() || '';

      const releasableTo = await element.getAttribute('data-releasable')?.split(',') || [];
      const coi = await element.getAttribute('data-coi')?.split(',') || [];

      resources.push({
        id: id.trim(),
        title: title.trim(),
        classification: classification.trim(),
        releasableTo,
        coi
      });
    }

    return resources;
  }

  /**
   * Filter resources by classification
   */
  async filterByClassification(classification: string) {
    const filterSelect = this.page.locator('[data-testid="classification-filter"], select[name*="class"], .classification-filter');
    await expect(filterSelect).toBeVisible();
    await filterSelect.selectOption(classification);
    await this.waitForLoad();
  }

  /**
   * Search for resources
   */
  async searchResources(query: string) {
    const searchInput = this.page.locator('[data-testid="search-input"], input[type="search"], .search-input');
    await expect(searchInput).toBeVisible();
    await searchInput.fill(query);
    await searchInput.press('Enter');
    await this.waitForLoad();
  }

  /**
   * Click on a specific resource
   */
  async clickResource(resourceId: string) {
    const resourceLink = this.page.locator(`[data-resource-id="${resourceId}"], [data-testid="resource-${resourceId}"]`).first();
    await expect(resourceLink).toBeVisible();
    await resourceLink.click();
    await this.page.waitForURL(/.*\/resources\/.*/, { timeout: 5000 });
  }

  /**
   * Click create new resource button
   */
  async clickCreateResource() {
    const createButton = this.page.locator('[data-testid="create-resource"], [data-testid="new-resource"], button').filter({
      hasText: /create|new|add/i
    }).first();

    await expect(createButton).toBeVisible();
    await createButton.click();
    await this.page.waitForURL(/.*\/resources\/new.*/, { timeout: 5000 });
  }

  /**
   * Check if user can see restricted resources
   */
  async canSeeRestrictedResources(classification: string): Promise<boolean> {
    const restrictedResources = this.page.locator(`[data-classification="${classification}"], [data-testid*="classification"]`).filter({
      hasText: new RegExp(classification, 'i')
    });

    return await restrictedResources.count() > 0;
  }

  /**
   * Check for access denied messages
   */
  async hasAccessDeniedMessages(): Promise<boolean> {
    const deniedMessages = this.page.locator('[data-testid*="access-denied"], [data-testid*="denied"], .access-denied, .denied');
    return await deniedMessages.count() > 0;
  }

  /**
   * Get resource count
   */
  async getResourceCount(): Promise<number> {
    const resources = this.page.locator('[data-testid="resource-item"], .resource-card, .resource-row');
    return await resources.count();
  }

  /**
   * Check if pagination exists
   */
  async hasPagination(): Promise<boolean> {
    const pagination = this.page.locator('[data-testid*="pagination"], .pagination, [data-testid*="page"]');
    return await pagination.count() > 0;
  }

  /**
   * Check for loading indicators
   */
  async hasLoadingIndicator(): Promise<boolean> {
    const loading = this.page.locator('[data-testid*="loading"], .loading, .spinner, [aria-label*="loading"]');
    return await loading.count() > 0;
  }

  /**
   * Wait for resources to load
   */
  async waitForResourcesToLoad() {
    await this.page.waitForSelector('[data-testid="resource-list"], [data-testid="resources-container"], .resource-list', { timeout: 10000 });
    // Wait for any loading to complete
    await this.page.waitForFunction(() => {
      const loadingElements = document.querySelectorAll('[data-testid*="loading"], .loading, .spinner');
      return loadingElements.length === 0;
    }, { timeout: 10000 });
  }
}
