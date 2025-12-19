/**
 * DIVE V3 SP Registry - SP Detail View
 * View and manage individual Service Provider
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import { IExternalSP } from '@/types/sp-federation.types';

interface SPDetailPageProps {
  params: Promise<{
    spId: string;
  }>;
}

export default function SPDetailPage({ params }: SPDetailPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  
  const [spId, setSpId] = useState<string | null>(null);
  const [sp, setSP] = useState<IExternalSP | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'oauth' | 'activity'>('overview');
  
  // Action modals
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  // Unwrap params Promise
  useEffect(() => {
    params.then(p => setSpId(p.spId));
  }, [params]);

  // Fetch SP data
  useEffect(() => {
    if (!spId) return;
    
    const fetchSP = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/admin/sp-registry/${spId}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch SP details');
        }

        const data = await response.json();
        setSP(data);

        // Check if we should show approval modal
        if (searchParams?.get('action') === 'approve') {
          setShowApprovalModal(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    if (sessionStatus === 'authenticated') {
      fetchSP();
    }
  }, [spId, sessionStatus, searchParams]);

  // Handle SP approval
  const handleApprove = async () => {
    if (!spId) return;
    try {
      setActionInProgress(true);
      const response = await fetch(`/api/admin/sp-registry/${spId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' })
      });

      if (!response.ok) {
        throw new Error('Failed to approve SP');
      }

      // Refresh SP data
      const updatedSP = await response.json();
      setSP(updatedSP);
      setShowApprovalModal(false);
      alert('SP approved successfully!');
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setActionInProgress(false);
    }
  };

  // Handle SP suspension
  const handleSuspend = async (reason: string) => {
    if (!spId) return;
    try {
      setActionInProgress(true);
      const response = await fetch(`/api/admin/sp-registry/${spId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });

      if (!response.ok) {
        throw new Error('Failed to suspend SP');
      }

      // Refresh SP data
      const updatedSP = await response.json();
      setSP(updatedSP);
      setShowSuspendModal(false);
      alert('SP suspended successfully!');
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setActionInProgress(false);
    }
  };

  // Handle credential regeneration
  const handleRegenerateSecret = async () => {
    if (!spId) return;
    try {
      setActionInProgress(true);
      const response = await fetch(`/api/admin/sp-registry/${spId}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate client secret');
      }

      const data = await response.json();
      setNewSecret(data.clientSecret);
      setShowRegenerateModal(false);
      alert('Client secret regenerated! Copy it now - it will only be shown once.');
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setActionInProgress(false);
    }
  };

  // Get status badge color
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'SUSPENDED': return 'bg-red-100 text-red-800';
      case 'REVOKED': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
          <p className="mt-4 text-lg text-gray-600">Loading SP Details...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !sp) {
    return (
      <PageLayout user={session?.user || {}}>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Error Loading SP</h2>
            <p className="text-gray-600 mb-4">{error || 'SP not found'}</p>
            <button
              onClick={() => router.push('/admin/sp-registry')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              ← Back to SP Registry
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      user={session?.user || {}}
      breadcrumbs={[
        { label: 'Admin', href: '/admin/dashboard' },
        { label: 'SP Registry', href: '/admin/sp-registry' },
        { label: sp.name, href: null }
      ]}
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 py-8">
        {/* Header */}
        <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-4">
                <h1 className="text-3xl font-bold text-slate-900">{sp.name}</h1>
                <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(sp.status)}`}>
                  {sp.status}
                </span>
              </div>
              <p className="mt-2 text-slate-600">
                {sp.description || 'No description provided'}
              </p>
              <div className="mt-2 text-sm text-slate-500">
                SP ID: {sp.spId} • Client ID: {sp.clientId}
              </div>
            </div>

            <div className="flex gap-3">
              {sp.status === 'PENDING' && (
                <button
                  onClick={() => setShowApprovalModal(true)}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
                >
                  ✓ Approve
                </button>
              )}
              {sp.status === 'ACTIVE' && (
                <button
                  onClick={() => setShowSuspendModal(true)}
                  className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700"
                >
                  ⏸ Suspend
                </button>
              )}
              <button
                onClick={() => router.push('/admin/sp-registry')}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200"
              >
                ← Back
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-2">
          <nav className="flex space-x-2">
            {[
              { id: 'overview', label: '📊 Overview' },
              { id: 'oauth', label: '🔐 OAuth Credentials' },
              { id: 'activity', label: '📡 Activity' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-500 mb-2">Organization Type</h3>
                  <p className="text-lg font-medium text-slate-900">{sp.organizationType}</p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-500 mb-2">Country</h3>
                  <p className="text-lg font-medium text-slate-900">{sp.country}</p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-500 mb-2">Technical Contact</h3>
                  <p className="text-lg font-medium text-slate-900">{sp.technicalContact.name}</p>
                  <p className="text-sm text-slate-600">{sp.technicalContact.email}</p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-500 mb-2">Last Activity</h3>
                  <p className="text-lg font-medium text-slate-900">
                    {sp.lastActivity ? new Date(sp.lastActivity).toLocaleString() : 'Never'}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-500 mb-2">Allowed Scopes</h3>
                <div className="flex flex-wrap gap-2">
                  {sp.allowedScopes.map(scope => (
                    <span key={scope} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                      {scope}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-500 mb-2">Allowed Grant Types</h3>
                <div className="flex flex-wrap gap-2">
                  {sp.allowedGrantTypes.map(grant => (
                    <span key={grant} className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                      {grant}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-500 mb-2">Rate Limits</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600">Requests/Min</p>
                    <p className="text-2xl font-bold text-slate-900">{sp.rateLimit.requestsPerMinute}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600">Burst Size</p>
                    <p className="text-2xl font-bold text-slate-900">{sp.rateLimit.burstSize}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600">Daily Quota</p>
                    <p className="text-2xl font-bold text-slate-900">{sp.rateLimit.quotaPerDay || 'Unlimited'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* OAuth Credentials Tab */}
          {activeTab === 'oauth' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">OAuth Credentials</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Client ID</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={sp.clientId}
                        readOnly
                        className="flex-1 px-4 py-3 border border-slate-300 rounded-lg bg-slate-50"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(sp.clientId);
                          alert('Client ID copied to clipboard!');
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        📋 Copy
                      </button>
                    </div>
                  </div>

                  {sp.clientType === 'confidential' && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Client Secret</label>
                      {newSecret ? (
                        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-sm text-green-800 font-semibold mb-2">⚠️ Save this secret now! It will not be shown again.</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newSecret}
                              readOnly
                              className="flex-1 px-4 py-3 border border-green-300 rounded-lg bg-white"
                            />
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(newSecret);
                                alert('Secret copied to clipboard!');
                              }}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                            >
                              📋 Copy
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm text-slate-600 mb-2">Secret is hidden for security. Regenerate to get a new one.</p>
                          <button
                            onClick={() => setShowRegenerateModal(true)}
                            className="px-6 py-3 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700"
                          >
                            🔄 Regenerate Secret
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Redirect URIs</label>
                    <ul className="list-disc list-inside space-y-1">
                      {sp.redirectUris.map((uri, index) => (
                        <li key={index} className="text-sm text-slate-600">{uri}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Recent Activity</h3>
              <p className="text-slate-600">Activity logs coming soon...</p>
            </div>
          )}
        </div>

        {/* Approval Modal */}
        {showApprovalModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-8 max-w-md w-full">
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Approve Service Provider?</h2>
              <p className="text-slate-600 mb-6">
                This will activate the SP and enable OAuth authentication. Are you sure you want to proceed?
              </p>
              <div className="flex gap-4">
                <button
                  onClick={handleApprove}
                  disabled={actionInProgress}
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
                >
                  {actionInProgress ? 'Approving...' : '✓ Approve'}
                </button>
                <button
                  onClick={() => setShowApprovalModal(false)}
                  disabled={actionInProgress}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Regenerate Secret Modal */}
        {showRegenerateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-8 max-w-md w-full">
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Regenerate Client Secret?</h2>
              <p className="text-slate-600 mb-6">
                ⚠️ This will invalidate the current client secret. The SP will need to update their configuration with the new secret.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={handleRegenerateSecret}
                  disabled={actionInProgress}
                  className="flex-1 px-6 py-3 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 disabled:opacity-50"
                >
                  {actionInProgress ? 'Regenerating...' : '🔄 Regenerate'}
                </button>
                <button
                  onClick={() => setShowRegenerateModal(false)}
                  disabled={actionInProgress}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
