/**
 * DIVE V3 - OPAL Transaction Log
 * 
 * Timeline view of OPAL policy transactions with filtering and export.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Download,
  Filter,
  ChevronDown,
  Clock,
  Upload,
  Send,
  Database,
  FileText,
  Zap,
} from 'lucide-react';
import { IOPALTransaction, OPALTransactionType, OPALTransactionStatus } from '@/types/federation.types';

interface OPALTransactionLogProps {
  transactions: IOPALTransaction[];
  loading?: boolean;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  onExport?: (format: 'csv' | 'json') => Promise<void>;
  summary?: {
    totalPublishes: number;
    totalSyncs: number;
    successRate: number;
    lastSuccessfulSync?: string;
    lastFailedSync?: string;
  };
}

const TYPE_CONFIG: Record<OPALTransactionType, {
  icon: typeof Upload;
  color: string;
  bg: string;
  label: string;
}> = {
  publish: {
    icon: Upload,
    color: 'text-purple-600',
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    label: 'Publish',
  },
  sync: {
    icon: Send,
    color: 'text-blue-600',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    label: 'Sync',
  },
  refresh: {
    icon: RefreshCw,
    color: 'text-emerald-600',
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    label: 'Refresh',
  },
  data_update: {
    icon: Database,
    color: 'text-amber-600',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    label: 'Data Update',
  },
  policy_update: {
    icon: FileText,
    color: 'text-indigo-600',
    bg: 'bg-indigo-100 dark:bg-indigo-900/30',
    label: 'Policy Update',
  },
};

const STATUS_CONFIG: Record<OPALTransactionStatus, {
  icon: typeof CheckCircle2;
  color: string;
}> = {
  success: {
    icon: CheckCircle2,
    color: 'text-emerald-600',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-600',
  },
  pending: {
    icon: Clock,
    color: 'text-amber-600',
  },
  partial: {
    icon: AlertTriangle,
    color: 'text-orange-600',
  },
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

type FilterType = 'all' | OPALTransactionType;

export function OPALTransactionLog({
  transactions,
  loading,
  onLoadMore,
  hasMore,
  onExport,
  summary,
}: OPALTransactionLogProps) {
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Group transactions by date
  const groupedTransactions = useMemo(() => {
    const filtered = transactions.filter((txn) => {
      if (typeFilter === 'all') return true;
      return txn.type === typeFilter;
    });

    const groups: Record<string, IOPALTransaction[]> = {};

    filtered.forEach((txn) => {
      const dateKey = formatDate(txn.timestamp);
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(txn);
    });

    return groups;
  }, [transactions, typeFilter]);

  const handleLoadMore = async () => {
    if (!onLoadMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await onLoadMore();
    } finally {
      setLoadingMore(false);
    }
  };

  const handleExport = async (format: 'csv' | 'json') => {
    if (!onExport) return;
    setExporting(true);
    try {
      await onExport(format);
    } finally {
      setExporting(false);
    }
  };

  if (loading && transactions.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-700 shadow-sm p-6">
        <div className="animate-pulse space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-200 dark:bg-gray-800 rounded-xl" />
            <div className="h-5 bg-slate-200 dark:bg-gray-800 rounded w-36" />
          </div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              <div className="w-8 h-8 bg-slate-100 dark:bg-gray-800 rounded-full" />
              <div className="flex-1">
                <div className="h-4 bg-slate-100 dark:bg-gray-800 rounded w-3/4" />
                <div className="h-3 bg-slate-100 dark:bg-gray-800 rounded w-1/2 mt-2" />
              </div>
            </div>
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
      <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
            <History className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">Transaction Log</h3>
            <p className="text-sm text-slate-500 dark:text-gray-400">
              {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-gray-700 rounded-lg text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Filter className="w-4 h-4" />
              {typeFilter === 'all' ? 'All Types' : TYPE_CONFIG[typeFilter]?.label || typeFilter}
              <ChevronDown className="w-4 h-4" />
            </button>

            <AnimatePresence>
              {showFilterMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute right-0 mt-2 w-44 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg shadow-lg z-10"
                >
                  <button
                    onClick={() => {
                      setTypeFilter('all');
                      setShowFilterMenu(false);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm rounded-t-lg ${
                      typeFilter === 'all'
                        ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600'
                        : 'text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    All Types
                  </button>
                  {(['publish', 'sync', 'refresh', 'data_update', 'policy_update'] as OPALTransactionType[]).map((type) => {
                    const config = TYPE_CONFIG[type];
                    const Icon = config.icon;
                    return (
                      <button
                        key={type}
                        onClick={() => {
                          setTypeFilter(type);
                          setShowFilterMenu(false);
                        }}
                        className={`w-full px-4 py-2 text-left text-sm last:rounded-b-lg ${
                          typeFilter === type
                            ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600'
                            : 'text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${config.color}`} />
                          {config.label}
                        </span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Export Button */}
          {onExport && (
            <div className="relative group">
              <button
                disabled={exporting}
                className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-gray-700 rounded-lg text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {exporting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Export
              </button>

              <div className="hidden group-hover:block absolute right-0 mt-2 w-32 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
                <button
                  onClick={() => handleExport('json')}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800 rounded-t-lg"
                >
                  JSON
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800 rounded-b-lg"
                >
                  CSV
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-3 gap-4 p-4 border-b border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/50">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{summary.totalPublishes}</div>
            <div className="text-xs text-slate-500 dark:text-gray-400">Publishes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{summary.totalSyncs}</div>
            <div className="text-xs text-slate-500 dark:text-gray-400">Syncs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-600">{summary.successRate.toFixed(1)}%</div>
            <div className="text-xs text-slate-500 dark:text-gray-400">Success Rate</div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="p-4 max-h-[500px] overflow-y-auto">
        {Object.keys(groupedTransactions).length === 0 ? (
          <div className="text-center py-12">
            <History className="w-12 h-12 text-slate-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-gray-400">No transactions to display</p>
            {typeFilter !== 'all' && (
              <button
                onClick={() => setTypeFilter('all')}
                className="text-sm text-indigo-600 hover:underline mt-2"
              >
                Clear filter
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedTransactions).map(([date, dateTxns]) => (
              <div key={date}>
                {/* Date Header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-sm font-semibold text-slate-500 dark:text-gray-400">
                    {date}
                  </span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-gray-700" />
                </div>

                {/* Transactions */}
                <div className="space-y-2 pl-2 border-l-2 border-slate-200 dark:border-gray-700">
                  {dateTxns.map((txn) => {
                    const typeConfig = TYPE_CONFIG[txn.type];
                    const statusConfig = STATUS_CONFIG[txn.status];
                    const TypeIcon = typeConfig.icon;
                    const StatusIcon = statusConfig.icon;

                    return (
                      <motion.div
                        key={txn.transactionId}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="relative flex items-start gap-4 p-3 -ml-3 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        {/* Timeline Dot */}
                        <div className={`p-1.5 rounded-full ${typeConfig.bg} ring-4 ring-white dark:ring-gray-900`}>
                          <TypeIcon className={`w-4 h-4 ${typeConfig.color}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-900 dark:text-white">
                                {typeConfig.label}
                              </span>
                              <StatusIcon className={`w-4 h-4 ${statusConfig.color}`} />
                            </div>
                            <span className="text-sm text-slate-500 dark:text-gray-400 flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {formatTime(txn.timestamp)}
                            </span>
                          </div>

                          {/* Details */}
                          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-slate-500 dark:text-gray-400">
                            {txn.details.bundleVersion && (
                              <span className="flex items-center gap-1">
                                <FileText className="w-3.5 h-3.5" />
                                v{txn.details.bundleVersion}
                              </span>
                            )}
                            {txn.details.affectedClients !== undefined && (
                              <span>
                                {txn.details.successfulClients ?? 0}/{txn.details.affectedClients} clients
                              </span>
                            )}
                            {txn.duration && (
                              <span className="flex items-center gap-1">
                                <Zap className="w-3.5 h-3.5" />
                                {formatDuration(txn.duration)}
                              </span>
                            )}
                            <span className="text-xs text-slate-400 dark:text-gray-500">
                              via {txn.initiatedBy}
                            </span>
                          </div>

                          {/* Error Message */}
                          {txn.details.error && (
                            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
                              {txn.details.error}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load More */}
        {hasMore && onLoadMore && (
          <div className="mt-6 text-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="px-6 py-2 border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {loadingMore ? (
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Loading...
                </span>
              ) : (
                'Load More'
              )}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default OPALTransactionLog;
