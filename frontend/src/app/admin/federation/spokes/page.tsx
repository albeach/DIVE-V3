/**
 * DIVE V3 - Federation Spokes Registry Page
 * 
 * Hub administrator dashboard for managing spoke registrations.
 * 
 * Features:
 * - List all registered spokes with status
 * - Approve pending registrations with trust configuration
 * - Suspend/revoke spokes
 * - View detailed spoke information
 * - Rotate spoke tokens
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
  SpokeRegistryTable,
  SpokeApprovalModal,
  SpokeDetailPanel,
} from '@/components/admin/federation';
import {
  ISpoke,
  ISpokeListResponse,
  IApprovalRequest,
  SpokeStatus,
} from '@/types/federation.types';
import {
  Globe2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Activity,
  Server,
} from 'lucide-react';
import { notify } from '@/lib/notification-service';

type FilterStatus = 'all' | SpokeStatus;

export default function FederationSpokesPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  // State
  const [spokes, setSpokes] = useState<ISpoke[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [totalCount, setTotalCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  // Modals
  const [approvalModalSpoke, setApprovalModalSpoke] = useState<ISpoke | null>(null);
  const [detailPanelSpoke, setDetailPanelSpoke] = useState<ISpoke | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'suspend' | 'revoke'; spoke: ISpoke } | null>(null);

  // Fetch spokes
  const fetchSpokes = useCallback(async (showRefreshing = true) => {
    if (showRefreshing) setRefreshing(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.append('status', filterStatus);
      if (searchQuery) params.append('search', searchQuery);
      params.append('page', page.toString());
      params.append('limit', limit.toString());

      const response = await fetch(`/api/federation/spokes?${params.toString()}`);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const data: ISpokeListResponse = await response.json();
      setSpokes(data.spokes || []);
      setTotalCount(data.total || 0);
      setPendingCount(data.pendingCount || 0);
    } catch (err) {
      console.error('Failed to fetch spokes:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch spokes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterStatus, searchQuery, page]);

  // Initial fetch
  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      fetchSpokes(false);
    }
  }, [sessionStatus, fetchSpokes]);

  // Redirect if not authenticated
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/login');
    }
  }, [sessionStatus, router]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSpokes(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchSpokes]);

  // Approve spoke
  const handleApprove = async (spokeId: string, request: IApprovalRequest) => {
    const response = await fetch(`/api/federation/spokes/${spokeId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      notify.toast.error('Failed to approve spoke', errData.error || 'Unknown error');
      throw new Error(errData.error || 'Failed to approve spoke');
    }

    const spoke = spokes.find(s => s.spokeId === spokeId);
    notify.admin.spokeApproved(spoke?.name || spokeId);
    
    await fetchSpokes();
    setApprovalModalSpoke(null);
  };

  // Suspend spoke
  const handleSuspend = async (spoke: ISpoke, reason: string) => {
    const response = await fetch(`/api/federation/spokes/${spoke.spokeId}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      notify.toast.error('Failed to suspend spoke', errData.error || 'Unknown error');
      throw new Error(errData.error || 'Failed to suspend spoke');
    }

    // Use unified notification - suspending is a security event
    notify.persist({
      type: 'security',
      title: 'Spoke Suspended',
      message: `Federation spoke "${spoke.name}" (${spoke.instanceCode}) suspended. Reason: ${reason}`,
      actionUrl: '/admin/federation/spokes',
    });
    notify.toast.warning(`Spoke "${spoke.instanceCode}" suspended`);

    await fetchSpokes();
    setConfirmAction(null);
    setDetailPanelSpoke(null);
  };

  // Revoke spoke
  const handleRevoke = async (spoke: ISpoke) => {
    const response = await fetch(`/api/federation/spokes/${spoke.spokeId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      notify.toast.error('Failed to revoke spoke', errData.error || 'Unknown error');
      throw new Error(errData.error || 'Failed to revoke spoke');
    }

    // Use unified notification - revoking is a critical security event
    notify.admin.spokeRejected(spoke.name, 'Access revoked by administrator');

    await fetchSpokes();
    setConfirmAction(null);
    setDetailPanelSpoke(null);
  };

  // Rotate token
  const handleRotateToken = async (spoke: ISpoke) => {
    const response = await fetch(`/api/federation/spokes/${spoke.spokeId}/token`, {
      method: 'POST',
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      notify.toast.error('Failed to rotate token', errData.error || 'Unknown error');
      throw new Error(errData.error || 'Failed to rotate token');
    }

    notify.toast.success(`Token rotated for "${spoke.instanceCode}"`);
    await fetchSpokes();
  };

  // Force sync
  const handleForceSync = async (spoke: ISpoke) => {
    notify.toast.loading(`Syncing policy to "${spoke.instanceCode}"...`);
    
    const response = await fetch('/api/opal/force-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spokeId: spoke.spokeId }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      notify.toast.dismiss();
      notify.toast.error('Failed to force sync', errData.error || 'Unknown error');
      throw new Error(errData.error || 'Failed to force sync');
    }

    notify.toast.dismiss();
    notify.toast.success(`Policy synced to "${spoke.instanceCode}"`);
    await fetchSpokes();
  };

  // Stats calculation
  const stats = {
    total: spokes.length,
    active: spokes.filter(s => s.status === 'active').length,
    pending: pendingCount,
    suspended: spokes.filter(s => s.status === 'suspended').length,
    revoked: spokes.filter(s => s.status === 'revoked').length,
  };

  // Filter tabs
  const filterTabs: { id: FilterStatus; label: string; icon: typeof Globe2; count: number }[] = [
    { id: 'all', label: 'All', icon: Globe2, count: totalCount },
    { id: 'pending', label: 'Pending', icon: Clock, count: pendingCount },
    { id: 'active', label: 'Active', icon: CheckCircle2, count: stats.active },
    { id: 'suspended', label: 'Suspended', icon: AlertTriangle, count: stats.suspended },
    { id: 'revoked', label: 'Revoked', icon: XCircle, count: stats.revoked },
  ];

  // Loading state
  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="inline-block h-16 w-16 rounded-full border-4 border-blue-500 border-t-transparent"
          />
          <p className="mt-4 text-lg text-gray-600">Loading Federation Registry...</p>
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
        { label: 'Spokes', href: null },
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
              <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
                <Server className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Federation Spoke Registry
                </h1>
                <p className="text-slate-600 text-sm sm:text-base">
                  Manage spoke registrations and federation agreements
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Pending Badge */}
              {pendingCount > 0 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-100 border border-amber-300 rounded-lg"
                >
                  <Clock className="w-5 h-5 text-amber-600 animate-pulse" />
                  <span className="font-semibold text-amber-800">
                    {pendingCount} Pending Approval{pendingCount > 1 ? 's' : ''}
                  </span>
                </motion.div>
              )}

              {/* Refresh Button */}
              <button
                onClick={() => fetchSpokes(true)}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md hover:shadow-lg"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Total Spokes', value: totalCount, icon: Globe2, color: 'from-blue-500 to-indigo-600' },
            { label: 'Active', value: stats.active, icon: Activity, color: 'from-emerald-500 to-teal-600' },
            { label: 'Pending', value: pendingCount, icon: Clock, color: 'from-amber-500 to-orange-600', pulse: pendingCount > 0 },
            { label: 'Suspended', value: stats.suspended, icon: AlertTriangle, color: 'from-orange-500 to-red-500' },
            { label: 'Revoked', value: stats.revoked, icon: XCircle, color: 'from-gray-500 to-gray-600' },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`bg-gradient-to-br ${stat.color} rounded-xl shadow-lg p-4 text-white`}
            >
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={`w-6 h-6 opacity-80 ${stat.pulse ? 'animate-pulse' : ''}`} />
                <span className="text-3xl font-bold">{stat.value}</span>
              </div>
              <div className="text-sm opacity-90">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Filter Tabs */}
        <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-3">
          <div className="flex flex-wrap gap-2">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setFilterStatus(tab.id);
                  setPage(1);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  filterStatus === tab.id
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    filterStatus === tab.id ? 'bg-white/20' : 'bg-gray-300'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-4">
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Search by name, code, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={() => fetchSpokes()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Search
            </button>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  fetchSpokes();
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

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

        {/* Table */}
        <SpokeRegistryTable
          spokes={spokes}
          loading={refreshing}
          onApprove={(spoke) => setApprovalModalSpoke(spoke)}
          onSuspend={(spoke) => setConfirmAction({ type: 'suspend', spoke })}
          onRevoke={(spoke) => setConfirmAction({ type: 'revoke', spoke })}
          onViewDetails={(spoke) => setDetailPanelSpoke(spoke)}
          onRotateToken={handleRotateToken}
        />

        {/* Pagination */}
        {totalCount > limit && (
          <div className="mt-6 flex justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ← Previous
            </button>
            <span className="px-4 py-2 bg-white border border-gray-300 rounded-lg">
              Page {page} of {Math.ceil(totalCount / limit)}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(totalCount / limit)}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        )}

        {/* Approval Modal */}
        <SpokeApprovalModal
          spoke={approvalModalSpoke}
          isOpen={!!approvalModalSpoke}
          onClose={() => setApprovalModalSpoke(null)}
          onApprove={handleApprove}
        />

        {/* Detail Panel */}
        <SpokeDetailPanel
          spoke={detailPanelSpoke}
          isOpen={!!detailPanelSpoke}
          onClose={() => setDetailPanelSpoke(null)}
          onSuspend={(spoke) => setConfirmAction({ type: 'suspend', spoke })}
          onRevoke={(spoke) => setConfirmAction({ type: 'revoke', spoke })}
          onRotateToken={handleRotateToken}
          onForceSync={handleForceSync}
        />

        {/* Confirmation Dialog */}
        {confirmAction && (
          <ConfirmationDialog
            type={confirmAction.type}
            spoke={confirmAction.spoke}
            onConfirm={async (reason) => {
              if (confirmAction.type === 'suspend') {
                await handleSuspend(confirmAction.spoke, reason || 'Suspended by admin');
              } else {
                await handleRevoke(confirmAction.spoke);
              }
            }}
            onCancel={() => setConfirmAction(null)}
          />
        )}
      </div>
    </PageLayout>
  );
}

// Confirmation Dialog Component
function ConfirmationDialog({
  type,
  spoke,
  onConfirm,
  onCancel,
}: {
  type: 'suspend' | 'revoke';
  spoke: ISpoke;
  onConfirm: (reason?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(reason);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isRevoke = type === 'revoke';
  const canSubmit = isRevoke ? confirmText === spoke.instanceCode : true;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-50 p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          {isRevoke ? (
            <div className="p-2 bg-red-100 rounded-lg">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
          ) : (
            <div className="p-2 bg-orange-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
            </div>
          )}
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {isRevoke ? 'Revoke Spoke Access' : 'Suspend Spoke'}
            </h3>
            <p className="text-sm text-gray-500">
              {spoke.instanceCode} — {spoke.name}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {isRevoke ? (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                This action is <strong className="text-red-600">permanent</strong>. The spoke will lose all access and must re-register.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Type <strong>{spoke.instanceCode}</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={spoke.instanceCode}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Suspending will temporarily disable the spoke&apos;s access. It can be reactivated later.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reason (optional):
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Enter suspension reason..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !canSubmit}
            className={`px-6 py-2 font-semibold rounded-lg shadow transition-all disabled:opacity-50 ${
              isRevoke
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-orange-600 text-white hover:bg-orange-700'
            }`}
          >
            {isSubmitting ? 'Processing...' : isRevoke ? 'Revoke Access' : 'Suspend Spoke'}
          </button>
        </div>
      </motion.div>
    </>
  );
}

