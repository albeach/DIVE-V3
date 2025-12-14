/**
 * Session Countdown Component
 * 
 * Visual indicator for session expiration:
 * - Shows remaining time in admin header
 * - Pulsing animation when low
 * - Click to extend session
 * - Integrates with existing session management
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, RefreshCw, AlertTriangle, Check } from 'lucide-react';
import { useSession } from 'next-auth/react';

// ============================================
// Types
// ============================================

interface SessionCountdownProps {
  onExpiringSoon?: () => void;
  warningThreshold?: number; // seconds before showing warning
  criticalThreshold?: number; // seconds before showing critical
  className?: string;
  compact?: boolean;
}

type SessionStatus = 'healthy' | 'warning' | 'critical' | 'expired' | 'extending' | 'unknown';

// ============================================
// Component
// ============================================

export function SessionCountdown({
  onExpiringSoon,
  warningThreshold = 300, // 5 minutes
  criticalThreshold = 120, // 2 minutes
  className = '',
  compact = false,
}: SessionCountdownProps) {
  const { status: authStatus } = useSession();
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('unknown');
  const [isExtending, setIsExtending] = useState(false);
  const [justExtended, setJustExtended] = useState(false);

  // Fetch session info
  const fetchSessionInfo = useCallback(async () => {
    if (authStatus !== 'authenticated') return;

    try {
      const response = await fetch('/api/session/refresh', { cache: 'no-store' });
      if (!response.ok) {
        setSessionStatus('expired');
        return;
      }

      const data = await response.json();
      const expiresAt = data.expiresAt ? new Date(data.expiresAt).getTime() : null;
      
      if (!expiresAt) {
        setSessionStatus('unknown');
        return;
      }

      const remaining = Math.floor((expiresAt - Date.now()) / 1000);
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        setSessionStatus('expired');
      } else if (remaining <= criticalThreshold) {
        setSessionStatus('critical');
        onExpiringSoon?.();
      } else if (remaining <= warningThreshold) {
        setSessionStatus('warning');
      } else {
        setSessionStatus('healthy');
      }
    } catch (error) {
      console.error('[SessionCountdown] Error:', error);
      setSessionStatus('unknown');
    }
  }, [authStatus, warningThreshold, criticalThreshold, onExpiringSoon]);

  // Initial fetch and interval
  useEffect(() => {
    fetchSessionInfo();
    const interval = setInterval(fetchSessionInfo, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [fetchSessionInfo]);

  // Countdown timer
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev === null) return null;
        const next = prev - 1;

        if (next <= 0) {
          setSessionStatus('expired');
          return 0;
        }
        if (next <= criticalThreshold && sessionStatus !== 'critical') {
          setSessionStatus('critical');
          onExpiringSoon?.();
        } else if (next <= warningThreshold && sessionStatus === 'healthy') {
          setSessionStatus('warning');
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining, sessionStatus, warningThreshold, criticalThreshold, onExpiringSoon]);

  // Extend session
  const handleExtend = async () => {
    setIsExtending(true);
    try {
      const response = await fetch('/api/session/refresh', {
        method: 'POST',
        cache: 'no-store',
      });

      if (response.ok) {
        setJustExtended(true);
        setTimeout(() => setJustExtended(false), 2000);
        await fetchSessionInfo();
      }
    } catch (error) {
      console.error('[SessionCountdown] Extend failed:', error);
    } finally {
      setIsExtending(false);
    }
  };

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Don't render if not authenticated or unknown status
  if (authStatus !== 'authenticated' || sessionStatus === 'unknown') {
    return null;
  }

  // Status colors
  const statusConfig = {
    healthy: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-700 dark:text-green-400',
      icon: Clock,
      pulse: false,
    },
    warning: {
      bg: 'bg-amber-100 dark:bg-amber-900/30',
      text: 'text-amber-700 dark:text-amber-400',
      icon: Clock,
      pulse: false,
    },
    critical: {
      bg: 'bg-red-100 dark:bg-red-900/30',
      text: 'text-red-700 dark:text-red-400',
      icon: AlertTriangle,
      pulse: true,
    },
    expired: {
      bg: 'bg-red-100 dark:bg-red-900/30',
      text: 'text-red-700 dark:text-red-400',
      icon: AlertTriangle,
      pulse: true,
    },
    extending: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-700 dark:text-blue-400',
      icon: RefreshCw,
      pulse: false,
    },
  };

  const config = isExtending ? statusConfig.extending : statusConfig[sessionStatus];
  const Icon = config.icon;

  // Only show in warning/critical states unless compact mode
  if (!compact && sessionStatus === 'healthy') {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`inline-flex items-center gap-2 ${className}`}
    >
      <button
        onClick={handleExtend}
        disabled={isExtending || sessionStatus === 'expired'}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
          transition-all duration-200
          ${config.bg} ${config.text}
          ${sessionStatus !== 'expired' ? 'hover:opacity-80 cursor-pointer' : 'cursor-not-allowed'}
          ${config.pulse ? 'animate-pulse' : ''}
        `}
        title={sessionStatus === 'expired' ? 'Session expired' : 'Click to extend session'}
      >
        <AnimatePresence mode="wait">
          {justExtended ? (
            <motion.div
              key="check"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <Check className="w-4 h-4 text-green-600" />
            </motion.div>
          ) : (
            <motion.div
              key="icon"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <Icon className={`w-4 h-4 ${isExtending ? 'animate-spin' : ''}`} />
            </motion.div>
          )}
        </AnimatePresence>

        {timeRemaining !== null && timeRemaining > 0 ? (
          <span className="font-mono tabular-nums">
            {formatTime(timeRemaining)}
          </span>
        ) : sessionStatus === 'expired' ? (
          <span>Expired</span>
        ) : null}

        {!compact && sessionStatus === 'warning' && (
          <span className="hidden sm:inline">remaining</span>
        )}
      </button>

      {/* Extend button for critical state */}
      {sessionStatus === 'critical' && !compact && (
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={handleExtend}
          disabled={isExtending}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          {isExtending ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            'Extend'
          )}
        </motion.button>
      )}
    </motion.div>
  );
}

// ============================================
// Session Bar (for admin header)
// ============================================

interface SessionBarProps {
  className?: string;
}

export function SessionBar({ className = '' }: SessionBarProps) {
  return (
    <div className={`flex items-center ${className}`}>
      <SessionCountdown compact />
    </div>
  );
}

export default SessionCountdown;

