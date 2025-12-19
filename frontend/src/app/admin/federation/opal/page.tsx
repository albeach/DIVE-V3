/**
 * DIVE V3 - OPAL Server Dashboard Page
 * 
 * Hub administrator page for monitoring OPAL Server health, connected clients,
 * and transaction logs for policy sync operations.
 * 
 * Features:
 * - OPAL Server health status with uptime and metrics
 * - Connected OPAL clients list with filtering
 * - Transaction log with timeline view and export
 * - Real-time updates (10s polling)
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
  OPALServerHealth,
  OPALClientList,
  OPALTransactionLog,
} from '@/components/admin/federation';
import {
  IOPALServerStatus,
  IOPALClient,
  IOPALTransaction,
  IOPALClientListResponse,
  IOPALTransactionLogResponse,
} from '@/types/federation.types';
import {
  Server,
  RefreshCw,
  AlertTriangle,
  Activity,
  Download,
} from 'lucide-react';

const AUTO_REFRESH_INTERVAL = 10000; // 10 seconds

export default function OPALDashboardPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  // State
  const [serverStatus, setServerStatus] = useState<IOPALServerStatus | null>(null);
  const [clients, setClients] = useState<IOPALClient[]>([]);
  const [transactions, setTransactions] = useState<IOPALTransaction[]>([]);
  const [transactionSummary, setTransactionSummary] = useState<IOPALTransactionLogResponse['summary'] | undefined>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(true);
  const [transactionOffset, setTransactionOffset] = useState(0);

  // Fetch all data
  const fetchData = useCallback(async (showRefreshing = true) => {
    if (showRefreshing) setRefreshing(true);
    setError(null);

    try {
      // Fetch all data in parallel
      const [statusRes, clientsRes, transactionsRes] = await Promise.all([
        fetch('/api/opal/server-status'),
        fetch('/api/opal/clients'),
        fetch('/api/opal/transactions?limit=50'),
      ]);

      // Parse server status
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setServerStatus(statusData);
      } else {
        // Create error status
        setServerStatus({
          healthy: false,
          version: 'unknown',
          uptime: 0,
          startedAt: new Date().toISOString(),
          policyDataEndpoint: {
            status: 'down',
            requestsPerMinute: 0,
            totalRequests: 0,
            errorRate: 100,
          },
          webSocket: {
            connected: false,
            clientCount: 0,
            messagesPerMinute: 0,
          },
          topics: [],
          config: {
            serverUrl: 'unknown',
            dataTopics: [],
            policyTopics: [],
          },
          stats: {
            totalPublishes: 0,
            totalSyncs: 0,
            failedSyncs: 0,
            averageSyncDurationMs: 0,
          },
        });
      }

      // Parse clients
      if (clientsRes.ok) {
        const clientsData: IOPALClientListResponse = await clientsRes.json();
        setClients(clientsData.clients || []);
      }

      // Parse transactions
      if (transactionsRes.ok) {
        const txnData: IOPALTransactionLogResponse = await transactionsRes.json();
        setTransactions(txnData.transactions || []);
        setTransactionSummary(txnData.summary);
        setHasMoreTransactions(txnData.transactions.length >= 50);
        setTransactionOffset(txnData.transactions.length);
      }
    } catch (err) {
      console.error('Failed to fetch OPAL data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
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

  // Redirect if not authenticated
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/login');
    }
  }, [sessionStatus, router]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(false);
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Ping client
  const handlePingClient = async (clientId: string) => {
    try {
      const response = await fetch(`/api/opal/clients/${clientId}/ping`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Ping failed');
      }
      // Refresh clients after ping
      await fetchData(false);
    } catch (err) {
      console.error('Failed to ping client:', err);
    }
  };

  // Force sync to client
  const handleForceSyncClient = async (clientId: string) => {
    try {
      const response = await fetch(`/api/opal/clients/${clientId}/force-sync`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Force sync failed');
      }
      // Refresh data after sync
      await fetchData(true);
    } catch (err) {
      console.error('Failed to force sync client:', err);
    }
  };

  // Load more transactions
  const handleLoadMoreTransactions = async () => {
    try {
      const response = await fetch(`/api/opal/transactions?limit=50&offset=${transactionOffset}`);
      if (response.ok) {
        const data: IOPALTransactionLogResponse = await response.json();
        setTransactions((prev) => [...prev, ...data.transactions]);
        setHasMoreTransactions(data.transactions.length >= 50);
        setTransactionOffset((prev) => prev + data.transactions.length);
      }
    } catch (err) {
      console.error('Failed to load more transactions:', err);
    }
  };

  // Export transactions
  const handleExportTransactions = async (format: 'csv' | 'json') => {
    try {
      const response = await fetch(`/api/opal/transactions/export?format=${format}`);
      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `opal-transactions-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export transactions:', err);
    }
  };

  // Loading state
  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-900 dark:to-gray-950">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="inline-block h-16 w-16 rounded-full border-4 border-indigo-500 border-t-transparent"
          />
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">Loading OPAL Dashboard...</p>
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
        { label: 'Federation', href: '/admin/federation/spokes' },
        { label: 'OPAL Status', href: null },
      ]}
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 p-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                <Server className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  OPAL Server Dashboard
                </h1>
                <p className="text-slate-600 dark:text-gray-400 text-sm sm:text-base">
                  Monitor policy distribution and client synchronization
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Status Indicator */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
                serverStatus?.healthy
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              }`}>
                <motion.div
                  animate={serverStatus?.healthy ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                  className={`w-2 h-2 rounded-full ${
                    serverStatus?.healthy ? 'bg-emerald-500' : 'bg-red-500'
                  }`}
                />
                <span className="text-sm font-medium">
                  {serverStatus?.healthy ? 'Healthy' : 'Unhealthy'}
                </span>
              </div>

              {/* Auto-refresh indicator */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-sm">
                <Activity className="w-4 h-4" />
                <span>Auto-refresh 10s</span>
              </div>

              {/* Refresh Button */}
              <button
                onClick={() => fetchData(true)}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-md hover:shadow-lg"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </motion.div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl"
          >
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <AlertTriangle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          </motion.div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
          {/* Server Health (1/3 width) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <OPALServerHealth
              status={serverStatus}
              loading={refreshing}
              onRefresh={() => fetchData(true)}
            />
          </motion.div>

          {/* Client List (2/3 width) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="xl:col-span-2"
          >
            <OPALClientList
              clients={clients}
              loading={refreshing}
              onRefresh={() => fetchData(true)}
              onPingClient={handlePingClient}
              onForceSyncClient={handleForceSyncClient}
            />
          </motion.div>
        </div>

        {/* Transaction Log (Full Width) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <OPALTransactionLog
            transactions={transactions}
            loading={refreshing}
            onLoadMore={handleLoadMoreTransactions}
            hasMore={hasMoreTransactions}
            onExport={handleExportTransactions}
            summary={transactionSummary}
          />
        </motion.div>
      </div>
    </PageLayout>
  );
}
