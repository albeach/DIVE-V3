/**
 * DIVE V3 - Sync Status Dashboard
 * 
 * Dashboard showing policy sync status across all federation spokes.
 * Supports force sync for individual spokes or all at once.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  WifiOff,
  Loader2,
  ArrowUpCircle,
} from 'lucide-react';
import {
  ISyncStatusResponse,
  ISpokeSyncStatus,
  SyncStatus,
  IPolicyVersion,
} from '@/types/federation.types';

interface SyncStatusDashboardProps {
  syncStatus: ISyncStatusResponse | null;
  loading?: boolean;
  onRefresh?: () => void;
  onForceSync?: (spokeId: string) => Promise<void>;
  onForceSyncAll?: () => Promise<void>;
}

const STATUS_CONFIG: Record<SyncStatus, {
  label: string;
  color: string;
  bg: string;
  icon: typeof CheckCircle2;
}> = {
  current: {
    label: 'Current',
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
    label: 'Critical',
    color: 'text-red-600',
    bg: 'bg-red-50 border-red-200',
    icon: XCircle,
  },
  offline: {
    label: 'Offline',
    color: 'text-slate-500',
    bg: 'bg-slate-50 border-slate-200',
    icon: WifiOff,
  },
};

const COUNTRY_FLAGS: Record<string, string> = {
  'USA': '🇺🇸',
  'FRA': '🇫🇷',
  'GBR': '🇬🇧',
  'DEU': '🇩🇪',
  'NZL': '🇳🇿',
  'AUS': '🇦🇺',
  'CAN': '🇨🇦',
  'JPN': '🇯🇵',
};

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function SyncStatusDashboard({
  syncStatus,
  loading,
  onRefresh,
  onForceSync,
  onForceSyncAll,
}: SyncStatusDashboardProps) {
  const [syncingSpokes, setSyncingSpokes] = useState<Set<string>>(new Set());
  const [syncingAll, setSyncingAll] = useState(false);

  const handleForceSync = async (spokeId: string) => {
    if (!onForceSync || syncingSpokes.has(spokeId)) return;
    
    setSyncingSpokes((prev) => new Set([...prev, spokeId]));
    try {
      await onForceSync(spokeId);
    } finally {
      setSyncingSpokes((prev) => {
        const next = new Set(prev);
        next.delete(spokeId);
        return next;
      });
    }
  };

  const handleForceSyncAll = async () => {
    if (!onForceSyncAll || syncingAll) return;
    
    setSyncingAll(true);
    try {
      await onForceSyncAll();
    } finally {
      setSyncingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 animate-pulse">
        <div className="flex items-center justify-between mb-6">
          <div className="h-6 bg-slate-200 rounded w-48" />
          <div className="h-8 bg-slate-200 rounded w-24" />
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const summary = syncStatus?.summary || {
    total: 0,
    current: 0,
    behind: 0,
    stale: 0,
    offline: 0,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h3 className="font-bold text-slate-900 text-lg">Policy Sync Status</h3>
          {syncStatus?.currentVersion && (
            <p className="text-sm text-slate-500 mt-1">
              Hub Version: <strong>{syncStatus.currentVersion.version}</strong>
              <span className="mx-2">•</span>
              {formatRelativeTime(syncStatus.currentVersion.timestamp)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onForceSyncAll && (
            <button
              onClick={handleForceSyncAll}
              disabled={syncingAll || !syncStatus?.spokes?.length}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
            >
              {syncingAll ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowUpCircle className="w-4 h-4" />
              )}
              Sync All
            </button>
          )}
          
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div className="p-3 bg-slate-50 rounded-lg text-center">
          <p className="text-2xl font-bold text-slate-800">{summary.total}</p>
          <p className="text-xs text-slate-500">Total</p>
        </div>
        <div className="p-3 bg-emerald-50 rounded-lg text-center border border-emerald-200">
          <p className="text-2xl font-bold text-emerald-600">{summary.current}</p>
          <p className="text-xs text-emerald-600">Current</p>
        </div>
        <div className="p-3 bg-amber-50 rounded-lg text-center border border-amber-200">
          <p className="text-2xl font-bold text-amber-600">{summary.behind}</p>
          <p className="text-xs text-amber-600">Behind</p>
        </div>
        <div className="p-3 bg-orange-50 rounded-lg text-center border border-orange-200">
          <p className="text-2xl font-bold text-orange-600">{summary.stale}</p>
          <p className="text-xs text-orange-600">Stale</p>
        </div>
        <div className="p-3 bg-slate-100 rounded-lg text-center border border-slate-200">
          <p className="text-2xl font-bold text-slate-600">{summary.offline}</p>
          <p className="text-xs text-slate-500">Offline</p>
        </div>
      </div>

      {/* Status Legend */}
      <div className="flex flex-wrap gap-3 mb-4 p-3 bg-slate-50 rounded-lg">
        {Object.entries(STATUS_CONFIG).map(([key, config]) => {
          const Icon = config.icon;
          return (
            <div key={key} className="flex items-center gap-1.5 text-sm">
              <Icon className={`w-4 h-4 ${config.color}`} />
              <span className={config.color}>{config.label}</span>
            </div>
          );
        })}
      </div>

      {/* Spoke List */}
      {syncStatus?.spokes && syncStatus.spokes.length > 0 ? (
        <div className="space-y-2">
          {syncStatus.spokes.map((spoke, index) => (
            <SpokeRow
              key={spoke.spokeId}
              spoke={spoke}
              hubVersion={syncStatus.currentVersion}
              index={index}
              isSyncing={syncingSpokes.has(spoke.spokeId)}
              onForceSync={onForceSync ? () => handleForceSync(spoke.spokeId) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <WifiOff className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No Spokes Registered</p>
          <p className="text-sm text-slate-500 mt-1">
            Spokes will appear here once they connect to the hub
          </p>
        </div>
      )}
    </motion.div>
  );
}

interface SpokeRowProps {
  spoke: ISpokeSyncStatus;
  hubVersion: IPolicyVersion;
  index: number;
  isSyncing: boolean;
  onForceSync?: () => void;
}

function SpokeRow({ spoke, hubVersion, index, isSyncing, onForceSync }: SpokeRowProps) {
  const config = STATUS_CONFIG[spoke.status];
  const Icon = config.icon;
  const flag = COUNTRY_FLAGS[spoke.instanceCode] || '🌐';

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`flex items-center justify-between p-4 rounded-xl border ${config.bg} transition-all hover:shadow-md`}
    >
      <div className="flex items-center gap-4">
        {/* Flag & Icon */}
        <div className="flex items-center gap-2">
          <span className="text-2xl">{flag}</span>
          <Icon className={`w-5 h-5 ${config.color}`} />
        </div>

        {/* Spoke Info */}
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">{spoke.instanceCode}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.color} bg-white/50`}>
              {config.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
            <span>
              Version: <span className="font-mono">{spoke.currentVersion || 'N/A'}</span>
            </span>
            {spoke.versionsBehind > 0 && (
              <span className="text-amber-600 font-medium">
                ({spoke.versionsBehind} behind)
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Last Sync */}
        <div className="text-right hidden sm:block">
          <p className="text-xs text-slate-500">Last Sync</p>
          <p className="text-sm font-medium text-slate-700">
            {formatRelativeTime(spoke.lastSyncTime)}
          </p>
        </div>

        {/* Force Sync Button */}
        {onForceSync && spoke.status !== 'offline' && (
          <button
            onClick={onForceSync}
            disabled={isSyncing}
            className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Sync
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default SyncStatusDashboard;




