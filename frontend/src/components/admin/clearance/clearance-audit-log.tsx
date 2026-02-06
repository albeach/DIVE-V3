/**
 * Clearance Audit Log Component
 *
 * Displays audit trail of clearance mapping changes per country
 * Phase 2: Complete Admin Page Implementation
 * Date: 2026-02-05
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Clock, User, Edit, Trash2, Plus, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface AuditEntry {
    timestamp: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VALIDATE';
    country: string;
    performedBy: string;
    changes?: {
        field: string;
        oldValue: string | string[];
        newValue: string | string[];
    }[];
    reason?: string;
    status: 'SUCCESS' | 'FAILED';
}

interface Props {
    countries: string[];
}

export function ClearanceAuditLog({ countries }: Props) {
    const [selectedCountry, setSelectedCountry] = useState<string | 'ALL'>('ALL');
    const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch audit logs for selected country
    useEffect(() => {
        const fetchAuditLogs = async () => {
            if (selectedCountry === 'ALL') {
                // Fetch logs for all countries in parallel
                setLoading(true);
                setError(null);
                try {
                    const promises = countries.map(country =>
                        fetch(`/api/admin/clearance/audit/${country}`)
                            .then(res => res.ok ? res.json() : null)
                            .catch(() => null)
                    );
                    const results = await Promise.all(promises);
                    const allLogs = results
                        .filter(r => r && r.data)
                        .flatMap(r => r.data)
                        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                    setAuditLogs(allLogs);
                } catch (err) {
                    setError('Failed to fetch audit logs for all countries');
                    console.error('Audit log error:', err);
                } finally {
                    setLoading(false);
                }
            } else {
                // Fetch logs for specific country
                setLoading(true);
                setError(null);
                try {
                    const response = await fetch(`/api/admin/clearance/audit/${selectedCountry}`);
                    if (!response.ok) throw new Error('Failed to fetch audit logs');
                    const data = await response.json();
                    setAuditLogs(data.data || []);
                } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to fetch audit logs');
                    console.error('Audit log error:', err);
                } finally {
                    setLoading(false);
                }
            }
        };

        fetchAuditLogs();
    }, [selectedCountry, countries]);

    // Get action icon and color
    const getActionStyle = (action: AuditEntry['action']) => {
        switch (action) {
            case 'CREATE':
                return { icon: Plus, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' };
            case 'UPDATE':
                return { icon: Edit, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' };
            case 'DELETE':
                return { icon: Trash2, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' };
            case 'VALIDATE':
                return { icon: CheckCircle, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30' };
            default:
                return { icon: AlertCircle, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-900/30' };
        }
    };

    // Format timestamp
    const formatTimestamp = (timestamp: string) => {
        const date = new Date(timestamp);
        return {
            date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        };
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    <Clock className="w-6 h-6 text-indigo-500" />
                    Audit Log
                </h3>

                {/* Country Filter */}
                <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Filter by Country:
                    </label>
                    <select
                        value={selectedCountry}
                        onChange={(e) => setSelectedCountry(e.target.value)}
                        className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="ALL">All Countries</option>
                        {countries.map(country => (
                            <option key={country} value={country}>{country}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Loading State */}
            {loading && (
                <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <div className="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500 mb-3"></div>
                        <p className="text-gray-600 dark:text-gray-400">Loading audit logs...</p>
                    </div>
                </div>
            )}

            {/* Error State */}
            {error && !loading && (
                <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    <div className="flex-1">
                        <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
                        <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!loading && !error && auditLogs.length === 0 && (
                <div className="text-center py-12">
                    <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400 font-medium">No audit logs found</p>
                    <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                        {selectedCountry === 'ALL'
                            ? 'No clearance mapping changes have been recorded yet.'
                            : `No changes recorded for ${selectedCountry}.`}
                    </p>
                </div>
            )}

            {/* Audit Log Timeline */}
            {!loading && !error && auditLogs.length > 0 && (
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                    {auditLogs.map((entry, index) => {
                        const actionStyle = getActionStyle(entry.action);
                        const { date, time } = formatTimestamp(entry.timestamp);
                        const Icon = actionStyle.icon;

                        return (
                            <div
                                key={`${entry.country}-${entry.timestamp}-${index}`}
                                className="relative flex gap-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                            >
                                {/* Timeline Line */}
                                {index < auditLogs.length - 1 && (
                                    <div className="absolute left-[27px] top-[52px] w-0.5 h-full bg-gray-200 dark:bg-gray-700" />
                                )}

                                {/* Action Icon */}
                                <div className={`flex-shrink-0 w-12 h-12 rounded-full ${actionStyle.bg} flex items-center justify-center relative z-10`}>
                                    <Icon className={`w-6 h-6 ${actionStyle.color}`} />
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    {/* Header */}
                                    <div className="flex items-start justify-between gap-4 mb-2">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`font-bold ${actionStyle.color}`}>
                                                    {entry.action}
                                                </span>
                                                <span className="text-gray-400 dark:text-gray-500">•</span>
                                                <span className="font-medium text-gray-900 dark:text-white">
                                                    {entry.country}
                                                </span>
                                                {entry.status === 'FAILED' && (
                                                    <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs rounded-full font-medium">
                                                        FAILED
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                                <User className="w-4 h-4" />
                                                <span>{entry.performedBy}</span>
                                            </div>
                                        </div>
                                        <div className="text-right text-sm text-gray-500 dark:text-gray-500">
                                            <div className="font-medium">{date}</div>
                                            <div>{time}</div>
                                        </div>
                                    </div>

                                    {/* Changes Detail */}
                                    {entry.changes && entry.changes.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                            {entry.changes.map((change, changeIndex) => (
                                                <div
                                                    key={changeIndex}
                                                    className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-sm"
                                                >
                                                    <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        {change.field}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <div className="flex-1">
                                                            <div className="text-red-600 dark:text-red-400 mb-1">
                                                                - {Array.isArray(change.oldValue)
                                                                    ? change.oldValue.join(', ')
                                                                    : change.oldValue || 'null'}
                                                            </div>
                                                            <div className="text-green-600 dark:text-green-400">
                                                                + {Array.isArray(change.newValue)
                                                                    ? change.newValue.join(', ')
                                                                    : change.newValue || 'null'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Reason */}
                                    {entry.reason && (
                                        <div className="mt-3 text-sm text-gray-600 dark:text-gray-400 italic">
                                            "{entry.reason}"
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Summary Stats */}
            {!loading && !error && auditLogs.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                {auditLogs.length}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Total Events</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                                {auditLogs.filter(l => l.action === 'CREATE').length}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Created</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                {auditLogs.filter(l => l.action === 'UPDATE').length}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Updated</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                                {auditLogs.filter(l => l.action === 'DELETE').length}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Deleted</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
