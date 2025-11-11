import KcAdminClient from '@keycloak/keycloak-admin-client';
import 'dotenv/config';
import { logger } from '../utils/logger';

/**
 * Comprehensive WebAuthn Configuration Verification
 * 
 * This script verifies ALL aspects of WebAuthn/Passkey configuration
 * according to Keycloak best practices and troubleshooting guidelines.
 */

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'https://dev-auth.dive25.com';
const KEYCLOAK_PUBLIC_URL = process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'https://dev-auth.dive25.com';
const ADMIN_USER = process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';
const EXPECTED_RP_ID = 'dive25.com';

// Test realm
const TEST_REALM = 'dive-v3-pol';

interface WebAuthnPolicyCheck {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  value: any;
  expected?: any;
  message: string;
}

const checks: WebAuthnPolicyCheck[] = [];

/**
 * Initialize Keycloak Admin Client
 */
async function initializeAdminClient(): Promise<KcAdminClient> {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   DIVE V3 - Comprehensive WebAuthn Configuration Check   ║');
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
 * Check 1: Verify Passkeys are Enabled
 */
async function checkPasskeysEnabled(kcAdminClient: KcAdminClient): Promise<void> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('CHECK 1: Verify Passkeys are Enabled');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  kcAdminClient.setConfig({ realmName: TEST_REALM });
  const realm = await kcAdminClient.realms.findOne({ realm: TEST_REALM });

  // Check if WebAuthn policy exists
  if (realm.webAuthnPolicyRpEntityName) {
    checks.push({
      name: 'WebAuthn Policy Exists',
      status: 'PASS',
      value: realm.webAuthnPolicyRpEntityName,
      message: 'WebAuthn policy is configured',
    });
    console.log(`✓ WebAuthn Policy: ${realm.webAuthnPolicyRpEntityName}`);
  } else {
    checks.push({
      name: 'WebAuthn Policy Exists',
      status: 'FAIL',
      value: null,
      message: 'WebAuthn policy not found',
    });
    console.log('✗ WebAuthn Policy: NOT CONFIGURED');
  }
}

/**
 * Check 2: Verify Critical Policy Settings
 */
async function checkPolicySettings(kcAdminClient: KcAdminClient): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('CHECK 2: Verify Critical Policy Settings');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  kcAdminClient.setConfig({ realmName: TEST_REALM });
  const realm = await kcAdminClient.realms.findOne({ realm: TEST_REALM });

  // rpId Check (CRITICAL)
  console.log(`Relying Party ID (rpId): "${realm.webAuthnPolicyRpId}"`);
  if (!realm.webAuthnPolicyRpId || realm.webAuthnPolicyRpId === '') {
    checks.push({
      name: 'rpId',
      status: 'FAIL',
      value: realm.webAuthnPolicyRpId,
      expected: EXPECTED_RP_ID,
      message: 'rpId is empty - this will cause registration failures',
    });
    console.log('  ✗ FAIL: rpId is empty');
  } else if (realm.webAuthnPolicyRpId !== EXPECTED_RP_ID) {
    checks.push({
      name: 'rpId',
      status: 'WARN',
      value: realm.webAuthnPolicyRpId,
      expected: EXPECTED_RP_ID,
      message: `rpId mismatch - expected "${EXPECTED_RP_ID}"`,
    });
    console.log(`  ⚠ WARN: Expected "${EXPECTED_RP_ID}"`);
  } else {
    checks.push({
      name: 'rpId',
      status: 'PASS',
      value: realm.webAuthnPolicyRpId,
      expected: EXPECTED_RP_ID,
      message: 'rpId correctly configured',
    });
    console.log(`  ✓ PASS`);
  }

  // authenticatorAttachment Check
  console.log(`\nAuthenticator Attachment: "${realm.webAuthnPolicyAuthenticatorAttachment || 'not specified'}"`);
  const attachmentValue = realm.webAuthnPolicyAuthenticatorAttachment;
  
  // Empty string, undefined, or "not specified" is the best practice (allows all)
  if (!attachmentValue || attachmentValue === '' || attachmentValue === 'not specified') {
    checks.push({
      name: 'authenticatorAttachment',
      status: 'PASS',
      value: attachmentValue || 'not specified',
      expected: 'not specified (allows all)',
      message: 'Correctly allows both platform and cross-platform authenticators',
    });
    console.log('  ✓ PASS: Allows all authenticator types (best practice)');
  } else if (attachmentValue === 'platform' || attachmentValue === 'cross-platform') {
    checks.push({
      name: 'authenticatorAttachment',
      status: 'WARN',
      value: attachmentValue,
      expected: 'not specified (allows all)',
      message: 'Restricts authenticator types - may cause compatibility issues',
    });
    console.log(`  ⚠ WARN: Restricts to "${attachmentValue}" only`);
  } else {
    checks.push({
      name: 'authenticatorAttachment',
      status: 'WARN',
      value: attachmentValue,
      expected: 'not specified (allows all)',
      message: 'Unknown authenticator attachment value',
    });
    console.log(`  ⚠ WARN: Unknown value "${attachmentValue}"`);
  }

  // requireResidentKey Check
  console.log(`\nRequire Discoverable Credential: ${realm.webAuthnPolicyRequireResidentKey}`);
  checks.push({
    name: 'requireResidentKey',
    status: 'PASS',
    value: realm.webAuthnPolicyRequireResidentKey,
    message: `Set to "${realm.webAuthnPolicyRequireResidentKey}"`,
  });
  console.log(`  ✓ INFO: "${realm.webAuthnPolicyRequireResidentKey}"`);

  // userVerificationRequirement Check
  console.log(`\nUser Verification Requirement: ${realm.webAuthnPolicyUserVerificationRequirement}`);
  if (realm.webAuthnPolicyUserVerificationRequirement === 'required') {
    checks.push({
      name: 'userVerificationRequirement',
      status: 'PASS',
      value: realm.webAuthnPolicyUserVerificationRequirement,
      expected: 'required',
      message: 'User verification required (AAL3 compliant)',
    });
    console.log('  ✓ PASS: Required (best for security)');
  } else {
    checks.push({
      name: 'userVerificationRequirement',
      status: 'WARN',
      value: realm.webAuthnPolicyUserVerificationRequirement,
      expected: 'required',
      message: 'User verification not required (lower security)',
    });
    console.log(`  ⚠ WARN: Set to "${realm.webAuthnPolicyUserVerificationRequirement}"`);
  }

  // avoidSameAuthenticatorRegister Check
  console.log(`\nAvoid Same Authenticator Registration: ${realm.webAuthnPolicyAvoidSameAuthenticatorRegister}`);
  checks.push({
    name: 'avoidSameAuthenticatorRegister',
    status: 'PASS',
    value: realm.webAuthnPolicyAvoidSameAuthenticatorRegister,
    message: `Set to ${realm.webAuthnPolicyAvoidSameAuthenticatorRegister}`,
  });
  if (realm.webAuthnPolicyAvoidSameAuthenticatorRegister) {
    console.log('  ✓ INFO: Enabled (prevents duplicate registrations)');
  } else {
    console.log('  ✓ INFO: Disabled (allows re-registration)');
  }

  // Timeout Check
  console.log(`\nCreate Timeout: ${realm.webAuthnPolicyCreateTimeout} seconds`);
  if (realm.webAuthnPolicyCreateTimeout < 60) {
    checks.push({
      name: 'createTimeout',
      status: 'WARN',
      value: realm.webAuthnPolicyCreateTimeout,
      expected: '60+ seconds',
      message: 'Timeout may be too short for some authenticators',
    });
    console.log('  ⚠ WARN: Timeout may be too short (recommend 60+ seconds)');
  } else {
    checks.push({
      name: 'createTimeout',
      status: 'PASS',
      value: realm.webAuthnPolicyCreateTimeout,
      expected: '60+ seconds',
      message: 'Timeout is adequate',
    });
    console.log('  ✓ PASS: Adequate timeout');
  }
}

/**
 * Check 3: Verify Client Configuration
 */
async function checkClientConfiguration(kcAdminClient: KcAdminClient): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('CHECK 3: Verify Client Configuration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  kcAdminClient.setConfig({ realmName: TEST_REALM });
  const clients = await kcAdminClient.clients.find();
  
  const brokerClient = clients.find(c => c.clientId === 'dive-v3-broker-client');
  
  if (brokerClient) {
    console.log(`Client ID: ${brokerClient.clientId}`);
    console.log(`Base URL: ${brokerClient.baseUrl}`);
    console.log(`Root URL: ${brokerClient.rootUrl}`);
    
    // Check redirect URIs
    console.log('\nRedirect URIs:');
    brokerClient.redirectUris?.forEach(uri => {
      console.log(`  - ${uri}`);
      if (uri.includes('https://')) {
        checks.push({
          name: `Redirect URI: ${uri}`,
          status: 'PASS',
          value: uri,
          message: 'Uses HTTPS (required for WebAuthn)',
        });
      } else {
        checks.push({
          name: `Redirect URI: ${uri}`,
          status: 'WARN',
          value: uri,
          message: 'Not using HTTPS - WebAuthn requires HTTPS',
        });
      }
    });
    
    // Check URL consistency
    const expectedBaseUrl = KEYCLOAK_PUBLIC_URL;
    const expectedAppUrl = 'https://dev-app.dive25.com';
    
    // In federated architecture, client base URL points to the app, not auth server
    // This is CORRECT for OIDC clients that live on a different domain
    if (brokerClient.baseUrl?.includes('dev-app.dive25.com')) {
      checks.push({
        name: 'Client Base URL',
        status: 'PASS',
        value: brokerClient.baseUrl,
        expected: expectedAppUrl,
        message: 'Base URL correctly points to app domain (federated architecture)',
      });
      console.log('\n  ✓ PASS: Base URL correctly points to app domain (federated architecture)');
    } else if (brokerClient.baseUrl?.includes(expectedBaseUrl.replace('https://', ''))) {
      checks.push({
        name: 'Client Base URL',
        status: 'PASS',
        value: brokerClient.baseUrl,
        expected: expectedBaseUrl,
        message: 'Base URL matches Keycloak URL',
      });
      console.log('\n  ✓ PASS: Base URL matches Keycloak URL');
    } else {
      checks.push({
        name: 'Client Base URL',
        status: 'WARN',
        value: brokerClient.baseUrl,
        expected: `${expectedAppUrl} or ${expectedBaseUrl}`,
        message: 'Base URL does not match expected domains',
      });
      console.log('\n  ⚠ WARN: Base URL mismatch');
    }
  } else {
    checks.push({
      name: 'Broker Client',
      status: 'FAIL',
      value: null,
      message: 'dive-v3-broker-client not found',
    });
    console.log('✗ FAIL: Broker client not found');
  }
}

/**
 * Check 4: Verify Required Action Configuration
 */
async function checkRequiredActions(kcAdminClient: KcAdminClient): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('CHECK 4: Verify Required Action Configuration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  kcAdminClient.setConfig({ realmName: TEST_REALM });
  const requiredActions = await kcAdminClient.authenticationManagement.getRequiredActions();
  
  const webauthnAction = requiredActions.find(a => a.alias === 'webauthn-register');
  
  if (webauthnAction) {
    console.log(`Required Action: ${webauthnAction.alias}`);
    console.log(`  Name: ${webauthnAction.name}`);
    console.log(`  Enabled: ${webauthnAction.enabled}`);
    console.log(`  Default Action: ${webauthnAction.defaultAction}`);
    
    if (webauthnAction.enabled) {
      checks.push({
        name: 'WebAuthn Required Action Enabled',
        status: 'PASS',
        value: true,
        message: 'WebAuthn registration action is enabled',
      });
      console.log('\n  ✓ PASS: WebAuthn required action is enabled');
    } else {
      checks.push({
        name: 'WebAuthn Required Action Enabled',
        status: 'FAIL',
        value: false,
        message: 'WebAuthn registration action is disabled',
      });
      console.log('\n  ✗ FAIL: WebAuthn required action is disabled');
    }
  } else {
    checks.push({
      name: 'WebAuthn Required Action',
      status: 'FAIL',
      value: null,
      message: 'WebAuthn required action not found',
    });
    console.log('✗ FAIL: WebAuthn required action not found');
  }
}

/**
 * Check 5: Test User Configuration
 */
async function checkTestUserSetup(kcAdminClient: KcAdminClient): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('CHECK 5: Verify Test User Configuration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  kcAdminClient.setConfig({ realmName: TEST_REALM });
  const users = await kcAdminClient.users.find({ username: 'testuser-pol-ts' });
  
  if (users.length > 0) {
    const user = users[0];
    console.log(`Username: ${user.username}`);
    console.log(`Enabled: ${user.enabled}`);
    console.log(`Required Actions: ${user.requiredActions?.join(', ') || 'None'}`);
    
    if (user.requiredActions?.includes('webauthn-register')) {
      checks.push({
        name: 'Test User WebAuthn Required Action',
        status: 'PASS',
        value: user.requiredActions,
        message: 'User has webauthn-register required action',
      });
      console.log('\n  ✓ PASS: User has webauthn-register required action');
    } else {
      checks.push({
        name: 'Test User WebAuthn Required Action',
        status: 'WARN',
        value: user.requiredActions,
        message: 'User does not have webauthn-register required action',
      });
      console.log('\n  ⚠ WARN: User does not have webauthn-register required action');
    }
    
    // Check if user already has WebAuthn credentials
    const credentials = await kcAdminClient.users.getCredentials({ id: user.id! });
    const webauthnCreds = credentials.filter(c => c.type === 'webauthn');
    
    console.log(`\nExisting WebAuthn Credentials: ${webauthnCreds.length}`);
    if (webauthnCreds.length > 0) {
      webauthnCreds.forEach((cred, idx) => {
        console.log(`  ${idx + 1}. ${cred.userLabel || 'Unlabeled'} (Created: ${new Date(cred.createdDate!).toLocaleString()})`);
      });
      checks.push({
        name: 'Existing WebAuthn Credentials',
        status: 'PASS',
        value: webauthnCreds.length,
        message: `User has ${webauthnCreds.length} registered credential(s)`,
      });
    } else {
      checks.push({
        name: 'Existing WebAuthn Credentials',
        status: 'PASS',
        value: 0,
        message: 'No existing credentials (expected for first registration)',
      });
      console.log('  (None - ready for first registration)');
    }
  } else {
    checks.push({
      name: 'Test User',
      status: 'FAIL',
      value: null,
      message: 'testuser-pol-ts not found',
    });
    console.log('✗ FAIL: testuser-pol-ts not found');
  }
}

/**
 * Check 6: HTTPS and URL Configuration
 */
function checkHttpsConfiguration(): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('CHECK 6: HTTPS and URL Configuration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`Keycloak URL: ${KEYCLOAK_URL}`);
  console.log(`Public Keycloak URL: ${KEYCLOAK_PUBLIC_URL}`);
  
  if (KEYCLOAK_URL.startsWith('https://')) {
    checks.push({
      name: 'Keycloak HTTPS',
      status: 'PASS',
      value: KEYCLOAK_URL,
      message: 'Keycloak uses HTTPS (required for WebAuthn)',
    });
    console.log('  ✓ PASS: Keycloak uses HTTPS');
  } else {
    checks.push({
      name: 'Keycloak HTTPS',
      status: 'FAIL',
      value: KEYCLOAK_URL,
      message: 'Keycloak not using HTTPS - WebAuthn requires HTTPS',
    });
    console.log('  ✗ FAIL: Keycloak not using HTTPS');
  }
  
  if (KEYCLOAK_PUBLIC_URL.startsWith('https://')) {
    checks.push({
      name: 'Public Keycloak HTTPS',
      status: 'PASS',
      value: KEYCLOAK_PUBLIC_URL,
      message: 'Public URL uses HTTPS',
    });
    console.log('  ✓ PASS: Public URL uses HTTPS');
  } else {
    checks.push({
      name: 'Public Keycloak HTTPS',
      status: 'FAIL',
      value: KEYCLOAK_PUBLIC_URL,
      message: 'Public URL not using HTTPS',
    });
    console.log('  ✗ FAIL: Public URL not using HTTPS');
  }
}

/**
 * Print Summary Report
 */
function printSummary(): void {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                      SUMMARY REPORT                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const passCount = checks.filter(c => c.status === 'PASS').length;
  const warnCount = checks.filter(c => c.status === 'WARN').length;
  const failCount = checks.filter(c => c.status === 'FAIL').length;

  console.log(`Total Checks: ${checks.length}`);
  console.log(`✓ PASS: ${passCount}`);
  console.log(`⚠ WARN: ${warnCount}`);
  console.log(`✗ FAIL: ${failCount}\n`);

  if (failCount > 0) {
    console.log('CRITICAL ISSUES (MUST FIX):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    checks.filter(c => c.status === 'FAIL').forEach(check => {
      console.log(`✗ ${check.name}: ${check.message}`);
      console.log(`  Value: ${JSON.stringify(check.value)}`);
      if (check.expected) {
        console.log(`  Expected: ${JSON.stringify(check.expected)}`);
      }
      console.log('');
    });
  }

  if (warnCount > 0) {
    console.log('WARNINGS (SHOULD REVIEW):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    checks.filter(c => c.status === 'WARN').forEach(check => {
      console.log(`⚠ ${check.name}: ${check.message}`);
      console.log(`  Value: ${JSON.stringify(check.value)}`);
      if (check.expected) {
        console.log(`  Expected: ${JSON.stringify(check.expected)}`);
      }
      console.log('');
    });
  }

  if (failCount === 0 && warnCount === 0) {
    console.log('✅ ALL CHECKS PASSED!');
    console.log('\nYour WebAuthn/Passkey configuration follows Keycloak best practices.');
    console.log('\nIf you are still experiencing issues:');
    console.log('  1. Clear browser cache and cookies');
    console.log('  2. Logout from Keycloak completely');
    console.log('  3. Try in an incognito/private window');
    console.log('  4. Check browser console for JavaScript errors');
    console.log('  5. Verify device compatibility (iPhone/Android/Windows)');
    console.log('  6. Check Keycloak server logs with: docker logs keycloak');
  } else {
    console.log('\n⚠️  ACTION REQUIRED:');
    if (failCount > 0) {
      console.log('  1. Fix critical issues above');
      console.log('  2. Run: npm run fix-webauthn-rpid');
    }
    if (warnCount > 0) {
      console.log('  3. Review warnings and adjust configuration as needed');
    }
    console.log('  4. Re-run this script to verify: npm run check-webauthn-comprehensive');
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    const kcAdminClient = await initializeAdminClient();
    
    await checkPasskeysEnabled(kcAdminClient);
    await checkPolicySettings(kcAdminClient);
    await checkClientConfiguration(kcAdminClient);
    await checkRequiredActions(kcAdminClient);
    await checkTestUserSetup(kcAdminClient);
    checkHttpsConfiguration();
    
    printSummary();
    
    const failCount = checks.filter(c => c.status === 'FAIL').length;
    process.exit(failCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ ERROR during verification:', error);
    process.exit(1);
  }
}

main();

