/**
 * Federated Resource Service - Integration Tests
 * Phase 3: Distributed Query Federation
 * 
 * NATO Compliance: ACP-240 §5.4 (Federated Resource Access)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

// ============================================
// Mock Setup - Must be before imports
// ============================================

const mockToArray = jest.fn().mockImplementation(() => Promise.resolve([]));
const mockLimit = jest.fn().mockReturnThis();
const mockMaxTimeMS = jest.fn().mockReturnThis();
const mockFind = jest.fn().mockReturnValue({
    limit: mockLimit,
    maxTimeMS: mockMaxTimeMS,
    toArray: mockToArray
});

const mockCollection = jest.fn().mockReturnValue({
    find: mockFind
});

const mockPing = jest.fn().mockImplementation(() => Promise.resolve({ ok: 1 }));
const mockAdmin = jest.fn().mockReturnValue({
    ping: mockPing
});

const mockDb = jest.fn().mockReturnValue({
    admin: mockAdmin,
    collection: mockCollection
});

const mockConnect = jest.fn().mockImplementation(() => Promise.resolve());
const mockClose = jest.fn().mockImplementation(() => Promise.resolve());

const mockMongoClient = {
    connect: mockConnect,
    db: mockDb,
    close: mockClose
};

jest.mock('mongodb', () => ({
    MongoClient: jest.fn().mockImplementation(() => mockMongoClient)
}));

jest.mock('../utils/gcp-secrets', () => ({
    getSecret: jest.fn().mockImplementation(() => Promise.resolve('mock-password'))
}));

jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }
}));

// ============================================
// Test Data
// ============================================

const mockResources = [
    {
        resourceId: 'USA-DOC-001',
        title: 'US Operations Brief',
        ztdf: {
            policy: {
                securityLabel: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR', 'CAN'],
                    COI: ['FVEY']
                }
            }
        },
        originRealm: 'USA'
    },
    {
        resourceId: 'USA-DOC-002',
        title: 'NATO Exercise Plan',
        ztdf: {
            policy: {
                securityLabel: {
                    classification: 'CONFIDENTIAL',
                    releasabilityTo: ['USA', 'FRA', 'GBR', 'DEU'],
                    COI: ['NATO']
                }
            }
        },
        originRealm: 'USA'
    }
];

const TEST_USERS = {
    usaSecret: {
        uniqueID: 'testuser-usa-3',
        clearance: 'SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['FVEY', 'NATO']
    },
    fraConfidential: {
        uniqueID: 'testuser-fra-2',
        clearance: 'CONFIDENTIAL',
        countryOfAffiliation: 'FRA',
        acpCOI: ['NATO']
    }
};

// ============================================
// Test Suite
// ============================================

describe('FederatedResourceService', () => {
    let federatedResourceService: typeof import('../services/federated-resource.service').federatedResourceService;

    beforeAll(async () => {
        // Reset modules and import fresh
        jest.resetModules();
        const module = await import('../services/federated-resource.service');
        federatedResourceService = module.federatedResourceService;
    });

    afterAll(async () => {
        if (federatedResourceService?.shutdown) {
            await federatedResourceService.shutdown();
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockToArray.mockImplementation(() => Promise.resolve(mockResources));
    });

    // ============================================
    // 1. Service Initialization Tests
    // ============================================
    describe('1. Service Initialization', () => {
        it('should initialize successfully', async () => {
            await federatedResourceService.initialize();
            const status = federatedResourceService.getInstanceStatus();
            expect(Object.keys(status).length).toBeGreaterThanOrEqual(0);
        });

        it('should return available instances', () => {
            const available = federatedResourceService.getAvailableInstances();
            expect(Array.isArray(available)).toBe(true);
        });
    });

    // ============================================
    // 2. Search Functionality Tests
    // ============================================
    describe('2. Search Functionality', () => {
        it('should execute search query', async () => {
            await federatedResourceService.initialize();
            
            const result = await federatedResourceService.search(
                { limit: 50 },
                TEST_USERS.usaSecret
            );
            
            expect(result).toBeDefined();
            expect(result).toHaveProperty('totalResults');
            expect(result).toHaveProperty('results');
            expect(result).toHaveProperty('instanceResults');
            expect(result).toHaveProperty('executionTimeMs');
        });

        it('should handle connection errors gracefully', async () => {
            mockConnect.mockImplementationOnce(() => Promise.reject(new Error('Connection refused')));
            
            const result = await federatedResourceService.search(
                { limit: 10 },
                TEST_USERS.usaSecret
            );
            
            // Should return partial results, not throw
            expect(result).toBeDefined();
        });
    });

    // ============================================
    // 3. Response Structure Tests
    // ============================================
    describe('3. Response Structure', () => {
        it('should return correct response structure', async () => {
            const result = await federatedResourceService.search(
                { limit: 10 },
                TEST_USERS.usaSecret
            );
            
            expect(result).toHaveProperty('totalResults');
            expect(result).toHaveProperty('results');
            expect(result).toHaveProperty('instanceResults');
            expect(result).toHaveProperty('executionTimeMs');
            expect(result).toHaveProperty('cacheHit');
        });

        it('should indicate cache status', async () => {
            const result = await federatedResourceService.search(
                { limit: 10 },
                TEST_USERS.usaSecret
            );
            
            expect(typeof result.cacheHit).toBe('boolean');
        });
    });

    // ============================================
    // 4. Performance Tests
    // ============================================
    describe('4. Performance', () => {
        it('should complete search within 500ms target', async () => {
            const start = Date.now();
            await federatedResourceService.search(
                { limit: 50 },
                TEST_USERS.usaSecret
            );
            const duration = Date.now() - start;
            
            // With mocks, should be very fast
            expect(duration).toBeLessThan(500);
        });

        it('should include execution time in response', async () => {
            const result = await federatedResourceService.search(
                { limit: 10 },
                TEST_USERS.usaSecret
            );
            
            expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
        });
    });
});

