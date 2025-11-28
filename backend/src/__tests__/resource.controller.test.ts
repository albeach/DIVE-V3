/**
 * Resource Controller Test Suite
 * Target: 85%+ coverage for resource.controller.ts
 * 
 * Tests ZTDF resource access with:
 * - Clearance-based filtering
 * - ZTDF details retrieval
 * - KAS flow handling
 * - Key request operations
 * - ZTDF download functionality
 */

import { Request, Response } from 'express';
import {
    listResourcesHandler,
    getResourceHandler,
    getZTDFDetailsHandler,
    getKASFlowHandler,
    requestKeyHandler,
    downloadZTDFHandler,
} from '../controllers/resource.controller';
import * as resourceService from '../services/resource.service';
import * as ztdfExportService from '../services/ztdf-export.service';
import * as ztdfUtils from '../utils/ztdf.utils';
import axios from 'axios';

// Mock logger
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

// Mock services
jest.mock('../services/resource.service');
jest.mock('../services/ztdf-export.service');
jest.mock('../utils/ztdf.utils');
jest.mock('axios');

describe('Resource Controller', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: jest.Mock;

    beforeEach(() => {
        mockReq = {
            headers: { 'x-request-id': 'res-test-123' },
            params: {},
            body: {},
            user: {
                uniqueID: 'test-user-123',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
            },
        } as any;

        mockRes = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(),
            setHeader: jest.fn(),
            send: jest.fn(),
        } as any;

        mockNext = jest.fn();

        jest.clearAllMocks();
    });

    describe('listResourcesHandler - GET /api/resources', () => {
        it('should list all resources accessible to user', async () => {
            const mockResources = [
                {
                    resourceId: 'ztdf-123',
                    title: 'Test Resource',
                    ztdf: {
                        policy: {
                            securityLabel: {
                                classification: 'SECRET',
                                releasabilityTo: ['USA'],
                                COI: ['NATO-COSMIC'],
                                creationDate: '2025-11-20T10:00:00Z',
                                displayMarking: 'SECRET//REL TO USA',
                            },
                        },
                        manifest: { version: '1.0' },
                        payload: {
                            keyAccessObjects: [
                                {
                                    kaoId: 'kao-1',
                                    kasId: 'kas-usa',
                                    policyBinding: {
                                        coiRequired: ['NATO-COSMIC'],
                                        countriesAllowed: ['USA'],
                                    },
                                },
                            ],
                        },
                    },
                },
            ];

            (resourceService.getAllResources as jest.Mock).mockResolvedValue(mockResources);

            await listResourcesHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(resourceService.getAllResources).toHaveBeenCalled();
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    resources: expect.arrayContaining([
                        expect.objectContaining({
                            resourceId: 'ztdf-123',
                            classification: 'SECRET',
                            encrypted: true,
                        }),
                    ]),
                    count: 1,
                })
            );
        });

        it('should filter resources by user clearance', async () => {
            mockReq.user = {
                uniqueID: 'test-user',
                clearance: 'CONFIDENTIAL',
                countryOfAffiliation: 'USA',
            } as any;

            const mockResources = [
                {
                    resourceId: 'secret-doc',
                    ztdf: {
                        policy: {
                            securityLabel: {
                                classification: 'SECRET', // Should be filtered out
                                releasabilityTo: ['USA'],
                            },
                        },
                        manifest: { version: '1.0' },
                        payload: { keyAccessObjects: [] },
                    },
                },
                {
                    resourceId: 'conf-doc',
                    ztdf: {
                        policy: {
                            securityLabel: {
                                classification: 'CONFIDENTIAL', // Should be included
                                releasabilityTo: ['USA'],
                            },
                        },
                        manifest: { version: '1.0' },
                        payload: { keyAccessObjects: [] },
                    },
                },
            ];

            (resourceService.getAllResources as jest.Mock).mockResolvedValue(mockResources);

            await listResourcesHandler(mockReq as Request, mockRes as Response, mockNext);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.resources).toHaveLength(1);
            expect(response.resources[0].resourceId).toBe('conf-doc');
        });

        it('should handle UNCLASSIFIED clearance correctly', async () => {
            mockReq.user = {
                uniqueID: 'test-user',
                clearance: 'UNCLASSIFIED',
            } as any;

            const mockResources = [
                {
                    resourceId: 'unclass-doc',
                    ztdf: {
                        policy: {
                            securityLabel: {
                                classification: 'UNCLASSIFIED',
                                releasabilityTo: ['USA'],
                            },
                        },
                        manifest: { version: '1.0' },
                        payload: { keyAccessObjects: [] },
                    },
                },
                {
                    resourceId: 'restricted-doc',
                    ztdf: {
                        policy: {
                            securityLabel: {
                                classification: 'RESTRICTED',
                                releasabilityTo: ['USA'],
                            },
                        },
                        manifest: { version: '1.0' },
                        payload: { keyAccessObjects: [] },
                    },
                },
            ];

            (resourceService.getAllResources as jest.Mock).mockResolvedValue(mockResources);

            await listResourcesHandler(mockReq as Request, mockRes as Response, mockNext);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            // UNCLASSIFIED user should only see UNCLASSIFIED, not RESTRICTED
            expect(response.resources).toHaveLength(1);
            expect(response.resources[0].resourceId).toBe('unclass-doc');
        });

        it('should handle legacy resources', async () => {
            const mockResources = [
                {
                    resourceId: 'legacy-123',
                    title: 'Legacy Resource',
                    classification: 'CONFIDENTIAL',
                    releasabilityTo: ['USA'],
                    COI: [],
                    encrypted: false,
                },
            ];

            (resourceService.getAllResources as jest.Mock).mockResolvedValue(mockResources);

            await listResourcesHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    resources: expect.arrayContaining([
                        expect.objectContaining({
                            resourceId: 'legacy-123',
                            classification: 'CONFIDENTIAL',
                            encrypted: false,
                        }),
                    ]),
                })
            );
        });

        it('should return empty array when no resources exist', async () => {
            (resourceService.getAllResources as jest.Mock).mockResolvedValue([]);

            await listResourcesHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    resources: [],
                    count: 0,
                })
            );
        });

        it('should handle service errors', async () => {
            (resourceService.getAllResources as jest.Mock).mockRejectedValue(
                new Error('Database connection failed')
            );

            await listResourcesHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        });

        it('should handle missing clearance in token', async () => {
            mockReq.user = {
                uniqueID: 'test-user',
                // No clearance field
            } as any;

            const mockResources = [
                {
                    resourceId: 'unclass-doc',
                    ztdf: {
                        policy: {
                            securityLabel: {
                                classification: 'UNCLASSIFIED',
                                releasabilityTo: ['USA'],
                            },
                        },
                        manifest: { version: '1.0' },
                        payload: { keyAccessObjects: [] },
                    },
                },
            ];

            (resourceService.getAllResources as jest.Mock).mockResolvedValue(mockResources);

            await listResourcesHandler(mockReq as Request, mockRes as Response, mockNext);

            // Should default to UNCLASSIFIED
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    resources: expect.arrayContaining([
                        expect.objectContaining({
                            resourceId: 'unclass-doc',
                        }),
                    ]),
                })
            );
        });
    });

    describe('getResourceHandler - GET /api/resources/:id', () => {
        it('should get resource by ID successfully', async () => {
            mockReq.params = { id: 'ztdf-123' };

            const mockResource = {
                resourceId: 'ztdf-123',
                title: 'Test Resource',
                ztdf: {
                    policy: {
                        securityLabel: {
                            classification: 'SECRET',
                            releasabilityTo: ['USA'],
                            COI: ['NATO-COSMIC'],
                        },
                    },
                    manifest: { version: '1.0' },
                    payload: {
                        encryptedContent: 'encrypted-data',
                        keyAccessObjects: [],
                    },
                },
            };

            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);
            (ztdfUtils.validateZTDFIntegrity as jest.Mock).mockResolvedValue({
                valid: true,
                errors: [],
            });

            await getResourceHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(resourceService.getResourceById).toHaveBeenCalledWith('ztdf-123');
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    resourceId: 'ztdf-123',
                })
            );
        });

        it('should return 404 when resource not found', async () => {
            mockReq.params = { id: 'non-existent' };

            (resourceService.getResourceById as jest.Mock).mockResolvedValue(null);

            await getResourceHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
            const error = mockNext.mock.calls[0][0];
            expect(error.message).toContain('not found');
        });

        it('should handle invalid ZTDF integrity', async () => {
            mockReq.params = { id: 'tampered-doc' };

            const mockResource = {
                resourceId: 'tampered-doc',
                ztdf: {
                    policy: { securityLabel: { classification: 'SECRET' } },
                    manifest: { version: '1.0' },
                    payload: { encryptedContent: 'data', keyAccessObjects: [] },
                },
            };

            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);
            (ztdfUtils.validateZTDFIntegrity as jest.Mock).mockResolvedValue({
                valid: false,
                errors: ['Manifest hash mismatch'],
            });

            await getResourceHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
            const error = mockNext.mock.calls[0][0];
            expect(error.message).toContain('integrity');
        });

        it('should handle service errors', async () => {
            mockReq.params = { id: 'error-doc' };

            (resourceService.getResourceById as jest.Mock).mockRejectedValue(
                new Error('Database query failed')
            );

            await getResourceHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    describe('getZTDFDetailsHandler - GET /api/resources/:id/ztdf', () => {
        it('should get ZTDF details successfully', async () => {
            mockReq.params = { id: 'ztdf-123' };

            const mockZTDF = {
                manifest: {
                    version: '1.0',
                    createdAt: '2025-11-20T10:00:00Z',
                },
                policy: {
                    securityLabel: {
                        classification: 'SECRET',
                        releasabilityTo: ['USA'],
                    },
                },
                payload: {
                    keyAccessObjects: [
                        {
                            kaoId: 'kao-1',
                            kasId: 'kas-usa',
                        },
                    ],
                },
            };

            (resourceService.getZTDFObject as jest.Mock).mockResolvedValue(mockZTDF);

            await getZTDFDetailsHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(resourceService.getZTDFObject).toHaveBeenCalledWith('ztdf-123');
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    manifest: expect.objectContaining({
                        version: '1.0',
                    }),
                })
            );
        });

        it('should return 404 when ZTDF not found', async () => {
            mockReq.params = { id: 'non-existent' };

            (resourceService.getZTDFObject as jest.Mock).mockResolvedValue(null);

            await getZTDFDetailsHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    describe('getKASFlowHandler - GET /api/resources/:id/kas-flow', () => {
        it('should get KAS flow for single KAS', async () => {
            mockReq.params = { id: 'ztdf-123' };

            const mockResource = {
                resourceId: 'ztdf-123',
                ztdf: {
                    policy: {
                        securityLabel: {
                            classification: 'SECRET',
                            releasabilityTo: ['USA'],
                            COI: ['NATO-COSMIC'],
                        },
                    },
                    payload: {
                        keyAccessObjects: [
                            {
                                kaoId: 'kao-1',
                                kasId: 'kas-usa',
                                policyBinding: {
                                    coiRequired: ['NATO-COSMIC'],
                                    countriesAllowed: ['USA'],
                                },
                            },
                        ],
                    },
                },
            };

            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);

            await getKASFlowHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    resourceId: 'ztdf-123',
                    kasArchitecture: 'single',
                    keyAccessObjects: expect.arrayContaining([
                        expect.objectContaining({
                            kaoId: 'kao-1',
                        }),
                    ]),
                })
            );
        });

        it('should detect multi-KAS architecture', async () => {
            mockReq.params = { id: 'ztdf-456' };

            const mockResource = {
                resourceId: 'ztdf-456',
                ztdf: {
                    policy: {
                        securityLabel: {
                            classification: 'SECRET',
                            releasabilityTo: ['USA', 'GBR'],
                            COI: ['FVEY'],
                        },
                    },
                    payload: {
                        keyAccessObjects: [
                            {
                                kaoId: 'kao-1',
                                kasId: 'kas-usa',
                                policyBinding: {
                                    countriesAllowed: ['USA'],
                                },
                            },
                            {
                                kaoId: 'kao-2',
                                kasId: 'kas-gbr',
                                policyBinding: {
                                    countriesAllowed: ['GBR'],
                                },
                            },
                        ],
                    },
                },
            };

            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);

            await getKASFlowHandler(mockReq as Request, mockRes as Response, mockNext);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.kasArchitecture).toBe('multi');
            expect(response.keyAccessObjects).toHaveLength(2);
        });

        it('should return 404 for non-existent resource', async () => {
            mockReq.params = { id: 'non-existent' };

            (resourceService.getResourceById as jest.Mock).mockResolvedValue(null);

            await getKASFlowHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    describe('requestKeyHandler - POST /api/resources/:id/request-key', () => {
        it('should request key from KAS successfully', async () => {
            mockReq.params = { id: 'ztdf-123' };
            mockReq.body = { kasId: 'kas-usa' };

            const mockResource = {
                resourceId: 'ztdf-123',
                ztdf: {
                    policy: {
                        securityLabel: {
                            classification: 'SECRET',
                            releasabilityTo: ['USA'],
                        },
                    },
                    payload: {
                        keyAccessObjects: [
                            {
                                kaoId: 'kao-1',
                                kasId: 'kas-usa',
                                wrappedKey: 'wrapped-key-data',
                                policyBinding: {
                                    countriesAllowed: ['USA'],
                                },
                            },
                        ],
                    },
                },
            };

            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);
            (axios.post as jest.Mock).mockResolvedValue({
                data: {
                    unwrappedKey: 'decryption-key-123',
                    status: 'success',
                },
            });

            await requestKeyHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(axios.post).toHaveBeenCalled();
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    unwrappedKey: 'decryption-key-123',
                })
            );
        });

        it('should handle missing kasId in request', async () => {
            mockReq.params = { id: 'ztdf-123' };
            mockReq.body = {}; // No kasId

            const mockResource = {
                resourceId: 'ztdf-123',
                ztdf: {
                    payload: {
                        keyAccessObjects: [
                            {
                                kaoId: 'kao-1',
                                kasId: 'kas-usa',
                            },
                        ],
                    },
                },
            };

            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);

            await requestKeyHandler(mockReq as Request, mockRes as Response, mockNext);

            // Should use first available KAS
            expect(axios.post).toHaveBeenCalled();
        });

        it('should handle KAS denial', async () => {
            mockReq.params = { id: 'ztdf-123' };
            mockReq.body = { kasId: 'kas-usa' };

            const mockResource = {
                resourceId: 'ztdf-123',
                ztdf: {
                    policy: {
                        securityLabel: {
                            classification: 'SECRET',
                        },
                    },
                    payload: {
                        keyAccessObjects: [
                            {
                                kaoId: 'kao-1',
                                kasId: 'kas-usa',
                                wrappedKey: 'wrapped-key-data',
                            },
                        ],
                    },
                },
            };

            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);
            (axios.post as jest.Mock).mockRejectedValue({
                response: {
                    status: 403,
                    data: {
                        error: 'Access denied: insufficient clearance',
                    },
                },
            });

            await requestKeyHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    describe('downloadZTDFHandler - GET /api/resources/:id/download', () => {
        it('should download ZTDF file successfully', async () => {
            mockReq.params = { id: 'ztdf-123' };

            const mockZTDF = {
                manifest: { version: '1.0' },
                policy: {
                    securityLabel: {
                        classification: 'SECRET',
                    },
                },
                payload: {
                    encryptedContent: 'encrypted-data',
                    keyAccessObjects: [],
                },
            };

            const mockOpenTDF = {
                manifest: { version: '1.0' },
                encryptedContent: 'encrypted-data',
            };

            (resourceService.getZTDFObject as jest.Mock).mockResolvedValue(mockZTDF);
            (ztdfExportService.convertToOpenTDFFormat as jest.Mock).mockReturnValue(mockOpenTDF);

            await downloadZTDFHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
            expect(mockRes.setHeader).toHaveBeenCalledWith(
                'Content-Disposition',
                expect.stringContaining('attachment')
            );
            expect(mockRes.send).toHaveBeenCalled();
        });

        it('should return 404 when ZTDF not found', async () => {
            mockReq.params = { id: 'non-existent' };

            (resourceService.getZTDFObject as jest.Mock).mockResolvedValue(null);

            await downloadZTDFHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        });

        it('should handle export errors', async () => {
            mockReq.params = { id: 'ztdf-123' };

            const mockZTDF = {
                manifest: { version: '1.0' },
                policy: { securityLabel: { classification: 'SECRET' } },
                payload: { encryptedContent: 'data', keyAccessObjects: [] },
            };

            (resourceService.getZTDFObject as jest.Mock).mockResolvedValue(mockZTDF);
            (ztdfExportService.convertToOpenTDFFormat as jest.Mock).mockImplementation(() => {
                throw new Error('Export failed');
            });

            await downloadZTDFHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    describe('Edge Cases', () => {
        it('should handle TOP_SECRET clearance correctly', async () => {
            mockReq.user = {
                uniqueID: 'test-user',
                clearance: 'TOP_SECRET',
            } as any;

            const mockResources = [
                {
                    resourceId: 'ts-doc',
                    ztdf: {
                        policy: {
                            securityLabel: {
                                classification: 'TOP_SECRET',
                                releasabilityTo: ['USA'],
                            },
                        },
                        manifest: { version: '1.0' },
                        payload: { keyAccessObjects: [] },
                    },
                },
                {
                    resourceId: 'secret-doc',
                    ztdf: {
                        policy: {
                            securityLabel: {
                                classification: 'SECRET',
                                releasabilityTo: ['USA'],
                            },
                        },
                        manifest: { version: '1.0' },
                        payload: { keyAccessObjects: [] },
                    },
                },
            ];

            (resourceService.getAllResources as jest.Mock).mockResolvedValue(mockResources);

            await listResourcesHandler(mockReq as Request, mockRes as Response, mockNext);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            // TOP_SECRET user should see both resources
            expect(response.resources).toHaveLength(2);
        });

        it('should handle resources with no KAOs', async () => {
            mockReq.params = { id: 'ztdf-empty' };

            const mockResource = {
                resourceId: 'ztdf-empty',
                ztdf: {
                    policy: {
                        securityLabel: {
                            classification: 'UNCLASSIFIED',
                        },
                    },
                    payload: {
                        keyAccessObjects: [], // Empty
                    },
                },
            };

            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);

            await getKASFlowHandler(mockReq as Request, mockRes as Response, mockNext);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.keyAccessObjects).toHaveLength(0);
        });

        it('should handle malformed user token', async () => {
            mockReq.user = undefined; // No user in token

            const mockResources = [
                {
                    resourceId: 'unclass-doc',
                    ztdf: {
                        policy: {
                            securityLabel: {
                                classification: 'UNCLASSIFIED',
                                releasabilityTo: [],
                            },
                        },
                        manifest: { version: '1.0' },
                        payload: { keyAccessObjects: [] },
                    },
                },
            ];

            (resourceService.getAllResources as jest.Mock).mockResolvedValue(mockResources);

            await listResourcesHandler(mockReq as Request, mockRes as Response, mockNext);

            // Should default to UNCLASSIFIED clearance
            expect(mockRes.json).toHaveBeenCalled();
        });
    });
});

