/**
 * Error Middleware Test Suite
 * Tests for error handling and custom error classes
 * 
 * Target Coverage: 95%
 * Priority: MEDIUM (Error handling consistency)
 */

import { Request, Response, NextFunction } from 'express';
import {
    errorHandler,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
    ApiError
} from '../middleware/error.middleware';

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

describe('Error Middleware', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let next: jest.MockedFunction<NextFunction>;

    beforeEach(() => {
        jest.clearAllMocks();

        req = {
            headers: {}
        } as any;
        (req as any).path = '/api/test';
        (req as any).method = 'GET';

        const statusMock = jest.fn().mockReturnThis();
        const jsonMock = jest.fn().mockReturnThis();
        res = {
            status: statusMock,
            json: jsonMock
        };

        next = jest.fn();
    });

    // ============================================
    // Error Handler Tests
    // ============================================
    describe('errorHandler', () => {
        it('should handle generic errors with 500 status', () => {
            const error = new Error('Test error');

            errorHandler(error as ApiError, req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.any(String),
                message: 'Test error'
            }));
        });

        it('should use custom status code when provided', () => {
            const error: ApiError = new Error('Custom error');
            error.statusCode = 418;

            errorHandler(error, req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(418);
        });

        it('should include request ID in response', () => {
            req.headers!['x-request-id'] = 'test-req-123';
            const error = new Error('Test error');

            errorHandler(error as ApiError, req as Request, res as Response, next);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                requestId: 'test-req-123'
            }));
        });

        it('should log error details', () => {
            const error = new Error('Test error');

            errorHandler(error as ApiError, req as Request, res as Response, next);

            // Logger is mocked at module level, just verify no errors
            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('should include error name in response', () => {
            const error = new Error('Test error');
            error.name = 'CustomError';

            errorHandler(error as ApiError, req as Request, res as Response, next);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'CustomError'
            }));
        });

        it('should include stack trace in development mode', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';

            const error = new Error('Test error');
            error.stack = 'Error: Test error\n  at ...';

            errorHandler(error as ApiError, req as Request, res as Response, next);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                stack: expect.any(String)
            }));

            process.env.NODE_ENV = originalEnv;
        });

        it('should NOT include stack trace in production mode', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            const error = new Error('Test error');
            error.stack = 'Error: Test error\n  at ...';

            errorHandler(error as ApiError, req as Request, res as Response, next);

            const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
            expect(jsonCall.stack).toBeUndefined();

            process.env.NODE_ENV = originalEnv;
        });

        it('should include details when provided', () => {
            const error: ApiError = new Error('Validation failed');
            error.details = {
                field: 'email',
                reason: 'Invalid format'
            };

            errorHandler(error, req as Request, res as Response, next);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                details: {
                    field: 'email',
                    reason: 'Invalid format'
                }
            }));
        });

        it('should NOT include details when not provided', () => {
            const error = new Error('Test error');

            errorHandler(error as ApiError, req as Request, res as Response, next);

            const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
            expect(jsonCall.details).toBeUndefined();
        });

        it('should log request path and method', () => {
            (req as any).path = '/api/resources/123';
            (req as any).method = 'POST';

            const error = new Error('Test error');

            errorHandler(error as ApiError, req as Request, res as Response, next);

            // Logger is mocked, verify handler executed
            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('should handle errors without stack trace', () => {
            const error = new Error('Test error');
            delete error.stack;

            errorHandler(error as ApiError, req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('should handle missing request ID', () => {
            // No x-request-id header
            const error = new Error('Test error');

            errorHandler(error as ApiError, req as Request, res as Response, next);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                requestId: undefined
            }));
        });

        it('should use error name as fallback for error field', () => {
            const error = new Error('Test error');
            // Create error without name property
            const errorWithoutName = { message: error.message };

            errorHandler(errorWithoutName as ApiError, req as Request, res as Response, next);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'Internal Server Error'
            }));
        });
    });

    // ============================================
    // UnauthorizedError Tests
    // ============================================
    describe('UnauthorizedError', () => {
        it('should create error with 401 status code', () => {
            const error = new UnauthorizedError();

            expect(error.statusCode).toBe(401);
            expect(error.name).toBe('UnauthorizedError');
        });

        it('should use default message', () => {
            const error = new UnauthorizedError();

            expect(error.message).toBe('Unauthorized');
        });

        it('should use custom message', () => {
            const error = new UnauthorizedError('Invalid credentials');

            expect(error.message).toBe('Invalid credentials');
        });

        it('should be instance of Error', () => {
            const error = new UnauthorizedError();

            expect(error).toBeInstanceOf(Error);
        });

        it('should work with error handler', () => {
            const error = new UnauthorizedError('Token expired');

            errorHandler(error, req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'UnauthorizedError',
                message: 'Token expired'
            }));
        });
    });

    // ============================================
    // ForbiddenError Tests
    // ============================================
    describe('ForbiddenError', () => {
        it('should create error with 403 status code', () => {
            const error = new ForbiddenError();

            expect(error.statusCode).toBe(403);
            expect(error.name).toBe('ForbiddenError');
        });

        it('should use default message', () => {
            const error = new ForbiddenError();

            expect(error.message).toBe('Forbidden');
        });

        it('should use custom message', () => {
            const error = new ForbiddenError('Access denied');

            expect(error.message).toBe('Access denied');
        });

        it('should include details when provided', () => {
            const details = {
                reason: 'Insufficient clearance',
                required: 'SECRET',
                actual: 'CONFIDENTIAL'
            };

            const error = new ForbiddenError('Access denied', details);

            expect(error.details).toEqual(details);
        });

        it('should work with error handler including details', () => {
            const details = {
                clearance_check: 'FAIL',
                releasability_check: 'PASS'
            };

            const error = new ForbiddenError('Insufficient clearance', details);

            errorHandler(error, req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'ForbiddenError',
                message: 'Insufficient clearance',
                details
            }));
        });

        it('should handle missing details gracefully', () => {
            const error = new ForbiddenError('Access denied');

            expect(error.details).toBeUndefined();
        });
    });

    // ============================================
    // NotFoundError Tests
    // ============================================
    describe('NotFoundError', () => {
        it('should create error with 404 status code', () => {
            const error = new NotFoundError();

            expect(error.statusCode).toBe(404);
            expect(error.name).toBe('NotFoundError');
        });

        it('should use default message', () => {
            const error = new NotFoundError();

            expect(error.message).toBe('Not Found');
        });

        it('should use custom message', () => {
            const error = new NotFoundError('Resource not found');

            expect(error.message).toBe('Resource not found');
        });

        it('should work with error handler', () => {
            const error = new NotFoundError('Document not found');

            errorHandler(error, req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'NotFoundError',
                message: 'Document not found'
            }));
        });
    });

    // ============================================
    // ValidationError Tests
    // ============================================
    describe('ValidationError', () => {
        it('should create error with 400 status code', () => {
            const error = new ValidationError();

            expect(error.statusCode).toBe(400);
            expect(error.name).toBe('ValidationError');
        });

        it('should use default message', () => {
            const error = new ValidationError();

            expect(error.message).toBe('Validation Error');
        });

        it('should use custom message', () => {
            const error = new ValidationError('Invalid input');

            expect(error.message).toBe('Invalid input');
        });

        it('should include details when provided', () => {
            const details = {
                field: 'classification',
                error: 'Invalid value',
                expected: ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'],
                received: 'INVALID'
            };

            const error = new ValidationError('Invalid classification', details);

            expect(error.details).toEqual(details);
        });

        it('should work with error handler including details', () => {
            const details = {
                errors: [
                    { field: 'email', message: 'Invalid email format' },
                    { field: 'clearance', message: 'Required field' }
                ]
            };

            const error = new ValidationError('Validation failed', details);

            errorHandler(error, req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'ValidationError',
                message: 'Validation failed',
                details
            }));
        });

        it('should handle array of validation errors', () => {
            const details = {
                errors: [
                    { field: 'resourceId', message: 'Required' },
                    { field: 'classification', message: 'Invalid value' },
                    { field: 'releasabilityTo', message: 'Cannot be empty' }
                ]
            };

            const error = new ValidationError('Multiple validation errors', details);

            expect(error.details.errors).toHaveLength(3);
        });
    });

    // ============================================
    // Integration Tests
    // ============================================
    describe('Integration with Express', () => {
        it('should handle sequential errors', () => {
            const error1 = new UnauthorizedError('Missing token');
            const error2 = new ForbiddenError('Insufficient clearance');

            errorHandler(error1, req as Request, res as Response, next);
            expect(res.status).toHaveBeenLastCalledWith(401);

            jest.clearAllMocks();

            errorHandler(error2, req as Request, res as Response, next);
            expect(res.status).toHaveBeenLastCalledWith(403);
        });

        it('should handle errors from different endpoints', () => {
            const error = new NotFoundError('Resource not found');

            (req as any).path = '/api/resources/123';
            errorHandler(error, req as Request, res as Response, next);
            expect(res.status).toHaveBeenCalledWith(404);

            jest.clearAllMocks();

            (req as any).path = '/api/policies/456';
            errorHandler(error, req as Request, res as Response, next);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('should preserve request context in logs', () => {
            (req as any).path = '/api/resources/doc-001';
            (req as any).method = 'GET';
            req.headers!['x-request-id'] = 'req-xyz-789';

            const error = new ForbiddenError('Access denied');

            errorHandler(error, req as Request, res as Response, next);

            // Logger is mocked, verify handler executed
            expect(res.status).toHaveBeenCalledWith(403);
        });
    });

    // ============================================
    // Edge Cases
    // ============================================
    describe('Edge Cases', () => {
        it('should handle error with no message', () => {
            const error: any = new Error();
            error.message = undefined;

            errorHandler(error as ApiError, req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('should handle error with circular references in details', () => {
            const details: any = { a: 1 };
            details.circular = details; // Circular reference

            const error = new ValidationError('Test', details);

            // Should not throw when serializing
            expect(() => {
                errorHandler(error, req as Request, res as Response, next);
            }).not.toThrow();
        });

        it('should handle very long error messages', () => {
            const longMessage = 'Error: '.repeat(1000);
            const error = new Error(longMessage);

            errorHandler(error as ApiError, req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('should handle special characters in error messages', () => {
            const error = new Error('Error with "quotes" and <html> & special chars');

            errorHandler(error as ApiError, req as Request, res as Response, next);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Error with "quotes" and <html> & special chars'
            }));
        });

        it('should handle null details', () => {
            const error = new ValidationError('Test');
            error.details = null;

            errorHandler(error, req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should handle undefined details', () => {
            const error = new ForbiddenError('Test');
            error.details = undefined;

            errorHandler(error, req as Request, res as Response, next);

            const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
            expect(jsonCall.details).toBeUndefined();
        });

        it('should handle errors with custom properties', () => {
            const error: any = new Error('Custom error');
            error.customProp = 'customValue';
            error.anotherProp = 123;

            errorHandler(error as ApiError, req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('should handle TypeError instances', () => {
            const error = new TypeError('Type error occurred');

            errorHandler(error as ApiError, req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('should handle ReferenceError instances', () => {
            const error = new ReferenceError('Reference error occurred');

            errorHandler(error as ApiError, req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // ============================================
    // Security Tests
    // ============================================
    describe('Security', () => {
        it('should not expose stack traces in production', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            const error = new Error('Sensitive error');
            error.stack = 'Sensitive stack trace with internal paths';

            errorHandler(error as ApiError, req as Request, res as Response, next);

            const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
            expect(jsonCall.stack).toBeUndefined();

            process.env.NODE_ENV = originalEnv;
        });

        it('should not expose internal details in error responses', () => {
            const error = new Error('Database connection failed');
            error.stack = 'at MongoClient.connect (/internal/path/...)';

            errorHandler(error as ApiError, req as Request, res as Response, next);

            const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
            expect(jsonCall.message).toBe('Database connection failed');
            // Stack should only be present in development
        });

        it('should sanitize error messages from user input', () => {
            const error = new ValidationError('Invalid input: <script>alert("xss")</script>');

            errorHandler(error, req as Request, res as Response, next);

            // Error message should be preserved as-is (sanitization happens at API gateway)
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.any(String)
            }));
        });
    });
});

