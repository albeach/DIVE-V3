/**
 * Public IdP Endpoint Tests
 * 
 * Tests for the public unauthenticated endpoint that returns enabled IdPs
 * Used by the login page to show available identity providers
 * 
 * Test Coverage:
 * - Returns only enabled IdPs
 * - Filters out disabled IdPs
 * - No authentication required
 * - Proper error handling
 * - Response format validation
 */

import request from 'supertest';
import express, { Application } from 'express';
import publicRoutes from '../routes/public.routes';
import { keycloakAdminService } from '../services/keycloak-admin.service';

// Mock the Keycloak admin service
jest.mock('../services/keycloak-admin.service');

describe('Public IdP Endpoint - GET /api/idps/public', () => {
    let app: Application;

    beforeEach(() => {
        // Setup Express app with public routes
        app = express();
        app.use(express.json());
        app.use('/api', publicRoutes);
        
        // Clear all mocks
        jest.clearAllMocks();
    });

    describe('Success Cases', () => {
        it('should return only enabled IdPs', async () => {
            // Mock listIdentityProviders to return mix of enabled/disabled IdPs
            const mockIdPs = {
                idps: [
                    {
                        alias: 'canada-idp',
                        displayName: 'Canada',
                        protocol: 'oidc' as const,
                        status: 'active' as const,
                        enabled: true
                    },
                    {
                        alias: 'france-idp',
                        displayName: 'France',
                        protocol: 'saml' as const,
                        status: 'active' as const,
                        enabled: true
                    },
                    {
                        alias: 'germany-idp',
                        displayName: 'Germany',
                        protocol: 'oidc' as const,
                        status: 'disabled' as const,
                        enabled: false
                    },
                    {
                        alias: 'industry-idp',
                        displayName: 'Industry Partner',
                        protocol: 'oidc' as const,
                        status: 'active' as const,
                        enabled: true
                    }
                ],
                total: 4
            };

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue(mockIdPs);

            const response = await request(app)
                .get('/api/idps/public')
                .expect(200);

            // Should only return enabled IdPs
            expect(response.body.success).toBe(true);
            expect(response.body.idps).toHaveLength(3); // Only enabled ones
            expect(response.body.total).toBe(3);

            // Verify enabled IdPs are included
            const aliases = response.body.idps.map((idp: any) => idp.alias);
            expect(aliases).toContain('canada-idp');
            expect(aliases).toContain('france-idp');
            expect(aliases).toContain('industry-idp');
            
            // Verify disabled IdP is NOT included
            expect(aliases).not.toContain('germany-idp');
        });

        it('should return correct response format', async () => {
            const mockIdPs = {
                idps: [
                    {
                        alias: 'test-idp',
                        displayName: 'Test IdP',
                        protocol: 'oidc' as const,
                        status: 'active' as const,
                        enabled: true,
                        submittedBy: 'admin@test.com',
                        createdAt: '2025-10-15T12:00:00Z',
                        // Extra fields that should NOT be exposed
                        config: { clientSecret: 'secret123' }
                    }
                ],
                total: 1
            };

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue(mockIdPs);

            const response = await request(app)
                .get('/api/idps/public')
                .expect(200);

            // Verify response structure
            expect(response.body).toHaveProperty('success');
            expect(response.body).toHaveProperty('idps');
            expect(response.body).toHaveProperty('total');

            // Verify IdP object only contains safe fields
            const idp = response.body.idps[0];
            expect(idp).toHaveProperty('alias');
            expect(idp).toHaveProperty('displayName');
            expect(idp).toHaveProperty('protocol');
            expect(idp).toHaveProperty('enabled');
            
            // Verify sensitive fields are NOT exposed
            expect(idp).not.toHaveProperty('submittedBy');
            expect(idp).not.toHaveProperty('createdAt');
            expect(idp).not.toHaveProperty('config');
        });

        it('should handle empty IdP list', async () => {
            const mockIdPs = {
                idps: [],
                total: 0
            };

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue(mockIdPs);

            const response = await request(app)
                .get('/api/idps/public')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.idps).toEqual([]);
            expect(response.body.total).toBe(0);
        });

        it('should handle all IdPs disabled', async () => {
            const mockIdPs = {
                idps: [
                    {
                        alias: 'disabled-1',
                        displayName: 'Disabled 1',
                        protocol: 'oidc' as const,
                        status: 'disabled' as const,
                        enabled: false
                    },
                    {
                        alias: 'disabled-2',
                        displayName: 'Disabled 2',
                        protocol: 'saml' as const,
                        status: 'disabled' as const,
                        enabled: false
                    }
                ],
                total: 2
            };

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue(mockIdPs);

            const response = await request(app)
                .get('/api/idps/public')
                .expect(200);

            // All disabled = empty list
            expect(response.body.success).toBe(true);
            expect(response.body.idps).toEqual([]);
            expect(response.body.total).toBe(0);
        });
    });

    describe('Error Cases', () => {
        it('should handle Keycloak service errors gracefully', async () => {
            // Mock Keycloak error
            (keycloakAdminService.listIdentityProviders as jest.Mock).mockRejectedValue(
                new Error('Keycloak unreachable')
            );

            const response = await request(app)
                .get('/api/idps/public')
                .expect(500);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Failed to retrieve identity providers');
            expect(response.body.message).toBe('Keycloak unreachable');
            
            // Should return empty array for fallback
            expect(response.body.idps).toEqual([]);
            expect(response.body.total).toBe(0);
        });

        it('should handle network timeouts', async () => {
            (keycloakAdminService.listIdentityProviders as jest.Mock).mockRejectedValue(
                new Error('Request timeout')
            );

            const response = await request(app)
                .get('/api/idps/public')
                .expect(500);

            expect(response.body.success).toBe(false);
            expect(response.body.idps).toEqual([]);
        });

        it('should handle malformed Keycloak responses', async () => {
            // Mock malformed response
            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue({
                // Missing 'idps' field
                total: 5
            });

            const response = await request(app)
                .get('/api/idps/public')
                .expect(500);

            expect(response.body.success).toBe(false);
        });
    });

    describe('Security', () => {
        it('should not require authentication', async () => {
            const mockIdPs = {
                idps: [
                    {
                        alias: 'test-idp',
                        displayName: 'Test',
                        protocol: 'oidc' as const,
                        status: 'active' as const,
                        enabled: true
                    }
                ],
                total: 1
            };

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue(mockIdPs);

            // Request without any authentication headers
            const response = await request(app)
                .get('/api/idps/public')
                .expect(200);

            expect(response.body.success).toBe(true);
        });

        it('should not expose sensitive IdP configuration', async () => {
            const mockIdPs = {
                idps: [
                    {
                        alias: 'test-idp',
                        displayName: 'Test IdP',
                        protocol: 'oidc' as const,
                        status: 'active' as const,
                        enabled: true,
                        // Sensitive fields that should be filtered
                        config: {
                            clientId: 'client-123',
                            clientSecret: 'super-secret-key',
                            issuer: 'https://idp.example.com'
                        },
                        submittedBy: 'admin@example.com',
                        createdAt: '2025-10-15T12:00:00Z'
                    }
                ],
                total: 1
            };

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue(mockIdPs);

            const response = await request(app)
                .get('/api/idps/public')
                .expect(200);

            const idp = response.body.idps[0];
            
            // Only safe fields should be present
            expect(Object.keys(idp)).toEqual([
                'alias',
                'displayName',
                'protocol',
                'enabled'
            ]);
        });
    });

    describe('Protocol Consistency', () => {
        it('should return protocol field (not providerId)', async () => {
            const mockIdPs = {
                idps: [
                    {
                        alias: 'oidc-idp',
                        displayName: 'OIDC Provider',
                        protocol: 'oidc' as const,
                        status: 'active' as const,
                        enabled: true
                    },
                    {
                        alias: 'saml-idp',
                        displayName: 'SAML Provider',
                        protocol: 'saml' as const,
                        status: 'active' as const,
                        enabled: true
                    }
                ],
                total: 2
            };

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue(mockIdPs);

            const response = await request(app)
                .get('/api/idps/public')
                .expect(200);

            // Verify both IdPs have 'protocol' field
            response.body.idps.forEach((idp: any) => {
                expect(idp).toHaveProperty('protocol');
                expect(['oidc', 'saml']).toContain(idp.protocol);
                
                // Should NOT have 'providerId' field
                expect(idp).not.toHaveProperty('providerId');
            });
        });
    });

    describe('Performance', () => {
        it('should handle large number of IdPs efficiently', async () => {
            // Create 50 IdPs (25 enabled, 25 disabled)
            const mockIdPs = {
                idps: Array.from({ length: 50 }, (_, i) => {
                    const protocol = (i % 2 === 0 ? 'oidc' : 'saml') as 'oidc' | 'saml';
                    const status = (i < 25 ? 'active' : 'disabled') as 'active' | 'disabled';
                    return {
                        alias: `idp-${i}`,
                        displayName: `IdP ${i}`,
                        protocol,
                        status,
                        enabled: i < 25
                    };
                }),
                total: 50
            };

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue(mockIdPs);

            const startTime = Date.now();
            const response = await request(app)
                .get('/api/idps/public')
                .expect(200);
            const duration = Date.now() - startTime;

            // Should complete in under 1 second
            expect(duration).toBeLessThan(1000);
            
            // Should filter correctly
            expect(response.body.idps).toHaveLength(25);
            expect(response.body.total).toBe(25);
        });
    });

    describe('Content-Type', () => {
        it('should return JSON content type', async () => {
            const mockIdPs = {
                idps: [],
                total: 0
            };

            (keycloakAdminService.listIdentityProviders as jest.Mock).mockResolvedValue(mockIdPs);

            const response = await request(app)
                .get('/api/idps/public')
                .expect(200)
                .expect('Content-Type', /json/);

            expect(response.body).toBeDefined();
        });
    });
});

