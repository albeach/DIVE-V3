/**
 * KAS Test Utilities
 * 
 * Shared utilities for KAS integration and performance tests.
 * Provides helper functions for:
 * - RSA key pair generation
 * - JWT token generation
 * - Key wrapping/unwrapping
 * - Policy binding computation
 * - KAO signature generation
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * Generate RSA key pair for testing
 * 
 * @returns Object with publicKey and privateKey in PEM format
 */
export function generateKeyPair(): { publicKey: string; privateKey: string } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    return { publicKey, privateKey };
}

/**
 * Generate test JWT token
 * 
 * @param payload - JWT payload
 * @returns Signed JWT token
 */
export function generateTestJWT(payload: any): string {
    const { privateKey } = generateKeyPair();
    return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}

/**
 * Wrap key split with RSA public key
 * 
 * @param keySplit - Key split to wrap
 * @param publicKey - RSA public key in PEM format
 * @returns Base64-encoded wrapped key
 */
export function wrapKey(keySplit: Buffer, publicKey: string): string {
    const encrypted = crypto.publicEncrypt(
        {
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        },
        keySplit
    );
    return encrypted.toString('base64');
}

/**
 * Compute policy binding (HMAC-SHA256)
 * 
 * @param policy - Policy object
 * @param keySplit - Key split used as HMAC key
 * @returns Base64-encoded policy binding
 */
export function computePolicyBinding(policy: any, keySplit: Buffer): string {
    const policyJson = JSON.stringify(policy, Object.keys(policy).sort());
    return crypto.createHmac('sha256', keySplit)
        .update(policyJson, 'utf8')
        .digest('base64');
}

/**
 * Sign Key Access Object (KAO)
 * 
 * @param kao - Key Access Object to sign
 * @param privateKey - RSA private key in PEM format
 * @returns Signature object with algorithm and signature
 */
export function signKAO(kao: any, privateKey: string): { alg: string; sig: string } {
    const { signature: _, ...kaoWithoutSig } = kao;
    const payload = JSON.stringify(kaoWithoutSig, Object.keys(kaoWithoutSig).sort());
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(payload);
    return {
        alg: 'RS256',
        sig: signer.sign(privateKey, 'base64')
    };
}

/**
 * Unwrap key split with RSA private key
 * 
 * @param wrappedKey - Base64-encoded wrapped key
 * @param privateKey - RSA private key in PEM format
 * @returns Unwrapped key split as Buffer
 */
export function unwrapKey(wrappedKey: string, privateKey: string): Buffer {
    const encrypted = Buffer.from(wrappedKey, 'base64');
    return crypto.privateDecrypt(
        {
            key: privateKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        },
        encrypted
    );
}

/**
 * Generate random key split
 * 
 * @param length - Key length in bytes (default: 32 for 256-bit)
 * @returns Random key split as Buffer
 */
export function generateKeySplit(length: number = 32): Buffer {
    return crypto.randomBytes(length);
}

/**
 * Compute SHA-256 hash
 * 
 * @param data - Data to hash
 * @returns Base64-encoded hash
 */
export function computeHash(data: string | Buffer): string {
    return crypto.createHash('sha256').update(data).digest('base64');
}

/**
 * Verify policy binding
 * 
 * @param policy - Policy object
 * @param keySplit - Key split used as HMAC key
 * @param expectedBinding - Expected policy binding
 * @returns True if binding is valid
 */
export function verifyPolicyBinding(
    policy: any,
    keySplit: Buffer,
    expectedBinding: string
): boolean {
    const computedBinding = computePolicyBinding(policy, keySplit);
    return computedBinding === expectedBinding;
}

/**
 * Verify KAO signature
 * 
 * @param kao - Key Access Object
 * @param publicKey - RSA public key in PEM format
 * @returns True if signature is valid
 */
export function verifyKAOSignature(kao: any, publicKey: string): boolean {
    try {
        const { signature, ...kaoWithoutSig } = kao;
        const payload = JSON.stringify(kaoWithoutSig, Object.keys(kaoWithoutSig).sort());
        const verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(payload);
        return verifier.verify(publicKey, signature.sig, 'base64');
    } catch {
        return false;
    }
}

/**
 * Generate test policy
 * 
 * @param options - Policy options
 * @returns Policy object
 */
export function generateTestPolicy(options: {
    policyId?: string;
    classification?: string;
    releasabilityTo?: string[];
    COI?: string[];
} = {}): any {
    return {
        policyId: options.policyId || `policy-test-${Date.now()}`,
        dissem: {
            classification: options.classification || 'SECRET',
            releasabilityTo: options.releasabilityTo || ['USA'],
            COI: options.COI || []
        }
    };
}

/**
 * Generate test KAO
 * 
 * @param options - KAO options
 * @returns Key Access Object
 */
export function generateTestKAO(options: {
    keyAccessObjectId?: string;
    url?: string;
    kid?: string;
    keySplit?: Buffer;
    kasPublicKey?: string;
    policy?: any;
    sid?: string;
} = {}): any {
    const keySplit = options.keySplit || generateKeySplit();
    const policy = options.policy || generateTestPolicy();
    const kasPublicKey = options.kasPublicKey || generateKeyPair().publicKey;
    
    const kao = {
        keyAccessObjectId: options.keyAccessObjectId || `kao-test-${Date.now()}`,
        url: options.url || process.env.KAS_USA_URL || 'https://localhost:8081/rewrap',
        kid: options.kid || 'kas-test-001',
        wrappedKey: wrapKey(keySplit, kasPublicKey),
        policyBinding: computePolicyBinding(policy, keySplit),
        signature: { alg: 'RS256', sig: '' },
        sid: options.sid
    };
    
    return kao;
}

/**
 * Sleep utility for tests
 * 
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry utility for flaky tests
 * 
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retries
 * @param delayMs - Delay between retries
 */
export async function retry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
): Promise<T> {
    let lastError: Error | undefined;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (i < maxRetries - 1) {
                await sleep(delayMs);
            }
        }
    }
    
    throw lastError || new Error('Retry failed');
}

/**
 * Generate test JWT with specific claims
 * 
 * @param claims - JWT claims
 * @returns Signed JWT token
 */
export function generateTestJWTWithClaims(claims: {
    uniqueID?: string;
    clearance?: string;
    countryOfAffiliation?: string;
    acpCOI?: string[];
    sub?: string;
    iss?: string;
    aud?: string;
} = {}): string {
    const { privateKey } = generateKeyPair();
    
    const payload = {
        sub: claims.sub || 'test-user',
        uniqueID: claims.uniqueID || 'test-user-001',
        clearance: claims.clearance || 'SECRET',
        countryOfAffiliation: claims.countryOfAffiliation || 'USA',
        acpCOI: claims.acpCOI || [],
        iss: claims.iss || 'https://test-keycloak/realms/test',
        aud: claims.aud || 'dive-v3-client',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
    };
    
    return jwt.sign(payload, privateKey, { algorithm: 'RS256' });
}
