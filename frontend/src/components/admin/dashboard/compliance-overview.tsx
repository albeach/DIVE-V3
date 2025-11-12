/**
 * Compliance Overview Section
 * 
 * Compliance trends and SLA metrics
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface ISLAMetrics {
    fastTrackCompliance: number;
    standardCompliance: number;
    averageReviewTime: number;
    exceededCount: number;
}

interface IComplianceTrends {
    dates: string[];
    acp240: number[];
    stanag4774: number[];
    nist80063: number[];
}

interface Props {
    dateRange: '24h' | '7d' | '30d' | '90d';
    refreshTrigger: Date;
}

export default function ComplianceOverview({ dateRange, refreshTrigger }: Props) {
    const { data: session } = useSession();
    const [sla, setSla] = useState<ISLAMetrics | null>(null);
    const [trends, setTrends] = useState<IComplianceTrends | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [dateRange, refreshTrigger]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Use server API routes (secure!)
            const [slaRes, trendsRes] = await Promise.all([
                fetch(`/api/admin/analytics/sla-metrics`),
                fetch(`/api/admin/analytics/compliance-trends`)
            ]);

            const slaContentType = slaRes.headers.get('content-type');
            if (slaRes.ok && slaContentType && slaContentType.includes('application/json')) {
                const slaData = await slaRes.json();
                setSla(slaData);
            }

            const trendsContentType = trendsRes.headers.get('content-type');
            if (trendsRes.ok && trendsContentType && trendsContentType.includes('application/json')) {
                const trendsData = await trendsRes.json();
                setTrends(trendsData);
            }
        } catch (error) {
            console.error('Failed to fetch compliance data:', error);
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

    return (
        <div className="space-y-6">
            {/* SLA Compliance */}
            {sla && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-slate-500 text-sm font-medium">Fast-Track SLA</p>
                                    <p className={`text-3xl font-bold mt-2 ${sla.fastTrackCompliance >= 95 ? 'text-green-600' : 'text-yellow-600'}`}>
                                        {sla.fastTrackCompliance.toFixed(1)}%
                                    </p>
                                    <p className="text-xs text-slate-500 mt-1">&lt; 2 hours</p>
                                </div>
                                <div className="text-4xl">⚡</div>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-slate-500 text-sm font-medium">Standard SLA</p>
                                    <p className={`text-3xl font-bold mt-2 ${sla.standardCompliance >= 90 ? 'text-green-600' : 'text-yellow-600'}`}>
                                        {sla.standardCompliance.toFixed(1)}%
                                    </p>
                                    <p className="text-xs text-slate-500 mt-1">&lt; 24 hours</p>
                                </div>
                                <div className="text-4xl">⏱️</div>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-slate-500 text-sm font-medium">Avg Review Time</p>
                                    <p className="text-3xl font-bold text-blue-600 mt-2">
                                        {sla.averageReviewTime.toFixed(1)}h
                                    </p>
                                    <p className="text-xs text-slate-500 mt-1">Average</p>
                                </div>
                                <div className="text-4xl">⏰</div>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-slate-500 text-sm font-medium">SLA Violations</p>
                                    <p className={`text-3xl font-bold mt-2 ${sla.exceededCount === 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {sla.exceededCount}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-1">Last {dateRange}</p>
                                </div>
                                <div className="text-4xl">{sla.exceededCount === 0 ? '✅' : '⚠️'}</div>
                            </div>
                        </div>
                    </div>

                    {/* SLA Progress Bars */}
                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                        <h2 className="text-2xl font-bold text-slate-900 mb-6">📊 SLA Performance</h2>
                        <div className="space-y-6">
                            <div>
                                <div className="flex justify-between mb-2">
                                    <span className="text-sm font-semibold text-slate-700">Fast-Track Compliance (2hr SLA)</span>
                                    <span className={`text-sm font-bold ${sla.fastTrackCompliance >= 95 ? 'text-green-600' : 'text-yellow-600'}`}>
                                        {sla.fastTrackCompliance.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-6 overflow-hidden relative">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            sla.fastTrackCompliance >= 95 
                                                ? 'bg-gradient-to-r from-green-400 to-green-600' 
                                                : 'bg-gradient-to-r from-yellow-400 to-yellow-600'
                                        }`}
                                        style={{ width: `${sla.fastTrackCompliance}%` }}
                                    />
                                    <div className="absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center">
                                        <span className="text-xs font-bold text-slate-700">Target: 95%</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between mb-2">
                                    <span className="text-sm font-semibold text-slate-700">Standard Compliance (24hr SLA)</span>
                                    <span className={`text-sm font-bold ${sla.standardCompliance >= 90 ? 'text-green-600' : 'text-yellow-600'}`}>
                                        {sla.standardCompliance.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-6 overflow-hidden relative">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            sla.standardCompliance >= 90 
                                                ? 'bg-gradient-to-r from-blue-400 to-blue-600' 
                                                : 'bg-gradient-to-r from-yellow-400 to-yellow-600'
                                        }`}
                                        style={{ width: `${sla.standardCompliance}%` }}
                                    />
                                    <div className="absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center">
                                        <span className="text-xs font-bold text-slate-700">Target: 90%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Compliance Trends */}
            {trends && trends.dates.length > 0 && (
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <h2 className="text-2xl font-bold text-slate-900 mb-6">📈 Compliance Standards</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-blue-900">ACP-240</h3>
                                <span className="text-3xl">🔒</span>
                            </div>
                            <p className="text-4xl font-bold text-blue-600 mb-2">
                                {trends.acp240[trends.acp240.length - 1]}%
                            </p>
                            <p className="text-sm text-blue-700">NATO Access Control</p>
                        </div>

                        <div className="bg-green-50 rounded-lg p-6 border border-green-200">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-green-900">STANAG 4774</h3>
                                <span className="text-3xl">🛡️</span>
                            </div>
                            <p className="text-4xl font-bold text-green-600 mb-2">
                                {trends.stanag4774[trends.stanag4774.length - 1]}%
                            </p>
                            <p className="text-sm text-green-700">NATO Security Labeling</p>
                        </div>

                        <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-purple-900">NIST 800-63</h3>
                                <span className="text-3xl">🔐</span>
                            </div>
                            <p className="text-4xl font-bold text-purple-600 mb-2">
                                {trends.nist80063[trends.nist80063.length - 1]}%
                            </p>
                            <p className="text-sm text-purple-700">Digital Identity Guidelines</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Compliance Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
                    <h3 className="text-lg font-bold text-green-900 mb-3">✅ Compliance Strengths</h3>
                    <ul className="space-y-2 text-sm text-green-800">
                        {sla && sla.fastTrackCompliance >= 95 && (
                            <li className="flex items-start">
                                <span className="mr-2">•</span>
                                <span>Fast-track SLA exceeds 95% target</span>
                            </li>
                        )}
                        {sla && sla.standardCompliance >= 90 && (
                            <li className="flex items-start">
                                <span className="mr-2">•</span>
                                <span>Standard SLA exceeds 90% target</span>
                            </li>
                        )}
                        {sla && sla.exceededCount === 0 && (
                            <li className="flex items-start">
                                <span className="mr-2">•</span>
                                <span>Zero SLA violations in reporting period</span>
                            </li>
                        )}
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>All IdPs undergo security validation</span>
                        </li>
                    </ul>
                </div>

                <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200">
                    <h3 className="text-lg font-bold text-orange-900 mb-3">⚠️ Areas for Improvement</h3>
                    <ul className="space-y-2 text-sm text-orange-800">
                        {sla && sla.fastTrackCompliance < 95 && (
                            <li className="flex items-start">
                                <span className="mr-2">•</span>
                                <span>Fast-track SLA below 95% - expedite reviews</span>
                            </li>
                        )}
                        {sla && sla.standardCompliance < 90 && (
                            <li className="flex items-start">
                                <span className="mr-2">•</span>
                                <span>Standard SLA below 90% - allocate more resources</span>
                            </li>
                        )}
                        {sla && sla.exceededCount > 0 && (
                            <li className="flex items-start">
                                <span className="mr-2">•</span>
                                <span>{sla.exceededCount} SLA violation(s) - review bottlenecks</span>
                            </li>
                        )}
                        {sla && sla.averageReviewTime > 12 && (
                            <li className="flex items-start">
                                <span className="mr-2">•</span>
                                <span>Average review time exceeds 12 hours - optimize workflow</span>
                            </li>
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );
}

