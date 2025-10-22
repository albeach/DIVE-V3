#!/usr/bin/env tsx
/**
 * Generate Real X.509 Three-Tier CA Hierarchy using Node's crypto module
 * 
 * This script generates a complete three-tier CA hierarchy:
 * - Root CA (self-signed)
 * - Intermediate CA (signed by Root)
 * - Policy Signing Certificate (signed by Intermediate)
 * 
 * Uses Node.js crypto module to generate real X.509 certificates
 * compatible with the X509Certificate class.
 * 
 * ACP-240 Section 5.4: Digital Signatures & Cryptographic Binding
 */

import * as fs from 'fs';
import * as path from 'path';
import { generateKeyPairSync, X509Certificate } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Paths
const CERT_DIR = path.join(__dirname, '..', '..', 'certs');
const CA_DIR = path.join(CERT_DIR, 'ca');
const SIGNING_DIR = path.join(CERT_DIR, 'signing');
const CRL_DIR = path.join(CERT_DIR, 'crl');

// Certificate validity periods
const ROOT_VALIDITY_DAYS = 3650; // 10 years
const INTERMEDIATE_VALIDITY_DAYS = 1825; // 5 years
const SIGNING_VALIDITY_DAYS = 365; // 1 year

/**
 * Generate RSA key pair
 */
function generateKeyPair(): { publicKey: string; privateKey: string } {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });

    return { publicKey, privateKey };
}

/**
 * Execute OpenSSL command to generate certificate
 */
async function generateCertWithOpenSSL(
    subject: string,
    keyPath: string,
    certPath: string,
    days: number,
    issuerKeyPath?: string,
    issuerCertPath?: string,
    extensions?: string
): Promise<void> {
    // Generate CSR
    const csrPath = certPath.replace('.crt', '.csr');
    await execAsync(
        `openssl req -new -key "${keyPath}" -out "${csrPath}" -subj "${subject}"`
    );

    // Sign CSR (self-signed for root, or signed by issuer)
    if (!issuerKeyPath || !issuerCertPath) {
        // Self-signed (Root CA)
        await execAsync(
            `openssl x509 -req -in "${csrPath}" -signkey "${keyPath}" -out "${certPath}" -days ${days} ${extensions || ''}`
        );
    } else {
        // Signed by issuer
        await execAsync(
            `openssl x509 -req -in "${csrPath}" -CA "${issuerCertPath}" -CAkey "${issuerKeyPath}" -CAcreateserial -out "${certPath}" -days ${days} ${extensions || ''}`
        );
    }

    // Clean up CSR
    fs.unlinkSync(csrPath);
}

/**
 * Main function
 */
async function main() {
    console.log('🔐 Generating Real X.509 Three-Tier CA Hierarchy');
    console.log('==============================================\n');

    // Create directories
    [CA_DIR, SIGNING_DIR, CRL_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        }
    });

    // 1. Generate Root CA
    console.log('1️⃣  Generating Root CA...');
    const rootKeyPath = path.join(CA_DIR, 'root.key');
    const rootCertPath = path.join(CA_DIR, 'root.crt');
    const rootKeyPair = generateKeyPair();
    fs.writeFileSync(rootKeyPath, rootKeyPair.privateKey, { mode: 0o600 });
    
    await generateCertWithOpenSSL(
        '/C=US/O=DIVE V3 Coalition ICAM Pilot/OU=Security Operations/CN=DIVE-V3 Root CA',
        rootKeyPath,
        rootCertPath,
        ROOT_VALIDITY_DAYS,
        undefined,
        undefined,
        '-extensions v3_ca'
    );

    console.log(`   ✅ Root CA Certificate: ${rootCertPath}`);
    console.log(`   ✅ Root CA Private Key: ${rootKeyPath}`);

    // Verify root certificate
    const rootCert = new X509Certificate(fs.readFileSync(rootCertPath));
    console.log(`   📝 Subject: ${rootCert.subject}`);
    console.log(`   📝 Valid Until: ${rootCert.validTo}\n`);

    // 2. Generate Intermediate CA
    console.log('2️⃣  Generating Intermediate CA...');
    const intermediateKeyPath = path.join(CA_DIR, 'intermediate.key');
    const intermediateCertPath = path.join(CA_DIR, 'intermediate.crt');
    const intermediateKeyPair = generateKeyPair();
    fs.writeFileSync(intermediateKeyPath, intermediateKeyPair.privateKey, { mode: 0o600 });

    await generateCertWithOpenSSL(
        '/C=US/O=DIVE V3 Coalition ICAM Pilot/OU=Security Operations/CN=DIVE-V3 Intermediate CA',
        intermediateKeyPath,
        intermediateCertPath,
        INTERMEDIATE_VALIDITY_DAYS,
        rootKeyPath,
        rootCertPath,
        '-extensions v3_ca'
    );

    console.log(`   ✅ Intermediate CA Certificate: ${intermediateCertPath}`);
    console.log(`   ✅ Intermediate CA Private Key: ${intermediateKeyPath}`);

    // Verify intermediate certificate
    const intermediateCert = new X509Certificate(fs.readFileSync(intermediateCertPath));
    console.log(`   📝 Subject: ${intermediateCert.subject}`);
    console.log(`   📝 Issuer: ${intermediateCert.issuer}`);
    console.log(`   📝 Valid Until: ${intermediateCert.validTo}\n`);

    // Create certificate chain
    const chainPath = path.join(CA_DIR, 'chain.pem');
    const chainContent = fs.readFileSync(intermediateCertPath, 'utf8') + '\n' + fs.readFileSync(rootCertPath, 'utf8');
    fs.writeFileSync(chainPath, chainContent, { mode: 0o644 });
    console.log(`   ✅ Certificate Chain: ${chainPath}\n`);

    // 3. Generate Policy Signing Certificate
    console.log('3️⃣  Generating Policy Signing Certificate...');
    const signingKeyPath = path.join(SIGNING_DIR, 'policy-signer.key');
    const signingCertPath = path.join(SIGNING_DIR, 'policy-signer.crt');
    const signingKeyPair = generateKeyPair();
    fs.writeFileSync(signingKeyPath, signingKeyPair.privateKey, { mode: 0o600 });

    await generateCertWithOpenSSL(
        '/C=US/O=DIVE V3 Coalition ICAM Pilot/OU=Policy Management/CN=DIVE-V3 Policy Signer',
        signingKeyPath,
        signingCertPath,
        SIGNING_VALIDITY_DAYS,
        intermediateKeyPath,
        intermediateCertPath
    );

    console.log(`   ✅ Signing Certificate: ${signingCertPath}`);
    console.log(`   ✅ Signing Private Key: ${signingKeyPath}`);

    // Verify signing certificate
    const signingCert = new X509Certificate(fs.readFileSync(signingCertPath));
    console.log(`   📝 Subject: ${signingCert.subject}`);
    console.log(`   📝 Issuer: ${signingCert.issuer}`);
    console.log(`   📝 Valid Until: ${signingCert.validTo}\n`);

    // Create signing certificate bundle
    const bundlePath = path.join(SIGNING_DIR, 'policy-signer-bundle.pem');
    const bundleContent = fs.readFileSync(signingCertPath, 'utf8') + '\n' + chainContent;
    fs.writeFileSync(bundlePath, bundleContent, { mode: 0o644 });
    console.log(`   ✅ Signing Certificate Bundle: ${bundlePath}\n`);

    // 4. Create CRL files (empty for now)
    console.log('4️⃣  Creating Certificate Revocation Lists...');
    const rootCRL = {
        version: 1,
        issuer: 'DIVE-V3 Root CA',
        thisUpdate: new Date().toISOString(),
        nextUpdate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        revokedCertificates: []
    };
    fs.writeFileSync(path.join(CRL_DIR, 'root-crl.json'), JSON.stringify(rootCRL, null, 2), { mode: 0o644 });

    const intermediateCRL = {
        version: 1,
        issuer: 'DIVE-V3 Intermediate CA',
        thisUpdate: new Date().toISOString(),
        nextUpdate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        revokedCertificates: []
    };
    fs.writeFileSync(path.join(CRL_DIR, 'intermediate-crl.json'), JSON.stringify(intermediateCRL, null, 2), { mode: 0o644 });

    console.log(`   ✅ Root CA CRL: ${path.join(CRL_DIR, 'root-crl.json')}`);
    console.log(`   ✅ Intermediate CA CRL: ${path.join(CRL_DIR, 'intermediate-crl.json')}\n`);

    // Success summary
    console.log('✅ Three-Tier CA Hierarchy Generated Successfully!');
    console.log('\nHierarchy:');
    console.log('  Root CA (root.crt)');
    console.log('  ├── Intermediate CA (intermediate.crt)');
    console.log('  │   └── Policy Signer (policy-signer.crt)');
    console.log('\nValidate with:');
    console.log(`  openssl verify -CAfile ${rootCertPath} ${intermediateCertPath}`);
    console.log(`  openssl verify -CAfile ${chainPath} ${signingCertPath}`);
}

// Run
main().catch(error => {
    console.error('❌ Error generating CA hierarchy:', error);
    process.exit(1);
});

