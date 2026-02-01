/**
 * Super Admin Dashboard - Complete Revamp
 *
 * Comprehensive analytics platform with:
 * - Real-time system metrics
 * - Interactive data visualizations
 * - Drill-down capabilities
 * - Multi-dimensional insights
 * - Modern 2025 UI patterns
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import PageLayout from '@/components/layout/page-layout';

// Eagerly loaded (overview tab - default view)
import SystemOverviewSection from '@/components/admin/dashboard/system-overview-section';
import RealTimeActivity from '@/components/admin/dashboard/realtime-activity';
import { CertificateExpiryWarnings } from '@/components/admin/smart-suggestions';
import DemoScenarioManager from '@/components/admin/demo-scenario-manager';

// Dynamic imports for non-default tabs (code splitting)
const AuthorizationAnalytics = dynamic(() => import('@/components/admin/dashboard/authorization-analytics'), { ssr: false });
const SecurityPosture = dynamic(() => import('@/components/admin/dashboard/security-posture'), { ssr: false });
const ThreatIntelligence = dynamic(() => import('@/components/admin/dashboard/threat-intelligence'), { ssr: false });
const PerformanceMetrics = dynamic(() => import('@/components/admin/dashboard/performance-metrics'), { ssr: false });
const ComplianceOverview = dynamic(() => import('@/components/admin/dashboard/compliance-overview'), { ssr: false });
const ResourceAnalytics = dynamic(() => import('@/components/admin/dashboard/resource-analytics'), { ssr: false });
const FederationDashboard = dynamic(() => import('@/components/admin/federation-dashboard'), { ssr: false });

// Dynamic imports for Phase 5.2/5.3 heavy components
const AuthorizationHeatmap = dynamic(() => import('@/components/admin/authorization-heatmap').then(m => ({ default: m.AuthorizationHeatmap })), { ssr: false });
import { generateSampleHeatmapData } from '@/components/admin/authorization-heatmap';
import { InteractiveBreadcrumbs } from '@/components/ui/interactive-breadcrumbs';
import { KeyboardShortcutsModal } from '@/components/ui/keyboard-shortcuts-modal';
import { useKeyboardNavigation } from '@/hooks/use-keyboard-navigation';

type TabView = 'overview' | 'federation' | 'insights';

export default function AdminDashboard() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [activeTab, setActiveTab] = useState<TabView>('overview');
    const [dateRange, setDateRange] = useState<'24h' | '7d' | '30d' | '90d'>('7d');
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const { isHelpOpen, setIsHelpOpen } = useKeyboardNavigation({ enabled: status === 'authenticated' });

    // Auto-refresh every 30 seconds
    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            setLastRefresh(new Date());
        }, 30000);

        return () => clearInterval(interval);
    }, [autoRefresh]);

    // Redirect to login if not authenticated (separate effect to avoid render-phase updates)
    useEffect(() => {
        if (status !== 'loading' && status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    if (status === 'loading') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-900 dark:to-gray-950">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
                    <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">Loading Dashboard...</p>
                </div>
            </div>
        );
    }

    if (status === 'unauthenticated') {
        return null;
    }

    const tabs = [
        {
            id: 'overview',
            label: 'Overview',
            icon: '📊',
            description: 'System Health, Quick Actions, Recent Activity & Pending Approvals',
            tooltip: 'Consolidated view of all critical system metrics, health indicators, and actionable items'
        },
        {
            id: 'federation',
            label: 'Federation',
            icon: '🌍',
            description: 'Spoke Registry, Policy Sync, OPAL Status & Audit Queue',
            tooltip: 'Manage federation across all spoke instances with real-time synchronization monitoring'
        },
        {
            id: 'insights',
            label: 'Insights',
            icon: '📈',
            description: 'Authorization Analytics, Security Posture, Performance & Compliance',
            tooltip: 'Advanced analytics combining authorization patterns, security metrics, and compliance tracking'
        }
    ];

    return (
        <PageLayout
            user={session?.user || {}}
            breadcrumbs={[
                { label: 'Admin', href: '/admin/dashboard' },
                { label: 'Dashboard', href: null }
            ]}
        >
            <KeyboardShortcutsModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900">
                {/* Interactive Breadcrumbs */}
                <div className="mb-4">
                    <InteractiveBreadcrumbs />
                </div>
                {/* Enhanced Header */}
                <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 p-4 sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-2">
                            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                🔐 DIVE V3 Command Center
                            </h1>
                            <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base lg:text-lg">
                                Advanced Analytics & Security Intelligence Platform
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3 items-center lg:justify-end">
                            {/* Auto-Refresh Toggle */}
                            <button
                                onClick={() => setAutoRefresh(!autoRefresh)}
                                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm sm:text-base font-medium transition-all ${
                                    autoRefresh
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                            >
                                <span className={autoRefresh ? 'animate-pulse' : ''}>●</span>
                                <span>{autoRefresh ? 'Live' : 'Paused'}</span>
                            </button>

                            {/* Date Range Selector */}
                            <select
                                value={dateRange}
                                onChange={(e) => setDateRange(e.target.value as any)}
                                className="px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 font-medium text-sm sm:text-base text-slate-700 dark:text-slate-200 hover:border-blue-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                            >
                                <option value="24h">Last 24 Hours</option>
                                <option value="7d">Last 7 Days</option>
                                <option value="30d">Last 30 Days</option>
                                <option value="90d">Last 90 Days</option>
                            </select>

                            {/* Manual Refresh */}
                            <button
                                onClick={() => setLastRefresh(new Date())}
                                className="px-3 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm sm:text-base hover:bg-blue-700 transition-all shadow-md hover:shadow-lg"
                            >
                                🔄 Refresh
                            </button>
                        </div>
                    </div>

                    {/* Last Refresh Time */}
                    <div className="mt-3 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                        Last updated: {lastRefresh.toLocaleTimeString()}
                        {autoRefresh && <span className="ml-2 text-green-600 dark:text-green-400">(Auto-refresh: 30s)</span>}
                    </div>
                </div>

                {/* Navigation Tabs - Simplified 3-Tab Design */}
                <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 p-3">
                    <nav
                        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                        aria-label="Dashboard tabs"
                    >
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as TabView)}
                                title={tab.tooltip}
                                className={`
                                    group relative px-4 sm:px-6 py-4 sm:py-5 text-sm sm:text-base font-medium rounded-xl border-2
                                    transition-all duration-200 ease-in-out
                                    ${activeTab === tab.id
                                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-xl scale-[1.02] border-transparent'
                                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-gray-700 hover:border-slate-300 dark:hover:border-gray-600 border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                                    }
                                `}
                            >
                                <div className="flex flex-col items-start text-left">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xl sm:text-2xl">{tab.icon}</span>
                                        <span className="font-bold text-base sm:text-lg">{tab.label}</span>
                                    </div>
                                    <span className={`text-xs sm:text-sm line-clamp-2 ${
                                        activeTab === tab.id ? 'opacity-90' : 'opacity-70'
                                    }`}>
                                        {tab.description}
                                    </span>
                                </div>
                                {activeTab === tab.id && (
                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white rounded-b-xl" />
                                )}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Demo Scenario Manager - Always visible */}
                <div className="mb-6">
                    <DemoScenarioManager />
                </div>

                {/* Content Area - Simplified 3-Tab Layout */}
                <div className="pb-8">
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            {/* System Health & Quick Actions */}
                            <SystemOverviewSection
                                dateRange={dateRange}
                                refreshTrigger={lastRefresh}
                            />

                            {/* Recent Activity & Pending Approvals */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                                        <span>📡</span> Recent Activity
                                    </h3>
                                    <RealTimeActivity refreshTrigger={lastRefresh} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                                        <span>⏰</span> Pending Actions
                                    </h3>

                                    {/* Certificate Expiry Warnings */}
                                    <CertificateExpiryWarnings
                                        certificates={[
                                            {
                                                id: 'hub-tls-cert',
                                                name: 'Hub TLS Certificate',
                                                type: 'hub',
                                                expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days
                                                autoRenewable: true,
                                            },
                                            {
                                                id: 'saml-idp-cert',
                                                name: 'France SAML IdP Certificate',
                                                type: 'idp',
                                                expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days
                                                autoRenewable: false,
                                            },
                                        ]}
                                        onRenew={(certId) => {
                                            router.push(`/admin/certificates?renew=${certId}`);
                                        }}
                                        className="mb-4"
                                    />

                                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 p-6">
                                        <p className="text-slate-600 dark:text-slate-400 text-sm">
                                            Quick access to pending spoke approvals, certificate renewals, and policy reviews.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'federation' && (
                        <div className="space-y-6">
                            {/* Spoke Registry, Policy Sync, OPAL Status & Audit Queue */}
                            <FederationDashboard />
                        </div>
                    )}

                    {activeTab === 'insights' && (
                        <div className="space-y-6">
                            {/* Authorization Analytics */}
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                                    <span>🔐</span> Authorization Analytics
                                </h3>
                                <AuthorizationAnalytics
                                    dateRange={dateRange}
                                    refreshTrigger={lastRefresh}
                                />
                            </div>

                            {/* Security Posture & Performance */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                                        <span>🛡️</span> Security Posture
                                    </h3>
                                    <SecurityPosture
                                        dateRange={dateRange}
                                        refreshTrigger={lastRefresh}
                                    />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                                        <span>⚡</span> Performance Metrics
                                    </h3>
                                    <PerformanceMetrics
                                        dateRange={dateRange}
                                        refreshTrigger={lastRefresh}
                                    />
                                </div>
                            </div>

                            {/* Compliance & Threat Intelligence */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                                        <span>✅</span> Compliance Overview
                                    </h3>
                                    <ComplianceOverview
                                        dateRange={dateRange}
                                        refreshTrigger={lastRefresh}
                                    />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                                        <span>⚠️</span> Threat Intelligence
                                    </h3>
                                    <ThreatIntelligence
                                        dateRange={dateRange}
                                        refreshTrigger={lastRefresh}
                                    />
                                </div>
                            </div>

                            {/* Authorization Heatmap */}
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                                    <span>🗓️</span> Authorization Decision Heatmap
                                </h3>
                                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 p-6">
                                    <AuthorizationHeatmap
                                        data={generateSampleHeatmapData()}
                                        onCellClick={(cell) => {
                                            router.push(`/admin/analytics/advanced?day=${cell.day}&hour=${cell.hour}`);
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Resource Analytics */}
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                                    <span>📁</span> Resource Analytics
                                </h3>
                                <ResourceAnalytics
                                    dateRange={dateRange}
                                    refreshTrigger={lastRefresh}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Quick Actions - responsive grid instead of floating buttons */}
                <div className="mt-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: 'Clearance Mgmt', icon: '🔑', href: '/admin/clearance-management', gradient: 'from-indigo-600 to-purple-600' },
                            { label: 'Certificates', icon: '🔐', href: '/admin/certificates', gradient: 'from-purple-600 to-indigo-600' },
                            { label: 'Audit Logs', icon: '📋', href: '/admin/logs', gradient: 'from-blue-600 to-purple-600' },
                            { label: 'Manage IdPs', icon: '🔧', href: '/admin/idp', gradient: 'from-green-600 to-teal-600' },
                            { label: 'IdP Governance', icon: '🏛️', href: '/admin/analytics', gradient: 'from-orange-600 to-pink-600' },
                        ].map((action) => (
                            <button
                                key={action.href}
                                onClick={() => router.push(action.href)}
                                className={`w-full flex items-center justify-center gap-2 text-center px-3 py-3 sm:py-4 rounded-xl text-sm sm:text-base font-semibold text-white bg-gradient-to-r ${action.gradient} shadow-lg hover:shadow-xl transition-transform hover:scale-[1.02]`}
                            >
                                <span className="text-lg sm:text-xl">{action.icon}</span>
                                <span className="truncate">{action.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </PageLayout>
    );
}
