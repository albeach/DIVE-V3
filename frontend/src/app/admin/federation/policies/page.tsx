/**
 * DIVE V3 - Policy Bundle Management Page
 * 
 * Hub administrator page for building, publishing, and monitoring
 * policy bundles across federation spokes.
 * 
 * Features:
 * - Build policy bundles with scope selection
 * - Publish bundles to OPAL Server
 * - Monitor sync status across all spokes
 * - Force sync for individual or all spokes
 * - OPAL health monitoring
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import PageLayout from '@/components/layout/page-layout';
import {
  PolicyBundleBuilder,
  CurrentBundleCard,
  SyncStatusDashboard,
  OPALHealthIndicator,
} from '@/components/admin/federation';
import {
  IBundleMetadata,
  ISyncStatusResponse,
  IOPALHealth,
  IBuildOptions,
  IBuildResult,
  IPublishResult,
} from '@/types/federation.types';
import {
  Package,
  RefreshCw,
  AlertTriangle,
  Server,
  Activity,
} from 'lucide-react';

export default function FederationPoliciesPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  // State
  const [currentBundle, setCurrentBundle] = useState<IBundleMetadata | null>(null);
  const [syncStatus, setSyncStatus] = useState<ISyncStatusResponse | null>(null);
  const [opalHealth, setOpalHealth] = useState<IOPALHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all data
  const fetchData = useCallback(async (showRefreshing = true) => {
    if (showRefreshing) setRefreshing(true);
    setError(null);

    try {
      // Fetch all data in parallel
      const [bundleRes, syncRes, healthRes] = await Promise.all([
        fetch('/api/opal/bundle/current'),
        fetch('/api/opal/sync-status'),
        fetch('/api/opal/health'),
      ]);

      // Parse responses (some may fail, that's ok)
      if (bundleRes.ok) {
        const bundleData = await bundleRes.json();
        setCurrentBundle({
          bundleId: bundleData.bundleId,
          version: bundleData.version,
          hash: bundleData.hash,
          scopes: bundleData.scopes || [],
          size: bundleData.size || 0,
          signedAt: bundleData.signedAt,
          signedBy: bundleData.signedBy,
          manifest: bundleData.manifest || { revision: '', roots: [], files: [] },
        });
      } else {
        setCurrentBundle(null);
      }

      if (syncRes.ok) {
        const syncData = await syncRes.json();
        setSyncStatus(syncData);
      }

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setOpalHealth(healthData);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      fetchData(false);
    }
  }, [sessionStatus, fetchData]);

  // Redirect if not authenticated
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/login');
    }
  }, [sessionStatus, router]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(false);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Build bundle
  const handleBuild = async (options: IBuildOptions): Promise<IBuildResult> => {
    const response = await fetch('/api/opal/bundle/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });

    const result = await response.json();
    
    if (result.success) {
      // Refresh data after build
      await fetchData();
    }

    return result;
  };

  // Publish bundle
  const handlePublish = async (): Promise<IPublishResult> => {
    const response = await fetch('/api/opal/bundle/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await response.json();
    
    if (result.success) {
      // Refresh data after publish
      await fetchData();
    }

    return result;
  };

  // Build and publish
  const handleBuildAndPublish = async (options: IBuildOptions) => {
    const response = await fetch('/api/opal/bundle/build-and-publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });

    const result = await response.json();
    
    // Refresh data after operation
    await fetchData();

    return {
      build: result.build,
      publish: result.publish,
    };
  };

  // Force sync for a spoke
  const handleForceSync = async (spokeId: string) => {
    const response = await fetch('/api/opal/force-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spokeId }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to force sync');
    }

    // Refresh sync status
    await fetchData();
  };

  // Force sync for all spokes
  const handleForceSyncAll = async () => {
    const response = await fetch('/api/opal/force-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}), // Empty body = sync all
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to force sync all');
    }

    // Refresh sync status
    await fetchData();
  };

  // Loading state
  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="inline-block h-16 w-16 rounded-full border-4 border-purple-500 border-t-transparent"
          />
          <p className="mt-4 text-lg text-gray-600">Loading Policy Management...</p>
        </div>
      </div>
    );
  }

  if (sessionStatus === 'unauthenticated') {
    return null;
  }

  return (
    <PageLayout
      user={session?.user || {}}
      breadcrumbs={[
        { label: 'Admin', href: '/admin/dashboard' },
        { label: 'Federation', href: '/admin/federation/spokes' },
        { label: 'Policies', href: null },
      ]}
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl shadow-lg">
                <Package className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                  Policy Bundle Management
                </h1>
                <p className="text-slate-600 text-sm sm:text-base">
                  Build, sign, and distribute policy bundles to federation spokes
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* OPAL Status */}
              <OPALHealthIndicator health={opalHealth} compact />

              {/* Refresh Button */}
              <button
                onClick={() => fetchData(true)}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-md hover:shadow-lg"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </motion.div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl"
          >
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          </motion.div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
          {/* Left Column: Bundle Builder */}
          <div className="space-y-6">
            <PolicyBundleBuilder
              onBuild={handleBuild}
              onPublish={handlePublish}
              onBuildAndPublish={handleBuildAndPublish}
            />
          </div>

          {/* Right Column: Current Bundle + OPAL Health */}
          <div className="space-y-6">
            <CurrentBundleCard
              bundle={currentBundle}
              loading={refreshing}
              onRefresh={() => fetchData(true)}
            />

            <OPALHealthIndicator
              health={opalHealth}
              loading={refreshing}
              onRefresh={() => fetchData(true)}
            />
          </div>
        </div>

        {/* Sync Status Dashboard (Full Width) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <SyncStatusDashboard
            syncStatus={syncStatus}
            loading={refreshing}
            onRefresh={() => fetchData(true)}
            onForceSync={handleForceSync}
            onForceSyncAll={handleForceSyncAll}
          />
        </motion.div>
      </div>
    </PageLayout>
  );
}
