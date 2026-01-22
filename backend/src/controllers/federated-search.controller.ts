/**
 * Federated Search Controller
 * Phase 4, Task 3.2: Cross-Instance Resource Discovery
 *
 * Enables unified search across all federated instances (USA, FRA, GBR, DEU).
 * Queries are executed in parallel with graceful degradation if instances are down.
 *
 * UPDATED: Now dynamically includes approved spokes from Hub-Spoke Registry
 *
 * NATO Compliance: ACP-240 §5.4 (Federated Resource Access)
 */

import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import https from 'https';
import { logger } from '../utils/logger';
import { searchResources } from '../services/resource.service';
import { hubSpokeRegistry } from '../services/hub-spoke-registry.service';

// Create axios instance with custom HTTPS agent for self-signed certs in development
const httpsAgent = new https.Agent({
    rejectUnauthorized: process.env.NODE_ENV !== 'development'
});
const federationAxios = (axios as any).create ? (axios as any).create({ httpsAgent }) : (axios as any);

// ============================================
// Configuration
// ============================================

interface FederationInstance {
    code: string;
    apiUrl: string;
    type: 'local' | 'remote';
    enabled: boolean;
}

// SSOT ARCHITECTURE (2026-01-22): Load federation instances from MongoDB (Hub) or Hub API (Spoke)
// DO NOT use static JSON files - MongoDB is the Single Source of Truth
// Federation instances are registered dynamically when spokes deploy

import { federationDiscovery } from '../services/federation-discovery.service';

// Cache for federation instances
let cachedInstances: FederationInstance[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Load federation instances from MongoDB (SSOT)
 * Uses federationDiscovery service which queries:
 * - Hub: MongoDB federation_spokes collection
 * - Spoke: Hub's federation API
 */
async function loadFederationInstancesFromDB(): Promise<FederationInstance[]> {
    // Check cache
    const now = Date.now();
    if (cachedInstances && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return cachedInstances;
    }

    try {
        const discoveredInstances = await federationDiscovery.getInstances();
        
        const instances: FederationInstance[] = discoveredInstances
            .filter(inst => inst.enabled)
            .map(inst => ({
                code: inst.code,
                apiUrl: inst.apiUrl || buildApiUrl(inst.code),
                type: inst.type,
                enabled: process.env[`${inst.code.toUpperCase()}_FEDERATION_ENABLED`] !== 'false'
            }));

        logger.info('Loaded federation instances from MongoDB (SSOT)', {
            count: instances.length,
            codes: instances.map(i => i.code)
        });

        // Update cache
        cachedInstances = instances;
        cacheTimestamp = now;

        return instances;
    } catch (error) {
        logger.error('Failed to load federation instances from MongoDB', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // Return cached if available, otherwise return current instance only
        if (cachedInstances) {
            logger.warn('Using cached federation instances');
            return cachedInstances;
        }
        
        // Fallback: return only current instance
        const currentCode = process.env.INSTANCE_CODE || 'USA';
        logger.warn('Returning only current instance as fallback', { code: currentCode });
        return [{
            code: currentCode,
            apiUrl: buildApiUrl(currentCode),
            type: 'local',
            enabled: true
        }];
    }
}

/**
 * Build API URL for an instance
 */
function buildApiUrl(instanceCode: string): string {
    const code = instanceCode.toUpperCase();
    const envUrl = process.env[`${code}_API_URL`];
    if (envUrl) return envUrl;
    
    // Development: Use environment variables or default to Hub URL
    // Hub (USA) uses HUB_URL env var, spokes use calculated ports from discovery
    const hubUrl = process.env.HUB_URL || process.env.USA_API_URL || process.env.BACKEND_URL;
    if (hubUrl) {
        return code === 'USA' ? hubUrl : hubUrl;
    }
    
    // Fallback: return URL that will likely fail, triggering discovery refresh
    // This should rarely happen as HUB_URL is always set in deployment
    
    // Production: Use hostname-based URLs
    return `https://${code.toLowerCase()}-api.dive25.com`;
}

/**
 * Synchronous wrapper for backward compatibility
 * Uses cached instances or returns empty array
 */
function loadFederationInstances(): FederationInstance[] {
    // If we have cache, return it
    if (cachedInstances) {
        return cachedInstances;
    }
    
    // Return current instance only - actual instances will be loaded async
    const currentCode = process.env.INSTANCE_CODE || 'USA';
    return [{
        code: currentCode,
        apiUrl: buildApiUrl(currentCode),
        type: 'local',
        enabled: true
    }];
}

// Pre-load instances on module initialization
loadFederationInstancesFromDB().catch(err => {
    logger.warn('Initial federation instance load failed', {
        error: err instanceof Error ? err.message : 'Unknown error'
    });
});

// SSOT ARCHITECTURE: All static fallback instances have been removed
// Federation instances now come exclusively from MongoDB via federationDiscovery

// Static instances from registry (loaded at startup)
const STATIC_FEDERATION_INSTANCES = loadFederationInstances();
const INSTANCE_REALM = process.env.INSTANCE_REALM || 'USA';
// Phase 3: Increased timeout for remote instances (DEU)
const FEDERATED_SEARCH_TIMEOUT_MS = parseInt(process.env.FEDERATED_SEARCH_TIMEOUT_MS || '5000');
const REMOTE_INSTANCE_TIMEOUT_MS = parseInt(process.env.REMOTE_INSTANCE_TIMEOUT_MS || '8000');
const MAX_FEDERATED_RESULTS = parseInt(process.env.MAX_FEDERATED_RESULTS || '100');

// Cache for dynamic spoke instances (refreshed periodically)
let cachedSpokeInstances: FederationInstance[] = [];
let spokeInstancesCacheTime = 0;
const SPOKE_CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Get all federation instances (static registry + dynamic approved spokes)
 * This is the key function that enables querying approved spokes as federation endpoints
 */
async function getAllFederationInstances(): Promise<FederationInstance[]> {
    const now = Date.now();

    // Refresh spoke cache if stale
    if (now - spokeInstancesCacheTime > SPOKE_CACHE_TTL_MS) {
        try {
            const approvedSpokes = await hubSpokeRegistry.listActiveSpokes();
            cachedSpokeInstances = approvedSpokes
                .filter(spoke => spoke.status === 'approved' && spoke.apiUrl)
                .map(spoke => {
                    // Build internal API URL for Docker network communication
                    // In development: Use Docker container names (e.g., dive-spoke-fra-backend:4000)
                    // In production: Use external hostnames from apiUrl
                    const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
                    let apiUrl: string;

                    if (isDevelopment && (spoke as any).internalApiUrl) {
                        // Use stored internalApiUrl if available
                        apiUrl = (spoke as any).internalApiUrl;
                    } else if (isDevelopment) {
                        // Build Docker internal URL: dive-spoke-{code}-backend:4000
                        const codeLower = spoke.instanceCode.toLowerCase();
                        apiUrl = `https://dive-spoke-${codeLower}-backend:4000`;
                    } else {
                        // Production: Use external apiUrl
                        apiUrl = spoke.apiUrl!;
                    }

                    return {
                        code: spoke.instanceCode,
                        apiUrl,
                        type: 'remote' as const, // Treat spokes as remote (they're separate Docker stacks)
                        enabled: true
                    };
                });
            spokeInstancesCacheTime = now;

            logger.info('Refreshed spoke instances cache', {
                count: cachedSpokeInstances.length,
                spokes: cachedSpokeInstances.map(s => s.code)
            });
        } catch (error) {
            logger.warn('Failed to refresh spoke instances, using cache', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    // Merge static registry with dynamic spokes (spokes override registry if same code)
    const staticCodes = new Set(STATIC_FEDERATION_INSTANCES.map(i => i.code));
    const combinedInstances = [
        ...STATIC_FEDERATION_INSTANCES,
        ...cachedSpokeInstances.filter(spoke => !staticCodes.has(spoke.code))
    ];

    return combinedInstances;
}

/**
 * Invalidate the spoke instances cache (called when federation changes)
 */
export function invalidateSpokeInstancesCache(): void {
    spokeInstancesCacheTime = 0;
    logger.info('Spoke instances cache invalidated');
}

// Clearance hierarchy for filtering
const CLEARANCE_HIERARCHY: Record<string, number> = {
    'UNCLASSIFIED': 0,
    'RESTRICTED': 0.5,
    'CONFIDENTIAL': 1,
    'SECRET': 2,
    'TOP_SECRET': 3
};

// ============================================
// Interfaces
// ============================================

interface FederatedSearchQuery {
    query?: string;
    classification?: string;
    country?: string;
    coi?: string;
    originRealm?: string;
    encrypted?: boolean;
    limit?: number;
}

interface FederatedSearchResult {
    resourceId: string;
    title: string;
    classification: string;
    releasabilityTo: string[];
    COI: string[];
    encrypted: boolean;
    creationDate?: string;
    displayMarking?: string;
    originRealm: string;
    _federated?: boolean;
    _relevanceScore?: number;
}

interface FederatedSearchResponse {
    query: FederatedSearchQuery;
    totalResults: number;       // True total across ALL federated instances
    resultsReturned: number;    // How many results actually returned (may be limited)
    results: FederatedSearchResult[];
    federatedFrom: string[];
    instanceResults: Record<string, { count: number; latencyMs: number; error?: string }>;
    executionTimeMs: number;
    timestamp: string;
}

// ============================================
// Federated Search Handler
// ============================================

/**
 * POST /api/resources/federated-search
 * Execute search across all federated instances
 */
export const federatedSearchHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `fed-${Date.now()}`;
    const startTime = Date.now();
    const user = (req as any).user;

    try {
        // Parse search query
        const searchQuery: FederatedSearchQuery = {
            query: req.body.query || req.query.query as string,
            classification: req.body.classification || req.query.classification as string,
            country: req.body.country || req.query.country as string,
            coi: req.body.coi || req.query.coi as string,
            originRealm: req.body.originRealm || req.query.originRealm as string,
            encrypted: req.body.encrypted,
            limit: parseInt(req.body.limit || req.query.limit as string || `${MAX_FEDERATED_RESULTS}`)
        };

        // SSOT: User attributes come from Keycloak token via protocol mappers
        // No client-side enrichment - attributes must be in token
        logger.info('Federated search initiated', {
            requestId,
            query: searchQuery,
            user: user?.uniqueID,
            country: user?.countryOfAffiliation,
            clearance: user?.clearance
        });

        // Validate user has required attributes (after enrichment)
        if (!user?.clearance) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'User clearance not available'
            });
            return;
        }

        const userClearanceLevel = CLEARANCE_HIERARCHY[user.clearance] ?? 0;
        const userCountry = user.countryOfAffiliation || INSTANCE_REALM;
        const userCOIs = user.acpCOI || [];

        // Execute parallel search across all instances (including approved spokes)
        const instanceResults: Record<string, { count: number; latencyMs: number; error?: string }> = {};
        const allResources: FederatedSearchResult[] = [];

        // Get all federation instances (static + dynamic spokes)
        const federationInstances = await getAllFederationInstances();

        logger.info('Federation instances for search', {
            requestId,
            instances: federationInstances.map(i => ({ code: i.code, type: i.type }))
        });

        const searchPromises = federationInstances
            .filter(instance => instance.enabled)
            .map(async (instance) => {
                const instanceStart = Date.now();

                try {
                    let searchResult: { resources: FederatedSearchResult[]; trueTotalCount: number };

                    if (instance.code === INSTANCE_REALM) {
                        // Local search (direct MongoDB query)
                        searchResult = await executeLocalSearch(searchQuery);
                    } else {
                        // Remote search (Federation API)
                        searchResult = await executeRemoteSearch(instance, searchQuery, req.headers.authorization || '');
                    }

                    // Mark as federated and set origin
                    const resources = searchResult.resources.map(r => ({
                        ...r,
                        originRealm: r.originRealm || instance.code,
                        _federated: instance.code !== INSTANCE_REALM
                    }));

                    // Store TRUE total count from this instance
                    instanceResults[instance.code] = {
                        count: searchResult.trueTotalCount, // TRUE total, not just returned count
                        latencyMs: Date.now() - instanceStart
                    };

                    return resources;

                } catch (error) {
                    logger.warn('Instance search failed', {
                        requestId,
                        instance: instance.code,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        latencyMs: Date.now() - instanceStart
                    });

                    instanceResults[instance.code] = {
                        count: 0,
                        latencyMs: Date.now() - instanceStart,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    };

                    return []; // Graceful degradation
                }
            });

        // Wait for all searches
        const results = await Promise.all(searchPromises);

        // Flatten results
        for (const resourceList of results) {
            allResources.push(...resourceList);
        }

        // Deduplicate by resourceId (prefer local over federated)
        const seen = new Map<string, FederatedSearchResult>();
        for (const resource of allResources) {
            const existing = seen.get(resource.resourceId);
            if (!existing || (!resource._federated && existing._federated)) {
                seen.set(resource.resourceId, resource);
            }
        }
        let uniqueResources = Array.from(seen.values());

        // Note: Server-side authorization filtering is DISABLED to match local mode behavior.
        // The local /api/resources endpoint returns ALL resources and the UI shows "COI may be required" badges.
        // Authorization is enforced when user tries to ACCESS a specific resource (GET /api/resources/:id).
        //
        // If strict server-side filtering is needed, set enforceAuthorization=true in the request:
        const enforceAuthorization = req.body.enforceAuthorization === true || req.query.enforceAuthorization === 'true';

        if (enforceAuthorization) {
            uniqueResources = uniqueResources.filter(resource => {
                // Check releasability
                if (!resource.releasabilityTo.includes(userCountry) &&
                    !resource.releasabilityTo.includes('NATO') &&
                    !resource.releasabilityTo.includes('FVEY')) {
                    return false;
                }

                // Check clearance
                const resourceLevel = CLEARANCE_HIERARCHY[resource.classification] ?? 0;
                if (userClearanceLevel < resourceLevel) {
                    return false;
                }

                // Check COI (if resource has COI requirement)
                if (resource.COI && resource.COI.length > 0) {
                    const hasCOI = resource.COI.some(coi => userCOIs.includes(coi));
                    if (!hasCOI) {
                        return false;
                    }
                }

                return true;
            });

            logger.info('Applied server-side authorization filter', {
                requestId,
                beforeFilter: seen.size,
                afterFilter: uniqueResources.length
            });
        }

        // Calculate relevance scores if query provided
        if (searchQuery.query) {
            uniqueResources = uniqueResources.map(resource => ({
                ...resource,
                _relevanceScore: calculateRelevance(resource, searchQuery.query!)
            }));

            // Sort by relevance
            uniqueResources.sort((a, b) => (b._relevanceScore || 0) - (a._relevanceScore || 0));
        }

        // Apply limit
        const limitedResults = uniqueResources.slice(0, searchQuery.limit || MAX_FEDERATED_RESULTS);

        // Calculate true total from all instance counts
        const trueTotalAcrossInstances = Object.values(instanceResults)
            .reduce((sum, result) => sum + (result.count || 0), 0);

        // Build response
        const response: FederatedSearchResponse = {
            query: searchQuery,
            totalResults: trueTotalAcrossInstances, // True total across ALL instances
            resultsReturned: limitedResults.length, // How many actually returned (may be limited)
            results: limitedResults,
            federatedFrom: Object.entries(instanceResults)
                .filter(([, result]) => !result.error)
                .map(([code]) => code),
            instanceResults,
            executionTimeMs: Date.now() - startTime,
            timestamp: new Date().toISOString()
        };

        logger.info('Federated search complete', {
            requestId,
            totalResults: response.totalResults,
            instanceResults: Object.entries(instanceResults).map(([code, result]) => ({
                code,
                count: result.count,
                latencyMs: result.latencyMs,
                error: result.error
            })),
            executionTimeMs: response.executionTimeMs
        });

        res.json(response);

    } catch (error) {
        logger.error('Federated search failed', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        next(error);
    }
};

/**
 * Execute search on local MongoDB
 * Returns both the limited results AND the true total count
 */
async function executeLocalSearch(query: FederatedSearchQuery): Promise<{ resources: FederatedSearchResult[]; trueTotalCount: number }> {
    try {
        // Get true total count from MongoDB
        const { getMongoDBUrl, getMongoDBName } = await import('../utils/mongodb-config');
        const { MongoClient } = await import('mongodb');
        const client = await MongoClient.connect(getMongoDBUrl());
        const db = client.db(getMongoDBName());

        // Build query for counting
        const countQuery: any = {};
        if (query.classification) {
            countQuery['ztdf.policy.securityLabel.classification'] = query.classification;
        }
        if (query.country) {
            countQuery['ztdf.policy.securityLabel.releasabilityTo'] = { $in: [query.country] };
        }
        if (query.coi) {
            countQuery['ztdf.policy.securityLabel.COI'] = { $in: [query.coi] };
        }
        if (query.query) {
            countQuery.$or = [
                { title: { $regex: query.query, $options: 'i' } },
                { resourceId: { $regex: query.query, $options: 'i' } }
            ];
        }

        // Get TRUE total count
        const trueTotalCount = await db.collection('resources').countDocuments(
            Object.keys(countQuery).length > 0 ? countQuery : {}
        );

        // Use existing resource service for limited results
        const resources = await searchResources({
            query: query.query,
            classification: query.classification,
            releasableTo: query.country,
            coi: query.coi,
            limit: query.limit || 500 // Use the query limit
        });

        const mappedResources = resources.map(r => {
            // Handle both ZTDF and legacy resources
            const ztdf = (r as any).ztdf;
            if (ztdf) {
                return {
                    resourceId: r.resourceId,
                    title: r.title,
                    classification: ztdf.policy.securityLabel.classification,
                    releasabilityTo: ztdf.policy.securityLabel.releasabilityTo,
                    COI: ztdf.policy.securityLabel.COI || [],
                    encrypted: true,
                    creationDate: ztdf.policy.securityLabel.creationDate,
                    displayMarking: ztdf.policy.securityLabel.displayMarking,
                    originRealm: (r as any).originRealm || INSTANCE_REALM
                };
            } else {
                return {
                    resourceId: r.resourceId,
                    title: r.title,
                    classification: (r as any).classification || 'UNCLASSIFIED',
                    releasabilityTo: (r as any).releasabilityTo || [],
                    COI: (r as any).COI || [],
                    encrypted: (r as any).encrypted || false,
                    creationDate: (r as any).creationDate,
                    originRealm: (r as any).originRealm || INSTANCE_REALM
                };
            }
        });

        return {
            resources: mappedResources,
            trueTotalCount
        };
    } catch (error) {
        logger.error('Local search failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
}

/**
 * Execute search on remote federated instance
 * Phase 3: Dynamic timeout based on instance type (local vs remote)
 * Returns both the limited results AND the true total count from the remote instance
 */
async function executeRemoteSearch(
    instance: FederationInstance,
    query: FederatedSearchQuery,
    authHeader: string
): Promise<{ resources: FederatedSearchResult[]; trueTotalCount: number }> {
    // Phase 3: Use longer timeout for remote instances (DEU, etc.)
    const timeoutMs = instance.type === 'remote' ? REMOTE_INSTANCE_TIMEOUT_MS : FEDERATED_SEARCH_TIMEOUT_MS;

    try {
        logger.debug('Executing remote search', {
            instance: instance.code,
            type: instance.type,
            timeoutMs,
            apiUrl: instance.apiUrl
        });

        const response = await federationAxios.get(
            `${instance.apiUrl}/api/federation/search`,
            {
                headers: {
                    'Authorization': authHeader,
                    'X-Origin-Realm': INSTANCE_REALM,
                    'Content-Type': 'application/json'
                },
                params: {
                    query: query.query,
                    classification: query.classification,
                    releasableTo: query.country,
                    coi: query.coi,
                    limit: query.limit
                },
                timeout: timeoutMs
            }
        );

        const resources = (response.data.resources || []).map((r: any) => ({
            ...r,
            originRealm: r.originRealm || instance.code,
            _federated: true
        }));

        // Return both resources and the TRUE total count from the remote instance
        return {
            resources,
            trueTotalCount: response.data.totalResults || resources.length
        };

    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNABORTED') {
                throw new Error(`Timeout after ${timeoutMs}ms (${instance.type} instance)`);
            }
            throw new Error(`HTTP ${error.response?.status || 'unknown'}: ${error.message}`);
        }
        throw error;
    }
}

/**
 * Calculate relevance score for ranking
 */
function calculateRelevance(resource: FederatedSearchResult, query: string): number {
    const q = query.toLowerCase();
    let score = 0;

    // Title match (highest weight)
    if (resource.title?.toLowerCase().includes(q)) {
        score += 10;
        // Exact match bonus
        if (resource.title.toLowerCase() === q) {
            score += 5;
        }
        // Prefix match bonus
        if (resource.title.toLowerCase().startsWith(q)) {
            score += 3;
        }
    }

    // ResourceId match
    if (resource.resourceId?.toLowerCase().includes(q)) {
        score += 3;
    }

    // Classification match
    if (resource.classification?.toLowerCase().includes(q)) {
        score += 2;
    }

    // COI match
    if (resource.COI?.some(coi => coi.toLowerCase().includes(q))) {
        score += 2;
    }

    // Country match
    if (resource.releasabilityTo?.some(country => country.toLowerCase().includes(q))) {
        score += 1;
    }

    // Recency bonus (newer resources rank higher)
    if (resource.creationDate) {
        const age = Date.now() - new Date(resource.creationDate).getTime();
        const daysSinceCreation = age / (1000 * 60 * 60 * 24);
        if (daysSinceCreation < 7) score += 2;
        else if (daysSinceCreation < 30) score += 1;
    }

    // Local resources get slight preference
    if (!resource._federated) {
        score += 0.5;
    }

    return score;
}

/**
 * GET /api/resources/federated-search
 * Alias for POST handler (for convenience)
 */
export const federatedSearchGetHandler = federatedSearchHandler;

/**
 * GET /api/resources/federated-status
 * Get federated search status (which instances are available)
 */
export const federatedStatusHandler = async (
    _req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const startTime = Date.now();

    try {
        // Get all federation instances (static + dynamic spokes)
        const federationInstances = await getAllFederationInstances();

        const instanceChecks = await Promise.all(
            federationInstances.map(async (instance) => {
                const checkStart = Date.now();
                try {
                    if (instance.code === INSTANCE_REALM) {
                        return {
                            code: instance.code,
                            apiUrl: instance.apiUrl,
                            type: instance.type,
                            available: true,
                            latencyMs: Date.now() - checkStart
                        };
                    }

                    await federationAxios.get(`${instance.apiUrl}/health`, { timeout: 2000 });
                    return {
                        code: instance.code,
                        apiUrl: instance.apiUrl,
                        type: instance.type,
                        available: true,
                        latencyMs: Date.now() - checkStart
                    };
                } catch (error: any) {
                    logger.warn('Health check failed for instance', {
                        instance: instance.code,
                        apiUrl: instance.apiUrl,
                        error: error.message,
                        code: error.code,
                        latencyMs: Date.now() - checkStart
                    });
                    return {
                        code: instance.code,
                        apiUrl: instance.apiUrl,
                        type: instance.type,
                        available: false,
                        latencyMs: Date.now() - checkStart
                    };
                }
            })
        );

        const availableCount = instanceChecks.filter(i => i.available).length;

        res.json({
            currentInstance: INSTANCE_REALM,
            federatedSearchEnabled: true,
            instances: instanceChecks,
            availableInstances: availableCount,
            totalInstances: federationInstances.length,
            executionTimeMs: Date.now() - startTime,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        next(error);
    }
};
