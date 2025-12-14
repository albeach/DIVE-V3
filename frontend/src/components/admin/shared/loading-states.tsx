/**
 * Global Loading & Transition States
 * 
 * Consistent loading indicators across all admin pages:
 * - Page skeleton loaders
 * - Inline loading spinners
 * - Progress bars
 * - Transition overlays
 */

'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, RefreshCw } from 'lucide-react';

// ============================================
// Page-Level Loaders
// ============================================

interface PageLoaderProps {
  message?: string;
  submessage?: string;
}

export function PageLoader({ message = 'Loading...', submessage }: PageLoaderProps) {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="inline-block h-12 w-12 rounded-full border-4 border-blue-500 border-t-transparent"
        />
        <p className="mt-4 text-lg font-medium text-gray-700">{message}</p>
        {submessage && (
          <p className="mt-1 text-sm text-gray-500">{submessage}</p>
        )}
      </motion.div>
    </div>
  );
}

export function FullPageLoader({ message = 'Loading...', submessage }: PageLoaderProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
      <PageLoader message={message} submessage={submessage} />
    </div>
  );
}

// ============================================
// Skeleton Loaders
// ============================================

interface SkeletonProps {
  className?: string;
  animate?: boolean;
}

export function Skeleton({ className = '', animate = true }: SkeletonProps) {
  return (
    <div
      className={`bg-gray-200 rounded ${animate ? 'animate-pulse' : ''} ${className}`}
    />
  );
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <SkeletonText lines={3} />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-20 rounded-lg" />
        <Skeleton className="h-9 w-20 rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
        <div className="flex gap-4">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
      </div>
      {/* Rows */}
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="px-6 py-4">
            <div className="flex items-center gap-4">
              {Array.from({ length: columns }).map((_, colIndex) => (
                <Skeleton
                  key={colIndex}
                  className={`h-4 flex-1 ${colIndex === 0 ? 'w-1/4' : ''}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl shadow-lg border border-slate-200 p-6"
        >
          <Skeleton className="h-8 w-16 mb-2" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

// ============================================
// Inline Loaders
// ============================================

interface InlineLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

export function Spinner({ size = 'md', className = '' }: InlineLoaderProps) {
  return (
    <Loader2
      className={`animate-spin text-blue-600 ${sizeClasses[size]} ${className}`}
    />
  );
}

export function LoadingDots({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-current"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.2,
          }}
        />
      ))}
    </span>
  );
}

// ============================================
// Button Loading State
// ============================================

interface LoadingButtonProps {
  loading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'danger';
}

const variantClasses = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300',
  secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
};

export function LoadingButton({
  loading = false,
  loadingText,
  children,
  className = '',
  disabled = false,
  onClick,
  type = 'button',
  variant = 'primary',
}: LoadingButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${variantClasses[variant]} ${className}`}
    >
      {loading && <Spinner size="sm" className="text-current" />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

// ============================================
// Progress Bar
// ============================================

interface ProgressBarProps {
  progress: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'green' | 'amber' | 'red';
  className?: string;
}

const progressSizes = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

const progressColors = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
};

export function ProgressBar({
  progress,
  showLabel = false,
  size = 'md',
  color = 'blue',
  className = '',
}: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className={className}>
      {showLabel && (
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Progress</span>
          <span>{Math.round(clampedProgress)}%</span>
        </div>
      )}
      <div className={`bg-gray-200 rounded-full overflow-hidden ${progressSizes[size]}`}>
        <motion.div
          className={`h-full rounded-full ${progressColors[color]}`}
          initial={{ width: 0 }}
          animate={{ width: `${clampedProgress}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

// ============================================
// Transition Overlay
// ============================================

interface TransitionOverlayProps {
  show: boolean;
  message?: string;
}

export function TransitionOverlay({ show, message = 'Processing...' }: TransitionOverlayProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-40 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-xl"
        >
          <div className="flex items-center gap-3">
            <Spinner size="lg" />
            <span className="text-gray-700 font-medium">{message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================
// Refresh Button
// ============================================

interface RefreshButtonProps {
  onClick: () => void;
  loading?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function RefreshButton({
  onClick,
  loading = false,
  className = '',
  size = 'md',
}: RefreshButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors ${className}`}
    >
      <RefreshCw className={`${sizeClasses[size]} ${loading ? 'animate-spin' : ''}`} />
      {size !== 'sm' && 'Refresh'}
    </button>
  );
}

// ============================================
// Loading Wrapper
// ============================================

interface LoadingWrapperProps {
  loading: boolean;
  skeleton?: React.ReactNode;
  children: React.ReactNode;
  minHeight?: string;
}

export function LoadingWrapper({
  loading,
  skeleton,
  children,
  minHeight = '200px',
}: LoadingWrapperProps) {
  if (loading) {
    return skeleton || (
      <div className="flex items-center justify-center" style={{ minHeight }}>
        <Spinner size="lg" />
      </div>
    );
  }
  return <>{children}</>;
}

export default {
  PageLoader,
  FullPageLoader,
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonTable,
  SkeletonStats,
  Spinner,
  LoadingDots,
  LoadingButton,
  ProgressBar,
  TransitionOverlay,
  RefreshButton,
  LoadingWrapper,
};

