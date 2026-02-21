/**
 * IdP Governance Dashboard - Complete Redesign (2025)
 *
 * Purpose: Monitor and analyze the IdP partner ecosystem health
 *
 * Focus Areas:
 * - IdP Onboarding Quality & Risk Assessment
 * - Partner Compliance & Standards Adherence
 * - SLA Performance & Review Efficiency
 * - Security Posture of Partner IdPs
 * - Authorization Performance via Partner IdPs
 *
 * This dashboard is specifically for evaluating the federation partners and their
 * identity providers, NOT general system analytics (that's in /admin/dashboard)
 */

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import { createAISearch, AISearchWrapper } from '@/lib/ai-search-wrapper';
import { AdminPageTransition, AnimatedButton, PresenceIndicator } from '@/components/admin/shared';

// Types
interface IRiskDistribution {
    gold: number;
    silver: number;
    bronze: number;
    fail: number;
}

interface IComplianceTrends {
    dates: string[];
    acp240: number[];
    stanag4774: number[];
    nist80063: number[];
}

interface ISLAMetrics {
    fastTrackCompliance: number;
    standardCompliance: number;
    averageReviewTime: number;
    exceededCount: number;
}

interface IAuthzMetrics {
    totalDecisions: number;
    allowRate: number;
    denyRate: number;
    averageLatency: number;
    cacheHitRate: number;
}

interface ISecurityPosture {
    averageRiskScore: number;
    complianceRate: number;
    mfaAdoptionRate: number;
    tls13AdoptionRate: number;
}

interface IZeroResultQuery {
    queryHash: string;
    queryLength: number;
    searchCount: number;
    lastSearched: string;
    avgLatencyMs: number;
}

type ViewMode = 'overview' | 'risk' | 'compliance' | 'performance' | 'content-gaps';

export default function IdPGovernanceDashboard() {
    const router = useRouter();
    const { data: session, status } = useSession();

    // State
    const [riskDistribution, setRiskDistribution] = useState<IRiskDistribution | null>(null);
    const [complianceTrends, setComplianceTrends] = useState<IComplianceTrends | null>(null);
    const [slaMetrics, setSlaMetrics] = useState<ISLAMetrics | null>(null);
    const [authzMetrics, setAuthzMetrics] = useState<IAuthzMetrics | null>(null);
    const [securityPosture, setSecurityPosture] = useState<ISecurityPosture | null>(null);
    const [zeroResultQueries, setZeroResultQueries] = useState<IZeroResultQuery[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [viewMode, setViewMode] = useState<ViewMode>('overview');
    const [autoRefresh, setAutoRefresh] = useState(false);

    // AI Search state for filtering metrics/IdPs
    const [searchQuery, setSearchQuery] = useState('');
    const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Initialize AI search wrapper for zero-result queries
    const querySearcher = useMemo(() => {
        return createAISearch<IZeroResultQuery>(
            zeroResultQueries,
            {
                keys: ['queryHash'],
                threshold: 0.3,
                ignoreLocation: true,
            },
            'dive-v3-search-analytics-queries'
        );
    }, [zeroResultQueries]);

    // Update AI searcher when queries change
    useEffect(() => {
        if (zeroResultQueries.length > 0) {
            querySearcher.updateData(zeroResultQueries);
        }
    }, [zeroResultQueries, querySearcher]);

    // Filter zero-result queries with AI fuzzy search
    const filteredZeroResultQueries = useMemo(() => {
        if (!searchQuery) return zeroResultQueries;
        return querySearcher.search(searchQuery);
    }, [zeroResultQueries, searchQuery, querySearcher]);

    // Update search suggestions
    const handleSearchChange = useCallback((value: string) => {
        setSearchQuery(value);
        
        if (value.length > 0) {
            const suggestions = querySearcher.getSuggestions(value, 5);
            setSearchSuggestions(suggestions);
            setShowSuggestions(suggestions.length > 0);
        } else {
            setSearchSuggestions([]);
            setShowSuggestions(false);
        }
    }, [querySearcher]);

    // Apply suggestion
    const applySuggestion = useCallback((suggestion: string) => {
        setSearchQuery(suggestion);
        setShowSuggestions(false);
    }, []);

    // Fetch all analytics data
    const fetchAnalytics = useCallback(async () => {
        if (status !== 'authenticated') return;

        try {
            setLoading(true);
            setError(null);

            // Use server API routes (secure! No client-side tokens!)
            const [risk, compliance, sla, authz, posture, zeroResults] = await Promise.all([
                fetch(`/api/admin/analytics/risk-distribution`).then(res => res.json()),
                fetch(`/api/admin/analytics/compliance-trends`).then(res => res.json()),
                fetch(`/api/admin/analytics/sla-metrics`).then(res => res.json()),
                fetch(`/api/admin/analytics/authz-metrics`).then(res => res.json()),
                fetch(`/api/admin/analytics/security-posture`).then(res => res.json()),
                fetch(`/api/analytics/search/zero-results?limit=20&days=7`).then(res => res.ok ? res.json() : { zeroResultQueries: [] }).catch(() => ({ zeroResultQueries: [] })),
            ]);

            setRiskDistribution(risk);
            setComplianceTrends(compliance);
            setSlaMetrics(sla);
            setAuthzMetrics(authz);
            setSecurityPosture(posture);
            if (zeroResults.zeroResultQueries) {
                setZeroResultQueries(zeroResults.zeroResultQueries);
            }
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Error fetching analytics:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch analytics data');
        } finally {
            setLoading(false);
        }
    }, [session, status]);

    // Initial load
    useEffect(() => {
        fetchAnalytics();
    }, [fetchAnalytics]);

    // Auto-refresh
    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            fetchAnalytics();
        }, 5 * 60 * 1000); // 5 minutes

        return () => clearInterval(interval);
    }, [autoRefresh, fetchAnalytics]);

    // Helper: Calculate total IdPs
    const getTotalIdPs = () => {
        if (!riskDistribution) return 0;
        return riskDistribution.gold + riskDistribution.silver + riskDistribution.bronze + riskDistribution.fail;
    };

    // Helper: Get risk color
    const getRiskColor = (tier: string) => {
        const colors: Record<string, string> = {
            gold: 'from-yellow-400 to-yellow-600',
            silver: 'from-gray-400 to-gray-600',
            bronze: 'from-orange-400 to-orange-600',
            fail: 'from-red-400 to-red-600'
        };
        return colors[tier] || 'from-gray-400 to-gray-600';
    };

    // Helper: Get risk tier percentage
    const getRiskPercentage = (count: number) => {
        const total = getTotalIdPs();
        return total > 0 ? ((count / total) * 100).toFixed(1) : '0';
    };

    // Redirect to login if not authenticated (separate effect to avoid render-phase updates)
    useEffect(() => {
        if (status !== 'loading' && status === 'unauthenticated') {
            router.push('/auth/signin');
        }
    }, [status, router]);

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
        return null;
    }

    return (
        <PageLayout user={session?.user || {}}>
            <AdminPageTransition pageKey="/admin/analytics">
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-indigo-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-indigo-900/20">
                {/* Header */}
                <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
                    <div className="max-w-[1800px] mx-auto px-8 py-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-400 dark:to-indigo-400 bg-clip-text text-transparent">
                                    🏛️ IdP Governance Dashboard
                                </h1>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                    Monitor federation partner ecosystem health and onboarding quality
                                </p>
                            </div>

                            <div className="flex items-center space-x-4">
                                {/* Presence Indicator */}
                                <PresenceIndicator page="analytics" />
                                
                                {/* Manage IdPs Button - Phase 3.3 Cross-Navigation */}
                                <AnimatedButton
                                    onClick={() => router.push('/admin/idp')}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-lg"
                                >
                                    ⚙️ Manage IdPs
                                </AnimatedButton>

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

                                {/* Refresh button */}
                                <AnimatedButton
                                    onClick={fetchAnalytics}
                                    disabled={loading}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium shadow-lg disabled:opacity-50"
                                >
                                    🔄 Refresh
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

                        {/* Last Updated */}
                        <div className="mt-3 flex items-center justify-between">
                            <p className="text-xs text-gray-500 dark:text-gray-500">
                                Last updated: {lastUpdated.toLocaleString()} • Auto-refreshes every 5 minutes when enabled
                            </p>
                            <div className="flex space-x-2">
                                        {(['overview', 'risk', 'compliance', 'performance', 'content-gaps'] as ViewMode[]).map((mode) => (
                                            <AnimatedButton
                                                key={mode}
                                                onClick={() => setViewMode(mode)}
                                                className={`px-4 py-1 rounded-lg text-sm font-medium transition-all ${
                                                    viewMode === mode
                                                        ? 'bg-purple-600 text-white shadow-md'
                                                        : 'bg-white/50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-700/80'
                                                }`}
                                            >
                                                {mode === 'content-gaps' ? 'Content Gaps' : mode.charAt(0).toUpperCase() + mode.slice(1)}
                                            </AnimatedButton>
                                        ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="max-w-[1800px] mx-auto px-8 py-8 space-y-6">
                    {loading && !riskDistribution ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="text-center">
                                <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mb-4"></div>
                                <p className="text-gray-600 dark:text-gray-400">Loading IdP governance data...</p>
                            </div>
                        </div>
                    ) : error ? (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-8">
                            <div className="flex items-center space-x-3 mb-4">
                                <span className="text-4xl">⚠️</span>
                                <h3 className="text-lg font-semibold text-red-800 dark:text-red-400">Error Loading Data</h3>
                            </div>
                            <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
                                            <AnimatedButton
                                                onClick={fetchAnalytics}
                                                className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                                            >
                                                Retry
                                            </AnimatedButton>
                        </div>
                    ) : (
                        <>
                            {/* Key Metrics Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                {/* Total Partner IdPs */}
                                <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">Partner IdPs</p>
                                            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                                                {getTotalIdPs()}
                                            </p>
                                        </div>
                                        <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg">
                                            🏛️
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                                        Total federation partners
                                    </p>
                                </div>

                                {/* Average Risk Score */}
                                {securityPosture && (
                                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">Avg Risk Score</p>
                                                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
                                                    {securityPosture.averageRiskScore.toFixed(1)}
                                                </p>
                                            </div>
                                            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg">
                                                📊
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                                            Out of 100 points
                                        </p>
                                    </div>
                                )}

                                {/* Compliance Rate */}
                                {securityPosture && (
                                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">Compliance Rate</p>
                                                <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
                                                    {securityPosture.complianceRate.toFixed(1)}%
                                                </p>
                                            </div>
                                            <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg">
                                                ✅
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                                            Standards adherence
                                        </p>
                                    </div>
                                )}

                                {/* SLA Compliance */}
                                {slaMetrics && (
                                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">SLA Compliance</p>
                                                <p className="text-3xl font-bold text-orange-600 dark:text-orange-400 mt-2">
                                                    {slaMetrics.standardCompliance.toFixed(1)}%
                                                </p>
                                            </div>
                                            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg">
                                                ⏱️
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                                            Within 24hr window
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* View-specific content */}
                            {viewMode === 'overview' && (
                                <>
                                    {/* Risk Distribution */}
                                    {riskDistribution && (
                                        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
                                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                                                🎯 IdP Risk Tier Distribution
                                            </h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                                                Classification of partner IdPs based on comprehensive 100-point risk assessment
                                            </p>

                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                                {/* Gold Tier */}
                                                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 p-6 border border-yellow-200 dark:border-yellow-800">
                                                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-yellow-400/20 to-transparent rounded-full -mr-16 -mt-16"></div>
                                                    <div className="relative">
                                                        <div className="flex items-center space-x-3 mb-4">
                                                            <div className={`w-12 h-12 bg-gradient-to-br ${getRiskColor('gold')} rounded-xl flex items-center justify-center text-2xl shadow-lg`}>
                                                                🥇
                                                            </div>
                                                            <div>
                                                                <h4 className="text-lg font-bold text-yellow-800 dark:text-yellow-400">Gold Tier</h4>
                                                                <p className="text-xs text-yellow-600 dark:text-yellow-500">85-100 points</p>
                                                            </div>
                                                        </div>
                                                        <p className="text-4xl font-bold text-yellow-900 dark:text-yellow-300 mb-2">
                                                            {riskDistribution.gold}
                                                        </p>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm text-yellow-700 dark:text-yellow-500">
                                                                {getRiskPercentage(riskDistribution.gold)}% of total
                                                            </span>
                                                            <span className="px-2 py-1 bg-yellow-200 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-400 text-xs font-bold rounded-full">
                                                                AUTO-APPROVED
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Silver Tier - CLICKABLE for drill-down */}
                                                <AnimatedButton
                                                    onClick={() => router.push('/admin/idp?tier=silver')}
                                                    className="relative overflow-hidden rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-700/50 p-6 border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow cursor-pointer text-left w-full"
                                                    disableAnimation={false}
                                                >
                                                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-gray-400/20 to-transparent rounded-full -mr-16 -mt-16"></div>
                                                    <div className="relative">
                                                        <div className="flex items-center space-x-3 mb-4">
                                                            <div className={`w-12 h-12 bg-gradient-to-br ${getRiskColor('silver')} rounded-xl flex items-center justify-center text-2xl shadow-lg`}>
                                                                🥈
                                                            </div>
                                                            <div>
                                                                <h4 className="text-lg font-bold text-gray-800 dark:text-gray-400">Silver Tier</h4>
                                                                <p className="text-xs text-gray-600 dark:text-gray-500">70-84 points • Click to view</p>
                                                            </div>
                                                        </div>
                                                        <p className="text-4xl font-bold text-gray-900 dark:text-gray-300 mb-2">
                                                            {riskDistribution.silver}
                                                        </p>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm text-gray-700 dark:text-gray-500">
                                                                {getRiskPercentage(riskDistribution.silver)}% of total
                                                            </span>
                                                            <span className="px-2 py-1 bg-gray-200 dark:bg-gray-900/50 text-gray-800 dark:text-gray-400 text-xs font-bold rounded-full">
                                                                FAST-TRACK
                                                            </span>
                                                        </div>
                                                    </div>
                                                </AnimatedButton>

                                                {/* Bronze Tier - CLICKABLE for drill-down */}
                                                <AnimatedButton
                                                    onClick={() => router.push('/admin/idp?tier=bronze')}
                                                    className="relative overflow-hidden rounded-xl bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 p-6 border border-orange-200 dark:border-orange-800 hover:shadow-xl transition-shadow cursor-pointer text-left w-full"
                                                    disableAnimation={false}
                                                >
                                                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-400/20 to-transparent rounded-full -mr-16 -mt-16"></div>
                                                    <div className="relative">
                                                        <div className="flex items-center space-x-3 mb-4">
                                                            <div className={`w-12 h-12 bg-gradient-to-br ${getRiskColor('bronze')} rounded-xl flex items-center justify-center text-2xl shadow-lg`}>
                                                                🥉
                                                            </div>
                                                            <div>
                                                                <h4 className="text-lg font-bold text-orange-800 dark:text-orange-400">Bronze Tier</h4>
                                                                <p className="text-xs text-orange-600 dark:text-orange-500">50-69 points • Click to view</p>
                                                            </div>
                                                        </div>
                                                        <p className="text-4xl font-bold text-orange-900 dark:text-orange-300 mb-2">
                                                            {riskDistribution.bronze}
                                                        </p>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm text-orange-700 dark:text-orange-500">
                                                                {getRiskPercentage(riskDistribution.bronze)}% of total
                                                            </span>
                                                            <span className="px-2 py-1 bg-orange-200 dark:bg-orange-900/50 text-orange-800 dark:text-orange-400 text-xs font-bold rounded-full">
                                                                STANDARD
                                                            </span>
                                                        </div>
                                                    </div>
                                                </AnimatedButton>

                                                {/* Fail Tier - CLICKABLE for drill-down */}
                                                <AnimatedButton
                                                    onClick={() => router.push('/admin/idp?tier=fail')}
                                                    className="relative overflow-hidden rounded-xl bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 p-6 border border-red-200 dark:border-red-800 hover:shadow-xl transition-shadow cursor-pointer text-left w-full"
                                                    disableAnimation={false}
                                                >
                                                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-red-400/20 to-transparent rounded-full -mr-16 -mt-16"></div>
                                                    <div className="relative">
                                                        <div className="flex items-center space-x-3 mb-4">
                                                            <div className={`w-12 h-12 bg-gradient-to-br ${getRiskColor('fail')} rounded-xl flex items-center justify-center text-2xl shadow-lg`}>
                                                                ⛔
                                                            </div>
                                                            <div>
                                                                <h4 className="text-lg font-bold text-red-800 dark:text-red-400">Failed</h4>
                                                                <p className="text-xs text-red-600 dark:text-red-500">&lt;50 points • Click to view</p>
                                                            </div>
                                                        </div>
                                                        <p className="text-4xl font-bold text-red-900 dark:text-red-300 mb-2">
                                                            {riskDistribution.fail}
                                                        </p>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm text-red-700 dark:text-red-500">
                                                                {getRiskPercentage(riskDistribution.fail)}% of total
                                                            </span>
                                                            <span className="px-2 py-1 bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-400 text-xs font-bold rounded-full">
                                                                REJECTED
                                                            </span>
                                                        </div>
                                                    </div>
                                                </AnimatedButton>
                                            </div>
                                        </div>
                                    )}

                                    {/* Security Posture & SLA Metrics */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* Security Adoption */}
                                        {securityPosture && (
                                            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
                                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                                                    🛡️ Security Technology Adoption
                                                </h3>
                                                <div className="space-y-6">
                                                    {/* MFA */}
                                                    <div>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                                Multi-Factor Authentication (MFA)
                                                            </span>
                                                            <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                                                                {securityPosture.mfaAdoptionRate.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
                                                            <div
                                                                className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full flex items-center justify-end pr-2"
                                                                style={{ width: `${securityPosture.mfaAdoptionRate}%` }}
                                                            >
                                                                <span className="text-xs font-bold text-white"></span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* TLS 1.3 */}
                                                    <div>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                                TLS 1.3 Encryption
                                                            </span>
                                                            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                                                                {securityPosture.tls13AdoptionRate.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
                                                            <div
                                                                className="bg-gradient-to-r from-blue-500 to-cyan-500 h-full flex items-center justify-end pr-2"
                                                                style={{ width: `${securityPosture.tls13AdoptionRate}%` }}
                                                            >
                                                                <span className="text-xs font-bold text-white"></span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Overall Compliance */}
                                                    <div>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                                Standards Compliance Rate
                                                            </span>
                                                            <span className="text-lg font-bold text-green-600 dark:text-green-400">
                                                                {securityPosture.complianceRate.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
                                                            <div
                                                                className="bg-gradient-to-r from-green-500 to-emerald-500 h-full flex items-center justify-end pr-2"
                                                                style={{ width: `${securityPosture.complianceRate}%` }}
                                                            >
                                                                <span className="text-xs font-bold text-white"></span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* SLA Performance */}
                                        {slaMetrics && (
                                            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
                                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                                                    ⏱️ Onboarding SLA Performance
                                                </h3>
                                                <div className="space-y-6">
                                                    {/* Fast-Track SLA */}
                                                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-sm font-medium text-green-800 dark:text-green-400">
                                                                Fast-Track (2hr SLA)
                                                            </span>
                                                            <span className="text-2xl font-bold text-green-700 dark:text-green-300">
                                                                {slaMetrics.fastTrackCompliance.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-green-600 dark:text-green-500">
                                                            High-quality submissions processed within 2 hours
                                                        </p>
                                                    </div>

                                                    {/* Standard SLA */}
                                                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-sm font-medium text-blue-800 dark:text-blue-400">
                                                                Standard (24hr SLA)
                                                            </span>
                                                            <span className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                                                                {slaMetrics.standardCompliance.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-blue-600 dark:text-blue-500">
                                                            Regular submissions processed within 24 hours
                                                        </p>
                                                    </div>

                                                    {/* Average Review Time */}
                                                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-sm font-medium text-purple-800 dark:text-purple-400">
                                                                Average Review Time
                                                            </span>
                                                            <span className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                                                                {slaMetrics.averageReviewTime.toFixed(1)}h
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-purple-600 dark:text-purple-500">
                                                            Mean time to approve/reject submissions
                                                        </p>
                                                    </div>

                                                    {/* SLA Violations */}
                                                    {slaMetrics.exceededCount > 0 && (
                                                        <div className="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-sm font-medium text-red-800 dark:text-red-400">
                                                                    SLA Violations
                                                                </span>
                                                                <span className="text-2xl font-bold text-red-700 dark:text-red-300">
                                                                    {slaMetrics.exceededCount}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-red-600 dark:text-red-500">
                                                                Submissions that exceeded their SLA window
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Authorization Performance via Partner IdPs */}
                                    {authzMetrics && (
                                        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
                                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                                                🔐 Authorization Performance via Partner IdPs
                                            </h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                                                Access control decisions for users authenticated through federated identity providers
                                            </p>

                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
                                                    <p className="text-sm text-blue-700 dark:text-blue-400 mb-2">Total Decisions</p>
                                                    <p className="text-3xl font-bold text-blue-900 dark:text-blue-300">
                                                        {authzMetrics.totalDecisions.toLocaleString()}
                                                    </p>
                                                </div>

                                                <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-6 border border-green-200 dark:border-green-800">
                                                    <p className="text-sm text-green-700 dark:text-green-400 mb-2">Allow Rate</p>
                                                    <p className="text-3xl font-bold text-green-900 dark:text-green-300">
                                                        {authzMetrics.allowRate.toFixed(1)}%
                                                    </p>
                                                </div>

                                                <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-6 border border-purple-200 dark:border-purple-800">
                                                    <p className="text-sm text-purple-700 dark:text-purple-400 mb-2">Avg Latency</p>
                                                    <p className="text-3xl font-bold text-purple-900 dark:text-purple-300">
                                                        {authzMetrics.averageLatency.toFixed(0)}ms
                                                    </p>
                                                </div>

                                                <div className="bg-gradient-to-br from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 rounded-xl p-6 border border-orange-200 dark:border-orange-800">
                                                    <p className="text-sm text-orange-700 dark:text-orange-400 mb-2">Cache Hit Rate</p>
                                                    <p className="text-3xl font-bold text-orange-900 dark:text-orange-300">
                                                        {authzMetrics.cacheHitRate.toFixed(1)}%
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Content Gaps View */}
                            {viewMode === 'content-gaps' && (
                                <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
                                    <div className="flex items-center justify-between mb-6">
                                        <div>
                                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                                                📊 Content Gap Analysis
                                            </h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                                                Queries that returned zero results - potential content gaps to address
                                            </p>
                                        </div>
                                        <AnimatedButton
                                            onClick={() => router.push('/upload')}
                                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-lg"
                                        >
                                            📤 Upload Content
                                        </AnimatedButton>
                                    </div>

                                    {/* Search Filter for Zero-Result Queries */}
                                    {zeroResultQueries.length > 0 && (
                                        <div className="mb-6">
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={searchQuery}
                                                    onChange={(e) => handleSearchChange(e.target.value)}
                                                    onFocus={() => {
                                                        if (searchSuggestions.length > 0) {
                                                            setShowSuggestions(true);
                                                        }
                                                    }}
                                                    onBlur={() => {
                                                        setTimeout(() => setShowSuggestions(false), 200);
                                                    }}
                                                    placeholder="Search zero-result queries (AI-powered)..."
                                                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 transition-all"
                                                />
                                                
                                                {/* Search suggestions dropdown */}
                                                {showSuggestions && searchSuggestions.length > 0 && (
                                                    <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 max-h-60 overflow-y-auto">
                                                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                                            Recent Searches
                                                        </div>
                                                        {searchSuggestions.map((suggestion, idx) => (
                                                            <button
                                                                key={idx}
                                                                onClick={() => applySuggestion(suggestion)}
                                                                className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
                                                            >
                                                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                </svg>
                                                                <span className="text-sm text-gray-700 dark:text-gray-300">{suggestion}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {searchQuery && (
                                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                                                    Showing {filteredZeroResultQueries.length} of {zeroResultQueries.length} queries
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {zeroResultQueries.length === 0 ? (
                                        <div className="text-center py-12">
                                            <div className="text-6xl mb-4">✅</div>
                                            <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                No Zero-Result Queries
                                            </p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                All recent searches returned results. Great job!
                                            </p>
                                        </div>
                                    ) : filteredZeroResultQueries.length === 0 && searchQuery ? (
                                        <div className="text-center py-12">
                                            <div className="text-6xl mb-4">🔍</div>
                                            <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                No Matching Queries
                                            </p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                No queries match "{searchQuery}"
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                                <div className="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
                                                    <p className="text-sm text-red-700 dark:text-red-400 mb-1">Total Zero-Result Queries</p>
                                                    <p className="text-2xl font-bold text-red-900 dark:text-red-300">
                                                        {searchQuery ? filteredZeroResultQueries.length : zeroResultQueries.length}
                                                    </p>
                                                </div>
                                                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                                                    <p className="text-sm text-blue-700 dark:text-blue-400 mb-1">Total Searches</p>
                                                    <p className="text-2xl font-bold text-blue-900 dark:text-blue-300">
                                                        {filteredZeroResultQueries.reduce((sum, q) => sum + q.searchCount, 0)}
                                                    </p>
                                                </div>
                                                <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
                                                    <p className="text-sm text-purple-700 dark:text-purple-400 mb-1">Avg Query Length</p>
                                                    <p className="text-2xl font-bold text-purple-900 dark:text-purple-300">
                                                        {filteredZeroResultQueries.length > 0
                                                            ? Math.round(filteredZeroResultQueries.reduce((sum, q) => sum + q.queryLength, 0) / filteredZeroResultQueries.length)
                                                            : 0
                                                        } chars
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                {filteredZeroResultQueries.map((query, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                    >
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-3 mb-1">
                                                                <span className="text-sm font-mono text-gray-400 dark:text-gray-500">
                                                                    #{idx + 1}
                                                                </span>
                                                                <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                                    Query (hashed for privacy)
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                                                                <span>Length: {query.queryLength} chars</span>
                                                                <span>•</span>
                                                                <span>Searched {query.searchCount} time{query.searchCount !== 1 ? 's' : ''}</span>
                                                                <span>•</span>
                                                                <span>Last: {new Date(query.lastSearched).toLocaleDateString()}</span>
                                                                {query.avgLatencyMs > 0 && (
                                                                    <>
                                                                        <span>•</span>
                                                                        <span>Avg latency: {query.avgLatencyMs.toFixed(0)}ms</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <AnimatedButton
                                                            onClick={() => router.push('/upload')}
                                                            className="ml-4 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                                                        >
                                                            Upload →
                                                        </AnimatedButton>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Info Card */}
                            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800 rounded-2xl p-6">
                                <div className="flex items-start space-x-4">
                                    <div className="text-4xl">ℹ️</div>
                                    <div>
                                        <h4 className="font-bold text-purple-900 dark:text-purple-300 mb-2">
                                            About IdP Governance Analytics
                                        </h4>
                                        <p className="text-sm text-purple-800 dark:text-purple-400">
                                            This dashboard provides insights into the <strong>federation partner ecosystem</strong>.
                                            It tracks IdP onboarding quality, risk assessments, compliance with NATO/NIST standards,
                                            and operational performance. For general system analytics (resources, users, sessions),
                                            visit the <AnimatedButton onClick={() => router.push('/admin/dashboard')} className="underline hover:text-purple-600">main admin dashboard</AnimatedButton>.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
            </AdminPageTransition>
        </PageLayout>
    );
}
