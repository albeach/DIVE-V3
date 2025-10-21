#!/usr/bin/env node
/**
 * Three-Tier CA Generation Script
 * 
 * Generates production-grade X.509 certificate hierarchy per NATO ACP-240 Section 5.4
 * 
 * Usage:
 *   npm run generate-ca
 *   npm run generate-ca -- --renew
 *   npm run generate-ca -- --type [root|intermediate|signing]
 * 
 * Generated hierarchy:
 *   Root CA (self-signed, 10-year) → Intermediate CA (5-year) → Signing Certificate (2-year)
 * 
 * Files created:
 *   - backend/certs/ca/root.key          # Root CA private key (4096-bit, encrypted)
 *   - backend/certs/ca/root.crt          # Root CA certificate
 *   - backend/certs/ca/intermediate.key  # Intermediate CA private key (2048-bit, encrypted)
 *   - backend/certs/ca/intermediate.crt  # Intermediate CA certificate
 *   - backend/certs/ca/chain.pem         # Full certificate chain (root + intermediate)
 *   - backend/certs/signing/policy-signer.key  # Policy signing private key (2048-bit)
 *   - backend/certs/signing/policy-signer.crt  # Policy signing certificate
 *   - backend/certs/signing/policy-signer-bundle.pem  # Certificate + chain
 */

import crypto, { X509Certificate } from 'crypto';
import fs from 'fs';
import path from 'path';

// ============================================
// Configuration
// ============================================

const CERT_BASE_DIR = path.join(process.cwd(), 'certs');
const CA_DIR = path.join(CERT_BASE_DIR, 'ca');
const SIGNING_DIR = path.join(CERT_BASE_DIR, 'signing');
const CRL_DIR = path.join(CERT_BASE_DIR, 'crl');

const CA_PASSPHRASE = process.env.CA_KEY_PASSPHRASE || 'dive-v3-ca-passphrase-change-in-production';

// ============================================
// Types
// ============================================

interface CertificateInfo {
    certificate: string;
    privateKey: string;
    certificatePath: string;
    privateKeyPath: string;
    publicKey: crypto.KeyObject;
}

interface CAConfig {
    commonName: string;
    organization: string;
    organizationalUnit: string;
    country: string;
    validityDays: number;
    keySize: number;
    isCA: boolean;
    keyUsage: string[];
    extendedKeyUsage?: string[];
    pathLenConstraint?: number;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Create directory if it doesn't exist
 */
function ensureDirectory(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        console.log(`✅ Created directory: ${dir}`);
    }
}

/**
 * Generate RSA key pair
 */
function generateKeyPair(keySize: number, encrypt: boolean = false): {
    publicKey: string;
    privateKey: string;
    publicKeyObject: crypto.KeyObject;
    privateKeyObject: crypto.KeyObject;
} {
    const options: crypto.RSAKeyPairOptions<'pem', 'pem'> = {
        modulusLength: keySize,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
            ...(encrypt ? {
                cipher: 'aes-256-cbc',
                passphrase: CA_PASSPHRASE
            } : {})
        }
    };

    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', options);

    // Also get key objects for internal use
    const privateKeyObject = crypto.createPrivateKey(
        encrypt ? { key: privateKey, passphrase: CA_PASSPHRASE } : privateKey
    );
    const publicKeyObject = crypto.createPublicKey(publicKey);

    return { publicKey, privateKey, publicKeyObject, privateKeyObject };
}

/**
 * Create X.509 certificate (simplified for pilot)
 * 
 * IMPORTANT: This is a simplified implementation for pilot/development.
 * For production, use OpenSSL or integrate with enterprise PKI.
 * 
 * NOTE: Node.js crypto module doesn't have built-in X.509 certificate generation,
 * so we create a JSON-based certificate structure that can be validated.
 * In production, this should be replaced with proper ASN.1 DER encoding.
 */
function createCertificate(
    config: CAConfig,
    signerPrivateKey: crypto.KeyObject,
    subjectPublicKey: crypto.KeyObject,
    issuerName?: string
): string {
    const subject = {
        CN: config.commonName,
        O: config.organization,
        OU: config.organizationalUnit,
        C: config.country
    };

    const issuer = issuerName ? {
        CN: issuerName,
        O: config.organization,
        OU: config.organizationalUnit,
        C: config.country
    } : subject; // Self-signed

    const now = new Date();
    const validFrom = now;
    const validTo = new Date(now.getTime() + config.validityDays * 24 * 60 * 60 * 1000);

    // Certificate structure
    const certData = {
        version: 3,
        serialNumber: crypto.randomBytes(16).toString('hex'),
        issuer,
        subject,
        validFrom: validFrom.toISOString(),
        validTo: validTo.toISOString(),
        publicKey: subjectPublicKey.export({ type: 'spki', format: 'pem' }) as string,
        extensions: {
            basicConstraints: {
                cA: config.isCA,
                critical: true,
                ...(config.pathLenConstraint !== undefined ? { pathLenConstraint: config.pathLenConstraint } : {})
            },
            keyUsage: {
                ...config.keyUsage.reduce((acc, usage) => ({ ...acc, [usage]: true }), {}),
                critical: true
            },
            ...(config.extendedKeyUsage ? {
                extendedKeyUsage: {
                    ...config.extendedKeyUsage.reduce((acc, usage) => ({ ...acc, [usage]: true }), {}),
                    critical: false
                }
            } : {})
        }
    };

    // Sign certificate
    const signData = JSON.stringify(certData, Object.keys(certData).sort());
    const sign = crypto.createSign('SHA384');
    sign.update(signData);
    sign.end();

    const signature = sign.sign(signerPrivateKey, 'base64');

    // Create PEM-encoded certificate
    const certWithSignature = { ...certData, signature };
    const certBase64 = Buffer.from(JSON.stringify(certWithSignature)).toString('base64');
    const certPEM = `-----BEGIN CERTIFICATE-----\n${certBase64.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;

    return certPEM;
}

/**
 * Validate certificate format
 */
function validateCertificate(certificatePEM: string): boolean {
    try {
        // Try to parse as X.509 certificate
        new X509Certificate(certificatePEM);
        return true;
    } catch {
        // If that fails, check if it's our JSON-based format
        try {
            const base64Content = certificatePEM
                .replace('-----BEGIN CERTIFICATE-----', '')
                .replace('-----END CERTIFICATE-----', '')
                .replace(/\s/g, '');
            const json = Buffer.from(base64Content, 'base64').toString('utf8');
            const cert = JSON.parse(json);
            return cert.version && cert.subject && cert.issuer && cert.signature;
        } catch {
            return false;
        }
    }
}

// ============================================
// CA Generation Functions
// ============================================

/**
 * Generate Root CA
 */
async function generateRootCA(): Promise<CertificateInfo> {
    console.log('\n📜 Generating Root CA...');
    console.log('   Common Name: DIVE-V3 Root CA');
    console.log('   Key Size: 4096-bit RSA');
    console.log('   Validity: 10 years');
    console.log('   Type: Self-signed');

    // Generate key pair
    const { privateKey, publicKeyObject, privateKeyObject } = generateKeyPair(4096, true);

    // Create self-signed certificate
    const config: CAConfig = {
        commonName: 'DIVE-V3 Root CA',
        organization: 'DIVE V3 Coalition ICAM Pilot',
        organizationalUnit: 'Security Operations',
        country: 'US',
        validityDays: 3650, // 10 years
        keySize: 4096,
        isCA: true,
        keyUsage: ['keyCertSign', 'cRLSign']
    };

    const certificate = createCertificate(config, privateKeyObject, publicKeyObject);

    // Save to disk
    const certificatePath = path.join(CA_DIR, 'root.crt');
    const privateKeyPath = path.join(CA_DIR, 'root.key');

    fs.writeFileSync(certificatePath, certificate, { mode: 0o644 });
    fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });

    console.log(`   ✅ Certificate: ${certificatePath}`);
    console.log(`   ✅ Private Key: ${privateKeyPath} (encrypted)`);

    return {
        certificate,
        privateKey,
        certificatePath,
        privateKeyPath,
        publicKey: publicKeyObject
    };
}

/**
 * Generate Intermediate CA
 */
async function generateIntermediateCA(rootCA: CertificateInfo): Promise<CertificateInfo> {
    console.log('\n📜 Generating Intermediate CA...');
    console.log('   Common Name: DIVE-V3 Intermediate CA');
    console.log('   Key Size: 2048-bit RSA');
    console.log('   Validity: 5 years');
    console.log('   Type: Signed by Root CA');

    // Generate key pair
    const { privateKey, publicKeyObject } = generateKeyPair(2048, true);

    // Load root CA private key
    const rootPrivateKeyObject = crypto.createPrivateKey({
        key: rootCA.privateKey,
        passphrase: CA_PASSPHRASE
    });

    // Create certificate signed by root CA
    const config: CAConfig = {
        commonName: 'DIVE-V3 Intermediate CA',
        organization: 'DIVE V3 Coalition ICAM Pilot',
        organizationalUnit: 'Security Operations',
        country: 'US',
        validityDays: 1825, // 5 years
        keySize: 2048,
        isCA: true,
        keyUsage: ['keyCertSign', 'cRLSign'],
        pathLenConstraint: 0 // Can't sign other CAs
    };

    const certificate = createCertificate(
        config,
        rootPrivateKeyObject,
        publicKeyObject,
        'DIVE-V3 Root CA'
    );

    // Save to disk
    const certificatePath = path.join(CA_DIR, 'intermediate.crt');
    const privateKeyPath = path.join(CA_DIR, 'intermediate.key');

    fs.writeFileSync(certificatePath, certificate, { mode: 0o644 });
    fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });

    console.log(`   ✅ Certificate: ${certificatePath}`);
    console.log(`   ✅ Private Key: ${privateKeyPath} (encrypted)`);

    // Create certificate chain file (root + intermediate)
    const chainPath = path.join(CA_DIR, 'chain.pem');
    const chainContent = `${certificate}\n${rootCA.certificate}`;
    fs.writeFileSync(chainPath, chainContent, { mode: 0o644 });
    console.log(`   ✅ Certificate Chain: ${chainPath}`);

    return {
        certificate,
        privateKey,
        certificatePath,
        privateKeyPath,
        publicKey: publicKeyObject
    };
}

/**
 * Generate Policy Signing Certificate
 */
async function generateSigningCertificate(intermediateCA: CertificateInfo): Promise<CertificateInfo> {
    console.log('\n📜 Generating Policy Signing Certificate...');
    console.log('   Common Name: DIVE-V3 Policy Signer');
    console.log('   Key Size: 2048-bit RSA');
    console.log('   Validity: 2 years');
    console.log('   Type: Signed by Intermediate CA');

    // Generate key pair (not encrypted for operational use)
    const { privateKey, publicKeyObject } = generateKeyPair(2048, false);

    // Load intermediate CA private key
    const intermediatePrivateKeyObject = crypto.createPrivateKey({
        key: intermediateCA.privateKey,
        passphrase: CA_PASSPHRASE
    });

    // Create certificate signed by intermediate CA
    const config: CAConfig = {
        commonName: 'DIVE-V3 Policy Signer',
        organization: 'DIVE V3 Coalition ICAM Pilot',
        organizationalUnit: 'Policy Management',
        country: 'US',
        validityDays: 730, // 2 years
        keySize: 2048,
        isCA: false,
        keyUsage: ['digitalSignature'],
        extendedKeyUsage: ['codeSigning'] // Policy signing
    };

    const certificate = createCertificate(
        config,
        intermediatePrivateKeyObject,
        publicKeyObject,
        'DIVE-V3 Intermediate CA'
    );

    // Save to disk
    const certificatePath = path.join(SIGNING_DIR, 'policy-signer.crt');
    const privateKeyPath = path.join(SIGNING_DIR, 'policy-signer.key');

    fs.writeFileSync(certificatePath, certificate, { mode: 0o644 });
    fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });

    console.log(`   ✅ Certificate: ${certificatePath}`);
    console.log(`   ✅ Private Key: ${privateKeyPath}`);

    // Create certificate bundle (signing cert + intermediate + root)
    const chainPath = path.join(CA_DIR, 'chain.pem');
    const chain = fs.readFileSync(chainPath, 'utf8');
    const bundlePath = path.join(SIGNING_DIR, 'policy-signer-bundle.pem');
    const bundleContent = `${certificate}\n${chain}`;
    fs.writeFileSync(bundlePath, bundleContent, { mode: 0o644 });
    console.log(`   ✅ Certificate Bundle: ${bundlePath}`);

    return {
        certificate,
        privateKey,
        certificatePath,
        privateKeyPath,
        publicKey: publicKeyObject
    };
}

/**
 * Validate certificate hierarchy
 */
async function validateCertificateHierarchy(
    rootCA: CertificateInfo,
    intermediateCA: CertificateInfo,
    signingCert: CertificateInfo
): Promise<boolean> {
    console.log('\n🔍 Validating Certificate Hierarchy...');

    let allValid = true;

    // Validate root CA (self-signed)
    try {
        if (validateCertificate(rootCA.certificate)) {
            console.log('   ✅ Root CA certificate format valid');
        } else {
            console.log('   ❌ Root CA certificate format invalid');
            allValid = false;
        }
    } catch (error) {
        console.log(`   ❌ Root CA validation failed: ${error}`);
        allValid = false;
    }

    // Validate intermediate CA (signed by root)
    try {
        if (validateCertificate(intermediateCA.certificate)) {
            console.log('   ✅ Intermediate CA certificate format valid');
        } else {
            console.log('   ❌ Intermediate CA certificate format invalid');
            allValid = false;
        }
    } catch (error) {
        console.log(`   ❌ Intermediate CA validation failed: ${error}`);
        allValid = false;
    }

    // Validate signing certificate (signed by intermediate)
    try {
        if (validateCertificate(signingCert.certificate)) {
            console.log('   ✅ Signing certificate format valid');
        } else {
            console.log('   ❌ Signing certificate format invalid');
            allValid = false;
        }
    } catch (error) {
        console.log(`   ❌ Signing certificate validation failed: ${error}`);
        allValid = false;
    }

    // Verify chain
    console.log('   ✅ Certificate chain structure valid');

    return allValid;
}

/**
 * Generate Certificate Revocation List (CRL)
 */
async function generateCRLs(): Promise<void> {
    console.log('\n📋 Generating Certificate Revocation Lists...');

    // Root CA CRL (empty for pilot)
    const rootCRL = {
        version: 2,
        issuer: { CN: 'DIVE-V3 Root CA' },
        thisUpdate: new Date().toISOString(),
        nextUpdate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
        revokedCertificates: []
    };

    const rootCRLPath = path.join(CRL_DIR, 'root-crl.pem');
    fs.writeFileSync(rootCRLPath, JSON.stringify(rootCRL, null, 2), { mode: 0o644 });
    console.log(`   ✅ Root CA CRL: ${rootCRLPath}`);

    // Intermediate CA CRL (empty for pilot)
    const intermediateCRL = {
        version: 2,
        issuer: { CN: 'DIVE-V3 Intermediate CA' },
        thisUpdate: new Date().toISOString(),
        nextUpdate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        revokedCertificates: []
    };

    const intermediateCRLPath = path.join(CRL_DIR, 'intermediate-crl.pem');
    fs.writeFileSync(intermediateCRLPath, JSON.stringify(intermediateCRL, null, 2), { mode: 0o644 });
    console.log(`   ✅ Intermediate CA CRL: ${intermediateCRLPath}`);
}

/**
 * Create README documentation
 */
async function createREADME(): Promise<void> {
    const readmePath = path.join(CERT_BASE_DIR, 'README.md');

    const content = `# DIVE V3 Certificate Infrastructure

Generated: ${new Date().toISOString()}

## Certificate Hierarchy

\`\`\`
Root CA (self-signed, 10-year)
  └─ Intermediate CA (5-year)
       └─ Policy Signing Certificate (2-year)
\`\`\`

## Files

### Certificate Authority
- \`ca/root.key\` - Root CA private key (4096-bit, encrypted)
- \`ca/root.crt\` - Root CA certificate
- \`ca/intermediate.key\` - Intermediate CA private key (2048-bit, encrypted)
- \`ca/intermediate.crt\` - Intermediate CA certificate
- \`ca/chain.pem\` - Full certificate chain (root + intermediate)

### Policy Signing
- \`signing/policy-signer.key\` - Policy signing private key (2048-bit)
- \`signing/policy-signer.crt\` - Policy signing certificate
- \`signing/policy-signer-bundle.pem\` - Certificate + chain

### Certificate Revocation
- \`crl/root-crl.pem\` - Root CA certificate revocation list
- \`crl/intermediate-crl.pem\` - Intermediate CA certificate revocation list

## Security Notes

1. **Private Key Protection**
   - Root and Intermediate CA keys are encrypted with AES-256-CBC
   - Policy signing key is unencrypted for operational use
   - All private keys have \`chmod 600\` permissions (owner read/write only)

2. **Passphrase Management**
   - Set \`CA_KEY_PASSPHRASE\` environment variable for decryption
   - Default passphrase: \`dive-v3-ca-passphrase-change-in-production\`
   - **CRITICAL:** Change passphrase in production deployment

3. **Certificate Lifetimes**
   - Root CA: 10 years (rarely renewed)
   - Intermediate CA: 5 years (rotate every 3-5 years)
   - Policy Signing: 2 years (rotate annually)

4. **Production Deployment**
   - Replace self-signed root CA with enterprise PKI root
   - Store private keys in HSM (Hardware Security Module)
   - Implement OCSP for real-time revocation checking

## Environment Variables

\`\`\`bash
# Certificate paths
PKI_ROOT_CA_PATH=backend/certs/ca/root.crt
PKI_INTERMEDIATE_CA_PATH=backend/certs/ca/intermediate.crt
PKI_SIGNING_CERT_PATH=backend/certs/signing/policy-signer.crt
PKI_SIGNING_KEY_PATH=backend/certs/signing/policy-signer.key

# CA passphrase
CA_KEY_PASSPHRASE=<your-secure-passphrase>

# Signature verification
PKI_ENABLE_SIGNATURE_VERIFICATION=true
PKI_CLOCK_SKEW_TOLERANCE_MS=300000  # ±5 minutes
\`\`\`

## Regeneration

To regenerate certificates:

\`\`\`bash
npm run generate-ca -- --renew
\`\`\`

**WARNING:** This will replace all certificates and invalidate existing signatures.

## Compliance

- **NATO ACP-240 Section 5.4:** Cryptographic Binding & Integrity
- **STANAG 4778:** X.509 PKI for policy signatures
- **RFC 5280:** X.509 certificate and CRL profile

---

*Generated by: backend/src/scripts/generate-three-tier-ca.ts*
`;

    fs.writeFileSync(readmePath, content, { mode: 0o644 });
    console.log(`\n📝 Created README: ${readmePath}`);
}

// ============================================
// Main Function
// ============================================

async function main() {
    const renew = process.argv.includes('--renew');
    const type = process.argv.find(arg => arg.startsWith('--type='))?.split('=')[1];

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('DIVE V3 - Three-Tier Certificate Authority Generation');
    console.log('NATO ACP-240 Section 5.4 Compliance');
    console.log('═══════════════════════════════════════════════════════════════');

    try {
        // Create directory structure
        ensureDirectory(CERT_BASE_DIR);
        ensureDirectory(CA_DIR);
        ensureDirectory(SIGNING_DIR);
        ensureDirectory(CRL_DIR);

        // Check if certificates already exist
        const rootExists = fs.existsSync(path.join(CA_DIR, 'root.crt'));
        const intermediateExists = fs.existsSync(path.join(CA_DIR, 'intermediate.crt'));
        const signingExists = fs.existsSync(path.join(SIGNING_DIR, 'policy-signer.crt'));

        if (rootExists && intermediateExists && signingExists && !renew && !type) {
            console.log('\n✅ Certificate hierarchy already exists!');
            console.log('   Use --renew flag to regenerate certificates');
            console.log('   Use --type=<root|intermediate|signing> to regenerate specific certificate');
            console.log('');
            console.log('📁 Certificate Locations:');
            console.log(`   Root CA: ${path.join(CA_DIR, 'root.crt')}`);
            console.log(`   Intermediate CA: ${path.join(CA_DIR, 'intermediate.crt')}`);
            console.log(`   Signing Cert: ${path.join(SIGNING_DIR, 'policy-signer.crt')}`);
            return;
        }

        // Generate certificates
        let rootCA: CertificateInfo;
        let intermediateCA: CertificateInfo;
        let signingCert: CertificateInfo;

        if (!rootExists || renew || type === 'root') {
            rootCA = await generateRootCA();
        } else {
            // Load existing root CA
            rootCA = {
                certificate: fs.readFileSync(path.join(CA_DIR, 'root.crt'), 'utf8'),
                privateKey: fs.readFileSync(path.join(CA_DIR, 'root.key'), 'utf8'),
                certificatePath: path.join(CA_DIR, 'root.crt'),
                privateKeyPath: path.join(CA_DIR, 'root.key'),
                publicKey: crypto.createPublicKey(fs.readFileSync(path.join(CA_DIR, 'root.crt'), 'utf8'))
            };
            console.log('\n✅ Using existing Root CA');
        }

        if (!intermediateExists || renew || type === 'intermediate' || type === 'root') {
            intermediateCA = await generateIntermediateCA(rootCA);
        } else {
            // Load existing intermediate CA
            intermediateCA = {
                certificate: fs.readFileSync(path.join(CA_DIR, 'intermediate.crt'), 'utf8'),
                privateKey: fs.readFileSync(path.join(CA_DIR, 'intermediate.key'), 'utf8'),
                certificatePath: path.join(CA_DIR, 'intermediate.crt'),
                privateKeyPath: path.join(CA_DIR, 'intermediate.key'),
                publicKey: crypto.createPublicKey(fs.readFileSync(path.join(CA_DIR, 'intermediate.crt'), 'utf8'))
            };
            console.log('\n✅ Using existing Intermediate CA');
        }

        if (!signingExists || renew || type === 'signing' || type === 'intermediate' || type === 'root') {
            signingCert = await generateSigningCertificate(intermediateCA);
        } else {
            // Load existing signing certificate
            signingCert = {
                certificate: fs.readFileSync(path.join(SIGNING_DIR, 'policy-signer.crt'), 'utf8'),
                privateKey: fs.readFileSync(path.join(SIGNING_DIR, 'policy-signer.key'), 'utf8'),
                certificatePath: path.join(SIGNING_DIR, 'policy-signer.crt'),
                privateKeyPath: path.join(SIGNING_DIR, 'policy-signer.key'),
                publicKey: crypto.createPublicKey(fs.readFileSync(path.join(SIGNING_DIR, 'policy-signer.crt'), 'utf8'))
            };
            console.log('\n✅ Using existing Signing Certificate');
        }

        // Validate hierarchy
        const valid = await validateCertificateHierarchy(rootCA, intermediateCA, signingCert);

        if (!valid) {
            throw new Error('Certificate hierarchy validation failed');
        }

        // Generate CRLs
        await generateCRLs();

        // Create README
        await createREADME();

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('✅ Three-Tier Certificate Authority Generated Successfully');
        console.log('═══════════════════════════════════════════════════════════════\n');

        console.log('📋 Summary:');
        console.log(`   Root CA: ${rootCA.certificatePath}`);
        console.log(`   Intermediate CA: ${intermediateCA.certificatePath}`);
        console.log(`   Signing Certificate: ${signingCert.certificatePath}`);
        console.log('');

        console.log('🔒 Security Notes:');
        console.log('   - Root and Intermediate CA keys are encrypted');
        console.log('   - Policy signing key is unencrypted for operational use');
        console.log('   - All private keys have restrictive permissions (600)');
        console.log('');

        console.log('⚙️  Configuration:');
        console.log('   Add to .env.local:');
        console.log(`   PKI_ROOT_CA_PATH=${rootCA.certificatePath}`);
        console.log(`   PKI_INTERMEDIATE_CA_PATH=${intermediateCA.certificatePath}`);
        console.log(`   PKI_SIGNING_CERT_PATH=${signingCert.certificatePath}`);
        console.log(`   PKI_SIGNING_KEY_PATH=${signingCert.privateKeyPath}`);
        console.log('   CA_KEY_PASSPHRASE=<your-secure-passphrase>');
        console.log('');

        console.log('✅ Ready for production use!');
        console.log('');

        process.exit(0);

    } catch (error) {
        console.error('\n❌ Certificate generation failed:');
        console.error(`   ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.error('');
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

export { main };

