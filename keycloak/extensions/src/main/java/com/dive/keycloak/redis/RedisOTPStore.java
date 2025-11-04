package com.dive.keycloak.redis;

import org.json.JSONObject;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;
import redis.clients.jedis.exceptions.JedisException;

import java.time.Duration;

/**
 * DIVE V3 Redis OTP Store
 * 
 * Production-grade Redis integration for OTP enrollment flow.
 * Connects to Redis to retrieve pending OTP secrets during enrollment.
 * 
 * Architecture:
 * 1. Backend API stores verified secrets in Redis (key: otp:pending:{userId})
 * 2. Custom SPI retrieves and validates secrets during Direct Grant authentication
 * 3. SPI creates Keycloak OTP credential after successful verification
 * 4. SPI removes pending secret from Redis after credential creation
 * 
 * Thread Safety: Uses JedisPool for connection pooling (thread-safe)
 * Error Handling: Graceful fallback - returns null if Redis unavailable
 * 
 * @author DIVE V3 Team
 * @since Phase 6
 */
public class RedisOTPStore {
    
    private static final String REDIS_HOST = getEnv("REDIS_HOST", "redis");
    private static final int REDIS_PORT = Integer.parseInt(getEnv("REDIS_PORT", "6379"));
    private static final String REDIS_PASSWORD = getEnv("REDIS_PASSWORD", null);
    
    private static final String KEY_PREFIX = "otp:pending:";
    private static final int CONNECTION_TIMEOUT_MS = 2000;
    private static final int MAX_TOTAL_CONNECTIONS = 8;
    
    private static JedisPool jedisPool;
    
    static {
        initializePool();
    }
    
    /**
     * Initialize Jedis connection pool (called once at startup)
     */
    private static void initializePool() {
        try {
            JedisPoolConfig poolConfig = new JedisPoolConfig();
            poolConfig.setMaxTotal(MAX_TOTAL_CONNECTIONS);
            poolConfig.setMaxIdle(4);
            poolConfig.setMinIdle(1);
            poolConfig.setTestOnBorrow(true);
            poolConfig.setTestOnReturn(true);
            poolConfig.setTestWhileIdle(true);
            poolConfig.setMinEvictableIdleTime(Duration.ofSeconds(60));
            poolConfig.setTimeBetweenEvictionRuns(Duration.ofSeconds(30));
            poolConfig.setNumTestsPerEvictionRun(3);
            poolConfig.setBlockWhenExhausted(true);
            poolConfig.setMaxWait(Duration.ofSeconds(2));
            
            if (REDIS_PASSWORD != null && !REDIS_PASSWORD.isEmpty()) {
                jedisPool = new JedisPool(poolConfig, REDIS_HOST, REDIS_PORT, CONNECTION_TIMEOUT_MS, REDIS_PASSWORD);
            } else {
                jedisPool = new JedisPool(poolConfig, REDIS_HOST, REDIS_PORT, CONNECTION_TIMEOUT_MS);
            }
            
            System.out.println("[DIVE Redis] Connection pool initialized: " + REDIS_HOST + ":" + REDIS_PORT);
        } catch (Exception e) {
            System.err.println("[DIVE Redis] ERROR: Failed to initialize connection pool: " + e.getMessage());
            jedisPool = null;
        }
    }
    
    /**
     * Pending OTP Secret data structure (matches backend format)
     */
    public static class PendingOTPSecret {
        public final String secret;
        public final String createdAt;
        public final String expiresAt;
        
        public PendingOTPSecret(String secret, String createdAt, String expiresAt) {
            this.secret = secret;
            this.createdAt = createdAt;
            this.expiresAt = expiresAt;
        }
    }
    
    /**
     * Retrieve pending OTP secret from Redis
     * 
     * @param userId Keycloak user ID
     * @return PendingOTPSecret or null if not found/error
     */
    public static PendingOTPSecret getPendingSecret(String userId) {
        if (jedisPool == null) {
            System.err.println("[DIVE Redis] ERROR: Connection pool not initialized");
            return null;
        }
        
        String key = KEY_PREFIX + userId;
        
        try (Jedis jedis = jedisPool.getResource()) {
            String value = jedis.get(key);
            
            if (value == null) {
                System.out.println("[DIVE Redis] No pending secret found for user: " + userId);
                return null;
            }
            
            // Parse JSON: {"secret": "BASE32", "createdAt": "ISO8601", "expiresAt": "ISO8601"}
            JSONObject json = new JSONObject(value);
            String secret = json.getString("secret");
            String createdAt = json.getString("createdAt");
            String expiresAt = json.getString("expiresAt");
            
            System.out.println("[DIVE Redis] Retrieved pending secret for user: " + userId + 
                             " (expires: " + expiresAt + ")");
            
            return new PendingOTPSecret(secret, createdAt, expiresAt);
            
        } catch (JedisException e) {
            System.err.println("[DIVE Redis] ERROR: Failed to retrieve pending secret: " + e.getMessage());
            return null;
        } catch (Exception e) {
            System.err.println("[DIVE Redis] ERROR: Failed to parse pending secret JSON: " + e.getMessage());
            return null;
        }
    }
    
    /**
     * Remove pending OTP secret from Redis (after credential creation)
     * 
     * @param userId Keycloak user ID
     * @return true if deleted, false if error
     */
    public static boolean removePendingSecret(String userId) {
        if (jedisPool == null) {
            System.err.println("[DIVE Redis] ERROR: Connection pool not initialized");
            return false;
        }
        
        String key = KEY_PREFIX + userId;
        
        try (Jedis jedis = jedisPool.getResource()) {
            Long deleted = jedis.del(key);
            
            if (deleted > 0) {
                System.out.println("[DIVE Redis] Removed pending secret for user: " + userId);
                return true;
            } else {
                System.out.println("[DIVE Redis] No pending secret to remove for user: " + userId);
                return false;
            }
            
        } catch (JedisException e) {
            System.err.println("[DIVE Redis] ERROR: Failed to remove pending secret: " + e.getMessage());
            return false;
        }
    }
    
    /**
     * Get environment variable with default
     */
    private static String getEnv(String key, String defaultValue) {
        String value = System.getenv(key);
        return (value != null && !value.isEmpty()) ? value : defaultValue;
    }
    
    /**
     * Close connection pool (called on shutdown)
     */
    public static void close() {
        if (jedisPool != null && !jedisPool.isClosed()) {
            jedisPool.close();
            System.out.println("[DIVE Redis] Connection pool closed");
        }
    }
}













