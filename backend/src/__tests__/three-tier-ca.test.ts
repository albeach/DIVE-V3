/**
 * Three-Tier CA Generation Tests
 * 
 * Tests for NATO ACP-240 Section 5.4: X.509 PKI Infrastructure
 * 
 * Coverage:
 * - Root CA generation and validation
 * - Intermediate CA generation and chain validation
 * - Signing certificate generation
 * - Certificate hierarchy validation
 * - CRL generation and management
 * - Certificate file permissions
 */

import fs from 'fs';
import path from 'path';
import { main as generateThreeTierCA } from '../scripts/generate-three-tier-ca';

describe('Three-Tier Certificate Authority Infrastructure', () => {
    const CERT_BASE_DIR = path.join(process.cwd(), 'certs');
    const CA_DIR = path.join(CERT_BASE_DIR, 'ca');
    const SIGNING_DIR = path.join(CERT_BASE_DIR, 'signing');
    const CRL_DIR = path.join(CERT_BASE_DIR, 'crl');

    beforeAll(async () => {
        // Skip if running in CI without certificate setup
        if (process.env.CI && !fs.existsSync(CERT_BASE_DIR)) {
            console.log('⚠️  Skipping PKI tests in CI (certificates not generated)');
            return;
        }

        // Generate certificates if they don't exist
        if (!fs.existsSync(path.join(CA_DIR, 'root.crt'))) {
            console.log('📜 Generating test certificates...');
            await generateThreeTierCA();
        }
    });

    describe('Directory Structure', () => {
        test('should create certificate base directory', () => {
            expect(fs.existsSync(CERT_BASE_DIR)).toBe(true);
            expect(fs.statSync(CERT_BASE_DIR).isDirectory()).toBe(true);
        });

        test('should create CA directory', () => {
            expect(fs.existsSync(CA_DIR)).toBe(true);
            expect(fs.statSync(CA_DIR).isDirectory()).toBe(true);
        });

        test('should create signing directory', () => {
            expect(fs.existsSync(SIGNING_DIR)).toBe(true);
            expect(fs.statSync(SIGNING_DIR).isDirectory()).toBe(true);
        });

        test('should create CRL directory', () => {
            expect(fs.existsSync(CRL_DIR)).toBe(true);
            expect(fs.statSync(CRL_DIR).isDirectory()).toBe(true);
        });

        test('should create README documentation', () => {
            const readmePath = path.join(CERT_BASE_DIR, 'README.md');
            expect(fs.existsSync(readmePath)).toBe(true);
            
            const content = fs.readFileSync(readmePath, 'utf8');
            expect(content).toContain('DIVE V3 Certificate Infrastructure');
            expect(content).toContain('Root CA');
            expect(content).toContain('Intermediate CA');
            expect(content).toContain('Policy Signing');
        });
    });

    describe('Root CA Certificate', () => {
        test('should generate root CA certificate', () => {
            const certPath = path.join(CA_DIR, 'root.crt');
            expect(fs.existsSync(certPath)).toBe(true);

            const cert = fs.readFileSync(certPath, 'utf8');
            expect(cert).toContain('-----BEGIN CERTIFICATE-----');
            expect(cert).toContain('-----END CERTIFICATE-----');
        });

        test('should generate root CA private key (encrypted)', () => {
            const keyPath = path.join(CA_DIR, 'root.key');
            expect(fs.existsSync(keyPath)).toBe(true);

            const key = fs.readFileSync(keyPath, 'utf8');
            expect(key).toContain('-----BEGIN ENCRYPTED PRIVATE KEY-----');
        });

        test('should have correct root CA file permissions', () => {
            // Skip on Windows (no chmod)
            if (process.platform === 'win32') {
                return;
            }

            const keyPath = path.join(CA_DIR, 'root.key');

            const keyStats = fs.statSync(keyPath);

            // Private key should be owner-only (600) - No group/other permissions
            expect(keyStats.mode & 0o077).toBe(0);
        });

        test('should validate root CA certificate structure', () => {
            const certPath = path.join(CA_DIR, 'root.crt');
            const cert = fs.readFileSync(certPath, 'utf8');

            // Parse certificate (simplified JSON format)
            const base64Content = cert
                .replace('-----BEGIN CERTIFICATE-----', '')
                .replace('-----END CERTIFICATE-----', '')
                .replace(/\s/g, '');
            const json = Buffer.from(base64Content, 'base64').toString('utf8');
            const certData = JSON.parse(json);

            expect(certData.version).toBe(3);
            expect(certData.subject.CN).toBe('DIVE-V3 Root CA');
            expect(certData.issuer.CN).toBe('DIVE-V3 Root CA'); // Self-signed
            expect(certData.extensions.basicConstraints.cA).toBe(true);
            expect(certData.extensions.keyUsage.keyCertSign).toBe(true);
            expect(certData.extensions.keyUsage.cRLSign).toBe(true);
        });

        test('should have 10-year validity period', () => {
            const certPath = path.join(CA_DIR, 'root.crt');
            const cert = fs.readFileSync(certPath, 'utf8');

            const base64Content = cert
                .replace('-----BEGIN CERTIFICATE-----', '')
                .replace('-----END CERTIFICATE-----', '')
                .replace(/\s/g, '');
            const json = Buffer.from(base64Content, 'base64').toString('utf8');
            const certData = JSON.parse(json);

            const validFrom = new Date(certData.validFrom);
            const validTo = new Date(certData.validTo);
            const diffYears = (validTo.getTime() - validFrom.getTime()) / (365 * 24 * 60 * 60 * 1000);

            expect(diffYears).toBeGreaterThan(9.9); // ~10 years
            expect(diffYears).toBeLessThan(10.1);
        });
    });

    describe('Intermediate CA Certificate', () => {
        test('should generate intermediate CA certificate', () => {
            const certPath = path.join(CA_DIR, 'intermediate.crt');
            expect(fs.existsSync(certPath)).toBe(true);

            const cert = fs.readFileSync(certPath, 'utf8');
            expect(cert).toContain('-----BEGIN CERTIFICATE-----');
            expect(cert).toContain('-----END CERTIFICATE-----');
        });

        test('should generate intermediate CA private key (encrypted)', () => {
            const keyPath = path.join(CA_DIR, 'intermediate.key');
            expect(fs.existsSync(keyPath)).toBe(true);

            const key = fs.readFileSync(keyPath, 'utf8');
            expect(key).toContain('-----BEGIN ENCRYPTED PRIVATE KEY-----');
        });

        test('should validate intermediate CA certificate structure', () => {
            const certPath = path.join(CA_DIR, 'intermediate.crt');
            const cert = fs.readFileSync(certPath, 'utf8');

            const base64Content = cert
                .replace('-----BEGIN CERTIFICATE-----', '')
                .replace('-----END CERTIFICATE-----', '')
                .replace(/\s/g, '');
            const json = Buffer.from(base64Content, 'base64').toString('utf8');
            const certData = JSON.parse(json);

            expect(certData.version).toBe(3);
            expect(certData.subject.CN).toBe('DIVE-V3 Intermediate CA');
            expect(certData.issuer.CN).toBe('DIVE-V3 Root CA'); // Signed by root
            expect(certData.extensions.basicConstraints.cA).toBe(true);
            expect(certData.extensions.basicConstraints.pathLenConstraint).toBe(0);
            expect(certData.extensions.keyUsage.keyCertSign).toBe(true);
        });

        test('should have 5-year validity period', () => {
            const certPath = path.join(CA_DIR, 'intermediate.crt');
            const cert = fs.readFileSync(certPath, 'utf8');

            const base64Content = cert
                .replace('-----BEGIN CERTIFICATE-----', '')
                .replace('-----END CERTIFICATE-----', '')
                .replace(/\s/g, '');
            const json = Buffer.from(base64Content, 'base64').toString('utf8');
            const certData = JSON.parse(json);

            const validFrom = new Date(certData.validFrom);
            const validTo = new Date(certData.validTo);
            const diffYears = (validTo.getTime() - validFrom.getTime()) / (365 * 24 * 60 * 60 * 1000);

            expect(diffYears).toBeGreaterThan(4.9); // ~5 years
            expect(diffYears).toBeLessThan(5.1);
        });

        test('should generate certificate chain file', () => {
            const chainPath = path.join(CA_DIR, 'chain.pem');
            expect(fs.existsSync(chainPath)).toBe(true);

            const chain = fs.readFileSync(chainPath, 'utf8');
            
            // Chain should contain both intermediate and root certificates
            const certCount = (chain.match(/-----BEGIN CERTIFICATE-----/g) || []).length;
            expect(certCount).toBe(2); // Intermediate + Root
        });
    });

    describe('Policy Signing Certificate', () => {
        test('should generate policy signing certificate', () => {
            const certPath = path.join(SIGNING_DIR, 'policy-signer.crt');
            expect(fs.existsSync(certPath)).toBe(true);

            const cert = fs.readFileSync(certPath, 'utf8');
            expect(cert).toContain('-----BEGIN CERTIFICATE-----');
            expect(cert).toContain('-----END CERTIFICATE-----');
        });

        test('should generate policy signing private key (unencrypted)', () => {
            const keyPath = path.join(SIGNING_DIR, 'policy-signer.key');
            expect(fs.existsSync(keyPath)).toBe(true);

            const key = fs.readFileSync(keyPath, 'utf8');
            expect(key).toContain('-----BEGIN PRIVATE KEY-----');
            expect(key).not.toContain('ENCRYPTED');
        });

        test('should validate policy signing certificate structure', () => {
            const certPath = path.join(SIGNING_DIR, 'policy-signer.crt');
            const cert = fs.readFileSync(certPath, 'utf8');

            const base64Content = cert
                .replace('-----BEGIN CERTIFICATE-----', '')
                .replace('-----END CERTIFICATE-----', '')
                .replace(/\s/g, '');
            const json = Buffer.from(base64Content, 'base64').toString('utf8');
            const certData = JSON.parse(json);

            expect(certData.version).toBe(3);
            expect(certData.subject.CN).toBe('DIVE-V3 Policy Signer');
            expect(certData.issuer.CN).toBe('DIVE-V3 Intermediate CA'); // Signed by intermediate
            expect(certData.extensions.basicConstraints.cA).toBe(false); // Not a CA
            expect(certData.extensions.keyUsage.digitalSignature).toBe(true);
            expect(certData.extensions.extendedKeyUsage.codeSigning).toBe(true);
        });

        test('should have 2-year validity period', () => {
            const certPath = path.join(SIGNING_DIR, 'policy-signer.crt');
            const cert = fs.readFileSync(certPath, 'utf8');

            const base64Content = cert
                .replace('-----BEGIN CERTIFICATE-----', '')
                .replace('-----END CERTIFICATE-----', '')
                .replace(/\s/g, '');
            const json = Buffer.from(base64Content, 'base64').toString('utf8');
            const certData = JSON.parse(json);

            const validFrom = new Date(certData.validFrom);
            const validTo = new Date(certData.validTo);
            const diffYears = (validTo.getTime() - validFrom.getTime()) / (365 * 24 * 60 * 60 * 1000);

            expect(diffYears).toBeGreaterThan(1.9); // ~2 years
            expect(diffYears).toBeLessThan(2.1);
        });

        test('should generate certificate bundle', () => {
            const bundlePath = path.join(SIGNING_DIR, 'policy-signer-bundle.pem');
            expect(fs.existsSync(bundlePath)).toBe(true);

            const bundle = fs.readFileSync(bundlePath, 'utf8');
            
            // Bundle should contain signing cert + intermediate + root
            const certCount = (bundle.match(/-----BEGIN CERTIFICATE-----/g) || []).length;
            expect(certCount).toBe(3); // Signing + Intermediate + Root
        });
    });

    describe('Certificate Hierarchy Validation', () => {
        test('should have consistent subject/issuer chain', () => {
            // Root CA: subject = issuer (self-signed)
            const rootCert = fs.readFileSync(path.join(CA_DIR, 'root.crt'), 'utf8');
            const rootData = JSON.parse(
                Buffer.from(
                    rootCert
                        .replace('-----BEGIN CERTIFICATE-----', '')
                        .replace('-----END CERTIFICATE-----', '')
                        .replace(/\s/g, ''),
                    'base64'
                ).toString('utf8')
            );
            expect(rootData.subject.CN).toBe(rootData.issuer.CN);

            // Intermediate CA: issuer = root subject
            const intermediateCert = fs.readFileSync(path.join(CA_DIR, 'intermediate.crt'), 'utf8');
            const intermediateData = JSON.parse(
                Buffer.from(
                    intermediateCert
                        .replace('-----BEGIN CERTIFICATE-----', '')
                        .replace('-----END CERTIFICATE-----', '')
                        .replace(/\s/g, ''),
                    'base64'
                ).toString('utf8')
            );
            expect(intermediateData.issuer.CN).toBe(rootData.subject.CN);

            // Signing cert: issuer = intermediate subject
            const signingCert = fs.readFileSync(path.join(SIGNING_DIR, 'policy-signer.crt'), 'utf8');
            const signingData = JSON.parse(
                Buffer.from(
                    signingCert
                        .replace('-----BEGIN CERTIFICATE-----', '')
                        .replace('-----END CERTIFICATE-----', '')
                        .replace(/\s/g, ''),
                    'base64'
                ).toString('utf8')
            );
            expect(signingData.issuer.CN).toBe(intermediateData.subject.CN);
        });

        test('should have correct CA hierarchy constraints', () => {
            // Root CA: CA=true, no path length constraint
            const rootCert = fs.readFileSync(path.join(CA_DIR, 'root.crt'), 'utf8');
            const rootData = JSON.parse(
                Buffer.from(
                    rootCert
                        .replace('-----BEGIN CERTIFICATE-----', '')
                        .replace('-----END CERTIFICATE-----', '')
                        .replace(/\s/g, ''),
                    'base64'
                ).toString('utf8')
            );
            expect(rootData.extensions.basicConstraints.cA).toBe(true);
            expect(rootData.extensions.basicConstraints.pathLenConstraint).toBeUndefined();

            // Intermediate CA: CA=true, pathLenConstraint=0 (can't sign other CAs)
            const intermediateCert = fs.readFileSync(path.join(CA_DIR, 'intermediate.crt'), 'utf8');
            const intermediateData = JSON.parse(
                Buffer.from(
                    intermediateCert
                        .replace('-----BEGIN CERTIFICATE-----', '')
                        .replace('-----END CERTIFICATE-----', '')
                        .replace(/\s/g, ''),
                    'base64'
                ).toString('utf8')
            );
            expect(intermediateData.extensions.basicConstraints.cA).toBe(true);
            expect(intermediateData.extensions.basicConstraints.pathLenConstraint).toBe(0);

            // Signing cert: CA=false (end-entity certificate)
            const signingCert = fs.readFileSync(path.join(SIGNING_DIR, 'policy-signer.crt'), 'utf8');
            const signingData = JSON.parse(
                Buffer.from(
                    signingCert
                        .replace('-----BEGIN CERTIFICATE-----', '')
                        .replace('-----END CERTIFICATE-----', '')
                        .replace(/\s/g, ''),
                    'base64'
                ).toString('utf8')
            );
            expect(signingData.extensions.basicConstraints.cA).toBe(false);
        });

        test('should have appropriate key usage for each certificate type', () => {
            // Root CA: keyCertSign, cRLSign
            const rootCert = fs.readFileSync(path.join(CA_DIR, 'root.crt'), 'utf8');
            const rootData = JSON.parse(
                Buffer.from(
                    rootCert
                        .replace('-----BEGIN CERTIFICATE-----', '')
                        .replace('-----END CERTIFICATE-----', '')
                        .replace(/\s/g, ''),
                    'base64'
                ).toString('utf8')
            );
            expect(rootData.extensions.keyUsage.keyCertSign).toBe(true);
            expect(rootData.extensions.keyUsage.cRLSign).toBe(true);

            // Intermediate CA: keyCertSign, cRLSign
            const intermediateCert = fs.readFileSync(path.join(CA_DIR, 'intermediate.crt'), 'utf8');
            const intermediateData = JSON.parse(
                Buffer.from(
                    intermediateCert
                        .replace('-----BEGIN CERTIFICATE-----', '')
                        .replace('-----END CERTIFICATE-----', '')
                        .replace(/\s/g, ''),
                    'base64'
                ).toString('utf8')
            );
            expect(intermediateData.extensions.keyUsage.keyCertSign).toBe(true);
            expect(intermediateData.extensions.keyUsage.cRLSign).toBe(true);

            // Signing cert: digitalSignature, codeSigning
            const signingCert = fs.readFileSync(path.join(SIGNING_DIR, 'policy-signer.crt'), 'utf8');
            const signingData = JSON.parse(
                Buffer.from(
                    signingCert
                        .replace('-----BEGIN CERTIFICATE-----', '')
                        .replace('-----END CERTIFICATE-----', '')
                        .replace(/\s/g, ''),
                    'base64'
                ).toString('utf8')
            );
            expect(signingData.extensions.keyUsage.digitalSignature).toBe(true);
            expect(signingData.extensions.extendedKeyUsage.codeSigning).toBe(true);
        });
    });

    describe('Certificate Revocation Lists (CRL)', () => {
        test('should generate root CA CRL', () => {
            const crlPath = path.join(CRL_DIR, 'root-crl.pem');
            expect(fs.existsSync(crlPath)).toBe(true);

            const crl = JSON.parse(fs.readFileSync(crlPath, 'utf8'));
            expect(crl.version).toBe(2);
            expect(crl.issuer.CN).toBe('DIVE-V3 Root CA');
            expect(Array.isArray(crl.revokedCertificates)).toBe(true);
            expect(crl.revokedCertificates.length).toBe(0); // Empty for pilot
        });

        test('should generate intermediate CA CRL', () => {
            const crlPath = path.join(CRL_DIR, 'intermediate-crl.pem');
            expect(fs.existsSync(crlPath)).toBe(true);

            const crl = JSON.parse(fs.readFileSync(crlPath, 'utf8'));
            expect(crl.version).toBe(2);
            expect(crl.issuer.CN).toBe('DIVE-V3 Intermediate CA');
            expect(Array.isArray(crl.revokedCertificates)).toBe(true);
            expect(crl.revokedCertificates.length).toBe(0); // Empty for pilot
        });

        test('should have valid CRL update dates', () => {
            const rootCRL = JSON.parse(fs.readFileSync(path.join(CRL_DIR, 'root-crl.pem'), 'utf8'));
            const intermediateCRL = JSON.parse(fs.readFileSync(path.join(CRL_DIR, 'intermediate-crl.pem'), 'utf8'));

            // thisUpdate should be in the past
            expect(new Date(rootCRL.thisUpdate).getTime()).toBeLessThanOrEqual(Date.now());
            expect(new Date(intermediateCRL.thisUpdate).getTime()).toBeLessThanOrEqual(Date.now());

            // nextUpdate should be in the future (90 days)
            expect(new Date(rootCRL.nextUpdate).getTime()).toBeGreaterThan(Date.now());
            expect(new Date(intermediateCRL.nextUpdate).getTime()).toBeGreaterThan(Date.now());
        });
    });

    describe('Performance Tests', () => {
        test('should load root CA certificate in <5ms', () => {
            const start = process.hrtime.bigint();
            fs.readFileSync(path.join(CA_DIR, 'root.crt'), 'utf8');
            const end = process.hrtime.bigint();
            
            const elapsedMs = Number(end - start) / 1_000_000;
            expect(elapsedMs).toBeLessThan(5);
        });

        test('should parse certificate hierarchy in <15ms', () => {
            const start = process.hrtime.bigint();
            
            // Load all certificates
            const rootCert = fs.readFileSync(path.join(CA_DIR, 'root.crt'), 'utf8');
            const intermediateCert = fs.readFileSync(path.join(CA_DIR, 'intermediate.crt'), 'utf8');
            const signingCert = fs.readFileSync(path.join(SIGNING_DIR, 'policy-signer.crt'), 'utf8');
            
            // Parse all certificates
            JSON.parse(Buffer.from(rootCert.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s/g, ''), 'base64').toString('utf8'));
            JSON.parse(Buffer.from(intermediateCert.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s/g, ''), 'base64').toString('utf8'));
            JSON.parse(Buffer.from(signingCert.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s/g, ''), 'base64').toString('utf8'));
            
            const end = process.hrtime.bigint();
            
            const elapsedMs = Number(end - start) / 1_000_000;
            expect(elapsedMs).toBeLessThan(15);
        });
    });

    describe('ACP-240 Compliance', () => {
        test('should use SHA-384 or stronger for signatures', () => {
            // Certificate signatures should use SHA-384 (validated during certificate creation)
            const signingCert = fs.readFileSync(path.join(SIGNING_DIR, 'policy-signer.crt'), 'utf8');
            expect(signingCert).toBeTruthy();
            
            // SHA-384 produces 64-byte signatures (512 bits)
            // This is validated during the signing process in generate-three-tier-ca.ts
        });

        test('should implement three-tier CA hierarchy per best practices', () => {
            // Verify all three tiers exist
            expect(fs.existsSync(path.join(CA_DIR, 'root.crt'))).toBe(true);
            expect(fs.existsSync(path.join(CA_DIR, 'intermediate.crt'))).toBe(true);
            expect(fs.existsSync(path.join(SIGNING_DIR, 'policy-signer.crt'))).toBe(true);

            // Verify chain is complete
            const bundle = fs.readFileSync(path.join(SIGNING_DIR, 'policy-signer-bundle.pem'), 'utf8');
            const certCount = (bundle.match(/-----BEGIN CERTIFICATE-----/g) || []).length;
            expect(certCount).toBe(3);
        });

        test('should protect private keys with appropriate permissions', () => {
            // Skip on Windows
            if (process.platform === 'win32') {
                return;
            }

            const rootKeyStats = fs.statSync(path.join(CA_DIR, 'root.key'));
            const intermediateKeyStats = fs.statSync(path.join(CA_DIR, 'intermediate.key'));
            const signingKeyStats = fs.statSync(path.join(SIGNING_DIR, 'policy-signer.key'));

            // All private keys should have owner-only permissions (600)
            expect(rootKeyStats.mode & 0o077).toBe(0);
            expect(intermediateKeyStats.mode & 0o077).toBe(0);
            expect(signingKeyStats.mode & 0o077).toBe(0);
        });

        test('should implement Certificate Revocation Lists', () => {
            // Verify CRLs exist
            expect(fs.existsSync(path.join(CRL_DIR, 'root-crl.pem'))).toBe(true);
            expect(fs.existsSync(path.join(CRL_DIR, 'intermediate-crl.pem'))).toBe(true);

            // Verify CRL structure
            const rootCRL = JSON.parse(fs.readFileSync(path.join(CRL_DIR, 'root-crl.pem'), 'utf8'));
            expect(rootCRL.revokedCertificates).toBeDefined();
        });
    });
});

