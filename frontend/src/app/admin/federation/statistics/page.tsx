/**
 * Federation Statistics Dashboard
 *
 * Cross-spoke traffic visualization, latency maps, and sync success rates.
 * Provides comprehensive view of federation health and performance.
 *
 * Phase 6.2 - 2026 Design Patterns
 */

'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import { useFederationStatistics, useFederationTraffic } from '@/lib/api/admin-queries';
import {
  RefreshCw,
  Globe,
  Activity,
  Clock,
  TrendingUp,
  TrendingDown,
  Server,
  Zap,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Network,
  Gauge,
  MapPin,
} from 'lucide-react';

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
  color?: 'blue' | 'emerald' | 'purple' | 'amber' | 'red';
}) {
  const colorClasses = {
    blue: 'from-blue-500 to-indigo-600',
    emerald: 'from-emerald-500 to-teal-600',
    purple: 'from-purple-500 to-pink-600',
    amber: 'from-amber-500 to-orange-600',
    red: 'from-red-500 to-rose-600',
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
              {trend.value >= 0 ? (
                <ArrowUpRight className={`w-4 h-4 ${trend.value >= 0 ? 'text-emerald-500' : 'text-red-500'}`} />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-red-500" />
              )}
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

function TrafficChart({ data }: { data: Array<{ timestamp: string; requests: number; latency: number }> }) {
  const maxRequests = Math.max(...data.map((d) => d.requests), 1);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
        <BarChart3 className="w-5 h-5" />
        Request Volume (24h)
      </h3>
      <div className="flex items-end gap-1 h-40">
        {data.map((item, idx) => (
          <div
            key={idx}
            className="flex-1 bg-gradient-to-t from-purple-500 to-indigo-500 rounded-t opacity-70 hover:opacity-100 transition-opacity cursor-pointer group relative"
            style={{ height: `${(item.requests / maxRequests) * 100}%`, minHeight: '4px' }}
          >
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
              {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: {item.requests.toLocaleString()} requests
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>24h ago</span>
        <span>12h ago</span>
        <span>Now</span>
      </div>
    </div>
  );
}

function LatencyChart({ data }: { data: Array<{ timestamp: string; latency: number }> }) {
  const maxLatency = Math.max(...data.map((d) => d.latency), 1);
  const avgLatency = data.reduce((a, b) => a + b.latency, 0) / data.length;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Gauge className="w-5 h-5" />
          Latency (24h)
        </h3>
        <span className="text-sm text-gray-500">
          Avg: <span className="font-semibold text-gray-900 dark:text-gray-100">{avgLatency.toFixed(0)}ms</span>
        </span>
      </div>
      <div className="relative h-40">
        {/* Average line */}
        <div
          className="absolute w-full border-t-2 border-dashed border-amber-400"
          style={{ bottom: `${(avgLatency / maxLatency) * 100}%` }}
        />
        {/* Latency bars */}
        <div className="flex items-end gap-1 h-full">
          {data.map((item, idx) => {
            const height = (item.latency / maxLatency) * 100;
            const color = item.latency > avgLatency * 1.5 ? 'from-red-500 to-red-600' :
                          item.latency > avgLatency ? 'from-amber-500 to-amber-600' :
                          'from-emerald-500 to-emerald-600';

            return (
              <div
                key={idx}
                className={`flex-1 bg-gradient-to-t ${color} rounded-t opacity-70 hover:opacity-100 transition-opacity cursor-pointer group relative`}
                style={{ height: `${height}%`, minHeight: '4px' }}
              >
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                  {item.latency}ms
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>24h ago</span>
        <span>12h ago</span>
        <span>Now</span>
      </div>
    </div>
  );
}

interface SpokeData {
  spokeId: string;
  spokeName: string;
  requests: number;
  bytes: number;
  avgLatency: number;
}

function SpokeTrafficTable({ spokes }: { spokes: SpokeData[] }) {
  const totalRequests = spokes.reduce((a, b) => a + b.requests, 0);

  const formatBytes = (bytes: number) => {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
    return `${(bytes / 1e3).toFixed(2)} KB`;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Globe className="w-5 h-5" />
          Traffic by Spoke
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Spoke
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Requests
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Data Transfer
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Avg Latency
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Share
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {spokes.map((spoke) => {
              const share = (spoke.requests / totalRequests) * 100;

              return (
                <tr key={spoke.spokeId} className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                        <MapPin className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {spoke.spokeName}
                        </p>
                        <p className="text-xs text-gray-500">{spoke.spokeId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {spoke.requests.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {formatBytes(spoke.bytes)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`text-sm font-medium ${
                        spoke.avgLatency < 50
                          ? 'text-emerald-600'
                          : spoke.avgLatency < 100
                          ? 'text-amber-600'
                          : 'text-red-600'
                      }`}
                    >
                      {spoke.avgLatency}ms
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{share.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface EndpointData {
  endpoint: string;
  count: number;
  avgLatency: number;
}

function TopEndpoints({ endpoints }: { endpoints: EndpointData[] }) {
  const maxCount = Math.max(...endpoints.map((e) => e.count), 1);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
        <Network className="w-5 h-5" />
        Top Endpoints
      </h3>
      <div className="space-y-4">
        {endpoints.map((endpoint, idx) => (
          <div key={endpoint.endpoint} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-400">
                  {idx + 1}
                </span>
                <code className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[200px]">
                  {endpoint.endpoint}
                </code>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-500">{endpoint.count.toLocaleString()}</span>
                <span
                  className={`font-medium ${
                    endpoint.avgLatency < 30
                      ? 'text-emerald-600'
                      : endpoint.avgLatency < 50
                      ? 'text-amber-600'
                      : 'text-red-600'
                  }`}
                >
                  {endpoint.avgLatency}ms
                </span>
              </div>
            </div>
            <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full"
                style={{ width: `${(endpoint.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FederationStatisticsPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const [activeTab, setActiveTab] = useState<'overview' | 'traffic'>('overview');

  const { data: statsData, isLoading: isLoadingStats, refetch: refetchStats } = useFederationStatistics();
  const { data: trafficData, isLoading: isLoadingTraffic, refetch: refetchTraffic } = useFederationTraffic();

  const handleRefresh = useCallback(() => {
    refetchStats();
    refetchTraffic();
  }, [refetchStats, refetchTraffic]);

  if (authStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    router.push('/');
    return null;
  }

  const stats = statsData?.statistics;
  const traffic = trafficData?.traffic;
  const isLoading = isLoadingStats || isLoadingTraffic;

  return (
    <PageLayout
      user={session?.user || {}}
      breadcrumbs={[
        { label: 'Admin', href: '/admin/dashboard' },
        { label: 'Federation', href: '/admin/federation' },
        { label: 'Statistics', href: null },
      ]}
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900">
        {/* Header */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
          <div className="max-w-[1600px] mx-auto px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                  Federation Statistics
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Cross-spoke traffic analysis and performance metrics
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleRefresh}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === 'overview'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Overview
                </div>
              </button>
              <button
                onClick={() => setActiveTab('traffic')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === 'traffic'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Traffic Details
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-[1600px] mx-auto px-8 py-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600" />
                <p className="mt-2 text-sm text-gray-500">Loading statistics...</p>
              </div>
            </div>
          ) : activeTab === 'overview' ? (
            <div className="space-y-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                  title="Active Spokes"
                  value={`${stats?.activeSpokes || 0} / ${stats?.totalSpokes || 0}`}
                  subtitle="Currently online"
                  icon={Server}
                  color="purple"
                />
                <StatCard
                  title="Requests (24h)"
                  value={stats?.totalRequests24h || 0}
                  subtitle="Total federation requests"
                  icon={Activity}
                  trend={stats?.trends ? { value: stats.trends.requestsChange7d, label: 'vs last 7d' } : undefined}
                  color="blue"
                />
                <StatCard
                  title="Success Rate"
                  value={`${(stats?.successRate || 0).toFixed(1)}%`}
                  subtitle="Request success rate"
                  icon={CheckCircle2}
                  color="emerald"
                />
                <StatCard
                  title="Avg Latency"
                  value={`${stats?.averageLatency || 0}ms`}
                  subtitle={`Peak: ${stats?.peakLatency || 0}ms`}
                  icon={Clock}
                  trend={stats?.trends ? { value: stats.trends.latencyChange7d, label: 'vs last 7d' } : undefined}
                  color="amber"
                />
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {traffic?.history && (
                  <>
                    <TrafficChart data={traffic.history} />
                    <LatencyChart data={traffic.history} />
                  </>
                )}
              </div>

              {/* Spoke Overview */}
              {stats?.requestsBySpoke && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Requests by Spoke
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {Object.entries(stats.requestsBySpoke).map(([spokeId, count]) => (
                      <div
                        key={spokeId}
                        className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 text-center"
                      >
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                          {(count as number).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          {spokeId.replace('spoke-', '').toUpperCase()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trends */}
              {stats?.trends && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    7-Day Trends
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          stats.trends.requestsChange7d >= 0
                            ? 'bg-emerald-100 dark:bg-emerald-900/30'
                            : 'bg-red-100 dark:bg-red-900/30'
                        }`}
                      >
                        {stats.trends.requestsChange7d >= 0 ? (
                          <TrendingUp className="w-6 h-6 text-emerald-600" />
                        ) : (
                          <TrendingDown className="w-6 h-6 text-red-600" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Request Volume</p>
                        <p
                          className={`text-xl font-bold ${
                            stats.trends.requestsChange7d >= 0 ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {stats.trends.requestsChange7d >= 0 ? '+' : ''}
                          {stats.trends.requestsChange7d}%
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          stats.trends.latencyChange7d <= 0
                            ? 'bg-emerald-100 dark:bg-emerald-900/30'
                            : 'bg-red-100 dark:bg-red-900/30'
                        }`}
                      >
                        {stats.trends.latencyChange7d <= 0 ? (
                          <TrendingDown className="w-6 h-6 text-emerald-600" />
                        ) : (
                          <TrendingUp className="w-6 h-6 text-red-600" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Latency</p>
                        <p
                          className={`text-xl font-bold ${
                            stats.trends.latencyChange7d <= 0 ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {stats.trends.latencyChange7d >= 0 ? '+' : ''}
                          {stats.trends.latencyChange7d}%
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          stats.trends.errorRateChange7d <= 0
                            ? 'bg-emerald-100 dark:bg-emerald-900/30'
                            : 'bg-red-100 dark:bg-red-900/30'
                        }`}
                      >
                        {stats.trends.errorRateChange7d <= 0 ? (
                          <TrendingDown className="w-6 h-6 text-emerald-600" />
                        ) : (
                          <TrendingUp className="w-6 h-6 text-red-600" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Error Rate</p>
                        <p
                          className={`text-xl font-bold ${
                            stats.trends.errorRateChange7d <= 0 ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {stats.trends.errorRateChange7d >= 0 ? '+' : ''}
                          {stats.trends.errorRateChange7d}%
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Traffic Details Tab */
            <div className="space-y-8">
              {traffic?.bySpoke && <SpokeTrafficTable spokes={traffic.bySpoke} />}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {traffic?.topEndpoints && <TopEndpoints endpoints={traffic.topEndpoints} />}

                {/* Traffic Summary */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    Traffic Summary
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                      <div>
                        <p className="text-sm text-gray-500">Total Requests</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                          {(traffic?.totalRequests || 0).toLocaleString()}
                        </p>
                      </div>
                      <Activity className="w-8 h-8 text-purple-500" />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                      <div>
                        <p className="text-sm text-gray-500">Data Transferred</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                          {traffic?.totalBytes
                            ? `${(traffic.totalBytes / 1e9).toFixed(2)} GB`
                            : '0 GB'}
                        </p>
                      </div>
                      <Network className="w-8 h-8 text-indigo-500" />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                      <div>
                        <p className="text-sm text-gray-500">Time Range</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {traffic?.timeRange
                            ? `${new Date(traffic.timeRange.start).toLocaleString()} - ${new Date(traffic.timeRange.end).toLocaleString()}`
                            : 'Last 24 hours'}
                        </p>
                      </div>
                      <Clock className="w-8 h-8 text-amber-500" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
