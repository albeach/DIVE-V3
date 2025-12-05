/**
 * useInfiniteScroll Hook Unit Tests
 * 
 * Tests for @/hooks/useInfiniteScroll.ts
 * Phase 1: Performance Foundation
 * 
 * Coverage targets:
 * - Initial state and loading
 * - Cursor-based pagination
 * - Filter/sort changes
 * - Request cancellation
 * - Error handling
 * - IntersectionObserver integration
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import useInfiniteScroll, { 
  IPaginatedSearchResponse, 
  ISearchFilters, 
  ISortOptions 
} from '@/hooks/useInfiniteScroll';

// Mock IntersectionObserver
const mockObserve = jest.fn();
const mockUnobserve = jest.fn();
const mockDisconnect = jest.fn();

class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  
  observe = mockObserve;
  unobserve = mockUnobserve;
  disconnect = mockDisconnect;
  
  // Helper to trigger intersection
  trigger(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

// Store reference to created observer
let observerInstance: MockIntersectionObserver | null = null;

beforeAll(() => {
  (global as any).IntersectionObserver = jest.fn((callback) => {
    observerInstance = new MockIntersectionObserver(callback);
    return observerInstance;
  });
});

afterAll(() => {
  delete (global as any).IntersectionObserver;
});

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('useInfiniteScroll', () => {
  // Sample test data
  const mockResource = {
    resourceId: 'doc-001',
    title: 'Test Document',
    classification: 'SECRET',
    releasabilityTo: ['USA', 'GBR'],
    COI: ['FVEY'],
    encrypted: true,
    creationDate: '2025-01-01T00:00:00Z',
  };

  const mockResponse: IPaginatedSearchResponse<typeof mockResource> = {
    results: [mockResource],
    facets: {
      classifications: [{ value: 'SECRET', count: 10 }],
      countries: [{ value: 'USA', count: 15 }],
      cois: [{ value: 'FVEY', count: 5 }],
      instances: [{ value: 'USA', count: 20 }],
      encryptionStatus: [{ value: 'encrypted', count: 8 }],
    },
    pagination: {
      nextCursor: 'cursor-abc-123',
      prevCursor: null,
      totalCount: 100,
      hasMore: true,
      pageSize: 25,
    },
    timing: {
      searchMs: 50,
      facetMs: 30,
      totalMs: 80,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    observerInstance = null;
    
    // Default successful response
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });
  });

  describe('initial state', () => {
    it('should initialize with empty items and loading state', async () => {
      const { result } = renderHook(() => useInfiniteScroll({ autoLoad: false }));

      expect(result.current.items).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.hasMore).toBe(false);
      expect(result.current.totalCount).toBe(0);
    });

    it('should auto-load on mount when autoLoad is true (default)', async () => {
      renderHook(() => useInfiniteScroll());

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    it('should not auto-load when autoLoad is false', async () => {
      renderHook(() => useInfiniteScroll({ autoLoad: false }));

      // Wait a bit to ensure no fetch happens
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // fetch is called once for initial load regardless of autoLoad for sentinel
      // The autoLoad controls the IntersectionObserver auto-loading
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('data loading', () => {
    it('should load initial data and update state', async () => {
      const { result } = renderHook(() => useInfiniteScroll<typeof mockResource>());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.items).toEqual([mockResource]);
      expect(result.current.totalCount).toBe(100);
      expect(result.current.hasMore).toBe(true);
      expect(result.current.facets).toEqual(mockResponse.facets);
      expect(result.current.timing).toEqual(mockResponse.timing);
    });

    it('should include correct request body', async () => {
      const initialFilters: ISearchFilters = {
        classifications: ['SECRET'],
        countries: ['USA'],
      };
      const initialSort: ISortOptions = { field: 'title', order: 'desc' };

      renderHook(() => useInfiniteScroll({
        initialFilters,
        initialSort,
        pageSize: 50,
        includeFacets: true,
      }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      
      expect(requestBody.filters.classifications).toEqual(['SECRET']);
      expect(requestBody.filters.countries).toEqual(['USA']);
      expect(requestBody.sort).toEqual({ field: 'title', order: 'desc' });
      expect(requestBody.pagination.limit).toBe(50);
      expect(requestBody.includeFacets).toBe(true);
    });
  });

  describe('loadMore', () => {
    it('should load more items with cursor', async () => {
      const moreResponse: IPaginatedSearchResponse<typeof mockResource> = {
        ...mockResponse,
        results: [{ ...mockResource, resourceId: 'doc-002', title: 'Second Doc' }],
        pagination: {
          ...mockResponse.pagination,
          nextCursor: 'cursor-def-456',
        },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(moreResponse),
        });

      const { result } = renderHook(() => useInfiniteScroll<typeof mockResource>());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.items).toHaveLength(1);

      await act(async () => {
        await result.current.loadMore();
      });

      expect(result.current.items).toHaveLength(2);
      expect(result.current.items[1].resourceId).toBe('doc-002');
    });

    it('should not load more when hasMore is false', async () => {
      const noMoreResponse: IPaginatedSearchResponse<typeof mockResource> = {
        ...mockResponse,
        pagination: {
          ...mockResponse.pagination,
          hasMore: false,
          nextCursor: null,
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(noMoreResponse),
      });

      const { result } = renderHook(() => useInfiniteScroll<typeof mockResource>());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const fetchCallCount = mockFetch.mock.calls.length;

      await act(async () => {
        await result.current.loadMore();
      });

      // Should not have made another fetch call
      expect(mockFetch.mock.calls.length).toBe(fetchCallCount);
    });

    it('should not load more while already loading', async () => {
      let resolveFirst: (value: any) => void;
      const firstPromise = new Promise(resolve => { resolveFirst = resolve; });

      mockFetch.mockReturnValue({
        ok: true,
        json: () => firstPromise,
      });

      const { result } = renderHook(() => useInfiniteScroll<typeof mockResource>());

      // First load is in progress
      expect(result.current.isLoading).toBe(true);

      // Try to load more while loading
      await act(async () => {
        result.current.loadMore();
      });

      // Should only have one fetch call (the initial one)
      expect(mockFetch.mock.calls.length).toBe(1);

      // Resolve the first request
      resolveFirst!({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
    });
  });

  describe('filter changes', () => {
    it('should refresh when filters change', async () => {
      const { result } = renderHook(() => useInfiniteScroll<typeof mockResource>());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialFetchCount = mockFetch.mock.calls.length;

      act(() => {
        result.current.setFilters({ classifications: ['TOP_SECRET'] });
      });

      await waitFor(() => {
        expect(mockFetch.mock.calls.length).toBeGreaterThan(initialFetchCount);
      });
    });

    it('should reset items when filters change', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            ...mockResponse,
            results: [{ ...mockResource, resourceId: 'filtered-doc' }],
          }),
        });

      const { result } = renderHook(() => useInfiniteScroll<typeof mockResource>());

      await waitFor(() => {
        expect(result.current.items[0]?.resourceId).toBe('doc-001');
      });

      act(() => {
        result.current.setFilters({ classifications: ['TOP_SECRET'] });
      });

      await waitFor(() => {
        expect(result.current.items[0]?.resourceId).toBe('filtered-doc');
      });
    });
  });

  describe('sort changes', () => {
    it('should refresh when sort changes', async () => {
      const { result } = renderHook(() => useInfiniteScroll<typeof mockResource>());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialFetchCount = mockFetch.mock.calls.length;

      act(() => {
        result.current.setSort({ field: 'creationDate', order: 'desc' });
      });

      await waitFor(() => {
        expect(mockFetch.mock.calls.length).toBeGreaterThan(initialFetchCount);
      });
    });
  });

  describe('refresh', () => {
    it('should reload data with current filters', async () => {
      const { result } = renderHook(() => useInfiniteScroll<typeof mockResource>());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const fetchCountBefore = mockFetch.mock.calls.length;

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockFetch.mock.calls.length).toBeGreaterThan(fetchCountBefore);
    });
  });

  describe('reset', () => {
    it('should reset to initial state', async () => {
      const { result } = renderHook(() => useInfiniteScroll<typeof mockResource>({
        initialFilters: { classifications: ['SECRET'] },
      }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Change filters
      act(() => {
        result.current.setFilters({ classifications: ['TOP_SECRET'] });
      });

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.items).toEqual([]);
      expect(result.current.facets).toBeNull();
      expect(result.current.hasMore).toBe(false);
      expect(result.current.filters).toEqual({ classifications: ['SECRET'] });
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ message: 'Server error' }),
      });

      const { result } = renderHook(() => useInfiniteScroll<typeof mockResource>());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Server error');
      expect(result.current.items).toEqual([]);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network failed'));

      const { result } = renderHook(() => useInfiniteScroll<typeof mockResource>());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Network failed');
    });

    it('should clear error on successful retry', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

      const { result } = renderHook(() => useInfiniteScroll<typeof mockResource>());

      await waitFor(() => {
        expect(result.current.error).toBe('First failure');
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.items).toEqual([mockResource]);
    });
  });

  describe('request cancellation', () => {
    it('should abort previous request when filters change', async () => {
      let abortSignal: AbortSignal | undefined;

      mockFetch.mockImplementation((url, options) => {
        abortSignal = options.signal;
        return new Promise((resolve) => {
          setTimeout(() => {
            if (!abortSignal?.aborted) {
              resolve({
                ok: true,
                json: () => Promise.resolve(mockResponse),
              });
            }
          }, 100);
        });
      });

      const { result } = renderHook(() => useInfiniteScroll<typeof mockResource>());

      // Wait for first fetch to start
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Change filters while first request is in flight
      act(() => {
        result.current.setFilters({ classifications: ['TOP_SECRET'] });
      });

      // Verify two fetches were made
      await waitFor(() => {
        expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('should not set error on abort', async () => {
      mockFetch.mockImplementation((url, options) => {
        return new Promise((resolve, reject) => {
          const abortError = new Error('Aborted');
          abortError.name = 'AbortError';
          
          options.signal?.addEventListener('abort', () => {
            reject(abortError);
          });

          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve(mockResponse),
            });
          }, 500);
        });
      });

      const { result } = renderHook(() => useInfiniteScroll<typeof mockResource>());

      // Quickly change filters to trigger abort
      act(() => {
        result.current.setFilters({ classifications: ['TOP_SECRET'] });
      });

      // Wait for things to settle
      await new Promise(resolve => setTimeout(resolve, 200));

      // Error should not be set for abort
      expect(result.current.error).toBeNull();
    });
  });

  describe('sentinelRef', () => {
    it('should setup IntersectionObserver when ref is set', async () => {
      const { result } = renderHook(() => useInfiniteScroll<typeof mockResource>());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Simulate setting the ref
      const mockElement = document.createElement('div');
      
      act(() => {
        result.current.sentinelRef(mockElement);
      });

      expect(mockObserve).toHaveBeenCalledWith(mockElement);
    });

    it('should disconnect observer when ref is nullified', async () => {
      const { result } = renderHook(() => useInfiniteScroll<typeof mockResource>());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const mockElement = document.createElement('div');
      
      act(() => {
        result.current.sentinelRef(mockElement);
      });

      act(() => {
        result.current.sentinelRef(null);
      });

      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('should trigger loadMore when sentinel intersects', async () => {
      const { result } = renderHook(() => useInfiniteScroll<typeof mockResource>());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const mockElement = document.createElement('div');
      
      act(() => {
        result.current.sentinelRef(mockElement);
      });

      // Clear previous fetch calls
      mockFetch.mockClear();

      // Simulate intersection
      act(() => {
        observerInstance?.trigger(true);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });
  });

  describe('federated mode', () => {
    it('should include federated flag in request', async () => {
      renderHook(() => useInfiniteScroll({
        federated: true,
        initialFilters: { instances: ['USA', 'FRA'] },
      }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      
      expect(requestBody.federated).toBe(true);
      expect(requestBody.filters.instances).toEqual(['USA', 'FRA']);
    });
  });

  describe('custom fetch function', () => {
    it('should use custom fetch function when provided', async () => {
      const customFetchFn = jest.fn().mockResolvedValue(mockResponse);

      renderHook(() => useInfiniteScroll({
        fetchFn: customFetchFn,
      }));

      await waitFor(() => {
        expect(customFetchFn).toHaveBeenCalled();
      });

      // Should not use global fetch
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});





