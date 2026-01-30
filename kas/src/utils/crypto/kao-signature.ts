/**
 * Key Access Object (KAO) Signature Verification
 * 
 * Verifies digital signatures over keyAccessObjects to prevent tampering
 * Reference: KAS-REQ-040, KAS-REQ-041, Phase 2.2
 * 
 * CRITICAL SECURITY: Protects against MITM attacks during federation
 */

import crypto from 'crypto';
import { kasLogger } from '../kas-logger';
import {
    IKeyAccessObject,
    IKAOSignatureResult,
    IJsonWebKey,
} from '../../types/rewrap.types';

/**
 * Canonicalize keyAccessObject for signature verification
 * 
 * Creates deterministic representation by:
 * 1. Removing signature field
 * 2. Sorting keys alphabetically
 * 3. Producing compact JSON
 * 
 * @param kao - Key Access Object
 * @returns Canonical JSON string
 */
export function canonicalizeKAO(kao: IKeyAccessObject): string {
    // Create copy without signature field
    const { signature, ...kaoWithoutSig } = kao;

    // Recursive function to sort object keys
    const sortKeys = (obj: any): any => {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(sortKeys);
        }

        const sorted: Record<string, any> = {};
        Object.keys(obj)
            .sort()
            .forEach((key) => {
                sorted[key] = sortKeys(obj[key]);
            });

        return sorted;
    };

    const sortedKAO = sortKeys(kaoWithoutSig);
    return JSON.stringify(sortedKAO);
}

/**
 * Verify keyAccessObject signature
 * 
 * @param kao - Key Access Object with signature
 * @param trustedPublicKey - Public key (PEM format or crypto.KeyObject)
 * @returns Verification result
 */
export function verifyKAOSignature(
    kao: IKeyAccessObject,
    trustedPublicKey: string | crypto.KeyObject
): IKAOSignatureResult {
    try {
        // 1. Validate signature structure
        if (!kao.signature || !kao.signature.alg || !kao.signature.sig) {
            return {
                valid: false,
                reason: 'Missing or invalid signature structure',
            };
        }

        // 2. Check algorithm whitelist
        const supportedAlgorithms = (
            process.env.KAS_SUPPORTED_ALGORITHMS || 'RS256,RS512,ES256,ES384,PS256'
        )
            .split(',')
            .map((alg) => alg.trim());

        if (!supportedAlgorithms.includes(kao.signature.alg)) {
            return {
                valid: false,
                reason: `Unsupported signature algorithm: ${kao.signature.alg}`,
            };
        }

        // 3. Create canonical payload
        const payload = canonicalizeKAO(kao);

        // 4. Map algorithm to Node.js crypto algorithm
        const cryptoAlgorithm = mapSignatureAlgorithm(kao.signature.alg);
        if (!cryptoAlgorithm) {
            return {
                valid: false,
                reason: `Unknown signature algorithm: ${kao.signature.alg}`,
            };
        }

        // 5. Verify signature
        const verifier = crypto.createVerify(cryptoAlgorithm);
        verifier.update(payload, 'utf8');

        const signatureBuffer = Buffer.from(kao.signature.sig, 'base64');
        const valid = verifier.verify(trustedPublicKey, signatureBuffer);

        if (!valid) {
            return {
                valid: false,
                reason: 'Signature verification failed',
            };
        }

        return {
            valid: true,
        };
    } catch (error) {
        kasLogger.error('KAO signature verification error', {
            error: error instanceof Error ? error.message : 'Unknown error',
            keyAccessObjectId: kao.keyAccessObjectId,
        });

        return {
            valid: false,
            reason: `Signature verification error: ${
                error instanceof Error ? error.message : 'Unknown error'
            }`,
        };
    }
}

/**
 * Map JWA (JSON Web Algorithm) names to Node.js crypto algorithms
 * 
 * @param jwaAlgorithm - JWA algorithm name (e.g., RS256, ES256)
 * @returns Node.js crypto algorithm name (e.g., RSA-SHA256, sha256)
 */
function mapSignatureAlgorithm(jwaAlgorithm: string): string | null {
    const algorithmMap: Record<string, string> = {
        // RSA
        RS256: 'RSA-SHA256',
        RS384: 'RSA-SHA384',
        RS512: 'RSA-SHA512',

        // RSA-PSS
        PS256: 'RSA-SHA256', // Node uses same for PSS
        PS384: 'RSA-SHA384',
        PS512: 'RSA-SHA512',

        // ECDSA
        ES256: 'sha256',
        ES384: 'sha384',
        ES512: 'sha512',
    };

    return algorithmMap[jwaAlgorithm] || null;
}

/**
 * Sign a keyAccessObject (for KAS response signing)
 * 
 * @param kao - Key Access Object to sign (without signature field)
 * @param privateKey - KAS private signing key
 * @param algorithm - Signature algorithm (default: RS256)
 * @returns Signature object
 */
export function signKAO(
    kao: Omit<IKeyAccessObject, 'signature'>,
    privateKey: crypto.KeyObject | string,
    algorithm: string = 'RS256'
): { alg: string; sig: string } {
    const payload = JSON.stringify(kao, Object.keys(kao).sort());
    const cryptoAlgorithm = mapSignatureAlgorithm(algorithm);

    if (!cryptoAlgorithm) {
        throw new Error(`Unsupported signature algorithm: ${algorithm}`);
    }

    const signer = crypto.createSign(cryptoAlgorithm);
    signer.update(payload, 'utf8');

    const signature = signer.sign(privateKey);

    return {
        alg: algorithm,
        sig: signature.toString('base64'),
    };
}

/**
 * Convert JWK to PEM format for signature verification
 * 
 * @param jwk - JSON Web Key
 * @returns PEM-encoded public key
 */
export function jwkToPem(jwk: IJsonWebKey): string {
    const jwkToPemLib = require('jwk-to-pem');
    return jwkToPemLib(jwk, { private: false });
}

/**
 * Load trusted public key from KAS registry or ZTDF manifest
 * 
 * @param kid - Key identifier
 * @returns Public key or null if not found
 */
export function loadTrustedPublicKey(kid: string): crypto.KeyObject | null {
    // TODO: Implement key loading from:
    // 1. KAS registry (kas-registry.json)
    // 2. ZTDF manifest (if available)
    // 3. Environment configuration
    // 4. Key management service

    kasLogger.warn('loadTrustedPublicKey not yet implemented', { kid });
    return null;
}
