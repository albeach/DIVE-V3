/**
 * Rate Limiting Implementation
 * 
 * Token bucket algorithm for rate limiting requests.
 * Prevents abuse and ensures fair resource allocation.
 * 
 * Features:
 * - Per-subject rate limiting (by uniqueID)
 * - Per-IP rate limiting
 * - Token bucket algorithm
 * - Burst allowance
 * - Configurable limits
 */

import { kasLogger } from './kas-logger';
import NodeCache from 'node-cache';

export interface IRateLimitConfig {
    /** Requests per minute per subject */
    perSubjectLimit: number;
    /** Requests per minute per IP */
    perIPLimit: number;
    /** Burst allowance (additional tokens) */
    burstAllowance: number;
    /** Time window in seconds */
    windowSeconds: number;
}

export interface IRateLimitResult {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    limit: number;
}

interface ITokenBucket {
    tokens: number;
    lastRefill: number;
    limit: number;
    refillRate: number; // tokens per second
}

const DEFAULT_CONFIG: IRateLimitConfig = {
    perSubjectLimit: parseInt(process.env.KAS_RATE_LIMIT_PER_SUBJECT || '100', 10),
    perIPLimit: parseInt(process.env.KAS_RATE_LIMIT_PER_IP || '200', 10),
    burstAllowance: parseInt(process.env.KAS_RATE_LIMIT_BURST || '20', 10),
    windowSeconds: parseInt(process.env.KAS_RATE_LIMIT_WINDOW_SECONDS || '60', 10),
};

/**
 * Rate Limiter using token bucket algorithm
 */
export class RateLimiter {
    private subjectBuckets: NodeCache;
    private ipBuckets: NodeCache;
    private readonly config: IRateLimitConfig;

    constructor(config?: Partial<IRateLimitConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        
        // Cache with TTL slightly longer than window to handle edge cases
        const cacheTTL = this.config.windowSeconds * 2;
        this.subjectBuckets = new NodeCache({ stdTTL: cacheTTL, checkperiod: 60 });
        this.ipBuckets = new NodeCache({ stdTTL: cacheTTL, checkperiod: 60 });
    }

    /**
     * Check if request is allowed for subject and IP
     */
    checkLimit(subject: string, ip: string): IRateLimitResult {
        const now = Date.now();
        
        // Check subject limit
        const subjectResult = this.checkBucket(
            this.subjectBuckets,
            `subject:${subject}`,
            this.config.perSubjectLimit + this.config.burstAllowance,
            now
        );
        
        // Check IP limit
        const ipResult = this.checkBucket(
            this.ipBuckets,
            `ip:${ip}`,
            this.config.perIPLimit + this.config.burstAllowance,
            now
        );
        
        // Request is allowed only if both limits are satisfied
        const allowed = subjectResult.allowed && ipResult.allowed;
        
        // Return the most restrictive limit info
        const result = !subjectResult.allowed ? subjectResult : ipResult;
        
        if (!allowed) {
            kasLogger.warn('Rate limit exceeded', {
                subject,
                ip,
                subjectLimit: this.config.perSubjectLimit,
                ipLimit: this.config.perIPLimit,
                subjectRemaining: subjectResult.remaining,
                ipRemaining: ipResult.remaining,
            });
        }
        
        return {
            allowed,
            remaining: Math.min(subjectResult.remaining, ipResult.remaining),
            resetTime: Math.max(subjectResult.resetTime, ipResult.resetTime),
            limit: !subjectResult.allowed ? this.config.perSubjectLimit : this.config.perIPLimit,
        };
    }

    /**
     * Check token bucket for a specific key
     */
    private checkBucket(
        cache: NodeCache,
        key: string,
        limit: number,
        now: number
    ): IRateLimitResult {
        const bucket = cache.get<ITokenBucket>(key);
        const refillRate = limit / this.config.windowSeconds; // tokens per second
        
        let currentBucket: ITokenBucket;
        
        if (!bucket) {
            // Create new bucket with full tokens
            currentBucket = {
                tokens: limit,
                lastRefill: now,
                limit,
                refillRate,
            };
        } else {
            // Refill tokens based on time elapsed
            const timeElapsed = (now - bucket.lastRefill) / 1000; // seconds
            const tokensToAdd = timeElapsed * refillRate;
            
            currentBucket = {
                tokens: Math.min(bucket.limit, bucket.tokens + tokensToAdd),
                lastRefill: now,
                limit: bucket.limit,
                refillRate,
            };
        }
        
        // Check if we have tokens
        if (currentBucket.tokens >= 1) {
            currentBucket.tokens -= 1;
            cache.set(key, currentBucket);
            
            return {
                allowed: true,
                remaining: Math.floor(currentBucket.tokens),
                resetTime: now + (this.config.windowSeconds * 1000),
                limit,
            };
        } else {
            // No tokens available
            cache.set(key, currentBucket);
            
            // Calculate when next token will be available
            const tokensNeeded = 1 - currentBucket.tokens;
            const waitTime = (tokensNeeded / refillRate) * 1000; // milliseconds
            
            return {
                allowed: false,
                remaining: 0,
                resetTime: now + waitTime,
                limit,
            };
        }
    }

    /**
     * Reset rate limit for a subject (for testing/admin)
     */
    resetSubject(subject: string): void {
        this.subjectBuckets.del(`subject:${subject}`);
        kasLogger.info('Rate limit reset for subject', { subject });
    }

    /**
     * Reset rate limit for an IP (for testing/admin)
     */
    resetIP(ip: string): void {
        this.ipBuckets.del(`ip:${ip}`);
        kasLogger.info('Rate limit reset for IP', { ip });
    }

    /**
     * Get current rate limit statistics
     */
    getStats(): {
        subjectBuckets: number;
        ipBuckets: number;
        config: IRateLimitConfig;
    } {
        return {
            subjectBuckets: this.subjectBuckets.keys().length,
            ipBuckets: this.ipBuckets.keys().length,
            config: this.config,
        };
    }
}

/**
 * Global rate limiter instance
 */
export const rateLimiter = new RateLimiter();

