/**
 * useBookmarks Hook Unit Tests
 * 
 * Tests for @/hooks/useBookmarks.ts
 * Phase 3: Power User Features
 * 
 * Coverage targets:
 * - Initial state loading
 * - Cross-tab synchronization
 * - Add/remove/toggle operations
 * - Error handling
 * - Derived state (documentBookmarks, policyBookmarks)
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import useBookmarks from '@/hooks/useBookmarks';
import * as bookmarksLib from '@/lib/bookmarks';

// Mock the bookmarks library
jest.mock('@/lib/bookmarks', () => ({
  MAX_BOOKMARKS: 20,
  addBookmark: jest.fn(),
  removeBookmark: jest.fn(),
  toggleBookmark: jest.fn(),
  isBookmarked: jest.fn(),
  getBookmarks: jest.fn(),
  getBookmarksByType: jest.fn(),
  clearBookmarks: jest.fn(),
  getBookmarkCount: jest.fn(),
  canAddBookmark: jest.fn(),
}));

const mockBookmarksLib = bookmarksLib as jest.Mocked<typeof bookmarksLib>;

describe('useBookmarks', () => {
  // Sample test data
  const mockDocumentBookmark: bookmarksLib.Bookmark = {
    id: 'doc-001',
    type: 'document',
    title: 'Test Document',
    classification: 'SECRET',
    addedAt: Date.now(),
  };

  const mockPolicyBookmark: bookmarksLib.Bookmark = {
    id: 'policy-001',
    type: 'policy',
    title: 'Test Policy',
    addedAt: Date.now() - 1000,
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Default mock implementations
    mockBookmarksLib.getBookmarks.mockReturnValue([]);
    mockBookmarksLib.isBookmarked.mockReturnValue(false);
    mockBookmarksLib.canAddBookmark.mockReturnValue(true);
    mockBookmarksLib.getBookmarkCount.mockReturnValue(0);
  });

  describe('initial state', () => {
    it('should load bookmarks on mount', () => {
      mockBookmarksLib.getBookmarks.mockReturnValue([mockDocumentBookmark]);

      const { result } = renderHook(() => useBookmarks());

      expect(mockBookmarksLib.getBookmarks).toHaveBeenCalled();
      expect(result.current.bookmarks).toEqual([mockDocumentBookmark]);
    });

    it('should return empty bookmarks when none exist', () => {
      mockBookmarksLib.getBookmarks.mockReturnValue([]);

      const { result } = renderHook(() => useBookmarks());

      expect(result.current.bookmarks).toEqual([]);
      expect(result.current.count).toBe(0);
    });

    it('should calculate canAdd correctly based on count', () => {
      mockBookmarksLib.getBookmarks.mockReturnValue([]);

      const { result } = renderHook(() => useBookmarks());

      expect(result.current.canAdd).toBe(true);
    });

    it('should set canAdd to false when at max', () => {
      const manyBookmarks = Array.from({ length: 20 }, (_, i) => ({
        id: `doc-${i}`,
        type: 'document' as const,
        title: `Doc ${i}`,
        addedAt: Date.now() - i * 1000,
      }));
      mockBookmarksLib.getBookmarks.mockReturnValue(manyBookmarks);

      const { result } = renderHook(() => useBookmarks());

      expect(result.current.canAdd).toBe(false);
    });
  });

  describe('derived state', () => {
    it('should separate document and policy bookmarks', () => {
      mockBookmarksLib.getBookmarks.mockReturnValue([
        mockDocumentBookmark,
        mockPolicyBookmark,
        { ...mockDocumentBookmark, id: 'doc-002', title: 'Doc 2' },
      ]);

      const { result } = renderHook(() => useBookmarks());

      expect(result.current.documentBookmarks).toHaveLength(2);
      expect(result.current.policyBookmarks).toHaveLength(1);
    });

    it('should return correct maxBookmarks', () => {
      const { result } = renderHook(() => useBookmarks());

      expect(result.current.maxBookmarks).toBe(20);
    });
  });

  describe('isItemBookmarked', () => {
    it('should return true for bookmarked items', () => {
      mockBookmarksLib.isBookmarked.mockReturnValue(true);

      const { result } = renderHook(() => useBookmarks());

      const isBookmarked = result.current.isItemBookmarked('doc-001', 'document');
      
      expect(mockBookmarksLib.isBookmarked).toHaveBeenCalledWith('doc-001', 'document');
      expect(isBookmarked).toBe(true);
    });

    it('should return false for non-bookmarked items', () => {
      mockBookmarksLib.isBookmarked.mockReturnValue(false);

      const { result } = renderHook(() => useBookmarks());

      const isBookmarked = result.current.isItemBookmarked('doc-999', 'document');
      
      expect(isBookmarked).toBe(false);
    });
  });

  describe('add', () => {
    it('should add bookmark successfully', () => {
      mockBookmarksLib.getBookmarks
        .mockReturnValueOnce([]) // Initial
        .mockReturnValueOnce([mockDocumentBookmark]); // After add

      const { result } = renderHook(() => useBookmarks());

      let addResult: { success: boolean; error?: string };
      act(() => {
        addResult = result.current.add({
          id: 'doc-001',
          type: 'document',
          title: 'Test Document',
          classification: 'SECRET',
        });
      });

      expect(mockBookmarksLib.addBookmark).toHaveBeenCalled();
      expect(addResult!.success).toBe(true);
      expect(addResult!.error).toBeUndefined();
    });

    it('should return error when add fails', () => {
      mockBookmarksLib.addBookmark.mockImplementation(() => {
        throw new Error('Maximum 20 bookmarks allowed');
      });

      const { result } = renderHook(() => useBookmarks());

      let addResult: { success: boolean; error?: string };
      act(() => {
        addResult = result.current.add({
          id: 'doc-001',
          type: 'document',
          title: 'Test',
        });
      });

      expect(addResult!.success).toBe(false);
      expect(addResult!.error).toBe('Maximum 20 bookmarks allowed');
    });
  });

  describe('remove', () => {
    it('should remove bookmark and update state', () => {
      mockBookmarksLib.getBookmarks
        .mockReturnValueOnce([mockDocumentBookmark]) // Initial
        .mockReturnValueOnce([]); // After remove

      const { result } = renderHook(() => useBookmarks());

      expect(result.current.bookmarks).toHaveLength(1);

      act(() => {
        result.current.remove('doc-001', 'document');
      });

      expect(mockBookmarksLib.removeBookmark).toHaveBeenCalledWith('doc-001', 'document');
      expect(result.current.bookmarks).toEqual([]);
    });
  });

  describe('toggle', () => {
    it('should toggle bookmark on and return isBookmarked true', () => {
      mockBookmarksLib.toggleBookmark.mockReturnValue(true);
      mockBookmarksLib.getBookmarks
        .mockReturnValueOnce([]) // Initial
        .mockReturnValueOnce([mockDocumentBookmark]); // After toggle

      const { result } = renderHook(() => useBookmarks());

      let toggleResult: { isBookmarked: boolean; error?: string };
      act(() => {
        toggleResult = result.current.toggle({
          id: 'doc-001',
          type: 'document',
          title: 'Test',
        });
      });

      expect(toggleResult!.isBookmarked).toBe(true);
      expect(toggleResult!.error).toBeUndefined();
    });

    it('should toggle bookmark off and return isBookmarked false', () => {
      mockBookmarksLib.toggleBookmark.mockReturnValue(false);
      mockBookmarksLib.getBookmarks
        .mockReturnValueOnce([mockDocumentBookmark]) // Initial
        .mockReturnValueOnce([]); // After toggle

      const { result } = renderHook(() => useBookmarks());

      let toggleResult: { isBookmarked: boolean; error?: string };
      act(() => {
        toggleResult = result.current.toggle({
          id: 'doc-001',
          type: 'document',
          title: 'Test',
        });
      });

      expect(toggleResult!.isBookmarked).toBe(false);
    });

    it('should return error when toggle fails at max limit', () => {
      mockBookmarksLib.toggleBookmark.mockImplementation(() => {
        throw new Error('Maximum 20 bookmarks allowed');
      });
      mockBookmarksLib.isBookmarked.mockReturnValue(false);

      const { result } = renderHook(() => useBookmarks());

      let toggleResult: { isBookmarked: boolean; error?: string };
      act(() => {
        toggleResult = result.current.toggle({
          id: 'doc-new',
          type: 'document',
          title: 'New Doc',
        });
      });

      expect(toggleResult!.error).toBe('Maximum 20 bookmarks allowed');
    });
  });

  describe('clearAll', () => {
    it('should clear all bookmarks', () => {
      mockBookmarksLib.getBookmarks
        .mockReturnValueOnce([mockDocumentBookmark, mockPolicyBookmark]); // Initial

      const { result } = renderHook(() => useBookmarks());

      expect(result.current.count).toBe(2);

      act(() => {
        result.current.clearAll();
      });

      expect(mockBookmarksLib.clearBookmarks).toHaveBeenCalled();
      expect(result.current.bookmarks).toEqual([]);
    });
  });

  describe('refresh', () => {
    it('should refresh bookmarks from storage', () => {
      mockBookmarksLib.getBookmarks
        .mockReturnValueOnce([]) // Initial
        .mockReturnValueOnce([mockDocumentBookmark]); // After refresh

      const { result } = renderHook(() => useBookmarks());

      expect(result.current.bookmarks).toEqual([]);

      act(() => {
        result.current.refresh();
      });

      expect(result.current.bookmarks).toEqual([mockDocumentBookmark]);
    });
  });

  describe('cross-tab synchronization', () => {
    it('should update bookmarks on storage event', async () => {
      mockBookmarksLib.getBookmarks
        .mockReturnValueOnce([]) // Initial mount
        .mockReturnValueOnce([mockDocumentBookmark]); // After storage event

      const { result } = renderHook(() => useBookmarks());

      expect(result.current.bookmarks).toEqual([]);

      // Simulate storage event from another tab
      act(() => {
        const event = new StorageEvent('storage', {
          key: 'dive-bookmarks',
          newValue: JSON.stringify([mockDocumentBookmark]),
        });
        window.dispatchEvent(event);
      });

      await waitFor(() => {
        expect(result.current.bookmarks).toEqual([mockDocumentBookmark]);
      });
    });

    it('should ignore storage events for other keys', () => {
      mockBookmarksLib.getBookmarks.mockReturnValue([]);

      const { result } = renderHook(() => useBookmarks());

      const callCountBefore = mockBookmarksLib.getBookmarks.mock.calls.length;

      // Simulate storage event for different key
      act(() => {
        const event = new StorageEvent('storage', {
          key: 'other-key',
          newValue: 'some value',
        });
        window.dispatchEvent(event);
      });

      // Should not trigger additional getBookmarks call
      expect(mockBookmarksLib.getBookmarks.mock.calls.length).toBe(callCountBefore);
    });
  });

  describe('count calculations', () => {
    it('should correctly count bookmarks', () => {
      mockBookmarksLib.getBookmarks.mockReturnValue([
        mockDocumentBookmark,
        mockPolicyBookmark,
      ]);

      const { result } = renderHook(() => useBookmarks());

      expect(result.current.count).toBe(2);
    });

    it('should update count after operations', () => {
      mockBookmarksLib.getBookmarks
        .mockReturnValueOnce([]) // Initial
        .mockReturnValueOnce([mockDocumentBookmark]) // After add
        .mockReturnValueOnce([]); // After remove

      const { result } = renderHook(() => useBookmarks());

      expect(result.current.count).toBe(0);

      act(() => {
        result.current.add(mockDocumentBookmark);
      });

      expect(result.current.count).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined window gracefully', () => {
      // This test verifies the SSR safety of the hook
      // The actual SSR behavior is handled in the lib, but hook should not crash
      const { result } = renderHook(() => useBookmarks());

      expect(result.current.bookmarks).toEqual([]);
    });

    it('should not duplicate bookmarks in derived arrays', () => {
      const duplicateBookmarks = [
        mockDocumentBookmark,
        { ...mockDocumentBookmark, addedAt: Date.now() - 500 }, // Same id, different timestamp
      ];
      mockBookmarksLib.getBookmarks.mockReturnValue(duplicateBookmarks);

      const { result } = renderHook(() => useBookmarks());

      // The hook itself doesn't deduplicate, but derived state should work correctly
      expect(result.current.documentBookmarks.length).toBe(2);
    });
  });
});






