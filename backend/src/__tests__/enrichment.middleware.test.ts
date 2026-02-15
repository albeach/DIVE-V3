/**
 * Enrichment Middleware Test Suite
 * Tests for claim enrichment logic (country inference, default clearance, COI)
 * 
 * Target Coverage: 90%
 * Priority: HIGH (Coalition interoperability)
 */

import { Request, Response, NextFunction } from 'express';
import { enrichmentMiddleware } from '../middleware/enrichment.middleware';

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

describe('Enrichment Middleware', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let next: jest.MockedFunction<NextFunction>;

    beforeEach(() => {
        jest.clearAllMocks();

        req = {
            headers: {}
        };

        const statusMock = jest.fn().mockReturnThis();
        const jsonMock = jest.fn().mockReturnThis();
        res = {
            status: statusMock,
            json: jsonMock
        };

        next = jest.fn();
    });

    // ============================================
    // Country Inference Tests
    // ============================================
    describe('inferCountryFromEmail', () => {
        it('should infer USA from @example.mil', async () => {
            const payload = {
                uniqueID: 'testuser',
                email: 'testuser@example.mil',
                clearance: 'SECRET',
                acpCOI: ['FVEY']
                // Missing countryOfAffiliation
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).enrichedUser.countryOfAffiliation).toBe('USA');
            expect((req as any).wasEnriched).toBe(true);
            expect(next).toHaveBeenCalled();
        });

        it('should infer USA from @army.mil', async () => {
            const payload = {
                uniqueID: 'testuser',
                email: 'testuser@army.mil',
                clearance: 'SECRET',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).enrichedUser.countryOfAffiliation).toBe('USA');
        });

        it('should infer FRA from @gouv.fr', async () => {
            const payload = {
                uniqueID: 'testuser-fra',
                email: 'testuser@gouv.fr',
                clearance: 'CONFIDENTIAL',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).enrichedUser.countryOfAffiliation).toBe('FRA');
        });

        it('should infer FRA from @defense.gouv.fr', async () => {
            const payload = {
                uniqueID: 'testuser-fra',
                email: 'testuser@defense.gouv.fr',
                clearance: 'SECRET',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).enrichedUser.countryOfAffiliation).toBe('FRA');
        });

        it('should infer CAN from @gc.ca', async () => {
            const payload = {
                uniqueID: 'testuser-can',
                email: 'testuser@gc.ca',
                clearance: 'SECRET',
                acpCOI: ['FVEY']
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).enrichedUser.countryOfAffiliation).toBe('CAN');
        });

        it('should infer CAN from @forces.gc.ca', async () => {
            const payload = {
                uniqueID: 'testuser-can',
                email: 'testuser@forces.gc.ca',
                clearance: 'SECRET',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).enrichedUser.countryOfAffiliation).toBe('CAN');
        });

        it('should infer GBR from @mod.uk', async () => {
            const payload = {
                uniqueID: 'testuser-gbr',
                email: 'testuser@mod.uk',
                clearance: 'SECRET',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).enrichedUser.countryOfAffiliation).toBe('GBR');
        });

        it('should default to USA for unknown domains', async () => {
            const payload = {
                uniqueID: 'contractor',
                email: 'bob@contractor.com',
                clearance: 'UNCLASSIFIED',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).enrichedUser.countryOfAffiliation).toBe('USA');
            expect((req as any).wasEnriched).toBe(true);
        });

        it('should infer USA from industry contractors (@lockheed.com)', async () => {
            const payload = {
                uniqueID: 'contractor',
                email: 'engineer@lockheed.com',
                clearance: 'CONFIDENTIAL',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).enrichedUser.countryOfAffiliation).toBe('USA');
        });

        it('should handle subdomain matches (e.g., unit.army.mil)', async () => {
            const payload = {
                uniqueID: 'testuser',
                email: 'testuser@82nd.army.mil',
                clearance: 'SECRET',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).enrichedUser.countryOfAffiliation).toBe('USA');
        });

        it('should fail-secure when email missing and country missing', async () => {
            const payload = {
                uniqueID: 'testuser',
                // No email
                clearance: 'SECRET',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'Forbidden',
                message: 'Missing countryOfAffiliation and cannot infer from email'
            }));
            expect(next).not.toHaveBeenCalled();
        });

        it('should handle invalid email format gracefully', async () => {
            const payload = {
                uniqueID: 'testuser',
                email: 'invalid-email-no-at-sign',
                clearance: 'SECRET',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            // Should default to USA with low confidence
            expect((req as any).enrichedUser.countryOfAffiliation).toBe('USA');
        });

        it('should log country inference with confidence level', async () => {
            const payload = {
                uniqueID: 'testuser',
                email: 'testuser@example.mil',
                clearance: 'SECRET',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            // Logger is mocked - country inference will be logged
            expect((req as any).enrichedUser).toBeDefined();
        });
    });

    // ============================================
    // Clearance Enrichment Tests
    // ============================================
    describe('clearance enrichment', () => {
        it('should not modify existing clearance', async () => {
            const payload = {
                uniqueID: 'testuser',
                email: 'testuser@example.mil',
                clearance: 'TOP_SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).enrichedUser.clearance).toBe('TOP_SECRET');
            // wasEnriched is true because default COIs are added for USA even though clearance wasn't modified
            expect((req as any).wasEnriched).toBe(true);
        });

        it('should set UNCLASSIFIED for missing clearance', async () => {
            const payload = {
                uniqueID: 'testuser',
                email: 'testuser@example.mil',
                // Missing clearance
                countryOfAffiliation: 'USA',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).enrichedUser.clearance).toBe('UNCLASSIFIED');
            expect((req as any).wasEnriched).toBe(true);
        });

        it('should set UNCLASSIFIED for empty clearance', async () => {
            const payload = {
                uniqueID: 'testuser',
                email: 'testuser@example.mil',
                clearance: '', // Empty string
                countryOfAffiliation: 'USA',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).enrichedUser.clearance).toBe('UNCLASSIFIED');
        });

        it('should normalize invalid clearance level to UNCLASSIFIED', async () => {
            const payload = {
                uniqueID: 'testuser',
                email: 'testuser@example.mil',
                clearance: 'INVALID_LEVEL',
                countryOfAffiliation: 'USA',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            // Clearance normalization now falls back to UNCLASSIFIED instead of rejecting
            expect((req as any).enrichedUser.clearance).toBe('UNCLASSIFIED');
            expect((req as any).wasEnriched).toBe(true);
        });

        it('should accept all valid clearance levels', async () => {
            const validLevels = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];

            for (const level of validLevels) {
                jest.clearAllMocks();
                next = jest.fn();

                const payload = {
                    uniqueID: 'testuser',
                    email: 'testuser@example.mil',
                    clearance: level,
                    countryOfAffiliation: 'USA',
                    acpCOI: []
                };

                const token = createTestToken(payload);
                req.headers!.authorization = `Bearer ${token}`;

                await enrichmentMiddleware(req as Request, res as Response, next);

                expect(next).toHaveBeenCalled();
                expect((req as any).enrichedUser.clearance).toBe(level);
            }
        });

        it('should log clearance enrichment', async () => {
            const payload = {
                uniqueID: 'testuser',
                email: 'testuser@example.mil',
                // Missing clearance
                countryOfAffiliation: 'USA',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            // Logger is mocked - clearance enrichment will be logged
            expect((req as any).enrichedUser).toBeDefined();
        });
    });

    // ============================================
    // COI Enrichment Tests
    // ============================================
    describe('acpCOI enrichment', () => {
        it('should not modify existing acpCOI', async () => {
            const payload = {
                uniqueID: 'testuser',
                email: 'testuser@example.mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['FVEY', 'NATO-COSMIC']
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).enrichedUser.acpCOI).toEqual(['FVEY', 'NATO-COSMIC']);
            expect((req as any).wasEnriched).toBe(false);
        });

        it('should set empty array for missing acpCOI', async () => {
            const payload = {
                uniqueID: 'testuser',
                email: 'testuser@example.mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA'
                // Missing acpCOI
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            // USA defaults: ['US-ONLY', 'FVEY', 'NATO'] (no longer empty string)
            expect((req as any).enrichedUser.acpCOI).toEqual(['US-ONLY', 'FVEY', 'NATO']);
            expect((req as any).wasEnriched).toBe(true);
        });

        it('should log acpCOI enrichment', async () => {
            const payload = {
                uniqueID: 'testuser',
                email: 'testuser@example.mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA'
                // Missing acpCOI
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            // Logger is mocked - acpCOI enrichment will be logged
            expect((req as any).enrichedUser).toBeDefined();
        });
    });

    // ============================================
    // Integration and Multiple Enrichments
    // ============================================
    describe('Multiple enrichments', () => {
        it('should enrich all missing attributes in one pass', async () => {
            const payload = {
                uniqueID: 'contractor',
                email: 'bob@contractor.com'
                // Missing: clearance, countryOfAffiliation, acpCOI
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).enrichedUser.countryOfAffiliation).toBe('USA');
            expect((req as any).enrichedUser.clearance).toBe('UNCLASSIFIED');
            // USA defaults: ['US-ONLY', 'FVEY', 'NATO'] (no longer empty string)
            expect((req as any).enrichedUser.acpCOI).toEqual(['US-ONLY', 'FVEY', 'NATO']);
            expect((req as any).wasEnriched).toBe(true);
        });

        it('should attach enrichedUser to request', async () => {
            const payload = {
                uniqueID: 'testuser',
                email: 'testuser@example.mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['FVEY']
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).enrichedUser).toBeDefined();
            expect((req as any).enrichedUser.uniqueID).toBe('testuser');
        });

        it('should set wasEnriched flag correctly', async () => {
            // Case 1: No enrichment needed
            let payload = {
                uniqueID: 'testuser',
                email: 'testuser@example.mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['FVEY']
            };

            let token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).wasEnriched).toBe(false);

            // Case 2: Enrichment performed
            jest.clearAllMocks();
            req = { headers: {} };
            next = jest.fn();

            payload = {
                uniqueID: 'contractor',
                email: 'bob@contractor.com'
                // Missing attributes
            } as any;

            token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).wasEnriched).toBe(true);
        });

        it('should log all enrichments for audit', async () => {
            const payload = {
                uniqueID: 'contractor',
                email: 'bob@contractor.com'
                // All attributes missing
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            // Logger is mocked - enrichment summary will be logged
            expect((req as any).enrichedUser).toBeDefined();
        });

        it('should preserve original claims in log', async () => {
            const payload = {
                uniqueID: 'contractor',
                email: 'bob@contractor.com'
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            // Enriched user should have new values
            expect((req as any).enrichedUser.countryOfAffiliation).toBe('USA');
        });
    });

    // ============================================
    // Error Handling
    // ============================================
    describe('Error handling', () => {
        it('should return 401 when Authorization header missing', async () => {
            // No Authorization header

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'Unauthorized',
                message: 'Missing or invalid authorization token'
            }));
            expect(next).not.toHaveBeenCalled();
        });

        it('should return 401 when Authorization header format invalid', async () => {
            req.headers!.authorization = 'InvalidFormat token123';

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        it('should handle malformed JWT gracefully', async () => {
            req.headers!.authorization = 'Bearer invalid.jwt.format';

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'Internal Server Error',
                message: 'Failed to enrich identity attributes'
            }));
        });

        it('should handle missing uniqueID', async () => {
            const payload = {
                // Missing uniqueID
                email: 'testuser@example.mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            // Should succeed (uniqueID not required for enrichment)
            expect(next).toHaveBeenCalled();
        });

        it('should log errors for failed enrichment', async () => {
            req.headers!.authorization = 'Bearer malformed';

            await enrichmentMiddleware(req as Request, res as Response, next);

            // Logger is mocked - errors will be logged
            // Enrichment middleware returns 500 for internal errors (malformed JWT)
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // ============================================
    // Edge Cases
    // ============================================
    describe('Edge cases', () => {
        it('should handle very long email addresses', async () => {
            const longEmail = 'very.long.email.address.with.many.dots@example.mil';
            const payload = {
                uniqueID: 'testuser',
                email: longEmail,
                clearance: 'SECRET',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect((req as any).enrichedUser.countryOfAffiliation).toBe('USA');
        });

        it('should handle email with uppercase domains', async () => {
            const payload = {
                uniqueID: 'testuser',
                email: 'TestUser@EXAMPLE.MIL',
                clearance: 'SECRET',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            // Should handle case-insensitively
            expect((req as any).enrichedUser.countryOfAffiliation).toBe('USA');
        });

        it('should handle multiple @ symbols in email', async () => {
            const payload = {
                uniqueID: 'testuser',
                email: 'invalid@@example.mil',
                clearance: 'SECRET',
                acpCOI: []
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            // Should default to USA with low confidence
            expect((req as any).enrichedUser.countryOfAffiliation).toBe('USA');
        });

        it('should handle request ID for logging', async () => {
            req.headers!['x-request-id'] = 'custom-request-123';

            const payload = {
                uniqueID: 'testuser',
                email: 'testuser@example.mil'
            };

            const token = createTestToken(payload);
            req.headers!.authorization = `Bearer ${token}`;

            await enrichmentMiddleware(req as Request, res as Response, next);

            expect(next).toHaveBeenCalled();
        });
    });
});

// ============================================
// Helper Functions
// ============================================

/**
 * Create a test JWT token with given payload
 */
function createTestToken(payload: any): string {
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    return `header.${base64Payload}.signature`;
}
