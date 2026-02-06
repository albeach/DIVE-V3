/**
 * GlassCard Component - Reusable glassmorphism card
 * 
 * Phase 3.2: Spatial Computing UI Enhancement
 * Provides consistent glassmorphism effects across admin pages
 * 
 * Features:
 * - Backdrop blur effects
 * - 3D hover animations
 * - Depth hierarchy support
 * - Dark mode compatible
 * - Motion support with Framer Motion
 * 
 * @version 1.0.0
 * @date 2026-02-05
 */

'use client';

import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { adminEffects, adminAnimations } from './theme-tokens';

export interface GlassCardProps extends Omit<HTMLMotionProps<'div'>, 'ref'> {
  /** Visual variant of the card */
  variant?: 'default' | 'light' | 'heavy' | 'panel' | 'modal';
  
  /** Enable 3D hover effect */
  hover?: 'lift' | 'liftSmall' | 'liftLarge' | 'tilt' | 'glow' | 'none';
  
  /** Depth layer in the z-index hierarchy */
  depth?: 'base' | 'elevated' | 'floating' | 'overlay' | 'modal' | 'top';
  
  /** Enable press animation */
  pressable?: boolean;
  
  /** Enable entry animation */
  animated?: boolean;
  
  /** Custom padding (overrides default) */
  noPadding?: boolean;
  
  /** Children content */
  children?: React.ReactNode;
  
  /** Additional CSS classes */
  className?: string;
}

/**
 * Glass Card Component
 * 
 * @example
 * ```tsx
 * <GlassCard hover="lift" depth="elevated">
 *   <h3>Card Title</h3>
 *   <p>Card content with glassmorphism effect</p>
 * </GlassCard>
 * ```
 * 
 * @example With animation
 * ```tsx
 * <GlassCard animated hover="liftLarge" depth="floating">
 *   <StatCard value={100} label="Users" />
 * </GlassCard>
 * ```
 */
export function GlassCard({
  variant = 'default',
  hover = 'lift',
  depth = 'base',
  pressable = false,
  animated = false,
  noPadding = false,
  children,
  className,
  ...props
}: GlassCardProps) {
  // Map variant to glass effect
  const glassVariant = {
    default: adminEffects.glass.card,
    light: adminEffects.glass.cardLight,
    heavy: adminEffects.glass.cardHeavy,
    panel: adminEffects.glass.panel,
    modal: adminEffects.glass.modal,
  }[variant];

  // Map hover to 3D effect
  const hoverEffect = hover !== 'none' ? adminEffects.hover3d[hover] : '';

  // Map depth to z-index
  const depthEffect = adminEffects.depth[depth];

  // Combine CSS classes
  const cardClasses = cn(
    glassVariant,
    hoverEffect,
    depthEffect,
    !noPadding && 'p-6',
    pressable && adminEffects.hover3d.press,
    className
  );

  // Animation props
  const animationProps = animated ? {
    ...adminAnimations.slideUp,
  } : {};

  return (
    <motion.div
      className={cardClasses}
      {...animationProps}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/**
 * Glass Header Component
 * 
 * @example
 * ```tsx
 * <GlassHeader sticky>
 *   <h1>Page Title</h1>
 * </GlassHeader>
 * ```
 */
export interface GlassHeaderProps extends Omit<HTMLMotionProps<'header'>, 'ref'> {
  /** Make header sticky */
  sticky?: boolean;
  
  /** Children content */
  children?: React.ReactNode;
  
  /** Additional CSS classes */
  className?: string;
}

export function GlassHeader({
  sticky = false,
  children,
  className,
  ...props
}: GlassHeaderProps) {
  return (
    <motion.header
      className={cn(
        adminEffects.glass.header,
        sticky && 'sticky top-0 z-40',
        'px-6 py-4',
        className
      )}
      {...adminAnimations.slideDown}
      {...props}
    >
      {children}
    </motion.header>
  );
}

/**
 * Glass Section Component
 * 
 * @example
 * ```tsx
 * <GlassSection>
 *   <h2>Section Title</h2>
 *   <p>Section content</p>
 * </GlassSection>
 * ```
 */
export interface GlassSectionProps extends Omit<HTMLMotionProps<'section'>, 'ref'> {
  /** Children content */
  children?: React.ReactNode;
  
  /** Additional CSS classes */
  className?: string;
}

export function GlassSection({
  children,
  className,
  ...props
}: GlassSectionProps) {
  return (
    <motion.section
      className={cn(
        adminEffects.glass.panel,
        'p-6 md:p-8',
        className
      )}
      {...adminAnimations.fadeIn}
      {...props}
    >
      {children}
    </motion.section>
  );
}

/**
 * Glass Grid Container
 * 
 * @example
 * ```tsx
 * <GlassGrid cols={3}>
 *   <StatCard />
 *   <StatCard />
 *   <StatCard />
 * </GlassGrid>
 * ```
 */
export interface GlassGridProps {
  /** Number of columns */
  cols?: 1 | 2 | 3 | 4 | 5 | 6;
  
  /** Gap size */
  gap?: 'sm' | 'md' | 'lg' | 'xl';
  
  /** Enable stagger animation */
  stagger?: boolean;
  
  /** Children cards */
  children?: React.ReactNode;
  
  /** Additional CSS classes */
  className?: string;
}

export function GlassGrid({
  cols = 3,
  gap = 'md',
  stagger = false,
  children,
  className,
}: GlassGridProps) {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
    6: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
  }[cols];

  const gapSize = {
    sm: 'gap-3',
    md: 'gap-6',
    lg: 'gap-8',
    xl: 'gap-10',
  }[gap];

  return (
    <motion.div
      className={cn('grid', gridCols, gapSize, className)}
      variants={stagger ? {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: 0.1,
          },
        },
      } : undefined}
      initial={stagger ? 'hidden' : undefined}
      animate={stagger ? 'visible' : undefined}
    >
      {children}
    </motion.div>
  );
}

/**
 * Utility: Wrap existing components with glass effect
 */
export function withGlassEffect<P extends object>(
  Component: React.ComponentType<P>,
  options: {
    variant?: GlassCardProps['variant'];
    hover?: GlassCardProps['hover'];
    depth?: GlassCardProps['depth'];
  } = {}
) {
  return function GlassWrapper(props: P) {
    return (
      <GlassCard {...options}>
        <Component {...props} />
      </GlassCard>
    );
  };
}

export default GlassCard;
