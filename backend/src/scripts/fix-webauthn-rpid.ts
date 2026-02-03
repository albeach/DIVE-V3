/**
 * Fix WebAuthn Relying Party ID Configuration
 *
 * This script configures the WebAuthn Policy for all realms using the Keycloak Admin REST API
 *
 * Problem: Empty rpId causes internal server errors on production domains
 * Solution: Set rpId to 'dive25.com' (the effective domain)
 *
 * Reference: https://www.keycloak.org/docs/latest/server_admin/#webauthn_server_administration_guide
 * Keycloak docs: "The ID must be the origin's effective domain"
 *
 * Usage: npm run fix-webauthn-rpid
 *
 * Version: 1.0.0
 * Author: DIVE V3 Team
 * Date: November 10, 2025
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'https://keycloak:8443';
const KEYCLOAK_PUBLIC_URL = process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'https://dev-auth.dive25.com';
const ADMIN_USER = process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

// WebAuthn Relying Party ID
// For production: use the effective domain (dive25.com)
// For localhost: leave empty string ("")
const RP_ID = process.env.WEBAUTHN_RP_ID || 'dive25.com';

// List of all realms that need WebAuthn configuration
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

// WebAuthn Policy configuration (AAL3 compliant + YubiKey compatible)
// CRITICAL FIXES:
// 1. userVerification set to 'preferred' instead of 'required' - improves compatibility
// 2. requireResidentKey set to 'No' - YubiKeys don't support discoverable credentials (resident keys)
//    They use server-side credential storage instead
// Based on Stack Overflow reports, 'required' causes NotAllowedError/timeout on many devices
// YubiKey compatibility: https://developers.yubico.com/WebAuthn/WebAuthn_Developer_Guide/Resident_Keys.html
const WEBAUTHN_POLICY = {
  rpEntityName: 'DIVE V3 Coalition Platform',
  rpId: RP_ID,
  signatureAlgorithms: ['ES256', 'RS256'],
  attestationConveyancePreference: 'none',
  authenticatorAttachment: '', // Empty = allow both platform (TouchID/FaceID) and cross-platform (Yubikey)
  requireResidentKey: 'No', // CRITICAL: Set to "No" for YubiKey compatibility (YubiKeys use server-side storage, not resident keys)
  userVerificationRequirement: 'preferred', // CRITICAL FIX: 'preferred' instead of 'required' for cross-device compatibility!
  createTimeout: 300,
  avoidSameAuthenticatorRegister: false,
  acceptableAaguids: [],
};

/**
 * Initialize Keycloak Admin Client
 */
async function initializeAdminClient(): Promise<KcAdminClient> {
  console.log('\n================================================');
  console.log('  DIVE V3 - WebAuthn Policy Configuration Fix  ');
  console.log('================================================\n');
  console.log(`Keycloak URL: ${KEYCLOAK_URL}`);
  console.log(`Relying Party ID: ${RP_ID}`);
  console.log(`Realms to configure: ${REALMS.length}\n`);

  const kcAdminClient = new KcAdminClient({
    baseUrl: KEYCLOAK_URL,
    realmName: 'master',
  });

  // Authenticate with admin credentials
  console.log('[INFO] Authenticating with Keycloak Admin API...');
  await kcAdminClient.auth({
    username: ADMIN_USER,
    password: ADMIN_PASSWORD,
    grantType: 'password',
    clientId: 'admin-cli',
  });

  console.log('[INFO] Successfully authenticated as admin\n');

  return kcAdminClient;
}

/**
 * Configure WebAuthn Policy for a specific realm
 * CRITICAL: Updates BOTH WebAuthn Policy AND WebAuthn Passwordless Policy
 * Keycloak uses different policies for different scenarios!
 */
async function configureWebAuthnPolicy(
  kcAdminClient: KcAdminClient,
  realmName: string
): Promise<boolean> {
  console.log(`[INFO] Configuring WebAuthn Policies for realm: ${realmName}`);

  try {
    // Set the realm context
    kcAdminClient.setConfig({ realmName });

    // Update BOTH WebAuthn Policy AND WebAuthn Passwordless Policy
    // Keycloak uses different policies depending on the authentication scenario:
    // - webAuthnPolicy* = for 2FA (webauthn-register)
    // - webAuthnPolicyPasswordless* = for passwordless (webauthn-register-passwordless)
    await kcAdminClient.realms.update(
      { realm: realmName },
      {
        // Standard WebAuthn Policy (2FA)
        webAuthnPolicyRpEntityName: WEBAUTHN_POLICY.rpEntityName,
        webAuthnPolicyRpId: WEBAUTHN_POLICY.rpId,
        webAuthnPolicySignatureAlgorithms: WEBAUTHN_POLICY.signatureAlgorithms,
        webAuthnPolicyAttestationConveyancePreference: WEBAUTHN_POLICY.attestationConveyancePreference,
        webAuthnPolicyAuthenticatorAttachment: WEBAUTHN_POLICY.authenticatorAttachment,
        webAuthnPolicyRequireResidentKey: WEBAUTHN_POLICY.requireResidentKey,
        webAuthnPolicyUserVerificationRequirement: WEBAUTHN_POLICY.userVerificationRequirement,
        webAuthnPolicyCreateTimeout: WEBAUTHN_POLICY.createTimeout,
        webAuthnPolicyAvoidSameAuthenticatorRegister: WEBAUTHN_POLICY.avoidSameAuthenticatorRegister,
        webAuthnPolicyAcceptableAaguids: WEBAUTHN_POLICY.acceptableAaguids,

        // WebAuthn Passwordless Policy (SAME SETTINGS!)
        webAuthnPolicyPasswordlessRpEntityName: WEBAUTHN_POLICY.rpEntityName,
        webAuthnPolicyPasswordlessRpId: WEBAUTHN_POLICY.rpId,
        webAuthnPolicyPasswordlessSignatureAlgorithms: WEBAUTHN_POLICY.signatureAlgorithms,
        webAuthnPolicyPasswordlessAttestationConveyancePreference: WEBAUTHN_POLICY.attestationConveyancePreference,
        webAuthnPolicyPasswordlessAuthenticatorAttachment: WEBAUTHN_POLICY.authenticatorAttachment,
        webAuthnPolicyPasswordlessRequireResidentKey: WEBAUTHN_POLICY.requireResidentKey,
        webAuthnPolicyPasswordlessUserVerificationRequirement: WEBAUTHN_POLICY.userVerificationRequirement,
        webAuthnPolicyPasswordlessCreateTimeout: WEBAUTHN_POLICY.createTimeout,
        webAuthnPolicyPasswordlessAvoidSameAuthenticatorRegister: WEBAUTHN_POLICY.avoidSameAuthenticatorRegister,
        webAuthnPolicyPasswordlessAcceptableAaguids: WEBAUTHN_POLICY.acceptableAaguids,
      } as any
    );

    console.log(`[INFO] ✅ Successfully configured BOTH WebAuthn Policies for ${realmName}`);
    console.log(`[INFO]    - WebAuthn Policy (2FA): userVerification=${WEBAUTHN_POLICY.userVerificationRequirement}`);
    console.log(`[INFO]    - WebAuthn Passwordless Policy: userVerification=${WEBAUTHN_POLICY.userVerificationRequirement}\n`);
    return true;
  } catch (error) {
    console.error(`[ERROR] ❌ Failed to configure WebAuthn Policies for ${realmName}`);
    if (error instanceof Error) {
      console.error(`[ERROR] ${error.message}\n`);
    } else {
      console.error(`[ERROR] ${String(error)}\n`);
    }
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Initialize admin client
    const kcAdminClient = await initializeAdminClient();

    // Configure WebAuthn policy for each realm
    let successCount = 0;
    let failureCount = 0;

    for (const realm of REALMS) {
      const success = await configureWebAuthnPolicy(kcAdminClient, realm);
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    // Summary
    console.log('================================================');
    console.log('  Configuration Summary');
    console.log('================================================');
    console.log(`✅ Successfully configured: ${successCount} realms`);
    console.log(`❌ Failed: ${failureCount} realms\n`);

    if (failureCount === 0) {
      console.log('[INFO] All realms configured successfully!');
      console.log('[INFO]');
      console.log('[INFO] Next steps:');
      console.log('[INFO] 1. Test TOP_SECRET user login: testuser-usa-4');
      console.log('[INFO] 2. You should now see the WebAuthn registration page');
      console.log('[INFO] 3. Register a passkey (e.g., 1Password, YubiKey, Windows Hello)');
      console.log('[INFO] 4. Complete authentication to access the application\n');
      process.exit(0);
    } else {
      console.error('[ERROR] Some realms failed to configure. Review the errors above.');
      process.exit(1);
    }
  } catch (error) {
    console.error('[ERROR] Fatal error occurred:');
    if (error instanceof Error) {
      console.error(`[ERROR] ${error.message}`);
      console.error(`[ERROR] ${error.stack}`);
    } else {
      console.error(`[ERROR] ${String(error)}`);
    }
    process.exit(1);
  }
}

// Run main function
main();
