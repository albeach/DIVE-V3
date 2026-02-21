/**
 * Micro-Interaction Utilities - Reusable motion presets
 *
 * Button tap, card hover lift, elastic toggle, form error shake.
 * All respect prefers-reduced-motion via Framer Motion.
 *
 * @version 1.0.0
 * @date 2026-01-31
 */

'use client';

import { motion, HTMLMotionProps, Variants, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ReactNode, ButtonHTMLAttributes } from 'react';

// ============================================
// Motion Presets (importable configs)
// ============================================

/** Button press: slight scale-down + glow ring */
export const buttonTapPreset: HTMLMotionProps<'button'> = {
  whileTap: { scale: 0.97 },
  whileHover: { scale: 1.02 },
  transition: { type: 'spring', stiffness: 400, damping: 17 },
};

/** Card hover lift: y offset + shadow increase */
export const cardHoverPreset: HTMLMotionProps<'div'> = {
  whileHover: { y: -4, transition: { type: 'spring', stiffness: 300, damping: 20 } },
};

/** Elastic spring for toggles/checkboxes */
export const elasticTogglePreset: HTMLMotionProps<'div'> = {
  transition: { type: 'spring', stiffness: 500, damping: 15 },
};

/** Shake animation for form errors */
export const shakeVariants: Variants = {
  idle: { x: 0 },
  shake: {
    x: [0, -8, 8, -6, 6, -3, 3, 0],
    transition: { duration: 0.5 },
  },
};

/** Pulse animation for attention */
export const pulseVariants: Variants = {
  idle: { scale: 1, opacity: 1 },
  pulse: {
    scale: [1, 1.05, 1],
    opacity: [1, 0.8, 1],
    transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
  },
};

// ============================================
// MotionButton - Pressable button with tap feedback
// ============================================

export interface MotionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'> {
  children: ReactNode;
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  glow?: boolean;
}

export function MotionButton({
  children,
  variant = 'default',
  size = 'md',
  glow = false,
  className,
  ...props
}: MotionButtonProps) {
  const prefersReducedMotion = useReducedMotion();

  const variantStyles = {
    default: 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700',
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-md',
    ghost: 'bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800',
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm rounded-lg',
    md: 'px-4 py-2 text-sm rounded-lg',
    lg: 'px-6 py-3 text-base rounded-xl',
  };

  const glowStyle = glow && variant === 'primary'
    ? 'hover:shadow-indigo-500/25 hover:shadow-lg'
    : glow && variant === 'danger'
      ? 'hover:shadow-red-500/25 hover:shadow-lg'
      : '';

  const motionProps = prefersReducedMotion
    ? {}
    : { whileTap: { scale: 0.97 }, whileHover: { scale: 1.02 }, transition: { type: 'spring', stiffness: 400, damping: 17 } };

  return (
    <motion.button
      className={cn(
        'font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
        variantStyles[variant],
        sizeStyles[size],
        glowStyle,
        className,
      )}
      {...motionProps}
      {...(props as any)}
    >
      {children}
    </motion.button>
  );
}

// ============================================
// ShakeContainer - Wraps content that shakes on error
// ============================================

export interface ShakeContainerProps {
  children: ReactNode;
  shake: boolean;
  className?: string;
}

export function ShakeContainer({ children, shake, className }: ShakeContainerProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className={cn(shake && 'ring-2 ring-red-500/50 rounded-lg', className)}
      variants={prefersReducedMotion ? undefined : shakeVariants}
      animate={shake ? 'shake' : 'idle'}
    >
      {children}
    </motion.div>
  );
}

// ============================================
// FadeInView - Intersection observer fade-in
// ============================================

export interface FadeInViewProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function FadeInView({ children, delay = 0, className }: FadeInViewProps) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
