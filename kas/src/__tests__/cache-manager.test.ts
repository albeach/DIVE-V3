/**
 * ACP-240 KAS Phase 4.2.2: Cache Manager Unit Tests
 * 
 * Tests caching functionality for performance optimization.
 */

import { CacheManager } from '../services/cache-manager';
import Redis from 'ioredis';

// Mock ioredis
jest.mock('ioredis');

describe('CacheManager', () => {
    let mockRedis: jest.Mocked<Redis>;
    let cacheManager: CacheManager;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Create mock Redis instance
        mockRedis = {
            get: jest.fn(),
            setex: jest.fn(),
            del: jest.fn(),
            keys: jest.fn(),
            ping: jest.fn(),
            info: jest.fn(),
            dbsize: jest.fn(),
            quit: jest.fn(),
            connect: jest.fn().mockResolvedValue(undefined),
            on: jest.fn(),
            status: 'ready'
        } as any;

        (Redis as unknown as jest.Mock).mockImplementation(() => mockRedis);
    });

    describe('Constructor', () => {
        it('should initialize with default configuration', () => {
            process.env.ENABLE_CACHE = 'true';
            cacheManager = new CacheManager();
            
            expect(Redis).toHaveBeenCalledWith(
                expect.objectContaining({
                    host: 'localhost',
                    port: 6379,
                    maxRetriesPerRequest: 3
                })
            );
        });

        it('should initialize with custom configuration', () => {
            process.env.ENABLE_CACHE = 'true';
            cacheManager = new CacheManager({
                host: 'redis-custom',
                port: 6380,
                password: 'test-password'
            });
            
            expect(Redis).toHaveBeenCalledWith(
                expect.objectContaining({
                    host: 'redis-custom',
                    port: 6380,
                    password: 'test-password'
                })
            );
        });

        it('should not initialize Redis when cache is disabled', () => {
            process.env.ENABLE_CACHE = 'false';
            cacheManager = new CacheManager({ enabled: false });
            
            expect(Redis).not.toHaveBeenCalled();
        });
    });

    describe('get()', () => {
        beforeEach(() => {
            process.env.ENABLE_CACHE = 'true';
            cacheManager = new CacheManager();
        });

        it('should return cached value on cache hit', async () => {
            const testData = { foo: 'bar', count: 42 };
            mockRedis.get.mockResolvedValue(JSON.stringify(testData));
            
            const result = await cacheManager.get('test-key');
            
            expect(mockRedis.get).toHaveBeenCalledWith('test-key');
            expect(result).toEqual(testData);
        });

        it('should return null on cache miss', async () => {
            mockRedis.get.mockResolvedValue(null);
            
            const result = await cacheManager.get('missing-key');
            
            expect(result).toBeNull();
        });

        it('should return null on Redis error (fail-open)', async () => {
            mockRedis.get.mockRejectedValue(new Error('Redis connection error'));
            
            const result = await cacheManager.get('error-key');
            
            expect(result).toBeNull();
        });

        it('should return null when cache is disabled', async () => {
            process.env.ENABLE_CACHE = 'false';
            const disabledCache = new CacheManager({ enabled: false });
            
            const result = await disabledCache.get('test-key');
            
            expect(result).toBeNull();
            expect(mockRedis.get).not.toHaveBeenCalled();
        });
    });

    describe('set()', () => {
        beforeEach(() => {
            process.env.ENABLE_CACHE = 'true';
            cacheManager = new CacheManager();
        });

        it('should cache value with default TTL', async () => {
            const testData = { foo: 'bar' };
            mockRedis.setex.mockResolvedValue('OK');
            
            await cacheManager.set('dek:test-key', testData);
            
            expect(mockRedis.setex).toHaveBeenCalledWith(
                'dek:test-key',
                60, // Default DEK TTL
                JSON.stringify(testData)
            );
        });

        it('should cache value with custom TTL', async () => {
            const testData = { foo: 'bar' };
            mockRedis.setex.mockResolvedValue('OK');
            
            await cacheManager.set('custom-key', testData, 300);
            
            expect(mockRedis.setex).toHaveBeenCalledWith(
                'custom-key',
                300,
                JSON.stringify(testData)
            );
        });

        it('should use public key TTL for pubkey: prefix', async () => {
            process.env.CACHE_TTL_PUBLIC_KEY = '3600';
            const newCache = new CacheManager();
            const testData = { pem: '-----BEGIN PUBLIC KEY-----...' };
            mockRedis.setex.mockResolvedValue('OK');
            
            await newCache.set('pubkey:kas-usa-001', testData);
            
            expect(mockRedis.setex).toHaveBeenCalledWith(
                'pubkey:kas-usa-001',
                3600,
                JSON.stringify(testData)
            );
        });

        it('should not throw on Redis error (fail-open)', async () => {
            mockRedis.setex.mockRejectedValue(new Error('Redis write error'));
            
            await expect(cacheManager.set('error-key', { foo: 'bar' })).resolves.not.toThrow();
        });

        it('should not call Redis when cache is disabled', async () => {
            process.env.ENABLE_CACHE = 'false';
            const disabledCache = new CacheManager({ enabled: false });
            
            await disabledCache.set('test-key', { foo: 'bar' });
            
            expect(mockRedis.setex).not.toHaveBeenCalled();
        });
    });

    describe('delete()', () => {
        beforeEach(() => {
            process.env.ENABLE_CACHE = 'true';
            cacheManager = new CacheManager();
        });

        it('should delete cached value', async () => {
            mockRedis.del.mockResolvedValue(1);
            
            await cacheManager.delete('test-key');
            
            expect(mockRedis.del).toHaveBeenCalledWith('test-key');
        });

        it('should not throw on Redis error', async () => {
            mockRedis.del.mockRejectedValue(new Error('Redis delete error'));
            
            await expect(cacheManager.delete('error-key')).resolves.not.toThrow();
        });
    });

    describe('invalidate()', () => {
        beforeEach(() => {
            process.env.ENABLE_CACHE = 'true';
            cacheManager = new CacheManager();
        });

        it('should invalidate keys matching pattern', async () => {
            const matchingKeys = ['dek:key1', 'dek:key2', 'dek:key3'];
            mockRedis.keys.mockResolvedValue(matchingKeys);
            mockRedis.del.mockResolvedValue(3);
            
            await cacheManager.invalidate('dek:*');
            
            expect(mockRedis.keys).toHaveBeenCalledWith('dek:*');
            expect(mockRedis.del).toHaveBeenCalledWith(...matchingKeys);
        });

        it('should handle no matching keys', async () => {
            mockRedis.keys.mockResolvedValue([]);
            
            await cacheManager.invalidate('nonexistent:*');
            
            expect(mockRedis.keys).toHaveBeenCalledWith('nonexistent:*');
            expect(mockRedis.del).not.toHaveBeenCalled();
        });

        it('should not throw on Redis error', async () => {
            mockRedis.keys.mockRejectedValue(new Error('Redis keys error'));
            
            await expect(cacheManager.invalidate('error:*')).resolves.not.toThrow();
        });
    });

    describe('healthCheck()', () => {
        beforeEach(() => {
            process.env.ENABLE_CACHE = 'true';
            cacheManager = new CacheManager();
        });

        it('should return true when Redis is healthy', async () => {
            mockRedis.ping.mockResolvedValue('PONG');
            
            const isHealthy = await cacheManager.healthCheck();
            
            expect(isHealthy).toBe(true);
        });

        it('should return false when Redis ping fails', async () => {
            mockRedis.ping.mockRejectedValue(new Error('Connection refused'));
            
            const isHealthy = await cacheManager.healthCheck();
            
            expect(isHealthy).toBe(false);
        });

        it('should return true when cache is disabled (fail-open)', async () => {
            process.env.ENABLE_CACHE = 'false';
            const disabledCache = new CacheManager({ enabled: false });
            
            const isHealthy = await disabledCache.healthCheck();
            
            expect(isHealthy).toBe(true);
        });
    });

    describe('getStats()', () => {
        beforeEach(() => {
            process.env.ENABLE_CACHE = 'true';
            cacheManager = new CacheManager();
        });

        it('should return cache statistics', async () => {
            const serverInfo = `# Server
uptime_in_seconds:3600
redis_version:7.0.0`;
            const statsInfo = `# Stats
used_memory_human:10M
total_connections_received:100`;
            
            mockRedis.info.mockResolvedValueOnce(statsInfo)
                            .mockResolvedValueOnce(serverInfo);
            mockRedis.dbsize.mockResolvedValue(150);
            
            const stats = await cacheManager.getStats();
            
            expect(stats).toEqual({
                connected: true,
                keys: 150,
                memory: '10M',
                uptime: 3600
            });
        });

        it('should return null when cache is disabled', async () => {
            process.env.ENABLE_CACHE = 'false';
            const disabledCache = new CacheManager({ enabled: false });
            
            const stats = await disabledCache.getStats();
            
            expect(stats).toBeNull();
        });

        it('should return null on Redis error', async () => {
            mockRedis.info.mockRejectedValue(new Error('Redis info error'));
            
            const stats = await cacheManager.getStats();
            
            expect(stats).toBeNull();
        });
    });

    describe('Static Key Builders', () => {
        it('should build DEK cache key', () => {
            const key = CacheManager.buildDekKey('base64wrappedkey==', 'kas-usa-001');
            
            expect(key).toMatch(/^dek:kas-usa-001:base64wrapped/);
        });

        it('should build public key cache key', () => {
            const key = CacheManager.buildPublicKeyKey('kas-fra-002');
            
            expect(key).toBe('pubkey:kas-fra-002');
        });

        it('should build metadata cache key', () => {
            const key = CacheManager.buildMetadataKey('kas-gbr');
            
            expect(key).toBe('metadata:kas-gbr');
        });
    });

    describe('close()', () => {
        it('should close Redis connection', async () => {
            process.env.ENABLE_CACHE = 'true';
            cacheManager = new CacheManager();
            mockRedis.quit.mockResolvedValue('OK');
            
            await cacheManager.close();
            
            expect(mockRedis.quit).toHaveBeenCalled();
        });

        it('should not throw when Redis is not initialized', async () => {
            process.env.ENABLE_CACHE = 'false';
            const disabledCache = new CacheManager({ enabled: false });
            
            await expect(disabledCache.close()).resolves.not.toThrow();
        });
    });
});
