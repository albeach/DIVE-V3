/**
 * DIVE V3 - Decision Cache Service
 * 
 * Provides caching for OPA authorization decisions with:
 * - Classification-based TTL (higher classification = shorter cache)
 * - OPAL-triggered cache invalidation
 * - Tenant-aware cache keys
 * - Circuit breaker state awareness
 * 
 * ACP-240 Compliance:
 * - Shorter TTLs for sensitive classifications ensure freshness
 * - Invalidation hooks support real-time policy updates via OPAL
 * - Audit logging of cache operations
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import NodeCache from 'node-cache';
import { logger } from '../utils/logger';
import { opalClient } from './opal-client';
import { EventEmitter } from 'events';

// ============================================
// TYPES
// ============================================

export interface ICacheConfig {
  /** Default TTL in seconds (used for UNCLASSIFIED) */
  defaultTTL: number;
  /** Check period for expired keys (seconds) */
  checkPeriod: number;
  /** Maximum keys in cache */
  maxKeys: number;
  /** Enable classification-based TTL */
  classificationBasedTTL: boolean;
  /** Enable tenant isolation */
  tenantIsolation: boolean;
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
  /** Timestamp when cached */
  cachedAt: number;
  /** TTL used for this entry (seconds) */
  ttl: number;
  /** Classification of resource */
  classification: string;
  /** Tenant this decision belongs to */
  tenant?: string;
}

export interface ICacheStats {
  hits: number;
  misses: number;
  keys: number;
  hitRate: number;
  averageTTL: number;
  oldestEntry: number | null;
  tenantBreakdown: Record<string, number>;
}

export type CacheInvalidationReason = 
  | 'policy_update'
  | 'data_update'
  | 'user_logout'
  | 'tenant_config_change'
  | 'manual'
  | 'ttl_expired';

export interface ICacheInvalidationEvent {
  reason: CacheInvalidationReason;
  scope: 'all' | 'tenant' | 'user' | 'resource';
  target?: string;
  timestamp: string;
  keysInvalidated: number;
}

// ============================================
// CLASSIFICATION TTL CONFIGURATION
// ============================================

/**
 * TTL by classification level (seconds)
 * ACP-240: Higher classifications require fresher decisions
 */
const CLASSIFICATION_TTL: Record<string, number> = {
  UNCLASSIFIED: 120,      // 2 minutes
  CONFIDENTIAL: 60,       // 1 minute
  SECRET: 30,             // 30 seconds
  TOP_SECRET: 15,         // 15 seconds
  // NATO equivalents
  NATO_UNCLASSIFIED: 120,
  NATO_RESTRICTED: 90,
  NATO_CONFIDENTIAL: 60,
  NATO_SECRET: 30,
  COSMIC_TOP_SECRET: 15,
};

const DEFAULT_CLASSIFICATION_TTL = 60; // 1 minute for unknown

// ============================================
// DECISION CACHE SERVICE
// ============================================

class DecisionCacheService extends EventEmitter {
  private cache: NodeCache;
  private config: ICacheConfig;
  private stats: {
    hits: number;
    misses: number;
    invalidations: number;
  };
  private opalSubscribed: boolean = false;

  constructor(config: Partial<ICacheConfig> = {}) {
    super();
    
    this.config = {
      defaultTTL: parseInt(process.env.DECISION_CACHE_TTL || '60', 10),
      checkPeriod: parseInt(process.env.DECISION_CACHE_CHECK_PERIOD || '120', 10),
      maxKeys: parseInt(process.env.DECISION_CACHE_MAX_KEYS || '10000', 10),
      classificationBasedTTL: process.env.DECISION_CACHE_CLASSIFICATION_TTL !== 'false',
      tenantIsolation: process.env.DECISION_CACHE_TENANT_ISOLATION !== 'false',
      ...config
    };

    this.cache = new NodeCache({
      stdTTL: this.config.defaultTTL,
      checkperiod: this.config.checkPeriod,
      maxKeys: this.config.maxKeys,
      useClones: false // Performance optimization
    });

    this.stats = {
      hits: 0,
      misses: 0,
      invalidations: 0
    };

    // Set up cache event handlers
    this.setupCacheEvents();

    logger.info('Decision cache service initialized', {
      defaultTTL: this.config.defaultTTL,
      maxKeys: this.config.maxKeys,
      classificationBasedTTL: this.config.classificationBasedTTL,
      tenantIsolation: this.config.tenantIsolation
    });
  }

  /**
   * Set up internal cache event handlers
   */
  private setupCacheEvents(): void {
    this.cache.on('expired', (key, value) => {
      logger.debug('Cache entry expired', { key });
      this.emit('entry_expired', { key, value });
    });

    this.cache.on('del', (key, value) => {
      logger.debug('Cache entry deleted', { key });
      this.emit('entry_deleted', { key, value });
    });

    this.cache.on('flush', () => {
      logger.info('Cache flushed');
      this.emit('cache_flushed', { timestamp: new Date().toISOString() });
    });
  }

  /**
   * Generate cache key from decision parameters
   */
  generateCacheKey(params: {
    uniqueID: string;
    resourceId: string;
    clearance?: string;
    countryOfAffiliation?: string;
    tenant?: string;
  }): string {
    const parts = [
      params.uniqueID,
      params.resourceId,
      params.clearance || 'none',
      params.countryOfAffiliation || 'none'
    ];

    if (this.config.tenantIsolation && params.tenant) {
      parts.unshift(params.tenant);
    }

    return parts.join(':');
  }

  /**
   * Get TTL based on resource classification
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
  get(key: string): ICachedDecision | undefined {
    const cached = this.cache.get<ICachedDecision>(key);
    
    if (cached) {
      this.stats.hits++;
      logger.debug('Decision cache hit', { 
        key, 
        cachedAt: new Date(cached.cachedAt).toISOString(),
        classification: cached.classification
      });
      return cached;
    }

    this.stats.misses++;
    logger.debug('Decision cache miss', { key });
    return undefined;
  }

  /**
   * Store decision in cache
   */
  set(
    key: string,
    decision: ICachedDecision['result'],
    classification: string,
    tenant?: string
  ): boolean {
    const ttl = this.getTTLForClassification(classification);
    
    const cachedDecision: ICachedDecision = {
      result: decision,
      cachedAt: Date.now(),
      ttl,
      classification,
      tenant
    };

    const success = this.cache.set(key, cachedDecision, ttl);
    
    logger.debug('Decision cached', {
      key,
      ttl,
      classification,
      tenant,
      allow: decision.allow
    });

    return success;
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(key: string, reason: CacheInvalidationReason = 'manual'): boolean {
    const deleted = this.cache.del(key);
    
    if (deleted > 0) {
      this.stats.invalidations++;
      logger.info('Cache entry invalidated', { key, reason });
      
      this.emit('invalidation', {
        reason,
        scope: 'resource' as const,
        target: key,
        timestamp: new Date().toISOString(),
        keysInvalidated: deleted
      } as ICacheInvalidationEvent);
    }

    return deleted > 0;
  }

  /**
   * Invalidate all decisions for a specific user
   */
  invalidateUser(uniqueID: string, reason: CacheInvalidationReason = 'user_logout'): number {
    const keys = this.cache.keys();
    let invalidated = 0;

    for (const key of keys) {
      if (key.includes(uniqueID)) {
        this.cache.del(key);
        invalidated++;
      }
    }

    if (invalidated > 0) {
      this.stats.invalidations += invalidated;
      logger.info('User cache entries invalidated', { uniqueID, count: invalidated, reason });
      
      this.emit('invalidation', {
        reason,
        scope: 'user' as const,
        target: uniqueID,
        timestamp: new Date().toISOString(),
        keysInvalidated: invalidated
      } as ICacheInvalidationEvent);
    }

    return invalidated;
  }

  /**
   * Invalidate all decisions for a specific tenant
   */
  invalidateTenant(tenant: string, reason: CacheInvalidationReason = 'tenant_config_change'): number {
    if (!this.config.tenantIsolation) {
      logger.warn('Tenant invalidation called but tenant isolation disabled');
      return 0;
    }

    const keys = this.cache.keys();
    let invalidated = 0;

    for (const key of keys) {
      if (key.startsWith(`${tenant}:`)) {
        this.cache.del(key);
        invalidated++;
      }
    }

    if (invalidated > 0) {
      this.stats.invalidations += invalidated;
      logger.info('Tenant cache entries invalidated', { tenant, count: invalidated, reason });
      
      this.emit('invalidation', {
        reason,
        scope: 'tenant' as const,
        target: tenant,
        timestamp: new Date().toISOString(),
        keysInvalidated: invalidated
      } as ICacheInvalidationEvent);
    }

    return invalidated;
  }

  /**
   * Invalidate all cached decisions
   */
  invalidateAll(reason: CacheInvalidationReason = 'manual'): number {
    const keyCount = this.cache.keys().length;
    this.cache.flushAll();
    
    this.stats.invalidations += keyCount;
    logger.info('All cache entries invalidated', { count: keyCount, reason });
    
    this.emit('invalidation', {
      reason,
      scope: 'all' as const,
      timestamp: new Date().toISOString(),
      keysInvalidated: keyCount
    } as ICacheInvalidationEvent);

    return keyCount;
  }

  /**
   * Subscribe to OPAL updates for cache invalidation
   */
  async subscribeToOPAL(): Promise<void> {
    if (this.opalSubscribed) {
      logger.debug('Already subscribed to OPAL updates');
      return;
    }

    if (!opalClient.isOPALEnabled()) {
      logger.info('OPAL not enabled - cache invalidation via OPAL disabled');
      return;
    }

    // Check OPAL health first
    const health = await opalClient.checkHealth();
    if (!health.healthy) {
      logger.warn('OPAL server not healthy - cache invalidation subscription deferred');
      return;
    }

    this.opalSubscribed = true;
    logger.info('Subscribed to OPAL updates for cache invalidation');

    // Note: In a production setup, you would use OPAL's WebSocket
    // subscription mechanism. For now, we provide hooks that can be
    // called by external systems (e.g., OPAL webhooks).
  }

  /**
   * Handle OPAL policy update notification
   * Called by webhook or polling mechanism
   */
  onPolicyUpdate(): void {
    logger.info('OPAL policy update received - invalidating all cached decisions');
    this.invalidateAll('policy_update');
  }

  /**
   * Handle OPAL data update notification
   * Called by webhook or polling mechanism
   */
  onDataUpdate(path?: string): void {
    if (!path) {
      logger.info('OPAL data update received - invalidating all cached decisions');
      this.invalidateAll('data_update');
      return;
    }

    // Path-specific invalidation
    // e.g., if path is "trusted_issuers", invalidate federation-related caches
    logger.info('OPAL data update received for path', { path });
    
    // For now, invalidate all on any data update
    // Future: Implement more granular invalidation based on path
    this.invalidateAll('data_update');
  }

  /**
   * Get cache statistics
   */
  getStats(): ICacheStats {
    const keys = this.cache.keys();
    const totalHits = this.stats.hits + this.stats.misses;
    
    // Calculate tenant breakdown if isolation is enabled
    const tenantBreakdown: Record<string, number> = {};
    let oldestEntry: number | null = null;
    let totalTTL = 0;

    for (const key of keys) {
      const cached = this.cache.get<ICachedDecision>(key);
      if (cached) {
        // Track tenant breakdown
        const tenant = cached.tenant || 'default';
        tenantBreakdown[tenant] = (tenantBreakdown[tenant] || 0) + 1;
        
        // Track oldest entry
        if (oldestEntry === null || cached.cachedAt < oldestEntry) {
          oldestEntry = cached.cachedAt;
        }
        
        // Track TTL for average
        totalTTL += cached.ttl;
      }
    }

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      keys: keys.length,
      hitRate: totalHits > 0 ? this.stats.hits / totalHits : 0,
      averageTTL: keys.length > 0 ? totalTTL / keys.length : 0,
      oldestEntry,
      tenantBreakdown
    };
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<ICacheConfig> {
    return { ...this.config };
  }

  /**
   * Clear cache and reset stats (for testing)
   */
  reset(): void {
    this.cache.flushAll();
    this.stats = { hits: 0, misses: 0, invalidations: 0 };
    logger.debug('Decision cache reset');
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const decisionCacheService = new DecisionCacheService();

export default DecisionCacheService;

