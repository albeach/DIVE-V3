/**
 * Auth0 MCP Integration Tests
 * 
 * Tests for Auth0 service helper functions
 * Week 3.4.6: Auth0 MCP Server Integration
 */

import { describe, it, expect } from '@jest/globals';
import { auth0Service } from '../services/auth0.service';

// Mock environment variables
process.env.AUTH0_DOMAIN = 'test-tenant.auth0.com';
process.env.AUTH0_MCP_ENABLED = 'true';
process.env.KEYCLOAK_URL = 'http://localhost:8080';
process.env.KEYCLOAK_REALM = 'dive-v3-pilot';
process.env.FRONTEND_URL = 'http://localhost:3000';

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
            expect(urls[0]).toContain('http://localhost:8080/auth/realms/dive-v3-pilot/broker/test-idp/endpoint');
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
});
