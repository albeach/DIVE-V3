/**
 * Skeleton Loading Components (2025)
 * 
 * Modern skeleton loading states with:
 * - Shimmer animation effect
 * - Matching component layouts
 * - Reduced layout shift
 * - Accessible loading indicators
 */

'use client';

import React from 'react';

// ============================================
// Base Skeleton Component
// ============================================

interface SkeletonProps {
  className?: string;
  animate?: boolean;
}

export function Skeleton({ className = '', animate = true }: SkeletonProps) {
  return (
    <div
      className={`bg-gray-200 dark:bg-gray-700 rounded ${
        animate ? 'animate-pulse' : ''
      } ${className}`}
      aria-hidden="true"
    />
  );
}

// ============================================
// Shimmer Effect Skeleton
// ============================================

export function ShimmerSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-gray-200 dark:bg-gray-700 rounded ${className}`}>
      <div 
        className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 dark:via-gray-600/40 to-transparent"
        style={{
          animation: 'shimmer 2s infinite',
        }}
      />
      <style jsx>{`
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}

// ============================================
// Resource Card Skeletons
// ============================================

export function ResourceCardSkeletonGrid() {
  return (
    <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5 animate-pulse">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        </div>
        <div className="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded-md" />
      </div>

      {/* Title */}
      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
      <div className="h-6 w-2/3 bg-gray-200 dark:bg-gray-700 rounded mb-3" />

      {/* Resource ID */}
      <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-4" />

      {/* Metadata */}
      <div className="space-y-3">
        <div>
          <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
          <div className="flex gap-1">
            <div className="h-5 w-10 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-5 w-10 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-5 w-10 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
        <div>
          <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
          <div className="flex gap-1">
            <div className="h-5 w-14 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-5 w-14 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-between">
        <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-5 w-5 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    </div>
  );
}

export function ResourceCardSkeletonList() {
  return (
    <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 animate-pulse">
      <div className="flex items-center gap-4">
        {/* Classification Badge */}
        <div className="h-8 w-28 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        
        {/* Title & ID */}
        <div className="flex-1 space-y-2 min-w-0">
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
        </div>

        {/* Metadata */}
        <div className="hidden lg:flex items-center gap-4">
          <div className="flex gap-1">
            <div className="h-5 w-8 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-5 w-8 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
          <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>

        {/* Arrow */}
        <div className="h-5 w-5 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    </div>
  );
}

export function ResourceCardSkeletonCompact() {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-6 w-6 bg-gray-200 dark:bg-gray-700 rounded-full" />
        <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    </div>
  );
}

// ============================================
// Grid Layout Skeletons
// ============================================

interface ResourceGridSkeletonProps {
  viewMode: 'grid' | 'list' | 'compact';
  count?: number;
}

export function ResourceGridSkeleton({ viewMode, count = 6 }: ResourceGridSkeletonProps) {
  const SkeletonComponent = 
    viewMode === 'grid' ? ResourceCardSkeletonGrid :
    viewMode === 'list' ? ResourceCardSkeletonList :
    ResourceCardSkeletonCompact;

  const gridClasses = 
    viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' :
    'space-y-3';

  return (
    <div className={gridClasses} aria-label="Loading resources..." role="status">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonComponent key={index} />
      ))}
      <span className="sr-only">Loading resources...</span>
    </div>
  );
}

// ============================================
// Filter Panel Skeleton
// ============================================

export function FilterPanelSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden animate-pulse">
      {/* Search */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      </div>

      {/* Summary */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between">
          <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>

      {/* Quick Filters */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <div className="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded-md" />
          <div className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded-md" />
          <div className="h-6 w-14 bg-gray-200 dark:bg-gray-700 rounded-md" />
        </div>
      </div>

      {/* Filter Sections */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
          <div className="px-4 py-3 flex justify-between">
            <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// Category Browser Skeleton
// ============================================

export function CategoryBrowserSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden animate-pulse">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4">
        <div className="h-6 w-40 bg-white/30 rounded mb-2" />
        <div className="h-4 w-24 bg-white/20 rounded" />
      </div>

      {/* Sections */}
      {[1, 2, 3].map((section) => (
        <div key={section} className="p-5 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
          <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="space-y-1">
                <div className="flex justify-between">
                  <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// Toolbar Skeleton
// ============================================

export function ToolbarSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm border-2 border-gray-200 dark:border-gray-700 rounded-xl px-5 py-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Sort */}
          <div className="h-9 w-36 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          {/* Results count */}
          <div className="hidden md:flex items-center gap-2">
            <div className="h-6 w-8 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-4 w-6 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-6 w-10 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
        {/* View switcher */}
        <div className="h-9 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      </div>
    </div>
  );
}

// ============================================
// Pagination Skeleton
// ============================================

export function PaginationSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="flex items-center gap-4">
          <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="flex items-center gap-2">
            <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-md" />
            <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Full Page Skeleton
// ============================================

export function ResourcesPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-pulse">
        <div className="h-10 w-64 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
        <div className="h-6 w-96 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
        
        {/* Federation toggle */}
        <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl mb-4">
          <div className="h-7 w-14 bg-gray-200 dark:bg-gray-700 rounded-full" />
          <div className="flex gap-2">
            <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          </div>
        </div>

        {/* Compliance badges */}
        <div className="flex gap-3">
          <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-8 w-28 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        </div>
      </div>

      {/* Search */}
      <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-3 space-y-5">
          <FilterPanelSkeleton />
        </div>

        {/* Main */}
        <div className="lg:col-span-9 space-y-5">
          <ToolbarSkeleton />
          <ResourceGridSkeleton viewMode="grid" count={6} />
          <PaginationSkeleton />
        </div>
      </div>
    </div>
  );
}

// ============================================
// Loading Overlay
// ============================================

export function LoadingOverlay({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-xl">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600 mb-3" />
        <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{message}</p>
      </div>
    </div>
  );
}










