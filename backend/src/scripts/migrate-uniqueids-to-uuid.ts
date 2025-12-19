/**
 * uniqueID Migration Script: Email → UUID
 * 
 * Gap #5 Remediation (October 20, 2025)
 * 
 * Migrates existing email-based uniqueIDs to RFC 4122 UUID v4 format.
 * Maintains mapping table for backward compatibility and audit trail.
 * 
 * Usage: npm run migrate-uuids
 * 
 * ACP-240 Section 2.1: Globally Unique Identifier
 */

import axios from 'axios';
import { v4 as uuidv4, validate as isValidUUID } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

config({ path: '.env.local' });

// Keycloak configuration
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8081';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'dive-v3-broker';
const KEYCLOAK_ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

// Output directory for migration artifacts
const OUTPUT_DIR = path.join(__dirname, '../../migration');

// Mapping: old uniqueID → new UUID
const uniqueIDMapping: Map<string, string> = new Map();

// Statistics
let totalUsers = 0;
let usersToMigrate = 0;
let usersMigrated = 0;
let usersSkipped = 0;
let errors = 0;

/**
 * Get Keycloak admin access token
 */
async function getAdminToken(): Promise<string> {
    console.log('🔑 Authenticating as Keycloak admin...');

    try {
        const response = await axios.post(
            `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
            new URLSearchParams({
                grant_type: 'password',
                client_id: 'admin-cli',
                username: KEYCLOAK_ADMIN_USERNAME,
                password: KEYCLOAK_ADMIN_PASSWORD
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        console.log('✓ Admin authentication successful');
        return response.data.access_token;
    } catch (error) {
        console.error('✗ Failed to get admin token:', error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
}

/**
 * Fetch all users from realm
 */
async function fetchAllUsers(adminToken: string): Promise<any[]> {
    console.log(`\n📋 Fetching all users from realm: ${KEYCLOAK_REALM}...`);

    try {
        const response = await axios.get(
            `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users`,
            {
                headers: {
                    'Authorization': `Bearer ${adminToken}`
                },
                params: {
                    max: 1000  // Fetch up to 1000 users
                }
            }
        );

        totalUsers = response.data.length;
        console.log(`✓ Found ${totalUsers} users in realm`);
        return response.data;
    } catch (error) {
        console.error('✗ Failed to fetch users:', error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
}

/**
 * Migrate a single user from email-based uniqueID to UUID
 */
async function migrateUser(adminToken: string, user: any): Promise<void> {
    const userId = user.id;
    const currentUniqueID = user.attributes?.uniqueID?.[0] || user.attributes?.uniqueID;

    // Skip if already UUID
    if (isValidUUID(currentUniqueID)) {
        console.log(`  ⏭  Skipping ${user.username} (already UUID: ${currentUniqueID})`);
        usersSkipped++;
        return;
    }

    // Generate new UUID v4
    const newUUID = uuidv4();

    // Store mapping
    uniqueIDMapping.set(currentUniqueID, newUUID);

    console.log(`  🔄 Migrating ${user.username}:`);
    console.log(`     Old: ${currentUniqueID}`);
    console.log(`     New: ${newUUID}`);

    try {
        // Update user attributes
        const updatedAttributes = {
            ...user.attributes,
            uniqueID: newUUID,
            uniqueID_legacy: currentUniqueID  // Preserve old value for reference
        };

        await axios.put(
            `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${userId}`,
            {
                ...user,
                attributes: updatedAttributes
            },
            {
                headers: {
                    'Authorization': `Bearer ${adminToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`  ✓ Migration successful for ${user.username}`);
        usersMigrated++;

    } catch (error) {
        console.error(`  ✗ Failed to migrate ${user.username}:`, error instanceof Error ? error.message : 'Unknown error');
        errors++;
    }
}

/**
 * Save migration mapping to file
 */
function saveMigrationMapping(): void {
    console.log(`\n💾 Saving migration mapping...`);

    // Create output directory if it doesn't exist
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Convert Map to array for JSON
    const mappingArray = Array.from(uniqueIDMapping.entries()).map(([oldId, newId]) => ({
        oldUniqueID: oldId,
        newUniqueID: newId,
        migratedAt: new Date().toISOString()
    }));

    // Save as JSON
    const mappingFilePath = path.join(OUTPUT_DIR, `uniqueid-migration-${Date.now()}.json`);
    fs.writeFileSync(mappingFilePath, JSON.stringify(mappingArray, null, 2));

    console.log(`✓ Mapping saved to: ${mappingFilePath}`);

    // Also save as CSV for easy review
    const csvFilePath = path.join(OUTPUT_DIR, `uniqueid-migration-${Date.now()}.csv`);
    const csvContent = [
        'Old uniqueID,New UUID,Migrated At',
        ...mappingArray.map(m => `"${m.oldUniqueID}","${m.newUniqueID}","${m.migratedAt}"`)
    ].join('\n');

    fs.writeFileSync(csvFilePath, csvContent);
    console.log(`✓ CSV saved to: ${csvFilePath}`);
}

/**
 * Print migration summary
 */
function printSummary(): void {
    console.log('\n==========================================');
    console.log('UUID Migration Summary');
    console.log('==========================================');
    console.log(`Total users:        ${totalUsers}`);
    console.log(`Already UUID:       ${usersSkipped} (${((usersSkipped / totalUsers) * 100).toFixed(1)}%)`);
    console.log(`To migrate:         ${usersToMigrate}`);
    console.log(`Migrated:           ${usersMigrated} ✓`);
    console.log(`Errors:             ${errors}${errors > 0 ? ' ✗' : ''}`);
    console.log('==========================================');

    if (usersMigrated > 0) {
        console.log('\n✅ Migration completed successfully!');
        console.log('   Mapping files saved to:', OUTPUT_DIR);
        console.log('   Review mapping before enabling strict UUID validation.');
    }

    if (errors > 0) {
        console.log('\n⚠️  Some migrations failed. Review errors above.');
    }

    console.log('\n📋 Next Steps:');
    console.log('   1. Review migration mapping files');
    console.log('   2. Test authentication with migrated users');
    console.log('   3. Enable UUID validation middleware');
    console.log('   4. Update frontend to use new uniqueIDs (if stored client-side)');
    console.log('');
}

/**
 * Main migration function
 */
async function main(): Promise<void> {
    console.log('==========================================');
    console.log('uniqueID Migration: Email → UUID');
    console.log('Gap #5 Remediation');
    console.log('Date:', new Date().toISOString());
    console.log('==========================================');

    try {
        // Step 1: Authenticate
        const adminToken = await getAdminToken();

        // Step 2: Fetch all users
        const users = await fetchAllUsers(adminToken);

        // Step 3: Identify users to migrate
        console.log('\n🔍 Analyzing users...');
        usersToMigrate = users.filter(user => {
            const uniqueID = user.attributes?.uniqueID?.[0] || user.attributes?.uniqueID;
            return uniqueID && !isValidUUID(uniqueID);
        }).length;

        console.log(`   Users already using UUID: ${totalUsers - usersToMigrate}`);
        console.log(`   Users to migrate: ${usersToMigrate}`);

        if (usersToMigrate === 0) {
            console.log('\n✅ All users already have UUID format! No migration needed.');
            return;
        }

        // Step 4: Confirm migration
        console.log('\n⚠️  WARNING: This will modify user attributes in Keycloak.');
        console.log('   Old uniqueIDs will be preserved in uniqueID_legacy attribute.');
        console.log('   A mapping file will be created for rollback if needed.');
        console.log('');
        console.log('   To proceed with migration, set environment variable:');
        console.log('   CONFIRM_MIGRATION=yes npm run migrate-uuids');

        if (process.env.CONFIRM_MIGRATION !== 'yes') {
            console.log('\n❌ Migration aborted (CONFIRM_MIGRATION not set)');
            console.log('   This was a dry-run. No changes were made.');
            return;
        }

        console.log('\n🚀 Starting migration...\n');

        // Step 5: Migrate each user
        for (const user of users) {
            const uniqueID = user.attributes?.uniqueID?.[0] || user.attributes?.uniqueID;

            if (uniqueID && !isValidUUID(uniqueID)) {
                await migrateUser(adminToken, user);
            } else if (uniqueID && isValidUUID(uniqueID)) {
                usersSkipped++;
            }
        }

        // Step 6: Save mapping
        if (usersMigrated > 0) {
            saveMigrationMapping();
        }

        // Step 7: Print summary
        printSummary();

        // Exit with error if any migrations failed
        if (errors > 0) {
            process.exit(1);
        }

    } catch (error) {
        console.error('\n❌ Migration failed:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    }
}

// Run migration
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
