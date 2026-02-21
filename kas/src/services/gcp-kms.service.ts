/**
 * GCP Cloud KMS Service
 * 
 * Provides secure key management using Google Cloud Key Management Service (KMS).
 * Replaces MockHSM for production deployments.
 * 
 * Features:
 * - FIPS 140-2 Level 3 certified key storage
 * - RSA 4096-bit asymmetric encryption/decryption
 * - Key rotation support
 * - Cloud Audit Logs integration
 * - Multi-region support (us-central1, europe-west1, europe-west2)
 * 
 * Reference: ACP-240 KAS-REQ-110 (Production HSM Integration)
 */

import { KeyManagementServiceClient } from '@google-cloud/kms';
import { GoogleAuth } from 'google-auth-library';
import { kasLogger } from '../utils/kas-logger';
import { cacheManager, CacheManager } from './cache-manager';

export interface IGcpKmsConfig {
    projectId: string;
    keyFilename?: string;
    location: string;
    keyRingId: string;
    keyId: string;
}

export interface IKeyInfo {
    name: string;
    location: string;
    keyRing: string;
    keyId: string;
    algorithm: string;
    protectionLevel: string;
    purpose: string;
}

export class GcpKmsService {
    private client: KeyManagementServiceClient;
    private projectId: string;
    private keyFilename?: string;

    constructor(config: Partial<IGcpKmsConfig> = {}) {
        this.projectId = config.projectId || process.env.GCP_PROJECT_ID || 'dive25';
        this.keyFilename = config.keyFilename || process.env.GOOGLE_APPLICATION_CREDENTIALS;

        // Initialize KMS client
        this.client = new KeyManagementServiceClient({
            projectId: this.projectId,
            keyFilename: this.keyFilename,
        });

        kasLogger.info('GcpKmsService initialized', {
            projectId: this.projectId,
            hasCredentials: !!this.keyFilename,
            credentialsFile: this.keyFilename || 'default',
        });
    }

    /**
     * Decrypt ciphertext using Cloud KMS asymmetric key
     * 
     * @param ciphertext - Base64-encoded encrypted data
     * @param keyName - Full KMS key resource name
     * @returns Decrypted plaintext as Buffer
     */
    async decryptWithKMS(
        ciphertext: string | Buffer,
        keyName: string
    ): Promise<Buffer> {
        const startTime = Date.now();
        
        try {
            // Convert ciphertext to Buffer if string
            const ciphertextBuffer = typeof ciphertext === 'string'
                ? Buffer.from(ciphertext, 'base64')
                : ciphertext;

            kasLogger.debug('Decrypting with Cloud KMS', {
                keyName,
                ciphertextLength: ciphertextBuffer.length,
            });

            // Call Cloud KMS asymmetric decrypt API
            const [result] = await this.client.asymmetricDecrypt({
                name: keyName,
                ciphertext: ciphertextBuffer,
            });

            if (!result.plaintext) {
                throw new Error('KMS decryption returned empty plaintext');
            }

            const decryptionTimeMs = Date.now() - startTime;
            kasLogger.info('KMS decryption successful', {
                keyName,
                decryptionTimeMs,
                plaintextLength: result.plaintext.length,
            });

            return Buffer.from(result.plaintext);

        } catch (error) {
            kasLogger.error('KMS decryption failed', {
                keyName,
                error: error instanceof Error ? error.message : 'Unknown error',
                errorType: error instanceof Error ? error.name : 'UnknownError',
                decryptionTimeMs: Date.now() - startTime,
            });

            // Rethrow with more context
            throw new Error(
                `GCP KMS decryption failed for ${keyName}: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`
            );
        }
    }

    /**
     * Get public key from Cloud KMS (with caching)
     * 
     * @param keyName - Full KMS key resource name
     * @returns PEM-encoded public key
     */
    async getPublicKey(keyName: string): Promise<string> {
        // Check cache first
        const cacheKey = CacheManager.buildPublicKeyKey(keyName);
        const cached = await cacheManager.get<{ pem: string }>(cacheKey);
        
        if (cached) {
            kasLogger.debug('Public key cache hit', { keyName, cacheKey });
            return cached.pem;
        }
        
        kasLogger.debug('Public key cache miss - fetching from Cloud KMS', { keyName, cacheKey });

        try {
            const [publicKey] = await this.client.getPublicKey({
                name: keyName,
            });

            if (!publicKey.pem) {
                throw new Error('KMS returned empty public key');
            }

            kasLogger.info('Public key fetched successfully', {
                keyName,
                algorithm: publicKey.algorithm,
                pemLength: publicKey.pem.length,
            });

            // Cache for 1 hour (3600s)
            await cacheManager.set(cacheKey, { pem: publicKey.pem });

            return publicKey.pem;

        } catch (error) {
            kasLogger.error('Failed to fetch public key', {
                keyName,
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            throw new Error(
                `Failed to fetch public key for ${keyName}: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`
            );
        }
    }

    /**
     * Create new key version (rotation)
     * 
     * @param keyName - Full KMS key resource name
     * @returns New key version name
     */
    async rotateKey(keyName: string): Promise<string> {
        try {
            kasLogger.info('Rotating KMS key', { keyName });

            const [keyVersion] = await this.client.createCryptoKeyVersion({
                parent: keyName,
            });

            if (!keyVersion.name) {
                throw new Error('Failed to create new key version');
            }

            kasLogger.info('Key rotated successfully', {
                keyName,
                newVersion: keyVersion.name,
                state: keyVersion.state,
            });

            return keyVersion.name;

        } catch (error) {
            kasLogger.error('Key rotation failed', {
                keyName,
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            throw new Error(
                `Key rotation failed for ${keyName}: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`
            );
        }
    }

    /**
     * Get key information
     * 
     * @param keyName - Full KMS key resource name
     * @returns Key information
     */
    async getKeyInfo(keyName: string): Promise<IKeyInfo> {
        try {
            const [key] = await this.client.getCryptoKey({
                name: keyName,
            });

            if (!key.name) {
                throw new Error('Key not found');
            }

            // Parse key name to extract components
            const parts = keyName.split('/');
            const location = parts[3];
            const keyRing = parts[5];
            const keyId = parts[7];

            return {
                name: key.name,
                location,
                keyRing,
                keyId,
                algorithm: String(key.versionTemplate?.algorithm || 'UNKNOWN'),
                protectionLevel: String(key.versionTemplate?.protectionLevel || 'UNKNOWN'),
                purpose: String(key.purpose || 'UNKNOWN'),
            };

        } catch (error) {
            kasLogger.error('Failed to get key info', {
                keyName,
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            throw new Error(
                `Failed to get key info for ${keyName}: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`
            );
        }
    }

    /**
     * Build key resource name
     * 
     * @param location - GCP region (us-central1, europe-west1, europe-west2)
     * @param keyRingId - Key ring ID (kas-usa, kas-fra, kas-gbr)
     * @param keyId - Key ID (kas-usa-private-key)
     * @param version - Optional version (defaults to latest)
     * @returns Full resource name
     */
    buildKeyName(
        location: string,
        keyRingId: string,
        keyId: string,
        version?: string
    ): string {
        const baseName = `projects/${this.projectId}/locations/${location}/keyRings/${keyRingId}/cryptoKeys/${keyId}`;
        
        if (version) {
            return `${baseName}/cryptoKeyVersions/${version}`;
        }
        
        return baseName;
    }

    /**
     * Test KMS connectivity and permissions
     * 
     * @param keyName - Full KMS key resource name
     * @returns True if connection is healthy
     */
    async healthCheck(keyName: string): Promise<boolean> {
        try {
            // Try to fetch public key as a health check
            await this.getPublicKey(keyName);
            kasLogger.info('KMS health check passed', { keyName });
            return true;

        } catch (error) {
            kasLogger.error('KMS health check failed', {
                keyName,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return false;
        }
    }

    /**
     * List all crypto keys in a key ring
     * 
     * @param location - GCP region
     * @param keyRingId - Key ring ID
     * @returns Array of key names
     */
    async listKeys(location: string, keyRingId: string): Promise<string[]> {
        try {
            const parent = `projects/${this.projectId}/locations/${location}/keyRings/${keyRingId}`;
            
            kasLogger.debug('Listing KMS keys', { parent });

            const [keys] = await this.client.listCryptoKeys({
                parent,
            });

            const keyNames = keys.map(key => key.name).filter((name): name is string => !!name);

            kasLogger.info('Listed KMS keys', {
                parent,
                keyCount: keyNames.length,
            });

            return keyNames;

        } catch (error) {
            kasLogger.error('Failed to list KMS keys', {
                location,
                keyRingId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            return [];
        }
    }

    /**
     * Check if service account has required permissions
     * 
     * @param keyName - Full KMS key resource name
     * @returns Object with permission check results
     */
    async checkPermissions(keyName: string): Promise<{
        canDecrypt: boolean;
        canGetPublicKey: boolean;
        canRotate: boolean;
    }> {
        try {
            // Test IAM permissions
            const [result] = await this.client.testIamPermissions({
                resource: keyName,
                permissions: [
                    'cloudkms.cryptoKeyVersions.useToDecrypt',
                    'cloudkms.cryptoKeyVersions.viewPublicKey',
                    'cloudkms.cryptoKeyVersions.create',
                ],
            } as any); // Cast to any to bypass toJSON requirement

            const permissions = result.permissions || [];

            return {
                canDecrypt: permissions.includes('cloudkms.cryptoKeyVersions.useToDecrypt'),
                canGetPublicKey: permissions.includes('cloudkms.cryptoKeyVersions.viewPublicKey'),
                canRotate: permissions.includes('cloudkms.cryptoKeyVersions.create'),
            };

        } catch (error) {
            kasLogger.error('Failed to check permissions', {
                keyName,
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            return {
                canDecrypt: false,
                canGetPublicKey: false,
                canRotate: false,
            };
        }
    }
}

/**
 * Singleton instance factory
 * Creates appropriate GCP KMS service based on KAS instance
 */
export class GcpKmsFactory {
    private static instances: Map<string, GcpKmsService> = new Map();

    /**
     * Get or create KMS service for a specific KAS instance
     * 
     * @param kasId - KAS instance ID (usa, fra, gbr)
     * @returns GcpKmsService instance
     */
    static getService(kasId: string): GcpKmsService {
        const normalizedKasId = kasId.toLowerCase();
        
        if (!this.instances.has(normalizedKasId)) {
            const config = this.getConfigForKasId(normalizedKasId);
            const service = new GcpKmsService(config);
            this.instances.set(normalizedKasId, service);
        }

        return this.instances.get(normalizedKasId)!;
    }

    /**
     * Get KMS configuration for a KAS instance
     * 
     * @param kasId - KAS instance ID
     * @returns KMS configuration
     */
    private static getConfigForKasId(kasId: string): IGcpKmsConfig {
        const projectId = process.env.GCP_PROJECT_ID || 'dive25';
        const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;

        // Map KAS instance to GCP region and key ring
        const regionMapping: Record<string, { location: string; keyRing: string; key: string }> = {
            usa: {
                location: 'us-central1',
                keyRing: 'kas-usa',
                key: 'kas-usa-private-key',
            },
            fra: {
                location: 'europe-west1',
                keyRing: 'kas-fra',
                key: 'kas-fra-private-key',
            },
            gbr: {
                location: 'europe-west2',
                keyRing: 'kas-gbr',
                key: 'kas-gbr-private-key',
            },
        };

        const mapping = regionMapping[kasId] || regionMapping.usa;

        return {
            projectId,
            keyFilename,
            location: mapping.location,
            keyRingId: mapping.keyRing,
            keyId: mapping.key,
        };
    }

    /**
     * Clear all cached instances (for testing)
     */
    static clearInstances(): void {
        this.instances.clear();
    }
}

// Export singleton for default instance
export const gcpKmsService = new GcpKmsService();
