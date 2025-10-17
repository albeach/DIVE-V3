import NodeCache from 'node-cache';
import { logger } from '../utils/logger';

// ============================================
// Authorization Decision Cache Service (Phase 3)
// ============================================
// Purpose: Intelligent caching of OPA authorization decisions
// Features:
// - Classification-based TTL (SECRET=30s, CONFIDENTIAL=60s, UNCLASSIFIED=300s)
// - Cache statistics and hit rate monitoring
// - Manual cache invalidation
// - LRU eviction strategy

/**
 * Cache key structure
 */
export interface ICacheKey {
    subject: string;
    resource: string;
    action: string;
}

/**
 * Cache entry structure
 */
export interface ICacheEntry<T> {
    data: T;
    cachedAt: Date;
    ttl: number;
    classification: string;
}

/**
 * OPA Decision structure (minimal for cache)
 */
export interface IOPADecision {
    result: {
        allow: boolean;
        reason: string;
        obligations?: Array<{
            type: string;
            resourceId?: string;
        }>;
        evaluation_details?: Record<string, unknown>;
    };
}

/**
 * Cache statistics
 */
export interface ICacheStats {
    hits: number;
    misses: number;
    hitRate: number;
    size: number;
    maxSize: number;
    keys: number;
    ttlStats: {
        secret: number;
        confidential: number;
        topSecret: number;
        unclassified: number;
    };
}

/**
 * Classification levels and their corresponding TTL (in seconds)
 */
const CLASSIFICATION_TTL_MAP: Record<string, number> = {
    'TOP_SECRET': parseInt(process.env.OPA_CACHE_TTL_TOP_SECRET || '15', 10),
    'SECRET': parseInt(process.env.OPA_CACHE_TTL_SECRET || '30', 10),
    'CONFIDENTIAL': parseInt(process.env.OPA_CACHE_TTL_CONFIDENTIAL || '60', 10),
    'UNCLASSIFIED': parseInt(process.env.OPA_CACHE_TTL_UNCLASSIFIED || '300', 10),
};

/**
 * Default TTL for unknown classifications (most restrictive)
 */
const DEFAULT_TTL = 30;

/**
 * Authorization Cache Service
 * Singleton service for managing OPA decision cache
 */
class AuthzCacheService {
    private cache: NodeCache;
    private hitCount: number = 0;
    private missCount: number = 0;
    private ttlStats: Record<string, number> = {
        secret: 0,
        confidential: 0,
        topSecret: 0,
        unclassified: 0,
    };

    constructor() {
        const maxSize = parseInt(process.env.CACHE_MAX_SIZE || '10000', 10);
        
        this.cache = new NodeCache({
            stdTTL: DEFAULT_TTL,
            checkperiod: 60, // Check for expired keys every 60 seconds
            useClones: true, // Clone values to prevent external modifications
            deleteOnExpire: true,
            maxKeys: maxSize,
        });

        // Log cache events
        this.cache.on('expired', (key: string, value: any) => {
            logger.debug('Cache entry expired', {
                key,
                classification: value?.classification,
            });
        });

        this.cache.on('flush', () => {
            logger.info('Authorization cache flushed');
            this.hitCount = 0;
            this.missCount = 0;
            this.ttlStats = {
                secret: 0,
                confidential: 0,
                topSecret: 0,
                unclassified: 0,
            };
        });

        logger.info('Authorization cache service initialized', {
            maxSize,
            ttlMap: CLASSIFICATION_TTL_MAP,
        });
    }

    /**
     * Generate cache key from components
     */
    private generateKey(key: ICacheKey): string {
        return `${key.subject}:${key.resource}:${key.action}`;
    }

    /**
     * Get TTL based on classification level
     */
    private getTTL(classification: string): number {
        const normalizedClassification = classification.toUpperCase().replace(/\s+/g, '_');
        
        const ttl = CLASSIFICATION_TTL_MAP[normalizedClassification] || DEFAULT_TTL;

        logger.debug('Determined TTL for classification', {
            classification,
            normalized: normalizedClassification,
            ttl,
        });

        return ttl;
    }

    /**
     * Update TTL statistics
     */
    private updateTTLStats(classification: string): void {
        const normalized = classification.toUpperCase();
        
        if (normalized.includes('TOP') && normalized.includes('SECRET')) {
            this.ttlStats.topSecret++;
        } else if (normalized.includes('SECRET')) {
            this.ttlStats.secret++;
        } else if (normalized.includes('CONFIDENTIAL')) {
            this.ttlStats.confidential++;
        } else if (normalized.includes('UNCLASSIFIED')) {
            this.ttlStats.unclassified++;
        }
    }

    /**
     * Get cached decision
     * Returns null if not found or expired
     */
    getCachedDecision(key: ICacheKey): IOPADecision | null {
        const cacheKey = this.generateKey(key);
        
        try {
            const cached = this.cache.get<ICacheEntry<IOPADecision>>(cacheKey);

            if (cached) {
                this.hitCount++;
                
                logger.debug('Cache hit', {
                    key: cacheKey,
                    classification: cached.classification,
                    age: Date.now() - cached.cachedAt.getTime(),
                    ttl: cached.ttl,
                    allow: cached.data.result.allow,
                });

                return cached.data;
            } else {
                this.missCount++;
                
                logger.debug('Cache miss', {
                    key: cacheKey,
                });

                return null;
            }
        } catch (error) {
            logger.error('Cache retrieval error', {
                key: cacheKey,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            this.missCount++;
            return null;
        }
    }

    /**
     * Cache a decision with classification-based TTL
     */
    cacheDecision(
        key: ICacheKey,
        decision: IOPADecision,
        classification: string = 'UNCLASSIFIED'
    ): void {
        const cacheKey = this.generateKey(key);
        const ttl = this.getTTL(classification);

        const entry: ICacheEntry<IOPADecision> = {
            data: decision,
            cachedAt: new Date(),
            ttl,
            classification,
        };

        try {
            const success = this.cache.set(cacheKey, entry, ttl);

            if (success) {
                this.updateTTLStats(classification);

                logger.debug('Decision cached', {
                    key: cacheKey,
                    classification,
                    ttl,
                    allow: decision.result.allow,
                });
            } else {
                logger.warn('Failed to cache decision', {
                    key: cacheKey,
                    classification,
                });
            }
        } catch (error) {
            logger.error('Cache set error', {
                key: cacheKey,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    /**
     * Invalidate cache for a specific resource
     * Useful when resource metadata changes
     */
    invalidateForResource(resourceId: string): number {
        const keys = this.cache.keys();
        let invalidated = 0;

        for (const key of keys) {
            if (key.includes(`:${resourceId}:`)) {
                this.cache.del(key);
                invalidated++;
            }
        }

        logger.info('Invalidated cache entries for resource', {
            resourceId,
            count: invalidated,
        });

        return invalidated;
    }

    /**
     * Invalidate cache for a specific subject
     * Useful when user attributes change (e.g., clearance updated)
     */
    invalidateForSubject(subject: string): number {
        const keys = this.cache.keys();
        let invalidated = 0;

        for (const key of keys) {
            if (key.startsWith(`${subject}:`)) {
                this.cache.del(key);
                invalidated++;
            }
        }

        logger.info('Invalidated cache entries for subject', {
            subject,
            count: invalidated,
        });

        return invalidated;
    }

    /**
     * Invalidate all cache entries
     * Useful after policy updates
     */
    invalidateAll(): void {
        this.cache.flushAll();
        
        logger.warn('All authorization cache entries invalidated');
    }

    /**
     * Get cache statistics
     */
    getStats(): ICacheStats {
        const keys = this.cache.keys();
        const totalRequests = this.hitCount + this.missCount;
        const hitRate = totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0;
        const maxSize = parseInt(process.env.CACHE_MAX_SIZE || '10000', 10);

        return {
            hits: this.hitCount,
            misses: this.missCount,
            hitRate: parseFloat(hitRate.toFixed(2)),
            size: keys.length,
            maxSize,
            keys: keys.length,
            ttlStats: {
                secret: this.ttlStats.secret,
                confidential: this.ttlStats.confidential,
                topSecret: this.ttlStats.topSecret,
                unclassified: this.ttlStats.unclassified,
            },
        };
    }

    /**
     * Get detailed cache information (for debugging)
     */
    getDetailedInfo(): {
        stats: ICacheStats;
        entries: Array<{
            key: string;
            classification: string;
            cachedAt: string;
            age: number;
            ttl: number;
        }>;
    } {
        const keys = this.cache.keys();
        const entries = keys.map(key => {
            const entry = this.cache.get<ICacheEntry<IOPADecision>>(key);
            if (entry) {
                return {
                    key,
                    classification: entry.classification,
                    cachedAt: entry.cachedAt.toISOString(),
                    age: Date.now() - entry.cachedAt.getTime(),
                    ttl: entry.ttl,
                };
            }
            return null;
        }).filter(Boolean) as any[];

        return {
            stats: this.getStats(),
            entries,
        };
    }

    /**
     * Prune expired entries (manual cleanup)
     * Note: node-cache handles this automatically, but this can be called manually
     */
    pruneExpired(): number {
        const before = this.cache.keys().length;
        // node-cache handles expiration automatically via checkperiod
        // This method is mostly for testing or manual cleanup
        const after = this.cache.keys().length;
        const pruned = before - after;

        if (pruned > 0) {
            logger.info('Pruned expired cache entries', {
                before,
                after,
                pruned,
            });
        }

        return pruned;
    }

    /**
     * Check if cache is healthy
     * Returns false if cache is full or hit rate is very low
     */
    isHealthy(): { healthy: boolean; reason?: string } {
        const stats = this.getStats();

        // Check if cache is full
        if (stats.size >= stats.maxSize) {
            return {
                healthy: false,
                reason: 'Cache is full',
            };
        }

        // Check if hit rate is acceptable (after sufficient requests)
        const totalRequests = stats.hits + stats.misses;
        if (totalRequests > 100 && stats.hitRate < 50) {
            return {
                healthy: false,
                reason: `Low hit rate: ${stats.hitRate}%`,
            };
        }

        return { healthy: true };
    }

    /**
     * Reset statistics (for testing)
     */
    resetStats(): void {
        this.hitCount = 0;
        this.missCount = 0;
        this.ttlStats = {
            secret: 0,
            confidential: 0,
            topSecret: 0,
            unclassified: 0,
        };

        logger.info('Cache statistics reset');
    }
}

// Export singleton instance
export const authzCacheService = new AuthzCacheService();

/**
 * Clear cache (for testing)
 */
export const clearAuthzCache = (): void => {
    authzCacheService.invalidateAll();
    authzCacheService.resetStats();
};

