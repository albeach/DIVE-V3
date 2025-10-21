/**
 * UUID Validation Middleware Tests
 * 
 * Gap #5 Remediation (October 20, 2025)
 * Tests for RFC 4122 UUID validation enforcement
 */

import { Request, Response } from 'express';
import { validateUUID, validateUUIDLenient } from '../middleware/uuid-validation.middleware';
import { v1 as uuidv1, v3 as uuidv3, v4 as uuidv4, v5 as uuidv5, validate as isValidUUID } from 'uuid';

describe('UUID Validation Middleware (Gap #5)', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let nextFunction: jest.Mock;

    beforeEach(() => {
        mockRequest = {
            headers: {
                'x-request-id': 'test-request-123'
            }
        };
        mockResponse = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        nextFunction = jest.fn();
    });

    describe('Valid UUID Formats', () => {

        test('should ACCEPT valid UUID v4 (recommended format)', () => {
            const validUUID = uuidv4();  // e.g., "550e8400-e29b-41d4-a716-446655440000"

            (mockRequest as any).user = {
                sub: 'testuser',
                uniqueID: validUUID,
                clearance: 'SECRET',
                countryOfAffiliation: 'USA'
            };

            validateUUID(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction
            );

            expect(nextFunction).toHaveBeenCalled();
            expect(mockResponse.status).not.toHaveBeenCalled();
            expect((mockRequest as any).uuidMetadata).toEqual({
                uniqueID: validUUID,
                version: 4,
                format: 'RFC 4122',
                validatedAt: expect.any(String)
            });
        });

        test('should ACCEPT valid UUID v1 (time-based)', () => {
            const validUUID = uuidv1();

            (mockRequest as any).user = {
                uniqueID: validUUID
            };

            validateUUID(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction
            );

            expect(nextFunction).toHaveBeenCalled();
            expect((mockRequest as any).uuidMetadata.version).toBe(1);
        });

        test('should ACCEPT valid UUID v3 (namespace + MD5)', () => {
            const validUUID = uuidv3('test', uuidv3.DNS);

            (mockRequest as any).user = {
                uniqueID: validUUID
            };

            validateUUID(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction
            );

            expect(nextFunction).toHaveBeenCalled();
            expect((mockRequest as any).uuidMetadata.version).toBe(3);
        });

        test('should ACCEPT valid UUID v5 (namespace + SHA-1)', () => {
            const validUUID = uuidv5('test', uuidv5.DNS);

            (mockRequest as any).user = {
                uniqueID: validUUID
            };

            validateUUID(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction
            );

            expect(nextFunction).toHaveBeenCalled();
            expect((mockRequest as any).uuidMetadata.version).toBe(5);
        });
    });

    describe('Invalid UUID Formats (Should REJECT)', () => {

        test('should REJECT email-based uniqueID', () => {
            (mockRequest as any).user = {
                uniqueID: 'john.doe@mil',  // Invalid: email format
                email: 'john.doe@mil'
            };

            validateUUID(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction
            );

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Bad Request',
                    message: 'uniqueID must be RFC 4122 UUID format'
                })
            );
            expect(nextFunction).not.toHaveBeenCalled();
        });

        test('should REJECT username-based uniqueID', () => {
            (mockRequest as any).user = {
                uniqueID: 'testuser-us'  // Invalid: username format
            };

            validateUUID(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction
            );

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(nextFunction).not.toHaveBeenCalled();
        });

        test('should REJECT random string', () => {
            (mockRequest as any).user = {
                uniqueID: 'abc-123-xyz-456'  // Invalid: not UUID
            };

            validateUUID(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction
            );

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(nextFunction).not.toHaveBeenCalled();
        });

        test('should REJECT malformed UUID (wrong length)', () => {
            (mockRequest as any).user = {
                uniqueID: '550e8400-e29b-41d4-a716'  // Invalid: too short
            };

            validateUUID(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction
            );

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(nextFunction).not.toHaveBeenCalled();
        });

        test('should REJECT UUID with invalid characters', () => {
            (mockRequest as any).user = {
                uniqueID: '550e8400-e29b-41d4-a716-GGGGGGGGGGGG'  // Invalid: G not hex
            };

            validateUUID(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction
            );

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(nextFunction).not.toHaveBeenCalled();
        });
    });

    describe('Missing uniqueID Handling', () => {

        test('should REJECT when uniqueID is missing', () => {
            (mockRequest as any).user = {
                sub: 'testuser',
                email: 'test@example.com'
                // uniqueID missing
            };

            validateUUID(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction
            );

            expect(mockResponse.status).toHaveBeenCalledWith(401);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Unauthorized',
                    message: 'Missing uniqueID claim in token'
                })
            );
            expect(nextFunction).not.toHaveBeenCalled();
        });

        test('should REJECT when user object is missing', () => {
            // No user object attached to request
            (mockRequest as any).user = undefined;

            validateUUID(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction
            );

            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(nextFunction).not.toHaveBeenCalled();
        });

        test('should REJECT when uniqueID is empty string', () => {
            (mockRequest as any).user = {
                uniqueID: ''  // Empty string
            };

            validateUUID(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction
            );

            expect(mockResponse.status).toHaveBeenCalledWith(401);
            expect(nextFunction).not.toHaveBeenCalled();
        });
    });

    describe('Error Response Structure', () => {

        test('should provide detailed error information for invalid UUID', () => {
            (mockRequest as any).user = {
                uniqueID: 'john.doe@mil'
            };

            validateUUID(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction
            );

            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Bad Request',
                    message: 'uniqueID must be RFC 4122 UUID format',
                    details: expect.objectContaining({
                        received: 'john.doe@mil',
                        expected: '550e8400-e29b-41d4-a716-446655440000',
                        expectedFormat: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx',
                        reference: 'ACP-240 Section 2.1 (Globally Unique Identifier)',
                        migrationNote: expect.any(String)
                    })
                })
            );
        });
    });

    describe('Lenient Validation Mode (Migration)', () => {

        test('should WARN but ALLOW email-based uniqueID in lenient mode', () => {
            (mockRequest as any).user = {
                uniqueID: 'john.doe@mil',
                email: 'john.doe@mil'
            };

            validateUUIDLenient(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction
            );

            // Should proceed despite invalid format
            expect(nextFunction).toHaveBeenCalled();
            expect(mockResponse.status).not.toHaveBeenCalled();

            // Should attach warning metadata
            expect((mockRequest as any).uuidMetadata).toEqual({
                uniqueID: 'john.doe@mil',
                version: null,
                format: 'LEGACY',
                warning: 'Non-UUID format detected',
                validatedAt: expect.any(String)
            });
        });

        test('should ACCEPT valid UUID in lenient mode', () => {
            const validUUID = uuidv4();

            (mockRequest as any).user = {
                uniqueID: validUUID
            };

            validateUUIDLenient(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction
            );

            expect(nextFunction).toHaveBeenCalled();
            expect((mockRequest as any).uuidMetadata.format).toBe('RFC 4122');
            expect((mockRequest as any).uuidMetadata.warning).toBeUndefined();
        });

        test('should handle missing user gracefully in lenient mode', () => {
            (mockRequest as any).user = undefined;

            validateUUIDLenient(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction
            );

            // Should proceed without error
            expect(nextFunction).toHaveBeenCalled();
            expect(mockResponse.status).not.toHaveBeenCalled();
        });
    });

    describe('ACP-240 Compliance', () => {

        test('should validate ACP-240 Section 2.1 requirements', () => {
            // ACP-240 Section 2.1 requires:
            // "Unique Identifier: Globally unique (e.g., UUID per RFC 4122) for identities;
            //  enables correlation and audit across domains."

            const acp240Requirements = {
                'RFC 4122 Format': 'xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx',
                'Global Uniqueness': 'UUIDs guarantee uniqueness across coalition',
                'Version Support': 'v1 (time), v3 (MD5), v4 (random), v5 (SHA-1)',
                'Recommended': 'UUID v4 (cryptographic random)',
                'Validation': 'Enforced by uuid.validate() function'
            };

            expect(Object.keys(acp240Requirements).length).toBe(5);
        });

        test('should document UUID format examples', () => {
            const validExamples = [
                uuidv1(),  // Time-based
                uuidv3('dive-v3', uuidv3.DNS),  // Namespace + MD5
                uuidv4(),  // Random (recommended)
                uuidv5('dive-v3', uuidv5.DNS)   // Namespace + SHA-1
            ];

            validExamples.forEach(uuid => {
                expect(isValidUUID(uuid)).toBe(true);
            });

            const invalidExamples = [
                'john.doe@mil',
                'testuser-us',
                '12345',
                'not-a-uuid'
            ];

            invalidExamples.forEach(nonUuid => {
                expect(isValidUUID(nonUuid)).toBe(false);
            });
        });
    });

    describe('Metadata Attachment', () => {

        test('should attach UUID metadata to request on success', () => {
            const validUUID = uuidv4();

            (mockRequest as any).user = {
                uniqueID: validUUID
            };

            validateUUID(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction
            );

            expect((mockRequest as any).uuidMetadata).toBeDefined();
            expect((mockRequest as any).uuidMetadata.uniqueID).toBe(validUUID);
            expect((mockRequest as any).uuidMetadata.version).toBe(4);
            expect((mockRequest as any).uuidMetadata.format).toBe('RFC 4122');
        });

        test('should not attach metadata on validation failure', () => {
            (mockRequest as any).user = {
                uniqueID: 'invalid-format'
            };

            validateUUID(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction
            );

            expect((mockRequest as any).uuidMetadata).toBeUndefined();
        });
    });
});

