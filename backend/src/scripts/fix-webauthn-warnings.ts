import KcAdminClient from '@keycloak/keycloak-admin-client';
import 'dotenv/config';
import { logger } from '../utils/logger';

/**
 * Fix WebAuthn Configuration Warnings
 * 
 * This script fixes the remaining warnings from the comprehensive check:
 * 1. Remove empty redirect URI
 * 2. Ensure client configuration consistency
 */

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'https://dev-auth.dive25.com';
const ADMIN_USER = process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

// All realms with broker clients
const REALMS = [
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
  'dive-v3-broker',
];

/**
 * Initialize Keycloak Admin Client
 */
async function initializeAdminClient(): Promise<KcAdminClient> {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     DIVE V3 - Fix WebAuthn Configuration Warnings        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  const kcAdminClient = new KcAdminClient({
    baseUrl: KEYCLOAK_URL,
    realmName: 'master',
  });

  await kcAdminClient.auth({
    username: ADMIN_USER,
    password: ADMIN_PASSWORD,
    grantType: 'password',
    clientId: 'admin-cli',
  });

  console.log(`✓ Authenticated with Keycloak Admin API\n`);
  return kcAdminClient;
}

/**
 * Fix client redirect URIs (remove empty strings)
 */
async function fixClientRedirectUris(kcAdminClient: KcAdminClient, realm: string): Promise<void> {
  console.log(`\nProcessing realm: ${realm}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  kcAdminClient.setConfig({ realmName: realm });
  const clients = await kcAdminClient.clients.find();
  
  const brokerClient = clients.find(c => c.clientId === 'dive-v3-broker-client');
  
  if (!brokerClient) {
    console.log(`  ⚠️  No broker client found, skipping...`);
    return;
  }

  console.log(`\n  Client: ${brokerClient.clientId}`);
  console.log(`  Current Redirect URIs: ${brokerClient.redirectUris?.length || 0}`);
  
  // Filter out empty strings and undefined values
  const cleanedUris = (brokerClient.redirectUris || [])
    .filter(uri => uri && uri.trim() !== '');
  
  console.log(`  Before: ${JSON.stringify(brokerClient.redirectUris)}`);
  console.log(`  After:  ${JSON.stringify(cleanedUris)}`);
  
  if (cleanedUris.length !== brokerClient.redirectUris?.length) {
    // Update the client with cleaned URIs
    await kcAdminClient.clients.update(
      { id: brokerClient.id! },
      {
        ...brokerClient,
        redirectUris: cleanedUris,
      }
    );
    console.log(`  ✓ Fixed: Removed ${(brokerClient.redirectUris?.length || 0) - cleanedUris.length} empty redirect URI(s)`);
  } else {
    console.log(`  ✓ No empty redirect URIs found`);
  }
  
  // Also check and fix webOrigins
  const cleanedOrigins = (brokerClient.webOrigins || [])
    .filter(origin => origin && origin.trim() !== '');
  
  if (cleanedOrigins.length !== brokerClient.webOrigins?.length) {
    await kcAdminClient.clients.update(
      { id: brokerClient.id! },
      {
        ...brokerClient,
        redirectUris: cleanedUris,
        webOrigins: cleanedOrigins,
      }
    );
    console.log(`  ✓ Fixed: Removed ${(brokerClient.webOrigins?.length || 0) - cleanedOrigins.length} empty web origin(s)`);
  }
}

/**
 * Verify and document client URL configuration
 */
async function verifyClientConfiguration(kcAdminClient: KcAdminClient, realm: string): Promise<void> {
  kcAdminClient.setConfig({ realmName: realm });
  const clients = await kcAdminClient.clients.find();
  
  const brokerClient = clients.find(c => c.clientId === 'dive-v3-broker-client');
  
  if (!brokerClient) {
    return;
  }

  console.log(`\n  Final Configuration:`);
  console.log(`  ├─ Base URL: ${brokerClient.baseUrl || '(not set)'}`);
  console.log(`  ├─ Root URL: ${brokerClient.rootUrl || '(not set)'}`);
  console.log(`  ├─ Redirect URIs (${brokerClient.redirectUris?.length || 0}):`);
  brokerClient.redirectUris?.forEach((uri, idx) => {
    console.log(`  │  ${idx + 1}. ${uri}`);
  });
  console.log(`  └─ Web Origins (${brokerClient.webOrigins?.length || 0}):`);
  brokerClient.webOrigins?.forEach((origin, idx) => {
    console.log(`     ${idx + 1}. ${origin}`);
  });
}

/**
 * Verify hostname configuration in realm
 */
async function verifyRealmHostnameConfig(kcAdminClient: KcAdminClient): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Verifying Realm Hostname Configuration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  kcAdminClient.setConfig({ realmName: 'dive-v3-pol' });
  const realm = await kcAdminClient.realms.findOne({ realm: 'dive-v3-pol' });
  
  console.log(`Realm: ${realm.realm}`);
  console.log(`Display Name: ${realm.displayName}`);
  
  // Check various hostname-related attributes
  const attributes = realm.attributes || {};
  console.log(`\nRealm Attributes:`);
  console.log(`  frontendUrl: ${attributes.frontendUrl || '(not set)'}`);
  console.log(`  hostname: ${attributes.hostname || '(not set)'}`);
  console.log(`  hostnameStrict: ${attributes.hostnameStrict || '(not set)'}`);
  
  if (attributes.frontendUrl) {
    console.log(`\n  ℹ️  Note: frontendUrl is set, which may override client base URLs`);
  } else {
    console.log(`\n  ✓ frontendUrl not set (using default Keycloak base URL)`);
  }
}

/**
 * Check for hostname-related issues in server logs
 */
function printHostnameDebuggingHelp(): void {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║           Hostname Debugging Information                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  console.log('Understanding Client URL Configuration:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('1. Base URL vs Root URL:');
  console.log('   - Base URL: Used for relative paths in OIDC/SAML endpoints');
  console.log('   - Root URL: Used as fallback if base URL is not set');
  console.log('   ✓ In federated architecture, these can be different domains\n');
  
  console.log('2. Federated Architecture (DIVE V3):');
  console.log('   - Auth Server: https://dev-auth.dive25.com (Keycloak)');
  console.log('   - App Server:  https://dev-app.dive25.com (Next.js frontend)');
  console.log('   ✓ This is CORRECT and expected for federation\n');
  
  console.log('3. WebAuthn rpId:');
  console.log('   - rpId: "dive25.com" (parent domain)');
  console.log('   - Scope: Covers both dev-auth.dive25.com and dev-app.dive25.com');
  console.log('   ✓ This allows passkeys to work across subdomains\n');
  
  console.log('4. Redirect URIs:');
  console.log('   - Must use HTTPS (WebAuthn requirement)');
  console.log('   - Must point to Keycloak broker endpoints');
  console.log('   - Empty strings are removed automatically\n');
  
  console.log('To enable debug mode for hostname issues:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  docker exec keycloak /opt/keycloak/bin/kc.sh start \\');
  console.log('    --hostname-debug=true \\');
  console.log('    --log-level=DEBUG\n');
  
  console.log('To check Keycloak logs:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  docker logs keycloak 2>&1 | grep -E "hostname|rpId|webauthn" -i\n');
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    const kcAdminClient = await initializeAdminClient();
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Step 1: Fixing Client Redirect URIs');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    for (const realm of REALMS) {
      await fixClientRedirectUris(kcAdminClient, realm);
    }
    
    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Step 2: Verifying Test Realm Configuration');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    await verifyClientConfiguration(kcAdminClient, 'dive-v3-pol');
    
    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Step 3: Checking Realm Hostname Configuration');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    await verifyRealmHostnameConfig(kcAdminClient);
    
    printHostnameDebuggingHelp();
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ ALL FIXES APPLIED                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    console.log('Next Steps:');
    console.log('  1. Run: npm run check-webauthn-comprehensive');
    console.log('  2. Verify all warnings are resolved');
    console.log('  3. Test WebAuthn registration with testuser-usa-4 (TOP_SECRET)\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERROR:', error);
    process.exit(1);
  }
}

main();




