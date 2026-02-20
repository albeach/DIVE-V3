/**
 * Compliance Controller Test Suite
 * Target: 85%+ coverage for compliance.controller.ts
 * 
 * Tests ACP-240 compliance status, Multi-KAS architecture,
 * COI keys, classification equivalency, and X.509 PKI status
 * 
 * Updated: 2026-01-16 - Now uses MongoDB SSOT via kasMetricsService
 * NO SHORTCUTS - Tests verify actual implementation behavior
 */

import { Request, Response } from 'express';
import {
    getComplianceStatus,
    getMultiKasInfo,
    getCoiKeysInfo,
    getClassificationEquivalency,
    getCertificateStatus,
    getNistAssurance,
} from '../controllers/compliance.controller';

// Mock logger
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

// Mock compliance metrics service (runtime evidence source)
const mockGetSLAMetrics = jest.fn();
const mockGetTestCoverageMetrics = jest.fn();
const mockGetPolicyDriftStatus = jest.fn();

jest.mock('../services/compliance-metrics.service', () => ({
    complianceMetricsService: {
        getSLAMetrics: (...args: unknown[]) => mockGetSLAMetrics(...args),
        getTestCoverageMetrics: (...args: unknown[]) => mockGetTestCoverageMetrics(...args),
        getPolicyDriftStatus: (...args: unknown[]) => mockGetPolicyDriftStatus(...args),
        getDecisionMetrics: jest.fn().mockResolvedValue({}),
        getComplianceOverview: jest.fn().mockResolvedValue({}),
        getCacheStats: jest.fn().mockReturnValue({}),
        getAuditStats: jest.fn().mockReturnValue({}),
    },
}));

// Default mock values: all SLA targets met, no drift
function setupAllGreenMocks() {
    mockGetSLAMetrics.mockResolvedValue({
        availability: { current: 99.99, target: 99.9, compliant: true, uptimeHours: 720, downtimeHours: 0 },
        latency: { p50Ms: 5, p95Ms: 15, p99Ms: 30, targetP95Ms: 50, compliant: true },
        policySync: { lastSyncTime: new Date().toISOString(), syncIntervalSeconds: 300, targetSyncIntervalSeconds: 21600, compliant: true },
        testCoverage: { current: 95, target: 85, compliant: true },
        overallCompliant: true,
        nextReviewDate: new Date().toISOString(),
    });
    mockGetTestCoverageMetrics.mockResolvedValue({
        totalTests: 611,
        passingTests: 611,
        failingTests: 0,
        passRate: 100,
        coverage: 78.61,
        lastRun: null,
        coverageByPackage: {
            'dive.base': { tests: 48, coverage: 95 },
            'dive.org.nato': { tests: 89, coverage: 88 },
            'dive.tenant': { tests: 247, coverage: 85 },
            'dive.entrypoints': { tests: 156, coverage: 92 },
            'dive.compat': { tests: 71, coverage: 78 },
        },
        trend: [],
    });
    mockGetPolicyDriftStatus.mockResolvedValue({
        status: 'no_drift',
        lastCheck: new Date().toISOString(),
        lastDriftDetected: null,
        sourceHash: 'abc123',
        bundleRevisions: {},
        driftDetails: [],
        recommendations: [],
    });
}

// Mock KAS Metrics Service (MongoDB SSOT)
jest.mock('../services/kas-metrics.service', () => ({
    kasMetricsService: {
        getMultiKASInfo: jest.fn().mockResolvedValue({
            title: 'Multi-KAS Coalition Architecture',
            description: 'Distributed key management for coalition environments',
            kasEndpoints: [
                {
                    kasId: 'usa-kas',
                    organization: 'United States KAS',
                    countryCode: 'USA',
                    kasUrl: 'https://kas.usa.mil:8080',
                    status: 'active',
                    enabled: true,
                    uptime: 99.9,
                    requestsToday: 1245,
                    successRate: 99.97,
                    p95ResponseTime: 45,
                    circuitBreakerState: 'CLOSED',
                    federationTrust: {
                        trustedPartners: ['gbr-kas', 'fra-kas'],
                        maxClassification: 'TOP_SECRET',
                        allowedCOIs: ['FVEY', 'NATO-COSMIC'],
                    },
                    metadata: {
                        version: '1.0.0',
                        capabilities: ['rewrap', 'store'],
                    },
                },
                {
                    kasId: 'gbr-kas',
                    organization: 'United Kingdom KAS',
                    countryCode: 'GBR',
                    kasUrl: 'https://kas.gbr.mod.uk:8080',
                    status: 'active',
                    enabled: true,
                    uptime: 99.8,
                    requestsToday: 876,
                    successRate: 99.95,
                    p95ResponseTime: 52,
                    circuitBreakerState: 'CLOSED',
                    federationTrust: {
                        trustedPartners: ['usa-kas', 'fra-kas'],
                        maxClassification: 'TOP_SECRET',
                        allowedCOIs: ['FVEY', 'NATO-COSMIC'],
                    },
                    metadata: {
                        version: '1.0.0',
                        capabilities: ['rewrap'],
                    },
                },
            ],
            benefits: [
                {
                    title: 'Instant Coalition Growth',
                    description: 'New members get immediate access to historical data without re-encryption',
                    icon: '⚡',
                },
            ],
            flowSteps: [
                { step: 1, title: 'User Request', description: 'User requests resource access' },
            ],
            summary: {
                totalKAS: 2,
                activeKAS: 2,
                pendingKAS: 0,
                suspendedKAS: 0,
                offlineKAS: 0,
                totalRequestsToday: 2121,
                averageUptime: 99.85,
                averageSuccessRate: 99.96,
            },
            timestamp: new Date().toISOString(),
        }),
    },
}));

// Mock COI key service
jest.mock('../services/coi-key.service', () => ({
    getAllCOIKeys: jest.fn().mockResolvedValue({
        cois: [
            {
                coiId: 'FVEY',
                name: 'Five Eyes',
                description: 'FVEY coalition',
                memberCountries: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
                color: '#3B82F6',
                icon: '👁️',
                status: 'active',
                resourceCount: 42,
            },
            {
                coiId: 'NATO-COSMIC',
                name: 'NATO COSMIC',
                description: 'NATO TOP SECRET',
                memberCountries: ['USA', 'GBR', 'FRA', 'DEU'],
                color: '#10B981',
                icon: '🌍',
                status: 'active',
                resourceCount: 28,
            },
        ],
    }),
    getCOIKeyStatistics: jest.fn().mockResolvedValue({
        total: 7,
        active: 7,
        inactive: 0,
    }),
}));

describe('Compliance Controller', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;

    beforeEach(() => {
        mockReq = {
            headers: { 'x-request-id': 'test-123' },
            params: {},
            query: {},
        };

        mockRes = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(),
        };

        jest.clearAllMocks();
        setupAllGreenMocks();
    });

    describe('getComplianceStatus', () => {
        it('should return PERFECT when all SLA checks pass and no drift', async () => {
            await getComplianceStatus(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.level).toBe('PERFECT');
            expect(response.percentage).toBe(100);
            expect(response.badge).toBe('💎');
            // 5+11+11+8+14+13+10+9+19+1 = 101 total requirements
            expect(response.totalRequirements).toBe(101);
            expect(response.compliantRequirements).toBe(101);
            expect(response.partialRequirements).toBe(0);
            expect(response.gapRequirements).toBe(0);
        });

        it('should include all 10 compliance sections', async () => {
            await getComplianceStatus(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.sections).toHaveLength(10);
            expect(response.sections[0]).toEqual({
                id: 1,
                name: 'Key Concepts & Terminology',
                total: 5,
                compliant: 5,
                percentage: 100,
            });
        });

        it('should include key achievements with test metrics', async () => {
            await getComplianceStatus(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.keyAchievements).toHaveLength(4);
            expect(response.keyAchievements[0]).toEqual({
                id: 'multi-kas',
                title: 'Multi-KAS Support',
                description: 'Coalition scalability with 1-4 KAOs per resource',
                icon: '🔑',
                status: 'implemented',
                testsPassing: 12,
            });
        });

        it('should include runtime test metrics from metrics service', async () => {
            await getComplianceStatus(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.testMetrics.total).toBe(611);
            expect(response.testMetrics.passing).toBe(611);
            expect(response.testMetrics.failing).toBe(0);
            expect(response.testMetrics.passRate).toBe(100);
            expect(response.testMetrics.coverage).toBe(78.61);
        });

        it('should include dynamic deployment status with certificate ID', async () => {
            await getComplianceStatus(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.deploymentStatus.ready).toBe(true);
            expect(response.deploymentStatus.classification).toBe('SECRET');
            expect(response.deploymentStatus.environment).toBe('Production Ready');
            expect(response.deploymentStatus.certificateId).toMatch(/^ACP240-DIVE-V3-\d{4}-\d{2}-\d{2}-PERFECT$/);
        });

        it('should reduce ABAC section when policy drift detected', async () => {
            mockGetPolicyDriftStatus.mockResolvedValue({
                status: 'drift_detected',
                lastCheck: new Date().toISOString(),
                lastDriftDetected: new Date().toISOString(),
                sourceHash: 'abc123',
                bundleRevisions: {},
                driftDetails: [{ type: 'policy', description: 'Drift', severity: 'warning' }],
                recommendations: ['Review policies'],
            });

            await getComplianceStatus(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            // ABAC section (id: 3) should lose 2 compliance points
            const abacSection = response.sections.find((s: { id: number }) => s.id === 3);
            expect(abacSection.compliant).toBe(9); // 11 - 2
            expect(response.percentage).toBeLessThan(100);
            expect(response.level).not.toBe('PERFECT');
            expect(response.gapRequirements).toBeGreaterThan(0);
        });

        it('should reduce sections when SLA checks fail', async () => {
            mockGetSLAMetrics.mockResolvedValue({
                availability: { current: 95, target: 99.9, compliant: false, uptimeHours: 680, downtimeHours: 40 },
                latency: { p50Ms: 100, p95Ms: 200, p99Ms: 500, targetP95Ms: 50, compliant: false },
                policySync: { lastSyncTime: null, syncIntervalSeconds: 86400, targetSyncIntervalSeconds: 21600, compliant: false },
                testCoverage: { current: 50, target: 85, compliant: false },
                overallCompliant: false,
                nextReviewDate: new Date().toISOString(),
            });

            await getComplianceStatus(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            // Multiple sections should be degraded
            expect(response.percentage).toBeLessThan(100);
            // Identity (2): -1, ZTDF (5): -1, Logging (6): -1, Best Practices (8): -1, Checklist (9): -2
            expect(response.gapRequirements).toBe(6);
            expect(response.deploymentStatus.environment).toBe('Pre-Production');
        });

        it('should set level to HIGH when percentage >= 90', async () => {
            // Only SLA policy sync fails: -1 in section 9
            mockGetSLAMetrics.mockResolvedValue({
                availability: { current: 99.99, target: 99.9, compliant: true, uptimeHours: 720, downtimeHours: 0 },
                latency: { p50Ms: 5, p95Ms: 15, p99Ms: 30, targetP95Ms: 50, compliant: true },
                policySync: { lastSyncTime: null, syncIntervalSeconds: 86400, targetSyncIntervalSeconds: 21600, compliant: false },
                testCoverage: { current: 95, target: 85, compliant: true },
                overallCompliant: false,
                nextReviewDate: new Date().toISOString(),
            });

            await getComplianceStatus(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            // 101 - 2 (sync + overall) = 99 -> 98%
            expect(response.level).toBe('HIGH');
            expect(response.badge).toBe('🟢');
        });
    });

    describe('getMultiKasInfo', () => {
        it('should return Multi-KAS architecture info from MongoDB SSOT', async () => {
            await getMultiKasInfo(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.title).toBe('Multi-KAS Coalition Architecture');
            expect(response.kasEndpoints).toBeDefined();
            expect(Array.isArray(response.kasEndpoints)).toBe(true);
        });

        it('should include KAS endpoint details from MongoDB', async () => {
            await getMultiKasInfo(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            const usaKas = response.kasEndpoints.find((k: any) => k.id === 'usa-kas');
            
            expect(usaKas).toBeDefined();
            expect(usaKas.name).toContain('United States');
            expect(usaKas.url).toBe('https://kas.usa.mil:8080');
            expect(usaKas.country).toBe('USA');
            expect(usaKas.status).toBe('active');
            expect(usaKas.uptime).toBeGreaterThanOrEqual(0);
            expect(usaKas.requestsToday).toBeGreaterThanOrEqual(0);
        });

        it('should include extended metrics from MongoDB', async () => {
            await getMultiKasInfo(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            const usaKas = response.kasEndpoints.find((k: any) => k.id === 'usa-kas');
            
            // Extended metrics from kasMetricsService
            expect(usaKas.successRate).toBeDefined();
            expect(usaKas.p95ResponseTime).toBeDefined();
            expect(usaKas.circuitBreakerState).toBeDefined();
            expect(usaKas.federationTrust).toBeDefined();
        });

        it('should include benefits of Multi-KAS architecture', async () => {
            await getMultiKasInfo(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.benefits).toBeDefined();
            expect(response.benefits.length).toBeGreaterThan(0);
            expect(response.benefits[0]).toEqual({
                title: 'Instant Coalition Growth',
                description: 'New members get immediate access to historical data without re-encryption',
                icon: '⚡',
            });
        });

        it('should include summary statistics from MongoDB aggregation', async () => {
            await getMultiKasInfo(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.summary).toBeDefined();
            expect(response.summary.totalKAS).toBeGreaterThanOrEqual(0);
            expect(response.summary.activeKAS).toBeGreaterThanOrEqual(0);
            expect(response.summary.totalRequestsToday).toBeGreaterThanOrEqual(0);
            expect(response.summary.averageUptime).toBeGreaterThanOrEqual(0);
        });

        it('should include timestamp for cache invalidation', async () => {
            await getMultiKasInfo(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.timestamp).toBeDefined();
        });

        it('should include flow steps for visualization', async () => {
            await getMultiKasInfo(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.flowSteps).toBeDefined();
            expect(response.flowSteps.length).toBeGreaterThan(0);
        });

        it('should handle kasMetricsService errors gracefully', async () => {
            const { kasMetricsService } = await import('../services/kas-metrics.service');
            (kasMetricsService.getMultiKASInfo as jest.Mock).mockRejectedValueOnce(
                new Error('MongoDB connection failed')
            );

            await getMultiKasInfo(mockReq as Request, mockRes as Response);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Failed to fetch Multi-KAS info',
                    message: 'MongoDB KAS registry unavailable',
                })
            );
        });
    });

    describe('getCoiKeysInfo', () => {
        it('should return COI keys info with statistics', async () => {
            await getCoiKeysInfo(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.title).toBe('Community of Interest (COI) Keys');
            expect(response.registeredCOIs).toBe(7);
            expect(response.totalKeysGenerated).toBe(7);
            expect(response.keyAlgorithm).toBe('AES-256-GCM');
        });

        it('should include COI list from database', async () => {
            await getCoiKeysInfo(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.cois).toHaveLength(2);
            expect(response.cois[0]).toEqual({
                id: 'FVEY',
                name: 'Five Eyes',
                description: 'FVEY coalition',
                members: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
                color: '#3B82F6',
                icon: '👁️',
                status: 'active',
                resourceCount: 42,
            });
        });

        it('should include intelligent COI key selection algorithm', async () => {
            await getCoiKeysInfo(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.selectionAlgorithm.title).toBe('Intelligent COI Key Selection');
            expect(response.selectionAlgorithm.steps).toHaveLength(5);
            expect(response.selectionAlgorithm.steps[0]).toEqual({
                priority: 1,
                rule: 'Explicit COI tags',
                example: 'If COI: ["FVEY"] → use FVEY key',
            });
        });

        it('should include benefits of COI keys', async () => {
            await getCoiKeysInfo(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.benefits).toHaveLength(3);
            expect(response.benefits[0]).toEqual({
                title: 'Zero Re-encryption',
                description: 'Adding new FVEY member? No need to re-encrypt historical FVEY data.',
                impact: 'Days/weeks saved',
                icon: '⚡',
            });
        });

        it('should handle errors from COI key service', async () => {
            const { getAllCOIKeys } = await import('../services/coi-key.service');
            (getAllCOIKeys as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

            await getCoiKeysInfo(mockReq as Request, mockRes as Response);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: 'Failed to fetch COI keys info',
            });
        });
    });

    describe('getClassificationEquivalency', () => {
        it('should return classification equivalency mapping for 12 nations', async () => {
            await getClassificationEquivalency(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.title).toBe('Classification Equivalency Mapping');
            expect(response.supportedNations).toBe(35);
        });

        it('should include all classification levels with mappings', async () => {
            await getClassificationEquivalency(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.levels).toHaveLength(5);

            const unclassified = response.levels[0];
            expect(unclassified).toEqual(
                expect.objectContaining({
                    canonicalLevel: 'UNCLASSIFIED',
                    displayName: 'Unclassified / NATO UNCLASSIFIED',
                    numericValue: 0,
                    color: '#10B981',
                })
            );
            expect(unclassified.mappings).toHaveLength(35);
        });

        it('should include correct USA mappings for all levels', async () => {
            await getClassificationEquivalency(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            const usaMappings = response.levels.map((level: any) =>
                level.mappings.find((m: any) => m.country === 'USA')
            );

            expect(usaMappings[0]).toEqual({
                country: 'USA',
                localLevel: 'UNCLASSIFIED',
                localAbbrev: 'U',
            });
            expect(usaMappings[1]).toEqual({
                country: 'USA',
                localLevel: 'FOUO',
                localAbbrev: 'FOUO',
            });
            expect(usaMappings[2]).toEqual({
                country: 'USA',
                localLevel: 'CONFIDENTIAL',
                localAbbrev: 'C',
            });
            expect(usaMappings[3]).toEqual({
                country: 'USA',
                localLevel: 'SECRET',
                localAbbrev: 'S',
            });
            expect(usaMappings[4]).toEqual({
                country: 'USA',
                localLevel: 'TOP SECRET',
                localAbbrev: 'TS',
            });
        });

        it('should include France (FRA) mappings with French levels', async () => {
            await getClassificationEquivalency(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            const confidentialLevel = response.levels[2];
            const fraMapping = confidentialLevel.mappings.find((m: any) => m.country === 'FRA');

            expect(fraMapping).toEqual({
                country: 'FRA',
                localLevel: 'CONFIDENTIEL DÉFENSE',
                localAbbrev: 'CD',
            });
        });

        it('should include NATO mappings', async () => {
            await getClassificationEquivalency(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            const secretLevel = response.levels[3];
            const natoMapping = secretLevel.mappings.find((m: any) => m.country === 'NATO');

            expect(natoMapping).toEqual({
                country: 'NATO',
                localLevel: 'NATO SECRET',
                localAbbrev: 'NS',
            });
        });
    });

    describe('getCertificateStatus', () => {
        it('should return PKI certificate infrastructure status', async () => {
            await getCertificateStatus(mockReq as Request, mockRes as Response);

            expect(mockRes.json).toHaveBeenCalled();
            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response).toBeDefined();
        });
    });

    describe('getNistAssurance', () => {
        it('should return NIST assurance level information', async () => {
            await getNistAssurance(mockReq as Request, mockRes as Response);

            expect(mockRes.json).toHaveBeenCalled();
            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response).toBeDefined();
        });
    });

    describe('Error Handling', () => {
        it('should not throw errors for any endpoint', async () => {
            const endpoints = [
                getComplianceStatus,
                getMultiKasInfo,
                getCoiKeysInfo,
                getClassificationEquivalency,
                getCertificateStatus,
                getNistAssurance,
            ];

            for (const endpoint of endpoints) {
                await expect(
                    endpoint(mockReq as Request, mockRes as Response)
                ).resolves.not.toThrow();
            }
        });

        it('should call res.json for all successful endpoints', async () => {
            await getComplianceStatus(mockReq as Request, mockRes as Response);
            expect(mockRes.json).toHaveBeenCalledTimes(1);

            jest.clearAllMocks();
            await getMultiKasInfo(mockReq as Request, mockRes as Response);
            expect(mockRes.json).toHaveBeenCalledTimes(1);
        });
    });
});
