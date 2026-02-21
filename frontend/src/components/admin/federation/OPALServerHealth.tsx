/**
 * DIVE V3 - OPAL Server Health Dashboard
 * 
 * Enhanced OPAL Server health display with uptime, metrics, and configuration.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Server,
  Activity,
  Clock,
  Wifi,
  WifiOff,
  Radio,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Zap,
  ExternalLink,
} from 'lucide-react';
import { IOPALServerStatus } from '@/types/federation.types';

interface OPALServerHealthProps {
  status: IOPALServerStatus | null;
  loading?: boolean;
  onRefresh?: () => void;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatTimeAgo(dateStr?: string): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

export function OPALServerHealth({
  status,
  loading,
  onRefresh,
}: OPALServerHealthProps) {
  if (loading && !status) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-700 shadow-sm p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-slate-200 dark:bg-gray-800 rounded-xl" />
          <div className="flex-1">
            <div className="h-6 bg-slate-200 dark:bg-gray-800 rounded w-40 mb-2" />
            <div className="h-4 bg-slate-200 dark:bg-gray-800 rounded w-28" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-100 dark:bg-gray-800 rounded-xl" />
          ))}
        </div>
        <div className="space-y-4">
          <div className="h-16 bg-slate-100 dark:bg-gray-800 rounded-xl" />
          <div className="h-16 bg-slate-100 dark:bg-gray-800 rounded-xl" />
        </div>
      </div>
    );
  }

  const isHealthy = status?.healthy ?? false;
  const isWebSocketConnected = status?.webSocket.connected ?? false;
  const policyEndpointStatus = status?.policyDataEndpoint.status ?? 'down';

  const getStatusColor = (healthy: boolean) =>
    healthy ? 'emerald' : 'red';
  const getEndpointStatusColor = (endpointStatus: string) => {
    switch (endpointStatus) {
      case 'healthy': return 'emerald';
      case 'degraded': return 'amber';
      default: return 'red';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-700 shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl ${
            isHealthy
              ? 'bg-emerald-100 dark:bg-emerald-900/30'
              : 'bg-red-100 dark:bg-red-900/30'
          }`}>
            <Server className={`w-6 h-6 ${
              isHealthy ? 'text-emerald-600' : 'text-red-600'
            }`} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              OPAL Server
              {isHealthy ? (
                <span className="flex items-center gap-1 text-sm font-normal text-emerald-600">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-2 h-2 rounded-full bg-emerald-500"
                  />
                  Running
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm font-normal text-red-600">
                  <XCircle className="w-4 h-4" />
                  Offline
                </span>
              )}
            </h3>
            <p className="text-sm text-slate-500 dark:text-gray-400">
              Policy distribution server
            </p>
          </div>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-gray-700 rounded-lg text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4 p-6 bg-slate-50 dark:bg-gray-800/50">
        {/* Uptime */}
        <div className="text-center p-4 bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-700">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-slate-500 dark:text-gray-400 uppercase font-medium">Uptime</span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {status ? formatUptime(status.uptime) : '--'}
          </div>
        </div>

        {/* Version */}
        <div className="text-center p-4 bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-700">
          <div className="flex items-center justify-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-slate-500 dark:text-gray-400 uppercase font-medium">Version</span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {status?.version || '--'}
          </div>
        </div>

        {/* Connected Clients */}
        <div className="text-center p-4 bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-700">
          <div className="flex items-center justify-center gap-2 mb-1">
            {isWebSocketConnected ? (
              <Wifi className="w-4 h-4 text-emerald-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
            <span className="text-xs text-slate-500 dark:text-gray-400 uppercase font-medium">Clients</span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {status?.webSocket.clientCount ?? 0}
          </div>
        </div>
      </div>

      {/* Endpoint Status */}
      <div className="p-6 space-y-4">
        {/* Policy Data Endpoint */}
        <div className={`p-4 rounded-xl border ${
          policyEndpointStatus === 'healthy'
            ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'
            : policyEndpointStatus === 'degraded'
            ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
            : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className={`w-5 h-5 ${
                policyEndpointStatus === 'healthy'
                  ? 'text-emerald-600'
                  : policyEndpointStatus === 'degraded'
                  ? 'text-amber-600'
                  : 'text-red-600'
              }`} />
              <span className="font-semibold text-slate-900 dark:text-white">Policy Data Endpoint</span>
            </div>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              policyEndpointStatus === 'healthy'
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                : policyEndpointStatus === 'degraded'
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
            }`}>
              {policyEndpointStatus.charAt(0).toUpperCase() + policyEndpointStatus.slice(1)}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-slate-500 dark:text-gray-400">Requests/min</span>
              <p className="font-medium text-slate-900 dark:text-white">
                {status?.policyDataEndpoint.requestsPerMinute ?? 0}
              </p>
            </div>
            <div>
              <span className="text-slate-500 dark:text-gray-400">Total</span>
              <p className="font-medium text-slate-900 dark:text-white">
                {status?.policyDataEndpoint.totalRequests ?? 0}
              </p>
            </div>
            <div>
              <span className="text-slate-500 dark:text-gray-400">Last Request</span>
              <p className="font-medium text-slate-900 dark:text-white">
                {formatTimeAgo(status?.policyDataEndpoint.lastRequest)}
              </p>
            </div>
          </div>
        </div>

        {/* WebSocket Gateway */}
        <div className={`p-4 rounded-xl border ${
          isWebSocketConnected
            ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'
            : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className={`w-5 h-5 ${
                isWebSocketConnected ? 'text-emerald-600' : 'text-red-600'
              }`} />
              <span className="font-semibold text-slate-900 dark:text-white">WebSocket Gateway</span>
            </div>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              isWebSocketConnected
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
            }`}>
              {isWebSocketConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-slate-500 dark:text-gray-400">Clients</span>
              <p className="font-medium text-slate-900 dark:text-white">
                {status?.webSocket.clientCount ?? 0}
              </p>
            </div>
            <div>
              <span className="text-slate-500 dark:text-gray-400">Messages/min</span>
              <p className="font-medium text-slate-900 dark:text-white">
                {status?.webSocket.messagesPerMinute ?? 0}
              </p>
            </div>
            <div>
              <span className="text-slate-500 dark:text-gray-400">Last Message</span>
              <p className="font-medium text-slate-900 dark:text-white">
                {formatTimeAgo(status?.webSocket.lastMessage)}
              </p>
            </div>
          </div>
        </div>

        {/* Topics */}
        {status?.topics && status.topics.length > 0 && (
          <div className="p-4 bg-slate-50 dark:bg-gray-800/50 rounded-xl border border-slate-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <Radio className="w-4 h-4 text-blue-500" />
              <span className="font-medium text-slate-700 dark:text-gray-300">Subscribed Topics</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {status.topics.map((topic) => (
                <span
                  key={topic}
                  className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm font-medium rounded-full border border-blue-200 dark:border-blue-800"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Server Config */}
        {status?.config && (
          <div className="p-4 bg-slate-50 dark:bg-gray-800/50 rounded-xl border border-slate-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <ExternalLink className="w-4 h-4 text-slate-500" />
              <span className="font-medium text-slate-700 dark:text-gray-300">Server URL</span>
            </div>
            <code className="block px-3 py-2 bg-slate-100 dark:bg-gray-900 text-slate-700 dark:text-gray-300 text-sm font-mono rounded-lg">
              {status.config.serverUrl}
            </code>
          </div>
        )}

        {/* Stats */}
        {status?.stats && (
          <div className="grid grid-cols-4 gap-3 pt-4 border-t border-slate-200 dark:border-gray-700">
            <div className="text-center">
              <div className="text-lg font-bold text-slate-900 dark:text-white">
                {status.stats.totalPublishes}
              </div>
              <div className="text-xs text-slate-500 dark:text-gray-400">Publishes</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-slate-900 dark:text-white">
                {status.stats.totalSyncs}
              </div>
              <div className="text-xs text-slate-500 dark:text-gray-400">Syncs</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-600">
                {status.stats.failedSyncs}
              </div>
              <div className="text-xs text-slate-500 dark:text-gray-400">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-slate-900 dark:text-white">
                {status.stats.averageSyncDurationMs}ms
              </div>
              <div className="text-xs text-slate-500 dark:text-gray-400">Avg Duration</div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default OPALServerHealth;
