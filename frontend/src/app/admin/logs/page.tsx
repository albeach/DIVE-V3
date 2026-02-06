/**
 * Admin Audit Logs - Complete Revamp (2025)
 *
 * A comprehensive, state-of-the-art audit log analysis platform with:
 * - Real-time log streaming and filtering
 * - Interactive data visualizations and heatmaps
 * - Deep drill-down capabilities
 * - Advanced analytics and insights
 * - Pattern recognition and anomaly detection
 * - Export capabilities (JSON, CSV)
 * - Modern glass-morphic UI design
 */

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import { VirtualList } from '@/components/ui/virtual-list';
import { AnimatedCounter, AnimatedPercentage } from '@/components/ui/animated-counter';
import { createAISearch, AISearchWrapper } from '@/lib/ai-search-wrapper';
import { AdminPageTransition, AnimatedButton, PresenceIndicator } from '@/components/admin/shared';

// Types
interface IRetentionConfig {
    auditLogs: number;
    securityLogs: number;
    accessLogs: number;
    systemLogs: number;
    maxStorageGB: number;
    currentUsageGB: number;
    autoArchiveEnabled: boolean;
    archiveDestination: string;
    lastUpdated: string;
    updatedBy: string;
}

interface IExportResult {
    id: string;
    format: string;
    status: string;
    totalRecords: number;
    fileSize: string;
    downloadUrl: string;
    createdAt: string;
    expiresAt: string;
}

interface IAuditLogEntry {
    timestamp: string;
    eventType: string;
    requestId: string;
    subject: string;
    action: string;
    resourceId: string;
    outcome: 'ALLOW' | 'DENY';
    reason: string;
    subjectAttributes?: Record<string, any>;
    resourceAttributes?: Record<string, any>;
    policyEvaluation?: Record<string, any>;
    context?: Record<string, any>;
    latencyMs?: number;
}

interface IAuditLogStats {
    totalEvents: number;
    eventsByType: Record<string, number>;
    deniedAccess: number;
    successfulAccess: number;
    topDeniedResources: Array<{ resourceId: string; count: number }>;
    topUsers: Array<{ subject: string; count: number }>;
    violationTrend: Array<{ date: string; count: number }>;
}

interface IFilters {
    eventType: string;
    subject: string;
    resourceId: string;
    outcome: '' | 'ALLOW' | 'DENY';
    startTime: string;
    endTime: string;
    searchTerm: string;
}

type ViewMode = 'table' | 'timeline' | 'analytics' | 'retention';

export default function AdminAuditLogsPage() {
    const router = useRouter();
    const { data: session, status } = useSession();

    // State
    const [logs, setLogs] = useState<IAuditLogEntry[]>([]);
    const [stats, setStats] = useState<IAuditLogStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [limit] = useState(50);
    const [viewMode, setViewMode] = useState<ViewMode>('table');
    const [selectedLog, setSelectedLog] = useState<IAuditLogEntry | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [refreshInterval, setRefreshInterval] = useState(5000);
    const [statsDays, setStatsDays] = useState(7);

    // Retention config
    const [retention, setRetention] = useState<IRetentionConfig | null>(null);
    const [retentionLoading, setRetentionLoading] = useState(false);
    const [retentionSaving, setRetentionSaving] = useState(false);
    const [retentionForm, setRetentionForm] = useState<Partial<IRetentionConfig>>({});

    // Export modal
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'pdf'>('csv');
    const [exportDateRange, setExportDateRange] = useState({ start: '', end: '' });
    const [exportLoading, setExportLoading] = useState(false);
    const [lastExportResult, setLastExportResult] = useState<IExportResult | null>(null);

    // Filters
    const [filters, setFilters] = useState<IFilters>({
        eventType: '',
        subject: '',
        resourceId: '',
        outcome: '',
        startTime: '',
        endTime: '',
        searchTerm: ''
    });

    // AI Search state
    const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [didYouMean, setDidYouMean] = useState<string[]>([]);

    // Initialize AI search wrapper
    const aiSearcher = useMemo(() => {
        return createAISearch<IAuditLogEntry>(
            logs,
            {
                keys: ['eventType', 'subject', 'resourceId', 'reason', 'requestId', 'action', 'outcome'],
                threshold: 0.3, // 30% typo tolerance
                ignoreLocation: true,
            },
            'dive-v3-search-logs'
        );
    }, [logs]);

    // Update AI searcher when logs change
    useEffect(() => {
        if (logs.length > 0) {
            aiSearcher.updateData(logs);
        }
    }, [logs, aiSearcher]);

    // Filter logs with AI fuzzy search
    const filteredLogs = useMemo(() => {
        if (!filters.searchTerm) return logs;

        // Use AI fuzzy search
        const results = aiSearcher.search(filters.searchTerm);
        
        // If no results, show "Did you mean?" suggestions
        if (results.length === 0) {
            const suggestions = aiSearcher.getDidYouMeanSuggestions(filters.searchTerm, 3);
            setDidYouMean(suggestions);
        } else {
            setDidYouMean([]);
        }
        
        return results;
    }, [logs, filters.searchTerm, aiSearcher]);

    // Update search suggestions as user types
    const handleSearchChange = useCallback((value: string) => {
        setFilters(prev => ({ ...prev, searchTerm: value }));
        
        if (value.length > 0) {
            const suggestions = aiSearcher.getSuggestions(value, 5);
            setSearchSuggestions(suggestions);
            setShowSuggestions(suggestions.length > 0);
        } else {
            setSearchSuggestions([]);
            setShowSuggestions(false);
            setDidYouMean([]);
        }
    }, [aiSearcher]);

    // Apply suggestion
    const applySuggestion = useCallback((suggestion: string) => {
        setFilters(prev => ({ ...prev, searchTerm: suggestion }));
        setShowSuggestions(false);
        setDidYouMean([]);
    }, []);

    // Fetch logs
    const fetchLogs = useCallback(async () => {
        if (status !== 'authenticated') return;

        try {
            setLoading(true);
            setError(null);

            const params = new URLSearchParams({
                limit: limit.toString(),
                offset: ((page - 1) * limit).toString()
            });

            if (filters.eventType) params.append('eventType', filters.eventType);
            if (filters.subject) params.append('subject', filters.subject);
            if (filters.resourceId) params.append('resourceId', filters.resourceId);
            if (filters.outcome) params.append('outcome', filters.outcome);
            if (filters.startTime) params.append('startTime', filters.startTime);
            if (filters.endTime) params.append('endTime', filters.endTime);

            // Use server-side proxy route (secure - no client-side token exposure)
            const response = await fetch(`/api/admin/logs?${params.toString()}`, {
                cache: 'no-store',
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch logs: ${response.statusText}`);
            }

            const data = await response.json();
            setLogs(data.data.logs || []);
            setTotal(data.data.total || 0);
        } catch (err) {
            console.error('Error fetching logs:', err);
            setError(err instanceof Error ? err.message : 'Failed to load logs');
        } finally {
            setLoading(false);
        }
    }, [status, session, page, limit, filters]);

    // Fetch statistics
    const fetchStats = useCallback(async () => {
        if (status !== 'authenticated') return;

        try {
            // Use server-side proxy route (secure - no client-side token exposure)
            const response = await fetch(`/api/admin/logs/stats?days=${statsDays}`, {
                cache: 'no-store',
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch stats: ${response.statusText}`);
            }

            const data = await response.json();
            setStats(data.data);
        } catch (err) {
            console.error('Error fetching stats:', err);
        }
    }, [status, session, statsDays]);

    // Export logs
    const handleExport = async (format: 'json' | 'csv') => {
        if (status !== 'authenticated') return;

        try {
            const params = new URLSearchParams();
            if (filters.eventType) params.append('eventType', filters.eventType);
            if (filters.subject) params.append('subject', filters.subject);
            if (filters.resourceId) params.append('resourceId', filters.resourceId);
            if (filters.outcome) params.append('outcome', filters.outcome);
            if (filters.startTime) params.append('startTime', filters.startTime);
            if (filters.endTime) params.append('endTime', filters.endTime);

            // Use server-side proxy route (secure - no client-side token exposure)
            const response = await fetch(`/api/admin/logs/export?${params.toString()}`);

            if (!response.ok) {
                throw new Error('Export failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit-logs-${new Date().toISOString()}.${format}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            console.error('Export error:', err);
            alert('Failed to export logs');
        }
    };

    // Fetch retention config
    const fetchRetention = useCallback(async () => {
        if (status !== 'authenticated') return;
        try {
            setRetentionLoading(true);
            const response = await fetch('/api/admin/logs/retention', { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                const config = data.retention || data;
                setRetention(config);
                setRetentionForm(config);
            }
        } catch (err) {
            console.error('Error fetching retention config:', err);
        } finally {
            setRetentionLoading(false);
        }
    }, [status]);

    // Save retention config
    const saveRetention = async () => {
        if (status !== 'authenticated') return;
        try {
            setRetentionSaving(true);
            const response = await fetch('/api/admin/logs/retention', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(retentionForm),
            });
            if (response.ok) {
                const data = await response.json();
                setRetention(data.retention || data);
                setRetentionForm(data.retention || data);
            }
        } catch (err) {
            console.error('Error saving retention config:', err);
        } finally {
            setRetentionSaving(false);
        }
    };

    // Enhanced export via API
    const handleEnhancedExport = async () => {
        if (status !== 'authenticated') return;
        if (!exportDateRange.start || !exportDateRange.end) return;

        try {
            setExportLoading(true);
            const response = await fetch('/api/admin/logs/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    format: exportFormat,
                    dateRange: {
                        start: new Date(exportDateRange.start).toISOString(),
                        end: new Date(exportDateRange.end).toISOString(),
                    },
                    filters: {
                        eventType: filters.eventType || undefined,
                        subject: filters.subject || undefined,
                        resourceId: filters.resourceId || undefined,
                        outcome: filters.outcome || undefined,
                    },
                }),
            });
            if (response.ok) {
                const data = await response.json();
                setLastExportResult(data.export);
            }
        } catch (err) {
            console.error('Export error:', err);
        } finally {
            setExportLoading(false);
        }
    };

    // Initial load
    useEffect(() => {
        fetchLogs();
        fetchStats();
        fetchRetention();
    }, [fetchLogs, fetchStats, fetchRetention]);

    // Auto-refresh
    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            fetchLogs();
            fetchStats();
        }, refreshInterval);

        return () => clearInterval(interval);
    }, [autoRefresh, refreshInterval, fetchLogs, fetchStats]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setPage(1);
    }, [filters]);

    // Helper: Format timestamp
    const formatTimestamp = (timestamp: string) => {
        return new Date(timestamp).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    // Helper: Get outcome badge color
    const getOutcomeBadge = (outcome: 'ALLOW' | 'DENY') => {
        if (outcome === 'ALLOW') {
            return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
        }
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    };

    // Helper: Get event type color
    const getEventTypeColor = (eventType: string) => {
        const colors: Record<string, string> = {
            'ACCESS_GRANTED': 'text-green-600 dark:text-green-400',
            'ACCESS_DENIED': 'text-red-600 dark:text-red-400',
            'ENCRYPT': 'text-blue-600 dark:text-blue-400',
            'DECRYPT': 'text-purple-600 dark:text-purple-400',
            'KEY_RELEASE': 'text-yellow-600 dark:text-yellow-400',
            'POLICY_EVALUATION': 'text-cyan-600 dark:text-cyan-400'
        };
        return colors[eventType] || 'text-gray-600 dark:text-gray-400';
    };

    if (status === 'loading') {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading...</p>
                </div>
            </div>
        );
    }

    if (status === 'unauthenticated') {
        router.push('/auth/signin');
        return null;
    }

    const totalPages = Math.ceil(total / limit);

    return (
        <PageLayout user={session?.user || {}}>
            <AdminPageTransition pageKey="/admin/logs">
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-blue-900/20 dark:to-indigo-900/20">
                {/* Header */}
                <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
                    <div className="max-w-[1800px] mx-auto px-8 py-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                                    📋 Audit Logs
                                </h1>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                    Comprehensive security and compliance audit trail
                                </p>
                            </div>

                            <div className="flex items-center space-x-4">
                                {/* Presence Indicator */}
                                <PresenceIndicator page="logs" />
                                
                                {/* Auto-refresh toggle */}
                                <AnimatedButton
                                    onClick={() => setAutoRefresh(!autoRefresh)}
                                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                        autoRefresh
                                            ? 'bg-green-500 text-white shadow-lg'
                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                    }`}
                                >
                                    {autoRefresh ? '🔄 Auto-Refresh ON' : '⏸️ Auto-Refresh OFF'}
                                </AnimatedButton>

                                {/* Back to dashboard */}
                                <AnimatedButton
                                    onClick={() => router.push('/admin/dashboard')}
                                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                                >
                                    ← Dashboard
                                </AnimatedButton>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="max-w-[1800px] mx-auto px-8 py-8 space-y-6">
                    {/* Statistics Cards */}
                    {stats && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {/* Total Events */}
                            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Total Events</p>
                                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                                            <AnimatedCounter value={stats.totalEvents} />
                                        </p>
                                    </div>
                                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg">
                                        📊
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                                    Last {statsDays} days
                                </p>
                            </div>

                            {/* Success Rate */}
                            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Success Rate</p>
                                        <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
                                            <AnimatedPercentage
                                                value={stats.totalEvents > 0
                                                    ? (stats.successfulAccess / stats.totalEvents) * 100
                                                    : 0}
                                            />
                                        </p>
                                    </div>
                                    <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg">
                                        ✅
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                                    {stats.successfulAccess.toLocaleString()} allowed
                                </p>
                            </div>

                            {/* Denied Access */}
                            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Denied Access</p>
                                        <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">
                                            <AnimatedCounter value={stats.deniedAccess} />
                                        </p>
                                    </div>
                                    <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-pink-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg">
                                        🚫
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                                    Security violations
                                </p>
                            </div>

                            {/* Unique Users */}
                            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Active Users</p>
                                        <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-2">
                                            {stats.topUsers.length}
                                        </p>
                                    </div>
                                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg">
                                        👥
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                                    Tracked in period
                                </p>
                            </div>
                        </div>
                    )}

                    {/* View Mode Selector & Actions */}
                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl">
                        <div className="flex items-center justify-between flex-wrap gap-4">
                            {/* View Mode Tabs */}
                            <div className="flex space-x-2 bg-gray-100 dark:bg-gray-900 p-1 rounded-xl">
                                <AnimatedButton
                                    onClick={() => setViewMode('table')}
                                    className={`px-6 py-2 rounded-lg font-medium transition-all ${
                                        viewMode === 'table'
                                            ? 'bg-white dark:bg-gray-700 shadow-md text-blue-600 dark:text-blue-400'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                    }`}
                                >
                                    📋 Table View
                                </AnimatedButton>
                                <AnimatedButton
                                    onClick={() => setViewMode('timeline')}
                                    className={`px-6 py-2 rounded-lg font-medium transition-all ${
                                        viewMode === 'timeline'
                                            ? 'bg-white dark:bg-gray-700 shadow-md text-blue-600 dark:text-blue-400'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                    }`}
                                >
                                    ⏱️ Timeline View
                                </AnimatedButton>
                                <AnimatedButton
                                    onClick={() => setViewMode('analytics')}
                                    className={`px-6 py-2 rounded-lg font-medium transition-all ${
                                        viewMode === 'analytics'
                                            ? 'bg-white dark:bg-gray-700 shadow-md text-blue-600 dark:text-blue-400'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                    }`}
                                >
                                    📈 Analytics View
                                </AnimatedButton>
                                <AnimatedButton
                                    onClick={() => setViewMode('retention')}
                                    className={`px-6 py-2 rounded-lg font-medium transition-all ${
                                        viewMode === 'retention'
                                            ? 'bg-white dark:bg-gray-700 shadow-md text-blue-600 dark:text-blue-400'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                    }`}
                                >
                                    ⚙️ Retention
                                </AnimatedButton>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex space-x-3">
                                <AnimatedButton
                                    onClick={() => setShowExportModal(true)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-lg"
                                >
                                    📥 Export Logs
                                </AnimatedButton>
                                <AnimatedButton
                                    onClick={() => {
                                        fetchLogs();
                                        fetchStats();
                                    }}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium shadow-lg"
                                >
                                    🔄 Refresh
                                </AnimatedButton>
                            </div>
                        </div>
                    </div>

                    {/* Continue in next part... */}
                    {viewMode === 'table' && (
                        <>
                            {/* Filters Section */}
                            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">🔍 Advanced Filters</h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {/* Search */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Search (AI-powered fuzzy matching)
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={filters.searchTerm}
                                                onChange={(e) => handleSearchChange(e.target.value)}
                                                onFocus={() => {
                                                    if (searchSuggestions.length > 0) {
                                                        setShowSuggestions(true);
                                                    }
                                                }}
                                                onBlur={() => {
                                                    // Delay to allow click on suggestion
                                                    setTimeout(() => setShowSuggestions(false), 200);
                                                }}
                                                placeholder="Search logs (typo-tolerant)... Try 'denyed', 'frence', 'secrat'"
                                                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                            />
                                            
                                            {/* Search suggestions dropdown */}
                                            {showSuggestions && searchSuggestions.length > 0 && (
                                                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 max-h-60 overflow-y-auto">
                                                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                                        Recent Searches
                                                    </div>
                                                    {searchSuggestions.map((suggestion, idx) => (
                                                        <AnimatedButton
                                                            key={idx}
                                                            onClick={() => applySuggestion(suggestion)}
                                                            className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
                                                        >
                                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                            <span className="text-sm text-gray-700 dark:text-gray-300">{suggestion}</span>
                                                        </AnimatedButton>
                                                    ))}
                                                </div>
                                            )}
                                            
                                            {/* "Did you mean?" suggestions */}
                                            {didYouMean.length > 0 && (
                                                <div className="mt-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                                                    <p className="text-sm text-amber-800 dark:text-amber-300 mb-2">
                                                        <span className="font-semibold">No results found.</span> Did you mean:
                                                    </p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {didYouMean.map((suggestion, idx) => (
                                                            <AnimatedButton
                                                                key={idx}
                                                                onClick={() => applySuggestion(suggestion)}
                                                                className="px-3 py-1 bg-amber-100 dark:bg-amber-800/30 text-amber-800 dark:text-amber-200 rounded-md hover:bg-amber-200 dark:hover:bg-amber-700/40 transition-colors text-sm font-medium"
                                                            >
                                                                {suggestion}
                                                            </AnimatedButton>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Event Type */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Event Type
                                        </label>
                                        <select
                                            value={filters.eventType}
                                            onChange={(e) => setFilters({ ...filters, eventType: e.target.value })}
                                            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="">All Events</option>
                                            <option value="ACCESS_GRANTED">ACCESS_GRANTED</option>
                                            <option value="ACCESS_DENIED">ACCESS_DENIED</option>
                                            <option value="ENCRYPT">ENCRYPT</option>
                                            <option value="DECRYPT">DECRYPT</option>
                                            <option value="KEY_RELEASE">KEY_RELEASE</option>
                                            <option value="POLICY_EVALUATION">POLICY_EVALUATION</option>
                                        </select>
                                    </div>

                                    {/* Outcome */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Outcome
                                        </label>
                                        <select
                                            value={filters.outcome}
                                            onChange={(e) => setFilters({ ...filters, outcome: e.target.value as '' | 'ALLOW' | 'DENY' })}
                                            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="">All Outcomes</option>
                                            <option value="ALLOW">ALLOW</option>
                                            <option value="DENY">DENY</option>
                                        </select>
                                    </div>

                                    {/* Subject */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Subject (User)
                                        </label>
                                        <input
                                            type="text"
                                            value={filters.subject}
                                            onChange={(e) => setFilters({ ...filters, subject: e.target.value })}
                                            placeholder="user@example.com"
                                            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    {/* Resource ID */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Resource ID
                                        </label>
                                        <input
                                            type="text"
                                            value={filters.resourceId}
                                            onChange={(e) => setFilters({ ...filters, resourceId: e.target.value })}
                                            placeholder="doc-123"
                                            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    {/* Start Time */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Start Time
                                        </label>
                                        <input
                                            type="datetime-local"
                                            value={filters.startTime}
                                            onChange={(e) => setFilters({ ...filters, startTime: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                                            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    {/* End Time */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            End Time
                                        </label>
                                        <input
                                            type="datetime-local"
                                            value={filters.endTime}
                                            onChange={(e) => setFilters({ ...filters, endTime: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                                            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    {/* Stats Days */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Stats Period (days)
                                        </label>
                                        <select
                                            value={statsDays}
                                            onChange={(e) => setStatsDays(parseInt(e.target.value))}
                                            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="1">Last 24 Hours</option>
                                            <option value="7">Last 7 Days</option>
                                            <option value="30">Last 30 Days</option>
                                            <option value="90">Last 90 Days</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Clear Filters Button */}
                                <div className="mt-4 flex justify-end">
                                    <AnimatedButton
                                        onClick={() => {
                                            setFilters({
                                                eventType: '',
                                                subject: '',
                                                resourceId: '',
                                                outcome: '',
                                                startTime: '',
                                                endTime: '',
                                                searchTerm: ''
                                            });
                                        }}
                                        className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                                    >
                                        🗑️ Clear Filters
                                    </AnimatedButton>
                                </div>
                            </div>

                            {/* Logs Table */}
                            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden">
                                {loading ? (
                                    <div className="flex items-center justify-center py-20">
                                        <div className="text-center">
                                            <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                                            <p className="text-gray-600 dark:text-gray-400">Loading logs...</p>
                                        </div>
                                    </div>
                                ) : error ? (
                                    <div className="flex items-center justify-center py-20">
                                        <div className="text-center">
                                            <div className="text-6xl mb-4">⚠️</div>
                                            <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
                                        </div>
                                    </div>
                                ) : filteredLogs.length === 0 ? (
                                    <div className="flex items-center justify-center py-20">
                                        <div className="text-center">
                                            <div className="text-6xl mb-4">📭</div>
                                            <p className="text-gray-600 dark:text-gray-400 font-medium">No logs found</p>
                                            <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Try adjusting your filters</p>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Table Header */}
                                        <div className="overflow-x-auto">
                                            <table className="w-full">
                                                <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                                                    <tr>
                                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                                            Timestamp
                                                        </th>
                                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                                            Event Type
                                                        </th>
                                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                                            Subject
                                                        </th>
                                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                                            Resource
                                                        </th>
                                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                                            Outcome
                                                        </th>
                                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                                            Latency
                                                        </th>
                                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                                            Actions
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                    {filteredLogs.map((log, index) => (
                                                        <tr
                                                            key={log.requestId || index}
                                                            className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors cursor-pointer"
                                                            onClick={() => setSelectedLog(log)}
                                                        >
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                                                                {formatTimestamp(log.timestamp)}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <span className={`text-sm font-medium ${getEventTypeColor(log.eventType)}`}>
                                                                    {log.eventType}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                                                                {log.subject}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 font-mono">
                                                                {log.resourceId}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${getOutcomeBadge(log.outcome)}`}>
                                                                    {log.outcome}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                                                                {log.latencyMs ? `${log.latencyMs}ms` : 'N/A'}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                                <AnimatedButton
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedLog(log);
                                                                    }}
                                                                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                                                                >
                                                                    View Details →
                                                                </AnimatedButton>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Pagination */}
                                        <div className="bg-gray-50 dark:bg-gray-900/50 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                                            <div className="flex items-center justify-between">
                                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                                    Showing <span className="font-medium">{((page - 1) * limit) + 1}</span> to{' '}
                                                    <span className="font-medium">{Math.min(page * limit, total)}</span> of{' '}
                                                    <span className="font-medium">{total}</span> results
                                                    {filters.searchTerm && ` (filtered to ${filteredLogs.length})`}
                                                </div>

                                                <div className="flex space-x-2">
                                                    <AnimatedButton
                                                        onClick={() => setPage(Math.max(1, page - 1))}
                                                        disabled={page === 1}
                                                        className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                                                    >
                                                        ← Previous
                                                    </AnimatedButton>
                                                    <span className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium">
                                                        Page {page} of {totalPages}
                                                    </span>
                                                    <AnimatedButton
                                                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                                                        disabled={page === totalPages}
                                                        className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                                                    >
                                                        Next →
                                                    </AnimatedButton>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    )}

                    {viewMode === 'timeline' && (
                        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">⏱️ Timeline View</h3>

                            <VirtualList<IAuditLogEntry>
                                items={filteredLogs}
                                estimateSize={100}
                                overscan={5}
                                className="max-h-[600px]"
                                getItemKey={(index) => filteredLogs[index].requestId || `log-${index}`}
                                emptyMessage="No events to display"
                                renderItem={(log) => (
                                    <div
                                        className="flex items-start space-x-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-900/30 rounded-xl transition-colors cursor-pointer"
                                        onClick={() => setSelectedLog(log)}
                                    >
                                        {/* Timeline dot */}
                                        <div className="flex-shrink-0 mt-1">
                                            <div className={`w-3 h-3 rounded-full ${
                                                log.outcome === 'ALLOW' ? 'bg-green-500' : 'bg-red-500'
                                            }`}></div>
                                        </div>

                                        {/* Timeline content */}
                                        <div className="flex-grow">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center space-x-3">
                                                    <span className={`text-sm font-bold ${getEventTypeColor(log.eventType)}`}>
                                                        {log.eventType}
                                                    </span>
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${getOutcomeBadge(log.outcome)}`}>
                                                        {log.outcome}
                                                    </span>
                                                </div>
                                                <span className="text-sm text-gray-500 dark:text-gray-500">
                                                    {formatTimestamp(log.timestamp)}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-900 dark:text-gray-100 mb-1">
                                                <span className="font-medium">{log.subject}</span> → {log.resourceId}
                                            </p>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                {log.reason}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            />
                        </div>
                    )}

                    {viewMode === 'analytics' && stats && (
                        <div className="space-y-6">
                            {/* Event Types Distribution */}
                            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">📊 Event Types Distribution</h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {Object.entries(stats.eventsByType).map(([type, count]) => (
                                        <div key={type} className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-4">
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{type}</p>
                                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{count.toLocaleString()}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                {((count / stats.totalEvents) * 100).toFixed(1)}% of total
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Top Denied Resources */}
                            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">🚫 Top Denied Resources</h3>
                                <div className="space-y-3">
                                    {stats.topDeniedResources.slice(0, 10).map((item, index) => (
                                        <div key={item.resourceId} className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 rounded-xl">
                                            <div className="flex items-center space-x-3">
                                                <span className="w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                                                    {index + 1}
                                                </span>
                                                <span className="font-mono text-sm text-gray-900 dark:text-white">
                                                    {item.resourceId}
                                                </span>
                                            </div>
                                            <span className="text-red-600 dark:text-red-400 font-bold">
                                                {item.count} denials
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Top Users */}
                            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">👥 Most Active Users</h3>
                                <div className="space-y-3">
                                    {stats.topUsers.slice(0, 10).map((item, index) => (
                                        <div key={item.subject} className="flex items-center justify-between p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                                            <div className="flex items-center space-x-3">
                                                <span className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                                                    {index + 1}
                                                </span>
                                                <span className="text-sm text-gray-900 dark:text-white">
                                                    {item.subject}
                                                </span>
                                            </div>
                                            <span className="text-purple-600 dark:text-purple-400 font-bold">
                                                {item.count} events
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Violation Trend */}
                            {stats.violationTrend.length > 0 && (
                                <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">📉 Violation Trend</h3>
                                    <div className="space-y-2">
                                        {stats.violationTrend.map((item) => (
                                            <div key={item.date} className="flex items-center space-x-4">
                                                <span className="text-sm text-gray-600 dark:text-gray-400 w-32">
                                                    {new Date(item.date).toLocaleDateString()}
                                                </span>
                                                <div className="flex-grow bg-gray-200 dark:bg-gray-700 rounded-full h-6 overflow-hidden">
                                                    <div
                                                        className="bg-gradient-to-r from-red-500 to-pink-500 h-full flex items-center justify-end pr-2"
                                                        style={{
                                                            width: `${(item.count / Math.max(...stats.violationTrend.map(v => v.count))) * 100}%`
                                                        }}
                                                    >
                                                        <span className="text-white text-xs font-bold">
                                                            {item.count}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {viewMode === 'retention' && (
                        <div className="space-y-6">
                            {/* Retention Configuration */}
                            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">⚙️ Log Retention Policy</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                                    Configure how long different log types are retained before automatic archival or deletion.
                                </p>

                                {retentionLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                                    </div>
                                ) : retention ? (
                                    <div className="space-y-6">
                                        {/* Retention Days Grid */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    Audit Logs Retention (days)
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={retentionForm.auditLogs || ''}
                                                    onChange={(e) => setRetentionForm({ ...retentionForm, auditLogs: parseInt(e.target.value) || 0 })}
                                                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                                />
                                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Policy evaluation and access decision logs</p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    Security Logs Retention (days)
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={retentionForm.securityLogs || ''}
                                                    onChange={(e) => setRetentionForm({ ...retentionForm, securityLogs: parseInt(e.target.value) || 0 })}
                                                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                                />
                                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Authentication, authorization, and threat detection logs</p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    Access Logs Retention (days)
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={retentionForm.accessLogs || ''}
                                                    onChange={(e) => setRetentionForm({ ...retentionForm, accessLogs: parseInt(e.target.value) || 0 })}
                                                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                                />
                                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Resource access and API request logs</p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    System Logs Retention (days)
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={retentionForm.systemLogs || ''}
                                                    onChange={(e) => setRetentionForm({ ...retentionForm, systemLogs: parseInt(e.target.value) || 0 })}
                                                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                                />
                                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">System health, performance, and operational logs</p>
                                            </div>
                                        </div>

                                        {/* Storage Settings */}
                                        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                                            <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Storage Configuration</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                        Max Storage (GB)
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={retentionForm.maxStorageGB || ''}
                                                        onChange={(e) => setRetentionForm({ ...retentionForm, maxStorageGB: parseInt(e.target.value) || 0 })}
                                                        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                        Current Usage
                                                    </label>
                                                    <div className="mt-1">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                                                {retention.currentUsageGB} GB / {retention.maxStorageGB} GB
                                                            </span>
                                                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                                                                {((retention.currentUsageGB / retention.maxStorageGB) * 100).toFixed(1)}%
                                                            </span>
                                                        </div>
                                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                                                            <div
                                                                className={`h-3 rounded-full transition-all ${
                                                                    (retention.currentUsageGB / retention.maxStorageGB) > 0.8
                                                                        ? 'bg-red-500'
                                                                        : (retention.currentUsageGB / retention.maxStorageGB) > 0.6
                                                                            ? 'bg-yellow-500'
                                                                            : 'bg-green-500'
                                                                }`}
                                                                style={{ width: `${Math.min((retention.currentUsageGB / retention.maxStorageGB) * 100, 100)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Archive Settings */}
                                        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                                            <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Auto-Archive</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div>
                                                    <label className="flex items-center space-x-3 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={retentionForm.autoArchiveEnabled ?? false}
                                                            onChange={(e) => setRetentionForm({ ...retentionForm, autoArchiveEnabled: e.target.checked })}
                                                            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                        />
                                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                            Enable automatic archival of expired logs
                                                        </span>
                                                    </label>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                        Archive Destination
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={retentionForm.archiveDestination || ''}
                                                        onChange={(e) => setRetentionForm({ ...retentionForm, archiveDestination: e.target.value })}
                                                        placeholder="s3://bucket/path"
                                                        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Metadata */}
                                        {retention.lastUpdated && (
                                            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                                                <p className="text-xs text-gray-500 dark:text-gray-500">
                                                    Last updated: {new Date(retention.lastUpdated).toLocaleString()} by {retention.updatedBy}
                                                </p>
                                            </div>
                                        )}

                                        {/* Save Button */}
                                        <div className="flex justify-end space-x-3">
                                            <AnimatedButton
                                                onClick={() => setRetentionForm(retention)}
                                                className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                                            >
                                                Reset
                                            </AnimatedButton>
                                            <AnimatedButton
                                                onClick={saveRetention}
                                                disabled={retentionSaving}
                                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-lg disabled:opacity-50"
                                            >
                                                {retentionSaving ? 'Saving...' : 'Save Retention Policy'}
                                            </AnimatedButton>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-gray-600 dark:text-gray-400">Unable to load retention configuration.</p>
                                )}
                            </div>
                        </div>
                    )}

                </div>

                {/* Export Modal */}
                {showExportModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full shadow-2xl">
                            <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-2xl">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xl font-bold">📥 Export Audit Logs</h3>
                                    <AnimatedButton
                                        onClick={() => { setShowExportModal(false); setLastExportResult(null); }}
                                        className="text-white hover:text-gray-200 text-2xl font-bold"
                                    >
                                        ×
                                    </AnimatedButton>
                                </div>
                            </div>

                            <div className="p-6 space-y-4">
                                {!lastExportResult ? (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Format</label>
                                            <select
                                                value={exportFormat}
                                                onChange={(e) => setExportFormat(e.target.value as 'csv' | 'json' | 'pdf')}
                                                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="csv">CSV - Spreadsheet compatible</option>
                                                <option value="json">JSON - Machine readable</option>
                                                <option value="pdf">PDF - Printable report</option>
                                            </select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Start Date</label>
                                                <input
                                                    type="datetime-local"
                                                    value={exportDateRange.start}
                                                    onChange={(e) => setExportDateRange({ ...exportDateRange, start: e.target.value })}
                                                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">End Date</label>
                                                <input
                                                    type="datetime-local"
                                                    value={exportDateRange.end}
                                                    onChange={(e) => setExportDateRange({ ...exportDateRange, end: e.target.value })}
                                                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                        </div>

                                        {filters.eventType || filters.outcome || filters.subject || filters.resourceId ? (
                                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                                                <p className="text-sm text-blue-700 dark:text-blue-400 font-medium mb-1">Active filters will be applied:</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {filters.eventType && <span className="px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded text-xs">Type: {filters.eventType}</span>}
                                                    {filters.outcome && <span className="px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded text-xs">Outcome: {filters.outcome}</span>}
                                                    {filters.subject && <span className="px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded text-xs">Subject: {filters.subject}</span>}
                                                    {filters.resourceId && <span className="px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded text-xs">Resource: {filters.resourceId}</span>}
                                                </div>
                                            </div>
                                        ) : null}

                                        <div className="flex justify-end space-x-3 pt-2">
                                            <AnimatedButton
                                                onClick={() => { setShowExportModal(false); setLastExportResult(null); }}
                                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                                            >
                                                Cancel
                                            </AnimatedButton>
                                            <AnimatedButton
                                                onClick={handleEnhancedExport}
                                                disabled={exportLoading || !exportDateRange.start || !exportDateRange.end}
                                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-lg disabled:opacity-50"
                                            >
                                                {exportLoading ? 'Exporting...' : 'Export'}
                                            </AnimatedButton>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center space-y-4">
                                        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto text-3xl">
                                            ✓
                                        </div>
                                        <h4 className="text-lg font-bold text-gray-900 dark:text-white">Export Ready</h4>
                                        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-left space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600 dark:text-gray-400">Format:</span>
                                                <span className="text-gray-900 dark:text-white font-medium">{lastExportResult.format.toUpperCase()}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600 dark:text-gray-400">Records:</span>
                                                <span className="text-gray-900 dark:text-white font-medium">{lastExportResult.totalRecords.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600 dark:text-gray-400">File Size:</span>
                                                <span className="text-gray-900 dark:text-white font-medium">{lastExportResult.fileSize}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600 dark:text-gray-400">Expires:</span>
                                                <span className="text-gray-900 dark:text-white font-medium">{new Date(lastExportResult.expiresAt).toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-center space-x-3">
                                            <AnimatedButton
                                                onClick={() => { setShowExportModal(false); setLastExportResult(null); }}
                                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                                            >
                                                Close
                                            </AnimatedButton>
                                            <AnimatedButton
                                                onClick={() => { setLastExportResult(null); }}
                                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-lg"
                                            >
                                                Export Another
                                            </AnimatedButton>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Log Detail Modal */}
                {selectedLog && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
                            {/* Modal Header */}
                            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-2xl">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-2xl font-bold">📋 Audit Log Details</h3>
                                    <AnimatedButton
                                        onClick={() => setSelectedLog(null)}
                                        className="text-white hover:text-gray-200 text-2xl font-bold"
                                    >
                                        ×
                                    </AnimatedButton>
                                </div>
                            </div>

                            {/* Modal Content */}
                            <div className="p-6 space-y-6">
                                {/* Basic Info */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Timestamp</p>
                                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                                            {formatTimestamp(selectedLog.timestamp)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Request ID</p>
                                        <p className="text-sm font-mono text-gray-900 dark:text-white">
                                            {selectedLog.requestId}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Event Type</p>
                                        <p className={`text-lg font-bold ${getEventTypeColor(selectedLog.eventType)}`}>
                                            {selectedLog.eventType}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Outcome</p>
                                        <span className={`inline-block px-4 py-2 rounded-full text-sm font-bold ${getOutcomeBadge(selectedLog.outcome)}`}>
                                            {selectedLog.outcome}
                                        </span>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Subject</p>
                                        <p className="text-sm text-gray-900 dark:text-white">
                                            {selectedLog.subject}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Resource</p>
                                        <p className="text-sm font-mono text-gray-900 dark:text-white">
                                            {selectedLog.resourceId}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Action</p>
                                        <p className="text-sm text-gray-900 dark:text-white">
                                            {selectedLog.action}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Latency</p>
                                        <p className="text-sm text-gray-900 dark:text-white">
                                            {selectedLog.latencyMs ? `${selectedLog.latencyMs}ms` : 'N/A'}
                                        </p>
                                    </div>
                                </div>

                                {/* Reason */}
                                <div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Reason</p>
                                    <p className="text-sm text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-900 p-4 rounded-lg">
                                        {selectedLog.reason}
                                    </p>
                                </div>

                                {/* Subject Attributes */}
                                {selectedLog.subjectAttributes && Object.keys(selectedLog.subjectAttributes).length > 0 && (
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Subject Attributes</p>
                                        <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto text-gray-900 dark:text-white">
                                            {JSON.stringify(selectedLog.subjectAttributes, null, 2)}
                                        </pre>
                                    </div>
                                )}

                                {/* Resource Attributes */}
                                {selectedLog.resourceAttributes && Object.keys(selectedLog.resourceAttributes).length > 0 && (
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Resource Attributes</p>
                                        <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto text-gray-900 dark:text-white">
                                            {JSON.stringify(selectedLog.resourceAttributes, null, 2)}
                                        </pre>
                                    </div>
                                )}

                                {/* Policy Evaluation */}
                                {selectedLog.policyEvaluation && Object.keys(selectedLog.policyEvaluation).length > 0 && (
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Policy Evaluation</p>
                                        <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto text-gray-900 dark:text-white">
                                            {JSON.stringify(selectedLog.policyEvaluation, null, 2)}
                                        </pre>
                                    </div>
                                )}

                                {/* Context */}
                                {selectedLog.context && Object.keys(selectedLog.context).length > 0 && (
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Context</p>
                                        <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto text-gray-900 dark:text-white">
                                            {JSON.stringify(selectedLog.context, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="bg-gray-50 dark:bg-gray-900 p-6 rounded-b-2xl flex justify-end">
                                <AnimatedButton
                                    onClick={() => setSelectedLog(null)}
                                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-lg"
                                >
                                    Close
                                </AnimatedButton>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            </AdminPageTransition>
        </PageLayout>
    );
}
