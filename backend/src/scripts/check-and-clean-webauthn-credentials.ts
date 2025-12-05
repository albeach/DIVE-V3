/**
 * Check and Clean WebAuthn Credentials for a User
 * 
 * This script:
 * 1. Finds a user by username
 * 2. Lists all their WebAuthn credentials
 * 3. Optionally deletes all credentials (so they can re-register)
 * 
 * Usage:
 *   npm run check-webauthn-credentials -- --username admin-dive
 *   npm run check-webauthn-credentials -- --username admin-dive --delete
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import dotenv from 'dotenv';

dotenv.config();

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com';
const ADMIN_USER = process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';
const REALM = 'dive-v3-broker';

async function checkAndCleanCredentials(username: string, deleteCredentials: boolean = false) {
  const kcAdminClient = new KcAdminClient({
    baseUrl: KEYCLOAK_URL,
    realmName: 'master',
  });

  console.log('\n================================================');
  console.log('  DIVE V3 - WebAuthn Credentials Check & Clean  ');
  console.log('================================================\n');
  console.log(`Keycloak URL: ${KEYCLOAK_URL}`);
  console.log(`Realm: ${REALM}`);
  console.log(`Username: ${username}`);
  console.log(`Delete Mode: ${deleteCredentials ? 'YES (will delete all credentials)' : 'NO (read-only)'}\n`);

  // Authenticate
  console.log('[INFO] Authenticating with Keycloak Admin API...');
  await kcAdminClient.auth({
    username: ADMIN_USER,
    password: ADMIN_PASSWORD,
    grantType: 'password',
    clientId: 'admin-cli',
  });
  console.log('[INFO] Successfully authenticated\n');

  // Set realm context
  kcAdminClient.setConfig({ realmName: REALM });

  // Find user
  console.log(`[INFO] Searching for user: ${username}...`);
  const users = await kcAdminClient.users.find({ username, exact: true });
  
  if (users.length === 0) {
    console.error(`[ERROR] User "${username}" not found in realm "${REALM}"`);
    process.exit(1);
  }

  const user = users[0];
  console.log(`[INFO] Found user: ${user.username} (ID: ${user.id})\n`);

  // Get user's credentials
  console.log('[INFO] Fetching WebAuthn credentials...');
  const credentials = await kcAdminClient.users.getCredentials({ id: user.id! });
  
  // Filter for WebAuthn/FIDO2 credentials
  const webauthnCredentials = credentials.filter((cred: any) => 
    cred.type === 'webauthn' || 
    cred.type === 'webauthn-passwordless' ||
    cred.type?.toLowerCase().includes('fido') ||
    cred.type?.toLowerCase().includes('webauthn')
  );

  console.log(`\n[INFO] Found ${webauthnCredentials.length} WebAuthn credential(s):\n`);

  if (webauthnCredentials.length === 0) {
    console.log('  No WebAuthn credentials found for this user.');
    console.log('  The user can register a new credential.\n');
    return;
  }

  // Display credentials
  webauthnCredentials.forEach((cred: any, index: number) => {
    console.log(`  Credential ${index + 1}:`);
    console.log(`    ID: ${cred.id}`);
    console.log(`    Type: ${cred.type}`);
    console.log(`    User Label: ${cred.userLabel || '(no label)'}`);
    console.log(`    Created: ${cred.createdDate ? new Date(cred.createdDate).toISOString() : 'unknown'}`);
    console.log(`    Counter: ${cred.counter || 'N/A'}`);
    
    // Try to extract RP ID from credential data if available
    if (cred.credentialData) {
      try {
        const credData = JSON.parse(cred.credentialData);
        console.log(`    Credential Data: ${JSON.stringify(credData, null, 2)}`);
      } catch (e) {
        console.log(`    Credential Data: ${cred.credentialData.substring(0, 100)}...`);
      }
    }
    console.log('');
  });

  // Delete credentials if requested
  if (deleteCredentials && webauthnCredentials.length > 0) {
    console.log(`[INFO] Deleting ${webauthnCredentials.length} credential(s)...\n`);
    
    for (const cred of webauthnCredentials) {
      try {
        await kcAdminClient.users.deleteCredential({
          id: user.id!,
          credentialId: cred.id!,
        });
        console.log(`  ✅ Deleted credential: ${cred.id} (${cred.userLabel || 'no label'})`);
      } catch (error: any) {
        console.error(`  ❌ Failed to delete credential ${cred.id}: ${error.message}`);
      }
    }
    
    console.log('\n[INFO] All credentials deleted successfully!');
    console.log('[INFO] The user can now register a new WebAuthn credential.\n');
  } else if (deleteCredentials) {
    console.log('[INFO] No credentials to delete.\n');
  } else {
    console.log('[INFO] To delete all credentials, run with --delete flag\n');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const usernameIndex = args.indexOf('--username');
const username = usernameIndex >= 0 && args[usernameIndex + 1] ? args[usernameIndex + 1] : 'admin-dive';
const deleteCredentials = args.includes('--delete');

checkAndCleanCredentials(username, deleteCredentials).catch((error) => {
  console.error('[ERROR] Fatal error:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});





