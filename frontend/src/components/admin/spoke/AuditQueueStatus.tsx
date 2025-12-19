/**
 * DIVE V3 - Audit Queue Status
 * 
 * Displays audit queue depth and sync controls.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Upload,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  RefreshCw,
} from 'lucide-react';

export interface IAuditQueueInfo {
  queueSize: number;
  oldestEntry?: string;
  newestEntry?: string;
  lastSyncAttempt?: string;
  lastSyncSuccess?: string;
  pendingBytes: number;
  state: 'idle' | 'syncing' | 'error' | 'blocked';
}

interface AuditQueueStatusProps {
  queue: IAuditQueueInfo | null;
  loading?: boolean;
  onSync?: () => Promise<void | unknown>;
  onClear?: () => Promise<void>;
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  return `${diffHours}h ago`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function AuditQueueStatus({ 
  queue, 
  loading,
  onSync,
  onClear 
}: AuditQueueStatusProps) {
  const [syncing, setSyncing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleSync = async () => {
    if (!onSync) return;
    setSyncing(true);
    try {
      await onSync();
    } finally {
      setSyncing(false);
    }
  };

  const handleClear = async () => {
    if (!onClear) return;
    setClearing(true);
    try {
      await onClear();
      setShowClearConfirm(false);
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-slate-200 rounded-xl" />
          <div className="h-6 bg-slate-200 rounded w-32" />
        </div>
        <div className="h-24 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  const queueSize = queue?.queueSize || 0;
  const isBlocked = queue?.state === 'blocked';
  const isError = queue?.state === 'error';
  const isSyncing = queue?.state === 'syncing' || syncing;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className={`rounded-2xl border shadow-lg p-6 ${
        isBlocked || isError
          ? 'bg-red-50 border-red-200 shadow-red-100'
          : queueSize > 100
          ? 'bg-amber-50 border-amber-200 shadow-amber-100'
          : 'bg-white border-slate-200'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${
            isBlocked || isError
              ? 'bg-red-100'
              : queueSize > 100
              ? 'bg-amber-100'
              : 'bg-blue-100'
          }`}>
            <FileText className={`w-5 h-5 ${
              isBlocked || isError
                ? 'text-red-600'
                : queueSize > 100
                ? 'text-amber-600'
                : 'text-blue-600'
            }`} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Audit Queue</h3>
            <p className="text-sm text-slate-500">Pending audit events</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {onSync && (
            <button
              onClick={handleSync}
              disabled={syncing || isSyncing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Upload className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          )}
        </div>
      </div>

      {/* Queue Visualization */}
      <div className="flex items-center justify-center p-6 bg-slate-50 rounded-xl mb-4">
        <div className="text-center">
          <motion.div
            key={queueSize}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            className={`text-5xl font-bold mb-2 ${
              isBlocked || isError
                ? 'text-red-600'
                : queueSize > 100
                ? 'text-amber-600'
                : queueSize > 0
                ? 'text-blue-600'
                : 'text-emerald-600'
            }`}
          >
            {queueSize}
          </motion.div>
          <p className="text-sm text-slate-500">
            {queueSize === 0 ? 'Queue is empty' : `Event${queueSize !== 1 ? 's' : ''} pending`}
          </p>
          {queue && queue.pendingBytes > 0 && (
            <p className="text-xs text-slate-400 mt-1">
              {formatBytes(queue.pendingBytes)} total
            </p>
          )}
        </div>
      </div>

      {/* Status Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="p-3 bg-white border border-slate-200 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500">Last Sync</span>
          </div>
          <div className="flex items-center gap-2">
            {queue?.lastSyncSuccess ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            )}
            <span className="text-sm font-medium text-slate-700">
              {formatRelativeTime(queue?.lastSyncSuccess)}
            </span>
          </div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500">Queue State</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              queue?.state === 'idle' ? 'bg-emerald-500' :
              queue?.state === 'syncing' ? 'bg-blue-500 animate-pulse' :
              queue?.state === 'blocked' ? 'bg-red-500' :
              'bg-amber-500'
            }`} />
            <span className="text-sm font-medium text-slate-700 capitalize">
              {queue?.state || 'Unknown'}
            </span>
          </div>
        </div>
      </div>

      {/* Oldest/Newest Entry */}
      {queueSize > 0 && (
        <div className="p-3 bg-slate-50 rounded-lg text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Oldest: <span className="font-medium">{formatRelativeTime(queue?.oldestEntry)}</span></span>
            <span>Newest: <span className="font-medium">{formatRelativeTime(queue?.newestEntry)}</span></span>
          </div>
        </div>
      )}

      {/* Warning for large queues */}
      {queueSize > 100 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 p-3 bg-amber-100 border border-amber-300 rounded-lg flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">Large queue detected</p>
            <p className="text-xs text-amber-600">
              Consider syncing or checking hub connectivity
            </p>
          </div>
        </motion.div>
      )}

      {/* Clear Queue */}
      {onClear && queueSize > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4" />
            Clear Queue (destructive)
          </button>
        </div>
      )}

      {/* Clear Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowClearConfirm(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-2xl shadow-2xl z-50 p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 rounded-lg">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Clear Audit Queue?</h3>
                  <p className="text-sm text-slate-500">{queueSize} events will be lost</p>
                </div>
              </div>

              <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-6">
                <p className="text-sm text-red-700">
                  <strong>Warning:</strong> This action is irreversible. All queued audit events
                  will be permanently deleted without being synced to the Hub.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  disabled={clearing}
                  className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClear}
                  disabled={clearing}
                  className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {clearing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Clearing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Clear Queue
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

export default AuditQueueStatus;
