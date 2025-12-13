/**
 * DIVE V3 - Policy Sync Status Card
 * 
 * Displays current policy version and sync status.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileCode2,
  GitBranch,
  History,
} from 'lucide-react';
import { SyncStatus } from '@/types/federation.types';

export interface IPolicySyncInfo {
  currentVersion?: string;
  hubVersion?: string;
  lastSyncTime?: string;
  lastSyncSuccess?: boolean;
  versionsBehind: number;
  syncStatus: SyncStatus;
  totalPolicies?: number;
  policiesLoaded?: number;
  cacheValid?: boolean;
}

interface PolicySyncStatusCardProps {
  policyInfo: IPolicySyncInfo | null;
  loading?: boolean;
  onForceSync?: () => Promise<void>;
}

const SYNC_STATUS_CONFIG: Record<SyncStatus, {
  label: string;
  color: string;
  bg: string;
  icon: typeof CheckCircle2;
}> = {
  current: {
    label: 'Up to Date',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 border-emerald-200',
    icon: CheckCircle2,
  },
  behind: {
    label: 'Behind',
    color: 'text-amber-600',
    bg: 'bg-amber-50 border-amber-200',
    icon: Clock,
  },
  stale: {
    label: 'Stale',
    color: 'text-orange-600',
    bg: 'bg-orange-50 border-orange-200',
    icon: AlertTriangle,
  },
  critical_stale: {
    label: 'Critical - Stale',
    color: 'text-red-600',
    bg: 'bg-red-50 border-red-200',
    icon: AlertTriangle,
  },
  offline: {
    label: 'Offline',
    color: 'text-gray-600',
    bg: 'bg-gray-50 border-gray-200',
    icon: AlertTriangle,
  },
};

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

export function PolicySyncStatusCard({ 
  policyInfo, 
  loading,
  onForceSync 
}: PolicySyncStatusCardProps) {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (!onForceSync) return;
    setSyncing(true);
    try {
      await onForceSync();
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-slate-200 rounded-xl" />
          <div className="h-6 bg-slate-200 rounded w-40" />
        </div>
        <div className="space-y-4">
          <div className="h-16 bg-slate-100 rounded-lg" />
          <div className="h-16 bg-slate-100 rounded-lg" />
        </div>
      </div>
    );
  }

  const status = policyInfo?.syncStatus || 'offline';
  const statusConfig = SYNC_STATUS_CONFIG[status];
  const StatusIcon = statusConfig.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-xl">
            <Shield className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Policy Sync</h3>
            <p className="text-sm text-slate-500">OPAL-managed policies</p>
          </div>
        </div>

        {onForceSync && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Force Sync'}
          </button>
        )}
      </div>

      {/* Status Badge */}
      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border mb-6 ${statusConfig.bg}`}>
        <StatusIcon className={`w-4 h-4 ${statusConfig.color}`} />
        <span className={`font-semibold ${statusConfig.color}`}>
          {statusConfig.label}
        </span>
        {policyInfo?.versionsBehind && policyInfo.versionsBehind > 0 && (
          <span className="text-xs bg-white/50 px-2 py-0.5 rounded-full">
            {policyInfo.versionsBehind} version{policyInfo.versionsBehind > 1 ? 's' : ''} behind
          </span>
        )}
      </div>

      {/* Version Info */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="p-4 bg-slate-50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <FileCode2 className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-500 uppercase">Current Version</span>
          </div>
          <code className="text-sm font-mono text-slate-800">
            {policyInfo?.currentVersion?.slice(0, 12) || 'Unknown'}...
          </code>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <GitBranch className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-500 uppercase">Hub Version</span>
          </div>
          <code className="text-sm font-mono text-slate-800">
            {policyInfo?.hubVersion?.slice(0, 12) || 'Unknown'}...
          </code>
        </div>
      </div>

      {/* Sync Info */}
      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
        <div className="flex items-center gap-3">
          <History className="w-5 h-5 text-slate-400" />
          <div>
            <p className="text-sm font-medium text-slate-700">Last Sync</p>
            <p className="text-xs text-slate-500">
              {formatRelativeTime(policyInfo?.lastSyncTime)}
            </p>
          </div>
        </div>
        
        <div className="text-right">
          <p className="text-sm font-medium text-slate-700">
            {policyInfo?.policiesLoaded || 0} Policies
          </p>
          <p className="text-xs text-slate-500">
            {policyInfo?.cacheValid ? 'Cache valid' : 'Cache stale'}
          </p>
        </div>
      </div>

      {/* Warning Banner */}
      {(status === 'stale' || status === 'critical_stale' || status === 'offline') && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              Policy sync required
            </p>
            <p className="text-xs text-amber-600">
              {status === 'offline' 
                ? 'Unable to reach Hub. Operating from local cache.'
                : 'Policies may be outdated. Consider forcing a sync.'
              }
            </p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default PolicySyncStatusCard;




