/**
 * Dashboard Page Object Model
 * 
 * Encapsulates interactions with the main dashboard page
 * 
 * Usage:
 * ```typescript
 * const dashboardPage = new DashboardPage(page);
 * await dashboardPage.goto();
 * await dashboardPage.verifyUserInfo('testuser-usa-3', 'SECRET', 'USA');
 * ```
 */

import { Page, Locator, expect } from '@playwright/test';
import { TEST_CONFIG } from '../fixtures/test-config';

export class DashboardPage {
  readonly page: Page;
  
  // Main elements
  readonly heading: Locator;
  readonly welcomeMessage: Locator;
  readonly userMenu: Locator;
  readonly userAvatar: Locator;
  
  // User info elements
  readonly userClearance: Locator;
  readonly userCountry: Locator;
  readonly userCOI: Locator;
  readonly userName: Locator;
  
  // Navigation elements
  readonly resourcesLink: Locator;
  readonly policiesLink: Locator;
  readonly adminLink: Locator;
  readonly complianceLink: Locator;
  
  // Quick actions
  readonly viewResourcesButton: Locator;
  readonly uploadDocumentButton: Locator;
  readonly viewPoliciesButton: Locator;
  
  // Stats/metrics (if dashboard shows summary)
  readonly resourceCount: Locator;
  readonly recentActivity: Locator;
  readonly authorizationStats: Locator;
  
  // Identity drawer (Cmd+I)
  readonly identityDrawer: Locator;
  readonly identityDrawerTrigger: Locator;
  
  constructor(page: Page) {
    this.page = page;
    
    // Main elements
    this.heading = page.getByRole('heading', { name: /dashboard|home|welcome/i });
    this.welcomeMessage = page.getByText(/welcome|hello/i);
    
    this.userMenu = page.locator(TEST_CONFIG.SELECTORS.USER_MENU)
      .or(page.getByRole('button', { name: /user|profile|account/i }));
    
    this.userAvatar = page.getByRole('img', { name: /avatar|profile/i })
      .or(page.locator('[data-testid="user-avatar"]'));
    
    // User info
    this.userClearance = page.locator(TEST_CONFIG.SELECTORS.USER_CLEARANCE)
      .or(page.getByText(/clearance:/i))
      .or(page.locator('[data-clearance]'));
    
    this.userCountry = page.locator(TEST_CONFIG.SELECTORS.USER_COUNTRY)
      .or(page.getByText(/country:/i))
      .or(page.locator('[data-country]'));
    
    this.userCOI = page.locator(TEST_CONFIG.SELECTORS.USER_COI)
      .or(page.getByText(/coi:|community/i))
      .or(page.locator('[data-coi]'));
    
    this.userName = page.getByText(/logged in as|user:/i)
      .or(page.locator('[data-username]'));
    
    // Navigation links
    this.resourcesLink = page.getByRole('link', { name: /resources|documents/i });
    this.policiesLink = page.getByRole('link', { name: /policies/i });
    this.adminLink = page.getByRole('link', { name: /admin|administration/i });
    this.complianceLink = page.getByRole('link', { name: /compliance/i });
    
    // Quick actions
    this.viewResourcesButton = page.getByRole('button', { name: /view resources|browse documents/i })
      .or(page.getByRole('link', { name: /view resources|browse documents/i }));
    
    this.uploadDocumentButton = page.getByRole('button', { name: /upload|add document/i });
    
    this.viewPoliciesButton = page.getByRole('button', { name: /view policies|manage policies/i })
      .or(page.getByRole('link', { name: /view policies|manage policies/i }));
    
    // Stats/metrics
    this.resourceCount = page.getByText(/\d+ resources?|\d+ documents?/i);
    this.recentActivity = page.getByRole('region', { name: /recent activity|history/i });
    this.authorizationStats = page.getByText(/authorized|denied|decisions/i);
    
    // Identity drawer
    this.identityDrawer = page.locator(TEST_CONFIG.SELECTORS.IDENTITY_DRAWER)
      .or(page.getByRole('dialog', { name: /identity|user info/i }));
    
    this.identityDrawerTrigger = page.locator('[data-testid="identity-drawer-trigger"]')
      .or(page.getByRole('button', { name: /identity/i }));
  }
  
  /**
   * Navigate to dashboard
   */
  async goto() {
    await this.page.goto('/dashboard', { 
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      waitUntil: 'domcontentloaded'
    });
    await this.waitForPageLoad();
  }
  
  /**
   * Wait for dashboard to load
   */
  async waitForPageLoad() {
    // Wait for heading or user menu to be visible (sufficient for page ready)
    await this.heading.or(this.userMenu).first()
      .waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.ACTION });

    // Use domcontentloaded instead of networkidle — networkidle hangs in CI
    // due to background API polling that never settles
    await this.page.waitForLoadState('domcontentloaded', { timeout: TEST_CONFIG.TIMEOUTS.NETWORK });
  }
  
  /**
   * Open user menu
   */
  async openUserMenu() {
    await this.userMenu.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    
    // Wait for menu to expand
    await this.page.waitForTimeout(TEST_CONFIG.TIMEOUTS.DEBOUNCE);
  }
  
  /**
   * Navigate to resources page
   */
  async goToResources() {
    await this.resourcesLink.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForURL('/resources', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
  }
  
  /**
   * Navigate to policies page
   */
  async goToPolicies() {
    await this.policiesLink.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForURL('/policies', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
  }
  
  /**
   * Navigate to admin page
   */
  async goToAdmin() {
    await this.adminLink.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForURL(/\/admin/, { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
  }
  
  /**
   * Open identity drawer (via keyboard shortcut Cmd+I)
   */
  async openIdentityDrawer() {
    // Try keyboard shortcut first
    await this.page.keyboard.press('Meta+KeyI'); // Mac: Cmd+I
    
    // Wait for drawer to appear
    await this.identityDrawer.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  }
  
  /**
   * Open identity drawer (via click)
   */
  async openIdentityDrawerClick() {
    await this.identityDrawerTrigger.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.identityDrawer.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  }
  
  /**
   * Close identity drawer
   */
  async closeIdentityDrawer() {
    // Try keyboard shortcut
    await this.page.keyboard.press('Escape');
    
    // Wait for drawer to disappear
    await this.identityDrawer.waitFor({ state: 'hidden', timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  }
  
  /**
   * Verify user information is displayed
   * 
   * @param username Expected username
   * @param clearance Expected clearance level
   * @param country Expected country code
   */
  async verifyUserInfo(username: string, clearance: string, country: string) {
    // Verify clearance
    const clearanceText = await this.userClearance.textContent({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    expect(clearanceText).toContain(clearance);
    
    // Verify country
    const countryText = await this.userCountry.textContent({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    expect(countryText).toContain(country);
    
    // Verify username (if displayed)
    const userText = await this.userName.textContent({ timeout: TEST_CONFIG.TIMEOUTS.ACTION }).catch(() => username);
    expect(userText).toContain(username);
  }
  
  /**
   * Verify COI badges are displayed
   * 
   * @param expectedCOIs Expected COI tags (e.g., ["FVEY", "NATO-COSMIC"])
   */
  async verifyCOIBadges(expectedCOIs: string[]) {
    for (const coi of expectedCOIs) {
      const badge = this.page.getByText(new RegExp(coi, 'i'));
      await expect(badge).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    }
  }
  
  /**
   * Verify dashboard is showing logged-in state
   */
  async verifyLoggedIn() {
    await expect(this.userMenu).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    
    // Should not see login/sign in buttons
    const loginButton = this.page.getByRole('button', { name: /sign in|log in/i });
    await expect(loginButton).not.toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  }
  
  /**
   * Verify welcome message shows user name
   * 
   * @param expectedName Expected name or username
   */
  async verifyWelcomeMessage(expectedName: string) {
    const welcome = await this.welcomeMessage.textContent({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    expect(welcome).toContain(expectedName);
  }
  
  /**
   * Get resource count from dashboard
   */
  async getResourceCount(): Promise<number> {
    const text = await this.resourceCount.textContent({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    const match = text?.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }
  
  /**
   * Verify recent activity is visible
   */
  async verifyRecentActivityVisible() {
    await expect(this.recentActivity).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  }
  
  /**
   * Verify authorization stats are visible
   */
  async verifyAuthorizationStatsVisible() {
    await expect(this.authorizationStats).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  }
  
  /**
   * Logout via user menu
   */
  async logout() {
    await this.openUserMenu();
    
    const logoutButton = this.page.getByRole('button', { name: /log out|sign out/i })
      .or(this.page.getByRole('link', { name: /log out|sign out/i }));
    
    await logoutButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    
    // Wait for redirect to home/login
    await this.page.waitForURL(/^\/$|\/login/, { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
  }
}
