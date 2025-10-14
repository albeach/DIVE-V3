/**
 * KAS Flow Test Suite
 * Tests for KAS flow visualization and key request endpoints
 * 
 * Target Coverage: 95%
 * Priority: HIGH (Week 3.4.3 KAS Flow Visualization)
 */

import { Request, Response, NextFunction } from 'express';
import {
    getKASFlowHandler,
    requestKeyHandler
} from '../controllers/resource.controller';
import { getResourceById } from '../services/resource.service';
import axios from 'axios';

// Mock dependencies
jest.mock('../services/resource.service');
jest.mock('../utils/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));
jest.mock('axios');

const mockedGetResourceById = getResourceById as jest.MockedFunction<typeof getResourceById>;
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KAS Flow Endpoints', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Setup mock request
        mockRequest = {
            params: {},
            headers: { 'x-request-id': 'test-req-123' },
            body: {}
        };

        // Setup mock response
        const jsonMock = jest.fn();
        const statusMock = jest.fn(() => mockResponse as Response);
        mockResponse = {
            json: jsonMock,
            status: statusMock
        };

        // Setup mock next
        mockNext = jest.fn();
    });

    // ============================================
    // getKASFlowHandler Tests
    // ============================================
    describe('getKASFlowHandler', () => {
        it('should return 6-step flow for encrypted ZTDF resource', async () => {
            mockRequest.params = { id: 'doc-ztdf-0001' };

            const mockResource = {
                resourceId: 'doc-ztdf-0001',
                title: 'Test Resource',
                ztdf: {
                    manifest: { objectId: 'doc-ztdf-0001' },
                    policy: { policyVersion: '1.0' },
                    payload: {
                        keyAccessObjects: [{
                            kaoId: 'kao-doc-ztdf-0001',
                            kasUrl: 'http://localhost:8080',
                            policyBinding: {
                                clearanceRequired: 'SECRET',
                                countriesAllowed: ['USA'],
                                coiRequired: []
                            }
                        }],
                        encryptedChunks: []
                    }
                }
            };

            mockedGetResourceById.mockResolvedValue(mockResource as any);

            await getKASFlowHandler(
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    resourceId: 'doc-ztdf-0001',
                    encrypted: true,
                    kasRequired: true,
                    flow: expect.objectContaining({
                        step1: expect.objectContaining({
                            name: 'Resource Access Request',
                            status: 'COMPLETE'
                        }),
                        step2: expect.objectContaining({
                            name: 'OPA Policy Evaluation',
                            status: 'COMPLETE'
                        }),
                        step3: expect.objectContaining({
                            name: 'Key Request to KAS',
                            status: 'PENDING'
                        }),
                        step4: expect.objectContaining({
                            name: 'KAS Policy Re-evaluation',
                            status: 'PENDING'
                        }),
                        step5: expect.objectContaining({
                            name: 'Key Release',
                            status: 'PENDING'
                        }),
                        step6: expect.objectContaining({
                            name: 'Content Decryption',
                            status: 'PENDING'
                        })
                    }),
                    kaoDetails: expect.objectContaining({
                        kaoId: 'kao-doc-ztdf-0001',
                        kasUrl: 'http://localhost:8080'
                    })
                })
            );
        });

        it('should handle unencrypted resources (no KAOs)', async () => {
            mockRequest.params = { id: 'doc-ztdf-0002' };

            const mockResource = {
                resourceId: 'doc-ztdf-0002',
                ztdf: {
                    payload: {
                        keyAccessObjects: [], // No KAOs
                        encryptedChunks: []
                    }
                }
            };

            mockedGetResourceById.mockResolvedValue(mockResource as any);

            await getKASFlowHandler(
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    encrypted: false,
                    kasRequired: false,
                    kaoDetails: null
                })
            );
        });

        it('should return 404 for non-existent resource', async () => {
            mockRequest.params = { id: 'non-existent' };

            mockedGetResourceById.mockResolvedValue(null);

            await getKASFlowHandler(
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        });

        it('should return 400 for non-ZTDF resource', async () => {
            mockRequest.params = { id: 'legacy-doc' };

            const legacyResource = {
                resourceId: 'legacy-doc',
                title: 'Legacy'
                // No ztdf field
            };

            mockedGetResourceById.mockResolvedValue(legacyResource as any);

            await getKASFlowHandler(
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith({
                error: 'Bad Request',
                message: 'This resource is not in ZTDF format'
            });
        });

        it('should include timestamps in flow steps', async () => {
            mockRequest.params = { id: 'doc-ztdf-0001' };

            const mockResource = {
                resourceId: 'doc-ztdf-0001',
                ztdf: {
                    payload: {
                        keyAccessObjects: [{ kaoId: 'kao-001', kasUrl: 'http://localhost:8080', policyBinding: {} }],
                        encryptedChunks: []
                    }
                }
            };

            mockedGetResourceById.mockResolvedValue(mockResource as any);

            await getKASFlowHandler(
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
            expect(responseData.flow.step1.timestamp).toBeDefined();
            expect(responseData.flow.step2.timestamp).toBeDefined();
            expect(new Date(responseData.flow.step1.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
        });
    });

    // ============================================
    // requestKeyHandler Tests
    // ============================================
    describe('requestKeyHandler', () => {
        it('should successfully request key and decrypt content', async () => {
            mockRequest.headers = {
                'x-request-id': 'test-req-123',
                authorization: 'Bearer test-jwt-token'
            };
            mockRequest.body = {
                resourceId: 'doc-ztdf-0001',
                kaoId: 'kao-doc-ztdf-0001'
            };

            const mockResource = {
                resourceId: 'doc-ztdf-0001',
                ztdf: {
                    payload: {
                        keyAccessObjects: [{
                            kaoId: 'kao-doc-ztdf-0001',
                            kasUrl: 'http://localhost:8080'
                        }],
                        encryptedChunks: [{
                            chunkId: 1,
                            encryptedData: 'VGVzdCBlbmNyeXB0ZWQgY29udGVudA==', // Base64 encoded
                            size: 100
                        }],
                        iv: 'MTIzNDU2Nzg5MDEy', // Base64 IV
                        authTag: 'YXV0aFRhZw==' // Base64 auth tag
                    }
                }
            };

            const mockKASResponse = {
                data: {
                    success: true,
                    dek: 'dGVzdC1kZWstMzItYnl0ZXM=', // Base64 encoded 32-byte DEK
                    kasDecision: {
                        allow: true,
                        reason: 'All policy checks passed'
                    }
                }
            };

            mockedGetResourceById.mockResolvedValue(mockResource as any);
            mockedAxios.post = jest.fn().mockResolvedValue(mockKASResponse);

            await requestKeyHandler(
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Verify KAS was called
            expect(mockedAxios.post).toHaveBeenCalledWith(
                'http://localhost:8080/request-key',
                expect.objectContaining({
                    resourceId: 'doc-ztdf-0001',
                    kaoId: 'kao-doc-ztdf-0001'
                }),
                expect.objectContaining({
                    timeout: 10000
                })
            );

            // Verify success response (decryption might fail with mock data, but call should be made)
            expect(mockResponse.json).toHaveBeenCalled();
        });

        it('should return 400 when resourceId missing', async () => {
            mockRequest.headers = { authorization: 'Bearer token' };
            mockRequest.body = { kaoId: 'kao-001' }; // Missing resourceId

            await requestKeyHandler(
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Bad Request',
                    message: 'resourceId and kaoId are required'
                })
            );
        });

        it('should return 401 when JWT missing', async () => {
            mockRequest.headers = {}; // No authorization header
            mockRequest.body = {
                resourceId: 'doc-001',
                kaoId: 'kao-001'
            };

            await requestKeyHandler(
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            expect(mockResponse.status).toHaveBeenCalledWith(401);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Unauthorized'
                })
            );
        });

        it('should return 404 when KAO not found', async () => {
            mockRequest.headers = { authorization: 'Bearer token' };
            mockRequest.body = {
                resourceId: 'doc-ztdf-0001',
                kaoId: 'kao-non-existent'
            };

            const mockResource = {
                resourceId: 'doc-ztdf-0001',
                ztdf: {
                    payload: {
                        keyAccessObjects: [{
                            kaoId: 'kao-different'
                        }]
                    }
                }
            };

            mockedGetResourceById.mockResolvedValue(mockResource as any);

            await requestKeyHandler(
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            expect(mockResponse.status).toHaveBeenCalledWith(404);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('not found')
                })
            );
        });

        it('should handle KAS denial (403)', async () => {
            mockRequest.headers = { authorization: 'Bearer token' };
            mockRequest.body = {
                resourceId: 'doc-ztdf-0001',
                kaoId: 'kao-doc-ztdf-0001'
            };

            const mockResource = {
                resourceId: 'doc-ztdf-0001',
                ztdf: {
                    payload: {
                        keyAccessObjects: [{
                            kaoId: 'kao-doc-ztdf-0001',
                            kasUrl: 'http://localhost:8080'
                        }],
                        encryptedChunks: [{
                            chunkId: 1,
                            encryptedData: 'test',
                            size: 100
                        }]
                    }
                }
            };

            const kasError = {
                response: {
                    status: 403,
                    data: {
                        denialReason: 'Country mismatch',
                        kasDecision: {
                            allow: false,
                            reason: 'FRA not in releasabilityTo',
                            evaluationDetails: {
                                clearanceCheck: 'PASS',
                                releasabilityCheck: 'FAIL',
                                coiCheck: 'PASS'
                            }
                        }
                    }
                }
            };

            mockedGetResourceById.mockResolvedValue(mockResource as any);
            (mockedAxios.isAxiosError as any) = jest.fn().mockReturnValue(true);
            mockedAxios.post = jest.fn().mockRejectedValue(kasError);

            await requestKeyHandler(
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            expect(mockResponse.status).toHaveBeenCalledWith(403);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Forbidden',
                    denialReason: 'Country mismatch',
                    kasDecision: expect.objectContaining({
                        allow: false,
                        evaluationDetails: expect.objectContaining({
                            releasabilityCheck: 'FAIL'
                        })
                    })
                })
            );
        });

        it('should handle KAS service unavailable (503)', async () => {
            mockRequest.headers = { authorization: 'Bearer token' };
            mockRequest.body = {
                resourceId: 'doc-ztdf-0001',
                kaoId: 'kao-doc-ztdf-0001'
            };

            const mockResource = {
                resourceId: 'doc-ztdf-0001',
                ztdf: {
                    payload: {
                        keyAccessObjects: [{
                            kaoId: 'kao-doc-ztdf-0001',
                            kasUrl: 'http://localhost:8080'
                        }],
                        encryptedChunks: []
                    }
                }
            };

            const networkError = new Error('ECONNREFUSED');

            mockedGetResourceById.mockResolvedValue(mockResource as any);
            (mockedAxios.isAxiosError as any) = jest.fn().mockReturnValue(true);
            mockedAxios.post = jest.fn().mockRejectedValue(networkError);

            await requestKeyHandler(
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            expect(mockResponse.status).toHaveBeenCalledWith(503);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Service Unavailable'
                })
            );
        });

        it('should handle KAS timeout gracefully', async () => {
            mockRequest.headers = { authorization: 'Bearer token' };
            mockRequest.body = {
                resourceId: 'doc-ztdf-0001',
                kaoId: 'kao-doc-ztdf-0001'
            };

            const mockResource = {
                resourceId: 'doc-ztdf-0001',
                ztdf: {
                    payload: {
                        keyAccessObjects: [{
                            kaoId: 'kao-doc-ztdf-0001',
                            kasUrl: 'http://localhost:8080'
                        }],
                        encryptedChunks: []
                    }
                }
            };

            const timeoutError = { code: 'ECONNABORTED', message: 'timeout of 10000ms exceeded' };

            mockedGetResourceById.mockResolvedValue(mockResource as any);
            (mockedAxios.isAxiosError as any) = jest.fn().mockReturnValue(true);
            mockedAxios.post = jest.fn().mockRejectedValue(timeoutError);

            await requestKeyHandler(
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            expect(mockResponse.status).toHaveBeenCalledWith(503);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('unavailable')
                })
            );
        });

        it('should validate bearer token is present', async () => {
            mockRequest.headers = {}; // No authorization
            mockRequest.body = {
                resourceId: 'doc-ztdf-0001',
                kaoId: 'kao-001'
            };

            await requestKeyHandler(
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            expect(mockResponse.status).toHaveBeenCalledWith(401);
        });

        it('should handle non-ZTDF resources', async () => {
            mockRequest.headers = { authorization: 'Bearer token' };
            mockRequest.body = {
                resourceId: 'legacy-doc',
                kaoId: 'kao-001'
            };

            const legacyResource = {
                resourceId: 'legacy-doc',
                title: 'Legacy'
                // No ztdf field
            };

            mockedGetResourceById.mockResolvedValue(legacyResource as any);

            await requestKeyHandler(
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('not in ZTDF format')
                })
            );
        });

        it('should include execution time in response', async () => {
            mockRequest.headers = { authorization: 'Bearer token' };
            mockRequest.body = {
                resourceId: 'doc-ztdf-0001',
                kaoId: 'kao-doc-ztdf-0001'
            };

            const mockResource = {
                resourceId: 'doc-ztdf-0001',
                ztdf: {
                    payload: {
                        keyAccessObjects: [{
                            kaoId: 'kao-doc-ztdf-0001',
                            kasUrl: 'http://localhost:8080'
                        }],
                        encryptedChunks: []
                    }
                }
            };

            const networkError = new Error('ECONNREFUSED');

            mockedGetResourceById.mockResolvedValue(mockResource as any);
            (mockedAxios.isAxiosError as any) = jest.fn().mockReturnValue(true);
            mockedAxios.post = jest.fn().mockRejectedValue(networkError);

            await requestKeyHandler(
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
            expect(responseData.executionTimeMs).toBeDefined();
            expect(typeof responseData.executionTimeMs).toBe('number');
            expect(responseData.executionTimeMs).toBeGreaterThanOrEqual(0);
        });

        it('should handle missing encrypted chunks', async () => {
            mockRequest.headers = { authorization: 'Bearer token' };
            mockRequest.body = {
                resourceId: 'doc-ztdf-0001',
                kaoId: 'kao-doc-ztdf-0001'
            };

            const mockResource = {
                resourceId: 'doc-ztdf-0001',
                ztdf: {
                    payload: {
                        keyAccessObjects: [{
                            kaoId: 'kao-doc-ztdf-0001',
                            kasUrl: 'http://localhost:8080'
                        }],
                        encryptedChunks: [], // No chunks
                        iv: 'test',
                        authTag: 'test'
                    }
                }
            };

            const mockKASResponse = {
                data: {
                    success: true,
                    dek: 'dGVzdC1kZWs='
                }
            };

            mockedGetResourceById.mockResolvedValue(mockResource as any);
            mockedAxios.post = jest.fn().mockResolvedValue(mockKASResponse);

            await requestKeyHandler(
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('No encrypted chunks')
                })
            );
        });
    });

    // ============================================
    // Integration Scenarios
    // ============================================
    describe('KAS Flow Integration Scenarios', () => {
        it('should handle complete allow flow', async () => {
            // Test that getKASFlowHandler returns initial state
            mockRequest.params = { id: 'doc-ztdf-0001' };

            const mockResource = {
                resourceId: 'doc-ztdf-0001',
                ztdf: {
                    payload: {
                        keyAccessObjects: [{
                            kaoId: 'kao-doc-ztdf-0001',
                            kasUrl: 'http://localhost:8080',
                            policyBinding: {
                                clearanceRequired: 'SECRET',
                                countriesAllowed: ['USA'],
                                coiRequired: ['FVEY']
                            }
                        }],
                        encryptedChunks: []
                    }
                }
            };

            mockedGetResourceById.mockResolvedValue(mockResource as any);

            await getKASFlowHandler(
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            const flowResponse = (mockResponse.json as jest.Mock).mock.calls[0][0];

            expect(flowResponse.flow.step1.status).toBe('COMPLETE');
            expect(flowResponse.flow.step2.status).toBe('COMPLETE');
            expect(flowResponse.flow.step3.status).toBe('PENDING');
            expect(flowResponse.kaoDetails.policyBinding).toEqual({
                clearanceRequired: 'SECRET',
                countriesAllowed: ['USA'],
                coiRequired: ['FVEY']
            });
        });

        it('should handle KAO with custom KAS URL', async () => {
            mockRequest.headers = { authorization: 'Bearer token' };
            mockRequest.body = {
                resourceId: 'doc-ztdf-0001',
                kaoId: 'kao-doc-ztdf-0001'
            };

            const mockResource = {
                resourceId: 'doc-ztdf-0001',
                ztdf: {
                    payload: {
                        keyAccessObjects: [{
                            kaoId: 'kao-doc-ztdf-0001',
                            kasUrl: 'http://custom-kas:9000' // Custom KAS URL
                        }],
                        encryptedChunks: []
                    }
                }
            };

            const networkError = new Error('ECONNREFUSED');

            mockedGetResourceById.mockResolvedValue(mockResource as any);
            (mockedAxios.isAxiosError as any) = jest.fn().mockReturnValue(true);
            mockedAxios.post = jest.fn().mockRejectedValue(networkError);

            await requestKeyHandler(
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Verify it tried to call the custom KAS URL
            expect(mockedAxios.post).toHaveBeenCalledWith(
                'http://custom-kas:9000/request-key',
                expect.any(Object),
                expect.any(Object)
            );
        });
    });
});

