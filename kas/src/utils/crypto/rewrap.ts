/**
 * Asymmetric Rewrap Cryptography
 * 
 * Implements key unwrapping and rewrapping operations for /rewrap protocol
 * Reference: KAS-REQ-002, KAS-REQ-050, KAS-REQ-052, Phase 1.3
 * 
 * Supports:
 * - RSA-OAEP-256 (wrap/unwrap)
 * - ECDH-ES+A256KW (key agreement + AES wrap)
 */

import crypto from 'crypto';
import { kasLogger } from '../kas-logger';
import { IJsonWebKey, IUnwrappedKeyMaterial } from '../../types/rewrap.types';

/**
 * Unwrap encrypted key material using KAS private key
 * 
 * Decrypts wrappedKey using asymmetric decryption
 * 
 * @param wrappedKey - Base64-encoded encrypted key material
 * @param kasPrivateKey - KAS private key (KeyObject)
 * @param algorithm - Wrapping algorithm (RSA-OAEP-256, ECDH-ES+A256KW)
 * @param kid - Key identifier (for logging)
 * @returns Unwrapped key split/DEK
 */
export async function unwrapWithKASKey(
    wrappedKey: string,
    kasPrivateKey: crypto.KeyObject,
    algorithm: string = 'RSA-OAEP-256',
    kid?: string
): Promise<IUnwrappedKeyMaterial> {
    try {
        const wrappedBuffer = Buffer.from(wrappedKey, 'base64');

        let keySplit: Buffer;

        switch (algorithm) {
            case 'RSA-OAEP':
            case 'RSA-OAEP-256':
                // RSA-OAEP with SHA-256
                keySplit = crypto.privateDecrypt(
                    {
                        key: kasPrivateKey,
                        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                        oaepHash: 'sha256',
                    },
                    wrappedBuffer
                );
                break;

            case 'ECDH-ES+A256KW':
                // ECDH key agreement + AES key wrap
                // TODO: Implement ECDH-ES+A256KW unwrap
                throw new Error('ECDH-ES+A256KW not yet implemented');

            default:
                throw new Error(`Unsupported wrap algorithm: ${algorithm}`);
        }

        kasLogger.debug('Key material unwrapped successfully', {
            kid,
            algorithm,
            keySplitLength: keySplit.length,
        });

        return {
            keySplit,
            algorithm,
            kid: kid || 'unknown',
        };
    } catch (error) {
        kasLogger.error('Key unwrap failed', {
            kid,
            algorithm,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw new Error(
            `Failed to unwrap key: ${
                error instanceof Error ? error.message : 'Unknown error'
            }`
        );
    }
}

/**
 * Rewrap decrypted key material to client's ephemeral public key
 * 
 * Encrypts key material using client's public key for secure transmission
 * 
 * @param dek - Decrypted key material (DEK or key split)
 * @param clientPublicKey - Client's ephemeral public key (JWK or PEM)
 * @param algorithm - Wrapping algorithm (RSA-OAEP-256, ECDH-ES+A256KW)
 * @returns Base64-encoded kasWrappedKey
 */
export async function rewrapToClientKey(
    dek: Buffer,
    clientPublicKey: string | IJsonWebKey,
    algorithm: string = 'RSA-OAEP-256'
): Promise<string> {
    try {
        let publicKeyObj: crypto.KeyObject;

        // Convert clientPublicKey to KeyObject
        if (typeof clientPublicKey === 'string') {
            // PEM format
            publicKeyObj = crypto.createPublicKey(clientPublicKey);
        } else {
            // JWK format - convert to PEM first
            const pem = jwkToPem(clientPublicKey);
            publicKeyObj = crypto.createPublicKey(pem);
        }

        let kasWrappedKey: Buffer;

        switch (algorithm) {
            case 'RSA-OAEP':
            case 'RSA-OAEP-256':
                // RSA-OAEP with SHA-256
                kasWrappedKey = crypto.publicEncrypt(
                    {
                        key: publicKeyObj,
                        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                        oaepHash: 'sha256',
                    },
                    dek
                );
                break;

            case 'ECDH-ES+A256KW':
                // ECDH key agreement + AES key wrap
                // TODO: Implement ECDH-ES+A256KW wrap
                throw new Error('ECDH-ES+A256KW not yet implemented');

            default:
                throw new Error(`Unsupported wrap algorithm: ${algorithm}`);
        }

        const kasWrappedKeyB64 = kasWrappedKey.toString('base64');

        kasLogger.debug('Key rewrapped successfully', {
            algorithm,
            dekLength: dek.length,
            wrappedLength: kasWrappedKey.length,
        });

        return kasWrappedKeyB64;
    } catch (error) {
        kasLogger.error('Key rewrap failed', {
            algorithm,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw new Error(
            `Failed to rewrap key: ${
                error instanceof Error ? error.message : 'Unknown error'
            }`
        );
    }
}

/**
 * Decrypt encryptedMetadata using unwrapped key material
 * 
 * @param encryptedMetadata - Base64-encoded encrypted metadata
 * @param keySplit - Unwrapped key material (used as decryption key)
 * @param algorithm - Encryption algorithm (default: AES-256-GCM)
 * @returns Decrypted metadata object
 */
export function decryptMetadata(
    encryptedMetadata: string,
    keySplit: Buffer,
    algorithm: string = 'AES-256-GCM'
): Record<string, unknown> {
    try {
        const encryptedBuffer = Buffer.from(encryptedMetadata, 'base64');

        // Format: IV (12 bytes) + authTag (16 bytes) + ciphertext
        const iv = encryptedBuffer.subarray(0, 12);
        const authTag = encryptedBuffer.subarray(12, 28);
        const ciphertext = encryptedBuffer.subarray(28);

        // Decrypt using AES-256-GCM
        const decipher = crypto.createDecipheriv('aes-256-gcm', keySplit, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(ciphertext);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        // Parse as JSON
        const metadata = JSON.parse(decrypted.toString('utf8'));

        kasLogger.debug('Metadata decrypted successfully', {
            metadataSize: decrypted.length,
        });

        return metadata;
    } catch (error) {
        kasLogger.error('Metadata decryption failed', {
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
 * Recombine multiple key splits (All-Of mode)
 * 
 * @param splits - Array of unwrapped key splits
 * @param method - Recombination method (xor, aes-kw, shamir)
 * @returns Combined DEK
 */
export function recombineKeySplits(
    splits: Buffer[],
    method: 'xor' | 'aes-kw' | 'shamir' = 'xor'
): Buffer {
    if (splits.length === 0) {
        throw new Error('No key splits provided');
    }

    if (splits.length === 1) {
        return splits[0];
    }

    switch (method) {
        case 'xor':
            // XOR all splits together
            return splits.reduce((acc, split) => {
                if (acc.length !== split.length) {
                    throw new Error('Key splits must be same length for XOR');
                }
                return Buffer.from(
                    acc.map((byte, i) => byte ^ split[i])
                );
            });

        case 'aes-kw':
            // AES key wrap recombination
            // TODO: Implement AES-KW recombination
            throw new Error('AES-KW recombination not yet implemented');

        case 'shamir':
            // Shamir secret sharing recombination
            // TODO: Implement Shamir secret sharing
            throw new Error('Shamir secret sharing not yet implemented');

        default:
            throw new Error(`Unsupported recombination method: ${method}`);
    }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Convert JWK to PEM format
 */
function jwkToPem(jwk: IJsonWebKey): string {
    const jwkToPemLib = require('jwk-to-pem');
    return jwkToPemLib(jwk, { private: false });
}

/**
 * Detect wrapping algorithm from keyAccessObject
 * 
 * @param kao - Key Access Object
 * @returns Inferred wrap algorithm
 */
export function detectWrapAlgorithm(kao: any): string {
    // Check if algorithm is specified in KAO
    if (kao.algorithm) {
        return kao.algorithm;
    }

    // Default to RSA-OAEP-256
    return process.env.KAS_WRAP_ALGORITHM || 'RSA-OAEP-256';
}

/**
 * Validate key material length
 * 
 * @param keyMaterial - Key material buffer
 * @returns True if valid length (16, 24, or 32 bytes for AES)
 */
export function validateKeyMaterialLength(keyMaterial: Buffer): boolean {
    const validLengths = [16, 24, 32]; // AES-128, AES-192, AES-256
    return validLengths.includes(keyMaterial.length);
}
