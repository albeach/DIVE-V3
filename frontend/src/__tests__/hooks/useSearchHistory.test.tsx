/**
 * useSearchHistory Hook Unit Tests
 * 
 * Tests for @/hooks/useSearchHistory.ts
 * Phase 2: Search & Discovery Enhancement
 * 
 * Coverage targets:
 * - Recent search management
 * - Pinned search management
 * - localStorage persistence
 * - Suggestions API
 * - Export/import functionality
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import useSearchHistory from '@/hooks/useSearchHistory';

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index: number) => Object.keys(store)[index] || null),
    _getStore: () => store,
    _setStore: (newStore: Record<string, string>) => {
      store = newStore;
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

describe('useSearchHistory', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('should initialize with empty arrays', () => {
      const { result } = renderHook(() => useSearchHistory());

      expect(result.current.recentSearches).toEqual([]);
      expect(result.current.pinnedSearches).toEqual([]);
    });

    it('should load from localStorage on mount', async () => {
      const storedRecent = [
        { query: 'fuel inventory', timestamp: Date.now() },
        { query: 'secret documents', timestamp: Date.now() - 1000 },
      ];
      const storedPinned = [
        { id: 'pin-1', query: 'important search', createdAt: Date.now() },
      ];

      mockLocalStorage._setStore({
        'dive_search_recent_searches': JSON.stringify(storedRecent),
        'dive_search_pinned_searches': JSON.stringify(storedPinned),
      });

      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(result.current.recentSearches).toEqual(storedRecent);
      expect(result.current.pinnedSearches).toEqual(storedPinned);
    });

    it('should handle corrupted localStorage gracefully', async () => {
      mockLocalStorage._setStore({
        'dive_search_recent_searches': 'not-valid-json',
      });

      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(result.current.recentSearches).toEqual([]);
    });
  });

  describe('addToHistory', () => {
    it('should add a search to history', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.addToHistory('test query');
      });

      expect(result.current.recentSearches).toHaveLength(1);
      expect(result.current.recentSearches[0].query).toBe('test query');
    });

    it('should add to the beginning of history', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.addToHistory('first query');
      });

      act(() => {
        result.current.addToHistory('second query');
      });

      expect(result.current.recentSearches[0].query).toBe('second query');
      expect(result.current.recentSearches[1].query).toBe('first query');
    });

    it('should deduplicate searches', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.addToHistory('same query');
      });

      act(() => {
        result.current.addToHistory('same query');
      });

      expect(result.current.recentSearches).toHaveLength(1);
    });

    it('should move duplicates to top', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.addToHistory('old query');
      });

      act(() => {
        result.current.addToHistory('new query');
      });

      act(() => {
        result.current.addToHistory('old query'); // Search again
      });

      expect(result.current.recentSearches[0].query).toBe('old query');
      expect(result.current.recentSearches).toHaveLength(2);
    });

    it('should respect max limit', async () => {
      const { result } = renderHook(() => useSearchHistory({
        maxRecentSearches: 3,
      }));

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      for (let i = 1; i <= 5; i++) {
        act(() => {
          result.current.addToHistory(`query ${i}`);
        });
      }

      expect(result.current.recentSearches).toHaveLength(3);
      expect(result.current.recentSearches[0].query).toBe('query 5');
      expect(result.current.recentSearches[2].query).toBe('query 3');
    });

    it('should not add empty or short queries', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.addToHistory('');
      });

      act(() => {
        result.current.addToHistory(' ');
      });

      act(() => {
        result.current.addToHistory('a');
      });

      expect(result.current.recentSearches).toHaveLength(0);
    });

    it('should include result count and filters', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.addToHistory('test', 42, { classification: 'SECRET' });
      });

      expect(result.current.recentSearches[0].resultCount).toBe(42);
      expect(result.current.recentSearches[0].filters).toEqual({ classification: 'SECRET' });
    });

    it('should persist to localStorage', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.addToHistory('persisted query');
      });

      // Wait for storage effect
      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'dive_search_recent_searches',
          expect.stringContaining('persisted query')
        );
      });
    });
  });

  describe('removeFromHistory', () => {
    it('should remove specific search from history', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.addToHistory('query one');
      });

      act(() => {
        result.current.addToHistory('query two');
      });

      expect(result.current.recentSearches).toHaveLength(2);

      act(() => {
        result.current.removeFromHistory('query one');
      });

      expect(result.current.recentSearches).toHaveLength(1);
      expect(result.current.recentSearches[0].query).toBe('query two');
    });

    it('should handle case-insensitive removal', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.addToHistory('Test Query');
      });

      act(() => {
        result.current.removeFromHistory('test query');
      });

      expect(result.current.recentSearches).toHaveLength(0);
    });
  });

  describe('clearHistory', () => {
    it('should clear all recent searches', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.addToHistory('query one');
        result.current.addToHistory('query two');
      });

      expect(result.current.recentSearches).toHaveLength(2);

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.recentSearches).toHaveLength(0);
    });

    it('should not affect pinned searches', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.addToHistory('recent query');
        result.current.pinSearch('pinned query');
      });

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.recentSearches).toHaveLength(0);
      expect(result.current.pinnedSearches).toHaveLength(1);
    });
  });

  describe('pinSearch', () => {
    it('should pin a search', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.pinSearch('important query');
      });

      expect(result.current.pinnedSearches).toHaveLength(1);
      expect(result.current.pinnedSearches[0].query).toBe('important query');
    });

    it('should pin with custom label', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.pinSearch('fuel inventory', 'Fuel Reports');
      });

      expect(result.current.pinnedSearches[0].label).toBe('Fuel Reports');
    });

    it('should not duplicate pins', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.pinSearch('important query');
      });

      act(() => {
        result.current.pinSearch('important query');
      });

      expect(result.current.pinnedSearches).toHaveLength(1);
    });

    it('should respect max pinned limit', async () => {
      const { result } = renderHook(() => useSearchHistory({
        maxPinnedSearches: 3,
      }));

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      for (let i = 1; i <= 5; i++) {
        act(() => {
          result.current.pinSearch(`pinned ${i}`);
        });
      }

      // Should only have first 3 (limit reached, new ones not added)
      expect(result.current.pinnedSearches).toHaveLength(3);
    });

    it('should persist to localStorage', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.pinSearch('persisted pin');
      });

      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'dive_search_pinned_searches',
          expect.stringContaining('persisted pin')
        );
      });
    });
  });

  describe('unpinSearch', () => {
    it('should unpin a search by id', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.pinSearch('query one');
        result.current.pinSearch('query two');
      });

      const pinId = result.current.pinnedSearches[0].id;

      act(() => {
        result.current.unpinSearch(pinId);
      });

      expect(result.current.pinnedSearches).toHaveLength(1);
      expect(result.current.pinnedSearches[0].query).toBe('query one');
    });
  });

  describe('isPinned', () => {
    it('should return true for pinned queries', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.pinSearch('pinned query');
      });

      expect(result.current.isPinned('pinned query')).toBe(true);
      expect(result.current.isPinned('not pinned')).toBe(false);
    });

    it('should be case-insensitive', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.pinSearch('Pinned Query');
      });

      expect(result.current.isPinned('pinned query')).toBe(true);
    });
  });

  describe('togglePin', () => {
    it('should pin unpinned queries', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.togglePin('toggle query');
      });

      expect(result.current.isPinned('toggle query')).toBe(true);
    });

    it('should unpin pinned queries', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.pinSearch('toggle query');
      });

      act(() => {
        result.current.togglePin('toggle query');
      });

      expect(result.current.isPinned('toggle query')).toBe(false);
    });
  });

  describe('updatePinnedLabel', () => {
    it('should update the label of a pinned search', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.pinSearch('query', 'Old Label');
      });

      const pinId = result.current.pinnedSearches[0].id;

      act(() => {
        result.current.updatePinnedLabel(pinId, 'New Label');
      });

      expect(result.current.pinnedSearches[0].label).toBe('New Label');
    });
  });

  describe('getSuggestions', () => {
    it('should return matching queries', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.addToHistory('fuel inventory report');
        result.current.addToHistory('fuel consumption');
        result.current.addToHistory('personnel records');
      });

      const suggestions = result.current.getSuggestions('fuel');

      expect(suggestions).toContain('fuel inventory report');
      expect(suggestions).toContain('fuel consumption');
      expect(suggestions).not.toContain('personnel records');
    });

    it('should prioritize pinned searches', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.addToHistory('test recent');
        result.current.pinSearch('test pinned');
      });

      const suggestions = result.current.getSuggestions('test');

      // Pinned should come first
      expect(suggestions[0]).toBe('test pinned');
    });

    it('should return empty for short queries', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.addToHistory('some query');
      });

      const suggestions = result.current.getSuggestions('');

      expect(suggestions).toEqual([]);
    });

    it('should limit results', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      for (let i = 1; i <= 15; i++) {
        act(() => {
          result.current.addToHistory(`test query ${i}`);
        });
      }

      const suggestions = result.current.getSuggestions('test');

      expect(suggestions.length).toBeLessThanOrEqual(10);
    });
  });

  describe('exportHistory', () => {
    it('should export history as JSON string', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.addToHistory('recent query');
        result.current.pinSearch('pinned query');
      });

      const exported = result.current.exportHistory();
      const parsed = JSON.parse(exported);

      expect(parsed.version).toBe(1);
      expect(parsed.exportedAt).toBeDefined();
      expect(parsed.recent).toHaveLength(1);
      expect(parsed.pinned).toHaveLength(1);
    });
  });

  describe('importHistory', () => {
    it('should import valid history data', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      const importData = JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        recent: [{ query: 'imported recent', timestamp: Date.now() }],
        pinned: [{ id: 'pin-1', query: 'imported pinned', createdAt: Date.now() }],
      });

      let success: boolean;
      act(() => {
        success = result.current.importHistory(importData);
      });

      expect(success!).toBe(true);
      expect(result.current.recentSearches).toHaveLength(1);
      expect(result.current.recentSearches[0].query).toBe('imported recent');
      expect(result.current.pinnedSearches).toHaveLength(1);
    });

    it('should return false for invalid JSON', async () => {
      const { result } = renderHook(() => useSearchHistory());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      let success: boolean;
      act(() => {
        success = result.current.importHistory('not valid json');
      });

      expect(success!).toBe(false);
    });

    it('should respect max limits on import', async () => {
      const { result } = renderHook(() => useSearchHistory({
        maxRecentSearches: 2,
        maxPinnedSearches: 2,
      }));

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      const importData = JSON.stringify({
        version: 1,
        recent: Array.from({ length: 10 }, (_, i) => ({
          query: `query ${i}`,
          timestamp: Date.now() - i * 1000,
        })),
        pinned: Array.from({ length: 10 }, (_, i) => ({
          id: `pin-${i}`,
          query: `pinned ${i}`,
          createdAt: Date.now() - i * 1000,
        })),
      });

      act(() => {
        result.current.importHistory(importData);
      });

      expect(result.current.recentSearches.length).toBeLessThanOrEqual(2);
      expect(result.current.pinnedSearches.length).toBeLessThanOrEqual(2);
    });
  });

  describe('custom storage prefix', () => {
    it('should use custom storage key prefix', async () => {
      const { result } = renderHook(() => useSearchHistory({
        storageKeyPrefix: 'custom_prefix',
      }));

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.addToHistory('custom key query');
      });

      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'custom_prefix_recent_searches',
          expect.any(String)
        );
      });
    });
  });
});








