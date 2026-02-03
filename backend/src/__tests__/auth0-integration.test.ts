/**
 * Auth0 MCP Integration Tests
 *
 * Tests for Auth0 service helper functions
 * Week 3.4.6: Auth0 MCP Server Integration
 */

import { describe, it, expect } from '@jest/globals';
import {
    auth0Service,
    createAuth0Application,
    listAuth0Applications,
    getAuth0Application,
    IAuth0ApplicationConfig
} from '../services/auth0.service';

// Mock logger
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

// Mock environment variables
process.env.AUTH0_DOMAIN = 'test-tenant.auth0.com';
process.env.AUTH0_MCP_ENABLED = 'true';
process.env.KEYCLOAK_URL = 'http://localhost:8080';
process.env.KEYCLOAK_REALM = 'dive-v3-broker';
process.env.FRONTEND_URL = 'http://localhost:3000';

const { logger } = require('../utils/logger');

describe('Auth0 MCP Integration - Service Functions', () => {
    describe('isAuth0Available', () => {
        it('should return true when Auth0 is configured', () => {
            const isAvailable = auth0Service.isAuth0Available();
            expect(isAvailable).toBe(true);
        });

        it('should return false when AUTH0_DOMAIN is not set', () => {
            const originalDomain = process.env.AUTH0_DOMAIN;
            delete process.env.AUTH0_DOMAIN;

            const isAvailable = auth0Service.isAuth0Available();
            expect(isAvailable).toBe(false);

            process.env.AUTH0_DOMAIN = originalDomain;
        });

        it('should return false when AUTH0_MCP_ENABLED is false', () => {
            const originalEnabled = process.env.AUTH0_MCP_ENABLED;
            process.env.AUTH0_MCP_ENABLED = 'false';

            const isAvailable = auth0Service.isAuth0Available();
            expect(isAvailable).toBe(false);

            process.env.AUTH0_MCP_ENABLED = originalEnabled;
        });

        it('should return false when both are missing', () => {
            const originalDomain = process.env.AUTH0_DOMAIN;
            const originalEnabled = process.env.AUTH0_MCP_ENABLED;

            delete process.env.AUTH0_DOMAIN;
            delete process.env.AUTH0_MCP_ENABLED;

            const isAvailable = auth0Service.isAuth0Available();
            expect(isAvailable).toBe(false);

            process.env.AUTH0_DOMAIN = originalDomain;
            process.env.AUTH0_MCP_ENABLED = originalEnabled;
        });
    });

    describe('generateAuth0CallbackUrls', () => {
        it('should generate correct callback URLs for IdP', () => {
            const urls = auth0Service.generateAuth0CallbackUrls('test-idp');

            expect(urls.length).toBe(2);
            expect(urls[0]).toContain('http://localhost:8080/auth/realms/dive-v3-broker/broker/test-idp/endpoint');
            expect(urls[1]).toContain('http://localhost:3000/api/auth/callback');
        });

        it('should include IdP alias in Keycloak callback URL', () => {
            const urls = auth0Service.generateAuth0CallbackUrls('france-idp');

            expect(urls[0]).toContain('/broker/france-idp/endpoint');
        });

        it('should use environment variables for callback URLs', () => {
            const originalKeycloak = process.env.KEYCLOAK_URL;
            const originalFrontend = process.env.FRONTEND_URL;

            process.env.KEYCLOAK_URL = 'https://keycloak.example.com';
            process.env.FRONTEND_URL = 'https://app.example.com';

            const urls = auth0Service.generateAuth0CallbackUrls('prod-idp');

            expect(urls[0]).toContain('keycloak.example.com');
            expect(urls[1]).toContain('app.example.com');

            // Restore
            process.env.KEYCLOAK_URL = originalKeycloak;
            process.env.FRONTEND_URL = originalFrontend;
        });

        it('should use defaults when environment variables missing', () => {
            const originalKeycloak = process.env.KEYCLOAK_URL;
            const originalFrontend = process.env.FRONTEND_URL;

            delete process.env.KEYCLOAK_URL;
            delete process.env.FRONTEND_URL;

            const urls = auth0Service.generateAuth0CallbackUrls('test-idp');

            expect(urls.length).toBe(2);
            expect(urls[0]).toContain('localhost:8080'); // Default Keycloak
            expect(urls[1]).toContain('localhost:3000'); // Default frontend

            // Restore
            process.env.KEYCLOAK_URL = originalKeycloak;
            process.env.FRONTEND_URL = originalFrontend;
        });
    });

    describe('generateAuth0LogoutUrls', () => {
        it('should generate correct logout URLs', () => {
            const urls = auth0Service.generateAuth0LogoutUrls();

            expect(urls.length).toBe(2);
            expect(urls[0]).toContain('http://localhost:8080');
            expect(urls[1]).toContain('http://localhost:3000');
        });

        it('should use environment variables', () => {
            const originalKeycloak = process.env.KEYCLOAK_URL;
            const originalFrontend = process.env.FRONTEND_URL;

            process.env.KEYCLOAK_URL = 'https://keycloak.prod.com';
            process.env.FRONTEND_URL = 'https://app.prod.com';

            const urls = auth0Service.generateAuth0LogoutUrls();

            expect(urls[0]).toBe('https://keycloak.prod.com');
            expect(urls[1]).toBe('https://app.prod.com');

            // Restore
            process.env.KEYCLOAK_URL = originalKeycloak;
            process.env.FRONTEND_URL = originalFrontend;
        });
    });

    describe('Integration Scenarios', () => {
        it('should generate all required URLs for IdP onboarding', () => {
            const idpAlias = 'germany-idp';

            const callbackUrls = auth0Service.generateAuth0CallbackUrls(idpAlias);
            const logoutUrls = auth0Service.generateAuth0LogoutUrls();

            // Verify we have complete URL sets
            expect(callbackUrls.length).toBeGreaterThan(0);
            expect(logoutUrls.length).toBeGreaterThan(0);

            // Verify callback URLs include IdP alias
            expect(callbackUrls.some((url: string) => url.includes(idpAlias))).toBe(true);
        });

        it('should support multiple IdP aliases', () => {
            const urls1 = auth0Service.generateAuth0CallbackUrls('france-idp');
            const urls2 = auth0Service.generateAuth0CallbackUrls('canada-idp');

            expect(urls1[0]).toContain('france-idp');
            expect(urls2[0]).toContain('canada-idp');
            expect(urls1[0]).not.toBe(urls2[0]);
        });
    });

    // ============================================
    // Async Function Tests (MCP Integration)
    // ============================================
    describe('createAuth0Application', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should throw error indicating MCP endpoint requirement', async () => {
            const config: IAuth0ApplicationConfig = {
                name: 'Test Application',
                description: 'Test Description',
                app_type: 'regular_web',
                oidc_conformant: true,
                callbacks: ['http://localhost:3000/callback'],
            };

            await expect(createAuth0Application(config)).rejects.toThrow(
                'Auth0 MCP integration must be called from API endpoint with MCP access'
            );
        });

        it('should log creation attempt before error', async () => {
            const config: IAuth0ApplicationConfig = {
                name: 'Test App',
                app_type: 'spa',
                oidc_conformant: true,
            };

            await expect(createAuth0Application(config)).rejects.toThrow();

            expect(logger.info).toHaveBeenCalledWith(
                'Creating Auth0 application',
                expect.objectContaining({
                    name: 'Test App',
                    app_type: 'spa',
                })
            );
        });

        it('should log error on failure', async () => {
            const config: IAuth0ApplicationConfig = {
                name: 'Test App',
                app_type: 'native',
                oidc_conformant: true,
            };

            await expect(createAuth0Application(config)).rejects.toThrow();

            expect(logger.error).toHaveBeenCalledWith(
                'Auth0 application creation failed',
                expect.objectContaining({
                    config: expect.objectContaining({
                        name: 'Test App',
                        app_type: 'native',
                    }),
                })
            );
        });

        it('should handle all app types', async () => {
            const appTypes: Array<'spa' | 'regular_web' | 'native' | 'non_interactive'> = [
                'spa',
                'regular_web',
                'native',
                'non_interactive',
            ];

            for (const app_type of appTypes) {
                const config: IAuth0ApplicationConfig = {
                    name: `Test ${app_type}`,
                    app_type,
                    oidc_conformant: true,
                };

                await expect(createAuth0Application(config)).rejects.toThrow();
            }
        });

        it('should handle optional config fields', async () => {
            const config: IAuth0ApplicationConfig = {
                name: 'Full Config App',
                description: 'Full configuration',
                app_type: 'regular_web',
                oidc_conformant: true,
                callbacks: ['http://localhost/callback'],
                allowed_logout_urls: ['http://localhost'],
                allowed_origins: ['http://localhost'],
            };

            await expect(createAuth0Application(config)).rejects.toThrow();
        });
    });

    describe('listAuth0Applications', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should return empty list on error', async () => {
            const result = await listAuth0Applications();

            expect(result).toEqual({ applications: [], total: 0 });
        });

        it('should accept default pagination parameters', async () => {
            const result = await listAuth0Applications();

            expect(result.applications).toEqual([]);
            expect(result.total).toBe(0);
        });

        it('should accept custom pagination parameters', async () => {
            const result = await listAuth0Applications(2, 25);

            expect(result).toEqual({ applications: [], total: 0 });
        });

        it('should log list attempt', async () => {
            await listAuth0Applications(1, 10);

            expect(logger.info).toHaveBeenCalledWith(
                'Listing Auth0 applications',
                expect.objectContaining({
                    page: 1,
                    per_page: 10,
                })
            );
        });

        it('should log error on failure', async () => {
            await listAuth0Applications();

            expect(logger.error).toHaveBeenCalledWith(
                'Failed to list Auth0 applications',
                expect.any(Object)
            );
        });

        it('should handle zero page', async () => {
            const result = await listAuth0Applications(0, 50);

            expect(result).toEqual({ applications: [], total: 0 });
        });

        it('should handle large per_page values', async () => {
            const result = await listAuth0Applications(0, 1000);

            expect(result).toEqual({ applications: [], total: 0 });
        });
    });

    describe('getAuth0Application', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should throw error when accessing application', async () => {
            await expect(getAuth0Application('test-client-id')).rejects.toThrow(
                'Auth0 MCP integration must be called from API endpoint with MCP access'
            );
        });

        it('should log get attempt', async () => {
            await expect(getAuth0Application('test-client-id')).rejects.toThrow();

            expect(logger.info).toHaveBeenCalledWith(
                'Getting Auth0 application',
                expect.objectContaining({
                    clientId: 'test-client-id',
                })
            );
        });

        it('should log error on failure', async () => {
            await expect(getAuth0Application('test-client-id')).rejects.toThrow();

            expect(logger.error).toHaveBeenCalledWith(
                'Failed to get Auth0 application',
                expect.objectContaining({
                    clientId: 'test-client-id',
                })
            );
        });

        it('should handle various clientId formats', async () => {
            const clientIds = [
                'abc123',
                'client-with-dashes',
                'CLIENT_WITH_UNDERSCORES',
                '12345678901234567890',
            ];

            for (const clientId of clientIds) {
                await expect(getAuth0Application(clientId)).rejects.toThrow();
            }
        });

        it('should handle empty clientId', async () => {
            await expect(getAuth0Application('')).rejects.toThrow();
        });
    });
});
