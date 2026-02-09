/**
 * Example: Dynamic IdP Testing
 * 
 * This demonstrates the RIGHT way to write E2E tests for DIVE V3:
 * - Discovers IdPs dynamically before running tests
 * - Only tests against available instances
 * - Handles variable displayNames
 * - Adapts to partial deployments
 * 
 * Compare to WRONG way (hardcoded):
 * ❌ test('USA login', () => click('United States'))  // Breaks if displayName != "United States"
 * ❌ test('DEU login', () => click('Germany'))         // Breaks if DEU not deployed
 * 
 * RIGHT way (dynamic):
 * ✅ const idps = await discoverIdPs()
 * ✅ test.skip(!idps.has('USA'), 'USA not deployed')
 * ✅ await click(idps.get('USA').displayName)  // Uses actual name
 */

import { test, expect } from '@playwright/test';
import { discoverAvailableIdPs, isIdPAvailable, getIdPDisplayName, type DiscoveredIdPs } from './helpers/idp-discovery';

test.describe('Dynamic IdP Authentication', () => {
  let availableIdPs: DiscoveredIdPs;
  
  // Discover IdPs ONCE before all tests
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    availableIdPs = await discoverAvailableIdPs(page);
    await page.close();
    
    console.log(`[Discovery] Found ${availableIdPs.count + 1} IdPs (Hub + ${availableIdPs.count} spokes)`);
  });
  
  test('Hub (USA) should always be available', async ({ page }) => {
    expect(availableIdPs.hub).toBeDefined();
    expect(await isIdPAvailable(availableIdPs, 'USA')).toBe(true);
  });
  
  test('Can login to Hub with dynamic displayName', async ({ page }) => {
    const hubDisplayName = getIdPDisplayName(availableIdPs, 'USA');
    expect(hubDisplayName).toBeDefined();
    
    await page.goto('/');
    
    // Use discovered displayName, not hardcoded "United States"
    const idpButton = page.getByRole('button', { name: new RegExp(hubDisplayName!, 'i') });
    await expect(idpButton).toBeVisible({ timeout: 10000 });
    
    await idpButton.click();
    await expect(page).toHaveURL(/keycloak/, { timeout: 30000 });
  });
  
  // Dynamic test: Only runs if DEU is deployed
  test('DEU authentication (if deployed)', async ({ page }) => {
    test.skip(!await isIdPAvailable(availableIdPs, 'DEU'), 'DEU spoke not deployed');
    
    const deuDisplayName = getIdPDisplayName(availableIdPs, 'DEU');
    console.log(`[Test] Testing DEU with displayName: "${deuDisplayName}"`);
    
    await page.goto('/');
    
    // Works regardless of whether displayName is "Germany", "DEU Instance", or "Deutschland"
    const idpButton = page.getByRole('button', { name: new RegExp(deuDisplayName!, 'i') });
    await expect(idpButton).toBeVisible({ timeout: 10000 });
    
    await idpButton.click();
    await expect(page).toHaveURL(/keycloak/, { timeout: 30000 });
  });
  
  // Dynamic test: Only runs if FRA is deployed
  test('FRA authentication (if deployed)', async ({ page }) => {
    test.skip(!await isIdPAvailable(availableIdPs, 'FRA'), 'FRA spoke not deployed');
    
    const fraDisplayName = getIdPDisplayName(availableIdPs, 'FRA');
    console.log(`[Test] Testing FRA with displayName: "${fraDisplayName}"`);
    
    await page.goto('/');
    
    const idpButton = page.getByRole('button', { name: new RegExp(fraDisplayName!, 'i') });
    await expect(idpButton).toBeVisible({ timeout: 10000 });
    
    await idpButton.click();
    await expect(page).toHaveURL(/keycloak/, { timeout: 30000 });
  });
  
  // Dynamic iteration: Test ALL available spokes
  test('Should discover and list all available spokes', async () => {
    console.log('\n📋 Available IdPs:');
    console.log(`  Hub (USA): ${availableIdPs.hub?.displayName}`);
    
    for (const [code, idp] of availableIdPs.spokes.entries()) {
      console.log(`  ${code}: ${idp.displayName}`);
    }
    
    // At minimum, hub should be available
    expect(availableIdPs.hub).toBeDefined();
  });
});

/**
 * Example: Environment-aware test configuration
 */
test.describe('Environment-Aware Testing', () => {
  test('Can override discovery with environment variable', async () => {
    // Users can set DEPLOYED_INSTANCES="USA,DEU,FRA" to force specific tests
    const envInstances = process.env.DEPLOYED_INSTANCES;
    
    if (envInstances) {
      console.log(`[Env Override] Testing specific instances: ${envInstances}`);
      const instances = envInstances.split(',').map(s => s.trim());
      expect(instances.length).toBeGreaterThan(0);
    } else {
      console.log('[Env Override] No override - will use dynamic discovery');
    }
  });
});
