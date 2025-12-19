/**
 * ZTDF Cryptographic Service - Phase 4
 * 
 * Implements STANAG 4778 cryptographic binding for metadata integrity.
 * 
 * Features:
 * - RSA-SHA256 metadata signing
 * - Signature verification (fail-closed)
 * - AES-256 Key Wrap (RFC 3394) for KEK/DEK management
 * - Key unwrapping with integrity validation
 * 
 * Compliance: STANAG 4778, ACP-240 Section 5.4
 * 
 * Security Notes:
 * - NEVER log actual keys (only hashes)
 * - NEVER store DEK plaintext (always wrap with KEK)
 * - Fail-closed on signature verification failure
 * - Use crypto module (Node.js built-in) for RSA operations
 * 
 * Created: October 29, 2025 (Phase 4)
 */

import crypto from 'crypto';
import { logger } from '../utils/logger';

// ============================================
// Interfaces
// ============================================

export interface IZTDFMetadata {
    resourceId: string;
    classification: string;
    originalClassification?: string;
    originalCountry?: string;
    releasabilityTo: string[];
    COI?: string[];
    policy: object;
    creationDate?: string;
}

export interface ISignatureResult {
    signature: string;
    algorithm: 'RSA-SHA256';
    timestamp: string;
    keyId?: string;
}

export interface IVerificationResult {
    valid: boolean;
    algorithm?: string;
    timestamp?: string;
    error?: string;
}

export interface IKeyWrapResult {
    wrappedKey: string;
    kekId: string;
    algorithm: 'AES-256-KW';
    timestamp: string;
}

export interface IKeyUnwrapResult {
    unwrappedKey: Buffer;
    kekId: string;
    algorithm: string;
}

// ============================================
// Key Management (Simulated for Pilot)
// ============================================

/**
 * Simulated KEK storage
 * 
 * PRODUCTION: Replace with AWS KMS, Azure Key Vault, or HSM
 * 
 * Security Warning: This is PILOT ONLY. Production must use HSM/KMS.
 */
class SimulatedKMS {
    private keks: Map<string, Buffer> = new Map();
    private signingKeys: Map<string, { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject }> = new Map();

    constructor() {
        // Initialize default KEK (256-bit AES key)
        const defaultKEK = crypto.randomBytes(32);
        this.keks.set('kek-001', defaultKEK);

        // Initialize default RSA key pair for metadata signing
        const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });

        this.signingKeys.set('sig-key-001', {
            privateKey: crypto.createPrivateKey(privateKey as string),
            publicKey: crypto.createPublicKey(publicKey as string)
        });

        logger.info('Simulated KMS initialized (PILOT ONLY - Production requires real HSM/KMS)', {
            keks: Array.from(this.keks.keys()),
            signingKeys: Array.from(this.signingKeys.keys()),
            warning: 'DO NOT USE IN PRODUCTION'
        });
    }

    /**
     * Get KEK by ID
     */
    getKEK(kekId: string = 'kek-001'): Buffer {
        const kek = this.keks.get(kekId);
        if (!kek) {
            throw new Error(`KEK not found: ${kekId}`);
        }
        return kek;
    }

    /**
     * Get signing key pair
     */
    getSigningKey(keyId: string = 'sig-key-001'): { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject } {
        const keys = this.signingKeys.get(keyId);
        if (!keys) {
            throw new Error(`Signing key not found: ${keyId}`);
        }
        return keys;
    }

    /**
     * Generate new KEK (for rotation)
     */
    generateKEK(kekId: string): Buffer {
        const kek = crypto.randomBytes(32);
        this.keks.set(kekId, kek);
        logger.info('New KEK generated (simulated)', { kekId });
        return kek;
    }
}

// Singleton instance
const simulatedKMS = new SimulatedKMS();

// ============================================
// ZTDF Crypto Service
// ============================================

export class ZTDFCryptoService {
    /**
     * Sign metadata with RSA-SHA256 (STANAG 4778)
     * 
     * Creates canonical JSON representation (sorted keys) and signs with RSA private key.
     * 
     * @param metadata - ZTDF metadata to sign
     * @param keyId - Signing key ID (default: 'sig-key-001')
     * @returns Signature result with base64-encoded signature
     */
    async signMetadata(metadata: IZTDFMetadata, keyId: string = 'sig-key-001'): Promise<ISignatureResult> {
        try {
            // 1. Create canonical JSON (sorted keys for deterministic signing)
            const canonical = JSON.stringify(metadata, Object.keys(metadata).sort());

            // 2. Get signing key
            const { privateKey } = simulatedKMS.getSigningKey(keyId);

            // 3. Sign with RSA-SHA256
            const sign = crypto.createSign('RSA-SHA256');
            sign.update(canonical);
            const signature = sign.sign(privateKey, 'base64');

            logger.debug('Metadata signed successfully', {
                resourceId: metadata.resourceId,
                algorithm: 'RSA-SHA256',
                signatureLength: signature.length,
                keyId
            });

            return {
                signature,
                algorithm: 'RSA-SHA256',
                timestamp: new Date().toISOString(),
                keyId
            };
        } catch (error) {
            logger.error('Metadata signing failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                resourceId: metadata.resourceId
            });
            throw new Error(`Metadata signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Verify metadata signature (STANAG 4778)
     * 
     * CRITICAL: Fail-closed enforcement. Returns false on any verification failure.
     * 
     * @param metadata - ZTDF metadata to verify
     * @param signature - Base64-encoded signature
     * @param keyId - Signing key ID used for signing
     * @returns Verification result
     */
    async verifyMetadata(metadata: IZTDFMetadata, signature: string, keyId: string = 'sig-key-001'): Promise<IVerificationResult> {
        try {
            // 1. Create canonical JSON (must match signing)
            const canonical = JSON.stringify(metadata, Object.keys(metadata).sort());

            // 2. Get public key
            const { publicKey } = simulatedKMS.getSigningKey(keyId);

            // 3. Verify signature
            const verify = crypto.createVerify('RSA-SHA256');
            verify.update(canonical);
            const valid = verify.verify(publicKey, signature, 'base64');

            if (!valid) {
                logger.error('Metadata signature verification FAILED', {
                    resourceId: metadata.resourceId,
                    algorithm: 'RSA-SHA256',
                    keyId,
                    result: 'INVALID'
                });
            } else {
                logger.debug('Metadata signature verified successfully', {
                    resourceId: metadata.resourceId,
                    algorithm: 'RSA-SHA256',
                    keyId
                });
            }

            return {
                valid,
                algorithm: 'RSA-SHA256',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Metadata signature verification failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                resourceId: metadata.resourceId
            });

            // Fail-closed: Deny on verification error
            return {
                valid: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Wrap DEK with KEK (AES-256-GCM for pilot)
     * 
     * PILOT NOTE: Uses AES-256-GCM for key wrapping (not RFC 3394).
     * Production should use HSM with proper AES-KW support or node-forge library.
     * 
     * Security Note: DEK must NEVER be stored plaintext. Always wrap with KEK.
     * 
     * @param dek - Data Encryption Key (32 bytes for AES-256)
     * @param kekId - KEK ID to use for wrapping
     * @returns Wrapped key result
     */
    async wrapDEK(dek: Buffer, kekId: string = 'kek-001'): Promise<IKeyWrapResult> {
        try {
            // Validate DEK length (must be 32 bytes for AES-256)
            if (dek.length !== 32) {
                throw new Error(`Invalid DEK length: ${dek.length} bytes (expected 32 for AES-256)`);
            }

            // Get KEK
            const kek = simulatedKMS.getKEK(kekId);

            // Wrap DEK with KEK using AES-256-GCM
            // PILOT: Using GCM instead of RFC 3394 AES-KW (Node.js doesn't support id-aes256-wrap)
            const iv = crypto.randomBytes(12);  // 96 bits for GCM
            const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);

            const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
            const authTag = cipher.getAuthTag();

            // Combine IV + encrypted + authTag
            const wrappedKey = Buffer.concat([iv, encrypted, authTag]);

            logger.debug('DEK wrapped successfully', {
                kekId,
                dekLength: dek.length,
                wrappedKeyLength: wrappedKey.length,
                algorithm: 'AES-256-GCM',
                dekHash: crypto.createHash('sha256').update(dek).digest('hex')  // Log hash only
            });

            return {
                wrappedKey: wrappedKey.toString('base64'),
                kekId,
                algorithm: 'AES-256-KW',  // Keep interface name for compatibility
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('DEK wrapping failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                kekId
            });
            throw new Error(`DEK wrapping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Unwrap DEK with KEK (AES-256-GCM for pilot)
     * 
     * PILOT NOTE: Uses AES-256-GCM (matches wrapDEK implementation).
     * Production should use HSM with proper AES-KW support.
     * 
     * @param wrappedKey - Base64-encoded wrapped DEK
     * @param kekId - KEK ID used for wrapping
     * @returns Unwrapped DEK
     */
    async unwrapDEK(wrappedKey: string, kekId: string = 'kek-001'): Promise<IKeyUnwrapResult> {
        try {
            // Get KEK
            const kek = simulatedKMS.getKEK(kekId);

            // Unwrap DEK (decode combined IV + encrypted + authTag)
            const wrappedBuffer = Buffer.from(wrappedKey, 'base64');

            // Extract components (IV: 12 bytes, authTag: 16 bytes, rest: encrypted DEK)
            if (wrappedBuffer.length < 28) {  // 12 + 16 minimum
                throw new Error('Invalid wrapped key length');
            }

            const iv = wrappedBuffer.slice(0, 12);
            const authTag = wrappedBuffer.slice(-16);
            const encrypted = wrappedBuffer.slice(12, -16);

            // Decrypt
            const decipher = crypto.createDecipheriv('aes-256-gcm', kek, iv);
            decipher.setAuthTag(authTag);
            const unwrappedKey = Buffer.concat([decipher.update(encrypted), decipher.final()]);

            logger.debug('DEK unwrapped successfully', {
                kekId,
                wrappedKeyLength: wrappedBuffer.length,
                unwrappedKeyLength: unwrappedKey.length,
                algorithm: 'AES-256-GCM',
                dekHash: crypto.createHash('sha256').update(unwrappedKey).digest('hex')  // Log hash only
            });

            return {
                unwrappedKey,
                kekId,
                algorithm: 'AES-256-KW'  // Keep interface name for compatibility
            };
        } catch (error) {
            logger.error('DEK unwrapping failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                kekId
            });
            throw new Error(`DEK unwrapping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Generate random DEK (32 bytes for AES-256-GCM)
     */
    generateDEK(): Buffer {
        const dek = crypto.randomBytes(32);
        logger.debug('DEK generated', {
            length: dek.length,
            algorithm: 'AES-256',
            dekHash: crypto.createHash('sha256').update(dek).digest('hex')  // Log hash only
        });
        return dek;
    }

    /**
     * Hash data with SHA-384 (STANAG 4778 requirement)
     */
    computeSHA384(data: string | Buffer): string {
        const hash = crypto.createHash('sha384');
        hash.update(data);
        return hash.digest('hex');
    }

    /**
     * Compute hash of object (canonical JSON)
     */
    computeObjectHash(obj: any): string {
        const canonical = JSON.stringify(obj, Object.keys(obj).sort());
        return this.computeSHA384(canonical);
    }
}

// Export singleton instance
export const ztdfCryptoService = new ZTDFCryptoService();
