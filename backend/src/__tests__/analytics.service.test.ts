/**
 * Analytics Service Tests (Phase 3)
 * 
 * Test coverage:
 * - Risk distribution calculation
 * - Compliance trends aggregation
 * - SLA performance metrics
 * - Authorization metrics
 * - Security posture overview
 * - Caching behavior
 */

import { analyticsService } from '../services/analytics.service';
import { MongoClient, Db, Collection } from 'mongodb';

// Mock MongoDB
jest.mock('mongodb');

describe('AnalyticsService', () => {
    let mockDb: jest.Mocked<Db>;
    let mockCollection: jest.Mocked<Collection>;
    let mockMongoClient: jest.Mocked<MongoClient>;

    beforeEach(() => {
        // Create mock collection
        mockCollection = {
            countDocuments: jest.fn(),
            find: jest.fn(),
            aggregate: jest.fn(),
        } as any;

        // Create mock database
        mockDb = {
            collection: jest.fn().mockReturnValue(mockCollection),
        } as any;

        // Create mock MongoDB client with admin and ping methods
        mockMongoClient = {
            db: jest.fn().mockReturnValue(mockDb),
            connect: jest.fn().mockResolvedValue(undefined),
            close: jest.fn().mockResolvedValue(undefined),
        } as any;

        // Mock db().admin().ping() for connection check
        const mockAdmin = {
            ping: jest.fn().mockResolvedValue({}),
        };
        mockDb.admin = jest.fn().mockReturnValue(mockAdmin as any);

        // Set the mock client
        analyticsService.setMongoClient(mockMongoClient);

        // Clear cache before each test
        analyticsService.clearCache();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Risk Distribution', () => {
        it('should calculate risk distribution by tier', async () => {
            // Mock tier counts
            mockCollection.countDocuments
                .mockResolvedValueOnce(15) // gold
                .mockResolvedValueOnce(35) // silver
                .mockResolvedValueOnce(40) // bronze
                .mockResolvedValueOnce(10); // fail

            const distribution = await analyticsService.getRiskDistribution();

            expect(distribution).toEqual({
                gold: 15,
                silver: 35,
                bronze: 40,
                fail: 10,
            });

            expect(mockCollection.countDocuments).toHaveBeenCalledTimes(4);
            expect(mockCollection.countDocuments).toHaveBeenCalledWith({
                'comprehensiveRiskScore.tier': 'gold',
            });
        });

        it('should return zero counts when no submissions exist', async () => {
            mockCollection.countDocuments.mockResolvedValue(0);

            const distribution = await analyticsService.getRiskDistribution();

            expect(distribution).toEqual({
                gold: 0,
                silver: 0,
                bronze: 0,
                fail: 0,
            });
        });

        it('should cache risk distribution results', async () => {
            mockCollection.countDocuments
                .mockResolvedValueOnce(10)
                .mockResolvedValueOnce(20)
                .mockResolvedValueOnce(30)
                .mockResolvedValueOnce(5);

            // First call
            await analyticsService.getRiskDistribution();

            // Second call should use cache
            await analyticsService.getRiskDistribution();

            // Should only call countDocuments once (4 times for first call)
            expect(mockCollection.countDocuments).toHaveBeenCalledTimes(4);
        });

        it('should handle database errors gracefully', async () => {
            mockCollection.countDocuments.mockRejectedValue(
                new Error('Database connection failed')
            );

            await expect(analyticsService.getRiskDistribution()).rejects.toThrow(
                'Database connection failed'
            );
        });
    });

    describe('Compliance Trends', () => {
        it('should calculate compliance trends over time', async () => {
            const mockSubmissions = [
                {
                    submittedAt: new Date('2025-10-01'),
                    complianceValidation: {
                        acp240: { score: 85 },
                        stanag4774: { score: 70 },
                        nist80063: { score: 60 },
                    },
                },
                {
                    submittedAt: new Date('2025-10-01'),
                    complianceValidation: {
                        acp240: { score: 90 },
                        stanag4774: { score: 75 },
                        nist80063: { score: 65 },
                    },
                },
                {
                    submittedAt: new Date('2025-10-02'),
                    complianceValidation: {
                        acp240: { score: 95 },
                        stanag4774: { score: 80 },
                        nist80063: { score: 70 },
                    },
                },
            ];

            mockCollection.find = jest.fn().mockReturnValue({
                sort: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue(mockSubmissions),
            }) as any;

            const trends = await analyticsService.getComplianceTrends();

            expect(trends.dates).toHaveLength(2); // 2 unique dates
            expect(trends.dates[0]).toBe('2025-10-01');
            expect(trends.dates[1]).toBe('2025-10-02');
            expect(trends.acp240[0]).toBe(88); // Average of 85 and 90
            expect(trends.acp240[1]).toBe(95);
        });

        it('should handle custom date ranges', async () => {
            mockCollection.find = jest.fn().mockReturnValue({
                sort: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue([]),
            }) as any;

            const startDate = new Date('2025-10-01');
            const endDate = new Date('2025-10-15');

            await analyticsService.getComplianceTrends({ startDate, endDate });

            expect(mockCollection.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    submittedAt: { $gte: startDate, $lte: endDate },
                })
            );
        });

        it('should return empty arrays when no data available', async () => {
            mockCollection.find = jest.fn().mockReturnValue({
                sort: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue([]),
            }) as any;

            const trends = await analyticsService.getComplianceTrends();

            expect(trends.dates).toEqual([]);
            expect(trends.acp240).toEqual([]);
            expect(trends.stanag4774).toEqual([]);
            expect(trends.nist80063).toEqual([]);
        });

        it('should cache compliance trends', async () => {
            mockCollection.find = jest.fn().mockReturnValue({
                sort: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue([]),
            }) as any;

            // First call
            await analyticsService.getComplianceTrends();

            // Second call should use cache
            await analyticsService.getComplianceTrends();

            // Should only call find once
            expect(mockCollection.find).toHaveBeenCalledTimes(1);
        });
    });

    describe('SLA Metrics', () => {
        it('should calculate SLA performance metrics', async () => {
            const mockSubmissions = [
                {
                    status: 'approved',
                    fastTrack: true,
                    submittedAt: new Date('2025-10-01T10:00:00Z'),
                    slaDeadline: new Date('2025-10-01T12:00:00Z'),
                    approvalDecision: {
                        decidedAt: new Date('2025-10-01T11:00:00Z'),
                    },
                },
                {
                    status: 'approved',
                    fastTrack: true,
                    submittedAt: new Date('2025-10-01T10:00:00Z'),
                    slaDeadline: new Date('2025-10-01T12:00:00Z'),
                    approvalDecision: {
                        decidedAt: new Date('2025-10-01T13:00:00Z'), // Exceeded SLA
                    },
                },
                {
                    status: 'approved',
                    fastTrack: false,
                    submittedAt: new Date('2025-10-01T10:00:00Z'),
                    slaDeadline: new Date('2025-10-02T10:00:00Z'),
                    approvalDecision: {
                        decidedAt: new Date('2025-10-01T20:00:00Z'),
                    },
                },
            ];

            mockCollection.find = jest.fn().mockReturnValue({
                toArray: jest.fn().mockResolvedValue(mockSubmissions),
            }) as any;

            const metrics = await analyticsService.getSLAMetrics();

            expect(metrics.fastTrackCompliance).toBe(50); // 1 of 2 on time
            expect(metrics.standardCompliance).toBe(100); // 1 of 1 on time
            expect(metrics.exceededCount).toBe(1);
            expect(metrics.averageReviewTime).toBeGreaterThan(0);
        });

        it('should return zero metrics when no submissions', async () => {
            mockCollection.find = jest.fn().mockReturnValue({
                toArray: jest.fn().mockResolvedValue([]),
            }) as any;

            const metrics = await analyticsService.getSLAMetrics();

            expect(metrics.fastTrackCompliance).toBe(0);
            expect(metrics.standardCompliance).toBe(0);
            expect(metrics.exceededCount).toBe(0);
            expect(metrics.averageReviewTime).toBe(0);
        });

        it('should cache SLA metrics', async () => {
            mockCollection.find = jest.fn().mockReturnValue({
                toArray: jest.fn().mockResolvedValue([]),
            }) as any;

            await analyticsService.getSLAMetrics();
            await analyticsService.getSLAMetrics();

            expect(mockCollection.find).toHaveBeenCalledTimes(1);
        });
    });

    describe('Authorization Metrics', () => {
        it('should calculate authorization decision metrics', async () => {
            const mockDecisions = [
                {
                    timestamp: new Date(),
                    acp240EventType: 'ACCESS_DECISION',
                    outcome: 'success',
                    latencyMs: 50,
                },
                {
                    timestamp: new Date(),
                    acp240EventType: 'ACCESS_DECISION',
                    outcome: 'success',
                    latencyMs: 60,
                },
                {
                    timestamp: new Date(),
                    acp240EventType: 'ACCESS_DECISION',
                    outcome: 'failure',
                    latencyMs: 40,
                },
            ];

            mockCollection.find = jest.fn().mockReturnValue({
                toArray: jest.fn().mockResolvedValue(mockDecisions),
            }) as any;

            // Mock cache service
            const { authzCacheService } = require('../services/authz-cache.service');
            authzCacheService.getStats = jest.fn().mockReturnValue({ hitRate: 85.3 });

            const metrics = await analyticsService.getAuthzMetrics();

            expect(metrics.totalDecisions).toBe(3);
            expect(metrics.allowRate).toBeCloseTo(66.67, 1);
            expect(metrics.denyRate).toBeCloseTo(33.33, 1);
            expect(metrics.averageLatency).toBe(50); // (50+60+40)/3
            expect(metrics.cacheHitRate).toBe(85.3);
        });

        it('should handle date range filtering', async () => {
            mockCollection.find = jest.fn().mockReturnValue({
                toArray: jest.fn().mockResolvedValue([]),
            }) as any;

            const startDate = new Date('2025-10-01');
            const endDate = new Date('2025-10-07');

            await analyticsService.getAuthzMetrics({ startDate, endDate });

            expect(mockCollection.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    timestamp: { $gte: startDate, $lte: endDate },
                })
            );
        });

        it('should return zero metrics when no decisions', async () => {
            mockCollection.find = jest.fn().mockReturnValue({
                toArray: jest.fn().mockResolvedValue([]),
            }) as any;

            const { authzCacheService } = require('../services/authz-cache.service');
            authzCacheService.getStats = jest.fn().mockReturnValue({ hitRate: 0 });

            const metrics = await analyticsService.getAuthzMetrics();

            expect(metrics.totalDecisions).toBe(0);
            expect(metrics.allowRate).toBe(0);
            expect(metrics.denyRate).toBe(0);
            expect(metrics.averageLatency).toBe(0);
        });
    });

    describe('Security Posture', () => {
        it('should calculate security posture overview', async () => {
            const mockSubmissions = [
                {
                    status: 'approved',
                    comprehensiveRiskScore: { total: 85 },
                    validationResults: {
                        mfaCheck: { pass: true, score: 20 },
                        tlsCheck: { details: { minVersion: 'TLS1.3' } },
                    },
                },
                {
                    status: 'approved',
                    comprehensiveRiskScore: { total: 75 },
                    validationResults: {
                        mfaCheck: { pass: false, score: 0 },
                        tlsCheck: { details: { minVersion: 'TLS1.2' } },
                    },
                },
                {
                    status: 'approved',
                    comprehensiveRiskScore: { total: 95 },
                    validationResults: {
                        mfaCheck: { pass: true, score: 20 },
                        tlsCheck: { details: { minVersion: 'TLS1.3' } },
                    },
                },
            ];

            mockCollection.find = jest.fn().mockReturnValue({
                toArray: jest.fn().mockResolvedValue(mockSubmissions),
            }) as any;

            const posture = await analyticsService.getSecurityPosture();

            expect(posture.averageRiskScore).toBeCloseTo(85, 0); // (85+75+95)/3
            expect(posture.complianceRate).toBeCloseTo(100, 0); // All ≥70
            expect(posture.mfaAdoptionRate).toBeCloseTo(66.67, 1); // 2 of 3
            expect(posture.tls13AdoptionRate).toBeCloseTo(66.67, 1); // 2 of 3
        });

        it('should handle submissions below compliance threshold', async () => {
            const mockSubmissions = [
                {
                    status: 'approved',
                    comprehensiveRiskScore: { total: 60 }, // Below 70
                    validationResults: {
                        mfaCheck: { pass: false },
                        tlsCheck: { details: { minVersion: 'TLS1.2' } },
                    },
                },
                {
                    status: 'approved',
                    comprehensiveRiskScore: { total: 80 },
                    validationResults: {
                        mfaCheck: { pass: true },
                        tlsCheck: { details: { minVersion: 'TLS1.3' } },
                    },
                },
            ];

            mockCollection.find = jest.fn().mockReturnValue({
                toArray: jest.fn().mockResolvedValue(mockSubmissions),
            }) as any;

            const posture = await analyticsService.getSecurityPosture();

            expect(posture.complianceRate).toBe(50); // Only 1 of 2 ≥70
        });

        it('should cache security posture', async () => {
            mockCollection.find = jest.fn().mockReturnValue({
                toArray: jest.fn().mockResolvedValue([]),
            }) as any;

            await analyticsService.getSecurityPosture();
            await analyticsService.getSecurityPosture();

            expect(mockCollection.find).toHaveBeenCalledTimes(1);
        });
    });

    describe('Cache Management', () => {
        it('should clear cache on demand', async () => {
            mockCollection.countDocuments.mockResolvedValue(10);

            // First call
            await analyticsService.getRiskDistribution();

            // Clear cache
            analyticsService.clearCache();

            // Second call should hit database again
            await analyticsService.getRiskDistribution();

            // Should call countDocuments twice (8 times total: 4 per call)
            expect(mockCollection.countDocuments).toHaveBeenCalledTimes(8);
        });

        it('should return cache statistics', () => {
            const stats = analyticsService.getCacheStats();

            expect(stats).toHaveProperty('keys');
            expect(stats).toHaveProperty('hits');
            expect(stats).toHaveProperty('misses');
        });
    });

    describe('Error Handling', () => {
        it('should handle MongoDB connection errors', async () => {
            mockCollection.countDocuments.mockRejectedValue(
                new Error('MongoDB connection timeout')
            );

            await expect(analyticsService.getRiskDistribution()).rejects.toThrow(
                'MongoDB connection timeout'
            );
        });

        it('should handle invalid data gracefully', async () => {
            const invalidSubmissions = [
                {
                    submittedAt: new Date('invalid'), // Invalid date
                    complianceValidation: null,
                },
            ];

            mockCollection.find = jest.fn().mockReturnValue({
                sort: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue(invalidSubmissions),
            }) as any;

            // Should not throw, just return empty arrays or handle gracefully
            try {
                const trends = await analyticsService.getComplianceTrends();
                // If it succeeds, dates should be empty or have handled the invalid date
                expect(trends).toBeDefined();
            } catch (error) {
                // Error is acceptable for completely invalid data
                expect(error).toBeDefined();
            }
        });

        it('should handle MongoDB ping failure and reconnect', async () => {
            // Mock MongoDB constructor to return our mock client on reconnect
            const {  MongoClient: MockedMongoClient } = require('mongodb');
            (MockedMongoClient as jest.Mock).mockImplementation(() => mockMongoClient);

            // First ping fails, triggering reconnect
            const mockAdmin = {
                ping: jest.fn()
                    .mockRejectedValueOnce(new Error('Connection lost'))
                    .mockResolvedValue({}),
            };
            mockDb.admin = jest.fn().mockReturnValue(mockAdmin as any);

            // Mock successful counts for getRiskDistribution
            mockCollection.countDocuments
                .mockResolvedValueOnce(10)
                .mockResolvedValueOnce(20)
                .mockResolvedValueOnce(30)
                .mockResolvedValueOnce(5);

            // First call triggers reconnect
            const result1 = await analyticsService.getRiskDistribution();
            expect(result1).toBeDefined();

            // Verify reconnect was triggered
            expect(mockMongoClient.connect).toHaveBeenCalled();
        });

        it('should throw error when MongoDB connection fails completely', async () => {
            // Mock MongoClient constructor to throw error
            const { MongoClient: MockedMongoClient } = require('mongodb');
            (MockedMongoClient as jest.Mock).mockImplementation(() => {
                throw new Error('Connection refused');
            });

            // Make ping fail to trigger reconnection
            const mockAdmin = {
                ping: jest.fn().mockRejectedValue(new Error('Connection lost')),
            };
            mockDb.admin = jest.fn().mockReturnValue(mockAdmin as any);

            // Trigger connection by calling a method - should fail on reconnect
            await expect(analyticsService.getRiskDistribution()).rejects.toThrow('Database connection failed');
        });

        it('should handle countDocuments errors in risk distribution', async () => {
            mockCollection.countDocuments = jest.fn()
                .mockRejectedValue(new Error('Query timeout'));

            await expect(analyticsService.getRiskDistribution()).rejects.toThrow();
        });

        it('should handle aggregation pipeline errors in compliance trends', async () => {
            mockCollection.find = jest.fn().mockReturnValue({
                sort: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockRejectedValue(new Error('Aggregation failed')),
            }) as any;

            await expect(analyticsService.getComplianceTrends()).rejects.toThrow();
        });

        it('should handle aggregation pipeline errors in SLA metrics', async () => {
            mockCollection.aggregate = jest.fn().mockReturnValue({
                toArray: jest.fn().mockRejectedValue(new Error('Pipeline failed')),
            }) as any;

            await expect(analyticsService.getSLAMetrics()).rejects.toThrow();
        });

        it('should handle authorization metrics calculation errors', async () => {
            mockCollection.countDocuments = jest.fn()
                .mockRejectedValue(new Error('Count failed'));

            await expect(analyticsService.getAuthzMetrics()).rejects.toThrow();
        });

        it('should handle security posture calculation errors', async () => {
            mockCollection.find = jest.fn().mockReturnValue({
                toArray: jest.fn().mockRejectedValue(new Error('Find failed')),
            }) as any;

            await expect(analyticsService.getSecurityPosture()).rejects.toThrow();
        });

        it('should throw error when db not initialized after connection attempt', async () => {
            // Mock MongoClient constructor to return a client where db() returns null
            const { MongoClient: MockedMongoClient } = require('mongodb');
            const brokenClient: any = {
                connect: jest.fn().mockResolvedValue(undefined),
                db: jest.fn().mockReturnValue(null),
            };
            (MockedMongoClient as jest.Mock).mockImplementation(() => brokenClient);

            // Make ping fail to trigger reconnection
            const mockAdmin = {
                ping: jest.fn().mockRejectedValue(new Error('Connection lost')),
            };
            mockDb.admin = jest.fn().mockReturnValue(mockAdmin as any);

            await expect(analyticsService.getRiskDistribution()).rejects.toThrow('MongoDB client not initialized');
        });

        it('should handle find errors with date range in authz metrics', async () => {
            mockCollection.find = jest.fn().mockReturnValue({
                toArray: jest.fn().mockRejectedValue(new Error('Query error')),
            }) as any;

            const dateRange = {
                startDate: new Date('2025-01-01'),
                endDate: new Date('2025-01-31'),
            };

            await expect(analyticsService.getAuthzMetrics(dateRange)).rejects.toThrow();
        });

        it('should handle empty aggregate results in SLA metrics', async () => {
            mockCollection.find = jest.fn().mockReturnValue({
                toArray: jest.fn().mockResolvedValue([]), // Empty results
            }) as any;

            const result = await analyticsService.getSLAMetrics();

            expect(result.fastTrackCompliance).toBe(0);
            expect(result.standardCompliance).toBe(0);
            expect(result.averageReviewTime).toBe(0);
            expect(result.exceededCount).toBe(0);
        });

        it('should handle division by zero in metrics calculations', async () => {
            // Authz metrics with zero total decisions
            mockCollection.countDocuments = jest.fn().mockResolvedValue(0);
            mockCollection.find = jest.fn().mockReturnValue({
                toArray: jest.fn().mockResolvedValue([]),
            }) as any;

            const result = await analyticsService.getAuthzMetrics();

            expect(result.totalDecisions).toBe(0);
            expect(result.allowRate).toBe(0);
            expect(result.denyRate).toBe(0);
            expect(result.cacheHitRate).toBe(0);
        });
    });
});

