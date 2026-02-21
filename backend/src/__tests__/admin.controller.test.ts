/**
 * Admin Controller Test Suite
 * Target: 70%+ coverage for admin.controller.ts (focus on key functions)
 *
 * Note: Admin controller is very complex (1735 lines, 22 exported functions).
 * This test suite focuses on the most critical IdP management operations
 * that represent the core business logic: list, get, update, delete.
 *
 * createIdP and testIdP require complex validation workflows that are
 * better tested at integration level.
 */

import { Request, Response } from 'express';
import {
    listIdPsHandler,
    getIdPHandler,
    updateIdPHandler,
    deleteIdPHandler,
} from '../controllers/admin.controller';
import { keycloakAdminService } from '../services/keycloak-admin.service';
import { idpApprovalService } from '../services/idp-approval.service';

// Mock logger
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

// Mock admin auth middleware
jest.mock('../middleware/admin-auth.middleware', () => ({
    logAdminAction: jest.fn(),
}));

// Mock all services
jest.mock('../services/keycloak-admin.service');
jest.mock('../services/idp-approval.service');
jest.mock('../services/metrics.service');
jest.mock('../services/idp-validation.service');
jest.mock('../services/saml-metadata-parser.service');
jest.mock('../services/oidc-discovery.service');
jest.mock('../services/mfa-detection.service');
jest.mock('../services/risk-scoring.service');
jest.mock('../services/compliance-validation.service');

describe('Admin Controller - IdP Management', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;

    beforeEach(() => {
        mockReq = {
            headers: { 'x-request-id': 'admin-test-123' },
            params: {},
            body: {},
            user: {
                uniqueID: 'admin-user-123',
                sub: 'admin-sub-123',
                roles: ['super_admin'],
            },
        } as any;

        mockRes = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(),
        } as any;

        jest.clearAllMocks();
    });

    describe('listIdPsHandler - GET /api/admin/idps', () => {
        it('should list all identity providers successfully', async () => {
            const mockIdPs = {
                identityProviders: [
                    { alias: 'usa-idp', providerId: 'oidc', enabled: true },
                    { alias: 'fra-idp', providerId: 'saml', enabled: true },
                ],
                total: 2,
            };

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue(mockIdPs);

            await listIdPsHandler(mockReq as Request, mockRes as Response);

            expect(keycloakAdminService.listIdentityProviders).toHaveBeenCalled();
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: mockIdPs,
                    requestId: 'admin-test-123',
                })
            );
        });

        it('should return empty list when no IdPs exist', async () => {
            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue({
                identityProviders: [],
                total: 0,
            });

            await listIdPsHandler(mockReq as Request, mockRes as Response);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        total: 0,
                    }),
                })
            );
        });

        it('should handle service errors gracefully', async () => {
            (keycloakAdminService.listIdentityProviders as jest.Mock).mockRejectedValue(
                new Error('Keycloak unavailable')
            );

            await listIdPsHandler(mockReq as Request, mockRes as Response);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Failed to retrieve identity providers',
                    message: 'Keycloak unavailable',
                })
            );
        });

        it('should generate requestId when not provided', async () => {
            mockReq.headers = {};

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue({
                identityProviders: [],
                total: 0,
            });

            await listIdPsHandler(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.requestId).toMatch(/^req-\d+$/);
        });

        it('should handle large lists of IdPs', async () => {
            const mockIdPs = {
                identityProviders: Array.from({ length: 50 }, (_, i) => ({
                    alias: `idp-${i}`,
                    providerId: i % 2 === 0 ? 'oidc' : 'saml',
                    enabled: true,
                })),
                total: 50,
            };

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue(mockIdPs);

            await listIdPsHandler(mockReq as Request, mockRes as Response);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        total: 50,
                    }),
                })
            );
        });
    });

    describe('getIdPHandler - GET /api/admin/idps/:alias', () => {
        it('should get IdP by alias successfully', async () => {
            mockReq.params = { alias: 'usa-idp' };

            const mockIdP = {
                alias: 'usa-idp',
                providerId: 'oidc',
                enabled: true,
                config: {
                    clientId: 'dive-v3-client',
                },
            };

            const mockSubmission = {
                alias: 'usa-idp',
                submittedBy: 'admin@example.com',
                submittedAt: '2025-11-20T10:00:00Z',
                useAuth0: false,
            };

            (keycloakAdminService.getIdentityProvider as jest.Mock).mockResolvedValue(mockIdP);
            (idpApprovalService.getSubmissionByAlias as jest.Mock).mockResolvedValue(mockSubmission);

            await getIdPHandler(mockReq as Request, mockRes as Response);

            expect(keycloakAdminService.getIdentityProvider).toHaveBeenCalledWith('usa-idp');
            expect(idpApprovalService.getSubmissionByAlias).toHaveBeenCalledWith('usa-idp');
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        alias: 'usa-idp',
                        protocol: 'oidc', // Normalized from providerId
                        submittedBy: 'admin@example.com',
                    }),
                })
            );
        });

        it('should return 404 when IdP not found', async () => {
            mockReq.params = { alias: 'non-existent-idp' };

            (keycloakAdminService.getIdentityProvider as jest.Mock).mockResolvedValue(null);

            await getIdPHandler(mockReq as Request, mockRes as Response);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Not Found',
                    message: 'Identity provider non-existent-idp not found',
                })
            );
        });

        it('should handle missing submission metadata gracefully', async () => {
            mockReq.params = { alias: 'usa-idp' };

            const mockIdP = {
                alias: 'usa-idp',
                providerId: 'oidc',
                enabled: true,
            };

            (keycloakAdminService.getIdentityProvider as jest.Mock).mockResolvedValue(mockIdP);
            (idpApprovalService.getSubmissionByAlias as jest.Mock).mockResolvedValue(null);

            await getIdPHandler(mockReq as Request, mockRes as Response);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        alias: 'usa-idp',
                        submittedBy: undefined,
                        useAuth0: false,
                    }),
                })
            );
        });

        it('should handle service errors', async () => {
            mockReq.params = { alias: 'usa-idp' };

            (keycloakAdminService.getIdentityProvider as jest.Mock).mockRejectedValue(
                new Error('Database connection failed')
            );

            await getIdPHandler(mockReq as Request, mockRes as Response);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Failed to retrieve identity provider',
                })
            );
        });

        it('should normalize SAML providerId to protocol', async () => {
            mockReq.params = { alias: 'fra-idp' };

            const mockIdP = {
                alias: 'fra-idp',
                providerId: 'saml',
                enabled: true,
            };

            (keycloakAdminService.getIdentityProvider as jest.Mock).mockResolvedValue(mockIdP);
            (idpApprovalService.getSubmissionByAlias as jest.Mock).mockResolvedValue(null);

            await getIdPHandler(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.data.protocol).toBe('saml');
            expect(response.data.providerId).toBe('saml');
        });

        it('should include Auth0 metadata when available', async () => {
            mockReq.params = { alias: 'auth0-idp' };

            const mockIdP = {
                alias: 'auth0-idp',
                providerId: 'oidc',
                enabled: true,
            };

            const mockSubmission = {
                alias: 'auth0-idp',
                submittedBy: 'admin@example.com',
                useAuth0: true,
                auth0ClientId: 'auth0-client-123',
                auth0ClientSecret: 'auth0-secret',
                attributeMappings: {
                    uniqueID: 'sub',
                    clearance: 'custom:clearance',
                },
            };

            (keycloakAdminService.getIdentityProvider as jest.Mock).mockResolvedValue(mockIdP);
            (idpApprovalService.getSubmissionByAlias as jest.Mock).mockResolvedValue(mockSubmission);

            await getIdPHandler(mockReq as Request, mockRes as Response);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.data.useAuth0).toBe(true);
            expect(response.data.auth0ClientId).toBe('auth0-client-123');
            expect(response.data.attributeMappings).toEqual({
                uniqueID: 'sub',
                clearance: 'custom:clearance',
            });
        });
    });

    describe('updateIdPHandler - PUT /api/admin/idps/:alias', () => {
        it('should update existing IdP successfully', async () => {
            mockReq.params = { alias: 'usa-idp' };
            mockReq.body = {
                displayName: 'United States OIDC (Updated)',
                enabled: true,
            };

            const mockUpdatedIdP = {
                alias: 'usa-idp',
                displayName: 'United States OIDC (Updated)',
                enabled: true,
            };

            (keycloakAdminService.updateIdentityProvider as jest.Mock).mockResolvedValue(mockUpdatedIdP);

            await updateIdPHandler(mockReq as Request, mockRes as Response);

            expect(keycloakAdminService.updateIdentityProvider).toHaveBeenCalledWith(
                'usa-idp',
                expect.objectContaining({
                    displayName: 'United States OIDC (Updated)',
                    enabled: true,
                })
            );
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                })
            );
        });

        it('should handle update errors', async () => {
            mockReq.params = { alias: 'non-existent' };
            mockReq.body = { enabled: false };

            (keycloakAdminService.updateIdentityProvider as jest.Mock).mockRejectedValue(
                new Error('Identity provider non-existent not found')
            );

            await updateIdPHandler(mockReq as Request, mockRes as Response);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Failed to update identity provider',
                })
            );
        });

        it('should handle partial updates', async () => {
            mockReq.params = { alias: 'fra-idp' };
            mockReq.body = {
                enabled: false, // Only update enabled flag
            };

            (keycloakAdminService.updateIdentityProvider as jest.Mock).mockResolvedValue(undefined);

            await updateIdPHandler(mockReq as Request, mockRes as Response);

            expect(keycloakAdminService.updateIdentityProvider).toHaveBeenCalledWith(
                'fra-idp',
                expect.objectContaining({
                    enabled: false,
                })
            );
            expect(mockRes.status).toHaveBeenCalledWith(200);
        });

        it('should handle empty update body', async () => {
            mockReq.params = { alias: 'fra-idp' };
            mockReq.body = {};

            (keycloakAdminService.updateIdentityProvider as jest.Mock).mockResolvedValue(undefined);

            await updateIdPHandler(mockReq as Request, mockRes as Response);

            expect(mockRes.status).toHaveBeenCalledWith(200);
        });
    });

    describe('deleteIdPHandler - DELETE /api/admin/idps/:alias', () => {
        it('should delete IdP successfully', async () => {
            mockReq.params = { alias: 'test-idp' };

            (keycloakAdminService.deleteIdentityProvider as jest.Mock).mockResolvedValue(true);

            await deleteIdPHandler(mockReq as Request, mockRes as Response);

            expect(keycloakAdminService.deleteIdentityProvider).toHaveBeenCalledWith('test-idp');
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        message: expect.stringContaining('deleted'),
                    }),
                })
            );
        });

        it('should handle deletion errors', async () => {
            mockReq.params = { alias: 'non-existent' };

            (keycloakAdminService.deleteIdentityProvider as jest.Mock).mockRejectedValue(
                new Error('Identity provider non-existent not found')
            );

            await deleteIdPHandler(mockReq as Request, mockRes as Response);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Failed to delete identity provider',
                })
            );
        });

        it('should handle protected IdP deletion', async () => {
            mockReq.params = { alias: 'protected-idp' };

            (keycloakAdminService.deleteIdentityProvider as jest.Mock).mockRejectedValue(
                new Error('Cannot delete protected IdP')
            );

            await deleteIdPHandler(mockReq as Request, mockRes as Response);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Cannot delete protected IdP',
                })
            );
        });
    });

    describe('Edge Cases', () => {
        it('should handle missing admin user information', async () => {
            mockReq.user = undefined;

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue({
                identityProviders: [],
                total: 0,
            });

            await listIdPsHandler(mockReq as Request, mockRes as Response);

            // Should still work, log 'unknown' admin
            expect(mockRes.status).toHaveBeenCalledWith(200);
        });

        it('should handle very long IdP alias', async () => {
            const longAlias = 'a'.repeat(1000);
            mockReq.params = { alias: longAlias };

            (keycloakAdminService.getIdentityProvider as jest.Mock).mockResolvedValue(null);

            await getIdPHandler(mockReq as Request, mockRes as Response);

            expect(mockRes.status).toHaveBeenCalledWith(404);
        });

        it('should handle special characters in alias', async () => {
            mockReq.params = { alias: 'test@#$%idp' };

            (keycloakAdminService.getIdentityProvider as jest.Mock).mockResolvedValue({
                alias: 'test@#$%idp',
                providerId: 'oidc',
            });
            (idpApprovalService.getSubmissionByAlias as jest.Mock).mockResolvedValue(null);

            await getIdPHandler(mockReq as Request, mockRes as Response);

            expect(mockRes.status).toHaveBeenCalledWith(200);
        });

        it('should handle network timeout errors', async () => {
            (keycloakAdminService.listIdentityProviders as jest.Mock).mockRejectedValue(
                new Error('ETIMEDOUT')
            );

            await listIdPsHandler(mockReq as Request, mockRes as Response);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'ETIMEDOUT',
                })
            );
        });

        it('should handle undefined error messages', async () => {
            const customError: any = new Error();
            customError.message = undefined;

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockRejectedValue(customError);

            await listIdPsHandler(mockReq as Request, mockRes as Response);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Failed to retrieve identity providers',
                    message: undefined, // Message is undefined when error.message is undefined
                })
            );
        });

        it('should handle non-Error exceptions', async () => {
            (keycloakAdminService.listIdentityProviders as jest.Mock).mockRejectedValue('string error');

            await listIdPsHandler(mockReq as Request, mockRes as Response);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Unknown error',
                })
            );
        });
    });
});
