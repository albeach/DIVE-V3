/**
 * DIVE V3 - Decision Cache Cluster Service
 * Phase 7: Production Hardening
 * 
 * Provides distributed caching for OPA authorization decisions with:
 * - Redis Sentinel/Cluster backend
 * - Classification-based TTL
 * - Distributed cache invalidation via pub/sub
 * - Failover handling
 * - Tenant-aware cache keys
 * 
 * Architecture:
 *   Backend → DecisionCacheCluster → Redis Sentinel
 *                                  ← Pub/Sub invalidation
 *                                  ← Failover events
 * 
 * ACP-240 Compliance:
 * - Shorter TTLs for sensitive classifications
 * - Real-time invalidation on policy updates
 * - Audit logging of cache operations
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { redisClusterService, IRedisClusterHealth, IRedisMetrics } from './redis-cluster.service';

// ============================================
// TYPES
// ============================================

export interface ICacheClusterConfig {
  /** Default TTL in seconds */
  defaultTTL: number;
  /** Enable classification-based TTL */
  classificationBasedTTL: boolean;
  /** Enable tenant isolation */
  tenantIsolation: boolean;
  /** Cache key prefix */
  keyPrefix: string;
  /** Pub/Sub channel for invalidation */
  invalidationChannel: string;
  /** Enable distributed invalidation */
  distributedInvalidation: boolean;
}

export interface ICachedDecision {
  result: {
    allow: boolean;
    reason: string;
    obligations?: Array<{
      type: string;
      resourceId?: string;
    }>;
    evaluation_details?: Record<string, unknown>;
  };
  cachedAt: number;
  ttl: number;
  classification: string;
  tenant?: string;
  nodeId?: string;
}

export interface ICacheClusterStats {
  hits: number;
  misses: number;
  keys: number;
  hitRate: number;
  invalidations: number;
  failovers: number;
  redis: IRedisMetrics | null;
  redisHealth: IRedisClusterHealth | null;
}

export type CacheInvalidationReason = 
  | 'policy_update'
  | 'data_update'
  | 'user_logout'
  | 'tenant_config_change'
  | 'manual'
  | 'ttl_expired'
  | 'failover';

export interface ICacheInvalidationEvent {
  reason: CacheInvalidationReason;
  scope: 'all' | 'tenant' | 'user' | 'resource';
  target?: string;
  timestamp: string;
  nodeId: string;
  keysInvalidated?: number;
}

// ============================================
// CLASSIFICATION TTL CONFIGURATION
// ============================================

const CLASSIFICATION_TTL: Record<string, number> = {
  UNCLASSIFIED: 120,      // 2 minutes
  CONFIDENTIAL: 60,       // 1 minute
  SECRET: 30,             // 30 seconds
  TOP_SECRET: 15,         // 15 seconds
  NATO_UNCLASSIFIED: 120,
  NATO_RESTRICTED: 90,
  NATO_CONFIDENTIAL: 60,
  NATO_SECRET: 30,
  COSMIC_TOP_SECRET: 15,
};

const DEFAULT_CLASSIFICATION_TTL = 60;

// ============================================
// DECISION CACHE CLUSTER SERVICE
// ============================================

class DecisionCacheClusterService extends EventEmitter {
  private config: ICacheClusterConfig;
  private stats: {
    hits: number;
    misses: number;
    invalidations: number;
    failovers: number;
  };
  private nodeId: string;
  private initialized: boolean = false;
  private localFallbackCache: Map<string, { value: ICachedDecision; expiresAt: number }>;

  constructor(config: Partial<ICacheClusterConfig> = {}) {
    super();
    
    this.config = {
      defaultTTL: parseInt(process.env.DECISION_CACHE_TTL || '60', 10),
      classificationBasedTTL: process.env.DECISION_CACHE_CLASSIFICATION_TTL !== 'false',
      tenantIsolation: process.env.DECISION_CACHE_TENANT_ISOLATION !== 'false',
      keyPrefix: process.env.DECISION_CACHE_PREFIX || 'decision:',
      invalidationChannel: process.env.DECISION_CACHE_CHANNEL || 'cache:invalidation',
      distributedInvalidation: process.env.DECISION_CACHE_DISTRIBUTED !== 'false',
      ...config,
    };

    this.stats = {
      hits: 0,
      misses: 0,
      invalidations: 0,
      failovers: 0,
    };

    // Generate unique node ID
    this.nodeId = `node-${process.pid}-${Date.now().toString(36)}`;
    
    // Local fallback cache (used when Redis is unavailable)
    this.localFallbackCache = new Map();

    logger.info('Decision cache cluster service created', {
      nodeId: this.nodeId,
      distributedInvalidation: this.config.distributedInvalidation,
    });
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize Redis cluster
      await redisClusterService.initialize();

      // Subscribe to invalidation channel
      if (this.config.distributedInvalidation) {
        await this.subscribeToInvalidation();
      }

      // Set up failover handling
      this.setupFailoverHandling();

      this.initialized = true;
      logger.info('Decision cache cluster service initialized', {
        nodeId: this.nodeId,
      });
    } catch (error) {
      logger.error('Failed to initialize decision cache cluster', { error });
      // Fall back to local cache mode
      logger.warn('Falling back to local cache mode');
    }
  }

  /**
   * Subscribe to distributed invalidation events
   */
  private async subscribeToInvalidation(): Promise<void> {
    await redisClusterService.subscribe(
      this.config.invalidationChannel,
      (message) => {
        try {
          const event: ICacheInvalidationEvent = JSON.parse(message);
          
          // Ignore our own invalidation events
          if (event.nodeId === this.nodeId) {
            return;
          }

          logger.debug('Received distributed invalidation event', {
            event,
            receivedBy: this.nodeId,
          });

          // Handle the invalidation locally
          this.handleDistributedInvalidation(event);
        } catch (error) {
          logger.error('Failed to process invalidation event', { error, message });
        }
      }
    );

    logger.info('Subscribed to cache invalidation channel', {
      channel: this.config.invalidationChannel,
    });
  }

  /**
   * Handle distributed invalidation event
   */
  private handleDistributedInvalidation(event: ICacheInvalidationEvent): void {
    // Clear local fallback cache based on scope
    switch (event.scope) {
      case 'all':
        this.localFallbackCache.clear();
        break;
      case 'tenant':
        for (const key of this.localFallbackCache.keys()) {
          if (key.startsWith(`${event.target}:`)) {
            this.localFallbackCache.delete(key);
          }
        }
        break;
      case 'user':
        for (const key of this.localFallbackCache.keys()) {
          if (key.includes(event.target!)) {
            this.localFallbackCache.delete(key);
          }
        }
        break;
      case 'resource':
        this.localFallbackCache.delete(event.target!);
        break;
    }

    this.emit('distributed_invalidation', event);
  }

  /**
   * Set up failover event handling
   */
  private setupFailoverHandling(): void {
    redisClusterService.on('failover', (info) => {
      logger.warn('Redis failover detected', {
        info,
        nodeId: this.nodeId,
      });

      this.stats.failovers++;

      // Optionally clear local cache on failover
      this.localFallbackCache.clear();

      this.emit('failover', info);
    });

    redisClusterService.on('error', (error) => {
      logger.error('Redis cluster error', { error, nodeId: this.nodeId });
      this.emit('error', error);
    });
  }

  /**
   * Generate cache key
   */
  generateCacheKey(params: {
    uniqueID: string;
    resourceId: string;
    clearance?: string;
    countryOfAffiliation?: string;
    tenant?: string;
  }): string {
    const parts = [
      this.config.keyPrefix,
      params.uniqueID,
      params.resourceId,
      params.clearance || 'none',
      params.countryOfAffiliation || 'none',
    ];

    if (this.config.tenantIsolation && params.tenant) {
      parts.splice(1, 0, params.tenant);
    }

    return parts.join(':');
  }

  /**
   * Get TTL based on classification
   */
  getTTLForClassification(classification: string): number {
    if (!this.config.classificationBasedTTL) {
      return this.config.defaultTTL;
    }

    const upperClassification = (classification || '').toUpperCase().replace(/[\s-]/g, '_');
    return CLASSIFICATION_TTL[upperClassification] || DEFAULT_CLASSIFICATION_TTL;
  }

  /**
   * Get cached decision
   */
  async get(key: string): Promise<ICachedDecision | null> {
    try {
      // Try Redis first
      if (redisClusterService.isConnected()) {
        const cached = await redisClusterService.get<ICachedDecision>(key);
        
        if (cached) {
          this.stats.hits++;
          logger.debug('Decision cache hit (Redis)', {
            key,
            classification: cached.classification,
          });
          return cached;
        }
      }

      // Fall back to local cache
      const local = this.localFallbackCache.get(key);
      if (local && local.expiresAt > Date.now()) {
        this.stats.hits++;
        logger.debug('Decision cache hit (local fallback)', { key });
        return local.value;
      }

      this.stats.misses++;
      logger.debug('Decision cache miss', { key });
      return null;
    } catch (error) {
      logger.error('Cache get error', { key, error });
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Store decision in cache
   */
  async set(
    key: string,
    decision: ICachedDecision['result'],
    classification: string,
    tenant?: string
  ): Promise<boolean> {
    const ttl = this.getTTLForClassification(classification);
    
    const cachedDecision: ICachedDecision = {
      result: decision,
      cachedAt: Date.now(),
      ttl,
      classification,
      tenant,
      nodeId: this.nodeId,
    };

    try {
      // Store in Redis
      if (redisClusterService.isConnected()) {
        await redisClusterService.set(key, cachedDecision, ttl);
      }

      // Also store in local fallback cache
      this.localFallbackCache.set(key, {
        value: cachedDecision,
        expiresAt: Date.now() + (ttl * 1000),
      });

      logger.debug('Decision cached', {
        key,
        ttl,
        classification,
        tenant,
        nodeId: this.nodeId,
      });

      return true;
    } catch (error) {
      logger.error('Cache set error', { key, error });
      return false;
    }
  }

  /**
   * Invalidate and publish event
   */
  private async invalidateAndPublish(
    reason: CacheInvalidationReason,
    scope: ICacheInvalidationEvent['scope'],
    target?: string,
    keysInvalidated?: number
  ): Promise<void> {
    const event: ICacheInvalidationEvent = {
      reason,
      scope,
      target,
      timestamp: new Date().toISOString(),
      nodeId: this.nodeId,
      keysInvalidated,
    };

    // Publish to other nodes
    if (this.config.distributedInvalidation && redisClusterService.isConnected()) {
      try {
        await redisClusterService.publish(
          this.config.invalidationChannel,
          event
        );
        logger.debug('Published invalidation event', { event });
      } catch (error) {
        logger.error('Failed to publish invalidation event', { error, event });
      }
    }

    this.emit('invalidation', event);
  }

  /**
   * Invalidate specific cache entry
   */
  async invalidate(key: string, reason: CacheInvalidationReason = 'manual'): Promise<boolean> {
    try {
      let deleted = 0;

      // Delete from Redis
      if (redisClusterService.isConnected()) {
        deleted = await redisClusterService.del(key);
      }

      // Delete from local cache
      this.localFallbackCache.delete(key);

      if (deleted > 0) {
        this.stats.invalidations++;
        await this.invalidateAndPublish(reason, 'resource', key, deleted);
      }

      return deleted > 0;
    } catch (error) {
      logger.error('Cache invalidate error', { key, error });
      return false;
    }
  }

  /**
   * Invalidate all decisions for a user
   */
  async invalidateUser(uniqueID: string, reason: CacheInvalidationReason = 'user_logout'): Promise<number> {
    try {
      let invalidated = 0;

      // Delete from Redis by pattern
      if (redisClusterService.isConnected()) {
        invalidated = await redisClusterService.delByPattern(`*:${uniqueID}:*`);
      }

      // Delete from local cache
      for (const key of this.localFallbackCache.keys()) {
        if (key.includes(uniqueID)) {
          this.localFallbackCache.delete(key);
        }
      }

      if (invalidated > 0) {
        this.stats.invalidations += invalidated;
        await this.invalidateAndPublish(reason, 'user', uniqueID, invalidated);
      }

      logger.info('User cache entries invalidated', { uniqueID, count: invalidated, reason });
      return invalidated;
    } catch (error) {
      logger.error('Cache invalidateUser error', { uniqueID, error });
      return 0;
    }
  }

  /**
   * Invalidate all decisions for a tenant
   */
  async invalidateTenant(tenant: string, reason: CacheInvalidationReason = 'tenant_config_change'): Promise<number> {
    if (!this.config.tenantIsolation) {
      logger.warn('Tenant invalidation called but tenant isolation disabled');
      return 0;
    }

    try {
      let invalidated = 0;

      // Delete from Redis by pattern
      if (redisClusterService.isConnected()) {
        invalidated = await redisClusterService.delByPattern(`${this.config.keyPrefix}${tenant}:*`);
      }

      // Delete from local cache
      for (const key of this.localFallbackCache.keys()) {
        if (key.startsWith(`${this.config.keyPrefix}${tenant}:`)) {
          this.localFallbackCache.delete(key);
        }
      }

      if (invalidated > 0) {
        this.stats.invalidations += invalidated;
        await this.invalidateAndPublish(reason, 'tenant', tenant, invalidated);
      }

      logger.info('Tenant cache entries invalidated', { tenant, count: invalidated, reason });
      return invalidated;
    } catch (error) {
      logger.error('Cache invalidateTenant error', { tenant, error });
      return 0;
    }
  }

  /**
   * Invalidate all cached decisions
   */
  async invalidateAll(reason: CacheInvalidationReason = 'manual'): Promise<number> {
    try {
      let invalidated = 0;

      // Delete from Redis by pattern
      if (redisClusterService.isConnected()) {
        invalidated = await redisClusterService.delByPattern(`${this.config.keyPrefix}*`);
      }

      // Clear local cache
      const localCount = this.localFallbackCache.size;
      this.localFallbackCache.clear();
      invalidated = Math.max(invalidated, localCount);

      this.stats.invalidations += invalidated;
      await this.invalidateAndPublish(reason, 'all', undefined, invalidated);

      logger.info('All cache entries invalidated', { count: invalidated, reason });
      return invalidated;
    } catch (error) {
      logger.error('Cache invalidateAll error', { error });
      return 0;
    }
  }

  /**
   * Handle OPAL policy update
   */
  async onPolicyUpdate(): Promise<void> {
    logger.info('OPAL policy update received - invalidating all cached decisions');
    await this.invalidateAll('policy_update');
  }

  /**
   * Handle OPAL data update
   */
  async onDataUpdate(path?: string): Promise<void> {
    if (!path) {
      logger.info('OPAL data update received - invalidating all cached decisions');
      await this.invalidateAll('data_update');
      return;
    }

    logger.info('OPAL data update received for path', { path });
    // For now, invalidate all on any data update
    await this.invalidateAll('data_update');
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<ICacheClusterStats> {
    const totalHits = this.stats.hits + this.stats.misses;
    
    let redisMetrics: IRedisMetrics | null = null;
    let redisHealth: IRedisClusterHealth | null = null;

    if (redisClusterService.isInitialized()) {
      redisMetrics = redisClusterService.getMetrics();
      redisHealth = await redisClusterService.getHealth();
    }

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      keys: this.localFallbackCache.size,
      hitRate: totalHits > 0 ? this.stats.hits / totalHits : 0,
      invalidations: this.stats.invalidations,
      failovers: this.stats.failovers,
      redis: redisMetrics,
      redisHealth,
    };
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<ICacheClusterConfig> {
    return { ...this.config };
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if connected to Redis
   */
  isConnected(): boolean {
    return redisClusterService.isConnected();
  }

  /**
   * Get node ID
   */
  getNodeId(): string {
    return this.nodeId;
  }

  /**
   * Reset stats (for testing)
   */
  reset(): void {
    this.localFallbackCache.clear();
    this.stats = { hits: 0, misses: 0, invalidations: 0, failovers: 0 };
    logger.debug('Decision cache cluster reset');
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    await redisClusterService.close();
    this.localFallbackCache.clear();
    this.initialized = false;
    logger.info('Decision cache cluster closed');
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const decisionCacheClusterService = new DecisionCacheClusterService();

export default DecisionCacheClusterService;









