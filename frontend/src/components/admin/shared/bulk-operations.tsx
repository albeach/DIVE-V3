/**
 * Bulk Operations Components
 * 
 * Reusable components for batch operations:
 * - Selection management
 * - Bulk action toolbar
 * - Progress tracking
 * - Confirmation dialogs
 */

'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trash2,
  Download,
  Upload,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Users,
  Settings,
  Shield,
  Ban,
  RefreshCw,
} from 'lucide-react';
import { notify } from '@/lib/notification-service';

// ============================================
// Types
// ============================================

export interface BulkAction {
  id: string;
  label: string;
  icon: typeof Trash2;
  variant: 'default' | 'danger' | 'warning' | 'success';
  confirmRequired?: boolean;
  confirmMessage?: string;
  handler: (selectedIds: string[]) => Promise<BulkOperationResult>;
}

export interface BulkOperationResult {
  success: boolean;
  processed: number;
  failed: number;
  errors?: string[];
}

interface BulkOperationsToolbarProps {
  selectedCount: number;
  totalCount: number;
  actions: BulkAction[];
  onClearSelection: () => void;
  onSelectAll: () => void;
  selectedIds: string[];
  className?: string;
}

// ============================================
// Bulk Operations Toolbar
// ============================================

export function BulkOperationsToolbar({
  selectedCount,
  totalCount,
  actions,
  onClearSelection,
  onSelectAll,
  selectedIds,
  className = '',
}: BulkOperationsToolbarProps) {
  const [activeAction, setActiveAction] = useState<BulkAction | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [progress, setProgress] = useState<BulkOperationResult | null>(null);

  const executeAction = async (action: BulkAction) => {
    if (action.confirmRequired) {
      setActiveAction(action);
      setShowConfirm(true);
      return;
    }

    await runAction(action);
  };

  const runAction = async (action: BulkAction) => {
    setIsExecuting(true);
    setActiveAction(action);
    setShowConfirm(false);

    try {
      const result = await action.handler(selectedIds);
      setProgress(result);

      if (result.success) {
        notify.toast.success(`${action.label} completed: ${result.processed} processed`);
        if (result.failed > 0) {
          notify.toast.warning(`${result.failed} items failed`);
        }
        onClearSelection();
      } else {
        notify.toast.error(`${action.label} failed`, result.errors?.[0]);
      }
    } catch (error) {
      notify.toast.error(`${action.label} failed`, error);
    } finally {
      setIsExecuting(false);
      setTimeout(() => {
        setActiveAction(null);
        setProgress(null);
      }, 2000);
    }
  };

  const variantStyles = {
    default: 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300',
    danger: 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400',
    warning: 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400',
    success: 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400',
  };

  if (selectedCount === 0) {
    return null;
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={`flex items-center justify-between gap-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl ${className}`}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
            <Check className="w-4 h-4" />
            {selectedCount} of {totalCount} selected
          </span>
          <button
            onClick={onSelectAll}
            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Select all
          </button>
          <button
            onClick={onClearSelection}
            className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
          >
            Clear
          </button>
        </div>

        <div className="flex items-center gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            const isActive = activeAction?.id === action.id;

            return (
              <button
                key={action.id}
                onClick={() => executeAction(action)}
                disabled={isExecuting}
                className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
                  transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                  ${variantStyles[action.variant]}
                `}
              >
                {isActive && isExecuting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
                {action.label}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {showConfirm && activeAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setShowConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6 m-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-lg ${
                  activeAction.variant === 'danger' ? 'bg-red-100 dark:bg-red-900/30' :
                  activeAction.variant === 'warning' ? 'bg-amber-100 dark:bg-amber-900/30' :
                  'bg-blue-100 dark:bg-blue-900/30'
                }`}>
                  <AlertTriangle className={`w-5 h-5 ${
                    activeAction.variant === 'danger' ? 'text-red-600 dark:text-red-400' :
                    activeAction.variant === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                    'text-blue-600 dark:text-blue-400'
                  }`} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Confirm {activeAction.label}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedCount} item(s) selected
                  </p>
                </div>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                {activeAction.confirmMessage || `Are you sure you want to ${activeAction.label.toLowerCase()} the selected items? This action cannot be undone.`}
              </p>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => runAction(activeAction)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg ${
                    activeAction.variant === 'danger'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ============================================
// Common Bulk Actions
// ============================================

export const commonBulkActions = {
  delete: (handler: (ids: string[]) => Promise<BulkOperationResult>): BulkAction => ({
    id: 'delete',
    label: 'Delete',
    icon: Trash2,
    variant: 'danger',
    confirmRequired: true,
    confirmMessage: 'This will permanently delete the selected items. This action cannot be undone.',
    handler,
  }),

  disable: (handler: (ids: string[]) => Promise<BulkOperationResult>): BulkAction => ({
    id: 'disable',
    label: 'Disable',
    icon: Ban,
    variant: 'warning',
    confirmRequired: true,
    handler,
  }),

  enable: (handler: (ids: string[]) => Promise<BulkOperationResult>): BulkAction => ({
    id: 'enable',
    label: 'Enable',
    icon: Check,
    variant: 'success',
    handler,
  }),

  export: (handler: (ids: string[]) => Promise<BulkOperationResult>): BulkAction => ({
    id: 'export',
    label: 'Export',
    icon: Download,
    variant: 'default',
    handler,
  }),

  resetPassword: (handler: (ids: string[]) => Promise<BulkOperationResult>): BulkAction => ({
    id: 'reset-password',
    label: 'Reset Passwords',
    icon: RefreshCw,
    variant: 'warning',
    confirmRequired: true,
    confirmMessage: 'This will send password reset emails to all selected users.',
    handler,
  }),

  assignRole: (role: string, handler: (ids: string[]) => Promise<BulkOperationResult>): BulkAction => ({
    id: `assign-role-${role}`,
    label: `Assign ${role}`,
    icon: Shield,
    variant: 'default',
    handler,
  }),
};

// ============================================
// Selection Hook
// ============================================

export function useBulkSelection<T extends { id: string }>(items: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map((item) => item.id)));
  }, [items]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectRange = useCallback(
    (startId: string, endId: string) => {
      const startIndex = items.findIndex((item) => item.id === startId);
      const endIndex = items.findIndex((item) => item.id === endId);
      const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];

      const rangeIds = items.slice(from, to + 1).map((item) => item.id);
      setSelectedIds((prev) => new Set([...prev, ...rangeIds]));
    },
    [items]
  );

  return {
    selectedIds: Array.from(selectedIds),
    selectedCount: selectedIds.size,
    isSelected,
    toggle,
    selectAll,
    clearSelection,
    selectRange,
    hasSelection: selectedIds.size > 0,
    isAllSelected: selectedIds.size === items.length && items.length > 0,
    isSomeSelected: selectedIds.size > 0 && selectedIds.size < items.length,
  };
}

export default {
  BulkOperationsToolbar,
  commonBulkActions,
  useBulkSelection,
};

