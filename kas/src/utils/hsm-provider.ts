/**
 * HSM (Hardware Security Module) Provider Abstraction
 * 
 * Abstract interface for key management operations.
 * Supports multiple HSM implementations:
 * - GcpKmsProvider: Google Cloud KMS (production) - FIPS 140-2 Level 3
 * - MockHSMProvider: In-memory keys (development)
 * - AWSKMSProvider: AWS Key Management Service (deprecated)
 * - AzureHSMProvider: Azure Key Vault HSM (not implemented)
 * - PKCS11Provider: Generic PKCS#11 HSM (not implemented)
 * 
 * Reference: FIPS 140-2 Level 3 for production (GCP KMS)
 * Phase 4.2.1: GCP KMS integration for production key management
 */

import { kasLogger } from './kas-logger';
import crypto from 'crypto';
import { GcpKmsService, GcpKmsFactory } from '../services/gcp-kms.service';
import { cacheManager, CacheManager } from '../services/cache-manager';

export interface IHSMProvider {
    /** Wrap (encrypt) a DEK with KEK */
    wrapKey(dek: Buffer, kekId: string): Promise<string>;
    
    /** Unwrap (decrypt) a wrapped DEK */
    unwrapKey(wrappedKey: string, kekId: string): Promise<Buffer>;
    
    /** Generate a new DEK */
    generateDEK(): Promise<Buffer>;
    
    /** Generate a new KEK */
    generateKEK(): Promise<string>;
    
    /** Rotate a KEK */
    rotateKEK(kekId: string): Promise<string>;
    
    /** Get provider name */
    getName(): string;
    
    /** Check if provider is available */
    isAvailable(): Promise<boolean>;
}

/**
 * Mock HSM Provider (Development/Testing)
 * 
 * WARNING: Uses in-memory keys. NOT for production use.
 */
export class MockHSMProvider implements IHSMProvider {
    private kekStore: Map<string, Buffer> = new Map();
    private readonly name = 'MockHSM';

    constructor() {
        // Initialize with a default KEK for testing
        const defaultKEK = crypto.randomBytes(32);
        this.kekStore.set('mock-kek-001', defaultKEK);
        kasLogger.info('MockHSMProvider initialized', { kekCount: this.kekStore.size });
    }

    async wrapKey(dek: Buffer, kekId: string): Promise<string> {
        const kek = this.kekStore.get(kekId);
        if (!kek) {
            throw new Error(`KEK not found: ${kekId}`);
        }

        // Simple AES-256-GCM encryption (mock)
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
        
        let encrypted = cipher.update(dek);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const authTag = cipher.getAuthTag();

        // Combine IV + encrypted + authTag
        const wrapped = Buffer.concat([iv, authTag, encrypted]);
        return wrapped.toString('base64');
    }

    async unwrapKey(wrappedKey: string, kekId: string): Promise<Buffer> {
        // Check cache first (Phase 4.2.2)
        const cacheKey = CacheManager.buildDekKey(wrappedKey, kekId);
        const cached = await cacheManager.get<{ dek: string }>(cacheKey);
        
        if (cached) {
            kasLogger.debug('DEK cache hit', { kekId, cacheKey });
            return Buffer.from(cached.dek, 'base64');
        }
        
        kasLogger.debug('DEK cache miss', { kekId, cacheKey });
        
        const kek = this.kekStore.get(kekId);
        if (!kek) {
            throw new Error(`KEK not found: ${kekId}`);
        }

        const wrapped = Buffer.from(wrappedKey, 'base64');
        
        // Extract IV, authTag, and encrypted data
        const iv = wrapped.subarray(0, 12);
        const authTag = wrapped.subarray(12, 28);
        const encrypted = wrapped.subarray(28);

        // Decrypt
        const decipher = crypto.createDecipheriv('aes-256-gcm', kek, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        // Cache the unwrapped DEK (Phase 4.2.2)
        await cacheManager.set(cacheKey, { dek: decrypted.toString('base64') });
        
        return decrypted;
    }

    async generateDEK(): Promise<Buffer> {
        return crypto.randomBytes(32); // 256-bit key
    }

    async generateKEK(): Promise<string> {
        const kekId = `mock-kek-${Date.now()}`;
        const kek = crypto.randomBytes(32);
        this.kekStore.set(kekId, kek);
        kasLogger.info('New KEK generated', { kekId, provider: this.name });
        return kekId;
    }

    async rotateKEK(kekId: string): Promise<string> {
        // Generate new KEK
        const newKekId = await this.generateKEK();
        
        // In production, would migrate wrapped keys to new KEK
        // For mock, just return new KEK ID
        kasLogger.info('KEK rotated', { oldKekId: kekId, newKekId, provider: this.name });
        return newKekId;
    }

    getName(): string {
        return this.name;
    }

    async isAvailable(): Promise<boolean> {
        return true; // Mock is always available
    }
}

/**
 * GCP Cloud KMS Provider (Production)
 * 
 * Integrates with Google Cloud Key Management Service.
 * FIPS 140-2 Level 3 certified, RSA 4096-bit asymmetric encryption.
 * 
 * Phase 4.2.1: Production HSM integration using GCP KMS
 */
export class GcpKmsProvider implements IHSMProvider {
    private readonly name = 'GcpKMS';
    private kmsService: GcpKmsService;
    private kasId: string;
    private keyName: string;
    
    constructor(kasId: string = 'usa') {
        this.kasId = kasId.toLowerCase();
        this.kmsService = GcpKmsFactory.getService(this.kasId);
        
        // Build the key name based on KAS instance
        const regionMapping: Record<string, { location: string; keyRing: string; key: string }> = {
            usa: { location: 'us-central1', keyRing: 'kas-usa', key: 'kas-usa-private-key' },
            fra: { location: 'europe-west1', keyRing: 'kas-fra', key: 'kas-fra-private-key' },
            gbr: { location: 'europe-west2', keyRing: 'kas-gbr', key: 'kas-gbr-private-key' },
        };
        
        const mapping = regionMapping[this.kasId] || regionMapping.usa;
        this.keyName = this.kmsService.buildKeyName(mapping.location, mapping.keyRing, mapping.key);
        
        kasLogger.info('GcpKmsProvider initialized', { 
            kasId: this.kasId, 
            keyName: this.keyName,
        });
    }

    async wrapKey(dek: Buffer, kekId: string): Promise<string> {
        // Note: GCP KMS asymmetric keys don't support "wrap" operation directly
        // For production, we would use symmetric encryption keys or 
        // store wrapped keys in a secure storage (Cloud Storage with KMS encryption)
        kasLogger.warn('GCP KMS asymmetric keys do not support direct key wrapping');
        kasLogger.info('Using fallback: Base64 encoding (NOT SECURE FOR PRODUCTION)');
        
        // For the pilot, return base64-encoded DEK (this should be replaced with proper KEK wrapping)
        return dek.toString('base64');
    }

    async unwrapKey(wrappedKey: string, kekId: string): Promise<Buffer> {
        // Check cache first (Phase 4.2.2)
        const cacheKey = CacheManager.buildDekKey(wrappedKey, kekId);
        const cached = await cacheManager.get<{ dek: string }>(cacheKey);
        
        if (cached) {
            kasLogger.debug('DEK cache hit (GCP KMS)', { kekId, cacheKey });
            return Buffer.from(cached.dek, 'base64');
        }
        
        kasLogger.debug('DEK cache miss (GCP KMS)', { kekId, cacheKey });
        
        try {
            // Decrypt the wrapped key using GCP KMS
            const decrypted = await this.kmsService.decryptWithKMS(wrappedKey, this.keyName);
            
            kasLogger.info('Key unwrapped successfully via GCP KMS', {
                kekId,
                keyName: this.keyName,
                decryptedLength: decrypted.length,
            });
            
            // Cache the unwrapped DEK (Phase 4.2.2)
            await cacheManager.set(cacheKey, { dek: decrypted.toString('base64') });
            
            return decrypted;
            
        } catch (error) {
            kasLogger.error('Failed to unwrap key with GCP KMS', {
                kekId,
                keyName: this.keyName,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            
            throw new Error(
                `GCP KMS unwrap failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    async generateDEK(): Promise<Buffer> {
        // Generate a random 256-bit DEK
        return crypto.randomBytes(32);
    }

    async generateKEK(): Promise<string> {
        // GCP KMS keys are created via gcloud CLI or Terraform
        // Return the current key name
        kasLogger.info('GCP KMS keys are managed externally', { keyName: this.keyName });
        return this.keyName;
    }

    async rotateKEK(kekId: string): Promise<string> {
        try {
            const newVersion = await this.kmsService.rotateKey(this.keyName);
            kasLogger.info('GCP KMS key rotated successfully', {
                oldKekId: kekId,
                newVersion,
            });
            return newVersion;
            
        } catch (error) {
            kasLogger.error('Failed to rotate GCP KMS key', {
                kekId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            
            throw new Error(
                `GCP KMS rotation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    getName(): string {
        return this.name;
    }

    async isAvailable(): Promise<boolean> {
        try {
            // Test connectivity by fetching public key
            const healthy = await this.kmsService.healthCheck(this.keyName);
            return healthy;
            
        } catch (error) {
            kasLogger.error('GCP KMS availability check failed', {
                keyName: this.keyName,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return false;
        }
    }
    
    /**
     * Get the public key for this KMS key
     */
    async getPublicKey(): Promise<string> {
        return await this.kmsService.getPublicKey(this.keyName);
    }
    
    /**
     * Get key information
     */
    async getKeyInfo() {
        return await this.kmsService.getKeyInfo(this.keyName);
    }
}

/**
 * AWS KMS Provider (Deprecated - Use GCP KMS)
 * 
 * Integrates with AWS Key Management Service.
 * Requires: aws-sdk v3
 * 
 * NOTE: This is deprecated in favor of GCP KMS for DIVE V3
 */
export class AWSKMSProvider implements IHSMProvider {
    private readonly name = 'AWSKMS';
    private readonly region: string;
    private readonly keyId: string;

    constructor(region: string, keyId: string) {
        this.region = region;
        this.keyId = keyId;
        kasLogger.warn('AWSKMSProvider is deprecated - use GcpKmsProvider instead', { region, keyId });
    }

    async wrapKey(dek: Buffer, kekId: string): Promise<string> {
        throw new Error('AWSKMSProvider is deprecated - use GcpKmsProvider');
    }

    async unwrapKey(wrappedKey: string, kekId: string): Promise<Buffer> {
        throw new Error('AWSKMSProvider is deprecated - use GcpKmsProvider');
    }

    async generateDEK(): Promise<Buffer> {
        throw new Error('AWSKMSProvider is deprecated - use GcpKmsProvider');
    }

    async generateKEK(): Promise<string> {
        throw new Error('AWSKMSProvider is deprecated - use GcpKmsProvider');
    }

    async rotateKEK(kekId: string): Promise<string> {
        throw new Error('AWSKMSProvider is deprecated - use GcpKmsProvider');
    }

    getName(): string {
        return this.name;
    }

    async isAvailable(): Promise<boolean> {
        return false;
    }
}

/**
 * HSM Provider Factory
 * 
 * Creates appropriate HSM provider based on configuration.
 * 
 * Environment Variables:
 * - USE_GCP_KMS: true/false (default: false for backward compatibility)
 * - KAS_HSM_PROVIDER: mock|gcp-kms|aws-kms (deprecated in favor of USE_GCP_KMS)
 * - KAS_ID: usa|fra|gbr (for GCP KMS regional key selection)
 */
export class HSMProviderFactory {
    /**
     * Create HSM provider based on configuration
     * 
     * Priority:
     * 1. USE_GCP_KMS=true → GcpKmsProvider
     * 2. KAS_HSM_PROVIDER=gcp-kms → GcpKmsProvider
     * 3. KAS_HSM_PROVIDER=mock → MockHSMProvider (default)
     */
    static create(providerType?: string): IHSMProvider {
        // Feature flag check: USE_GCP_KMS takes precedence
        const useGcpKms = process.env.USE_GCP_KMS === 'true';
        const kasId = process.env.KAS_ID || 'usa';
        
        if (useGcpKms) {
            kasLogger.info('GCP KMS enabled via USE_GCP_KMS flag', { kasId });
            return new GcpKmsProvider(kasId);
        }
        
        // Legacy provider type selection
        const type = providerType || process.env.KAS_HSM_PROVIDER || 'mock';
        
        switch (type.toLowerCase()) {
            case 'gcp-kms':
            case 'google-kms':
                kasLogger.info('Creating GCP KMS provider', { kasId });
                return new GcpKmsProvider(kasId);
            
            case 'mock':
                kasLogger.info('Creating MockHSM provider (development mode)');
                return new MockHSMProvider();
            
            case 'aws-kms':
                kasLogger.warn('AWS KMS is deprecated, falling back to mock');
                return new MockHSMProvider();
            
            case 'azure-hsm':
                kasLogger.warn('Azure HSM not yet implemented, falling back to mock');
                return new MockHSMProvider();
            
            case 'pkcs11':
                kasLogger.warn('PKCS#11 HSM not yet implemented, falling back to mock');
                return new MockHSMProvider();
            
            default:
                kasLogger.warn(`Unknown HSM provider type: ${type}, using mock`);
                return new MockHSMProvider();
        }
    }
    
    /**
     * Check if GCP KMS is enabled
     */
    static isGcpKmsEnabled(): boolean {
        return process.env.USE_GCP_KMS === 'true' || 
               process.env.KAS_HSM_PROVIDER === 'gcp-kms' ||
               process.env.KAS_HSM_PROVIDER === 'google-kms';
    }
}

/**
 * Global HSM provider instance
 */
export const hsmProvider = HSMProviderFactory.create();
