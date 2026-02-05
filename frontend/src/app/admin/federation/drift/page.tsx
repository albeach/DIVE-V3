/**
 * Federation Drift Detection Dashboard
 *
 * Monitors configuration drift between hub and spokes.
 * Displays drift status, events, and allows reconciliation.
 *
 * 2026 Design: Real-time monitoring with visual drift indicators.
 */

'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import { InteractiveBreadcrumbs } from '@/components/ui/interactive-breadcrumbs';
import {
  useDriftStatus,
  useDriftEvents,
  useReconcileDrift,
  useResolveDriftEvent,
} from '@/lib/api/admin-queries';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  GitCompareArrows,
  Zap,
  ChevronRight,
  Loader2,
  Activity,
  Server,
  Database,
  Lock,
  Settings,
  AlertOctagon,
} from 'lucide-react';

type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

const severityConfig: Record<SeverityLevel, { color: string; bg: string; icon: typeof AlertTriangle }> = {
  low: { color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30', icon: AlertTriangle },
  medium: { color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30', icon: AlertTriangle },
  high: { color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/30', icon: AlertOctagon },
  critical: { color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30', icon: AlertOctagon },
};

const componentIcons: Record<string, typeof Server> = {
  policy: Shield,
  database: Database,
  config: Settings,
  auth: Lock,
  default: Server,
};

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
    in_sync: { color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30', icon: CheckCircle2 },
    drift_detected: { color: 'text-red-600 bg-red-100 dark:bg-red-900/30', icon: AlertTriangle },
    unknown: { color: 'text-gray-600 bg-gray-100 dark:bg-gray-900/30', icon: Clock },
    error: { color: 'text-red-600 bg-red-100 dark:bg-red-900/30', icon: XCircle },
  };

  const { color, icon: Icon } = config[status] || config.unknown;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
      <Icon className="w-3.5 h-3.5" />
      {status === 'in_sync' ? 'In Sync' : status === 'drift_detected' ? 'Drift Detected' : status}
    </span>
  );
}

function ComponentCard({
  name,
  status,
  lastCheck,
  details,
}: {
  name: string;
  status: string;
  lastCheck: string;
  details?: string;
}) {
  const Icon = componentIcons[name.toLowerCase()] || componentIcons.default;
  const isOk = status === 'in_sync';

  return (
    <div
      className={`relative bg-white dark:bg-gray-800 rounded-xl border p-4 transition-all hover:shadow-md ${
        isOk
          ? 'border-gray-200 dark:border-gray-700'
          : 'border-red-200 dark:border-red-800 shadow-sm shadow-red-100 dark:shadow-red-900/20'
      }`}
    >
      {/* Status indicator line */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl ${
          isOk ? 'bg-emerald-500' : 'bg-red-500'
        }`}
      />

      <div className="flex items-start gap-3 pt-2">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            isOk
              ? 'bg-emerald-100 dark:bg-emerald-900/30'
              : 'bg-red-100 dark:bg-red-900/30'
          }`}
        >
          <Icon
            className={`w-5 h-5 ${isOk ? 'text-emerald-600' : 'text-red-600'}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 capitalize">
            {name}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Last check: {new Date(lastCheck).toLocaleString()}
          </p>
          {details && (
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
              {details}
            </p>
          )}
        </div>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

export default function DriftDetectionPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);

  const { data: driftStatus, isLoading: isLoadingStatus, refetch: refetchStatus } = useDriftStatus();
  const { data: driftEvents, isLoading: isLoadingEvents, refetch: refetchEvents } = useDriftEvents();
  const reconcileMutation = useReconcileDrift();
  const resolveMutation = useResolveDriftEvent();

  const handleReconcile = useCallback(async () => {
    try {
      await reconcileMutation.mutateAsync();
      refetchStatus();
      refetchEvents();
    } catch (err) {
      console.error('Reconcile failed:', err);
    }
  }, [reconcileMutation, refetchStatus, refetchEvents]);

  const handleResolveEvent = useCallback(async (eventId: string) => {
    try {
      await resolveMutation.mutateAsync(eventId);
      refetchEvents();
      refetchStatus();
      setSelectedEvent(null);
    } catch (err) {
      console.error('Resolve failed:', err);
    }
  }, [resolveMutation, refetchEvents, refetchStatus]);

  const handleRefresh = useCallback(() => {
    refetchStatus();
    refetchEvents();
  }, [refetchStatus, refetchEvents]);

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

  const status = driftStatus?.status || 'unknown';
  const components = driftStatus?.components || [];
  const events = driftEvents?.events || [];
  const unresolvedEvents = events.filter(e => !e.resolved);

  return (
    <PageLayout
      user={session?.user || {}}
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50 to-amber-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900">
        {/* Header */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
          <div className="max-w-[1600px] mx-auto px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
                  Drift Detection
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Monitor and reconcile configuration drift across federation
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleRefresh}
                  disabled={isLoadingStatus || isLoadingEvents}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingStatus ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  onClick={handleReconcile}
                  disabled={reconcileMutation.isPending || status === 'in_sync'}
                  className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-orange-600 to-amber-600 rounded-lg hover:from-orange-700 hover:to-amber-700 transition-all shadow-lg shadow-orange-600/25 disabled:opacity-50 flex items-center gap-2"
                >
                  {reconcileMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  Reconcile All
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-[1600px] mx-auto px-8 py-8">
          {/* Status Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Overall Status */}
            <div
              className={`bg-white dark:bg-gray-800 rounded-2xl border-2 p-6 ${
                status === 'in_sync'
                  ? 'border-emerald-200 dark:border-emerald-800'
                  : status === 'drift_detected'
                  ? 'border-red-200 dark:border-red-800'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    status === 'in_sync'
                      ? 'bg-emerald-100 dark:bg-emerald-900/40'
                      : status === 'drift_detected'
                      ? 'bg-red-100 dark:bg-red-900/40'
                      : 'bg-gray-100 dark:bg-gray-700'
                  }`}
                >
                  {status === 'in_sync' ? (
                    <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                  ) : status === 'drift_detected' ? (
                    <AlertTriangle className="w-7 h-7 text-red-600" />
                  ) : (
                    <Clock className="w-7 h-7 text-gray-500" />
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Overall Status</p>
                  <p
                    className={`text-xl font-bold ${
                      status === 'in_sync'
                        ? 'text-emerald-600'
                        : status === 'drift_detected'
                        ? 'text-red-600'
                        : 'text-gray-600'
                    }`}
                  >
                    {status === 'in_sync' ? 'All Synced' : status === 'drift_detected' ? 'Drift Detected' : 'Unknown'}
                  </p>
                </div>
              </div>
            </div>

            {/* Components Monitored */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                  <GitCompareArrows className="w-7 h-7 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Components</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {components.filter(c => c.status === 'in_sync').length} / {components.length}
                  </p>
                  <p className="text-xs text-gray-500">in sync</p>
                </div>
              </div>
            </div>

            {/* Active Events */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center gap-4">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    unresolvedEvents.length > 0
                      ? 'bg-amber-100 dark:bg-amber-900/40'
                      : 'bg-gray-100 dark:bg-gray-700'
                  }`}
                >
                  <Activity
                    className={`w-7 h-7 ${
                      unresolvedEvents.length > 0 ? 'text-amber-600' : 'text-gray-500'
                    }`}
                  />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Active Events</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {unresolvedEvents.length}
                  </p>
                  <p className="text-xs text-gray-500">need attention</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Component Status */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Component Health
              </h2>

              {isLoadingStatus ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                  <p className="text-sm text-gray-500 mt-2">Loading status...</p>
                </div>
              ) : components.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center">
                  <Server className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500">No components to monitor</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {components.map((component, idx) => (
                    <ComponentCard
                      key={idx}
                      name={component.name}
                      status={component.status}
                      lastCheck={component.lastCheck}
                      details={component.details}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Recent Events */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Drift Events
              </h2>

              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {isLoadingEvents ? (
                  <div className="p-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                    <p className="text-sm text-gray-500 mt-2">Loading events...</p>
                  </div>
                ) : events.length === 0 ? (
                  <div className="p-8 text-center">
                    <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">No drift events</p>
                    <p className="text-xs text-gray-500 mt-1">All systems are synchronized</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[500px] overflow-y-auto">
                    {events.slice(0, 10).map((event) => {
                      const severity = (event.severity || 'medium') as SeverityLevel;
                      const config = severityConfig[severity];
                      const Icon = config.icon;

                      return (
                        <div
                          key={event.id}
                          className={`p-4 transition-colors ${
                            selectedEvent === event.id ? 'bg-gray-50 dark:bg-gray-750' : ''
                          } ${event.resolved ? 'opacity-60' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.bg}`}>
                              <Icon className={`w-4 h-4 ${config.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-500 uppercase">
                                  {event.component}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase ${config.bg} ${config.color}`}
                                >
                                  {severity}
                                </span>
                                {event.resolved && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-600">
                                    Resolved
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                                {event.message}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                {new Date(event.detectedAt).toLocaleString()}
                              </p>

                              {!event.resolved && (
                                <button
                                  onClick={() => handleResolveEvent(event.id)}
                                  disabled={resolveMutation.isPending}
                                  className="mt-2 text-xs font-medium text-orange-600 hover:text-orange-700 flex items-center gap-1"
                                >
                                  {resolveMutation.isPending ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-3 h-3" />
                                  )}
                                  Mark Resolved
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Last Check Time */}
          {driftStatus?.lastCheck && (
            <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Last synchronized: {new Date(driftStatus.lastCheck).toLocaleString()}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
