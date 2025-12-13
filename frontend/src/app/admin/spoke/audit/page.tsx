/**
 * DIVE V3 - Spoke Audit Queue Management Page
 * 
 * Comprehensive audit queue management for spoke administrators.
 * Features queue status, sync controls, and event history.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  RefreshCw,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import { AuditQueueStatus, IAuditQueueInfo } from '@/components/admin/spoke/AuditQueueStatus';
import { AuditSyncControl } from '@/components/admin/spoke/AuditSyncControl';
import { AuditEventHistory } from '@/components/admin/spoke/AuditEventHistory';
import {
  IAuditEvent,
  IAuditHistoryResponse,
  IAuditSyncResult,
  IAuditExportOptions,
  AuditQueueState,
} from '@/types/federation.types';

const POLLING_INTERVAL = 15000; // 15 seconds

export default function AuditPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [queueInfo, setQueueInfo] = useState<IAuditQueueInfo | null>(null);
  const [history, setHistory] = useState<IAuditEvent[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [summary, setSummary] = useState<IAuditHistoryResponse['summary']>();
  const [error, setError] = useState<string | null>(null);

  // Fetch queue status
  const fetchQueueStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/spoke/audit/status');
      if (!response.ok) throw new Error('Failed to fetch queue status');
      
      const data = await response.json();
      
      // Map state to queue info format
      const stateMap: Record<string, AuditQueueState> = {
        idle: 'idle',
        syncing: 'syncing',
        error: 'error',
        blocked: 'blocked',
      };
      
      setQueueInfo({
        queueSize: data.queueSize || 0,
        oldestEntry: data.oldestEntry,
        newestEntry: data.newestEntry,
        lastSyncAttempt: data.lastSyncAttempt,
        lastSyncSuccess: data.lastSyncSuccess,
        pendingBytes: data.pendingBytes || 0,
        state: stateMap[data.state] || 'idle',
      });
    } catch (err) {
      console.error('Error fetching queue status:', err);
      setError('Failed to fetch queue status');
    }
  }, []);

  // Fetch event history
  const fetchHistory = useCallback(async (offset: number = 0) => {
    try {
      const response = await fetch(`/api/spoke/audit/history?limit=50&offset=${offset}`);
      if (!response.ok) throw new Error('Failed to fetch history');
      
      const data: IAuditHistoryResponse = await response.json();
      
      if (offset === 0) {
        setHistory(data.events);
      } else {
        setHistory(prev => [...prev, ...data.events]);
      }
      
      setHistoryTotal(data.total);
      setSummary(data.summary);
    } catch (err) {
      console.error('Error fetching history:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      
      await Promise.all([
        fetchQueueStatus(),
        fetchHistory(),
      ]);
      
      setLoading(false);
    };

    loadData();
  }, [fetchQueueStatus, fetchHistory]);

  // Polling
  useEffect(() => {
    const interval = setInterval(() => {
      fetchQueueStatus();
    }, POLLING_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchQueueStatus]);

  // Handle manual refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchQueueStatus(),
      fetchHistory(),
    ]);
    setRefreshing(false);
  };

  // Handle sync now
  const handleSyncNow = useCallback(async (): Promise<IAuditSyncResult> => {
    try {
      const response = await fetch('/api/spoke/audit/sync', { method: 'POST' });
      const data = await response.json();
      
      if (response.ok && data.success) {
        // Refresh data after sync
        await Promise.all([fetchQueueStatus(), fetchHistory()]);
        
        return {
          success: true,
          eventsProcessed: data.result?.syncedCount || 0,
          duration: data.result?.durationMs,
        };
      }
      
      return {
        success: false,
        error: data.error || 'Sync failed',
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Sync failed',
      };
    }
  }, [fetchQueueStatus, fetchHistory]);

  // Handle clear queue
  const handleClearQueue = useCallback(async () => {
    try {
      const response = await fetch('/api/spoke/audit/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'yes' }),
      });
      
      if (response.ok) {
        await Promise.all([fetchQueueStatus(), fetchHistory()]);
      }
    } catch (err) {
      console.error('Failed to clear queue:', err);
    }
  }, [fetchQueueStatus, fetchHistory]);

  // Handle export
  const handleExport = useCallback(async (options: IAuditExportOptions): Promise<Blob> => {
    const response = await fetch(`/api/spoke/audit/export?format=${options.format}`);
    return await response.blob();
  }, []);

  // Handle load more history
  const handleLoadMore = useCallback(async () => {
    await fetchHistory(history.length);
  }, [fetchHistory, history.length]);

  // Handle history export
  const handleHistoryExport = useCallback(async (format: 'csv' | 'json') => {
    const blob = await handleExport({ format });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-history-${new Date().toISOString().split('T')[0]}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [handleExport]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-6">
            <Link
              href="/admin/spoke"
              className="p-2 text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-white dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                <FileText className="w-8 h-8 text-blue-600" />
                Audit Queue Management
              </h1>
              <p className="text-slate-500 dark:text-gray-400 mt-1">
                Monitor and manage audit event queue synchronization to the Hub
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Status Banner */}
          {queueInfo && (queueInfo.state === 'blocked' || queueInfo.state === 'error') && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl mb-6"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800 dark:text-red-200">
                    {queueInfo.state === 'blocked' ? 'Hub Connection Lost' : 'Sync Error Detected'}
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    Audit events are being queued locally. They will be synced when connectivity is restored.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {queueInfo && queueInfo.state === 'idle' && queueInfo.queueSize === 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl mb-6"
            >
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <p className="text-emerald-800 dark:text-emerald-200">
                  Audit queue is empty. All events have been synced to the Hub.
                </p>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Error State */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl mb-6"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <p className="text-red-800 dark:text-red-200">{error}</p>
            </div>
          </motion.div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Queue Status & Sync Controls */}
          <div className="lg:col-span-1 space-y-6">
            {/* Queue Status */}
            <AuditQueueStatus
              queue={queueInfo}
              loading={loading}
              onSync={handleSyncNow}
              onClear={handleClearQueue}
            />

            {/* Sync Controls */}
            <AuditSyncControl
              queueState={queueInfo?.state || 'idle'}
              queueSize={queueInfo?.queueSize || 0}
              lastSyncSuccess={queueInfo?.lastSyncSuccess}
              lastSyncAttempt={queueInfo?.lastSyncAttempt}
              autoSyncEnabled={false}
              autoSyncInterval={300}
              onSyncNow={handleSyncNow}
              onExport={handleExport}
              loading={loading}
            />
          </div>

          {/* Right Column - Event History */}
          <div className="lg:col-span-2">
            <AuditEventHistory
              events={history}
              loading={loading}
              onLoadMore={handleLoadMore}
              hasMore={history.length < historyTotal}
              onExport={handleHistoryExport}
              summary={summary}
            />
          </div>
        </div>

        {/* Auto-refresh indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 text-center"
        >
          <p className="text-sm text-slate-400 dark:text-gray-500">
            Auto-refreshing every {POLLING_INTERVAL / 1000} seconds
          </p>
        </motion.div>
      </div>
    </div>
  );
}




