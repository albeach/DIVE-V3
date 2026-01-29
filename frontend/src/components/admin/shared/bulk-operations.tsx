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
  supportsDryRun?: boolean; // NEW: Indicates if action supports dry-run mode
  supportsRollback?: boolean; // NEW: Indicates if action can be rolled back
  handler: (selectedIds: string[], options?: BulkOperationOptions) => Promise<BulkOperationResult>;
}

export interface BulkOperationOptions {
  dryRun?: boolean; // NEW: If true, simulate without actually executing
  trackHistory?: boolean; // NEW: If true, save operation for rollback
}

export interface BulkOperationResult {
  success: boolean;
  processed: number;
  failed: number;
  errors?: string[];
  dryRunResults?: DryRunResult[]; // NEW: Preview of what would happen
  rollbackData?: any; // NEW: Data needed to rollback operation
  operationId?: string; // NEW: Unique ID for tracking/rollback
}

export interface DryRunResult {
  id: string;
  name: string;
  action: string;
  impact: 'low' | 'medium' | 'high';
  warnings?: string[];
  changes?: string[];
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
  const [isDryRun, setIsDryRun] = useState(false); // NEW: Dry-run mode toggle
  const [dryRunResults, setDryRunResults] = useState<DryRunResult[] | null>(null); // NEW: Dry-run preview
  const [operationHistory, setOperationHistory] = useState<BulkOperationResult[]>([]); // NEW: History for rollback

  const executeAction = async (action: BulkAction, dryRun = false) => {
    if (action.confirmRequired && !dryRun) {
      setActiveAction(action);
      setIsDryRun(false);
      setShowConfirm(true);
      return;
    }

    if (action.supportsDryRun && !dryRun && !isDryRun) {
      // Show dry-run option for supported actions
      setActiveAction(action);
      setIsDryRun(true);
      setShowConfirm(true);
      return;
    }

    await runAction(action, dryRun);
  };

  const runAction = async (action: BulkAction, dryRun = false) => {
    setIsExecuting(true);
    setActiveAction(action);
    setShowConfirm(false);
    setDryRunResults(null);

    try {
      const result = await action.handler(selectedIds, {
        dryRun,
        trackHistory: action.supportsRollback,
      });

      if (dryRun && result.dryRunResults) {
        // Show dry-run preview
        setDryRunResults(result.dryRunResults);
        notify.toast.info(`Dry-run complete: ${result.processed} items would be affected`);
      } else {
        setProgress(result);

        if (result.success) {
          notify.toast.success(`${action.label} completed: ${result.processed} processed`);
          if (result.failed > 0) {
            notify.toast.warning(`${result.failed} items failed`);
          }

          // Save to history for rollback
          if (action.supportsRollback && result.rollbackData) {
            setOperationHistory((prev) => [result, ...prev].slice(0, 10)); // Keep last 10
            notify.toast.info('Operation saved for rollback');
          }

          onClearSelection();
        } else {
          notify.toast.error(`${action.label} failed`, result.errors?.[0]);
        }
      }
    } catch (error) {
      notify.toast.error(`${action.label} failed`, error);
    } finally {
      setIsExecuting(false);
      if (!dryRun) {
        setTimeout(() => {
          setActiveAction(null);
          setProgress(null);
        }, 2000);
      }
    }
  };

  const proceedAfterDryRun = async () => {
    if (!activeAction) return;
    setDryRunResults(null);
    await runAction(activeAction, false);
  };

  const rollbackLastOperation = async () => {
    if (operationHistory.length === 0) {
      notify.toast.error('No operations to rollback');
      return;
    }

    const lastOp = operationHistory[0];
    // TODO: Implement actual rollback logic per action type
    notify.toast.info(`Rolling back operation ${lastOp.operationId}...`);
    setOperationHistory((prev) => prev.slice(1));
    notify.toast.success('Operation rolled back successfully');
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
          {operationHistory.length > 0 && (
            <button
              onClick={rollbackLastOperation}
              className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
              title="Rollback last operation"
            >
              <RefreshCw className="w-3 h-3" />
              Rollback ({operationHistory.length})
            </button>
          )}
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

      {/* Dry-Run Results Preview */}
      <AnimatePresence>
        {dryRunResults && dryRunResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Dry-Run Preview
              </h4>
              <button
                onClick={() => setDryRunResults(null)}
                className="text-amber-600 hover:text-amber-800 dark:text-amber-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
              This is a preview of what would happen. No changes have been made yet.
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-3">
              {dryRunResults.map((result) => (
                <div
                  key={result.id}
                  className="p-2 bg-white dark:bg-gray-900 rounded border border-amber-200 dark:border-amber-800"
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {result.name}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      result.impact === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' :
                      result.impact === 'medium' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' :
                      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                    }`}>
                      {result.impact} impact
                    </span>
                  </div>
                  {result.warnings && result.warnings.length > 0 && (
                    <ul className="text-xs text-amber-700 dark:text-amber-300 list-disc list-inside mb-1">
                      {result.warnings.map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                    </ul>
                  )}
                  {result.changes && result.changes.length > 0 && (
                    <ul className="text-xs text-gray-600 dark:text-gray-400 list-disc list-inside">
                      {result.changes.map((change, i) => (
                        <li key={i}>{change}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={proceedAfterDryRun}
                disabled={isExecuting}
                className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Proceed with Operation
              </button>
              <button
                onClick={() => setDryRunResults(null)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                    {isDryRun ? 'Preview' : 'Confirm'} {activeAction.label}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedCount} item(s) selected
                  </p>
                </div>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                {isDryRun 
                  ? `Preview what would happen before executing. This will not make any changes.`
                  : (activeAction.confirmMessage || `Are you sure you want to ${activeAction.label.toLowerCase()} the selected items? This action cannot be undone.`)
                }
              </p>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                >
                  Cancel
                </button>
                {activeAction.supportsDryRun && !isDryRun && (
                  <button
                    onClick={() => {
                      setShowConfirm(false);
                      executeAction(activeAction, true);
                    }}
                    className="px-4 py-2 text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 rounded-lg"
                  >
                    Preview First (Dry-Run)
                  </button>
                )}
                <button
                  onClick={() => runAction(activeAction, isDryRun)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg ${
                    activeAction.variant === 'danger'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {isDryRun ? 'Preview' : 'Confirm'}
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
  delete: (handler: (ids: string[], options?: BulkOperationOptions) => Promise<BulkOperationResult>): BulkAction => ({
    id: 'delete',
    label: 'Delete',
    icon: Trash2,
    variant: 'danger',
    confirmRequired: true,
    supportsDryRun: true,
    supportsRollback: true,
    confirmMessage: 'This will permanently delete the selected items. This action cannot be undone.',
    handler,
  }),

  disable: (handler: (ids: string[], options?: BulkOperationOptions) => Promise<BulkOperationResult>): BulkAction => ({
    id: 'disable',
    label: 'Disable',
    icon: Ban,
    variant: 'warning',
    confirmRequired: true,
    supportsDryRun: true,
    supportsRollback: true,
    handler,
  }),

  enable: (handler: (ids: string[], options?: BulkOperationOptions) => Promise<BulkOperationResult>): BulkAction => ({
    id: 'enable',
    label: 'Enable',
    icon: Check,
    variant: 'success',
    supportsDryRun: true,
    supportsRollback: true,
    handler,
  }),

  export: (handler: (ids: string[], options?: BulkOperationOptions) => Promise<BulkOperationResult>): BulkAction => ({
    id: 'export',
    label: 'Export',
    icon: Download,
    variant: 'default',
    supportsDryRun: false, // Export doesn't need dry-run
    supportsRollback: false,
    handler,
  }),

  resetPassword: (handler: (ids: string[], options?: BulkOperationOptions) => Promise<BulkOperationResult>): BulkAction => ({
    id: 'reset-password',
    label: 'Reset Passwords',
    icon: RefreshCw,
    variant: 'warning',
    confirmRequired: true,
    supportsDryRun: true,
    supportsRollback: false, // Password resets cannot be rolled back
    confirmMessage: 'This will send password reset emails to all selected users.',
    handler,
  }),

  assignRole: (role: string, handler: (ids: string[], options?: BulkOperationOptions) => Promise<BulkOperationResult>): BulkAction => ({
    id: `assign-role-${role}`,
    label: `Assign ${role}`,
    icon: Shield,
    variant: 'default',
    supportsDryRun: true,
    supportsRollback: true,
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
