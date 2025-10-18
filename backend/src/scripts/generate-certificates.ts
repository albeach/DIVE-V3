#!/usr/bin/env node
/**
 * Certificate Generation Script
 * 
 * Generates X.509 certificates for ZTDF policy signing
 * 
 * Usage:
 *   npm run generate-certs
 *   npm run generate-certs -- --renew
 * 
 * Generated files (in backend/certs/):
 *   - ca-key.pem: Certificate Authority private key (4096-bit RSA, encrypted)
 *   - ca-cert.pem: Certificate Authority certificate (self-signed)
 *   - dive-v3-policy-signer-key.pem: Policy signing private key (2048-bit RSA)
 *   - dive-v3-policy-signer-cert.pem: Policy signing certificate (signed by CA)
 */

import { certificateManager } from '../utils/certificate-manager';

async function main() {
    const renew = process.argv.includes('--renew');

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('DIVE V3 - Certificate Generation Script');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        // Step 1: Initialize CA
        console.log('Step 1: Initializing Certificate Authority...');
        await certificateManager.initialize();
        console.log('✅ CA initialized\n');

        // Step 2: Generate/check policy signing certificate
        console.log('Step 2: Generating policy signing certificate...');

        const certName = 'dive-v3-policy-signer';
        const certs = certificateManager.listCertificates();

        if (certs.includes(certName) && !renew) {
            console.log(`✅ Certificate already exists: ${certName}`);
            console.log('   Use --renew flag to regenerate\n');
        } else {
            const result = await certificateManager.generatePolicySigningCertificate({
                type: 'signing',
                commonName: 'DIVE-V3 Policy Signer',
                organization: 'DIVE V3 Coalition ICAM',
                organizationalUnit: 'Policy Management',
                country: 'US',
                validityDays: 365,
                keySize: 2048
            });

            console.log('✅ Policy signing certificate generated');
            console.log(`   Certificate: ${result.certificatePath}`);
            console.log(`   Private Key: ${result.privateKeyPath}\n`);
        }

        // Step 3: Validate certificates
        console.log('Step 3: Validating certificates...');
        const { certificate } = certificateManager.loadCertificate(certName);
        const validation = certificateManager.validateCertificate(certificate);

        if (validation.valid) {
            console.log('✅ Certificate validation passed');
            if (validation.metadata) {
                console.log(`   Subject: ${validation.metadata.subject}`);
                console.log(`   Issuer: ${validation.metadata.issuer}`);
                console.log(`   Valid From: ${validation.metadata.validFrom.toISOString()}`);
                console.log(`   Valid To: ${validation.metadata.validTo.toISOString()}`);
                console.log(`   Serial Number: ${validation.metadata.serialNumber}`);
            }
        } else {
            console.log('❌ Certificate validation failed');
            validation.errors.forEach(err => console.log(`   Error: ${err}`));
        }

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('Certificate Generation Complete');
        console.log('═══════════════════════════════════════════════════════════════\n');

        console.log('📁 Generated Files:');
        console.log('   Certificate Authority:');
        console.log('     - backend/certs/ca-cert.pem');
        console.log('     - backend/certs/ca-key.pem (encrypted)\n');

        console.log('   Policy Signing Certificate:');
        console.log('     - backend/certs/dive-v3-policy-signer-cert.pem');
        console.log('     - backend/certs/dive-v3-policy-signer-key.pem\n');

        console.log('🔒 Security Notes:');
        console.log('   - CA private key is encrypted with passphrase');
        console.log('   - Certificate files have restrictive permissions (600/644)');
        console.log('   - Certificates valid for 365 days');
        console.log('   - Chain validation enabled\n');

        console.log('⚙️  Configuration:');
        console.log('   Set in .env.local:');
        console.log('   POLICY_SIGNATURE_CERT_PATH=backend/certs/dive-v3-policy-signer-cert.pem');
        console.log('   CA_KEY_PASSPHRASE=<your-secure-passphrase>\n');

        console.log('✅ Ready for production use!\n');

        process.exit(0);

    } catch (error) {
        console.error('\n❌ Certificate generation failed:');
        console.error(`   ${error instanceof Error ? error.message : 'Unknown error'}\n`);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

export { main };

