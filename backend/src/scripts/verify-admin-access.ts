/**
 * Verify Super Admin Access
 */

import axios from 'axios';

const INSTANCES = [
    { code: 'USA', keycloak: 'https://localhost:8443', backend: 'https://localhost:4000' },
    { code: 'FRA', keycloak: 'https://localhost:8444', backend: 'https://localhost:4001' },
    { code: 'GBR', keycloak: 'https://localhost:8445', backend: 'https://localhost:4002' }
];

const PASSWORD = 'Admin2025!SecurePassword123';
const REALM = 'dive-v3-broker';
const CLIENT_ID = 'dive-v3-client-broker'; // Broker realm client ID

async function testAdminAccess(instance: typeof INSTANCES[0]) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${instance.code}`);
    console.log('='.repeat(60));

    const username = `admin-${instance.code.toLowerCase()}`;

    try {
        // 1. Get token
        console.log(`  [1/3] Getting token for ${username}...`);
        const tokenResponse = await axios.post(
            `${instance.keycloak}/realms/${REALM}/protocol/openid-connect/token`,
            new URLSearchParams({
                grant_type: 'password',
                client_id: CLIENT_ID,
                username,
                password: PASSWORD
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
            }
        );

        const token = tokenResponse.data.access_token;
        if (!token) {
            console.log(`  ❌ No token received`);
            return { success: false };
        }
        console.log(`  ✅ Token received`);

        // 2. Decode and check roles
        console.log(`  [2/3] Checking roles in token...`);
        const parts = token.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        const roles = payload.realm_access?.roles || [];
        const hasSuperAdmin = roles.includes('super_admin');

        console.log(`     Roles: ${roles.join(', ') || 'none'}`);
        if (hasSuperAdmin) {
            console.log(`  ✅ super_admin role found`);
        } else {
            console.log(`  ❌ super_admin role NOT found`);
        }

        // 3. Test admin dashboard access
        console.log(`  [3/3] Testing /admin/dashboard access...`);
        try {
            const dashboardResponse = await axios.get(
                `${instance.backend}/api/admin/dashboard`,
                {
                    headers: { 'Authorization': `Bearer ${token}` },
                    httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
                }
            );

            if (dashboardResponse.status === 200) {
                console.log(`  ✅ Admin dashboard accessible`);
                return { success: true, hasRole: hasSuperAdmin, dashboardAccess: true };
            } else {
                console.log(`  ❌ Dashboard returned status ${dashboardResponse.status}`);
                return { success: false, hasRole: hasSuperAdmin, dashboardAccess: false };
            }
        } catch (error: any) {
            if (error.response?.status === 403) {
                console.log(`  ❌ Dashboard access denied (403 Forbidden)`);
            } else if (error.response?.status === 401) {
                console.log(`  ❌ Dashboard access denied (401 Unauthorized)`);
            } else {
                console.log(`  ⚠️  Dashboard test failed: ${error.message}`);
            }
            return { success: false, hasRole: hasSuperAdmin, dashboardAccess: false };
        }

    } catch (error: any) {
        console.log(`  ❌ ERROR: ${error.message}`);
        if (error.response?.data) {
            console.log(`     Response:`, JSON.stringify(error.response.data, null, 2));
        }
        return { success: false };
    }
}

async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║     Verifying Super Admin Access                                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    const results = [];
    for (const instance of INSTANCES) {
        const result = await testAdminAccess(instance);
        results.push({ instance: instance.code, ...result });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(60));

    results.forEach(r => {
        const status = r.success && r.hasRole && r.dashboardAccess ? '✅' : '❌';
        console.log(`${status} ${r.instance}: Token=${r.success ? 'OK' : 'FAIL'}, Role=${r.hasRole ? 'OK' : 'MISSING'}, Dashboard=${r.dashboardAccess ? 'OK' : 'FAIL'}`);
    });
}

if (require.main === module) {
    main().catch(console.error);
}
