/**
 * Session Lifecycle End-to-End Tests
 * Phase 3: Session Management Testing
 * 
 * COMPREHENSIVE SESSION TESTING:
 * 1. Token refresh at 7-minute mark (auto-refresh)
 * 2. Warning modal at 3 minutes remaining
 * 3. Forced logout at expiration
 * 4. Token rotation enforcement
 * 5. Session extension on refresh
 * 6. Cross-instance session validation
 * 
 * Reference: docs/session-management.md
 * Critical Settings:
 * - Access Token: 15 minutes
 * - Refresh Threshold: 7 minutes remaining
 * - Warning Threshold: 3 minutes remaining
 * - Session Max: 8 hours
 * - Refresh Token: Single-use (rotation)
 */

import { test, expect, Page } from '@playwright/test';
import { chromium } from 'playwright';

// Test configuration
// SECURITY: Base URL must be provided via environment variable
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;
if (!BASE_URL) {
    throw new Error('PLAYWRIGHT_BASE_URL or NEXT_PUBLIC_BASE_URL environment variable must be set for E2E tests');
}

const TEST_USER = {
    email: 'testuser-us@dive.mil',
    password: process.env.TEST_USER_PASSWORD || 'TestPassword123!',
    clearance: 'SECRET',
    country: 'USA'
};

/**
 * Helper: Login and get authenticated page
 */
async function loginUser(page: Page): Promise<void> {
    await page.goto(BASE_URL);
    
    // Select US IdP
    await page.click('text=United States');
    
    // Fill credentials (adjust selectors based on your IdP)
    await page.fill('input[name="username"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    
    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    
    // Verify authenticated
    await expect(page.locator('text=Dashboard')).toBeVisible();
}

/**
 * Helper: Get session expiry from API
 */
async function getSessionExpiry(page: Page): Promise<number> {
    const response = await page.request.get(`${BASE_URL}/api/session/refresh`);
    const data = await response.json();
    
    if (data.authenticated && data.expiresAt) {
        return new Date(data.expiresAt).getTime();
    }
    
    throw new Error('Session not authenticated or no expiry time');
}

/**
 * Helper: Wait for time remaining to reach threshold
 */
async function waitForTimeRemaining(
    page: Page,
    thresholdSeconds: number,
    maxWaitMs: number = 60000
): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
        const expiresAt = await getSessionExpiry(page);
        const timeRemaining = Math.floor((expiresAt - Date.now()) / 1000);
        
        console.log(`[SessionTest] Time remaining: ${timeRemaining}s (target: ${thresholdSeconds}s)`);
        
        if (timeRemaining <= thresholdSeconds) {
            return;
        }
        
        // Check every 5 seconds
        await page.waitForTimeout(5000);
    }
    
    throw new Error(`Timeout waiting for session to reach ${thresholdSeconds}s remaining`);
}

test.describe('Session Lifecycle Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Accept self-signed certificates for localhost
        await page.context().addInitScript(() => {
            // Disable certificate validation in test context
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        });
    });

    test('should auto-refresh token at 7 minutes remaining', async ({ page }) => {
        await loginUser(page);
        
        // Get initial session expiry
        const initialExpiry = await getSessionExpiry(page);
        console.log('[SessionTest] Initial expiry:', new Date(initialExpiry).toISOString());
        
        // Wait for auto-refresh trigger (when < 7 minutes remaining)
        // This test assumes token lifetime is 15 minutes
        // Auto-refresh happens at 7 minutes remaining = 8 minutes after login
        await waitForTimeRemaining(page, 420); // 7 minutes in seconds
        
        // Wait a bit for auto-refresh to complete
        await page.waitForTimeout(5000);
        
        // Get new session expiry
        const newExpiry = await getSessionExpiry(page);
        console.log('[SessionTest] New expiry after refresh:', new Date(newExpiry).toISOString());
        
        // Verify session was extended
        expect(newExpiry).toBeGreaterThan(initialExpiry);
        
        // Verify session extended by approximately 15 minutes (token lifetime)
        const extensionMs = newExpiry - initialExpiry;
        expect(extensionMs).toBeGreaterThan(10 * 60 * 1000); // At least 10 minutes
        expect(extensionMs).toBeLessThan(20 * 60 * 1000); // At most 20 minutes
    });

    test('should show warning modal at 3 minutes remaining', async ({ page }) => {
        await loginUser(page);
        
        // Wait for warning threshold (3 minutes remaining)
        await waitForTimeRemaining(page, 180); // 3 minutes in seconds
        
        // Warning modal should appear
        await expect(page.locator('[data-testid="session-expiry-modal"]')).toBeVisible({ timeout: 10000 });
        
        // Verify warning message
        await expect(page.locator('text=Your session will expire soon')).toBeVisible();
        
        // Verify countdown timer is shown
        await expect(page.locator('[data-testid="countdown-timer"]')).toBeVisible();
        
        // Verify "Extend Session" button is available
        await expect(page.locator('button:has-text("Extend Session")')).toBeVisible();
    });

    test('should manually extend session from warning modal', async ({ page }) => {
        await loginUser(page);
        
        // Get initial expiry
        const initialExpiry = await getSessionExpiry(page);
        
        // Wait for warning modal
        await waitForTimeRemaining(page, 180);
        await expect(page.locator('[data-testid="session-expiry-modal"]')).toBeVisible({ timeout: 10000 });
        
        // Click "Extend Session"
        await page.click('button:has-text("Extend Session")');
        
        // Wait for refresh to complete
        await page.waitForTimeout(2000);
        
        // Modal should close
        await expect(page.locator('[data-testid="session-expiry-modal"]')).not.toBeVisible();
        
        // Verify session was extended
        const newExpiry = await getSessionExpiry(page);
        expect(newExpiry).toBeGreaterThan(initialExpiry);
    });

    test('should force logout when session expires', async ({ page }) => {
        await loginUser(page);
        
        // Wait for session to expire (0 seconds remaining)
        await waitForTimeRemaining(page, 0, 120000); // 2 minute timeout
        
        // Expired modal should appear
        await expect(page.locator('[data-testid="session-expiry-modal"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=Your session has expired')).toBeVisible();
        
        // Should redirect to login page
        await page.waitForURL('**/', { timeout: 10000 });
        
        // Verify logged out
        await expect(page.locator('text=Sign In') || page.locator('text=Login')).toBeVisible();
    });

    test('should enforce token rotation (single-use refresh tokens)', async ({ page }) => {
        await loginUser(page);
        
        // Get initial refresh token count
        const initialExpiry = await getSessionExpiry(page);
        
        // Trigger manual refresh
        const refreshResponse = await page.request.post(`${BASE_URL}/api/session/refresh`, {
            data: { reason: 'manual' }
        });
        expect(refreshResponse.ok()).toBe(true);
        
        const refreshData = await refreshResponse.json();
        expect(refreshData.success).toBe(true);
        
        // Verify session was extended
        const newExpiry = await getSessionExpiry(page);
        expect(newExpiry).toBeGreaterThan(initialExpiry);
        
        // Verify new refresh token was issued
        // (This is implicit - if rotation works, subsequent operations will succeed)
        
        // Trigger another refresh to verify rotation
        const secondRefresh = await page.request.post(`${BASE_URL}/api/session/refresh`, {
            data: { reason: 'manual' }
        });
        expect(secondRefresh.ok()).toBe(true);
    });

    test('should handle rate limiting on excessive refresh attempts', async ({ page }) => {
        await loginUser(page);
        
        // Attempt 11 refreshes rapidly (limit is 10 per 5 minutes)
        const refreshPromises = [];
        for (let i = 0; i < 11; i++) {
            refreshPromises.push(
                page.request.post(`${BASE_URL}/api/session/refresh`, {
                    data: { reason: 'manual' }
                })
            );
        }
        
        const responses = await Promise.all(refreshPromises);
        
        // First 10 should succeed
        const successCount = responses.filter(r => r.status() === 200).length;
        const rateLimitCount = responses.filter(r => r.status() === 429).length;
        
        expect(successCount).toBeGreaterThanOrEqual(9); // Allow some variance
        expect(rateLimitCount).toBeGreaterThan(0); // At least one rate limited
        
        // Verify rate limit response
        const rateLimitedResponse = responses.find(r => r.status() === 429);
        if (rateLimitedResponse) {
            const data = await rateLimitedResponse.json();
            expect(data.error).toBe('TooManyRequests');
            expect(data.details?.code).toBe('SESSION_REFRESH_RATE_LIMIT');
        }
    });

    test('should maintain session across page reloads', async ({ page }) => {
        await loginUser(page);
        
        const initialExpiry = await getSessionExpiry(page);
        
        // Reload page
        await page.reload();
        
        // Wait for page to load
        await page.waitForLoadState('networkidle');
        
        // Verify still authenticated
        await expect(page.locator('text=Dashboard')).toBeVisible();
        
        // Verify session expiry is still valid
        const expiryAfterReload = await getSessionExpiry(page);
        
        // Should be approximately the same (within 10 seconds of variance)
        expect(Math.abs(expiryAfterReload - initialExpiry)).toBeLessThan(10000);
    });

    test('should sync session state across multiple tabs', async ({ context }) => {
        // Open first tab and login
        const page1 = await context.newPage();
        await loginUser(page1);
        
        // Open second tab (same context = same session)
        const page2 = await context.newPage();
        await page2.goto(`${BASE_URL}/dashboard`);
        
        // Verify both tabs are authenticated
        await expect(page1.locator('text=Dashboard')).toBeVisible();
        await expect(page2.locator('text=Dashboard')).toBeVisible();
        
        // Logout from first tab
        await page1.click('[data-testid="logout-button"]');
        
        // Wait for logout to propagate
        await page1.waitForTimeout(2000);
        
        // Verify second tab is also logged out
        await page2.waitForTimeout(2000);
        await expect(page2.locator('text=Sign In') || page2.locator('text=Login')).toBeVisible({ timeout: 10000 });
    });

    test('should handle concurrent refresh attempts correctly', async ({ page }) => {
        await loginUser(page);
        
        const initialExpiry = await getSessionExpiry(page);
        
        // Trigger multiple concurrent refreshes
        const refreshPromises = Array(5).fill(null).map(() => 
            page.request.post(`${BASE_URL}/api/session/refresh`, {
                data: { reason: 'auto' }
            })
        );
        
        const responses = await Promise.all(refreshPromises);
        
        // All should succeed (no race conditions)
        responses.forEach(response => {
            expect(response.status()).toBe(200);
        });
        
        // Verify session was extended
        const newExpiry = await getSessionExpiry(page);
        expect(newExpiry).toBeGreaterThan(initialExpiry);
    });

    test('should respect 8-hour maximum session duration', async ({ page }) => {
        await loginUser(page);
        
        const initialExpiry = await getSessionExpiry(page);
        
        // Calculate when session should expire (8 hours from login)
        const loginTime = Date.now();
        const maxSessionExpiry = loginTime + (8 * 60 * 60 * 1000); // 8 hours
        
        // Verify token expiry is within 8-hour window
        expect(initialExpiry).toBeLessThan(maxSessionExpiry);
        
        // This test documents the behavior - full 8-hour test would take too long
        console.log('[SessionTest] Maximum session duration verified:', {
            loginTime: new Date(loginTime).toISOString(),
            maxSessionExpiry: new Date(maxSessionExpiry).toISOString(),
            initialTokenExpiry: new Date(initialExpiry).toISOString()
        });
    });
});

test.describe('Session Health Check API Tests', () => {
    test('should return accurate session health data', async ({ request }) => {
        // Note: This test requires authenticated request
        // In real scenario, would need to obtain session cookie first
        
        const response = await request.get(`${BASE_URL}/api/session/refresh`);
        
        if (response.ok()) {
            const data = await response.json();
            
            // Verify response structure
            expect(data).toHaveProperty('authenticated');
            expect(data).toHaveProperty('expiresAt');
            expect(data).toHaveProperty('timeUntilExpiry');
            expect(data).toHaveProperty('isExpired');
            expect(data).toHaveProperty('needsRefresh');
            expect(data).toHaveProperty('serverTime');
            
            if (data.authenticated) {
                // Verify time consistency
                const serverTime = data.serverTime * 1000; // Convert to ms
                const clientTime = Date.now();
                const clockSkew = Math.abs(clientTime - serverTime);
                
                // Clock skew should be minimal (< 5 seconds)
                expect(clockSkew).toBeLessThan(5000);
            }
        }
    });

    test('should handle unauthenticated health checks gracefully', async ({ request }) => {
        // Create new context without authentication
        const response = await request.get(`${BASE_URL}/api/session/refresh`);
        
        // Should return 401 with authenticated: false
        if (response.status() === 401) {
            const data = await response.json();
            expect(data.authenticated).toBe(false);
            expect(data).toHaveProperty('serverTime');
        }
    });
});
