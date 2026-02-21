/**
 * useKeyboardNavigation Hook (2025)
 * 
 * Power user keyboard navigation for resource lists:
 * - j/k navigation (vim-style)
 * - g+g to go to top, G to go to bottom
 * - / to focus search
 * - Enter to open selected
 * - Space to preview
 * - x to toggle selection
 * - a to select all
 * - Escape to clear selection
 * 
 * Inspired by Gmail, GitHub, and Linear keyboard shortcuts
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================
// Types
// ============================================

export interface KeyboardNavigationOptions<T> {
  /** Array of items to navigate */
  items: T[];
  /** Unique key extractor */
  getItemKey: (item: T) => string;
  /** Callback when item is selected via Enter */
  onSelect?: (item: T) => void;
  /** Callback when item is previewed via Space */
  onPreview?: (item: T) => void;
  /** Callback when items are multi-selected */
  onMultiSelect?: (items: T[]) => void;
  /** Callback to focus search */
  onFocusSearch?: () => void;
  /** Callback to scroll to top */
  onScrollToTop?: () => void;
  /** Callback to scroll to bottom */
  onScrollToBottom?: () => void;
  /** Enable multi-selection mode */
  enableMultiSelect?: boolean;
  /** Enable vim-style navigation (j/k) */
  enableVimNavigation?: boolean;
  /** Enable g-prefixed commands */
  enableGCommands?: boolean;
  /** Custom key bindings */
  customBindings?: Record<string, () => void>;
  /** Whether navigation is currently disabled */
  disabled?: boolean;
}

export interface KeyboardNavigationState<T> {
  /** Currently focused item index (-1 if none) */
  focusedIndex: number;
  /** Currently focused item (null if none) */
  focusedItem: T | null;
  /** Set of selected item keys (for multi-select) */
  selectedKeys: Set<string>;
  /** Selected items array */
  selectedItems: T[];
  /** Whether in multi-select mode */
  isMultiSelectMode: boolean;
}

export interface KeyboardNavigationActions {
  /** Move focus up */
  focusPrev: () => void;
  /** Move focus down */
  focusNext: () => void;
  /** Focus specific index */
  focusIndex: (index: number) => void;
  /** Focus first item */
  focusFirst: () => void;
  /** Focus last item */
  focusLast: () => void;
  /** Clear focus */
  clearFocus: () => void;
  /** Toggle selection of focused item */
  toggleSelection: () => void;
  /** Select all items */
  selectAll: () => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Select range from anchor to current */
  selectRange: (toIndex: number) => void;
}

// ============================================
// Hook Implementation
// ============================================

export function useKeyboardNavigation<T>({
  items,
  getItemKey,
  onSelect,
  onPreview,
  onMultiSelect,
  onFocusSearch,
  onScrollToTop,
  onScrollToBottom,
  enableMultiSelect = true,
  enableVimNavigation = true,
  enableGCommands = true,
  customBindings = {},
  disabled = false,
}: KeyboardNavigationOptions<T>): [KeyboardNavigationState<T>, KeyboardNavigationActions] {
  
  // State
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  
  // Refs for g-command chaining
  const pendingGCommand = useRef(false);
  const gCommandTimeout = useRef<NodeJS.Timeout | null>(null);
  
  // Selection anchor for shift-selection
  const selectionAnchor = useRef<number | null>(null);

  // Computed values
  const focusedItem = focusedIndex >= 0 && focusedIndex < items.length 
    ? items[focusedIndex] 
    : null;
  
  const selectedItems = items.filter(item => selectedKeys.has(getItemKey(item)));
  const isMultiSelectMode = selectedKeys.size > 0;

  // ============================================
  // Actions
  // ============================================

  const focusPrev = useCallback(() => {
    if (disabled || items.length === 0) return;
    setFocusedIndex(prev => Math.max(0, prev - 1));
  }, [disabled, items.length]);

  const focusNext = useCallback(() => {
    if (disabled || items.length === 0) return;
    setFocusedIndex(prev => Math.min(items.length - 1, prev + 1));
  }, [disabled, items.length]);

  const focusIndex = useCallback((index: number) => {
    if (disabled) return;
    if (index >= 0 && index < items.length) {
      setFocusedIndex(index);
    }
  }, [disabled, items.length]);

  const focusFirst = useCallback(() => {
    if (disabled || items.length === 0) return;
    setFocusedIndex(0);
    onScrollToTop?.();
  }, [disabled, items.length, onScrollToTop]);

  const focusLast = useCallback(() => {
    if (disabled || items.length === 0) return;
    setFocusedIndex(items.length - 1);
    onScrollToBottom?.();
  }, [disabled, items.length, onScrollToBottom]);

  const clearFocus = useCallback(() => {
    setFocusedIndex(-1);
  }, []);

  const toggleSelection = useCallback(() => {
    if (disabled || !enableMultiSelect || focusedIndex < 0) return;
    
    const item = items[focusedIndex];
    const key = getItemKey(item);
    
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        selectionAnchor.current = focusedIndex;
      }
      return next;
    });
  }, [disabled, enableMultiSelect, focusedIndex, items, getItemKey]);

  const selectAll = useCallback(() => {
    if (disabled || !enableMultiSelect) return;
    setSelectedKeys(new Set(items.map(getItemKey)));
  }, [disabled, enableMultiSelect, items, getItemKey]);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
    selectionAnchor.current = null;
  }, []);

  const selectRange = useCallback((toIndex: number) => {
    if (disabled || !enableMultiSelect) return;
    
    const anchor = selectionAnchor.current ?? focusedIndex;
    if (anchor < 0) return;
    
    const start = Math.min(anchor, toIndex);
    const end = Math.max(anchor, toIndex);
    
    const rangeKeys = items
      .slice(start, end + 1)
      .map(getItemKey);
    
    setSelectedKeys(prev => {
      const next = new Set(prev);
      rangeKeys.forEach(key => next.add(key));
      return next;
    });
  }, [disabled, enableMultiSelect, focusedIndex, items, getItemKey]);

  // ============================================
  // Notify multi-select changes
  // ============================================

  useEffect(() => {
    if (onMultiSelect && selectedKeys.size > 0) {
      const selected = items.filter(item => selectedKeys.has(getItemKey(item)));
      onMultiSelect(selected);
    }
  }, [selectedKeys, items, getItemKey, onMultiSelect]);

  // ============================================
  // Keyboard Event Handler
  // ============================================

  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if in input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Check custom bindings first
      const customAction = customBindings[e.key];
      if (customAction) {
        e.preventDefault();
        customAction();
        return;
      }

      // Handle g-command chaining
      if (enableGCommands) {
        if (pendingGCommand.current) {
          pendingGCommand.current = false;
          if (gCommandTimeout.current) {
            clearTimeout(gCommandTimeout.current);
            gCommandTimeout.current = null;
          }
          
          if (e.key === 'g') {
            // gg - go to top
            e.preventDefault();
            focusFirst();
            return;
          }
          // Other g-commands could be added here
        }
        
        if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          pendingGCommand.current = true;
          gCommandTimeout.current = setTimeout(() => {
            pendingGCommand.current = false;
          }, 500);
          return;
        }
      }

      // Main key bindings
      switch (e.key) {
        // Navigation
        case 'ArrowDown':
        case 'j':
          if (e.key === 'j' && !enableVimNavigation) break;
          e.preventDefault();
          if (e.shiftKey && enableMultiSelect) {
            focusNext();
            selectRange(focusedIndex + 1);
          } else {
            focusNext();
          }
          break;

        case 'ArrowUp':
        case 'k':
          if (e.key === 'k' && !enableVimNavigation) break;
          e.preventDefault();
          if (e.shiftKey && enableMultiSelect) {
            focusPrev();
            selectRange(Math.max(0, focusedIndex - 1));
          } else {
            focusPrev();
          }
          break;

        // Go to end (G or Cmd+Down)
        case 'G':
          if (enableGCommands) {
            e.preventDefault();
            focusLast();
          }
          break;

        case 'End':
          e.preventDefault();
          focusLast();
          break;

        case 'Home':
          e.preventDefault();
          focusFirst();
          break;

        // Search
        case '/':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            onFocusSearch?.();
          }
          break;

        // Enter to open
        case 'Enter':
          if (focusedItem) {
            e.preventDefault();
            onSelect?.(focusedItem);
          }
          break;

        // Space to preview
        case ' ':
          if (focusedItem && !e.shiftKey) {
            e.preventDefault();
            onPreview?.(focusedItem);
          }
          break;

        // Selection
        case 'x':
          if (enableMultiSelect) {
            e.preventDefault();
            toggleSelection();
          }
          break;

        case 'a':
          if ((e.ctrlKey || e.metaKey) && enableMultiSelect) {
            e.preventDefault();
            selectAll();
          }
          break;

        case 'Escape':
          e.preventDefault();
          if (selectedKeys.size > 0) {
            clearSelection();
          } else {
            clearFocus();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    disabled,
    enableVimNavigation,
    enableGCommands,
    enableMultiSelect,
    focusedIndex,
    focusedItem,
    items.length,
    selectedKeys.size,
    customBindings,
    focusPrev,
    focusNext,
    focusFirst,
    focusLast,
    clearFocus,
    toggleSelection,
    selectAll,
    clearSelection,
    selectRange,
    onSelect,
    onPreview,
    onFocusSearch,
  ]);

  // ============================================
  // Cleanup
  // ============================================

  useEffect(() => {
    return () => {
      if (gCommandTimeout.current) {
        clearTimeout(gCommandTimeout.current);
      }
    };
  }, []);

  // ============================================
  // Reset focus when items change
  // ============================================

  useEffect(() => {
    if (focusedIndex >= items.length) {
      setFocusedIndex(Math.max(-1, items.length - 1));
    }
  }, [items.length, focusedIndex]);

  // Clear invalid selections when items change
  useEffect(() => {
    const validKeys = new Set(items.map(getItemKey));
    setSelectedKeys(prev => {
      const next = new Set<string>();
      prev.forEach(key => {
        if (validKeys.has(key)) {
          next.add(key);
        }
      });
      if (next.size !== prev.size) {
        return next;
      }
      return prev;
    });
  }, [items, getItemKey]);

  // ============================================
  // Return State & Actions
  // ============================================

  const state: KeyboardNavigationState<T> = {
    focusedIndex,
    focusedItem,
    selectedKeys,
    selectedItems,
    isMultiSelectMode,
  };

  const actions: KeyboardNavigationActions = {
    focusPrev,
    focusNext,
    focusIndex,
    focusFirst,
    focusLast,
    clearFocus,
    toggleSelection,
    selectAll,
    clearSelection,
    selectRange,
  };

  return [state, actions];
}

// ============================================
// Keyboard Shortcuts Help Component
// ============================================

export function KeyboardShortcutsHelp() {
  return (
    <div className="grid grid-cols-2 gap-4 text-sm">
      <div>
        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Navigation</h4>
        <dl className="space-y-1">
          <div className="flex justify-between">
            <dt className="text-gray-600 dark:text-gray-400">Next item</dt>
            <dd className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">j / ↓</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600 dark:text-gray-400">Previous item</dt>
            <dd className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">k / ↑</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600 dark:text-gray-400">Go to top</dt>
            <dd className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">gg</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600 dark:text-gray-400">Go to bottom</dt>
            <dd className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">G</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600 dark:text-gray-400">Focus search</dt>
            <dd className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">/</dd>
          </div>
        </dl>
      </div>
      <div>
        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Actions</h4>
        <dl className="space-y-1">
          <div className="flex justify-between">
            <dt className="text-gray-600 dark:text-gray-400">Open resource</dt>
            <dd className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">Enter</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600 dark:text-gray-400">Preview</dt>
            <dd className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">Space</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600 dark:text-gray-400">Toggle select</dt>
            <dd className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">x</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600 dark:text-gray-400">Select all</dt>
            <dd className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">⌘A</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600 dark:text-gray-400">Clear selection</dt>
            <dd className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">Esc</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export default useKeyboardNavigation;
