/**
 * IdP Session Viewer Component
 * 
 * Real-time session management with:
 * - Auto-refresh table (every 10 seconds)
 * - Search and filtering
 * - Sortable columns
 * - Row actions (revoke session, view details)
 * - Bulk actions (multi-select, revoke all)
 * - Empty state handling
 * 
 * Phase 2.6: Modern UI Components
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MagnifyingGlassIcon,
    XCircleIcon,
    CheckIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    TrashIcon
} from '@heroicons/react/24/outline';
import { useSessions, useRevokeSession } from '@/lib/api/idp-management';
import { format } from 'date-fns';

// ============================================
// Types
// ============================================

interface IdPSessionViewerProps {
    idpAlias: string;
}

type SortField = 'username' | 'ipAddress' | 'start' | 'lastAccess';
type SortDirection = 'asc' | 'desc';

// ============================================
// Component
// ============================================

export default function IdPSessionViewer({ idpAlias }: IdPSessionViewerProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState<SortField>('lastAccess');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());

    // Fetch sessions with auto-refresh
    const { data: sessions = [], isLoading, refetch } = useSessions(idpAlias);
    const revokeSessionMutation = useRevokeSession();

    // Filter sessions
    const filteredSessions = sessions.filter(session => 
        session.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.ipAddress?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Sort sessions
    const sortedSessions = [...filteredSessions].sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        
        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return sortDirection === 'asc' 
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal);
        }
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        return 0;
    });

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const handleRevokeSession = async (sessionId: string) => {
        if (confirm('Are you sure you want to revoke this session?')) {
            try {
                await revokeSessionMutation.mutateAsync({ alias: idpAlias, sessionId });
                refetch();
            } catch (error) {
                console.error('Failed to revoke session:', error);
                alert('Failed to revoke session. Please try again.');
            }
        }
    };

    const handleToggleSelect = (sessionId: string) => {
        const newSelected = new Set(selectedSessions);
        if (newSelected.has(sessionId)) {
            newSelected.delete(sessionId);
        } else {
            newSelected.add(sessionId);
        }
        setSelectedSessions(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedSessions.size === sortedSessions.length) {
            setSelectedSessions(new Set());
        } else {
            setSelectedSessions(new Set(sortedSessions.map(s => s.id)));
        }
    };

    const handleBulkRevoke = async () => {
        if (selectedSessions.size === 0) return;
        
        if (confirm(`Are you sure you want to revoke ${selectedSessions.size} session(s)?`)) {
            try {
                await Promise.all(
                    Array.from(selectedSessions).map(sessionId =>
                        revokeSessionMutation.mutateAsync({ alias: idpAlias, sessionId })
                    )
                );
                setSelectedSessions(new Set());
                refetch();
            } catch (error) {
                console.error('Failed to revoke sessions:', error);
                alert('Failed to revoke some sessions. Please try again.');
            }
        }
    };

    if (isLoading) {
        return <LoadingSkeleton />;
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                {/* Search */}
                <div className="relative flex-1 max-w-md">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by username or IP..."
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                </div>

                {/* Bulk Actions */}
                {selectedSessions.size > 0 && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-2"
                    >
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                            {selectedSessions.size} selected
                        </span>
                        <button
                            onClick={handleBulkRevoke}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2"
                        >
                            <TrashIcon className="h-4 w-4" />
                            Revoke Selected
                        </button>
                    </motion.div>
                )}

                {/* Total Count */}
                <div className="text-sm text-gray-600 dark:text-gray-400">
                    {sortedSessions.length} session(s)
                </div>
            </div>

            {/* Table */}
            {sortedSessions.length === 0 ? (
                <EmptyState searchQuery={searchQuery} />
            ) : (
                <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                            <tr>
                                {/* Select All */}
                                <th className="w-12 px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={selectedSessions.size === sortedSessions.length && sortedSessions.length > 0}
                                        onChange={handleSelectAll}
                                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                    />
                                </th>

                                {/* Username */}
                                <SortableHeader
                                    field="username"
                                    label="Username"
                                    currentField={sortField}
                                    direction={sortDirection}
                                    onSort={handleSort}
                                />

                                {/* IP Address */}
                                <SortableHeader
                                    field="ipAddress"
                                    label="IP Address"
                                    currentField={sortField}
                                    direction={sortDirection}
                                    onSort={handleSort}
                                />

                                {/* Login Time */}
                                <SortableHeader
                                    field="start"
                                    label="Login Time"
                                    currentField={sortField}
                                    direction={sortDirection}
                                    onSort={handleSort}
                                />

                                {/* Last Activity */}
                                <SortableHeader
                                    field="lastAccess"
                                    label="Last Activity"
                                    currentField={sortField}
                                    direction={sortDirection}
                                    onSort={handleSort}
                                />

                                {/* Actions */}
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            <AnimatePresence>
                                {sortedSessions.map((session) => (
                                    <motion.tr
                                        key={session.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                    >
                                        {/* Checkbox */}
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedSessions.has(session.id)}
                                                onChange={() => handleToggleSelect(session.id)}
                                                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                            />
                                        </td>

                                        {/* Username */}
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                            {session.username || 'N/A'}
                                        </td>

                                        {/* IP Address */}
                                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 font-mono">
                                            {session.ipAddress || 'N/A'}
                                        </td>

                                        {/* Login Time */}
                                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                            {session.start ? format(new Date(session.start), 'MMM d, h:mm a') : 'N/A'}
                                        </td>

                                        {/* Last Activity */}
                                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                            {session.lastAccess ? format(new Date(session.lastAccess), 'MMM d, h:mm a') : 'N/A'}
                                        </td>

                                        {/* Actions */}
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => handleRevokeSession(session.id)}
                                                className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                                            >
                                                <XCircleIcon className="h-5 w-5" />
                                            </button>
                                        </td>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ============================================
// Sortable Header Component
// ============================================

interface SortableHeaderProps {
    field: SortField;
    label: string;
    currentField: SortField;
    direction: SortDirection;
    onSort: (field: SortField) => void;
}

function SortableHeader({ field, label, currentField, direction, onSort }: SortableHeaderProps) {
    const isActive = currentField === field;

    return (
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <button
                onClick={() => onSort(field)}
                className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
                {label}
                {isActive && (
                    direction === 'asc' ? (
                        <ChevronUpIcon className="h-4 w-4" />
                    ) : (
                        <ChevronDownIcon className="h-4 w-4" />
                    )
                )}
            </button>
        </th>
    );
}

// ============================================
// Empty State Component
// ============================================

function EmptyState({ searchQuery }: { searchQuery: string }) {
    return (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <CheckIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                {searchQuery ? 'No sessions found' : 'No active sessions'}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {searchQuery 
                    ? `No sessions match "${searchQuery}"`
                    : 'There are currently no active sessions for this IdP.'}
            </p>
        </div>
    );
}

// ============================================
// Loading Skeleton Component
// ============================================

function LoadingSkeleton() {
    return (
        <div className="space-y-4 animate-pulse">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-64" />
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="h-12 bg-gray-100 dark:bg-gray-800" />
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-16 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900" />
                ))}
            </div>
        </div>
    );
}
