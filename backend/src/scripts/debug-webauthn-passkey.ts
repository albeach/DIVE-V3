/**
 * DEBUG: Diagnose WebAuthn/Passkey Issues
 *
 * This script helps debug "Unknown user authenticated by the Passkey" errors
 * by checking:
 * 1. WebAuthn credentials registered for the user
 * 2. RP ID configuration
 * 3. UserHandle in credentials
 * 4. Realm configuration
 *
 * Usage:
 *   KEYCLOAK_URL=https://usa-idp.dive25.com npm run debug-webauthn -- --username admin-dive
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import dotenv from 'dotenv';
import axios from 'axios';
import { execSync } from 'child_process';

dotenv.config();

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'https://usa-idp.dive25.com';
const ADMIN_USER = process.env.KEYCLOAK_ADMIN_USERNAME || process.env.KEYCLOAK_ADMIN_USER || 'admin';
let ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';
const REALM = 'dive-v3-broker';

// Try to get password from GCP Secret Manager if not set
async function getAdminPassword(): Promise<string> {
  if (ADMIN_PASSWORD && ADMIN_PASSWORD !== 'admin') {
    return ADMIN_PASSWORD;
  }

  // Try GCP Secret Manager
  try {
    const secretName = 'dive-v3-keycloak-usa';
    const result = execSync(`gcloud secrets versions access latest --secret=${secretName} --project=dive25 2>/dev/null`, { encoding: 'utf-8' });
    if (result.trim()) {
      console.log('✅ Using password from GCP Secret Manager\n');
      return result.trim();
    }
  } catch (error) {
    // GCP not available or secret doesn't exist
  }

  // Fallback to environment or default
  return ADMIN_PASSWORD;
}

async function debugWebAuthn(username: string) {
  console.log('\n🔍 DEBUG: WebAuthn/Passkey Diagnostics');
  console.log('================================================\n');
  console.log(`Keycloak URL: ${KEYCLOAK_URL}`);
  console.log(`Realm: ${REALM}`);
  console.log(`Username: ${username}\n`);

  // Step 1: Get admin password
  const adminPassword = await getAdminPassword();

  // Step 2: Authenticate
  console.log('[1/6] Authenticating...');
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
    if (error.response?.status === 401) {
      console.error('❌ Authentication failed!');
      console.error('   Please provide the correct admin password:');
      console.error(`   KEYCLOAK_ADMIN_PASSWORD=your-password npm run debug-webauthn -- --username ${username}`);
      console.error('   Or ensure gcloud is authenticated and secret exists:');
      console.error('   gcloud secrets versions access latest --secret=dive-v3-keycloak-usa --project=dive25\n');
      process.exit(1);
    }
    throw error;
  }

  // Step 2: Find user
  console.log(`[2/6] Finding user: ${username}...`);
  const usersResponse = await axios.get(
    `${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${encodeURIComponent(username)}&exact=true`,
    { headers: { 'Authorization': `Bearer ${adminToken}` } }
  );

  if (!usersResponse.data || usersResponse.data.length === 0) {
    console.error(`❌ ERROR: User "${username}" not found`);
    process.exit(1);
  }

  const user = usersResponse.data[0];
  console.log(`✅ Found user: ${user.username}`);
  console.log(`   User ID: ${user.id}`);
  console.log(`   Email: ${user.email || 'N/A'}\n`);

  // Step 3: Get WebAuthn credentials
  console.log('[3/6] Checking WebAuthn credentials...');
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

  console.log(`Found ${webauthnCredentials.length} WebAuthn credential(s):\n`);

  if (webauthnCredentials.length === 0) {
    console.log('❌ No WebAuthn credentials found!');
    console.log('   The user needs to register a passkey first.\n');
  } else {
    webauthnCredentials.forEach((cred: any, idx: number) => {
      console.log(`Credential ${idx + 1}:`);
      console.log(`  ID: ${cred.id}`);
      console.log(`  Type: ${cred.type}`);
      console.log(`  Label: ${cred.userLabel || '(no label)'}`);
      console.log(`  Created: ${cred.createdDate ? new Date(cred.createdDate).toISOString() : 'unknown'}`);
      console.log(`  Counter: ${cred.counter || 'N/A'}`);

      // Parse credential data to check userHandle
      if (cred.credentialData) {
        try {
          const credData = JSON.parse(cred.credentialData);
          console.log(`  Credential Data Structure:`);
          console.log(`    Keys: ${Object.keys(credData).join(', ')}`);

          // Try different possible locations for userHandle
          let userHandle: string | undefined;
          let userHandleHex: string | undefined;

          if (credData.userHandle) {
            userHandle = credData.userHandle;
          } else if (credData.user) {
            userHandle = typeof credData.user === 'string' ? credData.user : credData.user.id;
          } else if (credData.publicKeyCredentialUserEntity) {
            userHandle = credData.publicKeyCredentialUserEntity.id;
          }

          if (userHandle) {
            try {
              // Try base64url decode
              userHandleHex = Buffer.from(userHandle, 'base64url').toString('hex');
            } catch {
              try {
                // Try base64 decode
                userHandleHex = Buffer.from(userHandle, 'base64').toString('hex');
              } catch {
                // Try as hex string directly
                userHandleHex = userHandle;
              }
            }
          }

          const expectedUserIdHex = Buffer.from(user.id!, 'utf8').toString('hex');

          console.log(`    User Handle (raw): ${userHandle || 'N/A'}`);
          console.log(`    User Handle (hex): ${userHandleHex || 'N/A'}`);
          console.log(`    Expected User ID (hex): ${expectedUserIdHex}`);

          // Check if userHandle matches user ID
          if (userHandleHex && expectedUserIdHex) {
            const match = userHandleHex.toLowerCase() === expectedUserIdHex.toLowerCase();
            console.log(`    ✅ UserHandle Match: ${match ? 'YES' : 'NO ❌'}`);
            if (!match) {
              console.log(`    ⚠️  MISMATCH: Credential userHandle doesn't match current user ID!`);
              console.log(`       Credential was registered for a different user ID.`);
              console.log(`       This is causing "Unknown user" error.`);
              console.log(`       Solution: Delete this credential and re-register.`);
            }
          } else {
            console.log(`    ⚠️  Could not extract userHandle from credential data`);
            console.log(`    Raw credential data structure:`);
            console.log(`    ${JSON.stringify(credData, null, 2).substring(0, 500)}...`);
          }
        } catch (e) {
          console.log(`  Credential Data: (parse error: ${e})`);
          console.log(`  Raw: ${cred.credentialData.substring(0, 500)}...`);
        }
      } else {
        console.log(`  ⚠️  No credential data found`);
      }
      console.log('');
    });
  }

  // Step 4: Check Realm WebAuthn Policy
  console.log('[4/6] Checking Realm WebAuthn Policy...');
  const realmResponse = await axios.get(
    `${KEYCLOAK_URL}/admin/realms/${REALM}`,
    { headers: { 'Authorization': `Bearer ${adminToken}` } }
  );
  const realm = realmResponse.data;

  console.log('WebAuthn Policy:');
  console.log(`  RP Entity Name: ${realm.webAuthnPolicyRpEntityName || 'N/A'}`);
  console.log(`  RP ID: ${realm.webAuthnPolicyRpId || 'N/A'} ⚠️`);
  console.log(`  User Verification: ${realm.webAuthnPolicyUserVerificationRequirement || 'N/A'}`);
  console.log(`  Require Resident Key: ${realm.webAuthnPolicyRequireResidentKey || 'N/A'}`);
  console.log(`  Authenticator Attachment: ${realm.webAuthnPolicyAuthenticatorAttachment || 'N/A'}`);
  console.log('');

  console.log('WebAuthn Passwordless Policy:');
  console.log(`  RP Entity Name: ${realm.webAuthnPolicyPasswordlessRpEntityName || 'N/A'}`);
  console.log(`  RP ID: ${realm.webAuthnPolicyPasswordlessRpId || 'N/A'} ⚠️`);
  console.log(`  User Verification: ${realm.webAuthnPolicyPasswordlessUserVerificationRequirement || 'N/A'}`);
  console.log(`  Require Resident Key: ${realm.webAuthnPolicyPasswordlessRequireResidentKey || 'N/A'}`);
  console.log('');

  // Step 5: Check if RP ID matches expected value
  console.log('[5/6] Checking RP ID Configuration...');
  const expectedRpId = 'dive25.com';
  const actualRpId = realm.webAuthnPolicyRpId || realm.webAuthnPolicyPasswordlessRpId;

  if (actualRpId === expectedRpId) {
    console.log(`✅ RP ID is correct: "${actualRpId}"`);
  } else {
    console.log(`❌ RP ID MISMATCH!`);
    console.log(`   Expected: "${expectedRpId}"`);
    console.log(`   Actual: "${actualRpId || 'NOT SET'}"`);
    console.log(`   ⚠️  This will cause passkey authentication to fail!`);
  }
  console.log('');

  // Step 6: Recommendations
  console.log('[6/6] Recommendations:\n');

  if (webauthnCredentials.length === 0) {
    console.log('1. Register a new passkey:');
    console.log('   - Log in with username/password');
    console.log('   - Go to Security → Register Passkey');
    console.log('   - Follow the prompts\n');
  } else {
    const hasMismatch = webauthnCredentials.some((cred: any) => {
      try {
        const credData = JSON.parse(cred.credentialData);
        if (credData.userHandle) {
          const userHandleBytes = Buffer.from(credData.userHandle, 'base64url');
          const userIdBytes = Buffer.from(user.id!, 'utf8');
          return !userHandleBytes.equals(userIdBytes);
        }
      } catch {}
      return false;
    });

    if (hasMismatch || actualRpId !== expectedRpId) {
      console.log('1. DELETE existing credentials and re-register:');
      console.log('   - Delete all WebAuthn credentials for this user');
      console.log('   - Ensure RP ID is set to "dive25.com"');
      console.log('   - Register a new passkey\n');
      console.log('2. To delete credentials, run:');
      console.log(`   npm run check-webauthn-credentials -- --username ${username} --delete\n`);
    } else {
      console.log('✅ Credentials look good!');
      console.log('   If authentication still fails, check:');
      console.log('   - Browser console for WebAuthn errors');
      console.log('   - Keycloak server logs');
      console.log('   - Network tab for authentication requests\n');
    }
  }

  console.log('🔍 Debug complete!\n');
}

// Parse args
const args = process.argv.slice(2);
const usernameIndex = args.indexOf('--username');
const username = usernameIndex >= 0 && args[usernameIndex + 1] ? args[usernameIndex + 1] : 'admin-dive';

debugWebAuthn(username).catch((error) => {
  console.error('❌ ERROR:', error.message);
  if (error.response?.data) {
    console.error('Response:', JSON.stringify(error.response.data, null, 2));
  }
  process.exit(1);
});
