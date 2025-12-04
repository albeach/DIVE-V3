/**
 * Create Super Admin Users Only
 * 
 * Creates super admin users directly via Keycloak Admin API
 * Bypasses password policy issues by using admin API directly
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import axios from 'axios';
import { execSync } from 'child_process';

const REALM = 'dive-v3-broker';
const SUPER_ADMIN_PASSWORD = 'Admin2025!SecurePassword123'; // 28 chars - exceeds all policies

const INSTANCES = [
    { code: 'USA', url: 'https://localhost:8443', container: 'dive-v3-keycloak' },
    { code: 'FRA', url: 'https://localhost:8444', container: 'dive-v3-keycloak-fra' },
    { code: 'GBR', url: 'https://localhost:8445', container: 'dive-v3-keycloak-gbr' }
];

async function getAdminPassword(instance: string): Promise<string> {
    try {
        const secretName = `dive-v3-keycloak-${instance.toLowerCase()}`;
        const result = execSync(
            `gcloud secrets versions access latest --secret=${secretName} --project=dive25 2>/dev/null`,
            { encoding: 'utf-8' }
        );
        if (result.trim()) {
            return result.trim();
        }
    } catch (error) {
        // Fallback
    }
    return 'DivePilot2025!SecureAdmin';
}

async function createSuperAdmin(instance: { code: string; url: string; container: string }) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Creating super admin for: ${instance.code}`);
    console.log('='.repeat(60));

    try {
        const adminPassword = await getAdminPassword(instance.code);
        const client = new KcAdminClient({
            baseUrl: instance.url,
            realmName: 'master'
        });

        await client.auth({
            username: 'admin',
            password: adminPassword,
            grantType: 'password',
            clientId: 'admin-cli'
        });

        const username = `admin-${instance.code.toLowerCase()}`;
        console.log(`  Username: ${username}`);

        // Check if user exists
        const existing = await client.users.find({
            realm: REALM,
            username,
            exact: true
        });

        let userId: string;

        if (existing && existing.length > 0) {
            userId = existing[0].id!;
            console.log(`  ✅ User exists: ${userId}`);
        } else {
            const newUser = await client.users.create({
                realm: REALM,
                username,
                enabled: true,
                email: `${username}@dive-demo.example`,
                firstName: 'Admin',
                lastName: instance.code,
                attributes: {
                    clearance: ['TOP_SECRET'],
                    countryOfAffiliation: [instance.code],
                    uniqueID: [username],
                    userType: ['administrator'],
                    organization: [`${instance.code} Defense`],
                    organizationType: ['GOV']
                }
            });
            userId = newUser.id!;
            console.log(`  ✅ User created: ${userId}`);
        }

        // Set password
        await client.users.resetPassword({
            realm: REALM,
            id: userId,
            credential: {
                temporary: false,
                type: 'password',
                value: SUPER_ADMIN_PASSWORD
            }
        });
        console.log(`  ✅ Password set`);

        // Get super_admin role
        const roles = await client.roles.find({
            realm: REALM,
            roleName: 'super_admin'
        });

        if (roles && roles.length > 0) {
            // Remove existing role mappings first
            const currentRoles = await client.users.listRealmRoleMappings({
                realm: REALM,
                id: userId
            });

            if (currentRoles.length > 0) {
                await client.users.delRealmRoleMappings({
                    realm: REALM,
                    id: userId,
                    roles: currentRoles
                });
            }

            // Assign super_admin role
            await client.users.addRealmRoleMappings({
                realm: REALM,
                id: userId,
                roles: [roles[0]]
            });
            console.log(`  ✅ Super admin role assigned`);
        } else {
            console.log(`  ⚠️  WARNING: super_admin role not found - creating it`);
            // Create role if it doesn't exist
            const newRole = await client.roles.create({
                realm: REALM,
                name: 'super_admin',
                description: 'Super Administrator with full system access'
            });
            await client.users.addRealmRoleMappings({
                realm: REALM,
                id: userId,
                roles: [newRole]
            });
            console.log(`  ✅ Role created and assigned`);
        }

        // Verify role assignment
        const verifyRoles = await client.users.listRealmRoleMappings({
            realm: REALM,
            id: userId
        });
        const hasSuperAdmin = verifyRoles.some(r => r.name === 'super_admin');

        if (hasSuperAdmin) {
            console.log(`  ✅ VERIFIED: User has super_admin role`);
        } else {
            console.log(`  ❌ ERROR: Role assignment verification failed`);
        }

        console.log(`\n  📋 Credentials:`);
        console.log(`     Username: ${username}`);
        console.log(`     Password: ${SUPER_ADMIN_PASSWORD}`);
        console.log(`     Instance: ${instance.code}`);

        return { success: true, username, password: SUPER_ADMIN_PASSWORD };

    } catch (error: any) {
        console.error(`  ❌ ERROR: ${error.message}`);
        if (error.response?.data) {
            console.error(`     Response:`, JSON.stringify(error.response.data, null, 2));
        }
        return { success: false, error: error.message };
    }
}

async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║     Creating Super Admin Users                                 ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const results = [];
    for (const instance of INSTANCES) {
        const result = await createSuperAdmin(instance);
        results.push({ instance: instance.code, ...result });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('SUMMARY');
    console.log('='.repeat(60));

    results.forEach(r => {
        if (r.success) {
            console.log(`✅ ${r.instance}: ${r.username}`);
        } else {
            console.log(`❌ ${r.instance}: ${r.error}`);
        }
    });

    console.log(`\n📋 SUPER ADMIN CREDENTIALS:`);
    console.log(`   Password: ${SUPER_ADMIN_PASSWORD}`);
    console.log(`   Username format: admin-{instance}`);
    console.log(`   Instances: usa, fra, gbr`);
    console.log(`\n`);
}

if (require.main === module) {
    main().catch(console.error);
}



