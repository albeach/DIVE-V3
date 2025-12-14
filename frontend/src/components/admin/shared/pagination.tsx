/**
 * Advanced Pagination Component
 * 
 * Features:
 * - Page navigation
 * - Page size selector
 * - Jump to page
 * - Keyboard navigation
 * - Responsive design
 */

'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MoreHorizontal,
} from 'lucide-react';

// ============================================
// Types
// ============================================

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  showPageSizeSelector?: boolean;
  showQuickJump?: boolean;
  showItemRange?: boolean;
  compact?: boolean;
  className?: string;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

// ============================================
// Hook
// ============================================

export function usePagination<T>(
  items: T[],
  initialPageSize = 10
): {
  paginatedItems: T[];
  pagination: PaginationState;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  firstPage: () => void;
  lastPage: () => void;
} {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Reset to page 1 when items change significantly
  useEffect(() => {
    if (page > totalPages) {
      setPage(Math.max(1, totalPages));
    }
  }, [page, totalPages]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return items.slice(start, end);
  }, [items, page, pageSize]);

  const handleSetPage = useCallback((newPage: number) => {
    setPage(Math.max(1, Math.min(newPage, totalPages)));
  }, [totalPages]);

  const handleSetPageSize = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1); // Reset to first page when changing page size
  }, []);

  return {
    paginatedItems,
    pagination: { page, pageSize, totalItems, totalPages },
    setPage: handleSetPage,
    setPageSize: handleSetPageSize,
    nextPage: () => handleSetPage(page + 1),
    prevPage: () => handleSetPage(page - 1),
    firstPage: () => handleSetPage(1),
    lastPage: () => handleSetPage(totalPages),
  };
}

// ============================================
// Component
// ============================================

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  showPageSizeSelector = true,
  showQuickJump = true,
  showItemRange = true,
  compact = false,
  className = '',
}: PaginationProps) {
  const [jumpValue, setJumpValue] = useState('');

  // Calculate item range
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers to show
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = compact ? 3 : 5;
    const sidePages = Math.floor(maxVisible / 2);

    if (totalPages <= maxVisible + 2) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      const startPage = Math.max(2, currentPage - sidePages);
      const endPage = Math.min(totalPages - 1, currentPage + sidePages);

      if (startPage > 2) {
        pages.push('ellipsis');
      }

      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }

      if (endPage < totalPages - 1) {
        pages.push('ellipsis');
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  };

  const handleJump = () => {
    const pageNum = parseInt(jumpValue, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum);
      setJumpValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleJump();
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      if (e.key === 'ArrowLeft' && currentPage > 1) {
        onPageChange(currentPage - 1);
      } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
        onPageChange(currentPage + 1);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentPage, totalPages, onPageChange]);

  if (totalPages <= 1 && !showPageSizeSelector) {
    return null;
  }

  const pageNumbers = getPageNumbers();

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-4 ${className}`}
    >
      {/* Left side: Item range and page size */}
      <div className="flex items-center gap-4">
        {showItemRange && (
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Showing <span className="font-medium">{startItem}</span> to{' '}
            <span className="font-medium">{endItem}</span> of{' '}
            <span className="font-medium">{totalItems}</span>
          </span>
        )}

        {showPageSizeSelector && onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Show
            </span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right side: Page navigation */}
      <div className="flex items-center gap-1">
        {/* First page */}
        {!compact && (
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="First page"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
        )}

        {/* Previous page */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-1">
          {pageNumbers.map((page, index) =>
            page === 'ellipsis' ? (
              <span
                key={`ellipsis-${index}`}
                className="px-2 text-gray-400 dark:text-gray-500"
              >
                <MoreHorizontal className="w-4 h-4" />
              </span>
            ) : (
              <motion.button
                key={page}
                whileTap={{ scale: 0.95 }}
                onClick={() => onPageChange(page)}
                className={`min-w-[36px] h-9 px-3 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === page
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {page}
              </motion.button>
            )
          )}
        </div>

        {/* Next page */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Last page */}
        {!compact && (
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Last page"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        )}

        {/* Quick jump */}
        {showQuickJump && totalPages > 5 && !compact && (
          <div className="flex items-center gap-2 ml-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Go to
            </span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleJump}
              placeholder="#"
              className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Server-Side Pagination Hook
// ============================================

interface ServerPaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
  onFetch: (params: { page: number; pageSize: number }) => Promise<{ items: unknown[]; total: number }>;
}

export function useServerPagination<T>({
  initialPage = 1,
  initialPageSize = 10,
  onFetch,
}: ServerPaginationOptions) {
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await onFetch({ page, pageSize });
      setItems(result.items as T[]);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, onFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(Math.max(1, Math.min(newPage, totalPages)));
  }, [totalPages]);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  }, []);

  return {
    items,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: total,
      pageSize,
    },
    isLoading,
    error,
    refetch: fetchData,
    onPageChange: handlePageChange,
    onPageSizeChange: handlePageSizeChange,
  };
}

export default Pagination;

