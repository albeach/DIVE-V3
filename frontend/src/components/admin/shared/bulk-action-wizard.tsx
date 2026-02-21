/**
 * BulkActionWizard - 5-step guided bulk operation flow
 *
 * Steps: Select -> Action -> Dry-Run Preview -> Parameters -> Execute
 * Integrates with existing BulkAction types and StepProgress component.
 *
 * @version 1.0.0
 * @date 2026-02-01
 */

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  X,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Search,
  Check,
  Play,
  Eye,
  Settings2,
  ListChecks,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notification-service';
import type {
  BulkAction,
  BulkOperationOptions,
  BulkOperationResult,
  DryRunResult,
} from './bulk-operations';

// ============================================
// Types
// ============================================

export type WizardStep = 'select' | 'action' | 'preview' | 'params' | 'execute';

export interface WizardItem {
  id: string;
  name: string;
  description?: string;
  status?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface WizardParams {
  [key: string]: string | number | boolean;
}

export interface WizardParamField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  options?: { value: string; label: string }[];
  defaultValue?: string | number | boolean;
  description?: string;
  required?: boolean;
}

export interface BulkActionWizardProps {
  isOpen: boolean;
  onClose: () => void;
  items: WizardItem[];
  actions: BulkAction[];
  initialSelectedIds?: string[];
  paramFields?: WizardParamField[];
  title?: string;
  onComplete?: (result: BulkOperationResult) => void;
}

const STEPS: { id: WizardStep; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'select', label: 'Select Items', icon: ListChecks },
  { id: 'action', label: 'Choose Action', icon: Play },
  { id: 'preview', label: 'Preview', icon: Eye },
  { id: 'params', label: 'Parameters', icon: Settings2 },
  { id: 'execute', label: 'Execute', icon: CheckCircle2 },
];

// ============================================
// BulkActionWizard Component
// ============================================

export function BulkActionWizard({
  isOpen,
  onClose,
  items,
  actions,
  initialSelectedIds = [],
  paramFields = [],
  title = 'Bulk Action Wizard',
  onComplete,
}: BulkActionWizardProps) {
  const prefersReducedMotion = useReducedMotion();

  // State
  const [currentStep, setCurrentStep] = useState<WizardStep>('select');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialSelectedIds));
  const [selectedAction, setSelectedAction] = useState<BulkAction | null>(null);
  const [dryRunResults, setDryRunResults] = useState<DryRunResult[] | null>(null);
  const [params, setParams] = useState<WizardParams>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<BulkOperationResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectAll, setSelectAll] = useState(false);

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  // Selection handlers
  const toggleItem = useCallback((id: string) => {
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

  const handleSelectAll = useCallback(() => {
    if (selectAll) {
      setSelectedIds(new Set());
      setSelectAll(false);
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
      setSelectAll(true);
    }
  }, [items, selectAll]);

  // Navigation
  const canProceed = useMemo(() => {
    switch (currentStep) {
      case 'select':
        return selectedIds.size > 0;
      case 'action':
        return selectedAction !== null;
      case 'preview':
        return true;
      case 'params':
        return true;
      case 'execute':
        return false;
      default:
        return false;
    }
  }, [currentStep, selectedIds.size, selectedAction]);

  const goNext = useCallback(async () => {
    const idx = currentStepIndex;
    if (idx < STEPS.length - 1) {
      const nextStep = STEPS[idx + 1].id;

      // If moving to preview and action supports dry-run, run it
      if (nextStep === 'preview' && selectedAction?.supportsDryRun) {
        setIsExecuting(true);
        try {
          const result = await selectedAction.handler(Array.from(selectedIds), {
            dryRun: true,
            trackHistory: false,
          });
          setDryRunResults(result.dryRunResults || null);
        } catch {
          setDryRunResults(null);
        } finally {
          setIsExecuting(false);
        }
      }

      // If no param fields, skip params step
      if (nextStep === 'params' && paramFields.length === 0) {
        setCurrentStep('execute');
        return;
      }

      setCurrentStep(nextStep);
    }
  }, [currentStepIndex, selectedAction, selectedIds, paramFields.length]);

  const goBack = useCallback(() => {
    const idx = currentStepIndex;
    if (idx > 0) {
      const prevStep = STEPS[idx - 1].id;
      // If no param fields, skip params step when going back
      if (prevStep === 'params' && paramFields.length === 0) {
        setCurrentStep('preview');
        return;
      }
      setCurrentStep(prevStep);
    }
  }, [currentStepIndex, paramFields.length]);

  // Execute the bulk action
  const executeAction = useCallback(async () => {
    if (!selectedAction) return;

    setIsExecuting(true);
    setExecutionResult(null);

    try {
      const options: BulkOperationOptions = {
        dryRun: false,
        trackHistory: selectedAction.supportsRollback,
      };

      const result = await selectedAction.handler(Array.from(selectedIds), options);
      setExecutionResult(result);

      if (result.success) {
        notify.toast.success(`${selectedAction.label} completed: ${result.processed} processed`);
        if (result.failed > 0) {
          notify.toast.warning(`${result.failed} items failed`);
        }
      } else {
        notify.toast.error(`${selectedAction.label} failed`, result.errors?.[0]);
      }

      onComplete?.(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      setExecutionResult({
        success: false,
        processed: 0,
        failed: selectedIds.size,
        errors: [msg],
      });
      notify.toast.error(`${selectedAction.label} failed`, msg);
    } finally {
      setIsExecuting(false);
    }
  }, [selectedAction, selectedIds, onComplete]);

  // Reset wizard
  const resetWizard = useCallback(() => {
    setCurrentStep('select');
    setSelectedIds(new Set(initialSelectedIds));
    setSelectedAction(null);
    setDryRunResults(null);
    setParams({});
    setExecutionResult(null);
    setSearchQuery('');
    setSelectAll(false);
  }, [initialSelectedIds]);

  const handleClose = useCallback(() => {
    resetWizard();
    onClose();
  }, [resetWizard, onClose]);

  if (!isOpen) return null;

  const motionProps = prefersReducedMotion
    ? {}
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

  const panelMotion = prefersReducedMotion
    ? {}
    : {
        initial: { scale: 0.95, opacity: 0 },
        animate: { scale: 1, opacity: 1 },
        exit: { scale: 0.95, opacity: 0 },
      };

  return (
    <AnimatePresence>
      <motion.div
        {...motionProps}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          {...panelMotion}
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col m-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
            <button
              onClick={handleClose}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"
              aria-label="Close wizard"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Step Indicator */}
          <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-1">
              {STEPS.map((step, idx) => {
                const isActive = idx === currentStepIndex;
                const isCompleted = idx < currentStepIndex;
                const Icon = step.icon;

                return (
                  <React.Fragment key={step.id}>
                    {idx > 0 && (
                      <div
                        className={cn(
                          'flex-1 h-0.5 mx-1',
                          isCompleted
                            ? 'bg-indigo-500'
                            : 'bg-gray-200 dark:bg-gray-700'
                        )}
                      />
                    )}
                    <div
                      className={cn(
                        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap',
                        isActive && 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
                        isCompleted && 'text-indigo-600 dark:text-indigo-400',
                        !isActive && !isCompleted && 'text-gray-400 dark:text-gray-500'
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                      ) : (
                        <Icon className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">{step.label}</span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            {/* Step 1: Select Items */}
            {currentStep === 'select' && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search items..."
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={handleSelectAll}
                    className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
                  >
                    {selectAll ? 'Deselect All' : `Select All (${items.length})`}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedIds.size} of {items.length} selected
                </p>
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {filteredItems.map((item) => {
                    const isChecked = selectedIds.has(item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleItem(item.id)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                          isChecked
                            ? 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800'
                            : 'bg-gray-50 dark:bg-gray-800 border border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                        )}
                      >
                        <div
                          className={cn(
                            'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0',
                            isChecked
                              ? 'bg-indigo-500 border-indigo-500'
                              : 'border-gray-300 dark:border-gray-600'
                          )}
                        >
                          {isChecked && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {item.name}
                          </p>
                          {item.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {item.description}
                            </p>
                          )}
                        </div>
                        {item.status && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                            {item.status}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                      No items match your search
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Choose Action */}
            {currentStep === 'action' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Choose an action to perform on {selectedIds.size} selected item(s).
                </p>
                <div className="grid gap-2">
                  {actions.map((action) => {
                    const Icon = action.icon;
                    const isSelected = selectedAction?.id === action.id;
                    const variantBorder = {
                      default: 'border-gray-200 dark:border-gray-700',
                      danger: 'border-red-200 dark:border-red-800',
                      warning: 'border-amber-200 dark:border-amber-800',
                      success: 'border-green-200 dark:border-green-800',
                    };
                    const variantBg = {
                      default: 'bg-gray-50 dark:bg-gray-800',
                      danger: 'bg-red-50 dark:bg-red-900/20',
                      warning: 'bg-amber-50 dark:bg-amber-900/20',
                      success: 'bg-green-50 dark:bg-green-900/20',
                    };

                    return (
                      <button
                        key={action.id}
                        onClick={() => setSelectedAction(action)}
                        className={cn(
                          'flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all',
                          isSelected
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-2 ring-indigo-500/20'
                            : `${variantBorder[action.variant]} ${variantBg[action.variant]} hover:ring-2 hover:ring-gray-200 dark:hover:ring-gray-600`
                        )}
                      >
                        <div
                          className={cn(
                            'p-2 rounded-lg',
                            action.variant === 'danger' && 'bg-red-100 dark:bg-red-900/40',
                            action.variant === 'warning' && 'bg-amber-100 dark:bg-amber-900/40',
                            action.variant === 'success' && 'bg-green-100 dark:bg-green-900/40',
                            action.variant === 'default' && 'bg-gray-100 dark:bg-gray-700'
                          )}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {action.label}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {action.supportsDryRun && (
                              <span className="text-xs text-indigo-600 dark:text-indigo-400">
                                Supports preview
                              </span>
                            )}
                            {action.supportsRollback && (
                              <span className="text-xs text-purple-600 dark:text-purple-400">
                                Rollback available
                              </span>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Dry-Run Preview */}
            {currentStep === 'preview' && (
              <div className="space-y-3">
                {isExecuting ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Running preview...
                    </p>
                  </div>
                ) : dryRunResults && dryRunResults.length > 0 ? (
                  <>
                    <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        Preview: {dryRunResults.length} items would be affected. No changes made yet.
                      </p>
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {dryRunResults.map((result) => (
                        <div
                          key={result.id}
                          className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {result.name}
                            </span>
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded text-xs font-medium',
                                result.impact === 'high' && 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
                                result.impact === 'medium' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
                                result.impact === 'low' && 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                              )}
                            >
                              {result.impact} impact
                            </span>
                          </div>
                          {result.warnings && result.warnings.length > 0 && (
                            <ul className="text-xs text-amber-700 dark:text-amber-300 list-disc list-inside mb-1">
                              {result.warnings.map((w, i) => (
                                <li key={i}>{w}</li>
                              ))}
                            </ul>
                          )}
                          {result.changes && result.changes.length > 0 && (
                            <ul className="text-xs text-gray-600 dark:text-gray-400 list-disc list-inside">
                              {result.changes.map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12">
                    <Eye className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedAction?.supportsDryRun
                        ? 'No preview data available for this action.'
                        : 'This action does not support preview mode.'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      {selectedIds.size} items will be processed when you proceed.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Parameters */}
            {currentStep === 'params' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Configure additional parameters for this operation.
                </p>
                {paramFields.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {field.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {field.description}
                      </p>
                    )}
                    {field.type === 'boolean' ? (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(params[field.key] ?? field.defaultValue ?? false)}
                          onChange={(e) =>
                            setParams((prev) => ({ ...prev, [field.key]: e.target.checked }))
                          }
                          className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          Enable
                        </span>
                      </label>
                    ) : field.type === 'select' ? (
                      <select
                        value={String(params[field.key] ?? field.defaultValue ?? '')}
                        onChange={(e) =>
                          setParams((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
                      >
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type}
                        value={String(params[field.key] ?? field.defaultValue ?? '')}
                        onChange={(e) =>
                          setParams((prev) => ({
                            ...prev,
                            [field.key]:
                              field.type === 'number'
                                ? Number(e.target.value)
                                : e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Step 5: Execute */}
            {currentStep === 'execute' && (
              <div className="space-y-4">
                {!executionResult && !isExecuting && (
                  <>
                    {/* Summary before execution */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                        Operation Summary
                      </h4>
                      <dl className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-gray-500 dark:text-gray-400">Items:</dt>
                          <dd className="font-medium text-gray-900 dark:text-gray-100">
                            {selectedIds.size}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-gray-500 dark:text-gray-400">Action:</dt>
                          <dd className="font-medium text-gray-900 dark:text-gray-100">
                            {selectedAction?.label}
                          </dd>
                        </div>
                        {selectedAction?.confirmRequired && (
                          <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                            <p className="text-xs text-red-700 dark:text-red-300 flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {selectedAction.confirmMessage || 'This action requires confirmation.'}
                            </p>
                          </div>
                        )}
                      </dl>
                    </div>
                    <button
                      onClick={executeAction}
                      className={cn(
                        'w-full px-4 py-3 rounded-xl text-sm font-semibold text-white transition-colors',
                        selectedAction?.variant === 'danger'
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-indigo-600 hover:bg-indigo-700'
                      )}
                    >
                      Execute {selectedAction?.label} on {selectedIds.size} Items
                    </button>
                  </>
                )}

                {isExecuting && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Executing {selectedAction?.label}...
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Processing {selectedIds.size} items
                    </p>
                  </div>
                )}

                {executionResult && (
                  <div className="space-y-4">
                    <div
                      className={cn(
                        'p-4 rounded-xl border',
                        executionResult.success
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {executionResult.success ? (
                          <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
                        ) : (
                          <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                        )}
                        <div>
                          <p
                            className={cn(
                              'text-sm font-semibold',
                              executionResult.success
                                ? 'text-green-800 dark:text-green-200'
                                : 'text-red-800 dark:text-red-200'
                            )}
                          >
                            {executionResult.success ? 'Operation Complete' : 'Operation Failed'}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                            {executionResult.processed} processed, {executionResult.failed} failed
                          </p>
                        </div>
                      </div>
                    </div>

                    {executionResult.errors && executionResult.errors.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          Errors:
                        </p>
                        <ul className="text-xs text-red-600 dark:text-red-400 list-disc list-inside">
                          {executionResult.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <button
                      onClick={handleClose}
                      className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Navigation */}
          {currentStep !== 'execute' && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={currentStepIndex > 0 ? goBack : handleClose}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <ChevronLeft className="w-4 h-4" />
                {currentStepIndex > 0 ? 'Back' : 'Cancel'}
              </button>
              <button
                onClick={goNext}
                disabled={!canProceed || isExecuting}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExecuting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default BulkActionWizard;
