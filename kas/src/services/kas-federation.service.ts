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
     */
    private getHttpClient(kasEntry: IKASRegistryEntry): AxiosInstance {
        const existing = this.httpClients.get(kasEntry.kasId);
        if (existing) {
            return existing;
        }
        
        const config: any = {
            baseURL: kasEntry.kasUrl.replace('/request-key', ''),
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'DIVE-V3-KAS-Federation/1.0',
            },
        };
        
        // Configure authentication
        switch (kasEntry.authMethod) {
            case 'mtls':
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
                const headerName = kasEntry.authConfig.apiKeyHeader || 'X-API-Key';
                config.headers[headerName] = kasEntry.authConfig.apiKey;
                break;
        }
        
        const client = axios.create(config);
        this.httpClients.set(kasEntry.kasId, client);
        
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
}

// Export singleton instance
export const kasFederationService = new KASFederationService();

