/**
 * DPoP (Demonstrable Proof-of-Possession) Verification Middleware
 * 
 * Implements RFC 9449 DPoP verification for /rewrap endpoint
 * Reference: KAS-REQ-031, KAS-REQ-032, Phase 2.1
 * 
 * CRITICAL SECURITY: Prevents token theft and replay attacks
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import NodeCache from 'node-cache';
import { kasLogger } from '../utils/kas-logger';
import { IDPoPHeader, IDPoPPayload, IJsonWebKey } from '../types/rewrap.types';

// DPoP nonce cache for replay protection (jti tracking)
const dpopNonceCache = new NodeCache({
    stdTTL: parseInt(process.env.DPOP_NONCE_TTL || '300'), // 5 minutes
    checkperiod: 60,
    maxKeys: parseInt(process.env.DPOP_NONCE_CACHE_SIZE || '10000'),
});

/**
 * Verify DPoP proof-of-possession
 * 
 * Steps per RFC 9449:
 * 1. Extract DPoP header and Authorization header
 * 2. Decode DPoP JWT to get jwk
 * 3. Verify DPoP JWT signature using jwk
 * 4. Validate claims: htm, htu, ath, jti, iat
 * 5. Check jti uniqueness (replay protection)
 * 6. Store dpopPublicKey in req for potential binding
 */
export const verifyDPoP = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;
    const dpopEnabled = process.env.ENABLE_DPOP === 'true';

    // Feature flag check
    if (!dpopEnabled) {
        kasLogger.debug('DPoP verification disabled', { requestId });
        return next();
    }

    try {
        // 1. Extract DPoP header
        const dpopProof = req.headers['dpop'] as string;
        if (!dpopProof) {
            kasLogger.warn('Missing DPoP header', { requestId });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'DPoP proof required',
                requestId,
            });
            return;
        }

        // 2. Extract Authorization header
        const authHeader = req.headers['authorization'] as string;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            kasLogger.warn('Missing or invalid Authorization header', { requestId });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Bearer token required',
                requestId,
            });
            return;
        }

        const accessToken = authHeader.substring(7);

        // 3. Decode DPoP JWT header to extract jwk
        const decodedProof = jwt.decode(dpopProof, { complete: true });
        if (!decodedProof || !decodedProof.header || !decodedProof.payload) {
            kasLogger.warn('Invalid DPoP proof format', { requestId });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid DPoP proof format',
                requestId,
            });
            return;
        }

        const header = decodedProof.header as unknown as IDPoPHeader;
        const payload = decodedProof.payload as unknown as IDPoPPayload;

        // 4. Verify typ is 'dpop+jwt'
        if (header.typ !== 'dpop+jwt') {
            kasLogger.warn('Invalid DPoP typ', { requestId, typ: header.typ });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'DPoP typ must be dpop+jwt',
                requestId,
            });
            return;
        }

        // 5. Verify jwk is present in header
        if (!header.jwk) {
            kasLogger.warn('Missing jwk in DPoP header', { requestId });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'DPoP proof missing jwk',
                requestId,
            });
            return;
        }

        // 6. Convert JWK to PEM for signature verification
        let publicKeyPem: string;
        try {
            publicKeyPem = jwkToPemInternal(header.jwk);
        } catch (error) {
            kasLogger.warn('Failed to convert JWK to PEM', {
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid DPoP jwk format',
                requestId,
            });
            return;
        }

        // 7. Verify DPoP JWT signature
        try {
            jwt.verify(dpopProof, publicKeyPem, {
                algorithms: [header.alg as jwt.Algorithm],
            });
        } catch (error) {
            kasLogger.warn('DPoP signature verification failed', {
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'DPoP proof signature verification failed',
                requestId,
            });
            return;
        }

        // 8. Validate required claims
        const maxAge = parseInt(process.env.DPOP_PROOF_MAX_AGE || '60'); // 60 seconds
        const now = Math.floor(Date.now() / 1000);

        // Check jti
        if (!payload.jti) {
            kasLogger.warn('Missing jti in DPoP proof', { requestId });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'DPoP proof missing jti',
                requestId,
            });
            return;
        }

        // Check jti uniqueness (replay protection)
        if (dpopNonceCache.has(payload.jti)) {
            kasLogger.warn('DPoP proof replay detected', {
                requestId,
                jti: payload.jti,
            });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'DPoP proof replay detected',
                requestId,
            });
            return;
        }

        // Store jti to prevent replay
        dpopNonceCache.set(payload.jti, true);

        // Check htm (HTTP method)
        if (payload.htm !== req.method) {
            kasLogger.warn('DPoP htm mismatch', {
                requestId,
                expected: req.method,
                actual: payload.htm,
            });
            res.status(401).json({
                error: 'Unauthorized',
                message: `DPoP htm must be ${req.method}`,
                requestId,
            });
            return;
        }

        // Check htu (HTTP URI) - must match request URL
        const expectedHtu = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        if (payload.htu !== expectedHtu) {
            kasLogger.warn('DPoP htu mismatch', {
                requestId,
                expected: expectedHtu,
                actual: payload.htu,
            });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'DPoP htu does not match request URI',
                requestId,
            });
            return;
        }

        // Check iat (timestamp validation)
        if (!payload.iat) {
            kasLogger.warn('Missing iat in DPoP proof', { requestId });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'DPoP proof missing iat',
                requestId,
            });
            return;
        }

        const age = now - payload.iat;
        if (age < 0 || age > maxAge) {
            kasLogger.warn('DPoP proof age invalid', {
                requestId,
                age,
                maxAge,
                iat: payload.iat,
                now,
            });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'DPoP proof expired or from future',
                requestId,
            });
            return;
        }

        // 9. Check ath (access token hash binding)
        const expectedAth = computeAccessTokenHash(accessToken);
        if (payload.ath !== expectedAth) {
            kasLogger.warn('DPoP ath mismatch', {
                requestId,
                expected: expectedAth,
                actual: payload.ath,
            });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'DPoP ath does not match access token',
                requestId,
            });
            return;
        }

        // 10. All checks passed - store dpopPublicKey in request for potential use
        (req as any).dpopPublicKey = header.jwk;
        (req as any).dpopVerified = true;

        kasLogger.info('DPoP verification successful', {
            requestId,
            jti: payload.jti,
            htm: payload.htm,
        });

        next();
    } catch (error) {
        kasLogger.error('DPoP verification error', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to verify DPoP proof',
            requestId,
        });
    }
};

// ============================================
// Helper Functions
// ============================================

/**
 * Compute access token hash for ath claim
 * SHA-256 hash of access token, Base64url encoded
 * 
 * Per RFC 9449 Section 4.2
 */
function computeAccessTokenHash(accessToken: string): string {
    const hash = crypto.createHash('sha256').update(accessToken).digest();
    return base64UrlEncode(hash);
}

/**
 * Base64url encode (URL-safe Base64 without padding)
 */
function base64UrlEncode(buffer: Buffer): string {
    return buffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/**
 * Convert JWK to PEM format
 * Uses jwk-to-pem library
 */
function jwkToPemInternal(jwk: IJsonWebKey): string {
    const jwkToPemLib = require('jwk-to-pem');
    return jwkToPemLib(jwk);
}

/**
 * Get DPoP nonce cache statistics (for monitoring)
 */
export function getDPoPCacheStats() {
    return {
        size: dpopNonceCache.keys().length,
        hits: dpopNonceCache.getStats().hits,
        misses: dpopNonceCache.getStats().misses,
    };
}
