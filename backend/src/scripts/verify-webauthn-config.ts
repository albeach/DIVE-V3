import KcAdminClient from '@keycloak/keycloak-admin-client';
import dotenv from 'dotenv';

dotenv.config();

async function verifyWebAuthnConfig() {
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

  console.log('Checking WebAuthn configuration for dive-v3-pol realm...\n');
  
  kcAdminClient.setConfig({ realmName: 'dive-v3-pol' });
  const realm = await kcAdminClient.realms.findOne({ realm: 'dive-v3-pol' });
  
  console.log('WebAuthn Policy Configuration:');
  console.log('================================');
  console.log(`rpEntityName: ${realm.webAuthnPolicyRpEntityName}`);
  console.log(`rpId: "${realm.webAuthnPolicyRpId}"`);
  console.log(`signatureAlgorithms: ${JSON.stringify(realm.webAuthnPolicySignatureAlgorithms)}`);
  console.log(`attestationConveyancePreference: ${realm.webAuthnPolicyAttestationConveyancePreference}`);
  console.log(`authenticatorAttachment: ${realm.webAuthnPolicyAuthenticatorAttachment}`);
  console.log(`requireResidentKey: ${realm.webAuthnPolicyRequireResidentKey}`);
  console.log(`userVerificationRequirement: ${realm.webAuthnPolicyUserVerificationRequirement}`);
  console.log(`createTimeout: ${realm.webAuthnPolicyCreateTimeout}`);
  console.log('\n');
  
  if (!realm.webAuthnPolicyRpId || realm.webAuthnPolicyRpId === '') {
    console.error('❌ ERROR: rpId is still empty!');
    console.error('The configuration did not apply correctly.');
    console.error('\nPlease run: npm run fix-webauthn-rpid');
  } else if (realm.webAuthnPolicyRpId !== 'dive25.com') {
    console.error(`⚠️  WARNING: rpId is "${realm.webAuthnPolicyRpId}" but should be "dive25.com"`);
  } else {
    console.log('✅ Configuration looks correct!');
    console.log('\nThe configuration is properly set. If you\'re still seeing errors:');
    console.log('1. Clear browser cache and cookies completely');
    console.log('2. Logout from Keycloak completely');
    console.log('3. Try in an incognito/private window');
    console.log('4. Check browser console for JavaScript errors');
    console.log('5. Verify HTTPS is being used (WebAuthn requires HTTPS)');
  }
}

verifyWebAuthnConfig().catch(console.error);



