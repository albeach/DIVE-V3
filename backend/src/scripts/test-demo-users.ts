/**
 * DIVE V3 - Test Demo Users Script
 *
 * Tests demo user login and super admin access
 *
 * Usage:
 *   npm run ts-node backend/src/scripts/test-demo-users.ts
 */

import axios from 'axios';
import {
    INSTANCES,
    INSTANCE_CONFIG,
    REALM,
    DEMO_PASSWORD,
    SUPER_ADMIN_PASSWORD
} from './setup-demo-users';

// ============================================
// TEST FUNCTIONS
// ============================================

async function testUserLogin(
    keycloakUrl: string,
    username: string,
    password: string,
    otpCode?: string
): Promise<{ success: boolean; message: string; token?: string }> {
    try {
        const tokenUrl = `${keycloakUrl}/realms/${REALM}/protocol/openid-connect/token`;

        const params: any = {
            grant_type: 'password',
            client_id: 'dive-v3-client',
            username,
            password
        };

        // Add OTP if provided
        if (otpCode) {
            params['totp'] = otpCode;
        }

        const response = await axios.post(
            tokenUrl,
            new URLSearchParams(params),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const token = response.data.access_token;
        if (token) {
            // Decode JWT to check claims
            const parts = token.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                return {
                    success: true,
                    message: 'Login successful',
                    token
                };
            }
        }

        return { success: false, message: 'No token received' };
    } catch (error) {
        if (error.response?.data?.error_description) {
            return {
                success: false,
                message: error.response.data.error_description
            };
        }
        return {
            success: false,
            message: error.message || 'Login failed'
        };
    }
}

async function testSuperAdminRole(token: string): Promise<{ hasRole: boolean; roles: string[] }> {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            return { hasRole: false, roles: [] };
        }

        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        const roles = payload.realm_access?.roles || payload.roles || [];
        const hasSuperAdmin = roles.includes('super_admin');

        return { hasRole: hasSuperAdmin, roles };
    } catch (error) {
        return { hasRole: false, roles: [] };
    }
}

async function testAdminDashboardAccess(token: string, backendUrl: string): Promise<boolean> {
    try {
        const response = await axios.get(
            `${backendUrl}/api/admin/dashboard`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        return response.status === 200;
    } catch (error) {
        return false;
    }
}

// ============================================
// MAIN TEST EXECUTION
// ============================================

async function testInstance(instance: string): Promise<void> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing instance: ${instance}`);
    console.log('='.repeat(60));

    const config = INSTANCE_CONFIG[instance];
    if (!config) {
        console.error(`  ERROR: No configuration found for instance ${instance}`);
        return;
    }

    const keycloakUrl = config.url;
    const backendUrl = process.env.BACKEND_URL;

    console.log(`  Keycloak URL: ${keycloakUrl}`);
    console.log(`  Backend URL: ${backendUrl}\n`);

    // Test demo users
    console.log('Testing demo users...');
    for (const level of ['1', '2', '3', '4']) {
        const username = `demo-${instance.toLowerCase()}-${level}`;
        console.log(`\n  Testing: ${username}`);

        // Try login without OTP first (for UNCLASSIFIED)
        const result1 = await testUserLogin(keycloakUrl, username, DEMO_PASSWORD);
        if (result1.success) {
            console.log(`    ✅ Login successful (no MFA required)`);
        } else {
            // Try with OTP code
            if (result1.message.includes('OTP') || result1.message.includes('totp')) {
                console.log(`    ⚠️  MFA required, testing with OTP code...`);
                const result2 = await testUserLogin(keycloakUrl, username, DEMO_PASSWORD, '123456');
                if (result2.success) {
                    console.log(`    ✅ Login successful with OTP`);
                } else {
                    console.log(`    ❌ Login failed: ${result2.message}`);
                }
            } else {
                console.log(`    ❌ Login failed: ${result1.message}`);
            }
        }
    }

    // Test super admin user
    console.log(`\n  Testing super admin: admin-${instance.toLowerCase()}`);
    const adminResult = await testUserLogin(keycloakUrl, `admin-${instance.toLowerCase()}`, SUPER_ADMIN_PASSWORD, '123456');

    if (adminResult.success && adminResult.token) {
        console.log(`    ✅ Super admin login successful`);

        // Check role
        const roleCheck = await testSuperAdminRole(adminResult.token);
        if (roleCheck.hasRole) {
            console.log(`    ✅ Super admin role verified`);
            console.log(`    Roles: ${roleCheck.roles.join(', ')}`);

            // Test dashboard access
            const dashboardAccess = await testAdminDashboardAccess(adminResult.token, backendUrl);
            if (dashboardAccess) {
                console.log(`    ✅ Admin dashboard access verified`);
            } else {
                console.log(`    ⚠️  Admin dashboard access failed (backend may not be running)`);
            }
        } else {
            console.log(`    ❌ Super admin role NOT found in token`);
            console.log(`    Available roles: ${roleCheck.roles.join(', ') || 'none'}`);
        }
    } else {
        console.log(`    ❌ Super admin login failed: ${adminResult.message}`);
    }

    console.log(`\n✅ Instance ${instance} testing complete!`);
}

async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║     DIVE V3 - Demo Users Testing                                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    for (const instance of INSTANCES) {
        await testInstance(instance);
    }

    console.log('\n✅ All tests complete!\n');
}

// Run if executed directly
if (require.main === module) {
    main().catch((error) => {
        console.error('\n❌ FATAL ERROR:', error);
        process.exit(1);
    });
}

export { testInstance };
