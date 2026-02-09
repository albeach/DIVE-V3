/**
 * Diagnostic Test: PKCE Cookie Lifecycle Tracing
 * 
 * Purpose: Debug why NextAuth PKCE cookie is missing during OAuth callback
 * Traces cookies at each step of the authentication flow
 * 
 * Run: npx playwright test diagnostic-pkce-trace.spec.ts --headed
 */

import { test } from '@playwright/test';

test.describe('PKCE Cookie Lifecycle Diagnostic', () => {
  test('Trace PKCE cookie through OAuth flow', async ({ page, context }) => {
    console.log('\n=== PKCE Cookie Lifecycle Trace ===\n');
    
    // Step 1: Navigate to home page
    console.log('Step 1: Navigating to home page...');
    await page.goto('https://127.0.0.1:3000', { waitUntil: 'domcontentloaded' });
    
    const cookies1 = await context.cookies();
    console.log(`  Total cookies: ${cookies1.length}`);
    console.log(`  NextAuth cookies: ${cookies1.filter(c => c.name.includes('authjs')).map(c => c.name).join(', ') || 'NONE'}`);
    console.log(`  PKCE cookie present: ${cookies1.some(c => c.name.includes('pkce')) ? 'YES' : 'NO'}`);
    
    // Wait for page to fully load
    await page.waitForTimeout(2000);
    
    // Step 2: Click USA IdP button
    console.log('\nStep 2: Clicking USA IdP button...');
    await page.waitForSelector('button', { timeout: 10000 });
    
    const idpButton = page.getByRole('button', { name: /united states/i })
      .or(page.getByRole('button', { name: /login as/i }))
      .first();
    
    await idpButton.click({ timeout: 5000 });
    
    // Wait a moment for cookies to be set
    await page.waitForTimeout(1000);
    
    const cookies2 = await context.cookies();
    console.log(`  Total cookies: ${cookies2.length}`);
    const pkce2 = cookies2.filter(c => c.name.includes('pkce'));
    console.log(`  PKCE cookie present: ${pkce2.length > 0 ? 'YES' : 'NO'}`);
    if (pkce2.length > 0) {
      console.log(`  PKCE cookie details:`);
      pkce2.forEach(c => {
        console.log(`    - Name: ${c.name}`);
        console.log(`      Value: ${c.value.substring(0, 20)}...`);
        console.log(`      Domain: ${c.domain}`);
        console.log(`      Path: ${c.path}`);
        console.log(`      Secure: ${c.secure}`);
        console.log(`      HttpOnly: ${c.httpOnly}`);
        console.log(`      SameSite: ${c.sameSite}`);
        console.log(`      Expires: ${c.expires}`);
      });
    }
    
    // Step 3: Wait for Keycloak redirect
    console.log('\nStep 3: Waiting for Keycloak redirect...');
    try {
      await page.waitForURL(/.*keycloak.*|.*\/realms\/.*/, { timeout: 10000 });
      console.log(`  Current URL: ${page.url()}`);
      
      const cookies3 = await context.cookies();
      console.log(`  Total cookies: ${cookies3.length}`);
      const pkce3 = cookies3.filter(c => c.name.includes('pkce'));
      console.log(`  PKCE cookie present: ${pkce3.length > 0 ? 'YES' : 'NO'}`);
      console.log(`  All cookies: ${cookies3.map(c => c.name).join(', ')}`);
      
      // Check cookies for both localhost and 127.0.0.1
      const localhostCookies = await context.cookies('https://localhost:3000');
      const ipCookies = await context.cookies('https://127.0.0.1:3000');
      console.log(`  Cookies for localhost:3000: ${localhostCookies.filter(c => c.name.includes('pkce')).length}`);
      console.log(`  Cookies for 127.0.0.1:3000: ${ipCookies.filter(c => c.name.includes('pkce')).length}`);
      
    } catch (e) {
      console.log(`  ❌ Failed to redirect to Keycloak: ${e instanceof Error ? e.message : 'unknown'}`);
      return;
    }
    
    // Step 4: Fill Keycloak login form
    console.log('\nStep 4: Filling Keycloak login form...');
    
    try {
      await page.getByLabel(/username/i).fill('testuser-usa-1', { timeout: 5000 });
      await page.locator('input[type="password"]').first().fill('TestUser2025!Pilot', { timeout: 5000 });
      
      console.log('  Credentials filled');
      
      // Check cookies before submitting
      const cookies4 = await context.cookies();
      const pkce4 = cookies4.filter(c => c.name.includes('pkce'));
      console.log(`  PKCE cookie before submit: ${pkce4.length > 0 ? 'YES' : 'NO'}`);
      
      // Submit form
      await page.getByRole('button', { name: /sign in/i }).click({ timeout: 5000 });
      console.log('  Login form submitted');
      
      // Wait for processing
      await page.waitForTimeout(2000);
      
    } catch (e) {
      console.log(`  ❌ Failed to fill/submit login form: ${e instanceof Error ? e.message : 'unknown'}`);
      console.log(`  Current URL: ${page.url()}`);
      // Take screenshot
      await page.screenshot({ path: 'diagnostic-pkce-keycloak-error.png', fullPage: true });
      return;
    }
    
    // Step 5: Check cookies after Keycloak submit
    console.log('\nStep 5: After Keycloak submit...');
    const cookies5 = await context.cookies();
    const pkce5 = cookies5.filter(c => c.name.includes('pkce'));
    console.log(`  Total cookies: ${cookies5.length}`);
    console.log(`  PKCE cookie present: ${pkce5.length > 0 ? 'YES' : 'NO'}`);
    console.log(`  Current URL: ${page.url()}`);
    
    // Step 6: Wait for callback (or error page)
    console.log('\nStep 6: Waiting for OAuth callback...');
    
    try {
      // Wait for redirect (either to app or error page)
      await page.waitForTimeout(5000);
      
      const currentUrl = page.url();
      console.log(`  Final URL: ${currentUrl}`);
      
      const cookies6 = await context.cookies();
      const pkce6 = cookies6.filter(c => c.name.includes('pkce'));
      console.log(`  Total cookies: ${cookies6.length}`);
      console.log(`  PKCE cookie at callback: ${pkce6.length > 0 ? 'YES' : 'NO'}`);
      
      // Check for error
      if (currentUrl.includes('/error')) {
        console.log(`  ❌ Landed on error page: ${currentUrl}`);
        const errorText = await page.textContent('body');
        console.log(`  Error text: ${errorText?.substring(0, 200)}`);
      } else if (currentUrl.includes('dashboard') || currentUrl === 'https://127.0.0.1:3000/') {
        console.log(`  ✅ Successful callback to app`);
      } else {
        console.log(`  ⚠️ Unexpected URL: ${currentUrl}`);
      }
      
      // Take final screenshot
      await page.screenshot({ path: 'diagnostic-pkce-final-state.png', fullPage: true });
      
    } catch (e) {
      console.log(`  ❌ Failed during callback: ${e instanceof Error ? e.message : 'unknown'}`);
    }
    
    console.log('\n=== End of PKCE Cookie Trace ===\n');
  });
});
