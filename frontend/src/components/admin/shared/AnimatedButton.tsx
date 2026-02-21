/**
 * Animated Button Component
 * 
 * Enhanced button with micro-interactions:
 * - Smooth hover and tap animations
 * - Respects prefers-reduced-motion
 * - TypeScript typed
 * - Accessible
 * 
 * @version 1.0.0
 * @date 2026-02-06
 * @phase Phase 3.4 - Micro-Interactions Polish
 */

'use client';

import { motion, MotionProps } from 'framer-motion';
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { prefersReducedMotion } from '@/lib/animations';
import { adminAnimations } from './theme-tokens';
import { useAnimationPreferences, getAnimationDuration, getScaleIntensity } from '@/contexts/AnimationPreferencesContext';

export interface AnimatedButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>, 
  'style' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd'
> {
  /**
   * Animation intensity
   * @default 'normal'
   */
  intensity?: 'subtle' | 'normal' | 'strong';
  /**
   * Custom whileHover scale
   */
  hoverScale?: number;
  /**
   * Custom whileTap scale
   */
  tapScale?: number;
  /**
   * Disable animations completely
   */
  disableAnimation?: boolean;
  /**
   * Additional motion props
   */
  motionProps?: Omit<MotionProps, 'whileHover' | 'whileTap' | 'transition'>;
}

const scaleIntensity = {
  subtle: { hover: 1.01, tap: 0.99 },
  normal: { hover: 1.02, tap: 0.98 },
  strong: { hover: 1.05, tap: 0.95 },
};

/**
 * Animated Button Component
 * 
 * Drop-in replacement for <button> with smooth hover/tap animations.
 * Automatically respects user's motion preferences and animation settings.
 * 
 * @example
 * ```tsx
 * // Simple usage
 * <AnimatedButton onClick={handleClick}>
 *   Click Me
 * </AnimatedButton>
 * 
 * // With custom intensity
 * <AnimatedButton intensity="strong" className="btn-primary">
 *   Submit
 * </AnimatedButton>
 * 
 * // Disable animation for specific button
 * <AnimatedButton disableAnimation>
 *   No Animation
 * </AnimatedButton>
 * ```
 */
export const AnimatedButton = forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  (
    {
      children,
      className = '',
      intensity = 'normal',
      hoverScale,
      tapScale,
      disableAnimation = false,
      disabled,
      motionProps,
      ...rest
    },
    ref
  ) => {
    const reducedMotion = prefersReducedMotion();
    
    // Use animation preferences context if available, fallback to defaults
    let preferences;
    try {
      preferences = useAnimationPreferences().preferences;
    } catch {
      // Not wrapped in provider, use defaults
      preferences = { enabled: true, speed: 'normal', intensity: 'normal' };
    }
    
    // Determine if animations should be active
    const shouldAnimate = !disableAnimation && !disabled && !reducedMotion && preferences.enabled;

    // Use preference intensity if not explicitly overridden
    const effectiveIntensity = intensity === 'normal' ? preferences.intensity : intensity;
    const scales = getScaleIntensity(effectiveIntensity);
    const finalHoverScale = hoverScale ?? scales.hover;
    const finalTapScale = tapScale ?? scales.tap;

    // Calculate duration based on speed preference
    const baseDuration = 0.2;
    const duration = getAnimationDuration(baseDuration, preferences.speed);

    const animationProps = shouldAnimate
      ? {
          whileHover: { scale: finalHoverScale },
          whileTap: { scale: finalTapScale },
          transition: { duration, ease: 'easeOut' },
        }
      : {};

    return (
      <motion.button
        ref={ref}
        className={className}
        disabled={disabled}
        {...animationProps}
        {...motionProps}
        {...rest}
      >
        {children}
      </motion.button>
    );
  }
);

AnimatedButton.displayName = 'AnimatedButton';

/**
 * Animated Icon Button
 * 
 * Specialized button for icon-only buttons with enhanced hover effects.
 * 
 * @example
 * ```tsx
 * <AnimatedIconButton onClick={handleRefresh}>
 *   <RefreshIcon />
 * </AnimatedIconButton>
 * ```
 */
export const AnimatedIconButton = forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  ({ className = '', intensity = 'strong', ...rest }, ref) => {
    return (
      <AnimatedButton
        ref={ref}
        className={`inline-flex items-center justify-center ${className}`}
        intensity={intensity}
        {...rest}
      />
    );
  }
);

AnimatedIconButton.displayName = 'AnimatedIconButton';

/**
 * Animated Link Button
 * 
 * Button styled as a link with subtle hover effects.
 * 
 * @example
 * ```tsx
 * <AnimatedLinkButton onClick={handleViewMore}>
 *   View More →
 * </AnimatedLinkButton>
 * ```
 */
export const AnimatedLinkButton = forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  ({ className = '', intensity = 'subtle', ...rest }, ref) => {
    return (
      <AnimatedButton
        ref={ref}
        className={`inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline ${className}`}
        intensity={intensity}
        {...rest}
      />
    );
  }
);

AnimatedLinkButton.displayName = 'AnimatedLinkButton';

/**
 * Animated Card Action Button
 * 
 * Button for card actions with lift effect.
 * 
 * @example
 * ```tsx
 * <AnimatedCardButton onClick={handleEdit}>
 *   Edit
 * </AnimatedCardButton>
 * ```
 */
export const AnimatedCardButton = forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  ({ className = '', motionProps, ...rest }, ref) => {
    const reducedMotion = prefersReducedMotion();
    
    const liftMotion = !reducedMotion
      ? {
          whileHover: {
            scale: 1.02,
            y: -2,
            transition: { duration: 0.2 },
          },
          whileTap: {
            scale: 0.98,
            y: 0,
          },
        }
      : {};

    return (
      <AnimatedButton
        ref={ref}
        className={className}
        disableAnimation // We're using custom animation
        motionProps={{ ...liftMotion, ...motionProps }}
        {...rest}
      />
    );
  }
);

AnimatedCardButton.displayName = 'AnimatedCardButton';
