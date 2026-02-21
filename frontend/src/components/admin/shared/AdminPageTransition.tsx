/**
 * Admin Page Transition Wrapper
 * 
 * Provides smooth page transitions for all admin pages with:
 * - Consistent entrance/exit animations
 * - Respects prefers-reduced-motion
 * - TypeScript typed
 * - Performance optimized
 * 
 * @version 1.0.0
 * @date 2026-02-06
 * @phase Phase 3.4 - Micro-Interactions Polish
 */

'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { prefersReducedMotion } from '@/lib/animations';
import { adminAnimations } from './theme-tokens';
import React from 'react';

export interface AdminPageTransitionProps {
  children: React.ReactNode;
  /**
   * Unique key for the page (usually the route path)
   * Used by AnimatePresence to track page changes
   */
  pageKey?: string;
  /**
   * Animation variant to use
   * @default 'slideUp'
   */
  variant?: 'slideUp' | 'fadeIn' | 'scale';
  /**
   * Custom className for the wrapper
   */
  className?: string;
}

/**
 * Admin Page Transition Component
 * 
 * Wraps page content with smooth entrance/exit animations.
 * Automatically respects user's motion preferences.
 * 
 * @example
 * ```tsx
 * export default function MyPage() {
 *   return (
 *     <AdminPageTransition pageKey="/admin/users">
 *       <div>Your page content</div>
 *     </AdminPageTransition>
 *   );
 * }
 * ```
 */
export function AdminPageTransition({
  children,
  pageKey,
  variant = 'slideUp',
  className = '',
}: AdminPageTransitionProps) {
  const reducedMotion = prefersReducedMotion();
  
  // Get animation config based on variant
  const animationConfig = adminAnimations[variant] || adminAnimations.slideUp;
  
  // If reduced motion is preferred, use instant transition
  const finalAnimation = reducedMotion
    ? {
        initial: {},
        animate: {},
        exit: {},
        transition: { duration: 0 },
      }
    : animationConfig;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pageKey}
        {...finalAnimation}
        className={className || 'w-full'}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Admin Section Transition
 * 
 * Lighter transition for sections within a page.
 * Useful for tab changes or collapsible sections.
 * 
 * @example
 * ```tsx
 * <AdminSectionTransition sectionKey={activeTab}>
 *   {activeTab === 'overview' && <OverviewSection />}
 *   {activeTab === 'analytics' && <AnalyticsSection />}
 * </AdminSectionTransition>
 * ```
 */
export function AdminSectionTransition({
  children,
  sectionKey,
  className = '',
}: Omit<AdminPageTransitionProps, 'variant'> & { sectionKey?: string }) {
  const reducedMotion = prefersReducedMotion();
  
  const animationConfig = reducedMotion
    ? { initial: {}, animate: {}, exit: {}, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -10 },
        transition: { duration: 0.2, ease: 'easeOut' },
      };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={sectionKey}
        {...animationConfig}
        className={className || 'w-full'}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Hook to detect if user prefers reduced motion
 * 
 * @returns boolean - true if user prefers reduced motion
 * 
 * @example
 * ```tsx
 * const shouldAnimate = !useReducedMotion();
 * ```
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    setReducedMotion(prefersReducedMotion());
    
    // Listen for changes to motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return reducedMotion;
}
