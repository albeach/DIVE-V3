/**
 * DIVE V3 SP Rate Limiting Middleware
 * Per-SP rate limiting based on federation agreements
 */

import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { IRequestWithSP } from '../types/sp-federation.types';
import { SPManagementService } from '../services/sp-management.service';
import { extractClientCredentials } from '../utils/oauth.utils';

const spService = new SPManagementService();

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

export class SPRateLimiter {
  private redis: Redis;
  private keyPrefix = 'dive-v3:rate-limit:sp:';

  constructor() {
    // Use REDIS_URL for consistent connection across all instances (includes password)
    const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
    
    this.redis = new Redis(redisUrl, {
      keyPrefix: this.keyPrefix,
      maxRetriesPerRequest: 3
    });
  }

  /**
   * Create rate limiter middleware for SP endpoints
   */
  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const requestId = req.headers['x-request-id'] as string;
      
      try {
        // Extract client ID from various sources
        let clientId: string | undefined;
        
        // Check if SP context already exists (from sp-auth middleware)
        const spContext = (req as IRequestWithSP).sp;
        if (spContext) {
          clientId = spContext.clientId;
        } else {
          // Try to extract from request
          const creds = extractClientCredentials(req);
          clientId = creds.clientId;
        }
        
        if (!clientId) {
          // No client ID found, skip rate limiting
          return next();
        }
        
        // Get SP configuration
        const sp = await spService.getByClientId(clientId);
        if (!sp || sp.status !== 'ACTIVE') {
          // Invalid or inactive SP, let auth middleware handle it
          return next();
        }
        
        // Apply rate limiting
        const key = `${clientId}:${req.ip}`;
        const limit = sp.rateLimit.requestsPerMinute;
        const windowMs = 60000; // 1 minute
        
        const current = await this.increment(key, windowMs);
        
        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', limit.toString());
        res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - current.count).toString());
        res.setHeader('X-RateLimit-Reset', new Date(current.resetTime).toISOString());
        
        if (current.count > limit) {
          // Check burst allowance
          const burstKey = `burst:${key}`;
          const burstCount = await this.increment(burstKey, windowMs * 5); // 5 minute burst window
          
          if (burstCount.count > sp.rateLimit.burstSize) {
            logger.warn('SP rate limit exceeded', {
              requestId,
              clientId,
              spId: sp.spId,
              ip: req.ip,
              count: current.count,
              limit,
              burst: burstCount.count,
              burstLimit: sp.rateLimit.burstSize
            });
            
            res.status(429).json({
              error: 'rate_limit_exceeded',
              error_description: 'API rate limit exceeded',
              retry_after: Math.ceil((current.resetTime - Date.now()) / 1000)
            });
            return;
          }
          
          // Within burst allowance
          logger.info('SP using burst allowance', {
            requestId,
            clientId,
            burstCount: burstCount.count,
            burstLimit: sp.rateLimit.burstSize
          });
        }
        
        // Check daily quota if configured
        if (sp.rateLimit.quotaPerDay) {
          const quotaKey = `quota:${clientId}:${this.getDayKey()}`;
          const dailyCount = await this.increment(quotaKey, 86400000); // 24 hours
          
          if (dailyCount.count > sp.rateLimit.quotaPerDay) {
            logger.warn('SP daily quota exceeded', {
              requestId,
              clientId,
              spId: sp.spId,
              dailyCount: dailyCount.count,
              quota: sp.rateLimit.quotaPerDay
            });
            
            res.status(429).json({
              error: 'quota_exceeded',
              error_description: 'Daily API quota exceeded',
              retry_after: this.getSecondsUntilMidnight()
            });
            return;
          }
        }
        
        next();
        
      } catch (error) {
        logger.error('Rate limiting error', {
          requestId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // Fail open - don't block requests on rate limiter errors
        next();
      }
    };
  }

  /**
   * Increment counter and return current count
   */
  private async increment(key: string, windowMs: number): Promise<RateLimitInfo> {
    const now = Date.now();
    const resetTime = Math.ceil(now / windowMs) * windowMs;
    const ttl = Math.ceil((resetTime - now) / 1000);
    
    const multi = this.redis.multi();
    multi.incr(key);
    multi.expire(key, ttl);
    
    const results = await multi.exec();
    const count = results?.[0]?.[1] as number || 1;
    
    return { count, resetTime };
  }

  /**
   * Get day key for quota tracking
   */
  private getDayKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  }

  /**
   * Get seconds until midnight UTC
   */
  private getSecondsUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

// Create singleton instance
export const spRateLimiter = new SPRateLimiter();

/**
 * Rate limiting middleware for SP endpoints
 */
export const spRateLimit = spRateLimiter.middleware();
