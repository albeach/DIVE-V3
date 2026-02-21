/**
 * ACP-240 KAS Phase 4.3: Cache Manager Service (Cost-Optimized)
 *
 * Provides caching with two backends:
 * - Redis (distributed, for multi-instance deployments)
 * - In-Memory (cost-optimized, for single-instance/Cloud Run)
 *
 * Cached Data:
 * - Unwrapped DEKs (TTL: 60s)
 * - Public keys (TTL: 3600s)
 * - Federation metadata (TTL: 300s)
 *
 * Features:
 * - Automatic backend selection via CACHE_BACKEND env var
 * - Connection pooling and retry logic (Redis)
 * - Fail-open pattern (cache miss = proceed without cache)
 * - Key invalidation by pattern
 * - Health check integration
 * - Comprehensive logging
 *
 * Cost Optimization:
 * - Set CACHE_BACKEND=memory for single-instance deployments
 * - Saves $13-50/month in Redis infrastructure costs
 * - Trade-off: Cache not shared across instances/restarts
 */

import Redis from 'ioredis';
import { kasLogger } from '../utils/kas-logger';

export interface ICacheConfig {
    host?: string;
    port?: number;
    password?: string;
    ttl?: {
        dek?: number;
        publicKey?: number;
        metadata?: number;
    };
    enabled?: boolean;
    backend?: 'redis' | 'memory';
}

interface MemoryCacheEntry {
    value: any;
    expires: number;
}

export class CacheManager {
    private redis: Redis | null = null;
    private memoryCache: Map<string, MemoryCacheEntry> | null = null;
    private enabled: boolean;
    private backend: 'redis' | 'memory';
    private ttl: {
        dek: number;
        publicKey: number;
        metadata: number;
    };
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor(config: ICacheConfig = {}) {
        this.enabled = config.enabled !== false && process.env.ENABLE_CACHE === 'true';
        this.backend = (config.backend || process.env.CACHE_BACKEND || 'redis') as 'redis' | 'memory';

        this.ttl = {
            dek: config.ttl?.dek || parseInt(process.env.CACHE_TTL_DEK || '60', 10),
            publicKey: config.ttl?.publicKey || parseInt(process.env.CACHE_TTL_PUBLIC_KEY || '3600', 10),
            metadata: config.ttl?.metadata || 300
        };

        if (!this.enabled) {
            kasLogger.info('Cache disabled');
            return;
        }

        // Initialize memory backend
        if (this.backend === 'memory') {
            kasLogger.info('Using in-memory cache (cost-optimized mode)', {
                note: 'Cache will not persist across restarts or scale across instances'
            });
            this.memoryCache = new Map<string, MemoryCacheEntry>();

            // Cleanup expired entries every 60 seconds
            this.cleanupInterval = setInterval(() => {
                this.cleanupExpiredMemoryEntries();
            }, 60000);

            return;
        }

        // Initialize Redis backend
        try {
            this.redis = new Redis({
                host: config.host || process.env.REDIS_HOST || 'localhost',
                port: config.port || parseInt(process.env.REDIS_PORT || '6379', 10),
                password: config.password || process.env.REDIS_PASSWORD,
                retryStrategy: (times: number) => {
                    const delay = Math.min(times * 50, 2000);
                    kasLogger.debug('Redis retry attempt', { times, delay });
                    return delay;
                },
                maxRetriesPerRequest: 3,
                connectTimeout: 5000,
                enableReadyCheck: true,
                enableOfflineQueue: true,
                lazyConnect: true
            });

            // Event handlers
            this.redis.on('connect', () => {
                kasLogger.info('Redis cache connected', {
                    host: config.host || process.env.REDIS_HOST,
                    port: config.port || parseInt(process.env.REDIS_PORT || '6379', 10)
                });
            });

            this.redis.on('error', (error: Error) => {
                kasLogger.error('Redis cache error', {
                    error: error.message,
                    code: (error as any).code
                });
            });

            this.redis.on('close', () => {
                kasLogger.warn('Redis cache connection closed');
            });

            // Connect immediately
            this.redis.connect().catch((error: Error) => {
                kasLogger.error('Redis cache initial connection failed', {
                    error: error.message
                });
                // Don't throw - fail-open pattern
            });

        } catch (error) {
            kasLogger.error('Failed to initialize Redis cache', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            this.redis = null;
        }
    }

    /**
     * Get cached value
     *
     * @param key - Cache key
     * @returns Cached value or null if miss/error
     */
    async get<T>(key: string): Promise<T | null> {
        if (!this.enabled) {
            return null;
        }

        // Memory backend
        if (this.backend === 'memory' && this.memoryCache) {
            return this.getFromMemory<T>(key);
        }

        // Redis backend
        if (!this.redis) {
            return null;
        }

        try {
            const value = await this.redis.get(key);

            if (value) {
                kasLogger.debug('Cache hit (Redis)', { key, size: value.length });
                return JSON.parse(value) as T;
            }

            kasLogger.debug('Cache miss (Redis)', { key });
            return null;
        } catch (error) {
            kasLogger.error('Cache get error (fail-open)', {
                key,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null; // Fail-open: cache error = cache miss
        }
    }

    /**
     * Set cached value
     *
     * @param key - Cache key
     * @param value - Value to cache
     * @param ttl - Time to live in seconds (optional, uses default)
     */
    async set(key: string, value: any, ttl?: number): Promise<void> {
        if (!this.enabled) {
            return;
        }

        const effectiveTtl = ttl || this.getDefaultTtl(key);

        // Memory backend
        if (this.backend === 'memory' && this.memoryCache) {
            this.setInMemory(key, value, effectiveTtl);
            return;
        }

        // Redis backend
        if (!this.redis) {
            return;
        }

        try {
            const serialized = JSON.stringify(value);

            await this.redis.setex(key, effectiveTtl, serialized);

            kasLogger.debug('Cache set (Redis)', {
                key,
                ttl: effectiveTtl,
                size: serialized.length
            });
        } catch (error) {
            kasLogger.error('Cache set error (fail-open)', {
                key,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            // Fail-open: cache write error = continue without cache
        }
    }

    /**
     * Delete cached value
     *
     * @param key - Cache key
     */
    async delete(key: string): Promise<void> {
        if (!this.enabled) {
            return;
        }

        // Memory backend
        if (this.backend === 'memory' && this.memoryCache) {
            this.memoryCache.delete(key);
            kasLogger.debug('Cache delete (memory)', { key });
            return;
        }

        // Redis backend
        if (!this.redis) {
            return;
        }

        try {
            await this.redis.del(key);
            kasLogger.debug('Cache delete (Redis)', { key });
        } catch (error) {
            kasLogger.error('Cache delete error', {
                key,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Invalidate keys matching pattern
     *
     * @param pattern - Redis key pattern (e.g., "dek:*")
     */
    async invalidate(pattern: string): Promise<void> {
        if (!this.enabled) {
            return;
        }

        // Memory backend
        if (this.backend === 'memory' && this.memoryCache) {
            let count = 0;
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');

            for (const key of this.memoryCache.keys()) {
                if (regex.test(key)) {
                    this.memoryCache.delete(key);
                    count++;
                }
            }

            if (count > 0) {
                kasLogger.info('Cache invalidated (memory)', { pattern, count });
            } else {
                kasLogger.debug('Cache invalidation: no keys matched (memory)', { pattern });
            }
            return;
        }

        // Redis backend
        if (!this.redis) {
            return;
        }

        try {
            const keys = await this.redis.keys(pattern);

            if (keys.length > 0) {
                await this.redis.del(...keys);
                kasLogger.info('Cache invalidated (Redis)', {
                    pattern,
                    count: keys.length
                });
            } else {
                kasLogger.debug('Cache invalidation: no keys matched (Redis)', { pattern });
            }
        } catch (error) {
            kasLogger.error('Cache invalidation error', {
                pattern,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Health check
     *
     * @returns True if cache is healthy
     */
    async healthCheck(): Promise<boolean> {
        if (!this.enabled) {
            return true; // Cache disabled = healthy (fail-open)
        }

        // Memory backend is always healthy
        if (this.backend === 'memory') {
            return true;
        }

        // Redis backend
        if (!this.redis) {
            return true; // No Redis connection = healthy (fail-open)
        }

        try {
            const response = await this.redis.ping();
            return response === 'PONG';
        } catch (error) {
            kasLogger.error('Redis health check failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }

    /**
     * Get cache statistics
     *
     * @returns Cache stats
     */
    async getStats(): Promise<{
        connected: boolean;
        keys: number;
        memory: string;
        uptime: number;
        backend: 'redis' | 'memory';
    } | null> {
        if (!this.enabled) {
            return null;
        }

        // Memory backend stats
        if (this.backend === 'memory' && this.memoryCache) {
            const memoryUsage = process.memoryUsage();
            return {
                connected: true,
                keys: this.memoryCache.size,
                memory: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
                uptime: process.uptime(),
                backend: 'memory'
            };
        }

        // Redis backend stats
        if (!this.redis) {
            return null;
        }

        try {
            const info = await this.redis.info('stats');
            const dbsize = await this.redis.dbsize();
            const uptime = await this.redis.info('server');

            // Parse uptime from info
            const uptimeMatch = uptime.match(/uptime_in_seconds:(\d+)/);
            const uptimeSeconds = uptimeMatch ? parseInt(uptimeMatch[1], 10) : 0;

            // Parse memory from info
            const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
            const memory = memoryMatch ? memoryMatch[1] : 'unknown';

            return {
                connected: this.redis.status === 'ready',
                keys: dbsize,
                memory,
                uptime: uptimeSeconds,
                backend: 'redis'
            };
        } catch (error) {
            kasLogger.error('Failed to get cache stats', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
        }
    }

    /**
     * Close cache connection
     */
    async close(): Promise<void> {
        // Clear cleanup interval for memory cache
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        // Close Redis connection
        if (this.redis) {
            await this.redis.quit();
            kasLogger.info('Redis cache connection closed');
        }

        // Clear memory cache
        if (this.memoryCache) {
            this.memoryCache.clear();
            kasLogger.info('Memory cache cleared');
        }
    }

    /**
     * Get value from memory cache
     *
     * @param key - Cache key
     * @returns Cached value or null if miss/expired
     */
    private getFromMemory<T>(key: string): T | null {
        if (!this.memoryCache) {
            return null;
        }

        const entry = this.memoryCache.get(key);
        if (!entry) {
            kasLogger.debug('Cache miss (memory)', { key });
            return null;
        }

        // Check expiration
        if (Date.now() > entry.expires) {
            this.memoryCache.delete(key);
            kasLogger.debug('Cache expired (memory)', { key });
            return null;
        }

        kasLogger.debug('Cache hit (memory)', { key });
        return entry.value as T;
    }

    /**
     * Set value in memory cache
     *
     * @param key - Cache key
     * @param value - Value to cache
     * @param ttl - Time to live in seconds
     */
    private setInMemory(key: string, value: any, ttl: number): void {
        if (!this.memoryCache) {
            return;
        }

        const expires = Date.now() + (ttl * 1000);
        this.memoryCache.set(key, { value, expires });

        kasLogger.debug('Cache set (memory)', {
            key,
            ttl,
            expires: new Date(expires).toISOString()
        });
    }

    /**
     * Cleanup expired entries from memory cache
     * Called periodically by cleanup interval
     */
    private cleanupExpiredMemoryEntries(): void {
        if (!this.memoryCache) {
            return;
        }

        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.memoryCache.entries()) {
            if (now > entry.expires) {
                this.memoryCache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            kasLogger.debug('Memory cache cleanup', {
                removed: cleaned,
                remaining: this.memoryCache.size
            });
        }
    }

    /**
     * Get default TTL based on key prefix
     *
     * @param key - Cache key
     * @returns TTL in seconds
     */
    private getDefaultTtl(key: string): number {
        if (key.startsWith('dek:')) {
            return this.ttl.dek;
        } else if (key.startsWith('pubkey:')) {
            return this.ttl.publicKey;
        } else if (key.startsWith('metadata:')) {
            return this.ttl.metadata;
        }
        return 60; // Default 60s
    }

    /**
     * Build cache key for DEK
     *
     * @param wrappedKey - Base64 wrapped key
     * @param kid - Key ID
     * @returns Cache key
     */
    static buildDekKey(wrappedKey: string, kid: string): string {
        return `dek:${kid}:${wrappedKey.slice(0, 16)}`;
    }

    /**
     * Build cache key for public key
     *
     * @param kid - Key ID
     * @returns Cache key
     */
    static buildPublicKeyKey(kid: string): string {
        return `pubkey:${kid}`;
    }

    /**
     * Build cache key for federation metadata
     *
     * @param kasId - KAS ID
     * @returns Cache key
     */
    static buildMetadataKey(kasId: string): string {
        return `metadata:${kasId}`;
    }
}

// Singleton instance
export const cacheManager = new CacheManager();
