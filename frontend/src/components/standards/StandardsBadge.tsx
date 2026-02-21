"use client";

import { Shield, Database, GitMerge } from 'lucide-react';

/**
 * Standards Badge Component
 * 
 * Larger badge for section headers showing which standard governs.
 * Used to visually separate 5663-focused vs 240-focused sections.
 * 
 * Examples:
 * - Authentication section → 5663 badge
 * - ZTDF structure section → 240 badge
 * - Authorization decision → Both badge
 */

interface StandardsBadgeProps {
  standard: '5663' | '240' | 'both';
  size?: 'sm' | 'md' | 'lg';
}

export function StandardsBadge({ standard, size = 'md' }: StandardsBadgeProps) {
  const configs = {
    '5663': {
      label: 'ADatP-5663',
      subtitle: 'Federation / Identity',
      gradient: 'from-indigo-500 to-blue-500',
      icon: Shield,
      emoji: '🔵',
    },
    '240': {
      label: 'ACP-240',
      subtitle: 'Object / Data',
      gradient: 'from-amber-500 to-red-500',
      icon: Database,
      emoji: '🟠',
    },
    'both': {
      label: 'Shared ABAC',
      subtitle: 'Both Standards',
      gradient: 'from-teal-500 to-cyan-500',
      icon: GitMerge,
      emoji: '🟢',
    },
  };

  const config = configs[standard];
  const Icon = config.icon;

  const sizeClasses = {
    sm: {
      container: 'px-3 py-2',
      icon: 'w-5 h-5',
      label: 'text-sm',
      subtitle: 'text-xs',
    },
    md: {
      container: 'px-4 py-2.5',
      icon: 'w-6 h-6',
      label: 'text-base',
      subtitle: 'text-xs',
    },
    lg: {
      container: 'px-5 py-3',
      icon: 'w-7 h-7',
      label: 'text-lg',
      subtitle: 'text-sm',
    },
  };

  const classes = sizeClasses[size];

  return (
    <div className={`
      inline-flex items-center gap-3 rounded-lg shadow-md
      bg-gradient-to-r ${config.gradient} text-white
      ${classes.container}
    `}>
      <Icon className={classes.icon} />
      <div>
        <div className={`font-bold ${classes.label}`}>
          {config.label}
        </div>
        <div className={`opacity-90 ${classes.subtitle}`}>
          {config.subtitle}
        </div>
      </div>
    </div>
  );
}

/**
 * Inline Standards Indicator
 * 
 * Smaller, inline version for use in text or next to labels
 */
export function StandardsIndicator({ standard }: { standard: '5663' | '240' | 'both' }) {
  const emojis = {
    '5663': '🔵',
    '240': '🟠',
    'both': '🟢',
  };

  const labels = {
    '5663': 'Federation',
    '240': 'Object',
    'both': 'Shared',
  };

  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
      <span>{emojis[standard]}</span>
      <span>{labels[standard]}</span>
    </span>
  );
}
