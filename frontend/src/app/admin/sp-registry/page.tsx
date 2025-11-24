/**
 * DIVE V3 SP Registry Dashboard
 * Admin interface for managing external Service Providers
 * 
 * Features:
 * - List all SPs with filtering
 * - Approve/reject pending SPs
 * - Suspend/activate SPs
 * - View detailed SP information
 * - Manage OAuth credentials
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import { IExternalSP, ISPListFilter } from '@/types/sp-federation.types';

type SPStatus = 'ALL' | 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export default function SPRegistryDashboard() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  
  // State management
  const [sps, setSPs] = useState<IExternalSP[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ISPListFilter>({ status: undefined, page: 1, limit: 20 });
  const [selectedStatus, setSelectedStatus] = useState<SPStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [totalCount, setTotalCount] = useState(0);

  // Fetch SPs from API
  const fetchSPs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const queryParams = new URLSearchParams();
      if (filter.status) queryParams.append('status', filter.status);
      if (filter.country) queryParams.append('country', filter.country);
      if (filter.organizationType) queryParams.append('organizationType', filter.organizationType);
      if (searchQuery) queryParams.append('search', searchQuery);
      queryParams.append('page', (filter.page || 1).toString());
      queryParams.append('limit', (filter.limit || 20).toString());

      const response = await fetch(`/api/admin/sp-registry?${queryParams.toString()}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch SPs');
      }

      const data = await response.json();
      setSPs(data.sps || data || []);
      setTotalCount(data.total || (data.sps || data || []).length);
    } catch (err) {
      console.error('Error fetching SPs:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [filter, searchQuery]);

  // Initial fetch
  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      fetchSPs();
    }
  }, [sessionStatus, fetchSPs]);

  // Redirect if not authenticated
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/login');
    }
  }, [sessionStatus, router]);

  // Handle status filter change
  const handleStatusFilterChange = (status: SPStatus) => {
    setSelectedStatus(status);
    setFilter(prev => ({
      ...prev,
      status: status === 'ALL' ? undefined : status as any,
      page: 1
    }));
  };

  // Handle search
  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFilter(prev => ({ ...prev, page: 1 }));
    fetchSPs();
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

  // Get status counts
  const getStatusCount = (status: SPStatus): number => {
    if (status === 'ALL') return totalCount;
    return sps.filter(sp => sp.status === status).length;
  };

  // Loading state
  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
          <p className="mt-4 text-lg text-gray-600">Loading SP Registry...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated state
  if (sessionStatus === 'unauthenticated') {
    return null;
  }

  return (
    <PageLayout
      user={session?.user || {}}
      breadcrumbs={[
        { label: 'Admin', href: '/admin/dashboard' },
        { label: 'SP Registry', href: null }
      ]}
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        {/* Header */}
        <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                🔐 Service Provider Registry
              </h1>
              <p className="mt-2 text-slate-600 text-lg">
                Manage external Service Providers and federation agreements
              </p>
            </div>

            <button
              onClick={() => router.push('/admin/sp-registry/new')}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg"
            >
              ➕ Register New SP
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          {(['ALL', 'PENDING', 'ACTIVE', 'SUSPENDED'] as SPStatus[]).map(status => (
            <button
              key={status}
              onClick={() => handleStatusFilterChange(status)}
              className={`p-6 rounded-xl shadow-lg transition-all ${
                selectedStatus === status
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white scale-105'
                  : 'bg-white hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <div className="text-sm font-medium opacity-80">
                {status === 'ALL' ? 'Total SPs' : `${status} SPs`}
              </div>
              <div className="mt-2 text-3xl font-bold">
                {getStatusCount(status)}
              </div>
            </button>
          ))}
        </div>

        {/* Search and Filters */}
        <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <input
              type="text"
              placeholder="Search by name, client ID, or technical contact..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all shadow-md hover:shadow-lg"
            >
              🔍 Search
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setFilter({ page: 1, limit: 20 });
                setSelectedStatus('ALL');
              }}
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-all"
            >
              🔄 Reset
            </button>
          </form>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-800 font-medium">❌ {error}</p>
          </div>
        )}

        {/* SP List */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
          {sps.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">📋</div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No Service Providers Found</h3>
              <p className="text-gray-500 mb-6">Get started by registering a new external SP</p>
              <button
                onClick={() => router.push('/admin/sp-registry/new')}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all"
              >
                Register First SP
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">SP Details</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Status</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Organization</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Contact</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Last Activity</th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sps.map((sp) => (
                    <tr key={sp.spId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-semibold text-slate-900">{sp.name}</div>
                          <div className="text-sm text-slate-500">ID: {sp.spId}</div>
                          <div className="text-xs text-slate-400 mt-1">Client: {sp.clientId}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(sp.status)}`}>
                          {sp.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-slate-700">{sp.country}</div>
                          <div className="text-sm text-slate-500">{sp.organizationType}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm text-slate-700">{sp.technicalContact.name}</div>
                          <div className="text-xs text-slate-500">{sp.technicalContact.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {sp.lastActivity
                          ? new Date(sp.lastActivity).toLocaleDateString()
                          : 'Never'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => router.push(`/admin/sp-registry/${sp.spId}`)}
                            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-all"
                          >
                            View
                          </button>
                          {sp.status === 'PENDING' && (
                            <button
                              onClick={() => router.push(`/admin/sp-registry/${sp.spId}?action=approve`)}
                              className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-all"
                            >
                              Approve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {sps.length > 0 && totalCount > (filter.limit || 20) && (
          <div className="mt-6 flex justify-center gap-2">
            <button
              onClick={() => setFilter(prev => ({ ...prev, page: Math.max((prev.page || 1) - 1, 1) }))}
              disabled={(filter.page || 1) === 1}
              className="px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              ← Previous
            </button>
            <span className="px-4 py-2 bg-white border border-slate-300 rounded-lg">
              Page {filter.page || 1} of {Math.ceil(totalCount / (filter.limit || 20))}
            </span>
            <button
              onClick={() => setFilter(prev => ({ ...prev, page: (prev.page || 1) + 1 }))}
              disabled={(filter.page || 1) >= Math.ceil(totalCount / (filter.limit || 20))}
              className="px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </PageLayout>
  );
}











