/**
 * useInfiniteScroll Hook
 *
 * Phase 1: Performance Foundation
 * Cursor-based infinite scroll for large datasets
 *
 * Features:
 * - Cursor-based pagination (more efficient than offset)
 * - Intersection Observer for auto-loading
 * - Request deduplication and cancellation
 * - Optimistic loading states
 * - Error recovery with retry
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ============================================
// Types
// ============================================

export interface ISearchFilters {
  query?: string;
  classifications?: string[];
  countries?: string[];
  cois?: string[];
  instances?: string[];
  encrypted?: boolean;
  dateRange?: { start: string; end: string };
  fileTypes?: string[];  // File type filter (documents, images, videos, audio, archives, code)
}

export interface ISortOptions {
  field: 'title' | 'classification' | 'creationDate' | 'resourceId';
  order: 'asc' | 'desc';
}

export interface IFacetItem {
  value: string;
  count: number;
  approximate?: boolean; // Whether count is estimated (for federated queries)
}

export interface IFacets {
  classifications: IFacetItem[];
  countries: IFacetItem[];
  cois: IFacetItem[];
  instances: IFacetItem[];
  encryptionStatus: IFacetItem[];
  fileTypes: IFacetItem[];  // File type facets (documents, images, videos, audio, archives, code)
}

export interface IPaginatedSearchResponse<T> {
  results: T[];
  facets?: IFacets;
  pagination: {
    nextCursor: string | null;
    prevCursor: string | null;
    totalCount: number;
    hasMore: boolean;
    pageSize: number;
  };
  timing: {
    searchMs: number;
    facetMs: number;
    totalMs: number;
  };
}

export interface UseInfiniteScrollOptions<T> {
  /** Initial filters */
  initialFilters?: ISearchFilters;
  /** Initial sort */
  initialSort?: ISortOptions;
  /** Page size */
  pageSize?: number;
  /** Whether to include facets in response */
  includeFacets?: boolean;
  /** Enable federated search across all instances */
  federated?: boolean;
  /** Fetch function to call */
  fetchFn?: (params: {
    filters: ISearchFilters;
    sort: ISortOptions;
    cursor?: string;
    limit: number;
    includeFacets: boolean;
    federated?: boolean;
    signal?: AbortSignal;
  }) => Promise<IPaginatedSearchResponse<T>>;
  /** Enable auto-loading on scroll */
  autoLoad?: boolean;
  /** Threshold for intersection observer (0-1) */
  threshold?: number;
  /** Root margin for intersection observer */
  rootMargin?: string;
  /** Whether the hook is enabled (use to wait for auth) - default true */
  enabled?: boolean;
}

export interface UseInfiniteScrollReturn<T> {
  /** All loaded items */
  items: T[];
  /** Current facets */
  facets: IFacets | null;
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Whether loading more items */
  isLoadingMore: boolean;
  /** Error message if any */
  error: string | null;
  /** Whether there are more items to load */
  hasMore: boolean;
  /** Total count of items matching filters */
  totalCount: number;
  /** Current filters */
  filters: ISearchFilters;
  /** Current sort */
  sort: ISortOptions;
  /** Load more items */
  loadMore: () => Promise<void>;
  /** Refresh with current filters */
  refresh: () => Promise<void>;
  /** Update filters (triggers refresh) */
  setFilters: (filters: ISearchFilters) => void;
  /** Update sort (triggers refresh) */
  setSort: (sort: ISortOptions) => void;
  /** Reset to initial state */
  reset: () => void;
  /** Ref to attach to sentinel element for auto-loading */
  sentinelRef: (node: HTMLElement | null) => void;
  /** Timing info from last request */
  timing: { searchMs: number; facetMs: number; totalMs: number } | null;
}

// ============================================
// Default Fetch Function
// ============================================

async function defaultFetchFn<T>(params: {
  filters: ISearchFilters;
  sort: ISortOptions;
  cursor?: string;
  limit: number;
  includeFacets: boolean;
  federated?: boolean;
  signal?: AbortSignal;
}): Promise<IPaginatedSearchResponse<T>> {
  // The /api/resources/search endpoint automatically handles federated search
  // when multiple instances are selected or a non-local instance is selected
  const response = await fetch('/api/resources/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Required for session cookies to be sent
    body: JSON.stringify({
      query: params.filters.query,
      filters: {
        classifications: params.filters.classifications,
        countries: params.filters.countries,
        cois: params.filters.cois,
        instances: params.filters.instances, // This triggers federated search in Next.js proxy
        encrypted: params.filters.encrypted,
        dateRange: params.filters.dateRange,
      },
      sort: params.sort,
      pagination: {
        cursor: params.cursor,
        limit: params.limit,
      },
      includeFacets: params.includeFacets,
      federated: params.federated,
    }),
    signal: params.signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Generate facets from federated search results
 * Used when federated-search endpoint doesn't provide facets
 * (Kept for potential future use but currently not needed)
 */
function generateFacetsFromResults(results: any[]): IFacets {
  const classificationCounts: Record<string, number> = {};
  const countryCounts: Record<string, number> = {};
  const coiCounts: Record<string, number> = {};
  const instanceCounts: Record<string, number> = {};
  const encryptionCounts: Record<string, number> = { encrypted: 0, unencrypted: 0 };

  for (const resource of results) {
    // Classification
    const classification = resource.classification || 'UNCLASSIFIED';
    classificationCounts[classification] = (classificationCounts[classification] || 0) + 1;

    // Countries (releasabilityTo)
    const countries = resource.releasabilityTo || [];
    for (const country of countries) {
      countryCounts[country] = (countryCounts[country] || 0) + 1;
    }

    // COI
    const cois = resource.COI || [];
    for (const coi of cois) {
      coiCounts[coi] = (coiCounts[coi] || 0) + 1;
    }

    // Instance
    const instance = resource.originRealm || 'UNKNOWN';
    instanceCounts[instance] = (instanceCounts[instance] || 0) + 1;

    // Encryption
    if (resource.encrypted) {
      encryptionCounts.encrypted++;
    } else {
      encryptionCounts.unencrypted++;
    }
  }

  return {
    classifications: Object.entries(classificationCounts).map(([value, count]) => ({ value, count })),
    countries: Object.entries(countryCounts).map(([value, count]) => ({ value, count })),
    cois: Object.entries(coiCounts).map(([value, count]) => ({ value, count })),
    instances: Object.entries(instanceCounts).map(([value, count]) => ({ value, count })),
    encryptionStatus: Object.entries(encryptionCounts).map(([value, count]) => ({ value, count })),
    fileTypes: [], // Empty for now - file type facets not yet implemented
  };
}

// ============================================
// Hook Implementation
// ============================================

export function useInfiniteScroll<T = any>({
  initialFilters = {},
  initialSort = { field: 'title', order: 'asc' },
  pageSize = 25,
  includeFacets = true,
  federated = false,
  fetchFn = defaultFetchFn,
  autoLoad = true,
  threshold = 0.1,
  rootMargin = '200px',
  enabled = true,
}: UseInfiniteScrollOptions<T> = {}): UseInfiniteScrollReturn<T> {
  // State
  const [items, setItems] = useState<T[]>([]);
  const [facets, setFacets] = useState<IFacets | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Always start as loading
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFiltersState] = useState<ISearchFilters>(initialFilters);
  const [sort, setSortState] = useState<ISortOptions>(initialSort);
  const [timing, setTiming] = useState<{ searchMs: number; facetMs: number; totalMs: number } | null>(null);

  // Track if we've successfully fetched data at least once
  const [hasFetched, setHasFetched] = useState(false);

  // Refs
  const cursorRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelNodeRef = useRef<HTMLElement | null>(null);
  const loadingRef = useRef(false);

  // ========================================
  // Fetch Data
  // ========================================

  const fetchData = useCallback(async (
    isInitial: boolean = false,
    currentFilters: ISearchFilters = filters,
    currentSort: ISortOptions = sort
  ) => {
    console.log('[useInfiniteScroll] fetchData called:', { isInitial, loadingRef: loadingRef.current });

    // Prevent concurrent requests; allow hard refresh (initial=true) to preempt
    if (loadingRef.current) {
      if (isInitial) {
        // Abort previous request to allow refresh - using reason prevents console noise
        abortControllerRef.current?.abort('Refresh requested');
        loadingRef.current = false;
        setIsLoading(false);
        setIsLoadingMore(false);
      } else {
        console.log('[useInfiniteScroll] Already loading, skipping');
        return;
      }
    }
    loadingRef.current = true;

    // Cancel previous request - using reason prevents "signal is aborted without reason" console noise
    abortControllerRef.current?.abort('New request started');
    abortControllerRef.current = new AbortController();

    if (isInitial) {
      setIsLoading(true);
      setItems([]);
      cursorRef.current = null;
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      console.log('[useInfiniteScroll] Fetching data...');
      const response = await fetchFn({
        filters: currentFilters,
        sort: currentSort,
        cursor: isInitial ? undefined : cursorRef.current || undefined,
        limit: pageSize,
        // Always include facets when requested, not just on initial load
        // This ensures facets update when filters change
        includeFacets: includeFacets && isInitial,
        federated,
        signal: abortControllerRef.current.signal,
      });

      console.log('[useInfiniteScroll] Fetch success:', {
        resultCount: response.results?.length,
        totalCount: response.pagination?.totalCount
      });

      // Update state
      if (isInitial) {
        setItems(response.results);
      } else {
        setItems(prev => [...prev, ...response.results]);
      }

      if (response.facets) {
        setFacets(response.facets);
      }

      setHasMore(response.pagination.hasMore);
      setTotalCount(response.pagination.totalCount);
      cursorRef.current = response.pagination.nextCursor;
      setTiming(response.timing);
      if (isInitial) {
        setHasFetched(true);
      }

    } catch (err) {
      // Check for abort first - this is expected behavior during cleanup/refresh
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, silently ignore
        return;
      }
      // Also check for string abort reasons (from AbortController.abort('reason'))
      if (typeof err === 'string' && (err.includes('unmounted') || err.includes('request'))) {
        return;
      }
      console.error('[useInfiniteScroll] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load resources');
    } finally {
      console.log('[useInfiniteScroll] Fetch complete, setting isLoading=false');
      setIsLoading(false);
      setIsLoadingMore(false);
      loadingRef.current = false;
    }
  }, [filters, sort, pageSize, includeFacets, federated, fetchFn]);

  // ========================================
  // Load More
  // ========================================

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || isLoading) return;
    await fetchData(false);
  }, [hasMore, isLoadingMore, isLoading, fetchData]);

  // ========================================
  // Refresh
  // ========================================

  const refresh = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  // ========================================
  // Set Filters
  // ========================================

  const setFilters = useCallback((newFilters: ISearchFilters) => {
    setFiltersState(newFilters);
    // If a request is already in-flight, restart with new filters immediately
    if (loadingRef.current) {
      fetchData(true, newFilters, sort);
    }
  }, [fetchData, sort]);

  // ========================================
  // Set Sort
  // ========================================

  const setSort = useCallback((newSort: ISortOptions) => {
    setSortState(newSort);
    // Will trigger useEffect to refresh
  }, []);

  // ========================================
  // Reset
  // ========================================

  const reset = useCallback(() => {
    setFiltersState(initialFilters);
    setSortState(initialSort);
    setItems([]);
    setFacets(null);
    setError(null);
    setHasMore(false);
    setTotalCount(0);
    setHasFetched(false);
    setIsLoading(true);
    cursorRef.current = null;
  }, [initialFilters, initialSort]);

  // ========================================
  // Intersection Observer for Auto-loading
  // ========================================

  const sentinelRef = useCallback((node: HTMLElement | null) => {
    sentinelNodeRef.current = node;

    // Cleanup previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (!node || !autoLoad) return;

    // Create new observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          loadMore();
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observerRef.current.observe(node);
  }, [autoLoad, hasMore, isLoadingMore, isLoading, loadMore, threshold, rootMargin]);

  // ========================================
  // Initial Load (only when enabled)
  // ========================================

  useEffect(() => {
    console.log('[useInfiniteScroll] Initial load effect:', { enabled, hasFetched });

    // Don't fetch until enabled (e.g., waiting for auth)
    if (!enabled) {
      console.log('[useInfiniteScroll] Not enabled, skipping fetch');
      return;
    }

    // Only fetch if we haven't fetched yet
    if (!hasFetched) {
      console.log('[useInfiniteScroll] Triggering initial fetch');
      setIsLoading(true);
      fetchData(true).then(() => {
        setHasFetched(true);
      });
    }
  }, [enabled, hasFetched]); // eslint-disable-line react-hooks/exhaustive-deps

  // ========================================
  // Refresh on Filter/Sort Change
  // ========================================

  useEffect(() => {
    // Only refresh if already fetched AND enabled
    if (hasFetched && enabled) {
      console.log('[useInfiniteScroll] Filters/sort changed, refreshing with facets');
      // Reset cursor when filters change to start fresh
      cursorRef.current = null;
      // Reset items to show loading state
      setItems([]);
      setIsLoading(true);
      // Fetch with facets included to update filter counts
      fetchData(true, filters, sort);
    }
  }, [filters, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  // ========================================
  // Cleanup
  // ========================================

  useEffect(() => {
    return () => {
      // Abort any in-flight requests on unmount - this is expected behavior
      // Using a reason prevents "signal is aborted without reason" console noise
      if (abortControllerRef.current) {
        abortControllerRef.current.abort('Component unmounted');
      }
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // ========================================
  // Return Value
  // ========================================

  return {
    items,
    facets,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    totalCount,
    filters,
    sort,
    loadMore,
    refresh,
    setFilters,
    setSort,
    reset,
    sentinelRef,
    timing,
  };
}

// ============================================
// Debounced Filter Hook
// ============================================

export function useDebouncedFilters(
  initialFilters: ISearchFilters = {},
  delay: number = 300
) {
  const [filters, setFilters] = useState<ISearchFilters>(initialFilters);
  const [debouncedFilters, setDebouncedFilters] = useState<ISearchFilters>(initialFilters);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setDebouncedFilters(filters);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [filters, delay]);

  return {
    filters,
    debouncedFilters,
    setFilters,
  };
}

export default useInfiniteScroll;
