/**
 * Consistent Empty States
 * 
 * Beautiful, themed empty states for all admin pages:
 * - No data
 * - No results (search/filter)
 * - Error states
 * - First-time setup
 */

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Inbox,
  Search,
  AlertCircle,
  Sparkles,
  Users,
  FileText,
  Shield,
  Database,
  Server,
  Key,
  Globe,
  Settings,
  type LucideIcon,
} from 'lucide-react';

// ============================================
// Types
// ============================================

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

// ============================================
// Core Component
// ============================================

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  secondaryAction,
  className = '',
  size = 'md',
}: EmptyStateProps) {
  const sizeClasses = {
    sm: {
      container: 'py-8',
      icon: 'w-10 h-10',
      title: 'text-base',
      description: 'text-sm',
    },
    md: {
      container: 'py-12',
      icon: 'w-14 h-14',
      title: 'text-lg',
      description: 'text-sm',
    },
    lg: {
      container: 'py-16',
      icon: 'w-20 h-20',
      title: 'text-xl',
      description: 'text-base',
    },
  };

  const sizes = sizeClasses[size];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`text-center ${sizes.container} ${className}`}
    >
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', damping: 10 }}
        className="inline-flex items-center justify-center mb-4"
      >
        <div className="p-4 bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl">
          <Icon className={`${sizes.icon} text-gray-400 dark:text-gray-500`} />
        </div>
      </motion.div>

      <h3 className={`font-semibold text-gray-700 dark:text-gray-300 ${sizes.title}`}>
        {title}
      </h3>

      {description && (
        <p className={`mt-2 text-gray-500 dark:text-gray-400 max-w-md mx-auto ${sizes.description}`}>
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="mt-6 flex items-center justify-center gap-3">
          {action && (
            <button
              onClick={action.onClick}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                action.variant === 'secondary'
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 font-medium"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ============================================
// Preset Empty States
// ============================================

interface PresetEmptyStateProps {
  onAction?: () => void;
  onSecondaryAction?: () => void;
  className?: string;
}

export function NoDataEmptyState({ onAction, className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={Database}
      title="No Data Available"
      description="There's nothing to display right now. Data will appear here once it's available."
      action={onAction ? { label: 'Refresh', onClick: onAction, variant: 'secondary' } : undefined}
      className={className}
    />
  );
}

export function NoSearchResultsEmptyState({
  onAction,
  searchTerm,
  className,
}: PresetEmptyStateProps & { searchTerm?: string }) {
  return (
    <EmptyState
      icon={Search}
      title="No Results Found"
      description={
        searchTerm
          ? `No results match "${searchTerm}". Try adjusting your search or filters.`
          : "Your search didn't return any results. Try adjusting your criteria."
      }
      action={onAction ? { label: 'Clear Search', onClick: onAction, variant: 'secondary' } : undefined}
      className={className}
    />
  );
}

export function ErrorEmptyState({
  onAction,
  error,
  className,
}: PresetEmptyStateProps & { error?: string }) {
  return (
    <EmptyState
      icon={AlertCircle}
      title="Something Went Wrong"
      description={error || "We couldn't load this data. Please try again."}
      action={onAction ? { label: 'Try Again', onClick: onAction } : undefined}
      className={className}
    />
  );
}

export function NoUsersEmptyState({ onAction, className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={Users}
      title="No Users Found"
      description="No users match your current filters. Create a new user or adjust your search."
      action={onAction ? { label: 'Add User', onClick: onAction } : undefined}
      className={className}
    />
  );
}

export function NoLogsEmptyState({ className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={FileText}
      title="No Audit Logs"
      description="No audit events have been recorded yet. Activity will be logged here automatically."
      className={className}
    />
  );
}

export function NoPoliciesEmptyState({ onAction, className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={Shield}
      title="No Policies Configured"
      description="Get started by creating your first access control policy."
      action={onAction ? { label: 'Create Policy', onClick: onAction } : undefined}
      className={className}
    />
  );
}

export function NoIdPsEmptyState({ onAction, className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={Key}
      title="No Identity Providers"
      description="Connect an Identity Provider to enable federated authentication."
      action={onAction ? { label: 'Add Identity Provider', onClick: onAction } : undefined}
      className={className}
    />
  );
}

export function NoSpokesEmptyState({ className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={Globe}
      title="No Spokes Registered"
      description="Federation spokes will appear here once they register with this hub."
      className={className}
    />
  );
}

export function NoServersEmptyState({ onAction, className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={Server}
      title="No Servers Connected"
      description="Connect servers to monitor their status and manage configurations."
      action={onAction ? { label: 'Add Server', onClick: onAction } : undefined}
      className={className}
    />
  );
}

export function FirstTimeSetupEmptyState({
  onAction,
  feature,
  className,
}: PresetEmptyStateProps & { feature: string }) {
  return (
    <EmptyState
      icon={Sparkles}
      title={`Set Up ${feature}`}
      description={`You haven't configured ${feature.toLowerCase()} yet. Let's get you started!`}
      action={onAction ? { label: 'Get Started', onClick: onAction } : undefined}
      className={className}
    />
  );
}

export function ComingSoonEmptyState({
  feature,
  className,
}: PresetEmptyStateProps & { feature: string }) {
  return (
    <EmptyState
      icon={Settings}
      title="Coming Soon"
      description={`${feature} is currently under development and will be available in a future update.`}
      className={className}
    />
  );
}

// ============================================
// Export All
// ============================================

export default EmptyState;

