/**
 * IdP Batch Operations Component
 * 
 * Multi-select toolbar with:
 * - Floating toolbar (appears when items selected)
 * - Batch actions: Enable All, Disable All, Delete Selected, Export, Test All
 * - Confirmation modals for destructive actions
 * - Progress indicators
 * - Success/error toast notifications
 * 
 * Phase 2.9: Modern UI Components
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CheckIcon,
    XMarkIcon,
    TrashIcon,
    DocumentArrowDownIcon,
    PlayIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { useUpdateIdP, useDeleteIdP, useTestIdP } from '@/lib/api/idp-management';
import { adminToast } from '@/lib/admin-toast';

// ============================================
// Types
// ============================================

interface IdPBatchOperationsProps {
    selectedIds: Set<string>;
    onClearSelection: () => void;
    onComplete?: () => void;
}

// ============================================
// Component
// ============================================

export default function IdPBatchOperations({
    selectedIds,
    onClearSelection,
    onComplete
}: IdPBatchOperationsProps) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [showConfirmation, setShowConfirmation] = useState<'enable' | 'disable' | 'delete' | null>(null);

    const updateIdPMutation = useUpdateIdP();
    const deleteIdPMutation = useDeleteIdP();
    const testIdPMutation = useTestIdP();

    const selectedCount = selectedIds.size;

    const handleEnableAll = async () => {
        setIsProcessing(true);
        setProgress(0);

        const ids = Array.from(selectedIds);
        let completed = 0;

        try {
            for (const id of ids) {
                await updateIdPMutation.mutateAsync({
                    alias: id,
                    updates: { enabled: true }
                });
                completed++;
                setProgress((completed / ids.length) * 100);
            }

            adminToast.success(`Successfully enabled ${completed} IdP(s)`);
            onClearSelection();
            if (onComplete) onComplete();
        } catch (error) {
            console.error('Failed to enable IdPs:', error);
            adminToast.warning(`Enabled ${completed}/${ids.length} IdP(s). Some operations failed.`);
        } finally {
            setIsProcessing(false);
            setProgress(0);
            setShowConfirmation(null);
        }
    };

    const handleDisableAll = async () => {
        setIsProcessing(true);
        setProgress(0);

        const ids = Array.from(selectedIds);
        let completed = 0;

        try {
            for (const id of ids) {
                await updateIdPMutation.mutateAsync({
                    alias: id,
                    updates: { enabled: false }
                });
                completed++;
                setProgress((completed / ids.length) * 100);
            }

            adminToast.success(`Successfully disabled ${completed} IdP(s)`);
            onClearSelection();
            if (onComplete) onComplete();
        } catch (error) {
            console.error('Failed to disable IdPs:', error);
            adminToast.warning(`Disabled ${completed}/${ids.length} IdP(s). Some operations failed.`);
        } finally {
            setIsProcessing(false);
            setProgress(0);
            setShowConfirmation(null);
        }
    };

    const handleDeleteAll = async () => {
        setIsProcessing(true);
        setProgress(0);

        const ids = Array.from(selectedIds);
        let completed = 0;

        try {
            for (const id of ids) {
                await deleteIdPMutation.mutateAsync(id);
                completed++;
                setProgress((completed / ids.length) * 100);
            }

            adminToast.success(`Successfully deleted ${completed} IdP(s)`);
            onClearSelection();
            if (onComplete) onComplete();
        } catch (error) {
            console.error('Failed to delete IdPs:', error);
            adminToast.error(`Deleted ${completed}/${ids.length} IdP(s). Some operations failed.`, error);
        } finally {
            setIsProcessing(false);
            setProgress(0);
            setShowConfirmation(null);
        }
    };

    const handleTestAll = async () => {
        setIsProcessing(true);
        setProgress(0);

        const ids = Array.from(selectedIds);
        let completed = 0;
        let successful = 0;

        try {
            for (const id of ids) {
                const result = await testIdPMutation.mutateAsync(id);
                if (result.success) successful++;
                completed++;
                setProgress((completed / ids.length) * 100);
            }

            if (successful === ids.length) {
                adminToast.success(`All ${ids.length} IdP(s) passed connectivity test`);
            } else {
                adminToast.warning(`Test complete: ${successful}/${ids.length} IdP(s) passed`);
            }
            onClearSelection();
        } catch (error) {
            console.error('Failed to test IdPs:', error);
            adminToast.error(`Tested ${completed}/${ids.length} IdP(s). Some operations failed.`, error);
        } finally {
            setIsProcessing(false);
            setProgress(0);
        }
    };

    const handleExport = () => {
        const data = {
            selectedIdPs: Array.from(selectedIds),
            exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `idp-config-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (selectedCount === 0) {
        return null;
    }

    return (
        <>
            {/* Floating Toolbar */}
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0, y: 100 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 100 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40"
                >
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 px-6 py-4">
                        <div className="flex items-center gap-4">
                            {/* Selection Count */}
                            <div className="flex items-center gap-2 pr-4 border-r border-gray-300 dark:border-gray-600">
                                <div className="h-6 w-6 bg-purple-600 rounded-full flex items-center justify-center">
                                    <span className="text-xs font-bold text-white">{selectedCount}</span>
                                </div>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    selected
                                </span>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowConfirmation('enable')}
                                    disabled={isProcessing}
                                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                                    title="Enable All"
                                >
                                    <CheckIcon className="h-4 w-4" />
                                    <span className="hidden sm:inline">Enable</span>
                                </button>

                                <button
                                    onClick={() => setShowConfirmation('disable')}
                                    disabled={isProcessing}
                                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                                    title="Disable All"
                                >
                                    <XMarkIcon className="h-4 w-4" />
                                    <span className="hidden sm:inline">Disable</span>
                                </button>

                                <button
                                    onClick={handleTestAll}
                                    disabled={isProcessing}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                                    title="Test All"
                                >
                                    <PlayIcon className="h-4 w-4" />
                                    <span className="hidden sm:inline">Test</span>
                                </button>

                                <button
                                    onClick={handleExport}
                                    disabled={isProcessing}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                                    title="Export Config"
                                >
                                    <DocumentArrowDownIcon className="h-4 w-4" />
                                    <span className="hidden sm:inline">Export</span>
                                </button>

                                <button
                                    onClick={() => setShowConfirmation('delete')}
                                    disabled={isProcessing}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                                    title="Delete Selected"
                                >
                                    <TrashIcon className="h-4 w-4" />
                                    <span className="hidden sm:inline">Delete</span>
                                </button>
                            </div>

                            {/* Clear Selection */}
                            <button
                                onClick={onClearSelection}
                                disabled={isProcessing}
                                className="pl-4 border-l border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50"
                                title="Clear Selection"
                            >
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Progress Bar */}
                        {isProcessing && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="mt-3"
                            >
                                <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-gradient-to-r from-purple-600 to-blue-600"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                        transition={{ duration: 0.3 }}
                                    />
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">
                                    Processing... {Math.round(progress)}%
                                </p>
                            </motion.div>
                        )}
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Confirmation Modals */}
            <AnimatePresence>
                {showConfirmation && (
                    <ConfirmationModal
                        type={showConfirmation}
                        count={selectedCount}
                        onConfirm={() => {
                            if (showConfirmation === 'enable') handleEnableAll();
                            if (showConfirmation === 'disable') handleDisableAll();
                            if (showConfirmation === 'delete') handleDeleteAll();
                        }}
                        onCancel={() => setShowConfirmation(null)}
                    />
                )}
            </AnimatePresence>
        </>
    );
}

// ============================================
// Confirmation Modal
// ============================================

interface ConfirmationModalProps {
    type: 'enable' | 'disable' | 'delete';
    count: number;
    onConfirm: () => void;
    onCancel: () => void;
}

function ConfirmationModal({ type, count, onConfirm, onCancel }: ConfirmationModalProps) {
    const config = {
        enable: {
            title: 'Enable Identity Providers',
            message: `Are you sure you want to enable ${count} IdP(s)?`,
            confirmText: 'Enable',
            confirmClass: 'bg-green-600 hover:bg-green-700',
            icon: CheckIcon
        },
        disable: {
            title: 'Disable Identity Providers',
            message: `Are you sure you want to disable ${count} IdP(s)?`,
            confirmText: 'Disable',
            confirmClass: 'bg-gray-600 hover:bg-gray-700',
            icon: XMarkIcon
        },
        delete: {
            title: 'Delete Identity Providers',
            message: `Are you sure you want to delete ${count} IdP(s)? This action cannot be undone.`,
            confirmText: 'Delete',
            confirmClass: 'bg-red-600 hover:bg-red-700',
            icon: TrashIcon
        }
    };

    const conf = config[type];
    const Icon = conf.icon;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onCancel}
        >
            <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6"
            >
                {/* Icon */}
                <div className={`
                    mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4
                    ${type === 'delete' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-purple-100 dark:bg-purple-900/30'}
                `}>
                    {type === 'delete' ? (
                        <ExclamationTriangleIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
                    ) : (
                        <Icon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                    )}
                </div>

                {/* Content */}
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white text-center mb-2">
                    {conf.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
                    {conf.message}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors font-medium ${conf.confirmClass}`}
                    >
                        {conf.confirmText}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
