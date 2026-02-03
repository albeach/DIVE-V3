/**
 * Bookmarks System - Phase 3
 *
 * Features:
 * - Allow users to bookmark resources/policies
 * - Store in localStorage (per user)
 * - Max 20 bookmarks
 * - Add/remove/check operations
 */

const STORAGE_KEY = 'dive-bookmarks';
export const MAX_BOOKMARKS = 20;

export interface Bookmark {
  id: string;
  type: 'document' | 'policy';
  title: string;
  classification?: string;
  addedAt: number;
}

/**
 * Add a bookmark
 * @throws Error if max limit reached
 */
export function addBookmark(item: Omit<Bookmark, 'addedAt'>): void {
  if (typeof window === 'undefined') return;

  try {
    const bookmarks = getBookmarks();

    // Check limit
    if (bookmarks.length >= MAX_BOOKMARKS) {
      throw new Error(`Maximum ${MAX_BOOKMARKS} bookmarks allowed`);
    }

    // Check duplicate
    if (bookmarks.some((b) => b.id === item.id && b.type === item.type)) {
      // Already bookmarked, silently return
      return;
    }

    const newBookmark: Bookmark = { ...item, addedAt: Date.now() };
    const updated = [...bookmarks, newBookmark];

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    // Re-throw for user feedback
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to add bookmark');
  }
}

/**
 * Remove a bookmark
 */
export function removeBookmark(id: string, type: 'document' | 'policy'): void {
  if (typeof window === 'undefined') return;

  try {
    const bookmarks = getBookmarks();
    const updated = bookmarks.filter((b) => !(b.id === id && b.type === type));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to remove bookmark:', error);
  }
}

/**
 * Toggle bookmark (add if not present, remove if present)
 * @returns true if bookmarked after toggle, false if removed
 */
export function toggleBookmark(item: Omit<Bookmark, 'addedAt'>): boolean {
  if (isBookmarked(item.id, item.type)) {
    removeBookmark(item.id, item.type);
    return false;
  } else {
    try {
      addBookmark(item);
      return true;
    } catch (error) {
      // If max limit reached, still return false
      console.error('Failed to toggle bookmark:', error);
      throw error;
    }
  }
}

/**
 * Check if an item is bookmarked
 */
export function isBookmarked(id: string, type: 'document' | 'policy'): boolean {
  if (typeof window === 'undefined') return false;

  return getBookmarks().some((b) => b.id === id && b.type === type);
}

/**
 * Get all bookmarks, sorted by addedAt (newest first)
 */
export function getBookmarks(): Bookmark[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const items = JSON.parse(stored) as Bookmark[];

    // Validate structure
    if (!Array.isArray(items)) return [];

    // Sort by addedAt (newest first)
    return items.sort((a, b) => b.addedAt - a.addedAt);
  } catch (error) {
    console.error('Failed to get bookmarks:', error);
    return [];
  }
}

/**
 * Get bookmarks of a specific type
 */
export function getBookmarksByType(type: 'document' | 'policy'): Bookmark[] {
  return getBookmarks().filter((item) => item.type === type);
}

/**
 * Clear all bookmarks
 */
export function clearBookmarks(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear bookmarks:', error);
  }
}

/**
 * Get bookmark count
 */
export function getBookmarkCount(): number {
  return getBookmarks().length;
}

/**
 * Check if can add more bookmarks
 */
export function canAddBookmark(): boolean {
  return getBookmarkCount() < MAX_BOOKMARKS;
}
