/**
 * Cross-Instance Authorization Service
 *
 * Implements federated authorization for cross-instance resource access.
 * Provides policy re-evaluation at destination instance and authorization caching.
 *
 * Features:
 * - Federated resource queries across instances
 * - Policy re-evaluation at destination
 * - Authorization decision caching (60s TTL)
 * - Attribute translation between instances
 * - Cross-instance audit trail
 *
 * Reference: ACP-240 Section 4.2 (Federated Authorization)
 */

import axios, { AxiosInstance } from 'axios';
import https from 'https';
import crypto from 'crypto';
import NodeCache from 'node-cache';
import { logger } from '../utils/logger';
import { spokeTokenExchange, ITokenIntrospectionResult, IBilateralTrust } from './spoke-token-exchange.service';

// ============================================
// Types
// ============================================

export interface IFederatedSubject {
    uniqueID: string;
    clearance: string;
    countryOfAffiliation: string;
    acpCOI: string[];
    organizationType?: string;
    dutyOrg?: string;
    originInstance: string;
}

export interface IFederatedResource {
    resourceId: string;
    title?: string;
    classification: string;
    releasabilityTo: string[];
    COI: string[];
    instanceId: string;
    instanceUrl: string;
}

export interface ICrossInstanceAuthzRequest {
    subject: IFederatedSubject;
    resource: IFederatedResource;
    action: 'read' | 'write' | 'decrypt' | 'download';
    requestId: string;
    bearerToken: string;
}

export interface ICrossInstanceAuthzResult {
    allow: boolean;
    reason: string;
    evaluationDetails: {
        localDecision: {
            allow: boolean;
            reason: string;
        };
        remoteDecision?: {
            allow: boolean;
            reason: string;
            instanceId: string;
        };
        attributeTranslation?: {
            originalClearance: string;
            translatedClearance: string;
            clearanceMapping: string;
        };
        bilateralTrust?: {
            sourceInstance: string;
            targetInstance: string;
            trustLevel: string;
            maxClassification: string;
            allowedScopes: string[];
        };
        cacheHit: boolean;
    };
    obligations?: string[];
    executionTimeMs: number;
    auditTrail: ICrossInstanceAuditEntry[];
}

export interface ICrossInstanceAuditEntry {
    timestamp: string;
    instanceId: string;
    action: string;
    outcome: 'allow' | 'deny' | 'error';
    details: string;
}

export interface IFederatedResourceQuery {
    query: {
        classification?: string[];
        releasabilityTo?: string[];
        COI?: string[];
        keywords?: string[];
    };
    subject: IFederatedSubject;
    requestId: string;
    bearerToken: string;
    targetInstances?: string[];
}

export interface IFederatedQueryResult {
    totalResources: number;
    resources: Array<{
        resource: IFederatedResource;
        accessAllowed: boolean;
        accessReason?: string;
    }>;
    queryStats: {
        instancesQueried: number;
        successfulQueries: number;
        failedQueries: string[];
        totalLatencyMs: number;
    };
}

// ============================================
// Instance Registry
// ============================================

interface IInstanceConfig {
    instanceId: string;
    instanceUrl: string;
    opaUrl: string;
    country: string;
    trustLevel: 'high' | 'medium' | 'low';
    clearanceMapping: Record<string, string>;
}

const INSTANCE_REGISTRY: Record<string, IInstanceConfig> = {
    'usa': {
        instanceId: 'usa',
        instanceUrl: 'https://usa-backend.dive25.com',
        opaUrl: 'http://opa:8181',
        country: 'USA',
        trustLevel: 'high',
        clearanceMapping: {
            'TOP_SECRET': 'TOP_SECRET',
            'SECRET': 'SECRET',
            'CONFIDENTIAL': 'CONFIDENTIAL',
            'UNCLASSIFIED': 'UNCLASSIFIED',
        },
    },
    'fra': {
        instanceId: 'fra',
        instanceUrl: 'https://fra-backend.dive25.com',
        opaUrl: 'http://opa:8181',
        country: 'FRA',
        trustLevel: 'high',
        clearanceMapping: {
            'TRES_SECRET_DEFENSE': 'TOP_SECRET',
            'SECRET_DEFENSE': 'SECRET',
            'CONFIDENTIEL_DEFENSE': 'CONFIDENTIAL',
            'DIFFUSION_RESTREINTE': 'CONFIDENTIAL',
            'NON_PROTEGE': 'UNCLASSIFIED',
            'TOP_SECRET': 'TOP_SECRET',
            'SECRET': 'SECRET',
            'CONFIDENTIAL': 'CONFIDENTIAL',
            'UNCLASSIFIED': 'UNCLASSIFIED',
        },
    },
    'gbr': {
        instanceId: 'gbr',
        instanceUrl: 'https://gbr-backend.dive25.com',
        opaUrl: 'http://opa:8181',
        country: 'GBR',
        trustLevel: 'high',
        clearanceMapping: {
            'TOP_SECRET': 'TOP_SECRET',
            'SECRET': 'SECRET',
            'OFFICIAL_SENSITIVE': 'CONFIDENTIAL',
            'OFFICIAL': 'UNCLASSIFIED',
        },
    },
    'deu': {
        instanceId: 'deu',
        instanceUrl: 'https://deu-backend.dive25.com',
        opaUrl: 'http://opa:8181',
        country: 'DEU',
        trustLevel: 'high',
        clearanceMapping: {
            'STRENG_GEHEIM': 'TOP_SECRET',
            'GEHEIM': 'SECRET',
            'VS_VERTRAULICH': 'CONFIDENTIAL',
            'VS_NUR_FUER_DEN_DIENSTGEBRAUCH': 'CONFIDENTIAL',
            'OFFEN': 'UNCLASSIFIED',
            'TOP_SECRET': 'TOP_SECRET',
            'SECRET': 'SECRET',
            'CONFIDENTIAL': 'CONFIDENTIAL',
            'UNCLASSIFIED': 'UNCLASSIFIED',
        },
    },
    'local': {
        instanceId: 'local',
        instanceUrl: process.env.BACKEND_URL || 'https://backend:4000',
        opaUrl: process.env.OPA_URL || 'http://opa:8181',
        country: 'USA',
        trustLevel: 'high',
        clearanceMapping: {},
    },
};

// ============================================
// Classification Hierarchy
// ============================================

const CLASSIFICATION_HIERARCHY: Record<string, number> = {
    'UNCLASSIFIED': 0,
    'RESTRICTED': 1,
    'CONFIDENTIAL': 2,
    'SECRET': 3,
    'TOP_SECRET': 4,
};

function getClassificationLevel(classification: string): number {
    return CLASSIFICATION_HIERARCHY[classification?.toUpperCase()] ?? 0;
}

// ============================================
// Cross-Instance Authorization Service
// ============================================

export class CrossInstanceAuthzService {
    private readonly authzCache: NodeCache;
    private readonly httpClients: Map<string, AxiosInstance> = new Map();
    private readonly localOpaUrl: string;
    private readonly localInstanceId: string;

    constructor() {
        // Cache authorization decisions for 60 seconds (shorter than token lifetime)
        this.authzCache = new NodeCache({ stdTTL: 60, checkperiod: 30 });
        this.localOpaUrl = process.env.OPA_URL || 'http://opa:8181';
        this.localInstanceId = process.env.INSTANCE_ID || 'local';
    }

    /**
     * Evaluate authorization for cross-instance resource access
     */
    async evaluateAccess(request: ICrossInstanceAuthzRequest): Promise<ICrossInstanceAuthzResult> {
        const startTime = Date.now();
        const auditTrail: ICrossInstanceAuditEntry[] = [];

        // Generate cache key
        const cacheKey = this.generateCacheKey(request);

        // Check cache
        const cached = this.authzCache.get<ICrossInstanceAuthzResult>(cacheKey);
        if (cached) {
            logger.debug('Cross-instance authz cache hit', {
                requestId: request.requestId,
                cacheKey,
            });

            return {
                ...cached,
                evaluationDetails: {
                    ...cached.evaluationDetails,
                    cacheHit: true,
                },
                executionTimeMs: Date.now() - startTime,
            };
        }

        logger.info('Cross-instance authorization evaluation started', {
            requestId: request.requestId,
            subjectCountry: request.subject.countryOfAffiliation,
            resourceInstance: request.resource.instanceId,
            action: request.action,
        });

        // Step 1: Local policy evaluation (origin instance)
        auditTrail.push({
            timestamp: new Date().toISOString(),
            instanceId: this.localInstanceId,
            action: 'local_policy_evaluation',
            outcome: 'allow',
            details: 'Starting local policy evaluation',
        });

        const localDecision = await this.evaluateLocalPolicy(request);

        auditTrail.push({
            timestamp: new Date().toISOString(),
            instanceId: this.localInstanceId,
            action: 'local_policy_result',
            outcome: localDecision.allow ? 'allow' : 'deny',
            details: localDecision.reason,
        });

        if (!localDecision.allow) {
            logger.info('Cross-instance access denied by local policy', {
                requestId: request.requestId,
                reason: localDecision.reason,
            });

            const result: ICrossInstanceAuthzResult = {
                allow: false,
                reason: `Local policy denied: ${localDecision.reason}`,
                evaluationDetails: {
                    localDecision,
                    cacheHit: false,
                },
                executionTimeMs: Date.now() - startTime,
                auditTrail,
            };

            // Cache negative decisions too
            this.authzCache.set(cacheKey, result);
            return result;
        }

        // Step 2: Translate attributes for destination instance
        const destinationInstance = INSTANCE_REGISTRY[request.resource.instanceId.toLowerCase()];
        let attributeTranslation: ICrossInstanceAuthzResult['evaluationDetails']['attributeTranslation'];

        if (destinationInstance && Object.keys(destinationInstance.clearanceMapping).length > 0) {
            const translatedClearance = this.translateClearance(
                request.subject.clearance,
                destinationInstance.clearanceMapping
            );

            attributeTranslation = {
                originalClearance: request.subject.clearance,
                translatedClearance,
                clearanceMapping: destinationInstance.instanceId,
            };

            auditTrail.push({
                timestamp: new Date().toISOString(),
                instanceId: destinationInstance.instanceId,
                action: 'attribute_translation',
                outcome: 'allow',
                details: `Clearance ${request.subject.clearance} -> ${translatedClearance}`,
            });
        }

        // Step 3: Remote policy evaluation (if different instance)
        let remoteDecision: ICrossInstanceAuthzResult['evaluationDetails']['remoteDecision'];

        if (request.resource.instanceId.toLowerCase() !== this.localInstanceId) {
            auditTrail.push({
                timestamp: new Date().toISOString(),
                instanceId: request.resource.instanceId,
                action: 'remote_policy_evaluation',
                outcome: 'allow',
                details: 'Starting remote policy evaluation',
            });

            try {
                remoteDecision = await this.evaluateRemotePolicy(request, attributeTranslation);

                auditTrail.push({
                    timestamp: new Date().toISOString(),
                    instanceId: request.resource.instanceId,
                    action: 'remote_policy_result',
                    outcome: remoteDecision.allow ? 'allow' : 'deny',
                    details: remoteDecision.reason,
                });

                if (!remoteDecision.allow) {
                    logger.info('Cross-instance access denied by remote policy', {
                        requestId: request.requestId,
                        remoteInstance: request.resource.instanceId,
                        reason: remoteDecision.reason,
                    });

                    const result: ICrossInstanceAuthzResult = {
                        allow: false,
                        reason: `Remote policy denied: ${remoteDecision.reason}`,
                        evaluationDetails: {
                            localDecision,
                            remoteDecision,
                            attributeTranslation,
                            cacheHit: false,
                        },
                        executionTimeMs: Date.now() - startTime,
                        auditTrail,
                    };

                    this.authzCache.set(cacheKey, result);
                    return result;
                }
            } catch (error: any) {
                logger.error('Remote policy evaluation failed', {
                    requestId: request.requestId,
                    remoteInstance: request.resource.instanceId,
                    error: error.message,
                });

                auditTrail.push({
                    timestamp: new Date().toISOString(),
                    instanceId: request.resource.instanceId,
                    action: 'remote_policy_error',
                    outcome: 'error',
                    details: error.message,
                });

                // Fail-closed: deny on remote evaluation failure
                return {
                    allow: false,
                    reason: 'Remote policy evaluation failed (fail-closed)',
                    evaluationDetails: {
                        localDecision,
                        cacheHit: false,
                    },
                    executionTimeMs: Date.now() - startTime,
                    auditTrail,
                };
            }
        }

        // Step 4: Both policies allowed - grant access
        logger.info('Cross-instance access granted', {
            requestId: request.requestId,
            subjectCountry: request.subject.countryOfAffiliation,
            resourceInstance: request.resource.instanceId,
            localReason: localDecision.reason,
            remoteReason: remoteDecision?.reason,
        });

        const result: ICrossInstanceAuthzResult = {
            allow: true,
            reason: 'Access granted by local and remote policies',
            evaluationDetails: {
                localDecision,
                remoteDecision,
                attributeTranslation,
                cacheHit: false,
            },
            obligations: this.determineObligations(request),
            executionTimeMs: Date.now() - startTime,
            auditTrail,
        };

        // Cache successful decision
        this.authzCache.set(cacheKey, result);

        return result;
    }

    /**
     * Query resources across federated instances
     */
    async queryFederatedResources(query: IFederatedResourceQuery): Promise<IFederatedQueryResult> {
        const startTime = Date.now();
        const targetInstances = query.targetInstances || Object.keys(INSTANCE_REGISTRY);
        const resources: IFederatedQueryResult['resources'] = [];
        const failedQueries: string[] = [];
        let successfulQueries = 0;

        logger.info('Federated resource query started', {
            requestId: query.requestId,
            targetInstances,
            query: query.query,
        });

        // Query each instance in parallel
        const queryPromises = targetInstances.map(async instanceId => {
            const instance = INSTANCE_REGISTRY[instanceId.toLowerCase()];
            if (!instance) {
                failedQueries.push(`${instanceId}: Instance not found`);
                return [];
            }

            try {
                const instanceResources = await this.queryInstanceResources(
                    instance,
                    query
                );
                successfulQueries++;
                return instanceResources;
            } catch (error: any) {
                failedQueries.push(`${instanceId}: ${error.message}`);
                return [];
            }
        });

        const results = await Promise.all(queryPromises);

        // Flatten and evaluate access for each resource
        for (const instanceResources of results) {
            for (const resource of instanceResources) {
                const authzResult = await this.evaluateAccess({
                    subject: query.subject,
                    resource,
                    action: 'read',
                    requestId: query.requestId,
                    bearerToken: query.bearerToken,
                });

                resources.push({
                    resource,
                    accessAllowed: authzResult.allow,
                    accessReason: authzResult.reason,
                });
            }
        }

        logger.info('Federated resource query completed', {
            requestId: query.requestId,
            totalResources: resources.length,
            accessibleResources: resources.filter(r => r.accessAllowed).length,
            successfulQueries,
            failedQueries: failedQueries.length,
        });

        return {
            totalResources: resources.length,
            resources,
            queryStats: {
                instancesQueried: targetInstances.length,
                successfulQueries,
                failedQueries,
                totalLatencyMs: Date.now() - startTime,
            },
        };
    }

    /**
     * Evaluate local OPA policy
     */
    private async evaluateLocalPolicy(request: ICrossInstanceAuthzRequest): Promise<{
        allow: boolean;
        reason: string;
    }> {
        const opaInput = {
            input: {
                subject: {
                    authenticated: true,
                    uniqueID: request.subject.uniqueID,
                    clearance: request.subject.clearance,
                    countryOfAffiliation: request.subject.countryOfAffiliation,
                    acpCOI: request.subject.acpCOI,
                    organizationType: request.subject.organizationType,
                    dutyOrg: request.subject.dutyOrg,
                },
                action: {
                    operation: request.action,
                },
                resource: {
                    resourceId: request.resource.resourceId,
                    classification: request.resource.classification,
                    releasabilityTo: request.resource.releasabilityTo,
                    COI: request.resource.COI,
                },
                context: {
                    currentTime: new Date().toISOString(),
                    requestId: request.requestId,
                    federatedAccess: true,
                    originInstance: request.subject.originInstance,
                    targetInstance: request.resource.instanceId,
                },
            },
        };

        try {
            const response = await axios.post(
                `${this.localOpaUrl}/v1/data/dive/authorization`,
                opaInput,
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000,
                }
            );

            const decision = response.data.result?.decision || response.data.result;

            return {
                allow: decision.allow,
                reason: decision.reason || (decision.allow ? 'Access allowed' : 'Access denied'),
            };
        } catch (error: any) {
            logger.error('Local OPA evaluation failed', {
                requestId: request.requestId,
                error: error.message,
            });

            // Fail-closed
            return {
                allow: false,
                reason: 'Policy evaluation unavailable (fail-closed)',
            };
        }
    }

    /**
     * Evaluate remote instance policy
     */
    private async evaluateRemotePolicy(
        request: ICrossInstanceAuthzRequest,
        attributeTranslation?: ICrossInstanceAuthzResult['evaluationDetails']['attributeTranslation']
    ): Promise<{
        allow: boolean;
        reason: string;
        instanceId: string;
    }> {
        const instance = INSTANCE_REGISTRY[request.resource.instanceId.toLowerCase()];
        if (!instance) {
            throw new Error(`Unknown instance: ${request.resource.instanceId}`);
        }

        const client = this.getHttpClient(instance.instanceUrl);

        // Translate clearance if mapping exists
        const translatedClearance = attributeTranslation?.translatedClearance || request.subject.clearance;

        const payload = {
            subject: {
                ...request.subject,
                clearance: translatedClearance,
                federatedFrom: this.localInstanceId,
            },
            resource: request.resource,
            action: request.action,
            requestId: request.requestId,
        };

        try {
            const response = await client.post('/api/federation/evaluate-policy', payload, {
                headers: {
                    'Authorization': `Bearer ${request.bearerToken}`,
                    'X-Request-Id': request.requestId,
                    'X-Federated-From': this.localInstanceId,
                },
                timeout: 10000,
            });

            return {
                allow: response.data.allow,
                reason: response.data.reason,
                instanceId: instance.instanceId,
            };
        } catch (error: any) {
            // If endpoint doesn't exist, try direct OPA evaluation
            if (error.response?.status === 404) {
                logger.debug('Remote federation endpoint not found, using local OPA', {
                    instanceId: instance.instanceId,
                });

                // Use local OPA with remote resource context
                const localResult = await this.evaluateLocalPolicy({
                    ...request,
                    subject: {
                        ...request.subject,
                        clearance: translatedClearance,
                    },
                });

                return {
                    allow: localResult.allow,
                    reason: localResult.reason,
                    instanceId: instance.instanceId,
                };
            }

            throw error;
        }
    }

    /**
     * Query resources from a specific instance
     */
    private async queryInstanceResources(
        instance: IInstanceConfig,
        query: IFederatedResourceQuery
    ): Promise<IFederatedResource[]> {
        // For local instance, query database directly
        if (instance.instanceId === this.localInstanceId || instance.instanceId === 'local') {
            return this.queryLocalResources(query);
        }

        // For remote instances, make HTTP request
        const client = this.getHttpClient(instance.instanceUrl);

        try {
            const response = await client.post('/api/federation/query-resources', {
                query: query.query,
                requestId: query.requestId,
            }, {
                headers: {
                    'Authorization': `Bearer ${query.bearerToken}`,
                    'X-Request-Id': query.requestId,
                },
                timeout: 10000,
            });

            return response.data.resources.map((r: any) => ({
                ...r,
                instanceId: instance.instanceId,
                instanceUrl: instance.instanceUrl,
            }));
        } catch (error: any) {
            logger.warn('Failed to query remote instance', {
                instanceId: instance.instanceId,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Query local resources (placeholder - integrate with ResourceService)
     */
    private async queryLocalResources(query: IFederatedResourceQuery): Promise<IFederatedResource[]> {
        // This would integrate with the actual ResourceService
        // For now, return empty array (actual implementation would query MongoDB)
        logger.debug('Local resource query', { query: query.query });
        return [];
    }

    /**
     * Translate clearance between national classification systems
     */
    private translateClearance(
        clearance: string,
        mapping: Record<string, string>
    ): string {
        // First try exact match
        if (mapping[clearance]) {
            return mapping[clearance];
        }

        // Try uppercase
        if (mapping[clearance.toUpperCase()]) {
            return mapping[clearance.toUpperCase()];
        }

        // Return original if no mapping found
        return clearance;
    }

    /**
     * Determine obligations based on access context
     */
    private determineObligations(request: ICrossInstanceAuthzRequest): string[] {
        const obligations: string[] = [];

        // Cross-instance access always requires audit
        obligations.push('AUDIT_FEDERATED_ACCESS');

        // Different countries require marking
        if (request.subject.countryOfAffiliation !==
            INSTANCE_REGISTRY[request.resource.instanceId.toLowerCase()]?.country) {
            obligations.push('MARK_COALITION_ACCESS');
        }

        // Encrypted resources require KAS interaction
        if (request.action === 'decrypt') {
            obligations.push('KAS_KEY_REQUEST');
        }

        // High classification requires additional logging
        if (getClassificationLevel(request.resource.classification) >= 3) {
            obligations.push('ENHANCED_AUDIT_LOGGING');
        }

        return obligations;
    }

    /**
     * Generate cache key for authorization decision
     */
    private generateCacheKey(request: ICrossInstanceAuthzRequest): string {
        const keyData = {
            subject: request.subject.uniqueID,
            clearance: request.subject.clearance,
            country: request.subject.countryOfAffiliation,
            resource: request.resource.resourceId,
            instance: request.resource.instanceId,
            action: request.action,
        };

        return crypto
            .createHash('sha256')
            .update(JSON.stringify(keyData))
            .digest('hex');
    }

    /**
     * Get or create HTTP client for instance
     */
    private getHttpClient(instanceUrl: string): AxiosInstance {
        if (this.httpClients.has(instanceUrl)) {
            return this.httpClients.get(instanceUrl)!;
        }

        const client = axios.create({
            baseURL: instanceUrl,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'DIVE-V3-CrossInstance/1.0',
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: process.env.NODE_ENV === 'production',
            }),
        });

        this.httpClients.set(instanceUrl, client);
        return client;
    }

    /**
     * Clear authorization cache
     */
    clearCache(): void {
        this.authzCache.flushAll();
        logger.info('Cross-instance authorization cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { keys: number; hits: number; misses: number } {
        const stats = this.authzCache.getStats();
        return {
            keys: this.authzCache.keys().length,
            hits: stats.hits,
            misses: stats.misses,
        };
    }

    // ============================================
    // BILATERAL TRUST INTEGRATION
    // ============================================

    /**
     * Evaluate access with bilateral trust verification via token exchange service
     * Uses the token exchange service to verify trust between instances before authorization
     */
    async evaluateAccessWithBilateralTrust(request: ICrossInstanceAuthzRequest): Promise<ICrossInstanceAuthzResult> {
        const startTime = Date.now();
        const auditTrail: ICrossInstanceAuditEntry[] = [];

        // Step 1: Verify bilateral trust using token exchange service
        const sourceInstance = request.subject.originInstance || this.localInstanceId;
        const targetInstance = request.resource.instanceId;

        auditTrail.push({
            timestamp: new Date().toISOString(),
            instanceId: sourceInstance,
            action: 'bilateral_trust_check',
            outcome: 'allow',
            details: `Checking trust from ${sourceInstance} to ${targetInstance}`,
        });

        const bilateralTrust = await spokeTokenExchange.verifyBilateralTrust(
            sourceInstance.toUpperCase(),
            targetInstance.toUpperCase()
        );

        if (!bilateralTrust) {
            logger.warn('Cross-instance access denied: no bilateral trust', {
                requestId: request.requestId,
                sourceInstance,
                targetInstance,
            });

            auditTrail.push({
                timestamp: new Date().toISOString(),
                instanceId: sourceInstance,
                action: 'bilateral_trust_denied',
                outcome: 'deny',
                details: `No bilateral trust between ${sourceInstance} and ${targetInstance}`,
            });

            return {
                allow: false,
                reason: `No bilateral trust between ${sourceInstance} and ${targetInstance}`,
                evaluationDetails: {
                    localDecision: { allow: false, reason: 'Bilateral trust check failed' },
                    cacheHit: false,
                },
                executionTimeMs: Date.now() - startTime,
                auditTrail,
            };
        }

        // Step 2: Check classification against trust level
        const resourceClassification = getClassificationLevel(request.resource.classification);
        const maxAllowedClassification = getClassificationLevel(bilateralTrust.maxClassification);

        if (resourceClassification > maxAllowedClassification) {
            logger.warn('Cross-instance access denied: classification exceeds trust', {
                requestId: request.requestId,
                resourceClassification: request.resource.classification,
                maxAllowed: bilateralTrust.maxClassification,
            });

            auditTrail.push({
                timestamp: new Date().toISOString(),
                instanceId: targetInstance,
                action: 'classification_check_failed',
                outcome: 'deny',
                details: `Resource ${request.resource.classification} exceeds max ${bilateralTrust.maxClassification}`,
            });

            return {
                allow: false,
                reason: `Resource classification ${request.resource.classification} exceeds bilateral trust limit ${bilateralTrust.maxClassification}`,
                evaluationDetails: {
                    localDecision: { allow: false, reason: 'Classification exceeds trust level' },
                    cacheHit: false,
                },
                executionTimeMs: Date.now() - startTime,
                auditTrail,
            };
        }

        auditTrail.push({
            timestamp: new Date().toISOString(),
            instanceId: sourceInstance,
            action: 'bilateral_trust_verified',
            outcome: 'allow',
            details: `Trust level: ${bilateralTrust.trustLevel}, max classification: ${bilateralTrust.maxClassification}`,
        });

        // Step 3: Validate token if bearer token provided
        if (request.bearerToken) {
            const tokenValidation = await this.validateCrossInstanceToken(
                request.bearerToken,
                sourceInstance,
                targetInstance,
                request.requestId
            );

            auditTrail.push({
                timestamp: new Date().toISOString(),
                instanceId: sourceInstance,
                action: 'token_validation',
                outcome: tokenValidation.active ? 'allow' : 'deny',
                details: tokenValidation.error || 'Token validated successfully',
            });

            if (!tokenValidation.active) {
                return {
                    allow: false,
                    reason: `Token validation failed: ${tokenValidation.error}`,
                    evaluationDetails: {
                        localDecision: { allow: false, reason: 'Token validation failed' },
                        cacheHit: false,
                    },
                    executionTimeMs: Date.now() - startTime,
                    auditTrail,
                };
            }
        }

        // Step 4: Proceed with standard evaluation
        const result = await this.evaluateAccess(request);

        // Merge audit trails
        return {
            ...result,
            evaluationDetails: {
                ...result.evaluationDetails,
                bilateralTrust: {
                    sourceInstance,
                    targetInstance,
                    trustLevel: bilateralTrust.trustLevel,
                    maxClassification: bilateralTrust.maxClassification,
                    allowedScopes: bilateralTrust.allowedScopes,
                },
            },
            auditTrail: [...auditTrail, ...result.auditTrail],
        };
    }

    /**
     * Validate a token for cross-instance access using token exchange service
     */
    private async validateCrossInstanceToken(
        token: string,
        sourceInstance: string,
        targetInstance: string,
        requestId: string
    ): Promise<ITokenIntrospectionResult> {
        try {
            return await spokeTokenExchange.introspectToken({
                token,
                originInstance: sourceInstance,
                requestingInstance: targetInstance,
                requestId,
            });
        } catch (error) {
            logger.error('Cross-instance token validation error', {
                requestId,
                sourceInstance,
                targetInstance,
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            return {
                active: false,
                originInstance: sourceInstance,
                validatedAt: new Date(),
                trustVerified: false,
                error: error instanceof Error ? error.message : 'Token validation failed',
                cacheHit: false,
                latencyMs: 0,
            };
        }
    }

    /**
     * Get bilateral trusts for the local instance
     */
    getBilateralTrusts(): IBilateralTrust[] {
        return spokeTokenExchange.getBilateralTrusts(this.localInstanceId.toUpperCase());
    }

    /**
     * Check if bilateral trust exists between two instances
     */
    async hasBilateralTrust(sourceInstance: string, targetInstance: string): Promise<boolean> {
        const trust = await spokeTokenExchange.verifyBilateralTrust(sourceInstance, targetInstance);
        return trust !== null;
    }
}

// Export singleton instance
export const crossInstanceAuthzService = new CrossInstanceAuthzService();
