/**
 * Performance Configuration for DIVE V3 Backend
 * Phase 5 Task 5.4: Performance Optimization
 * 
 * Optimizations implemented:
 * 1. Database connection pooling
 * 2. Redis caching configuration
 * 3. OPA decision caching
 * 4. Compression middleware
 * 5. Response caching
 */

import compression from 'compression';
import { Request, Response, NextFunction } from 'express';

/**
 * MongoDB Connection Pool Configuration
 */
export const mongoDBPoolConfig = {
    minPoolSize: 10,
    maxPoolSize: 100,
    maxIdleTimeMS: 30000,
    waitQueueTimeoutMS: 5000,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 30000,
};

/**
 * PostgreSQL Connection Pool Configuration
 */
export const postgresPoolConfig = {
    min: 10,
    max: 50,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statementTimeout: 30000,
};

/**
 * Redis Configuration with Optimizations
 */
export const redisConfig = {
    // Connection pooling
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: true,

    // Caching TTLs
    userAttributesCacheTTL: 300,     // 5 minutes
    resourceMetadataCacheTTL: 300,   // 5 minutes
    opaCacheTTL: 300,                // 5 minutes (increased from 60s)
    sessionCacheTTL: 3600,           // 1 hour
};

/**
 * OPA Decision Caching Configuration
 */
export const opaCacheConfig = {
    enabled: true,
    ttl: 300,  // 5 minutes (increased from 60s)
    maxSize: 10000,  // Maximum cached decisions
    keyPrefix: 'opa:decision:',
};

/**
 * Compression Middleware Configuration
 */
export const compressionConfig = compression({
    // Compress responses larger than 1KB
    threshold: 1024,
    // Compression level (0-9, higher = more compression but slower)
    level: 6,
    // Filter function to determine what to compress
    filter: (req: Request, res: Response) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    },
});

/**
 * Response Caching Configuration
 */
export const responseCacheConfig = {
    // Cache public resources (UNCLASSIFIED)
    publicResourcesTTL: 3600,  // 1 hour
    // Cache OPA policy compilation
    policyCompilationTTL: 86400,  // 24 hours
    // Cache user attributes (after retrieval from Keycloak)
    userAttributesTTL: 300,  // 5 minutes
};

/**
 * Request Timeout Configuration
 */
export const timeoutConfig = {
    // Global request timeout
    requestTimeout: 30000,  // 30 seconds
    // OPA policy evaluation timeout
    opaTimeout: 5000,  // 5 seconds
    // Database query timeout
    dbTimeout: 10000,  // 10 seconds
    // KAS key release timeout
    kasTimeout: 10000,  // 10 seconds
};

/**
 * Rate Limiting Configuration
 */
export const rateLimitConfig = {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 1000,  // Limit each IP to 1000 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.',
    // Skip rate limiting for health checks
    skip: (req: Request) => req.path === '/health' || req.path === '/metrics',
};

/**
 * Batch Processing Configuration
 */
export const batchConfig = {
    // Batch decision logging (write multiple logs at once)
    decisionLogBatchSize: 100,
    decisionLogBatchInterval: 5000,  // 5 seconds

    // Batch key release logging
    keyReleaseLogBatchSize: 50,
    keyReleaseLogBatchInterval: 5000,  // 5 seconds
};

/**
 * Crypto Operation Optimization
 */
export const cryptoOptimizationConfig = {
    // Pre-compute policy hashes
    precomputePolicyHashes: true,

    // Cache KEKs (reduce KMS calls)
    kekCacheTTL: 3600,  // 1 hour
    kekCacheMaxSize: 100,

    // Signature verification batch size
    signatureVerificationBatchSize: 10,
};

/**
 * Application Performance Monitoring
 */
export const apmConfig = {
    enabled: process.env.NODE_ENV === 'production',
    serviceName: 'dive-v3-backend',

    // Metrics collection
    collectMetrics: true,
    metricsInterval: 10000,  // 10 seconds

    // Trace sampling (sample 10% of requests in production)
    traceSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
};

/**
 * Middleware to add performance headers
 * 
 * FIXED: Set headers before response is sent, not in 'finish' event
 */
export function performanceHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    // Override res.end to capture timing before headers are sent
    const originalEnd = res.end;

    res.end = function (this: Response, ...args: any[]): Response {
        const duration = Date.now() - startTime;

        // Set header BEFORE calling original end (before response is sent)
        if (!res.headersSent) {
            res.setHeader('X-Response-Time', `${duration}ms`);
        }

        // Warn if response took longer than 1 second
        if (duration > 1000) {
            console.warn(`Slow request: ${req.method} ${req.path} took ${duration}ms`);
        }

        // Call original end method
        // @ts-ignore - args is dynamically typed based on how res.end() is called
        return originalEnd.apply(this, args);
    };

    next();
}

/**
 * Memory management configuration
 */
export const memoryConfig = {
    // Enable garbage collection monitoring
    enableGCMonitoring: true,

    // Heap size limits (Node.js flags)
    maxOldSpaceSize: 4096,  // 4GB
    maxSemiSpaceSize: 128,   // 128MB
};

