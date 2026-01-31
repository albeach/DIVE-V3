/**
 * Unified Card Component - Single source of truth for all card styles
 *
 * Replaces: DashboardCard, StatsCard, IdPCard2025, FeatureShowcaseCard
 *
 * @version 3.0.0
 * @date 2026-01-31
 */

'use client';

import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export type CardVariant = 'glass' | 'gradient' | 'solid' | 'minimal' | 'neo';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';
export type CardStatus = 'default' | 'active' | 'pending' | 'suspended' | 'testing' | 'error';

export interface UnifiedCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  /** Visual variant */
  variant?: CardVariant;
  /** Padding size */
  padding?: CardPadding;
  /** Enable hover effects */
  hover?: boolean;
  /** Show border */
  border?: boolean;
  /** Make card clickable */
  clickable?: boolean;
  /** Children content */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Gradient colors (only for gradient variant) */
  gradientFrom?: string;
  gradientTo?: string;
  /** Status-aware styling */
  status?: CardStatus;
  /** Respect prefers-reduced-motion */
  reduceMotion?: boolean;
}

/**
 * Unified Card Component
 *
 * @example
 * ```tsx
 * // Glassmorphism card (replaces DashboardCard, IdPCard2025)
 * <UnifiedCard variant="glass" hover>
 *   <h2>Dashboard Stats</h2>
 * </UnifiedCard>
 *
 * // Gradient card (replaces FeatureShowcaseCard)
 * <UnifiedCard variant="gradient" gradientFrom="from-blue-500" gradientTo="to-purple-600">
 *   <p>Feature content</p>
 * </UnifiedCard>
 *
 * // Solid card (replaces StatsCard)
 * <UnifiedCard variant="solid">
 *   <div>Standard content</div>
 * </UnifiedCard>
 * ```
 */
// Status-aware border/accent colors
const statusStyles: Record<CardStatus, string> = {
  default: '',
  active: 'border-l-4 border-l-emerald-500 dark:border-l-emerald-400',
  pending: 'border-l-4 border-l-amber-500 dark:border-l-amber-400',
  suspended: 'border-l-4 border-l-red-500 dark:border-l-red-400',
  testing: 'border-l-4 border-l-sky-500 dark:border-l-sky-400',
  error: 'border-l-4 border-l-red-600 dark:border-l-red-500',
};

// Status glow on hover
const statusGlowStyles: Record<CardStatus, string> = {
  default: '',
  active: 'hover:shadow-emerald-500/10 dark:hover:shadow-emerald-400/10',
  pending: 'hover:shadow-amber-500/10 dark:hover:shadow-amber-400/10',
  suspended: 'hover:shadow-red-500/10 dark:hover:shadow-red-400/10',
  testing: 'hover:shadow-sky-500/10 dark:hover:shadow-sky-400/10',
  error: 'hover:shadow-red-600/10 dark:hover:shadow-red-500/10',
};

export function UnifiedCard({
  variant = 'solid',
  padding = 'md',
  hover = false,
  border = true,
  clickable = false,
  children,
  className,
  gradientFrom = 'from-blue-500',
  gradientTo = 'to-purple-600',
  status = 'default',
  reduceMotion = false,
  ...motionProps
}: UnifiedCardProps) {
  // Base styles
  const baseStyles = cn(
    'rounded-xl transition-all duration-200',
    clickable && 'cursor-pointer',
    status !== 'default' && statusStyles[status],
    hover && status !== 'default' && statusGlowStyles[status],
  );

  // Padding styles
  const paddingStyles = {
    none: '',
    sm: 'p-3',
    md: 'p-4 md:p-6',
    lg: 'p-6 md:p-8',
  };

  // Variant styles
  const variantStyles = {
    glass: cn(
      'bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl backdrop-saturate-150',
      'shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]',
      border && 'border border-white/20 dark:border-slate-700/20',
      'shadow-lg',
      hover && 'hover:shadow-xl hover:scale-[1.02]',
    ),
    gradient: cn(
      `bg-gradient-to-br ${gradientFrom} ${gradientTo}`,
      'text-white',
      'shadow-lg',
      hover && 'hover:shadow-2xl hover:scale-[1.02]',
    ),
    solid: cn(
      'bg-white dark:bg-slate-800',
      border && 'border border-gray-200 dark:border-slate-700',
      'shadow-sm',
      hover && 'hover:shadow-md hover:border-gray-300 dark:hover:border-slate-600',
    ),
    minimal: cn(
      'bg-transparent',
      border && 'border border-gray-100 dark:border-slate-800',
      hover && 'hover:bg-gray-50 dark:hover:bg-slate-900/50',
    ),
    neo: cn(
      'bg-slate-50 dark:bg-slate-800/90',
      'shadow-[6px_6px_12px_rgba(0,0,0,0.08),-6px_-6px_12px_rgba(255,255,255,0.8)]',
      'dark:shadow-[6px_6px_12px_rgba(0,0,0,0.3),-6px_-6px_12px_rgba(255,255,255,0.05)]',
      border && 'border border-slate-200/50 dark:border-slate-700/30',
      hover && 'hover:shadow-[8px_8px_16px_rgba(0,0,0,0.1),-8px_-8px_16px_rgba(255,255,255,0.9)] dark:hover:shadow-[8px_8px_16px_rgba(0,0,0,0.4),-8px_-8px_16px_rgba(255,255,255,0.07)]',
    ),
  };

  // Combine all styles
  const cardStyles = cn(
    baseStyles,
    paddingStyles[padding],
    variantStyles[variant],
    className
  );

  // Default motion props for smooth animations (respects prefers-reduced-motion)
  const defaultMotionProps: HTMLMotionProps<'div'> = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.3, ease: 'easeOut' },
        whileHover: hover ? { y: -4, transition: { duration: 0.2 } } : undefined,
        whileTap: clickable ? { scale: 0.98 } : undefined,
      };

  return (
    <motion.div
      className={cardStyles}
      {...defaultMotionProps}
      {...motionProps}
    >
      {children}
    </motion.div>
  );
}

/**
 * Card Header Component
 * Use inside UnifiedCard for consistent header styling
 */
export interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, action, icon, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between mb-4', className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <div className="flex-shrink-0 mt-0.5">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && (
        <div className="flex-shrink-0">
          {action}
        </div>
      )}
    </div>
  );
}

/**
 * Card Stats Component
 * Display metric with label and optional trend
 */
export interface CardStatsProps {
  value: string | number;
  label: string;
  trend?: {
    value: number;
    direction: 'up' | 'down';
  };
  icon?: ReactNode;
  className?: string;
}

export function CardStats({ value, label, trend, icon, className }: CardStatsProps) {
  return (
    <div className={cn('flex items-start justify-between', className)}>
      <div>
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {value}
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {label}
        </div>
        {trend && (
          <div className={cn(
            'text-xs font-medium mt-1',
            trend.direction === 'up' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          )}>
            {trend.direction === 'up' ? '↑' : '↓'} {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      {icon && (
        <div className="text-gray-400 dark:text-gray-500">
          {icon}
        </div>
      )}
    </div>
  );
}

/**
 * Card Footer Component
 * Use inside UnifiedCard for consistent footer styling
 */
export interface CardFooterProps {
  children: ReactNode;
  className?: string;
  divider?: boolean;
}

export function CardFooter({ children, className, divider = true }: CardFooterProps) {
  return (
    <div className={cn(
      divider && 'border-t border-gray-200 dark:border-slate-700 pt-4 mt-4',
      className
    )}>
      {children}
    </div>
  );
}

/**
 * Pre-built Card Variants for common use cases
 */

// Stats Card (replaces old StatsCard)
export interface StatsCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    direction: 'up' | 'down';
  };
  icon?: ReactNode;
  variant?: CardVariant;
  status?: CardStatus;
  sparklineData?: number[];
  className?: string;
}

export function StatsCard({
  title,
  value,
  change,
  icon,
  variant = 'solid',
  status = 'default',
  sparklineData,
  className,
}: StatsCardProps) {
  return (
    <UnifiedCard variant={variant} hover status={status} className={cn('relative overflow-hidden', className)}>
      <CardStats
        value={value}
        label={title}
        trend={change}
        icon={icon}
      />
      {sparklineData && sparklineData.length > 1 && (
        <div className="mt-3">
          <Sparkline data={sparklineData} />
        </div>
      )}
    </UnifiedCard>
  );
}

// Feature Card (replaces old FeatureShowcaseCard)
export interface FeatureCardProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
  gradientFrom?: string;
  gradientTo?: string;
  className?: string;
}

export function FeatureCard({
  title,
  description,
  icon,
  action,
  gradientFrom,
  gradientTo,
  className,
}: FeatureCardProps) {
  return (
    <UnifiedCard
      variant="gradient"
      hover
      gradientFrom={gradientFrom}
      gradientTo={gradientTo}
      className={className}
    >
      <CardHeader
        title={title}
        subtitle={description}
        icon={icon}
        action={action}
        className="mb-0"
      />
    </UnifiedCard>
  );
}

// Glass Card (replaces DashboardCard, IdPCard2025)
export interface GlassCardProps {
  children: ReactNode;
  hover?: boolean;
  padding?: CardPadding;
  className?: string;
}

export function GlassCard({ children, hover = true, padding = 'md', className }: GlassCardProps) {
  return (
    <UnifiedCard variant="glass" hover={hover} padding={padding} className={className}>
      {children}
    </UnifiedCard>
  );
}

/**
 * Sparkline Component - Lightweight inline SVG area chart
 * 7-point mini chart with gradient fill, color-coded by trend direction
 */
export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({ data, width = 120, height = 32, className }: SparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Normalize data points to SVG coordinates
  const points = data.map((val, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((val - min) / range) * (height - 4) - 2,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  // Color based on trend: last value vs first value
  const trending = data[data.length - 1] >= data[0];
  const strokeColor = trending ? '#10b981' : '#ef4444';
  const gradientId = `sparkline-grad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
      role="img"
      aria-label={`Trend: ${trending ? 'upward' : 'downward'}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* End dot */}
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2" fill={strokeColor} />
    </svg>
  );
}
