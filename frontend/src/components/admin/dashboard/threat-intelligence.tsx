/**
 * Threat Intelligence Section
 * 
 * Security violations and threat patterns
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface IViolation {
    timestamp: string;
    subject: string;
    resourceId: string;
    reason: string;
    subjectAttributes?: any;
}

interface Props {
    dateRange: '24h' | '7d' | '30d' | '90d';
    refreshTrigger: Date;
}

export default function ThreatIntelligence({ dateRange, refreshTrigger }: Props) {
    const router = useRouter();
    const { data: session } = useSession();
    const [violations, setViolations] = useState<IViolation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [dateRange, refreshTrigger]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Use server API route (secure!)
            const res = await fetch(`/api/admin/logs/violations?limit=100`);
            
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const data = await res.json();
                if (data.success) setViolations(data.data.violations || []);
            }
        } catch (error) {
            console.error('Failed to fetch violations:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
            </div>
        );
    }

    // Analyze violations
    const violationsByReason = violations.reduce((acc, v) => {
        const reason = v.reason || 'Unknown';
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const violationsByUser = violations.reduce((acc, v) => {
        const user = v.subject || 'Unknown';
        acc[user] = (acc[user] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const violationsByResource = violations.reduce((acc, v) => {
        const resource = v.resourceId || 'Unknown';
        acc[resource] = (acc[resource] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const topReasons = Object.entries(violationsByReason)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    const topOffenders = Object.entries(violationsByUser)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    const topTargets = Object.entries(violationsByResource)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    return (
        <div className="space-y-6">
            {/* Threat Level Indicator */}
            <div className={`rounded-xl shadow-xl p-8 text-white ${
                violations.length === 0 ? 'bg-gradient-to-br from-green-500 to-green-600' :
                violations.length < 10 ? 'bg-gradient-to-br from-yellow-500 to-yellow-600' :
                violations.length < 50 ? 'bg-gradient-to-br from-orange-500 to-orange-600' :
                'bg-gradient-to-br from-red-500 to-red-600'
            }`}>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-white opacity-90 text-lg font-medium mb-2">Threat Level</p>
                        <div className="flex items-center space-x-4">
                            <div className="text-6xl font-bold">{violations.length}</div>
                            <div>
                                <div className="text-3xl mb-1">
                                    {violations.length === 0 ? '✅' :
                                     violations.length < 10 ? '⚠️' :
                                     violations.length < 50 ? '🚨' : '🔥'}
                                </div>
                                <div className="text-xl font-semibold">
                                    {violations.length === 0 ? 'All Clear' :
                                     violations.length < 10 ? 'Low' :
                                     violations.length < 50 ? 'Moderate' : 'High'}
                                </div>
                            </div>
                        </div>
                        <p className="mt-4 text-white opacity-75">Violations in last {dateRange}</p>
                    </div>
                    <div className="text-8xl opacity-20">🛡️</div>
                </div>
            </div>

            {/* Top Violation Reasons */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                <h2 className="text-2xl font-bold text-slate-900 mb-4">🔍 Top Denial Reasons</h2>
                {topReasons.length > 0 ? (
                    <div className="space-y-3">
                        {topReasons.map(([reason, count], idx) => {
                            const percentage = ((count / violations.length) * 100).toFixed(1);
                            return (
                                <div key={idx} className="flex items-center">
                                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-sm mr-3">
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between mb-1">
                                            <span className="text-sm font-medium text-slate-700 truncate">{reason}</span>
                                            <span className="text-sm font-bold text-slate-900 ml-3">{count}</span>
                                        </div>
                                        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                            <div
                                                className="bg-gradient-to-r from-red-500 to-red-600 h-full rounded-full transition-all duration-500"
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-slate-500 text-center py-8">No violations detected</p>
                )}
            </div>

            {/* Top Offenders & Targets */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Offenders */}
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <h3 className="text-xl font-bold text-slate-900 mb-4">👤 Most Denied Users</h3>
                    {topOffenders.length > 0 ? (
                        <div className="space-y-2">
                            {topOffenders.map(([user, count], idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm">
                                            {idx + 1}
                                        </div>
                                        <span className="text-sm font-medium text-slate-700 truncate">{user}</span>
                                    </div>
                                    <span className="px-3 py-1 bg-orange-600 text-white rounded-full text-xs font-bold">
                                        {count}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-slate-500 text-center py-4">No data available</p>
                    )}
                </div>

                {/* Top Targets */}
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <h3 className="text-xl font-bold text-slate-900 mb-4">🎯 Most Targeted Resources</h3>
                    {topTargets.length > 0 ? (
                        <div className="space-y-2">
                            {topTargets.map(([resource, count], idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-sm">
                                            {idx + 1}
                                        </div>
                                        <span className="text-sm font-medium text-slate-700 truncate">{resource}</span>
                                    </div>
                                    <span className="px-3 py-1 bg-purple-600 text-white rounded-full text-xs font-bold">
                                        {count}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-slate-500 text-center py-4">No data available</p>
                    )}
                </div>
            </div>

            {/* Recent Violations */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-slate-900">🚨 Recent Violations</h2>
                    <button
                        onClick={() => router.push('/admin/logs?outcome=DENY')}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-all"
                    >
                        View All
                    </button>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {violations.slice(0, 10).map((violation, idx) => (
                        <div key={idx} className="p-4 bg-red-50 rounded-lg border border-red-200 hover:bg-red-100 transition-colors">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center space-x-2 mb-2">
                                        <span className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded">DENIED</span>
                                        <span className="text-xs text-slate-500">
                                            {new Date(violation.timestamp).toLocaleString()}
                                        </span>
                                    </div>
                                    <p className="text-sm font-medium text-slate-900 mb-1">
                                        User: <span className="font-bold text-red-600">{violation.subject}</span>
                                    </p>
                                    <p className="text-sm text-slate-600 mb-1">
                                        Resource: <span className="font-mono text-xs">{violation.resourceId}</span>
                                    </p>
                                    <p className="text-sm text-red-700 bg-red-100 px-2 py-1 rounded inline-block">
                                        {violation.reason}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
