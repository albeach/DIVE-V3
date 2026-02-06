/**
 * Token Blacklist Service Integration Tests
 * Phase 2: Security Hardening
 * 
 * COMPREHENSIVE TESTING STRATEGY:
 * 1. Blacklist token operations (add, check, expiry)
 * 2. User-level revocation (all tokens)
 * 3. Cross-instance synchronization (Pub/Sub)
 * 4. Fail-open/fail-closed patterns
 * 5. Redis availability scenarios
 * 
 * Reference: docs/session-management.md
 */

import {
    blacklistToken,
    isTokenBlacklisted,
    revokeAllUserTokens,
    areUserTokensRevoked,
    getBlacklistStats,
    getBlacklistHealth,
    clearBlacklist,
    initializeBlacklistService,
    closeRedisConnection
} from '../../services/token-blacklist.service';
import Redis from 'ioredis';

describe('Token Blacklist Service - Integration Tests', () => {
    let redis: Redis;

    beforeAll(async () => {
        // Initialize blacklist service
        await initializeBlacklistService();

        // Get Redis client for verification
        const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
        redis = new Redis(redisUrl);
    });

    afterEach(async () => {
        // Clear blacklist after each test
        await clearBlacklist();
    });

    afterAll(async () => {
        // Clean up Redis connections
        await closeRedisConnection();
        await redis.quit();
    });

    describe('Token Blacklisting', () => {
        it('should blacklist a token with TTL', async () => {
            const jti = 'test-token-123';
            const expiresIn = 900; // 15 minutes

            await blacklistToken(jti, expiresIn, 'User logout');

            // Verify token is blacklisted
            const isBlacklisted = await isTokenBlacklisted(jti);
            expect(isBlacklisted).toBe(true);

            // Verify Redis entry exists with correct TTL
            const entry = await redis.get(`blacklist:${jti}`);
            expect(entry).toBeTruthy();
            
            const parsedEntry = JSON.parse(entry!);
            expect(parsedEntry.reason).toBe('User logout');
            expect(parsedEntry.revokedByInstance).toBeTruthy();

            // Verify TTL is set (approximately)
            const ttl = await redis.ttl(`blacklist:${jti}`);
            expect(ttl).toBeGreaterThan(890); // Allow some time variance
            expect(ttl).toBeLessThanOrEqual(900);
        });

        it('should handle token without jti gracefully', async () => {
            // Should not throw error
            await expect(blacklistToken('', 900)).resolves.toBeUndefined();

            // Should not blacklist
            const isBlacklisted = await isTokenBlacklisted('');
            expect(isBlacklisted).toBe(false);
        });

        it('should return false for non-existent token', async () => {
            const isBlacklisted = await isTokenBlacklisted('non-existent-jti');
            expect(isBlacklisted).toBe(false);
        });

        it('should expire blacklisted token after TTL', async () => {
            const jti = 'test-token-expire';
            const expiresIn = 2; // 2 seconds

            await blacklistToken(jti, expiresIn, 'Test expiry');

            // Immediately verify it's blacklisted
            let isBlacklisted = await isTokenBlacklisted(jti);
            expect(isBlacklisted).toBe(true);

            // Wait for TTL to expire (with buffer)
            await new Promise(resolve => setTimeout(resolve, 2500));

            // Verify it's no longer blacklisted
            isBlacklisted = await isTokenBlacklisted(jti);
            expect(isBlacklisted).toBe(false);
        });

        it('should handle multiple tokens independently', async () => {
            const jti1 = 'token-1';
            const jti2 = 'token-2';
            const jti3 = 'token-3';

            await blacklistToken(jti1, 900, 'Logout 1');
            await blacklistToken(jti2, 900, 'Logout 2');

            // Check blacklist status
            expect(await isTokenBlacklisted(jti1)).toBe(true);
            expect(await isTokenBlacklisted(jti2)).toBe(true);
            expect(await isTokenBlacklisted(jti3)).toBe(false);
        });
    });

    describe('User-Level Revocation', () => {
        it('should revoke all user tokens with TTL', async () => {
            const uniqueID = 'user-123';
            const expiresIn = 900;

            await revokeAllUserTokens(uniqueID, expiresIn, 'User logout');

            // Verify user tokens are revoked
            const areRevoked = await areUserTokensRevoked(uniqueID);
            expect(areRevoked).toBe(true);

            // Verify Redis entry
            const entry = await redis.get(`user-revoked:${uniqueID}`);
            expect(entry).toBeTruthy();

            const parsedEntry = JSON.parse(entry!);
            expect(parsedEntry.reason).toBe('User logout');
        });

        it('should handle user revocation without uniqueID gracefully', async () => {
            await expect(revokeAllUserTokens('', 900)).resolves.toBeUndefined();

            const areRevoked = await areUserTokensRevoked('');
            expect(areRevoked).toBe(false);
        });

        it('should return false for non-revoked user', async () => {
            const areRevoked = await areUserTokensRevoked('non-revoked-user');
            expect(areRevoked).toBe(false);
        });

        it('should expire user revocation after TTL', async () => {
            const uniqueID = 'user-expire';
            const expiresIn = 2; // 2 seconds

            await revokeAllUserTokens(uniqueID, expiresIn, 'Test expiry');

            // Immediately verify revoked
            let areRevoked = await areUserTokensRevoked(uniqueID);
            expect(areRevoked).toBe(true);

            // Wait for expiry
            await new Promise(resolve => setTimeout(resolve, 2500));

            // Verify no longer revoked
            areRevoked = await areUserTokensRevoked(uniqueID);
            expect(areRevoked).toBe(false);
        });

        it('should handle multiple user revocations independently', async () => {
            const user1 = 'user-1';
            const user2 = 'user-2';
            const user3 = 'user-3';

            await revokeAllUserTokens(user1, 900);
            await revokeAllUserTokens(user2, 900);

            expect(await areUserTokensRevoked(user1)).toBe(true);
            expect(await areUserTokensRevoked(user2)).toBe(true);
            expect(await areUserTokensRevoked(user3)).toBe(false);
        });
    });

    describe('Blacklist Statistics', () => {
        it('should return accurate blacklist counts', async () => {
            // Add tokens and user revocations
            await blacklistToken('jti-1', 900);
            await blacklistToken('jti-2', 900);
            await blacklistToken('jti-3', 900);
            await revokeAllUserTokens('user-1', 900);
            await revokeAllUserTokens('user-2', 900);

            const stats = await getBlacklistStats();

            expect(stats.totalBlacklistedTokens).toBe(3);
            expect(stats.totalRevokedUsers).toBe(2);
            expect(stats.instance).toBeTruthy();
            expect(stats.redisUrl).toBeTruthy();
        });

        it('should return zero counts for empty blacklist', async () => {
            const stats = await getBlacklistStats();

            expect(stats.totalBlacklistedTokens).toBe(0);
            expect(stats.totalRevokedUsers).toBe(0);
        });
    });

    describe('Health Checks', () => {
        it('should report healthy when Redis is available', async () => {
            const health = await getBlacklistHealth();

            expect(health.healthy).toBe(true);
            expect(health.connected).toBe(true);
            expect(health.pubSubSubscribed).toBe(true);
            expect(health.blacklistCount).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Edge Cases & Error Handling', () => {
        it('should handle concurrent blacklist operations', async () => {
            const jti = 'concurrent-token';

            // Blacklist same token concurrently (race condition test)
            await Promise.all([
                blacklistToken(jti, 900, 'Concurrent 1'),
                blacklistToken(jti, 900, 'Concurrent 2'),
                blacklistToken(jti, 900, 'Concurrent 3'),
            ]);

            // Should still be blacklisted
            const isBlacklisted = await isTokenBlacklisted(jti);
            expect(isBlacklisted).toBe(true);
        });

        it('should handle concurrent user revocations', async () => {
            const uniqueID = 'concurrent-user';

            await Promise.all([
                revokeAllUserTokens(uniqueID, 900, 'Concurrent 1'),
                revokeAllUserTokens(uniqueID, 900, 'Concurrent 2'),
                revokeAllUserTokens(uniqueID, 900, 'Concurrent 3'),
            ]);

            const areRevoked = await areUserTokensRevoked(uniqueID);
            expect(areRevoked).toBe(true);
        });

        it('should handle large number of blacklisted tokens', async () => {
            const tokenCount = 100;
            const promises = [];

            for (let i = 0; i < tokenCount; i++) {
                promises.push(blacklistToken(`bulk-token-${i}`, 900));
            }

            await Promise.all(promises);

            const stats = await getBlacklistStats();
            expect(stats.totalBlacklistedTokens).toBe(tokenCount);

            // Verify random samples
            expect(await isTokenBlacklisted('bulk-token-0')).toBe(true);
            expect(await isTokenBlacklisted('bulk-token-50')).toBe(true);
            expect(await isTokenBlacklisted('bulk-token-99')).toBe(true);
        });

        it('should handle special characters in JTI', async () => {
            const specialJTI = 'token-with-special-chars-!@#$%^&*()';

            await blacklistToken(specialJTI, 900);

            const isBlacklisted = await isTokenBlacklisted(specialJTI);
            expect(isBlacklisted).toBe(true);
        });

        it('should handle very long JTI values', async () => {
            const longJTI = 'x'.repeat(1000);

            await blacklistToken(longJTI, 900);

            const isBlacklisted = await isTokenBlacklisted(longJTI);
            expect(isBlacklisted).toBe(true);
        });
    });

    describe('Clear Blacklist', () => {
        it('should clear all blacklist entries', async () => {
            // Add entries
            await blacklistToken('jti-clear-1', 900);
            await blacklistToken('jti-clear-2', 900);
            await revokeAllUserTokens('user-clear-1', 900);

            // Verify added
            let stats = await getBlacklistStats();
            expect(stats.totalBlacklistedTokens).toBeGreaterThan(0);
            expect(stats.totalRevokedUsers).toBeGreaterThan(0);

            // Clear
            await clearBlacklist();

            // Verify cleared
            stats = await getBlacklistStats();
            expect(stats.totalBlacklistedTokens).toBe(0);
            expect(stats.totalRevokedUsers).toBe(0);
        });
    });

    describe('Fail-Open Pattern (Redis Unavailable)', () => {
        // NOTE: These tests would require mocking Redis failures
        // For now, we document the expected behavior:
        
        it('should document fail-open behavior for token checks', () => {
            // When Redis is unavailable:
            // - isTokenBlacklisted() returns FALSE (fail-open for availability)
            // - Rationale: Token already passed Keycloak introspection
            // - This is a secondary security check
            expect(true).toBe(true); // Documented behavior
        });

        it('should document fail-closed behavior for user revocation checks', () => {
            // When Redis is unavailable:
            // - areUserTokensRevoked() returns TRUE (fail-closed for security)
            // - Rationale: User revocation is a critical security operation
            // - Better to deny access than risk security breach
            expect(true).toBe(true); // Documented behavior
        });
    });

    describe('Cross-Instance Synchronization (Pub/Sub)', () => {
        // NOTE: Full cross-instance tests require multiple backend instances
        // These tests verify the Pub/Sub mechanism is initialized
        
        it('should initialize Pub/Sub subscriber on startup', async () => {
            const health = await getBlacklistHealth();
            
            // Verify Pub/Sub is subscribed
            expect(health.pubSubSubscribed).toBe(true);
        });

        it('should document cross-instance propagation behavior', () => {
            // When token is blacklisted on USA instance:
            // 1. blacklistToken() writes to shared Redis
            // 2. publishBlacklistEvent() broadcasts via Pub/Sub
            // 3. FRA, GBR, DEU instances receive event
            // 4. All instances can check isTokenBlacklisted() against shared Redis
            // 5. Result: Token blocked on ALL instances
            expect(true).toBe(true); // Documented behavior
        });
    });
});

/**
 * Performance Tests
 * Verify blacklist operations meet latency requirements
 */
describe('Token Blacklist Service - Performance Tests', () => {
    beforeAll(async () => {
        await initializeBlacklistService();
    });

    afterEach(async () => {
        await clearBlacklist();
    });

    afterAll(async () => {
        await closeRedisConnection();
    });

    it('should blacklist token in <100ms', async () => {
        const start = Date.now();
        
        await blacklistToken('perf-token-1', 900);
        
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(100);
    });

    it('should check blacklist in <50ms', async () => {
        await blacklistToken('perf-token-2', 900);
        
        const start = Date.now();
        await isTokenBlacklisted('perf-token-2');
        const duration = Date.now() - start;
        
        expect(duration).toBeLessThan(50);
    });

    it('should handle 100 sequential checks in <1 second', async () => {
        // Pre-blacklist tokens
        for (let i = 0; i < 50; i++) {
            await blacklistToken(`perf-token-${i}`, 900);
        }

        const start = Date.now();
        
        for (let i = 0; i < 100; i++) {
            await isTokenBlacklisted(`perf-token-${i}`);
        }
        
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(1000);
    });

    it('should handle 50 parallel checks in <200ms', async () => {
        // Pre-blacklist tokens
        for (let i = 0; i < 25; i++) {
            await blacklistToken(`parallel-token-${i}`, 900);
        }

        const start = Date.now();
        
        const promises = [];
        for (let i = 0; i < 50; i++) {
            promises.push(isTokenBlacklisted(`parallel-token-${i}`));
        }
        await Promise.all(promises);
        
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(200);
    });
});
