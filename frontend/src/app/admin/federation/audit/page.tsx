/**
 * Cross-Spoke Audit Log Aggregation
 *
 * Unified view of audit logs from all federation spokes.
 * Provides filtering, statistics, and drill-down capabilities.
 *
 * 2026 Design: Real-time log streaming with advanced filters.
 */

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import { InteractiveBreadcrumbs } from '@/components/ui/interactive-breadcrumbs';
import {
  useFederationAuditAggregated,
  useFederationAuditStats,
} from '@/lib/api/admin-queries';
import {
  Activity,
  Server,
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  User,
  FileText,
  Shield,
  Globe,
  BarChart3,
  Loader2,
  ChevronRight,
  Download,
} from 'lucide-react';

type OutcomeFilter = 'all' | 'allowed' | 'denied' | 'error';
type EventTypeFilter = 'all' | 'authorization' | 'authentication' | 'federation' | 'admin';

interface AuditLog {
  id: string;
  spokeId: string;
  instanceCode: string;
  eventType: string;
  subject: string;
  outcome: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const config: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
    allowed: { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle2 },
    denied: { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
    error: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: AlertTriangle },
    success: { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle2 },
    failure: { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
  };

  const { color, icon: Icon } = config[outcome.toLowerCase()] || config.error;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {outcome}
    </span>
  );
}

function EventTypeBadge({ type }: { type: string }) {
  const config: Record<string, { color: string; icon: typeof Activity }> = {
    authorization: { color: 'bg-blue-100 text-blue-700', icon: Shield },
    authentication: { color: 'bg-purple-100 text-purple-700', icon: User },
    federation: { color: 'bg-indigo-100 text-indigo-700', icon: Globe },
    admin: { color: 'bg-gray-100 text-gray-700', icon: FileText },
  };

  const normalized = type.toLowerCase().includes('auth')
    ? type.toLowerCase().includes('authz') || type.toLowerCase().includes('authorization')
      ? 'authorization'
      : 'authentication'
    : type.toLowerCase().includes('federation')
    ? 'federation'
    : 'admin';

  const { color, icon: Icon } = config[normalized] || config.admin;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {type}
    </span>
  );
}

export default function FederationAuditPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState<EventTypeFilter>('all');
  const [spokeFilter, setSpokeFilter] = useState<string>('all');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // Data
  const { data: logsData, isLoading: isLoadingLogs, refetch: refetchLogs } = useFederationAuditAggregated();
  const { data: statsData, isLoading: isLoadingStats, refetch: refetchStats } = useFederationAuditStats();

  const handleRefresh = useCallback(() => {
    refetchLogs();
    refetchStats();
  }, [refetchLogs, refetchStats]);

  // Get unique spokes for filter
  const uniqueSpokes = useMemo(() => {
    if (!logsData?.logs) return [];
    const spokes = new Set(logsData.logs.map((log: AuditLog) => log.instanceCode));
    return Array.from(spokes).sort();
  }, [logsData]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    if (!logsData?.logs) return [];

    return logsData.logs.filter((log: AuditLog) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !log.subject.toLowerCase().includes(query) &&
          !log.eventType.toLowerCase().includes(query) &&
          !log.instanceCode.toLowerCase().includes(query)
        ) {
          return false;
        }
      }

      // Outcome filter
      if (outcomeFilter !== 'all' && log.outcome.toLowerCase() !== outcomeFilter) {
        return false;
      }

      // Event type filter
      if (eventTypeFilter !== 'all') {
        const normalized = log.eventType.toLowerCase();
        if (eventTypeFilter === 'authorization' && !normalized.includes('authz') && !normalized.includes('authorization')) {
          return false;
        }
        if (eventTypeFilter === 'authentication' && (!normalized.includes('authn') && !normalized.includes('authentication') && normalized.includes('auth'))) {
          return false;
        }
        if (eventTypeFilter === 'federation' && !normalized.includes('federation')) {
          return false;
        }
      }

      // Spoke filter
      if (spokeFilter !== 'all' && log.instanceCode !== spokeFilter) {
        return false;
      }

      return true;
    });
  }, [logsData, searchQuery, outcomeFilter, eventTypeFilter, spokeFilter]);

  // Export logs
  const handleExport = useCallback(() => {
    const data = JSON.stringify(filteredLogs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `federation-audit-logs-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredLogs]);

  if (authStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    router.push('/');
    return null;
  }

  const stats = statsData?.stats;

  return (
    <PageLayout
      user={session?.user || {}}
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50 to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900">
        {/* Header */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
          <div className="max-w-[1800px] mx-auto px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 data-testid="admin-heading" className="text-3xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
                  Federation Audit Logs
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Cross-spoke audit log aggregation and analysis
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleExport}
                  disabled={filteredLogs.length === 0}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
                <button
                  onClick={handleRefresh}
                  disabled={isLoadingLogs || isLoadingStats}
                  className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-violet-600 to-purple-600 rounded-lg hover:from-violet-700 hover:to-purple-700 transition-all shadow-lg shadow-violet-600/25 disabled:opacity-50 flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingLogs ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-[1800px] mx-auto px-8 py-8">
          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total Events</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {stats?.totalEvents?.toLocaleString() || logsData?.total || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Allowed</p>
                  <p className="text-xl font-bold text-emerald-600">
                    {stats?.byOutcome?.allowed?.toLocaleString() || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Denied</p>
                  <p className="text-xl font-bold text-red-600">
                    {stats?.byOutcome?.denied?.toLocaleString() || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Server className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Spokes</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {Object.keys(stats?.bySpoke || {}).length || uniqueSpokes.length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
            <div className="flex flex-wrap gap-4">
              {/* Search */}
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by subject, event type, or spoke..."
                    className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>

              {/* Outcome Filter */}
              <select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value as OutcomeFilter)}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-violet-500"
              >
                <option value="all">All Outcomes</option>
                <option value="allowed">Allowed</option>
                <option value="denied">Denied</option>
                <option value="error">Error</option>
              </select>

              {/* Event Type Filter */}
              <select
                value={eventTypeFilter}
                onChange={(e) => setEventTypeFilter(e.target.value as EventTypeFilter)}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-violet-500"
              >
                <option value="all">All Event Types</option>
                <option value="authorization">Authorization</option>
                <option value="authentication">Authentication</option>
                <option value="federation">Federation</option>
                <option value="admin">Admin</option>
              </select>

              {/* Spoke Filter */}
              <select
                value={spokeFilter}
                onChange={(e) => setSpokeFilter(e.target.value)}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-violet-500"
              >
                <option value="all">All Spokes</option>
                {uniqueSpokes.map((spoke) => (
                  <option key={spoke} value={spoke}>
                    {spoke}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 text-xs text-gray-500">
              Showing {filteredLogs.length} of {logsData?.total || 0} events
            </div>
          </div>

          {/* Log Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              {isLoadingLogs ? (
                <div className="p-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
                  <p className="text-sm text-gray-500 mt-2">Loading audit logs...</p>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="p-12 text-center">
                  <Activity className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">No audit logs found</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {searchQuery || outcomeFilter !== 'all' || eventTypeFilter !== 'all' || spokeFilter !== 'all'
                      ? 'Try adjusting your filters'
                      : 'No events have been recorded yet'}
                  </p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-750">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                        Timestamp
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                        Spoke
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                        Event Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                        Subject
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                        Outcome
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {filteredLogs.slice(0, 100).map((log: AuditLog) => (
                      <React.Fragment key={log.id}>
                        <tr
                          className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer transition-colors"
                          onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Clock className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-sm text-gray-900 dark:text-gray-100 font-mono">
                                {new Date(log.timestamp).toLocaleString()}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-medium text-gray-700 dark:text-gray-300">
                              <Server className="w-3 h-3" />
                              {log.instanceCode}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <EventTypeBadge type={log.eventType} />
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-900 dark:text-gray-100 font-mono truncate max-w-[200px] block">
                              {log.subject}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <OutcomeBadge outcome={log.outcome} />
                          </td>
                          <td className="px-4 py-3">
                            <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                              {expandedLog === log.id ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded Details */}
                        {expandedLog === log.id && log.details && (
                          <tr>
                            <td colSpan={6} className="px-4 py-4 bg-gray-50 dark:bg-gray-850">
                              <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto">
                                <pre className="text-xs text-gray-300 font-mono">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {filteredLogs.length > 100 && (
              <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 text-center">
                <p className="text-sm text-gray-500">
                  Showing first 100 of {filteredLogs.length} results. Export for full data.
                </p>
              </div>
            )}
          </div>

          {/* Spoke Distribution Chart (if stats available) */}
          {stats?.bySpoke && Object.keys(stats.bySpoke).length > 0 && (
            <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-violet-500" />
                Events by Spoke
              </h3>
              <div className="space-y-3">
                {Object.entries(stats.bySpoke)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([spoke, count]) => {
                    const maxCount = Math.max(...Object.values(stats.bySpoke as Record<string, number>));
                    const percentage = ((count as number) / maxCount) * 100;

                    return (
                      <div key={spoke} className="flex items-center gap-3">
                        <span className="w-16 text-sm font-medium text-gray-700 dark:text-gray-300">
                          {spoke}
                        </span>
                        <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="w-20 text-sm text-gray-600 dark:text-gray-400 text-right">
                          {(count as number).toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
