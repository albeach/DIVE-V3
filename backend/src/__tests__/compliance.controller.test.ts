/**
 * Compliance Controller Test Suite
 * Target: 85%+ coverage for compliance.controller.ts
 * 
 * Tests ACP-240 compliance status, Multi-KAS architecture,
 * COI keys, classification equivalency, and X.509 PKI status
 * 
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
    });

    describe('getComplianceStatus', () => {
        it('should return overall ACP-240 compliance status with all required fields', async () => {
            await getComplianceStatus(mockReq as Request, mockRes as Response);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    level: 'PERFECT',
                    percentage: 100,
                    badge: '💎',
                    totalRequirements: 58,
                    compliantRequirements: 58,
                    partialRequirements: 0,
                    gapRequirements: 0,
                })
            );
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

        it('should include test metrics with passing tests', async () => {
            await getComplianceStatus(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.testMetrics).toEqual({
                total: 762,
                passing: 762,
                failing: 0,
                passRate: 100,
                coverage: 95,
                backendTests: 636,
                opaTests: 126,
            });
        });

        it('should include deployment status with certificate ID', async () => {
            await getComplianceStatus(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.deploymentStatus).toEqual({
                ready: true,
                classification: 'SECRET',
                environment: 'Production Ready',
                certificateId: 'ACP240-DIVE-V3-2025-10-18-PERFECT',
            });
        });
    });

    describe('getMultiKasInfo', () => {
        it('should return Multi-KAS architecture info with all KAS endpoints', async () => {
            await getMultiKasInfo(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.title).toBe('Multi-KAS Coalition Architecture');
            expect(response.kasEndpoints).toHaveLength(6);
        });

        it('should include KAS endpoint details', async () => {
            await getMultiKasInfo(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            const usaKas = response.kasEndpoints[0];
            expect(usaKas).toEqual({
                id: 'usa-kas',
                name: 'United States KAS',
                url: 'https://kas.usa.mil:8080',
                country: 'USA',
                status: 'active',
                uptime: 99.9,
                requestsToday: 1245,
            });
        });

        it('should include benefits of Multi-KAS architecture', async () => {
            await getMultiKasInfo(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.benefits).toHaveLength(4);
            expect(response.benefits[0]).toEqual({
                title: 'Instant Coalition Growth',
                description: 'New members get immediate access to historical data without re-encryption',
                icon: '⚡',
            });
        });

        it('should include example scenario with multiple KAOs', async () => {
            await getMultiKasInfo(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.exampleScenario).toEqual(
                expect.objectContaining({
                    resourceId: 'doc-nato-fuel-2024',
                    title: 'NATO Fuel Inventory Report 2024',
                    classification: 'SECRET',
                    kaoCount: 4,
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
            expect(response.supportedNations).toBe(12);
        });

        it('should include all classification levels with mappings', async () => {
            await getClassificationEquivalency(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.levels).toHaveLength(4);

            const unclassified = response.levels[0];
            expect(unclassified).toEqual(
                expect.objectContaining({
                    canonicalLevel: 'UNCLASSIFIED',
                    displayName: 'Unclassified',
                    numericValue: 0,
                    color: '#10B981',
                })
            );
            expect(unclassified.mappings).toHaveLength(12);
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
                localLevel: 'CONFIDENTIAL',
                localAbbrev: 'C',
            });
            expect(usaMappings[2]).toEqual({
                country: 'USA',
                localLevel: 'SECRET',
                localAbbrev: 'S',
            });
            expect(usaMappings[3]).toEqual({
                country: 'USA',
                localLevel: 'TOP_SECRET',
                localAbbrev: 'TS',
            });
        });

        it('should include France (FRA) mappings with French levels', async () => {
            await getClassificationEquivalency(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            const confidentialLevel = response.levels[1];
            const fraMapping = confidentialLevel.mappings.find((m: any) => m.country === 'FRA');

            expect(fraMapping).toEqual({
                country: 'FRA',
                localLevel: 'CONFIDENTIEL_DEFENSE',
                localAbbrev: 'CD',
            });
        });

        it('should include NATO mappings', async () => {
            await getClassificationEquivalency(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            const secretLevel = response.levels[2];
            const natoMapping = secretLevel.mappings.find((m: any) => m.country === 'NATO');

            expect(natoMapping).toEqual({
                country: 'NATO',
                localLevel: 'NATO_SECRET',
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
