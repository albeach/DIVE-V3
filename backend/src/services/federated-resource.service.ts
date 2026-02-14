/**
 * Federated Resource Service
 * Phase 3, Task 3.1-3.4: Distributed Query Federation
 *
 * Provides direct MongoDB connections to all federated instances for
 * high-performance cross-instance resource queries.
 *
 * Features:
 * - Connection pooling to all federated instance MongoDBs
 * - Parallel query execution with timeout handling
 * - Circuit breaker pattern for unavailable instances
 * - ABAC filtering based on user attributes
 * - Result caching with Redis (optional)
 * - **DYNAMIC SPOKE LOADING**: Approved spokes from Hub-Spoke Registry
 *
 * NATO Compliance: ACP-240 §5.4 (Federated Resource Access)
 */

import { MongoClient, Db } from 'mongodb';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import https from 'https';
import { logger } from '../utils/logger';
import { getMongoDBUrl, getMongoDBName } from '../utils/mongodb-config';
import { hubSpokeRegistry } from './hub-spoke-registry.service';

// Create axios instance with custom HTTPS agent for self-signed certs
const httpsAgent = new https.Agent({
    rejectUnauthorized: process.env.NODE_ENV !== 'development'
});
const federationAxios = (axios as any).create ? (axios as any).create({ httpsAgent, timeout: 8000 }) : (axios as any);

// ============================================
// Interfaces
// ============================================

export interface IFederatedInstance {
    code: string;
    name: string;
    type: 'local' | 'remote';
    enabled: boolean;
    mongoUrl: string;
    mongoDatabase: string;
    apiUrl?: string; // For HTTP-based federation to remote instances
    useApiMode?: boolean; // True if we should use API instead of direct MongoDB
    connection?: {
        client: MongoClient;
        db: Db;
        lastConnected: Date;
    };
    circuitBreaker: {
        state: 'closed' | 'open' | 'half-open';
        failures: number;
        lastFailure?: Date;
        nextRetry?: Date;
    };
}

export interface IFederatedSearchOptions {
    query?: string;
    classification?: string[];
    releasableTo?: string[];
    coi?: string[];
    encrypted?: boolean;
    originRealm?: string;
    limit?: number;
    offset?: number;
    instances?: string[];
    /** Authorization header to forward to remote instances */
    authHeader?: string;
}

export interface IFederatedSearchResult {
    resourceId: string;
    title: string;
    classification: string;
    releasabilityTo: string[];
    COI: string[];
    encrypted: boolean;
    creationDate?: string;
    displayMarking?: string;
    originRealm: string;
    sourceInstance: string;
}

export interface IFacetItem {
    value: string;
    label?: string;
    count: number;
}

export interface IFederatedFacets {
    classifications: IFacetItem[];
    countries: IFacetItem[];
    cois: IFacetItem[];
    instances: IFacetItem[];
    encryptionStatus: IFacetItem[];
    fileTypes: IFacetItem[];
}

export interface IDocumentStats {
    avgDocAgeDays: number | null;
    newestDocDate: string | null;
    oldestDocDate: string | null;
    totalWithDates: number;
}

export interface IFederatedSearchResponse {
    totalResults: number;
    /** Sum of accessible documents across all instances (ABAC-filtered) */
    totalAccessible: number;
    results: IFederatedSearchResult[];
    facets?: IFederatedFacets;
    stats?: IDocumentStats;
    instanceResults: Record<string, {
        count: number;
        /** Total ABAC-accessible documents in this instance */
        accessibleCount: number;
        latencyMs: number;
        error?: string;
        circuitBreakerState: string;
    }>;
    executionTimeMs: number;
    cacheHit: boolean;
}

export interface IUserAttributes {
    uniqueID: string;
    clearance: string;
    countryOfAffiliation: string;
    acpCOI?: string[];
}

// ============================================
// Constants
// ============================================

const CIRCUIT_BREAKER_THRESHOLD = 3; // Failures before opening circuit
const CIRCUIT_BREAKER_TIMEOUT_MS = 30000; // Time before half-open retry
const QUERY_TIMEOUT_MS = 5000; // Per-instance query timeout
const REMOTE_QUERY_TIMEOUT_MS = 8000; // Remote instance query timeout
// Increased from 100 to 500 - allows better pagination across federated instances
// The actual per-page limit is controlled by the client request
const MAX_RESULTS_PER_INSTANCE = 500;

const CLEARANCE_HIERARCHY: Record<string, number> = {
    'UNCLASSIFIED': 0,
    'RESTRICTED': 0.5,
    'CONFIDENTIAL': 1,
    'SECRET': 2,
    'TOP_SECRET': 3
};

// ============================================
// FederatedResourceService Class
// ============================================

class FederatedResourceService {
    private instances: Map<string, IFederatedInstance> = new Map();
    private initialized = false;
    private currentInstanceRealm: string;

    constructor() {
        // CRITICAL FIX: Use INSTANCE_CODE (which is set by spoke deployment)
        // Fall back to INSTANCE_REALM for backward compatibility, then to USA
        this.currentInstanceRealm = process.env.INSTANCE_CODE || process.env.INSTANCE_REALM || 'USA';
        logger.info('FederatedResourceService using instance realm', {
            currentInstanceRealm: this.currentInstanceRealm,
            fromEnv: process.env.INSTANCE_CODE ? 'INSTANCE_CODE' : (process.env.INSTANCE_REALM ? 'INSTANCE_REALM' : 'default')
        });
    }

    /**
     * Initialize connections to all federated instances
     * Loads configuration from federation-registry.json
     *
     * CRITICAL FIX: If current instance is not in the registry (dynamic spoke),
     * automatically register it as a local instance with MongoDB connection.
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            logger.debug('FederatedResourceService already initialized');
            return;
        }

        logger.info('Initializing FederatedResourceService', {
            currentInstance: this.currentInstanceRealm
        });

        // Load federation instances from MongoDB (Hub) or Hub API (Spokes)
        // This replaces the static federation-registry.json file
        try {
            const { federationDiscovery } = await import('./federation-discovery.service');
            const discoveredInstances = await federationDiscovery.getInstances();

            logger.info('FEDERATION DIAGNOSTIC: Discovery returned instances', {
                count: discoveredInstances.length,
                instances: discoveredInstances.map(i => ({
                    code: i.code,
                    type: i.type,
                    enabled: i.enabled,
                    hasApiEndpoint: !!i.endpoints?.api,
                    hasApiInternalEndpoint: !!i.endpoints?.apiInternal,
                    hasBackendService: !!i.services?.backend,
                    containerName: i.services?.backend?.containerName
                }))
            });

            for (const inst of discoveredInstances) {
                if (!inst.enabled) {
                    logger.warn(`FEDERATION DIAGNOSTIC: Instance ${inst.code} is DISABLED, skipping`, {
                        code: inst.code,
                        type: inst.type,
                        hint: 'Instance disabled in federation_spokes or not approved'
                    });
                    continue;
                }

                try {
                    const federatedInstance = await this.createInstanceFromDiscovery(inst);
                    this.instances.set(inst.code.toUpperCase(), federatedInstance);
                    logger.info(`Initialized federated instance: ${inst.code}`, {
                        code: federatedInstance.code,
                        type: federatedInstance.type,
                        useApiMode: federatedInstance.useApiMode,
                        apiUrl: federatedInstance.apiUrl,
                        hasMongoUrl: !!federatedInstance.mongoUrl,
                        source: 'mongodb-discovery'
                    });
                } catch (error) {
                    logger.error(`FEDERATION DIAGNOSTIC: Failed to initialize instance ${inst.code}`, {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        instanceData: { code: inst.code, type: inst.type, endpoints: inst.endpoints }
                    });
                }
            }
        } catch (error) {
            logger.error('Failed to load federation instances from discovery service', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            // No fallback - MongoDB is the sole source of truth
            throw new Error(
                `Federation discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
                `MongoDB is the exclusive SSOT for federation data.`
            );
        }

        // CRITICAL FIX: Ensure current instance is always registered
        // This handles dynamically deployed spokes that aren't in the static registry
        if (!this.instances.has(this.currentInstanceRealm)) {
            logger.info(`Current instance ${this.currentInstanceRealm} not in registry, registering dynamically`);
            await this.registerCurrentInstance();
        }

        this.initialized = true;
        logger.info('FederatedResourceService initialized', {
            instances: Array.from(this.instances.keys()),
            currentInstance: this.currentInstanceRealm
        });
    }

    /**
     * Dynamically register the current instance when not in static registry
     * Uses environment variables to configure MongoDB connection
     */
    private async registerCurrentInstance(): Promise<void> {
        const instanceCode = this.currentInstanceRealm;
        const instanceName = process.env.INSTANCE_NAME || `${instanceCode} Instance`;

        // Get MongoDB configuration from environment
        const mongoUrl = getMongoDBUrl();
        const mongoDatabase = getMongoDBName();

        if (!mongoUrl) {
            logger.error(`Cannot register current instance ${instanceCode}: No MongoDB URL configured`);
            return;
        }

        const federatedInstance: IFederatedInstance = {
            code: instanceCode,
            name: instanceName,
            type: 'local',
            enabled: true,
            mongoUrl,
            mongoDatabase,
            useApiMode: false,
            circuitBreaker: {
                state: 'closed',
                failures: 0
            }
        };

        this.instances.set(instanceCode, federatedInstance);
        logger.info(`Dynamically registered current instance: ${instanceCode}`, {
            code: instanceCode,
            name: instanceName,
            database: mongoDatabase,
            hasMongoUrl: !!mongoUrl
        });
    }

    /**
     * PHASE 4: Dynamically load approved spokes from Hub-Spoke Registry
     * This enables querying spoke instances that aren't in the static registry
     *
     * Called before each federated search to ensure new spokes are immediately queryable
     */
    private spokeRefreshTimestamp = 0;
    private readonly SPOKE_REFRESH_INTERVAL_MS = 60000; // 1 minute

    async refreshApprovedSpokes(): Promise<void> {
        const now = Date.now();

        // Skip if recently refreshed
        if (now - this.spokeRefreshTimestamp < this.SPOKE_REFRESH_INTERVAL_MS) {
            return;
        }

        try {
            const approvedSpokes = await hubSpokeRegistry.listActiveSpokes();
            let addedCount = 0;

            logger.debug('FEDERATION DIAGNOSTIC: refreshApprovedSpokes result', {
                approvedSpokeCount: approvedSpokes.length,
                spokes: approvedSpokes.map(s => ({
                    code: s.instanceCode,
                    status: s.status,
                    hasApiUrl: !!s.apiUrl,
                    apiUrl: s.apiUrl,
                    hasInternalApiUrl: !!(s as any).internalApiUrl
                })),
                alreadyRegistered: Array.from(this.instances.keys())
            });

            for (const spoke of approvedSpokes) {
                // Skip if already registered or no API URL
                if (this.instances.has(spoke.instanceCode)) {
                    logger.debug(`Spoke ${spoke.instanceCode} already registered, skipping`);
                    continue;
                }
                if (!spoke.apiUrl) {
                    logger.warn(`FEDERATION DIAGNOSTIC: Spoke ${spoke.instanceCode} has no apiUrl, cannot register for federation`, {
                        spokeId: spoke.spokeId,
                        status: spoke.status
                    });
                    continue;
                }

                // Use internalApiUrl if available (for Docker network access)
                // Otherwise fall back to public apiUrl (works for local dev)
                const spokeAny = spoke as any;
                const effectiveApiUrl = spokeAny.internalApiUrl || spoke.apiUrl;

                // Register spoke as API-mode instance (we don't have direct MongoDB access)
                const federatedInstance: IFederatedInstance = {
                    code: spoke.instanceCode,
                    name: spoke.name,
                    type: 'remote',
                    enabled: spoke.status === 'approved',
                    mongoUrl: '', // Not available for spokes - use API mode
                    mongoDatabase: '',
                    apiUrl: effectiveApiUrl,
                    useApiMode: true, // Use HTTP API instead of direct MongoDB
                    circuitBreaker: {
                        state: 'closed',
                        failures: 0
                    }
                };

                this.instances.set(spoke.instanceCode, federatedInstance);
                addedCount++;

                logger.info(`Registered approved spoke as federation endpoint`, {
                    code: spoke.instanceCode,
                    name: spoke.name,
                    apiUrl: effectiveApiUrl,
                    publicApiUrl: spoke.apiUrl,
                    useApiMode: true
                });
            }

            this.spokeRefreshTimestamp = now;

            if (addedCount > 0) {
                logger.info('Refreshed approved spokes for federation', {
                    addedCount,
                    totalInstances: this.instances.size,
                    instances: Array.from(this.instances.keys())
                });
            }
        } catch (error) {
            logger.warn('Failed to refresh approved spokes', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Invalidate spoke cache to force immediate refresh
     */
    invalidateSpokeCache(): void {
        this.spokeRefreshTimestamp = 0;
        logger.info('Spoke cache invalidated for FederatedResourceService');
    }

    /**
     * Create federated instance from discovery service
     */
    private async createInstanceFromDiscovery(inst: any): Promise<IFederatedInstance> {
        const instanceCode = inst.code.toUpperCase();
        const backendService = inst.services?.backend;

        // Determine API URL (prefer internal Docker network)
        let apiUrl = '';
        const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

        if (isDevelopment && backendService?.containerName) {
            // Use Docker internal hostname for inter-container communication
            apiUrl = `https://${backendService.containerName}:${backendService.internalPort || 4000}`;
        } else {
            // Use external API URL
            apiUrl = inst.endpoints.api;
        }

        // Determine connection mode
        // Only use direct MongoDB for current instance, all others use API mode
        const isCurrentInstance = instanceCode === this.currentInstanceRealm;

        let mongoUrl = '';
        let mongoDatabase = '';
        let useApiMode = !isCurrentInstance; // Always use API for remote instances

        if (isCurrentInstance) {
            // Current instance - use direct MongoDB connection
            mongoUrl = process.env.MONGODB_URL || process.env.MONGODB_URI || '';
            mongoDatabase = process.env.MONGODB_DATABASE || `dive-v3-${instanceCode.toLowerCase()}`;
            logger.debug('Configured current instance with direct MongoDB', {
                code: instanceCode,
                database: mongoDatabase
            });
        } else {
            // Remote instance - ALWAYS use API mode (no direct MongoDB access across instances)
            logger.debug('Configured remote instance with API mode', {
                code: instanceCode,
                apiUrl
            });
        }

        return {
            code: instanceCode,
            name: inst.name,
            // CRITICAL FIX: Current instance is always 'local', others are 'remote'
            type: isCurrentInstance ? 'local' : 'remote',
            enabled: inst.enabled,
            mongoUrl,
            mongoDatabase,
            apiUrl,
            useApiMode,
            circuitBreaker: {
                state: 'closed',
                failures: 0
            }
        };
    }


    /**
     * Create instance configuration with MongoDB connection details
     * For non-current instances, uses API-based federation via Cloudflare tunnels
     *
     * FIX: For current instance, use existing MONGODB_URL environment variable
     * instead of building a new one (ensures consistency with paginated-search.controller.ts)
     */
    private async createInstanceConfig(key: string, inst: any): Promise<IFederatedInstance> {
        const instanceCode = key.toUpperCase();
        const isSameInstance = instanceCode === this.currentInstanceRealm;

        // For different instances, use API-based federation (more reliable across networks)
        const useApiMode = !isSameInstance;

        // Build API URL for HTTP-based federation
        const backendService = inst.services?.backend;
        let apiUrl: string;

        // Check environment for explicit URL override first
        const envApiUrl = process.env[`${instanceCode}_API_URL`];
        if (envApiUrl) {
            apiUrl = envApiUrl;
        } else if (inst.type === 'remote') {
            // Remote instances use production hostnames
            apiUrl = `https://${backendService?.hostname || `${key.toLowerCase()}-api.dive25.com`}`;
        } else {
            // LOCAL instances in development: Use Docker internal hostname for inter-container communication
            // This is CRITICAL for federated search to work between Hub and Spokes
            const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
            if (isDevelopment && backendService?.containerName) {
                // Use Docker internal hostname (container name) with internal port
                apiUrl = `https://${backendService.containerName}:${backendService.internalPort || 4000}`;
            } else {
                // Production: Use hostname from registry
                apiUrl = `https://${backendService?.hostname || `${key.toLowerCase()}-api.dive25.com`}`;
            }
        }

        // For MongoDB connection, use existing env var for current instance
        let mongoUrl: string = '';
        let mongoDatabase: string = '';

        if (isSameInstance) {
            // FIX: Use the existing MONGODB_URL environment variable
            // This ensures consistency with paginated-search.controller.ts
            // The env var is already configured correctly in docker-compose
            mongoUrl = getMongoDBUrl();
            mongoDatabase = getMongoDBName();

            logger.info(`Using existing MongoDB URL for ${instanceCode}`, {
                database: mongoDatabase,
                hasUrl: !!mongoUrl
            });
        }

        logger.info(`Configured instance ${instanceCode}`, {
            useApiMode,
            apiUrl: useApiMode ? apiUrl : undefined,
            hasMongoDB: isSameInstance
        });

        return {
            code: inst.code,
            name: inst.name,
            type: inst.type,
            enabled: inst.enabled,
            mongoUrl,
            mongoDatabase,
            apiUrl,
            useApiMode,
            circuitBreaker: {
                state: 'closed',
                failures: 0
            }
        };
    }

    /**
     * Get or create MongoDB connection for an instance
     */
    private async getConnection(instance: IFederatedInstance): Promise<Db | null> {
        // Check circuit breaker
        if (instance.circuitBreaker.state === 'open') {
            const now = new Date();
            if (instance.circuitBreaker.nextRetry && now < instance.circuitBreaker.nextRetry) {
                logger.debug(`Circuit breaker OPEN for ${instance.code}, skipping`);
                return null;
            }
            // Try half-open
            instance.circuitBreaker.state = 'half-open';
            logger.info(`Circuit breaker HALF-OPEN for ${instance.code}, attempting reconnect`);
        }

        // Return existing connection if valid
        if (instance.connection?.client) {
            try {
                await instance.connection.client.db().admin().ping();
                return instance.connection.db;
            } catch {
                // Connection lost, reconnect below
                logger.warn(`Lost connection to ${instance.code}, reconnecting`);
            }
        }

        // Create new connection
        try {
            const client = new MongoClient(instance.mongoUrl, {
                connectTimeoutMS: instance.type === 'remote' ? REMOTE_QUERY_TIMEOUT_MS : QUERY_TIMEOUT_MS,
                socketTimeoutMS: instance.type === 'remote' ? REMOTE_QUERY_TIMEOUT_MS : QUERY_TIMEOUT_MS,
                maxPoolSize: 5,
                minPoolSize: 1
            });

            await client.connect();
            const db = client.db(instance.mongoDatabase);

            instance.connection = {
                client,
                db,
                lastConnected: new Date()
            };

            // Reset circuit breaker on success
            instance.circuitBreaker.state = 'closed';
            instance.circuitBreaker.failures = 0;

            logger.info(`Connected to MongoDB for ${instance.code}`, {
                database: instance.mongoDatabase
            });

            return db;

        } catch (error) {
            this.handleConnectionFailure(instance, error);
            return null;
        }
    }

    /**
     * Handle connection failure with circuit breaker logic
     */
    private handleConnectionFailure(instance: IFederatedInstance, error: unknown): void {
        instance.circuitBreaker.failures++;
        instance.circuitBreaker.lastFailure = new Date();

        if (instance.circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
            instance.circuitBreaker.state = 'open';
            instance.circuitBreaker.nextRetry = new Date(Date.now() + CIRCUIT_BREAKER_TIMEOUT_MS);
            logger.warn(`Circuit breaker OPENED for ${instance.code}`, {
                failures: instance.circuitBreaker.failures,
                nextRetry: instance.circuitBreaker.nextRetry
            });
        }

        logger.error(`Connection failed for ${instance.code}`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            failures: instance.circuitBreaker.failures,
            circuitState: instance.circuitBreaker.state
        });
    }

    /**
     * Get a specific resource from a target instance
     * Used for cross-instance resource detail access
     * @param authHeader User's Authorization header (required for remote API queries)
     */
    async getResourceFromInstance(
        resourceId: string,
        targetInstance: string,
        authHeader?: string
    ): Promise<any | null> {
        if (!this.initialized) {
            await this.initialize();
        }

        const instance = this.instances.get(targetInstance.toUpperCase());
        if (!instance || !instance.enabled) {
            logger.warn('Target instance not found or disabled', {
                targetInstance,
                available: Array.from(this.instances.keys())
            });
            return null;
        }

        try {
            if (!instance.useApiMode && instance.mongoUrl) {
                // Direct MongoDB access
                const MongoClient = (await import('mongodb')).MongoClient;
                const client = new MongoClient(instance.mongoUrl);

                await client.connect();
                const db = client.db(instance.mongoDatabase);
                const collection = db.collection('resources');
                const resource = await collection.findOne({ resourceId });
                await client.close();

                logger.info('Fetched cross-instance resource via MongoDB', {
                    resourceId,
                    sourceInstance: targetInstance,
                    found: !!resource
                });

                return resource;
            } else {
                // API mode: Query via HTTP with user's auth token
                const https = await import('https');
                const httpsAgent = new https.Agent({ rejectUnauthorized: false });

                if (!authHeader) {
                    logger.warn('No auth header provided for cross-instance resource query', {
                        resourceId,
                        targetInstance
                    });
                    return null;
                }

                const response = await fetch(`${instance.apiUrl}/api/resources/${resourceId}`, {
                    headers: {
                        'Authorization': authHeader  // Forward user's token
                    },
                    // @ts-ignore - Node fetch agent option
                    agent: httpsAgent
                });

                if (!response.ok) {
                    logger.warn('Cross-instance resource query failed', {
                        resourceId,
                        targetInstance,
                        status: response.status
                    });
                    return null;
                }

                const resource = await response.json();
                logger.info('Fetched cross-instance resource via API', {
                    resourceId,
                    sourceInstance: targetInstance
                });

                return resource;
            }
        } catch (error) {
            logger.error('Failed to fetch cross-instance resource', {
                resourceId,
                targetInstance,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
        }
    }

    /**
     * Execute federated search across all instances
     * Phase 3: Supports Redis caching for improved performance
     * Phase 4: Dynamically includes approved spokes as queryable endpoints
     */
    async search(
        options: IFederatedSearchOptions,
        userAttributes: IUserAttributes
    ): Promise<IFederatedSearchResponse> {
        const startTime = Date.now();

        if (!this.initialized) {
            await this.initialize();
        }

        // Phase 4: Refresh approved spokes (cached for 1 minute)
        // This ensures newly approved spokes are immediately queryable
        await this.refreshApprovedSpokes();

        // Phase 3: Check cache first
        try {
            const { federationCacheService } = await import('./federation-cache.service');
            const cached = await federationCacheService.get(options, userAttributes);
            if (cached) {
                logger.info('Federated search served from cache', {
                    query: options.query,
                    totalResults: cached.totalResults,
                    user: userAttributes.uniqueID
                });
                return cached;
            }
        } catch (cacheError) {
            // Cache unavailable, continue with live query
            logger.debug('Cache check failed, continuing with live query', {
                error: cacheError instanceof Error ? cacheError.message : 'Unknown error'
            });
        }

        // Log all registered instances for diagnostics
        const allRegisteredInstances = Array.from(this.instances.keys());
        const requestedInstances = options.instances?.map(i => i.toUpperCase()) || [];

        const targetInstances = options.instances?.length
            ? Array.from(this.instances.entries()).filter(([key]) =>
                requestedInstances.includes(key))
            : Array.from(this.instances.entries());

        // Detect missing instances (requested but not registered)
        const targetCodes = targetInstances.map(([key]) => key);
        const missingInstances = requestedInstances.filter(i => !allRegisteredInstances.includes(i));

        if (missingInstances.length > 0) {
            logger.error('FEDERATION DIAGNOSTIC: Requested instances NOT registered in service', {
                missingInstances,
                requestedInstances,
                registeredInstances: allRegisteredInstances,
                hint: 'Missing instances have no entry in federatedResourceService.instances map. ' +
                      'Check: 1) federation_spokes MongoDB collection, ' +
                      '2) spoke approval status, ' +
                      '3) federationDiscovery.getInstances() response'
            });
        }

        logger.info('Executing federated search', {
            requestedInstances,
            targetInstances: targetCodes,
            missingInstances,
            allRegisteredInstances,
            registeredInstanceDetails: Array.from(this.instances.entries()).map(([key, inst]) => ({
                code: key,
                type: inst.type,
                enabled: inst.enabled,
                useApiMode: inst.useApiMode,
                hasApiUrl: !!inst.apiUrl,
                apiUrl: inst.apiUrl ? inst.apiUrl.replace(/\/\/.*@/, '//***@') : undefined,
                circuitBreaker: inst.circuitBreaker.state
            })),
            query: options.query,
            classification: options.classification,
            user: userAttributes.uniqueID
        });

        // Execute parallel queries - now returns { results, accessibleCount, facets, stats }
        const searchPromises = targetInstances.map(async ([key, instance]) => {
            const instanceStart = Date.now();
            try {
                // Pass user attributes for ABAC filtering
                const searchResult = await this.searchInstance(instance, options, userAttributes);
                return {
                    key,
                    results: searchResult.results,
                    accessibleCount: searchResult.accessibleCount,
                    facets: searchResult.facets,
                    stats: searchResult.stats,
                    latencyMs: Date.now() - instanceStart,
                    error: undefined as string | undefined,
                    circuitBreakerState: instance.circuitBreaker.state
                };
            } catch (error) {
                return {
                    key,
                    results: [] as IFederatedSearchResult[],
                    accessibleCount: 0,
                    facets: undefined as IFederatedFacets | undefined,
                    stats: undefined as IDocumentStats | undefined,
                    latencyMs: Date.now() - instanceStart,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    circuitBreakerState: instance.circuitBreaker.state
                };
            }
        });

        const results = await Promise.all(searchPromises);

        // Aggregate results, sum accessible counts, merge facets and stats
        const allResults: IFederatedSearchResult[] = [];
        const instanceResults: Record<string, any> = {};
        const allFacets: IFederatedFacets[] = [];
        const allStats: IDocumentStats[] = [];
        let totalAccessible = 0;

        for (const result of results) {
            instanceResults[result.key] = {
                count: result.results.length,
                accessibleCount: result.accessibleCount,
                latencyMs: result.latencyMs,
                error: result.error,
                circuitBreakerState: result.circuitBreakerState
            };
            allResults.push(...result.results);
            totalAccessible += result.accessibleCount;
            if (result.facets) {
                allFacets.push(result.facets);
            }
            if (result.stats) {
                allStats.push(result.stats);
            }
        }

        // Merge facets from all instances
        const mergedFacets = this.mergeFacets(allFacets);

        // Merge stats from all instances (weighted average by document count)
        const mergedStats = this.mergeStats(allStats);

        // Apply ABAC filtering (safety net - primary ABAC is now in each instance)
        const filteredResults = this.applyABACFilter(allResults, userAttributes);

        // Deduplicate by resourceId (prefer local over federated)
        const deduped = this.deduplicateResults(filteredResults);

        // Sort merged results by title for consistent ordering across instances
        deduped.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

        // Apply limit and offset
        const offset = options.offset || 0;
        const limit = options.limit || MAX_RESULTS_PER_INSTANCE;
        const paginatedResults = deduped.slice(offset, offset + limit);

        const response: IFederatedSearchResponse = {
            totalResults: deduped.length,
            totalAccessible, // Sum of accessible docs from all instances
            results: paginatedResults,
            facets: mergedFacets,
            stats: mergedStats,
            instanceResults,
            executionTimeMs: Date.now() - startTime,
            cacheHit: false
        };

        // Phase 3: Cache the response for future requests
        try {
            const { federationCacheService } = await import('./federation-cache.service');
            await federationCacheService.set(options, userAttributes, response);
        } catch (cacheError) {
            // Cache write failed, log but don't fail the request
            logger.debug('Failed to cache federated search response', {
                error: cacheError instanceof Error ? cacheError.message : 'Unknown error'
            });
        }

        return response;
    }

    /**
     * Search a single instance
     * Uses API-based federation for remote instances, direct MongoDB for local
     * Returns both results and the total accessible count
     * Now includes ABAC filters (clearance, releasability) for accurate counts
     */
    private async searchInstance(
        instance: IFederatedInstance,
        options: IFederatedSearchOptions,
        userAttributes: IUserAttributes
    ): Promise<{ results: IFederatedSearchResult[]; accessibleCount: number; facets?: IFederatedFacets; stats?: IDocumentStats }> {
        // Use API-based federation for non-local instances
        // API calls already include auth token, so remote instance applies ABAC
        if (instance.useApiMode && instance.apiUrl) {
            return this.searchInstanceViaApi(instance, options);
        }

        // Direct MongoDB connection for local instance
        const db = await this.getConnection(instance);
        if (!db) {
            throw new Error(`Cannot connect to ${instance.code}`);
        }

        const collection = db.collection('resources');

        // Build MongoDB query with ABAC filters
        const query: any = { $and: [] };

        // ========================================
        // ABAC Filter 1: Classification (Clearance)
        // ========================================
        const userClearanceLevel = CLEARANCE_HIERARCHY[userAttributes.clearance] ?? 0;
        const allowedClassifications = Object.entries(CLEARANCE_HIERARCHY)
            .filter(([_, level]) => level <= userClearanceLevel)
            .map(([name]) => name);

        query.$and.push({
            $or: [
                { classification: { $in: allowedClassifications } },
                { 'ztdf.policy.securityLabel.classification': { $in: allowedClassifications } },
                // Allow null/missing classification (treat as UNCLASSIFIED)
                {
                    $and: [
                        { classification: { $exists: false } },
                        { 'ztdf.policy.securityLabel.classification': { $exists: false } }
                    ]
                }
            ]
        });

        // ========================================
        // ABAC Filter 2: Releasability (Country)
        // ========================================
        const userCountry = userAttributes.countryOfAffiliation;
        if (userCountry) {
            query.$and.push({
                $or: [
                    { releasabilityTo: userCountry },
                    { releasabilityTo: 'NATO' },
                    { releasabilityTo: 'FVEY' },
                    { 'ztdf.policy.securityLabel.releasabilityTo': userCountry },
                    { 'ztdf.policy.securityLabel.releasabilityTo': 'NATO' },
                    { 'ztdf.policy.securityLabel.releasabilityTo': 'FVEY' },
                ]
            });
        }

        // ========================================
        // UI Filters (optional, in addition to ABAC)
        // ========================================
        // Text search on title/resourceId
        if (options.query) {
            query.$and.push({
                $or: [
                    { title: { $regex: options.query, $options: 'i' } },
                    { resourceId: { $regex: options.query, $options: 'i' } }
                ]
            });
        }

        // UI Classification filter (further restrict)
        if (options.classification?.length) {
            query.$and.push({
                $or: [
                    { 'ztdf.policy.securityLabel.classification': { $in: options.classification } },
                    { classification: { $in: options.classification } }
                ]
            });
        }

        // UI Releasability filter (further restrict)
        if (options.releasableTo?.length) {
            query.$and.push({
                $or: [
                    { 'ztdf.policy.securityLabel.releasabilityTo': { $in: options.releasableTo } },
                    { releasabilityTo: { $in: options.releasableTo } }
                ]
            });
        }

        // UI COI filter
        if (options.coi?.length) {
            query.$and.push({
                $or: [
                    { 'ztdf.policy.securityLabel.COI': { $in: options.coi } },
                    { COI: { $in: options.coi } }
                ]
            });
        }

        // Execute query with timeout
        const timeoutMs = instance.type === 'remote' ? REMOTE_QUERY_TIMEOUT_MS : QUERY_TIMEOUT_MS;

        // Final query filter (use $and if we have conditions)
        const finalQuery = query.$and.length > 0 ? query : {};

        // Run main query and facet aggregation in parallel
        const [accessibleCount, documents, facetResult] = await Promise.all([
            // Get total ABAC-accessible count
            collection.countDocuments(finalQuery),
            // Get documents
            collection.find(finalQuery)
                .limit(MAX_RESULTS_PER_INSTANCE)
                .maxTimeMS(timeoutMs)
                .toArray(),
            // Get facets via aggregation
            collection.aggregate([
                { $match: finalQuery },
                {
                    $addFields: {
                        _computedReleasabilityTo: {
                            $ifNull: ['$ztdf.policy.securityLabel.releasabilityTo', '$releasabilityTo']
                        },
                        _computedCOI: {
                            $ifNull: ['$ztdf.policy.securityLabel.COI', '$COI']
                        }
                    }
                },
                {
                    $facet: {
                        classifications: [
                            { $group: { _id: { $ifNull: ['$ztdf.policy.securityLabel.classification', '$classification'] }, count: { $sum: 1 } } },
                            { $match: { _id: { $ne: null } } },
                            { $sort: { count: -1 } }
                        ],
                        countries: [
                            { $unwind: { path: '$_computedReleasabilityTo', preserveNullAndEmptyArrays: false } },
                            { $group: { _id: '$_computedReleasabilityTo', count: { $sum: 1 } } },
                            { $sort: { count: -1 } },
                            { $limit: 20 }
                        ],
                        cois: [
                            { $unwind: { path: '$_computedCOI', preserveNullAndEmptyArrays: false } },
                            { $match: { _computedCOI: { $ne: null } } },
                            { $group: { _id: '$_computedCOI', count: { $sum: 1 } } },
                            { $sort: { count: -1 } }
                        ],
                        encryptionStatus: [
                            { $group: { _id: { $cond: [{ $eq: ['$encrypted', true] }, 'encrypted', 'unencrypted'] }, count: { $sum: 1 } } },
                            { $sort: { _id: 1 } }
                        ],
                        fileTypes: [
                            {
                                $project: {
                                    contentType: '$ztdf.manifest.contentType',
                                    category: {
                                        $switch: {
                                            branches: [
                                                { case: { $regexMatch: { input: { $ifNull: ['$ztdf.manifest.contentType', ''] }, regex: '^image/', options: 'i' } }, then: 'images' },
                                                { case: { $regexMatch: { input: { $ifNull: ['$ztdf.manifest.contentType', ''] }, regex: '^video/', options: 'i' } }, then: 'videos' },
                                                { case: { $regexMatch: { input: { $ifNull: ['$ztdf.manifest.contentType', ''] }, regex: '^audio/', options: 'i' } }, then: 'audio' },
                                                { case: { $regexMatch: { input: { $ifNull: ['$ztdf.manifest.contentType', ''] }, regex: 'application/json|text/csv|application/xml|spreadsheet', options: 'i' } }, then: 'structured' },
                                                { case: { $regexMatch: { input: { $ifNull: ['$ztdf.manifest.contentType', ''] }, regex: 'pdf|msword|wordprocessing|presentation|powerpoint', options: 'i' } }, then: 'documents' },
                                                { case: { $regexMatch: { input: { $ifNull: ['$ztdf.manifest.contentType', ''] }, regex: 'zip|tar|gzip|rar|7z', options: 'i' } }, then: 'archives' },
                                                { case: { $regexMatch: { input: { $ifNull: ['$ztdf.manifest.contentType', ''] }, regex: 'javascript|text/html|text/css', options: 'i' } }, then: 'code' },
                                                { case: { $regexMatch: { input: { $ifNull: ['$ztdf.manifest.contentType', ''] }, regex: 'text/plain|text/markdown', options: 'i' } }, then: 'text' }
                                            ],
                                            default: 'other'
                                        }
                                    }
                                }
                            },
                            { $match: { category: { $ne: 'other' }, contentType: { $ne: null, $exists: true } } },
                            { $group: { _id: '$category', count: { $sum: 1 } } },
                            { $sort: { count: -1 } },
                            {
                                $project: {
                                    value: '$_id',
                                    label: {
                                        $switch: {
                                            branches: [
                                                { case: { $eq: ['$_id', 'documents'] }, then: 'Documents' },
                                                { case: { $eq: ['$_id', 'images'] }, then: 'Images' },
                                                { case: { $eq: ['$_id', 'videos'] }, then: 'Videos' },
                                                { case: { $eq: ['$_id', 'audio'] }, then: 'Audio' },
                                                { case: { $eq: ['$_id', 'structured'] }, then: 'Structured Data' },
                                                { case: { $eq: ['$_id', 'archives'] }, then: 'Archives' },
                                                { case: { $eq: ['$_id', 'code'] }, then: 'Code Files' },
                                                { case: { $eq: ['$_id', 'text'] }, then: 'Text Files' }
                                            ],
                                            default: '$_id'
                                        }
                                    },
                                    count: 1
                                }
                            }
                        ],
                        documentStats: [
                            {
                                $addFields: {
                                    _rawDate: { $ifNull: ['$ztdf.policy.securityLabel.creationDate', '$creationDate'] }
                                }
                            },
                            { $match: { _rawDate: { $exists: true, $ne: null } } },
                            {
                                $addFields: {
                                    _parsedDate: { $dateFromString: { dateString: '$_rawDate', onError: null } }
                                }
                            },
                            { $match: { _parsedDate: { $ne: null } } },
                            {
                                $group: {
                                    _id: null,
                                    avgAgeDays: {
                                        $avg: {
                                            $divide: [
                                                { $subtract: ['$$NOW', '$_parsedDate'] },
                                                86400000
                                            ]
                                        }
                                    },
                                    newestDoc: { $max: '$_parsedDate' },
                                    oldestDoc: { $min: '$_parsedDate' },
                                    count: { $sum: 1 }
                                }
                            }
                        ]
                    }
                }
            ], { maxTimeMS: timeoutMs }).toArray()
        ]);

        // Transform facet aggregation result
        const fr = facetResult[0] || {};
        const localFacets: IFederatedFacets = {
            classifications: (fr.classifications || []).map((f: any) => ({ value: f._id, count: f.count })),
            countries: (fr.countries || []).map((f: any) => ({ value: f._id, count: f.count })),
            cois: (fr.cois || []).map((f: any) => ({ value: f._id, count: f.count })),
            instances: [{ value: instance.code, count: accessibleCount }],
            encryptionStatus: (fr.encryptionStatus || []).map((f: any) => ({ value: f._id, count: f.count })),
            fileTypes: (fr.fileTypes || []).map((f: any) => ({ value: f.value, label: f.label, count: f.count })),
        };

        // Extract document stats
        let localStats: IDocumentStats | undefined;
        const ds = fr.documentStats?.[0];
        if (ds) {
            localStats = {
                avgDocAgeDays: ds.avgAgeDays != null ? Math.round(ds.avgAgeDays * 10) / 10 : null,
                newestDocDate: ds.newestDoc ? new Date(ds.newestDoc).toISOString() : null,
                oldestDocDate: ds.oldestDoc ? new Date(ds.oldestDoc).toISOString() : null,
                totalWithDates: ds.count || 0,
            };
        }

        logger.debug('Local instance search completed', {
            instance: instance.code,
            userClearance: userAttributes.clearance,
            userCountry,
            accessibleCount,
            returnedCount: documents.length,
            facetCounts: {
                classifications: localFacets.classifications.length,
                countries: localFacets.countries.length,
                fileTypes: localFacets.fileTypes.length,
            },
            stats: localStats ? { avgDocAgeDays: localStats.avgDocAgeDays, totalWithDates: localStats.totalWithDates } : 'none',
        });

        // Transform to federated search result format
        const results = documents.map(doc => this.transformDocument(doc, instance.code));

        return { results, accessibleCount, facets: localFacets, stats: localStats };
    }

    /**
     * Search instance via API (for cross-network federation)
     * Uses the instance's backend API through Cloudflare tunnels
     * Returns both results and the ABAC-accessible totalCount from the remote instance
     */
    private async searchInstanceViaApi(
        instance: IFederatedInstance,
        options: IFederatedSearchOptions
    ): Promise<{ results: IFederatedSearchResult[]; accessibleCount: number; facets?: IFederatedFacets; stats?: IDocumentStats }> {
        const apiUrl = `${instance.apiUrl}/api/resources/search`;

        logger.info(`FEDERATION DIAGNOSTIC: API search to ${instance.code}`, {
            apiUrl,
            query: options.query,
            hasAuth: !!options.authHeader,
            authHeaderPrefix: options.authHeader ? options.authHeader.substring(0, 20) + '...' : 'NONE',
            instanceType: instance.type,
            useApiMode: instance.useApiMode,
            circuitBreaker: instance.circuitBreaker.state
        });

        if (!options.authHeader) {
            logger.error(`FEDERATION DIAGNOSTIC: No auth header for ${instance.code} - remote search will fail with 401`, {
                hint: 'Auth header must be forwarded from the original request to authenticate with remote instance'
            });
        }

        // Build headers with optional auth
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Federated-From': this.currentInstanceRealm,
        };

        // Forward auth header if provided
        if (options.authHeader) {
            headers['Authorization'] = options.authHeader;
        }

        const requestBody = {
            query: options.query,
            filters: {
                classifications: options.classification,
                countries: options.releasableTo,
                cois: options.coi,
                encrypted: options.encrypted,
            },
            pagination: {
                limit: options.limit || MAX_RESULTS_PER_INSTANCE,
            },
            // Request facets from remote instances for aggregation
            includeFacets: true,
        };

        try {
            logger.debug(`FEDERATION DIAGNOSTIC: Sending request to ${instance.code}`, {
                url: apiUrl,
                body: requestBody
            });

            const response = await federationAxios.post(apiUrl, requestBody, {
                headers,
            });

            const responseResults = response.data.results || [];
            // Capture the ABAC-filtered totalCount from the remote instance
            const accessibleCount = response.data.pagination?.totalCount || responseResults.length;

            // Capture facets from remote instance response
            const remoteFacets: IFederatedFacets | undefined = response.data.facets ? {
                classifications: (response.data.facets.classifications || []).map((f: any) => ({ value: f.value, count: f.count })),
                countries: (response.data.facets.countries || []).map((f: any) => ({ value: f.value, count: f.count })),
                cois: (response.data.facets.cois || []).map((f: any) => ({ value: f.value, count: f.count })),
                instances: [{ value: instance.code, count: accessibleCount }],
                encryptionStatus: (response.data.facets.encryptionStatus || []).map((f: any) => ({ value: f.value, count: f.count })),
                fileTypes: (response.data.facets.fileTypes || []).map((f: any) => ({ value: f.value, label: f.label, count: f.count })),
            } : undefined;

            // Capture document stats from remote instance response
            const remoteStats: IDocumentStats | undefined = response.data.stats ? {
                avgDocAgeDays: response.data.stats.avgDocAgeDays,
                newestDocDate: response.data.stats.newestDocDate,
                oldestDocDate: response.data.stats.oldestDocDate,
                totalWithDates: response.data.stats.totalWithDates || 0,
            } : undefined;

            logger.info(`FEDERATION DIAGNOSTIC: API response from ${instance.code}`, {
                httpStatus: response.status,
                resultsCount: responseResults.length,
                accessibleCount,
                totalCount: response.data.pagination?.totalCount,
                hasMore: response.data.pagination?.hasMore,
                hasFacets: !!remoteFacets,
                facetCounts: remoteFacets ? {
                    classifications: remoteFacets.classifications.length,
                    countries: remoteFacets.countries.length,
                    fileTypes: remoteFacets.fileTypes.length,
                } : 'none',
                sampleResourceIds: responseResults.slice(0, 3).map((r: any) => r.resourceId),
            });

            // Transform to federated search result format
            const results = responseResults.map((doc: any) => ({
                resourceId: doc.resourceId,
                title: doc.title,
                classification: doc.classification || 'UNCLASSIFIED',
                releasabilityTo: doc.releasabilityTo || [],
                COI: doc.COI || doc.coi || [],
                encrypted: doc.encrypted || false,
                creationDate: doc.creationDate,
                displayMarking: doc.displayMarking,
                originRealm: doc.originRealm || instance.code,
                sourceInstance: instance.code,
            }));

            return { results, accessibleCount, facets: remoteFacets, stats: remoteStats };

        } catch (error) {
            // Enhanced error diagnostics for federation failures
            const errorDetails: Record<string, any> = {
                instance: instance.code,
                apiUrl,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                circuitBreakerState: instance.circuitBreaker.state,
                circuitBreakerFailures: instance.circuitBreaker.failures,
            };

            if (error.response) {
                errorDetails.httpStatus = error.response.status;
                errorDetails.httpStatusText = error.response.statusText;
                errorDetails.responseData = typeof error.response.data === 'string'
                    ? error.response.data.substring(0, 500)
                    : error.response.data;
            } else if (error.code) {
                errorDetails.errorCode = error.code;
                if (error.code === 'ECONNREFUSED') {
                    errorDetails.hint = `${instance.code} backend is not reachable at ${apiUrl}. Check: 1) spoke containers running, 2) dive-shared Docker network, 3) container name resolution`;
                } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                    errorDetails.hint = `${instance.code} backend timed out. Check: 1) spoke backend health, 2) network latency, 3) increase REMOTE_QUERY_TIMEOUT_MS`;
                } else if (error.code === 'ENOTFOUND') {
                    errorDetails.hint = `DNS resolution failed for ${apiUrl}. Check: 1) dive-shared network exists, 2) spoke containers are on dive-shared network`;
                }
            }

            logger.error(`FEDERATION DIAGNOSTIC: API search to ${instance.code} FAILED`, errorDetails);

            this.handleConnectionFailure(instance, error);
            throw new Error(`API federation failed for ${instance.code}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Transform MongoDB document to FederatedSearchResult
     */
    private transformDocument(doc: any, sourceInstance: string): IFederatedSearchResult {
        const ztdf = doc.ztdf;

        if (ztdf) {
            return {
                resourceId: doc.resourceId,
                title: doc.title,
                classification: ztdf.policy?.securityLabel?.classification || 'UNCLASSIFIED',
                releasabilityTo: ztdf.policy?.securityLabel?.releasabilityTo || [],
                COI: ztdf.policy?.securityLabel?.COI || [],
                encrypted: true,
                creationDate: ztdf.policy?.securityLabel?.creationDate,
                displayMarking: ztdf.policy?.securityLabel?.displayMarking,
                originRealm: doc.originRealm || sourceInstance,
                sourceInstance
            };
        }

        // Legacy format
        return {
            resourceId: doc.resourceId,
            title: doc.title,
            classification: doc.classification || 'UNCLASSIFIED',
            releasabilityTo: doc.releasabilityTo || [],
            COI: doc.COI || [],
            encrypted: doc.encrypted || false,
            creationDate: doc.creationDate,
            originRealm: doc.originRealm || sourceInstance,
            sourceInstance
        };
    }

    /**
     * Apply ABAC filtering based on user attributes
     *
     * Note: Results from remote instances (via API) are NOT re-filtered here
     * because the user already authenticated with the remote instance's ABAC.
     * Only local MongoDB results need filtering.
     */
    private applyABACFilter(
        results: IFederatedSearchResult[],
        user: IUserAttributes
    ): IFederatedSearchResult[] {
        const userClearanceLevel = CLEARANCE_HIERARCHY[user.clearance] ?? 0;
        const userCountry = user.countryOfAffiliation;
        const userCOIs = user.acpCOI || [];

        return results.filter(resource => {
            // Skip ABAC filtering for results from remote instances (API-based federation)
            // Those instances already authenticated and filtered for this user
            if (resource.sourceInstance !== this.currentInstanceRealm) {
                return true;
            }

            // Check clearance (local results only)
            const resourceLevel = CLEARANCE_HIERARCHY[resource.classification] ?? 0;
            if (userClearanceLevel < resourceLevel) {
                return false;
            }

            // Check releasability (local results only)
            if (!resource.releasabilityTo.includes(userCountry) &&
                !resource.releasabilityTo.includes('NATO') &&
                !resource.releasabilityTo.includes('FVEY')) {
                return false;
            }

            // Check COI (if resource has COI requirement, local results only)
            if (resource.COI && resource.COI.length > 0) {
                const hasCOI = resource.COI.some(coi => userCOIs.includes(coi));
                if (!hasCOI) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Deduplicate results, preferring local over federated
     */
    private deduplicateResults(results: IFederatedSearchResult[]): IFederatedSearchResult[] {
        const seen = new Map<string, IFederatedSearchResult>();

        for (const result of results) {
            const existing = seen.get(result.resourceId);
            if (!existing) {
                seen.set(result.resourceId, result);
            } else {
                // Prefer local (current instance) over federated
                const isCurrentLocal = result.sourceInstance === this.currentInstanceRealm;
                const isExistingLocal = existing.sourceInstance === this.currentInstanceRealm;

                if (isCurrentLocal && !isExistingLocal) {
                    seen.set(result.resourceId, result);
                }
            }
        }

        return Array.from(seen.values());
    }

    /**
     * Merge facets from multiple instances by summing counts for matching values.
     * For fileTypes, preserves the label from the first instance that provides it.
     */
    private mergeFacets(facetSets: IFederatedFacets[]): IFederatedFacets {
        const empty: IFederatedFacets = {
            classifications: [],
            countries: [],
            cois: [],
            instances: [],
            encryptionStatus: [],
            fileTypes: [],
        };

        if (facetSets.length === 0) return empty;
        if (facetSets.length === 1) return facetSets[0];

        const mergeSimple = (key: keyof IFederatedFacets): IFacetItem[] => {
            const merged = new Map<string, IFacetItem>();
            for (const facets of facetSets) {
                for (const item of facets[key]) {
                    const existing = merged.get(item.value);
                    if (existing) {
                        existing.count += item.count;
                    } else {
                        merged.set(item.value, { ...item });
                    }
                }
            }
            return Array.from(merged.values()).sort((a, b) => b.count - a.count);
        };

        return {
            classifications: mergeSimple('classifications'),
            countries: mergeSimple('countries'),
            cois: mergeSimple('cois'),
            instances: mergeSimple('instances'),
            encryptionStatus: mergeSimple('encryptionStatus'),
            fileTypes: mergeSimple('fileTypes'),
        };
    }

    /**
     * Merge document stats from multiple instances using weighted averages
     */
    private mergeStats(statsSets: IDocumentStats[]): IDocumentStats | undefined {
        const valid = statsSets.filter(s => s.totalWithDates > 0);
        if (valid.length === 0) return undefined;
        if (valid.length === 1) return valid[0];

        // Weighted average of avgDocAgeDays by totalWithDates
        let totalDocs = 0;
        let weightedAgeSum = 0;
        let newestDoc: string | null = null;
        let oldestDoc: string | null = null;

        for (const s of valid) {
            totalDocs += s.totalWithDates;
            if (s.avgDocAgeDays != null) {
                weightedAgeSum += s.avgDocAgeDays * s.totalWithDates;
            }
            if (s.newestDocDate && (!newestDoc || s.newestDocDate > newestDoc)) {
                newestDoc = s.newestDocDate;
            }
            if (s.oldestDocDate && (!oldestDoc || s.oldestDocDate < oldestDoc)) {
                oldestDoc = s.oldestDocDate;
            }
        }

        return {
            avgDocAgeDays: totalDocs > 0 ? Math.round((weightedAgeSum / totalDocs) * 10) / 10 : null,
            newestDocDate: newestDoc,
            oldestDocDate: oldestDoc,
            totalWithDates: totalDocs,
        };
    }

    /**
     * Get instance status
     */
    getInstanceStatus(): Record<string, any> {
        const status: Record<string, any> = {};

        for (const [key, instance] of this.instances) {
            status[key] = {
                code: instance.code,
                name: instance.name,
                type: instance.type,
                enabled: instance.enabled,
                connected: !!instance.connection,
                lastConnected: instance.connection?.lastConnected,
                circuitBreaker: instance.circuitBreaker
            };
        }

        return status;
    }

    /**
     * Get list of available instances
     */
    getAvailableInstances(): string[] {
        return Array.from(this.instances.entries())
            .filter(([, inst]) => inst.circuitBreaker.state !== 'open')
            .map(([key]) => key);
    }

    /**
     * Close all connections
     */
    async shutdown(): Promise<void> {
        logger.info('Shutting down FederatedResourceService');

        for (const [key, instance] of this.instances) {
            if (instance.connection?.client) {
                try {
                    await instance.connection.client.close();
                    logger.info(`Closed connection for ${key}`);
                } catch (error) {
                    logger.error(`Error closing connection for ${key}`, {
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }
        }

        this.instances.clear();
        this.initialized = false;
    }
}

// Singleton instance
export const federatedResourceService = new FederatedResourceService();
export default federatedResourceService;
