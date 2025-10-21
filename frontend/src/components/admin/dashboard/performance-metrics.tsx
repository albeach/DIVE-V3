/**
 * Performance Metrics Section
 * 
 * System performance and latency analytics
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface IMetricsSummary {
    requests: { total: number; perSecond: number };
    authz: { total: number; avgLatency: number; p95: number };
    opa: { avgLatency: number; cacheHitRate: number };
}

interface Props {
    dateRange: '24h' | '7d' | '30d' | '90d';
    refreshTrigger: Date;
}

export default function PerformanceMetrics({ dateRange, refreshTrigger }: Props) {
    const { data: session } = useSession();
    const [metrics, setMetrics] = useState<IMetricsSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [dateRange, refreshTrigger]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const token = (session as any)?.accessToken;
            if (!token) return;

            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/metrics/summary`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const data = await res.json();
                if (data.success) setMetrics(data.data);
            }
        } catch (error) {
            console.error('Failed to fetch performance metrics:', error);
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

    const getLatencyColor = (latency: number) => {
        if (latency < 50) return 'green';
        if (latency < 100) return 'blue';
        if (latency < 200) return 'yellow';
        return 'red';
    };

    if (!metrics || !metrics.authz || !metrics.opa) {
        return (
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
                <div className="text-6xl mb-4">📊</div>
                <p className="text-xl font-semibold text-slate-900 mb-2">No Performance Data Available</p>
                <p className="text-slate-500">Performance metrics will appear here once the system has collected data.</p>
            </div>
        );
    }

    const authzColor = getLatencyColor(metrics.authz?.avgLatency || 0);
    const opaColor = getLatencyColor(metrics.opa?.avgLatency || 0);

    return (
        <div className="space-y-6">
            {/* Key Performance Indicators */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-slate-500 text-sm font-medium">Total Requests</p>
                            <p className="text-3xl font-bold text-slate-900 mt-2">
                                {metrics.requests?.total?.toLocaleString() || '0'}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">Last {dateRange}</p>
                        </div>
                        <div className="text-4xl">📊</div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-slate-500 text-sm font-medium">Requests/sec</p>
                            <p className="text-3xl font-bold text-blue-600 mt-2">
                                {metrics.requests?.perSecond?.toFixed(2) || '0.00'}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">Average throughput</p>
                        </div>
                        <div className="text-4xl">⚡</div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-slate-500 text-sm font-medium">Authz Latency</p>
                            <p className={`text-3xl font-bold text-${authzColor}-600 mt-2`}>
                                {metrics.authz?.avgLatency || 0}ms
                            </p>
                            <p className="text-xs text-slate-500 mt-1">Average</p>
                        </div>
                        <div className="text-4xl">🔐</div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-slate-500 text-sm font-medium">OPA Latency</p>
                            <p className={`text-3xl font-bold text-${opaColor}-600 mt-2`}>
                                {metrics.opa?.avgLatency || 0}ms
                            </p>
                            <p className="text-xs text-slate-500 mt-1">Average</p>
                        </div>
                        <div className="text-4xl">⚖️</div>
                    </div>
                </div>
            </div>

            {/* Latency Analysis */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                <h2 className="text-2xl font-bold text-slate-900 mb-6">📉 Latency Analysis</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-700 mb-4">Authorization Latency</h3>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between mb-2">
                                    <span className="text-sm text-slate-600">Average</span>
                                    <span className={`text-sm font-bold text-${authzColor}-600`}>
                                        {metrics.authz?.avgLatency || 0}ms
                                    </span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                                    <div
                                        className={`bg-gradient-to-r from-${authzColor}-400 to-${authzColor}-600 h-full rounded-full transition-all duration-500`}
                                        style={{ width: `${Math.min(((metrics.authz?.avgLatency || 0) / 200) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between mb-2">
                                    <span className="text-sm text-slate-600">P95</span>
                                    <span className="text-sm font-bold text-slate-900">{metrics.authz?.p95 || 0}ms</span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                                    <div
                                        className="bg-gradient-to-r from-purple-400 to-purple-600 h-full rounded-full transition-all duration-500"
                                        style={{ width: `${Math.min(((metrics.authz?.p95 || 0) / 200) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold text-slate-700 mb-4">OPA Performance</h3>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between mb-2">
                                    <span className="text-sm text-slate-600">Average Latency</span>
                                    <span className={`text-sm font-bold text-${opaColor}-600`}>
                                        {metrics.opa?.avgLatency || 0}ms
                                    </span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                                    <div
                                        className={`bg-gradient-to-r from-${opaColor}-400 to-${opaColor}-600 h-full rounded-full transition-all duration-500`}
                                        style={{ width: `${Math.min(((metrics.opa?.avgLatency || 0) / 100) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between mb-2">
                                    <span className="text-sm text-slate-600">Cache Hit Rate</span>
                                    <span className="text-sm font-bold text-green-600">{metrics.opa?.cacheHitRate || 0}%</span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                                    <div
                                        className="bg-gradient-to-r from-green-400 to-green-600 h-full rounded-full transition-all duration-500"
                                        style={{ width: `${metrics.opa?.cacheHitRate || 0}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Performance Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className={`bg-gradient-to-br from-${authzColor}-50 to-${authzColor}-100 rounded-xl p-6 border border-${authzColor}-200`}>
                    <h3 className={`text-lg font-bold text-${authzColor}-900 mb-3`}>Authz Performance</h3>
                    <p className={`text-sm text-${authzColor}-700`}>
                        {(metrics.authz?.avgLatency || 0) < 50 
                            ? '✅ Excellent - Under 50ms target'
                            : (metrics.authz?.avgLatency || 0) < 100
                            ? '✅ Good - Under 100ms target'
                            : (metrics.authz?.avgLatency || 0) < 200
                            ? '⚠️ Fair - Under 200ms SLA'
                            : '🚨 Poor - Exceeds 200ms SLA'}
                    </p>
                </div>

                <div className={`bg-gradient-to-br from-${opaColor}-50 to-${opaColor}-100 rounded-xl p-6 border border-${opaColor}-200`}>
                    <h3 className={`text-lg font-bold text-${opaColor}-900 mb-3`}>OPA Performance</h3>
                    <p className={`text-sm text-${opaColor}-700`}>
                        {(metrics.opa?.avgLatency || 0) < 30 
                            ? '✅ Excellent - Optimal OPA response time'
                            : (metrics.opa?.avgLatency || 0) < 50
                            ? '✅ Good - Acceptable OPA latency'
                            : '⚠️ Consider optimizing Rego policies'}
                    </p>
                </div>

                <div className={`bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200`}>
                    <h3 className="text-lg font-bold text-green-900 mb-3">Cache Efficiency</h3>
                    <p className="text-sm text-green-700">
                        {(metrics.opa?.cacheHitRate || 0) >= 80 
                            ? '✅ Excellent - High cache hit rate'
                            : (metrics.opa?.cacheHitRate || 0) >= 60
                            ? '✅ Good - Acceptable cache performance'
                            : '⚠️ Consider increasing cache TTL'}
                    </p>
                </div>
            </div>

            {/* Performance Recommendations */}
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                <h2 className="text-2xl font-bold text-slate-900 mb-4">💡 Performance Recommendations</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(metrics.authz?.avgLatency || 0) > 100 && (
                        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-sm font-semibold text-yellow-900 mb-1">⚠️ High Authorization Latency</p>
                            <p className="text-xs text-yellow-700">
                                Review OPA policy complexity and consider optimizing rules
                            </p>
                        </div>
                    )}
                    {(metrics.opa?.cacheHitRate || 0) < 70 && (
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-sm font-semibold text-blue-900 mb-1">💾 Low Cache Hit Rate</p>
                            <p className="text-xs text-blue-700">
                                Increase cache TTL to 60s for better performance
                            </p>
                        </div>
                    )}
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm font-semibold text-green-900 mb-1">✅ Monitor Continuously</p>
                        <p className="text-xs text-green-700">
                            Set up alerts for latency thresholds (p95 &gt; 200ms)
                        </p>
                    </div>
                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                        <p className="text-sm font-semibold text-purple-900 mb-1">📊 Analyze Trends</p>
                        <p className="text-xs text-purple-700">
                            Review performance over time to identify patterns
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

