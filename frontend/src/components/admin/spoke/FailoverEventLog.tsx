/**
 * DIVE V3 - Failover Event Log
 * 
 * Timeline visualization of circuit breaker state transitions.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  ZapOff,
  Activity,
  Clock,
  Filter,
  Download,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  User,
  Bot,
  Server,
} from 'lucide-react';
import { CircuitBreakerState, IFailoverEvent } from '@/types/federation.types';

interface FailoverEventLogProps {
  events: IFailoverEvent[];
  loading?: boolean;
  onRefresh?: () => Promise<void>;
  onExport?: () => void;
}

const STATE_CONFIG: Record<CircuitBreakerState, {
  label: string;
  color: string;
  bg: string;
  icon: typeof Zap;
}> = {
  CLOSED: {
    label: 'Closed',
    color: 'text-emerald-600',
    bg: 'bg-emerald-500',
    icon: Zap,
  },
  HALF_OPEN: {
    label: 'Half Open',
    color: 'text-amber-600',
    bg: 'bg-amber-500',
    icon: Activity,
  },
  OPEN: {
    label: 'Open',
    color: 'text-red-600',
    bg: 'bg-red-500',
    icon: ZapOff,
  },
};

const TRIGGER_CONFIG: Record<string, { label: string; icon: typeof User }> = {
  automatic: { label: 'Automatic', icon: Bot },
  manual: { label: 'Manual', icon: User },
  hub: { label: 'Hub', icon: Server },
};

function formatTimestamp(dateStr: string): { date: string; time: string } {
  const date = new Date(dateStr);
  return {
    date: date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    }),
    time: date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    }),
  };
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function FailoverEventLog({ 
  events, 
  loading, 
  onRefresh,
  onExport 
}: FailoverEventLogProps) {
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [filter, setFilter] = useState<CircuitBreakerState | 'ALL'>('ALL');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const filteredEvents = filter === 'ALL' 
    ? events 
    : events.filter(e => e.newState === filter || e.previousState === filter);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-slate-200 rounded-xl" />
          <div className="h-6 bg-slate-200 rounded w-40" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

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
          <div className="p-2 rounded-xl bg-purple-100">
            <Clock className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Failover Event Log</h3>
            <p className="text-sm text-slate-500">
              {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter Dropdown */}
          <div className="relative">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as CircuitBreakerState | 'ALL')}
              className="appearance-none pl-8 pr-8 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent cursor-pointer"
            >
              <option value="ALL">All States</option>
              <option value="CLOSED">Closed</option>
              <option value="HALF_OPEN">Half Open</option>
              <option value="OPEN">Open</option>
            </select>
            <Filter className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2" />
          </div>

          {/* Export */}
          {onExport && (
            <button
              onClick={onExport}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
              title="Export events"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          {/* Refresh */}
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
      </div>

      {/* Timeline */}
      <div className="relative">
        {filteredEvents.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Activity className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">No events yet</p>
            <p className="text-sm mt-1">Circuit breaker events will appear here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Timeline line */}
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-200" />

            <AnimatePresence>
              {filteredEvents.map((event, index) => {
                const config = STATE_CONFIG[event.newState];
                const prevConfig = STATE_CONFIG[event.previousState];
                const triggerConfig = TRIGGER_CONFIG[event.triggeredBy];
                const TriggerIcon = triggerConfig?.icon || Bot;
                const StateIcon = config.icon;
                const { date, time } = formatTimestamp(event.timestamp);
                const isExpanded = expandedEvent === event.id;

                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                    className="relative pl-12"
                  >
                    {/* Timeline dot */}
                    <div className={`absolute left-2.5 w-5 h-5 rounded-full border-2 border-white shadow-md ${config.bg}`}>
                      <StateIcon className="w-3 h-3 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    </div>

                    {/* Event card */}
                    <div
                      onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                      className="bg-slate-50 rounded-xl p-4 cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {/* State transition */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              prevConfig.color
                            } bg-white border`}>
                              {prevConfig.label}
                            </span>
                            <span className="text-slate-400">→</span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white ${
                              config.bg
                            }`}>
                              {config.label}
                            </span>
                            {event.duration && (
                              <span className="text-xs text-slate-500 ml-2">
                                ({formatDuration(event.duration)})
                              </span>
                            )}
                          </div>

                          {/* Reason */}
                          <p className="text-sm text-slate-700">{event.reason}</p>

                          {/* Timestamp and trigger */}
                          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {date} at {time}
                            </span>
                            <span className="flex items-center gap-1">
                              <TriggerIcon className="w-3 h-3" />
                              {triggerConfig?.label || event.triggeredBy}
                            </span>
                          </div>
                        </div>

                        <button className="p-1 text-slate-400">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {/* Expanded details */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-4 pt-4 border-t border-slate-200">
                              <dl className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <dt className="text-slate-500">Event ID</dt>
                                  <dd className="font-mono text-xs text-slate-700">{event.id}</dd>
                                </div>
                                <div>
                                  <dt className="text-slate-500">Triggered By</dt>
                                  <dd className="text-slate-700 capitalize">{event.triggeredBy}</dd>
                                </div>
                                {event.duration && (
                                  <div>
                                    <dt className="text-slate-500">Duration</dt>
                                    <dd className="text-slate-700">{formatDuration(event.duration)}</dd>
                                  </div>
                                )}
                              </dl>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default FailoverEventLog;

