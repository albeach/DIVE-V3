/**
 * Bookmarks Library Unit Tests
 * 
 * Tests for @/lib/bookmarks.ts
 * Phase 3: Power User Features
 * 
 * Coverage targets:
 * - addBookmark: Add, duplicate prevention, max limit
 * - removeBookmark: Remove by id and type
 * - toggleBookmark: Toggle state
 * - isBookmarked: Check bookmark status
 * - getBookmarks: Get all, sorted by newest first
 * - getBookmarksByType: Filter by type
 * - clearBookmarks: Clear all
 * - getBookmarkCount: Count bookmarks
 * - canAddBookmark: Check if can add more
 */

import {
  addBookmark,
  removeBookmark,
  toggleBookmark,
  isBookmarked,
  getBookmarks,
  getBookmarksByType,
  clearBookmarks,
  getBookmarkCount,
  canAddBookmark,
  MAX_BOOKMARKS,
  type Bookmark,
} from '@/lib/bookmarks';

const STORAGE_KEY = 'dive-bookmarks';

describe('bookmarks.ts', () => {
  // Mock localStorage
  let localStorageMock: { [key: string]: string } = {};

  beforeEach(() => {
    // Clear mock storage before each test
    localStorageMock = {};

    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn((key: string) => localStorageMock[key] || null),
        setItem: jest.fn((key: string, value: string) => {
          localStorageMock[key] = value;
        }),
        removeItem: jest.fn((key: string) => {
          delete localStorageMock[key];
        }),
        clear: jest.fn(() => {
          localStorageMock = {};
        }),
      },
      writable: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('MAX_BOOKMARKS', () => {
    it('should export MAX_BOOKMARKS constant as 20', () => {
      expect(MAX_BOOKMARKS).toBe(20);
    });
  });

  describe('addBookmark', () => {
    it('should add a new bookmark', () => {
      addBookmark({
        id: 'doc-001',
        type: 'document',
        title: 'Test Document',
        classification: 'SECRET',
      });

      const stored = JSON.parse(localStorageMock[STORAGE_KEY]);
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe('doc-001');
      expect(stored[0].type).toBe('document');
      expect(stored[0].title).toBe('Test Document');
      expect(stored[0].classification).toBe('SECRET');
      expect(stored[0].addedAt).toBeDefined();
    });

    it('should add multiple bookmarks', () => {
      addBookmark({ id: 'doc-001', type: 'document', title: 'Doc 1' });
      addBookmark({ id: 'doc-002', type: 'document', title: 'Doc 2' });
      addBookmark({ id: 'policy-001', type: 'policy', title: 'Policy 1' });

      const stored = JSON.parse(localStorageMock[STORAGE_KEY]);
      expect(stored).toHaveLength(3);
    });

    it('should silently ignore duplicate bookmarks (same id and type)', () => {
      addBookmark({ id: 'doc-001', type: 'document', title: 'Doc 1' });
      addBookmark({ id: 'doc-001', type: 'document', title: 'Doc 1 Updated' });

      const stored = JSON.parse(localStorageMock[STORAGE_KEY]);
      expect(stored).toHaveLength(1);
      expect(stored[0].title).toBe('Doc 1'); // Original title preserved
    });

    it('should allow same id with different type', () => {
      addBookmark({ id: 'item-001', type: 'document', title: 'Document' });
      addBookmark({ id: 'item-001', type: 'policy', title: 'Policy' });

      const stored = JSON.parse(localStorageMock[STORAGE_KEY]);
      expect(stored).toHaveLength(2);
    });

    it('should throw error when max bookmarks reached', () => {
      // Add MAX_BOOKMARKS bookmarks
      for (let i = 0; i < MAX_BOOKMARKS; i++) {
        addBookmark({ id: `doc-${i}`, type: 'document', title: `Doc ${i}` });
      }

      // Try to add one more
      expect(() => {
        addBookmark({ id: 'doc-extra', type: 'document', title: 'Extra Doc' });
      }).toThrow(`Maximum ${MAX_BOOKMARKS} bookmarks allowed`);
    });

    it('should add bookmark without classification', () => {
      addBookmark({ id: 'doc-001', type: 'document', title: 'Unclassified Doc' });

      const stored = JSON.parse(localStorageMock[STORAGE_KEY]);
      expect(stored[0].classification).toBeUndefined();
    });
  });

  describe('removeBookmark', () => {
    beforeEach(() => {
      // Pre-populate storage
      const bookmarks: Bookmark[] = [
        { id: 'doc-001', type: 'document', title: 'Doc 1', addedAt: 1000 },
        { id: 'doc-002', type: 'document', title: 'Doc 2', addedAt: 2000 },
        { id: 'policy-001', type: 'policy', title: 'Policy 1', addedAt: 3000 },
      ];
      localStorageMock[STORAGE_KEY] = JSON.stringify(bookmarks);
    });

    it('should remove a bookmark by id and type', () => {
      removeBookmark('doc-001', 'document');

      const stored = JSON.parse(localStorageMock[STORAGE_KEY]);
      expect(stored).toHaveLength(2);
      expect(stored.find((b: Bookmark) => b.id === 'doc-001')).toBeUndefined();
    });

    it('should not remove bookmark with same id but different type', () => {
      removeBookmark('doc-001', 'policy'); // doc-001 is type 'document'

      const stored = JSON.parse(localStorageMock[STORAGE_KEY]);
      expect(stored).toHaveLength(3);
      expect(stored.find((b: Bookmark) => b.id === 'doc-001')).toBeDefined();
    });

    it('should handle removing non-existent bookmark gracefully', () => {
      expect(() => {
        removeBookmark('nonexistent', 'document');
      }).not.toThrow();

      const stored = JSON.parse(localStorageMock[STORAGE_KEY]);
      expect(stored).toHaveLength(3); // Unchanged
    });
  });

  describe('toggleBookmark', () => {
    it('should add bookmark if not present and return true', () => {
      const result = toggleBookmark({
        id: 'doc-001',
        type: 'document',
        title: 'New Doc',
      });

      expect(result).toBe(true);
      expect(isBookmarked('doc-001', 'document')).toBe(true);
    });

    it('should remove bookmark if present and return false', () => {
      // First add
      addBookmark({ id: 'doc-001', type: 'document', title: 'Doc 1' });
      expect(isBookmarked('doc-001', 'document')).toBe(true);

      // Then toggle (remove)
      const result = toggleBookmark({
        id: 'doc-001',
        type: 'document',
        title: 'Doc 1',
      });

      expect(result).toBe(false);
      expect(isBookmarked('doc-001', 'document')).toBe(false);
    });

    it('should throw error when toggling on and max limit reached', () => {
      // Add MAX_BOOKMARKS bookmarks
      for (let i = 0; i < MAX_BOOKMARKS; i++) {
        addBookmark({ id: `doc-${i}`, type: 'document', title: `Doc ${i}` });
      }

      // Try to toggle on a new bookmark
      expect(() => {
        toggleBookmark({ id: 'doc-extra', type: 'document', title: 'Extra' });
      }).toThrow();
    });
  });

  describe('isBookmarked', () => {
    beforeEach(() => {
      addBookmark({ id: 'doc-001', type: 'document', title: 'Doc 1' });
      addBookmark({ id: 'policy-001', type: 'policy', title: 'Policy 1' });
    });

    it('should return true for bookmarked item', () => {
      expect(isBookmarked('doc-001', 'document')).toBe(true);
      expect(isBookmarked('policy-001', 'policy')).toBe(true);
    });

    it('should return false for non-bookmarked item', () => {
      expect(isBookmarked('doc-999', 'document')).toBe(false);
    });

    it('should return false for wrong type', () => {
      expect(isBookmarked('doc-001', 'policy')).toBe(false);
    });
  });

  describe('getBookmarks', () => {
    it('should return empty array when no bookmarks', () => {
      const result = getBookmarks();
      expect(result).toEqual([]);
    });

    it('should return bookmarks sorted by newest first', () => {
      const bookmarks: Bookmark[] = [
        { id: 'doc-001', type: 'document', title: 'Oldest', addedAt: 1000 },
        { id: 'doc-002', type: 'document', title: 'Middle', addedAt: 2000 },
        { id: 'doc-003', type: 'document', title: 'Newest', addedAt: 3000 },
      ];
      localStorageMock[STORAGE_KEY] = JSON.stringify(bookmarks);

      const result = getBookmarks();

      expect(result[0].title).toBe('Newest');
      expect(result[1].title).toBe('Middle');
      expect(result[2].title).toBe('Oldest');
    });

    it('should handle corrupted storage gracefully', () => {
      localStorageMock[STORAGE_KEY] = 'invalid json';

      const result = getBookmarks();
      expect(result).toEqual([]);
    });

    it('should handle non-array storage gracefully', () => {
      localStorageMock[STORAGE_KEY] = JSON.stringify({ not: 'an array' });

      const result = getBookmarks();
      expect(result).toEqual([]);
    });
  });

  describe('getBookmarksByType', () => {
    beforeEach(() => {
      const bookmarks: Bookmark[] = [
        { id: 'doc-001', type: 'document', title: 'Doc 1', addedAt: 1000 },
        { id: 'doc-002', type: 'document', title: 'Doc 2', addedAt: 2000 },
        { id: 'policy-001', type: 'policy', title: 'Policy 1', addedAt: 3000 },
        { id: 'policy-002', type: 'policy', title: 'Policy 2', addedAt: 4000 },
      ];
      localStorageMock[STORAGE_KEY] = JSON.stringify(bookmarks);
    });

    it('should return only document bookmarks', () => {
      const result = getBookmarksByType('document');

      expect(result).toHaveLength(2);
      expect(result.every((b) => b.type === 'document')).toBe(true);
    });

    it('should return only policy bookmarks', () => {
      const result = getBookmarksByType('policy');

      expect(result).toHaveLength(2);
      expect(result.every((b) => b.type === 'policy')).toBe(true);
    });

    it('should return empty array for type with no bookmarks', () => {
      clearBookmarks();
      addBookmark({ id: 'doc-001', type: 'document', title: 'Doc Only' });

      const result = getBookmarksByType('policy');
      expect(result).toEqual([]);
    });
  });

  describe('clearBookmarks', () => {
    it('should clear all bookmarks', () => {
      addBookmark({ id: 'doc-001', type: 'document', title: 'Doc 1' });
      addBookmark({ id: 'policy-001', type: 'policy', title: 'Policy 1' });

      clearBookmarks();

      expect(getBookmarks()).toEqual([]);
      expect(localStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it('should handle clearing when no bookmarks exist', () => {
      expect(() => {
        clearBookmarks();
      }).not.toThrow();
    });
  });

  describe('getBookmarkCount', () => {
    it('should return 0 when no bookmarks', () => {
      expect(getBookmarkCount()).toBe(0);
    });

    it('should return correct count', () => {
      addBookmark({ id: 'doc-001', type: 'document', title: 'Doc 1' });
      addBookmark({ id: 'doc-002', type: 'document', title: 'Doc 2' });
      addBookmark({ id: 'policy-001', type: 'policy', title: 'Policy 1' });

      expect(getBookmarkCount()).toBe(3);
    });
  });

  describe('canAddBookmark', () => {
    it('should return true when under limit', () => {
      expect(canAddBookmark()).toBe(true);
    });

    it('should return true with some bookmarks', () => {
      for (let i = 0; i < 10; i++) {
        addBookmark({ id: `doc-${i}`, type: 'document', title: `Doc ${i}` });
      }

      expect(canAddBookmark()).toBe(true);
    });

    it('should return false when at max limit', () => {
      for (let i = 0; i < MAX_BOOKMARKS; i++) {
        addBookmark({ id: `doc-${i}`, type: 'document', title: `Doc ${i}` });
      }

      expect(canAddBookmark()).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in titles', () => {
      addBookmark({
        id: 'doc-special',
        type: 'document',
        title: 'NATO "SECRET" Doc <test> & stuff',
        classification: 'SECRET',
      });

      const bookmarks = getBookmarks();
      expect(bookmarks[0].title).toBe('NATO "SECRET" Doc <test> & stuff');
    });

    it('should handle very long titles', () => {
      const longTitle = 'A'.repeat(1000);
      addBookmark({
        id: 'doc-long',
        type: 'document',
        title: longTitle,
      });

      const bookmarks = getBookmarks();
      expect(bookmarks[0].title).toBe(longTitle);
    });

    it('should preserve bookmark data integrity through add/get cycle', () => {
      const original = {
        id: 'doc-integrity',
        type: 'document' as const,
        title: 'Integrity Test',
        classification: 'TOP_SECRET',
      };

      addBookmark(original);
      const retrieved = getBookmarks()[0];

      expect(retrieved.id).toBe(original.id);
      expect(retrieved.type).toBe(original.type);
      expect(retrieved.title).toBe(original.title);
      expect(retrieved.classification).toBe(original.classification);
    });
  });
});

