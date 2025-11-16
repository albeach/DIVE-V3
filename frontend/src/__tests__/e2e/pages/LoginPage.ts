/**
 * Login Page Object Model
 * 
 * Encapsulates interactions with the login and IdP selection pages
 * 
 * Usage:
 * ```typescript
 * const loginPage = new LoginPage(page);
 * await loginPage.goto();
 * await loginPage.selectIdP('United States DoD');
 * ```
 */

import { Page, Locator, expect } from '@playwright/test';
import { TEST_CONFIG } from '../fixtures/test-config';

export class LoginPage {
  readonly page: Page;
  
  // Main page elements
  readonly heading: Locator;
  readonly description: Locator;
  
  // IdP selector buttons
  readonly usaIdPButton: Locator;
  readonly franceIdPButton: Locator;
  readonly canadaIdPButton: Locator;
  readonly germanyIdPButton: Locator;
  readonly ukIdPButton: Locator;
  readonly italyIdPButton: Locator;
  readonly spainIdPButton: Locator;
  readonly polandIdPButton: Locator;
  readonly netherlandsIdPButton: Locator;
  readonly industryIdPButton: Locator;
  
  constructor(page: Page) {
    this.page = page;
    
    // Main elements
    this.heading = page.getByRole('heading', { name: /select.*identity provider|choose.*provider/i });
    this.description = page.getByText(/login.*identity provider|select.*organization/i);
    
    // IdP buttons (using flexible selectors)
    this.usaIdPButton = page.getByRole('button', { name: /united states|usa|dod/i })
      .or(page.getByRole('link', { name: /united states|usa|dod/i }));
    
    this.franceIdPButton = page.getByRole('button', { name: /france|french/i })
      .or(page.getByRole('link', { name: /france|french/i }));
    
    this.canadaIdPButton = page.getByRole('button', { name: /canada|canadian/i })
      .or(page.getByRole('link', { name: /canada|canadian/i }));
    
    this.germanyIdPButton = page.getByRole('button', { name: /germany|german|bundeswehr/i })
      .or(page.getByRole('link', { name: /germany|german|bundeswehr/i }));
    
    this.ukIdPButton = page.getByRole('button', { name: /united kingdom|uk|britain/i })
      .or(page.getByRole('link', { name: /united kingdom|uk|britain/i }));
    
    this.italyIdPButton = page.getByRole('button', { name: /italy|italian/i })
      .or(page.getByRole('link', { name: /italy|italian/i }));
    
    this.spainIdPButton = page.getByRole('button', { name: /spain|spanish/i })
      .or(page.getByRole('link', { name: /spain|spanish/i }));
    
    this.polandIdPButton = page.getByRole('button', { name: /poland|polish/i })
      .or(page.getByRole('link', { name: /poland|polish/i }));
    
    this.netherlandsIdPButton = page.getByRole('button', { name: /netherlands|dutch/i })
      .or(page.getByRole('link', { name: /netherlands|dutch/i }));
    
    this.industryIdPButton = page.getByRole('button', { name: /industry|partner|contractor/i })
      .or(page.getByRole('link', { name: /industry|partner|contractor/i }));
  }
  
  /**
   * Navigate to login page
   */
  async goto() {
    await this.page.goto('/login', { 
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      waitUntil: 'domcontentloaded'
    });
    await this.waitForPageLoad();
  }
  
  /**
   * Navigate to home page (which may show IdP selector)
   */
  async gotoHome() {
    await this.page.goto('/', { 
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      waitUntil: 'domcontentloaded'
    });
    await this.waitForPageLoad();
  }
  
  /**
   * Wait for login page to load
   */
  async waitForPageLoad() {
    // Wait for any IdP button to be visible
    await this.usaIdPButton.or(this.franceIdPButton).or(this.industryIdPButton).first()
      .waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  }
  
  /**
   * Select an IdP by name
   * 
   * @param idpName IdP name or country (e.g., "United States", "France", "Industry")
   */
  async selectIdP(idpName: string) {
    const button = this.page.getByRole('button', { name: new RegExp(idpName, 'i') })
      .or(this.page.getByRole('link', { name: new RegExp(idpName, 'i') }));
    
    await button.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await button.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    
    // Wait for redirect to Keycloak or next auth step
    await this.page.waitForURL(/.*keycloak.*|.*\/login\/.*/, {
      timeout: TEST_CONFIG.TIMEOUTS.AUTH_FLOW,
    });
  }
  
  /**
   * Select USA IdP
   */
  async selectUSA() {
    await this.usaIdPButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForURL(/.*keycloak.*|.*\/login\/.*/, {
      timeout: TEST_CONFIG.TIMEOUTS.AUTH_FLOW,
    });
  }
  
  /**
   * Select France IdP
   */
  async selectFrance() {
    await this.franceIdPButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForURL(/.*keycloak.*|.*\/login\/.*/, {
      timeout: TEST_CONFIG.TIMEOUTS.AUTH_FLOW,
    });
  }
  
  /**
   * Select Canada IdP
   */
  async selectCanada() {
    await this.canadaIdPButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForURL(/.*keycloak.*|.*\/login\/.*/, {
      timeout: TEST_CONFIG.TIMEOUTS.AUTH_FLOW,
    });
  }
  
  /**
   * Select Germany IdP
   */
  async selectGermany() {
    await this.germanyIdPButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForURL(/.*keycloak.*|.*\/login\/.*/, {
      timeout: TEST_CONFIG.TIMEOUTS.AUTH_FLOW,
    });
  }
  
  /**
   * Select Industry IdP
   */
  async selectIndustry() {
    await this.industryIdPButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForURL(/.*keycloak.*|.*\/login\/.*/, {
      timeout: TEST_CONFIG.TIMEOUTS.AUTH_FLOW,
    });
  }
  
  /**
   * Get list of all visible IdP buttons
   */
  async getAvailableIdPs(): Promise<string[]> {
    const buttons = await this.page.getByRole('button', { name: /.*/ })
      .or(this.page.getByRole('link', { name: /.*/ }))
      .all();
    
    const idpNames: string[] = [];
    for (const button of buttons) {
      const text = await button.textContent();
      if (text) {
        idpNames.push(text.trim());
      }
    }
    
    return idpNames;
  }
  
  /**
   * Verify page is showing IdP selector
   */
  async verifyIdPSelectorVisible() {
    await expect(this.usaIdPButton.or(this.franceIdPButton).first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }
  
  /**
   * Verify specific IdP is available
   * 
   * @param idpName IdP name to check
   */
  async verifyIdPAvailable(idpName: string) {
    const button = this.page.getByRole('button', { name: new RegExp(idpName, 'i') })
      .or(this.page.getByRole('link', { name: new RegExp(idpName, 'i') }));
    
    await expect(button).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  }
}

