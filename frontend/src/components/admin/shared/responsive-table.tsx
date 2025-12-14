/**
 * Mobile Responsive Table Component
 * 
 * Provides responsive data tables that:
 * - Display as cards on mobile
 * - Full table on desktop
 * - Sortable columns
 * - Row selection
 * - Expandable rows
 */

'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Check,
  Minus,
  MoreHorizontal,
} from 'lucide-react';

// ============================================
// Types
// ============================================

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  sortable?: boolean;
  hideOnMobile?: boolean;
  priority?: number; // Lower = shown on mobile, higher = hidden
  render?: (value: unknown, row: T, index: number) => React.ReactNode;
  mobileRender?: (value: unknown, row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
}

export interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyField: keyof T;
  loading?: boolean;
  selectable?: boolean;
  selectedRows?: Set<string | number>;
  onSelectionChange?: (selected: Set<string | number>) => void;
  expandable?: boolean;
  renderExpanded?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  className?: string;
  stickyHeader?: boolean;
  striped?: boolean;
  compact?: boolean;
}

type SortDirection = 'asc' | 'desc' | null;

// ============================================
// Component
// ============================================

export function ResponsiveTable<T extends Record<string, unknown>>({
  data,
  columns,
  keyField,
  loading = false,
  selectable = false,
  selectedRows = new Set(),
  onSelectionChange,
  expandable = false,
  renderExpanded,
  onRowClick,
  emptyMessage = 'No data available',
  className = '',
  stickyHeader = false,
  striped = false,
  compact = false,
}: ResponsiveTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string | number>>(new Set());

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

  // Handle expand
  const toggleExpand = (rowKey: string | number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(rowKey)) {
      newExpanded.delete(rowKey);
    } else {
      newExpanded.add(rowKey);
    }
    setExpandedRows(newExpanded);
  };

  // Filter columns for mobile (show only priority <= 2)
  const mobileColumns = columns.filter(col => !col.hideOnMobile && (col.priority === undefined || col.priority <= 2));
  const hiddenColumns = columns.filter(col => col.hideOnMobile || (col.priority !== undefined && col.priority > 2));

  const isAllSelected = data.length > 0 && selectedRows.size === data.length;
  const isSomeSelected = selectedRows.size > 0 && selectedRows.size < data.length;

  // Loading state
  if (loading) {
    return (
      <div className={`bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden ${className}`}>
        <div className="animate-pulse">
          <div className="bg-gray-100 h-12 border-b border-gray-200" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-4">
                <div className="h-4 bg-gray-200 rounded w-1/4" />
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="h-4 bg-gray-200 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className={`bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center ${className}`}>
        <div className="text-gray-400 mb-2">
          <MoreHorizontal className="w-12 h-12 mx-auto" />
        </div>
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden ${className}`}>
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className={`bg-gray-50 border-b border-gray-200 ${stickyHeader ? 'sticky top-0 z-10' : ''}`}>
            <tr>
              {/* Expand column */}
              {expandable && <th className="w-10 px-4 py-3" />}
              
              {/* Select column */}
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <button
                    onClick={handleSelectAll}
                    className="flex items-center justify-center w-5 h-5 rounded border border-gray-300 hover:border-blue-500 transition-colors"
                  >
                    {isAllSelected ? (
                      <Check className="w-3 h-3 text-blue-600" />
                    ) : isSomeSelected ? (
                      <Minus className="w-3 h-3 text-blue-600" />
                    ) : null}
                  </button>
                </th>
              )}

              {/* Data columns */}
              {columns.map(column => (
                <th
                  key={column.key}
                  className={`px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider ${
                    column.align === 'center' ? 'text-center' :
                    column.align === 'right' ? 'text-right' : 'text-left'
                  } ${column.sortable ? 'cursor-pointer hover:bg-gray-100 select-none' : ''}`}
                  style={{ width: column.width }}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className={`flex items-center gap-1 ${column.align === 'right' ? 'justify-end' : column.align === 'center' ? 'justify-center' : ''}`}>
                    {column.header}
                    {column.sortable && sortKey === column.key && (
                      sortDirection === 'asc' ? (
                        <ChevronUp className="w-4 h-4 text-blue-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-blue-600" />
                      )
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedData.map((row, index) => {
              const rowKey = getRowKey(row);
              const isSelected = selectedRows.has(rowKey);
              const isExpanded = expandedRows.has(rowKey);

              return (
                <React.Fragment key={rowKey}>
                  <tr
                    className={`
                      ${onRowClick ? 'cursor-pointer' : ''}
                      ${isSelected ? 'bg-blue-50' : striped && index % 2 === 1 ? 'bg-gray-50' : 'bg-white'}
                      hover:bg-gray-50 transition-colors
                    `}
                    onClick={() => onRowClick?.(row)}
                  >
                    {/* Expand button */}
                    {expandable && (
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(rowKey);
                          }}
                          className="p-1 hover:bg-gray-200 rounded transition-colors"
                        >
                          <motion.div
                            animate={{ rotate: isExpanded ? 90 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <ChevronRight className="w-4 h-4 text-gray-500" />
                          </motion.div>
                        </button>
                      </td>
                    )}

                    {/* Select checkbox */}
                    {selectable && (
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectRow(rowKey);
                          }}
                          className={`flex items-center justify-center w-5 h-5 rounded border transition-colors ${
                            isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 hover:border-blue-500'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </button>
                      </td>
                    )}

                    {/* Data cells */}
                    {columns.map(column => (
                      <td
                        key={column.key}
                        className={`px-6 ${compact ? 'py-2' : 'py-4'} text-sm ${
                          column.align === 'center' ? 'text-center' :
                          column.align === 'right' ? 'text-right' : 'text-left'
                        }`}
                      >
                        {column.render
                          ? column.render(row[column.key], row, index)
                          : String(row[column.key] ?? '')}
                      </td>
                    ))}
                  </tr>

                  {/* Expanded content */}
                  <AnimatePresence>
                    {expandable && isExpanded && renderExpanded && (
                      <motion.tr
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        <td colSpan={columns.length + (selectable ? 1 : 0) + 1} className="bg-gray-50 px-6 py-4">
                          {renderExpanded(row)}
                        </td>
                      </motion.tr>
                    )}
                  </AnimatePresence>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden divide-y divide-gray-100">
        {sortedData.map((row, index) => {
          const rowKey = getRowKey(row);
          const isSelected = selectedRows.has(rowKey);
          const isExpanded = expandedRows.has(rowKey);

          return (
            <div
              key={rowKey}
              className={`p-4 ${isSelected ? 'bg-blue-50' : ''} ${onRowClick ? 'cursor-pointer active:bg-gray-50' : ''}`}
              onClick={() => onRowClick?.(row)}
            >
              {/* Header row with select/expand */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {selectable && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectRow(rowKey);
                      }}
                      className={`flex items-center justify-center w-5 h-5 rounded border transition-colors ${
                        isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </button>
                  )}
                  {/* Primary column (first visible) */}
                  <div className="font-medium text-gray-900">
                    {mobileColumns[0]?.mobileRender
                      ? mobileColumns[0].mobileRender(row[mobileColumns[0].key], row, index)
                      : mobileColumns[0]?.render
                      ? mobileColumns[0].render(row[mobileColumns[0].key], row, index)
                      : String(row[mobileColumns[0]?.key] ?? '')}
                  </div>
                </div>
                {expandable && hiddenColumns.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(rowKey);
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown className="w-5 h-5" />
                    </motion.div>
                  </button>
                )}
              </div>

              {/* Visible columns as key-value pairs */}
              <div className="space-y-2 text-sm">
                {mobileColumns.slice(1).map(column => (
                  <div key={column.key} className="flex justify-between">
                    <span className="text-gray-500">{column.header}</span>
                    <span className="text-gray-900 font-medium">
                      {column.mobileRender
                        ? column.mobileRender(row[column.key], row, index)
                        : column.render
                        ? column.render(row[column.key], row, index)
                        : String(row[column.key] ?? '-')}
                    </span>
                  </div>
                ))}
              </div>

              {/* Expanded hidden columns */}
              <AnimatePresence>
                {isExpanded && hiddenColumns.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 pt-3 border-t border-gray-200 space-y-2 text-sm"
                  >
                    {hiddenColumns.map(column => (
                      <div key={column.key} className="flex justify-between">
                        <span className="text-gray-500">{column.header}</span>
                        <span className="text-gray-900">
                          {column.mobileRender
                            ? column.mobileRender(row[column.key], row, index)
                            : column.render
                            ? column.render(row[column.key], row, index)
                            : String(row[column.key] ?? '-')}
                        </span>
                      </div>
                    ))}
                    {renderExpanded && (
                      <div className="pt-2">
                        {renderExpanded(row)}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ResponsiveTable;

