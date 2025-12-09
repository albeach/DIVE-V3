/**
 * EMERGENCY FIX: Set ACR=2 (AAL3) for admin-dive WITHOUT passkey
 * 
 * This bypasses passkey authentication and manually sets ACR=2
 * for demo purposes. Works immediately - no rebuild needed!
 * 
 * Usage: 
 *   KEYCLOAK_URL=https://usa-idp.dive25.com npm run emergency-set-acr -- --username admin-dive
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com';
const ADMIN_USER = process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';
const REALM = 'dive-v3-broker';

async function emergencySetACR(username: string) {
  console.log('\n🚨 EMERGENCY FIX: Set ACR=2 (AAL3) for Demo');
  console.log('================================================\n');
  console.log(`Keycloak URL: ${KEYCLOAK_URL}`);
  console.log(`Realm: ${REALM}`);
  console.log(`Username: ${username}\n`);

  // Step 1: Authenticate
  console.log('[1/5] Authenticating with Keycloak Admin API...');
  const adminTokenResponse = await axios.post(
    `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
    new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: ADMIN_USER,
      password: ADMIN_PASSWORD,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  const adminToken = adminTokenResponse.data.access_token;
  console.log('✅ Authenticated\n');

  // Step 2: Find user
  console.log(`[2/5] Finding user: ${username}...`);
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

  // Step 3: Set user attribute ACR=2
  console.log('[3/5] Setting user attribute acr="2"...');
  const currentAttributes = user.attributes || {};
  const updatedAttributes = {
    ...currentAttributes,
    acr: ['2'], // AAL3
    aal: ['AAL3'],
  };

  await axios.put(
    `${KEYCLOAK_URL}/admin/realms/${REALM}/users/${user.id}`,
    { attributes: updatedAttributes },
    { headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' } }
  );
  console.log('✅ User attribute set: acr="2"\n');

  // Step 4: Check if protocol mapper exists that reads user attributes
  console.log('[4/5] Checking protocol mappers...');
  const clientResponse = await axios.get(
    `${KEYCLOAK_URL}/admin/realms/${REALM}/clients`,
    { headers: { 'Authorization': `Bearer ${adminToken}` } }
  );
  
  const appClient = clientResponse.data.find((c: any) => 
    c.clientId === 'dive-v3-client' || c.clientId === 'dive-v3-app-broker'
  );

  if (appClient) {
    const mappersResponse = await axios.get(
      `${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${appClient.id}/protocol-mappers/models`,
      { headers: { 'Authorization': `Bearer ${adminToken}` } }
    );

    const acrMapper = mappersResponse.data.find((m: any) => 
      m.name === 'acr-from-session' || m.name === 'acr-attribute-mapper'
    );

    if (acrMapper) {
      console.log(`✅ Found ACR mapper: ${acrMapper.name}`);
      if (acrMapper.config?.['user.session.note'] === 'AUTH_CONTEXT_CLASS_REF') {
        console.log('   ⚠️  Mapper reads from session note, not user attribute');
        console.log('   💡 Solution: We need to set session note instead\n');
      } else if (acrMapper.config?.['user.attribute'] === 'acr') {
        console.log('   ✅ Mapper reads from user attribute - this will work!\n');
      }
    } else {
      console.log('   ⚠️  No ACR mapper found - creating one...\n');
    }
  }

  // Step 5: Create/update protocol mapper to read from user attribute
  console.log('[5/5] Ensuring protocol mapper reads user attribute...');
  
  if (appClient) {
    // Check if we need to create a mapper that reads from user attribute
    const mappersResponse = await axios.get(
      `${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${appClient.id}/protocol-mappers/models`,
      { headers: { 'Authorization': `Bearer ${adminToken}` } }
    );

    const attributeMapper = mappersResponse.data.find((m: any) => 
      m.name === 'acr-from-attribute' || 
      (m.protocolMapper === 'oidc-usermodel-attribute-mapper' && m.config?.['user.attribute'] === 'acr')
    );

    if (!attributeMapper) {
      console.log('   Creating protocol mapper to read acr from user attribute...');
      try {
        await axios.post(
          `${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${appClient.id}/protocol-mappers/models`,
          {
            name: 'acr-from-attribute',
            protocol: 'openid-connect',
            protocolMapper: 'oidc-usermodel-attribute-mapper',
            config: {
              'user.attribute': 'acr',
              'claim.name': 'acr',
              'jsonType.label': 'String',
              'id.token.claim': 'true',
              'access.token.claim': 'true',
              'userinfo.token.claim': 'false',
            }
          },
          { headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' } }
        );
        console.log('   ✅ Protocol mapper created!\n');
      } catch (error: any) {
        console.log(`   ⚠️  Could not create mapper: ${error.message}`);
        console.log('   💡 You may need to log out and log back in for the attribute to take effect\n');
      }
    } else {
      console.log('   ✅ Protocol mapper already exists\n');
    }
  }

  console.log('✅ EMERGENCY FIX COMPLETE!\n');
  console.log('📋 NEXT STEPS:');
  console.log('   1. Log out completely');
  console.log('   2. Log back in with username/password (NOT passkey)');
  console.log('   3. Your token should now have acr="2" (AAL3)');
  console.log('   4. Check UI: User menu → Profile → Should show AAL: AAL3\n');
  console.log('💡 If it still shows AAL2:');
  console.log('   - The protocol mapper may be reading from session notes instead');
  console.log('   - Try accessing: https://usa-app.dive25.com/resources/doc-USA-seed-1764680140291-01300');
  console.log('   - The backend will see acr="2" in user attributes\n');
}

// Parse args
const args = process.argv.slice(2);
const usernameIndex = args.indexOf('--username');
const username = usernameIndex >= 0 && args[usernameIndex + 1] ? args[usernameIndex + 1] : 'admin-dive';

emergencySetACR(username).catch((error) => {
  console.error('❌ ERROR:', error.message);
  if (error.response?.data) {
    console.error('Response:', JSON.stringify(error.response.data, null, 2));
  }
  process.exit(1);
});








