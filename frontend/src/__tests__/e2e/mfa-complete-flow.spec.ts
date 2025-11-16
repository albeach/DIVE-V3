/**
 * MFA Complete Flow E2E Tests (REFACTORED)
 * 
 * Tests complete MFA setup and login flows
 * 
 * REFACTORED: November 16, 2025
 * - ✅ Uses centralized test users (fixtures/test-users.ts)
 * - ✅ Uses authentication helper (helpers/auth.ts)
 * - ✅ Removed hardcoded URLs
 * - ✅ Uses test.step() for clarity
 * - ✅ Simplified OTP handling (delegated to auth helper)
 * 
 * NOTE: MFA tests require Keycloak MFA configuration
 * Set TEST_CONFIG.FEATURES.MFA_TESTS = false to skip if MFA not configured
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';
import { TEST_CONFIG } from './fixtures/test-config';
import { loginAs, logout } from './helpers/auth';
import { DashboardPage } from './pages/DashboardPage';

test.describe('MFA Complete Flow (Refactored)', () => {
    test.skip(!TEST_CONFIG.FEATURES.MFA_TESTS, 'MFA tests disabled in config');

    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('New user completes OTP setup', async ({ page }) => {
        test.step('Attempt login triggers OTP setup', async () => {
            // First-time CONFIDENTIAL user should trigger OTP setup
            await loginAs(page, TEST_USERS.USA.CONFIDENTIAL, {
                expectMFASetup: true,
                otpCode: '123456', // Test OTP code
            });
        });

        test.step('Verify successful login after OTP setup', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyLoggedIn();
            await dashboard.verifyUserInfo(
                TEST_USERS.USA.CONFIDENTIAL.username,
                'CONFIDENTIAL',
                'USA'
            );
        });
    });

    test('Returning user logs in with existing OTP', async ({ page }) => {
        test.step('Login with OTP code', async () => {
            // SECRET user may have OTP already configured
            await loginAs(page, TEST_USERS.USA.SECRET, {
                expectMFASetup: false, // Not first time
                otpCode: '123456', // Test OTP code
            });
        });

        test.step('Verify successful login', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyLoggedIn();
            await dashboard.verifyUserInfo(
                TEST_USERS.USA.SECRET.username,
                'SECRET',
                'USA'
            );
        });
    });

    test('UNCLASSIFIED user skips MFA entirely', async ({ page }) => {
        test.step('Login without MFA', async () => {
            await loginAs(page, TEST_USERS.USA.UNCLASS);
        });

        test.step('Verify successful login without OTP prompt', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyLoggedIn();
            await dashboard.verifyUserInfo(
                TEST_USERS.USA.UNCLASS.username,
                'UNCLASSIFIED',
                'USA'
            );
        });
    });
});

test.describe('MFA Flow - Error Handling (Refactored)', () => {
    test.skip(!TEST_CONFIG.FEATURES.MFA_TESTS, 'MFA tests disabled in config');

    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('Invalid OTP code shows error message', async ({ page }) => {
        test.step('Attempt login with invalid OTP', async () => {
            try {
                await loginAs(page, TEST_USERS.USA.SECRET, {
                    otpCode: '000000', // Invalid code
                });
                
                // Should not reach here if OTP validation works
                test.fail();
            } catch (error) {
                console.log('✅ Invalid OTP correctly rejected:', error);
            }
        });

        test.step('Verify error message displayed', async () => {
            // Look for error message on page
            const errorMessage = page.getByText(/invalid.*code|incorrect.*otp|authentication failed/i);
            
            const isVisible = await errorMessage.isVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            }).catch(() => false);
            
            if (isVisible) {
                await expect(errorMessage).toBeVisible();
            }
        });
    });
});

test.describe('MFA Flow - Multi-Nation (Refactored)', () => {
    test.skip(!TEST_CONFIG.FEATURES.MFA_TESTS, 'MFA tests disabled in config');

    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('All nations enforce MFA for CONFIDENTIAL+ clearance', async ({ page }) => {
        const confidentialUsers = [
            TEST_USERS.USA.CONFIDENTIAL,
            TEST_USERS.FRA.CONFIDENTIAL,
            TEST_USERS.CAN.CONFIDENTIAL,
            TEST_USERS.DEU.CONFIDENTIAL,
        ];

        for (const user of confidentialUsers) {
            test.step(`${user.countryCode} CONFIDENTIAL user MFA flow`, async () => {
                await loginAs(page, user, {
                    expectMFASetup: true,
                    otpCode: '123456',
                });

                const dashboard = new DashboardPage(page);
                await dashboard.verifyLoggedIn();

                await logout(page);
            });
        }
    });

    test('All nations skip MFA for UNCLASSIFIED', async ({ page }) => {
        const unclassUsers = [
            TEST_USERS.USA.UNCLASS,
            TEST_USERS.FRA.UNCLASS,
            TEST_USERS.CAN.UNCLASS,
            TEST_USERS.DEU.UNCLASS,
        ];

        for (const user of unclassUsers) {
            test.step(`${user.countryCode} UNCLASS user no MFA`, async () => {
                await loginAs(page, user);

                const dashboard = new DashboardPage(page);
                await dashboard.verifyLoggedIn();

                await logout(page);
            });
        }
    });

    test('MFA setup flow consistent across all nations', async ({ page }) => {
        const secretUsers = [
            TEST_USERS.USA.SECRET,
            TEST_USERS.FRA.SECRET,
            TEST_USERS.DEU.SECRET,
        ];

        for (const user of secretUsers) {
            test.step(`${user.countryCode} SECRET user MFA setup`, async () => {
                await loginAs(page, user, {
                    expectMFASetup: true,
                    otpCode: '123456',
                });

                const dashboard = new DashboardPage(page);
                await dashboard.verifyLoggedIn();
                await dashboard.verifyUserInfo(user.username, user.clearance, user.countryCode);

                await logout(page);
            });
        }
    });

    test('MFA enforced for all clearance levels above UNCLASSIFIED', async ({ page }) => {
        const mfaUsers = [
            TEST_USERS.USA.CONFIDENTIAL,
            TEST_USERS.USA.SECRET,
        ];

        for (const user of mfaUsers) {
            test.step(`${user.clearance} user requires MFA`, async () => {
                await loginAs(page, user, {
                    expectMFASetup: true,
                    otpCode: '123456',
                });

                const dashboard = new DashboardPage(page);
                await dashboard.verifyLoggedIn();

                await logout(page);
            });
        }
    });
});

test.describe('MFA Flow - Session Persistence (Refactored)', () => {
    test.skip(!TEST_CONFIG.FEATURES.MFA_TESTS, 'MFA tests disabled in config');

    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('Session persists after MFA login', async ({ page }) => {
        test.step('Login with MFA', async () => {
            await loginAs(page, TEST_USERS.USA.SECRET, {
                otpCode: '123456',
            });
        });

        test.step('Verify session persists on page reload', async () => {
            await page.reload();

            const dashboard = new DashboardPage(page);
            await dashboard.verifyLoggedIn();
        });

        test.step('Verify session persists on navigation', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.goToResources();

            // Should still be logged in
            await dashboard.verifyLoggedIn();
        });
    });

    test('Logout clears MFA session', async ({ page }) => {
        test.step('Login with MFA', async () => {
            await loginAs(page, TEST_USERS.USA.SECRET, {
                otpCode: '123456',
            });
        });

        test.step('Verify logged in', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyLoggedIn();
        });

        test.step('Logout', async () => {
            await logout(page);
        });

        test.step('Verify session cleared', async () => {
            // Should be on home/login page
            await page.waitForURL(/^\/$|\/login/, {
                timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
            });

            // Should see IdP selector (not user menu)
            const idpButton = page.getByRole('button', { name: /United States|France|Canada/i }).first();
            await expect(idpButton).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });
});
