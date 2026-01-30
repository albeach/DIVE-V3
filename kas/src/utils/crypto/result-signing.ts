/**
 * Result Signing Utilities
 * 
 * Sign individual keyAccessObject results for federation integrity
 * Reference: KAS-REQ-083, Phase 2.4
 */

import crypto from 'crypto';
import { kasLogger } from '../kas-logger';
import { IKeyAccessObjectResult, ISignature } from '../../types/rewrap.types';

/**
 * Sign a rewrap result
 * 
 * Creates digital signature over result fields for integrity protection
 * Used when KAS returns results (especially in federation scenarios)
 * 
 * @param result - Result object (without signature field)
 * @param kasPrivateKey - KAS signing private key
 * @param algorithm - Signature algorithm (default: RS256)
 * @returns Signature object
 */
export function signResult(
    result: Omit<IKeyAccessObjectResult, 'signature'>,
    kasPrivateKey: crypto.KeyObject | string,
    algorithm: string = 'RS256'
): ISignature {
    try {
        // Create canonical payload (sorted keys)
        const payload = JSON.stringify(result, Object.keys(result).sort());

        // Map JWA algorithm to Node.js crypto algorithm
        const cryptoAlgorithm = mapSignatureAlgorithm(algorithm);
        if (!cryptoAlgorithm) {
            throw new Error(`Unsupported signature algorithm: ${algorithm}`);
        }

        // Sign payload
        const signer = crypto.createSign(cryptoAlgorithm);
        signer.update(payload, 'utf8');

        const signature = signer.sign(kasPrivateKey);

        const sig: ISignature = {
            alg: algorithm,
            sig: signature.toString('base64'),
        };

        kasLogger.debug('Result signed successfully', {
            algorithm,
            keyAccessObjectId: result.keyAccessObjectId,
        });

        return sig;
    } catch (error) {
        kasLogger.error('Result signing failed', {
            algorithm,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw new Error(
            `Failed to sign result: ${
                error instanceof Error ? error.message : 'Unknown error'
            }`
        );
    }
}

/**
 * Verify a result signature
 * 
 * Verifies signature from another KAS instance in federation scenario
 * 
 * @param result - Result with signature
 * @param publicKey - Public key of signing KAS
 * @returns True if signature valid
 */
export function verifyResultSignature(
    result: IKeyAccessObjectResult,
    publicKey: crypto.KeyObject | string
): boolean {
    try {
        if (!result.signature || !result.signature.alg || !result.signature.sig) {
            kasLogger.warn('Missing or invalid signature', {
                keyAccessObjectId: result.keyAccessObjectId,
            });
            return false;
        }

        // Create canonical payload (without signature)
        const { signature, ...resultWithoutSig } = result;
        const payload = JSON.stringify(
            resultWithoutSig,
            Object.keys(resultWithoutSig).sort()
        );

        // Map algorithm
        const cryptoAlgorithm = mapSignatureAlgorithm(signature.alg);
        if (!cryptoAlgorithm) {
            kasLogger.warn('Unsupported signature algorithm', {
                algorithm: signature.alg,
            });
            return false;
        }

        // Verify signature
        const verifier = crypto.createVerify(cryptoAlgorithm);
        verifier.update(payload, 'utf8');

        const signatureBuffer = Buffer.from(signature.sig, 'base64');
        const valid = verifier.verify(publicKey, signatureBuffer);

        if (!valid) {
            kasLogger.warn('Result signature verification failed', {
                keyAccessObjectId: result.keyAccessObjectId,
            });
        }

        return valid;
    } catch (error) {
        kasLogger.error('Result signature verification error', {
            keyAccessObjectId: result.keyAccessObjectId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        return false;
    }
}

/**
 * Sign multiple results
 * 
 * Batch signing for efficiency
 * 
 * @param results - Array of results (without signatures)
 * @param kasPrivateKey - KAS signing private key
 * @param algorithm - Signature algorithm
 * @returns Array of signed results
 */
export function signResults(
    results: Array<Omit<IKeyAccessObjectResult, 'signature'>>,
    kasPrivateKey: crypto.KeyObject | string,
    algorithm: string = 'RS256'
): IKeyAccessObjectResult[] {
    return results.map((result) => {
        const signature = signResult(result, kasPrivateKey, algorithm);
        return {
            ...result,
            signature,
        } as IKeyAccessObjectResult;
    });
}

// ============================================
// Helper Functions
// ============================================

/**
 * Map JWA algorithm to Node.js crypto algorithm
 */
function mapSignatureAlgorithm(jwaAlgorithm: string): string | null {
    const algorithmMap: Record<string, string> = {
        RS256: 'RSA-SHA256',
        RS384: 'RSA-SHA384',
        RS512: 'RSA-SHA512',
        PS256: 'RSA-SHA256',
        PS384: 'RSA-SHA384',
        PS512: 'RSA-SHA512',
        ES256: 'sha256',
        ES384: 'sha384',
        ES512: 'sha512',
    };

    return algorithmMap[jwaAlgorithm] || null;
}
