/**
 * DIVE V3 - Hub Connectivity Widget
 * 
 * Real-time display of Hub and OPAL connection status.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Globe2,
  Wifi,
  WifiOff,
  Server,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Activity,
} from 'lucide-react';

export interface IConnectivityStatus {
  hubReachable: boolean;
  opalConnected: boolean;
  lastHeartbeat?: string;
  lastOpalSync?: string;
  hubUrl?: string;
  opalServerUrl?: string;
  latencyMs?: number;
}

interface HubConnectivityWidgetProps {
  connectivity: IConnectivityStatus | null;
  loading?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  
  if (diffSeconds < 10) return 'Just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  return `${Math.floor(diffMinutes / 60)}h ago`;
}

export function HubConnectivityWidget({ 
  connectivity, 
  loading, 
  onRefresh,
  refreshing 
}: HubConnectivityWidgetProps) {
  const hubConnected = connectivity?.hubReachable ?? false;
  const opalConnected = connectivity?.opalConnected ?? false;
  const overallHealthy = hubConnected && opalConnected;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 bg-slate-200 rounded w-40" />
          <div className="h-8 w-8 bg-slate-200 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="h-24 bg-slate-100 rounded-xl" />
          <div className="h-24 bg-slate-100 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className={`bg-white rounded-2xl border shadow-lg p-6 ${
        overallHealthy 
          ? 'border-emerald-200 shadow-emerald-100' 
          : 'border-red-200 shadow-red-100'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${overallHealthy ? 'bg-emerald-100' : 'bg-red-100'}`}>
            {overallHealthy ? (
              <Wifi className="w-5 h-5 text-emerald-600" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-600" />
            )}
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Hub Connectivity</h3>
            <p className={`text-sm ${overallHealthy ? 'text-emerald-600' : 'text-red-600'}`}>
              {overallHealthy ? 'All systems connected' : 'Connection issues detected'}
            </p>
          </div>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Connection Cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Hub Status */}
        <div className={`p-4 rounded-xl border ${
          hubConnected 
            ? 'bg-emerald-50 border-emerald-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Globe2 className={`w-5 h-5 ${hubConnected ? 'text-emerald-600' : 'text-red-600'}`} />
              <span className="font-semibold text-slate-700">Hub</span>
            </div>
            {hubConnected ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
          </div>
          
          <div className={`text-lg font-bold mb-1 ${
            hubConnected ? 'text-emerald-700' : 'text-red-700'
          }`}>
            {hubConnected ? 'Connected' : 'Disconnected'}
          </div>
          
          <div className="text-xs text-slate-500">
            {connectivity?.lastHeartbeat 
              ? `Last heartbeat: ${formatRelativeTime(connectivity.lastHeartbeat)}`
              : 'No heartbeat received'
            }
          </div>
          
          {connectivity?.latencyMs !== undefined && hubConnected && (
            <div className="mt-2 flex items-center gap-1">
              <Activity className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-500">
                {connectivity.latencyMs}ms latency
              </span>
            </div>
          )}
        </div>

        {/* OPAL Status */}
        <div className={`p-4 rounded-xl border ${
          opalConnected 
            ? 'bg-emerald-50 border-emerald-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Server className={`w-5 h-5 ${opalConnected ? 'text-emerald-600' : 'text-red-600'}`} />
              <span className="font-semibold text-slate-700">OPAL</span>
            </div>
            {opalConnected ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
          </div>
          
          <div className={`text-lg font-bold mb-1 ${
            opalConnected ? 'text-emerald-700' : 'text-red-700'
          }`}>
            {opalConnected ? 'Synced' : 'Disconnected'}
          </div>
          
          <div className="text-xs text-slate-500">
            {connectivity?.lastOpalSync 
              ? `Last sync: ${formatRelativeTime(connectivity.lastOpalSync)}`
              : 'No sync data'
            }
          </div>
        </div>
      </div>

      {/* Overall Status Bar */}
      <div className={`mt-4 p-3 rounded-lg flex items-center justify-between ${
        overallHealthy ? 'bg-emerald-50' : 'bg-amber-50'
      }`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            overallHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
          }`} />
          <span className={`text-sm font-medium ${
            overallHealthy ? 'text-emerald-700' : 'text-amber-700'
          }`}>
            {overallHealthy 
              ? 'Federation link operational' 
              : 'Operating in degraded mode'
            }
          </span>
        </div>
        {!overallHealthy && (
          <span className="text-xs text-amber-600">
            Using local policy cache
          </span>
        )}
      </div>
    </motion.div>
  );
}

export default HubConnectivityWidget;
