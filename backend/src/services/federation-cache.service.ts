/**
 * Federation Cache Service
 * Phase 3: Distributed caching for federated resource queries
 * 
 * Provides Redis-based caching for federated search results with:
 * - TTL-based cache expiration (configurable)
 * - User-aware cache keys (respects ABAC)
 * - Cache invalidation on resource updates
 * - Circuit breaker for Redis unavailability
 * 
 * NATO Compliance: ACP-240 §5.4 (Federated Resource Access)
 */

import Redis from 'ioredis';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { IFederatedSearchOptions, IFederatedSearchResponse, IUserAttributes } from './federated-resource.service';

// ============================================
// Configuration
// ============================================

const REDIS_URL = process.env.FEDERATION_CACHE_REDIS_URL || 
                  process.env.REDIS_URL || 
                  'redis://localhost:6379';

const CACHE_TTL_SECONDS = parseInt(process.env.FEDERATION_CACHE_TTL || '60'); // 1 minute default
const CACHE_PREFIX = 'dive:federation:query:';
const CACHE_ENABLED = process.env.FEDERATION_CACHE_ENABLED !== 'false';

// ============================================
// Federation Cache Service
// ============================================

class FederationCacheService {
    private redis: Redis | null = null;
    private connected = false;
    private circuitOpen = false;
    private lastError: Date | null = null;
    private errorCount = 0;

    constructor() {
        if (CACHE_ENABLED) {
            this.initializeRedis();
        } else {
            logger.info('Federation cache disabled by configuration');
        }
    }

    /**
     * Initialize Redis connection
     */
    private initializeRedis(): void {
        try {
            this.redis = new Redis(REDIS_URL, {
                maxRetriesPerRequest: 3,
                retryStrategy: (times) => {
                    if (times > 3) {
                        logger.warn('Redis connection failed, cache disabled temporarily');
                        this.circuitOpen = true;
                        return null; // Stop retrying
                    }
                    return Math.min(times * 100, 3000);
                },
                enableReadyCheck: true,
                lazyConnect: true
            });

            this.redis.on('connect', () => {
                logger.info('Federation cache Redis connected');
                this.connected = true;
                this.circuitOpen = false;
                this.errorCount = 0;
            });

            this.redis.on('error', (error) => {
                this.errorCount++;
                this.lastError = new Date();
                
                if (this.errorCount >= 3) {
                    this.circuitOpen = true;
                }
                
                logger.warn('Federation cache Redis error', {
                    error: error.message,
                    errorCount: this.errorCount,
                    circuitOpen: this.circuitOpen
                });
            });

            this.redis.on('close', () => {
                logger.warn('Federation cache Redis connection closed');
                this.connected = false;
            });

            // Connect asynchronously
            this.redis.connect().catch(err => {
                logger.warn('Failed to connect to Redis for federation cache', {
                    error: err.message
                });
            });

        } catch (error) {
            logger.warn('Failed to initialize Redis for federation cache', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Generate cache key from search options and user attributes
     * Key includes user clearance and country to ensure ABAC compliance
     */
    private generateCacheKey(options: IFederatedSearchOptions, user: IUserAttributes): string {
        const keyData = {
            query: options.query || '',
            classification: options.classification?.sort() || [],
            releasableTo: options.releasableTo?.sort() || [],
            coi: options.coi?.sort() || [],
            instances: options.instances?.sort() || [],
            limit: options.limit,
            offset: options.offset,
            // User attributes for ABAC compliance
            userClearance: user.clearance,
            userCountry: user.countryOfAffiliation,
            userCOI: user.acpCOI?.sort() || []
        };

        const hash = crypto
            .createHash('sha256')
            .update(JSON.stringify(keyData))
            .digest('hex')
            .substring(0, 16);

        return `${CACHE_PREFIX}${hash}`;
    }

    /**
     * Get cached search results
     */
    async get(
        options: IFederatedSearchOptions,
        user: IUserAttributes
    ): Promise<IFederatedSearchResponse | null> {
        if (!this.isAvailable()) {
            return null;
        }

        try {
            const key = this.generateCacheKey(options, user);
            const cached = await this.redis!.get(key);

            if (cached) {
                logger.debug('Federation cache HIT', { key: key.substring(0, 30) });
                const response = JSON.parse(cached) as IFederatedSearchResponse;
                response.cacheHit = true;
                return response;
            }

            logger.debug('Federation cache MISS', { key: key.substring(0, 30) });
            return null;

        } catch (error) {
            this.handleError(error);
            return null;
        }
    }

    /**
     * Cache search results
     */
    async set(
        options: IFederatedSearchOptions,
        user: IUserAttributes,
        response: IFederatedSearchResponse
    ): Promise<void> {
        if (!this.isAvailable()) {
            return;
        }

        try {
            const key = this.generateCacheKey(options, user);
            
            // Don't cache if there was an error in any instance
            const hasErrors = Object.values(response.instanceResults).some(r => r.error);
            if (hasErrors) {
                logger.debug('Skipping cache due to instance errors');
                return;
            }

            // Clone response and mark as cached
            const cacheData = { ...response, cacheHit: true };
            
            await this.redis!.setex(key, CACHE_TTL_SECONDS, JSON.stringify(cacheData));
            
            logger.debug('Federation cache SET', {
                key: key.substring(0, 30),
                ttl: CACHE_TTL_SECONDS,
                resultCount: response.totalResults
            });

        } catch (error) {
            this.handleError(error);
        }
    }

    /**
     * Invalidate cache for specific instance(s)
     * Called when resources are updated in an instance
     */
    async invalidateInstance(instanceCode: string): Promise<number> {
        if (!this.isAvailable()) {
            return 0;
        }

        try {
            // Can't easily invalidate by instance with hash keys
            // Instead, we rely on TTL for cache expiration
            // For critical updates, clear all federation cache
            const keys = await this.redis!.keys(`${CACHE_PREFIX}*`);
            
            if (keys.length > 0) {
                await this.redis!.del(...keys);
                logger.info('Federation cache invalidated', {
                    trigger: instanceCode,
                    keysCleared: keys.length
                });
            }

            return keys.length;

        } catch (error) {
            this.handleError(error);
            return 0;
        }
    }

    /**
     * Clear all federation cache
     */
    async clear(): Promise<number> {
        if (!this.isAvailable()) {
            return 0;
        }

        try {
            const keys = await this.redis!.keys(`${CACHE_PREFIX}*`);
            
            if (keys.length > 0) {
                await this.redis!.del(...keys);
            }

            logger.info('Federation cache cleared', { keysCleared: keys.length });
            return keys.length;

        } catch (error) {
            this.handleError(error);
            return 0;
        }
    }

    /**
     * Get cache statistics
     */
    async getStats(): Promise<{
        enabled: boolean;
        connected: boolean;
        circuitOpen: boolean;
        keyCount: number;
        ttlSeconds: number;
    }> {
        let keyCount = 0;

        if (this.isAvailable()) {
            try {
                const keys = await this.redis!.keys(`${CACHE_PREFIX}*`);
                keyCount = keys.length;
            } catch {
                // Ignore errors for stats
            }
        }

        return {
            enabled: CACHE_ENABLED,
            connected: this.connected,
            circuitOpen: this.circuitOpen,
            keyCount,
            ttlSeconds: CACHE_TTL_SECONDS
        };
    }

    /**
     * Check if cache is available
     */
    private isAvailable(): boolean {
        if (!CACHE_ENABLED) return false;
        if (!this.redis) return false;
        if (this.circuitOpen) {
            // Check if we should retry (after 30 seconds)
            if (this.lastError && Date.now() - this.lastError.getTime() > 30000) {
                this.circuitOpen = false;
                this.errorCount = 0;
            } else {
                return false;
            }
        }
        return this.connected;
    }

    /**
     * Handle errors and update circuit breaker
     */
    private handleError(error: unknown): void {
        this.errorCount++;
        this.lastError = new Date();
        
        if (this.errorCount >= 3) {
            this.circuitOpen = true;
            logger.warn('Federation cache circuit opened due to errors', {
                errorCount: this.errorCount
            });
        }

        logger.warn('Federation cache error', {
            error: error instanceof Error ? error.message : 'Unknown error',
            errorCount: this.errorCount
        });
    }

    /**
     * Close Redis connection
     */
    async shutdown(): Promise<void> {
        if (this.redis) {
            await this.redis.quit();
            this.redis = null;
            this.connected = false;
            logger.info('Federation cache Redis connection closed');
        }
    }
}

// Singleton instance
export const federationCacheService = new FederationCacheService();
export default federationCacheService;













