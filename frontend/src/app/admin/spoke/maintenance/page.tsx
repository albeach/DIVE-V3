/**
 * DIVE V3 - Maintenance Mode Page
 * 
 * Dedicated page for spoke administrators to manage maintenance mode
 * and view maintenance history.
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
  MaintenanceModeToggle,
  IMaintenanceStatus,
} from '@/components/admin/spoke';
import { MaintenanceHistory } from '@/components/admin/spoke/MaintenanceHistory';
import { IMaintenanceEvent } from '@/types/federation.types';
import {
  Wrench,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Timer,
  Pause,
  Play,
} from 'lucide-react';

export default function MaintenancePage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [maintenanceStatus, setMaintenanceStatus] = useState<IMaintenanceStatus | null>(null);
  const [history, setHistory] = useState<IMaintenanceEvent[]>([]);
  const [currentSession, setCurrentSession] = useState<IMaintenanceEvent | null>(null);

  // Fetch all maintenance data
  const fetchData = useCallback(async (showRefreshing = true) => {
    if (showRefreshing) setRefreshing(true);
    setError(null);

    try {
      // Fetch failover status (includes maintenance mode info)
      const statusResponse = await fetch('/api/spoke/failover/status');
      if (!statusResponse.ok) {
        throw new Error(`Failed to fetch status: HTTP ${statusResponse.status}`);
      }
      const statusData = await statusResponse.json();

      // Fetch maintenance history
      const historyResponse = await fetch('/api/spoke/maintenance/history?limit=20');
      const historyData = historyResponse.ok ? await historyResponse.json() : { history: [], currentSession: null };

      setMaintenanceStatus({
        isInMaintenanceMode: statusData.isInMaintenanceMode || false,
        maintenanceReason: statusData.maintenanceReason,
        maintenanceEnteredAt: statusData.maintenanceEnteredAt,
      });

      setHistory(historyData.history || []);
      setCurrentSession(historyData.currentSession || null);

    } catch (err) {
      console.error('Failed to fetch maintenance data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch maintenance data');
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

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(false);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Redirect if not authenticated
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/login');
    }
  }, [sessionStatus, router]);

  // Action handlers
  const handleEnterMaintenance = async (reason: string) => {
    const response = await fetch('/api/spoke/maintenance/enter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) {
      throw new Error('Failed to enter maintenance');
    }
    await fetchData(false);
  };

  const handleExitMaintenance = async () => {
    const response = await fetch('/api/spoke/maintenance/exit', { method: 'POST' });
    if (!response.ok) {
      throw new Error('Failed to exit maintenance');
    }
    await fetchData(false);
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
          <p className="mt-4 text-lg text-slate-300">Loading Maintenance Mode...</p>
        </div>
      </div>
    );
  }

  if (sessionStatus === 'unauthenticated') {
    return null;
  }

  const isInMaintenance = maintenanceStatus?.isInMaintenanceMode || false;

  // Calculate total maintenance time
  const totalMaintenanceTime = history.reduce((sum, h) => sum + (h.duration || 0), 0);
  const avgMaintenanceTime = history.length > 0 ? totalMaintenanceTime / history.length : 0;

  function formatDuration(ms: number): string {
    if (ms === 0) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  return (
    <PageLayout
      user={session?.user || {}}
      breadcrumbs={[
        { label: 'Admin', href: '/admin/dashboard' },
        { label: 'Spoke', href: '/admin/spoke' },
        { label: 'Maintenance', href: null },
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
                isInMaintenance 
                  ? 'bg-gradient-to-br from-amber-500 to-orange-600' 
                  : 'bg-gradient-to-br from-emerald-500 to-teal-600'
              }`}>
                <Wrench className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                  Maintenance Mode
                </h1>
                <p className="text-slate-600 text-sm sm:text-base">
                  Manage planned maintenance windows
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Status Badge */}
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${
                isInMaintenance 
                  ? 'bg-amber-50 border-amber-200' 
                  : 'bg-emerald-50 border-emerald-200'
              }`}>
                {isInMaintenance ? (
                  <>
                    <Pause className="w-5 h-5 text-amber-600 animate-pulse" />
                    <span className="font-semibold text-amber-700">In Maintenance</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span className="font-semibold text-emerald-700">Operational</span>
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
              <div className={`p-2 rounded-lg ${isInMaintenance ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                {isInMaintenance ? (
                  <Pause className="w-5 h-5 text-amber-600" />
                ) : (
                  <Play className="w-5 h-5 text-emerald-600" />
                )}
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">
                  {isInMaintenance ? 'Active' : 'Operational'}
                </p>
                <p className="text-sm text-slate-500">Current Status</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Clock className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{history.length}</p>
                <p className="text-sm text-slate-500">Total Windows</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Timer className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">
                  {formatDuration(avgMaintenanceTime)}
                </p>
                <p className="text-sm text-slate-500">Avg Duration</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-100 rounded-lg">
                <Wrench className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">
                  {formatDuration(totalMaintenanceTime)}
                </p>
                <p className="text-sm text-slate-500">Total Downtime</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Maintenance Mode Control */}
          <div className="space-y-6">
            <MaintenanceModeToggle 
              status={maintenanceStatus} 
              loading={loading}
              onEnter={handleEnterMaintenance}
              onExit={handleExitMaintenance}
            />

            {/* Information Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6"
            >
              <h3 className="font-bold text-slate-900 mb-4">About Maintenance Mode</h3>
              <div className="space-y-3 text-sm text-slate-600">
                <p>
                  <strong>When maintenance mode is active:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Heartbeats to Hub are paused</li>
                  <li>Audit events are queued locally</li>
                  <li>Policy synchronization is suspended</li>
                  <li>Authorization continues using cached policies</li>
                  <li>Local operations remain functional</li>
                </ul>
                <p className="mt-4">
                  <strong>Best practices:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Always provide a clear reason for maintenance</li>
                  <li>Schedule maintenance during low-traffic periods</li>
                  <li>Exit maintenance mode promptly after work is complete</li>
                  <li>Monitor audit queue size during extended maintenance</li>
                </ul>
              </div>
            </motion.div>
          </div>

          {/* Maintenance History */}
          <div>
            <MaintenanceHistory
              history={history}
              currentSession={currentSession}
              loading={loading}
              onRefresh={() => fetchData(true)}
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
                <Clock className="w-4 h-4" />
                <span>Auto-refresh: 15s</span>
              </div>
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4" />
                <span>Status: {isInMaintenance ? 'In Maintenance' : 'Operational'}</span>
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

