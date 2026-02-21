/**
 * Enhanced Rule Toggle Component
 * 
 * A sophisticated toggle switch for OPA policy rules with:
 * - Visual status indication (enabled/disabled/pending)
 * - Confirmation dialog for destructive actions
 * - Undo capability
 * - Impact preview
 * - Keyboard accessibility
 * 
 * Used in PolicyRuleManager and OPA Policy pages.
 */

'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { adminToast } from '@/lib/admin-toast';

// ============================================
// Types
// ============================================

export interface IEnhancedRuleToggleProps {
  /** Unique rule identifier */
  ruleName: string;
  /** Display label for the rule */
  label?: string;
  /** Current enabled state */
  enabled: boolean;
  /** Whether the toggle is currently processing */
  isLoading?: boolean;
  /** Callback when toggle is clicked */
  onToggle: (ruleName: string, newState: boolean) => Promise<void>;
  /** Whether to show confirmation before toggling */
  requireConfirmation?: boolean;
  /** Impact level for visual styling */
  impactLevel?: 'low' | 'medium' | 'high' | 'critical';
  /** Description of what this rule does */
  description?: string;
  /** Preview of impact when toggled */
  impactPreview?: string;
  /** Disable the toggle */
  disabled?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show inline label */
  showLabel?: boolean;
}

// ============================================
// Impact Level Styles
// ============================================

const impactStyles = {
  low: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    icon: '✓',
    label: 'Low Impact',
  },
  medium: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-700',
    icon: '⚡',
    label: 'Medium Impact',
  },
  high: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-700',
    icon: '⚠️',
    label: 'High Impact',
  },
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    icon: '🚨',
    label: 'Critical Impact',
  },
};

const sizeStyles = {
  sm: {
    toggle: 'w-8 h-4',
    dot: 'w-3 h-3',
    translateOn: 'translateX(16px)',
    translateOff: 'translateX(2px)',
  },
  md: {
    toggle: 'w-11 h-6',
    dot: 'w-5 h-5',
    translateOn: 'translateX(20px)',
    translateOff: 'translateX(2px)',
  },
  lg: {
    toggle: 'w-14 h-7',
    dot: 'w-6 h-6',
    translateOn: 'translateX(28px)',
    translateOff: 'translateX(2px)',
  },
};

// ============================================
// Component
// ============================================

export function EnhancedRuleToggle({
  ruleName,
  label,
  enabled,
  isLoading = false,
  onToggle,
  requireConfirmation = false,
  impactLevel = 'low',
  description,
  impactPreview,
  disabled = false,
  size = 'md',
  showLabel = true,
}: IEnhancedRuleToggleProps) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [lastState, setLastState] = useState(enabled);

  const impact = impactStyles[impactLevel];
  const sizeStyle = sizeStyles[size];

  const handleClick = useCallback(async () => {
    if (disabled || isLoading || isPending) return;

    // For high/critical impact, require confirmation
    if (requireConfirmation || impactLevel === 'high' || impactLevel === 'critical') {
      setShowConfirmation(true);
      return;
    }

    await performToggle();
  }, [disabled, isLoading, isPending, requireConfirmation, impactLevel]);

  const performToggle = useCallback(async () => {
    setIsPending(true);
    setLastState(enabled);

    try {
      await onToggle(ruleName, !enabled);
      adminToast.policy.ruleToggled(label || ruleName, !enabled);
    } catch (error) {
      console.error('Failed to toggle rule:', error);
      adminToast.error(`Failed to toggle rule "${label || ruleName}"`, error);
    } finally {
      setIsPending(false);
      setShowConfirmation(false);
    }
  }, [ruleName, label, enabled, onToggle]);

  const handleUndo = useCallback(async () => {
    setIsPending(true);
    try {
      await onToggle(ruleName, lastState);
      adminToast.info(`Reverted "${label || ruleName}" to ${lastState ? 'enabled' : 'disabled'}`);
    } catch (error) {
      adminToast.error('Failed to undo', error);
    } finally {
      setIsPending(false);
    }
  }, [ruleName, label, lastState, onToggle]);

  const isActive = isPending || isLoading;

  return (
    <div className="relative">
      {/* Toggle Switch */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Toggle ${label || ruleName}`}
          disabled={disabled || isActive}
          onClick={handleClick}
          className={`
            relative inline-flex items-center rounded-full transition-colors duration-200 ease-in-out
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
            ${sizeStyle.toggle}
            ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
            ${enabled 
              ? impactLevel === 'critical' ? 'bg-red-500' 
                : impactLevel === 'high' ? 'bg-orange-500'
                : impactLevel === 'medium' ? 'bg-yellow-500'
                : 'bg-green-500'
              : 'bg-gray-300'
            }
          `}
        >
          <motion.span
            className={`
              inline-block rounded-full bg-white shadow-sm
              ${sizeStyle.dot}
              ${isActive ? 'animate-pulse' : ''}
            `}
            animate={{
              x: enabled ? sizeStyle.translateOn : sizeStyle.translateOff,
            }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </button>

        {/* Label */}
        {showLabel && (label || ruleName) && (
          <div className="flex flex-col">
            <span className={`text-sm font-medium ${enabled ? 'text-gray-900' : 'text-gray-500'}`}>
              {label || ruleName}
            </span>
            {description && (
              <span className="text-xs text-gray-500 line-clamp-1">
                {description}
              </span>
            )}
          </div>
        )}

        {/* Loading Indicator */}
        {isActive && (
          <motion.span
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            className="ml-2"
          >
            <svg className="animate-spin h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </motion.span>
        )}

        {/* Impact Badge */}
        {impactLevel !== 'low' && (
          <span className={`
            inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
            ${impact.bg} ${impact.text} ${impact.border} border
          `}>
            {impact.icon} {impact.label}
          </span>
        )}
      </div>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {showConfirmation && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute left-0 top-full mt-2 z-50 w-80"
          >
            <div className={`
              rounded-lg shadow-lg border p-4
              ${impact.bg} ${impact.border}
            `}>
              <div className="flex items-start gap-3">
                <span className="text-2xl">{impact.icon}</span>
                <div className="flex-1">
                  <h4 className={`font-semibold ${impact.text}`}>
                    Confirm {enabled ? 'Disable' : 'Enable'} Rule
                  </h4>
                  <p className="text-sm text-gray-700 mt-1">
                    {enabled 
                      ? `Disabling "${label || ruleName}" may reduce security controls.`
                      : `Enabling "${label || ruleName}" will add additional checks.`
                    }
                  </p>
                  {impactPreview && (
                    <div className="mt-2 p-2 bg-white/50 rounded text-xs text-gray-600 font-mono">
                      {impactPreview}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setShowConfirmation(false)}
                  className="flex-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  disabled={isPending}
                >
                  Cancel
                </button>
                <button
                  onClick={performToggle}
                  className={`
                    flex-1 px-3 py-1.5 text-sm font-medium text-white rounded-md
                    ${enabled 
                      ? 'bg-red-600 hover:bg-red-700' 
                      : 'bg-green-600 hover:bg-green-700'
                    }
                    ${isPending ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                  disabled={isPending}
                >
                  {isPending ? 'Processing...' : enabled ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default EnhancedRuleToggle;
