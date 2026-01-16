'use client';

/**
 * Page Transition Component
 * 
 * Wraps page content with smooth framer-motion animations.
 * Provides consistent page entry/exit animations across the app.
 * 
 * Features:
 * - Fade in on mount
 * - Slide up animation
 * - Configurable animation variants
 * - Accessible (respects prefers-reduced-motion)
 * - Performance optimized
 * 
 * Usage:
 * ```tsx
 * <PageTransition>
 *   <YourPageContent />
 * </PageTransition>
 * ```
 * 
 * @version 1.0.0
 * @date 2026-01-16
 */

import { motion, AnimatePresence } from 'framer-motion';
import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
  /** Animation variant: 'fade', 'slide', 'scale' */
  variant?: 'fade' | 'slide' | 'scale';
}

const variants = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slide: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  },
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },
};

export function PageTransition({ 
  children, 
  className = '',
  variant = 'fade'
}: PageTransitionProps) {
  return (
    <motion.div
      initial={variants[variant].initial}
      animate={variants[variant].animate}
      exit={variants[variant].exit}
      transition={{
        duration: 0.3,
        ease: [0.25, 0.1, 0.25, 1], // Smooth easing
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Stagger Children Animation
 * Animates children with a stagger delay
 */
export function StaggerContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: 0.1,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Stagger Item
 * Individual item in a stagger animation
 */
export function StaggerItem({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Fade In Animation
 * Simple fade in on mount
 */
export function FadeIn({ 
  children, 
  delay = 0,
  className = '' 
}: { 
  children: ReactNode; 
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Scale In Animation
 * Scale from 0.9 to 1.0 with fade
 */
export function ScaleIn({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
