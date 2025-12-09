/**
 * useBookmarks Hook - Phase 3
 * 
 * React hook for managing bookmarks with state synchronization.
 * Wraps the bookmarks library for reactive updates.
 * 
 * Features:
 * - Real-time state updates
 * - Cross-tab synchronization via storage events
 * - Optimistic UI updates
 * - Error handling with toast-ready messages
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bookmark,
  getBookmarks,
  addBookmark,
  removeBookmark,
  toggleBookmark,
  isBookmarked,
  getBookmarksByType,
  clearBookmarks,
  getBookmarkCount,
  canAddBookmark,
  MAX_BOOKMARKS,
} from '@/lib/bookmarks';

export interface UseBookmarksReturn {
  /** All bookmarks sorted by most recent */
  bookmarks: Bookmark[];
  /** Document bookmarks only */
  documentBookmarks: Bookmark[];
  /** Policy bookmarks only */
  policyBookmarks: Bookmark[];
  /** Total bookmark count */
  count: number;
  /** Maximum allowed bookmarks */
  maxBookmarks: number;
  /** Whether more bookmarks can be added */
  canAdd: boolean;
  /** Check if a specific item is bookmarked */
  isItemBookmarked: (id: string, type: 'document' | 'policy') => boolean;
  /** Add a bookmark */
  add: (item: Omit<Bookmark, 'addedAt'>) => { success: boolean; error?: string };
  /** Remove a bookmark */
  remove: (id: string, type: 'document' | 'policy') => void;
  /** Toggle a bookmark */
  toggle: (item: Omit<Bookmark, 'addedAt'>) => { isBookmarked: boolean; error?: string };
  /** Clear all bookmarks */
  clearAll: () => void;
  /** Refresh bookmarks from storage */
  refresh: () => void;
}

const STORAGE_KEY = 'dive-bookmarks';

export function useBookmarks(): UseBookmarksReturn {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  // Load bookmarks on mount and listen for storage changes
  useEffect(() => {
    // Initial load
    setBookmarks(getBookmarks());

    // Listen for storage changes (cross-tab sync)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setBookmarks(getBookmarks());
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Refresh function
  const refresh = useCallback(() => {
    setBookmarks(getBookmarks());
  }, []);

  // Check if item is bookmarked
  const isItemBookmarked = useCallback((id: string, type: 'document' | 'policy') => {
    return isBookmarked(id, type);
  }, []);

  // Add bookmark with error handling
  const add = useCallback((item: Omit<Bookmark, 'addedAt'>): { success: boolean; error?: string } => {
    try {
      addBookmark(item);
      setBookmarks(getBookmarks());
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add bookmark';
      return { success: false, error: message };
    }
  }, []);

  // Remove bookmark
  const remove = useCallback((id: string, type: 'document' | 'policy') => {
    removeBookmark(id, type);
    setBookmarks(getBookmarks());
  }, []);

  // Toggle bookmark with error handling
  const toggle = useCallback((item: Omit<Bookmark, 'addedAt'>): { isBookmarked: boolean; error?: string } => {
    try {
      const result = toggleBookmark(item);
      setBookmarks(getBookmarks());
      return { isBookmarked: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to toggle bookmark';
      return { isBookmarked: isBookmarked(item.id, item.type), error: message };
    }
  }, []);

  // Clear all bookmarks
  const clearAll = useCallback(() => {
    clearBookmarks();
    setBookmarks([]);
  }, []);

  // Memoized derived state
  const documentBookmarks = useMemo(
    () => bookmarks.filter(b => b.type === 'document'),
    [bookmarks]
  );

  const policyBookmarks = useMemo(
    () => bookmarks.filter(b => b.type === 'policy'),
    [bookmarks]
  );

  const count = bookmarks.length;
  const canAdd = count < 20; // MAX_BOOKMARKS from bookmarks.ts

  return {
    bookmarks,
    documentBookmarks,
    policyBookmarks,
    count,
    maxBookmarks: 20,
    canAdd,
    isItemBookmarked,
    add,
    remove,
    toggle,
    clearAll,
    refresh,
  };
}

export default useBookmarks;








