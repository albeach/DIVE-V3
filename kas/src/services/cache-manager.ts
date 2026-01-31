/**
 * ACP-240 KAS Phase 4.2.2: Cache Manager Service
 * 
 * Provides Redis-based caching for:
 * - Unwrapped DEKs (TTL: 60s)
 * - Public keys (TTL: 3600s)
 * - Federation metadata (TTL: 300s)
 * 
 * Features:
 * - Connection pooling and retry logic
 * - Fail-open pattern (cache miss = proceed without cache)
 * - Key invalidation by pattern
 * - Health check integration
 * - Comprehensive logging
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
}

export class CacheManager {
    private redis: Redis | null = null;
    private enabled: boolean;
    private ttl: {
        dek: number;
        publicKey: number;
        metadata: number;
    };

    constructor(config: ICacheConfig = {}) {
        this.enabled = config.enabled !== false && process.env.ENABLE_CACHE === 'true';
        
        this.ttl = {
            dek: config.ttl?.dek || parseInt(process.env.CACHE_TTL_DEK || '60', 10),
            publicKey: config.ttl?.publicKey || parseInt(process.env.CACHE_TTL_PUBLIC_KEY || '3600', 10),
            metadata: config.ttl?.metadata || 300
        };

        if (!this.enabled) {
            kasLogger.info('Redis cache disabled');
            return;
        }

        try {
            this.redis = new Redis({
                host: config.host || process.env.REDIS_HOST || 'localhost',
                port: config.port || parseInt(process.env.REDIS_PORT || '6379', 10),
                password: config.password || process.env.REDIS_PASSWORD,
                retryStrategy: (times) => {
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

            this.redis.on('error', (error) => {
                kasLogger.error('Redis cache error', {
                    error: error.message,
                    code: (error as any).code
                });
            });

            this.redis.on('close', () => {
                kasLogger.warn('Redis cache connection closed');
            });

            // Connect immediately
            this.redis.connect().catch((error) => {
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
        if (!this.enabled || !this.redis) {
            return null;
        }

        try {
            const value = await this.redis.get(key);
            
            if (value) {
                kasLogger.debug('Cache hit', { key, size: value.length });
                return JSON.parse(value) as T;
            }
            
            kasLogger.debug('Cache miss', { key });
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
        if (!this.enabled || !this.redis) {
            return;
        }

        try {
            const serialized = JSON.stringify(value);
            const effectiveTtl = ttl || this.getDefaultTtl(key);
            
            await this.redis.setex(key, effectiveTtl, serialized);
            
            kasLogger.debug('Cache set', {
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
        if (!this.enabled || !this.redis) {
            return;
        }

        try {
            await this.redis.del(key);
            kasLogger.debug('Cache delete', { key });
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
        if (!this.enabled || !this.redis) {
            return;
        }

        try {
            const keys = await this.redis.keys(pattern);
            
            if (keys.length > 0) {
                await this.redis.del(...keys);
                kasLogger.info('Cache invalidated', {
                    pattern,
                    count: keys.length
                });
            } else {
                kasLogger.debug('Cache invalidation: no keys matched', { pattern });
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
     * @returns True if Redis is healthy
     */
    async healthCheck(): Promise<boolean> {
        if (!this.enabled || !this.redis) {
            return true; // Cache disabled = healthy (fail-open)
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
    } | null> {
        if (!this.enabled || !this.redis) {
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
                uptime: uptimeSeconds
            };
        } catch (error) {
            kasLogger.error('Failed to get cache stats', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
        }
    }

    /**
     * Close Redis connection
     */
    async close(): Promise<void> {
        if (this.redis) {
            await this.redis.quit();
            kasLogger.info('Redis cache connection closed');
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
