/**
 * useKeyboardNavigation Hook Unit Tests
 * 
 * Tests for @/hooks/useKeyboardNavigation.tsx
 * Phase 3: Power User Features
 * 
 * Coverage targets:
 * - Vim-style navigation (j/k)
 * - G-commands (gg, G)
 * - Selection management (x, ⌘A)
 * - Action triggers (Enter, Space)
 * - Focus management
 * - Disabled state
 */

import { renderHook, act } from '@testing-library/react';
import useKeyboardNavigation, { 
  KeyboardNavigationOptions,
  KeyboardNavigationState,
  KeyboardNavigationActions,
} from '@/hooks/useKeyboardNavigation';
import { fireEvent } from '@testing-library/react';

// Helper to simulate keyboard events
function simulateKeyDown(key: string, options: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    ...options,
  });
  document.dispatchEvent(event);
}

describe('useKeyboardNavigation', () => {
  // Sample test data
  interface TestItem {
    id: string;
    name: string;
  }

  const mockItems: TestItem[] = [
    { id: 'item-1', name: 'First Item' },
    { id: 'item-2', name: 'Second Item' },
    { id: 'item-3', name: 'Third Item' },
    { id: 'item-4', name: 'Fourth Item' },
    { id: 'item-5', name: 'Fifth Item' },
  ];

  const defaultOptions: KeyboardNavigationOptions<TestItem> = {
    items: mockItems,
    getItemKey: (item) => item.id,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('should initialize with no focused item', () => {
      const { result } = renderHook(() => useKeyboardNavigation(defaultOptions));

      const [state] = result.current;
      
      expect(state.focusedIndex).toBe(-1);
      expect(state.focusedItem).toBeNull();
      expect(state.selectedKeys.size).toBe(0);
      expect(state.isMultiSelectMode).toBe(false);
    });

    it('should initialize with empty selection', () => {
      const { result } = renderHook(() => useKeyboardNavigation(defaultOptions));

      const [state] = result.current;
      
      expect(state.selectedKeys).toBeInstanceOf(Set);
      expect(state.selectedKeys.size).toBe(0);
      expect(state.selectedItems).toEqual([]);
    });
  });

  describe('navigation actions', () => {
    describe('focusNext', () => {
      it('should move focus to first item from -1', () => {
        const { result } = renderHook(() => useKeyboardNavigation(defaultOptions));

        act(() => {
          result.current[1].focusNext();
        });

        expect(result.current[0].focusedIndex).toBe(0);
        expect(result.current[0].focusedItem).toEqual(mockItems[0]);
      });

      it('should move focus down one item', () => {
        const { result } = renderHook(() => useKeyboardNavigation(defaultOptions));

        act(() => {
          result.current[1].focusIndex(1);
        });

        act(() => {
          result.current[1].focusNext();
        });

        expect(result.current[0].focusedIndex).toBe(2);
      });

      it('should not go past last item', () => {
        const { result } = renderHook(() => useKeyboardNavigation(defaultOptions));

        act(() => {
          result.current[1].focusIndex(4);
        });

        act(() => {
          result.current[1].focusNext();
        });

        expect(result.current[0].focusedIndex).toBe(4); // Stays at last
      });
    });

    describe('focusPrev', () => {
      it('should move focus up one item', () => {
        const { result } = renderHook(() => useKeyboardNavigation(defaultOptions));

        act(() => {
          result.current[1].focusIndex(2);
        });

        act(() => {
          result.current[1].focusPrev();
        });

        expect(result.current[0].focusedIndex).toBe(1);
      });

      it('should not go before first item', () => {
        const { result } = renderHook(() => useKeyboardNavigation(defaultOptions));

        act(() => {
          result.current[1].focusIndex(0);
        });

        act(() => {
          result.current[1].focusPrev();
        });

        expect(result.current[0].focusedIndex).toBe(0); // Stays at first
      });
    });

    describe('focusFirst', () => {
      it('should move focus to first item', () => {
        const onScrollToTop = jest.fn();
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          onScrollToTop,
        }));

        act(() => {
          result.current[1].focusIndex(4);
        });

        act(() => {
          result.current[1].focusFirst();
        });

        expect(result.current[0].focusedIndex).toBe(0);
        expect(onScrollToTop).toHaveBeenCalled();
      });
    });

    describe('focusLast', () => {
      it('should move focus to last item', () => {
        const onScrollToBottom = jest.fn();
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          onScrollToBottom,
        }));

        act(() => {
          result.current[1].focusLast();
        });

        expect(result.current[0].focusedIndex).toBe(4);
        expect(onScrollToBottom).toHaveBeenCalled();
      });
    });

    describe('focusIndex', () => {
      it('should focus specific index', () => {
        const { result } = renderHook(() => useKeyboardNavigation(defaultOptions));

        act(() => {
          result.current[1].focusIndex(2);
        });

        expect(result.current[0].focusedIndex).toBe(2);
        expect(result.current[0].focusedItem).toEqual(mockItems[2]);
      });

      it('should not focus invalid index', () => {
        const { result } = renderHook(() => useKeyboardNavigation(defaultOptions));

        act(() => {
          result.current[1].focusIndex(100);
        });

        expect(result.current[0].focusedIndex).toBe(-1);
      });

      it('should not focus negative index', () => {
        const { result } = renderHook(() => useKeyboardNavigation(defaultOptions));

        act(() => {
          result.current[1].focusIndex(2);
        });

        act(() => {
          result.current[1].focusIndex(-5);
        });

        expect(result.current[0].focusedIndex).toBe(2); // Unchanged
      });
    });

    describe('clearFocus', () => {
      it('should clear focus', () => {
        const { result } = renderHook(() => useKeyboardNavigation(defaultOptions));

        act(() => {
          result.current[1].focusIndex(2);
        });

        expect(result.current[0].focusedIndex).toBe(2);

        act(() => {
          result.current[1].clearFocus();
        });

        expect(result.current[0].focusedIndex).toBe(-1);
        expect(result.current[0].focusedItem).toBeNull();
      });
    });
  });

  describe('selection actions', () => {
    describe('toggleSelection', () => {
      it('should select focused item', () => {
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          enableMultiSelect: true,
        }));

        act(() => {
          result.current[1].focusIndex(1);
        });

        act(() => {
          result.current[1].toggleSelection();
        });

        expect(result.current[0].selectedKeys.has('item-2')).toBe(true);
        expect(result.current[0].isMultiSelectMode).toBe(true);
      });

      it('should deselect when toggled again', () => {
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          enableMultiSelect: true,
        }));

        act(() => {
          result.current[1].focusIndex(1);
        });

        act(() => {
          result.current[1].toggleSelection();
        });

        expect(result.current[0].selectedKeys.has('item-2')).toBe(true);

        act(() => {
          result.current[1].toggleSelection();
        });

        expect(result.current[0].selectedKeys.has('item-2')).toBe(false);
      });

      it('should not select when multiSelect is disabled', () => {
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          enableMultiSelect: false,
        }));

        act(() => {
          result.current[1].focusIndex(1);
        });

        act(() => {
          result.current[1].toggleSelection();
        });

        expect(result.current[0].selectedKeys.size).toBe(0);
      });

      it('should not select when no item is focused', () => {
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          enableMultiSelect: true,
        }));

        act(() => {
          result.current[1].toggleSelection();
        });

        expect(result.current[0].selectedKeys.size).toBe(0);
      });
    });

    describe('selectAll', () => {
      it('should select all items', () => {
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          enableMultiSelect: true,
        }));

        act(() => {
          result.current[1].selectAll();
        });

        expect(result.current[0].selectedKeys.size).toBe(5);
        expect(result.current[0].selectedItems).toEqual(mockItems);
      });

      it('should not select all when multiSelect is disabled', () => {
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          enableMultiSelect: false,
        }));

        act(() => {
          result.current[1].selectAll();
        });

        expect(result.current[0].selectedKeys.size).toBe(0);
      });
    });

    describe('clearSelection', () => {
      it('should clear all selections', () => {
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          enableMultiSelect: true,
        }));

        act(() => {
          result.current[1].selectAll();
        });

        expect(result.current[0].selectedKeys.size).toBe(5);

        act(() => {
          result.current[1].clearSelection();
        });

        expect(result.current[0].selectedKeys.size).toBe(0);
        expect(result.current[0].isMultiSelectMode).toBe(false);
      });
    });

    describe('selectRange', () => {
      it('should select range of items', () => {
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          enableMultiSelect: true,
        }));

        act(() => {
          result.current[1].focusIndex(1);
        });

        act(() => {
          result.current[1].toggleSelection(); // Set anchor
        });

        act(() => {
          result.current[1].selectRange(3);
        });

        expect(result.current[0].selectedKeys.has('item-2')).toBe(true);
        expect(result.current[0].selectedKeys.has('item-3')).toBe(true);
        expect(result.current[0].selectedKeys.has('item-4')).toBe(true);
      });
    });
  });

  describe('keyboard events', () => {
    describe('vim navigation', () => {
      it('should navigate down on j key', () => {
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          enableVimNavigation: true,
        }));

        act(() => {
          simulateKeyDown('j');
        });

        expect(result.current[0].focusedIndex).toBe(0);

        act(() => {
          simulateKeyDown('j');
        });

        expect(result.current[0].focusedIndex).toBe(1);
      });

      it('should navigate up on k key', () => {
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          enableVimNavigation: true,
        }));

        act(() => {
          result.current[1].focusIndex(2);
        });

        act(() => {
          simulateKeyDown('k');
        });

        expect(result.current[0].focusedIndex).toBe(1);
      });

      it('should not respond to j/k when vim navigation disabled', () => {
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          enableVimNavigation: false,
        }));

        act(() => {
          simulateKeyDown('j');
        });

        expect(result.current[0].focusedIndex).toBe(-1);
      });
    });

    describe('arrow keys', () => {
      it('should navigate down on ArrowDown', () => {
        const { result } = renderHook(() => useKeyboardNavigation(defaultOptions));

        act(() => {
          simulateKeyDown('ArrowDown');
        });

        expect(result.current[0].focusedIndex).toBe(0);
      });

      it('should navigate up on ArrowUp', () => {
        const { result } = renderHook(() => useKeyboardNavigation(defaultOptions));

        act(() => {
          result.current[1].focusIndex(2);
        });

        act(() => {
          simulateKeyDown('ArrowUp');
        });

        expect(result.current[0].focusedIndex).toBe(1);
      });
    });

    describe('g-commands', () => {
      it('should go to top on gg', () => {
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          enableGCommands: true,
        }));

        act(() => {
          result.current[1].focusIndex(4);
        });

        act(() => {
          simulateKeyDown('g');
        });

        // First g doesn't navigate
        expect(result.current[0].focusedIndex).toBe(4);

        act(() => {
          simulateKeyDown('g');
        });

        expect(result.current[0].focusedIndex).toBe(0);
      });

      it('should go to bottom on G', () => {
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          enableGCommands: true,
        }));

        act(() => {
          simulateKeyDown('G');
        });

        expect(result.current[0].focusedIndex).toBe(4);
      });
    });

    describe('selection keys', () => {
      it('should toggle selection on x key', () => {
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          enableMultiSelect: true,
        }));

        act(() => {
          result.current[1].focusIndex(1);
        });

        act(() => {
          simulateKeyDown('x');
        });

        expect(result.current[0].selectedKeys.has('item-2')).toBe(true);
      });

      it('should select all on Cmd+A', () => {
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          enableMultiSelect: true,
        }));

        act(() => {
          simulateKeyDown('a', { metaKey: true });
        });

        expect(result.current[0].selectedKeys.size).toBe(5);
      });

      it('should clear selection on Escape', () => {
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          enableMultiSelect: true,
        }));

        act(() => {
          result.current[1].selectAll();
        });

        act(() => {
          simulateKeyDown('Escape');
        });

        expect(result.current[0].selectedKeys.size).toBe(0);
      });

      it('should clear focus on Escape when no selection', () => {
        const { result } = renderHook(() => useKeyboardNavigation(defaultOptions));

        act(() => {
          result.current[1].focusIndex(2);
        });

        act(() => {
          simulateKeyDown('Escape');
        });

        expect(result.current[0].focusedIndex).toBe(-1);
      });
    });

    describe('action keys', () => {
      it('should trigger onSelect on Enter', () => {
        const onSelect = jest.fn();
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          onSelect,
        }));

        act(() => {
          result.current[1].focusIndex(1);
        });

        act(() => {
          simulateKeyDown('Enter');
        });

        expect(onSelect).toHaveBeenCalledWith(mockItems[1]);
      });

      it('should trigger onPreview on Space', () => {
        const onPreview = jest.fn();
        const { result } = renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          onPreview,
        }));

        act(() => {
          result.current[1].focusIndex(2);
        });

        act(() => {
          simulateKeyDown(' ');
        });

        expect(onPreview).toHaveBeenCalledWith(mockItems[2]);
      });

      it('should trigger onFocusSearch on /', () => {
        const onFocusSearch = jest.fn();
        renderHook(() => useKeyboardNavigation({
          ...defaultOptions,
          onFocusSearch,
        }));

        act(() => {
          simulateKeyDown('/');
        });

        expect(onFocusSearch).toHaveBeenCalled();
      });
    });

    describe('input/textarea handling', () => {
      it('should ignore keys when typing in input', () => {
        const { result } = renderHook(() => useKeyboardNavigation(defaultOptions));

        // Create an input element and focus it
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();

        act(() => {
          simulateKeyDown('j');
        });

        // Should not navigate since we're in an input
        expect(result.current[0].focusedIndex).toBe(-1);

        document.body.removeChild(input);
      });

      it('should ignore keys when typing in textarea', () => {
        const { result } = renderHook(() => useKeyboardNavigation(defaultOptions));

        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);
        textarea.focus();

        act(() => {
          simulateKeyDown('j');
        });

        expect(result.current[0].focusedIndex).toBe(-1);

        document.body.removeChild(textarea);
      });
    });
  });

  describe('disabled state', () => {
    it('should not respond to navigation when disabled', () => {
      const { result } = renderHook(() => useKeyboardNavigation({
        ...defaultOptions,
        disabled: true,
      }));

      act(() => {
        result.current[1].focusNext();
      });

      expect(result.current[0].focusedIndex).toBe(-1);
    });

    it('should not respond to keyboard when disabled', () => {
      const { result } = renderHook(() => useKeyboardNavigation({
        ...defaultOptions,
        disabled: true,
      }));

      act(() => {
        simulateKeyDown('j');
      });

      expect(result.current[0].focusedIndex).toBe(-1);
    });
  });

  describe('items changes', () => {
    it('should reset focus when focused item is removed', () => {
      const { result, rerender } = renderHook(
        (props: KeyboardNavigationOptions<TestItem>) => useKeyboardNavigation(props),
        { initialProps: defaultOptions }
      );

      act(() => {
        result.current[1].focusIndex(4);
      });

      expect(result.current[0].focusedIndex).toBe(4);

      // Remove last item
      rerender({
        ...defaultOptions,
        items: mockItems.slice(0, 3),
      });

      // Focus should be adjusted to last available
      expect(result.current[0].focusedIndex).toBe(2);
    });

    it('should clear invalid selections when items change', () => {
      const { result, rerender } = renderHook(
        (props: KeyboardNavigationOptions<TestItem>) => useKeyboardNavigation(props),
        { 
          initialProps: {
            ...defaultOptions,
            enableMultiSelect: true,
          } 
        }
      );

      act(() => {
        result.current[1].selectAll();
      });

      expect(result.current[0].selectedKeys.size).toBe(5);

      // Remove some items
      rerender({
        ...defaultOptions,
        enableMultiSelect: true,
        items: mockItems.slice(0, 3),
      });

      // Selection should only contain valid keys
      expect(result.current[0].selectedKeys.size).toBe(3);
      expect(result.current[0].selectedKeys.has('item-4')).toBe(false);
      expect(result.current[0].selectedKeys.has('item-5')).toBe(false);
    });
  });

  describe('custom bindings', () => {
    it('should execute custom key bindings', () => {
      const customAction = jest.fn();
      
      renderHook(() => useKeyboardNavigation({
        ...defaultOptions,
        customBindings: {
          'b': customAction,
        },
      }));

      act(() => {
        simulateKeyDown('b');
      });

      expect(customAction).toHaveBeenCalled();
    });
  });

  describe('shift+navigation', () => {
    it('should extend selection with shift+down', () => {
      const { result } = renderHook(() => useKeyboardNavigation({
        ...defaultOptions,
        enableMultiSelect: true,
      }));

      act(() => {
        result.current[1].focusIndex(1);
      });

      act(() => {
        result.current[1].toggleSelection(); // Set anchor
      });

      act(() => {
        simulateKeyDown('j', { shiftKey: true });
      });

      // Should have selected items 1 and 2
      expect(result.current[0].selectedKeys.has('item-2')).toBe(true);
      expect(result.current[0].selectedKeys.has('item-3')).toBe(true);
    });
  });

  describe('onMultiSelect callback', () => {
    it('should call onMultiSelect when selection changes', () => {
      const onMultiSelect = jest.fn();
      
      const { result } = renderHook(() => useKeyboardNavigation({
        ...defaultOptions,
        enableMultiSelect: true,
        onMultiSelect,
      }));

      act(() => {
        result.current[1].focusIndex(1);
      });

      act(() => {
        result.current[1].toggleSelection();
      });

      expect(onMultiSelect).toHaveBeenCalledWith([mockItems[1]]);
    });
  });
});







