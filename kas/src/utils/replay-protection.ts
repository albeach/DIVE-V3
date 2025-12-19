/**
 * Replay Protection with Nonce Validation
 * 
 * Prevents replay attacks by validating request nonces.
 * 
 * Features:
 * - Nonce validation (UUID v4)
 * - Timestamp validation (±5 minute window)
 * - Nonce cache with TTL
 * - Prevents duplicate nonce reuse
 */

import { kasLogger } from './kas-logger';
import NodeCache from 'node-cache';

export interface IReplayProtectionConfig {
    /** Nonce cache TTL in seconds */
    nonceCacheTTL: number;
    /** Timestamp tolerance in seconds (±window) */
    timestampTolerance: number;
    /** Enable replay protection */
    enabled: boolean;
}

const DEFAULT_CONFIG: IReplayProtectionConfig = {
    nonceCacheTTL: parseInt(process.env.KAS_REPLAY_PROTECTION_NONCE_TTL_SECONDS || '300', 10),
    timestampTolerance: parseInt(process.env.KAS_REPLAY_PROTECTION_TIMESTAMP_TOLERANCE_SECONDS || '300', 10),
    enabled: process.env.KAS_REPLAY_PROTECTION_ENABLED !== 'false',
};

/**
 * UUID v4 validation regex
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Replay Protection Service
 */
export class ReplayProtection {
    private nonceCache: NodeCache;
    private readonly config: IReplayProtectionConfig;

    constructor(config?: Partial<IReplayProtectionConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        
        // Cache with TTL matching nonce cache TTL
        this.nonceCache = new NodeCache({
            stdTTL: this.config.nonceCacheTTL,
            checkperiod: 60,
        });
    }

    /**
     * Validate nonce and timestamp
     * 
     * @param nonce - Request nonce (UUID v4)
     * @param timestamp - Request timestamp (ISO 8601)
     * @param requestId - Request ID for logging
     * @returns Validation result
     */
    validate(nonce: string | undefined, timestamp: string | undefined, requestId?: string): {
        valid: boolean;
        reason?: string;
    } {
        if (!this.config.enabled) {
            return { valid: true };
        }

        // Check if nonce is provided
        if (nonce) {
            // Validate nonce format (UUID v4)
            if (!UUID_V4_REGEX.test(nonce)) {
                kasLogger.warn('Invalid nonce format', {
                    requestId,
                    nonce,
                    expectedFormat: 'UUID v4',
                });
                return {
                    valid: false,
                    reason: 'Invalid nonce format: must be UUID v4',
                };
            }

            // Check if nonce was already used (replay attack)
            if (this.nonceCache.has(nonce)) {
                kasLogger.warn('Nonce reuse detected (replay attack)', {
                    requestId,
                    nonce,
                });
                return {
                    valid: false,
                    reason: 'Nonce already used: possible replay attack',
                };
            }

            // Store nonce in cache
            this.nonceCache.set(nonce, true);
        }

        // Validate timestamp if provided
        if (timestamp) {
            try {
                const requestTime = new Date(timestamp).getTime();
                const now = Date.now();
                const tolerance = this.config.timestampTolerance * 1000; // Convert to ms

                // Check if timestamp is within tolerance window
                if (Math.abs(now - requestTime) > tolerance) {
                    kasLogger.warn('Timestamp out of tolerance window', {
                        requestId,
                        timestamp,
                        now: new Date(now).toISOString(),
                        toleranceSeconds: this.config.timestampTolerance,
                        differenceSeconds: Math.abs(now - requestTime) / 1000,
                    });
                    return {
                        valid: false,
                        reason: `Timestamp out of tolerance: ±${this.config.timestampTolerance} seconds`,
                    };
                }
            } catch (error) {
                kasLogger.warn('Invalid timestamp format', {
                    requestId,
                    timestamp,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
                return {
                    valid: false,
                    reason: 'Invalid timestamp format: must be ISO 8601',
                };
            }
        }

        return { valid: true };
    }

    /**
     * Generate a new nonce (UUID v4)
     */
    generateNonce(): string {
        // Simple UUID v4 generator (for testing, use crypto.randomUUID() in Node 14.17+)
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID();
        }
        
        // Fallback for older Node versions
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Clear nonce cache (for testing/admin)
     */
    clearCache(): void {
        this.nonceCache.flushAll();
        kasLogger.info('Replay protection cache cleared');
    }

    /**
     * Get cache statistics
     */
    getStats(): {
        nonceCount: number;
        config: IReplayProtectionConfig;
    } {
        return {
            nonceCount: this.nonceCache.keys().length,
            config: this.config,
        };
    }
}

/**
 * Global replay protection instance
 */
export const replayProtection = new ReplayProtection();
