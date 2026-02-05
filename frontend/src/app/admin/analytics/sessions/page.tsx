/**
 * Session Analytics Dashboard
 *
 * Comprehensive session monitoring with charts, geographic distribution,
 * device breakdown, and real-time active session management.
 *
 * Phase 6.2 - 2026 Design Patterns
 */

'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import { InteractiveBreadcrumbs } from '@/components/ui/interactive-breadcrumbs';
import {
  useSessionAnalytics,
  useSessionsList,
  useRevokeSession,
} from '@/lib/api/admin-queries';
import {
  RefreshCw,
  Users,
  Activity,
  Clock,
  TrendingUp,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Shield,
  XCircle,
  Loader2,
  ChevronRight,
  AlertTriangle,
  BarChart3,
  MapPin,
  Zap,
} from 'lucide-react';

type DeviceType = 'Desktop' | 'Mobile' | 'Tablet';

const deviceIcons: Record<DeviceType, typeof Monitor> = {
  Desktop: Monitor,
  Mobile: Smartphone,
  Tablet: Tablet,
};

const clearanceColors: Record<string, string> = {
  UNCLASSIFIED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  CONFIDENTIAL: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  SECRET: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'TOP SECRET': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = 'blue',
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: typeof Activity;
  trend?: { value: number; label: string };
  color?: 'blue' | 'emerald' | 'purple' | 'amber';
}) {
  const colorClasses = {
    blue: 'from-blue-500 to-indigo-600',
    emerald: 'from-emerald-500 to-teal-600',
    purple: 'from-purple-500 to-pink-600',
    amber: 'from-amber-500 to-orange-600',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-lg hover:shadow-xl transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subtitle && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
          )}
          {trend && (
            <div className="mt-2 flex items-center gap-1">
              <TrendingUp
                className={`w-4 h-4 ${trend.value >= 0 ? 'text-emerald-500' : 'text-red-500'}`}
              />
              <span
                className={`text-sm font-medium ${
                  trend.value >= 0 ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {trend.value >= 0 ? '+' : ''}{trend.value}%
              </span>
              <span className="text-xs text-gray-500">{trend.label}</span>
            </div>
          )}
        </div>
        <div
          className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorClasses[color]} flex items-center justify-center shadow-lg`}
        >
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}

function SessionsChart({ data }: { data: Array<{ hour: number; count: number }> }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Sessions by Hour (24h)
      </h3>
      <div className="flex items-end gap-1 h-32">
        {data.map((item) => (
          <div
            key={item.hour}
            className="flex-1 bg-gradient-to-t from-blue-500 to-indigo-500 rounded-t opacity-80 hover:opacity-100 transition-opacity cursor-pointer group relative"
            style={{ height: `${(item.count / maxCount) * 100}%`, minHeight: '4px' }}
          >
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              {item.hour}:00 - {item.count} sessions
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>
    </div>
  );
}

function DeviceBreakdown({ data }: { data: Record<string, number> }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  const sortedEntries = Object.entries(data).sort((a, b) => b[1] - a[1]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
        <Monitor className="w-5 h-5" />
        Device Distribution
      </h3>
      <div className="space-y-4">
        {sortedEntries.map(([device, count]) => {
          const Icon = deviceIcons[device as DeviceType] || Monitor;
          const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;

          return (
            <div key={device} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {device}
                  </span>
                </div>
                <span className="text-sm text-gray-500">
                  {count.toLocaleString()} ({percentage}%)
                </span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GeoDistribution({ data }: { data: Record<string, number> }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  const sortedEntries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const countryNames: Record<string, string> = {
    USA: 'United States',
    GBR: 'United Kingdom',
    DEU: 'Germany',
    FRA: 'France',
    CAN: 'Canada',
    Other: 'Other Countries',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
        <Globe className="w-5 h-5" />
        Geographic Distribution
      </h3>
      <div className="space-y-3">
        {sortedEntries.map(([country, count], idx) => {
          const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
          const colors = [
            'bg-blue-500',
            'bg-indigo-500',
            'bg-purple-500',
            'bg-pink-500',
            'bg-amber-500',
            'bg-gray-400',
          ];

          return (
            <div key={country} className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${colors[idx]}`} />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {countryNames[country] || country}
                  </span>
                  <span className="text-sm text-gray-500">
                    {count.toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${colors[idx]} rounded-full transition-all`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface SessionItem {
  id: string;
  username: string;
  email?: string;
  ipAddress: string;
  device: string;
  browser: string;
  country?: string;
  lastActivity: string;
  clearance?: string;
}

function ActiveSessionsTable({
  sessions,
  onRevoke,
  isRevoking,
}: {
  sessions: SessionItem[];
  onRevoke: (id: string) => void;
  isRevoking: boolean;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" />
          Active Sessions
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Device / Browser
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Location
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Clearance
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Last Activity
              </th>
              <th className="px-6 py-3 text-right text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {sessions.map((session) => {
              const DeviceIcon = deviceIcons[session.device as DeviceType] || Monitor;

              return (
                <tr
                  key={session.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {session.username}
                      </p>
                      <p className="text-xs text-gray-500">{session.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <DeviceIcon className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-900 dark:text-gray-100">
                          {session.device}
                        </p>
                        <p className="text-xs text-gray-500">{session.browser}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-900 dark:text-gray-100">
                          {session.country || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500">{session.ipAddress}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        clearanceColors[session.clearance || 'UNCLASSIFIED']
                      }`}
                    >
                      {session.clearance || 'UNCLASSIFIED'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(session.lastActivity).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => onRevoke(session.id)}
                      disabled={isRevoking}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Revoke
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sessions.length === 0 && (
        <div className="px-6 py-12 text-center">
          <Users className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-2 text-sm text-gray-500">No active sessions</p>
        </div>
      )}
    </div>
  );
}

export default function SessionAnalyticsPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const [selectedTab, setSelectedTab] = useState<'overview' | 'sessions'>('overview');

  const {
    data: analytics,
    isLoading: isLoadingAnalytics,
    refetch: refetchAnalytics,
  } = useSessionAnalytics();

  const {
    data: sessionsData,
    isLoading: isLoadingSessions,
    refetch: refetchSessions,
  } = useSessionsList({ limit: 20 });

  const revokeMutation = useRevokeSession();

  const handleRefresh = useCallback(() => {
    refetchAnalytics();
    refetchSessions();
  }, [refetchAnalytics, refetchSessions]);

  const handleRevokeSession = useCallback(
    async (sessionId: string) => {
      try {
        await revokeMutation.mutateAsync(sessionId);
        refetchSessions();
      } catch (err) {
        console.error('Failed to revoke session:', err);
      }
    },
    [revokeMutation, refetchSessions]
  );

  if (authStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    router.push('/');
    return null;
  }

  const analyticsData = analytics?.analytics;
  const sessions = sessionsData?.sessions || [];

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  return (
    <PageLayout
      user={session?.user || {}}
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900">
        {/* Header */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
          <div className="max-w-[1600px] mx-auto px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Session Analytics
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Monitor active sessions, geographic distribution, and session trends
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleRefresh}
                  disabled={isLoadingAnalytics || isLoadingSessions}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isLoadingAnalytics ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setSelectedTab('overview')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  selectedTab === 'overview'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Overview
                </div>
              </button>
              <button
                onClick={() => setSelectedTab('sessions')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  selectedTab === 'sessions'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Active Sessions
                  <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
                    {analyticsData?.activeSessions || 0}
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-[1600px] mx-auto px-8 py-8">
          {isLoadingAnalytics ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
                <p className="mt-2 text-sm text-gray-500">Loading analytics...</p>
              </div>
            </div>
          ) : selectedTab === 'overview' ? (
            <div className="space-y-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                  title="Total Sessions"
                  value={analyticsData?.totalSessions || 0}
                  subtitle="All time"
                  icon={Activity}
                  trend={
                    analyticsData?.trends
                      ? { value: analyticsData.trends.change30d, label: 'vs last 30d' }
                      : undefined
                  }
                  color="blue"
                />
                <StatCard
                  title="Active Now"
                  value={analyticsData?.activeSessions || 0}
                  subtitle="Currently active"
                  icon={Zap}
                  color="emerald"
                />
                <StatCard
                  title="Avg. Duration"
                  value={formatDuration(analyticsData?.averageSessionDuration || 0)}
                  subtitle="Per session"
                  icon={Clock}
                  color="purple"
                />
                <StatCard
                  title="Peak Concurrent"
                  value={analyticsData?.peakConcurrentSessions || 0}
                  subtitle="Maximum recorded"
                  icon={TrendingUp}
                  color="amber"
                />
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SessionsChart data={analyticsData?.sessionsByHour || []} />
                <DeviceBreakdown data={analyticsData?.sessionsByDevice || {}} />
              </div>

              {/* Geographic & Browser */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GeoDistribution data={analyticsData?.sessionsByCountry || {}} />
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Browser Distribution
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(analyticsData?.sessionsByBrowser || {})
                      .sort((a, b) => b[1] - a[1])
                      .map(([browser, count], idx) => {
                        const total = Object.values(analyticsData?.sessionsByBrowser || {}).reduce(
                          (a, b) => a + b,
                          0
                        );
                        const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
                        const colors = [
                          'bg-blue-500',
                          'bg-orange-500',
                          'bg-cyan-500',
                          'bg-purple-500',
                          'bg-gray-400',
                        ];

                        return (
                          <div key={browser} className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${colors[idx]}`} />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                  {browser}
                                </span>
                                <span className="text-sm text-gray-500">
                                  {count.toLocaleString()} ({percentage}%)
                                </span>
                              </div>
                              <div className="mt-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${colors[idx]} rounded-full transition-all`}
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>

              {/* Trends Card */}
              {analyticsData?.trends && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Session Trends
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="text-center p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {analyticsData.trends.sessions7d.toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-500">Last 7 Days</p>
                    </div>
                    <div className="text-center p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {analyticsData.trends.sessions30d.toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-500">Last 30 Days</p>
                    </div>
                    <div className="text-center p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                      <p
                        className={`text-2xl font-bold ${
                          analyticsData.trends.change7d >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {analyticsData.trends.change7d >= 0 ? '+' : ''}
                        {analyticsData.trends.change7d}%
                      </p>
                      <p className="text-sm text-gray-500">7d Change</p>
                    </div>
                    <div className="text-center p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                      <p
                        className={`text-2xl font-bold ${
                          analyticsData.trends.change30d >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {analyticsData.trends.change30d >= 0 ? '+' : ''}
                        {analyticsData.trends.change30d}%
                      </p>
                      <p className="text-sm text-gray-500">30d Change</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Active Sessions Tab */
            <div className="space-y-6">
              {isLoadingSessions ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
                    <p className="mt-2 text-sm text-gray-500">Loading sessions...</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Warning Banner for High Sessions */}
                  {(analyticsData?.activeSessions || 0) > 100 && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                          High Session Count Detected
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                          There are {analyticsData?.activeSessions} active sessions. Consider
                          reviewing for unusual activity.
                        </p>
                      </div>
                      <button className="ml-auto flex items-center gap-1 text-sm text-amber-700 dark:text-amber-300 hover:underline">
                        Review <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <ActiveSessionsTable
                    sessions={sessions}
                    onRevoke={handleRevokeSession}
                    isRevoking={revokeMutation.isPending}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
