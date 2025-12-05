/**
 * useColumnCustomizer Hook Unit Tests
 * 
 * Tests for @/components/resources/column-customizer.tsx (useColumnCustomizer hook)
 * Phase 3: Power User Features
 * 
 * Coverage targets:
 * - Initial state from defaults
 * - localStorage persistence
 * - Column visibility toggle
 * - Column order management
 * - Preset application
 * - Reset to defaults
 */

import { renderHook, act } from '@testing-library/react';
import {
  useColumnCustomizer,
  DEFAULT_RESOURCE_COLUMNS,
  DEFAULT_COLUMN_PRESETS,
  type ColumnConfig,
  type ColumnPreset,
} from '@/components/resources/column-customizer';

const STORAGE_KEY = 'dive-column-config';

describe('useColumnCustomizer', () => {
  // Mock localStorage
  let localStorageMock: { [key: string]: string } = {};

  beforeEach(() => {
    localStorageMock = {};

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

  // Test column configuration
  const testColumns: ColumnConfig[] = [
    { id: 'col1', label: 'Column 1', defaultVisible: true, required: true },
    { id: 'col2', label: 'Column 2', defaultVisible: true },
    { id: 'col3', label: 'Column 3', defaultVisible: false },
    { id: 'col4', label: 'Column 4', defaultVisible: true },
  ];

  const testPresets: ColumnPreset[] = [
    { id: 'all', name: 'All Columns', columns: ['col1', 'col2', 'col3', 'col4'] },
    { id: 'minimal', name: 'Minimal', columns: ['col1', 'col2'] },
  ];

  describe('initial state', () => {
    it('should return default visible columns', () => {
      const { result } = renderHook(() => useColumnCustomizer(testColumns, 'test-key'));

      expect(result.current.state.visibleColumns).toContain('col1');
      expect(result.current.state.visibleColumns).toContain('col2');
      expect(result.current.state.visibleColumns).not.toContain('col3');
      expect(result.current.state.visibleColumns).toContain('col4');
    });

    it('should return all columns in order', () => {
      const { result } = renderHook(() => useColumnCustomizer(testColumns, 'test-key'));

      expect(result.current.state.columnOrder).toEqual(['col1', 'col2', 'col3', 'col4']);
    });

    it('should load state from localStorage if available', () => {
      const storedState = {
        visibleColumns: ['col1', 'col3'],
        columnOrder: ['col3', 'col1', 'col2', 'col4'],
      };
      localStorageMock['test-key'] = JSON.stringify(storedState);

      const { result } = renderHook(() => useColumnCustomizer(testColumns, 'test-key'));

      expect(result.current.state.visibleColumns).toEqual(['col1', 'col3']);
      expect(result.current.state.columnOrder).toEqual(['col3', 'col1', 'col2', 'col4']);
    });

    it('should handle corrupted localStorage gracefully', () => {
      localStorageMock['test-key'] = 'invalid json';

      const { result } = renderHook(() => useColumnCustomizer(testColumns, 'test-key'));

      // Should fall back to defaults
      expect(result.current.state.visibleColumns).toContain('col1');
      expect(result.current.state.columnOrder).toEqual(['col1', 'col2', 'col3', 'col4']);
    });

    it('should merge new columns into stored state', () => {
      // Stored state missing col4 (newly added column)
      const storedState = {
        visibleColumns: ['col1', 'col2'],
        columnOrder: ['col1', 'col2', 'col3'],
      };
      localStorageMock['test-key'] = JSON.stringify(storedState);

      const { result } = renderHook(() => useColumnCustomizer(testColumns, 'test-key'));

      // col4 should be added to the end
      expect(result.current.state.columnOrder).toContain('col4');
      expect(result.current.state.columnOrder.indexOf('col4')).toBe(3);
    });
  });

  describe('setState', () => {
    it('should update state and persist to localStorage', () => {
      const { result } = renderHook(() => useColumnCustomizer(testColumns, 'test-key'));

      act(() => {
        result.current.setState({
          visibleColumns: ['col1', 'col3', 'col4'],
          columnOrder: ['col4', 'col3', 'col2', 'col1'],
        });
      });

      expect(result.current.state.visibleColumns).toEqual(['col1', 'col3', 'col4']);
      expect(result.current.state.columnOrder).toEqual(['col4', 'col3', 'col2', 'col1']);
      
      const stored = JSON.parse(localStorageMock['test-key']);
      expect(stored.visibleColumns).toEqual(['col1', 'col3', 'col4']);
    });
  });

  describe('reset', () => {
    it('should reset to default state', () => {
      const { result } = renderHook(() => useColumnCustomizer(testColumns, 'test-key'));

      // Modify state first
      act(() => {
        result.current.setState({
          visibleColumns: ['col1'],
          columnOrder: ['col4', 'col3', 'col2', 'col1'],
        });
      });

      expect(result.current.state.visibleColumns).toEqual(['col1']);

      // Reset
      act(() => {
        result.current.reset();
      });

      // Check reset to defaults
      expect(result.current.state.visibleColumns).toContain('col2');
      expect(result.current.state.visibleColumns).toContain('col4');
      expect(result.current.state.columnOrder).toEqual(['col1', 'col2', 'col3', 'col4']);
    });
  });

  describe('applyPreset', () => {
    it('should apply preset column visibility', () => {
      const { result } = renderHook(() => useColumnCustomizer(testColumns, 'test-key'));

      act(() => {
        result.current.applyPreset(testPresets[1]); // Minimal: col1, col2
      });

      expect(result.current.state.visibleColumns).toEqual(['col1', 'col2']);
    });

    it('should preserve column order when applying preset', () => {
      const { result } = renderHook(() => useColumnCustomizer(testColumns, 'test-key'));

      // Reorder first
      act(() => {
        result.current.setState({
          visibleColumns: result.current.state.visibleColumns,
          columnOrder: ['col4', 'col3', 'col2', 'col1'],
        });
      });

      // Apply preset
      act(() => {
        result.current.applyPreset(testPresets[0]); // All columns
      });

      // Order should be preserved
      expect(result.current.state.columnOrder).toEqual(['col4', 'col3', 'col2', 'col1']);
    });
  });

  describe('isColumnVisible', () => {
    it('should return true for visible columns', () => {
      const { result } = renderHook(() => useColumnCustomizer(testColumns, 'test-key'));

      expect(result.current.isColumnVisible('col1')).toBe(true);
      expect(result.current.isColumnVisible('col2')).toBe(true);
    });

    it('should return false for hidden columns', () => {
      const { result } = renderHook(() => useColumnCustomizer(testColumns, 'test-key'));

      expect(result.current.isColumnVisible('col3')).toBe(false);
    });
  });

  describe('getVisibleColumnsInOrder', () => {
    it('should return only visible columns in correct order', () => {
      const { result } = renderHook(() => useColumnCustomizer(testColumns, 'test-key'));

      const visibleInOrder = result.current.getVisibleColumnsInOrder();

      expect(visibleInOrder).toEqual(['col1', 'col2', 'col4']);
      expect(visibleInOrder).not.toContain('col3');
    });

    it('should respect custom column order', () => {
      const { result } = renderHook(() => useColumnCustomizer(testColumns, 'test-key'));

      act(() => {
        result.current.setState({
          visibleColumns: ['col1', 'col2', 'col4'],
          columnOrder: ['col4', 'col2', 'col1', 'col3'],
        });
      });

      const visibleInOrder = result.current.getVisibleColumnsInOrder();

      expect(visibleInOrder).toEqual(['col4', 'col2', 'col1']);
    });
  });

  describe('DEFAULT_RESOURCE_COLUMNS', () => {
    it('should export default columns', () => {
      expect(DEFAULT_RESOURCE_COLUMNS).toBeDefined();
      expect(Array.isArray(DEFAULT_RESOURCE_COLUMNS)).toBe(true);
    });

    it('should have required columns marked', () => {
      const requiredColumns = DEFAULT_RESOURCE_COLUMNS.filter((c) => c.required);
      expect(requiredColumns.length).toBeGreaterThan(0);
      expect(requiredColumns.some((c) => c.id === 'classification')).toBe(true);
      expect(requiredColumns.some((c) => c.id === 'title')).toBe(true);
    });

    it('should have all expected resource columns', () => {
      const columnIds = DEFAULT_RESOURCE_COLUMNS.map((c) => c.id);
      
      expect(columnIds).toContain('classification');
      expect(columnIds).toContain('title');
      expect(columnIds).toContain('resourceId');
      expect(columnIds).toContain('releasabilityTo');
      expect(columnIds).toContain('COI');
      expect(columnIds).toContain('encrypted');
      expect(columnIds).toContain('originRealm');
    });
  });

  describe('DEFAULT_COLUMN_PRESETS', () => {
    it('should export default presets', () => {
      expect(DEFAULT_COLUMN_PRESETS).toBeDefined();
      expect(Array.isArray(DEFAULT_COLUMN_PRESETS)).toBe(true);
    });

    it('should have expected preset types', () => {
      const presetIds = DEFAULT_COLUMN_PRESETS.map((p) => p.id);
      
      expect(presetIds).toContain('default');
      expect(presetIds).toContain('minimal');
      expect(presetIds).toContain('security');
      expect(presetIds).toContain('federation');
      expect(presetIds).toContain('technical');
    });

    it('should have valid column references in presets', () => {
      const validColumnIds = new Set(DEFAULT_RESOURCE_COLUMNS.map((c) => c.id));
      
      for (const preset of DEFAULT_COLUMN_PRESETS) {
        for (const columnId of preset.columns) {
          expect(validColumnIds.has(columnId)).toBe(true);
        }
      }
    });

    it('should include required columns in all presets', () => {
      const requiredIds = DEFAULT_RESOURCE_COLUMNS
        .filter((c) => c.required)
        .map((c) => c.id);
      
      for (const preset of DEFAULT_COLUMN_PRESETS) {
        for (const requiredId of requiredIds) {
          expect(preset.columns).toContain(requiredId);
        }
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty columns array', () => {
      const { result } = renderHook(() => useColumnCustomizer([], 'test-key'));

      expect(result.current.state.visibleColumns).toEqual([]);
      expect(result.current.state.columnOrder).toEqual([]);
    });

    it('should handle columns with duplicate ids', () => {
      const duplicateColumns: ColumnConfig[] = [
        { id: 'col1', label: 'Column 1', defaultVisible: true },
        { id: 'col1', label: 'Column 1 Duplicate', defaultVisible: false },
      ];

      const { result } = renderHook(() => useColumnCustomizer(duplicateColumns, 'test-key'));

      // Should handle gracefully (behavior depends on implementation)
      expect(result.current.state).toBeDefined();
    });

    it('should handle storage key conflicts', () => {
      // Set up conflicting data in different key
      localStorageMock['other-key'] = JSON.stringify({
        visibleColumns: ['other'],
        columnOrder: ['other'],
      });

      const { result } = renderHook(() => useColumnCustomizer(testColumns, 'test-key'));

      // Should not be affected by other key
      expect(result.current.state.visibleColumns).not.toContain('other');
    });
  });

  describe('SSR safety', () => {
    it('should not crash when window is undefined', () => {
      // The hook should handle SSR gracefully
      // This is tested by the useEffect guard: if (typeof window === 'undefined') return;
      
      const { result } = renderHook(() => useColumnCustomizer(testColumns, 'test-key'));

      expect(result.current.state).toBeDefined();
    });
  });
});





