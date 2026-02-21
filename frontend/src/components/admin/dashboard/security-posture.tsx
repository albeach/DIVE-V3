/**
 * Security Posture Section
 * 
 * Security metrics and compliance overview
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface ISecurityPosture {
    averageRiskScore: number;
    complianceRate: number;
    mfaAdoptionRate: number;
    tls13AdoptionRate: number;
}

interface IRiskDistribution {
    gold: number;
    silver: number;
    bronze: number;
    fail: number;
}

interface Props {
    dateRange: '24h' | '7d' | '30d' | '90d';
    refreshTrigger: Date;
}

export default function SecurityPosture({ dateRange, refreshTrigger }: Props) {
    const { data: session } = useSession();
    const [posture, setPosture] = useState<ISecurityPosture | null>(null);
    const [riskDist, setRiskDist] = useState<IRiskDistribution | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [dateRange, refreshTrigger]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Use server API routes (secure!)
            const [postureRes, riskRes] = await Promise.all([
                fetch(`/api/admin/analytics/security-posture`),
                fetch(`/api/admin/analytics/risk-distribution`)
            ]);

            const postureContentType = postureRes.headers.get('content-type');
            if (postureRes.ok && postureContentType && postureContentType.includes('application/json')) {
                const postureData = await postureRes.json();
                setPosture(postureData);
            }

            const riskContentType = riskRes.headers.get('content-type');
            if (riskRes.ok && riskContentType && riskContentType.includes('application/json')) {
                const riskData = await riskRes.json();
                setRiskDist(riskData);
            }
        } catch (error) {
            console.error('Failed to fetch security posture:', error);
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

    const getSecurityLevel = (score: number) => {
        if (score >= 85) return { label: 'Excellent', color: 'green', emoji: '🛡️' };
        if (score >= 70) return { label: 'Good', color: 'blue', emoji: '✅' };
        if (score >= 50) return { label: 'Fair', color: 'yellow', emoji: '⚠️' };
        return { label: 'Poor', color: 'red', emoji: '🚨' };
    };

    const securityLevel = posture ? getSecurityLevel(posture.averageRiskScore) : getSecurityLevel(0);

    return (
        <div className="space-y-6">
            {/* Overall Security Score */}
            <div className={`bg-gradient-to-br from-${securityLevel.color}-500 to-${securityLevel.color}-600 rounded-xl shadow-xl p-8 text-white`}>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-white opacity-90 text-lg font-medium mb-2">Overall Security Posture</p>
                        <div className="flex items-center space-x-4">
                            <div className="text-6xl font-bold">{posture?.averageRiskScore.toFixed(1) || '0'}</div>
                            <div>
                                <div className="text-3xl mb-1">{securityLevel.emoji}</div>
                                <div className="text-xl font-semibold">{securityLevel.label}</div>
                            </div>
                        </div>
                    </div>
                    <div className="text-8xl opacity-20">🛡️</div>
                </div>
            </div>

            {/* Security Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-slate-900">Compliance Rate</h3>
                        <span className="text-3xl">📋</span>
                    </div>
                    <div className="text-4xl font-bold text-blue-600 mb-2">
                        {posture?.complianceRate.toFixed(1) || '0'}%
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                        <div
                            className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-500"
                            style={{ width: `${posture?.complianceRate || 0}%` }}
                        />
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-slate-900">MFA Adoption</h3>
                        <span className="text-3xl">🔐</span>
                    </div>
                    <div className="text-4xl font-bold text-green-600 mb-2">
                        {posture?.mfaAdoptionRate.toFixed(1) || '0'}%
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                        <div
                            className="bg-gradient-to-r from-green-500 to-green-600 h-full rounded-full transition-all duration-500"
                            style={{ width: `${posture?.mfaAdoptionRate || 0}%` }}
                        />
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-slate-900">TLS 1.3 Adoption</h3>
                        <span className="text-3xl">🔒</span>
                    </div>
                    <div className="text-4xl font-bold text-purple-600 mb-2">
                        {posture?.tls13AdoptionRate.toFixed(1) || '0'}%
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                        <div
                            className="bg-gradient-to-r from-purple-500 to-purple-600 h-full rounded-full transition-all duration-500"
                            style={{ width: `${posture?.tls13AdoptionRate || 0}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Risk Distribution */}
            {riskDist && (
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <h2 className="text-2xl font-bold text-slate-900 mb-6">🎯 IdP Risk Distribution</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-xl p-6 text-white">
                            <div className="text-4xl mb-2">🥇</div>
                            <div className="text-3xl font-bold">{riskDist.gold}</div>
                            <div className="text-sm opacity-90 mt-1">Gold Tier</div>
                            <div className="text-xs opacity-75">85-100 points</div>
                        </div>

                        <div className="bg-gradient-to-br from-gray-300 to-gray-400 rounded-xl p-6 text-white">
                            <div className="text-4xl mb-2">🥈</div>
                            <div className="text-3xl font-bold">{riskDist.silver}</div>
                            <div className="text-sm opacity-90 mt-1">Silver Tier</div>
                            <div className="text-xs opacity-75">70-84 points</div>
                        </div>

                        <div className="bg-gradient-to-br from-orange-400 to-orange-500 rounded-xl p-6 text-white">
                            <div className="text-4xl mb-2">🥉</div>
                            <div className="text-3xl font-bold">{riskDist.bronze}</div>
                            <div className="text-sm opacity-90 mt-1">Bronze Tier</div>
                            <div className="text-xs opacity-75">50-69 points</div>
                        </div>

                        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-6 text-white">
                            <div className="text-4xl mb-2">❌</div>
                            <div className="text-3xl font-bold">{riskDist.fail}</div>
                            <div className="text-sm opacity-90 mt-1">Failed</div>
                            <div className="text-xs opacity-75">&lt;50 points</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Security Recommendations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <h3 className="text-xl font-bold text-slate-900 mb-4">✅ Security Strengths</h3>
                    <ul className="space-y-3">
                        {posture && posture.mfaAdoptionRate >= 80 && (
                            <li className="flex items-start text-sm text-green-700 bg-green-50 p-3 rounded-lg">
                                <span className="mr-2">✓</span>
                                <span>Excellent MFA adoption across IdPs</span>
                            </li>
                        )}
                        {posture && posture.tls13AdoptionRate >= 70 && (
                            <li className="flex items-start text-sm text-green-700 bg-green-50 p-3 rounded-lg">
                                <span className="mr-2">✓</span>
                                <span>Strong TLS 1.3 adoption for secure connections</span>
                            </li>
                        )}
                        {posture && posture.complianceRate >= 85 && (
                            <li className="flex items-start text-sm text-green-700 bg-green-50 p-3 rounded-lg">
                                <span className="mr-2">✓</span>
                                <span>High compliance rate with security standards</span>
                            </li>
                        )}
                        <li className="flex items-start text-sm text-green-700 bg-green-50 p-3 rounded-lg">
                            <span className="mr-2">✓</span>
                            <span>Active monitoring and audit logging in place</span>
                        </li>
                    </ul>
                </div>

                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <h3 className="text-xl font-bold text-slate-900 mb-4">⚠️ Areas for Improvement</h3>
                    <ul className="space-y-3">
                        {posture && posture.mfaAdoptionRate < 80 && (
                            <li className="flex items-start text-sm text-orange-700 bg-orange-50 p-3 rounded-lg">
                                <span className="mr-2">!</span>
                                <span>Increase MFA adoption to strengthen authentication</span>
                            </li>
                        )}
                        {posture && posture.tls13AdoptionRate < 70 && (
                            <li className="flex items-start text-sm text-orange-700 bg-orange-50 p-3 rounded-lg">
                                <span className="mr-2">!</span>
                                <span>Upgrade IdPs to TLS 1.3 for better security</span>
                            </li>
                        )}
                        {posture && posture.complianceRate < 85 && (
                            <li className="flex items-start text-sm text-orange-700 bg-orange-50 p-3 rounded-lg">
                                <span className="mr-2">!</span>
                                <span>Review non-compliant IdPs and update configurations</span>
                            </li>
                        )}
                        {riskDist && riskDist.fail > 0 && (
                            <li className="flex items-start text-sm text-red-700 bg-red-50 p-3 rounded-lg">
                                <span className="mr-2">⚠</span>
                                <span>{riskDist.fail} IdP(s) failed security validation - immediate action required</span>
                            </li>
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );
}
