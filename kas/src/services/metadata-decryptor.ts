/**
 * ACP-240 Encrypted Metadata Decryptor Service
 * 
 * Implements KAS-REQ-070: EncryptedMetadata decryption and policy validation
 * 
 * Phase 4.1.1: Optional Features - EncryptedMetadata
 * 
 * Features:
 * - Decrypt encryptedMetadata using KAS private key (RSA-OAEP-256)
 * - Extract embedded policy assertions from metadata
 * - Validate decrypted metadata against policyBinding
 * - Support AES-256-GCM for metadata encryption
 * - Comprehensive error handling and logging
 */

import crypto from 'crypto';
import { kasLogger } from '../utils/kas-logger';
import { IPolicy } from '../types/rewrap.types';

// ============================================
// Type Definitions
// ============================================

/**
 * Decrypted Metadata Structure
 */
export interface IDecryptedMetadata {
    /** Metadata fields (key-value pairs) */
    fields: Record<string, unknown>;

    /** Embedded policy assertions (optional) */
    policyAssertion?: IPolicyAssertion;

    /** Original encryption algorithm */
    algorithm?: string;

    /** Decryption timestamp */
    decryptedAt?: string;
}

/**
 * Policy Assertion embedded in metadata
 * Used to verify metadata integrity against request policy
 */
export interface IPolicyAssertion {
    /** Policy hash (SHA-256 of canonical policy JSON) */
    policyHash?: string;

    /** Classification level from policy */
    classification?: string;

    /** Releasability countries from policy */
    releasabilityTo?: string[];

    /** Communities of Interest from policy */
    COI?: string[];

    /** Creation timestamp */
    createdAt?: string;

    /** Additional policy fields */
    [key: string]: unknown;
}

/**
 * Metadata Validation Result
 */
export interface IMetadataValidationResult {
    /** Validation passed */
    valid: boolean;

    /** Reason for validation failure (if invalid) */
    reason?: string;

    /** Expected policy hash */
    expectedPolicyHash?: string;

    /** Actual policy hash from metadata */
    actualPolicyHash?: string;

    /** Policy fields that mismatched */
    mismatches?: string[];
}

/**
 * Metadata Decryption Options
 */
export interface IMetadataDecryptionOptions {
    /** Encryption algorithm (default: AES-256-GCM) */
    algorithm?: 'AES-256-GCM' | 'RSA-OAEP-256';

    /** Validate policy assertions (default: true) */
    validatePolicy?: boolean;

    /** Expected policy (for validation) */
    expectedPolicy?: IPolicy;

    /** Expected policy hash (for validation) */
    expectedPolicyHash?: string;
}

// ============================================
// Metadata Decryptor Service
// ============================================

export class MetadataDecryptorService {
    /**
     * Decrypt encryptedMetadata using decryption key
     * 
     * @param encryptedMetadata - Base64-encoded encrypted metadata
     * @param decryptionKey - Key for decryption (Buffer)
     * @param options - Decryption options
     * @returns Decrypted metadata with policy assertions
     */
    async decryptMetadata(
        encryptedMetadata: string,
        decryptionKey: Buffer,
        options: IMetadataDecryptionOptions = {}
    ): Promise<IDecryptedMetadata> {
        const algorithm = options.algorithm || 'AES-256-GCM';

        try {
            kasLogger.debug('Decrypting metadata', {
                algorithm,
                encryptedLength: encryptedMetadata.length,
                keyLength: decryptionKey.length,
            });

            let decryptedJson: string;

            switch (algorithm) {
                case 'AES-256-GCM':
                    decryptedJson = this.decryptAESGCM(encryptedMetadata, decryptionKey);
                    break;

                case 'RSA-OAEP-256':
                    decryptedJson = this.decryptRSAOAEP(encryptedMetadata, decryptionKey);
                    break;

                default:
                    throw new Error(`Unsupported metadata encryption algorithm: ${algorithm}`);
            }

            // Parse decrypted JSON
            const metadata = JSON.parse(decryptedJson);

            const result: IDecryptedMetadata = {
                fields: metadata.fields || metadata,
                policyAssertion: metadata.policyAssertion,
                algorithm,
                decryptedAt: new Date().toISOString(),
            };

            kasLogger.info('Metadata decrypted successfully', {
                algorithm,
                fieldCount: Object.keys(result.fields).length,
                hasPolicyAssertion: !!result.policyAssertion,
                decryptedSize: decryptedJson.length,
            });

            // Validate policy if requested
            if (options.validatePolicy && result.policyAssertion) {
                const validationResult = this.validateMetadataPolicyMatch(
                    result,
                    options.expectedPolicy,
                    options.expectedPolicyHash
                );

                if (!validationResult.valid) {
                    throw new Error(
                        `Metadata policy validation failed: ${validationResult.reason}`
                    );
                }
            }

            return result;

        } catch (error) {
            kasLogger.error('Metadata decryption failed', {
                algorithm,
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            throw new Error(
                `Failed to decrypt metadata: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`
            );
        }
    }

    /**
     * Decrypt using AES-256-GCM
     * Format: IV (12 bytes) + authTag (16 bytes) + ciphertext
     */
    private decryptAESGCM(encryptedMetadata: string, key: Buffer): string {
        try {
            const encryptedBuffer = Buffer.from(encryptedMetadata, 'base64');

            // Validate buffer length
            if (encryptedBuffer.length < 28) {
                throw new Error('Invalid encrypted metadata: too short (min 28 bytes)');
            }

            // Extract components
            const iv = encryptedBuffer.subarray(0, 12);
            const authTag = encryptedBuffer.subarray(12, 28);
            const ciphertext = encryptedBuffer.subarray(28);

            kasLogger.debug('AES-GCM decryption components', {
                ivLength: iv.length,
                authTagLength: authTag.length,
                ciphertextLength: ciphertext.length,
            });

            // Validate key length (must be 32 bytes for AES-256)
            if (key.length !== 32) {
                throw new Error(`Invalid key length: ${key.length} (expected 32 for AES-256)`);
            }

            // Create decipher
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(authTag);

            // Decrypt
            let decrypted = decipher.update(ciphertext);
            decrypted = Buffer.concat([decrypted, decipher.final()]);

            return decrypted.toString('utf8');

        } catch (error) {
            kasLogger.error('AES-GCM decryption failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    /**
     * Decrypt using RSA-OAEP-256
     * (KAS private key decryption)
     */
    private decryptRSAOAEP(encryptedMetadata: string, privateKeyBuffer: Buffer): string {
        try {
            const encryptedBuffer = Buffer.from(encryptedMetadata, 'base64');

            // Create KeyObject from private key buffer
            const privateKey = crypto.createPrivateKey({
                key: privateKeyBuffer,
                format: 'pem',
                type: 'pkcs1',
            });

            // Decrypt using RSA-OAEP with SHA-256
            const decrypted = crypto.privateDecrypt(
                {
                    key: privateKey,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                    oaepHash: 'sha256',
                },
                encryptedBuffer
            );

            return decrypted.toString('utf8');

        } catch (error) {
            kasLogger.error('RSA-OAEP decryption failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    /**
     * Validate metadata policy assertions against expected policy
     * 
     * @param metadata - Decrypted metadata with policy assertions
     * @param expectedPolicy - Expected policy from request
     * @param expectedPolicyHash - Expected policy hash from policyBinding
     * @returns Validation result
     */
    validateMetadataPolicyMatch(
        metadata: IDecryptedMetadata,
        expectedPolicy?: IPolicy,
        expectedPolicyHash?: string
    ): IMetadataValidationResult {
        const policyAssertion = metadata.policyAssertion;

        if (!policyAssertion) {
            // No policy assertion in metadata - validation passes (optional field)
            kasLogger.debug('No policy assertion in metadata, skipping validation');
            return { valid: true };
        }

        const mismatches: string[] = [];

        try {
            // 1. Validate policy hash (if provided)
            if (expectedPolicyHash && policyAssertion.policyHash) {
                if (policyAssertion.policyHash !== expectedPolicyHash) {
                    mismatches.push('policyHash');
                    kasLogger.warn('Policy hash mismatch', {
                        expected: expectedPolicyHash,
                        actual: policyAssertion.policyHash,
                    });
                }
            }

            // 2. Validate policy fields against expectedPolicy (if provided)
            if (expectedPolicy && expectedPolicy.dissem) {
                const dissem = expectedPolicy.dissem;

                // Check classification
                if (dissem.classification && policyAssertion.classification) {
                    if (dissem.classification !== policyAssertion.classification) {
                        mismatches.push('classification');
                        kasLogger.warn('Classification mismatch', {
                            expected: dissem.classification,
                            actual: policyAssertion.classification,
                        });
                    }
                }

                // Check releasabilityTo
                if (dissem.releasabilityTo && policyAssertion.releasabilityTo) {
                    const expectedCountries = new Set(dissem.releasabilityTo);
                    const actualCountries = new Set(policyAssertion.releasabilityTo);

                    if (!this.setsEqual(expectedCountries, actualCountries)) {
                        mismatches.push('releasabilityTo');
                        kasLogger.warn('ReleasabilityTo mismatch', {
                            expected: Array.from(expectedCountries),
                            actual: Array.from(actualCountries),
                        });
                    }
                }

                // Check COI
                if (dissem.COI && policyAssertion.COI) {
                    const expectedCOI = new Set(dissem.COI);
                    const actualCOI = new Set(policyAssertion.COI);

                    if (!this.setsEqual(expectedCOI, actualCOI)) {
                        mismatches.push('COI');
                        kasLogger.warn('COI mismatch', {
                            expected: Array.from(expectedCOI),
                            actual: Array.from(actualCOI),
                        });
                    }
                }
            }

            // Validation result
            if (mismatches.length > 0) {
                return {
                    valid: false,
                    reason: `Policy assertion mismatches: ${mismatches.join(', ')}`,
                    expectedPolicyHash,
                    actualPolicyHash: policyAssertion.policyHash,
                    mismatches,
                };
            }

            kasLogger.info('Metadata policy validation passed', {
                policyHash: policyAssertion.policyHash,
                fieldsValidated: ['classification', 'releasabilityTo', 'COI'].filter(
                    field => policyAssertion[field]
                ),
            });

            return {
                valid: true,
                expectedPolicyHash,
                actualPolicyHash: policyAssertion.policyHash,
            };

        } catch (error) {
            kasLogger.error('Metadata policy validation error', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            return {
                valid: false,
                reason: `Validation error: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`,
            };
        }
    }

    /**
     * Compute canonical policy hash (SHA-256)
     * Used to verify policy binding integrity
     * 
     * @param policy - Policy object
     * @returns Base64-encoded SHA-256 hash
     */
    computePolicyHash(policy: IPolicy): string {
        try {
            // Create canonical JSON representation (sorted keys)
            const canonicalPolicy = this.canonicalizePolicy(policy);
            const policyJson = JSON.stringify(canonicalPolicy);

            // Compute SHA-256 hash
            const hash = crypto.createHash('sha256').update(policyJson).digest();

            return hash.toString('base64');

        } catch (error) {
            kasLogger.error('Policy hash computation failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    /**
     * Canonicalize policy for hashing (sort keys recursively)
     */
    private canonicalizePolicy(obj: any): any {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.canonicalizePolicy(item));
        }

        // Sort object keys
        const sortedKeys = Object.keys(obj).sort();
        const canonical: any = {};

        for (const key of sortedKeys) {
            canonical[key] = this.canonicalizePolicy(obj[key]);
        }

        return canonical;
    }

    /**
     * Check if two sets are equal
     */
    private setsEqual<T>(set1: Set<T>, set2: Set<T>): boolean {
        if (set1.size !== set2.size) {
            return false;
        }

        for (const item of set1) {
            if (!set2.has(item)) {
                return false;
            }
        }

        return true;
    }
}

// ============================================
// Singleton Export
// ============================================

export const metadataDecryptorService = new MetadataDecryptorService();
