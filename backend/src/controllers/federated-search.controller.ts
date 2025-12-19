/**
 * Federated Search Controller
 * Phase 4, Task 3.2: Cross-Instance Resource Discovery
 * 
 * Enables unified search across all federated instances (USA, FRA, GBR, DEU).
 * Queries are executed in parallel with graceful degradation if instances are down.
 * 
 * NATO Compliance: ACP-240 §5.4 (Federated Resource Access)
 */

import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import https from 'https';
import { logger } from '../utils/logger';
import { searchResources } from '../services/resource.service';

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

// Load federation instances from federation-registry.json or environment
// Phase 3: Dynamic configuration loading for distributed query federation
import fs from 'fs';
import path from 'path';

function loadFederationInstances(): FederationInstance[] {
    // Try to load from federation-registry.json
    const registryPaths = [
        path.join(process.cwd(), '..', 'config', 'federation-registry.json'),
        path.join(process.cwd(), 'config', 'federation-registry.json')
    ];

    for (const registryPath of registryPaths) {
        try {
            if (fs.existsSync(registryPath)) {
                const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
                const instances: FederationInstance[] = [];

                for (const [key, instance] of Object.entries(registry.instances)) {
                    const inst = instance as any;
                    if (!inst.enabled) continue;

                    // Build API URL from registry
                    const backendService = inst.services?.backend;
                    let apiUrl: string;

                    if (inst.type === 'remote') {
                        // Remote instances use external hostname
                        apiUrl = process.env[`${key.toUpperCase()}_API_URL`] ||
                            `https://${backendService?.hostname || `${key}-api.${inst.deployment?.domain}`}`;
                    } else {
                        // Local instances use localhost in development
                        const port = backendService?.externalPort || 4000;
                        apiUrl = process.env[`${key.toUpperCase()}_API_URL`] ||
                            (process.env.NODE_ENV === 'development'
                                ? `https://localhost:${port}`
                                : `https://${backendService?.hostname || `${key}-api.dive25.com`}`);
                    }

                    instances.push({
                        code: inst.code,
                        apiUrl,
                        type: inst.type,
                        // Phase 3: DEU and all instances enabled by default when present in registry
                        enabled: process.env[`${key.toUpperCase()}_FEDERATION_ENABLED`] !== 'false'
                    });
                }

                logger.info('Loaded federation instances from registry', {
                    count: instances.length,
                    instances: instances.map(i => ({ code: i.code, type: i.type, enabled: i.enabled }))
                });

                return instances;
            }
        } catch (error) {
            logger.warn('Failed to load federation registry, using defaults', {
                path: registryPath,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    // Fallback to hardcoded defaults
    logger.warn('Using fallback federation instances (registry not found)');
    return [
        {
            code: 'USA',
            apiUrl: process.env.USA_API_URL || (process.env.NODE_ENV === 'development' ? 'https://localhost:4000' : 'https://usa-api.dive25.com'),
            type: 'local',
            enabled: true
        },
        {
            code: 'FRA',
            apiUrl: process.env.FRA_API_URL || (process.env.NODE_ENV === 'development' ? 'https://localhost:4001' : 'https://fra-api.dive25.com'),
            type: 'local',
            enabled: true
        },
        {
            code: 'GBR',
            apiUrl: process.env.GBR_API_URL || (process.env.NODE_ENV === 'development' ? 'https://localhost:4002' : 'https://gbr-api.dive25.com'),
            type: 'local',
            enabled: true
        },
        {
            code: 'DEU',
            apiUrl: process.env.DEU_API_URL || 'https://deu-api.prosecurity.biz',
            type: 'remote',
            // Phase 3: DEU enabled by default
            enabled: process.env.DEU_FEDERATION_ENABLED !== 'false'
        }
    ];
}

const FEDERATION_INSTANCES = loadFederationInstances();
const INSTANCE_REALM = process.env.INSTANCE_REALM || 'USA';
// Phase 3: Increased timeout for remote instances (DEU)
const FEDERATED_SEARCH_TIMEOUT_MS = parseInt(process.env.FEDERATED_SEARCH_TIMEOUT_MS || '5000');
const REMOTE_INSTANCE_TIMEOUT_MS = parseInt(process.env.REMOTE_INSTANCE_TIMEOUT_MS || '8000');
const MAX_FEDERATED_RESULTS = parseInt(process.env.MAX_FEDERATED_RESULTS || '100');

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

        logger.info('Federated search initiated', {
            requestId,
            query: searchQuery,
            user: user?.uniqueID,
            country: user?.countryOfAffiliation,
            clearance: user?.clearance
        });

        // Validate user has required attributes
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

        // Execute parallel search across all instances
        const instanceResults: Record<string, { count: number; latencyMs: number; error?: string }> = {};
        const allResources: FederatedSearchResult[] = [];

        const searchPromises = FEDERATION_INSTANCES
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
        const instanceChecks = await Promise.all(
            FEDERATION_INSTANCES.map(async (instance) => {
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
                } catch {
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
            totalInstances: FEDERATION_INSTANCES.length,
            executionTimeMs: Date.now() - startTime,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        next(error);
    }
};
