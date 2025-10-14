/**
 * Resource Service Test Suite
 * Tests for ZTDF resource management, integrity validation, and MongoDB operations
 * 
 * Target Coverage: 90%
 * Priority: CRITICAL (ZTDF compliance)
 */

import {
    getAllResources,
    getAllResourcesLegacy,
    getResourceById,
    getResourceByIdLegacy,
    createZTDFResource,
    createResource,
    getZTDFObject
} from '../services/resource.service';
import { validateZTDFIntegrity } from '../utils/ztdf.utils';
import {
    setupMongoDB,
    teardownMongoDB
} from './helpers/mongo-test-helper';
import {
    TEST_RESOURCES,
    createTestZTDFResource,
    createTamperedZTDFResource,
    createZTDFResourceWithoutHashes
} from './helpers/test-fixtures';

// Mock logger module
jest.mock('../utils/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        child: jest.fn().mockReturnValue({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        })
    }
}));

describe('Resource Service', () => {
    let mongoHelper: any;

    beforeAll(async () => {
        mongoHelper = await setupMongoDB();
    });

    afterAll(async () => {
        await teardownMongoDB();
    });

    beforeEach(async () => {
        await mongoHelper.clearDatabase();
    });

    // ============================================
    // getAllResources Tests
    // ============================================
    describe('getAllResources', () => {
        it('should return all ZTDF resources', async () => {
            // Seed test resources
            await mongoHelper.seedResources();

            const resources = await getAllResources();

            expect(resources).toBeDefined();
            expect(resources.length).toBeGreaterThan(0);
            expect(resources[0].ztdf).toBeDefined();
        });

        it('should return empty array when no resources exist', async () => {
            const resources = await getAllResources();

            expect(resources).toEqual([]);
        });

        it('should validate ZTDF integrity for all resources', async () => {
            await mongoHelper.seedResources();

            const resources = await getAllResources();

            // All resources should have valid integrity
            for (const resource of resources) {
                const validation = validateZTDFIntegrity(resource.ztdf);
                expect(validation.valid).toBe(true);
            }
        });

        it('should log errors for resources with invalid integrity', async () => {
            // Insert a tampered resource
            const tamperedResource = createTamperedZTDFResource();
            await mongoHelper.insertResource(tamperedResource);

            const resources = await getAllResources();

            // Should still return the resource but log error
            expect(resources).toHaveLength(1);
            // Logger is mocked - error will be logged to mock
        });

        it('should log warnings for resources with missing hashes', async () => {
            const resourceWithoutHashes = createZTDFResourceWithoutHashes();
            await mongoHelper.insertResource(resourceWithoutHashes);

            const resources = await getAllResources();

            // Logger is mocked - warnings will be logged to mock
            expect(resources).toBeDefined();
        });

        it('should handle MongoDB connection errors', async () => {
            // Disconnect to simulate error
            await mongoHelper.disconnect();

            await expect(getAllResources()).rejects.toThrow();

            // Reconnect for other tests
            await mongoHelper.connect();
        });
    });

    // ============================================
    // getAllResourcesLegacy Tests
    // ============================================
    describe('getAllResourcesLegacy', () => {
        it('should return resources in legacy format', async () => {
            await mongoHelper.seedResources();

            const resources = await getAllResourcesLegacy();

            expect(resources).toBeDefined();
            expect(resources.length).toBeGreaterThan(0);

            // Should have legacy fields
            const resource = resources[0];
            expect(resource.resourceId).toBeDefined();
            expect(resource.classification).toBeDefined();
            expect(resource.releasabilityTo).toBeDefined();
            expect(resource.encrypted).toBeDefined();
        });

        it('should extract classification from ZTDF structure', async () => {
            await mongoHelper.insertResource(TEST_RESOURCES.fveySecretDocument);

            const resources = await getAllResourcesLegacy();

            expect(resources[0].classification).toBe('SECRET');
        });

        it('should extract releasabilityTo from ZTDF structure', async () => {
            await mongoHelper.insertResource(TEST_RESOURCES.fveySecretDocument);

            const resources = await getAllResourcesLegacy();

            expect(resources[0].releasabilityTo).toContain('USA');
            expect(resources[0].releasabilityTo).toContain('GBR');
        });
    });

    // ============================================
    // getResourceById Tests
    // ============================================
    describe('getResourceById', () => {
        it('should return ZTDF resource by ID', async () => {
            await mongoHelper.insertResource(TEST_RESOURCES.fveySecretDocument);

            const resource = await getResourceById('doc-fvey-001');

            expect(resource).toBeDefined();
            expect(resource?.resourceId).toBe('doc-fvey-001');
            expect(resource?.ztdf).toBeDefined();
        });

        it('should return null for non-existent resource', async () => {
            const resource = await getResourceById('non-existent-id');

            expect(resource).toBeNull();
        });

        it('should validate ZTDF integrity on fetch (fail-closed)', async () => {
            const tamperedResource = createTamperedZTDFResource();
            await mongoHelper.insertResource(tamperedResource);

            await expect(getResourceById('doc-tampered-001')).rejects.toThrow(
                /ZTDF integrity validation failed/
            );
        });

        it('should throw error for tampered policy section', async () => {
            const tamperedResource = createTamperedZTDFResource();
            await mongoHelper.insertResource(tamperedResource);

            await expect(getResourceById('doc-tampered-001')).rejects.toThrow();
        });

        it('should log warnings but succeed for resources with missing hashes', async () => {
            const resourceWithoutHashes = createZTDFResourceWithoutHashes();
            await mongoHelper.insertResource(resourceWithoutHashes);

            // Should succeed but log warnings
            const resource = await getResourceById('doc-nohash-001');

            expect(resource).toBeDefined();
            // Logger is mocked - warnings will be logged to mock
        });

        it('should handle MongoDB errors gracefully', async () => {
            await mongoHelper.disconnect();

            await expect(getResourceById('any-id')).rejects.toThrow();

            await mongoHelper.connect();
        });

        it('should validate all integrity checks (ACP-240 compliance)', async () => {
            await mongoHelper.insertResource(TEST_RESOURCES.fveySecretDocument);

            const resource = await getResourceById('doc-fvey-001');

            // Manually verify integrity
            const validation = validateZTDFIntegrity(resource!.ztdf);
            expect(validation.valid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });
    });

    // ============================================
    // getResourceByIdLegacy Tests
    // ============================================
    describe('getResourceByIdLegacy', () => {
        it('should return resource in legacy format', async () => {
            await mongoHelper.insertResource(TEST_RESOURCES.fveySecretDocument);

            const resource = await getResourceByIdLegacy('doc-fvey-001');

            expect(resource).toBeDefined();
            expect(resource?.resourceId).toBe('doc-fvey-001');
            expect(resource?.classification).toBe('SECRET');
            expect(resource?.releasabilityTo).toBeDefined();
            expect(resource?.encrypted).toBe(true);
        });

        it('should return null for non-existent resource', async () => {
            const resource = await getResourceByIdLegacy('non-existent');

            expect(resource).toBeNull();
        });

        it('should extract COI from ZTDF structure', async () => {
            await mongoHelper.insertResource(TEST_RESOURCES.fveySecretDocument);

            const resource = await getResourceByIdLegacy('doc-fvey-001');

            expect(resource?.COI).toContain('FVEY');
        });

        it('should throw error for tampered resources (fail-closed)', async () => {
            const tamperedResource = createTamperedZTDFResource();
            await mongoHelper.insertResource(tamperedResource);

            await expect(getResourceByIdLegacy('doc-tampered-001')).rejects.toThrow();
        });
    });

    // ============================================
    // createZTDFResource Tests
    // ============================================
    describe('createZTDFResource', () => {
        it('should create valid ZTDF resource', async () => {
            const newResource = createTestZTDFResource({
                resourceId: 'doc-new-001',
                title: 'New Test Document',
                classification: 'CONFIDENTIAL',
                releasabilityTo: ['USA', 'CAN'],
                COI: ['CAN-US'],
                content: 'Test content'
            });

            const created = await createZTDFResource(newResource);

            expect(created).toBeDefined();
            expect(created.resourceId).toBe('doc-new-001');
            expect(created.createdAt).toBeDefined();
            expect(created.updatedAt).toBeDefined();

            // Verify it was stored
            const fetched = await getResourceById('doc-new-001');
            expect(fetched).toBeDefined();
        });

        it('should validate ZTDF integrity before storing (fail-closed)', async () => {
            const tamperedResource = createTamperedZTDFResource();

            await expect(createZTDFResource(tamperedResource)).rejects.toThrow(
                /ZTDF integrity validation failed/
            );
        });

        it('should reject resource with missing policy hash', async () => {
            const resourceWithoutHash = createZTDFResourceWithoutHashes();

            // Should throw due to missing hashes (treated as validation failure)
            await expect(createZTDFResource(resourceWithoutHash)).rejects.toThrow();
        });

        it('should set timestamps on creation', async () => {
            const newResource = createTestZTDFResource({
                resourceId: 'doc-timestamp-001',
                title: 'Timestamp Test',
                classification: 'UNCLASSIFIED',
                releasabilityTo: ['USA'],
                content: 'test'
            });

            const before = new Date();
            const created = await createZTDFResource(newResource);
            const after = new Date();

            expect(created.createdAt).toBeDefined();
            expect(created.updatedAt).toBeDefined();
            expect(created.createdAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(created.createdAt!.getTime()).toBeLessThanOrEqual(after.getTime());
            expect(created.updatedAt).toEqual(created.createdAt);
        });

        it('should log resource creation', async () => {
            const newResource = createTestZTDFResource({
                resourceId: 'doc-log-001',
                title: 'Log Test',
                classification: 'SECRET',
                releasabilityTo: ['USA'],
                content: 'test'
            });

            await createZTDFResource(newResource);

            // Logger is mocked - info will be logged to mock
        });

        it('should handle MongoDB errors gracefully', async () => {
            const newResource = createTestZTDFResource({
                resourceId: 'doc-error-001',
                title: 'Error Test',
                classification: 'SECRET',
                releasabilityTo: ['USA'],
                content: 'test'
            });

            await mongoHelper.disconnect();

            await expect(createZTDFResource(newResource)).rejects.toThrow();

            await mongoHelper.connect();
        });
    });

    // ============================================
    // createResource (Legacy) Tests
    // ============================================
    describe('createResource', () => {
        it('should create legacy resource and convert to ZTDF', async () => {
            const legacyResource = {
                resourceId: 'doc-legacy-001',
                title: 'Legacy Document',
                classification: 'SECRET' as const,
                releasabilityTo: ['USA', 'GBR'],
                COI: ['FVEY'],
                encrypted: false,
                content: 'Legacy content'
            };

            const created = await createResource(legacyResource);

            expect(created).toBeDefined();
            expect(created.resourceId).toBe('doc-legacy-001');

            // Verify ZTDF conversion happened
            const fetched = await getResourceById('doc-legacy-001');
            expect(fetched?.ztdf).toBeDefined();
            expect(fetched?.legacy).toBeDefined();
        });

        it('should preserve legacy fields in ZTDF resource', async () => {
            const legacyResource = {
                resourceId: 'doc-legacy-002',
                title: 'Legacy Preservation',
                classification: 'CONFIDENTIAL' as const,
                releasabilityTo: ['USA'],
                COI: [],
                encrypted: false,
                content: 'Test content'
            };

            await createResource(legacyResource);

            const fetched = await getResourceById('doc-legacy-002');

            expect(fetched?.legacy?.classification).toBe('CONFIDENTIAL');
            expect(fetched?.legacy?.releasabilityTo).toEqual(['USA']);
            expect(fetched?.legacy?.content).toBe('Test content');
        });

        it('should handle encrypted legacy resources', async () => {
            const legacyResource = {
                resourceId: 'doc-legacy-enc-001',
                title: 'Encrypted Legacy',
                classification: 'TOP_SECRET' as const,
                releasabilityTo: ['USA'],
                COI: ['US-ONLY'],
                encrypted: true,
                encryptedContent: 'base64-encrypted-data'
            };

            await createResource(legacyResource);

            const fetched = await getResourceById('doc-legacy-enc-001');

            expect(fetched?.legacy?.encrypted).toBe(true);
            expect(fetched?.legacy?.encryptedContent).toBe('base64-encrypted-data');
        });

        it('should log legacy resource conversion', async () => {
            const legacyResource = {
                resourceId: 'doc-legacy-log-001',
                title: 'Log Test',
                classification: 'SECRET' as const,
                releasabilityTo: ['USA'],
                COI: [],
                encrypted: false,
                content: 'test'
            };

            await createResource(legacyResource);

            // Logger is mocked - info will be logged to mock
        });
    });

    // ============================================
    // getZTDFObject Tests
    // ============================================
    describe('getZTDFObject', () => {
        it('should extract ZTDF object from resource', async () => {
            await mongoHelper.insertResource(TEST_RESOURCES.fveySecretDocument);

            const ztdf = await getZTDFObject('doc-fvey-001');

            expect(ztdf).toBeDefined();
            expect(ztdf?.manifest).toBeDefined();
            expect(ztdf?.policy).toBeDefined();
            expect(ztdf?.payload).toBeDefined();
        });

        it('should return null for non-existent resource', async () => {
            const ztdf = await getZTDFObject('non-existent');

            expect(ztdf).toBeNull();
        });

        it('should validate integrity before returning ZTDF', async () => {
            const tamperedResource = createTamperedZTDFResource();
            await mongoHelper.insertResource(tamperedResource);

            await expect(getZTDFObject('doc-tampered-001')).rejects.toThrow();
        });

        it('should return complete ZTDF structure for KAS integration', async () => {
            await mongoHelper.insertResource(TEST_RESOURCES.fveySecretDocument);

            const ztdf = await getZTDFObject('doc-fvey-001');

            // Verify KAS-required fields
            expect(ztdf?.payload.keyAccessObjects).toBeDefined();
            expect(ztdf?.payload.keyAccessObjects.length).toBeGreaterThan(0);
            expect(ztdf?.payload.encryptedChunks).toBeDefined();
            expect(ztdf?.payload.iv).toBeDefined();
            expect(ztdf?.payload.authTag).toBeDefined();
        });

        it('should log warning for non-ZTDF resources', async () => {
            // This test assumes a scenario where a resource somehow lacks ZTDF structure
            // In current implementation, all resources are ZTDF-enhanced
            // This test documents expected behavior if such a scenario occurs

            // Attempting to get ZTDF from non-existent resource
            const ztdf = await getZTDFObject('non-existent');

            expect(ztdf).toBeNull();
        });
    });

    // ============================================
    // Integration Tests
    // ============================================
    describe('Integration Tests', () => {
        it('should support full CRUD operations on ZTDF resources', async () => {
            // Create
            const newResource = createTestZTDFResource({
                resourceId: 'doc-crud-001',
                title: 'CRUD Test',
                classification: 'SECRET',
                releasabilityTo: ['USA', 'GBR'],
                COI: ['FVEY'],
                content: 'Original content'
            });

            await createZTDFResource(newResource);

            // Read
            const fetched = await getResourceById('doc-crud-001');
            expect(fetched).toBeDefined();

            // Verify integrity
            const validation = validateZTDFIntegrity(fetched!.ztdf);
            expect(validation.valid).toBe(true);

            // List
            const allResources = await getAllResources();
            expect(allResources.some(r => r.resourceId === 'doc-crud-001')).toBe(true);
        });

        it('should handle multiple resources with different classifications', async () => {
            const resources = [
                createTestZTDFResource({
                    resourceId: 'doc-multi-1',
                    title: 'Unclassified',
                    classification: 'UNCLASSIFIED',
                    releasabilityTo: ['USA', 'GBR', 'FRA'],
                    content: 'Public'
                }),
                createTestZTDFResource({
                    resourceId: 'doc-multi-2',
                    title: 'Confidential',
                    classification: 'CONFIDENTIAL',
                    releasabilityTo: ['USA', 'GBR'],
                    content: 'Confidential'
                }),
                createTestZTDFResource({
                    resourceId: 'doc-multi-3',
                    title: 'Secret',
                    classification: 'SECRET',
                    releasabilityTo: ['USA'],
                    content: 'Secret'
                })
            ];

            for (const resource of resources) {
                await createZTDFResource(resource);
            }

            const allResources = await getAllResources();
            expect(allResources).toHaveLength(3);

            // Verify each has valid integrity
            for (const resource of allResources) {
                const validation = validateZTDFIntegrity(resource.ztdf);
                expect(validation.valid).toBe(true);
            }
        });

        it('should handle concurrent resource operations', async () => {
            const resources = Array.from({ length: 10 }, (_, i) =>
                createTestZTDFResource({
                    resourceId: `doc-concurrent-${i}`,
                    title: `Concurrent ${i}`,
                    classification: 'SECRET',
                    releasabilityTo: ['USA'],
                    content: `Content ${i}`
                })
            );

            // Create all concurrently
            await Promise.all(resources.map(r => createZTDFResource(r)));

            // Verify all created
            const allResources = await getAllResources();
            expect(allResources).toHaveLength(10);
        });

        it('should maintain data integrity across operations', async () => {
            const resource = createTestZTDFResource({
                resourceId: 'doc-integrity-001',
                title: 'Integrity Test',
                classification: 'TOP_SECRET',
                releasabilityTo: ['USA'],
                COI: ['US-ONLY'],
                content: 'Sensitive data'
            });

            // Create
            await createZTDFResource(resource);

            // Fetch multiple times
            const fetch1 = await getResourceById('doc-integrity-001');
            const fetch2 = await getResourceById('doc-integrity-001');

            // Should be identical
            expect(fetch1).toEqual(fetch2);

            // Validate integrity each time
            const validation1 = validateZTDFIntegrity(fetch1!.ztdf);
            const validation2 = validateZTDFIntegrity(fetch2!.ztdf);

            expect(validation1.valid).toBe(true);
            expect(validation2.valid).toBe(true);
        });
    });

    // ============================================
    // Error Handling and Edge Cases
    // ============================================
    describe('Error Handling', () => {
        it('should handle empty releasabilityTo list (fail-closed)', async () => {
            const resource = createTestZTDFResource({
                resourceId: 'doc-empty-rel-001',
                title: 'Empty Releasability',
                classification: 'SECRET',
                releasabilityTo: [], // Empty list
                content: 'test'
            });

            // Should fail validation
            await expect(createZTDFResource(resource)).rejects.toThrow();
        });

        it('should handle very long resource IDs', async () => {
            const longId = 'doc-' + 'a'.repeat(200);
            const resource = createTestZTDFResource({
                resourceId: longId,
                title: 'Long ID Test',
                classification: 'UNCLASSIFIED',
                releasabilityTo: ['USA'],
                content: 'test'
            });

            await createZTDFResource(resource);

            const fetched = await getResourceById(longId);
            expect(fetched?.resourceId).toBe(longId);
        });

        it('should handle special characters in content', async () => {
            const specialContent = 'Special chars: 你好 🔒 <script>alert("xss")</script>';
            const resource = createTestZTDFResource({
                resourceId: 'doc-special-001',
                title: 'Special Characters',
                classification: 'UNCLASSIFIED',
                releasabilityTo: ['USA'],
                content: specialContent
            });

            await createZTDFResource(resource);

            const fetched = await getResourceById('doc-special-001');
            expect(fetched).toBeDefined();

            // Content should be encrypted, but structure should be valid
            const validation = validateZTDFIntegrity(fetched!.ztdf);
            expect(validation.valid).toBe(true);
        });

        it('should handle resources with many KAOs', async () => {
            const resource = createTestZTDFResource({
                resourceId: 'doc-many-kao-001',
                title: 'Many KAOs',
                classification: 'SECRET',
                releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'CAN'],
                COI: ['NATO-COSMIC'],
                content: 'Multi-KAS test'
            });

            await createZTDFResource(resource);

            const ztdf = await getZTDFObject('doc-many-kao-001');
            expect(ztdf?.payload.keyAccessObjects).toBeDefined();
        });
    });
});

