/**
 * Delete WebAuthn Credential and Prepare for Re-registration
 * 
 * This script:
 * 1. Deletes the existing WebAuthn credential for admin-dive
 * 2. Verifies deletion
 * 3. Provides instructions for re-registration
 * 
 * Usage: KEYCLOAK_URL=https://usa-idp.dive25.com npm run delete-webauthn -- --username admin-dive
 */

import dotenv from 'dotenv';
import axios from 'axios';
import { execSync } from 'child_process';

dotenv.config();

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'https://usa-idp.dive25.com';
const ADMIN_USER = process.env.KEYCLOAK_ADMIN_USERNAME || process.env.KEYCLOAK_ADMIN_USER || 'admin';
const REALM = 'dive-v3-broker';

async function getAdminPassword(): Promise<string> {
  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;
  if (adminPassword && adminPassword !== 'admin') {
    return adminPassword;
  }

  // Try GCP Secret Manager
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

async function deleteWebAuthnCredential(username: string) {
  console.log('\n🗑️  Delete WebAuthn Credential for Re-registration');
  console.log('================================================\n');
  console.log(`Keycloak URL: ${KEYCLOAK_URL}`);
  console.log(`Realm: ${REALM}`);
  console.log(`Username: ${username}\n`);

  // Step 1: Authenticate
  console.log('[1/4] Authenticating...');
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
  } catch (error: any) {
    console.error('❌ Authentication failed!');
    console.error('   Please provide admin password:');
    console.error(`   KEYCLOAK_ADMIN_PASSWORD=your-password npm run delete-webauthn -- --username ${username}\n`);
    process.exit(1);
  }

  // Step 2: Find user
  console.log(`[2/4] Finding user: ${username}...`);
  const usersResponse = await axios.get(
    `${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${encodeURIComponent(username)}&exact=true`,
    { headers: { 'Authorization': `Bearer ${adminToken}` } }
  );

  if (!usersResponse.data || usersResponse.data.length === 0) {
    console.error(`❌ ERROR: User "${username}" not found`);
    process.exit(1);
  }

  const user = usersResponse.data[0];
  console.log(`✅ Found user: ${user.username} (ID: ${user.id})\n`);

  // Step 3: Get WebAuthn credentials
  console.log('[3/4] Finding WebAuthn credentials...');
  const credentialsResponse = await axios.get(
    `${KEYCLOAK_URL}/admin/realms/${REALM}/users/${user.id}/credentials`,
    { headers: { 'Authorization': `Bearer ${adminToken}` } }
  );

  const credentials = credentialsResponse.data;
  const webauthnCredentials = credentials.filter((cred: any) => 
    cred.type === 'webauthn' || 
    cred.type === 'webauthn-passwordless' ||
    cred.type?.toLowerCase().includes('fido') ||
    cred.type?.toLowerCase().includes('webauthn')
  );

  if (webauthnCredentials.length === 0) {
    console.log('✅ No WebAuthn credentials found - ready for registration!\n');
    console.log('📋 Next Steps:');
    console.log('   1. Log out completely');
    console.log('   2. Log back in as admin-dive with username/password');
    console.log('   3. Register your YubiKey when prompted');
    console.log('   4. Test passkey authentication\n');
    return;
  }

  console.log(`Found ${webauthnCredentials.length} WebAuthn credential(s) to delete:\n`);
  webauthnCredentials.forEach((cred: any, idx: number) => {
    console.log(`  ${idx + 1}. ${cred.userLabel || 'Unlabeled'} (${cred.type}) - ID: ${cred.id}`);
  });
  console.log('');

  // Step 4: Delete credentials
  console.log('[4/4] Deleting credentials...');
  let deletedCount = 0;
  for (const cred of webauthnCredentials) {
    try {
      await axios.delete(
        `${KEYCLOAK_URL}/admin/realms/${REALM}/users/${user.id}/credentials/${cred.id}`,
        { headers: { 'Authorization': `Bearer ${adminToken}` } }
      );
      console.log(`  ✅ Deleted: ${cred.userLabel || 'Unlabeled'} (${cred.id})`);
      deletedCount++;
    } catch (error: any) {
      console.error(`  ❌ Failed to delete ${cred.id}: ${error.message}`);
    }
  }

  console.log(`\n✅ Successfully deleted ${deletedCount} credential(s)!\n`);

  // Verify deletion
  const verifyResponse = await axios.get(
    `${KEYCLOAK_URL}/admin/realms/${REALM}/users/${user.id}/credentials`,
    { headers: { 'Authorization': `Bearer ${adminToken}` } }
  );
  const remaining = verifyResponse.data.filter((cred: any) => 
    cred.type === 'webauthn' || cred.type === 'webauthn-passwordless'
  );

  if (remaining.length === 0) {
    console.log('✅ Verification: All WebAuthn credentials deleted\n');
  } else {
    console.log(`⚠️  Warning: ${remaining.length} credential(s) still remain\n`);
  }

  console.log('📋 NEXT STEPS - Re-register Your YubiKey:\n');
  console.log('1. Log out completely from the application');
  console.log('2. Log back in as admin-dive with username/password');
  console.log('3. When prompted, register your YubiKey:');
  console.log('   - Click "Register Security Key" or "Register Passkey"');
  console.log('   - Insert your YubiKey');
  console.log('   - Touch the YubiKey when prompted');
  console.log('   - Give it a label (e.g., "My YubiKey")');
  console.log('4. Complete the registration');
  console.log('5. Test passkey authentication:\n');
  console.log('   - Log out');
  console.log('   - Try logging in with passkey');
  console.log('   - Should work! ✅\n');
  console.log('💡 After re-registration, you should get ACR=2 (AAL3) automatically!\n');
}

// Parse args
const args = process.argv.slice(2);
const usernameIndex = args.indexOf('--username');
const username = usernameIndex >= 0 && args[usernameIndex + 1] ? args[usernameIndex + 1] : 'admin-dive';

deleteWebAuthnCredential(username).catch((error) => {
  console.error('❌ ERROR:', error.message);
  if (error.response?.data) {
    console.error('Response:', JSON.stringify(error.response.data, null, 2));
  }
  process.exit(1);
});









