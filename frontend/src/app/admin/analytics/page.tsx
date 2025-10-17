'use client';

/**
 * Analytics Dashboard (Phase 3)
 * 
 * Purpose: Real-time visualization of system performance and security metrics
 * 
 * Features:
 * - Risk distribution by tier (pie chart)
 * - Compliance trends over time (line chart)
 * - SLA performance metrics
 * - Authorization decision metrics
 * - Security posture overview
 * 
 * Data: Fetched from analytics service with 5-minute caching
 */

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';

// Component imports
import RiskDistributionChart from '@/components/analytics/risk-distribution-chart';
import ComplianceTrendsChart from '@/components/analytics/compliance-trends-chart';
import SLAMetricsCard from '@/components/analytics/sla-metrics-card';
import AuthzMetricsCard from '@/components/analytics/authz-metrics-card';
import SecurityPostureCard from '@/components/analytics/security-posture-card';

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

export default function AnalyticsPage() {
    const { data: session, status } = useSession();
    const [riskDistribution, setRiskDistribution] = useState<IRiskDistribution | null>(null);
    const [complianceTrends, setComplianceTrends] = useState<IComplianceTrends | null>(null);
    const [slaMetrics, setSlaMetrics] = useState<ISLAMetrics | null>(null);
    const [authzMetrics, setAuthzMetrics] = useState<IAuthzMetrics | null>(null);
    const [securityPosture, setSecurityPosture] = useState<ISecurityPosture | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

    // Redirect if not authenticated
    if (status === 'unauthenticated') {
        redirect('/auth/signin');
    }

    // Fetch analytics data
    useEffect(() => {
        if (status !== 'authenticated') return;

        const fetchAnalytics = async () => {
            try {
                setLoading(true);
                setError(null);

                const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
                const token = (session as any)?.accessToken;

                if (!token) {
                    throw new Error('No access token available');
                }

                // Fetch all analytics data in parallel
                const [risk, compliance, sla, authz, posture] = await Promise.all([
                    fetch(`${backendUrl}/api/admin/analytics/risk-distribution`, {
                        headers: { Authorization: `Bearer ${token}` },
                    }).then(res => res.json()),
                    
                    fetch(`${backendUrl}/api/admin/analytics/compliance-trends`, {
                        headers: { Authorization: `Bearer ${token}` },
                    }).then(res => res.json()),
                    
                    fetch(`${backendUrl}/api/admin/analytics/sla-metrics`, {
                        headers: { Authorization: `Bearer ${token}` },
                    }).then(res => res.json()),
                    
                    fetch(`${backendUrl}/api/admin/analytics/authz-metrics`, {
                        headers: { Authorization: `Bearer ${token}` },
                    }).then(res => res.json()),
                    
                    fetch(`${backendUrl}/api/admin/analytics/security-posture`, {
                        headers: { Authorization: `Bearer ${token}` },
                    }).then(res => res.json()),
                ]);

                setRiskDistribution(risk);
                setComplianceTrends(compliance);
                setSlaMetrics(sla);
                setAuthzMetrics(authz);
                setSecurityPosture(posture);
                setLastUpdated(new Date());
            } catch (err) {
                console.error('Error fetching analytics:', err);
                setError(err instanceof Error ? err.message : 'Failed to fetch analytics data');
            } finally {
                setLoading(false);
            }
        };

        fetchAnalytics();

        // Auto-refresh every 5 minutes
        const interval = setInterval(fetchAnalytics, 5 * 60 * 1000);
        
        return () => clearInterval(interval);
    }, [session, status]);

    if (loading && !riskDistribution) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading analytics...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="container mx-auto px-4 py-8">
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Analytics</h3>
                    <p className="text-red-600">{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
                    <p className="mt-2 text-gray-600">
                        Real-time insights into system performance and security posture
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-sm text-gray-500">
                        Last updated: {lastUpdated.toLocaleTimeString()}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                        Auto-refreshes every 5 minutes
                    </p>
                </div>
            </div>

            {/* Security Posture Overview */}
            <div className="mb-8">
                {securityPosture && <SecurityPostureCard data={securityPosture} />}
            </div>

            {/* Top Row: Risk Distribution and Compliance Trends */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-white rounded-lg shadow-md p-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">
                        Risk Distribution by Tier
                    </h2>
                    {riskDistribution && <RiskDistributionChart data={riskDistribution} />}
                </div>

                <div className="bg-white rounded-lg shadow-md p-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">
                        Compliance Trends (30 Days)
                    </h2>
                    {complianceTrends && <ComplianceTrendsChart data={complianceTrends} />}
                </div>
            </div>

            {/* Bottom Row: SLA and Authorization Metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                    {slaMetrics && <SLAMetricsCard data={slaMetrics} />}
                </div>

                <div>
                    {authzMetrics && <AuthzMetricsCard data={authzMetrics} />}
                </div>
            </div>

            {/* Footer Note */}
            <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                    <strong>Note:</strong> Analytics data is cached for 5 minutes to optimize performance.
                    Metrics are calculated from IdP submissions, audit logs, and authorization decisions.
                </p>
            </div>
        </div>
    );
}

