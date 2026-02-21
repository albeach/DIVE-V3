/**
 * DIVE V3 - Token Expiry Badge
 *
 * Visual indicator for token expiry status with countdown.
 * Shows warning states for expiring and expired tokens.
 *
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Key,
  Clock,
  AlertTriangle,
  XCircle,
  CheckCircle2,
} from 'lucide-react';
import { ISpoke, ITokenInfo } from '@/types/federation.types';

interface TokenExpiryBadgeProps {
  /** Token expiry date as ISO string */
  expiresAt?: string;
  /** Display mode */
  variant?: 'badge' | 'full' | 'compact' | 'minimal';
  /** Show icon */
  showIcon?: boolean;
  /** Optional spoke data for additional context */
  spoke?: ISpoke;
  /** Click handler */
  onClick?: () => void;
}

export function getTokenStatus(expiresAt?: string): ITokenInfo {
  if (!expiresAt) {
    return {
      expiresAt: '',
      scopes: [],
      status: 'none',
    };
  }

  const now = new Date();
  const expires = new Date(expiresAt);
  const diffMs = expires.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const hoursRemaining = Math.ceil(diffMs / (1000 * 60 * 60));

  if (daysRemaining <= 0) {
    return {
      expiresAt,
      scopes: [],
      status: 'expired',
      daysUntilExpiry: daysRemaining,
      hoursUntilExpiry: hoursRemaining,
    };
  }

  if (daysRemaining <= 7) {
    return {
      expiresAt,
      scopes: [],
      status: 'expiring',
      daysUntilExpiry: daysRemaining,
      hoursUntilExpiry: hoursRemaining,
    };
  }

  return {
    expiresAt,
    scopes: [],
    status: 'valid',
    daysUntilExpiry: daysRemaining,
    hoursUntilExpiry: hoursRemaining,
  };
}

const STATUS_CONFIG = {
  valid: {
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    border: 'border-emerald-200 dark:border-emerald-800',
    icon: CheckCircle2,
    label: 'Valid',
  },
  expiring: {
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    border: 'border-amber-200 dark:border-amber-800',
    icon: AlertTriangle,
    label: 'Expiring Soon',
  },
  expired: {
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-100 dark:bg-red-900/30',
    border: 'border-red-200 dark:border-red-800',
    icon: XCircle,
    label: 'Expired',
  },
  none: {
    color: 'text-gray-500 dark:text-gray-400',
    bg: 'bg-gray-100 dark:bg-gray-800',
    border: 'border-gray-200 dark:border-gray-700',
    icon: Key,
    label: 'No Token',
  },
} as const;

export function TokenExpiryBadge({
  expiresAt,
  variant = 'badge',
  showIcon = true,
  spoke,
  onClick,
}: TokenExpiryBadgeProps) {
  const [tokenInfo, setTokenInfo] = useState<ITokenInfo>(() => getTokenStatus(expiresAt));

  // Update token status periodically
  useEffect(() => {
    setTokenInfo(getTokenStatus(expiresAt));

    // Update every minute
    const interval = setInterval(() => {
      setTokenInfo(getTokenStatus(expiresAt));
    }, 60000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const config = STATUS_CONFIG[tokenInfo.status];
  const StatusIcon = config.icon;

  const formatCountdown = () => {
    if (tokenInfo.status === 'none') return 'No token';
    if (tokenInfo.status === 'expired') return 'Expired';

    if (tokenInfo.daysUntilExpiry && tokenInfo.daysUntilExpiry > 1) {
      return `${tokenInfo.daysUntilExpiry} days`;
    }

    if (tokenInfo.hoursUntilExpiry && tokenInfo.hoursUntilExpiry > 0) {
      return `${tokenInfo.hoursUntilExpiry}h`;
    }

    return 'Expiring soon';
  };

  const formatFullDate = () => {
    if (!expiresAt) return 'No token issued';
    return new Date(expiresAt).toLocaleString();
  };

  // Minimal variant - just an icon with color
  if (variant === 'minimal') {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`p-1 rounded ${config.bg} ${onClick ? 'cursor-pointer hover:scale-110 transition-transform' : ''}`}
        onClick={onClick}
        title={`Token ${config.label}: ${formatFullDate()}`}
      >
        <StatusIcon className={`w-4 h-4 ${config.color}`} />
      </motion.div>
    );
  }

  // Compact variant - icon + countdown
  if (variant === 'compact') {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`
          inline-flex items-center gap-1.5 px-2 py-1 rounded-full
          ${config.bg} ${config.border} border
          ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
          ${tokenInfo.status === 'expiring' ? 'animate-pulse' : ''}
        `}
        onClick={onClick}
        title={formatFullDate()}
      >
        {showIcon && <StatusIcon className={`w-3.5 h-3.5 ${config.color}`} />}
        <span className={`text-xs font-medium ${config.color}`}>
          {formatCountdown()}
        </span>
      </motion.div>
    );
  }

  // Badge variant - standard pill badge
  if (variant === 'badge') {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`
          inline-flex items-center gap-2 px-3 py-1.5 rounded-lg
          ${config.bg} ${config.border} border
          ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
          ${tokenInfo.status === 'expiring' ? 'animate-pulse' : ''}
        `}
        onClick={onClick}
      >
        {showIcon && <StatusIcon className={`w-4 h-4 ${config.color}`} />}
        <div className="flex flex-col">
          <span className={`text-sm font-medium ${config.color}`}>
            {config.label}
          </span>
          {tokenInfo.status !== 'none' && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatCountdown()}
            </span>
          )}
        </div>
      </motion.div>
    );
  }

  // Full variant - card with all details
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        p-4 rounded-xl border ${config.border} ${config.bg}
        ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}
      `}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {showIcon && (
            <div className={`p-2 rounded-lg ${config.bg}`}>
              <StatusIcon className={`w-5 h-5 ${config.color}`} />
            </div>
          )}
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">
              Token Status
            </h4>
            <p className={`text-sm ${config.color}`}>{config.label}</p>
          </div>
        </div>

        {tokenInfo.status === 'expiring' && (
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="px-3 py-1 bg-amber-500 text-white text-xs font-bold rounded-full"
          >
            {formatCountdown()} left
          </motion.div>
        )}
      </div>

      {tokenInfo.status !== 'none' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              <Clock className="w-4 h-4 inline mr-1" />
              Expires
            </span>
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {formatFullDate()}
            </span>
          </div>

          {tokenInfo.daysUntilExpiry !== undefined && tokenInfo.status !== 'expired' && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">
                Time Remaining
              </span>
              <span className={`font-medium ${config.color}`}>
                {tokenInfo.daysUntilExpiry} day{tokenInfo.daysUntilExpiry !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {spoke?.tokenScopes && spoke.tokenScopes.length > 0 && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 mb-1">Scopes</div>
              <div className="flex flex-wrap gap-1">
                {spoke.tokenScopes.map((scope) => (
                  <span
                    key={scope}
                    className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded"
                  >
                    {scope}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tokenInfo.status === 'none' && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No token has been issued for this spoke.
        </p>
      )}
    </motion.div>
  );
}

// Hook for checking expiring tokens across all spokes
export function useExpiringTokens(spokes: ISpoke[], thresholdDays: number = 7) {
  const [expiringCount, setExpiringCount] = useState(0);
  const [expiringSpokes, setExpiringSpokes] = useState<ISpoke[]>([]);

  useEffect(() => {
    const checkTokens = () => {
      const expiring = spokes.filter((spoke) => {
        const status = getTokenStatus(spoke.tokenExpiresAt);
        return status.status === 'expiring' || status.status === 'expired';
      });

      setExpiringCount(expiring.length);
      setExpiringSpokes(expiring);
    };

    checkTokens();
    const interval = setInterval(checkTokens, 60000);

    return () => clearInterval(interval);
  }, [spokes, thresholdDays]);

  return { expiringCount, expiringSpokes };
}

export default TokenExpiryBadge;

