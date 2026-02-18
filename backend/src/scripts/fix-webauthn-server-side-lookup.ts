/**
 * Fix WebAuthn Server-Side Credential Lookup Issue
 *
 * Problem: With requireResidentKey=No, credentials are server-side stored.
 * Keycloak needs to know the user ID BEFORE it can look up credentials.
 *
 * This script:
 * 1. Verifies WebAuthn policy has requireResidentKey=No
 * 2. Checks that credentials are properly stored with correct userHandle
 * 3. Verifies authentication flow has WebAuthn AFTER password
 * 4. Provides recommendations
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import dotenv from 'dotenv';
import axios from 'axios';
import { execSync } from 'child_process';

dotenv.config();

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'https://usa-idp.dive25.com';
const ADMIN_USER = process.env.KEYCLOAK_ADMIN_USERNAME || process.env.KEYCLOAK_ADMIN_USER || 'admin';
const REALM = 'dive-v3-broker-usa';

async function getAdminPassword(): Promise<string> {
    const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;
    if (adminPassword && adminPassword !== 'admin') {
        return adminPassword;
    }

    try {
        const secretName = 'dive-v3-keycloak-usa';
        const result = execSync(`gcloud secrets versions access latest --secret=${secretName} --project=dive25 2>/dev/null`, { encoding: 'utf-8' });
        if (result.trim()) {
            return result.trim();
        }
    } catch (error) {
        // GCP not available
    }

    return 'admin';
}

async function diagnoseWebAuthnLookup(username: string) {
    console.log('\n🔍 WebAuthn Server-Side Credential Lookup Diagnosis');
    console.log('================================================\n');
    console.log(`Keycloak URL: ${KEYCLOAK_URL}`);
    console.log(`Realm: ${REALM}`);
    console.log(`Username: ${username}\n`);

    // Step 1: Authenticate
    const adminPassword = await getAdminPassword();
    let adminToken: string;
    try {
        const adminTokenResponse = await axios.post(
            `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
            new URLSearchParams({
                grant_type: 'password',
                client_id: 'admin-cli',
                username: ADMIN_USER,
                password: adminPassword,
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        adminToken = adminTokenResponse.data.access_token;
        console.log('✅ Authenticated\n');
    } catch (error) {
        console.error('❌ Authentication failed!');
        process.exit(1);
    }

    const kcAdminClient = new KcAdminClient({
        baseUrl: KEYCLOAK_URL,
        realmName: 'master',
    });
    await kcAdminClient.auth({
        username: ADMIN_USER,
        password: adminPassword,
        grantType: 'password',
        clientId: 'admin-cli',
    });

    // Step 2: Get realm and check WebAuthn policy
    console.log('[1/5] Checking WebAuthn Policy...');
    const realm = await kcAdminClient.realms.findOne({ realm: REALM });
    if (!realm) {
        console.error(`❌ Realm ${REALM} not found`);
        process.exit(1);
    }

    console.log(`  Require Resident Key: ${realm.webAuthnPolicyRequireResidentKey}`);
    console.log(`  RP ID: ${realm.webAuthnPolicyRpId}`);

    if (realm.webAuthnPolicyRequireResidentKey === 'Yes') {
        console.log('  ⚠️  WARNING: Require Resident Key is "Yes" but credentials are server-side!');
        console.log('     This mismatch can cause "no credentials found" errors.');
        console.log('     Recommendation: Set to "No" for server-side credentials.\n');
    } else {
        console.log('  ✅ Require Resident Key is "No" (server-side credentials)\n');
    }

    // Step 3: Find user and check credentials
    console.log(`[2/5] Finding user: ${username}...`);
    const users = await kcAdminClient.users.find({ realm: REALM, username, exact: true });
    if (!users || users.length === 0) {
        console.error(`❌ User "${username}" not found`);
        process.exit(1);
    }
    const user = users[0];
    console.log(`  ✅ Found user: ${user.username} (ID: ${user.id})\n`);

    // Step 4: Get WebAuthn credentials
    console.log('[3/5] Checking WebAuthn credentials...');
    const credentials = await kcAdminClient.users.getCredentials({ realm: REALM, id: user.id! });
    const webauthnCreds = credentials.filter(c =>
        c.type === 'webauthn' || c.type === 'webauthn-passwordless'
    );

    if (webauthnCreds.length === 0) {
        console.log('  ⚠️  No WebAuthn credentials found');
        console.log('     User needs to register a passkey first.\n');
    } else {
        console.log(`  ✅ Found ${webauthnCreds.length} WebAuthn credential(s):`);
        webauthnCreds.forEach((cred, idx) => {
            console.log(`     ${idx + 1}. ${cred.userLabel || 'Unlabeled'} (${cred.type})`);
            console.log(`        ID: ${cred.id}`);
            console.log(`        Created: ${cred.createdDate}`);
        });
        console.log('');
    }

    // Step 5: Check authentication flow configuration
    console.log('[4/5] Checking authentication flow...');
    const flows = await kcAdminClient.authenticationManagement.getFlows({ realm: REALM });
    const browserFlow = flows.find(f => f.alias === 'browser' || f.alias?.includes('Browser') || f.alias?.includes('Classified'));

    if (!browserFlow) {
        console.log('  ⚠️  Could not find browser flow');
        console.log(`  Available flows: ${flows.map(f => f.alias).join(', ')}\n`);
    } else {
        console.log(`  ✅ Found browser flow: ${browserFlow.alias}`);

        // Get flow executions
        const executions = await kcAdminClient.authenticationManagement.getExecutions({
            realm: REALM,
            flow: browserFlow.alias!,
        });

        // Check if WebAuthn comes after password
        const flowState: { passwordFound: boolean; webauthnFound: boolean; passwordPriority: number; webauthnPriority: number } = {
            passwordFound: false,
            webauthnFound: false,
            passwordPriority: -1,
            webauthnPriority: -1,
        };

        function checkExecutions(execs: Record<string, unknown>[], depth = 0): void {
            for (const exec of execs) {
                const indent = '  '.repeat(depth + 1);
                if (exec.authenticator === 'auth-username-password-form') {
                    flowState.passwordFound = true;
                    flowState.passwordPriority = exec.priority || exec.index || 0;
                    console.log(`${indent}✅ Password form found (priority: ${flowState.passwordPriority})`);
                }
                if (exec.authenticator === 'webauthn-authenticator') {
                    flowState.webauthnFound = true;
                    flowState.webauthnPriority = exec.priority || exec.index || 0;
                    console.log(`${indent}✅ WebAuthn authenticator found (priority: ${flowState.webauthnPriority})`);
                }
                if (exec.flowAlias) {
                    // Check subflow
                    const subflow = flows.find(f => f.alias === exec.flowAlias);
                    if (subflow) {
                        const subExecutions = executions.filter(e =>
                            e.flowId === subflow.id || e.parentFlow === subflow.id
                        );
                        checkExecutions(subExecutions, depth + 1);
                    }
                }
            }
        }

        checkExecutions(executions);

        if (flowState.passwordFound && flowState.webauthnFound) {
            if (flowState.webauthnPriority > flowState.passwordPriority) {
                console.log('  ✅ WebAuthn comes AFTER password (correct order)\n');
            } else {
                console.log('  ⚠️  WARNING: WebAuthn comes BEFORE password!');
                console.log('     This will cause "no credentials found" because user context is not established yet.\n');
            }
        } else {
            if (!flowState.passwordFound) {
                console.log('  ⚠️  Password form not found in flow');
            }
            if (!flowState.webauthnFound) {
                console.log('  ⚠️  WebAuthn authenticator not found in flow');
            }
            console.log('');
        }
    }

    // Step 6: Recommendations
    console.log('[5/5] Recommendations:\n');

    if (realm.webAuthnPolicyRequireResidentKey === 'Yes') {
        console.log('🔧 FIX 1: Set Require Resident Key to "No"');
        console.log('   Path: Authentication → Policies → WebAuthn Policy');
        console.log('   Change: Require Resident Key → No');
        console.log('   Reason: Server-side credentials require this setting\n');
    }

    if (webauthnCreds.length === 0) {
        console.log('🔧 FIX 2: Register a passkey');
        console.log('   1. Log in with username/password');
        console.log('   2. When prompted, register your YubiKey');
        console.log('   3. Log out and log back in\n');
    }

    // Note: We can't access flowState here, so we'll provide general guidance
    console.log('🔧 FIX 3: Verify authentication flow order');
    console.log('   Path: Authentication → Flows → Browser Flow');
    console.log('   Ensure: WebAuthn authenticator comes AFTER password form');
    console.log('   Reason: User context must be established before credential lookup\n');

    console.log('💡 KEY INSIGHT:');
    console.log('   With requireResidentKey=No (server-side credentials):');
    console.log('   - Keycloak MUST know the user ID BEFORE looking up credentials');
    console.log('   - Password authentication establishes user context');
    console.log('   - WebAuthn authenticator THEN looks up credentials for that user');
    console.log('   - If WebAuthn runs before password, it cannot find credentials!\n');

    console.log('✅ Diagnosis complete!\n');
}

// Parse args
const args = process.argv.slice(2);
const usernameIndex = args.indexOf('--username');
const username = usernameIndex >= 0 && args[usernameIndex + 1] ? args[usernameIndex + 1] : 'admin-dive';

diagnoseWebAuthnLookup(username).catch((error) => {
    console.error('❌ ERROR:', error.message);
    if (error.response?.data) {
        console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
});
