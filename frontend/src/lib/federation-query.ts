/**
 * Federation Query Utilities
 *
 * Phase 1: Performance Foundation
 * Optimized federated search with batching and caching
 *
 * Features:
 * - Request batching across instances
 * - Response caching with TTL
 * - Parallel execution with timeout
 * - Circuit breaker pattern
 * - Retry with exponential backoff
 */

// ============================================
// Types
// ============================================

export interface IFederatedInstance {
  code: string;
  name: string;
  enabled: boolean;
  baseUrl?: string;
}

export interface IFederatedSearchOptions {
  query?: string;
  filters?: {
    classifications?: string[];
    countries?: string[];
    cois?: string[];
    encrypted?: boolean;
  };
  instances: string[];
  limit?: number;
  timeout?: number;
}

export interface IFederatedSearchResult {
  resourceId: string;
  title: string;
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  encrypted: boolean;
  creationDate?: string;
  originRealm: string;
  sourceInstance: string;
}

export interface IInstanceResult {
  instance: string;
  results: IFederatedSearchResult[];
  count: number;
  totalCount: number;
  latencyMs: number;
  error?: string;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
}

export interface IFederatedSearchResponse {
  results: IFederatedSearchResult[];
  totalResults: number;
  instanceResults: Record<string, IInstanceResult>;
  executionTimeMs: number;
  cacheHit: boolean;
}

// ============================================
// Constants
// ============================================

const DEFAULT_TIMEOUT = 5000; // 5 seconds
const CACHE_TTL = 60000; // 1 minute
const MAX_RETRIES = 2;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_RESET_TIME = 30000; // 30 seconds

// ============================================
// Cache Implementation
// ============================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class QueryCache<T> {
  private cache = new Map<string, CacheEntry<T>>();

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: T, ttl: number = CACHE_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  generateKey(options: IFederatedSearchOptions): string {
    return JSON.stringify({
      query: options.query,
      filters: options.filters,
      instances: [...options.instances].sort(),
      limit: options.limit,
    });
  }
}

// ============================================
// Circuit Breaker Implementation
// ============================================

interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure: number;
}

class CircuitBreaker {
  private states = new Map<string, CircuitBreakerState>();

  getState(instance: string): CircuitBreakerState['state'] {
    const state = this.states.get(instance);
    if (!state) return 'closed';

    // Check if should transition from open to half-open
    if (state.state === 'open' &&
        Date.now() - state.lastFailure > CIRCUIT_BREAKER_RESET_TIME) {
      state.state = 'half-open';
      this.states.set(instance, state);
    }

    return state.state;
  }

  recordSuccess(instance: string): void {
    this.states.set(instance, {
      state: 'closed',
      failures: 0,
      lastFailure: 0,
    });
  }

  recordFailure(instance: string): void {
    const current = this.states.get(instance) || {
      state: 'closed' as const,
      failures: 0,
      lastFailure: 0,
    };

    current.failures++;
    current.lastFailure = Date.now();

    if (current.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      current.state = 'open';
    }

    this.states.set(instance, current);
  }

  isOpen(instance: string): boolean {
    return this.getState(instance) === 'open';
  }
}

// ============================================
// Singleton Instances
// ============================================

const queryCache = new QueryCache<IFederatedSearchResponse>();
const circuitBreaker = new CircuitBreaker();

// ============================================
// Retry Utility
// ============================================

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        // Exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// ============================================
// Timeout Utility
// ============================================

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Request timeout'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

// ============================================
// Federation Query Service
// ============================================

export class FederationQueryService {
  private abortController: AbortController | null = null;

  /**
   * Execute federated search across multiple instances
   */
  async search(
    options: IFederatedSearchOptions,
    signal?: AbortSignal
  ): Promise<IFederatedSearchResponse> {
    const startTime = Date.now();

    // Check cache first
    const cacheKey = queryCache.generateKey(options);
    const cached = queryCache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        cacheHit: true,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Cancel previous request if any
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch (err) {
        console.debug('[FederationQuery] AbortController cleanup:', err);
      }
    }
    this.abortController = new AbortController();

    // Merge signals
    const mergedSignal = signal || this.abortController.signal;

    // Filter out instances with open circuit breakers
    const availableInstances = options.instances.filter(
      instance => !circuitBreaker.isOpen(instance)
    );

    // Execute parallel searches
    const instancePromises = availableInstances.map(instance =>
      this.searchInstance(instance, options, mergedSignal)
    );

    // Wait for all with timeout
    const instanceResults = await Promise.allSettled(
      instancePromises.map(p =>
        withTimeout(p, options.timeout || DEFAULT_TIMEOUT)
      )
    );

    // Process results
    const results: IFederatedSearchResult[] = [];
    const instanceResultsMap: Record<string, IInstanceResult> = {};
    let totalResults = 0;

    instanceResults.forEach((result, index) => {
      const instance = availableInstances[index];

      if (result.status === 'fulfilled') {
        const instanceResult = result.value;
        instanceResultsMap[instance] = instanceResult;
        results.push(...instanceResult.results);
        totalResults += instanceResult.totalCount;
        circuitBreaker.recordSuccess(instance);
      } else {
        circuitBreaker.recordFailure(instance);
        instanceResultsMap[instance] = {
          instance,
          results: [],
          count: 0,
          totalCount: 0,
          latencyMs: 0,
          error: result.reason?.message || 'Unknown error',
          circuitBreakerState: circuitBreaker.getState(instance),
        };
      }
    });

    // Add unavailable instances
    options.instances
      .filter(i => !availableInstances.includes(i))
      .forEach(instance => {
        instanceResultsMap[instance] = {
          instance,
          results: [],
          count: 0,
          totalCount: 0,
          latencyMs: 0,
          error: 'Circuit breaker open',
          circuitBreakerState: 'open',
        };
      });

    const response: IFederatedSearchResponse = {
      results: this.deduplicateAndSort(results, options.limit),
      totalResults,
      instanceResults: instanceResultsMap,
      executionTimeMs: Date.now() - startTime,
      cacheHit: false,
    };

    // Cache the response
    queryCache.set(cacheKey, response);

    return response;
  }

  /**
   * Search a single instance
   */
  private async searchInstance(
    instance: string,
    options: IFederatedSearchOptions,
    signal: AbortSignal
  ): Promise<IInstanceResult> {
    const startTime = Date.now();

    try {
      const response = await fetch('/api/resources/federated-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [instance],
          query: options.query,
          classification: options.filters?.classifications,
          coi: options.filters?.cois,
          limit: options.limit || 100,
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      return {
        instance,
        results: data.results || [],
        count: data.results?.length || 0,
        totalCount: data.totalResults || data.results?.length || 0,
        latencyMs,
        circuitBreakerState: circuitBreaker.getState(instance),
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        instance,
        results: [],
        count: 0,
        totalCount: 0,
        latencyMs,
        error: error instanceof Error ? error.message : 'Unknown error',
        circuitBreakerState: circuitBreaker.getState(instance),
      };
    }
  }

  /**
   * Deduplicate results and apply limit
   */
  private deduplicateAndSort(
    results: IFederatedSearchResult[],
    limit?: number
  ): IFederatedSearchResult[] {
    // Deduplicate by resourceId
    const seen = new Set<string>();
    const unique = results.filter(r => {
      if (seen.has(r.resourceId)) return false;
      seen.add(r.resourceId);
      return true;
    });

    // Sort by title
    unique.sort((a, b) => a.title.localeCompare(b.title));

    // Apply limit
    if (limit && limit > 0) {
      return unique.slice(0, limit);
    }

    return unique;
  }

  /**
   * Cancel ongoing request
   */
  cancel(): void {
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch (err) {
        console.debug('[FederationQuery] AbortController cleanup:', err);
      }
      this.abortController = null;
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    queryCache.invalidateAll();
  }

  /**
   * Get circuit breaker states
   */
  getCircuitBreakerStates(): Record<string, 'closed' | 'open' | 'half-open'> {
    const states: Record<string, 'closed' | 'open' | 'half-open'> = {};
    ['USA', 'FRA', 'GBR', 'DEU'].forEach(instance => {
      states[instance] = circuitBreaker.getState(instance);
    });
    return states;
  }
}

// ============================================
// Singleton Export
// ============================================

export const federationQueryService = new FederationQueryService();

export default federationQueryService;
