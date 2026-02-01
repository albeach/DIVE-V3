/**
 * Clearance Management Admin Page
 *
 * Modern 2025 UI for managing national clearance mappings
 * Phase 3: MongoDB SSOT Admin UI
 * Date: 2026-01-04
 *
 * Features:
 * - Interactive clearance matrix (5 levels × 32 countries)
 * - Real-time editing with validation
 * - Multilingual/multi-script support preview
 * - Statistics dashboard
 * - Audit log viewer
 * - Export/import functionality
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import { ClearanceMatrixTable } from '@/components/admin/clearance/clearance-matrix-table';
import { ClearanceStatsCards } from '@/components/admin/clearance/clearance-stats-cards';
import { ClearanceEditor } from '@/components/admin/clearance/clearance-editor';
import { ClearanceTestTool } from '@/components/admin/clearance/clearance-test-tool';

type TabView = 'overview' | 'matrix' | 'editor' | 'test' | 'audit';

interface ClearanceMapping {
    standardLevel: 'UNCLASSIFIED' | 'RESTRICTED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
    nationalEquivalents: Record<string, string[]>;
    mfaRequired: boolean;
    aalLevel: 1 | 2 | 3;
    acrLevel: 0 | 1 | 2;
    description: string;
    version?: number;
    updatedAt: Date;
    updatedBy?: string;
}

interface Stats {
    totalLevels: number;
    totalCountries: number;
    totalMappings: number;
    lastUpdated: Date | null;
}

export default function ClearanceManagementPage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [activeTab, setActiveTab] = useState<TabView>('overview');
    const [mappings, setMappings] = useState<ClearanceMapping[]>([]);
    const [countries, setCountries] = useState<string[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const [autoRefresh, setAutoRefresh] = useState(false);

    // Fetch clearance data
    const fetchData = useCallback(async () => {
        try {
            setError(null);

            // Fetch mappings
            const mappingsRes = await fetch('/api/admin/clearance/mappings');
            if (!mappingsRes.ok) throw new Error('Failed to fetch mappings');
            const mappingsData = await mappingsRes.json();

            // Fetch countries
            const countriesRes = await fetch('/api/admin/clearance/countries');
            if (!countriesRes.ok) throw new Error('Failed to fetch countries');
            const countriesData = await countriesRes.json();

            // Fetch stats
            const statsRes = await fetch('/api/admin/clearance/stats');
            if (!statsRes.ok) throw new Error('Failed to fetch stats');
            const statsData = await statsRes.json();

            setMappings(mappingsData.data);
            setCountries(countriesData.data);
            setStats(statsData.data);
            setLastRefresh(new Date());

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load data');
            console.error('Error fetching clearance data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial load
    useEffect(() => {
        if (status === 'authenticated') {
            fetchData();
        }
    }, [status, fetchData]);

    // Auto-refresh (if enabled)
    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            fetchData();
        }, 60000); // Refresh every minute

        return () => clearInterval(interval);
    }, [autoRefresh, fetchData]);

    // Redirect if not authenticated
    useEffect(() => {
        if (status !== 'loading' && status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    if (status === 'loading' || loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-900 dark:to-gray-950">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600"></div>
                    <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">Loading Clearance Mappings...</p>
                </div>
            </div>
        );
    }

    if (status === 'unauthenticated') {
        return null;
    }

    const tabs = [
        { id: 'overview', label: '📊 Overview', icon: '📊', description: 'Statistics & quick actions' },
        { id: 'matrix', label: '🔢 Matrix', icon: '🔢', description: '5 levels × 32 countries' },
        { id: 'editor', label: '✏️ Editor', icon: '✏️', description: 'Edit country mappings' },
        { id: 'test', label: '🧪 Test', icon: '🧪', description: 'Test clearance mappings' },
        { id: 'audit', label: '📋 Audit', icon: '📋', description: 'Change history' }
    ];

    return (
        <PageLayout
            user={session?.user || {}}
            breadcrumbs={[
                { label: 'Admin', href: '/admin/dashboard' },
                { label: 'Clearance Management', href: null }
            ]}
            maxWidth="7xl"
        >
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-gray-900 dark:via-gray-950 dark:to-indigo-950/10">
                {/* Header */}
                <div className="mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-slate-200 dark:border-gray-700 p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-2">
                            <h1 className="text-3xl lg:text-4xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                                🔐 Clearance Management
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400 text-sm lg:text-base">
                                Manage national clearance mappings across 32 NATO members
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Auto-refresh toggle */}
                            <button
                                onClick={() => setAutoRefresh(!autoRefresh)}
                                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                                    autoRefresh
                                        ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                                title="Auto-refresh every minute"
                            >
                                {autoRefresh ? '🔄 Auto' : '⏸️ Manual'}
                            </button>

                            {/* Manual refresh button */}
                            <button
                                onClick={() => fetchData()}
                                className="px-4 py-2 bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-600 transition-all duration-200 shadow-lg shadow-indigo-500/30 disabled:opacity-50"
                                disabled={loading}
                            >
                                🔄 Refresh
                            </button>

                            {/* Last refresh time */}
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                Last: {lastRefresh.toLocaleTimeString()}
                            </div>
                        </div>
                    </div>

                    {/* Error banner */}
                    {error && (
                        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <div className="flex items-start gap-3">
                                <span className="text-red-600 dark:text-red-400 text-xl">⚠️</span>
                                <div className="flex-1">
                                    <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
                                    <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
                                </div>
                                <button
                                    onClick={() => setError(null)}
                                    className="text-red-400 hover:text-red-600 dark:hover:text-red-300"
                                    aria-label="Dismiss error"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Tab Navigation */}
                <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 p-2">
                    <div className="flex flex-wrap gap-2">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as TabView)}
                                className={`flex-1 min-w-[140px] px-4 py-3 rounded-lg font-medium transition-all duration-200 ${
                                    activeTab === tab.id
                                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/30'
                                        : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                                }`}
                                title={tab.description}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <span>{tab.icon}</span>
                                    <span className="hidden sm:inline">{tab.label.split(' ')[1]}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tab Content */}
                <div className="space-y-6">
                    {activeTab === 'overview' && (
                        <ClearanceStatsCards
                            stats={stats}
                            mappings={mappings}
                            countries={countries}
                            onRefresh={fetchData}
                        />
                    )}

                    {activeTab === 'matrix' && (
                        <ClearanceMatrixTable
                            mappings={mappings}
                            countries={countries}
                            onUpdate={fetchData}
                        />
                    )}

                    {activeTab === 'editor' && (
                        <ClearanceEditor
                            mappings={mappings}
                            countries={countries}
                            onUpdate={fetchData}
                        />
                    )}

                    {activeTab === 'test' && (
                        <ClearanceTestTool
                            mappings={mappings}
                            countries={countries}
                        />
                    )}

                    {activeTab === 'audit' && (
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 p-6">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">
                                📋 Audit Log
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400 text-center py-12">
                                Audit log tracking coming soon...
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </PageLayout>
    );
}
