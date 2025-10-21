/**
 * Authorization Analytics Section
 * 
 * Deep dive into authorization decisions and patterns
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface IAuthzMetrics {
    totalDecisions: number;
    allowRate: number;
    denyRate: number;
    averageLatency: number;
    cacheHitRate: number;
}

interface Props {
    dateRange: '24h' | '7d' | '30d' | '90d';
    refreshTrigger: Date;
}

export default function AuthorizationAnalytics({ dateRange, refreshTrigger }: Props) {
    const { data: session } = useSession();
    const [metrics, setMetrics] = useState<IAuthzMetrics | null>(null);
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
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/analytics/authz-metrics`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            
            const contentType = res.headers.get('content-type');
            if (res.ok && contentType && contentType.includes('application/json')) {
                const data = await res.json();
                setMetrics(data);
            }
        } catch (error) {
            console.error('Failed to fetch authz metrics:', error);
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

    if (!metrics) {
        return (
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
                <p className="text-slate-500">No authorization data available</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-slate-500 text-sm font-medium">Total Decisions</p>
                            <p className="text-3xl font-bold text-slate-900 mt-2">{metrics.totalDecisions.toLocaleString()}</p>
                        </div>
                        <div className="text-4xl">🎯</div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-slate-500 text-sm font-medium">Allow Rate</p>
                            <p className="text-3xl font-bold text-green-600 mt-2">{metrics.allowRate.toFixed(1)}%</p>
                        </div>
                        <div className="text-4xl">✅</div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-slate-500 text-sm font-medium">Deny Rate</p>
                            <p className="text-3xl font-bold text-red-600 mt-2">{metrics.denyRate.toFixed(1)}%</p>
                        </div>
                        <div className="text-4xl">🚫</div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-slate-500 text-sm font-medium">Avg Latency</p>
                            <p className="text-3xl font-bold text-blue-600 mt-2">{metrics.averageLatency}ms</p>
                        </div>
                        <div className="text-4xl">⚡</div>
                    </div>
                </div>
            </div>

            {/* Decision Flow Visualization */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                <h2 className="text-2xl font-bold text-slate-900 mb-6">🔐 Authorization Flow</h2>
                <div className="flex items-center justify-around">
                    <div className="text-center">
                        <div className="w-32 h-32 rounded-full bg-blue-100 flex items-center justify-center mb-3">
                            <span className="text-4xl font-bold text-blue-600">{metrics.totalDecisions}</span>
                        </div>
                        <p className="font-semibold text-slate-700">Requests</p>
                    </div>

                    <div className="text-4xl text-slate-300">→</div>

                    <div className="text-center">
                        <div className="w-32 h-32 rounded-full bg-green-100 flex items-center justify-center mb-3">
                            <span className="text-4xl font-bold text-green-600">
                                {Math.round(metrics.totalDecisions * (metrics.allowRate / 100))}
                            </span>
                        </div>
                        <p className="font-semibold text-slate-700">Allowed</p>
                        <p className="text-sm text-slate-500">{metrics.allowRate.toFixed(1)}%</p>
                    </div>

                    <div className="text-4xl text-slate-300">+</div>

                    <div className="text-center">
                        <div className="w-32 h-32 rounded-full bg-red-100 flex items-center justify-center mb-3">
                            <span className="text-4xl font-bold text-red-600">
                                {Math.round(metrics.totalDecisions * (metrics.denyRate / 100))}
                            </span>
                        </div>
                        <p className="font-semibold text-slate-700">Denied</p>
                        <p className="text-sm text-slate-500">{metrics.denyRate.toFixed(1)}%</p>
                    </div>
                </div>
            </div>

            {/* Cache Performance */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                <h2 className="text-2xl font-bold text-slate-900 mb-4">💾 Cache Performance</h2>
                <div className="flex items-center space-x-6">
                    <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-slate-700">Cache Hit Rate</span>
                            <span className="text-sm font-bold text-slate-900">{metrics.cacheHitRate.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden">
                            <div
                                className="bg-gradient-to-r from-green-500 to-emerald-500 h-full rounded-full transition-all duration-500"
                                style={{ width: `${metrics.cacheHitRate}%` }}
                            />
                        </div>
                    </div>
                    <div className="text-5xl">
                        {metrics.cacheHitRate >= 80 ? '🚀' : metrics.cacheHitRate >= 60 ? '✅' : '⚠️'}
                    </div>
                </div>
                <p className="mt-4 text-sm text-slate-600">
                    {metrics.cacheHitRate >= 80 
                        ? '✨ Excellent cache performance! Most decisions are served from cache.'
                        : metrics.cacheHitRate >= 60
                        ? '👍 Good cache performance. Consider increasing cache TTL for better results.'
                        : '⚠️ Low cache hit rate. Review cache configuration and TTL settings.'}
                </p>
            </div>

            {/* Performance Insights */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
                    <h3 className="text-lg font-bold text-blue-900 mb-3">⚡ Performance Insights</h3>
                    <ul className="space-y-2 text-sm text-blue-800">
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>Average latency: <strong>{metrics.averageLatency}ms</strong> {metrics.averageLatency < 50 ? '(Excellent)' : metrics.averageLatency < 100 ? '(Good)' : '(Needs improvement)'}</span>
                        </li>
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>Cache efficiency: <strong>{metrics.cacheHitRate.toFixed(1)}%</strong> hit rate</span>
                        </li>
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>Throughput: <strong>{(metrics.totalDecisions / 7).toFixed(0)}</strong> decisions/day average</span>
                        </li>
                    </ul>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
                    <h3 className="text-lg font-bold text-purple-900 mb-3">💡 Recommendations</h3>
                    <ul className="space-y-2 text-sm text-purple-800">
                        {metrics.cacheHitRate < 70 && (
                            <li className="flex items-start">
                                <span className="mr-2">•</span>
                                <span>Increase cache TTL to improve hit rate</span>
                            </li>
                        )}
                        {metrics.averageLatency > 100 && (
                            <li className="flex items-start">
                                <span className="mr-2">•</span>
                                <span>Optimize OPA policy rules for better performance</span>
                            </li>
                        )}
                        {metrics.denyRate > 50 && (
                            <li className="flex items-start">
                                <span className="mr-2">•</span>
                                <span>High denial rate - review policy rules and user permissions</span>
                            </li>
                        )}
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>Monitor trends over time to identify anomalies</span>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}

