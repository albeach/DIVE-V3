"use client";

/**
 * DIVE V3 - Policy Context
 * 
 * Provides React context for policy decisions, enabling:
 * - Declarative authorization in UI components
 * - Caching of policy decisions
 * - Real-time decision updates via session changes
 * - Integration with NextAuth session
 * 
 * Phase 5: DIVE-V3 Enforcement Harmonization
 * 
 * Usage:
 * ```tsx
 * // In a component
 * const { checkAccess, isLoading } = usePolicyContext();
 * const canView = await checkAccess({ resourceId: 'doc-123', action: 'view' });
 * 
 * // Or use PolicyGate component
 * <PolicyGate resourceId="doc-123" action="view">
 *   <SecretContent />
 * </PolicyGate>
 * ```
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import React, { createContext, useContext, useCallback, useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';

// ============================================
// TYPES
// ============================================

export interface IPolicySubject {
  uniqueID: string;
  clearance?: string;
  countryOfAffiliation?: string;
  acpCOI?: string[];
  tenant?: string;
}

export interface IPolicyResource {
  resourceId: string;
  classification?: string;
  releasabilityTo?: string[];
  COI?: string[];
}

export interface IPolicyDecision {
  allow: boolean;
  reason: string;
  obligations?: Array<{
    type: string;
    resourceId?: string;
  }>;
  evaluationDetails?: Record<string, unknown>;
  cached?: boolean;
  timestamp: number;
}

export interface IPolicyCheckParams {
  resourceId: string;
  action?: 'view' | 'edit' | 'delete' | 'upload';
  resource?: Partial<IPolicyResource>;
}

export interface IPolicyCacheEntry {
  decision: IPolicyDecision;
  expiresAt: number;
}

export interface IPolicyContextValue {
  /** Check if user can perform action on resource */
  checkAccess: (params: IPolicyCheckParams) => Promise<IPolicyDecision>;
  /** Preload decisions for multiple resources */
  preloadDecisions: (resourceIds: string[]) => Promise<void>;
  /** Invalidate cached decision */
  invalidateDecision: (resourceId: string) => void;
  /** Invalidate all cached decisions */
  invalidateAll: () => void;
  /** Current user's policy subject (from session) */
  subject: IPolicySubject | null;
  /** Whether policy system is ready */
  isReady: boolean;
  /** Whether a decision check is in progress */
  isLoading: boolean;
  /** Last error */
  error: Error | null;
  /** Cache statistics */
  cacheStats: {
    hits: number;
    misses: number;
    size: number;
  };
}

// ============================================
// CONFIGURATION
// ============================================

const CACHE_TTL_MS = 60000; // 1 minute default
const CACHE_TTL_BY_CLASSIFICATION: Record<string, number> = {
  UNCLASSIFIED: 120000,    // 2 minutes
  CONFIDENTIAL: 60000,     // 1 minute
  SECRET: 30000,           // 30 seconds
  TOP_SECRET: 15000,       // 15 seconds
};
const MAX_CACHE_SIZE = 100;

// ============================================
// CONTEXT
// ============================================

const PolicyContext = createContext<IPolicyContextValue | null>(null);

// ============================================
// PROVIDER COMPONENT
// ============================================

export interface PolicyProviderProps {
  children: React.ReactNode;
  /** Backend API base URL */
  apiBaseUrl?: string;
  /** Custom cache TTL in milliseconds */
  cacheTTL?: number;
  /** Enable classification-based TTL */
  classificationBasedTTL?: boolean;
}

export function PolicyProvider({
  children,
  apiBaseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001',
  cacheTTL = CACHE_TTL_MS,
  classificationBasedTTL = true,
}: PolicyProviderProps) {
  const { data: session, status } = useSession();
  const [cache, setCache] = useState<Map<string, IPolicyCacheEntry>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [cacheStats, setCacheStats] = useState({ hits: 0, misses: 0, size: 0 });

  // Extract subject from session
  const subject = useMemo((): IPolicySubject | null => {
    if (!session?.user) return null;
    
    const user = session.user as any;
    return {
      uniqueID: user.uniqueID || user.email || user.sub || '',
      clearance: user.clearance,
      countryOfAffiliation: user.countryOfAffiliation,
      acpCOI: user.acpCOI || [],
      tenant: user.tenant || user.countryOfAffiliation,
    };
  }, [session]);

  // Check if system is ready
  const isReady = status === 'authenticated' && subject !== null;

  // Generate cache key
  const generateCacheKey = useCallback((params: IPolicyCheckParams): string => {
    return `${subject?.uniqueID || 'anon'}:${params.resourceId}:${params.action || 'view'}`;
  }, [subject?.uniqueID]);

  // Get TTL for classification
  const getTTL = useCallback((classification?: string): number => {
    if (!classificationBasedTTL || !classification) {
      return cacheTTL;
    }
    const upper = classification.toUpperCase().replace(/[\s-]/g, '_');
    return CACHE_TTL_BY_CLASSIFICATION[upper] || cacheTTL;
  }, [cacheTTL, classificationBasedTTL]);

  // Clean expired cache entries
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setCache(prev => {
        const newCache = new Map(prev);
        let removed = 0;
        for (const [key, entry] of newCache) {
          if (entry.expiresAt < now) {
            newCache.delete(key);
            removed++;
          }
        }
        if (removed > 0) {
          setCacheStats(s => ({ ...s, size: newCache.size }));
        }
        return newCache;
      });
    }, 30000); // Clean every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Invalidate cache on session change
  useEffect(() => {
    if (status === 'authenticated') {
      // Clear cache when user changes
      setCache(new Map());
      setCacheStats({ hits: 0, misses: 0, size: 0 });
    }
  }, [session?.user?.email, status]);

  // Check access for a resource
  const checkAccess = useCallback(async (params: IPolicyCheckParams): Promise<IPolicyDecision> => {
    const cacheKey = generateCacheKey(params);
    const now = Date.now();

    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      setCacheStats(s => ({ ...s, hits: s.hits + 1 }));
      return { ...cached.decision, cached: true };
    }

    // Not in cache or expired
    setCacheStats(s => ({ ...s, misses: s.misses + 1 }));

    if (!isReady) {
      return {
        allow: false,
        reason: 'Not authenticated',
        timestamp: now,
      };
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get access token from session
      const accessToken = (session as any)?.accessToken;
      if (!accessToken) {
        throw new Error('No access token available');
      }

      // Call backend to check authorization
      // This triggers the full OPA evaluation
      const response = await fetch(
        `${apiBaseUrl}/api/resources/${params.resourceId}`,
        {
          method: 'HEAD', // Just check access, don't fetch content
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-Policy-Check-Only': 'true',
          },
        }
      );

      let decision: IPolicyDecision;

      if (response.ok) {
        // Access granted
        const classification = response.headers.get('X-Resource-Classification');
        decision = {
          allow: true,
          reason: 'Access granted',
          timestamp: now,
        };

        // Cache with classification-based TTL
        const ttl = getTTL(classification || undefined);
        const entry: IPolicyCacheEntry = {
          decision,
          expiresAt: now + ttl,
        };

        setCache(prev => {
          const newCache = new Map(prev);
          // Enforce max cache size
          if (newCache.size >= MAX_CACHE_SIZE) {
            // Remove oldest entry
            const firstKey = newCache.keys().next().value;
            if (firstKey) newCache.delete(firstKey);
          }
          newCache.set(cacheKey, entry);
          return newCache;
        });
        setCacheStats(s => ({ ...s, size: cache.size + 1 }));

      } else if (response.status === 403) {
        // Access denied
        const body = await response.json().catch(() => ({}));
        decision = {
          allow: false,
          reason: body.message || body.technical_reason || 'Access denied',
          evaluationDetails: body.details,
          timestamp: now,
        };

        // Cache deny decisions too (shorter TTL)
        const entry: IPolicyCacheEntry = {
          decision,
          expiresAt: now + Math.min(cacheTTL, 30000), // Max 30 seconds for denies
        };
        setCache(prev => new Map(prev).set(cacheKey, entry));
        setCacheStats(s => ({ ...s, size: cache.size + 1 }));

      } else if (response.status === 401) {
        // Not authenticated
        decision = {
          allow: false,
          reason: 'Authentication required',
          timestamp: now,
        };
      } else if (response.status === 404) {
        // Resource not found
        decision = {
          allow: false,
          reason: 'Resource not found',
          timestamp: now,
        };
      } else {
        throw new Error(`Unexpected response: ${response.status}`);
      }

      return decision;

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Policy check failed');
      setError(error);
      
      // Return deny on error (fail-secure)
      return {
        allow: false,
        reason: `Policy check error: ${error.message}`,
        timestamp: now,
      };
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, cache, cacheTTL, generateCacheKey, getTTL, isReady, session]);

  // Preload decisions for multiple resources
  const preloadDecisions = useCallback(async (resourceIds: string[]): Promise<void> => {
    const checks = resourceIds.map(resourceId => checkAccess({ resourceId }));
    await Promise.allSettled(checks);
  }, [checkAccess]);

  // Invalidate specific decision
  const invalidateDecision = useCallback((resourceId: string): void => {
    const prefix = `${subject?.uniqueID || 'anon'}:${resourceId}:`;
    setCache(prev => {
      const newCache = new Map(prev);
      for (const key of newCache.keys()) {
        if (key.startsWith(prefix)) {
          newCache.delete(key);
        }
      }
      return newCache;
    });
    setCacheStats(s => ({ ...s, size: cache.size }));
  }, [subject?.uniqueID, cache.size]);

  // Invalidate all decisions
  const invalidateAll = useCallback((): void => {
    setCache(new Map());
    setCacheStats(s => ({ ...s, size: 0 }));
  }, []);

  // Context value
  const value = useMemo((): IPolicyContextValue => ({
    checkAccess,
    preloadDecisions,
    invalidateDecision,
    invalidateAll,
    subject,
    isReady,
    isLoading,
    error,
    cacheStats,
  }), [
    checkAccess,
    preloadDecisions,
    invalidateDecision,
    invalidateAll,
    subject,
    isReady,
    isLoading,
    error,
    cacheStats,
  ]);

  return (
    <PolicyContext.Provider value={value}>
      {children}
    </PolicyContext.Provider>
  );
}

// ============================================
// HOOKS
// ============================================

/**
 * Hook to access policy context
 */
export function usePolicyContext(): IPolicyContextValue {
  const context = useContext(PolicyContext);
  if (!context) {
    throw new Error('usePolicyContext must be used within a PolicyProvider');
  }
  return context;
}

/**
 * Hook to check policy decision for a specific resource
 * 
 * @example
 * ```tsx
 * const { canAccess, isLoading, reason } = usePolicyDecision('doc-123');
 * 
 * if (isLoading) return <Spinner />;
 * if (!canAccess) return <AccessDenied reason={reason} />;
 * return <ResourceContent />;
 * ```
 */
export function usePolicyDecision(
  resourceId: string,
  action: 'view' | 'edit' | 'delete' | 'upload' = 'view',
  options?: {
    enabled?: boolean;
    onSuccess?: (decision: IPolicyDecision) => void;
    onError?: (error: Error) => void;
  }
) {
  const { checkAccess, isReady } = usePolicyContext();
  const [decision, setDecision] = useState<IPolicyDecision | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const enabled = options?.enabled !== false;

  useEffect(() => {
    if (!enabled || !isReady || !resourceId) {
      return;
    }

    let cancelled = false;

    const check = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await checkAccess({ resourceId, action });
        if (!cancelled) {
          setDecision(result);
          options?.onSuccess?.(result);
        }
      } catch (err) {
        if (!cancelled) {
          const error = err instanceof Error ? err : new Error('Policy check failed');
          setError(error);
          options?.onError?.(error);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    check();

    return () => {
      cancelled = true;
    };
  }, [resourceId, action, enabled, isReady, checkAccess, options]);

  return {
    canAccess: decision?.allow ?? false,
    decision,
    isLoading,
    error,
    reason: decision?.reason,
    evaluationDetails: decision?.evaluationDetails,
    cached: decision?.cached ?? false,
    refetch: () => {
      if (isReady && resourceId) {
        checkAccess({ resourceId, action }).then(setDecision);
      }
    },
  };
}

export default PolicyProvider;
