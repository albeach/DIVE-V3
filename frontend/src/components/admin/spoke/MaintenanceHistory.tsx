/**
 * DIVE V3 - Maintenance History
 * 
 * Displays past maintenance windows with duration and reason.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wrench,
  Clock,
  Calendar,
  RefreshCw,
  CheckCircle2,
  Timer,
  AlertCircle,
} from 'lucide-react';
import { IMaintenanceEvent } from '@/types/federation.types';

interface MaintenanceHistoryProps {
  history: IMaintenanceEvent[];
  currentSession: IMaintenanceEvent | null;
  loading?: boolean;
  onRefresh?: () => Promise<void>;
}

function formatDateTime(dateStr: string): { date: string; time: string } {
  const date = new Date(dateStr);
  return {
    date: date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    }),
    time: date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    }),
  };
}

function formatDuration(ms?: number): string {
  if (!ms) return 'N/A';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remainingMinutes}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatTimeRange(enteredAt: string, exitedAt?: string): string {
  const entered = formatDateTime(enteredAt);
  if (!exitedAt) {
    return `${entered.time} - ongoing`;
  }
  const exited = formatDateTime(exitedAt);
  if (entered.date === exited.date) {
    return `${entered.time} - ${exited.time}`;
  }
  return `${entered.date} ${entered.time} - ${exited.date} ${exited.time}`;
}

export function MaintenanceHistory({ 
  history, 
  currentSession,
  loading, 
  onRefresh,
}: MaintenanceHistoryProps) {
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
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
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const allEvents = [
    ...(currentSession ? [{ ...currentSession, isActive: true }] : []),
    ...history.map(h => ({ ...h, isActive: false })),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-100">
            <Calendar className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Maintenance History</h3>
            <p className="text-sm text-slate-500">
              {history.length} past window{history.length !== 1 ? 's' : ''}
              {currentSession && ' + 1 active'}
            </p>
          </div>
        </div>

        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* History List */}
      {allEvents.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Wrench className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="font-medium">No maintenance history</p>
          <p className="text-sm mt-1">Past maintenance windows will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {allEvents.map((event, index) => {
              const isActive = 'isActive' in event && event.isActive;
              const { date } = formatDateTime(event.enteredAt);

              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.05 }}
                  className={`p-4 rounded-xl border ${
                    isActive 
                      ? 'bg-amber-50 border-amber-300' 
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Status Badge */}
                      <div className="flex items-center gap-2 mb-2">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500 text-white">
                            <AlertCircle className="w-3 h-3" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                            <CheckCircle2 className="w-3 h-3" />
                            Completed
                          </span>
                        )}
                        <span className="text-xs text-slate-500">{date}</span>
                      </div>

                      {/* Reason */}
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {event.reason || 'No reason provided'}
                      </p>

                      {/* Time Range */}
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimeRange(event.enteredAt, event.exitedAt)}
                        </span>
                        {event.exitReason && (
                          <span className="text-slate-400">
                            Exit: {event.exitReason}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Duration */}
                    <div className="flex-shrink-0 text-right">
                      <div className="flex items-center gap-1 text-slate-600">
                        <Timer className="w-4 h-4" />
                        <span className="font-semibold text-lg">
                          {formatDuration(event.duration)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">duration</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Summary Stats */}
      {history.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-lg font-bold text-slate-800">{history.length}</p>
              <p className="text-xs text-slate-500">Total Windows</p>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800">
                {formatDuration(
                  history.reduce((sum, h) => sum + (h.duration || 0), 0) / history.length
                )}
              </p>
              <p className="text-xs text-slate-500">Avg Duration</p>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800">
                {formatDuration(
                  Math.max(...history.map(h => h.duration || 0))
                )}
              </p>
              <p className="text-xs text-slate-500">Longest</p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default MaintenanceHistory;
