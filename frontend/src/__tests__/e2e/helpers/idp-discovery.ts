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
export async function discoverAvailableIdPs(page: Page, hubUrl?: string): Promise<DiscoveredIdPs> {
  // Use environment-provided base URL or default to test config
  // Note: localhost fallback is acceptable in test helpers (matches playwright.config.ts pattern)
  const baseUrl = hubUrl || process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || (process.env.CI ? 'https://dev-app.dive25.com' : 'https://localhost:3000');
  try {
    console.log('[IdP Discovery] Starting discovery from hub:', baseUrl);
    
    // Navigate to hub home page
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    
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
