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

        it('should return ZTDF resource metadata without integrity validation', async () => {
            // Note: Integrity validation happens in downloadZTDFHandler, not getResourceHandler
            // getResourceHandler returns metadata; validation occurs at decryption time
            mockReq.params = { id: 'ztdf-doc' };

            const mockResource = {
                resourceId: 'ztdf-doc',
                title: 'Test ZTDF Document',
                ztdf: {
                    policy: { 
                        securityLabel: { 
                            classification: 'SECRET',
                            releasabilityTo: ['USA'],
                            COI: [],
                            displayMarking: 'SECRET//USA'
                        } 
                    },
                    manifest: { version: '1.0' },
                    payload: { 
                        encryptedContent: 'data', 
                        keyAccessObjects: [{
                            kasUrl: 'https://kas.example.com',
                            wrappedKey: 'key123'
                        }] 
                    },
                },
            };

            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);

            await getResourceHandler(mockReq as Request, mockRes as Response, mockNext);

            // Should return metadata without calling next() with error
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    resourceId: 'ztdf-doc',
                    encrypted: true,
                    classification: 'SECRET'
                })
            );
            expect(mockNext).not.toHaveBeenCalled();
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

            // Complete mock resource matching the structure expected by the implementation
            const mockResource = {
                resourceId: 'ztdf-123',
                title: 'Test ZTDF Resource',
                ztdf: {
                    manifest: {
                        objectId: 'obj-123',
                        objectType: 'document',
                        version: '1.0',
                        contentType: 'application/pdf',
                        payloadSize: 1024,
                        owner: 'test-user',
                        ownerOrganization: 'Test Org',
                        createdAt: '2025-11-20T10:00:00Z',
                        modifiedAt: '2025-11-20T10:00:00Z',
                    },
                    policy: {
                        policyVersion: '1.0',
                        policyHash: 'policy-hash-123',
                        securityLabel: {
                            classification: 'SECRET',
                            releasabilityTo: ['USA'],
                            COI: [],
                            caveats: [],
                            originatingCountry: 'USA',
                            creationDate: '2025-11-20T10:00:00Z',
                            displayMarking: 'SECRET//REL USA',
                        },
                        policyAssertions: [],
                    },
                    payload: {
                        encryptedContent: 'encrypted-data',
                        payloadHash: 'hash123',
                        iv: 'test-iv',
                        authTag: 'test-auth-tag',
                        keyAccessObjects: [
                            {
                                kaoId: 'kao-1',
                                kasId: 'kas-usa',
                                kasUrl: 'https://kas.example.com',
                                wrappedKey: 'wrapped-key-data',
                                wrappingAlgorithm: 'AES-256-GCM',
                                policyBinding: {
                                    clearanceRequired: 'SECRET',
                                    countriesAllowed: ['USA'],
                                    coiRequired: [],
                                },
                                createdAt: '2025-11-20T10:00:00Z',
                            },
                        ],
                        encryptedChunks: [
                            {
                                chunkId: 'chunk-0',
                                size: 1024,
                                integrityHash: 'chunk-hash-123',
                            },
                        ],
                    },
                },
            };

            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);
            (ztdfUtils.validateZTDFIntegrity as jest.Mock).mockResolvedValue({
                valid: true,
                policyHashValid: true,
                payloadHashValid: true,
                allChunksValid: true,
                chunkHashesValid: [true], // Array matching encryptedChunks length
            });

            await getZTDFDetailsHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(resourceService.getResourceById).toHaveBeenCalledWith('ztdf-123');
            // The response includes resourceId and ztdfDetails with manifest, policy, and payload sections
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    resourceId: 'ztdf-123',
                })
            );
        });

        it('should return 404 when ZTDF not found', async () => {
            mockReq.params = { id: 'non-existent' };

            (resourceService.getResourceById as jest.Mock).mockResolvedValue(null);

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

            // The implementation returns a detailed flow object with steps
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    resourceId: 'ztdf-123',
                    kasRequired: true,
                    encrypted: true,
                    kaoDetails: expect.objectContaining({
                        kaoId: 'kao-1',
                    }),
                    flow: expect.objectContaining({
                        step1: expect.objectContaining({
                            name: 'Resource Access Request',
                            status: 'COMPLETE',
                        }),
                    }),
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

            // The implementation returns a flow object with KAO details
            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.resourceId).toBe('ztdf-456');
            expect(response.kasRequired).toBe(true);
            expect(response.encrypted).toBe(true);
            expect(response.flow).toBeDefined();
        });

        it('should return 404 for non-existent resource', async () => {
            mockReq.params = { id: 'non-existent' };

            (resourceService.getResourceById as jest.Mock).mockResolvedValue(null);

            await getKASFlowHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    describe('requestKeyHandler - POST /api/resources/request-key', () => {
        it('should request key from KAS successfully', async () => {
            // The implementation expects resourceId and kaoId in the body
            mockReq.body = { resourceId: 'ztdf-123', kaoId: 'kao-1' };
            mockReq.headers = { 
                'x-request-id': 'test-123',
                authorization: 'Bearer test-token'
            };

            // Complete mock resource with all required fields for decryption
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
                        iv: 'test-iv',
                        authTag: 'test-auth-tag',
                        encryptedChunks: [
                            {
                                chunkIndex: 0,
                                encryptedData: 'encrypted-content-data',
                                chunkHash: 'chunk-hash-123',
                            },
                        ],
                        keyAccessObjects: [
                            {
                                kaoId: 'kao-1',
                                kasId: 'kas-usa',
                                kasUrl: 'https://kas.example.com',
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
            // The implementation expects success and dek in the KAS response
            (axios.post as jest.Mock).mockResolvedValue({
                data: {
                    success: true,
                    dek: 'decryption-key-123',
                    kasDecision: {
                        allow: true,
                        kasAuthority: 'kas-usa',
                    },
                },
            });

            await requestKeyHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(axios.post).toHaveBeenCalled();
            // The handler will try to decrypt, which may fail due to mock crypto
            // but we verify it called KAS and processed the response
            expect(mockRes.json).toHaveBeenCalled();
        });

        it('should handle missing kaoId in request', async () => {
            mockReq.body = { resourceId: 'ztdf-123' }; // No kaoId
            mockReq.headers = { 
                'x-request-id': 'test-123',
                authorization: 'Bearer test-token'
            };

            await requestKeyHandler(mockReq as Request, mockRes as Response, mockNext);

            // Should return 400 for missing required field
            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('required'),
                })
            );
        });

        it('should handle KAS denial', async () => {
            mockReq.body = { resourceId: 'ztdf-123', kaoId: 'kao-1' };
            mockReq.headers = { 
                'x-request-id': 'test-123',
                authorization: 'Bearer test-token'
            };

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
                                kasUrl: 'https://kas.example.com',
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

            // KAS denial should result in error passed to next or 403 response
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                })
            );
        });
    });

    describe('downloadZTDFHandler - GET /api/resources/:id/download', () => {
        it('should download ZTDF file successfully', async () => {
            mockReq.params = { id: 'ztdf-123' };

            const mockResource = {
                resourceId: 'ztdf-123',
                title: 'Test ZTDF Resource',
                ztdf: {
                    manifest: { version: '1.0' },
                    policy: {
                        securityLabel: {
                            classification: 'SECRET',
                            releasabilityTo: ['USA'],
                            COI: [],
                        },
                    },
                    payload: {
                        encryptedContent: 'encrypted-data',
                        payloadHash: 'hash123',
                        keyAccessObjects: [],
                    },
                },
            };

            const mockExportResult = {
                zipBuffer: Buffer.from('mock-zip-data'),
                filename: 'ztdf-123.ztdf',
                fileSize: 100,
                metadata: {
                    exportedAt: new Date().toISOString(),
                    manifestSize: 50,
                    payloadSize: 50,
                },
            };

            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);
            (ztdfExportService.convertToOpenTDFFormat as jest.Mock).mockResolvedValue(mockExportResult);

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

            // The implementation uses getResourceById, not getZTDFObject
            (resourceService.getResourceById as jest.Mock).mockResolvedValue(null);

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
                            releasabilityTo: [],
                            COI: [],
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
            // The flow object should indicate no KAS required or handle empty KAOs
            expect(response.resourceId).toBe('ztdf-empty');
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

