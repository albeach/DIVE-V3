import KcAdminClient from '@keycloak/keycloak-admin-client';
import dotenv from 'dotenv';

dotenv.config();

async function clearKeycloakSessions() {
  console.log('\n================================================');
  console.log('  Clear Keycloak Sessions - All Realms');
  console.log('================================================\n');

  const kcAdminClient = new KcAdminClient({
    baseUrl: process.env.KEYCLOAK_URL || 'https://dev-auth.dive25.com',
    realmName: 'master',
  });

  await kcAdminClient.auth({
    username: process.env.KEYCLOAK_ADMIN_USERNAME || 'admin',
    password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
    grantType: 'password',
    clientId: 'admin-cli',
  });

  console.log('[INFO] Authenticated with Keycloak Admin API\n');

  const realms = [
    'dive-v3-usa',
    'dive-v3-fra',
    'dive-v3-can',
    'dive-v3-deu',
    'dive-v3-gbr',
    'dive-v3-ita',
    'dive-v3-esp',
    'dive-v3-pol',
    'dive-v3-nld',
    'dive-v3-industry',
    'dive-v3-broker-usa',
  ];

  let successCount = 0;
  let failureCount = 0;

  for (const realmName of realms) {
    try {
      kcAdminClient.setConfig({ realmName });

      // Delete all sessions in the realm
      await kcAdminClient.realms.logoutAll({ realm: realmName });

      console.log(`[INFO] ✅ Cleared sessions for realm: ${realmName}`);
      successCount++;
    } catch (error) {
      console.error(`[ERROR] ❌ Failed to clear sessions for realm: ${realmName}`);
      if (error instanceof Error) {
        console.error(`[ERROR] ${error.message}`);
      }
      failureCount++;
    }
  }

  console.log('\n================================================');
  console.log('  Summary');
  console.log('================================================');
  console.log(`✅ Successfully cleared: ${successCount} realms`);
  console.log(`❌ Failed: ${failureCount} realms\n`);

  if (failureCount === 0) {
    console.log('[INFO] All sessions cleared successfully!');
    console.log('[INFO]');
    console.log('[INFO] Next steps:');
    console.log('[INFO] 1. Clear your browser cache and cookies');
    console.log('[INFO] 2. Open an incognito/private window');
    console.log('[INFO] 3. Navigate to https://dev-app.dive25.com');
    console.log('[INFO] 4. Login as testuser-usa-4 (TOP_SECRET)');
    console.log('[INFO] 5. WebAuthn registration should work without errors\n');
  }
}

clearKeycloakSessions().catch(console.error);
