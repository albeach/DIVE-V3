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

type TabView = 'overview' | 'authz' | 'security' | 'threats' | 'performance' | 'compliance' | 'realtime' | 'resources';

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
                <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                🔐 DIVE V3 Command Center
                            </h1>
                            <p className="mt-2 text-slate-600 text-lg">
                                Advanced Analytics & Security Intelligence Platform
                            </p>
                        </div>

                        <div className="flex items-center space-x-4">
                            {/* Auto-Refresh Toggle */}
                            <button
                                onClick={() => setAutoRefresh(!autoRefresh)}
                                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${
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
                                className="px-4 py-2 border border-slate-300 rounded-lg bg-white font-medium text-slate-700 hover:border-blue-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                            >
                                <option value="24h">Last 24 Hours</option>
                                <option value="7d">Last 7 Days</option>
                                <option value="30d">Last 30 Days</option>
                                <option value="90d">Last 90 Days</option>
                            </select>

                            {/* Manual Refresh */}
                            <button
                                onClick={() => setLastRefresh(new Date())}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all shadow-md hover:shadow-lg"
                            >
                                🔄 Refresh
                            </button>
                        </div>
                    </div>

                    {/* Last Refresh Time */}
                    <div className="mt-4 text-sm text-slate-500">
                        Last updated: {lastRefresh.toLocaleTimeString()} 
                        {autoRefresh && <span className="ml-2 text-green-600">(Auto-refresh: 30s)</span>}
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-2">
                    <nav className="flex space-x-1" aria-label="Tabs">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as TabView)}
                                className={`
                                    flex-1 group relative px-4 py-3 text-sm font-medium rounded-lg
                                    transition-all duration-200 ease-in-out
                                    ${activeTab === tab.id
                                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg scale-105'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                    }
                                `}
                            >
                                <div className="flex flex-col items-center">
                                    <span className="text-xl mb-1">{tab.icon}</span>
                                    <span className="font-semibold">{tab.label.replace(/[^\w\s]/g, '')}</span>
                                    <span className="text-xs opacity-75 mt-1">{tab.description}</span>
                                </div>
                                {activeTab === tab.id && (
                                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1/2 h-1 bg-white rounded-t-full" />
                                )}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Content Area */}
                <div className="pb-8">
                    {activeTab === 'overview' && (
                        <SystemOverviewSection 
                            dateRange={dateRange} 
                            refreshTrigger={lastRefresh}
                        />
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

                {/* Quick Action Floating Button */}
                <div className="fixed bottom-8 right-8 flex flex-col space-y-3">
                    <button
                        onClick={() => router.push('/admin/certificates')}
                        className="group flex items-center space-x-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-4 rounded-full shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-200"
                    >
                        <span className="text-xl">🔐</span>
                        <span className="font-semibold">Certificates</span>
                    </button>
                    
                    <button
                        onClick={() => router.push('/admin/logs')}
                        className="group flex items-center space-x-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 rounded-full shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-200"
                    >
                        <span className="text-xl">📋</span>
                        <span className="font-semibold">Audit Logs</span>
                    </button>
                    
                    <button
                        onClick={() => router.push('/admin/idp')}
                        className="group flex items-center space-x-3 bg-gradient-to-r from-green-600 to-teal-600 text-white px-6 py-4 rounded-full shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-200"
                    >
                        <span className="text-xl">🔧</span>
                        <span className="font-semibold">Manage IdPs</span>
                    </button>

                    <button
                        onClick={() => router.push('/admin/analytics')}
                        className="group flex items-center space-x-3 bg-gradient-to-r from-orange-600 to-pink-600 text-white px-6 py-4 rounded-full shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-200"
                    >
                        <span className="text-xl">🏛️</span>
                        <span className="font-semibold">IdP Governance</span>
                    </button>
                </div>
            </div>
        </PageLayout>
    );
}
