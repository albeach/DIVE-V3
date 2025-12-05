/**
 * ZTDF Multi-KAS Decryption Service
 * 
 * Implements multi-KAO (Key Access Object) support for ZTDF decryption.
 * Provides resilient decryption through KAO fallback chains.
 * 
 * Features:
 * - Multi-KAO selection based on user attributes and COI
 * - KAO fallback chain for resilience
 * - Circuit breaker integration
 * - Cross-instance KAS federation support
 * - Prometheus metrics collection
 * 
 * Reference: ACP-240 Section 5.2 (Multi-KAS Architecture)
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import https from 'https';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { IZTDFObject } from '../types/ztdf.types';

// ============================================
// Types
// ============================================

export interface IKeyAccessObject {
    kaoId: string;
    kasUrl: string;
    kasId?: string;
    wrappedKey: string;
    wrappingAlgorithm?: string;
    policyBinding: {
        clearanceRequired: string;
        countriesAllowed: string[];
        coiRequired?: string[];
    };
}

export interface IKAOSelectionResult {
    /** Selected KAOs in priority order */
    selectedKAOs: IKeyAccessObject[];
    /** Selection reason/strategy */
    selectionStrategy: 'coi-match' | 'country-match' | 'fallback';
    /** Whether all KAOs were considered */
    fullEvaluation: boolean;
}

export interface IDecryptionRequest {
    /** ZTDF object containing payload and KAOs */
    ztdf: IZTDFObject;
    /** User's JWT bearer token */
    bearerToken: string;
    /** User attributes for KAO selection */
    userAttributes: {
        uniqueID: string;
        clearance: string;
        countryOfAffiliation: string;
        acpCOI: string[];
        organizationType?: string;
    };
    /** Request ID for correlation */
    requestId: string;
}

export interface IDecryptionResult {
    /** Success indicator */
    success: boolean;
    /** Decrypted content (Base64) */
    decryptedContent?: string;
    /** KAO that was used */
    usedKaoId?: string;
    /** KAS that provided the key */
    usedKasId?: string;
    /** Error message if failed */
    error?: string;
    /** Fallback details */
    fallbackDetails?: {
        attemptedKAOs: string[];
        failedKAOs: Array<{ kaoId: string; error: string }>;
        successKaoIndex: number;
    };
    /** Execution metrics */
    metrics?: {
        totalAttempts: number;
        successfulAttempt: number;
        totalLatencyMs: number;
        perKaoLatency: Array<{ kaoId: string; latencyMs: number; success: boolean }>;
    };
}

// ============================================
// Circuit Breaker State
// ============================================

interface ICircuitBreakerState {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failures: number;
    lastFailure: Date | null;
    lastSuccess: Date | null;
}

const kasCircuitBreakers = new Map<string, ICircuitBreakerState>();

const CIRCUIT_BREAKER_CONFIG = {
    failureThreshold: 3,
    recoveryTimeoutMs: 60000,
    halfOpenMaxAttempts: 2,
};

function getCircuitState(kasId: string): ICircuitBreakerState {
    if (!kasCircuitBreakers.has(kasId)) {
        kasCircuitBreakers.set(kasId, {
            state: 'CLOSED',
            failures: 0,
            lastFailure: null,
            lastSuccess: null,
        });
    }
    return kasCircuitBreakers.get(kasId)!;
}

function recordKASSuccess(kasId: string): void {
    const state = getCircuitState(kasId);
    state.state = 'CLOSED';
    state.failures = 0;
    state.lastSuccess = new Date();
}

function recordKASFailure(kasId: string): void {
    const state = getCircuitState(kasId);
    state.failures++;
    state.lastFailure = new Date();
    
    if (state.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
        state.state = 'OPEN';
        logger.warn('Circuit breaker opened for KAS', { kasId, failures: state.failures });
    }
}

function isKASAvailable(kasId: string): boolean {
    const state = getCircuitState(kasId);
    
    if (state.state === 'CLOSED') {
        return true;
    }
    
    if (state.state === 'OPEN' && state.lastFailure) {
        const timeSinceFailure = Date.now() - state.lastFailure.getTime();
        if (timeSinceFailure >= CIRCUIT_BREAKER_CONFIG.recoveryTimeoutMs) {
            state.state = 'HALF_OPEN';
            logger.info('Circuit breaker half-open for KAS', { kasId });
            return true;
        }
        return false;
    }
    
    // HALF_OPEN - allow limited attempts
    return state.state === 'HALF_OPEN';
}

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
// ZTDF Multi-KAS Service
// ============================================

export class ZTDFMultiKASService {
    private kasClients: Map<string, AxiosInstance> = new Map();
    private readonly localKasUrl: string;
    
    constructor() {
        this.localKasUrl = process.env.KAS_URL || 'https://kas:8080';
    }
    
    /**
     * Select KAOs for decryption based on user attributes
     * Returns KAOs in priority order (best match first)
     */
    selectKAOsForUser(
        kaos: IKeyAccessObject[],
        userAttributes: {
            clearance: string;
            countryOfAffiliation: string;
            acpCOI: string[];
        }
    ): IKAOSelectionResult {
        const userLevel = getClassificationLevel(userAttributes.clearance);
        
        // Filter KAOs that user can potentially access
        const accessibleKAOs = kaos.filter(kao => {
            const requiredLevel = getClassificationLevel(kao.policyBinding.clearanceRequired);
            return userLevel >= requiredLevel;
        });
        
        if (accessibleKAOs.length === 0) {
            return {
                selectedKAOs: [],
                selectionStrategy: 'fallback',
                fullEvaluation: true,
            };
        }
        
        // Score each KAO based on match quality
        const scoredKAOs = accessibleKAOs.map(kao => {
            let score = 0;
            
            // Country match (highest priority)
            if (kao.policyBinding.countriesAllowed.includes(userAttributes.countryOfAffiliation)) {
                score += 100;
            }
            
            // COI match
            const coiRequired = kao.policyBinding.coiRequired || [];
            if (coiRequired.length > 0) {
                const coiMatches = coiRequired.filter(coi => 
                    userAttributes.acpCOI.includes(coi)
                ).length;
                score += coiMatches * 50;
            } else {
                // No COI required is a plus
                score += 25;
            }
            
            // Prefer local KAS (lower latency)
            if (this.isLocalKAS(kao.kasUrl)) {
                score += 10;
            }
            
            // Check circuit breaker (penalize unavailable KAS)
            const kasId = kao.kasId || this.extractKasId(kao.kasUrl);
            if (!isKASAvailable(kasId)) {
                score -= 200;
            }
            
            return { kao, score };
        });
        
        // Sort by score (highest first)
        scoredKAOs.sort((a, b) => b.score - a.score);
        
        const selectedKAOs = scoredKAOs.map(s => s.kao);
        
        // Determine selection strategy
        let selectionStrategy: 'coi-match' | 'country-match' | 'fallback' = 'fallback';
        if (scoredKAOs[0]?.score >= 100) {
            selectionStrategy = scoredKAOs[0].score >= 150 ? 'coi-match' : 'country-match';
        }
        
        logger.debug('KAO selection completed', {
            totalKAOs: kaos.length,
            accessibleKAOs: accessibleKAOs.length,
            selectedCount: selectedKAOs.length,
            selectionStrategy,
            topScores: scoredKAOs.slice(0, 3).map(s => ({
                kaoId: s.kao.kaoId,
                score: s.score,
            })),
        });
        
        return {
            selectedKAOs,
            selectionStrategy,
            fullEvaluation: true,
        };
    }
    
    /**
     * Decrypt ZTDF content using multi-KAO fallback chain
     */
    async decryptWithFallback(request: IDecryptionRequest): Promise<IDecryptionResult> {
        const startTime = Date.now();
        const kaos = request.ztdf.payload?.keyAccessObjects || [];
        
        if (kaos.length === 0) {
            return {
                success: false,
                error: 'No Key Access Objects found in ZTDF',
                metrics: {
                    totalAttempts: 0,
                    successfulAttempt: -1,
                    totalLatencyMs: Date.now() - startTime,
                    perKaoLatency: [],
                },
            };
        }
        
        // Select and order KAOs for this user
        const selection = this.selectKAOsForUser(kaos, request.userAttributes);
        
        if (selection.selectedKAOs.length === 0) {
            return {
                success: false,
                error: 'No accessible KAOs for user clearance level',
                metrics: {
                    totalAttempts: 0,
                    successfulAttempt: -1,
                    totalLatencyMs: Date.now() - startTime,
                    perKaoLatency: [],
                },
            };
        }
        
        logger.info('Starting multi-KAO decryption', {
            requestId: request.requestId,
            totalKAOs: kaos.length,
            selectedKAOs: selection.selectedKAOs.length,
            strategy: selection.selectionStrategy,
            userCountry: request.userAttributes.countryOfAffiliation,
        });
        
        const attemptedKAOs: string[] = [];
        const failedKAOs: Array<{ kaoId: string; error: string }> = [];
        const perKaoLatency: Array<{ kaoId: string; latencyMs: number; success: boolean }> = [];
        
        // Try each KAO in order
        for (let i = 0; i < selection.selectedKAOs.length; i++) {
            const kao = selection.selectedKAOs[i];
            const kaoStartTime = Date.now();
            attemptedKAOs.push(kao.kaoId);
            
            const kasId = kao.kasId || this.extractKasId(kao.kasUrl);
            
            // Skip if circuit breaker is open
            if (!isKASAvailable(kasId)) {
                logger.warn('Skipping KAO due to circuit breaker', {
                    requestId: request.requestId,
                    kaoId: kao.kaoId,
                    kasId,
                });
                failedKAOs.push({
                    kaoId: kao.kaoId,
                    error: 'Circuit breaker open',
                });
                perKaoLatency.push({
                    kaoId: kao.kaoId,
                    latencyMs: Date.now() - kaoStartTime,
                    success: false,
                });
                continue;
            }
            
            try {
                logger.debug('Attempting KAO', {
                    requestId: request.requestId,
                    kaoId: kao.kaoId,
                    kasUrl: kao.kasUrl,
                    attempt: i + 1,
                });
                
                // Request DEK from KAS
                const dekResult = await this.requestDEKFromKAS(
                    kao,
                    request.bearerToken,
                    request.requestId,
                    request.ztdf.manifest?.objectId || 'unknown'
                );
                
                if (!dekResult.success || !dekResult.dek) {
                    throw new Error(dekResult.error || 'DEK retrieval failed');
                }
                
                // Decrypt content with DEK
                const decryptedContent = this.decryptContent(
                    request.ztdf.payload,
                    dekResult.dek
                );
                
                // Record success
                recordKASSuccess(kasId);
                perKaoLatency.push({
                    kaoId: kao.kaoId,
                    latencyMs: Date.now() - kaoStartTime,
                    success: true,
                });
                
                logger.info('Multi-KAO decryption successful', {
                    requestId: request.requestId,
                    usedKaoId: kao.kaoId,
                    usedKasId: kasId,
                    attemptNumber: i + 1,
                    totalAttempts: attemptedKAOs.length,
                    totalLatencyMs: Date.now() - startTime,
                });
                
                return {
                    success: true,
                    decryptedContent,
                    usedKaoId: kao.kaoId,
                    usedKasId: kasId,
                    fallbackDetails: {
                        attemptedKAOs,
                        failedKAOs,
                        successKaoIndex: i,
                    },
                    metrics: {
                        totalAttempts: attemptedKAOs.length,
                        successfulAttempt: i + 1,
                        totalLatencyMs: Date.now() - startTime,
                        perKaoLatency,
                    },
                };
                
            } catch (error: any) {
                // Record failure
                recordKASFailure(kasId);
                
                const errorMessage = error.message || 'Unknown error';
                failedKAOs.push({ kaoId: kao.kaoId, error: errorMessage });
                perKaoLatency.push({
                    kaoId: kao.kaoId,
                    latencyMs: Date.now() - kaoStartTime,
                    success: false,
                });
                
                logger.warn('KAO attempt failed, trying next', {
                    requestId: request.requestId,
                    kaoId: kao.kaoId,
                    kasId,
                    error: errorMessage,
                    attempt: i + 1,
                    remainingKAOs: selection.selectedKAOs.length - i - 1,
                });
            }
        }
        
        // All KAOs failed
        logger.error('All KAOs exhausted, decryption failed', {
            requestId: request.requestId,
            attemptedKAOs,
            failedKAOs,
            totalLatencyMs: Date.now() - startTime,
        });
        
        return {
            success: false,
            error: 'All Key Access Objects failed',
            fallbackDetails: {
                attemptedKAOs,
                failedKAOs,
                successKaoIndex: -1,
            },
            metrics: {
                totalAttempts: attemptedKAOs.length,
                successfulAttempt: -1,
                totalLatencyMs: Date.now() - startTime,
                perKaoLatency,
            },
        };
    }
    
    /**
     * Request DEK from a specific KAS
     */
    private async requestDEKFromKAS(
        kao: IKeyAccessObject,
        bearerToken: string,
        requestId: string,
        resourceId: string
    ): Promise<{ success: boolean; dek?: string; error?: string }> {
        const client = this.getKASClient(kao.kasUrl);
        
        try {
            const response = await client.post('/request-key', {
                resourceId,
                kaoId: kao.kaoId,
                wrappedKey: kao.wrappedKey,
                bearerToken,
                requestId,
                requestTimestamp: new Date().toISOString(),
            }, {
                timeout: 10000,
            });
            
            if (response.data.success) {
                return {
                    success: true,
                    dek: response.data.dek,
                };
            }
            
            return {
                success: false,
                error: response.data.denialReason || response.data.error || 'KAS denied request',
            };
            
        } catch (error: any) {
            const errorMessage = error.response?.data?.denialReason ||
                error.response?.data?.error ||
                error.message ||
                'KAS request failed';
                
            return {
                success: false,
                error: errorMessage,
            };
        }
    }
    
    /**
     * Decrypt encrypted content using DEK
     */
    private decryptContent(
        payload: {
            encryptedChunks?: Array<{ encryptedData: string }>;
            iv: string;
            authTag: string;
            encryptionAlgorithm?: string;
        },
        dekBase64: string
    ): string {
        // Get encrypted data
        const encryptedData = payload.encryptedChunks?.[0]?.encryptedData;
        if (!encryptedData) {
            throw new Error('No encrypted data in payload');
        }
        
        // Decode Base64
        const dek = Buffer.from(dekBase64, 'base64');
        const iv = Buffer.from(payload.iv, 'base64');
        const authTag = Buffer.from(payload.authTag, 'base64');
        const ciphertext = Buffer.from(encryptedData, 'base64');
        
        // Decrypt using AES-256-GCM
        const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
        decipher.setAuthTag(authTag);
        
        const decrypted = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
        ]);
        
        return decrypted.toString('base64');
    }
    
    /**
     * Get or create HTTP client for KAS
     */
    private getKASClient(kasUrl: string): AxiosInstance {
        const baseUrl = kasUrl.replace('/request-key', '');
        
        if (this.kasClients.has(baseUrl)) {
            return this.kasClients.get(baseUrl)!;
        }
        
        const config: any = {
            baseURL: baseUrl,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'DIVE-V3-MultiKAS/1.0',
            },
        };
        
        // Configure TLS (skip verification in development)
        if (baseUrl.startsWith('https://')) {
            config.httpsAgent = new https.Agent({
                rejectUnauthorized: process.env.NODE_ENV === 'production',
            });
        }
        
        const client = axios.create(config);
        this.kasClients.set(baseUrl, client);
        
        return client;
    }
    
    /**
     * Check if KAS URL is local
     */
    private isLocalKAS(kasUrl: string): boolean {
        try {
            const urlHost = new URL(kasUrl).hostname;
            const localHost = new URL(this.localKasUrl).hostname;
            return urlHost === localHost || 
                   urlHost === 'localhost' || 
                   urlHost === 'kas';
        } catch {
            return false;
        }
    }
    
    /**
     * Extract KAS ID from URL
     */
    private extractKasId(kasUrl: string): string {
        try {
            const url = new URL(kasUrl);
            // Extract from hostname (e.g., usa-kas.dive25.com -> kas-usa)
            const host = url.hostname.split('.')[0];
            if (host.includes('-kas')) {
                const country = host.replace('-kas', '');
                return `kas-${country}`;
            }
            return `kas-${host}`;
        } catch {
            return 'kas-unknown';
        }
    }
    
    /**
     * Get circuit breaker status for all known KAS instances
     */
    getCircuitBreakerStatus(): Array<{
        kasId: string;
        state: string;
        failures: number;
        lastFailure: string | null;
        lastSuccess: string | null;
    }> {
        const status: Array<{
            kasId: string;
            state: string;
            failures: number;
            lastFailure: string | null;
            lastSuccess: string | null;
        }> = [];
        
        kasCircuitBreakers.forEach((state, kasId) => {
            status.push({
                kasId,
                state: state.state,
                failures: state.failures,
                lastFailure: state.lastFailure?.toISOString() || null,
                lastSuccess: state.lastSuccess?.toISOString() || null,
            });
        });
        
        return status;
    }
    
    /**
     * Reset circuit breaker for a KAS (manual recovery)
     */
    resetCircuitBreaker(kasId: string): void {
        const state = getCircuitState(kasId);
        state.state = 'CLOSED';
        state.failures = 0;
        logger.info('Circuit breaker manually reset', { kasId });
    }
}

// Export singleton instance
export const ztdfMultiKASService = new ZTDFMultiKASService();



