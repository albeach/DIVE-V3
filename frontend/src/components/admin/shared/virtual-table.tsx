/**
 * Virtualized Table Component
 * 
 * High-performance table for large datasets:
 * - Only renders visible rows
 * - Smooth scrolling
 * - Fixed headers
 * - Dynamic row heights
 */

'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronUp, ChevronDown, Check, Minus } from 'lucide-react';

// ============================================
// Types
// ============================================

export interface VirtualColumn<T> {
  key: string;
  header: string;
  width: number | string;
  minWidth?: number;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  render?: (value: unknown, row: T, index: number) => React.ReactNode;
}

interface VirtualTableProps<T> {
  data: T[];
  columns: VirtualColumn<T>[];
  keyField: keyof T;
  rowHeight?: number;
  overscan?: number; // Extra rows to render above/below visible area
  selectable?: boolean;
  selectedRows?: Set<string | number>;
  onSelectionChange?: (selected: Set<string | number>) => void;
  onRowClick?: (row: T) => void;
  maxHeight?: number | string;
  stickyHeader?: boolean;
  striped?: boolean;
  className?: string;
  emptyMessage?: string;
}

type SortDirection = 'asc' | 'desc' | null;

// ============================================
// Virtual Table Component
// ============================================

export function VirtualTable<T extends Record<string, unknown>>({
  data,
  columns,
  keyField,
  rowHeight = 48,
  overscan = 5,
  selectable = false,
  selectedRows = new Set(),
  onSelectionChange,
  onRowClick,
  maxHeight = 600,
  stickyHeader = true,
  striped = false,
  className = '',
  emptyMessage = 'No data available',
}: VirtualTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Get row key
  const getRowKey = (row: T): string | number => {
    const key = row[keyField];
    return typeof key === 'string' || typeof key === 'number' ? key : String(key);
  };

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortKey, sortDirection]);

  // Calculate visible range
  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / rowHeight) + overscan * 2;
    const endIndex = Math.min(sortedData.length, startIndex + visibleCount);

    return { startIndex, endIndex };
  }, [scrollTop, containerHeight, rowHeight, overscan, sortedData.length]);

  // Total height for scroll
  const totalHeight = sortedData.length * rowHeight;

  // Update container height on mount/resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      setContainerHeight(container.clientHeight);
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Handle sort
  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortKey(null);
        setSortDirection(null);
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  // Handle selection
  const handleSelectAll = () => {
    if (!onSelectionChange) return;

    if (selectedRows.size === data.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map(row => getRowKey(row))));
    }
  };

  const handleSelectRow = (rowKey: string | number) => {
    if (!onSelectionChange) return;

    const newSelected = new Set(selectedRows);
    if (newSelected.has(rowKey)) {
      newSelected.delete(rowKey);
    } else {
      newSelected.add(rowKey);
    }
    onSelectionChange(newSelected);
  };

  const isAllSelected = data.length > 0 && selectedRows.size === data.length;
  const isSomeSelected = selectedRows.size > 0 && selectedRows.size < data.length;

  // Visible rows
  const visibleRows = sortedData.slice(visibleRange.startIndex, visibleRange.endIndex);

  // Empty state
  if (data.length === 0) {
    return (
      <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center ${className}`}>
        <p className="text-gray-500 dark:text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      className={`bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div
        className={`bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 ${
          stickyHeader ? 'sticky top-0 z-10' : ''
        }`}
      >
        <div className="flex" style={{ height: rowHeight }}>
          {/* Select column */}
          {selectable && (
            <div className="flex items-center justify-center px-4" style={{ width: 48 }}>
              <button
                onClick={handleSelectAll}
                className="flex items-center justify-center w-5 h-5 rounded border border-gray-300 dark:border-gray-600 hover:border-blue-500 transition-colors"
              >
                {isAllSelected ? (
                  <Check className="w-3 h-3 text-blue-600" />
                ) : isSomeSelected ? (
                  <Minus className="w-3 h-3 text-blue-600" />
                ) : null}
              </button>
            </div>
          )}

          {/* Column headers */}
          {columns.map(column => (
            <div
              key={column.key}
              className={`flex items-center px-4 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider ${
                column.align === 'center' ? 'justify-center' :
                column.align === 'right' ? 'justify-end' : 'justify-start'
              } ${column.sortable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none' : ''}`}
              style={{ 
                width: column.width, 
                minWidth: column.minWidth,
                flexShrink: typeof column.width === 'number' ? 0 : 1,
              }}
              onClick={() => column.sortable && handleSort(column.key)}
            >
              <span>{column.header}</span>
              {column.sortable && sortKey === column.key && (
                sortDirection === 'asc' ? (
                  <ChevronUp className="w-4 h-4 ml-1 text-blue-600" />
                ) : (
                  <ChevronDown className="w-4 h-4 ml-1 text-blue-600" />
                )
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Virtualized body */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="overflow-auto"
        style={{ maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          {visibleRows.map((row, localIndex) => {
            const globalIndex = visibleRange.startIndex + localIndex;
            const rowKey = getRowKey(row);
            const isSelected = selectedRows.has(rowKey);

            return (
              <div
                key={rowKey}
                className={`absolute w-full flex border-b border-gray-100 dark:border-gray-800 ${
                  onRowClick ? 'cursor-pointer' : ''
                } ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30' : striped && globalIndex % 2 === 1 ? 'bg-gray-50 dark:bg-gray-800/50' : ''
                } hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors`}
                style={{
                  height: rowHeight,
                  top: globalIndex * rowHeight,
                }}
                onClick={() => onRowClick?.(row)}
              >
                {/* Select checkbox */}
                {selectable && (
                  <div className="flex items-center justify-center px-4" style={{ width: 48 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectRow(rowKey);
                      }}
                      className={`flex items-center justify-center w-5 h-5 rounded border transition-colors ${
                        isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-600 hover:border-blue-500'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </button>
                  </div>
                )}

                {/* Data cells */}
                {columns.map(column => (
                  <div
                    key={column.key}
                    className={`flex items-center px-4 text-sm text-gray-900 dark:text-gray-100 ${
                      column.align === 'center' ? 'justify-center' :
                      column.align === 'right' ? 'justify-end' : 'justify-start'
                    }`}
                    style={{ 
                      width: column.width,
                      minWidth: column.minWidth,
                      flexShrink: typeof column.width === 'number' ? 0 : 1,
                    }}
                  >
                    {column.render
                      ? column.render(row[column.key], row, globalIndex)
                      : String(row[column.key] ?? '')}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer with count */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        Showing {visibleRange.startIndex + 1} - {Math.min(visibleRange.endIndex, sortedData.length)} of {sortedData.length} rows
      </div>
    </div>
  );
}

export default VirtualTable;
