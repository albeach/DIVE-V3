/**
 * Policy Controller Test Suite
 * Target: 90%+ coverage for policy.controller.ts
 * 
 * Tests OPA policy viewer functionality:
 * - List all policies
 * - Get policy by ID
 * - Test policy decisions with validation
 */

import { Request, Response } from 'express';
import {
    listPoliciesHandler,
    getPolicyHandler,
    testDecisionHandler,
} from '../controllers/policy.controller';
import * as policyService from '../services/policy.service';
import { NotFoundError, ValidationError } from '../middleware/error.middleware';

// Mock logger
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

// Mock policy service
jest.mock('../services/policy.service');

describe('Policy Controller', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: jest.Mock;

    beforeEach(() => {
        mockReq = {
            headers: { 'x-request-id': 'test-123' },
            params: {},
            body: {},
        };

        mockRes = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(),
        };

        mockNext = jest.fn();

        jest.clearAllMocks();
    });

    describe('listPoliciesHandler', () => {
        it('should list all policies successfully', async () => {
            const mockPolicies = [
                { id: 'policy-1', name: 'Authorization Policy', enabled: true },
                { id: 'policy-2', name: 'ABAC Policy', enabled: true },
            ];
            const mockStats = {
                total: 2,
                enabled: 2,
                disabled: 0,
            };

            (policyService.listPolicies as jest.Mock).mockResolvedValue(mockPolicies);
            (policyService.getPolicyStats as jest.Mock).mockResolvedValue(mockStats);

            await listPoliciesHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(policyService.listPolicies).toHaveBeenCalled();
            expect(policyService.getPolicyStats).toHaveBeenCalled();
            expect(mockRes.json).toHaveBeenCalledWith({
                policies: mockPolicies,
                stats: mockStats,
                count: 2,
                timestamp: expect.any(String),
            });
        });

        it('should return empty array when no policies exist', async () => {
            (policyService.listPolicies as jest.Mock).mockResolvedValue([]);
            (policyService.getPolicyStats as jest.Mock).mockResolvedValue({
                total: 0,
                enabled: 0,
                disabled: 0,
            });

            await listPoliciesHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    policies: [],
                    count: 0,
                })
            );
        });

        it('should include timestamp in response', async () => {
            (policyService.listPolicies as jest.Mock).mockResolvedValue([]);
            (policyService.getPolicyStats as jest.Mock).mockResolvedValue({ total: 0 });

            await listPoliciesHandler(mockReq as Request, mockRes as Response, mockNext);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        });

        it('should handle errors and pass to next middleware', async () => {
            const error = new Error('Database error');
            (policyService.listPolicies as jest.Mock).mockRejectedValue(error);

            await listPoliciesHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(error);
            expect(mockRes.json).not.toHaveBeenCalled();
        });
    });

    describe('getPolicyHandler', () => {
        it('should get policy by ID successfully', async () => {
            const mockPolicy = {
                id: 'policy-1',
                name: 'Authorization Policy',
                content: 'package dive.authorization...',
                enabled: true,
            };

            mockReq.params = { id: 'policy-1' };
            (policyService.getPolicyById as jest.Mock).mockResolvedValue(mockPolicy);

            await getPolicyHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(policyService.getPolicyById).toHaveBeenCalledWith('policy-1');
            expect(mockRes.json).toHaveBeenCalledWith(mockPolicy);
        });

        it('should throw NotFoundError when policy does not exist', async () => {
            mockReq.params = { id: 'non-existent' };
            (policyService.getPolicyById as jest.Mock).mockResolvedValue(null);

            await getPolicyHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error).toBeInstanceOf(NotFoundError);
            expect(error.message).toContain('non-existent');
        });

        it('should handle service errors', async () => {
            mockReq.params = { id: 'policy-1' };
            const error = new Error('Service unavailable');
            (policyService.getPolicyById as jest.Mock).mockRejectedValue(error);

            await getPolicyHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(error);
            expect(mockRes.json).not.toHaveBeenCalled();
        });
    });

    describe('testDecisionHandler', () => {
        const validOPAInput = {
            input: {
                subject: {
                    authenticated: true,
                    uniqueID: 'user-123',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: ['NATO-COSMIC'],
                },
                action: {
                    operation: 'read',
                },
                resource: {
                    resourceId: 'doc-456',
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                    COI: ['NATO-COSMIC'],
                    encrypted: false,
                },
                context: {
                    currentTime: '2025-11-28T12:00:00Z',
                    requestId: 'req-789',
                },
            },
        };

        it('should test policy decision successfully', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = validOPAInput;

            const mockResult = {
                allow: true,
                reason: 'All conditions satisfied',
                obligations: [],
                evaluation_details: {},
            };

            (policyService.testPolicyDecision as jest.Mock).mockResolvedValue(mockResult);

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(policyService.testPolicyDecision).toHaveBeenCalledWith(validOPAInput);
            expect(mockRes.json).toHaveBeenCalledWith(mockResult);
        });

        it('should throw ValidationError when body is missing', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = undefined;

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error).toBeInstanceOf(ValidationError);
            expect(error.message).toContain('input');
        });

        it('should throw ValidationError when input field is missing', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = { data: {} }; // Missing 'input' field

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error).toBeInstanceOf(ValidationError);
        });

        it('should validate subject.authenticated is boolean', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = {
                input: {
                    ...validOPAInput.input,
                    subject: {
                        ...validOPAInput.input.subject,
                        authenticated: 'true', // String instead of boolean
                    },
                },
            };

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error).toBeInstanceOf(ValidationError);
            expect(error.message).toContain('authenticated must be boolean');
        });

        it('should validate required subject.uniqueID', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = {
                input: {
                    ...validOPAInput.input,
                    subject: {
                        ...validOPAInput.input.subject,
                        uniqueID: undefined,
                    },
                },
            };

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error).toBeInstanceOf(ValidationError);
            expect(error.message).toContain('uniqueID');
        });

        it('should validate required subject.clearance', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = {
                input: {
                    ...validOPAInput.input,
                    subject: {
                        ...validOPAInput.input.subject,
                        clearance: null,
                    },
                },
            };

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error).toBeInstanceOf(ValidationError);
            expect(error.message).toContain('clearance');
        });

        it('should validate required subject.countryOfAffiliation', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = {
                input: {
                    ...validOPAInput.input,
                    subject: {
                        ...validOPAInput.input.subject,
                        countryOfAffiliation: '',
                    },
                },
            };

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error).toBeInstanceOf(ValidationError);
            expect(error.message).toContain('countryOfAffiliation');
        });

        it('should validate required action.operation', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = {
                input: {
                    ...validOPAInput.input,
                    action: {},
                },
            };

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error).toBeInstanceOf(ValidationError);
            expect(error.message).toContain('action.operation');
        });

        it('should validate required resource.resourceId', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = {
                input: {
                    ...validOPAInput.input,
                    resource: {
                        ...validOPAInput.input.resource,
                        resourceId: undefined,
                    },
                },
            };

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error).toBeInstanceOf(ValidationError);
            expect(error.message).toContain('resourceId');
        });

        it('should validate required resource.classification', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = {
                input: {
                    ...validOPAInput.input,
                    resource: {
                        ...validOPAInput.input.resource,
                        classification: null,
                    },
                },
            };

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error).toBeInstanceOf(ValidationError);
            expect(error.message).toContain('classification');
        });

        it('should validate resource.releasabilityTo is array', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = {
                input: {
                    ...validOPAInput.input,
                    resource: {
                        ...validOPAInput.input.resource,
                        releasabilityTo: 'USA', // String instead of array
                    },
                },
            };

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error).toBeInstanceOf(ValidationError);
            expect(error.message).toContain('releasabilityTo must be array');
        });

        it('should validate resource.encrypted is boolean', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = {
                input: {
                    ...validOPAInput.input,
                    resource: {
                        ...validOPAInput.input.resource,
                        encrypted: 'false', // String instead of boolean
                    },
                },
            };

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error).toBeInstanceOf(ValidationError);
            expect(error.message).toContain('encrypted must be boolean');
        });

        it('should validate required context.currentTime', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = {
                input: {
                    ...validOPAInput.input,
                    context: {
                        ...validOPAInput.input.context,
                        currentTime: undefined,
                    },
                },
            };

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error).toBeInstanceOf(ValidationError);
            expect(error.message).toContain('currentTime');
        });

        it('should validate required context.requestId', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = {
                input: {
                    ...validOPAInput.input,
                    context: {
                        ...validOPAInput.input.context,
                        requestId: '',
                    },
                },
            };

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error).toBeInstanceOf(ValidationError);
            expect(error.message).toContain('requestId');
        });

        it('should handle service errors during policy test', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = validOPAInput;

            const error = new Error('OPA service unavailable');
            (policyService.testPolicyDecision as jest.Mock).mockRejectedValue(error);

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(error);
            expect(mockRes.json).not.toHaveBeenCalled();
        });

        it('should accept valid input with optional COI fields', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = {
                input: {
                    subject: {
                        authenticated: true,
                        uniqueID: 'user-123',
                        clearance: 'SECRET',
                        countryOfAffiliation: 'USA',
                        // acpCOI is optional
                    },
                    action: {
                        operation: 'read',
                    },
                    resource: {
                        resourceId: 'doc-456',
                        classification: 'UNCLASSIFIED',
                        releasabilityTo: [],
                        // COI is optional
                        encrypted: false,
                    },
                    context: {
                        currentTime: '2025-11-28T12:00:00Z',
                        requestId: 'req-789',
                    },
                },
            };

            const mockResult = {
                allow: false,
                reason: 'Empty releasabilityTo',
                obligations: [],
                evaluation_details: {},
            };

            (policyService.testPolicyDecision as jest.Mock).mockResolvedValue(mockResult);

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(mockResult);
            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('Edge Cases', () => {
        it('should handle missing subject entirely', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = {
                input: {
                    action: { operation: 'read' },
                    resource: { resourceId: 'doc-1', classification: 'SECRET', releasabilityTo: [], encrypted: false },
                    context: { currentTime: '2025-11-28T12:00:00Z', requestId: 'req-1' },
                },
            };

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error).toBeInstanceOf(ValidationError);
        });

        it('should handle missing resource entirely', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = {
                input: {
                    subject: {
                        authenticated: true,
                        uniqueID: 'user-1',
                        clearance: 'SECRET',
                        countryOfAffiliation: 'USA',
                    },
                    action: { operation: 'read' },
                    context: { currentTime: '2025-11-28T12:00:00Z', requestId: 'req-1' },
                },
            };

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error).toBeInstanceOf(ValidationError);
        });

        it('should handle missing context entirely', async () => {
            mockReq.params = { id: 'policy-1' };
            mockReq.body = {
                input: {
                    subject: {
                        authenticated: true,
                        uniqueID: 'user-1',
                        clearance: 'SECRET',
                        countryOfAffiliation: 'USA',
                    },
                    action: { operation: 'read' },
                    resource: { resourceId: 'doc-1', classification: 'SECRET', releasabilityTo: [], encrypted: false },
                },
            };

            await testDecisionHandler(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error).toBeInstanceOf(ValidationError);
        });
    });
});

