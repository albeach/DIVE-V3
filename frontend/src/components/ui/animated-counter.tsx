/**
 * AnimatedCounter Component - Smooth number animations with spring physics
 *
 * Uses Framer Motion useSpring + useTransform for fluid counting.
 * Respects prefers-reduced-motion.
 *
 * @version 1.0.0
 * @date 2026-01-31
 */

'use client';

import { useEffect, useRef } from 'react';
import { motion, useSpring, useTransform, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface AnimatedCounterProps {
  /** Target value to animate to */
  value: number;
  /** Number of decimal places */
  decimals?: number;
  /** Prefix (e.g., "$", "#") */
  prefix?: string;
  /** Suffix (e.g., "%", "ms", "K") */
  suffix?: string;
  /** Spring stiffness (higher = faster) */
  stiffness?: number;
  /** Spring damping (higher = less bounce) */
  damping?: number;
  /** Duration in seconds (alternative to spring physics) */
  duration?: number;
  /** Format with locale separators (e.g., 1,234) */
  formatLocale?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function AnimatedCounter({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  stiffness = 100,
  damping = 30,
  duration,
  formatLocale = true,
  className,
}: AnimatedCounterProps) {
  const prefersReducedMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);

  const springConfig = duration
    ? { duration: duration * 1000, bounce: 0 }
    : { stiffness, damping };

  const motionValue = useSpring(0, springConfig);

  const display = useTransform(motionValue, (latest: number) => {
    const rounded = decimals > 0
      ? latest.toFixed(decimals)
      : Math.round(latest).toString();

    if (formatLocale && decimals === 0) {
      return Number(rounded).toLocaleString();
    }
    return rounded;
  });

  useEffect(() => {
    if (prefersReducedMotion) {
      motionValue.set(value);
    } else {
      motionValue.set(value);
    }
  }, [value, motionValue, prefersReducedMotion]);

  if (prefersReducedMotion) {
    const formatted = decimals > 0
      ? value.toFixed(decimals)
      : (formatLocale ? value.toLocaleString() : Math.round(value).toString());

    return (
      <span className={cn('tabular-nums', className)}>
        {prefix}{formatted}{suffix}
      </span>
    );
  }

  return (
    <span className={cn('tabular-nums', className)}>
      {prefix}
      <motion.span ref={ref}>{display}</motion.span>
      {suffix}
    </span>
  );
}

/**
 * AnimatedPercentage - Shorthand for percentage counters
 */
export function AnimatedPercentage({
  value,
  className,
  ...props
}: Omit<AnimatedCounterProps, 'suffix' | 'decimals'> & { decimals?: number }) {
  return (
    <AnimatedCounter
      value={value}
      suffix="%"
      decimals={1}
      className={className}
      {...props}
    />
  );
}
