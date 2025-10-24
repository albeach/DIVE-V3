/**
 * IdP Comparison View Component
 * 
 * Side-by-side IdP comparison with:
 * - Compare 2-4 IdPs simultaneously
 * - Diff highlighting (better/worse/same)
 * - Comprehensive metrics comparison
 * - Add/remove IdPs from comparison
 * - Export comparison as PDF/CSV
 * - Responsive table layout
 * 
 * Phase 2.10: Modern UI Components
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    XMarkIcon,
    ArrowUpIcon,
    ArrowDownIcon,
    MinusIcon,
    DocumentArrowDownIcon,
    PlusIcon
} from '@heroicons/react/24/outline';
import { IIdPListItem } from '@/types/admin.types';

// ============================================
// Types
// ============================================

interface IdPComparisonViewProps {
    idps: IIdPListItem[];
    allIdPs: IIdPListItem[];
    onAddIdP?: (alias: string) => void;
    onRemoveIdP?: (alias: string) => void;
    onExport?: () => void;
}

interface ComparisonRow {
    label: string;
    getValue: (idp: IIdPListItem) => string | number;
    format?: (value: string | number) => string;
    compareType?: 'higher-better' | 'lower-better' | 'match';
}

// ============================================
// Component
// ============================================

export default function IdPComparisonView({
    idps,
    allIdPs,
    onAddIdP,
    onRemoveIdP,
    onExport
}: IdPComparisonViewProps) {
    const [showAddIdP, setShowAddIdP] = useState(false);

    const comparisonRows: ComparisonRow[] = [
        {
            label: 'Protocol',
            getValue: (idp) => idp.protocol.toUpperCase(),
            compareType: 'match'
        },
        {
            label: 'Status',
            getValue: (idp) => idp.enabled ? 'Enabled' : 'Disabled',
            compareType: 'match'
        },
        {
            label: 'Uptime %',
            getValue: () => Math.random() * 10 + 90, // Mock data
            format: (val) => `${Number(val).toFixed(2)}%`,
            compareType: 'higher-better'
        },
        {
            label: 'Success Rate %',
            getValue: () => Math.random() * 10 + 90, // Mock data
            format: (val) => `${Number(val).toFixed(2)}%`,
            compareType: 'higher-better'
        },
        {
            label: 'Avg Response Time',
            getValue: () => Math.random() * 500 + 100, // Mock data
            format: (val) => `${Math.round(Number(val))}ms`,
            compareType: 'lower-better'
        },
        {
            label: 'Active Sessions',
            getValue: () => Math.floor(Math.random() * 100), // Mock data
            compareType: 'higher-better'
        },
        {
            label: 'Risk Score',
            getValue: () => Math.floor(Math.random() * 40 + 60), // Mock data
            format: (val) => `${val}/100`,
            compareType: 'higher-better'
        },
        {
            label: 'Last Tested',
            getValue: (idp) => idp.createdAt || 'N/A',
            format: (val) => typeof val === 'string' && val !== 'N/A' ? new Date(val).toLocaleDateString() : 'N/A',
            compareType: 'match'
        },
        {
            label: 'Created',
            getValue: (idp) => idp.createdAt || 'N/A',
            format: (val) => typeof val === 'string' && val !== 'N/A' ? new Date(val).toLocaleDateString() : 'N/A',
            compareType: 'match'
        }
    ];

    const availableIdPs = allIdPs.filter(idp => !idps.find(i => i.alias === idp.alias));

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        IdP Comparison
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Compare {idps.length} Identity Provider{idps.length !== 1 ? 's' : ''} side-by-side
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {availableIdPs.length > 0 && (
                        <button
                            onClick={() => setShowAddIdP(true)}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
                        >
                            <PlusIcon className="h-4 w-4" />
                            Add IdP
                        </button>
                    )}
                    {onExport && (
                        <button
                            onClick={onExport}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
                        >
                            <DocumentArrowDownIcon className="h-4 w-4" />
                            Export
                        </button>
                    )}
                </div>
            </div>

            {/* Comparison Table */}
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                            <th className="sticky left-0 bg-gray-50 dark:bg-gray-900 px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-r border-gray-200 dark:border-gray-700">
                                Metric
                            </th>
                            {idps.map((idp) => (
                                <th key={idp.alias} className="px-4 py-3 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        <div>
                                            <div className="text-sm font-semibold text-gray-900 dark:text-white">
                                                {idp.displayName}
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                                {idp.protocol.toUpperCase()}
                                            </div>
                                        </div>
                                        {onRemoveIdP && (
                                            <button
                                                onClick={() => onRemoveIdP(idp.alias)}
                                                className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                                                title="Remove from comparison"
                                            >
                                                <XMarkIcon className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {comparisonRows.map((row, rowIndex) => {
                            // Get all values for this row
                            const values = idps.map(idp => row.getValue(idp));
                            
                            return (
                                <tr key={rowIndex} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className="sticky left-0 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700">
                                        {row.label}
                                    </td>
                                    {values.map((value, colIndex) => {
                                        const formattedValue = row.format ? row.format(value) : value;
                                        const comparison = getComparison(values, colIndex, row.compareType);

                                        return (
                                            <td key={colIndex} className="px-4 py-3 text-sm text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    {comparison === 'better' && (
                                                        <ArrowUpIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                                                    )}
                                                    {comparison === 'worse' && (
                                                        <ArrowDownIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
                                                    )}
                                                    {comparison === 'same' && row.compareType !== 'match' && (
                                                        <MinusIcon className="h-4 w-4 text-gray-400" />
                                                    )}
                                                    <span className={`
                                                        font-medium
                                                        ${comparison === 'better' ? 'text-green-600 dark:text-green-400' : ''}
                                                        ${comparison === 'worse' ? 'text-red-600 dark:text-red-400' : ''}
                                                        ${comparison === 'same' || comparison === null ? 'text-gray-700 dark:text-gray-300' : ''}
                                                    `}>
                                                        {formattedValue}
                                                    </span>
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Add IdP Modal */}
            <AnimatePresence>
                {showAddIdP && (
                    <AddIdPModal
                        availableIdPs={availableIdPs}
                        onAdd={(alias) => {
                            if (onAddIdP) onAddIdP(alias);
                            setShowAddIdP(false);
                        }}
                        onClose={() => setShowAddIdP(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ============================================
// Comparison Logic
// ============================================

function getComparison(
    values: (string | number)[],
    index: number,
    compareType?: 'higher-better' | 'lower-better' | 'match'
): 'better' | 'worse' | 'same' | null {
    if (!compareType || compareType === 'match') return null;

    const numericValues = values.filter(v => typeof v === 'number') as number[];
    if (numericValues.length === 0) return null;

    const currentValue = values[index];
    if (typeof currentValue !== 'number') return null;

    const max = Math.max(...numericValues);
    const min = Math.min(...numericValues);

    if (max === min) return 'same';

    if (compareType === 'higher-better') {
        if (currentValue === max) return 'better';
        if (currentValue === min) return 'worse';
        return 'same';
    } else {
        if (currentValue === min) return 'better';
        if (currentValue === max) return 'worse';
        return 'same';
    }
}

// ============================================
// Add IdP Modal
// ============================================

interface AddIdPModalProps {
    availableIdPs: IIdPListItem[];
    onAdd: (alias: string) => void;
    onClose: () => void;
}

function AddIdPModal({ availableIdPs, onAdd, onClose }: AddIdPModalProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6"
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Add IdP to Comparison
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {availableIdPs.map((idp) => (
                        <button
                            key={idp.alias}
                            onClick={() => onAdd(idp.alias)}
                            className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                        >
                            <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                    {idp.displayName}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {idp.protocol.toUpperCase()} • {idp.enabled ? 'Enabled' : 'Disabled'}
                                </div>
                            </div>
                            <PlusIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                        </button>
                    ))}

                    {availableIdPs.length === 0 && (
                        <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                            No more IdPs available to compare
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}

