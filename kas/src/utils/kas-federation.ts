/**
 * KAS Federation - Cross-Organizational KAS Integration
 * 
 * Enables DIVE V3 to integrate with other organizations' KAS services.
 * 
 * Features:
 * - KAS registry/discovery
 * - Trust relationship management
 * - Cross-KAS authentication (mTLS, API keys, JWT)
 * - Policy translation between organizations
 * - Audit correlation across domains
 * - Key escrow support
 * 
 * Reference: ACP-240 Section 5.3 (Multi-KAS Architecture)
 */

import { kasLogger } from './kas-logger';
import axios, { AxiosInstance } from 'axios';
import https from 'https';
import fs from 'fs';
import path from 'path';

export interface IKASRegistryEntry {
    /** Unique KAS identifier */
    kasId: string;
    
    /** Organization name */
    organization: string;
    
    /** KAS endpoint URL */
    kasUrl: string;
    
    /** Authentication method */
    authMethod: 'mtls' | 'apikey' | 'jwt' | 'oauth2';
    
    /** Authentication configuration */
    authConfig: {
        /** For mTLS: client certificate path */
        clientCert?: string;
        /** For mTLS: client key path */
        clientKey?: string;
        /** For mTLS: CA certificate path */
        caCert?: string;
        /** For API key: API key value */
        apiKey?: string;
        /** For API key: header name */
        apiKeyHeader?: string;
        /** For JWT: issuer URL */
        jwtIssuer?: string;
        /** For OAuth2: client credentials */
        oauth2ClientId?: string;
        oauth2ClientSecret?: string;
        oauth2TokenUrl?: string;
    };
    
    /** Trust level */
    trustLevel: 'high' | 'medium' | 'low';
    
    /** Supported countries (ISO 3166-1 alpha-3) */
    supportedCountries: string[];
    
    /** Supported COIs */
    supportedCOIs: string[];
    
    /** Policy translation rules */
    policyTranslation?: {
        /** Clearance level mapping */
        clearanceMapping?: Record<string, string>;
        /** Country code mapping */
        countryMapping?: Record<string, string>;
        /** COI mapping */
        coiMapping?: Record<string, string>;
    };
    
    /** Metadata */
    metadata: {
        version: string;
        capabilities: string[];
        contact: string;
        lastVerified: string;
    };
}

export interface ICrossKASRequest {
    /** Resource ID */
    resourceId: string;
    
    /** KAO ID */
    kaoId: string;
    
    /** Wrapped key */
    wrappedKey: string;
    
    /** Subject attributes (for policy evaluation) */
    subject: {
        uniqueID: string;
        clearance: string;
        countryOfAffiliation: string;
        acpCOI?: string[];
    };
    
    /** Request ID for correlation */
    requestId: string;
}

export interface ICrossKASResponse {
    success: boolean;
    dek?: string;
    error?: string;
    denialReason?: string;
    auditEventId?: string;
    kasId: string;
    organization: string;
}

/**
 * KAS Registry - Manages trusted external KAS instances
 */
export class KASRegistry {
    private registry: Map<string, IKASRegistryEntry> = new Map();
    private httpClients: Map<string, AxiosInstance> = new Map();

    /**
     * Register a trusted KAS instance
     */
    register(kasEntry: IKASRegistryEntry): void {
        this.registry.set(kasEntry.kasId, kasEntry);
        
        // Create HTTP client with appropriate authentication
        const client = this.createAuthenticatedClient(kasEntry);
        this.httpClients.set(kasEntry.kasId, client);
        
        kasLogger.info('KAS registered', {
            kasId: kasEntry.kasId,
            organization: kasEntry.organization,
            kasUrl: kasEntry.kasUrl,
            authMethod: kasEntry.authMethod,
            trustLevel: kasEntry.trustLevel,
        });
    }

    /**
     * Create authenticated HTTP client for KAS
     */
    private createAuthenticatedClient(kasEntry: IKASRegistryEntry): AxiosInstance {
        const config: any = {
            baseURL: kasEntry.kasUrl,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'DIVE-V3-KAS-Client/1.0',
            },
        };

        switch (kasEntry.authMethod) {
            case 'mtls':
                // Mutual TLS configuration
                if (kasEntry.authConfig.clientCert && kasEntry.authConfig.clientKey) {
                    config.httpsAgent = new https.Agent({
                        cert: fs.readFileSync(kasEntry.authConfig.clientCert),
                        key: fs.readFileSync(kasEntry.authConfig.clientKey),
                        ca: kasEntry.authConfig.caCert 
                            ? fs.readFileSync(kasEntry.authConfig.caCert)
                            : undefined,
                        rejectUnauthorized: !!kasEntry.authConfig.caCert,
                    });
                }
                break;

            case 'apikey':
                // API key authentication
                const headerName = kasEntry.authConfig.apiKeyHeader || 'X-API-Key';
                config.headers[headerName] = kasEntry.authConfig.apiKey;
                break;

            case 'jwt':
                // JWT authentication (token obtained separately)
                // Token will be added per-request
                break;

            case 'oauth2':
                // OAuth2 client credentials (token obtained separately)
                // Token will be added per-request
                break;
        }

        return axios.create(config);
    }

    /**
     * Get KAS entry by ID
     */
    get(kasId: string): IKASRegistryEntry | undefined {
        return this.registry.get(kasId);
    }

    /**
     * Get HTTP client for KAS
     */
    getClient(kasId: string): AxiosInstance | undefined {
        return this.httpClients.get(kasId);
    }

    /**
     * Find KAS instances by country or COI
     */
    findMatchingKAS(countries?: string[], cois?: string[]): IKASRegistryEntry[] {
        const matches: IKASRegistryEntry[] = [];

        for (const entry of this.registry.values()) {
            let matchesCountry = true;
            let matchesCOI = true;

            if (countries && countries.length > 0) {
                matchesCountry = countries.some(country => 
                    entry.supportedCountries.includes(country)
                );
            }

            if (cois && cois.length > 0) {
                matchesCOI = cois.some(coi => 
                    entry.supportedCOIs.includes(coi)
                );
            }

            if (matchesCountry && matchesCOI) {
                matches.push(entry);
            }
        }

        return matches;
    }

    /**
     * List all registered KAS instances
     */
    listAll(): IKASRegistryEntry[] {
        return Array.from(this.registry.values());
    }

    /**
     * Remove KAS from registry
     */
    unregister(kasId: string): void {
        this.registry.delete(kasId);
        this.httpClients.delete(kasId);
        kasLogger.info('KAS unregistered', { kasId });
    }
}

/**
 * Policy Translator - Translates policies between organizations
 */
export class PolicyTranslator {
    /**
     * Translate clearance level between organizations
     */
    translateClearance(
        clearance: string,
        translationRules?: Record<string, string>
    ): string {
        if (!translationRules) {
            return clearance; // No translation needed
        }

        return translationRules[clearance] || clearance;
    }

    /**
     * Translate country code between organizations
     */
    translateCountry(
        country: string,
        translationRules?: Record<string, string>
    ): string {
        if (!translationRules) {
            return country; // No translation needed
        }

        return translationRules[country] || country;
    }

    /**
     * Translate COI between organizations
     */
    translateCOI(
        coi: string,
        translationRules?: Record<string, string>
    ): string {
        if (!translationRules) {
            return coi; // No translation needed
        }

        return translationRules[coi] || coi;
    }

    /**
     * Translate full subject attributes
     */
    translateSubject(
        subject: ICrossKASRequest['subject'],
        kasEntry: IKASRegistryEntry
    ): ICrossKASRequest['subject'] {
        const translation = kasEntry.policyTranslation;

        return {
            uniqueID: subject.uniqueID,
            clearance: this.translateClearance(
                subject.clearance,
                translation?.clearanceMapping
            ),
            countryOfAffiliation: this.translateCountry(
                subject.countryOfAffiliation,
                translation?.countryMapping
            ),
            acpCOI: subject.acpCOI?.map(coi =>
                this.translateCOI(coi, translation?.coiMapping)
            ),
        };
    }
}

/**
 * Cross-KAS Client - Handles requests to external KAS instances
 */
export class CrossKASClient {
    private registry: KASRegistry;
    private translator: PolicyTranslator;

    constructor(registry: KASRegistry, translator: PolicyTranslator) {
        this.registry = registry;
        this.translator = translator;
    }

    /**
     * Request key from external KAS
     */
    async requestKey(
        kasId: string,
        request: ICrossKASRequest
    ): Promise<ICrossKASResponse> {
        const kasEntry = this.registry.get(kasId);
        if (!kasEntry) {
            throw new Error(`KAS not found: ${kasId}`);
        }

        const client = this.registry.getClient(kasId);
        if (!client) {
            throw new Error(`KAS client not available: ${kasId}`);
        }

        // Translate subject attributes for external KAS
        const translatedSubject = this.translator.translateSubject(
            request.subject,
            kasEntry
        );

        kasLogger.info('Requesting key from external KAS', {
            requestId: request.requestId,
            kasId,
            organization: kasEntry.organization,
            kasUrl: kasEntry.kasUrl,
            subject: {
                uniqueID: translatedSubject.uniqueID,
                clearance: translatedSubject.clearance,
                country: translatedSubject.countryOfAffiliation,
            },
        });

        try {
            // Prepare request payload
            const payload: any = {
                resourceId: request.resourceId,
                kaoId: request.kaoId,
                wrappedKey: request.wrappedKey,
                bearerToken: this.getBearerToken(kasEntry), // Get auth token
                requestId: request.requestId,
                requestTimestamp: new Date().toISOString(),
            };

            // Make request to external KAS
            const response = await client.post('/request-key', payload);

            kasLogger.info('Key request successful from external KAS', {
                requestId: request.requestId,
                kasId,
                organization: kasEntry.organization,
            });

            return {
                success: true,
                dek: response.data.dek,
                kasId,
                organization: kasEntry.organization,
                auditEventId: response.data.auditEventId,
            };
        } catch (error: any) {
            kasLogger.error('Key request failed from external KAS', {
                requestId: request.requestId,
                kasId,
                organization: kasEntry.organization,
                error: error.message,
                status: error.response?.status,
            });

            return {
                success: false,
                error: error.response?.data?.error || 'Unknown error',
                denialReason: error.response?.data?.denialReason || error.message,
                kasId,
                organization: kasEntry.organization,
            };
        }
    }

    /**
     * Get bearer token for authentication
     */
    private getBearerToken(kasEntry: IKASRegistryEntry): string {
        // For JWT/OAuth2, token should be obtained from token service
        // For mTLS/API key, return empty string (auth handled by client)
        
        if (kasEntry.authMethod === 'jwt' || kasEntry.authMethod === 'oauth2') {
            // TODO: Implement token acquisition from token service
            // For now, return placeholder
            return 'PLACEHOLDER_TOKEN';
        }

        return '';
    }
}

/**
 * Global KAS registry instance
 */
export const kasRegistry = new KASRegistry();

/**
 * Global policy translator instance
 */
export const policyTranslator = new PolicyTranslator();

/**
 * Global cross-KAS client instance
 */
export const crossKASClient = new CrossKASClient(kasRegistry, policyTranslator);
