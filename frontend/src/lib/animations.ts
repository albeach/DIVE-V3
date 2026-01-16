/**
 * Animation Utilities for DIVE V3
 *
 * Centralized framer-motion animation variants and configurations.
 * Provides consistent animations across the application.
 *
 * Features:
 * - Reusable animation variants
 * - Accessible (respects prefers-reduced-motion)
 * - Performance optimized
 * - TypeScript typed
 *
 * @version 1.0.0
 * @date 2026-01-16
 */

import { Variants, Transition } from 'framer-motion';

/**
 * Default transition settings
 */
export const defaultTransition: Transition = {
  duration: 0.3,
  ease: [0.25, 0.1, 0.25, 1], // Smooth easing curve
};

/**
 * Page transition variants
 */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

/**
 * Fade animation variants
 */
export const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * Slide animation variants (customizable direction)
 */
export const slideVariants = (direction: 'up' | 'down' | 'left' | 'right' = 'up'): Variants => {
  const axis = direction === 'left' || direction === 'right' ? 'x' : 'y';
  const value = direction === 'down' || direction === 'right' ? 20 : -20;

  return {
    initial: { opacity: 0, [axis]: value },
    animate: { opacity: 1, [axis]: 0 },
    exit: { opacity: 0, [axis]: -value },
  };
};

/**
 * Scale animation variants
 */
export const scaleVariants: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

/**
 * Stagger container variants
 * Animates children with a delay between each
 */
export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};

/**
 * Stagger item variants
 * Used with staggerContainerVariants
 */
export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: 'easeOut',
    },
  },
};

/**
 * Card hover animation variants
 */
export const cardHoverVariants: Variants = {
  initial: { scale: 1 },
  hover: {
    scale: 1.02,
    transition: { duration: 0.2 },
  },
  tap: { scale: 0.98 },
};

/**
 * Modal/Dialog animation variants
 */
export const modalVariants: Variants = {
  initial: { opacity: 0, scale: 0.9, y: 20 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    y: 20,
    transition: {
      duration: 0.15,
    },
  },
};

/**
 * Backdrop animation variants
 */
export const backdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * List item animation variants
 */
export const listItemVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.3,
    },
  },
};

/**
 * Notification/Toast animation variants
 */
export const notificationVariants: Variants = {
  initial: { opacity: 0, y: -50, scale: 0.8 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 500,
      damping: 40,
    },
  },
  exit: {
    opacity: 0,
    x: 100,
    transition: {
      duration: 0.2,
    },
  },
};

/**
 * Accordion/Collapse animation variants
 */
export const collapseVariants: Variants = {
  collapsed: {
    height: 0,
    opacity: 0,
    transition: {
      duration: 0.3,
      ease: 'easeInOut',
    },
  },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: {
      duration: 0.3,
      ease: 'easeInOut',
    },
  },
};

/**
 * Loading spinner variants
 */
export const spinnerVariants: Variants = {
  animate: {
    rotate: 360,
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

/**
 * Pulse animation variants
 */
export const pulseVariants: Variants = {
  animate: {
    scale: [1, 1.05, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get transition with reduced motion support
 */
export function getAccessibleTransition(transition: Transition = defaultTransition): Transition {
  if (prefersReducedMotion()) {
    return { duration: 0 };
  }
  return transition;
}
