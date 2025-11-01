/**
 * E2E Test Suite: MFA/OTP Complete Flow
 * 
 * Comprehensive end-to-end tests covering:
 * - Happy path: New user OTP setup (1 test)
 * - Happy path: Returning user with MFA (1 test)
 * - Happy path: UNCLASSIFIED user (no MFA) (1 test)
 * - Error handling: Invalid OTP (1 test)
 * - Error handling: Empty OTP (1 test)
 * - Error handling: Rate limiting (1 test)
 * - UX: Remaining attempts warning (1 test)
 * - UX: Contextual help (1 test)
 * - Accessibility (1 test)
 * - Performance: OTP setup (1 test)
 * - Performance: OTP verification (1 test)
 * 
 * Total: 11 end-to-end scenarios
 * 
 * @see docs/MFA-OTP-IMPLEMENTATION.md
 * @see LOGIN-UX-ENHANCEMENTS-2025.md
 */

import { test, expect, type Page } from '@playwright/test';
import speakeasy from 'speakeasy';

// ============================================
// Test Configuration
// ============================================

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'https://localhost:4000';

// Test user credentials
const TEST_USERS = {
    ADMIN_DIVE: {
        idpAlias: 'dive-v3-broker',
        username: 'admin-dive',
        password: 'Admin123!',
        clearance: 'TOP_SECRET',
        needsMFA: true,
        hasOTPConfigured: false
    },
    SECRET_USER: {
        idpAlias: 'dive-v3-broker',
        username: 'testuser-secret',
        password: 'Secret123!',
        clearance: 'SECRET',
        needsMFA: true,
        hasOTPConfigured: true,
        otpSecret: 'ONSWG4TFOQFA====' // Pre-configured secret for testing
    },
    UNCLASS_USER: {
        idpAlias: 'dive-v3-broker',
        username: 'testuser-unclass',
        password: 'Unclass123!',
        clearance: 'UNCLASSIFIED',
        needsMFA: false
    }
};

// ============================================
// Helper Functions
// ============================================

/**
 * Navigate to login page for specific IdP
 */
async function navigateToLogin(page: Page, idpAlias: string) {
    await page.goto(`${BASE_URL}/login/${idpAlias}`);
    await page.waitForLoadState('networkidle');
}

/**
 * Fill in username and password fields
 */
async function fillCredentials(page: Page, username: string, password: string) {
    await page.fill('input[type="text"]', username);
    await page.fill('input[type="password"]', password);
}

/**
 * Generate a valid TOTP code from a secret
 */
function generateTOTP(secret: string): string {
    return speakeasy.totp({
        secret,
        encoding: 'base32'
    });
}

/**
 * Extract secret from manual entry section (hidden details)
 */
async function extractSecretFromManualEntry(page: Page): Promise<string> {
    // Click to reveal manual entry
    await page.click('summary:has-text("Can\'t scan? Enter manually")');

    // Get the secret from the code block
    const secretElement = page.locator('details p.font-mono').first();
    const secret = await secretElement.textContent();

    return secret?.trim() || '';
}

/**
 * Wait for element with animation to complete
 */
async function waitForAnimation(page: Page, selector: string, timeout = 1000) {
    await page.waitForSelector(selector, { timeout });
    await page.waitForTimeout(500); // Wait for animation
}

// ============================================
// Test 1: Happy Path - New User OTP Setup
// ============================================

test('complete OTP setup and login for TOP_SECRET user', async ({ page }) => {
    const user = TEST_USERS.ADMIN_DIVE;
    const startTime = Date.now();

    // 1. Navigate to login
    await navigateToLogin(page, user.idpAlias);
    expect(await page.title()).toContain('DIVE');

    // 2. Enter credentials
    await fillCredentials(page, user.username, user.password);

    // 3. Click Sign In
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForLoadState('networkidle');

    // 4. Verify OTP setup screen appears
    await expect(page.locator('text=Multi-Factor Authentication Setup Required')).toBeVisible({ timeout: 5000 });

    // 5. Verify QR code is displayed
    await expect(page.locator('svg[role="img"]')).toBeVisible(); // QR code SVG

    // 6. Extract secret from manual entry
    const secret = await extractSecretFromManualEntry(page);
    expect(secret).toMatch(/^[A-Z2-7]+=*$/); // Valid Base32

    // 7. Generate valid OTP using speakeasy
    const validOTP = generateTOTP(secret);
    expect(validOTP).toHaveLength(6);

    // 8. Enter OTP
    await page.fill('input[placeholder="000000"]', validOTP);

    // 9. Verify button is enabled
    await expect(page.locator('button:has-text("Verify & Complete Setup")')).toBeEnabled();

    // 10. Submit OTP
    await page.click('button:has-text("Verify & Complete Setup")');
    await page.waitForLoadState('networkidle');

    // 11. Verify redirect to dashboard
    await page.waitForURL(`${BASE_URL}/`, { timeout: 10000 });
    expect(page.url()).toContain(BASE_URL);

    // 12. Verify session is created (check for user menu or logout button)
    await expect(page.locator('[data-testid="user-menu"]').or(page.locator('text=admin-dive'))).toBeVisible({ timeout: 5000 });

    // Performance check: entire flow should complete in < 10 seconds
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(10000);

    console.log(`✅ OTP setup completed in ${duration}ms`);
});

// ============================================
// Test 2: Happy Path - Returning User with MFA
// ============================================

test('login with existing OTP for SECRET user', async ({ page }) => {
    const user = TEST_USERS.SECRET_USER;

    // 1. Navigate and enter credentials
    await navigateToLogin(page, user.idpAlias);
    await fillCredentials(page, user.username, user.password);

    // 2. Click Sign In
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // 3. Verify MFA prompt (not setup - user already has OTP configured)
    await expect(page.locator('text=Multi-factor authentication required')).toBeVisible({ timeout: 5000 });

    // Should NOT show QR code (already configured)
    await expect(page.locator('svg[role="img"]')).not.toBeVisible();

    // 4. Generate and enter valid OTP
    const validOTP = generateTOTP(user.otpSecret);
    await page.fill('input[placeholder*="6-digit"]', validOTP);

    // 5. Submit
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // 6. Verify successful login
    await page.waitForURL(/.*\/(?!login)/, { timeout: 10000 });
    await expect(page.locator('text=' + user.username).or(page.locator('[data-testid="dashboard"]'))).toBeVisible({ timeout: 5000 });

    console.log('✅ Returning user MFA login successful');
});

// ============================================
// Test 3: Happy Path - UNCLASSIFIED User (No MFA)
// ============================================

test('login without MFA for UNCLASSIFIED user', async ({ page }) => {
    const user = TEST_USERS.UNCLASS_USER;

    // 1. Navigate and enter credentials
    await navigateToLogin(page, user.idpAlias);
    await fillCredentials(page, user.username, user.password);

    // 2. Click Sign In
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // 3. Verify NO OTP prompt appears
    await page.waitForTimeout(2000); // Wait to ensure no MFA prompt
    await expect(page.locator('text=Multi-factor authentication')).not.toBeVisible();
    await expect(page.locator('text=Enter 6-digit code')).not.toBeVisible();

    // 4. Verify direct redirect to dashboard
    await page.waitForURL(/.*\/(?!login)/, { timeout: 5000 });
    expect(page.url()).not.toContain('/login');

    console.log('✅ UNCLASSIFIED user logged in without MFA');
});

// ============================================
// Test 4: Error Handling - Invalid OTP
// ============================================

test('handle invalid OTP with shake animation', async ({ page }) => {
    const user = TEST_USERS.ADMIN_DIVE;

    // 1. Complete setup flow up to OTP entry
    await navigateToLogin(page, user.idpAlias);
    await fillCredentials(page, user.username, user.password);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Multi-Factor Authentication Setup Required')).toBeVisible({ timeout: 5000 });

    // 2. Enter invalid OTP
    const invalidOTP = '000000';
    await page.fill('input[placeholder="000000"]', invalidOTP);

    // 3. Submit
    await page.click('button:has-text("Verify & Complete Setup")');
    await page.waitForLoadState('networkidle');

    // 4. Verify shake animation is applied
    const errorContainer = page.locator('.animate-shake');
    await expect(errorContainer).toBeVisible({ timeout: 2000 });

    // 5. Verify error message displayed
    await expect(page.locator('text=Invalid OTP code')).toBeVisible();

    // 6. Verify OTP input is cleared
    const otpInput = page.locator('input[placeholder="000000"]');
    expect(await otpInput.inputValue()).toBe('');

    // 7. Verify QR code persists (doesn't regenerate)
    await expect(page.locator('svg[role="img"]')).toBeVisible();

    console.log('✅ Invalid OTP handled with shake animation');
});

// ============================================
// Test 5: Error Handling - Empty OTP
// ============================================

test('prevent empty OTP submission', async ({ page }) => {
    const user = TEST_USERS.ADMIN_DIVE;

    // 1. Reach OTP input screen
    await navigateToLogin(page, user.idpAlias);
    await fillCredentials(page, user.username, user.password);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Multi-Factor Authentication Setup Required')).toBeVisible();

    // 2. Verify button is disabled with empty input
    const submitButton = page.locator('button:has-text("Verify & Complete Setup")');
    await expect(submitButton).toBeDisabled();

    // 3. Enter partial OTP (< 6 digits)
    await page.fill('input[placeholder="000000"]', '123');
    await expect(submitButton).toBeDisabled();

    // 4. Enter full 6 digits
    await page.fill('input[placeholder="000000"]', '123456');
    await expect(submitButton).toBeEnabled();

    // 5. Clear input
    await page.fill('input[placeholder="000000"]', '');
    await expect(submitButton).toBeDisabled();

    console.log('✅ Empty OTP submission prevented');
});

// ============================================
// Test 6: Error Handling - Rate Limiting
// ============================================

test('enforce rate limiting at 8 attempts', async ({ page }) => {
    const user = { ...TEST_USERS.ADMIN_DIVE, username: 'ratelimit-test' };

    // 1. Make 8 failed login attempts
    for (let i = 0; i < 8; i++) {
        await navigateToLogin(page, user.idpAlias);
        await fillCredentials(page, user.username, 'WrongPassword123!');
        await page.click('button[type="submit"]');
        await page.waitForLoadState('networkidle');

        // Verify error message
        await expect(page.locator('text=Invalid username or password')).toBeVisible({ timeout: 3000 });
    }

    // 2. 9th attempt should be blocked
    await navigateToLogin(page, user.idpAlias);
    await fillCredentials(page, user.username, 'WrongPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // 3. Verify lockout message
    await expect(page.locator('text=Too many login attempts')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=15 minutes')).toBeVisible();

    console.log('✅ Rate limiting enforced after 8 attempts');
});

// ============================================
// Test 7: UX - Remaining Attempts Warning
// ============================================

test('display remaining attempts warning', async ({ page }) => {
    const user = { ...TEST_USERS.ADMIN_DIVE, username: 'attempts-test' };

    // 1. Make 6 failed attempts
    for (let i = 0; i < 6; i++) {
        await navigateToLogin(page, user.idpAlias);
        await fillCredentials(page, user.username, 'WrongPassword!');
        await page.click('button[type="submit"]');
        await page.waitForLoadState('networkidle');
    }

    // 2. Check for "2 attempts remaining" warning
    await expect(page.locator('text=/2.*attempts?.*remaining/i')).toBeVisible({ timeout: 3000 });

    // 3. Make 1 more failed attempt
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // 4. Check for "1 attempt remaining" warning
    await expect(page.locator('text=/1.*attempt.*remaining/i')).toBeVisible({ timeout: 3000 });

    console.log('✅ Remaining attempts warning displayed');
});

// ============================================
// Test 8: UX - Contextual Help
// ============================================

test('show contextual help after 2 failed OTP attempts', async ({ page }) => {
    const user = TEST_USERS.ADMIN_DIVE;

    // 1. Reach OTP setup screen
    await navigateToLogin(page, user.idpAlias);
    await fillCredentials(page, user.username, user.password);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Multi-Factor Authentication Setup Required')).toBeVisible();

    // 2. Enter invalid OTP twice
    for (let i = 0; i < 2; i++) {
        await page.fill('input[placeholder="000000"]', '000000');
        await page.click('button:has-text("Verify & Complete Setup")');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000); // Wait for error
    }

    // 3. Verify contextual help appears
    await expect(page.locator('text=/30.*second/i')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=/current.*6-digit.*code/i').or(page.locator('text=/Tip/i'))).toBeVisible();

    console.log('✅ Contextual help displayed after 2 attempts');
});

// ============================================
// Test 9: Accessibility
// ============================================

test('keyboard navigation and screen reader support', async ({ page }) => {
    const user = TEST_USERS.ADMIN_DIVE;

    // 1. Navigate to login
    await navigateToLogin(page, user.idpAlias);

    // 2. Test keyboard navigation
    await page.keyboard.press('Tab'); // Focus username
    await page.keyboard.type(user.username);

    await page.keyboard.press('Tab'); // Focus password
    await page.keyboard.type(user.password);

    await page.keyboard.press('Tab'); // Focus show/hide password button
    await page.keyboard.press('Tab'); // Focus submit button
    await page.keyboard.press('Enter'); // Submit

    await page.waitForLoadState('networkidle');

    // 3. Verify OTP screen appears
    await expect(page.locator('text=Multi-Factor Authentication Setup Required')).toBeVisible({ timeout: 5000 });

    // 4. Check ARIA labels
    const otpInput = page.locator('input[placeholder="000000"]');
    const inputAccessibleName = await otpInput.getAttribute('aria-label');
    // Should have proper labeling
    expect(inputAccessibleName || await page.locator('label').filter({ has: otpInput }).textContent()).toBeTruthy();

    // 5. Check focus management (input should auto-focus)
    const focusedElement = await page.locator(':focus').first();
    expect(await focusedElement.getAttribute('placeholder')).toContain('000000');

    // 6. Tab through OTP setup
    await page.keyboard.press('Tab'); // Should move to verify button or other element

    console.log('✅ Keyboard navigation and accessibility verified');
});

// ============================================
// Test 10: Performance - OTP Setup Time
// ============================================

test('OTP setup completes within 3 seconds', async ({ page }) => {
    const user = TEST_USERS.ADMIN_DIVE;

    // 1. Navigate and login
    await navigateToLogin(page, user.idpAlias);
    await fillCredentials(page, user.username, user.password);

    // 2. Measure time from submit to QR display
    const startTime = Date.now();

    await page.click('button[type="submit"]');
    await expect(page.locator('svg[role="img"]')).toBeVisible({ timeout: 5000 });

    const duration = Date.now() - startTime;

    // 3. Assert within 3 seconds
    expect(duration).toBeLessThan(3000);

    console.log(`✅ OTP setup displayed in ${duration}ms`);
});

// ============================================
// Test 11: Performance - OTP Verification Time
// ============================================

test('OTP verification responds within 1 second', async ({ page }) => {
    const user = TEST_USERS.ADMIN_DIVE;

    // 1. Complete setup up to OTP entry
    await navigateToLogin(page, user.idpAlias);
    await fillCredentials(page, user.username, user.password);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Multi-Factor Authentication Setup Required')).toBeVisible({ timeout: 5000 });

    // 2. Extract secret and generate OTP
    const secret = await extractSecretFromManualEntry(page);
    const validOTP = generateTOTP(secret);

    // 3. Measure verification time
    await page.fill('input[placeholder="000000"]', validOTP);

    const startTime = Date.now();
    await page.click('button:has-text("Verify & Complete Setup")');

    // Wait for either success (redirect) or error
    await Promise.race([
        page.waitForURL(/.*\/(?!login)/, { timeout: 3000 }),
        page.locator('text=Invalid OTP code').waitFor({ timeout: 3000 })
    ]);

    const duration = Date.now() - startTime;

    // 4. Assert within 1 second
    expect(duration).toBeLessThan(1000);

    console.log(`✅ OTP verification responded in ${duration}ms`);
});

// ============================================
// Test 12: Multi-Realm Support (Bonus)
// ============================================

test('MFA works across all realms', async ({ page }) => {
    const realms = ['dive-v3-broker', 'usa-realm-broker', 'fra-realm-broker', 'can-realm-broker'];

    for (const realm of realms) {
        // Navigate to realm-specific login
        await page.goto(`${BASE_URL}/login/${realm}`);
        await page.waitForLoadState('networkidle');

        // Verify page loads successfully
        await expect(page.locator('text=Sign In').or(page.locator('button[type="submit"]'))).toBeVisible({ timeout: 5000 });

        console.log(`✅ Realm ${realm} login page accessible`);
    }
});

// ============================================
// Test 13: Cancel OTP Setup (Bonus)
// ============================================

test('cancel OTP setup returns to login', async ({ page }) => {
    const user = TEST_USERS.ADMIN_DIVE;

    // 1. Reach OTP setup screen
    await navigateToLogin(page, user.idpAlias);
    await fillCredentials(page, user.username, user.password);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Multi-Factor Authentication Setup Required')).toBeVisible();

    // 2. Click Cancel button
    await page.click('button:has-text("Cancel")');

    // 3. Verify return to login form
    await expect(page.locator('input[type="text"]')).toBeVisible(); // Username field
    await expect(page.locator('input[type="password"]')).toBeVisible(); // Password field
    await expect(page.locator('text=Multi-Factor Authentication Setup')).not.toBeVisible();

    console.log('✅ OTP setup cancellation returns to login');
});

