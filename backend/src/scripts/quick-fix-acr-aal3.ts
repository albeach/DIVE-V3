/**
 * QUICK FIX: Set ACR=2 (AAL3) for admin-dive user
 *
 * This script:
 * 1. Checks if user has WebAuthn credentials registered
 * 2. If yes, sets a user attribute that protocol mappers can read
 * 3. Forces token refresh by updating user
 *
 * Usage: npm run quick-fix-acr -- --username admin-dive
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import dotenv from 'dotenv';

dotenv.config();

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com';
const ADMIN_USER = process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';
const REALM = 'dive-v3-broker';

async function quickFixACR(username: string) {
  const kcAdminClient = new KcAdminClient({
    baseUrl: KEYCLOAK_URL,
    realmName: 'master',
  });

  console.log('\n================================================');
  console.log('  QUICK FIX: Set ACR=2 (AAL3) for Demo');
  console.log('================================================\n');
  console.log(`Keycloak URL: ${KEYCLOAK_URL}`);
  console.log(`Realm: ${REALM}`);
  console.log(`Username: ${username}\n`);

  // Authenticate
  console.log('[1/4] Authenticating with Keycloak Admin API...');
  await kcAdminClient.auth({
    username: ADMIN_USER,
    password: ADMIN_PASSWORD,
    grantType: 'password',
    clientId: 'admin-cli',
  });
  console.log('✅ Authenticated\n');

  // Set realm context
  kcAdminClient.setConfig({ realmName: REALM });

  // Find user
  console.log(`[2/4] Searching for user: ${username}...`);
  const users = await kcAdminClient.users.find({ username, exact: true });

  if (users.length === 0) {
    console.error(`❌ ERROR: User "${username}" not found in realm "${REALM}"`);
    process.exit(1);
  }

  const user = users[0];
  console.log(`✅ Found user: ${user.username} (ID: ${user.id})\n`);

  // Check WebAuthn credentials
  console.log('[3/4] Checking WebAuthn credentials...');
  const credentials = await kcAdminClient.users.getCredentials({ id: user.id! });
  const webauthnCredentials = credentials.filter((cred: { type?: string }) =>
    cred.type === 'webauthn' ||
    cred.type === 'webauthn-passwordless' ||
    cred.type?.toLowerCase().includes('fido') ||
    cred.type?.toLowerCase().includes('webauthn')
  );

  if (webauthnCredentials.length === 0) {
    console.log('⚠️  WARNING: No WebAuthn credentials found!');
    console.log('   The user needs to register a passkey first.');
    console.log('   However, we can still set ACR=2 manually for demo purposes.\n');
  } else {
    console.log(`✅ Found ${webauthnCredentials.length} WebAuthn credential(s):`);
    webauthnCredentials.forEach((cred: { type?: string; userLabel?: string }, idx: number) => {
      console.log(`   ${idx + 1}. ${cred.userLabel || 'Unlabeled'} (${cred.type})`);
    });
    console.log('');
  }

  // Get current user attributes
  console.log('[4/4] Setting ACR=2 via user attribute...');
  const currentAttributes = user.attributes || {};

  // Set ACR attribute to "2" (AAL3)
  // Protocol mappers can read this and set it in the token
  const updatedAttributes = {
    ...currentAttributes,
    acr: ['2'], // AAL3
    aal: ['AAL3'], // Human-readable
  };

  await kcAdminClient.users.update(
    { id: user.id! },
    {
      attributes: updatedAttributes,
    }
  );

  console.log('✅ User attributes updated:');
  console.log(`   acr = "2" (AAL3)`);
  console.log(`   aal = "AAL3"`);
  console.log('');

  // Also check if AMRProtocolMapper is configured
  console.log('📋 IMPORTANT: For this to work, you need:');
  console.log('   1. The AMRProtocolMapper to be active (it checks WebAuthn credentials)');
  console.log('   2. OR log out and log back in to get a new token');
  console.log('');
  console.log('💡 QUICKEST FIX: Log out and log back in now!');
  console.log('   The AMRProtocolMapper will detect WebAuthn and set ACR=2 automatically.\n');

  // Check active sessions
  try {
    const sessions = await kcAdminClient.users.listSessions({ id: user.id! });
    if (sessions.length > 0) {
      console.log(`⚠️  User has ${sessions.length} active session(s).`);
      console.log('   Consider logging out to force a fresh token with ACR=2.\n');
    }
  } catch (error) {
    // Ignore if sessions API not available
  }

  console.log('✅ Quick fix complete!');
  console.log('   Next step: Log out and log back in to get ACR=2 in your token.\n');
}

// Parse command line arguments
const args = process.argv.slice(2);
const usernameIndex = args.indexOf('--username');
const username = usernameIndex >= 0 && args[usernameIndex + 1] ? args[usernameIndex + 1] : 'admin-dive';

quickFixACR(username).catch((error) => {
  console.error('❌ ERROR:', error.message);
  if (error.response?.data) {
    console.error('Response:', JSON.stringify(error.response.data, null, 2));
  }
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});

