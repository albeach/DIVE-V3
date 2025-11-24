/**
 * Auth0 Service
 * 
 * Wrapper for Auth0 MCP Server integration
 * Handles Auth0 application creation and management for IdP onboarding
 * 
 * Week 3.4.6: Auth0 MCP Integration
 */

import { logger } from '../utils/logger';

/**
 * Auth0 Application Configuration
 */
export interface IAuth0ApplicationConfig {
    name: string;
    description?: string;
    app_type: 'spa' | 'regular_web' | 'native' | 'non_interactive';
    oidc_conformant: boolean;
    callbacks?: string[];
    allowed_logout_urls?: string[];
    allowed_origins?: string[];
}

/**
 * Auth0 Application Response
 */
export interface IAuth0ApplicationResponse {
    clientId: string;
    clientSecret: string;
    domain: string;
    success: boolean;
}

/**
 * Create Auth0 Application via MCP Server
 * 
 * This function uses the Auth0 MCP Server to create a new application
 * and returns the client credentials for use in Keycloak IdP configuration.
 * 
 * @param config - Auth0 application configuration
 * @returns Promise<IAuth0ApplicationResponse>
 */
export async function createAuth0Application(
    config: IAuth0ApplicationConfig
): Promise<IAuth0ApplicationResponse> {
    const requestId = `auth0-create-${Date.now()}`;

    try {
        logger.info('Creating Auth0 application', {
            requestId,
            name: config.name,
            app_type: config.app_type
        });

        // NOTE: In a real implementation, this would call the Auth0 MCP Server
        // Since we don't have direct MCP tool imports in backend services,
        // this will be handled via the backend API endpoint that has access to MCP tools

        // For now, this is a placeholder that would be called from the controller
        // The actual MCP call will happen in the admin controller

        throw new Error('Auth0 MCP integration must be called from API endpoint with MCP access');

    } catch (error) {
        logger.error('Auth0 application creation failed', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
            config: { name: config.name, app_type: config.app_type }
        });

        throw new Error(`Auth0 integration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * List Auth0 Applications
 * 
 * @param page - Page number (0-based)
 * @param per_page - Number of applications per page
 * @returns Promise with applications list
 */
export async function listAuth0Applications(
    page: number = 0,
    per_page: number = 50
): Promise<any> {
    const requestId = `auth0-list-${Date.now()}`;

    try {
        logger.info('Listing Auth0 applications', {
            requestId,
            page,
            per_page
        });

        // This will be implemented via MCP tools in the controller
        throw new Error('Auth0 MCP integration must be called from API endpoint with MCP access');

    } catch (error) {
        logger.error('Failed to list Auth0 applications', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        return { applications: [], total: 0 };
    }
}

/**
 * Get Auth0 Application by Client ID
 * 
 * @param clientId - Client ID of the application
 * @returns Promise with application details
 */
export async function getAuth0Application(clientId: string): Promise<any> {
    const requestId = `auth0-get-${Date.now()}`;

    try {
        logger.info('Getting Auth0 application', {
            requestId,
            clientId
        });

        // This will be implemented via MCP tools in the controller
        throw new Error('Auth0 MCP integration must be called from API endpoint with MCP access');

    } catch (error) {
        logger.error('Failed to get Auth0 application', {
            requestId,
            clientId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        throw error;
    }
}

/**
 * Validate Auth0 Configuration
 * 
 * Checks if Auth0 is properly configured and available
 * 
 * @returns boolean - True if Auth0 is available
 */
export function isAuth0Available(): boolean {
    const auth0Domain = process.env.AUTH0_DOMAIN;
    const auth0Enabled = process.env.AUTH0_MCP_ENABLED === 'true';

    return !!(auth0Domain && auth0Enabled);
}

/**
 * Generate Auth0 Callback URLs for Keycloak
 * 
 * @param idpAlias - Keycloak IdP alias
 * @returns Array of callback URLs
 */
export function generateAuth0CallbackUrls(idpAlias: string): string[] {
    const keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8080';
    const realm = process.env.KEYCLOAK_REALM || 'dive-v3-broker';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    return [
        `${keycloakUrl}/auth/realms/${realm}/broker/${idpAlias}/endpoint`,
        `${frontendUrl}/api/auth/callback`
    ];
}

/**
 * Generate Auth0 Logout URLs
 * 
 * @returns Array of logout URLs
 */
export function generateAuth0LogoutUrls(): string[] {
    const keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8080';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    return [
        keycloakUrl,
        frontendUrl
    ];
}

export const auth0Service = {
    createAuth0Application,
    listAuth0Applications,
    getAuth0Application,
    isAuth0Available,
    generateAuth0CallbackUrls,
    generateAuth0LogoutUrls
};

