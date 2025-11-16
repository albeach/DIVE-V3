/**
 * Resources Page Object Model
 * 
 * Encapsulates interactions with the resources list and detail pages
 * 
 * Usage:
 * ```typescript
 * const resourcesPage = new ResourcesPage(page);
 * await resourcesPage.goto();
 * await resourcesPage.searchFor('NATO');
 * const count = await resourcesPage.getResourceCount();
 * ```
 */

import { Page, Locator, expect } from '@playwright/test';
import { TEST_CONFIG } from '../fixtures/test-config';

export class ResourcesPage {
  readonly page: Page;
  
  // Page elements
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly filterButton: Locator;
  readonly resourceCards: Locator;
  readonly resourceTable: Locator;
  readonly loadingIndicator: Locator;
  readonly emptyState: Locator;
  
  // Filter elements
  readonly classificationFilter: Locator;
  readonly countryFilter: Locator;
  readonly coiFilter: Locator;
  readonly applyFilterButton: Locator;
  readonly clearFilterButton: Locator;
  
  constructor(page: Page) {
    this.page = page;
    
    // Main elements
    this.heading = page.getByRole('heading', { name: /resources|documents/i });
    this.searchInput = page.getByPlaceholder(/search resources|search documents/i)
      .or(page.locator(TEST_CONFIG.SELECTORS.RESOURCE_SEARCH));
    
    this.filterButton = page.getByRole('button', { name: /filter|filters/i })
      .or(page.locator(TEST_CONFIG.SELECTORS.RESOURCE_FILTER));
    
    this.resourceCards = page.locator(TEST_CONFIG.SELECTORS.RESOURCE_CARD)
      .or(page.locator('[data-resource-id]'))
      .or(page.getByTestId('resource-card'));
    
    this.resourceTable = page.getByRole('table')
      .or(page.locator('table.resources-table'));
    
    this.loadingIndicator = page.getByText(/loading|fetching/i)
      .or(page.getByRole('status'));
    
    this.emptyState = page.getByText(/no resources found|no documents/i);
    
    // Filter elements
    this.classificationFilter = page.getByLabel(/classification/i);
    this.countryFilter = page.getByLabel(/country|releasability/i);
    this.coiFilter = page.getByLabel(/coi|community of interest/i);
    this.applyFilterButton = page.getByRole('button', { name: /apply|filter/i });
    this.clearFilterButton = page.getByRole('button', { name: /clear|reset/i });
  }
  
  /**
   * Navigate to resources list page
   */
  async goto() {
    await this.page.goto('/resources', { 
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      waitUntil: 'domcontentloaded'
    });
    await this.waitForPageLoad();
  }
  
  /**
   * Wait for resources page to load
   */
  async waitForPageLoad() {
    await this.heading.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    
    // Wait for loading to finish
    await this.page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NETWORK });
    
    // Wait a bit for any animations
    await this.page.waitForTimeout(TEST_CONFIG.TIMEOUTS.DEBOUNCE);
  }
  
  /**
   * Search for resources
   * 
   * @param query Search query
   */
  async searchFor(query: string) {
    await this.searchInput.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.searchInput.fill(query);
    
    // Wait for debounce and results to update
    await this.page.waitForTimeout(TEST_CONFIG.TIMEOUTS.DEBOUNCE);
    await this.page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NETWORK });
  }
  
  /**
   * Clear search input
   */
  async clearSearch() {
    await this.searchInput.clear();
    await this.page.waitForTimeout(TEST_CONFIG.TIMEOUTS.DEBOUNCE);
  }
  
  /**
   * Get count of visible resources
   */
  async getResourceCount(): Promise<number> {
    // Try cards first, then table rows
    const cardCount = await this.resourceCards.count();
    
    if (cardCount > 0) {
      return cardCount;
    }
    
    // Check table
    const rows = this.page.getByRole('row');
    const rowCount = await rows.count();
    
    // Subtract header row
    return Math.max(0, rowCount - 1);
  }
  
  /**
   * Click a resource by index (0-based)
   * 
   * @param index Resource index
   */
  async clickResource(index: number) {
    const resource = this.resourceCards.nth(index);
    await resource.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await resource.click();
    
    // Wait for navigation to detail page
    await this.page.waitForURL(/\/resources\/.+/, { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
  }
  
  /**
   * Click a resource by ID
   * 
   * @param resourceId Resource ID
   */
  async clickResourceById(resourceId: string) {
    const resource = this.page.locator(`[data-resource-id="${resourceId}"]`)
      .or(this.page.getByTestId(`resource-${resourceId}`));
    
    await resource.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await resource.click();
    
    // Wait for navigation to detail page
    await this.page.waitForURL(/\/resources\/.+/, { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
  }
  
  /**
   * Navigate to resource detail page directly
   * 
   * @param resourceId Resource ID
   */
  async gotoResourceDetail(resourceId: string) {
    await this.page.goto(`/resources/${resourceId}`, { 
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      waitUntil: 'domcontentloaded'
    });
    await this.page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NETWORK });
  }
  
  /**
   * Open filter panel
   */
  async openFilters() {
    await this.filterButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    
    // Wait for filter panel to appear
    await this.classificationFilter.or(this.countryFilter).first()
      .waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  }
  
  /**
   * Filter by classification level
   * 
   * @param classification Classification level (e.g., "SECRET", "TOP_SECRET")
   */
  async filterByClassification(classification: string) {
    // Open filters if not already open
    const isFilterOpen = await this.classificationFilter.isVisible({ timeout: 1000 }).catch(() => false);
    if (!isFilterOpen) {
      await this.openFilters();
    }
    
    // Select classification checkbox/option
    const classificationOption = this.page.getByRole('checkbox', { name: new RegExp(classification, 'i') })
      .or(this.page.getByLabel(new RegExp(classification, 'i')));
    
    await classificationOption.check();
    
    // Apply filter
    await this.applyFilterButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    
    // Wait for results to update
    await this.page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NETWORK });
  }
  
  /**
   * Filter by country
   * 
   * @param countryCode Country code (e.g., "USA", "FRA")
   */
  async filterByCountry(countryCode: string) {
    // Open filters if not already open
    const isFilterOpen = await this.countryFilter.isVisible({ timeout: 1000 }).catch(() => false);
    if (!isFilterOpen) {
      await this.openFilters();
    }
    
    // Select country checkbox/option
    const countryOption = this.page.getByRole('checkbox', { name: new RegExp(countryCode, 'i') })
      .or(this.page.getByLabel(new RegExp(countryCode, 'i')));
    
    await countryOption.check();
    
    // Apply filter
    await this.applyFilterButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    
    // Wait for results to update
    await this.page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NETWORK });
  }
  
  /**
   * Clear all filters
   */
  async clearFilters() {
    await this.clearFilterButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    
    // Wait for results to update
    await this.page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NETWORK });
  }
  
  /**
   * Verify empty state is shown
   */
  async verifyEmptyState() {
    await expect(this.emptyState).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  }
  
  /**
   * Verify resources are displayed
   */
  async verifyResourcesDisplayed() {
    const count = await this.getResourceCount();
    expect(count).toBeGreaterThan(0);
  }
  
  /**
   * Get resource title by index
   * 
   * @param index Resource index
   */
  async getResourceTitle(index: number): Promise<string> {
    const resource = this.resourceCards.nth(index);
    const title = resource.locator('[data-title]').or(resource.getByRole('heading')).first();
    
    return (await title.textContent()) || '';
  }
  
  /**
   * Get resource classification by index
   * 
   * @param index Resource index
   */
  async getResourceClassification(index: number): Promise<string> {
    const resource = this.resourceCards.nth(index);
    const classification = resource.locator('[data-classification]')
      .or(resource.getByText(/UNCLASSIFIED|CONFIDENTIAL|SECRET|TOP_SECRET/));
    
    return (await classification.textContent()) || '';
  }
  
  /**
   * Verify resource is accessible (ALLOW decision)
   * 
   * @param resourceId Resource ID
   */
  async verifyResourceAccessible(resourceId: string) {
    await this.gotoResourceDetail(resourceId);
    
    // Should NOT see access denied message
    const deniedMessage = this.page.getByText(/access denied|forbidden|not authorized/i);
    await expect(deniedMessage).not.toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    
    // Should see resource content or details
    const content = this.page.getByText(/content|description|classification/i);
    await expect(content).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  }
  
  /**
   * Verify resource is denied (DENY decision)
   * 
   * @param resourceId Resource ID
   */
  async verifyResourceDenied(resourceId: string) {
    await this.gotoResourceDetail(resourceId);
    
    // Should see access denied message
    const deniedMessage = this.page.getByText(/access denied|forbidden|not authorized|insufficient clearance/i)
      .or(this.page.locator(TEST_CONFIG.SELECTORS.DECISION_DENY));
    
    await expect(deniedMessage).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  }
}

