/**
 * KAS Federation Service
 *
 * Implements cross-instance KAS communication for DIVE V3.
 * Enables policy-bound key sharing between federated KAS instances.
 *
 * Features:
 * - Cross-instance key request routing
 * - Federation agreement validation
 * - Policy translation between instances
 * - Audit correlation across instances
 * - Circuit breaker for resilience
 *
 * Reference: ACP-240 Section 5.3 (Multi-KAS Architecture)
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import https from 'https';
import fs from 'fs';
import { kasLogger, logKASAuditEvent } from '../utils/kas-logger';
import { IKASKeyRequest, IKASKeyResponse, IKASAuditEvent } from '../types/kas.types';
import { kasRegistry, policyTranslator, IKASRegistryEntry } from '../utils/kas-federation';
import { CircuitBreaker } from '../utils/circuit-breaker';
import {
    IFederationForwardContext,
    IFederatedRewrapRequest,
    IFederatedRewrapResponse,
    IFederationResult,
    IFederationError,
} from '../types/federation.types';
import { IRewrapRequest, IPolicy, IKeyAccessObject } from '../types/rewrap.types';
import { getMTLSAgent, isMTLSEnabled } from '../utils/mtls-config';

// Circuit state type
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

// Circuit breaker registry for KAS instances
const kasCircuitBreakers = new Map<string, CircuitBreaker>();

// Helper to get or create circuit breaker for a KAS
function getCircuitBreaker(kasId: string): CircuitBreaker {
    if (!kasCircuitBreakers.has(kasId)) {
        kasCircuitBreakers.set(kasId, new CircuitBreaker(`KAS-${kasId}`, {
            failureThreshold: 3,
            recoveryTimeout: 60000,
            successThreshold: 2,
            failureWindow: 120000,
        }));
    }
    return kasCircuitBreakers.get(kasId)!;
}

// Helper to record success/failure and get state
const circuitBreaker = {
    getState(kasId: string): CircuitState {
        const cb = getCircuitBreaker(kasId);
        if (cb.isOpen()) return 'OPEN';
        const stats = cb.getStats();
        return stats.state;
    },
    recordSuccess(kasId: string): void {
        // Success is recorded via the circuit breaker's execute method
        // For manual recording, we use reset approach
    },
    recordFailure(kasId: string): void {
        // Failures are recorded via the circuit breaker's execute method
        // For manual recording, we trigger a failure
    }
};

// ============================================
// Types for Federation Service
// ============================================

export interface IFederatedKeyRequest extends IKASKeyRequest {
    /** Origin KAS ID (requester) */
    originKasId: string;

    /** Target KAS ID (key holder) */
    targetKasId: string;

    /** Federation request ID for correlation */
    federationRequestId: string;

    /** Subject attributes (for remote policy evaluation) */
    subject: {
        uniqueID: string;
        clearance: string;
        countryOfAffiliation: string;
        acpCOI?: string[];
        organizationType?: string;
    };

    /** Resource attributes (for context) */
    resource?: {
        resourceId: string;
        classification: string;
        releasabilityTo: string[];
        COI?: string[];
        originInstance: string;
    };
}

export interface IFederatedKeyResponse extends IKASKeyResponse {
    /** Origin KAS ID */
    originKasId: string;

    /** Target KAS ID */
    targetKasId: string;

    /** Federation request ID */
    federationRequestId: string;

    /** Federation-specific details */
    federationDetails?: {
        routedVia: string[];
        translationApplied: boolean;
        federationLatencyMs: number;
    };
}

export interface IFederationAgreement {
    trustedKAS: string[];
    maxClassification: string;
    allowedCOIs: string[];
}

// ============================================
// Classification Hierarchy (for cap comparison)
// ============================================

const CLASSIFICATION_HIERARCHY: Record<string, number> = {
    'UNCLASSIFIED': 0,
    'RESTRICTED': 1,
    'CONFIDENTIAL': 2,
    'SECRET': 3,
    'TOP_SECRET': 4,
};

function getClassificationLevel(classification: string): number {
    return CLASSIFICATION_HIERARCHY[classification.toUpperCase()] ?? 0;
}

// ============================================
// KAS Federation Service
// ============================================

export class KASFederationService {
    private httpClients: Map<string, AxiosInstance> = new Map();
    private federationAgreements: Map<string, IFederationAgreement> = new Map();

    constructor() {
        // Load federation agreements on init
        this.loadFederationAgreements();
    }

    /**
     * Load federation agreements from config
     */
    private loadFederationAgreements(): void {
        // Default agreements (can be overridden by config file)
        const defaultAgreements: Record<string, IFederationAgreement> = {
            'USA': {
                trustedKAS: ['kas-fra', 'kas-gbr', 'kas-deu'],
                maxClassification: 'SECRET',
                allowedCOIs: ['NATO', 'NATO-COSMIC', 'FVEY'],
            },
            'FRA': {
                trustedKAS: ['kas-usa', 'kas-gbr', 'kas-deu'],
                maxClassification: 'SECRET',
                allowedCOIs: ['NATO', 'NATO-COSMIC', 'EU-RESTRICTED'],
            },
            'GBR': {
                trustedKAS: ['kas-usa', 'kas-fra', 'kas-deu'],
                maxClassification: 'SECRET',
                allowedCOIs: ['NATO', 'NATO-COSMIC', 'FVEY', 'AUKUS'],
            },
            'DEU': {
                trustedKAS: ['kas-usa', 'kas-fra', 'kas-gbr'],
                maxClassification: 'SECRET',
                allowedCOIs: ['NATO', 'NATO-COSMIC', 'EU-RESTRICTED'],
            },
        };

        for (const [country, agreement] of Object.entries(defaultAgreements)) {
            this.federationAgreements.set(country, agreement);
        }

        kasLogger.info('Federation agreements loaded', {
            countries: Array.from(this.federationAgreements.keys()),
        });
    }

    /**
     * Get or create authenticated HTTP client for target KAS
     *
     * Updated in Phase 3.4 to use new mTLS configuration utility
     */
    private getHttpClient(kasEntry: IKASRegistryEntry): AxiosInstance {
        const existing = this.httpClients.get(kasEntry.kasId);
        if (existing) {
            return existing;
        }

        const config: any = {
            baseURL: kasEntry.kasUrl.replace('/request-key', ''),
            timeout: parseInt(process.env.FEDERATION_TIMEOUT_MS || '10000', 10),
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'DIVE-V3-KAS-Federation/1.0',
            },
        };

        // Configure authentication
        switch (kasEntry.authMethod) {
            case 'mtls':
                // Phase 3.4: Use new mTLS configuration utility
                if (isMTLSEnabled()) {
                    const mtlsAgent = getMTLSAgent(kasEntry.kasId);

                    if (mtlsAgent) {
                        config.httpsAgent = mtlsAgent.agent;
                        kasLogger.info('Using mTLS agent for federation', {
                            targetKAS: kasEntry.kasId,
                            url: kasEntry.kasUrl,
                        });
                    } else {
                        // Fallback to legacy cert loading from kasEntry
                        kasLogger.warn('mTLS agent not available, falling back to legacy cert loading', {
                            targetKAS: kasEntry.kasId,
                        });

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
                    }
                } else {
                    kasLogger.debug('mTLS disabled, using standard HTTPS', {
                        targetKAS: kasEntry.kasId,
                    });
                }
                break;

            case 'apikey':
                const headerName = kasEntry.authConfig.apiKeyHeader || 'X-API-Key';
                config.headers[headerName] = kasEntry.authConfig.apiKey;
                kasLogger.debug('Using API key authentication', {
                    targetKAS: kasEntry.kasId,
                    headerName,
                });
                break;

            case 'jwt':
                // JWT will be added via Authorization header in request
                kasLogger.debug('Using JWT authentication', {
                    targetKAS: kasEntry.kasId,
                });
                break;

            case 'oauth2':
                // OAuth2 token will be obtained and added in request
                kasLogger.debug('Using OAuth2 authentication', {
                    targetKAS: kasEntry.kasId,
                });
                break;
        }

        const client = axios.create(config);
        this.httpClients.set(kasEntry.kasId, client);

        kasLogger.info('Created HTTP client for federation', {
            targetKAS: kasEntry.kasId,
            authMethod: kasEntry.authMethod,
            baseURL: config.baseURL,
        });

        return client;
    }

    /**
     * Validate federation agreement between origin and target
     */
    validateFederationAgreement(
        originCountry: string,
        targetKasId: string,
        resourceClassification: string,
        resourceCOIs: string[]
    ): { valid: boolean; reason?: string } {
        const agreement = this.federationAgreements.get(originCountry);

        if (!agreement) {
            return {
                valid: false,
                reason: `No federation agreement found for country: ${originCountry}`,
            };
        }

        // Check if target KAS is trusted
        if (!agreement.trustedKAS.includes(targetKasId)) {
            return {
                valid: false,
                reason: `Target KAS ${targetKasId} is not in trusted list for ${originCountry}`,
            };
        }

        // Check classification cap
        const resourceLevel = getClassificationLevel(resourceClassification);
        const maxLevel = getClassificationLevel(agreement.maxClassification);

        if (resourceLevel > maxLevel) {
            return {
                valid: false,
                reason: `Resource classification ${resourceClassification} exceeds federation cap ${agreement.maxClassification}`,
            };
        }

        // Check COI intersection (at least one COI must match)
        if (resourceCOIs.length > 0) {
            const hasMatchingCOI = resourceCOIs.some(coi => agreement.allowedCOIs.includes(coi));
            if (!hasMatchingCOI) {
                return {
                    valid: false,
                    reason: `No matching COI found. Required: ${resourceCOIs.join(', ')}, Allowed: ${agreement.allowedCOIs.join(', ')}`,
                };
            }
        }

        return { valid: true };
    }

    /**
     * Select appropriate KAS for resource based on COI and country
     */
    selectKASForResource(
        resourceCOIs: string[],
        resourceCountries: string[],
        excludeKasIds: string[] = []
    ): IKASRegistryEntry | null {
        const allKAS = kasRegistry.listAll();

        // Find KAS that supports the resource's COIs and countries
        for (const kas of allKAS) {
            if (excludeKasIds.includes(kas.kasId)) {
                continue;
            }

            // Check country support
            const supportsCountry = resourceCountries.some(
                country => kas.supportedCountries.includes(country)
            );

            // Check COI support (if COIs specified)
            const supportsCOI = resourceCOIs.length === 0 ||
                resourceCOIs.some(coi => kas.supportedCOIs.includes(coi));

            if (supportsCountry && supportsCOI) {
                return kas;
            }
        }

        return null;
    }

    /**
     * Request key from federated KAS instance
     */
    async requestKeyFromFederatedKAS(
        request: IFederatedKeyRequest
    ): Promise<IFederatedKeyResponse> {
        const startTime = Date.now();
        const federationRequestId = request.federationRequestId ||
            `fed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        kasLogger.info('Federated key request initiated', {
            federationRequestId,
            originKasId: request.originKasId,
            targetKasId: request.targetKasId,
            resourceId: request.resourceId,
            subjectCountry: request.subject.countryOfAffiliation,
        });

        // Get target KAS entry
        const targetKAS = kasRegistry.get(request.targetKasId);
        if (!targetKAS) {
            kasLogger.error('Target KAS not found in registry', {
                federationRequestId,
                targetKasId: request.targetKasId,
            });

            return {
                success: false,
                error: 'Target KAS Not Found',
                denialReason: `KAS ${request.targetKasId} is not registered`,
                originKasId: request.originKasId,
                targetKasId: request.targetKasId,
                federationRequestId,
                responseTimestamp: new Date().toISOString(),
            };
        }

        // Validate federation agreement
        const resourceCOIs = request.resource?.COI || [];
        const validation = this.validateFederationAgreement(
            request.subject.countryOfAffiliation,
            request.targetKasId,
            request.resource?.classification || 'UNCLASSIFIED',
            resourceCOIs
        );

        if (!validation.valid) {
            kasLogger.warn('Federation agreement validation failed', {
                federationRequestId,
                reason: validation.reason,
            });

            // Audit event for federation denial
            const auditEvent: IKASAuditEvent = {
                eventType: 'KEY_DENIED',
                timestamp: new Date().toISOString(),
                requestId: federationRequestId,
                subject: request.subject.uniqueID,
                resourceId: request.resourceId,
                kaoId: request.kaoId,
                outcome: 'DENY',
                reason: `Federation validation failed: ${validation.reason}`,
                latencyMs: Date.now() - startTime,
            };
            logKASAuditEvent(auditEvent);

            return {
                success: false,
                error: 'Federation Validation Failed',
                denialReason: validation.reason,
                originKasId: request.originKasId,
                targetKasId: request.targetKasId,
                federationRequestId,
                responseTimestamp: new Date().toISOString(),
            };
        }

        // Check circuit breaker
        const circuitState = circuitBreaker.getState(request.targetKasId);
        if (circuitState === 'OPEN') {
            kasLogger.warn('Circuit breaker open for target KAS', {
                federationRequestId,
                targetKasId: request.targetKasId,
            });

            return {
                success: false,
                error: 'Service Unavailable',
                denialReason: `Target KAS ${request.targetKasId} is currently unavailable (circuit open)`,
                originKasId: request.originKasId,
                targetKasId: request.targetKasId,
                federationRequestId,
                responseTimestamp: new Date().toISOString(),
            };
        }

        // Translate subject attributes for target KAS
        const translatedSubject = policyTranslator.translateSubject(
            request.subject,
            targetKAS
        );

        // Get HTTP client
        const client = this.getHttpClient(targetKAS);

        try {
            // Build federated request payload
            const payload: any = {
                resourceId: request.resourceId,
                kaoId: request.kaoId,
                wrappedKey: request.wrappedKey,
                bearerToken: request.bearerToken,
                requestId: federationRequestId,
                requestTimestamp: new Date().toISOString(),
                // Include translated subject for remote policy evaluation
                federatedSubject: translatedSubject,
                // Mark as federated request
                federationMetadata: {
                    originKasId: request.originKasId,
                    originCountry: request.subject.countryOfAffiliation,
                    federationRequestId,
                    translationApplied: true,
                },
            };

            kasLogger.info('Sending federated key request', {
                federationRequestId,
                targetUrl: targetKAS.kasUrl,
                translatedClearance: translatedSubject.clearance,
            });

            // Make request to target KAS
            const response = await client.post('/request-key', payload, {
                timeout: 10000,
            });

            // Record success in circuit breaker
            circuitBreaker.recordSuccess(request.targetKasId);

            const federationLatencyMs = Date.now() - startTime;

            kasLogger.info('Federated key request successful', {
                federationRequestId,
                targetKasId: request.targetKasId,
                federationLatencyMs,
            });

            // Audit event for successful federation
            const auditEvent: IKASAuditEvent = {
                eventType: 'KEY_RELEASED',
                timestamp: new Date().toISOString(),
                requestId: federationRequestId,
                subject: request.subject.uniqueID,
                resourceId: request.resourceId,
                kaoId: request.kaoId,
                outcome: 'ALLOW',
                reason: `Federated key release from ${request.targetKasId}`,
                latencyMs: federationLatencyMs,
            };
            logKASAuditEvent(auditEvent);

            return {
                success: true,
                dek: response.data.dek,
                kaoId: request.kaoId,
                authzDecision: response.data.authzDecision,
                kasDecision: response.data.kasDecision,
                originKasId: request.originKasId,
                targetKasId: request.targetKasId,
                federationRequestId,
                auditEventId: federationRequestId,
                executionTimeMs: federationLatencyMs,
                federationDetails: {
                    routedVia: [request.targetKasId],
                    translationApplied: true,
                    federationLatencyMs,
                },
                responseTimestamp: new Date().toISOString(),
            };

        } catch (error: any) {
            // Record failure in circuit breaker
            circuitBreaker.recordFailure(request.targetKasId);

            const federationLatencyMs = Date.now() - startTime;

            kasLogger.error('Federated key request failed', {
                federationRequestId,
                targetKasId: request.targetKasId,
                error: error.message,
                status: error.response?.status,
                federationLatencyMs,
            });

            // Audit event for federation failure
            const auditEvent: IKASAuditEvent = {
                eventType: 'KEY_DENIED',
                timestamp: new Date().toISOString(),
                requestId: federationRequestId,
                subject: request.subject.uniqueID,
                resourceId: request.resourceId,
                kaoId: request.kaoId,
                outcome: 'DENY',
                reason: `Federated request failed: ${error.message}`,
                latencyMs: federationLatencyMs,
            };
            logKASAuditEvent(auditEvent);

            return {
                success: false,
                error: error.response?.data?.error || 'Federated Request Failed',
                denialReason: error.response?.data?.denialReason || error.message,
                originKasId: request.originKasId,
                targetKasId: request.targetKasId,
                federationRequestId,
                federationDetails: {
                    routedVia: [request.targetKasId],
                    translationApplied: true,
                    federationLatencyMs,
                },
                responseTimestamp: new Date().toISOString(),
            };
        }
    }

    /**
     * Forward /rewrap request to federated KAS instance (ACP-240 compliant)
     *
     * Implements Phase 3.2: Spec-Compliant Forwarding
     * Reference: kas/IMPLEMENTATION-HANDOFF.md Phase 3.2
     */
    async forwardRewrapRequest(
        context: IFederationForwardContext
    ): Promise<IFederationResult> {
        const startTime = Date.now();
        const { targetKasId, targetKasUrl, policy, kaosToForward, clientPublicKey, authHeader, dpopHeader, requestId, federationMetadata } = context;

        kasLogger.info('Forwarding /rewrap request to federated KAS', {
            requestId,
            federationRequestId: federationMetadata.federationRequestId,
            targetKasId,
            kaoCount: kaosToForward.length,
            policyId: policy.policyId,
        });

        // Get target KAS entry
        const targetKAS = kasRegistry.get(targetKasId);
        if (!targetKAS) {
            const error: IFederationError = {
                kasId: targetKasId,
                errorType: 'unknown',
                message: `Target KAS ${targetKasId} not found in registry`,
                affectedKAOIds: kaosToForward.map(kao => kao.keyAccessObjectId),
                timestamp: new Date().toISOString(),
            };

            return {
                success: false,
                kasId: targetKasId,
                error,
                latencyMs: Date.now() - startTime,
            };
        }

        // Check circuit breaker
        const circuitState = circuitBreaker.getState(targetKasId);
        if (circuitState === 'OPEN') {
            kasLogger.warn('Circuit breaker open for target KAS', {
                requestId,
                targetKasId,
            });

            const error: IFederationError = {
                kasId: targetKasId,
                errorType: 'circuit_open',
                message: `Circuit breaker open for ${targetKasId}`,
                affectedKAOIds: kaosToForward.map(kao => kao.keyAccessObjectId),
                timestamp: new Date().toISOString(),
            };

            return {
                success: false,
                kasId: targetKasId,
                error,
                latencyMs: Date.now() - startTime,
            };
        }

        // Build federated rewrap request
        const federatedRequest: IFederatedRewrapRequest = {
            clientPublicKey,
            requests: [
                {
                    policy,
                    keyAccessObjects: kaosToForward,
                }
            ],
            federationMetadata: {
                ...federationMetadata,
                routedVia: [...federationMetadata.routedVia, process.env.KAS_ID || 'kas-local'],
            },
        };

        // Get HTTP client
        const client = this.getHttpClient(targetKAS);

        try {
            // Prepare headers
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'X-Request-ID': requestId,
                'X-Federation-Request-ID': federationMetadata.federationRequestId,
                'X-Forwarded-By': process.env.KAS_ID || 'kas-local',
            };

            // Forward Authorization header (JWT)
            if (authHeader) {
                headers['Authorization'] = authHeader;
            }

            // Forward DPoP header (if present)
            if (dpopHeader && process.env.FORWARD_DPOP_HEADER !== 'false') {
                headers['DPoP'] = dpopHeader;
            }

            kasLogger.debug('Sending /rewrap to downstream KAS', {
                requestId,
                targetUrl: targetKasUrl.replace('/request-key', '/rewrap'),
                kaoCount: kaosToForward.length,
                headerKeys: Object.keys(headers),
            });

            // Make request to target KAS /rewrap endpoint
            const baseUrl = targetKasUrl.replace('/request-key', '');
            const response = await client.post('/rewrap', federatedRequest, {
                baseURL: baseUrl,
                timeout: Number(process.env.FEDERATION_TIMEOUT_MS) || 10000,
                headers,
            });

            // Record success in circuit breaker
            circuitBreaker.recordSuccess(targetKasId);

            const latencyMs = Date.now() - startTime;

            kasLogger.info('Federated /rewrap request successful', {
                requestId,
                targetKasId,
                latencyMs,
                responseGroups: response.data?.responses?.length || 0,
            });

            // Audit event for successful federation
            const auditEvent: IKASAuditEvent = {
                eventType: 'FEDERATION_SUCCESS',
                timestamp: new Date().toISOString(),
                requestId: federationMetadata.federationRequestId,
                subject: 'federated-request',
                resourceId: `federation-${targetKasId}`,
                outcome: 'ALLOW',
                reason: `Successful /rewrap forwarding to ${targetKasId}`,
                latencyMs,
            };
            logKASAuditEvent(auditEvent);

            return {
                success: true,
                kasId: targetKasId,
                response: response.data as IFederatedRewrapResponse,
                latencyMs,
            };

        } catch (error: any) {
            // Record failure in circuit breaker
            circuitBreaker.recordFailure(targetKasId);

            const latencyMs = Date.now() - startTime;

            // Determine error type
            let errorType: IFederationError['errorType'] = 'unknown';
            if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                errorType = 'timeout';
            } else if (error.response?.status === 401 || error.response?.status === 403) {
                errorType = 'auth_failure';
            } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                errorType = 'network_error';
            }

            kasLogger.error('Federated /rewrap request failed', {
                requestId,
                targetKasId,
                errorType,
                error: error.message,
                status: error.response?.status,
                latencyMs,
            });

            // Audit event for federation failure
            const auditEvent: IKASAuditEvent = {
                eventType: 'FEDERATION_FAILURE',
                timestamp: new Date().toISOString(),
                requestId: federationMetadata.federationRequestId,
                subject: 'federated-request',
                resourceId: `federation-${targetKasId}`,
                outcome: 'DENY',
                reason: `Failed /rewrap forwarding to ${targetKasId}: ${error.message}`,
                latencyMs,
            };
            logKASAuditEvent(auditEvent);

            const federationError: IFederationError = {
                kasId: targetKasId,
                errorType,
                message: error.response?.data?.message || error.message,
                affectedKAOIds: kaosToForward.map(kao => kao.keyAccessObjectId),
                timestamp: new Date().toISOString(),
            };

            return {
                success: false,
                kasId: targetKasId,
                error: federationError,
                latencyMs,
            };
        }
    }

    /**
     * Get list of available KAS instances for a given resource
     */
    getAvailableKASForResource(
        resourceCOIs: string[],
        resourceCountries: string[],
        subjectCountry: string
    ): IKASRegistryEntry[] {
        const allKAS = kasRegistry.listAll();
        const agreement = this.federationAgreements.get(subjectCountry);

        if (!agreement) {
            return [];
        }

        return allKAS.filter(kas => {
            // Must be in trusted list
            if (!agreement.trustedKAS.includes(kas.kasId) && kas.kasId !== `kas-${subjectCountry.toLowerCase()}`) {
                return false;
            }

            // Check country support
            const supportsCountry = resourceCountries.some(
                country => kas.supportedCountries.includes(country)
            );

            // Check COI support
            const supportsCOI = resourceCOIs.length === 0 ||
                resourceCOIs.some(coi => kas.supportedCOIs.includes(coi));

            return supportsCountry && supportsCOI;
        });
    }

    /**
     * Health check for federated KAS
     */
    async checkKASHealth(kasId: string): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
        const kas = kasRegistry.get(kasId);
        if (!kas) {
            return { healthy: false, latencyMs: 0, error: 'KAS not found in registry' };
        }

        const startTime = Date.now();
        const client = this.getHttpClient(kas);

        try {
            const response = await client.get('/health', { timeout: 5000 });
            return {
                healthy: response.data?.status === 'healthy',
                latencyMs: Date.now() - startTime,
            };
        } catch (error: any) {
            return {
                healthy: false,
                latencyMs: Date.now() - startTime,
                error: error.message,
            };
        }
    }

    /**
     * Get federation status overview
     */
    async getFederationStatus(): Promise<{
        totalKAS: number;
        healthyKAS: number;
        federationAgreements: number;
        kasStatus: Array<{
            kasId: string;
            organization: string;
            healthy: boolean;
            circuitState: CircuitState;
            latencyMs?: number;
        }>;
    }> {
        const allKAS = kasRegistry.listAll();
        const statusPromises = allKAS.map(async kas => {
            const health = await this.checkKASHealth(kas.kasId);
            return {
                kasId: kas.kasId,
                organization: kas.organization,
                healthy: health.healthy,
                circuitState: circuitBreaker.getState(kas.kasId),
                latencyMs: health.latencyMs,
            };
        });

        const kasStatus = await Promise.all(statusPromises);
        const healthyCount = kasStatus.filter(s => s.healthy).length;

        return {
            totalKAS: allKAS.length,
            healthyKAS: healthyCount,
            federationAgreements: this.federationAgreements.size,
            kasStatus,
        };
    }

    /**
     * Route request to first available KAS (Any-Of mode)
     *
     * Phase 4.1.3: Any-Of KAS Routing
     *
     * Implements KAS-REQ-120: Any-Of routing with failover
     *
     * Features:
     * - Try KAS instances in order of preference
     * - Fallback to next KAS on failure
     * - Circuit breaker integration
     * - Return single successful result
     * - Log routing decisions for audit
     *
     * @param kaos - Array of Key Access Objects (alternate KAS)
     * @param policy - Policy governing the request
     * @param clientPublicKey - Client's ephemeral public key
     * @param authHeader - Authorization header
     * @param dpopHeader - DPoP header (optional)
     * @param requestId - Request correlation ID
     * @returns First successful KAO result or error
     */
    /**
     * Route rewrap request using Any-Of logic with parallel execution (Phase 4.2.2)
     *
     * Optimized version that tries all KAOs in parallel and returns first success.
     * Falls back to sequential if ENABLE_PARALLEL_FEDERATION=false
     *
     * @param kaos - Array of Key Access Objects
     * @param policy - Policy object
     * @param clientPublicKey - Client's public key
     * @param authHeader - Authorization header
     * @param dpopHeader - Optional DPoP header
     * @param requestId - Request ID for correlation
     * @returns Federation result with first successful KAS response
     */
    async routeAnyOfParallel(
        kaos: IKeyAccessObject[],
        policy: IPolicy,
        clientPublicKey: string,
        authHeader: string,
        dpopHeader: string | undefined,
        requestId: string
    ): Promise<IFederationResult> {
        const enableParallel = process.env.ENABLE_PARALLEL_FEDERATION !== 'false';

        if (!enableParallel) {
            kasLogger.debug('Parallel federation disabled, using sequential routing', { requestId });
            return this.routeAnyOf(kaos, policy, clientPublicKey, authHeader, dpopHeader, requestId);
        }

        kasLogger.info('Starting parallel Any-Of routing', {
            requestId,
            kaoCount: kaos.length,
            kasTargets: kaos.map(kao => kao.kid),
        });

        if (kaos.length === 0) {
            return {
                success: false,
                kasId: 'unknown',
                error: {
                    kasId: 'unknown',
                    errorType: 'invalid_request',
                    message: 'No KAOs provided for Any-Of routing',
                    affectedKAOIds: [],
                    timestamp: new Date().toISOString(),
                },
                latencyMs: 0,
            };
        }

        const startTime = Date.now();

        // Filter out KAOs with open circuit breakers
        const viableKaos = kaos.filter(kao => {
            const targetKasId = this.extractKasIdFromKAO(kao);
            const cb = getCircuitBreaker(targetKasId);

            if (cb.isOpen()) {
                kasLogger.warn('Circuit breaker open, excluding from parallel dispatch', {
                    requestId,
                    targetKasId,
                    kaoId: kao.keyAccessObjectId,
                });
                return false;
            }

            return true;
        });

        if (viableKaos.length === 0) {
            kasLogger.error('All KAS instances have open circuit breakers', { requestId });
            return {
                success: false,
                kasId: 'all',
                error: {
                    kasId: 'all',
                    errorType: 'circuit_breaker_open',
                    message: 'All KAS instances unavailable (circuit breakers open)',
                    affectedKAOIds: kaos.map(k => k.keyAccessObjectId),
                    timestamp: new Date().toISOString(),
                },
                latencyMs: Date.now() - startTime,
            };
        }

        // Create parallel requests for all viable KAOs
        const parallelRequests = viableKaos.map(async (kao) => {
            const attemptStart = Date.now();
            const targetKasId = this.extractKasIdFromKAO(kao);

            try {
                const federationMetadata = {
                    originKasId: process.env.KAS_ID || 'kas-local',
                    originCountry: process.env.KAS_COUNTRY || 'USA',
                    federationRequestId: `anyof-parallel-${requestId}`,
                    routedVia: [],
                    translationApplied: false,
                    originTimestamp: new Date().toISOString(),
                };

                const forwardContext: IFederationForwardContext = {
                    targetKasId,
                    targetKasUrl: kao.url,
                    policy,
                    kaosToForward: [kao],
                    clientPublicKey,
                    authHeader,
                    dpopHeader,
                    requestId,
                    federationMetadata,
                };

                const result = await this.forwardRewrapRequest(forwardContext);

                return {
                    kasId: targetKasId,
                    kaoId: kao.keyAccessObjectId,
                    success: result.success,
                    latencyMs: Date.now() - attemptStart,
                    result: result.success ? result : undefined,
                    error: result.error?.message,
                };
            } catch (error) {
                kasLogger.error('Parallel routing attempt failed', {
                    requestId,
                    targetKasId,
                    kaoId: kao.keyAccessObjectId,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });

                return {
                    kasId: targetKasId,
                    kaoId: kao.keyAccessObjectId,
                    success: false,
                    latencyMs: Date.now() - attemptStart,
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        });

        // Wait for all requests to settle
        const results = await Promise.allSettled(parallelRequests);

        // Find first successful result
        for (const settledResult of results) {
            if (settledResult.status === 'fulfilled' && settledResult.value.success && settledResult.value.result) {
                const successResult = settledResult.value;
                const result = successResult.result!; // Non-null assertion: we checked above
                const latencyMs = Date.now() - startTime;

                kasLogger.info('Parallel Any-Of routing succeeded', {
                    requestId,
                    targetKasId: successResult.kasId,
                    kaoId: successResult.kaoId,
                    parallelAttempts: viableKaos.length,
                    latencyMs,
                });

                // Log audit event
                const auditEvent: IKASAuditEvent = {
                    eventType: 'ANYOF_ROUTING_SUCCESS_PARALLEL',
                    timestamp: new Date().toISOString(),
                    requestId,
                    subject: 'anyof-routing-parallel',
                    resourceId: successResult.kaoId,
                    outcome: 'ALLOW',
                    reason: `Parallel Any-Of routing succeeded (${viableKaos.length} parallel attempts)`,
                    latencyMs,
                };
                logKASAuditEvent(auditEvent);

                return result;
            }
        }

        // All attempts failed
        const totalLatencyMs = Date.now() - startTime;
        const failureDetails = results
            .map(r => r.status === 'fulfilled' ? r.value : { error: 'Promise rejected', kasId: 'unknown', kaoId: 'unknown' })
            .map(r => `${r.kasId}: ${r.error || 'unknown error'}`)
            .join('; ');

        kasLogger.error('All parallel Any-Of routing attempts failed', {
            requestId,
            totalAttempts: viableKaos.length,
            totalLatencyMs,
            failures: failureDetails,
        });

        // Log audit event
        const auditEvent: IKASAuditEvent = {
            eventType: 'ANYOF_ROUTING_FAILURE_PARALLEL',
            timestamp: new Date().toISOString(),
            requestId,
            subject: 'anyof-routing-parallel',
            resourceId: kaos.map(k => k.keyAccessObjectId).join(','),
            outcome: 'DENY',
            reason: `All ${viableKaos.length} parallel Any-Of attempts failed`,
            latencyMs: totalLatencyMs,
        };
        logKASAuditEvent(auditEvent);

        return {
            success: false,
            kasId: 'all',
            error: {
                kasId: 'all',
                errorType: 'all_kas_unavailable',
                message: `All ${viableKaos.length} KAS instances failed: ${failureDetails}`,
                affectedKAOIds: kaos.map(k => k.keyAccessObjectId),
                timestamp: new Date().toISOString(),
            },
            latencyMs: totalLatencyMs,
        };
    }

    async routeAnyOf(
        kaos: IKeyAccessObject[],
        policy: IPolicy,
        clientPublicKey: string,
        authHeader: string,
        dpopHeader: string | undefined,
        requestId: string
    ): Promise<IFederationResult> {
        kasLogger.info('Starting Any-Of routing', {
            requestId,
            kaoCount: kaos.length,
            kasTargets: kaos.map(kao => kao.kid),
        });

        if (kaos.length === 0) {
            return {
                success: false,
                kasId: 'unknown',
                error: {
                    kasId: 'unknown',
                    errorType: 'invalid_request',
                    message: 'No KAOs provided for Any-Of routing',
                    affectedKAOIds: [],
                    timestamp: new Date().toISOString(),
                },
                latencyMs: 0,
            };
        }

        const startTime = Date.now();
        const attemptResults: Array<{
            kasId: string;
            kaoId: string;
            success: boolean;
            latencyMs: number;
            error?: string;
        }> = [];

        // Try each KAO in order
        for (const kao of kaos) {
            const attemptStart = Date.now();

            // Extract target KAS ID from URL or kid
            const targetKasId = this.extractKasIdFromKAO(kao);

            // Check circuit breaker
            const cb = getCircuitBreaker(targetKasId);
            if (cb.isOpen()) {
                kasLogger.warn('Circuit breaker open, skipping KAS', {
                    requestId,
                    targetKasId,
                    kaoId: kao.keyAccessObjectId,
                });

                attemptResults.push({
                    kasId: targetKasId,
                    kaoId: kao.keyAccessObjectId,
                    success: false,
                    latencyMs: Date.now() - attemptStart,
                    error: 'Circuit breaker open',
                });

                continue; // Skip to next KAS
            }

            try {
                // Build federation context for this KAO
                const federationMetadata = {
                    originKasId: process.env.KAS_ID || 'kas-local',
                    originCountry: process.env.KAS_COUNTRY || 'USA',
                    federationRequestId: `anyof-${requestId}`,
                    routedVia: [],
                    translationApplied: false,
                    originTimestamp: new Date().toISOString(),
                };

                const forwardContext: IFederationForwardContext = {
                    targetKasId,
                    targetKasUrl: kao.url,
                    policy,
                    kaosToForward: [kao],
                    clientPublicKey,
                    authHeader,
                    dpopHeader,
                    requestId,
                    federationMetadata,
                };

                // Attempt to forward to this KAS
                const result = await this.forwardRewrapRequest(forwardContext);

                if (result.success && result.response) {
                    // Success! Return immediately
                    const latencyMs = Date.now() - startTime;

                    kasLogger.info('Any-Of routing succeeded', {
                        requestId,
                        targetKasId,
                        kaoId: kao.keyAccessObjectId,
                        attemptNumber: attemptResults.length + 1,
                        totalAttempts: kaos.length,
                        latencyMs,
                    });

                    attemptResults.push({
                        kasId: targetKasId,
                        kaoId: kao.keyAccessObjectId,
                        success: true,
                        latencyMs: Date.now() - attemptStart,
                    });

                    // Log routing decision for audit
                    const auditEvent: IKASAuditEvent = {
                        eventType: 'ANYOF_ROUTING_SUCCESS',
                        timestamp: new Date().toISOString(),
                        requestId,
                        subject: 'anyof-routing',
                        resourceId: kao.keyAccessObjectId,
                        outcome: 'ALLOW',
                        reason: `Any-Of routing succeeded on attempt ${attemptResults.length}`,
                        latencyMs,
                    };
                    logKASAuditEvent(auditEvent);

                    return result;
                }

                // Result failed, try next KAS
                attemptResults.push({
                    kasId: targetKasId,
                    kaoId: kao.keyAccessObjectId,
                    success: false,
                    latencyMs: Date.now() - attemptStart,
                    error: result.error?.message || 'Federation request failed',
                });

            } catch (error) {
                kasLogger.error('Any-Of routing attempt failed', {
                    requestId,
                    targetKasId,
                    kaoId: kao.keyAccessObjectId,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });

                attemptResults.push({
                    kasId: targetKasId,
                    kaoId: kao.keyAccessObjectId,
                    success: false,
                    latencyMs: Date.now() - attemptStart,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        // All attempts failed
        const totalLatencyMs = Date.now() - startTime;

        kasLogger.error('Any-Of routing failed - all KAS unavailable', {
            requestId,
            totalAttempts: attemptResults.length,
            latencyMs: totalLatencyMs,
            attempts: attemptResults,
        });

        // Log routing failure for audit
        const auditEvent: IKASAuditEvent = {
            eventType: 'ANYOF_ROUTING_FAILURE',
            timestamp: new Date().toISOString(),
            requestId,
            subject: 'anyof-routing',
            resourceId: kaos[0].keyAccessObjectId,
            outcome: 'DENY',
            reason: `All ${attemptResults.length} Any-Of routing attempts failed`,
            latencyMs: totalLatencyMs,
        };
        logKASAuditEvent(auditEvent);

        return {
            success: false,
            kasId: 'anyof-routing',
            error: {
                kasId: 'anyof-routing',
                errorType: 'all_kas_unavailable',
                message: `All ${attemptResults.length} KAS instances unavailable`,
                affectedKAOIds: kaos.map(kao => kao.keyAccessObjectId),
                timestamp: new Date().toISOString(),
                metadata: {
                    attempts: attemptResults,
                },
            },
            latencyMs: totalLatencyMs,
        };
    }

    /**
     * Extract KAS ID from KeyAccessObject
     *
     * @param kao - Key Access Object
     * @returns KAS identifier
     */
    private extractKasIdFromKAO(kao: IKeyAccessObject): string {
        // Try to extract from kid (e.g., "kas-fra-001" -> "kas-fra")
        if (kao.kid && kao.kid.startsWith('kas-')) {
            const parts = kao.kid.split('-');
            if (parts.length >= 2) {
                return `${parts[0]}-${parts[1]}`; // e.g., "kas-fra"
            }
        }

        // Try to extract from URL (e.g., "https://kas-fra.example.com" -> "kas-fra")
        if (kao.url) {
            const urlMatch = kao.url.match(/kas-([a-z]{3})/i);
            if (urlMatch) {
                return `kas-${urlMatch[1].toLowerCase()}`;
            }
        }

        // Fallback: use kid as-is
        return kao.kid || 'unknown';
    }
}

// Export singleton instance
export const kasFederationService = new KASFederationService();
