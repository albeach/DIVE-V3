/**
 * DIVE V3 - Policy Compliance Dashboard
 * Phase 6: Continuous Compliance Automation
 * 
 * Provides real-time visibility into:
 * - Policy drift detection status
 * - Test coverage metrics
 * - Decision statistics and trends
 * - SLA compliance tracking
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';

// ============================================
// TYPES
// ============================================

interface IPolicyDriftStatus {
  status: 'no_drift' | 'drift_detected' | 'unknown' | 'checking';
  lastCheck: string | null;
  lastDriftDetected: string | null;
  sourceHash: string | null;
  bundleRevisions: Record<string, string>;
  driftDetails: Array<{
    type: string;
    tenant?: string;
    description: string;
    severity: 'critical' | 'warning' | 'info';
  }>;
  recommendations: string[];
}

interface ITestCoverageMetrics {
  totalTests: number;
  passingTests: number;
  failingTests: number;
  passRate: number;
  coverage: number;
  lastRun: string | null;
  coverageByPackage: Record<string, {
    tests: number;
    coverage: number;
  }>;
  trend: Array<{
    date: string;
    tests: number;
    coverage: number;
  }>;
}

interface IDecisionMetrics {
  totalDecisions: number;
  allowedDecisions: number;
  deniedDecisions: number;
  allowRate: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  decisionsByClassification: Record<string, number>;
  decisionsByTenant: Record<string, number>;
  topDenialReasons: Array<{
    reason: string;
    count: number;
    percentage: number;
  }>;
  trend: Array<{
    timestamp: string;
    allowed: number;
    denied: number;
    avgLatency: number;
  }>;
}

interface ISLAMetrics {
  availability: {
    current: number;
    target: number;
    compliant: boolean;
    uptimeHours: number;
    downtimeHours: number;
  };
  latency: {
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    targetP95Ms: number;
    compliant: boolean;
  };
  policySync: {
    lastSyncTime: string | null;
    syncIntervalSeconds: number;
    targetSyncIntervalSeconds: number;
    compliant: boolean;
  };
  testCoverage: {
    current: number;
    target: number;
    compliant: boolean;
  };
  overallCompliant: boolean;
  nextReviewDate: string;
}

interface IComplianceOverview {
  drift: IPolicyDriftStatus;
  tests: ITestCoverageMetrics;
  decisions: IDecisionMetrics;
  sla: ISLAMetrics;
  lastUpdated: string;
}

type ViewMode = 'overview' | 'drift' | 'tests' | 'decisions' | 'sla';

// ============================================
// COMPONENT
// ============================================

export default function PolicyComplianceDashboard() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [overview, setOverview] = useState<IComplianceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Fetch compliance data
  const fetchComplianceData = useCallback(async () => {
    if (status !== 'authenticated') return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/compliance/overview');
      if (!response.ok) {
        throw new Error(`Failed to fetch compliance data: ${response.statusText}`);
      }

      const data = await response.json();
      setOverview(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching compliance data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch compliance data');
    } finally {
      setLoading(false);
    }
  }, [status]);

  // Initial load
  useEffect(() => {
    fetchComplianceData();
  }, [fetchComplianceData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchComplianceData();
    }, 60 * 1000); // 1 minute

    return () => clearInterval(interval);
  }, [autoRefresh, fetchComplianceData]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status !== 'loading' && status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  // Helper functions
  const getDriftStatusIcon = (driftStatus: string) => {
    switch (driftStatus) {
      case 'no_drift': return '✅';
      case 'drift_detected': return '⚠️';
      case 'checking': return '🔄';
      default: return '❓';
    }
  };

  const getDriftStatusColor = (driftStatus: string) => {
    switch (driftStatus) {
      case 'no_drift': return 'from-green-500 to-emerald-500';
      case 'drift_detected': return 'from-yellow-500 to-orange-500';
      case 'checking': return 'from-blue-500 to-indigo-500';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 border-red-200 dark:border-red-800';
      case 'warning': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800';
      default: return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 border-blue-200 dark:border-blue-800';
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500 mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <PageLayout user={session?.user || {}}>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-teal-50 dark:from-gray-900 dark:via-emerald-900/20 dark:to-teal-900/20">
        {/* Header */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
          <div className="max-w-[1800px] mx-auto px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
                  📋 Policy Compliance Dashboard
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Phase 6: Continuous Compliance Automation - Monitor policy drift, tests, and SLA
                </p>
              </div>

              <div className="flex items-center space-x-4">
                {/* Auto-refresh toggle */}
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    autoRefresh
                      ? 'bg-emerald-500 text-white shadow-lg'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {autoRefresh ? '🔄 Auto (1m)' : '⏸️ Manual'}
                </button>

                <button
                  onClick={fetchComplianceData}
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium shadow-lg disabled:opacity-50"
                >
                  🔄 Refresh
                </button>

                <button
                  onClick={() => router.push('/admin/dashboard')}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                >
                  ← Dashboard
                </button>
              </div>
            </div>

            {/* View Mode Tabs */}
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-500">
                Last updated: {lastUpdated.toLocaleString()}
              </p>
              <div className="flex space-x-2">
                {(['overview', 'drift', 'tests', 'decisions', 'sla'] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-4 py-1 rounded-lg text-sm font-medium transition-all ${
                      viewMode === mode
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-white/50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-700/80'
                    }`}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-[1800px] mx-auto px-8 py-8 space-y-6">
          {loading && !overview ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500 mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Loading compliance data...</p>
              </div>
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-8">
              <div className="flex items-center space-x-3 mb-4">
                <span className="text-4xl">⚠️</span>
                <h3 className="text-lg font-semibold text-red-800 dark:text-red-400">Error Loading Data</h3>
              </div>
              <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
              <button
                onClick={fetchComplianceData}
                className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Retry
              </button>
            </div>
          ) : overview && (
            <>
              {/* Overview View */}
              {viewMode === 'overview' && (
                <>
                  {/* Key Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Drift Status */}
                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Policy Drift</p>
                          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2 capitalize">
                            {overview.drift.status.replace('_', ' ')}
                          </p>
                        </div>
                        <div className={`w-16 h-16 bg-gradient-to-br ${getDriftStatusColor(overview.drift.status)} rounded-2xl flex items-center justify-center text-3xl shadow-lg`}>
                          {getDriftStatusIcon(overview.drift.status)}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                        {overview.drift.lastCheck ? `Last check: ${new Date(overview.drift.lastCheck).toLocaleString()}` : 'Never checked'}
                      </p>
                    </div>

                    {/* Test Coverage */}
                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Test Coverage</p>
                          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
                            {overview.tests.coverage.toFixed(1)}%
                          </p>
                        </div>
                        <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg">
                          🧪
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                        {overview.tests.passingTests}/{overview.tests.totalTests} tests passing
                      </p>
                    </div>

                    {/* Decision Rate */}
                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Allow Rate</p>
                          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">
                            {overview.decisions.allowRate.toFixed(1)}%
                          </p>
                        </div>
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg">
                          📊
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                        {overview.decisions.totalDecisions.toLocaleString()} total decisions
                      </p>
                    </div>

                    {/* SLA Status */}
                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">SLA Status</p>
                          <p className={`text-2xl font-bold mt-2 ${overview.sla.overallCompliant ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {overview.sla.overallCompliant ? 'Compliant' : 'Non-Compliant'}
                          </p>
                        </div>
                        <div className={`w-16 h-16 bg-gradient-to-br ${overview.sla.overallCompliant ? 'from-green-500 to-emerald-500' : 'from-red-500 to-orange-500'} rounded-2xl flex items-center justify-center text-3xl shadow-lg`}>
                          {overview.sla.overallCompliant ? '✅' : '⚠️'}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                        {overview.sla.availability.current.toFixed(2)}% availability
                      </p>
                    </div>
                  </div>

                  {/* Drift Details & SLA Compliance */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Drift Details */}
                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                        🔍 Policy Drift Status
                      </h3>
                      
                      {overview.drift.driftDetails.length === 0 ? (
                        <div className="text-center py-8">
                          <div className="text-5xl mb-4">✅</div>
                          <p className="text-gray-600 dark:text-gray-400">No drift detected</p>
                          <p className="text-sm text-gray-500 mt-2">All policies are in sync with baseline</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {overview.drift.driftDetails.map((detail, idx) => (
                            <div key={idx} className={`p-4 rounded-lg border ${getSeverityColor(detail.severity)}`}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium">{detail.type.replace(/_/g, ' ')}</span>
                                <span className="text-xs uppercase font-bold">{detail.severity}</span>
                              </div>
                              <p className="text-sm">{detail.description}</p>
                              {detail.tenant && <span className="text-xs opacity-75">Tenant: {detail.tenant}</span>}
                            </div>
                          ))}
                        </div>
                      )}

                      {overview.drift.recommendations.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Recommendations:</h4>
                          <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                            {overview.drift.recommendations.map((rec, idx) => (
                              <li key={idx}>{rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* SLA Compliance */}
                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                        📈 SLA Compliance
                      </h3>
                      
                      <div className="space-y-4">
                        {/* Availability */}
                        <div className={`p-4 rounded-lg ${overview.sla.availability.compliant ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Availability</span>
                            <span className={`font-bold ${overview.sla.availability.compliant ? 'text-green-600' : 'text-red-600'}`}>
                              {overview.sla.availability.current.toFixed(2)}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${overview.sla.availability.compliant ? 'bg-green-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(overview.sla.availability.current, 100)}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Target: {overview.sla.availability.target}%</p>
                        </div>

                        {/* Latency */}
                        <div className={`p-4 rounded-lg ${overview.sla.latency.compliant ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">P95 Latency</span>
                            <span className={`font-bold ${overview.sla.latency.compliant ? 'text-green-600' : 'text-red-600'}`}>
                              {overview.sla.latency.p95Ms.toFixed(1)}ms
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${overview.sla.latency.compliant ? 'bg-green-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min((overview.sla.latency.p95Ms / overview.sla.latency.targetP95Ms) * 100, 100)}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Target: &lt;{overview.sla.latency.targetP95Ms}ms</p>
                        </div>

                        {/* Test Coverage */}
                        <div className={`p-4 rounded-lg ${overview.sla.testCoverage.compliant ? 'bg-green-50 dark:bg-green-900/20' : 'bg-yellow-50 dark:bg-yellow-900/20'}`}>
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Test Coverage</span>
                            <span className={`font-bold ${overview.sla.testCoverage.compliant ? 'text-green-600' : 'text-yellow-600'}`}>
                              {overview.sla.testCoverage.current.toFixed(1)}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${overview.sla.testCoverage.compliant ? 'bg-green-500' : 'bg-yellow-500'}`}
                              style={{ width: `${Math.min(overview.sla.testCoverage.current, 100)}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Target: {overview.sla.testCoverage.target}%</p>
                        </div>

                        {/* Policy Sync */}
                        <div className={`p-4 rounded-lg ${overview.sla.policySync.compliant ? 'bg-green-50 dark:bg-green-900/20' : 'bg-yellow-50 dark:bg-yellow-900/20'}`}>
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Policy Sync</span>
                            <span className={`font-bold ${overview.sla.policySync.compliant ? 'text-green-600' : 'text-yellow-600'}`}>
                              {overview.sla.policySync.lastSyncTime 
                                ? new Date(overview.sla.policySync.lastSyncTime).toLocaleString()
                                : 'Not synced'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Target: Every {(overview.sla.policySync.targetSyncIntervalSeconds / 3600).toFixed(0)} hours
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Next review: {new Date(overview.sla.nextReviewDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Bundle Revisions */}
                  <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                      📦 Tenant Bundle Revisions
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {Object.entries(overview.drift.bundleRevisions).map(([tenant, revision]) => (
                        <div key={tenant} className={`p-4 rounded-lg border ${revision === 'missing' ? 'border-red-200 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-gray-900 dark:text-white">{tenant}</span>
                            <span className={`text-xs px-2 py-1 rounded-full ${revision === 'missing' ? 'bg-red-200 text-red-800' : 'bg-green-200 text-green-800'}`}>
                              {revision === 'missing' ? 'Missing' : 'Active'}
                            </span>
                          </div>
                          <p className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate">
                            {revision === 'missing' ? 'No bundle found' : revision}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Tests View */}
              {viewMode === 'tests' && (
                <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                    🧪 Policy Test Coverage
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-6">
                      <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-2">Total Tests</p>
                      <p className="text-4xl font-bold text-emerald-900 dark:text-emerald-300">{overview.tests.totalTests}</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-6">
                      <p className="text-sm text-green-700 dark:text-green-400 mb-2">Passing</p>
                      <p className="text-4xl font-bold text-green-900 dark:text-green-300">{overview.tests.passingTests}</p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-6">
                      <p className="text-sm text-red-700 dark:text-red-400 mb-2">Failing</p>
                      <p className="text-4xl font-bold text-red-900 dark:text-red-300">{overview.tests.failingTests}</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6">
                      <p className="text-sm text-blue-700 dark:text-blue-400 mb-2">Coverage</p>
                      <p className="text-4xl font-bold text-blue-900 dark:text-blue-300">{overview.tests.coverage.toFixed(1)}%</p>
                    </div>
                  </div>

                  <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Coverage by Package</h4>
                  <div className="space-y-3">
                    {Object.entries(overview.tests.coverageByPackage).map(([pkg, data]) => (
                      <div key={pkg} className="flex items-center space-x-4">
                        <div className="w-48 font-mono text-sm text-gray-600 dark:text-gray-400">{pkg}</div>
                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                          <div
                            className="h-4 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                            style={{ width: `${data.coverage}%` }}
                          />
                        </div>
                        <div className="w-24 text-right">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{data.coverage}%</span>
                          <span className="text-xs text-gray-500 ml-2">({data.tests} tests)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Decisions View */}
              {viewMode === 'decisions' && (
                <div className="space-y-6">
                  {/* Decision Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="bg-white/90 dark:bg-gray-800/90 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-500 mb-1">Total Decisions</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{overview.decisions.totalDecisions.toLocaleString()}</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
                      <p className="text-xs text-green-700 mb-1">Allowed</p>
                      <p className="text-2xl font-bold text-green-900 dark:text-green-300">{overview.decisions.allowedDecisions.toLocaleString()}</p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
                      <p className="text-xs text-red-700 mb-1">Denied</p>
                      <p className="text-2xl font-bold text-red-900 dark:text-red-300">{overview.decisions.deniedDecisions.toLocaleString()}</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-blue-700 mb-1">Allow Rate</p>
                      <p className="text-2xl font-bold text-blue-900 dark:text-blue-300">{overview.decisions.allowRate.toFixed(1)}%</p>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
                      <p className="text-xs text-purple-700 mb-1">Avg Latency</p>
                      <p className="text-2xl font-bold text-purple-900 dark:text-purple-300">{overview.decisions.averageLatencyMs.toFixed(1)}ms</p>
                    </div>
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 border border-indigo-200 dark:border-indigo-800">
                      <p className="text-xs text-indigo-700 mb-1">P95 Latency</p>
                      <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-300">{overview.decisions.p95LatencyMs.toFixed(1)}ms</p>
                    </div>
                  </div>

                  {/* Decisions by Classification & Top Denial Reasons */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl">
                      <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-4">By Classification</h4>
                      {Object.entries(overview.decisions.decisionsByClassification).length === 0 ? (
                        <p className="text-gray-500 dark:text-gray-400">No decision data yet</p>
                      ) : (
                        <div className="space-y-2">
                          {Object.entries(overview.decisions.decisionsByClassification).map(([classification, count]) => (
                            <div key={classification} className="flex justify-between items-center p-2 rounded bg-gray-50 dark:bg-gray-800/50">
                              <span className="font-medium">{classification}</span>
                              <span className="text-gray-600 dark:text-gray-400">{count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl">
                      <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Top Denial Reasons</h4>
                      {overview.decisions.topDenialReasons.length === 0 ? (
                        <p className="text-gray-500 dark:text-gray-400">No denials recorded</p>
                      ) : (
                        <div className="space-y-2">
                          {overview.decisions.topDenialReasons.map((reason, idx) => (
                            <div key={idx} className="flex justify-between items-center p-2 rounded bg-red-50 dark:bg-red-900/20">
                              <span className="font-medium text-sm">{reason.reason}</span>
                              <span className="text-red-600 dark:text-red-400">{reason.count} ({reason.percentage.toFixed(1)}%)</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Info Card */}
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-6">
                <div className="flex items-start space-x-4">
                  <div className="text-4xl">📋</div>
                  <div>
                    <h4 className="font-bold text-emerald-900 dark:text-emerald-300 mb-2">
                      Phase 6: Continuous Compliance Automation
                    </h4>
                    <p className="text-sm text-emerald-800 dark:text-emerald-400">
                      This dashboard monitors policy compliance in real-time. It tracks policy drift detection,
                      test coverage metrics, authorization decision statistics, and SLA compliance.
                      Drift detection runs automatically every 6 hours via GitHub Actions.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

