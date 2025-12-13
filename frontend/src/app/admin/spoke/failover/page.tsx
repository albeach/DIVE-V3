/**
 * DIVE V3 - Failover Management Page
 * 
 * Dedicated page for spoke administrators to manage circuit breaker state
 * and view failover event history.
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
  CircuitBreakerControl,
  ICircuitBreakerStatus,
} from '@/components/admin/spoke';
import { FailoverEventLog } from '@/components/admin/spoke/FailoverEventLog';
import { CircuitBreakerState, IFailoverEvent } from '@/types/federation.types';
import {
  Zap,
  RefreshCw,
  AlertTriangle,
  Shield,
  Activity,
  TrendingUp,
  TrendingDown,
  Clock,
} from 'lucide-react';

export default function FailoverPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [circuitBreaker, setCircuitBreaker] = useState<ICircuitBreakerStatus | null>(null);
  const [events, setEvents] = useState<IFailoverEvent[]>([]);

  // Fetch all failover data
  const fetchData = useCallback(async (showRefreshing = true) => {
    if (showRefreshing) setRefreshing(true);
    setError(null);

    try {
      // Fetch failover status
      const statusResponse = await fetch('/api/spoke/failover/status');
      if (!statusResponse.ok) {
        throw new Error(`Failed to fetch status: HTTP ${statusResponse.status}`);
      }
      const statusData = await statusResponse.json();

      // Fetch failover events
      const eventsResponse = await fetch('/api/spoke/failover/events?limit=50');
      const eventsData = eventsResponse.ok ? await eventsResponse.json() : { events: [] };

      setCircuitBreaker({
        state: (statusData.state || 'CLOSED') as CircuitBreakerState,
        consecutiveFailures: statusData.consecutiveFailures || 0,
        consecutiveSuccesses: statusData.consecutiveSuccesses || 0,
        lastFailure: statusData.lastFailure,
        lastSuccess: statusData.lastSuccess,
        totalFailures: statusData.totalFailures || 0,
        totalRecoveries: statusData.totalRecoveries || 0,
        uptimePercentage: statusData.uptimePercentage || 99.9,
      });

      setEvents(eventsData.events || []);

    } catch (err) {
      console.error('Failed to fetch failover data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch failover data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      fetchData(false);
    }
  }, [sessionStatus, fetchData]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(false);
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Redirect if not authenticated
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/login');
    }
  }, [sessionStatus, router]);

  // Action handlers
  const handleForceCircuitState = async (state: CircuitBreakerState) => {
    const response = await fetch('/api/spoke/failover/force', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });
    if (!response.ok) {
      throw new Error('Failed to force state');
    }
    await fetchData(false);
  };

  const handleResetCircuit = async () => {
    const response = await fetch('/api/spoke/failover/reset', { method: 'POST' });
    if (!response.ok) {
      throw new Error('Failed to reset');
    }
    await fetchData(false);
  };

  const handleExportEvents = () => {
    const dataStr = JSON.stringify(events, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `failover-events-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
          <p className="mt-4 text-lg text-slate-300">Loading Failover Management...</p>
        </div>
      </div>
    );
  }

  if (sessionStatus === 'unauthenticated') {
    return null;
  }

  const isHealthy = circuitBreaker?.state === 'CLOSED';

  return (
    <PageLayout
      user={session?.user || {}}
      breadcrumbs={[
        { label: 'Admin', href: '/admin/dashboard' },
        { label: 'Spoke', href: '/admin/spoke' },
        { label: 'Failover', href: null },
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
                  : circuitBreaker?.state === 'HALF_OPEN'
                    ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                    : 'bg-gradient-to-br from-red-500 to-rose-600'
              }`}>
                <Zap className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                  Failover Management
                </h1>
                <p className="text-slate-600 text-sm sm:text-base">
                  Circuit breaker control and event history
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Health Badge */}
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${
                isHealthy 
                  ? 'bg-emerald-50 border-emerald-200' 
                  : circuitBreaker?.state === 'HALF_OPEN'
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-red-50 border-red-200'
              }`}>
                {isHealthy ? (
                  <>
                    <Shield className="w-5 h-5 text-emerald-600" />
                    <span className="font-semibold text-emerald-700">Circuit Closed</span>
                  </>
                ) : circuitBreaker?.state === 'HALF_OPEN' ? (
                  <>
                    <Activity className="w-5 h-5 text-amber-600 animate-pulse" />
                    <span className="font-semibold text-amber-700">Testing Recovery</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5 text-red-600 animate-pulse" />
                    <span className="font-semibold text-red-700">Circuit Open</span>
                  </>
                )}
              </div>

              {/* Refresh Button */}
              <button
                onClick={() => fetchData(true)}
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

        {/* Stats Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
        >
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <TrendingDown className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">
                  {circuitBreaker?.totalFailures || 0}
                </p>
                <p className="text-sm text-slate-500">Total Failures</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">
                  {circuitBreaker?.totalRecoveries || 0}
                </p>
                <p className="text-sm text-slate-500">Recoveries</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Activity className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">
                  {circuitBreaker?.uptimePercentage?.toFixed(1) || '99.9'}%
                </p>
                <p className="text-sm text-slate-500">Uptime</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{events.length}</p>
                <p className="text-sm text-slate-500">Events Logged</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Circuit Breaker Control */}
          <div>
            <CircuitBreakerControl 
              status={circuitBreaker} 
              loading={loading}
              onForceState={handleForceCircuitState}
              onReset={handleResetCircuit}
            />
          </div>

          {/* Failover Event Log */}
          <div>
            <FailoverEventLog
              events={events}
              loading={loading}
              onRefresh={() => fetchData(true)}
              onExport={handleExportEvents}
            />
          </div>
        </div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 p-4 bg-slate-100 rounded-xl"
        >
          <div className="flex items-center justify-between text-sm text-slate-600">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                <span>Auto-refresh: 10s</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                <span>Circuit: {circuitBreaker?.state || 'CLOSED'}</span>
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




