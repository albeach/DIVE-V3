/**
 * GCP Cloud KMS Service - Unit Tests
 * 
 * Tests for Phase 4.2.1 GCP KMS integration
 * 
 * Test Coverage:
 * - KMS client initialization
 * - Asymmetric decryption
 * - Public key retrieval
 * - Key rotation
 * - Key information retrieval
 * - Permission checks
 * - Health checks
 * - Error handling
 */

import { GcpKmsService, GcpKmsFactory, IGcpKmsConfig } from '../services/gcp-kms.service';
import { KeyManagementServiceClient } from '@google-cloud/kms';
import { cacheManager, CacheManager } from '../services/cache-manager';

// Mock the KMS client and cache manager
jest.mock('@google-cloud/kms');
jest.mock('../utils/kas-logger', () => ({
    kasLogger: {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));
jest.mock('../services/cache-manager', () => ({
    cacheManager: {
        get: jest.fn(),
        set: jest.fn(),
    },
    CacheManager: {
        buildPublicKeyKey: jest.fn((keyName) => `pubkey:${keyName}`),
    },
}));

describe('GcpKmsService', () => {
    let mockClient: any;
    let service: GcpKmsService;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock KMS client
        mockClient = {
            asymmetricDecrypt: jest.fn(),
            getPublicKey: jest.fn(),
            createCryptoKeyVersion: jest.fn(),
            getCryptoKey: jest.fn(),
            listCryptoKeys: jest.fn(),
            testIamPermissions: jest.fn(),
        };

        // Mock KeyManagementServiceClient constructor
        (KeyManagementServiceClient as jest.MockedClass<typeof KeyManagementServiceClient>).mockImplementation(
            () => mockClient
        );

        // Create service instance
        service = new GcpKmsService({
            projectId: 'test-project',
            location: 'us-central1',
            keyRingId: 'test-keyring',
            keyId: 'test-key',
        });
    });

    describe('Constructor', () => {
        it('should initialize with provided config', () => {
            const config: IGcpKmsConfig = {
                projectId: 'custom-project',
                keyFilename: '/path/to/credentials.json',
                location: 'europe-west1',
                keyRingId: 'custom-keyring',
                keyId: 'custom-key',
            };

            const customService = new GcpKmsService(config);
            expect(customService).toBeDefined();
        });

        it('should use environment variables as fallback', () => {
            process.env.GCP_PROJECT_ID = 'env-project';
            process.env.GOOGLE_APPLICATION_CREDENTIALS = '/env/credentials.json';

            const envService = new GcpKmsService();
            expect(envService).toBeDefined();

            // Cleanup
            delete process.env.GCP_PROJECT_ID;
            delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
        });

        it('should use default project ID if not specified', () => {
            const defaultService = new GcpKmsService({});
            expect(defaultService).toBeDefined();
        });
    });

    describe('decryptWithKMS', () => {
        const keyName = 'projects/test-project/locations/us-central1/keyRings/test-keyring/cryptoKeys/test-key';
        const plaintext = Buffer.from('decrypted data');

        it('should decrypt ciphertext successfully', async () => {
            mockClient.asymmetricDecrypt.mockResolvedValue([{ plaintext }]);

            const ciphertext = Buffer.from('encrypted data');
            const result = await service.decryptWithKMS(ciphertext, keyName);

            expect(result).toEqual(plaintext);
            expect(mockClient.asymmetricDecrypt).toHaveBeenCalledWith({
                name: keyName,
                ciphertext,
            });
        });

        it('should decrypt base64-encoded string', async () => {
            mockClient.asymmetricDecrypt.mockResolvedValue([{ plaintext }]);

            const base64Ciphertext = Buffer.from('encrypted data').toString('base64');
            const result = await service.decryptWithKMS(base64Ciphertext, keyName);

            expect(result).toEqual(plaintext);
            expect(mockClient.asymmetricDecrypt).toHaveBeenCalledWith({
                name: keyName,
                ciphertext: Buffer.from(base64Ciphertext, 'base64'),
            });
        });

        it('should throw error if decryption returns empty plaintext', async () => {
            mockClient.asymmetricDecrypt.mockResolvedValue([{ plaintext: null }]);

            await expect(
                service.decryptWithKMS('ciphertext', keyName)
            ).rejects.toThrow('KMS decryption returned empty plaintext');
        });

        it('should throw error on KMS failure', async () => {
            mockClient.asymmetricDecrypt.mockRejectedValue(new Error('Permission denied'));

            await expect(
                service.decryptWithKMS('ciphertext', keyName)
            ).rejects.toThrow(/GCP KMS decryption failed/);
        });

        it('should handle unknown errors gracefully', async () => {
            mockClient.asymmetricDecrypt.mockRejectedValue('string error');

            await expect(
                service.decryptWithKMS('ciphertext', keyName)
            ).rejects.toThrow(/GCP KMS decryption failed/);
        });
    });

    describe('getPublicKey', () => {
        const keyName = 'projects/test-project/locations/us-central1/keyRings/test-keyring/cryptoKeys/test-key';
        const pemPublicKey = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...\n-----END PUBLIC KEY-----';

        it('should fetch public key successfully', async () => {
            mockClient.getPublicKey.mockResolvedValue([
                {
                    pem: pemPublicKey,
                    algorithm: 'RSA_DECRYPT_OAEP_4096_SHA256',
                },
            ]);

            const result = await service.getPublicKey(keyName);

            expect(result).toBe(pemPublicKey);
            expect(mockClient.getPublicKey).toHaveBeenCalledWith({ name: keyName });
        });

        it('should throw error if public key is empty', async () => {
            mockClient.getPublicKey.mockResolvedValue([{ pem: null }]);

            await expect(service.getPublicKey(keyName)).rejects.toThrow(
                'KMS returned empty public key'
            );
        });

        it('should throw error on KMS failure', async () => {
            mockClient.getPublicKey.mockRejectedValue(new Error('Key not found'));

            await expect(service.getPublicKey(keyName)).rejects.toThrow(
                /Failed to fetch public key/
            );
        });

        it('should return cached public key on cache hit', async () => {
            const cachedPem = '-----BEGIN PUBLIC KEY-----\nCACHED...\n-----END PUBLIC KEY-----';
            (cacheManager.get as jest.Mock).mockResolvedValue({ pem: cachedPem });

            const result = await service.getPublicKey(keyName);

            expect(result).toBe(cachedPem);
            expect(mockClient.getPublicKey).not.toHaveBeenCalled();
            expect(cacheManager.get).toHaveBeenCalledWith(`pubkey:${keyName}`);
        });

        it('should fetch and cache public key on cache miss', async () => {
            (cacheManager.get as jest.Mock).mockResolvedValue(null); // Cache miss
            mockClient.getPublicKey.mockResolvedValue([
                {
                    pem: pemPublicKey,
                    algorithm: 'RSA_DECRYPT_OAEP_4096_SHA256',
                },
            ]);

            const result = await service.getPublicKey(keyName);

            expect(result).toBe(pemPublicKey);
            expect(cacheManager.get).toHaveBeenCalledWith(`pubkey:${keyName}`);
            expect(mockClient.getPublicKey).toHaveBeenCalledWith({ name: keyName });
            expect(cacheManager.set).toHaveBeenCalledWith(
                `pubkey:${keyName}`,
                { pem: pemPublicKey }
            );
        });

        it('should handle cache errors gracefully (fail-open)', async () => {
            (cacheManager.get as jest.Mock).mockResolvedValue(null); // Cache returns null on error (fail-open)
            mockClient.getPublicKey.mockResolvedValue([
                {
                    pem: pemPublicKey,
                    algorithm: 'RSA_DECRYPT_OAEP_4096_SHA256',
                },
            ]);

            const result = await service.getPublicKey(keyName);

            expect(result).toBe(pemPublicKey);
            expect(mockClient.getPublicKey).toHaveBeenCalled();
        });
    });

    describe('rotateKey', () => {
        const keyName = 'projects/test-project/locations/us-central1/keyRings/test-keyring/cryptoKeys/test-key';
        const newVersionName = `${keyName}/cryptoKeyVersions/2`;

        it('should rotate key successfully', async () => {
            mockClient.createCryptoKeyVersion.mockResolvedValue([
                {
                    name: newVersionName,
                    state: 'ENABLED',
                },
            ]);

            const result = await service.rotateKey(keyName);

            expect(result).toBe(newVersionName);
            expect(mockClient.createCryptoKeyVersion).toHaveBeenCalledWith({
                parent: keyName,
            });
        });

        it('should throw error if version creation fails', async () => {
            mockClient.createCryptoKeyVersion.mockResolvedValue([{ name: null }]);

            await expect(service.rotateKey(keyName)).rejects.toThrow(
                'Failed to create new key version'
            );
        });

        it('should throw error on KMS failure', async () => {
            mockClient.createCryptoKeyVersion.mockRejectedValue(
                new Error('Insufficient permissions')
            );

            await expect(service.rotateKey(keyName)).rejects.toThrow(
                /Key rotation failed/
            );
        });
    });

    describe('getKeyInfo', () => {
        const keyName = 'projects/test-project/locations/us-central1/keyRings/test-keyring/cryptoKeys/test-key';

        it('should retrieve key information successfully', async () => {
            mockClient.getCryptoKey.mockResolvedValue([
                {
                    name: keyName,
                    purpose: 'ASYMMETRIC_DECRYPT',
                    versionTemplate: {
                        algorithm: 'RSA_DECRYPT_OAEP_4096_SHA256',
                        protectionLevel: 'SOFTWARE',
                    },
                },
            ]);

            const result = await service.getKeyInfo(keyName);

            expect(result).toEqual({
                name: keyName,
                location: 'us-central1',
                keyRing: 'test-keyring',
                keyId: 'test-key',
                algorithm: 'RSA_DECRYPT_OAEP_4096_SHA256',
                protectionLevel: 'SOFTWARE',
                purpose: 'ASYMMETRIC_DECRYPT',
            });
        });

        it('should throw error if key not found', async () => {
            mockClient.getCryptoKey.mockResolvedValue([{ name: null }]);

            await expect(service.getKeyInfo(keyName)).rejects.toThrow('Key not found');
        });

        it('should handle missing version template', async () => {
            mockClient.getCryptoKey.mockResolvedValue([
                {
                    name: keyName,
                    purpose: 'ASYMMETRIC_DECRYPT',
                    versionTemplate: null,
                },
            ]);

            const result = await service.getKeyInfo(keyName);

            expect(result.algorithm).toBe('UNKNOWN');
            expect(result.protectionLevel).toBe('UNKNOWN');
        });
    });

    describe('buildKeyName', () => {
        it('should build key name without version', () => {
            const result = service.buildKeyName('us-central1', 'test-keyring', 'test-key');

            expect(result).toBe(
                'projects/test-project/locations/us-central1/keyRings/test-keyring/cryptoKeys/test-key'
            );
        });

        it('should build key name with version', () => {
            const result = service.buildKeyName('us-central1', 'test-keyring', 'test-key', '1');

            expect(result).toBe(
                'projects/test-project/locations/us-central1/keyRings/test-keyring/cryptoKeys/test-key/cryptoKeyVersions/1'
            );
        });
    });

    describe('healthCheck', () => {
        const keyName = 'projects/test-project/locations/us-central1/keyRings/test-keyring/cryptoKeys/test-key';
        const pemPublicKey = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...\n-----END PUBLIC KEY-----';

        it('should return true if KMS is healthy', async () => {
            (cacheManager.get as jest.Mock).mockResolvedValue(null); // Cache miss
            mockClient.getPublicKey.mockResolvedValue([{ pem: pemPublicKey }]);

            const result = await service.healthCheck(keyName);

            expect(result).toBe(true);
        });

        it('should return false if KMS is unhealthy', async () => {
            mockClient.getPublicKey.mockRejectedValue(new Error('Service unavailable'));

            const result = await service.healthCheck(keyName);

            expect(result).toBe(false);
        });
    });

    describe('listKeys', () => {
        it('should list all keys in keyring', async () => {
            const keys = [
                { name: 'projects/test/locations/us/keyRings/kr/cryptoKeys/key1' },
                { name: 'projects/test/locations/us/keyRings/kr/cryptoKeys/key2' },
                { name: 'projects/test/locations/us/keyRings/kr/cryptoKeys/key3' },
            ];

            mockClient.listCryptoKeys.mockResolvedValue([keys]);

            const result = await service.listKeys('us-central1', 'test-keyring');

            expect(result).toHaveLength(3);
            expect(result[0]).toBe(keys[0].name);
        });

        it('should filter out keys without names', async () => {
            const keys = [
                { name: 'projects/test/locations/us/keyRings/kr/cryptoKeys/key1' },
                { name: null },
                { name: 'projects/test/locations/us/keyRings/kr/cryptoKeys/key2' },
            ];

            mockClient.listCryptoKeys.mockResolvedValue([keys]);

            const result = await service.listKeys('us-central1', 'test-keyring');

            expect(result).toHaveLength(2);
        });

        it('should return empty array on error', async () => {
            mockClient.listCryptoKeys.mockRejectedValue(new Error('Permission denied'));

            const result = await service.listKeys('us-central1', 'test-keyring');

            expect(result).toEqual([]);
        });
    });

    describe('checkPermissions', () => {
        const keyName = 'projects/test-project/locations/us-central1/keyRings/test-keyring/cryptoKeys/test-key';

        it('should return all permissions when granted', async () => {
            mockClient.testIamPermissions.mockResolvedValue([
                {
                    permissions: [
                        'cloudkms.cryptoKeyVersions.useToDecrypt',
                        'cloudkms.cryptoKeyVersions.viewPublicKey',
                        'cloudkms.cryptoKeyVersions.create',
                    ],
                },
            ]);

            const result = await service.checkPermissions(keyName);

            expect(result).toEqual({
                canDecrypt: true,
                canGetPublicKey: true,
                canRotate: true,
            });
        });

        it('should return false for missing permissions', async () => {
            mockClient.testIamPermissions.mockResolvedValue([
                {
                    permissions: ['cloudkms.cryptoKeyVersions.useToDecrypt'],
                },
            ]);

            const result = await service.checkPermissions(keyName);

            expect(result).toEqual({
                canDecrypt: true,
                canGetPublicKey: false,
                canRotate: false,
            });
        });

        it('should handle empty permissions', async () => {
            mockClient.testIamPermissions.mockResolvedValue([{ permissions: [] }]);

            const result = await service.checkPermissions(keyName);

            expect(result).toEqual({
                canDecrypt: false,
                canGetPublicKey: false,
                canRotate: false,
            });
        });

        it('should return false on error', async () => {
            mockClient.testIamPermissions.mockRejectedValue(new Error('API error'));

            const result = await service.checkPermissions(keyName);

            expect(result).toEqual({
                canDecrypt: false,
                canGetPublicKey: false,
                canRotate: false,
            });
        });
    });
});

describe('GcpKmsFactory', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        GcpKmsFactory.clearInstances();

        // Mock KeyManagementServiceClient
        (KeyManagementServiceClient as jest.MockedClass<typeof KeyManagementServiceClient>).mockImplementation(
            () => ({} as any)
        );
    });

    describe('getService', () => {
        it('should create service for USA', () => {
            const service = GcpKmsFactory.getService('usa');
            expect(service).toBeInstanceOf(GcpKmsService);
        });

        it('should create service for FRA', () => {
            const service = GcpKmsFactory.getService('fra');
            expect(service).toBeInstanceOf(GcpKmsService);
        });

        it('should create service for GBR', () => {
            const service = GcpKmsFactory.getService('gbr');
            expect(service).toBeInstanceOf(GcpKmsService);
        });

        it('should return cached instance for same KAS ID', () => {
            const service1 = GcpKmsFactory.getService('usa');
            const service2 = GcpKmsFactory.getService('usa');

            expect(service1).toBe(service2);
        });

        it('should return different instances for different KAS IDs', () => {
            const serviceUSA = GcpKmsFactory.getService('usa');
            const serviceFRA = GcpKmsFactory.getService('fra');

            expect(serviceUSA).not.toBe(serviceFRA);
        });

        it('should normalize KAS ID to lowercase', () => {
            const service1 = GcpKmsFactory.getService('USA');
            const service2 = GcpKmsFactory.getService('usa');

            expect(service1).toBe(service2);
        });

        it('should default to USA for unknown KAS ID', () => {
            const service = GcpKmsFactory.getService('unknown');
            expect(service).toBeInstanceOf(GcpKmsService);
        });
    });

    describe('clearInstances', () => {
        it('should clear all cached instances', () => {
            const service1 = GcpKmsFactory.getService('usa');
            GcpKmsFactory.clearInstances();
            const service2 = GcpKmsFactory.getService('usa');

            expect(service1).not.toBe(service2);
        });
    });
});
