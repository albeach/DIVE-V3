import KcAdminClient from '@keycloak/keycloak-admin-client';
import dotenv from 'dotenv';

dotenv.config();

async function verifyBrokerWebAuthn() {
  const kcAdminClient = new KcAdminClient({
    baseUrl: process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com',
    realmName: 'master',
  });

  await kcAdminClient.auth({
    username: process.env.KEYCLOAK_ADMIN_USERNAME || 'admin',
    password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
    grantType: 'password',
    clientId: 'admin-cli',
  });

  console.log('\n✅ Checking WebAuthn Policy Configuration for dive-v3-broker realm...\n');
  
  kcAdminClient.setConfig({ realmName: 'dive-v3-broker' });
  const realm = await kcAdminClient.realms.findOne({ realm: 'dive-v3-broker' });
  
  console.log('WebAuthn Policy (2FA):');
  console.log('================================');
  console.log(`RP Entity Name: ${realm.webAuthnPolicyRpEntityName}`);
  console.log(`RP ID: "${realm.webAuthnPolicyRpId}"`);
  console.log(`User Verification: ${realm.webAuthnPolicyUserVerificationRequirement}`);
  console.log(`Require Resident Key: ${realm.webAuthnPolicyRequireResidentKey}`);
  console.log(`Signature Algorithms: ${JSON.stringify(realm.webAuthnPolicySignatureAlgorithms)}`);
  
  console.log('\nWebAuthn Passwordless Policy:');
  console.log('================================');
  console.log(`RP Entity Name: ${realm.webAuthnPolicyPasswordlessRpEntityName}`);
  console.log(`RP ID: "${realm.webAuthnPolicyPasswordlessRpId}"`);
  console.log(`User Verification: ${realm.webAuthnPolicyPasswordlessUserVerificationRequirement}`);
  console.log(`Require Resident Key: ${realm.webAuthnPolicyPasswordlessRequireResidentKey}`);
  
  console.log('\n');
  
  if (!realm.webAuthnPolicyRpId || realm.webAuthnPolicyRpId === '') {
    console.error('❌ ERROR: WebAuthn Policy RP ID is empty!');
  } else if (realm.webAuthnPolicyRpId !== 'dive25.com') {
    console.error(`⚠️  WARNING: WebAuthn Policy RP ID is "${realm.webAuthnPolicyRpId}" but should be "dive25.com"`);
  } else {
    console.log('✅ WebAuthn Policy RP ID is correctly set to "dive25.com"');
  }
  
  if (!realm.webAuthnPolicyPasswordlessRpId || realm.webAuthnPolicyPasswordlessRpId === '') {
    console.error('❌ ERROR: WebAuthn Passwordless Policy RP ID is empty!');
  } else if (realm.webAuthnPolicyPasswordlessRpId !== 'dive25.com') {
    console.error(`⚠️  WARNING: WebAuthn Passwordless Policy RP ID is "${realm.webAuthnPolicyPasswordlessRpId}" but should be "dive25.com"`);
  } else {
    console.log('✅ WebAuthn Passwordless Policy RP ID is correctly set to "dive25.com"');
  }
  
  if (realm.webAuthnPolicyRpId === 'dive25.com' && realm.webAuthnPolicyPasswordlessRpId === 'dive25.com') {
    console.log('\n✅ SUCCESS! Both WebAuthn policies are correctly configured!');
    console.log('\n⚠️  IMPORTANT: You must re-register your YubiKey now!');
    console.log('   Your existing YubiKey credentials were registered with a different RP ID.');
    console.log('\n   Steps to re-register:');
    console.log('   1. Logout completely from Keycloak');
    console.log('   2. Clear browser cache and cookies (or use incognito mode)');
    console.log('   3. Login again as your TOP_SECRET user (e.g., testuser-usa-4)');
    console.log('   4. When prompted for WebAuthn registration, click "Register Security Key"');
    console.log('   5. Insert your YubiKey and touch it when prompted');
    console.log('   6. Give it a label (e.g., "My YubiKey")');
    console.log('   7. Complete the registration');
    console.log('\n   After re-registration, your YubiKey should work correctly!');
  } else {
    console.log('\n❌ Configuration is incomplete. Please run: npm run fix-webauthn-rpid');
  }
}

verifyBrokerWebAuthn().catch(console.error);












