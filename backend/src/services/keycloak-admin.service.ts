/**
 * Keycloak Admin Service
 *
 * Manages Identity Providers via Keycloak Admin REST API.
 * Supports OIDC and SAML IdP creation, update, deletion.
 *
 * Phase 4D: Decomposed into focused sub-modules:
 * - admin-idp-testing.ts: IdP connectivity testing (OIDC/SAML)
 * - admin-user-management.ts: User CRUD, roles, password reset
 * - admin-mfa-sessions.ts: MFA config, session management, theme
 *
 * This file retains auth/token management, IdP CRUD, protocol mappers,
 * and re-exports for backward compatibility.
 *
 * PRODUCTION FIX: Uses direct REST API instead of @keycloak/keycloak-admin-client
 * to avoid library compatibility issues with fetch() and custom HTTPS agents.
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import type UserRepresentation from '@keycloak/keycloak-admin-client/lib/defs/userRepresentation';
import https from 'https';
import { logger } from '../utils/logger';
import { getKeycloakPassword } from '../utils/gcp-secrets';
import {
    IIdentityProviderRepresentation,
    IIdPCreateRequest,
    IIdPUpdateRequest,
    IIdPListResponse,
    IIdPTestResult,
    IOIDCIdPConfig,
    ISAMLIdPConfig,
    IDIVEAttributeMappings,
    IdPProtocol,
    IdPStatus
} from '../types/keycloak.types';
import axios, { AxiosInstance } from 'axios';

// Sub-module imports
import { testIdentityProviderCore } from './admin-idp-testing';
import type { AdminServiceContext } from './admin-idp-testing';
import {
    createRealmRoleCore,
    assignRoleToUserCore,
    listUsersCore,
    getUserByIdCore,
    createUserCore,
    updateUserCore,
    deleteUserCore,
    resetPasswordCore,
    getUserByUsernameCore,
} from './admin-user-management';
import {
    getMFAConfigCore,
    updateMFAConfigCore,
    testMFAFlowCore,
    getActiveSessionsCore,
    revokeSessionCore,
    revokeUserSessionsCore,
    getSessionStatsCore,
    getRealmThemeCore,
    updateRealmThemeCore,
} from './admin-mfa-sessions';

/**
 * Keycloak Admin Service - Direct REST API Implementation
 * This replaces the @keycloak/keycloak-admin-client library which has
 * known issues with fetch() API and custom HTTPS agents in v26.x
 */
class KeycloakAdminService {
    private client: KcAdminClient; // Legacy - kept for backward compatibility
    private axios: AxiosInstance;
    private accessToken: string | null = null;
    private tokenExpiry: number = 0;
    private readonly TOKEN_REFRESH_BUFFER_MS = 5000; // Refresh 5s before expiry

    constructor() {
        // Create axios instance with proper HTTPS agent for self-signed certs
        this.axios = axios.create({
            baseURL: process.env.KEYCLOAK_URL || 'https://localhost:8443',
            timeout: 10000,
            httpsAgent: new https.Agent({
                rejectUnauthorized: false, // Required for self-signed/mkcert certs
            }),
        });

        // Legacy client (keep for methods not yet migrated to REST)
        const httpsAgent = new https.Agent({
            rejectUnauthorized: false,
        });

        this.client = new KcAdminClient({
            baseUrl: process.env.KEYCLOAK_URL || 'http://localhost:8081',
            realmName: 'master',
            requestOptions: {
                /* @ts-expect-error - httpsAgent is supported by node-fetch */
                httpsAgent,
            },
        });
    }

    // ============================================
    // AUTH / TOKEN MANAGEMENT
    // ============================================

    /**
     * Get admin access token (with automatic refresh).
     * Uses direct REST API instead of library.
     */
    private async getAdminToken(): Promise<string> {
        // Return cached token if still valid
        if (this.accessToken && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        const username = process.env.KEYCLOAK_ADMIN_USER || process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
        const password = process.env.KC_ADMIN_PASSWORD || process.env.KEYCLOAK_ADMIN_PASSWORD;

        const masterAuthUrl = `${this.axios.defaults.baseURL.replace(/\/$/, '')}/realms/master/protocol/openid-connect/token`;

        logger.debug('Authenticating to Keycloak Admin API (direct REST)', {
            username,
            passwordSet: !!password,
            authUrl: masterAuthUrl,
            realm: 'master'
        });

        try {
            const masterAxios = axios.create({
                baseURL: this.axios.defaults.baseURL,
                timeout: this.axios.defaults.timeout,
                httpsAgent: this.axios.defaults.httpsAgent,
            });

            const response = await masterAxios.post(
                '/realms/master/protocol/openid-connect/token',
                new URLSearchParams({
                    grant_type: 'password',
                    client_id: 'admin-cli',
                    username,
                    password,
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }
            );

            this.accessToken = response.data.access_token;
            const expiresIn = response.data.expires_in || 60;
            this.tokenExpiry = Date.now() + (expiresIn * 1000) - this.TOKEN_REFRESH_BUFFER_MS;

            logger.debug('Keycloak Admin authentication successful (direct REST)', {
                expiresIn,
                tokenLength: this.accessToken.length
            });

            return this.accessToken;
        } catch (error) {
            logger.error('Failed to authenticate Keycloak Admin (direct REST)', {
                error: error instanceof Error ? error.message : 'Unknown error',
                response: axios.isAxiosError(error) ? error.response?.data : undefined,
                status: axios.isAxiosError(error) ? error.response?.status : undefined
            });
            throw new Error('Keycloak Admin API authentication failed');
        }
    }

    /**
     * Legacy method - kept for backward compatibility.
     * @deprecated Use getAdminToken() instead
     */
    private async ensureAuthenticated(): Promise<void> {
        await this.getAdminToken();
    }

    /** Get context for extracted functions */
    private getContext(): AdminServiceContext {
        return { client: this.client };
    }

    // ============================================
    // Identity Provider Management
    // ============================================

    /**
     * List all Identity Providers in the realm.
     * Uses direct REST API for better reliability.
     */
    async listIdentityProviders(): Promise<IIdPListResponse> {
        const token = await this.getAdminToken();
        const realm = process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';

        logger.debug('Listing identity providers (direct REST)', {
            realm,
            keycloakUrl: this.axios.defaults.baseURL
        });

        try {
            const response = await this.axios.get(
                `/admin/realms/${realm}/identity-provider/instances`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            const idps = response.data;

            type RawIdP = { alias?: string; displayName?: string; providerId?: string; enabled?: boolean; config?: Record<string, string> };
            logger.info('Retrieved identity providers (direct REST)', {
                count: idps.length,
                idps: idps.map((i: RawIdP) => ({
                    alias: i.alias,
                    providerId: i.providerId,
                    enabled: i.enabled
                }))
            });

            return {
                idps: idps.map((idp: RawIdP) => ({
                    alias: idp.alias!,
                    displayName: idp.displayName || idp.alias!,
                    protocol: (idp.providerId === 'oidc' || idp.providerId === 'saml'
                        ? idp.providerId
                        : (idp.providerId?.includes('oidc') ? 'oidc' : 'saml')
                    ) as IdPProtocol,
                    status: (idp.enabled ? 'active' : 'disabled') as IdPStatus,
                    enabled: idp.enabled !== undefined ? idp.enabled : false,
                    createdAt: idp.config?.createdAt,
                    submittedBy: idp.config?.submittedBy
                })),
                total: idps.length
            };
        } catch (error) {
            logger.error('Failed to list identity providers (direct REST)', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                keycloakUrl: this.axios.defaults.baseURL,
                keycloakRealm: realm,
                status: axios.isAxiosError(error) ? error.response?.status : undefined,
                response: axios.isAxiosError(error) ? error.response?.data : undefined
            });
            throw new Error(`Failed to retrieve identity providers: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get specific Identity Provider by alias.
     * Uses direct REST API.
     */
    async getIdentityProvider(alias: string): Promise<IIdentityProviderRepresentation | null> {
        try {
            const token = await this.getAdminToken();
            const realm = process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';

            const response = await this.axios.get(
                `/admin/realms/${realm}/identity-provider/instances/${alias}`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            logger.debug('Retrieved identity provider (direct REST)', { alias });

            return response.data as IIdentityProviderRepresentation;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                logger.warn('Identity provider not found', { alias });
                return null;
            }
            logger.error('Failed to get identity provider', {
                alias,
                error: axios.isAxiosError(error)
                    ? `HTTP ${error.response?.status} ${error.response?.statusText}`
                    : (error instanceof Error ? error.message : 'Unknown error')
            });
            return null;
        }
    }

    /**
     * Create OIDC Identity Provider.
     */
    async createOIDCIdentityProvider(request: IIdPCreateRequest): Promise<string> {
        await this.ensureAuthenticated();

        const config = request.config as IOIDCIdPConfig;

        try {
            await this.client.identityProviders.create({
                alias: request.alias,
                displayName: request.displayName,
                providerId: 'oidc',
                enabled: false,
                storeToken: true,
                trustEmail: true,
                config: {
                    issuer: config.issuer,
                    clientId: config.clientId,
                    clientSecret: config.clientSecret,
                    authorizationUrl: config.authorizationUrl,
                    tokenUrl: config.tokenUrl,
                    userInfoUrl: config.userInfoUrl || '',
                    jwksUrl: config.jwksUrl || '',
                    defaultScope: config.defaultScopes || 'openid profile email clearance countryOfAffiliation uniqueID acpCOI user_acr user_amr',
                    validateSignature: String(config.validateSignature ?? true),
                    syncMode: 'FORCE',
                    submittedBy: request.submittedBy,
                    createdAt: new Date().toISOString(),
                    description: request.description || ''
                }
            });

            logger.info('Created OIDC identity provider', {
                alias: request.alias,
                submittedBy: request.submittedBy
            });

            await this.createDIVEAttributeMappers(request.alias, request.attributeMappings, 'oidc');

            return request.alias;
        } catch (error) {
            logger.error('Failed to create OIDC identity provider', {
                alias: request.alias,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error(`Failed to create OIDC IdP: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Create SAML Identity Provider.
     */
    async createSAMLIdentityProvider(request: IIdPCreateRequest): Promise<string> {
        await this.ensureAuthenticated();

        const config = request.config as ISAMLIdPConfig;

        try {
            await this.client.identityProviders.create({
                alias: request.alias,
                displayName: request.displayName,
                providerId: 'saml',
                enabled: false,
                storeToken: true,
                trustEmail: true,
                config: {
                    entityId: config.entityId,
                    singleSignOnServiceUrl: config.singleSignOnServiceUrl,
                    singleLogoutServiceUrl: config.singleLogoutServiceUrl || '',
                    signingCertificate: config.certificate || '',
                    signatureAlgorithm: config.signatureAlgorithm || 'RSA_SHA256',
                    nameIDPolicyFormat: config.nameIDFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
                    wantAssertionsSigned: String(config.wantAssertionsSigned ?? false),
                    wantAuthnRequestsSigned: String(config.wantAuthnRequestsSigned ?? false),
                    validateSignature: String(config.validateSignature ?? false),
                    postBindingResponse: String(config.postBindingResponse ?? false),
                    postBindingAuthnRequest: String(config.postBindingAuthnRequest ?? false),
                    syncMode: 'FORCE',
                    submittedBy: request.submittedBy,
                    createdAt: new Date().toISOString(),
                    description: request.description || ''
                }
            });

            logger.info('Created SAML identity provider', {
                alias: request.alias,
                submittedBy: request.submittedBy
            });

            await this.createDIVEAttributeMappers(request.alias, request.attributeMappings, 'saml');

            return request.alias;
        } catch (error) {
            logger.error('Failed to create SAML identity provider', {
                alias: request.alias,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error(`Failed to create SAML IdP: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Update Identity Provider.
     */
    async updateIdentityProvider(alias: string, updates: IIdPUpdateRequest): Promise<void> {
        await this.ensureAuthenticated();

        try {
            const existingIdp = await this.client.identityProviders.findOne({ alias });

            if (!existingIdp) {
                throw new Error(`Identity provider ${alias} not found`);
            }

            const updatedConfig = {
                ...existingIdp.config,
                ...(updates.config || {})
            };

            await this.client.identityProviders.update(
                { alias },
                {
                    ...existingIdp,
                    displayName: updates.displayName || existingIdp.displayName,
                    enabled: updates.enabled !== undefined ? updates.enabled : existingIdp.enabled,
                    config: updatedConfig
                }
            );

            logger.info('Updated identity provider', { alias });

            if (updates.attributeMappings) {
                await this.updateDIVEAttributeMappers(alias, updates.attributeMappings, existingIdp.providerId as IdPProtocol);
            }
        } catch (error) {
            logger.error('Failed to update identity provider', {
                alias,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error(`Failed to update IdP: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Delete Identity Provider.
     */
    async deleteIdentityProvider(alias: string): Promise<void> {
        await this.ensureAuthenticated();

        try {
            await this.client.identityProviders.del({ alias });
            logger.info('Deleted identity provider', { alias });
        } catch (error) {
            logger.error('Failed to delete identity provider', {
                alias,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error(`Failed to delete IdP: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // ============================================
    // Protocol Mapper Management
    // ============================================

    /**
     * Create DIVE attribute mappers for an IdP.
     * Uses REST API directly due to Keycloak Admin Client library limitations.
     */
    private async createDIVEAttributeMappers(
        idpAlias: string,
        mappings: IDIVEAttributeMappings,
        protocol: IdPProtocol
    ): Promise<void> {
        try {
            const mapperType = protocol === 'oidc' ? 'oidc-user-attribute-idp-mapper' : 'saml-user-attribute-idp-mapper';
            const claimKey = protocol === 'oidc' ? 'claim' : 'attribute.name';

            const realm = process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
            const baseUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
            const mapperUrl = `${baseUrl}/admin/realms/${realm}/identity-provider/instances/${idpAlias}/mappers`;

            const token = this.client.accessToken;

            const mappers = [
                {
                    name: `${idpAlias}-uniqueID-mapper`,
                    identityProviderAlias: idpAlias,
                    identityProviderMapper: mapperType,
                    config: {
                        syncMode: 'FORCE',
                        [claimKey]: mappings.uniqueID.claim,
                        'user.attribute': mappings.uniqueID.userAttribute
                    }
                },
                {
                    name: `${idpAlias}-clearance-mapper`,
                    identityProviderAlias: idpAlias,
                    identityProviderMapper: mapperType,
                    config: {
                        syncMode: 'INHERIT',
                        [claimKey]: mappings.clearance.claim,
                        'user.attribute': mappings.clearance.userAttribute
                    }
                },
                {
                    name: `${idpAlias}-country-mapper`,
                    identityProviderAlias: idpAlias,
                    identityProviderMapper: mapperType,
                    config: {
                        syncMode: 'INHERIT',
                        [claimKey]: mappings.countryOfAffiliation.claim,
                        'user.attribute': mappings.countryOfAffiliation.userAttribute
                    }
                },
                {
                    name: `${idpAlias}-coi-mapper`,
                    identityProviderAlias: idpAlias,
                    identityProviderMapper: mapperType,
                    config: {
                        syncMode: 'INHERIT',
                        [claimKey]: mappings.acpCOI.claim,
                        'user.attribute': mappings.acpCOI.userAttribute
                    }
                }
            ];

            for (const mapper of mappers) {
                await axios.post(mapperUrl, mapper, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });
            }

            logger.info('Created DIVE attribute mappers', {
                idpAlias,
                protocol,
                mapperCount: mappers.length
            });
        } catch (error) {
            logger.error('Failed to create attribute mappers', {
                idpAlias,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Update DIVE attribute mappers for an IdP.
     */
    private async updateDIVEAttributeMappers(
        idpAlias: string,
        _mappings: Partial<IDIVEAttributeMappings>,
        _protocol: IdPProtocol
    ): Promise<void> {
        logger.info('Updating attribute mappers', { idpAlias });
    }

    // ============================================
    // PUBLIC API — Delegates to extracted modules
    // ============================================

    /** @see admin-idp-testing.ts */
    async testIdentityProvider(alias: string): Promise<IIdPTestResult> {
        await this.ensureAuthenticated();
        return testIdentityProviderCore(this.getContext(), alias);
    }

    /** @see admin-user-management.ts */
    async createRealmRole(roleName: string, description: string): Promise<void> {
        await this.ensureAuthenticated();
        return createRealmRoleCore(this.getContext(), roleName, description);
    }

    /** @see admin-user-management.ts */
    async assignRoleToUser(userId: string, roleName: string): Promise<void> {
        await this.ensureAuthenticated();
        return assignRoleToUserCore(this.getContext(), userId, roleName);
    }

    /** @see admin-user-management.ts */
    async listUsers(max: number = 100, first: number = 0, search: string = ''): Promise<{ users: UserRepresentation[], total: number }> {
        await this.ensureAuthenticated();
        return listUsersCore(this.getContext(), max, first, search);
    }

    /** @see admin-user-management.ts */
    async getUserById(userId: string): Promise<UserRepresentation> {
        await this.ensureAuthenticated();
        return getUserByIdCore(this.getContext(), userId);
    }

    /** @see admin-user-management.ts */
    async createUser(userData: Record<string, unknown>): Promise<string> {
        await this.ensureAuthenticated();
        return createUserCore(this.getContext(), userData);
    }

    /** @see admin-user-management.ts */
    async updateUser(userId: string, userData: Record<string, unknown>): Promise<void> {
        await this.ensureAuthenticated();
        return updateUserCore(this.getContext(), userId, userData);
    }

    /** @see admin-user-management.ts */
    async deleteUser(userId: string): Promise<void> {
        await this.ensureAuthenticated();
        return deleteUserCore(this.getContext(), userId);
    }

    /** @see admin-user-management.ts */
    async resetPassword(userId: string, password: string, temporary: boolean = true): Promise<void> {
        await this.ensureAuthenticated();
        return resetPasswordCore(this.getContext(), userId, password, temporary);
    }

    /** @see admin-user-management.ts */
    async getUserByUsername(realmName: string, username: string): Promise<UserRepresentation | null> {
        await this.ensureAuthenticated();
        return getUserByUsernameCore(this.getContext(), realmName, username);
    }

    /** @see admin-mfa-sessions.ts */
    async getMFAConfig(realmName?: string): Promise<Record<string, unknown>> {
        await this.ensureAuthenticated();
        return getMFAConfigCore(this.getContext(), realmName);
    }

    /** @see admin-mfa-sessions.ts */
    async updateMFAConfig(config: Record<string, unknown>, realmName?: string): Promise<void> {
        await this.ensureAuthenticated();
        return updateMFAConfigCore(this.getContext(), config, realmName);
    }

    /** @see admin-mfa-sessions.ts */
    async testMFAFlow(realmName?: string): Promise<Record<string, unknown>> {
        await this.ensureAuthenticated();
        return testMFAFlowCore(this.getContext(), realmName);
    }

    /** @see admin-mfa-sessions.ts */
    async getActiveSessions(realmName?: string, filters?: Record<string, unknown>): Promise<Record<string, unknown>[]> {
        await this.ensureAuthenticated();
        return getActiveSessionsCore(this.getContext(), realmName, filters);
    }

    /** @see admin-mfa-sessions.ts */
    async revokeSession(sessionId: string, realmName?: string): Promise<void> {
        await this.ensureAuthenticated();
        return revokeSessionCore(this.getContext(), sessionId, realmName);
    }

    /** @see admin-mfa-sessions.ts */
    async revokeUserSessions(username: string, realmName?: string): Promise<number> {
        await this.ensureAuthenticated();
        return revokeUserSessionsCore(this.getContext(), username, realmName);
    }

    /** @see admin-mfa-sessions.ts */
    async getSessionStats(realmName?: string): Promise<Record<string, unknown>> {
        await this.ensureAuthenticated();
        return getSessionStatsCore(this.getContext(), realmName);
    }

    /** @see admin-mfa-sessions.ts */
    async getRealmTheme(realmName?: string): Promise<Record<string, unknown>> {
        await this.ensureAuthenticated();
        return getRealmThemeCore(this.getContext(), realmName);
    }

    /** @see admin-mfa-sessions.ts */
    async updateRealmTheme(themeName: string, realmName?: string): Promise<void> {
        await this.ensureAuthenticated();
        return updateRealmThemeCore(this.getContext(), themeName, realmName);
    }
}

// Export singleton instance
export const keycloakAdminService = new KeycloakAdminService();

// ============================================
// RE-EXPORTS for backward compatibility
// ============================================

// admin-idp-testing.ts
export type { AdminServiceContext } from './admin-idp-testing';
export { testIdentityProviderCore } from './admin-idp-testing';

// admin-user-management.ts
export {
    createRealmRoleCore,
    assignRoleToUserCore,
    listUsersCore,
    getUserByIdCore,
    createUserCore,
    updateUserCore,
    deleteUserCore,
    resetPasswordCore,
    getUserByUsernameCore,
} from './admin-user-management';

// admin-mfa-sessions.ts
export {
    getMFAConfigCore,
    updateMFAConfigCore,
    testMFAFlowCore,
    getActiveSessionsCore,
    revokeSessionCore,
    revokeUserSessionsCore,
    getSessionStatsCore,
    getRealmThemeCore,
    updateRealmThemeCore,
} from './admin-mfa-sessions';
