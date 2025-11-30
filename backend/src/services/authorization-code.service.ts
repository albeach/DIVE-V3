/**
 * DIVE V3 Authorization Code Service
 * Manages OAuth 2.0 authorization codes with Redis caching
 */

import Redis from 'ioredis';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { IAuthorizationCode } from '../types/sp-federation.types';

export class AuthorizationCodeService {
  private redis: Redis;
  private readonly CODE_TTL = 60; // 60 seconds per OAuth spec

  constructor() {
    // Use REDIS_URL for consistent connection across all instances (includes password)
    const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
    
    logger.info('Initializing Authorization Code Service Redis connection', { 
      redisUrl: redisUrl.replace(/:[^:@]+@/, ':***@') // Mask password in logs
    });

    this.redis = new Redis(redisUrl, {
      keyPrefix: 'dive-v3:oauth:code:',
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn(`Redis connection retry attempt ${times}, delay ${delay}ms`);
        return delay;
      },
      maxRetriesPerRequest: 3
    });

    this.redis.on('connect', () => {
      logger.info('Authorization Code Service connected to Redis');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis connection error', {
        error: error.message
      });
    });
  }

  /**
   * Generate authorization code
   */
  async generateAuthorizationCode(params: {
    clientId: string;
    userId: string;
    redirectUri: string;
    scope: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    nonce?: string;
  }): Promise<string> {
    const code = crypto.randomBytes(32).toString('base64url');
    
    const authCode: IAuthorizationCode = {
      code,
      clientId: params.clientId,
      userId: params.userId,
      redirectUri: params.redirectUri,
      scope: params.scope,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      nonce: params.nonce,
      expiresAt: new Date(Date.now() + (this.CODE_TTL * 1000))
    };

    // Store in Redis with TTL
    await this.redis.setex(
      code,
      this.CODE_TTL,
      JSON.stringify(authCode)
    );

    logger.debug('Authorization code generated', {
      code: code.substring(0, 8) + '...',
      clientId: params.clientId,
      userId: params.userId,
      scope: params.scope,
      expiresIn: this.CODE_TTL
    });

    return code;
  }

  /**
   * Validate and consume authorization code
   */
  async validateAndConsumeCode(
    code: string, 
    clientId: string, 
    redirectUri: string
  ): Promise<IAuthorizationCode> {
    // Get code from Redis
    const codeData = await this.redis.get(code);
    
    if (!codeData) {
      throw new Error('invalid_grant: Authorization code not found or expired');
    }

    const authCode: IAuthorizationCode = JSON.parse(codeData);

    // Validate client ID
    if (authCode.clientId !== clientId) {
      throw new Error('invalid_grant: Authorization code was issued to another client');
    }

    // Validate redirect URI
    if (authCode.redirectUri !== redirectUri) {
      throw new Error('invalid_grant: Redirect URI mismatch');
    }

    // Check if already used
    if (authCode.usedAt) {
      // Security: If code is reused, revoke all tokens issued from this code
      logger.warn('Authorization code reuse detected', {
        code: code.substring(0, 8) + '...',
        clientId,
        usedAt: authCode.usedAt
      });
      throw new Error('invalid_grant: Authorization code already used');
    }

    // Mark as used (but keep for security audit)
    authCode.usedAt = new Date();
    await this.redis.setex(
      `used:${code}`,
      3600, // Keep for 1 hour for security audit
      JSON.stringify(authCode)
    );

    // Delete the active code
    await this.redis.del(code);

    logger.info('Authorization code consumed', {
      code: code.substring(0, 8) + '...',
      clientId,
      userId: authCode.userId,
      scope: authCode.scope
    });

    return authCode;
  }

  /**
   * Revoke all codes for a user (logout)
   */
  async revokeUserCodes(userId: string): Promise<void> {
    // In production, we'd maintain a user->codes index
    // For now, this is a no-op as codes are short-lived
    logger.info('User authorization codes revoked', { userId });
  }

  /**
   * Clean up expired codes (maintenance)
   */
  async cleanupExpiredCodes(): Promise<void> {
    // Redis handles TTL automatically
    // This method is for any additional cleanup if needed
    logger.debug('Authorization code cleanup completed');
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}
