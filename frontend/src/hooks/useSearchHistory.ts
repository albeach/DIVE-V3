/**
 * useSearchHistory Hook
 *
 * Phase 2: Search & Discovery Enhancement
 * Persistent search history and pinned searches
 *
 * Features:
 * - Recent searches persisted to localStorage
 * - Pinned/favorite searches
 * - Search history management
 * - Deduplication and limits
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

// ============================================
// Types
// ============================================

export interface ISearchHistoryItem {
  query: string;
  timestamp: number;
  resultCount?: number;
  filters?: Record<string, unknown>;
}

export interface IPinnedSearch {
  id: string;
  query: string;
  label?: string;
  filters?: Record<string, unknown>;
  createdAt: number;
}

export interface UseSearchHistoryOptions {
  /** Maximum number of recent searches to store */
  maxRecentSearches?: number;
  /** Maximum number of pinned searches allowed */
  maxPinnedSearches?: number;
  /** Storage key prefix */
  storageKeyPrefix?: string;
  /** Whether to sync with server (optional) */
  syncWithServer?: boolean;
}

export interface UseSearchHistoryReturn {
  /** Recent search queries */
  recentSearches: ISearchHistoryItem[];
  /** Pinned/favorite searches */
  pinnedSearches: IPinnedSearch[];
  /** Add a search to history */
  addToHistory: (query: string, resultCount?: number, filters?: Record<string, unknown>) => void;
  /** Remove a specific search from history */
  removeFromHistory: (query: string) => void;
  /** Clear all recent searches */
  clearHistory: () => void;
  /** Pin a search query */
  pinSearch: (query: string, label?: string, filters?: Record<string, unknown>) => void;
  /** Unpin a search query */
  unpinSearch: (id: string) => void;
  /** Check if a query is pinned */
  isPinned: (query: string) => boolean;
  /** Toggle pin status for a query */
  togglePin: (query: string, label?: string, filters?: Record<string, unknown>) => void;
  /** Update a pinned search label */
  updatePinnedLabel: (id: string, label: string) => void;
  /** Get suggestions based on partial query */
  getSuggestions: (partialQuery: string) => string[];
  /** Export history (for backup) */
  exportHistory: () => string;
  /** Import history (from backup) */
  importHistory: (data: string) => boolean;
  /** Whether history is loaded from storage */
  isLoaded: boolean;
}

// ============================================
// Constants
// ============================================

const DEFAULT_MAX_RECENT = 20;
const DEFAULT_MAX_PINNED = 50;
const DEFAULT_STORAGE_PREFIX = 'dive_search';

const STORAGE_KEYS = {
  recent: 'recent_searches',
  pinned: 'pinned_searches',
};

// ============================================
// Utility Functions
// ============================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

// ============================================
// Hook Implementation
// ============================================

export function useSearchHistory({
  maxRecentSearches = DEFAULT_MAX_RECENT,
  maxPinnedSearches = DEFAULT_MAX_PINNED,
  storageKeyPrefix = DEFAULT_STORAGE_PREFIX,
  syncWithServer = false,
}: UseSearchHistoryOptions = {}): UseSearchHistoryReturn {
  // State
  const [recentSearches, setRecentSearches] = useState<ISearchHistoryItem[]>([]);
  const [pinnedSearches, setPinnedSearches] = useState<IPinnedSearch[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Storage keys
  const recentKey = `${storageKeyPrefix}_${STORAGE_KEYS.recent}`;
  const pinnedKey = `${storageKeyPrefix}_${STORAGE_KEYS.pinned}`;

  // ========================================
  // Load from Storage
  // ========================================

  useEffect(() => {
    try {
      // Load recent searches
      const storedRecent = localStorage.getItem(recentKey);
      if (storedRecent) {
        const parsed = JSON.parse(storedRecent);
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed.slice(0, maxRecentSearches));
        }
      }

      // Load pinned searches
      const storedPinned = localStorage.getItem(pinnedKey);
      if (storedPinned) {
        const parsed = JSON.parse(storedPinned);
        if (Array.isArray(parsed)) {
          setPinnedSearches(parsed.slice(0, maxPinnedSearches));
        }
      }

      setIsLoaded(true);
    } catch (error) {
      console.error('Failed to load search history from storage:', error);
      setIsLoaded(true);
    }
  }, [recentKey, pinnedKey, maxRecentSearches, maxPinnedSearches]);

  // ========================================
  // Save to Storage
  // ========================================

  useEffect(() => {
    if (!isLoaded) return;

    try {
      localStorage.setItem(recentKey, JSON.stringify(recentSearches));
    } catch (error) {
      console.error('Failed to save recent searches:', error);
    }
  }, [recentSearches, recentKey, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;

    try {
      localStorage.setItem(pinnedKey, JSON.stringify(pinnedSearches));
    } catch (error) {
      console.error('Failed to save pinned searches:', error);
    }
  }, [pinnedSearches, pinnedKey, isLoaded]);

  // ========================================
  // Add to History
  // ========================================

  const addToHistory = useCallback((
    query: string,
    resultCount?: number,
    filters?: Record<string, unknown>
  ) => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return;

    setRecentSearches(prev => {
      // Remove duplicate if exists
      const filtered = prev.filter(
        item => normalizeQuery(item.query) !== normalizeQuery(trimmed)
      );

      // Add to beginning
      const newItem: ISearchHistoryItem = {
        query: trimmed,
        timestamp: Date.now(),
        resultCount,
        filters,
      };

      return [newItem, ...filtered].slice(0, maxRecentSearches);
    });

    // Optional: sync with server
    if (syncWithServer) {
      trackSearchEvent(trimmed, resultCount, filters);
    }
  }, [maxRecentSearches, syncWithServer]);

  // ========================================
  // Remove from History
  // ========================================

  const removeFromHistory = useCallback((query: string) => {
    setRecentSearches(prev =>
      prev.filter(item => normalizeQuery(item.query) !== normalizeQuery(query))
    );
  }, []);

  // ========================================
  // Clear History
  // ========================================

  const clearHistory = useCallback(() => {
    setRecentSearches([]);
  }, []);

  // ========================================
  // Pin Search
  // ========================================

  const pinSearch = useCallback((
    query: string,
    label?: string,
    filters?: Record<string, unknown>
  ) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setPinnedSearches(prev => {
      // Check if already pinned
      const exists = prev.some(
        item => normalizeQuery(item.query) === normalizeQuery(trimmed)
      );
      if (exists) return prev;

      // Check limit
      if (prev.length >= maxPinnedSearches) {
        console.warn(`Maximum pinned searches (${maxPinnedSearches}) reached`);
        return prev;
      }

      const newPinned: IPinnedSearch = {
        id: generateId(),
        query: trimmed,
        label: label || trimmed,
        filters,
        createdAt: Date.now(),
      };

      return [newPinned, ...prev];
    });
  }, [maxPinnedSearches]);

  // ========================================
  // Unpin Search
  // ========================================

  const unpinSearch = useCallback((id: string) => {
    setPinnedSearches(prev => prev.filter(item => item.id !== id));
  }, []);

  // ========================================
  // Check if Pinned
  // ========================================

  const isPinned = useCallback((query: string): boolean => {
    return pinnedSearches.some(
      item => normalizeQuery(item.query) === normalizeQuery(query)
    );
  }, [pinnedSearches]);

  // ========================================
  // Toggle Pin
  // ========================================

  const togglePin = useCallback((
    query: string,
    label?: string,
    filters?: Record<string, unknown>
  ) => {
    const pinned = pinnedSearches.find(
      item => normalizeQuery(item.query) === normalizeQuery(query)
    );

    if (pinned) {
      unpinSearch(pinned.id);
    } else {
      pinSearch(query, label, filters);
    }
  }, [pinnedSearches, pinSearch, unpinSearch]);

  // ========================================
  // Update Pinned Label
  // ========================================

  const updatePinnedLabel = useCallback((id: string, label: string) => {
    setPinnedSearches(prev =>
      prev.map(item =>
        item.id === id ? { ...item, label: label.trim() || item.query } : item
      )
    );
  }, []);

  // ========================================
  // Get Suggestions
  // ========================================

  const getSuggestions = useCallback((partialQuery: string): string[] => {
    const query = normalizeQuery(partialQuery);
    if (query.length < 1) return [];

    const suggestions = new Set<string>();

    // Add from pinned first (higher priority)
    pinnedSearches.forEach(item => {
      if (normalizeQuery(item.query).includes(query)) {
        suggestions.add(item.query);
      }
    });

    // Add from recent
    recentSearches.forEach(item => {
      if (normalizeQuery(item.query).includes(query)) {
        suggestions.add(item.query);
      }
    });

    return Array.from(suggestions).slice(0, 10);
  }, [pinnedSearches, recentSearches]);

  // ========================================
  // Export History
  // ========================================

  const exportHistory = useCallback((): string => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      recent: recentSearches,
      pinned: pinnedSearches,
    };
    return JSON.stringify(data, null, 2);
  }, [recentSearches, pinnedSearches]);

  // ========================================
  // Import History
  // ========================================

  const importHistory = useCallback((data: string): boolean => {
    try {
      const parsed = JSON.parse(data);

      if (parsed.version !== 1) {
        console.warn('Unknown history version:', parsed.version);
      }

      if (Array.isArray(parsed.recent)) {
        setRecentSearches(parsed.recent.slice(0, maxRecentSearches));
      }

      if (Array.isArray(parsed.pinned)) {
        setPinnedSearches(parsed.pinned.slice(0, maxPinnedSearches));
      }

      return true;
    } catch (error) {
      console.error('Failed to import search history:', error);
      return false;
    }
  }, [maxRecentSearches, maxPinnedSearches]);

  // ========================================
  // Return Value
  // ========================================

  return {
    recentSearches,
    pinnedSearches,
    addToHistory,
    removeFromHistory,
    clearHistory,
    pinSearch,
    unpinSearch,
    isPinned,
    togglePin,
    updatePinnedLabel,
    getSuggestions,
    exportHistory,
    importHistory,
    isLoaded,
  };
}

// ============================================
// Analytics Tracking (Optional Server Sync)
// ============================================

async function trackSearchEvent(
  query: string,
  resultCount?: number,
  filters?: Record<string, unknown>
): Promise<void> {
  try {
    await fetch('/api/analytics/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'search',
        query,
        resultCount,
        filters,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (error) {
    // Silently fail analytics - don't disrupt user experience
    console.debug('Failed to track search event:', error);
  }
}

export default useSearchHistory;

