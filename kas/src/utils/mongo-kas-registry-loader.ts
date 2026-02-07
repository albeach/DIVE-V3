/**
 * MongoDB-Backed KAS Registry Loader
 *
 * Loads KAS registry from MongoDB federation_spokes collection (SSOT)
 * Replaces legacy JSON file-based registry
 *
 * Reference: backend/src/models/federation-spoke.model.ts
 * Implements Phase 3: Federation with proper SSOT integration
 */

import { MongoClient, Db, Collection } from 'mongodb';
import { kasLogger } from './kas-logger';
import { kasRegistry, IKASRegistryEntry } from './kas-federation';

// Lazy evaluation to ensure env vars are loaded before use
function getMongoDBUrl(): string {
    const url = process.env.MONGODB_URL;
    if (!url) {
        kasLogger.error('MONGODB_URL environment variable not set - cannot connect to MongoDB', {
            hint: 'Ensure MONGODB_URL is configured in docker-compose.yml or environment',
            fallbackDisabled: true,
        });
        throw new Error('MONGODB_URL environment variable is required');
    }
    return url;
}

const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';
const COLLECTION_NAME = 'federation_spokes';

/**
 * Spoke Registration from MongoDB
 * (Subset of fields from ISpokeRegistration in backend)
 */
interface IMongoSpokeRegistration {
    spokeId: string;
    instanceCode: string;
    organization: string;
    kasUrl: string;
    kasPort?: number;
    status: 'pending' | 'approved' | 'rejected' | 'suspended';
    trustLevel: 'high' | 'medium' | 'low';
    supportedCountries: string[];
    supportedCOIs: string[];
    authMethod?: 'mtls' | 'jwt' | 'apikey' | 'oauth2';
    certificateFingerprint?: string;
    publicKeyPem?: string;
    metadata?: {
        version?: string;
        capabilities?: string[];
        contact?: string;
        lastVerified?: string;
    };
    registeredAt?: Date;
    lastHeartbeat?: Date;
}

/**
 * MongoDB-backed KAS Registry Loader
 */
export class MongoKASRegistryLoader {
    private client: MongoClient | null = null;
    private db: Db | null = null;
    private collection: Collection<IMongoSpokeRegistration> | null = null;
    private initialized = false;

    /**
     * Initialize MongoDB connection
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            const mongoUrl = getMongoDBUrl();
            kasLogger.info('Initializing MongoDB KAS Registry Loader', {
                mongoUrl,
                database: DB_NAME,
                collection: COLLECTION_NAME,
            });

            this.client = await MongoClient.connect(mongoUrl);
            this.db = this.client.db(DB_NAME);
            this.collection = this.db.collection<IMongoSpokeRegistration>(COLLECTION_NAME);

            this.initialized = true;
            kasLogger.info('MongoDB KAS Registry Loader initialized');

        } catch (error) {
            kasLogger.error('Failed to initialize MongoDB KAS Registry Loader', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    /**
     * Load all approved KAS instances from MongoDB
     *
     * NOTE: MongoDB replica set initialization now happens in healthcheck.
     * By the time this function is called, MongoDB is guaranteed to be PRIMARY.
     * No retry logic needed - if we reach here, MongoDB is ready.
     */
    async loadFromMongoDB(): Promise<number> {
        await this.ensureInitialized();

        try {
            kasLogger.info('Loading KAS registry from MongoDB');

            // Query for approved spokes only
            const spokes = await this.collection!
                .find({ status: 'approved' })
                .toArray();

            kasLogger.info(`Found ${spokes.length} approved spokes in MongoDB`);

            let loadedCount = 0;

            for (const spoke of spokes) {
                try {
                    const kasEntry = this.convertSpokeToKASEntry(spoke);
                    kasRegistry.register(kasEntry);
                    loadedCount++;

                    kasLogger.debug('Loaded KAS from MongoDB', {
                        kasId: kasEntry.kasId,
                        organization: kasEntry.organization,
                        instanceCode: spoke.instanceCode,
                    });

                } catch (error) {
                    kasLogger.error('Failed to convert spoke to KAS entry', {
                        spokeId: spoke.spokeId,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    });
                }
            }

            kasLogger.info('KAS registry loaded from MongoDB', {
                totalSpokes: spokes.length,
                loadedCount,
            });

            return loadedCount;

        } catch (error) {
            kasLogger.error('Failed to load KAS registry from MongoDB', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    /**
     * Convert MongoDB spoke registration to KAS registry entry
     */
    private convertSpokeToKASEntry(spoke: IMongoSpokeRegistration): IKASRegistryEntry {
        // Build KAS URL from spoke configuration
        const kasUrl = this.buildKASUrl(spoke);

        // Map auth method (default to jwt)
        const authMethod = spoke.authMethod || 'jwt';

        // Build auth config based on method
        const authConfig = this.buildAuthConfig(spoke, authMethod);

        // Build policy translation rules (can be extended later)
        const policyTranslation = this.buildPolicyTranslation(spoke);

        return {
            kasId: spoke.spokeId,
            organization: spoke.organization,
            kasUrl,
            authMethod,
            authConfig,
            trustLevel: spoke.trustLevel,
            supportedCountries: spoke.supportedCountries || [],
            supportedCOIs: spoke.supportedCOIs || [],
            policyTranslation,
            metadata: {
                version: spoke.metadata?.version || '1.0.0',
                capabilities: spoke.metadata?.capabilities || ['acp240'],
                contact: spoke.metadata?.contact || '',
                lastVerified: spoke.metadata?.lastVerified || spoke.lastHeartbeat?.toISOString() || new Date().toISOString(),
            },
        };
    }

    /**
     * Build KAS URL from spoke configuration
     * Uses environment-specific URLs, not hardcoded .dive25.com domains
     */
    private buildKASUrl(spoke: IMongoSpokeRegistration): string {
        // If kasUrl is already specified, use it
        if (spoke.kasUrl) {
            // Ensure URL ends with /rewrap (ACP-240 endpoint)
            if (!spoke.kasUrl.endsWith('/rewrap') && !spoke.kasUrl.endsWith('/request-key')) {
                return `${spoke.kasUrl}/rewrap`;
            }
            // Replace /request-key with /rewrap for ACP-240 compliance
            return spoke.kasUrl.replace('/request-key', '/rewrap');
        }

        // Otherwise, construct URL from environment-specific patterns
        const instanceCode = spoke.instanceCode.toLowerCase();
        const kasPort = spoke.kasPort || 8080;

        // Check for environment-specific URL override
        const envUrl = process.env[`KAS_URL_${spoke.instanceCode.toUpperCase()}`];
        if (envUrl) {
            return envUrl.endsWith('/rewrap') ? envUrl : `${envUrl}/rewrap`;
        }

        // Default URL pattern (environment-agnostic)
        // In production, these should be overridden by environment variables
        const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
        return `${protocol}://${instanceCode}-kas:${kasPort}/rewrap`;
    }

    /**
     * Build authentication configuration
     */
    private buildAuthConfig(spoke: IMongoSpokeRegistration, authMethod: string): IKASRegistryEntry['authConfig'] {
        const config: IKASRegistryEntry['authConfig'] = {};

        switch (authMethod) {
            case 'mtls':
                // mTLS certificates from environment or spoke metadata
                config.clientCert = process.env[`MTLS_CLIENT_CERT_${spoke.instanceCode.toUpperCase()}`];
                config.clientKey = process.env[`MTLS_CLIENT_KEY_${spoke.instanceCode.toUpperCase()}`];
                config.caCert = process.env[`MTLS_CA_CERT_${spoke.instanceCode.toUpperCase()}`];
                break;

            case 'jwt':
                // JWT issuer from Keycloak realm (environment-specific)
                const keycloakBaseUrl = process.env[`KEYCLOAK_URL_${spoke.instanceCode.toUpperCase()}`]
                    || process.env.KEYCLOAK_URL;
                if (keycloakBaseUrl) {
                    config.jwtIssuer = `${keycloakBaseUrl}/realms/dive-v3-broker`;
                }
                break;

            case 'apikey':
                // API key from environment
                config.apiKey = process.env[`API_KEY_${spoke.instanceCode.toUpperCase()}`];
                config.apiKeyHeader = 'X-Federation-API-Key';
                break;

            case 'oauth2':
                // OAuth2 credentials from environment
                config.oauth2ClientId = process.env[`OAUTH2_CLIENT_ID_${spoke.instanceCode.toUpperCase()}`];
                config.oauth2ClientSecret = process.env[`OAUTH2_CLIENT_SECRET_${spoke.instanceCode.toUpperCase()}`];
                config.oauth2TokenUrl = process.env[`OAUTH2_TOKEN_URL_${spoke.instanceCode.toUpperCase()}`];
                break;
        }

        return config;
    }

    /**
     * Build policy translation rules
     * Can be extended to load from database if needed
     */
    private buildPolicyTranslation(spoke: IMongoSpokeRegistration): IKASRegistryEntry['policyTranslation'] {
        // Standard clearance mappings (can be customized per spoke)
        const clearanceMapping: Record<string, string> = {
            'TOP_SECRET': 'TOP_SECRET',
            'SECRET': 'SECRET',
            'CONFIDENTIAL': 'CONFIDENTIAL',
            'UNCLASSIFIED': 'UNCLASSIFIED',
        };

        // Add country-specific mappings
        const instanceCode = spoke.instanceCode.toUpperCase();
        switch (instanceCode) {
            case 'FRA':
                clearanceMapping['TRES_SECRET_DEFENSE'] = 'TOP_SECRET';
                clearanceMapping['SECRET_DEFENSE'] = 'SECRET';
                clearanceMapping['CONFIDENTIEL_DEFENSE'] = 'CONFIDENTIAL';
                clearanceMapping['DIFFUSION_RESTREINTE'] = 'CONFIDENTIAL';
                clearanceMapping['NON_PROTEGE'] = 'UNCLASSIFIED';
                break;

            case 'DEU':
                clearanceMapping['STRENG_GEHEIM'] = 'TOP_SECRET';
                clearanceMapping['GEHEIM'] = 'SECRET';
                clearanceMapping['VS_VERTRAULICH'] = 'CONFIDENTIAL';
                clearanceMapping['VS_NUR_FUER_DEN_DIENSTGEBRAUCH'] = 'CONFIDENTIAL';
                clearanceMapping['OFFEN'] = 'UNCLASSIFIED';
                break;

            case 'GBR':
                clearanceMapping['OFFICIAL_SENSITIVE'] = 'CONFIDENTIAL';
                clearanceMapping['OFFICIAL'] = 'UNCLASSIFIED';
                break;
        }

        return {
            clearanceMapping,
        };
    }

    /**
     * Reload KAS registry from MongoDB (for updates)
     */
    async reload(): Promise<number> {
        kasLogger.info('Reloading KAS registry from MongoDB');
        return this.loadFromMongoDB();
    }

    /**
     * Close MongoDB connection
     */
    async close(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.initialized = false;
            kasLogger.info('MongoDB KAS Registry Loader closed');
        }
    }

    /**
     * Ensure initialized
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            await this.initialize();
        }
    }
}

/**
 * Singleton instance
 */
export const mongoKASRegistryLoader = new MongoKASRegistryLoader();

/**
 * Initialize KAS registry from MongoDB (SSOT)
 *
 * IMPORTANT: This is the ONLY way to load KAS registry in production
 * JSON files are deprecated and NOT used
 */
export async function initializeKASRegistryFromMongoDB(): Promise<number> {
    try {
        kasLogger.info('Initializing KAS registry from MongoDB (SSOT)');

        await mongoKASRegistryLoader.initialize();
        const loadedCount = await mongoKASRegistryLoader.loadFromMongoDB();

        kasLogger.info('KAS registry initialized from MongoDB', {
            loadedCount,
            source: 'MongoDB federation_spokes collection',
        });

        return loadedCount;

    } catch (error) {
        kasLogger.error('Failed to initialize KAS registry from MongoDB', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        // In development, fall back to empty registry with warning
        if (process.env.NODE_ENV === 'development') {
            kasLogger.warn('Development mode: KAS registry empty, federation will not work');
            return 0;
        }

        throw error;
    }
}
