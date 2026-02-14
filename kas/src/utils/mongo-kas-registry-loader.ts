/**
 * MongoDB-Backed KAS Registry Loader
 *
 * Loads KAS registry from MongoDB kas_registry collection (SSOT)
 * Replaces legacy JSON file-based registry
 *
 * CRITICAL FIX (2026-02-07): Updated to use kas_registry collection
 * ROOT CAUSE: Code expected federation_spokes, but deployment populates kas_registry
 * Reference: backend/src/routes/kas.routes.ts POST /api/kas/register
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
// CRITICAL FIX (2026-02-07): Use kas_registry collection, not federation_spokes
// ROOT CAUSE: Deployment scripts populate kas_registry via /api/kas/register
// FIX: Load from actual collection where data exists
const COLLECTION_NAME = 'kas_registry';

/**
 * KAS Registry Entry from MongoDB
 * Schema from deployment via /api/kas/register (backend/src/routes/kas.routes.ts)
 * 
 * CRITICAL FIX (2026-02-07): Updated to match actual kas_registry schema
 * ROOT CAUSE: Interface expected federation_spokes schema, but data is in kas_registry
 * FIX: Match actual MongoDB document structure
 */
interface IMongoKASRegistryEntry {
    kasId: string;                    // e.g., "fra-kas"
    organization: string;              // e.g., "France"
    countryCode: string;               // e.g., "FRA"
    kasUrl: string;                    // External URL (environment-specific)
    internalKasUrl?: string;           // Docker network URL (internal)
    authMethod: 'mtls' | 'jwt' | 'apikey' | 'oauth2';
    authConfig?: {
        jwtIssuer?: string;
        apiKey?: string;
        clientCert?: string;
        // ... other auth fields
    };
    trustLevel: 'high' | 'medium' | 'low';
    supportedCountries: string[];
    supportedCOIs: string[];
    enabled: boolean;
    status: 'active' | 'inactive' | 'suspended';
    metadata?: {
        version?: string;
        capabilities?: string[];
        contact?: string;
        registeredAt?: Date;
        lastHeartbeat?: Date;
    };
}

/**
 * MongoDB-backed KAS Registry Loader
 */
export class MongoKASRegistryLoader {
    private client: MongoClient | null = null;
    private db: Db | null = null;
    private collection: Collection<IMongoKASRegistryEntry> | null = null;
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
            this.collection = this.db.collection<IMongoKASRegistryEntry>(COLLECTION_NAME);

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

            // CRITICAL FIX (2026-02-07): Query for 'active' status and enabled, not 'approved'
            // ROOT CAUSE: kas_registry uses 'active' status and 'enabled' flag
            // FIX: Match actual data schema from deployment
            const kasInstances = await this.collection!
                .find({ 
                    status: 'active',
                    enabled: true 
                })
                .toArray();

            kasLogger.info(`Found ${kasInstances.length} active KAS instances in MongoDB`);

            let loadedCount = 0;

            for (const kasEntry of kasInstances) {
                try {
                    const registryEntry = this.convertKASEntryToRegistryEntry(kasEntry);
                    kasRegistry.register(registryEntry);
                    loadedCount++;

                    kasLogger.debug('Loaded KAS from MongoDB', {
                        kasId: registryEntry.kasId,
                        organization: registryEntry.organization,
                        countryCode: kasEntry.countryCode,
                    });

                } catch (error) {
                    kasLogger.error('Failed to convert KAS entry', {
                        kasId: kasEntry.kasId,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    });
                }
            }

            kasLogger.info('KAS registry loaded from MongoDB', {
                totalInstances: kasInstances.length,
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
     * Convert MongoDB KAS registry entry to internal KAS registry format
     * 
     * CRITICAL FIX (2026-02-07): Updated to use kas_registry schema
     * ROOT CAUSE: Function expected federation_spokes fields (spokeId, instanceCode)
     * FIX: Use kas_registry fields (kasId, countryCode)
     */
    private convertKASEntryToRegistryEntry(kasEntry: IMongoKASRegistryEntry): IKASRegistryEntry {
        // Use kasUrl as-is from registry (already includes /rewrap if needed)
        const kasUrl = kasEntry.kasUrl || kasEntry.internalKasUrl || '';

        // Auth config from registry (already structured correctly)
        const authConfig = kasEntry.authConfig || {};

        // Build policy translation rules
        const policyTranslation = this.buildPolicyTranslation(kasEntry.countryCode);

        return {
            kasId: kasEntry.kasId,
            organization: kasEntry.organization,
            kasUrl,
            authMethod: kasEntry.authMethod,
            authConfig,
            trustLevel: kasEntry.trustLevel,
            supportedCountries: kasEntry.supportedCountries || [],
            supportedCOIs: kasEntry.supportedCOIs || [],
            policyTranslation,
            metadata: {
                version: kasEntry.metadata?.version || '1.0.0',
                capabilities: kasEntry.metadata?.capabilities || ['acp240'],
                contact: kasEntry.metadata?.contact || '',
                lastVerified: kasEntry.metadata?.lastHeartbeat?.toISOString() || new Date().toISOString(),
            },
        };
    }

    /**
     * Build policy translation rules
     * Can be extended to load from database if needed
     * 
     * UPDATED (2026-02-07): Takes countryCode directly instead of full spoke object
     */
    private buildPolicyTranslation(countryCode: string): IKASRegistryEntry['policyTranslation'] {
        // Standard clearance mappings (all 5 levels)
        const clearanceMapping: Record<string, string> = {
            'TOP_SECRET': 'TOP_SECRET',
            'SECRET': 'SECRET',
            'CONFIDENTIAL': 'CONFIDENTIAL',
            'RESTRICTED': 'RESTRICTED',
            'UNCLASSIFIED': 'UNCLASSIFIED',
        };

        // Add country-specific mappings
        // FIX: DIFFUSION_RESTREINTE=RESTRICTED (was CONFIDENTIAL), VS_NUR_FUER...=RESTRICTED (was CONFIDENTIAL),
        //      OFFICIAL_SENSITIVE=RESTRICTED (was CONFIDENTIAL) — aligned with CLEARANCE_EQUIVALENCY_TABLE SSOT
        switch (countryCode.toUpperCase()) {
            case 'FRA':
                clearanceMapping['TRES_SECRET_DEFENSE'] = 'TOP_SECRET';
                clearanceMapping['SECRET_DEFENSE'] = 'SECRET';
                clearanceMapping['CONFIDENTIEL_DEFENSE'] = 'CONFIDENTIAL';
                clearanceMapping['DIFFUSION_RESTREINTE'] = 'RESTRICTED';
                clearanceMapping['NON_PROTEGE'] = 'UNCLASSIFIED';
                clearanceMapping['NON_CLASSIFIE'] = 'UNCLASSIFIED';
                break;

            case 'DEU':
                clearanceMapping['STRENG_GEHEIM'] = 'TOP_SECRET';
                clearanceMapping['GEHEIM'] = 'SECRET';
                clearanceMapping['VS_VERTRAULICH'] = 'CONFIDENTIAL';
                clearanceMapping['VS_NUR_FUER_DEN_DIENSTGEBRAUCH'] = 'RESTRICTED';
                clearanceMapping['OFFEN'] = 'UNCLASSIFIED';
                break;

            case 'GBR':
                clearanceMapping['OFFICIAL_SENSITIVE'] = 'RESTRICTED';
                clearanceMapping['OFFICIAL'] = 'UNCLASSIFIED';
                break;

            case 'ITA':
                clearanceMapping['SEGRETISSIMO'] = 'TOP_SECRET';
                clearanceMapping['SEGRETO'] = 'SECRET';
                clearanceMapping['RISERVATO'] = 'CONFIDENTIAL';
                clearanceMapping['USO_UFFICIALE'] = 'RESTRICTED';
                clearanceMapping['NON_CLASSIFICATO'] = 'UNCLASSIFIED';
                break;

            case 'ESP':
                clearanceMapping['ALTO_SECRETO'] = 'TOP_SECRET';
                clearanceMapping['SECRETO'] = 'SECRET';
                clearanceMapping['CONFIDENCIAL'] = 'CONFIDENTIAL';
                clearanceMapping['DIFUSION_LIMITADA'] = 'RESTRICTED';
                clearanceMapping['NO_CLASIFICADO'] = 'UNCLASSIFIED';
                break;

            case 'POL':
                clearanceMapping['SCISLE_TAJNE'] = 'TOP_SECRET';
                clearanceMapping['TAJNE'] = 'SECRET';
                clearanceMapping['POUFNE'] = 'CONFIDENTIAL';
                clearanceMapping['ZASTRZEZIONE'] = 'CONFIDENTIAL';
                clearanceMapping['UZYTEK_SLUZBOWY'] = 'RESTRICTED';
                clearanceMapping['NIEJAWNE'] = 'UNCLASSIFIED';
                break;

            case 'NLD':
                clearanceMapping['ZEER_GEHEIM'] = 'TOP_SECRET';
                clearanceMapping['GEHEIM'] = 'SECRET';
                clearanceMapping['VERTROUWELIJK'] = 'CONFIDENTIAL';
                clearanceMapping['DEPARTEMENTAAL_VERTROUWELIJK'] = 'RESTRICTED';
                clearanceMapping['NIET_GERUBRICEERD'] = 'UNCLASSIFIED';
                break;

            case 'CAN':
                clearanceMapping['PROTECTED_C'] = 'SECRET';
                clearanceMapping['PROTECTED_B'] = 'CONFIDENTIAL';
                clearanceMapping['PROTECTED_A'] = 'RESTRICTED';
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
            source: 'MongoDB kas_registry collection',
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
