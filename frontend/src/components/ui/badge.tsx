/**
 * Unified Badge Component - Single source of truth for all badge styles
 *
 * @version 2.0.0
 * @date 2026-01-29
 */

'use client';

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' | 'outline';
export type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  pill?: boolean;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

/**
 * Unified Badge Component
 *
 * @example
 * ```tsx
 * <Badge variant="success">Active</Badge>
 * <Badge variant="warning" pulse>Pending</Badge>
 * <Badge variant="error" dot>3</Badge>
 * ```
 */
export function Badge({
  children,
  variant = 'default',
  size = 'sm',
  pill = false,
  dot = false,
  pulse = false,
  className,
}: BadgeProps) {
  const sizeStyles = {
    xs: 'text-[10px] px-1.5 py-0.5',
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const variantStyles = {
    default: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    primary: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    info: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
    outline: 'border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-300',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        pill ? 'rounded-full' : 'rounded',
        sizeStyles[size],
        variantStyles[variant],
        pulse && 'animate-pulse',
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            'inline-block rounded-full',
            size === 'xs' ? 'h-1 w-1' : 'h-1.5 w-1.5',
            variant === 'success' && 'bg-emerald-500',
            variant === 'warning' && 'bg-amber-500',
            variant === 'error' && 'bg-red-500',
            variant === 'info' && 'bg-sky-500',
            variant === 'primary' && 'bg-blue-500',
            variant === 'default' && 'bg-gray-500',
          )}
        />
      )}
      {children}
    </span>
  );
}

/**
 * Status Badge - for status indicators
 */
export type StatusType = 'active' | 'inactive' | 'pending' | 'error' | 'warning';

export interface StatusBadgeProps {
  status: StatusType;
  size?: BadgeSize;
  showDot?: boolean;
  className?: string;
}

export function StatusBadge({ status, size = 'sm', showDot = true, className }: StatusBadgeProps) {
  const statusMap: Record<StatusType, { variant: BadgeVariant; label: string }> = {
    active: { variant: 'success', label: 'Active' },
    inactive: { variant: 'default', label: 'Inactive' },
    pending: { variant: 'warning', label: 'Pending' },
    error: { variant: 'error', label: 'Error' },
    warning: { variant: 'warning', label: 'Warning' },
  };

  const { variant, label } = statusMap[status];

  return (
    <Badge variant={variant} size={size} dot={showDot} className={className}>
      {label}
    </Badge>
  );
}

/**
 * Count Badge - for notification counts
 */
export interface CountBadgeProps {
  count: number;
  max?: number;
  variant?: BadgeVariant;
  size?: BadgeSize;
  pulse?: boolean;
  className?: string;
}

export function CountBadge({
  count,
  max = 99,
  variant = 'error',
  size = 'xs',
  pulse = false,
  className,
}: CountBadgeProps) {
  const displayCount = count > max ? `${max}+` : count;

  if (count === 0) return null;

  return (
    <Badge variant={variant} size={size} pill pulse={pulse} className={className}>
      {displayCount}
    </Badge>
  );
}

/**
 * Role Badge - for user roles
 */
export interface RoleBadgeProps {
  role: string;
  size?: BadgeSize;
  className?: string;
}

export function RoleBadge({ role, size = 'sm', className }: RoleBadgeProps) {
  const roleVariants: Record<string, BadgeVariant> = {
    super_admin: 'error',
    hub_admin: 'primary',
    spoke_admin: 'info',
    admin: 'primary',
    user: 'default',
  };

  const variant = roleVariants[role.toLowerCase()] || 'default';

  return (
    <Badge variant={variant} size={size} className={className}>
      {role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
    </Badge>
  );
}

/**
 * Clearance Badge - for security clearance levels
 */
export type ClearanceLevel = 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';

export interface ClearanceBadgeProps {
  clearance: ClearanceLevel | string;
  size?: BadgeSize;
  showDot?: boolean;
  className?: string;
}

export function ClearanceBadge({
  clearance,
  size = 'sm',
  showDot = false,
  className,
}: ClearanceBadgeProps) {
  const clearanceVariants: Record<string, BadgeVariant> = {
    TOP_SECRET: 'error',
    SECRET: 'warning',
    CONFIDENTIAL: 'primary',
    UNCLASSIFIED: 'default',
  };

  const normalized = clearance.toUpperCase().replace(/ /g, '_');
  const variant = clearanceVariants[normalized] || 'default';

  // Abbreviate clearance level
  const abbreviate = (level: string): string => {
    if (level.includes('TOP') || level.includes('TS')) return 'TS';
    if (level.includes('SECRET') && !level.includes('TOP')) return 'S';
    if (level.includes('CONF')) return 'C';
    return 'U';
  };

  return (
    <Badge variant={variant} size={size} dot={showDot} className={className}>
      {abbreviate(clearance)}
    </Badge>
  );
}

/**
 * Feature Badge - for new/beta/deprecated features
 */
export type FeatureStatus = 'new' | 'beta' | 'deprecated' | 'coming-soon';

export interface FeatureBadgeProps {
  status: FeatureStatus;
  size?: BadgeSize;
  className?: string;
}

export function FeatureBadge({ status, size = 'xs', className }: FeatureBadgeProps) {
  const statusMap: Record<FeatureStatus, { variant: BadgeVariant; label: string }> = {
    new: { variant: 'success', label: 'NEW' },
    beta: { variant: 'warning', label: 'BETA' },
    deprecated: { variant: 'error', label: 'DEPRECATED' },
    'coming-soon': { variant: 'info', label: 'COMING SOON' },
  };

  const { variant, label } = statusMap[status];

  return (
    <Badge variant={variant} size={size} className={className}>
      {label}
    </Badge>
  );
}
