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
}

export interface ISortOptions {
  field: 'title' | 'classification' | 'creationDate' | 'resourceId';
  order: 'asc' | 'desc';
}

export interface IFacetItem {
  value: string;
  count: number;
}

export interface IFacets {
  classifications: IFacetItem[];
  countries: IFacetItem[];
  cois: IFacetItem[];
  instances: IFacetItem[];
  encryptionStatus: IFacetItem[];
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
        instances: params.filters.instances,
        encrypted: params.filters.encrypted,
        dateRange: params.filters.dateRange,
      },
      sort: params.sort,
      pagination: {
        cursor: params.cursor,
        limit: params.limit,
      },
      includeFacets: params.includeFacets,
      // Enable federated search across all selected instances
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
}: UseInfiniteScrollOptions<T> = {}): UseInfiniteScrollReturn<T> {
  // State
  const [items, setItems] = useState<T[]>([]);
  const [facets, setFacets] = useState<IFacets | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFiltersState] = useState<ISearchFilters>(initialFilters);
  const [sort, setSortState] = useState<ISortOptions>(initialSort);
  const [timing, setTiming] = useState<{ searchMs: number; facetMs: number; totalMs: number } | null>(null);

  // Refs
  const cursorRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelNodeRef = useRef<HTMLElement | null>(null);
  const loadingRef = useRef(false);
  const hasInitializedRef = useRef(false);

  // ========================================
  // Fetch Data
  // ========================================

  const fetchData = useCallback(async (
    isInitial: boolean = false,
    currentFilters: ISearchFilters = filters,
    currentSort: ISortOptions = sort
  ) => {
    // Prevent concurrent requests
    if (loadingRef.current) return;
    loadingRef.current = true;

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
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
      const response = await fetchFn({
        filters: currentFilters,
        sort: currentSort,
        cursor: isInitial ? undefined : cursorRef.current || undefined,
        limit: pageSize,
        includeFacets: isInitial && includeFacets,
        federated,
        signal: abortControllerRef.current.signal,
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

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, ignore
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load resources');
    } finally {
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
    // Will trigger useEffect to refresh
  }, []);

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
    cursorRef.current = null;
    hasInitializedRef.current = false;
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
  // Initial Load
  // ========================================

  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      fetchData(true);
    }
  }, [fetchData]);

  // ========================================
  // Refresh on Filter/Sort Change
  // ========================================

  useEffect(() => {
    if (hasInitializedRef.current) {
      fetchData(true, filters, sort);
    }
  }, [filters, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  // ========================================
  // Cleanup
  // ========================================

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
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


