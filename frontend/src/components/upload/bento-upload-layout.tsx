/**
 * Bento Grid Upload Layout - 2026 Modern UI
 *
 * Responsive Bento Grid layout for the upload page with:
 * - Dynamic grid sizing (1-4 columns based on viewport)
 * - Smooth transitions between states
 * - Progressive disclosure (cards reveal as user progresses)
 * - Mobile-first responsive breakpoints
 * - Framer Motion animations
 */

'use client';

import { ReactNode, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type UploadState =
  | 'idle'
  | 'file_selected'
  | 'metadata_complete'
  | 'classification_set'
  | 'ready_to_upload'
  | 'uploading'
  | 'success'
  | 'error';

interface BentoCardProps {
  children: ReactNode;
  className?: string;
  colSpan?: 1 | 2 | 3;
  rowSpan?: 1 | 2;
  delay?: number;
  visible?: boolean;
  id: string;
  label?: string;
}

interface BentoUploadLayoutProps {
  children: ReactNode;
  state: UploadState;
  className?: string;
}

// Animation variants for cards
const cardVariants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95,
  },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 25,
      delay: delay * 0.1,
    },
  }),
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: {
      duration: 0.15,
    },
  },
};

// Reduced motion variants
const reducedMotionVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

/**
 * Individual Bento Card with responsive column spanning
 */
export function BentoCard({
  children,
  className,
  colSpan = 1,
  rowSpan = 1,
  delay = 0,
  visible = true,
  id,
  label,
}: BentoCardProps) {
  const shouldReduceMotion = useReducedMotion();

  const colSpanClasses = {
    1: 'col-span-1',
    2: 'col-span-1 md:col-span-2',
    3: 'col-span-1 md:col-span-2 lg:col-span-3',
  };

  const rowSpanClasses = {
    1: 'row-span-1',
    2: 'row-span-1 md:row-span-2',
  };

  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.div
          key={id}
          custom={delay}
          variants={shouldReduceMotion ? reducedMotionVariants : cardVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className={cn(
            'relative overflow-hidden rounded-2xl',
            'bg-white dark:bg-gray-800',
            'border border-gray-200 dark:border-gray-700',
            'shadow-sm hover:shadow-lg',
            'transition-shadow duration-300',
            colSpanClasses[colSpan],
            rowSpanClasses[rowSpan],
            className
          )}
          role="region"
          aria-label={label}
        >
          {/* Subtle gradient overlay for depth */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent dark:from-gray-700/30 pointer-events-none" />

          {/* Card content */}
          <div className="relative z-10 h-full">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Card Header Component
 */
export function BentoCardHeader({
  icon,
  title,
  subtitle,
  badge,
  className,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between p-4 pb-2', className)}>
      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
          )}
        </div>
      </div>
      {badge && <div>{badge}</div>}
    </div>
  );
}

/**
 * Card Content Component
 */
export function BentoCardContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('px-4 pb-4', className)}>
      {children}
    </div>
  );
}

/**
 * Main Bento Grid Layout Container
 */
export function BentoUploadLayout({
  children,
  state,
  className,
}: BentoUploadLayoutProps) {
  const shouldReduceMotion = useReducedMotion();

  // Determine which sections should be visible based on state
  const visibilityConfig = useMemo(() => {
    const config = {
      fileDropzone: true, // Always visible
      preview: true, // Always visible in sidebar
      metadata: state !== 'idle',
      classification: ['metadata_complete', 'classification_set', 'ready_to_upload', 'uploading', 'success'].includes(state),
      releasability: ['classification_set', 'ready_to_upload', 'uploading', 'success'].includes(state),
      coi: ['classification_set', 'ready_to_upload', 'uploading', 'success'].includes(state),
      caveats: ['classification_set', 'ready_to_upload', 'uploading', 'success'].includes(state),
      actions: state !== 'idle',
      progress: state === 'uploading' || state === 'success',
    };
    return config;
  }, [state]);

  return (
    <div className={cn('relative', className)}>
      {/* Ambient Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <motion.div
          className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-gradient-to-br from-blue-100/30 to-indigo-100/30 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-full blur-3xl"
          animate={
            shouldReduceMotion
              ? {}
              : {
                  scale: [1, 1.1, 1],
                  opacity: [0.3, 0.4, 0.3],
                }
          }
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute bottom-1/3 left-1/4 w-[400px] h-[400px] bg-gradient-to-br from-emerald-100/30 to-teal-100/30 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-full blur-3xl"
          animate={
            shouldReduceMotion
              ? {}
              : {
                  scale: [1, 1.15, 1],
                  opacity: [0.2, 0.35, 0.2],
                }
          }
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 2,
          }}
        />
      </div>

      {/* Responsive Grid Layout */}
      <div
        className={cn(
          'grid gap-4',
          // Mobile: 1 column
          'grid-cols-1',
          // Tablet: 2 columns
          'md:grid-cols-2',
          // Desktop: 3 columns
          'lg:grid-cols-3',
          // Wide: 3 columns with wider preview
          'xl:grid-cols-3'
        )}
      >
        {children}
      </div>

      {/* Upload Progress Overlay */}
      <AnimatePresence>
        {(state === 'uploading' || state === 'success') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-sm"
          >
            {/* Progress content will be rendered by UploadProgressSteps component */}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Skeleton loader for cards
 */
export function BentoCardSkeleton({
  colSpan = 1,
  className,
}: {
  colSpan?: 1 | 2 | 3;
  className?: string;
}) {
  const colSpanClasses = {
    1: 'col-span-1',
    2: 'col-span-1 md:col-span-2',
    3: 'col-span-1 md:col-span-2 lg:col-span-3',
  };

  return (
    <div
      className={cn(
        'animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800',
        'border border-gray-200 dark:border-gray-700',
        'h-48',
        colSpanClasses[colSpan],
        className
      )}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-4/5" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/5" />
        </div>
      </div>
    </div>
  );
}

/**
 * Step indicator for progressive disclosure
 */
export function BentoStepIndicator({
  currentStep,
  totalSteps,
  stepLabels,
}: {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      className="-mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 mb-6 bg-gradient-to-r from-blue-50/50 via-indigo-50/30 to-purple-50/50 dark:from-blue-950/20 dark:via-indigo-950/10 dark:to-purple-950/20 py-4"
      role="progressbar"
      aria-valuenow={currentStep}
      aria-valuemin={1}
      aria-valuemax={totalSteps}
    >
      <div className="max-w-4xl mx-auto flex items-center justify-center">
      {stepLabels.map((label, index) => {
        const stepNumber = index + 1;
        const isCompleted = stepNumber < currentStep;
        const isCurrent = stepNumber === currentStep;
        const isUpcoming = stepNumber > currentStep;

        return (
          <div key={label} className="flex items-center flex-1">
            <motion.div
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-colors',
                isCompleted && 'bg-green-500 text-white',
                isCurrent && 'bg-blue-500 text-white ring-4 ring-blue-200 dark:ring-blue-900',
                isUpcoming && 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              )}
              animate={
                isCurrent && !shouldReduceMotion
                  ? {
                      scale: [1, 1.1, 1],
                    }
                  : {}
              }
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              aria-label={`Step ${stepNumber}: ${label}`}
            >
              {isCompleted ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                stepNumber
              )}
            </motion.div>
            <span
              className={cn(
                'ml-2 text-xs font-medium hidden sm:block',
                isCompleted && 'text-green-600 dark:text-green-400',
                isCurrent && 'text-blue-600 dark:text-blue-400',
                isUpcoming && 'text-gray-400 dark:text-gray-500'
              )}
            >
              {label}
            </span>
            {index < totalSteps - 1 && (
              <div
                className={cn(
                  'flex-1 h-0.5 mx-2',
                  isCompleted ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                )}
              />
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

export default BentoUploadLayout;
