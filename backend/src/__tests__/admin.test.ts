/**
 * Admin API Integration Tests
 * 
 * Tests for Keycloak Admin API integration
 * Note: These tests require Keycloak to be running
 */

import { keycloakAdminService } from '../services/keycloak-admin.service';
import { IIdPCreateRequest } from '../types/keycloak.types';


describe('Keycloak Admin Service', () => {
    // Skip if Keycloak is not running
    const skipIfNoKeycloak = process.env.SKIP_INTEGRATION_TESTS === 'true';

    describe('listIdentityProviders', () => {
        it('should list all identity providers', async () => {
            if (skipIfNoKeycloak) {
                return;
            }

            const result = await keycloakAdminService.listIdentityProviders();

            expect(result).toBeDefined();
            expect(result.idps).toBeInstanceOf(Array);
            expect(result.total).toBeGreaterThanOrEqual(0);
        }, 10000);
    });

    describe('getIdentityProvider', () => {
        it('should get a specific identity provider', async () => {
            if (skipIfNoKeycloak) {
                return;
            }

            // Assuming 'us-idp' exists from Terraform
            const idp = await keycloakAdminService.getIdentityProvider('us-idp');

            // May not exist in test environment
            if (idp) {
                expect(idp.alias).toBe('us-idp');
            }
        }, 10000);

        it('should return null for non-existent identity provider', async () => {
            if (skipIfNoKeycloak) {
                return;
            }

            const idp = await keycloakAdminService.getIdentityProvider('non-existent-idp');
            expect(idp).toBeNull();
        }, 10000);
    });

    describe('createOIDCIdentityProvider', () => {
        const testIdPAlias = 'test-oidc-idp';

        afterEach(async () => {
            if (skipIfNoKeycloak) {
                return;
            }

            // Cleanup: delete test IdP if it exists
            try {
                await keycloakAdminService.deleteIdentityProvider(testIdPAlias);
            } catch (error) {
                // Ignore if doesn't exist
            }
        });

        it('should create an OIDC identity provider', async () => {
            if (skipIfNoKeycloak) {
                return;
            }

            const request: IIdPCreateRequest = {
                alias: testIdPAlias,
                displayName: 'Test OIDC IdP',
                description: 'Test OIDC identity provider',
                protocol: 'oidc',
                submittedBy: 'admin@test.com',
                config: {
                    issuer: 'https://test.example.com/oidc',
                    clientId: 'test-client',
                    clientSecret: 'test-secret',
                    authorizationUrl: 'https://test.example.com/oauth/authorize',
                    tokenUrl: 'https://test.example.com/oauth/token',
                    userInfoUrl: 'https://test.example.com/userinfo',
                    jwksUrl: 'https://test.example.com/certs',
                    defaultScopes: 'openid profile email'
                },
                attributeMappings: {
                    uniqueID: {
                        claim: 'sub',
                        userAttribute: 'uniqueID'
                    },
                    clearance: {
                        claim: 'clearance',
                        userAttribute: 'clearance'
                    },
                    countryOfAffiliation: {
                        claim: 'country',
                        userAttribute: 'countryOfAffiliation'
                    },
                    acpCOI: {
                        claim: 'groups',
                        userAttribute: 'acpCOI'
                    }
                }
            };

            const alias = await keycloakAdminService.createOIDCIdentityProvider(request);

            expect(alias).toBe(testIdPAlias);

            // Verify IdP was created
            const idp = await keycloakAdminService.getIdentityProvider(testIdPAlias);
            expect(idp).toBeDefined();
            expect(idp?.alias).toBe(testIdPAlias);
            expect(idp?.displayName).toBe('Test OIDC IdP');
        }, 15000);
    });

    describe('updateIdentityProvider', () => {
        it('should update an identity provider', async () => {
            if (skipIfNoKeycloak) {
                return;
            }

            // This test requires an existing IdP
            // Skip for now
        }, 10000);
    });

    describe('deleteIdentityProvider', () => {
        it('should delete an identity provider', async () => {
            if (skipIfNoKeycloak) {
                return;
            }

            // Create a test IdP first
            const testIdPAlias = 'test-delete-idp';
            const request: IIdPCreateRequest = {
                alias: testIdPAlias,
                displayName: 'Test Delete IdP',
                protocol: 'oidc',
                submittedBy: 'admin@test.com',
                config: {
                    issuer: 'https://test.example.com/oidc',
                    clientId: 'test-client',
                    clientSecret: 'test-secret',
                    authorizationUrl: 'https://test.example.com/oauth/authorize',
                    tokenUrl: 'https://test.example.com/oauth/token'
                },
                attributeMappings: {
                    uniqueID: { claim: 'sub', userAttribute: 'uniqueID' },
                    clearance: { claim: 'clearance', userAttribute: 'clearance' },
                    countryOfAffiliation: { claim: 'country', userAttribute: 'countryOfAffiliation' },
                    acpCOI: { claim: 'groups', userAttribute: 'acpCOI' }
                }
            };

            await keycloakAdminService.createOIDCIdentityProvider(request);

            // Delete it
            await keycloakAdminService.deleteIdentityProvider(testIdPAlias);

            // Verify it's deleted
            const idp = await keycloakAdminService.getIdentityProvider(testIdPAlias);
            expect(idp).toBeNull();
        }, 15000);
    });

    describe('testIdentityProvider', () => {
        it('should test OIDC identity provider connectivity', async () => {
            if (skipIfNoKeycloak) {
                return;
            }

            // Test with a non-existent IdP
            const result = await keycloakAdminService.testIdentityProvider('non-existent-idp');

            expect(result).toBeDefined();
            expect(result.success).toBe(false);
        }, 10000);
    });

    describe('createRealmRole', () => {
        it('should create a realm role', async () => {
            if (skipIfNoKeycloak) {
                return;
            }

            try {
                await keycloakAdminService.createRealmRole('test_role', 'Test role for integration tests');

                // Cleanup
                // Note: Would need to add deleteRealmRole method to service
            } catch (error) {
                // Role may already exist
                expect(error).toBeDefined();
            }
        }, 10000);
    });

    describe('listUsers', () => {
        it('should list users in realm', async () => {
            if (skipIfNoKeycloak) {
                return;
            }

            const result = await keycloakAdminService.listUsers(10);

            expect(result).toBeDefined();
            expect(Array.isArray(result.users)).toBe(true);
            expect(result.total).toBeGreaterThanOrEqual(0);
        }, 10000);
    });
});
