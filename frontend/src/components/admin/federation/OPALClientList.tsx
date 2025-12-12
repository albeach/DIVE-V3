/**
 * DIVE V3 - OPAL Client List
 * 
 * Table view of connected OPAL clients with status, actions, and filtering.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Search,
  Filter,
  ChevronDown,
  RefreshCw,
  Zap,
  Activity,
  Clock,
  Server,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { IOPALClient, OPALClientStatus } from '@/types/federation.types';

interface OPALClientListProps {
  clients: IOPALClient[];
  loading?: boolean;
  onRefresh?: () => void;
  onPingClient?: (clientId: string) => Promise<void>;
  onForceSyncClient?: (clientId: string) => Promise<void>;
}

// Country flag mapping
const COUNTRY_FLAGS: Record<string, string> = {
  NZL: '🇳🇿',
  AUS: '🇦🇺',
  GBR: '🇬🇧',
  USA: '🇺🇸',
  FRA: '🇫🇷',
  CAN: '🇨🇦',
  DEU: '🇩🇪',
};

const STATUS_CONFIG: Record<OPALClientStatus, {
  icon: typeof CheckCircle2;
  color: string;
  bg: string;
  label: string;
}> = {
  connected: {
    icon: Wifi,
    color: 'text-blue-600',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    label: 'Connected',
  },
  synced: {
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    label: 'Synced',
  },
  behind: {
    icon: AlertTriangle,
    color: 'text-amber-600',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    label: 'Behind',
  },
  stale: {
    icon: AlertTriangle,
    color: 'text-orange-600',
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    label: 'Stale',
  },
  offline: {
    icon: WifiOff,
    color: 'text-red-600',
    bg: 'bg-red-100 dark:bg-red-900/30',
    label: 'Offline',
  },
};

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

type FilterType = 'all' | OPALClientStatus;

export function OPALClientList({
  clients,
  loading,
  onRefresh,
  onPingClient,
  onForceSyncClient,
}: OPALClientListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterType>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Filter clients
  const filteredClients = useMemo(() => {
    let result = clients;

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((c) => c.status === statusFilter);
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (c) =>
          c.clientId.toLowerCase().includes(term) ||
          c.instanceCode?.toLowerCase().includes(term) ||
          c.hostname?.toLowerCase().includes(term)
      );
    }

    return result;
  }, [clients, statusFilter, searchTerm]);

  // Calculate summary
  const summary = useMemo(() => ({
    total: clients.length,
    synced: clients.filter((c) => c.status === 'synced').length,
    connected: clients.filter((c) => c.status === 'connected').length,
    behind: clients.filter((c) => c.status === 'behind').length,
    stale: clients.filter((c) => c.status === 'stale').length,
    offline: clients.filter((c) => c.status === 'offline').length,
  }), [clients]);

  const handlePing = async (clientId: string) => {
    if (!onPingClient) return;
    setActionLoading(`ping-${clientId}`);
    try {
      await onPingClient(clientId);
    } finally {
      setActionLoading(null);
    }
  };

  const handleForceSync = async (clientId: string) => {
    if (!onForceSyncClient) return;
    setActionLoading(`sync-${clientId}`);
    try {
      await onForceSyncClient(clientId);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading && clients.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-700 shadow-sm p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-slate-200 dark:bg-gray-800 rounded-xl" />
          <div className="flex-1">
            <div className="h-5 bg-slate-200 dark:bg-gray-800 rounded w-40 mb-2" />
            <div className="h-4 bg-slate-200 dark:bg-gray-800 rounded w-28" />
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-slate-100 dark:bg-gray-800 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-700 shadow-sm"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-slate-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
            <Users className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">Connected Clients</h3>
            <p className="text-sm text-slate-500 dark:text-gray-400">
              {clients.length} client{clients.length !== 1 ? 's' : ''} registered
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search clients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 w-48 border border-slate-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          {/* Filter */}
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-gray-700 rounded-lg text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Filter className="w-4 h-4" />
              {statusFilter === 'all' ? 'All' : STATUS_CONFIG[statusFilter]?.label || statusFilter}
              <ChevronDown className="w-4 h-4" />
            </button>

            <AnimatePresence>
              {showFilterMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg shadow-lg z-10"
                >
                  <button
                    onClick={() => {
                      setStatusFilter('all');
                      setShowFilterMenu(false);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm rounded-t-lg ${
                      statusFilter === 'all'
                        ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-600'
                        : 'text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    All ({summary.total})
                  </button>
                  {(['synced', 'connected', 'behind', 'stale', 'offline'] as OPALClientStatus[]).map((status) => {
                    const count = clients.filter((c) => c.status === status).length;
                    return (
                      <button
                        key={status}
                        onClick={() => {
                          setStatusFilter(status);
                          setShowFilterMenu(false);
                        }}
                        className={`w-full px-4 py-2 text-left text-sm last:rounded-b-lg ${
                          statusFilter === status
                            ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-600'
                            : 'text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <span className="flex items-center justify-between">
                          {STATUS_CONFIG[status].label}
                          <span className="text-xs text-slate-400">({count})</span>
                        </span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Refresh */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2 border border-slate-200 dark:border-gray-700 rounded-lg text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Summary Bar */}
      <div className="flex items-center gap-4 px-6 py-3 bg-slate-50 dark:bg-gray-800/50 border-b border-slate-200 dark:border-gray-700 text-sm">
        <span className="text-slate-600 dark:text-gray-400">
          {summary.total} clients:
        </span>
        <span className="flex items-center gap-1 text-emerald-600">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {summary.synced} synced
        </span>
        {summary.behind > 0 && (
          <span className="flex items-center gap-1 text-amber-600">
            <AlertTriangle className="w-3.5 h-3.5" />
            {summary.behind} behind
          </span>
        )}
        {summary.offline > 0 && (
          <span className="flex items-center gap-1 text-red-600">
            <WifiOff className="w-3.5 h-3.5" />
            {summary.offline} offline
          </span>
        )}
      </div>

      {/* Client List */}
      <div className="divide-y divide-slate-200 dark:divide-gray-700">
        {filteredClients.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-gray-400">No clients found</p>
            {(statusFilter !== 'all' || searchTerm) && (
              <button
                onClick={() => {
                  setStatusFilter('all');
                  setSearchTerm('');
                }}
                className="text-sm text-purple-600 hover:underline mt-2"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          filteredClients.map((client) => {
            const config = STATUS_CONFIG[client.status];
            const StatusIcon = config.icon;
            const flag = COUNTRY_FLAGS[client.instanceCode || ''] || '🌐';

            return (
              <motion.div
                key={client.clientId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                {/* Client Info */}
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  {/* Flag + Status */}
                  <div className="relative">
                    <span className="text-2xl">{flag}</span>
                    <div className={`absolute -bottom-1 -right-1 p-1 rounded-full ${config.bg}`}>
                      <StatusIcon className={`w-3 h-3 ${config.color}`} />
                    </div>
                  </div>

                  {/* Details */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 dark:text-white truncate">
                        {client.clientId}
                      </span>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${config.bg} ${config.color}`}>
                        {config.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-gray-400 mt-1">
                      {client.instanceCode && (
                        <span className="flex items-center gap-1">
                          <Server className="w-3.5 h-3.5" />
                          {client.instanceCode}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5" />
                        v{client.version}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatTimeAgo(client.lastHeartbeat)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {onPingClient && (
                    <button
                      onClick={() => handlePing(client.clientId)}
                      disabled={actionLoading === `ping-${client.clientId}` || client.status === 'offline'}
                      className="px-3 py-1.5 text-sm border border-slate-200 dark:border-gray-700 rounded-lg text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === `ping-${client.clientId}` ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        'Ping'
                      )}
                    </button>
                  )}
                  {onForceSyncClient && (
                    <button
                      onClick={() => handleForceSync(client.clientId)}
                      disabled={actionLoading === `sync-${client.clientId}` || client.status === 'offline'}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === `sync-${client.clientId}` ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          Sync
                        </>
                      )}
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </motion.div>
  );
}

export default OPALClientList;

