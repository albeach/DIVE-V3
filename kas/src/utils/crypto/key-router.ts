/**
 * KAS Key Router
 * 
 * Routes unwrap operations to correct KAS private key based on kid
 * Reference: KAS-REQ-051, Phase 1.4
 * 
 * Supports multiple KAS keys for:
 * - Key rotation
 * - Multiple key types (RSA, EC)
 * - Organizational separation
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { kasLogger } from '../kas-logger';

/**
 * KAS Key Pair Entry
 */
export interface IKASKeyPair {
    /** Key identifier */
    kid: string;

    /** Key type (RSA, EC) */
    type: 'RSA' | 'EC';

    /** Key size/curve */
    size: string; // e.g., '2048', 'P-256'

    /** Private key (KeyObject) */
    privateKey: crypto.KeyObject;

    /** Public key (KeyObject) */
    publicKey: crypto.KeyObject;

    /** Public key (PEM format for export) */
    publicKeyPem: string;

    /** Created timestamp */
    createdAt: string;

    /** Active status */
    active: boolean;
}

/**
 * KAS Key Router
 * 
 * Manages KAS key pairs and routes operations by kid
 */
export class KeyRouter {
    private keyPairs: Map<string, IKASKeyPair> = new Map();
    private defaultKid: string | null = null;

    constructor() {
        this.loadKeys();
    }

    /**
     * Get private key by kid
     * 
     * @param kid - Key identifier
     * @returns Private key or null if not found
     */
    getPrivateKeyByKid(kid: string): crypto.KeyObject | null {
        const keyPair = this.keyPairs.get(kid);
        if (!keyPair) {
            kasLogger.warn('Key not found for kid', { kid });
            return null;
        }

        if (!keyPair.active) {
            kasLogger.warn('Key is inactive', { kid });
            return null;
        }

        return keyPair.privateKey;
    }

    /**
     * Get public key by kid
     * 
     * @param kid - Key identifier
     * @returns Public key or null if not found
     */
    getPublicKeyByKid(kid: string): crypto.KeyObject | null {
        const keyPair = this.keyPairs.get(kid);
        return keyPair?.publicKey || null;
    }

    /**
     * Get public key PEM by kid
     * 
     * @param kid - Key identifier
     * @returns PEM-encoded public key or null
     */
    getPublicKeyPemByKid(kid: string): string | null {
        const keyPair = this.keyPairs.get(kid);
        return keyPair?.publicKeyPem || null;
    }

    /**
     * List all available kids
     * 
     * @returns Array of key identifiers
     */
    listAvailableKids(): string[] {
        return Array.from(this.keyPairs.keys()).filter((kid) => {
            const keyPair = this.keyPairs.get(kid);
            return keyPair?.active || false;
        });
    }

    /**
     * Get default kid (for wrapping when kid not specified)
     * 
     * @returns Default kid or null
     */
    getDefaultKid(): string | null {
        return this.defaultKid;
    }

    /**
     * Get key pair metadata
     * 
     * @param kid - Key identifier
     * @returns Metadata (without private key)
     */
    getKeyMetadata(kid: string): Omit<IKASKeyPair, 'privateKey'> | null {
        const keyPair = this.keyPairs.get(kid);
        if (!keyPair) {
            return null;
        }

        const { privateKey, ...metadata } = keyPair;
        return metadata;
    }

    /**
     * Load keys from filesystem or environment
     */
    private loadKeys(): void {
        try {
            // Option 1: Load from environment variable
            const keysJson = process.env.KAS_KEYS_JSON;
            if (keysJson) {
                this.loadKeysFromJson(keysJson);
                return;
            }

            // Option 2: Load from filesystem
            const keysPath = process.env.KAS_KEYS_PATH || '../certs/kas';
            this.loadKeysFromFilesystem(keysPath);

            // Option 3: Fallback to mock key generation
            if (this.keyPairs.size === 0) {
                kasLogger.warn('No KAS keys found, generating mock key');
                this.generateMockKey();
            }

            kasLogger.info('KAS keys loaded', {
                keyCount: this.keyPairs.size,
                kids: this.listAvailableKids(),
                defaultKid: this.defaultKid,
            });
        } catch (error) {
            kasLogger.error('Failed to load KAS keys', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            // Generate fallback mock key
            this.generateMockKey();
        }
    }

    /**
     * Load keys from JSON configuration
     */
    private loadKeysFromJson(keysJson: string): void {
        const config = JSON.parse(keysJson);

        config.keys.forEach((keyConfig: any) => {
            const privateKey = crypto.createPrivateKey({
                key: keyConfig.privateKeyPem,
                format: 'pem',
            });

            const publicKey = crypto.createPublicKey(privateKey);

            const publicKeyPem = publicKey.export({
                type: 'spki',
                format: 'pem',
            }) as string;

            this.keyPairs.set(keyConfig.kid, {
                kid: keyConfig.kid,
                type: keyConfig.type,
                size: keyConfig.size,
                privateKey,
                publicKey,
                publicKeyPem,
                createdAt: keyConfig.createdAt,
                active: keyConfig.active !== false,
            });

            if (keyConfig.default) {
                this.defaultKid = keyConfig.kid;
            }
        });
    }

    /**
     * Load keys from filesystem
     */
    private loadKeysFromFilesystem(keysPath: string): void {
        const absolutePath = path.resolve(__dirname, keysPath);

        if (!fs.existsSync(absolutePath)) {
            kasLogger.warn('KAS keys directory not found', { path: absolutePath });
            return;
        }

        // Look for key files (kas-*.key and kas-*.pub)
        const files = fs.readdirSync(absolutePath);
        const keyFiles = files.filter((f) => f.endsWith('.key'));

        keyFiles.forEach((keyFile) => {
            try {
                const kid = keyFile.replace('.key', '').replace('kas-', '');
                const privateKeyPath = path.join(absolutePath, keyFile);
                const publicKeyPath = privateKeyPath.replace('.key', '.pub');

                if (!fs.existsSync(publicKeyPath)) {
                    kasLogger.warn('Public key not found', { kid, publicKeyPath });
                    return;
                }

                const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
                const publicKeyPem = fs.readFileSync(publicKeyPath, 'utf8');

                const privateKey = crypto.createPrivateKey({
                    key: privateKeyPem,
                    format: 'pem',
                });

                const publicKey = crypto.createPublicKey({
                    key: publicKeyPem,
                    format: 'pem',
                });

                // Detect key type and size
                const keyDetails = privateKey.asymmetricKeyDetails;
                const type = privateKey.asymmetricKeyType === 'rsa' ? 'RSA' : 'EC';
                const size =
                    type === 'RSA'
                        ? `${keyDetails?.modulusLength || 'unknown'}`
                        : keyDetails?.namedCurve || 'unknown';

                this.keyPairs.set(kid, {
                    kid,
                    type,
                    size,
                    privateKey,
                    publicKey,
                    publicKeyPem,
                    createdAt: new Date().toISOString(),
                    active: true,
                });

                // Set first key as default
                if (!this.defaultKid) {
                    this.defaultKid = kid;
                }

                kasLogger.debug('Loaded KAS key', { kid, type, size });
            } catch (error) {
                kasLogger.error('Failed to load key file', {
                    keyFile,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        });
    }

    /**
     * Generate mock key for development/testing
     */
    private generateMockKey(): void {
        const kid = process.env.KAS_KEK_ID || 'mock-kek-001';

        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem',
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem',
            },
        });

        const publicKeyObj = crypto.createPublicKey(publicKey as string);
        const privateKeyObj = crypto.createPrivateKey(privateKey as string);

        this.keyPairs.set(kid, {
            kid,
            type: 'RSA',
            size: '2048',
            privateKey: privateKeyObj,
            publicKey: publicKeyObj,
            publicKeyPem: publicKey as string,
            createdAt: new Date().toISOString(),
            active: true,
        });

        this.defaultKid = kid;

        kasLogger.warn('Generated mock KAS key (not for production)', { kid });
    }

    /**
     * Add a new key pair
     * 
     * @param kid - Key identifier
     * @param privateKeyPem - Private key (PEM)
     * @param publicKeyPem - Public key (PEM)
     * @param setAsDefault - Set as default kid
     */
    addKeyPair(
        kid: string,
        privateKeyPem: string,
        publicKeyPem: string,
        setAsDefault: boolean = false
    ): void {
        const privateKey = crypto.createPrivateKey({
            key: privateKeyPem,
            format: 'pem',
        });

        const publicKey = crypto.createPublicKey({
            key: publicKeyPem,
            format: 'pem',
        });

        const keyDetails = privateKey.asymmetricKeyDetails;
        const type = privateKey.asymmetricKeyType === 'rsa' ? 'RSA' : 'EC';
        const size =
            type === 'RSA'
                ? `${keyDetails?.modulusLength || 'unknown'}`
                : keyDetails?.namedCurve || 'unknown';

        this.keyPairs.set(kid, {
            kid,
            type,
            size,
            privateKey,
            publicKey,
            publicKeyPem,
            createdAt: new Date().toISOString(),
            active: true,
        });

        if (setAsDefault || !this.defaultKid) {
            this.defaultKid = kid;
        }

        kasLogger.info('Added KAS key pair', { kid, type, size });
    }

    /**
     * Deactivate a key (for key rotation)
     * 
     * @param kid - Key identifier
     */
    deactivateKey(kid: string): void {
        const keyPair = this.keyPairs.get(kid);
        if (keyPair) {
            keyPair.active = false;
            kasLogger.info('Deactivated KAS key', { kid });
        }
    }
}

/**
 * Global key router instance
 */
export const keyRouter = new KeyRouter();
