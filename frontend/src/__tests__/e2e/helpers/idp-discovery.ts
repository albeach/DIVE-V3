/**
 * Dynamic IdP Discovery Helper
 * 
 * Purpose: Dynamically discover available IdPs instead of hardcoding assumptions.
 * This allows tests to adapt to:
 * - Variable spoke deployments
 * - Different displayName values
 * - Partial NATO deployments
 * - Development vs production environments
 * 
 * Usage:
 * ```typescript
 * const idps = await discoverAvailableIdPs();
 * if (idps.USA) {
 *   test('USA authentication', async ({ page }) => {
 *     await loginAs(page, idps.USA.testUser);
 *   });
 * }
 * ```
 */

import type { Page } from '@playwright/test';

export interface IdPInfo {
  code: string;              // ISO 3166-1 alpha-3 (USA, FRA, DEU)
  displayName: string;        // As shown in UI ("United States", "DEU Instance", etc.)
  url: string;                // Instance URL
  available: boolean;         // Is the instance reachable?
  testUsers?: {
    UNCLASSIFIED?: string;
    CONFIDENTIAL?: string;
    SECRET?: string;
    TOP_SECRET?: string;
  };
}

export interface DiscoveredIdPs {
  hub?: IdPInfo;
  spokes: Map<string, IdPInfo>;
  count: number;
}

/**
 * Discover available IdPs by querying the hub's federation API
 */
/**
 * Check if a URL is accessible
 * 
 * @param page Playwright page object
 * @param url URL to check
 * @returns True if accessible, false otherwise
 */
async function isUrlAccessible(page: Page, url: string): Promise<boolean> {
  try {
    console.log(`[IdP Discovery] Checking URL accessibility: ${url}`);
    const response = await page.goto(url, { 
      waitUntil: 'domcontentloaded', 
      timeout: 5000  // Short timeout for quick check
    });
    
    if (!response) {
      console.log(`[IdP Discovery] ❌ No response from ${url}`);
      return false;
    }
    
    const status = response.status();
    const accessible = status >= 200 && status < 400;
    
    if (accessible) {
      console.log(`[IdP Discovery] ✅ URL accessible: ${url} (status: ${status})`);
    } else {
      console.log(`[IdP Discovery] ❌ URL not accessible: ${url} (status: ${status})`);
    }
    
    return accessible;
  } catch (error) {
    console.log(`[IdP Discovery] ❌ URL unreachable: ${url} (${error instanceof Error ? error.message : 'unknown error'})`);
    return false;
  }
}

/**
 * Get environment-appropriate base URL
 * 
 * Checks multiple URLs in order of preference:
 * 1. Explicitly provided hubUrl parameter
 * 2. PLAYWRIGHT_BASE_URL environment variable
 * 3. BASE_URL environment variable
 * 4. CI environment: dev-app.dive25.com
 * 5. Local environment: https://localhost:3000
 * 
 * @param page Playwright page object
 * @param hubUrl Optional explicit URL
 * @returns First accessible URL, or null if none available
 */
async function getAccessibleBaseUrl(page: Page, hubUrl?: string): Promise<string | null> {
  // Priority order of URLs to try
  // Note: localhost/127.0.0.1 fallbacks are acceptable in E2E test helpers (same as playwright.config.ts)
  const urlsToTry = [
    hubUrl,
    process.env.PLAYWRIGHT_BASE_URL,
    process.env.BASE_URL,
    // Try both 127.0.0.1 and localhost (localhost may resolve to IPv6 ::1)
    // Docker binds to 127.0.0.1 by default, so try it first
    'https://127.0.0.1:3000',  // Docker default bind
    'https://localhost:3000',  // May resolve to ::1 (IPv6)
    process.env.CI ? 'https://dev-app.dive25.com' : null,
  ].filter((url): url is string => Boolean(url));
  
  console.log(`[IdP Discovery] Checking ${urlsToTry.length} potential URLs...`);
  
  for (const url of urlsToTry) {
    if (await isUrlAccessible(page, url)) {
      return url;
    }
  }
  
  console.error('[IdP Discovery] ❌ No accessible URLs found');
  return null;
}

/**
 * Discover available IdPs by querying the hub's federation API
 * 
 * Automatically checks URL accessibility and fails gracefully if environment is offline
 */
export async function discoverAvailableIdPs(page: Page, hubUrl?: string): Promise<DiscoveredIdPs> {
  try {
    console.log('[IdP Discovery] Starting discovery...');
    
    // Use explicit hubUrl if provided, otherwise let page.goto use baseURL from config
    // Note: localhost/127.0.0.1 fallback is acceptable in E2E test helpers (matches playwright.config.ts)
    const baseUrl = hubUrl || page.context().baseURL || 'https://127.0.0.1:3000';
    console.log(`[IdP Discovery] Target URL: ${baseUrl}`);
    
    // Navigate to home page to discover IdPs
    // Use '/' so it respects Playwright's baseURL configuration
    const navigationTarget = hubUrl ? hubUrl : '/';
    
    try {
      await page.goto(navigationTarget, { 
        waitUntil: 'domcontentloaded', 
        timeout: 10000 
      });
      console.log(`[IdP Discovery] ✅ Successfully loaded: ${navigationTarget}`);
    } catch (navError) {
      console.error(`[IdP Discovery] ❌ Failed to load ${navigationTarget}:`, navError instanceof Error ? navError.message : 'unknown error');
      // Return empty discovery if page won't load
      return {
        spokes: new Map(),
        count: 0
      };
    }
    
    // Extract IdP options from the login page
    const idpButtons = await page.locator('button[type="button"], a[href*="authorize"]').allTextContents();
    const uniqueIdPs = [...new Set(idpButtons.filter(text => text.trim().length > 0))];
    
    console.log('[IdP Discovery] Found IdP options:', uniqueIdPs);
    
    const result: DiscoveredIdPs = {
      spokes: new Map(),
      count: 0
    };
    
    // Hub is always available (we're testing from it)
    result.hub = {
      code: 'USA',
      displayName: uniqueIdPs.find(name => /united states|usa|hub/i.test(name)) || 'United States',
      url: baseUrl,
      available: true
    };
    
    // Map discovered IdPs to country codes
    for (const displayName of uniqueIdPs) {
      const code = mapDisplayNameToCode(displayName);
      if (code && code !== 'USA') { // USA is hub
        result.spokes.set(code, {
          code,
          displayName,
          url: baseUrl, // All IdPs are accessed via hub
          available: true
        });
        result.count++;
      }
    }
    
    console.log(`[IdP Discovery] ✅ Discovered ${result.count} spokes:`, Array.from(result.spokes.keys()));
    return result;
    
  } catch (error) {
    console.error('[IdP Discovery] ❌ Discovery failed:', error);
    return {
      spokes: new Map(),
      count: 0
    };
  }
}

/**
 * Map IdP displayName to ISO 3166-1 alpha-3 code
 * Handles variability: "Germany", "DEU Instance", "Deutschland" → "DEU"
 */
function mapDisplayNameToCode(displayName: string): string | null {
  const normalized = displayName.toLowerCase().trim();
  
  // Direct code match (e.g., "DEU", "FRA", "GBR")
  if (/^[a-z]{3}$/i.test(normalized)) {
    return normalized.toUpperCase();
  }
  
  // Country name mappings (NATO + partners)
  const countryMap: Record<string, string> = {
    // NATO founding members
    'united states': 'USA',
    'usa': 'USA',
    'us': 'USA',
    'united kingdom': 'GBR',
    'uk': 'GBR',
    'great britain': 'GBR',
    'britain': 'GBR',
    'france': 'FRA',
    'canada': 'CAN',
    'italy': 'ITA',
    'netherlands': 'NLD',
    'belgium': 'BEL',
    'luxembourg': 'LUX',
    'norway': 'NOR',
    'denmark': 'DNK',
    'iceland': 'ISL',
    'portugal': 'PRT',
    
    // Cold War additions
    'greece': 'GRC',
    'turkey': 'TUR',
    'germany': 'DEU',
    'deutschland': 'DEU',
    'spain': 'ESP',
    
    // Post-Cold War additions
    'czech republic': 'CZE',
    'czechia': 'CZE',
    'hungary': 'HUN',
    'poland': 'POL',
    
    // 2004 expansion
    'bulgaria': 'BGR',
    'estonia': 'EST',
    'latvia': 'LVA',
    'lithuania': 'LTU',
    'romania': 'ROU',
    'slovakia': 'SVK',
    'slovenia': 'SVN',
    
    // Recent additions
    'albania': 'ALB',
    'croatia': 'HRV',
    'montenegro': 'MNE',
    'north macedonia': 'MKD',
    'macedonia': 'MKD',
    'finland': 'FIN',
    'sweden': 'SWE',
    
    // Partners
    'australia': 'AUS',
    'new zealand': 'NZL',
    'japan': 'JPN',
    'south korea': 'KOR',
    'korea': 'KOR',
    
    // Industry
    'booz allen': 'BAH',
    'contractor': 'BAH'
  };
  
  // Check for direct match
  if (countryMap[normalized]) {
    return countryMap[normalized];
  }
  
  // Check for partial match (e.g., "DEU Instance" → "DEU")
  for (const [name, code] of Object.entries(countryMap)) {
    if (normalized.includes(name) || normalized.includes(code.toLowerCase())) {
      return code;
    }
  }
  
  // Extract 3-letter code if present (e.g., "DEU Instance" → "DEU")
  const codeMatch = normalized.match(/\b([a-z]{3})\b/);
  if (codeMatch) {
    return codeMatch[1].toUpperCase();
  }
  
  console.warn(`[IdP Discovery] ⚠️ Could not map displayName to code: "${displayName}"`);
  return null;
}

/**
 * Check if a specific country/spoke is available
 */
export async function isIdPAvailable(idps: DiscoveredIdPs, countryCode: string): Promise<boolean> {
  if (countryCode === 'USA') {
    return !!idps.hub?.available;
  }
  return idps.spokes.has(countryCode);
}

/**
 * Get IdP displayName for a country code
 */
export function getIdPDisplayName(idps: DiscoveredIdPs, countryCode: string): string | null {
  if (countryCode === 'USA') {
    return idps.hub?.displayName || null;
  }
  return idps.spokes.get(countryCode)?.displayName || null;
}

/**
 * Create a test filter function based on discovered IdPs
 * Usage: test.describe.configure({ mode: shouldRunTest(idps, 'DEU') ? 'default' : 'skip' })
 */
export function shouldRunIdPTest(idps: DiscoveredIdPs, requiredIdPs: string[]): boolean {
  for (const code of requiredIdPs) {
    if (!isIdPAvailable(idps, code)) {
      console.log(`[IdP Discovery] ⏭️ Skipping test - required IdP not available: ${code}`);
      return false;
    }
  }
  return true;
}

/**
 * Get environment variable for known deployed instances
 * Fallback when API discovery isn't available
 */
export function getDeployedInstancesFromEnv(): string[] {
  const deployed = process.env.DEPLOYED_INSTANCES || process.env.TEST_INSTANCES || 'USA';
  return deployed.split(',').map(s => s.trim().toUpperCase());
}
