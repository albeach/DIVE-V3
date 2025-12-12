/**
 * DIVE V3 - Spoke Administrator Dashboard
 * 
 * Dashboard for spoke administrators to view their registration status,
 * hub connectivity, policy sync, and failover state.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import PageLayout from '@/components/layout/page-layout';
import {
  SpokeStatusCard,
  HubConnectivityWidget,
  PolicySyncStatusCard,
  CircuitBreakerControl,
  MaintenanceModeToggle,
  AuditQueueStatus,
  ISpokeRuntimeInfo,
  IConnectivityStatus,
  IPolicySyncInfo,
  ICircuitBreakerStatus,
  IMaintenanceStatus,
  IAuditQueueInfo,
} from '@/components/admin/spoke';
import { CircuitBreakerState, SyncStatus } from '@/types/federation.types';
import {
  Server,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Activity,
} from 'lucide-react';

export default function SpokeDashboardPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  // State for all dashboard data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Data state
  const [spokeRuntime, setSpokeRuntime] = useState<ISpokeRuntimeInfo | null>(null);
  const [connectivity, setConnectivity] = useState<IConnectivityStatus | null>(null);
  const [policyInfo, setPolicyInfo] = useState<IPolicySyncInfo | null>(null);
  const [circuitBreaker, setCircuitBreaker] = useState<ICircuitBreakerStatus | null>(null);
  const [maintenance, setMaintenance] = useState<IMaintenanceStatus | null>(null);
  const [auditQueue, setAuditQueue] = useState<IAuditQueueInfo | null>(null);

  // Fetch all status data
  const fetchStatus = useCallback(async (showRefreshing = true) => {
    if (showRefreshing) setRefreshing(true);
    setError(null);

    try {
      // Fetch comprehensive status
      const statusResponse = await fetch('/api/spoke/status');
      if (!statusResponse.ok) {
        const errData = await statusResponse.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${statusResponse.status}`);
      }
      const statusData = await statusResponse.json();

      // Fetch failover status
      const failoverResponse = await fetch('/api/spoke/failover/status');
      const failoverData = failoverResponse.ok ? await failoverResponse.json() : null;

      // Fetch audit status
      const auditResponse = await fetch('/api/spoke/audit/status');
      const auditData = auditResponse.ok ? await auditResponse.json() : null;

      // Parse and set runtime info
      const runtime = statusData.runtime || {};
      setSpokeRuntime({
        spokeId: runtime.spokeId || process.env.NEXT_PUBLIC_SPOKE_ID || 'unknown',
        instanceCode: runtime.instanceCode || process.env.NEXT_PUBLIC_SPOKE_INSTANCE_CODE || 'NZL',
        name: runtime.name || 'New Zealand Spoke',
        status: runtime.status || 'active',
        trustLevel: runtime.trustLevel || 'partner',
        registeredAt: runtime.registeredAt,
        approvedAt: runtime.approvedAt,
        hubUrl: runtime.hubUrl,
        startedAt: runtime.startedAt,
      });

      // Parse and set connectivity
      const conn = statusData.connectivity || {};
      setConnectivity({
        hubReachable: conn.hubReachable ?? false,
        opalConnected: conn.opalConnected ?? false,
        lastHeartbeat: conn.lastHeartbeat,
        lastOpalSync: conn.lastOpalSync,
        hubUrl: conn.hubUrl,
        latencyMs: conn.latencyMs,
      });

      // Parse and set policy info
      const health = statusData.health || {};
      const policyVersion = statusData.policyVersion || statusData.currentPolicyVersion;
      setPolicyInfo({
        currentVersion: policyVersion || 'unknown',
        hubVersion: statusData.hubPolicyVersion,
        lastSyncTime: conn.lastOpalSync || statusData.lastPolicySync,
        lastSyncSuccess: true,
        versionsBehind: statusData.versionsBehind || 0,
        syncStatus: determineSyncStatus(statusData),
        totalPolicies: statusData.totalPolicies,
        policiesLoaded: statusData.policiesLoaded,
        cacheValid: statusData.cacheValid ?? true,
      });

      // Parse and set circuit breaker
      if (failoverData?.success !== false) {
        setCircuitBreaker({
          state: (failoverData?.state || 'CLOSED') as CircuitBreakerState,
          consecutiveFailures: failoverData?.consecutiveFailures || 0,
          consecutiveSuccesses: failoverData?.consecutiveSuccesses || 0,
          lastFailure: failoverData?.lastFailure,
          lastSuccess: failoverData?.lastSuccess,
          totalFailures: failoverData?.totalFailures || 0,
          totalRecoveries: failoverData?.totalRecoveries || 0,
          uptimePercentage: failoverData?.uptimePercentage || 99.9,
        });

        setMaintenance({
          isInMaintenanceMode: failoverData?.isInMaintenanceMode || false,
          maintenanceReason: failoverData?.maintenanceReason,
          maintenanceEnteredAt: failoverData?.maintenanceEnteredAt,
        });
      }

      // Parse and set audit queue
      if (auditData?.success !== false) {
        setAuditQueue({
          queueSize: auditData?.queueSize || 0,
          oldestEntry: auditData?.state?.oldestEntry,
          newestEntry: auditData?.state?.newestEntry,
          lastSyncAttempt: auditData?.lastSyncAttempt,
          lastSyncSuccess: auditData?.lastSyncSuccess,
          pendingBytes: auditData?.state?.pendingBytes || 0,
          state: auditData?.state?.state || 'idle',
        });
      }

    } catch (err) {
      console.error('Failed to fetch spoke status:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch spoke status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Determine sync status from data
  function determineSyncStatus(data: { connectivity?: { opalConnected?: boolean }; versionsBehind?: number; lastPolicySync?: string }): SyncStatus {
    if (!data.connectivity?.opalConnected) return 'offline';
    if (data.versionsBehind && data.versionsBehind > 5) return 'critical_stale';
    if (data.versionsBehind && data.versionsBehind > 0) return 'behind';
    
    // Check if last sync was too long ago
    if (data.lastPolicySync) {
      const syncTime = new Date(data.lastPolicySync);
      const diffHours = (Date.now() - syncTime.getTime()) / (1000 * 60 * 60);
      if (diffHours > 24) return 'stale';
    }
    
    return 'current';
  }

  // Initial fetch
  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      fetchStatus(false);
    }
  }, [sessionStatus, fetchStatus]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStatus(false);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Redirect if not authenticated
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/login');
    }
  }, [sessionStatus, router]);

  // Action handlers
  const handleForceSync = async () => {
    const response = await fetch('/api/spoke/sync', { method: 'POST' });
    if (!response.ok) {
      throw new Error('Failed to sync');
    }
    await fetchStatus(false);
  };

  const handleForceCircuitState = async (state: CircuitBreakerState) => {
    const response = await fetch('/api/spoke/failover/force', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });
    if (!response.ok) {
      throw new Error('Failed to force state');
    }
    await fetchStatus(false);
  };

  const handleResetCircuit = async () => {
    const response = await fetch('/api/spoke/failover/reset', { method: 'POST' });
    if (!response.ok) {
      throw new Error('Failed to reset');
    }
    await fetchStatus(false);
  };

  const handleEnterMaintenance = async (reason: string) => {
    const response = await fetch('/api/spoke/maintenance/enter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) {
      throw new Error('Failed to enter maintenance');
    }
    await fetchStatus(false);
  };

  const handleExitMaintenance = async () => {
    const response = await fetch('/api/spoke/maintenance/exit', { method: 'POST' });
    if (!response.ok) {
      throw new Error('Failed to exit maintenance');
    }
    await fetchStatus(false);
  };

  const handleSyncAudit = async () => {
    const response = await fetch('/api/spoke/audit/sync', { method: 'POST' });
    if (!response.ok) {
      throw new Error('Failed to sync audit');
    }
    await fetchStatus(false);
  };

  const handleClearAudit = async () => {
    const response = await fetch('/api/spoke/audit/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'yes' }),
    });
    if (!response.ok) {
      throw new Error('Failed to clear audit');
    }
    await fetchStatus(false);
  };

  // Calculate overall health
  const isHealthy = connectivity?.hubReachable && 
                    connectivity?.opalConnected && 
                    circuitBreaker?.state === 'CLOSED' &&
                    !maintenance?.isInMaintenanceMode;

  // Loading state
  if (sessionStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="inline-block h-16 w-16 rounded-full border-4 border-cyan-400 border-t-transparent"
          />
          <p className="mt-4 text-lg text-slate-300">Loading Spoke Dashboard...</p>
        </div>
      </div>
    );
  }

  if (sessionStatus === 'unauthenticated') {
    return null;
  }

  return (
    <PageLayout
      user={session?.user || {}}
      breadcrumbs={[
        { label: 'Admin', href: '/admin/dashboard' },
        { label: 'Spoke', href: null },
      ]}
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 bg-white rounded-2xl shadow-xl border border-slate-200 p-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-4 rounded-2xl shadow-lg ${
                isHealthy 
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-600' 
                  : 'bg-gradient-to-br from-amber-500 to-orange-600'
              }`}>
                <Server className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                  Spoke Administrator Dashboard
                </h1>
                <p className="text-slate-600 text-sm sm:text-base">
                  {spokeRuntime?.instanceCode || 'NZL'} — {spokeRuntime?.name || 'New Zealand Spoke'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Health Badge */}
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${
                isHealthy 
                  ? 'bg-emerald-50 border-emerald-200' 
                  : 'bg-amber-50 border-amber-200'
              }`}>
                {isHealthy ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span className="font-semibold text-emerald-700">Healthy</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5 text-amber-600 animate-pulse" />
                    <span className="font-semibold text-amber-700">Issues Detected</span>
                  </>
                )}
              </div>

              {/* Refresh Button */}
              <button
                onClick={() => fetchStatus(true)}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-md hover:shadow-lg"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </motion.div>

        {/* Error Banner */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl"
          >
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">{error}</span>
            </div>
          </motion.div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Spoke Status */}
            <SpokeStatusCard runtime={spokeRuntime} loading={loading} />

            {/* Hub Connectivity */}
            <HubConnectivityWidget 
              connectivity={connectivity} 
              loading={loading}
              onRefresh={() => fetchStatus(true)}
              refreshing={refreshing}
            />

            {/* Policy Sync */}
            <PolicySyncStatusCard 
              policyInfo={policyInfo} 
              loading={loading}
              onForceSync={handleForceSync}
            />
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Circuit Breaker */}
            <CircuitBreakerControl 
              status={circuitBreaker} 
              loading={loading}
              onForceState={handleForceCircuitState}
              onReset={handleResetCircuit}
            />

            {/* Maintenance Mode */}
            <MaintenanceModeToggle 
              status={maintenance} 
              loading={loading}
              onEnter={handleEnterMaintenance}
              onExit={handleExitMaintenance}
            />

            {/* Audit Queue */}
            <AuditQueueStatus 
              queue={auditQueue} 
              loading={loading}
              onSync={handleSyncAudit}
              onClear={handleClearAudit}
            />
          </div>
        </div>

        {/* Footer Stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-6 p-4 bg-slate-100 rounded-xl"
        >
          <div className="flex items-center justify-between text-sm text-slate-600">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                <span>Auto-refresh: 15s</span>
              </div>
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4" />
                <span>Spoke ID: {spokeRuntime?.spokeId?.slice(0, 12) || 'loading...'}...</span>
              </div>
            </div>
            <div className="text-slate-500">
              Last updated: {new Date().toLocaleTimeString()}
            </div>
          </div>
        </motion.div>
      </div>
    </PageLayout>
  );
}

