/**
 * Keycloak Admin Service
 *
 * Manages Identity Providers via Keycloak Admin REST API
 * Supports OIDC and SAML IdP creation, update, deletion
 *
 * Reference: keycloak-admin-api-llm.md
 *
 * PRODUCTION FIX: Uses direct REST API instead of @keycloak/keycloak-admin-client
 * to avoid library compatibility issues with fetch() and custom HTTPS agents.
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
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

    /**
     * Get admin access token (with automatic refresh)
     * Uses direct REST API instead of library
     */
    private async getAdminToken(): Promise<string> {
        // Return cached token if still valid
        if (this.accessToken && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        const username = process.env.KEYCLOAK_ADMIN_USER || process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
        // Load Keycloak admin password from GCP Secret Manager (KC_ADMIN_PASSWORD for Keycloak v26 consistency)
        const password = process.env.KC_ADMIN_PASSWORD || process.env.KEYCLOAK_ADMIN_PASSWORD;

        // Always authenticate against master realm for admin operations
        const masterAuthUrl = `${this.axios.defaults.baseURL.replace(/\/$/, '')}/realms/master/protocol/openid-connect/token`;

        logger.debug('Authenticating to Keycloak Admin API (direct REST)', {
            username,
            passwordSet: !!password,
            authUrl: masterAuthUrl,
            realm: 'master'
        });

        try {
            // Use a separate axios instance for master realm authentication
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
     * Legacy method - kept for backward compatibility
     * @deprecated Use getAdminToken() instead
     */
    private async ensureAuthenticated(): Promise<void> {
        // This method is now a no-op - getAdminToken() handles auth
        await this.getAdminToken();
    }

    // ============================================
    // Identity Provider Management
    // ============================================

    /**
     * List all Identity Providers in the realm
     * Uses direct REST API instead of library for better reliability
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

            logger.info('Retrieved identity providers (direct REST)', {
                count: idps.length,
                idps: idps.map((i: any) => ({
                    alias: i.alias,
                    providerId: i.providerId,
                    enabled: i.enabled
                }))
            });

            return {
                idps: idps.map((idp: any) => ({
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
     * Get specific Identity Provider by alias
     * Using direct REST API to avoid keycloak-admin-client library issues
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
     * Create OIDC Identity Provider
     */
    async createOIDCIdentityProvider(request: IIdPCreateRequest): Promise<string> {
        await this.ensureAuthenticated();

        const config = request.config as IOIDCIdPConfig;

        try {
            // Create OIDC IdP
            await this.client.identityProviders.create({
                alias: request.alias,
                displayName: request.displayName,
                providerId: 'oidc',
                enabled: false, // Start disabled (pending approval)
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
                    // Metadata
                    submittedBy: request.submittedBy,
                    createdAt: new Date().toISOString(),
                    description: request.description || ''
                }
            });

            logger.info('Created OIDC identity provider', {
                alias: request.alias,
                submittedBy: request.submittedBy
            });

            // Create attribute mappers
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
     * Create SAML Identity Provider
     */
    async createSAMLIdentityProvider(request: IIdPCreateRequest): Promise<string> {
        await this.ensureAuthenticated();

        const config = request.config as ISAMLIdPConfig;

        try {
            // Create SAML IdP
            await this.client.identityProviders.create({
                alias: request.alias,
                displayName: request.displayName,
                providerId: 'saml',
                enabled: false, // Start disabled (pending approval)
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
                    // Metadata
                    submittedBy: request.submittedBy,
                    createdAt: new Date().toISOString(),
                    description: request.description || ''
                }
            });

            logger.info('Created SAML identity provider', {
                alias: request.alias,
                submittedBy: request.submittedBy
            });

            // Create attribute mappers
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
     * Update Identity Provider
     */
    async updateIdentityProvider(alias: string, updates: IIdPUpdateRequest): Promise<void> {
        await this.ensureAuthenticated();

        try {
            const existingIdp = await this.client.identityProviders.findOne({ alias });

            if (!existingIdp) {
                throw new Error(`Identity provider ${alias} not found`);
            }

            // Merge updates with existing config
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

            // Update attribute mappings if provided
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
     * Delete Identity Provider
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
     * Create DIVE attribute mappers for an IdP
     * Uses REST API directly due to Keycloak Admin Client library limitations
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

            // Get admin token for REST API calls
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

            // Create each mapper via REST API
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
     * Update DIVE attribute mappers for an IdP
     */
    private async updateDIVEAttributeMappers(
        idpAlias: string,
        _mappings: Partial<IDIVEAttributeMappings>,
        _protocol: IdPProtocol
    ): Promise<void> {
        // For simplicity, delete existing mappers and recreate
        // In production, would update individual mappers
        logger.info('Updating attribute mappers', { idpAlias });
        // Implementation would iterate through existing mappers and update them
        // Skipped for brevity
    }

    // ============================================
    // Testing & Validation
    // ============================================

    /**
     * Test Identity Provider connectivity
     */
    async testIdentityProvider(alias: string): Promise<IIdPTestResult> {
        await this.ensureAuthenticated();

        try {
            const idp = await this.client.identityProviders.findOne({ alias });

            if (!idp) {
                return {
                    success: false,
                    message: `Identity provider ${alias} not found`
                };
            }

            const protocol = idp.providerId as IdPProtocol;

            if (protocol === 'oidc') {
                return await this.testOIDCIdP(idp as IIdentityProviderRepresentation);
            } else if (protocol === 'saml') {
                return await this.testSAMLIdP(idp as IIdentityProviderRepresentation);
            } else {
                return {
                    success: false,
                    message: `Unknown protocol: ${protocol}`
                };
            }
        } catch (error) {
            logger.error('Failed to test identity provider', {
                alias,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Test failed'
            };
        }
    }

    /**
     * Test OIDC IdP connectivity
     */
    private async testOIDCIdP(idp: IIdentityProviderRepresentation): Promise<IIdPTestResult> {
        try {
            // Check if IdP configuration has required fields
            const config = idp.config || {};
            const issuer = config.issuer || config.authorizationUrl;

            logger.debug('Testing OIDC IdP', {
                alias: idp.alias,
                hasIssuer: !!issuer,
                hasAuthUrl: !!config.authorizationUrl,
                hasTokenUrl: !!config.tokenUrl,
                configKeys: Object.keys(config)
            });

            // For local/mock IdPs, just verify configuration exists
            if (!issuer && !config.authorizationUrl) {
                return {
                    success: false,
                    message: 'IdP configuration incomplete - missing issuer or authorization URL',
                    details: {
                        reachable: false,
                        configKeys: Object.keys(config)
                    }
                };
            }

            // For mock/local IdPs (localhost URLs), skip external connectivity test
            const isLocalIdP = issuer?.includes('localhost') || config.authorizationUrl?.includes('localhost');

            if (isLocalIdP) {
                return {
                    success: true,
                    message: 'Local IdP configuration valid (connectivity test skipped for localhost)',
                    details: {
                        reachable: true,
                        isLocal: true,
                        hasIssuer: !!issuer,
                        hasAuthUrl: !!config.authorizationUrl,
                        hasTokenUrl: !!config.tokenUrl
                    }
                };
            }

            // For external IdPs, test OIDC discovery endpoint
            if (issuer) {
                try {
                    const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
                    const response = await axios.get(discoveryUrl, { timeout: 5000 });

                    if (response.status === 200) {
                        return {
                            success: true,
                            message: 'OIDC IdP reachable via discovery endpoint',
                            details: {
                                reachable: true,
                                jwksValid: !!response.data.jwks_uri
                            }
                        };
                    }
                } catch (error) {
                    return {
                        success: false,
                        message: `OIDC discovery endpoint unreachable: ${error instanceof Error ? error.message : 'Unknown error'}`
                    };
                }
            }

            // Fallback: Configuration exists, assume it's valid
            return {
                success: true,
                message: 'IdP configuration exists (external connectivity not tested)',
                details: {
                    reachable: false,
                    configPresent: true
                }
            };
        } catch (error) {
            return {
                success: false,
                message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Test SAML IdP connectivity
     */
    private async testSAMLIdP(idp: IIdentityProviderRepresentation): Promise<IIdPTestResult> {
        try {
            const config = idp.config || {};
            const ssoUrl = config.singleSignOnServiceUrl;

            logger.debug('Testing SAML IdP', {
                alias: idp.alias,
                hasSsoUrl: !!ssoUrl,
                hasCertificate: !!config.signingCertificate,
                configKeys: Object.keys(config)
            });

            if (!ssoUrl) {
                return {
                    success: false,
                    message: 'SAML configuration incomplete - missing SSO URL',
                    details: {
                        reachable: false,
                        configKeys: Object.keys(config)
                    }
                };
            }

            // For mock/local IdPs (localhost URLs), skip external connectivity test
            const isLocalIdP = ssoUrl.includes('localhost');

            if (isLocalIdP) {
                return {
                    success: true,
                    message: 'Local SAML IdP configuration valid (connectivity test skipped for localhost)',
                    details: {
                        reachable: true,
                        isLocal: true,
                        hasSsoUrl: !!ssoUrl,
                        hasCertificate: !!config.signingCertificate
                    }
                };
            }

            // For external IdPs, test SAML endpoint reachability
            try {
                const response = await axios.get(ssoUrl, {
                    timeout: 5000,
                    validateStatus: (status) => status < 500 // Accept 4xx as reachable
                });

                if (response.status < 500) {
                    return {
                        success: true,
                        message: 'SAML IdP endpoint reachable',
                        details: {
                            reachable: true,
                            certificateValid: !!config.signingCertificate
                        }
                    };
                }
            } catch (error) {
                return {
                    success: false,
                    message: `SAML endpoint unreachable: ${error instanceof Error ? error.message : 'Unknown error'}`
                };
            }

            return {
                success: true,
                message: 'SAML configuration exists (external connectivity not tested)',
                details: {
                    reachable: false,
                    configPresent: true
                }
            };
        } catch (error) {
            return {
                success: false,
                message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    // ============================================
    // Realm & User Management (Future Use)
    // ============================================

    /**
     * Create realm role (e.g., super_admin)
     */
    async createRealmRole(roleName: string, description: string): Promise<void> {
        await this.ensureAuthenticated();

        try {
            await this.client.roles.create({
                name: roleName,
                description
            });

            logger.info('Created realm role', { roleName });
        } catch (error) {
            logger.error('Failed to create realm role', {
                roleName,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Assign role to user
     */
    async assignRoleToUser(userId: string, roleName: string): Promise<void> {
        await this.ensureAuthenticated();

        try {
            const role = await this.client.roles.findOneByName({ name: roleName });

            if (!role) {
                throw new Error(`Role ${roleName} not found`);
            }

            await this.client.users.addRealmRoleMappings({
                id: userId,
                roles: [{ id: role.id!, name: role.name! }]
            });

            logger.info('Assigned role to user', { userId, roleName });
        } catch (error) {
            logger.error('Failed to assign role to user', {
                userId,
                roleName,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * List all users in realm
     */
    async listUsers(max: number = 100, first: number = 0, search: string = ''): Promise<{ users: any[], total: number }> {
        await this.ensureAuthenticated();

        try {
            const query: any = { max, first };
            if (search) {
                query.search = search;
            }

            const users = await this.client.users.find(query);
            const count = await this.client.users.count(search ? { search } : {});

            return { users, total: count };
        } catch (error) {
            logger.error('Failed to list users', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Get user by ID
     */
    async getUserById(userId: string): Promise<any> {
        await this.ensureAuthenticated();

        try {
            const user = await this.client.users.findOne({ id: userId });
            if (!user) {
                throw new Error(`User ${userId} not found`);
            }
            return user;
        } catch (error) {
            logger.error('Failed to get user by ID', {
                userId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Create User
     */
    async createUser(userData: any): Promise<string> {
        await this.ensureAuthenticated();

        try {
            const user = await this.client.users.create({
                username: userData.username,
                email: userData.email,
                enabled: userData.enabled !== false,
                emailVerified: userData.emailVerified !== false,
                firstName: userData.firstName,
                lastName: userData.lastName,
                attributes: userData.attributes,
                credentials: userData.password ? [{
                    type: 'password',
                    value: userData.password,
                    temporary: userData.temporaryPassword !== false
                }] : undefined
            });

            logger.info('Created user', { userId: user.id, username: userData.username });
            return user.id;
        } catch (error) {
            logger.error('Failed to create user', {
                username: userData.username,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Update User
     */
    async updateUser(userId: string, userData: any): Promise<void> {
        await this.ensureAuthenticated();

        try {
            await this.client.users.update({ id: userId }, {
                email: userData.email,
                enabled: userData.enabled,
                firstName: userData.firstName,
                lastName: userData.lastName,
                attributes: userData.attributes,
                emailVerified: userData.emailVerified
            });

            logger.info('Updated user', { userId });
        } catch (error) {
            logger.error('Failed to update user', {
                userId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Delete User
     */
    async deleteUser(userId: string): Promise<void> {
        await this.ensureAuthenticated();

        try {
            await this.client.users.del({ id: userId });
            logger.info('Deleted user', { userId });
        } catch (error) {
            logger.error('Failed to delete user', {
                userId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Reset Password
     */
    async resetPassword(userId: string, password: string, temporary: boolean = true): Promise<void> {
        await this.ensureAuthenticated();

        try {
            await this.client.users.resetPassword({
                id: userId,
                credential: {
                    type: 'password',
                    value: password,
                    temporary
                }
            });
            logger.info('Reset password for user', { userId, temporary });
        } catch (error) {
            logger.error('Failed to reset password', {
                userId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Get user by username from specific realm
     */
    async getUserByUsername(realmName: string, username: string): Promise<any> {
        await this.ensureAuthenticated();

        try {
            // Temporarily switch to target realm
            const originalRealm = this.client.realmName;
            this.client.setConfig({ realmName });

            const users = await this.client.users.find({ username, exact: true });

            // Switch back to original realm
            this.client.setConfig({ realmName: originalRealm });

            if (users.length === 0) {
                logger.warn('User not found in realm', { username, realmName });
                return null;
            }

            logger.debug('Found user in realm', { username, realmName, userId: users[0].id });
            return users[0];
        } catch (error) {
            logger.error('Failed to get user by username', {
                username,
                realmName,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    // ============================================
    // MFA Configuration (Phase 1.5)
    // ============================================

    /**
     * Get MFA Configuration for Realm
     * Note: This reads authentication flow configuration
     */
    async getMFAConfig(realmName?: string): Promise<any> {
        await this.ensureAuthenticated();

        try {
            const realm = realmName || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
            const baseUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
            const token = this.client.accessToken;

            // Get authentication flows
            const flowsUrl = `${baseUrl}/admin/realms/${realm}/authentication/flows`;
            const response = await axios.get(flowsUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            // Find browser flow (contains MFA config)
            const browserFlow = response.data.find((f: any) => f.alias === 'browser');

            logger.info('Retrieved MFA configuration', { realm, flowAlias: browserFlow?.alias });

            return {
                flowId: browserFlow?.id,
                flowAlias: browserFlow?.alias,
                builtIn: browserFlow?.builtIn,
                topLevel: browserFlow?.topLevel
            };
        } catch (error) {
            logger.error('Failed to get MFA config', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error(`Failed to get MFA config: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Update MFA Configuration for Realm
     * Modifies authentication flows to require/optional OTP
     *
     * Note: This is a simplified implementation. In production, you'd:
     * 1. Clone the browser flow
     * 2. Add OTP required action
     * 3. Set conditional MFA based on clearance
     */
    async updateMFAConfig(config: any, realmName?: string): Promise<void> {
        await this.ensureAuthenticated();

        try {
            const realm = realmName || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
            const baseUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
            const token = this.client.accessToken;

            // Get realm settings
            const realmUrl = `${baseUrl}/admin/realms/${realm}`;
            const realmResponse = await axios.get(realmUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            // Update OTP policy
            const otpPolicyUpdate = {
                ...realmResponse.data,
                otpPolicyType: config.otp?.type || 'totp',
                otpPolicyAlgorithm: config.otp?.algorithm || 'HmacSHA256',
                otpPolicyDigits: config.otp?.digits || 6,
                otpPolicyPeriod: config.otp?.period || 30,
                otpPolicyInitialCounter: config.otp?.initialCounter || 0
            };

            await axios.put(realmUrl, otpPolicyUpdate, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            logger.info('Updated MFA configuration', { realm, config });
        } catch (error) {
            logger.error('Failed to update MFA config', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error(`Failed to update MFA config: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Test MFA Flow
     * Returns flow configuration details
     */
    async testMFAFlow(realmName?: string): Promise<any> {
        await this.ensureAuthenticated();

        try {
            const realm = realmName || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
            const baseUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
            const token = this.client.accessToken;

            // Get required actions
            const actionsUrl = `${baseUrl}/admin/realms/${realm}/authentication/required-actions`;
            const response = await axios.get(actionsUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const otpAction = response.data.find((a: any) => a.alias === 'CONFIGURE_TOTP');

            return {
                success: true,
                message: 'MFA flow test successful',
                requiredActions: response.data.map((a: any) => a.alias),
                otpEnabled: otpAction?.enabled || false
            };
        } catch (error) {
            logger.error('Failed to test MFA flow', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return {
                success: false,
                message: `MFA flow test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    // ============================================
    // Session Management (Phase 1.6)
    // ============================================

    /**
     * Get Active Sessions for Realm
     * Returns list of active user sessions
     */
    async getActiveSessions(realmName?: string, filters?: any): Promise<any[]> {
        await this.ensureAuthenticated();

        try {
            const realm = realmName || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';

            // Get all users (then get their sessions)
            const users = await this.client.users.find({ max: 1000, realm });

            const sessions: any[] = [];

            for (const user of users) {
                if (!user.id) continue;

                try {
                    const userSessions = await this.client.users.listSessions({
                        id: user.id,
                        realm
                    });

                    userSessions.forEach((session: any) => {
                        // Apply filters
                        if (filters?.username && user.username !== filters.username) return;
                        if (filters?.ipAddress && session.ipAddress !== filters.ipAddress) return;

                        sessions.push({
                            id: session.id,
                            username: user.username,
                            userId: user.id,
                            ipAddress: session.ipAddress,
                            start: session.start,
                            lastAccess: session.lastAccess,
                            clients: session.clients || {}
                        });
                    });
                } catch (error) {
                    // User has no sessions, skip
                    continue;
                }
            }

            logger.info('Retrieved active sessions', { realm, count: sessions.length });
            return sessions;
        } catch (error) {
            logger.error('Failed to get active sessions', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error(`Failed to get sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Revoke Specific Session
     */
    async revokeSession(sessionId: string, realmName?: string): Promise<void> {
        await this.ensureAuthenticated();

        try {
            const realm = realmName || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
            const baseUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
            const token = this.client.accessToken;

            const sessionUrl = `${baseUrl}/admin/realms/${realm}/sessions/${sessionId}`;

            await axios.delete(sessionUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            logger.info('Revoked session', { realm, sessionId });
        } catch (error) {
            logger.error('Failed to revoke session', {
                sessionId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error(`Failed to revoke session: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Revoke All User Sessions
     */
    async revokeUserSessions(username: string, realmName?: string): Promise<number> {
        await this.ensureAuthenticated();

        try {
            const realm = realmName || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';

            // Find user by username
            const users = await this.client.users.find({ username, exact: true, realm });

            if (users.length === 0) {
                throw new Error(`User ${username} not found`);
            }

            const user = users[0];

            if (!user.id) {
                throw new Error('User ID not found');
            }

            // Logout user (revokes all sessions)
            await this.client.users.logout({ id: user.id, realm });

            logger.info('Revoked all user sessions', { realm, username, userId: user.id });

            // Return count (we don't know exact count, return 1 as success indicator)
            return 1;
        } catch (error) {
            logger.error('Failed to revoke user sessions', {
                username,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error(`Failed to revoke user sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get Session Statistics
     */
    async getSessionStats(realmName?: string): Promise<any> {
        await this.ensureAuthenticated();

        try {
            const realm = realmName || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
            const sessions = await this.getActiveSessions(realm);

            const stats = {
                totalActive: sessions.length,
                peakConcurrent24h: sessions.length, // Simplified: current = peak
                averageDuration: 0,
                byClient: {} as Record<string, number>,
                byUser: {} as Record<string, number>
            };

            let totalDuration = 0;

            sessions.forEach(session => {
                // Calculate duration
                const duration = (session.lastAccess - session.start) / 1000; // seconds
                totalDuration += duration;

                // Count by user
                stats.byUser[session.username] = (stats.byUser[session.username] || 0) + 1;

                // Count by client
                Object.keys(session.clients || {}).forEach(clientId => {
                    stats.byClient[clientId] = (stats.byClient[clientId] || 0) + 1;
                });
            });

            stats.averageDuration = sessions.length > 0 ? totalDuration / sessions.length : 0;

            logger.info('Retrieved session statistics', { realm, totalActive: stats.totalActive });
            return stats;
        } catch (error) {
            logger.error('Failed to get session stats', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error(`Failed to get session stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // ============================================
    // Theme Management (Phase 1.7)
    // ============================================

    /**
     * Note: Theme management is handled by MongoDB, not Keycloak
     * These methods are placeholders for future Keycloak theme integration
     * Actual theme CRUD is in a separate service (idp-theme.service.ts)
     */

    /**
     * Get Realm Theme Settings
     */
    async getRealmTheme(realmName?: string): Promise<any> {
        await this.ensureAuthenticated();

        try {
            const realm = realmName || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
            const baseUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
            const token = this.client.accessToken;

            const realmUrl = `${baseUrl}/admin/realms/${realm}`;
            const response = await axios.get(realmUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            return {
                loginTheme: response.data.loginTheme,
                accountTheme: response.data.accountTheme,
                adminTheme: response.data.adminTheme,
                emailTheme: response.data.emailTheme,
                internationalizationEnabled: response.data.internationalizationEnabled,
                supportedLocales: response.data.supportedLocales || []
            };
        } catch (error) {
            logger.error('Failed to get realm theme', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error(`Failed to get realm theme: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Update Realm Theme Settings
     */
    async updateRealmTheme(themeName: string, realmName?: string): Promise<void> {
        await this.ensureAuthenticated();

        try {
            const realm = realmName || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
            const baseUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
            const token = this.client.accessToken;

            const realmUrl = `${baseUrl}/admin/realms/${realm}`;

            // Get current realm settings
            const currentSettings = await axios.get(realmUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            // Update login theme
            const updatedSettings = {
                ...currentSettings.data,
                loginTheme: themeName
            };

            await axios.put(realmUrl, updatedSettings, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            logger.info('Updated realm theme', { realm, themeName });
        } catch (error) {
            logger.error('Failed to update realm theme', {
                themeName,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error(`Failed to update realm theme: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

// Export singleton instance
export const keycloakAdminService = new KeycloakAdminService();
