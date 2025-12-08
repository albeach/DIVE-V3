/**
 * Column Customizer Component - Phase 3
 * 
 * Allows users to customize which columns are visible in list view
 * and their order via drag-and-drop.
 * 
 * Features:
 * - Toggle column visibility
 * - Drag-and-drop reordering
 * - Preset configurations
 * - Persistence to localStorage
 * - Reset to defaults
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Settings2, 
  GripVertical, 
  Eye, 
  EyeOff, 
  RotateCcw,
  Check,
  X,
  Columns3,
} from 'lucide-react';

// ============================================
// Types
// ============================================

export interface ColumnConfig {
  id: string;
  label: string;
  description?: string;
  defaultVisible: boolean;
  required?: boolean; // Cannot be hidden
}

export interface ColumnPreset {
  id: string;
  name: string;
  columns: string[];
}

export interface ColumnCustomizerState {
  visibleColumns: string[];
  columnOrder: string[];
}

interface ColumnCustomizerProps {
  /** Available columns configuration */
  columns: ColumnConfig[];
  /** Current state (visible columns and order) */
  state: ColumnCustomizerState;
  /** Called when state changes */
  onChange: (state: ColumnCustomizerState) => void;
  /** Preset configurations */
  presets?: ColumnPreset[];
  /** Storage key for persistence */
  storageKey?: string;
}

interface ColumnCustomizerTriggerProps {
  onClick: () => void;
  activeCount: number;
  totalCount: number;
}

// ============================================
// Default Column Configuration
// ============================================

export const DEFAULT_RESOURCE_COLUMNS: ColumnConfig[] = [
  { id: 'classification', label: 'Classification', defaultVisible: true, required: true },
  { id: 'title', label: 'Title', defaultVisible: true, required: true },
  { id: 'resourceId', label: 'Resource ID', defaultVisible: true },
  { id: 'releasabilityTo', label: 'Releasability', defaultVisible: true },
  { id: 'COI', label: 'Communities', defaultVisible: true },
  { id: 'encrypted', label: 'Encryption', defaultVisible: true },
  { id: 'creationDate', label: 'Created', defaultVisible: false },
  { id: 'originRealm', label: 'Instance', defaultVisible: true },
  { id: 'ztdfVersion', label: 'ZTDF Version', defaultVisible: false },
  { id: 'kaoCount', label: 'Key Objects', defaultVisible: false },
  { id: 'accessIndicator', label: 'Access Status', defaultVisible: true },
];

export const DEFAULT_COLUMN_PRESETS: ColumnPreset[] = [
  {
    id: 'default',
    name: 'Default',
    columns: ['classification', 'title', 'resourceId', 'releasabilityTo', 'COI', 'encrypted', 'originRealm', 'accessIndicator'],
  },
  {
    id: 'minimal',
    name: 'Minimal',
    columns: ['classification', 'title', 'resourceId', 'accessIndicator'],
  },
  {
    id: 'security',
    name: 'Security Focus',
    columns: ['classification', 'title', 'releasabilityTo', 'COI', 'encrypted', 'accessIndicator'],
  },
  {
    id: 'federation',
    name: 'Federation',
    columns: ['classification', 'title', 'originRealm', 'releasabilityTo', 'accessIndicator'],
  },
  {
    id: 'technical',
    name: 'Technical',
    columns: ['classification', 'title', 'resourceId', 'encrypted', 'ztdfVersion', 'kaoCount'],
  },
];

// ============================================
// Hook for Column Customization
// ============================================

export function useColumnCustomizer(
  columns: ColumnConfig[] = DEFAULT_RESOURCE_COLUMNS,
  storageKey: string = 'dive-column-config'
): {
  state: ColumnCustomizerState;
  setState: (state: ColumnCustomizerState) => void;
  reset: () => void;
  applyPreset: (preset: ColumnPreset) => void;
  isColumnVisible: (columnId: string) => boolean;
  getVisibleColumnsInOrder: () => string[];
} {
  const getDefaultState = useCallback((): ColumnCustomizerState => ({
    visibleColumns: columns.filter(c => c.defaultVisible).map(c => c.id),
    columnOrder: columns.map(c => c.id),
  }), [columns]);

  const [state, setStateInternal] = useState<ColumnCustomizerState>(getDefaultState);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as ColumnCustomizerState;
        // Validate and merge with defaults (in case new columns were added)
        const allColumnIds = new Set(columns.map(c => c.id));
        const validVisible = parsed.visibleColumns.filter(id => allColumnIds.has(id));
        const validOrder = parsed.columnOrder.filter(id => allColumnIds.has(id));
        
        // Add any new columns that weren't in storage
        const missingColumns = columns
          .filter(c => !validOrder.includes(c.id))
          .map(c => c.id);
        
        setStateInternal({
          visibleColumns: validVisible,
          columnOrder: [...validOrder, ...missingColumns],
        });
      }
    } catch (error) {
      console.error('Failed to load column config:', error);
    }
  }, [storageKey, columns]);

  // Save to localStorage on change
  const setState = useCallback((newState: ColumnCustomizerState) => {
    setStateInternal(newState);
    
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, JSON.stringify(newState));
      } catch (error) {
        console.error('Failed to save column config:', error);
      }
    }
  }, [storageKey]);

  const reset = useCallback(() => {
    const defaultState = getDefaultState();
    setState(defaultState);
  }, [getDefaultState, setState]);

  const applyPreset = useCallback((preset: ColumnPreset) => {
    setState({
      visibleColumns: preset.columns,
      columnOrder: state.columnOrder, // Keep current order
    });
  }, [setState, state.columnOrder]);

  const isColumnVisible = useCallback((columnId: string) => {
    return state.visibleColumns.includes(columnId);
  }, [state.visibleColumns]);

  const getVisibleColumnsInOrder = useCallback(() => {
    return state.columnOrder.filter(id => state.visibleColumns.includes(id));
  }, [state.columnOrder, state.visibleColumns]);

  return {
    state,
    setState,
    reset,
    applyPreset,
    isColumnVisible,
    getVisibleColumnsInOrder,
  };
}

// ============================================
// Column Item Component (for drag-drop list)
// ============================================

interface ColumnItemProps {
  column: ColumnConfig;
  isVisible: boolean;
  onToggle: () => void;
  isDragging?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

function ColumnItem({ column, isVisible, onToggle, isDragging, dragHandleProps }: ColumnItemProps) {
  return (
    <div
      className={`
        flex items-center gap-3 px-3 py-2 rounded-lg border transition-all
        ${isDragging 
          ? 'bg-blue-50 border-blue-300 shadow-lg' 
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300'
        }
        ${!isVisible ? 'opacity-60' : ''}
      `}
    >
      {/* Drag Handle */}
      <div 
        {...dragHandleProps}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Column Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {column.label}
        </div>
        {column.description && (
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {column.description}
          </div>
        )}
      </div>

      {/* Toggle Button */}
      <button
        onClick={onToggle}
        disabled={column.required}
        className={`
          p-1.5 rounded-lg transition-colors
          ${column.required 
            ? 'text-gray-300 cursor-not-allowed' 
            : isVisible 
              ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30'
              : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }
        `}
        title={column.required ? 'Required column' : isVisible ? 'Hide column' : 'Show column'}
      >
        {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>
    </div>
  );
}

// ============================================
// Main Column Customizer Component
// ============================================

export default function ColumnCustomizer({
  columns,
  state,
  onChange,
  presets = DEFAULT_COLUMN_PRESETS,
  storageKey,
}: ColumnCustomizerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Get columns in current order
  const orderedColumns = state.columnOrder
    .map(id => columns.find(c => c.id === id))
    .filter((c): c is ColumnConfig => c !== undefined);

  // Toggle column visibility
  const toggleColumn = useCallback((columnId: string) => {
    const column = columns.find(c => c.id === columnId);
    if (column?.required) return;

    const newVisible = state.visibleColumns.includes(columnId)
      ? state.visibleColumns.filter(id => id !== columnId)
      : [...state.visibleColumns, columnId];

    onChange({
      ...state,
      visibleColumns: newVisible,
    });
  }, [columns, state, onChange]);

  // Handle drag start
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newOrder = [...state.columnOrder];
    const [draggedItem] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(index, 0, draggedItem);

    onChange({
      ...state,
      columnOrder: newOrder,
    });
    setDraggedIndex(index);
  };

  // Handle drag end
  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Apply preset
  const applyPreset = (preset: ColumnPreset) => {
    onChange({
      ...state,
      visibleColumns: preset.columns,
    });
  };

  // Reset to defaults
  const reset = () => {
    onChange({
      visibleColumns: columns.filter(c => c.defaultVisible).map(c => c.id),
      columnOrder: columns.map(c => c.id),
    });
  };

  const visibleCount = state.visibleColumns.length;
  const totalCount = columns.length;

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors
          ${isOpen 
            ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300'
          }
        `}
      >
        <Columns3 className="w-4 h-4" />
        <span className="text-sm font-medium hidden sm:inline">Columns</span>
        <span className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
          {visibleCount}/{totalCount}
        </span>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-gray-500" />
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  Customize Columns
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Presets */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Presets
              </div>
              <div className="flex flex-wrap gap-1.5">
                {presets.map(preset => {
                  const isActive = preset.columns.length === state.visibleColumns.length &&
                    preset.columns.every(id => state.visibleColumns.includes(id));
                  
                  return (
                    <button
                      key={preset.id}
                      onClick={() => applyPreset(preset)}
                      className={`
                        px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
                        ${isActive
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                        }
                      `}
                    >
                      {preset.name}
                      {isActive && <Check className="w-3 h-3 inline ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Column List */}
            <div className="px-4 py-3 max-h-64 overflow-y-auto">
              <div className="space-y-1.5">
                {orderedColumns.map((column, index) => (
                  <div
                    key={column.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                  >
                    <ColumnItem
                      column={column}
                      isVisible={state.visibleColumns.includes(column.id)}
                      onToggle={() => toggleColumn(column.id)}
                      isDragging={draggedIndex === index}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <button
                onClick={reset}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to Default
              </button>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Drag to reorder
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// Trigger Button (standalone)
// ============================================

export function ColumnCustomizerTrigger({ onClick, activeCount, totalCount }: ColumnCustomizerTriggerProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 transition-colors"
    >
      <Columns3 className="w-4 h-4" />
      <span className="text-sm font-medium hidden sm:inline">Columns</span>
      <span className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
        {activeCount}/{totalCount}
      </span>
    </button>
  );
}







