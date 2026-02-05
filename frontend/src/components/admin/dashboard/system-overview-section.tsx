/**
 * System Overview Section
 *
 * High-level system metrics and KPIs
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { AnimatedCounter, AnimatedPercentage } from '@/components/ui/animated-counter';

interface ISystemStats {
    totalEvents: number;
    eventsByType: Record<string, number>;
    deniedAccess: number;
    successfulAccess: number;
    topDeniedResources: Array<{ resourceId: string; count: number }>;
    topUsers: Array<{ subject: string; count: number }>;
}

interface ISystemHealth {
    status: 'healthy' | 'degraded' | 'critical';
    services: {
        backend: { status: string; latency_ms: number };
        opa: { status: string; latency_ms: number };
        mongodb: { status: string; latency_ms: number };
        keycloak: { status: string; latency_ms: number };
        kas: { status: string; latency_ms: number };
    };
    uptime: number;
}

interface IBlacklistStats {
    totalBlacklistedTokens: number;
    totalRevokedUsers: number;
    instance: string;
    redisUrl: string;
}

interface Props {
    dateRange: '24h' | '7d' | '30d' | '90d';
    refreshTrigger: Date;
}

export default function SystemOverviewSection({ dateRange, refreshTrigger }: Props) {
    const { data: session } = useSession();
    const [stats, setStats] = useState<ISystemStats | null>(null);
    const [health, setHealth] = useState<ISystemHealth | null>(null);
    const [blacklistStats, setBlacklistStats] = useState<IBlacklistStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [dateRange, refreshTrigger]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch stats via server API
            const daysMap = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };
            const statsRes = await fetch(`/api/admin/logs/stats?days=${daysMap[dateRange]}`);

            const contentType = statsRes.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const statsData = await statsRes.json();
                if (statsData.success) setStats(statsData.data);
            }

            // Fetch health (optional endpoint, may not exist) via server API
            try {
                const healthRes = await fetch(`/api/health/detailed`);
                const healthContentType = healthRes.headers.get('content-type');
                if (healthRes.ok && healthContentType && healthContentType.includes('application/json')) {
                    const healthData = await healthRes.json();
                    setHealth(healthData);
                }
            } catch (healthError) {
                console.warn('Health endpoint not available:', healthError);
            }

            // Fetch blacklist stats (optional endpoint)
            try {
                const blacklistRes = await fetch(`/api/blacklist/stats`);
                const blacklistContentType = blacklistRes.headers.get('content-type');
                if (blacklistRes.ok && blacklistContentType && blacklistContentType.includes('application/json')) {
                    const blacklistData = await blacklistRes.json();
                    setBlacklistStats(blacklistData);
                }
            } catch (blacklistError) {
                console.warn('Blacklist stats endpoint not available:', blacklistError);
            }
        } catch (error) {
            console.error('Failed to fetch system data:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    const successRate = stats
        ? ((stats.successfulAccess / (stats.successfulAccess + stats.deniedAccess)) * 100).toFixed(1)
        : '0';

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Total Events */}
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-xl p-6 text-white transform hover:scale-105 transition-all">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-blue-100 text-sm font-medium">Total Events</p>
                            <p className="text-4xl font-bold mt-2">
                                <AnimatedCounter value={stats?.totalEvents || 0} className="text-white" />
                            </p>
                            <p className="text-blue-100 text-xs mt-2">Last {dateRange}</p>
                        </div>
                        <div className="text-5xl opacity-20">📊</div>
                    </div>
                </div>

                {/* Success Rate */}
                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-xl p-6 text-white transform hover:scale-105 transition-all">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-green-100 text-sm font-medium">Success Rate</p>
                            <p className="text-4xl font-bold mt-2">
                                <AnimatedPercentage value={parseFloat(successRate)} className="text-white" />
                            </p>
                            <p className="text-green-100 text-xs mt-2">
                                <AnimatedCounter value={stats?.successfulAccess || 0} className="text-green-100" /> allowed
                            </p>
                        </div>
                        <div className="text-5xl opacity-20">✅</div>
                    </div>
                </div>

                {/* Denied Access */}
                <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-xl p-6 text-white transform hover:scale-105 transition-all">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-red-100 text-sm font-medium">Access Denied</p>
                            <p className="text-4xl font-bold mt-2">
                                <AnimatedCounter value={stats?.deniedAccess || 0} className="text-white" />
                            </p>
                            <p className="text-red-100 text-xs mt-2">Security violations</p>
                        </div>
                        <div className="text-5xl opacity-20">🚫</div>
                    </div>
                </div>

                {/* System Health */}
                <div className={`bg-gradient-to-br ${
                    health?.status === 'healthy' ? 'from-emerald-500 to-emerald-600' :
                    health?.status === 'degraded' ? 'from-yellow-500 to-yellow-600' :
                    'from-red-500 to-red-600'
                } rounded-xl shadow-xl p-6 text-white transform hover:scale-105 transition-all`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-white opacity-90 text-sm font-medium">System Health</p>
                            <p className="text-3xl font-bold mt-2 capitalize">{health?.status || 'Unknown'}</p>
                            <p className="text-white opacity-75 text-xs mt-2">Uptime: {Math.floor((health?.uptime || 0) / 3600)}h</p>
                        </div>
                        <div className="text-5xl opacity-20">💚</div>
                    </div>
                </div>
            </div>

            {/* Blacklist Statistics */}
            {blacklistStats && (
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <h2 className="text-2xl font-bold text-slate-900 mb-4">🔒 Token Blacklist Statistics</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                            <p className="text-sm text-purple-700 font-medium mb-1">Active Blacklisted Tokens</p>
                            <p className="text-2xl font-bold text-purple-900">{blacklistStats.totalBlacklistedTokens.toLocaleString()}</p>
                            <p className="text-xs text-purple-600 mt-1">Currently revoked</p>
                        </div>
                        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
                            <p className="text-sm text-red-700 font-medium mb-1">Revoked Users</p>
                            <p className="text-2xl font-bold text-red-900">{blacklistStats.totalRevokedUsers.toLocaleString()}</p>
                            <p className="text-xs text-red-600 mt-1">Users with revoked tokens</p>
                        </div>
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                            <p className="text-sm text-blue-700 font-medium mb-1">Instance</p>
                            <p className="text-xl font-bold text-blue-900">{blacklistStats.instance}</p>
                            <p className="text-xs text-blue-600 mt-1">Current instance</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Service Health Grid */}
            {health && (
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <h2 className="text-2xl font-bold text-slate-900 mb-4">🔧 Service Health</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {Object.entries(health.services).map(([name, service]) => (
                            <div key={name} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-semibold text-slate-700 capitalize">{name}</span>
                                    <span className={`w-3 h-3 rounded-full ${
                                        service.status === 'healthy' ? 'bg-green-500' :
                                        service.status === 'degraded' ? 'bg-yellow-500' :
                                        'bg-red-500'
                                    }`} />
                                </div>
                                <p className="text-sm text-slate-600">{service.latency_ms}ms</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Event Types Distribution */}
            {stats && stats.eventsByType && Object.keys(stats.eventsByType).length > 0 && (
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <h2 className="text-2xl font-bold text-slate-900 mb-4">📈 Event Distribution</h2>
                    <div className="space-y-3">
                        {Object.entries(stats.eventsByType)
                            .sort(([, a], [, b]) => (b as number) - (a as number))
                            .map(([type, count]) => {
                                const percentage = ((count as number) / stats.totalEvents * 100).toFixed(1);
                                return (
                                    <div key={type} className="flex items-center">
                                        <div className="w-40 text-sm font-medium text-slate-700">{type}</div>
                                        <div className="flex-1 bg-slate-200 rounded-full h-6 relative overflow-hidden">
                                            <div
                                                className="bg-gradient-to-r from-blue-500 to-purple-500 h-full rounded-full flex items-center justify-end px-2 transition-all duration-500"
                                                style={{ width: `${percentage}%` }}
                                            >
                                                <span className="text-xs font-bold text-white">{percentage}%</span>
                                            </div>
                                        </div>
                                        <div className="w-20 text-right text-sm font-semibold text-slate-900 ml-3">
                                            {(count as number).toLocaleString()}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}

            {/* Top Denied Resources */}
            {stats && stats.topDeniedResources && stats.topDeniedResources.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                        <h2 className="text-2xl font-bold text-slate-900 mb-4">🔒 Top Denied Resources</h2>
                        <div className="space-y-2">
                            {stats.topDeniedResources.slice(0, 5).map((resource, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                                    <span className="text-sm font-medium text-slate-700 truncate">{resource.resourceId}</span>
                                    <span className="ml-3 px-3 py-1 bg-red-600 text-white rounded-full text-xs font-bold">
                                        {resource.count}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Top Users */}
                    {stats.topUsers && stats.topUsers.length > 0 && (
                        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                            <h2 className="text-2xl font-bold text-slate-900 mb-4">👥 Top Active Users</h2>
                            <div className="space-y-2">
                                {stats.topUsers.slice(0, 5).map((user, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                                        <span className="text-sm font-medium text-slate-700 truncate">{user.subject}</span>
                                        <span className="ml-3 px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-bold">
                                            {user.count}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
