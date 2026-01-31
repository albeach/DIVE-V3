/**
 * Shared Test Utilities for KAS Integration Tests
 * 
 * Common functions used across multiple integration test files
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * Generate RSA key pair for testing
 */
export const generateKeyPair = () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    return { publicKey, privateKey };
};

/**
 * Generate test JWT token
 */
export const generateTestJWT = (payload: any) => {
    const { privateKey } = generateKeyPair();
    return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
};

/**
 * Wrap key using RSA-OAEP-256
 */
export const wrapKey = (keySplit: Buffer, publicKey: string): string => {
    const encrypted = crypto.publicEncrypt(
        {
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        },
        keySplit
    );
    return encrypted.toString('base64');
};

/**
 * Compute policy binding (HMAC-SHA256)
 */
export const computePolicyBinding = (policy: any, keySplit: Buffer): string => {
    const policyJson = JSON.stringify(policy, Object.keys(policy).sort());
    return crypto.createHmac('sha256', keySplit)
        .update(policyJson, 'utf8')
        .digest('base64');
};

/**
 * Sign KeyAccessObject
 */
export const signKAO = (kao: any, privateKey: string): { alg: string; sig: string } => {
    const { signature: _, ...kaoWithoutSig } = kao;
    const payload = JSON.stringify(kaoWithoutSig, Object.keys(kaoWithoutSig).sort());
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(payload);
    return {
        alg: 'RS256',
        sig: signer.sign(privateKey, 'base64')
    };
};

/**
 * Encrypt metadata using AES-256-GCM
 */
export const encryptMetadata = (metadata: any, keySplit: Buffer): string => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keySplit, iv);
    
    const plaintext = JSON.stringify(metadata);
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    // Format: IV (12 bytes) + authTag (16 bytes) + ciphertext
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
};
