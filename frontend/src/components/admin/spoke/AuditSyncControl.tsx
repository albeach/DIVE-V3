/**
 * DIVE V3 - Audit Sync Control
 * 
 * Enhanced sync controls for audit queue with scheduling and export options.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Download,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Settings,
  Play,
  Pause,
  X,
} from 'lucide-react';
import { AuditQueueState, IAuditSyncResult, IAuditExportOptions } from '@/types/federation.types';

interface AuditSyncControlProps {
  queueState: AuditQueueState;
  queueSize: number;
  lastSyncSuccess?: string;
  lastSyncAttempt?: string;
  autoSyncEnabled?: boolean;
  autoSyncInterval?: number; // seconds
  onSyncNow: () => Promise<IAuditSyncResult>;
  onExport?: (options: IAuditExportOptions) => Promise<Blob>;
  onScheduleChange?: (enabled: boolean, interval: number) => Promise<void>;
  loading?: boolean;
}

const SYNC_INTERVALS = [
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
];

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export function AuditSyncControl({
  queueState,
  queueSize,
  lastSyncSuccess,
  lastSyncAttempt,
  autoSyncEnabled = false,
  autoSyncInterval = 300,
  onSyncNow,
  onExport,
  onScheduleChange,
  loading,
}: AuditSyncControlProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<IAuditSyncResult | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedInterval, setSelectedInterval] = useState(autoSyncInterval);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('json');
  const [exporting, setExporting] = useState(false);

  const isSyncing = queueState === 'syncing' || syncing;
  const isBlocked = queueState === 'blocked';
  const isError = queueState === 'error';

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);

    try {
      const result = await onSyncNow();
      setSyncResult(result);
      
      // Clear result after 5 seconds
      setTimeout(() => setSyncResult(null), 5000);
    } catch (error) {
      setSyncResult({
        success: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      });
    } finally {
      setSyncing(false);
    }
  }, [onSyncNow]);

  const handleScheduleSave = useCallback(async () => {
    if (!onScheduleChange) return;

    try {
      await onScheduleChange(!autoSyncEnabled, selectedInterval);
      setShowScheduleModal(false);
    } catch (error) {
      console.error('Failed to update schedule:', error);
    }
  }, [onScheduleChange, autoSyncEnabled, selectedInterval]);

  const handleExport = useCallback(async () => {
    if (!onExport) return;

    setExporting(true);

    try {
      const blob = await onExport({ format: exportFormat });
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-queue-${new Date().toISOString().split('T')[0]}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setShowExportModal(false);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  }, [onExport, exportFormat]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-slate-200 rounded-xl" />
          <div className="h-5 bg-slate-200 rounded w-32" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 bg-slate-100 rounded-lg flex-1" />
          <div className="h-10 bg-slate-100 rounded-lg w-24" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-700 shadow-sm p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${
            isBlocked || isError ? 'bg-red-100 dark:bg-red-900/30' :
            isSyncing ? 'bg-blue-100 dark:bg-blue-900/30' :
            'bg-emerald-100 dark:bg-emerald-900/30'
          }`}>
            <Upload className={`w-5 h-5 ${
              isBlocked || isError ? 'text-red-600' :
              isSyncing ? 'text-blue-600 animate-bounce' :
              'text-emerald-600'
            }`} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">Sync Controls</h3>
            <p className="text-sm text-slate-500 dark:text-gray-400">
              {queueSize} events pending
            </p>
          </div>
        </div>

        {/* Auto-sync indicator */}
        {autoSyncEnabled && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-full">
            <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
              Auto: {SYNC_INTERVALS.find(i => i.value === autoSyncInterval)?.label || `${autoSyncInterval}s`}
            </span>
          </div>
        )}
      </div>

      {/* Sync Result Banner */}
      <AnimatePresence>
        {syncResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`mb-4 p-3 rounded-lg ${
              syncResult.success 
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {syncResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600" />
              )}
              <span className={`text-sm font-medium ${
                syncResult.success ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
              }`}>
                {syncResult.success 
                  ? `Synced ${syncResult.eventsProcessed || 0} events in ${syncResult.duration || 0}ms`
                  : syncResult.error || 'Sync failed'
                }
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Last Sync Info */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="p-3 bg-slate-50 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-slate-500 dark:text-gray-400">Last Success</span>
          </div>
          <span className="text-sm font-medium text-slate-700 dark:text-gray-300">
            {formatRelativeTime(lastSyncSuccess)}
          </span>
        </div>
        <div className="p-3 bg-slate-50 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500 dark:text-gray-400">Last Attempt</span>
          </div>
          <span className="text-sm font-medium text-slate-700 dark:text-gray-300">
            {formatRelativeTime(lastSyncAttempt)}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        {/* Sync Now */}
        <button
          onClick={handleSyncNow}
          disabled={isSyncing || queueSize === 0}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
            isSyncing || queueSize === 0
              ? 'bg-slate-100 dark:bg-gray-800 text-slate-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isSyncing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Sync Now
            </>
          )}
        </button>

        {/* Schedule */}
        {onScheduleChange && (
          <button
            onClick={() => setShowScheduleModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-300 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Calendar className="w-4 h-4" />
            Schedule
          </button>
        )}

        {/* Export */}
        {onExport && queueSize > 0 && (
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-300 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        )}
      </div>

      {/* Blocked/Error Warning */}
      {(isBlocked || isError) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {isBlocked ? 'Sync Blocked' : 'Sync Error'}
              </p>
              <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                {isBlocked 
                  ? 'Hub connectivity lost. Events are being queued locally.'
                  : 'Check hub connectivity and retry.'}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Schedule Modal */}
      <AnimatePresence>
        {showScheduleModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowScheduleModal(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-50 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Settings className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Sync Schedule
                  </h3>
                </div>
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Enable/Disable */}
                <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    {autoSyncEnabled ? (
                      <Play className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Pause className="w-5 h-5 text-slate-400" />
                    )}
                    <span className="font-medium text-slate-700 dark:text-gray-300">
                      Auto-sync
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedInterval(autoSyncInterval)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      autoSyncEnabled
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {autoSyncEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>

                {/* Interval Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                    Sync Interval
                  </label>
                  <select
                    value={selectedInterval}
                    onChange={(e) => setSelectedInterval(Number(e.target.value))}
                    className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {SYNC_INTERVALS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2 text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleScheduleSave}
                  className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Export Modal */}
      <AnimatePresence>
        {showExportModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowExportModal(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-50 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                    <Download className="w-5 h-5 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Export Queue
                  </h3>
                </div>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-slate-500 dark:text-gray-400 mb-4">
                Export {queueSize} queued events for backup or analysis.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                    Format
                  </label>
                  <div className="flex gap-3">
                    {(['json', 'csv'] as const).map((format) => (
                      <button
                        key={format}
                        onClick={() => setExportFormat(format)}
                        className={`flex-1 px-4 py-2.5 rounded-lg font-medium uppercase transition-colors ${
                          exportFormat === format
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-400 hover:bg-slate-200'
                        }`}
                      >
                        {format}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowExportModal(false)}
                  className="px-4 py-2 text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {exporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Export
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default AuditSyncControl;




