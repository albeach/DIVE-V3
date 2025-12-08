/**
 * KAS (Key Access Service) Integration E2E Tests
 * 
 * Tests policy-bound encryption key release for encrypted resources
 * 
 * Created: November 23, 2025
 * - ✅ Uses centralized test users and resources
 * - ✅ Tests complete KAS flow: request → policy evaluation → key release → decryption
 * - ✅ Verifies policy re-evaluation at KAS (double-check security)
 * - ✅ Tests both allow and deny scenarios
 * - ✅ Covers multi-national access patterns
 * 
 * Requirements:
 * - KAS service running on port 8080
 * - Encrypted test resources with KAO objects
 * - OPA policy engine integration
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';
import { TEST_CONFIG } from './fixtures/test-config';
import { loginAs, logout } from './helpers/auth';
import { ResourcesPage } from './pages/ResourcesPage';

test.describe('KAS Integration Flow - Policy-Bound Key Release', () => {
    test.beforeEach(async ({ page }) => {
        console.log('\n🔐 Starting KAS integration test...');
    });
    
    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('USA SECRET user can decrypt FVEY encrypted resource via KAS', async ({ page }) => {
        await test.step('Login as USA SECRET user', async () => {
            await loginAs(page, TEST_USERS.USA.SECRET, {
                otpCode: '123456', // SECRET requires OTP (AAL2)
            });
        });

        await test.step('Access encrypted FVEY resource', async () => {
            const resourcesPage = new ResourcesPage(page);
            
            // Navigate to an encrypted resource that requires KAS
            await resourcesPage.gotoResourceDetail('test-secret-fvey-encrypted');
            
            // Verify we see encrypted content placeholder
            await expect(page.locator('text=Encrypted - KAS key request required')).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.NETWORK
            });
        });

        await test.step('Request decryption key from KAS', async () => {
            // Click the KAS request button
            const requestKeyButton = page.getByRole('button', { name: /request decryption key|unlock content/i });
            await requestKeyButton.click();
            
            // Wait for KAS modal to open
            await expect(page.locator('[data-testid="kas-modal"]').or(page.locator('.kas-modal'))).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION
            });
        });

        await test.step('Verify KAS policy re-evaluation', async () => {
            // The modal should show the KAS flow steps
            await expect(page.locator('text=Policy Evaluation')).toBeVisible();
            await expect(page.locator('text=Key Request to KAS')).toBeVisible();
            
            // Wait for KAS request to complete
            await expect(page.locator('text=COMPLETE').or(page.locator('text=SUCCESS'))).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.NETWORK
            });
        });

        await test.step('Verify content decryption', async () => {
            // After successful KAS response, content should be decrypted and displayed
            await expect(page.locator('text=Encrypted - KAS key request required')).not.toBeVisible();
            
            // Should see actual decrypted content
            await expect(page.locator('text=FVEY Intelligence Report')).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.RESOURCE_LOAD
            });
            
            // Verify classification marking is displayed
            await expect(page.locator('text=SECRET')).toBeVisible();
        });
    });

    test('France SECRET user denied access to US-ONLY encrypted resource', async ({ page }) => {
        await test.step('Login as France SECRET user', async () => {
            await loginAs(page, TEST_USERS.FRANCE.SECRET, {
                otpCode: '123456', // SECRET requires OTP (AAL2)
            });
        });

        await test.step('Attempt to access US-ONLY encrypted resource', async () => {
            const resourcesPage = new ResourcesPage(page);
            
            // Navigate to a US-ONLY encrypted resource
            await resourcesPage.gotoResourceDetail('test-secret-us-only-encrypted');
            
            // Verify we see encrypted content placeholder
            await expect(page.locator('text=Encrypted - KAS key request required')).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.NETWORK
            });
        });

        await test.step('Request decryption key from KAS (should be denied)', async () => {
            // Click the KAS request button
            const requestKeyButton = page.getByRole('button', { name: /request decryption key|unlock content/i });
            await requestKeyButton.click();
            
            // Wait for KAS modal to open
            await expect(page.locator('[data-testid="kas-modal"]').or(page.locator('.kas-modal'))).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION
            });
        });

        await test.step('Verify KAS policy denial', async () => {
            // Should see policy evaluation failure
            await expect(page.locator('text=Policy Evaluation')).toBeVisible();
            
            // Wait for denial response
            await expect(page.locator('text=DENIED').or(page.locator('text=FAILED'))).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.NETWORK
            });
            
            // Should show specific denial reason
            await expect(page.locator('text=Country FRA not in releasabilityTo')).toBeVisible();
        });

        await test.step('Verify content remains encrypted', async () => {
            // Content should still be encrypted (no key released)
            await expect(page.locator('text=Encrypted - KAS key request required')).toBeVisible();
            
            // Should NOT see decrypted content
            await expect(page.locator('text=US-ONLY Intelligence Report')).not.toBeVisible();
        });
    });

    test('Canada TOP_SECRET user accesses NATO encrypted resource with WebAuthn', async ({ page }) => {
        await test.step('Login as Canada TOP_SECRET user with WebAuthn', async () => {
            await loginAs(page, TEST_USERS.CANADA.TOP_SECRET, {
                expectMFASetup: false, // May already have WebAuthn configured
            });
        });

        await test.step('Access NATO TOP_SECRET encrypted resource', async () => {
            const resourcesPage = new ResourcesPage(page);
            
            // Navigate to NATO TOP_SECRET encrypted resource
            await resourcesPage.gotoResourceDetail('test-top-secret-nato-encrypted');
            
            // Verify we see encrypted content
            await expect(page.locator('text=Encrypted - KAS key request required')).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.NETWORK
            });
        });

        await test.step('Successful KAS request with AAL3 verification', async () => {
            // Click the KAS request button
            const requestKeyButton = page.getByRole('button', { name: /request decryption key|unlock content/i });
            await requestKeyButton.click();
            
            // Wait for KAS modal
            await expect(page.locator('[data-testid="kas-modal"]').or(page.locator('.kas-modal'))).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION
            });
            
            // KAS should verify AAL3 (WebAuthn) authentication
            await expect(page.locator('text=AAL3 verification')).toBeVisible();
            await expect(page.locator('text=WebAuthn confirmed')).toBeVisible();
            
            // Request should succeed
            await expect(page.locator('text=COMPLETE').or(page.locator('text=SUCCESS'))).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.NETWORK
            });
        });

        await test.step('Verify TOP_SECRET content access', async () => {
            // Content should be decrypted
            await expect(page.locator('text=NATO COSMIC Intelligence')).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.RESOURCE_LOAD
            });
            
            // Verify TOP_SECRET marking
            await expect(page.locator('text=TOP SECRET')).toBeVisible();
        });
    });
});

test.describe('KAS Integration Flow - Error Scenarios', () => {
    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('UNCLASSIFIED user cannot access CONFIDENTIAL encrypted resource', async ({ page }) => {
        await test.step('Login as UNCLASSIFIED user (no MFA)', async () => {
            await loginAs(page, TEST_USERS.USA.UNCLASS);
        });

        await test.step('Attempt to access CONFIDENTIAL encrypted resource', async () => {
            const resourcesPage = new ResourcesPage(page);
            
            // Try to access CONFIDENTIAL encrypted resource
            await resourcesPage.gotoResourceDetail('test-confidential-encrypted');
        });

        await test.step('Verify access denied before KAS request', async () => {
            // Should be denied at the resource level (insufficient clearance)
            await expect(page.locator('text=Access Denied')).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.NETWORK
            });
            
            await expect(page.locator('text=Insufficient clearance')).toBeVisible();
            
            // Should NOT see KAS request option
            await expect(page.getByRole('button', { name: /request decryption key/i })).not.toBeVisible();
        });
    });

    test('KAS service unavailable scenario', async ({ page }) => {
        // This test would require temporarily disabling KAS service
        // For now, we'll simulate the error condition
        
        await test.step('Login as authorized user', async () => {
            await loginAs(page, TEST_USERS.USA.SECRET, {
                otpCode: '123456',
            });
        });

        await test.step('Attempt KAS request when service unavailable', async () => {
            // This would require mocking KAS unavailability
            // In a real scenario, we'd temporarily stop the KAS container
            
            const resourcesPage = new ResourcesPage(page);
            await resourcesPage.gotoResourceDetail('test-secret-encrypted');
            
            // Click KAS request button
            const requestKeyButton = page.getByRole('button', { name: /request decryption key/i });
            await requestKeyButton.click();
            
            // Depending on implementation, should show service unavailable error
            // This is a placeholder - actual implementation would depend on error handling
        });
    });

    test('Expired JWT token during KAS request', async ({ page }) => {
        // This test would require JWT token expiration simulation
        // Complex to implement in E2E tests - would be better as integration test
        
        await test.step('Login as authorized user', async () => {
            await loginAs(page, TEST_USERS.USA.SECRET, {
                otpCode: '123456',
            });
        });

        await test.step('Simulate token expiration during KAS request', async () => {
            // This would require complex token manipulation
            // Placeholder for now - would need specific implementation
            console.log('Token expiration test - requires specific token manipulation');
        });
    });
});

test.describe('KAS Integration Flow - Multi-National Coverage', () => {
    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    // Test matrix: Different countries accessing different encrypted resources
    const kasTestMatrix = [
        {
            user: TEST_USERS.USA.SECRET,
            resource: 'test-secret-fvey-encrypted',
            expectedResult: 'ALLOW',
            description: 'USA SECRET accesses FVEY encrypted resource'
        },
        {
            user: TEST_USERS.BRITAIN.SECRET,
            resource: 'test-secret-fvey-encrypted',
            expectedResult: 'ALLOW',
            description: 'Britain SECRET accesses FVEY encrypted resource'
        },
        {
            user: TEST_USERS.GERMANY.SECRET,
            resource: 'test-secret-fvey-encrypted',
            expectedResult: 'DENY',
            description: 'Germany SECRET denied FVEY encrypted resource (not FVEY member)'
        },
        {
            user: TEST_USERS.FRANCE.CONFIDENTIAL,
            resource: 'test-confidential-nato-encrypted',
            expectedResult: 'ALLOW',
            description: 'France CONFIDENTIAL accesses NATO encrypted resource'
        }
    ];

    kasTestMatrix.forEach(({ user, resource, expectedResult, description }) => {
        test(description, async ({ page }) => {
            await test.step(`Login as ${user.country} ${user.clearance} user`, async () => {
                const loginOptions = user.mfaRequired ? { otpCode: '123456' } : {};
                await loginAs(page, user, loginOptions);
            });

            await test.step(`Access ${resource}`, async () => {
                const resourcesPage = new ResourcesPage(page);
                await resourcesPage.gotoResourceDetail(resource);
            });

            if (expectedResult === 'ALLOW') {
                await test.step('Verify successful KAS key release', async () => {
                    const requestKeyButton = page.getByRole('button', { name: /request decryption key/i });
                    await requestKeyButton.click();
                    
                    await expect(page.locator('[data-testid="kas-modal"]')).toBeVisible();
                    await expect(page.locator('text=COMPLETE')).toBeVisible({
                        timeout: TEST_CONFIG.TIMEOUTS.NETWORK
                    });
                });
            } else {
                await test.step('Verify KAS denial', async () => {
                    const requestKeyButton = page.getByRole('button', { name: /request decryption key/i });
                    await requestKeyButton.click();
                    
                    await expect(page.locator('[data-testid="kas-modal"]')).toBeVisible();
                    await expect(page.locator('text=DENIED')).toBeVisible({
                        timeout: TEST_CONFIG.TIMEOUTS.NETWORK
                    });
                });
            }
        });
    });
});














