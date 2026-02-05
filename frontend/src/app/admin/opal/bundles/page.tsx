/**
 * OPAL Policy Bundle Management
 *
 * Build and publish policy bundles to the federation.
 * Monitor bundle status and distribution.
 *
 * 2026 Design: Pipeline visualization with step indicators.
 */

'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import { InteractiveBreadcrumbs } from '@/components/ui/interactive-breadcrumbs';
import {
  useOpalBundleCurrent,
  useOpalBundleScopes,
  useBuildOpalBundle,
  usePublishOpalBundle,
  useBuildAndPublishOpalBundle,
  useSyncStatus,
} from '@/lib/api/admin-queries';
import {
  Package,
  Upload,
  Rocket,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Layers,
  Hash,
  Calendar,
  HardDrive,
  Server,
  ChevronRight,
  Loader2,
  Play,
  ArrowRight,
  Zap,
  AlertTriangle,
} from 'lucide-react';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; bg: string }> = {
    current: { color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
    behind: { color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' },
    stale: { color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/30' },
    critical_stale: { color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' },
    offline: { color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-900/30' },
  };

  const { color, bg } = config[status] || config.offline;
  const label = status === 'critical_stale' ? 'Critical' : status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color} ${bg}`}>
      {label}
    </span>
  );
}

export default function OpalBundlesPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const [selectedScope, setSelectedScope] = useState<string>('');
  const [buildLog, setBuildLog] = useState<string[]>([]);

  const { data: currentBundle, isLoading: isLoadingBundle, refetch: refetchBundle } = useOpalBundleCurrent();
  const { data: scopesData, isLoading: isLoadingScopes } = useOpalBundleScopes();
  const { data: syncStatus, isLoading: isLoadingSyncStatus, refetch: refetchSync } = useSyncStatus();

  const buildMutation = useBuildOpalBundle();
  const publishMutation = usePublishOpalBundle();
  const buildAndPublishMutation = useBuildAndPublishOpalBundle();

  const addLog = useCallback((message: string) => {
    setBuildLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  }, []);

  const handleBuild = useCallback(async () => {
    if (!selectedScope) return;
    setBuildLog([]);
    addLog(`Starting build for scope: ${selectedScope}`);

    try {
      addLog('Compiling policies...');
      await buildMutation.mutateAsync(selectedScope);
      addLog('Build completed successfully!');
      refetchBundle();
    } catch (err) {
      addLog(`Build failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [selectedScope, buildMutation, addLog, refetchBundle]);

  const handlePublish = useCallback(async () => {
    setBuildLog([]);
    addLog('Starting publish to all spokes...');

    try {
      const result = await publishMutation.mutateAsync();
      const successCount = Object.values(result.results || {}).filter((r: any) => r.success).length;
      const failCount = Object.values(result.results || {}).length - successCount;
      addLog(`Publish completed: ${successCount} succeeded, ${failCount} failed`);
      refetchSync();
    } catch (err) {
      addLog(`Publish failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [publishMutation, addLog, refetchSync]);

  const handleBuildAndPublish = useCallback(async () => {
    if (!selectedScope) return;
    setBuildLog([]);
    addLog(`Starting build and publish for scope: ${selectedScope}`);

    try {
      addLog('Compiling policies...');
      addLog('Building bundle...');
      const result = await buildAndPublishMutation.mutateAsync(selectedScope);
      addLog(`Bundle built: v${result.bundle.version}`);
      addLog('Publishing to spokes...');
      const successCount = Object.values(result.publishResults || {}).filter((r: any) => r.success).length;
      addLog(`Publish completed: ${successCount} spokes updated`);
      refetchBundle();
      refetchSync();
    } catch (err) {
      addLog(`Operation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [selectedScope, buildAndPublishMutation, addLog, refetchBundle, refetchSync]);

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

  const bundle = currentBundle?.bundle;
  const scopes = scopesData?.scopes || [];
  const spokes = syncStatus?.spokes || [];
  const summary = syncStatus?.summary;
  const isProcessing = buildMutation.isPending || publishMutation.isPending || buildAndPublishMutation.isPending;

  return (
    <PageLayout
      user={session?.user || {}}
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900">
        {/* Header */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
          <div className="max-w-[1600px] mx-auto px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  Policy Bundles
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Build and distribute OPA policy bundles to the federation
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => { refetchBundle(); refetchSync(); }}
                  disabled={isLoadingBundle || isLoadingSyncStatus}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingBundle ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-[1600px] mx-auto px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Build/Publish Panel */}
            <div className="lg:col-span-2 space-y-6">
              {/* Pipeline Card */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-gray-750 dark:to-gray-750">
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Rocket className="w-5 h-5 text-indigo-600" />
                    Build & Publish Pipeline
                  </h2>
                </div>

                <div className="p-6 space-y-6">
                  {/* Scope Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Policy Scope
                    </label>
                    <select
                      value={selectedScope}
                      onChange={(e) => setSelectedScope(e.target.value)}
                      disabled={isProcessing}
                      className="w-full px-4 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
                    >
                      <option value="">Select a scope...</option>
                      {scopes.map((scope) => (
                        <option key={scope} value={scope}>
                          {scope}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Choose the policy scope to include in the bundle
                    </p>
                  </div>

                  {/* Pipeline Steps */}
                  <div className="flex items-center justify-between gap-4">
                    {/* Step 1: Build */}
                    <div className="flex-1">
                      <button
                        onClick={handleBuild}
                        disabled={!selectedScope || isProcessing}
                        className="w-full px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-650 transition-all disabled:opacity-50 flex flex-col items-center gap-1"
                      >
                        {buildMutation.isPending ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Package className="w-5 h-5" />
                        )}
                        <span>Build</span>
                      </button>
                    </div>

                    <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />

                    {/* Step 2: Publish */}
                    <div className="flex-1">
                      <button
                        onClick={handlePublish}
                        disabled={!bundle || isProcessing}
                        className="w-full px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-650 transition-all disabled:opacity-50 flex flex-col items-center gap-1"
                      >
                        {publishMutation.isPending ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Upload className="w-5 h-5" />
                        )}
                        <span>Publish</span>
                      </button>
                    </div>

                    <span className="text-gray-400 font-medium">or</span>

                    {/* Combined: Build & Publish */}
                    <div className="flex-1">
                      <button
                        onClick={handleBuildAndPublish}
                        disabled={!selectedScope || isProcessing}
                        className="w-full px-4 py-3 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-600/25 disabled:opacity-50 flex flex-col items-center gap-1"
                      >
                        {buildAndPublishMutation.isPending ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Zap className="w-5 h-5" />
                        )}
                        <span>Build & Publish</span>
                      </button>
                    </div>
                  </div>

                  {/* Build Log */}
                  {buildLog.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        Operation Log
                      </h4>
                      <div className="bg-gray-900 rounded-lg p-4 max-h-40 overflow-y-auto font-mono text-xs">
                        {buildLog.map((log, idx) => (
                          <div key={idx} className="text-gray-300">
                            {log}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Spoke Sync Status */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Server className="w-5 h-5 text-gray-500" />
                    Spoke Sync Status
                  </h3>
                  {summary && (
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-emerald-600">{summary.current} current</span>
                      <span className="text-amber-600">{summary.behind} behind</span>
                      <span className="text-red-600">{summary.stale + (summary as any).critical_stale || 0} stale</span>
                      <span className="text-gray-500">{summary.offline} offline</span>
                    </div>
                  )}
                </div>

                <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[400px] overflow-y-auto">
                  {isLoadingSyncStatus ? (
                    <div className="p-8 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                      <p className="text-sm text-gray-500 mt-2">Loading sync status...</p>
                    </div>
                  ) : spokes.length === 0 ? (
                    <div className="p-8 text-center">
                      <Server className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500">No spokes registered</p>
                    </div>
                  ) : (
                    spokes.map((spoke: any) => (
                      <div key={spoke.spokeId} className="px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              spoke.status === 'current'
                                ? 'bg-emerald-100 dark:bg-emerald-900/30'
                                : spoke.status === 'offline'
                                ? 'bg-gray-100 dark:bg-gray-700'
                                : 'bg-amber-100 dark:bg-amber-900/30'
                            }`}
                          >
                            <Server
                              className={`w-5 h-5 ${
                                spoke.status === 'current'
                                  ? 'text-emerald-600'
                                  : spoke.status === 'offline'
                                  ? 'text-gray-500'
                                  : 'text-amber-600'
                              }`}
                            />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">
                              {spoke.instanceCode || spoke.spokeId}
                            </p>
                            <p className="text-xs text-gray-500">
                              Version: {spoke.currentVersion || 'Unknown'}
                              {spoke.versionsBehind > 0 && (
                                <span className="text-amber-600 ml-2">
                                  ({spoke.versionsBehind} behind)
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {spoke.lastSyncTime && (
                            <span className="text-xs text-gray-500">
                              {new Date(spoke.lastSyncTime).toLocaleString()}
                            </span>
                          )}
                          <StatusBadge status={spoke.status} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Current Bundle Info */}
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-gray-750 dark:to-gray-750">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Package className="w-5 h-5 text-emerald-600" />
                    Current Bundle
                  </h3>
                </div>

                {isLoadingBundle ? (
                  <div className="p-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                    <p className="text-sm text-gray-500 mt-2">Loading bundle...</p>
                  </div>
                ) : !bundle ? (
                  <div className="p-8 text-center">
                    <Package className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">No bundle built</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Select a scope and click Build to create a bundle
                    </p>
                  </div>
                ) : (
                  <div className="p-6 space-y-4">
                    {/* Bundle Info Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-50 dark:bg-gray-750 rounded-xl p-3">
                        <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                          <Layers className="w-3.5 h-3.5" />
                          Scope
                        </div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">
                          {bundle.scope}
                        </p>
                      </div>

                      <div className="bg-gray-50 dark:bg-gray-750 rounded-xl p-3">
                        <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                          <Hash className="w-3.5 h-3.5" />
                          Version
                        </div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">
                          {bundle.version}
                        </p>
                      </div>

                      <div className="bg-gray-50 dark:bg-gray-750 rounded-xl p-3">
                        <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                          <Calendar className="w-3.5 h-3.5" />
                          Created
                        </div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                          {new Date(bundle.createdAt).toLocaleString()}
                        </p>
                      </div>

                      <div className="bg-gray-50 dark:bg-gray-750 rounded-xl p-3">
                        <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                          <HardDrive className="w-3.5 h-3.5" />
                          Size
                        </div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">
                          {formatBytes(bundle.size)}
                        </p>
                      </div>
                    </div>

                    {/* Hash */}
                    <div className="bg-gray-50 dark:bg-gray-750 rounded-xl p-3">
                      <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                        <Hash className="w-3.5 h-3.5" />
                        Bundle Hash
                      </div>
                      <p className="font-mono text-xs text-gray-700 dark:text-gray-300 break-all">
                        {bundle.hash}
                      </p>
                    </div>

                    {/* Layers */}
                    {bundle.layers && bundle.layers.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                          Policy Layers
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {bundle.layers.map((layer, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg"
                            >
                              {layer}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Quick Actions</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => router.push('/admin/federation/drift')}
                    className="w-full px-4 py-3 text-sm font-medium text-left text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-750 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between"
                  >
                    <span>View Drift Detection</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => router.push('/admin/opal')}
                    className="w-full px-4 py-3 text-sm font-medium text-left text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-750 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between"
                  >
                    <span>OPAL Status Dashboard</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
