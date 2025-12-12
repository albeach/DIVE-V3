/**
 * DIVE V3 - Audit Event History
 * 
 * Timeline view of audit sync events with filtering and export.
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
  Database,
  Zap,
  Trash2,
  Link,
  LinkOff,
} from 'lucide-react';
import { IAuditEvent, AuditEventType } from '@/types/federation.types';

interface AuditEventHistoryProps {
  events: IAuditEvent[];
  loading?: boolean;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  onExport?: (format: 'csv' | 'json') => Promise<void>;
  summary?: {
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    totalEventsProcessed: number;
    lastSuccessfulSync?: string;
    lastFailedSync?: string;
  };
}

const EVENT_TYPE_CONFIG: Record<AuditEventType, {
  icon: typeof CheckCircle2;
  color: string;
  bg: string;
  label: string;
}> = {
  sync_success: {
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    label: 'Sync Successful',
  },
  sync_failed: {
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-100 dark:bg-red-900/30',
    label: 'Sync Failed',
  },
  sync_partial: {
    icon: AlertTriangle,
    color: 'text-amber-600',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    label: 'Partial Sync',
  },
  queue_cleared: {
    icon: Trash2,
    color: 'text-gray-600',
    bg: 'bg-gray-100 dark:bg-gray-800',
    label: 'Queue Cleared',
  },
  queue_overflow: {
    icon: Database,
    color: 'text-orange-600',
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    label: 'Queue Overflow',
  },
  connection_lost: {
    icon: LinkOff,
    color: 'text-red-600',
    bg: 'bg-red-100 dark:bg-red-900/30',
    label: 'Connection Lost',
  },
  connection_restored: {
    icon: Link,
    color: 'text-emerald-600',
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    label: 'Connection Restored',
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

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type FilterType = 'all' | 'success' | 'failed' | 'other';

export function AuditEventHistory({
  events,
  loading,
  onLoadMore,
  hasMore,
  onExport,
  summary,
}: AuditEventHistoryProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Group events by date
  const groupedEvents = useMemo(() => {
    const filtered = events.filter((event) => {
      if (filter === 'all') return true;
      if (filter === 'success') return event.type === 'sync_success';
      if (filter === 'failed') return event.type === 'sync_failed';
      return !['sync_success', 'sync_failed'].includes(event.type);
    });

    const groups: Record<string, IAuditEvent[]> = {};
    
    filtered.forEach((event) => {
      const dateKey = formatDate(event.timestamp);
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(event);
    });

    return groups;
  }, [events, filter]);

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

  if (loading && events.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-700 shadow-sm p-6">
        <div className="animate-pulse space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-200 dark:bg-gray-800 rounded-xl" />
            <div className="h-5 bg-slate-200 dark:bg-gray-800 rounded w-32" />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              <div className="w-8 h-8 bg-slate-100 dark:bg-gray-800 rounded-full" />
              <div className="flex-1">
                <div className="h-4 bg-slate-100 dark:bg-gray-800 rounded w-2/3" />
                <div className="h-3 bg-slate-100 dark:bg-gray-800 rounded w-1/3 mt-2" />
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
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <History className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">Sync History</h3>
            <p className="text-sm text-slate-500 dark:text-gray-400">
              {events.length} event{events.length !== 1 ? 's' : ''}
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
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
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
                  {(['all', 'success', 'failed', 'other'] as FilterType[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => {
                        setFilter(f);
                        setShowFilterMenu(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-gray-800 first:rounded-t-lg last:rounded-b-lg ${
                        filter === f
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600'
                          : 'text-slate-700 dark:text-gray-300'
                      }`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
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
        <div className="grid grid-cols-4 gap-4 p-4 border-b border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/50">
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {summary.totalSyncs}
            </div>
            <div className="text-xs text-slate-500 dark:text-gray-400">Total Syncs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-600">
              {summary.successfulSyncs}
            </div>
            <div className="text-xs text-slate-500 dark:text-gray-400">Successful</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {summary.failedSyncs}
            </div>
            <div className="text-xs text-slate-500 dark:text-gray-400">Failed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {summary.totalEventsProcessed.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 dark:text-gray-400">Events Processed</div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="p-4 max-h-[500px] overflow-y-auto">
        {Object.keys(groupedEvents).length === 0 ? (
          <div className="text-center py-12">
            <History className="w-12 h-12 text-slate-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-gray-400">No events to display</p>
            {filter !== 'all' && (
              <button
                onClick={() => setFilter('all')}
                className="text-sm text-blue-600 hover:underline mt-2"
              >
                Clear filter
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedEvents).map(([date, dateEvents]) => (
              <div key={date}>
                {/* Date Header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-sm font-semibold text-slate-500 dark:text-gray-400">
                    {date}
                  </span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-gray-700" />
                </div>

                {/* Events */}
                <div className="space-y-2 pl-2 border-l-2 border-slate-200 dark:border-gray-700">
                  {dateEvents.map((event) => {
                    const config = EVENT_TYPE_CONFIG[event.type];
                    const Icon = config.icon;

                    return (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="relative flex items-start gap-4 p-3 -ml-3 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        {/* Timeline Dot */}
                        <div className={`p-1.5 rounded-full ${config.bg} ring-4 ring-white dark:ring-gray-900`}>
                          <Icon className={`w-4 h-4 ${config.color}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-4">
                            <span className="font-medium text-slate-900 dark:text-white">
                              {config.label}
                            </span>
                            <span className="text-sm text-slate-500 dark:text-gray-400 flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {formatTime(event.timestamp)}
                            </span>
                          </div>

                          {/* Details */}
                          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-slate-500 dark:text-gray-400">
                            {event.eventCount !== undefined && event.eventCount > 0 && (
                              <span className="flex items-center gap-1">
                                <Database className="w-3.5 h-3.5" />
                                {event.eventCount} events
                              </span>
                            )}
                            {event.duration !== undefined && event.duration > 0 && (
                              <span className="flex items-center gap-1">
                                <Zap className="w-3.5 h-3.5" />
                                {formatDuration(event.duration)}
                              </span>
                            )}
                            {event.bytesTransferred !== undefined && event.bytesTransferred > 0 && (
                              <span>{formatBytes(event.bytesTransferred)}</span>
                            )}
                          </div>

                          {/* Error Message */}
                          {event.error && (
                            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
                              {event.error}
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

export default AuditEventHistory;

