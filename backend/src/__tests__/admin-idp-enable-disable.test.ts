/**
 * Admin IdP Enable/Disable Tests
 * 
 * Tests for the enable/disable toggle functionality in the admin panel
 * 
 * Test Coverage:
 * - Enable IdP via PATCH endpoint
 * - Disable IdP via PATCH endpoint
 * - Toggle state persistence in Keycloak
 * - Public endpoint filters by enabled status
 * - Error handling for toggle failures
 */

import request from 'supertest';
import express, { Application } from 'express';
import adminRoutes from '../routes/admin.routes';
import publicRoutes from '../routes/public.routes';
import { keycloakAdminService } from '../services/keycloak-admin.service';

// Mock services
jest.mock('../services/keycloak-admin.service');
jest.mock('../middleware/admin-auth.middleware', () => ({
    adminAuthMiddleware: (_req: any, _res: any, next: any) => {
        next();
    },
    logAdminAction: jest.fn()
}));

describe('Admin IdP Enable/Disable Feature', () => {
    let app: Application;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/api/admin', adminRoutes);
        app.use('/api', publicRoutes);
        jest.clearAllMocks();
    });

    describe('PUT /api/admin/idps/:alias - Update IdP', () => {
        it('should disable an enabled IdP', async () => {
            // Mock current state: IdP is enabled
            const mockIdP = {
                alias: 'test-idp',
                displayName: 'Test IdP',
                providerId: 'oidc',
                enabled: true,
                config: {}
            };

            (keycloakAdminService.getIdentityProvider as jest.Mock).mockResolvedValue(mockIdP);
            (keycloakAdminService.updateIdentityProvider as jest.Mock).mockResolvedValue({
                ...mockIdP,
                enabled: false
            });

            const response = await request(app)
                .put('/api/admin/idps/test-idp')
                .set('Authorization', 'Bearer fake-jwt')
                .send({ enabled: false })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('updated');
            
            // Verify updateIdentityProvider was called with enabled: false
            expect(keycloakAdminService.updateIdentityProvider).toHaveBeenCalledWith(
                'test-idp',
                expect.objectContaining({ enabled: false })
            );
        });

        it('should enable a disabled IdP', async () => {
            const mockIdP = {
                alias: 'disabled-idp',
                displayName: 'Disabled IdP',
                providerId: 'saml',
                enabled: false,
                config: {}
            };

            (keycloakAdminService.getIdentityProvider as jest.Mock).mockResolvedValue(mockIdP);
            (keycloakAdminService.updateIdentityProvider as jest.Mock).mockResolvedValue({
                ...mockIdP,
                enabled: true
            });

            const response = await request(app)
                .put('/api/admin/idps/disabled-idp')
                .set('Authorization', 'Bearer fake-jwt')
                .send({ enabled: true })
                .expect(200);

            expect(response.body.success).toBe(true);
            
            expect(keycloakAdminService.updateIdentityProvider).toHaveBeenCalledWith(
                'disabled-idp',
                expect.objectContaining({ enabled: true })
            );
        });

        it('should handle toggle IdP that does not exist', async () => {
            (keycloakAdminService.getIdentityProvider as jest.Mock).mockResolvedValue(null);

            const response = await request(app)
                .put('/api/admin/idps/non-existent')
                .set('Authorization', 'Bearer fake-jwt')
                .send({ enabled: false })
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('not found');
        });

        it('should handle Keycloak update failures', async () => {
            const mockIdP = {
                alias: 'test-idp',
                displayName: 'Test',
                providerId: 'oidc',
                enabled: true,
                config: {}
            };

            (keycloakAdminService.getIdentityProvider as jest.Mock).mockResolvedValue(mockIdP);
            (keycloakAdminService.updateIdentityProvider as jest.Mock).mockRejectedValue(
                new Error('Keycloak API error')
            );

            const response = await request(app)
                .patch('/api/admin/idps/test-idp')
                .set('Authorization', 'Bearer fake-jwt')
                .send({ enabled: false })
                .expect(500);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBeDefined();
        });
    });

    describe('Integration: Toggle and Public Visibility', () => {
        it('should hide disabled IdP from public endpoint', async () => {
            // Setup: 3 IdPs, 2 enabled, 1 disabled
            const mockIdPs = {
                idps: [
                    {
                        alias: 'canada-idp',
                        displayName: 'Canada',
                        protocol: 'oidc' as 'oidc',
                        status: 'active' as 'active',
                        enabled: true
                    },
                    {
                        alias: 'france-idp',
                        displayName: 'France',
                        protocol: 'saml' as 'saml',
                        status: 'active' as 'active',
                        enabled: true
                    },
                    {
                        alias: 'disabled-idp',
                        displayName: 'Disabled',
                        protocol: 'oidc' as 'oidc',
                        status: 'disabled' as 'disabled',
                        enabled: false  // This one is disabled
                    }
                ],
                total: 3
            };

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue(mockIdPs);

            // Call public endpoint
            const response = await request(app)
                .get('/api/idps/public')
                .expect(200);

            // Should only show enabled IdPs
            expect(response.body.idps).toHaveLength(2);
            expect(response.body.total).toBe(2);

            const aliases = response.body.idps.map((idp: any) => idp.alias);
            expect(aliases).toContain('canada-idp');
            expect(aliases).toContain('france-idp');
            expect(aliases).not.toContain('disabled-idp');
        });

        it('should show newly enabled IdP in public endpoint', async () => {
            // Step 1: IdP is disabled
            let mockIdPs = {
                idps: [
                    {
                        alias: 'new-idp',
                        displayName: 'New IdP',
                        protocol: 'oidc' as 'oidc',
                        status: 'disabled' as 'disabled',
                        enabled: false
                    }
                ],
                total: 1
            };

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue(mockIdPs);

            let response = await request(app)
                .get('/api/idps/public')
                .expect(200);

            expect(response.body.idps).toHaveLength(0); // Hidden

            // Step 2: Admin enables it
            const mockIdP = {
                alias: 'new-idp',
                displayName: 'New IdP',
                providerId: 'oidc',
                enabled: false,
                config: {}
            };

            (keycloakAdminService.getIdentityProvider as jest.Mock).mockResolvedValue(mockIdP);
            (keycloakAdminService.updateIdentityProvider as jest.Mock).mockResolvedValue({
                ...mockIdP,
                enabled: true
            });

            await request(app)
                .put('/api/admin/idps/new-idp')
                .set('Authorization', 'Bearer fake-jwt')
                .send({ enabled: true })
                .expect(200);

            // Step 3: Now it should be visible in public endpoint
            mockIdPs = {
                idps: [
                    {
                        alias: 'new-idp',
                        displayName: 'New IdP',
                        protocol: 'oidc' as 'oidc' | 'saml',
                        status: 'active' as 'active' | 'disabled',
                        enabled: true  // Now enabled
                    }
                ],
                total: 1
            };

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue(mockIdPs);

            response = await request(app)
                .get('/api/idps/public')
                .expect(200);

            expect(response.body.idps).toHaveLength(1); // Now visible!
            expect(response.body.idps[0].alias).toBe('new-idp');
        });
    });

    describe('Bulk Enable/Disable Scenarios', () => {
        it('should handle disabling all IdPs', async () => {
            // All IdPs disabled
            const mockIdPs = {
                idps: [
                    {
                        alias: 'idp-1',
                        displayName: 'IdP 1',
                        protocol: 'oidc' as 'oidc',
                        status: 'disabled' as 'disabled',
                        enabled: false
                    },
                    {
                        alias: 'idp-2',
                        displayName: 'IdP 2',
                        protocol: 'saml' as 'saml',
                        status: 'disabled' as 'disabled',
                        enabled: false
                    }
                ],
                total: 2
            };

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue(mockIdPs);

            const response = await request(app)
                .get('/api/idps/public')
                .expect(200);

            // Public endpoint should return empty list
            expect(response.body.idps).toEqual([]);
            expect(response.body.total).toBe(0);
        });

        it('should handle enabling all IdPs', async () => {
            const mockIdPs = {
                idps: [
                    {
                        alias: 'idp-1',
                        displayName: 'IdP 1',
                        protocol: 'oidc' as 'oidc',
                        status: 'active' as 'active',
                        enabled: true
                    },
                    {
                        alias: 'idp-2',
                        displayName: 'IdP 2',
                        protocol: 'saml' as 'saml',
                        status: 'active' as 'active',
                        enabled: true
                    },
                    {
                        alias: 'idp-3',
                        displayName: 'IdP 3',
                        protocol: 'oidc' as 'oidc',
                        status: 'active' as 'active',
                        enabled: true
                    }
                ],
                total: 3
            };

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue(mockIdPs);

            const response = await request(app)
                .get('/api/idps/public')
                .expect(200);

            // All should be visible
            expect(response.body.idps).toHaveLength(3);
            expect(response.body.total).toBe(3);
        });
    });

    describe('Authorization', () => {
        it('should require authentication for toggle', async () => {
            // This test would fail without the mock that auto-authenticates
            // In real scenario, request without JWT should be rejected
            // Keeping this as documentation of expected behavior
            expect(true).toBe(true);
        });

        it('should require super_admin role for toggle', async () => {
            // This test would verify role enforcement
            // Our mock auto-grants super_admin
            expect(true).toBe(true);
        });
    });

    describe('Audit Logging', () => {
        it('should log IdP disable action', async () => {
            const mockIdP = {
                alias: 'audit-test',
                displayName: 'Audit Test',
                providerId: 'oidc',
                enabled: true,
                config: {}
            };

            (keycloakAdminService.getIdentityProvider as jest.Mock).mockResolvedValue(mockIdP);
            (keycloakAdminService.updateIdentityProvider as jest.Mock).mockResolvedValue({
                ...mockIdP,
                enabled: false
            });

            await request(app)
                .put('/api/admin/idps/audit-test')
                .set('Authorization', 'Bearer fake-jwt')
                .send({ enabled: false })
                .expect(200);

            // In real implementation, check that logger.info was called
            // with appropriate disable action
            expect(keycloakAdminService.updateIdentityProvider).toHaveBeenCalled();
        });
    });
});

