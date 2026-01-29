/**
 * Standardized Loading States - Single source of truth for all loading indicators
 *
 * Replaces: Custom spinners, PageLoader variations, inline loading states
 *
 * @version 2.0.0
 * @date 2026-01-29
 */

'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export type LoadingSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type LoadingVariant = 'spinner' | 'dots' | 'pulse' | 'bars';

// ============================================
// 1. SPINNER (circular spinner)
// ============================================

export interface SpinnerProps {
  size?: LoadingSize;
  className?: string;
  color?: string;
}

export function Spinner({ size = 'md', className, color = 'currentColor' }: SpinnerProps) {
  const sizeMap = {
    xs: 'h-3 w-3 border',
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-3',
    xl: 'h-16 w-16 border-4',
  };

  return (
    <div
      className={cn(
        'inline-block animate-spin rounded-full border-current border-t-transparent',
        sizeMap[size],
        className
      )}
      style={{ color }}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

// ============================================
// 2. DOTS (three bouncing dots)
// ============================================

export interface LoadingDotsProps {
  size?: LoadingSize;
  className?: string;
}

export function LoadingDots({ size = 'md', className }: LoadingDotsProps) {
  const sizeMap = {
    xs: 'h-1 w-1',
    sm: 'h-1.5 w-1.5',
    md: 'h-2 w-2',
    lg: 'h-3 w-3',
    xl: 'h-4 w-4',
  };

  const gapMap = {
    xs: 'gap-1',
    sm: 'gap-1',
    md: 'gap-1.5',
    lg: 'gap-2',
    xl: 'gap-2.5',
  };

  return (
    <div className={cn('flex items-center', gapMap[size], className)} role="status" aria-label="Loading">
      <motion.div
        className={cn('rounded-full bg-current', sizeMap[size])}
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className={cn('rounded-full bg-current', sizeMap[size])}
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: 0.1 }}
      />
      <motion.div
        className={cn('rounded-full bg-current', sizeMap[size])}
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
      />
      <span className="sr-only">Loading...</span>
    </div>
  );
}

// ============================================
// 3. PULSE (pulsing circle)
// ============================================

export interface LoadingPulseProps {
  size?: LoadingSize;
  className?: string;
}

export function LoadingPulse({ size = 'md', className }: LoadingPulseProps) {
  const sizeMap = {
    xs: 'h-3 w-3',
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  };

  return (
    <div className="relative inline-flex" role="status" aria-label="Loading">
      <motion.div
        className={cn('rounded-full bg-blue-500', sizeMap[size], className)}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [1, 0.7, 1],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <span className="sr-only">Loading...</span>
    </div>
  );
}

// ============================================
// 4. BARS (animated bars - audio wave style)
// ============================================

export interface LoadingBarsProps {
  size?: LoadingSize;
  className?: string;
}

export function LoadingBars({ size = 'md', className }: LoadingBarsProps) {
  const heightMap = {
    xs: 'h-3',
    sm: 'h-4',
    md: 'h-6',
    lg: 'h-8',
    xl: 'h-12',
  };

  const widthMap = {
    xs: 'w-1',
    sm: 'w-1',
    md: 'w-1.5',
    lg: 'w-2',
    xl: 'w-3',
  };

  return (
    <div className={cn('flex items-center gap-1', className)} role="status" aria-label="Loading">
      {[0, 0.1, 0.2, 0.3].map((delay, i) => (
        <motion.div
          key={i}
          className={cn('rounded-full bg-current', widthMap[size])}
          style={{ height: '100%' }}
          animate={{ scaleY: [0.3, 1, 0.3] }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            ease: 'easeInOut',
            delay,
          }}
        >
          <div className={heightMap[size]} />
        </motion.div>
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
}

// ============================================
// 5. PAGE LOADER (full page loading overlay)
// ============================================

export interface PageLoaderProps {
  message?: string;
  variant?: LoadingVariant;
  size?: LoadingSize;
}

export function PageLoader({ message = 'Loading...', variant = 'spinner', size = 'lg' }: PageLoaderProps) {
  const LoaderComponent = {
    spinner: Spinner,
    dots: LoadingDots,
    pulse: LoadingPulse,
    bars: LoadingBars,
  }[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <LoaderComponent size={size} className="text-blue-600 dark:text-blue-400" />
        {message && (
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================
// 6. SKELETON (content placeholder)
// ============================================

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rect' | 'circle';
  width?: string | number;
  height?: string | number;
  count?: number;
}

export function Skeleton({
  className,
  variant = 'text',
  width,
  height,
  count = 1,
}: SkeletonProps) {
  const variantStyles = {
    text: 'h-4 rounded',
    rect: 'h-20 rounded-lg',
    circle: 'rounded-full',
  };

  const skeletonStyle = {
    width: width ? (typeof width === 'number' ? `${width}px` : width) : undefined,
    height: height ? (typeof height === 'number' ? `${height}px` : height) : undefined,
  };

  if (count > 1) {
    return (
      <div className="space-y-2">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'animate-pulse bg-gray-200 dark:bg-slate-700',
              variantStyles[variant],
              className
            )}
            style={skeletonStyle}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'animate-pulse bg-gray-200 dark:bg-slate-700',
        variantStyles[variant],
        className
      )}
      style={skeletonStyle}
    />
  );
}

// ============================================
// 7. SKELETON GROUP (common patterns)
// ============================================

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          width={i === lines - 1 ? '75%' : '100%'}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg space-y-4">
      <div className="flex items-start gap-3">
        <Skeleton variant="circle" width={40} height={40} />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="40%" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-4 pb-2 border-b border-gray-200 dark:border-slate-700">
        <Skeleton variant="text" width="25%" />
        <Skeleton variant="text" width="35%" />
        <Skeleton variant="text" width="20%" />
        <Skeleton variant="text" width="20%" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton variant="text" width="25%" />
          <Skeleton variant="text" width="35%" />
          <Skeleton variant="text" width="20%" />
          <Skeleton variant="text" width="20%" />
        </div>
      ))}
    </div>
  );
}

// ============================================
// 8. INLINE LOADER (small loading indicators)
// ============================================

export interface InlineLoaderProps {
  message?: string;
  variant?: LoadingVariant;
  size?: LoadingSize;
  className?: string;
}

export function InlineLoader({
  message,
  variant = 'spinner',
  size = 'sm',
  className,
}: InlineLoaderProps) {
  const LoaderComponent = {
    spinner: Spinner,
    dots: LoadingDots,
    pulse: LoadingPulse,
    bars: LoadingBars,
  }[variant];

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <LoaderComponent size={size} />
      {message && (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {message}
        </span>
      )}
    </div>
  );
}

// ============================================
// 9. BUTTON LOADER (for loading buttons)
// ============================================

export interface ButtonLoaderProps {
  loading: boolean;
  children: ReactNode;
  loadingText?: string;
  variant?: 'spinner' | 'dots';
  size?: LoadingSize;
  className?: string;
}

export function ButtonLoader({
  loading,
  children,
  loadingText,
  variant = 'spinner',
  size = 'xs',
  className,
}: ButtonLoaderProps) {
  if (!loading) {
    return <>{children}</>;
  }

  const LoaderComponent = variant === 'spinner' ? Spinner : LoadingDots;

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LoaderComponent size={size} />
      {loadingText || children}
    </span>
  );
}

// ============================================
// 10. LOADING OVERLAY (section loading)
// ============================================

export interface LoadingOverlayProps {
  loading: boolean;
  children: ReactNode;
  message?: string;
  variant?: LoadingVariant;
  size?: LoadingSize;
  className?: string;
}

export function LoadingOverlay({
  loading,
  children,
  message,
  variant = 'spinner',
  size = 'md',
  className,
}: LoadingOverlayProps) {
  if (!loading) {
    return <>{children}</>;
  }

  const LoaderComponent = {
    spinner: Spinner,
    dots: LoadingDots,
    pulse: LoadingPulse,
    bars: LoadingBars,
  }[variant];

  return (
    <div className={cn('relative', className)}>
      <div className="opacity-50 pointer-events-none">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-2">
          <LoaderComponent size={size} className="text-blue-600 dark:text-blue-400" />
          {message && (
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
