import KcAdminClient from '@keycloak/keycloak-admin-client';
import dotenv from 'dotenv';

dotenv.config();

async function verifyBothWebAuthnPolicies() {
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

  console.log('Checking BOTH WebAuthn policies for dive-v3-pol realm...\n');
  
  kcAdminClient.setConfig({ realmName: 'dive-v3-pol' });
  const realm = await kcAdminClient.realms.findOne({ realm: 'dive-v3-pol' });
  
  console.log('WebAuthn Policy (2FA - for webauthn-register):');
  console.log('=================================================');
  console.log(`rpEntityName: ${realm.webAuthnPolicyRpEntityName}`);
  console.log(`rpId: "${realm.webAuthnPolicyRpId}"`);
  console.log(`signatureAlgorithms: ${JSON.stringify(realm.webAuthnPolicySignatureAlgorithms)}`);
  console.log(`attestationConveyancePreference: ${realm.webAuthnPolicyAttestationConveyancePreference}`);
  console.log(`authenticatorAttachment: ${realm.webAuthnPolicyAuthenticatorAttachment || 'not specified'}`);
  console.log(`requireResidentKey: ${realm.webAuthnPolicyRequireResidentKey}`);
  console.log(`userVerificationRequirement: ${realm.webAuthnPolicyUserVerificationRequirement} ⭐`);
  console.log(`createTimeout: ${realm.webAuthnPolicyCreateTimeout}`);
  console.log('\n');

  console.log('WebAuthn Passwordless Policy (for webauthn-register-passwordless):');
  console.log('===================================================================');
  console.log(`rpEntityName: ${realm.webAuthnPolicyPasswordlessRpEntityName}`);
  console.log(`rpId: "${realm.webAuthnPolicyPasswordlessRpId}"`);
  console.log(`signatureAlgorithms: ${JSON.stringify(realm.webAuthnPolicyPasswordlessSignatureAlgorithms)}`);
  console.log(`attestationConveyancePreference: ${realm.webAuthnPolicyPasswordlessAttestationConveyancePreference}`);
  console.log(`authenticatorAttachment: ${realm.webAuthnPolicyPasswordlessAuthenticatorAttachment || 'not specified'}`);
  console.log(`requireResidentKey: ${realm.webAuthnPolicyPasswordlessRequireResidentKey}`);
  console.log(`userVerificationRequirement: ${realm.webAuthnPolicyPasswordlessUserVerificationRequirement} ⭐`);
  console.log(`createTimeout: ${realm.webAuthnPolicyPasswordlessCreateTimeout}`);
  console.log('\n');
  
  // Verify both are set correctly
  const bothCorrect = 
    realm.webAuthnPolicyUserVerificationRequirement === 'preferred' &&
    realm.webAuthnPolicyPasswordlessUserVerificationRequirement === 'preferred' &&
    realm.webAuthnPolicyRpId === 'dive25.com' &&
    realm.webAuthnPolicyPasswordlessRpId === 'dive25.com';
  
  if (bothCorrect) {
    console.log('✅ BOTH policies configured correctly!');
    console.log('\nCritical settings verified:');
    console.log('  ✅ WebAuthn Policy: userVerification = preferred');
    console.log('  ✅ WebAuthn Passwordless Policy: userVerification = preferred');
    console.log('  ✅ Both rpId set to: dive25.com');
    console.log('\nNext steps:');
    console.log('1. Clear browser cache and cookies COMPLETELY');
    console.log('2. Logout from Keycloak (all sessions)');
    console.log('3. Try registration again on iPhone');
    console.log('4. Should no longer get stuck at "Connecting..."');
  } else {
    console.error('❌ Configuration issue detected!');
    if (realm.webAuthnPolicyUserVerificationRequirement !== 'preferred') {
      console.error(`  ❌ WebAuthn Policy userVerification is "${realm.webAuthnPolicyUserVerificationRequirement}" (should be "preferred")`);
    }
    if (realm.webAuthnPolicyPasswordlessUserVerificationRequirement !== 'preferred') {
      console.error(`  ❌ WebAuthn Passwordless Policy userVerification is "${realm.webAuthnPolicyPasswordlessUserVerificationRequirement}" (should be "preferred")`);
    }
    console.error('\nRun: npm run fix-webauthn-rpid');
  }
}

verifyBothWebAuthnPolicies().catch(console.error);


