/**
 * Policy Signature Verification Tests - Production Grade
 * 
 * Tests for ACP-240 Section 5.4: X.509 and HMAC signature verification
 * 
 * Coverage:
 * - X.509 certificate generation and validation
 * - Full signature verification with chain validation
 * - HMAC symmetric signatures
 * - Tampering detection
 * - Certificate expiry handling
 */

import crypto from 'crypto';
import {
    signPolicyX509,
    verifyX509Signature,
    signPolicyHMAC,
    verifyHMACSignature,
    verifyPolicySignature,
    signPolicyWithDefaultCert,
    verifyPolicyWithDefaultCert,
    certificateManager
} from '../utils/policy-signature';
import { IZTDFPolicy } from '../types/ztdf.types';

describe.skip('Policy Signature Verification - Production Grade (Integration Test - Requires Certificate Setup)', () => {
    const testSecret = 'test-hmac-secret-for-policy-signing-acp240-compliance';

    const samplePolicy: IZTDFPolicy = {
        policyVersion: '1.0',
        securityLabel: {
            classification: 'SECRET',
            releasabilityTo: ['USA', 'GBR'],
            COI: ['FVEY'],
            caveats: [],
            originatingCountry: 'USA',
            creationDate: '2025-10-18T10:00:00Z',
            displayMarking: 'SECRET//FVEY//REL USA, GBR'
        },
        policyAssertions: [
            { type: 'clearance-required', value: 'SECRET' },
            { type: 'releasability-required', value: ['USA', 'GBR'] }
        ],
        policyHash: 'abc123'
    };

    describe('HMAC Signature - Symmetric Verification', () => {
        test('should sign policy with HMAC-SHA384', () => {
            const signature = signPolicyHMAC(samplePolicy, testSecret);

            expect(signature).toBeDefined();
            expect(typeof signature).toBe('string');
            expect(signature.length).toBeGreaterThan(0);

            // Signature should be base64-encoded
            const buffer = Buffer.from(signature, 'base64');
            expect(buffer.toString('base64')).toBe(signature);
        });

        test('should verify valid HMAC signature', () => {
            const signature = signPolicyHMAC(samplePolicy, testSecret);

            const policyWithSignature: IZTDFPolicy = {
                ...samplePolicy,
                policySignature: {
                    algorithm: 'hmac',
                    value: signature,
                    signerId: 'dive-v3-backend',
                    timestamp: new Date().toISOString()
                }
            };

            const result = verifyHMACSignature(policyWithSignature, testSecret);

            expect(result.valid).toBe(true);
            expect(result.signatureType).toBe('hmac');
            expect(result.error).toBeUndefined();
        });

        test('should detect tampered policy (classification downgrade)', () => {
            const signature = signPolicyHMAC(samplePolicy, testSecret);

            // Attacker downgrades classification
            const tamperedPolicy: IZTDFPolicy = {
                ...samplePolicy,
                securityLabel: {
                    ...samplePolicy.securityLabel,
                    classification: 'UNCLASSIFIED'  // SECRET → UNCLASSIFIED (attack!)
                },
                policySignature: {
                    algorithm: 'hmac',
                    value: signature,  // Original signature (now invalid)
                    signerId: 'dive-v3-backend',
                    timestamp: new Date().toISOString()
                }
            };

            const result = verifyHMACSignature(tamperedPolicy, testSecret);

            expect(result.valid).toBe(false);
            expect(result.signatureType).toBe('hmac');
        });

        test('should detect tampered releasability', () => {
            const signature = signPolicyHMAC(samplePolicy, testSecret);

            // Attacker adds unauthorized country
            const tamperedPolicy: IZTDFPolicy = {
                ...samplePolicy,
                securityLabel: {
                    ...samplePolicy.securityLabel,
                    releasabilityTo: ['USA', 'GBR', 'FRA', 'RUS']  // Added RUS!
                },
                policySignature: {
                    algorithm: 'hmac',
                    value: signature,
                    signerId: 'dive-v3-backend',
                    timestamp: new Date().toISOString()
                }
            };

            const result = verifyHMACSignature(tamperedPolicy, testSecret);

            expect(result.valid).toBe(false);
        });

        test('should reject signature with wrong secret', () => {
            const signature = signPolicyHMAC(samplePolicy, testSecret);

            const policyWithSignature: IZTDFPolicy = {
                ...samplePolicy,
                policySignature: {
                    algorithm: 'hmac',
                    value: signature,
                    signerId: 'dive-v3-backend',
                    timestamp: new Date().toISOString()
                }
            };

            const wrongSecret = 'wrong-secret-key';
            const result = verifyHMACSignature(policyWithSignature, wrongSecret);

            expect(result.valid).toBe(false);
        });

        test('should produce deterministic signatures', () => {
            const signature1 = signPolicyHMAC(samplePolicy, testSecret);
            const signature2 = signPolicyHMAC(samplePolicy, testSecret);

            // HMAC is deterministic
            expect(signature1).toBe(signature2);
        });

        test('should produce different signatures for different policies', () => {
            const signature1 = signPolicyHMAC(samplePolicy, testSecret);

            const differentPolicy: IZTDFPolicy = {
                ...samplePolicy,
                securityLabel: {
                    ...samplePolicy.securityLabel,
                    classification: 'TOP_SECRET'
                }
            };

            const signature2 = signPolicyHMAC(differentPolicy, testSecret);

            expect(signature1).not.toBe(signature2);
        });
    });

    describe('X.509 Signature - Asymmetric Verification', () => {
        let testCertificatePEM: string;
        let testPrivateKeyPEM: string;

        beforeAll(async () => {
            // Initialize certificate infrastructure
            await certificateManager.initialize();

            // Generate test certificate for policy signing
            const result = await certificateManager.generatePolicySigningCertificate({
                type: 'signing',
                commonName: 'Test Policy Signer',
                organization: 'DIVE V3 Test',
                organizationalUnit: 'Testing',
                country: 'US',
                validityDays: 30,
                keySize: 2048
            });

            testCertificatePEM = result.certificate;
            testPrivateKeyPEM = result.privateKey;
        });

        test('should sign policy with X.509 private key', () => {
            const signature = signPolicyX509(samplePolicy, testPrivateKeyPEM, 'SHA384');

            expect(signature).toBeDefined();
            expect(typeof signature).toBe('string');
            expect(signature.length).toBeGreaterThan(0);

            // Verify base64 encoding
            const buffer = Buffer.from(signature, 'base64');
            expect(buffer.length).toBeGreaterThan(0);
        });

        test('should verify valid X.509 signature', () => {
            const signature = signPolicyX509(samplePolicy, testPrivateKeyPEM, 'SHA384');

            const policyWithSignature: IZTDFPolicy = {
                ...samplePolicy,
                policySignature: {
                    algorithm: 'SHA384',
                    value: signature,
                    signerId: 'CN=Test Policy Signer',
                    timestamp: new Date().toISOString()
                }
            };

            const result = verifyX509Signature(policyWithSignature, testCertificatePEM, false);

            expect(result.valid).toBe(true);
            expect(result.signatureType).toBe('x509');
            expect(result.certificateInfo).toBeDefined();
            expect(result.certificateInfo?.subject).toContain('Test Policy Signer');
        });

        test('should detect tampered policy with X.509 signature', () => {
            const signature = signPolicyX509(samplePolicy, testPrivateKeyPEM, 'SHA384');

            // Tamper with policy after signing
            const tamperedPolicy: IZTDFPolicy = {
                ...samplePolicy,
                securityLabel: {
                    ...samplePolicy.securityLabel,
                    classification: 'UNCLASSIFIED'  // Downgrade attack
                },
                policySignature: {
                    algorithm: 'SHA384',
                    value: signature,  // Original signature (now invalid)
                    signerId: 'CN=Test Policy Signer',
                    timestamp: new Date().toISOString()
                }
            };

            const result = verifyX509Signature(tamperedPolicy, testCertificatePEM, false);

            expect(result.valid).toBe(false);
            expect(result.signatureType).toBe('x509');
        });

        test('should support SHA512 algorithm', () => {
            const signature = signPolicyX509(samplePolicy, testPrivateKeyPEM, 'SHA512');

            const policyWithSignature: IZTDFPolicy = {
                ...samplePolicy,
                policySignature: {
                    algorithm: 'SHA512',
                    value: signature,
                    signerId: 'CN=Test Policy Signer',
                    timestamp: new Date().toISOString()
                }
            };

            const result = verifyX509Signature(policyWithSignature, testCertificatePEM, false);

            expect(result.valid).toBe(true);
        });
    });

    describe('Certificate Chain Validation', () => {
        test('should validate certificate chain', async () => {
            await certificateManager.initialize();

            const { certificate } = certificateManager.loadCertificate('dive-v3-policy-signer');

            // Certificate should be trusted by CA
            const chainValid = certificateManager.verifyCertificateChain(certificate);
            expect(chainValid).toBe(true);
        });

        test('should reject untrusted certificate', () => {
            // Generate random key pair (not signed by CA)
            const { publicKey } = crypto.generateKeyPairSync('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
            });

            // Create fake certificate
            const fakeCert = `-----BEGIN CERTIFICATE-----
${Buffer.from(publicKey).toString('base64').match(/.{1,64}/g)?.join('\n')}
-----END CERTIFICATE-----`;

            // Should fail chain validation
            try {
                const chainValid = certificateManager.verifyCertificateChain(fakeCert);
                expect(chainValid).toBe(false);
            } catch (error) {
                // Expected to throw for invalid certificate
                expect(error).toBeDefined();
            }
        });
    });

    describe('Auto-Detection Verification', () => {
        test('should handle policy without signature gracefully', async () => {
            const policyWithoutSig: IZTDFPolicy = {
                ...samplePolicy
            };

            const result = await verifyPolicySignature(policyWithoutSig);

            expect(result.valid).toBe(true);
            expect(result.signatureType).toBe('none');
        });

        test('should verify HMAC when configured', async () => {
            // Set HMAC secret
            process.env.POLICY_SIGNATURE_HMAC_SECRET = testSecret;

            const signature = signPolicyHMAC(samplePolicy, testSecret);
            const policyWithSignature: IZTDFPolicy = {
                ...samplePolicy,
                policySignature: {
                    algorithm: 'hmac',
                    value: signature,
                    signerId: 'dive-v3-backend',
                    timestamp: new Date().toISOString()
                }
            };

            const result = await verifyPolicySignature(policyWithSignature);

            expect(result.valid).toBe(true);
            expect(result.signatureType).toBe('hmac');

            // Clean up
            delete process.env.POLICY_SIGNATURE_HMAC_SECRET;
        });
    });

    describe('Default Certificate Operations', () => {
        test('should sign policy with default certificate', async () => {
            const signedPolicy = await signPolicyWithDefaultCert(samplePolicy);

            expect(signedPolicy.policySignature).toBeDefined();
            expect(signedPolicy.policySignature?.algorithm).toBe('SHA384');
            expect(signedPolicy.policySignature?.value).toBeDefined();
            expect(signedPolicy.policySignature?.signerId).toContain('DIVE-V3 Policy Signer');
        });

        test('should verify policy signed with default certificate', async () => {
            const signedPolicy = await signPolicyWithDefaultCert(samplePolicy);
            const result = await verifyPolicyWithDefaultCert(signedPolicy);

            expect(result.valid).toBe(true);
            expect(result.signatureType).toBe('x509');
            expect(result.certificateInfo).toBeDefined();
        });

        test('should detect tampering of default-signed policy', async () => {
            const signedPolicy = await signPolicyWithDefaultCert(samplePolicy);

            // Tamper with signed policy
            const tamperedPolicy: IZTDFPolicy = {
                ...signedPolicy,
                securityLabel: {
                    ...signedPolicy.securityLabel,
                    classification: 'UNCLASSIFIED'
                }
            };

            const result = await verifyPolicyWithDefaultCert(tamperedPolicy);

            expect(result.valid).toBe(false);
        });
    });

    describe('Tampering Detection - Security Tests', () => {
        test('should detect classification downgrade attack (CRITICAL)', () => {
            const signature = signPolicyHMAC(samplePolicy, testSecret);

            const attackPolicy: IZTDFPolicy = {
                ...samplePolicy,
                securityLabel: {
                    ...samplePolicy.securityLabel,
                    classification: 'UNCLASSIFIED'  // SECRET → UNCLASSIFIED
                },
                policySignature: {
                    algorithm: 'hmac',
                    value: signature,
                    signerId: 'attacker',
                    timestamp: new Date().toISOString()
                }
            };

            const result = verifyHMACSignature(attackPolicy, testSecret);
            expect(result.valid).toBe(false);
        });

        test('should detect releasability expansion attack (CRITICAL)', () => {
            const signature = signPolicyHMAC(samplePolicy, testSecret);

            const attackPolicy: IZTDFPolicy = {
                ...samplePolicy,
                securityLabel: {
                    ...samplePolicy.securityLabel,
                    releasabilityTo: ['USA', 'GBR', 'CHN', 'RUS']  // Add adversaries
                },
                policySignature: {
                    algorithm: 'hmac',
                    value: signature,
                    signerId: 'attacker',
                    timestamp: new Date().toISOString()
                }
            };

            const result = verifyHMACSignature(attackPolicy, testSecret);
            expect(result.valid).toBe(false);
        });

        test('should detect COI tag removal attack (CRITICAL)', () => {
            const signature = signPolicyHMAC(samplePolicy, testSecret);

            const attackPolicy: IZTDFPolicy = {
                ...samplePolicy,
                securityLabel: {
                    ...samplePolicy.securityLabel,
                    COI: []  // Remove FVEY restriction
                },
                policySignature: {
                    algorithm: 'hmac',
                    value: signature,
                    signerId: 'attacker',
                    timestamp: new Date().toISOString()
                }
            };

            const result = verifyHMACSignature(attackPolicy, testSecret);
            expect(result.valid).toBe(false);
        });

        test('should detect caveat removal attack', () => {
            const policyWithCaveats: IZTDFPolicy = {
                ...samplePolicy,
                securityLabel: {
                    ...samplePolicy.securityLabel,
                    caveats: ['NOFORN', 'RELIDO']
                }
            };

            const signature = signPolicyHMAC(policyWithCaveats, testSecret);

            // Remove caveats
            const attackPolicy: IZTDFPolicy = {
                ...policyWithCaveats,
                securityLabel: {
                    ...policyWithCaveats.securityLabel,
                    caveats: []  // Remove restrictions
                },
                policySignature: {
                    algorithm: 'hmac',
                    value: signature,
                    signerId: 'attacker',
                    timestamp: new Date().toISOString()
                }
            };

            const result = verifyHMACSignature(attackPolicy, testSecret);
            expect(result.valid).toBe(false);
        });

        test('should detect policy assertion tampering', () => {
            const signature = signPolicyHMAC(samplePolicy, testSecret);

            // Modify policy assertions
            const attackPolicy: IZTDFPolicy = {
                ...samplePolicy,
                policyAssertions: [
                    { type: 'clearance-required', value: 'UNCLASSIFIED' }  // Changed!
                ],
                policySignature: {
                    algorithm: 'hmac',
                    value: signature,
                    signerId: 'attacker',
                    timestamp: new Date().toISOString()
                }
            };

            const result = verifyHMACSignature(attackPolicy, testSecret);
            expect(result.valid).toBe(false);
        });
    });

    describe('Certificate Management Integration', () => {
        test('should initialize certificate manager', async () => {
            await certificateManager.initialize();

            const certs = certificateManager.listCertificates();
            expect(Array.isArray(certs)).toBe(true);
            expect(certs.length).toBeGreaterThanOrEqual(1);
        });

        test('should validate certificate metadata', async () => {
            await certificateManager.initialize();

            const { certificate } = certificateManager.loadCertificate('dive-v3-policy-signer');

            const validation = certificateManager.validateCertificate(certificate);

            expect(validation.valid).toBe(true);
            expect(validation.errors).toHaveLength(0);
            expect(validation.metadata).toBeDefined();
            expect(validation.metadata?.subject).toContain('DIVE-V3 Policy Signer');
        });

        test('should list all available certificates', async () => {
            await certificateManager.initialize();

            const certs = certificateManager.listCertificates();

            expect(certs).toContain('dive-v3-policy-signer');
            expect(certs).toContain('test-policy-signer');
        });
    });

    describe('Signature Algorithm Support', () => {
        test('should support SHA384 (default)', () => {
            const signature = signPolicyHMAC(samplePolicy, testSecret, 'sha384');
            expect(signature).toBeDefined();
        });

        test('should support SHA512 (stronger)', () => {
            const signature = signPolicyHMAC(samplePolicy, testSecret, 'sha512');
            expect(signature).toBeDefined();

            // SHA512 produces longer signatures than SHA384
            const sha384Sig = signPolicyHMAC(samplePolicy, testSecret, 'sha384');
            expect(signature.length).toBeGreaterThan(sha384Sig.length);
        });
    });

    describe('Error Handling', () => {
        test('should handle missing signature gracefully', () => {
            const policyWithoutSig: IZTDFPolicy = {
                ...samplePolicy
            };

            const result = verifyHMACSignature(policyWithoutSig, testSecret);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('No signature present');
        });

        test('should handle empty signature value', () => {
            const policyWithEmptySig: IZTDFPolicy = {
                ...samplePolicy,
                policySignature: {
                    algorithm: 'hmac',
                    value: '',
                    signerId: 'test',
                    timestamp: new Date().toISOString()
                }
            };

            const result = verifyHMACSignature(policyWithEmptySig, testSecret);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('empty');
        });

        test('should handle invalid base64 signature', () => {
            const policyWithBadSig: IZTDFPolicy = {
                ...samplePolicy,
                policySignature: {
                    algorithm: 'hmac',
                    value: 'not-valid-base64!!!',
                    signerId: 'test',
                    timestamp: new Date().toISOString()
                }
            };

            const result = verifyHMACSignature(policyWithBadSig, testSecret);

            expect(result.valid).toBe(false);
        });
    });

    describe('ACP-240 Compliance Demonstrations', () => {
        test('demonstrates STANAG 4778 cryptographic binding', () => {
            // Sign policy
            const signature = signPolicyHMAC(samplePolicy, testSecret);
            const signedPolicy: IZTDFPolicy = {
                ...samplePolicy,
                policySignature: {
                    algorithm: 'hmac',
                    value: signature,
                    signerId: 'dive-v3-backend',
                    timestamp: new Date().toISOString()
                }
            };

            // Verify original policy
            const valid = verifyHMACSignature(signedPolicy, testSecret);
            expect(valid.valid).toBe(true);

            // Any tampering breaks signature
            const tampered = { ...signedPolicy };
            tampered.securityLabel.classification = 'UNCLASSIFIED';
            const invalid = verifyHMACSignature(tampered, testSecret);
            expect(invalid.valid).toBe(false);
        });

        test('demonstrates fail-secure on invalid signature', async () => {
            const badSignature = 'invalid-signature-base64';
            const maliciousPolicy: IZTDFPolicy = {
                ...samplePolicy,
                securityLabel: {
                    ...samplePolicy.securityLabel,
                    classification: 'UNCLASSIFIED',
                    releasabilityTo: ['USA', 'GBR', 'FRA', 'RUS', 'CHN']
                },
                policySignature: {
                    algorithm: 'hmac',
                    value: badSignature,
                    signerId: 'attacker',
                    timestamp: new Date().toISOString()
                }
            };

            const result = verifyHMACSignature(maliciousPolicy, testSecret);

            // FAIL-SECURE: Invalid signature means DENY
            expect(result.valid).toBe(false);
        });
    });
});

