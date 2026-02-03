/**
 * Hooks Index
 *
 * Centralized exports for all custom hooks.
 * Import from '@/hooks' for cleaner imports.
 */

// ============================================
// Phase 1: Performance Foundation
// ============================================

export {
  default as useInfiniteScroll,
  useDebouncedFilters,
  type ISearchFilters,
  type ISortOptions,
  type IFacets,
  type IFacetItem,
  type IPaginatedSearchResponse,
  type UseInfiniteScrollOptions,
  type UseInfiniteScrollReturn,
} from './useInfiniteScroll';

export {
  default as useAbortController,
  useAbortControllers,
  useDebouncedFetch,
  type UseAbortControllerOptions,
  type UseAbortControllerReturn,
  type UseDebouncedFetchOptions,
  type UseDebouncedFetchReturn,
} from './useAbortController';

export {
  default as useKeyboardNavigation,
  KeyboardShortcutsHelp,
  type KeyboardNavigationOptions,
  type KeyboardNavigationState,
  type KeyboardNavigationActions,
} from './useKeyboardNavigation';

// ============================================
// Phase 2: Search & Discovery Enhancement
// ============================================

export {
  default as useSearchHistory,
  type ISearchHistoryItem,
  type IPinnedSearch,
  type UseSearchHistoryOptions,
  type UseSearchHistoryReturn,
} from './useSearchHistory';

// ============================================
// Phase 3: Power User Features
// ============================================

export {
  default as useBookmarks,
  type UseBookmarksReturn,
} from './useBookmarks';
