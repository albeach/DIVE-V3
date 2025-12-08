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
import PageLayout from '@/components/layout/page-layout';

// Import all analytics components
import SystemOverviewSection from '@/components/admin/dashboard/system-overview-section';
import AuthorizationAnalytics from '@/components/admin/dashboard/authorization-analytics';
import SecurityPosture from '@/components/admin/dashboard/security-posture';
import ThreatIntelligence from '@/components/admin/dashboard/threat-intelligence';
import PerformanceMetrics from '@/components/admin/dashboard/performance-metrics';
import ComplianceOverview from '@/components/admin/dashboard/compliance-overview';
import RealTimeActivity from '@/components/admin/dashboard/realtime-activity';
import ResourceAnalytics from '@/components/admin/dashboard/resource-analytics';
import DemoScenarioManager from '@/components/admin/demo-scenario-manager';
import FederationDashboard from '@/components/admin/federation-dashboard';

type TabView = 'overview' | 'federation' | 'authz' | 'security' | 'threats' | 'performance' | 'compliance' | 'realtime' | 'resources';

export default function AdminDashboard() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [activeTab, setActiveTab] = useState<TabView>('overview');
    const [dateRange, setDateRange] = useState<'24h' | '7d' | '30d' | '90d'>('7d');
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

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
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
                    <p className="mt-4 text-lg text-gray-600">Loading Dashboard...</p>
                </div>
            </div>
        );
    }

    if (status === 'unauthenticated') {
        return null;
    }

    const tabs = [
        { id: 'overview', label: '📊 Overview', icon: '📊', description: 'System-wide metrics' },
        { id: 'federation', label: '🌍 Federation', icon: '🌍', description: 'Multi-instance status' },
        { id: 'authz', label: '🔐 Authorization', icon: '🔐', description: 'Access decisions & patterns' },
        { id: 'security', label: '🛡️ Security', icon: '🛡️', description: 'Security posture' },
        { id: 'threats', label: '⚠️ Threats', icon: '⚠️', description: 'Threat intelligence' },
        { id: 'performance', label: '⚡ Performance', icon: '⚡', description: 'System performance' },
        { id: 'compliance', label: '✅ Compliance', icon: '✅', description: 'Standards & SLA' },
        { id: 'realtime', label: '📡 Live Feed', icon: '📡', description: 'Real-time activity' },
        { id: 'resources', label: '📁 Resources', icon: '📁', description: 'Resource analytics' }
    ];

    return (
        <PageLayout 
            user={session?.user || {}}
            breadcrumbs={[
                { label: 'Admin', href: '/admin/dashboard' },
                { label: 'Dashboard', href: null }
            ]}
        >
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
                {/* Enhanced Header */}
                <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-4 sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-2">
                            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                🔐 DIVE V3 Command Center
                            </h1>
                            <p className="text-slate-600 text-sm sm:text-base lg:text-lg">
                                Advanced Analytics & Security Intelligence Platform
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3 items-center lg:justify-end">
                            {/* Auto-Refresh Toggle */}
                            <button
                                onClick={() => setAutoRefresh(!autoRefresh)}
                                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm sm:text-base font-medium transition-all ${
                                    autoRefresh
                                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                <span className={autoRefresh ? 'animate-pulse' : ''}>●</span>
                                <span>{autoRefresh ? 'Live' : 'Paused'}</span>
                            </button>

                            {/* Date Range Selector */}
                            <select
                                value={dateRange}
                                onChange={(e) => setDateRange(e.target.value as any)}
                                className="px-3 py-2 border border-slate-300 rounded-lg bg-white font-medium text-sm sm:text-base text-slate-700 hover:border-blue-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
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
                    <div className="mt-3 text-xs sm:text-sm text-slate-500">
                        Last updated: {lastRefresh.toLocaleTimeString()} 
                        {autoRefresh && <span className="ml-2 text-green-600">(Auto-refresh: 30s)</span>}
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-3">
                    <nav
                        className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-nowrap lg:space-x-2 gap-2"
                        aria-label="Tabs"
                    >
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as TabView)}
                                className={`
                                    group relative px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium rounded-xl border
                                    transition-all duration-200 ease-in-out w-full lg:w-44
                                    ${activeTab === tab.id
                                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md scale-[1.01] border-transparent'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-slate-200'
                                    }
                                `}
                            >
                                <div className="flex flex-col items-center text-center">
                                    <span className="text-lg sm:text-xl mb-0.5">{tab.icon}</span>
                                    <span className="font-semibold leading-tight">{tab.label.replace(/[^\w\s]/g, '')}</span>
                                    <span className="text-[11px] sm:text-xs opacity-75 mt-0.5 line-clamp-1">{tab.description}</span>
                                </div>
                                {activeTab === tab.id && (
                                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1/2 h-1 bg-white rounded-t-full" />
                                )}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Demo Scenario Manager - Always visible */}
                <div className="mb-6">
                    <DemoScenarioManager />
                </div>

                {/* Content Area */}
                <div className="pb-8">
                    {activeTab === 'overview' && (
                        <>
                            <SystemOverviewSection 
                                dateRange={dateRange} 
                                refreshTrigger={lastRefresh}
                            />
                        </>
                    )}
                    {activeTab === 'federation' && (
                        <FederationDashboard />
                    )}
                    {activeTab === 'authz' && (
                        <AuthorizationAnalytics 
                            dateRange={dateRange} 
                            refreshTrigger={lastRefresh}
                        />
                    )}
                    {activeTab === 'security' && (
                        <SecurityPosture 
                            dateRange={dateRange} 
                            refreshTrigger={lastRefresh}
                        />
                    )}
                    {activeTab === 'threats' && (
                        <ThreatIntelligence 
                            dateRange={dateRange} 
                            refreshTrigger={lastRefresh}
                        />
                    )}
                    {activeTab === 'performance' && (
                        <PerformanceMetrics 
                            dateRange={dateRange} 
                            refreshTrigger={lastRefresh}
                        />
                    )}
                    {activeTab === 'compliance' && (
                        <ComplianceOverview 
                            dateRange={dateRange} 
                            refreshTrigger={lastRefresh}
                        />
                    )}
                    {activeTab === 'realtime' && (
                        <RealTimeActivity 
                            refreshTrigger={lastRefresh}
                        />
                    )}
                    {activeTab === 'resources' && (
                        <ResourceAnalytics 
                            dateRange={dateRange} 
                            refreshTrigger={lastRefresh}
                        />
                    )}
                </div>

                {/* Quick Actions - responsive grid instead of floating buttons */}
                <div className="mt-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
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
