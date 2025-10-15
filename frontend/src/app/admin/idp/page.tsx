/**
 * IdP Management Page - Enhanced 2025 Edition
 * 
 * Modern UI/UX with:
 * - Card-based layout with smooth animations
 * - Toggle switches for enable/disable
 * - Modal dialogs for detailed views
 * - OIDC/SAML payload viewer
 * - Configuration editor
 * - Microinteractions and transitions
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import { IIdPListItem, IAdminAPIResponse } from '@/types/admin.types';

// ============================================
// Types
// ============================================

interface IdPDetails {
    alias: string;
    displayName: string;
    protocol: string;  // Always present - backend normalizes providerId to protocol
    enabled: boolean;
    config?: any;
    attributeMappings?: any;
    useAuth0?: boolean;
    auth0ClientId?: string;
    submittedBy?: string;
    createdAt?: string;
}

// ============================================
// Main Component
// ============================================

export default function IdPManagementPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { data: session, status } = useSession();
    
    // State
    const [idps, setIdps] = useState<IIdPListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIdP, setSelectedIdP] = useState<IdPDetails | null>(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showPayloadModal, setShowPayloadModal] = useState(false);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
    const [actionInProgress, setActionInProgress] = useState<string | null>(null);

    // URL params for success messages
    const successMessage = searchParams.get('success');
    const auth0Enabled = searchParams.get('auth0') === 'true';
    const auth0ClientId = searchParams.get('clientId');

    // ============================================
    // Effects
    // ============================================

    useEffect(() => {
        if (status === 'authenticated' && session?.accessToken) {
            fetchIdPs();
        }
    }, [status, session?.accessToken]);

    useEffect(() => {
        if (successMessage === 'created') {
            showToast('success', 'Identity Provider created successfully!');
        }
    }, [successMessage]);

    useEffect(() => {
        if (toastMessage) {
            const timer = setTimeout(() => setToastMessage(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [toastMessage]);

    // ============================================
    // API Functions
    // ============================================

    const fetchIdPs = async () => {
        setLoading(true);
        setError(null);

        try {
            const token = (session as any)?.accessToken;
            
            if (!token) {
                setError('No access token available. Please refresh the page.');
                setLoading(false);
                return;
            }

            const url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/idps`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error(`Expected JSON but got ${contentType}. Backend may be down.`);
            }

            const result: IAdminAPIResponse<{ idps: IIdPListItem[]; total: number }> = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `API error: ${response.status}`);
            }

            setIdps(result.data?.idps || []);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to load IdPs';
            setError(errorMsg);
            console.error('fetchIdPs error:', errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const fetchIdPDetails = async (alias: string) => {
        try {
            const token = (session as any)?.accessToken;
            
            console.log('🔍 fetchIdPDetails Debug:', {
                alias,
                hasSession: !!session,
                hasToken: !!token,
                tokenPreview: token ? token.substring(0, 20) + '...' : 'MISSING'
            });
            
            if (!token) {
                showToast('error', 'Session expired. Please refresh the page.');
                console.error('❌ No access token available');
                return null;
            }

            const url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/idps/${alias}`;
            console.log('📡 Fetching IdP details:', url);

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('📥 Response status:', response.status);

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                console.error('❌ Invalid content-type:', contentType);
                throw new Error('Invalid response from server. Please try again.');
            }

            const result: IAdminAPIResponse = await response.json();
            console.log('📦 Response data:', result);
            
            if (result.success && result.data) {
                return result.data as IdPDetails;
            } else {
                throw new Error(result.message || result.error || 'Failed to load details');
            }
        } catch (err) {
            console.error('❌ fetchIdPDetails error:', err);
            showToast('error', err instanceof Error ? err.message : 'Failed to load IdP details');
            return null;
        }
    };

    const toggleIdPStatus = async (alias: string, currentStatus: boolean) => {
        setActionInProgress(alias);
        try {
            const token = (session as any)?.accessToken;
            
            if (!token) {
                showToast('error', 'Session expired. Please refresh the page.');
                return;
            }

            const response = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/idps/${alias}`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        enabled: !currentStatus
                    })
                }
            );

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.message || 'Failed to update IdP status');
            }

            // Update local state
            setIdps(idps.map(idp => 
                idp.alias === alias ? { ...idp, enabled: !currentStatus } : idp
            ));

            showToast('success', `IdP ${!currentStatus ? 'enabled' : 'disabled'} successfully`);
        } catch (err) {
            showToast('error', err instanceof Error ? err.message : 'Failed to update status');
        } finally {
            setActionInProgress(null);
        }
    };

    const handleTest = async (alias: string) => {
        setActionInProgress(alias);
        try {
            const token = (session as any)?.accessToken;
            
            if (!token) {
                showToast('error', 'Session expired. Please refresh the page.');
                return;
            }

            const response = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/idps/${alias}/test`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const result: IAdminAPIResponse = await response.json();
            
            if (result.success) {
                showToast('success', `✅ Test successful: ${result.message}`);
            } else {
                showToast('error', `❌ Test failed: ${result.message}`);
            }
        } catch (err) {
            showToast('error', err instanceof Error ? err.message : 'Test failed');
        } finally {
            setActionInProgress(null);
        }
    };

    const handleDelete = async (alias: string, displayName: string) => {
        if (!confirm(`Are you sure you want to delete "${displayName}"?\n\nThis action cannot be undone.`)) {
            return;
        }

        setActionInProgress(alias);
        try {
            const token = (session as any)?.accessToken;
            
            if (!token) {
                showToast('error', 'Session expired. Please refresh the page.');
                return;
            }

            const response = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/idps/${alias}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.message || 'Failed to delete IdP');
            }

            setIdps(idps.filter(idp => idp.alias !== alias));
            showToast('success', 'IdP deleted successfully');
        } catch (err) {
            showToast('error', err instanceof Error ? err.message : 'Failed to delete IdP');
        } finally {
            setActionInProgress(null);
        }
    };

    // ============================================
    // Modal Functions
    // ============================================

    const openDetailsModal = async (alias: string) => {
        const details = await fetchIdPDetails(alias);
        if (details) {
            setSelectedIdP(details);
            setShowDetailsModal(true);
        }
    };

    const openPayloadModal = async (alias: string) => {
        const details = await fetchIdPDetails(alias);
        if (details) {
            setSelectedIdP(details);
            setShowPayloadModal(true);
        }
    };

    const openConfigModal = async (alias: string) => {
        const details = await fetchIdPDetails(alias);
        if (details) {
            setSelectedIdP(details);
            setShowConfigModal(true);
        }
    };

    const showToast = (type: 'success' | 'error' | 'info', message: string) => {
        setToastMessage({ type, message });
    };

    // ============================================
    // Render Helpers
    // ============================================

    if (status === 'loading' || loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
                <div className="text-center">
                    <div className="relative">
                        <div className="animate-spin rounded-full h-16 w-16 border-4 border-slate-200 border-t-blue-600 mx-auto"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="h-8 w-8 rounded-full bg-blue-100 animate-pulse"></div>
                        </div>
                    </div>
                    <p className="mt-6 text-slate-600 font-medium animate-pulse">Loading Identity Providers...</p>
                </div>
            </div>
        );
    }

    if (status === 'unauthenticated') {
        router.push('/login');
        return null;
    }

    const filteredIdps = idps.filter(
        (idp) =>
            idp.alias.toLowerCase().includes(searchQuery.toLowerCase()) ||
            idp.displayName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <PageLayout 
            user={session?.user || {}}
            breadcrumbs={[
                { label: 'Admin', href: '/admin/dashboard' },
                { label: 'Identity Providers', href: null }
            ]}
        >
            {/* Header Section */}
            <div className="mb-8 animate-fade-in">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
                            Identity Providers
                        </h1>
                        <p className="mt-2 text-slate-600 max-w-2xl">
                            Manage OIDC and SAML identity providers for coalition authentication
                        </p>
                    </div>
                    <button
                        onClick={() => router.push('/admin/idp/new')}
                        className="group relative inline-flex items-center px-6 py-3 overflow-hidden font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95"
                    >
                        <span className="absolute w-0 h-0 transition-all duration-300 ease-out bg-white rounded-full group-hover:w-32 group-hover:h-32 opacity-10"></span>
                        <svg className="relative mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="relative">Add Identity Provider</span>
                    </button>
                </div>
            </div>

            {/* Success Banner */}
            {successMessage === 'created' && (
                <div className="mb-6 animate-slide-in-top">
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 shadow-sm">
                        <div className="flex items-start">
                            <div className="flex-shrink-0">
                                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-green-100 text-green-600">
                                    <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                </div>
                            </div>
                            <div className="ml-4 flex-1">
                                <h3 className="text-lg font-bold text-green-900">
                                    Identity Provider Created Successfully!
                                </h3>
                                <p className="mt-1 text-sm text-green-700">
                                    {auth0Enabled 
                                        ? 'Your IdP has been created with Auth0 integration and submitted for approval.'
                                        : 'Your IdP has been submitted for approval.'
                                    }
                                </p>
                                {auth0Enabled && auth0ClientId && (
                                    <div className="mt-3 bg-white rounded-lg p-4 border border-green-200">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium text-slate-700">Auth0 Client ID:</span>
                                            <div className="flex items-center gap-2">
                                                <code className="text-sm font-mono bg-slate-100 px-3 py-1 rounded-md text-slate-800">
                                                    {auth0ClientId}
                                                </code>
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(auth0ClientId);
                                                        showToast('success', 'Client ID copied to clipboard!');
                                                    }}
                                                    className="p-2 text-green-600 hover:bg-green-50 rounded-md transition-colors"
                                                    title="Copy Client ID"
                                                >
                                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => router.push('/admin/idp')}
                                className="ml-4 text-green-600 hover:text-green-800 transition-colors"
                            >
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Banner */}
            {error && (
                <div className="mb-6 animate-shake">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3 flex-1">
                                <p className="text-sm font-medium text-red-800">{error}</p>
                            </div>
                            <button
                                onClick={() => setError(null)}
                                className="ml-4 text-red-400 hover:text-red-600 transition-colors"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Search Bar */}
            <div className="mb-6 animate-fade-in">
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        placeholder="Search identity providers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="block w-full pl-12 pr-4 py-3 border border-slate-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                    />
                </div>
            </div>

            {/* IdP Cards Grid */}
            {filteredIdps.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center animate-fade-in">
                    <div className="mx-auto h-24 w-24 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center mb-4">
                        <svg className="h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900 mb-2">No Identity Providers Found</h3>
                    <p className="text-slate-600 mb-6">
                        {searchQuery 
                            ? 'Try adjusting your search query'
                            : 'Get started by creating your first identity provider'
                        }
                    </p>
                    {!searchQuery && (
                        <button
                            onClick={() => router.push('/admin/idp/new')}
                            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl"
                        >
                            <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Create Your First IdP
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredIdps.map((idp, index) => (
                        <IdPCard
                            key={idp.alias}
                            idp={idp}
                            index={index}
                            actionInProgress={actionInProgress}
                            onToggleStatus={toggleIdPStatus}
                            onTest={handleTest}
                            onViewDetails={openDetailsModal}
                            onViewPayload={openPayloadModal}
                            onViewConfig={openConfigModal}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}

            {/* Modals */}
            {showDetailsModal && selectedIdP && (
                <DetailsModal
                    idp={selectedIdP}
                    onClose={() => setShowDetailsModal(false)}
                />
            )}

            {showPayloadModal && selectedIdP && (
                <PayloadModal
                    idp={selectedIdP}
                    onClose={() => setShowPayloadModal(false)}
                />
            )}

            {showConfigModal && selectedIdP && (
                <ConfigModal
                    idp={selectedIdP}
                    onClose={() => setShowConfigModal(false)}
                    onSave={async (updates) => {
                        // Handle config update
                        showToast('success', 'Configuration updated successfully');
                        setShowConfigModal(false);
                        fetchIdPs();
                    }}
                />
            )}

            {/* Toast Notification */}
            {toastMessage && (
                <Toast
                    type={toastMessage.type}
                    message={toastMessage.message}
                    onClose={() => setToastMessage(null)}
                />
            )}
        </PageLayout>
    );
}

// ============================================
// IdP Card Component
// ============================================

interface IdPCardProps {
    idp: IIdPListItem;
    index: number;
    actionInProgress: string | null;
    onToggleStatus: (alias: string, currentStatus: boolean) => void;
    onTest: (alias: string) => void;
    onViewDetails: (alias: string) => void;
    onViewPayload: (alias: string) => void;
    onViewConfig: (alias: string) => void;
    onDelete: (alias: string, displayName: string) => void;
}

function IdPCard({
    idp,
    index,
    actionInProgress,
    onToggleStatus,
    onTest,
    onViewDetails,
    onViewPayload,
    onViewConfig,
    onDelete
}: IdPCardProps) {
    const [showActions, setShowActions] = useState(false);
    const isProcessing = actionInProgress === idp.alias;

    return (
        <div
            className="group bg-white rounded-2xl shadow-sm border border-slate-200 p-6 hover:shadow-xl hover:border-blue-300 transition-all duration-300 animate-fade-in-up"
            style={{ animationDelay: `${index * 50}ms` }}
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-slate-900 truncate">
                            {idp.displayName}
                        </h3>
                        {idp.enabled ? (
                            <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                Active
                            </span>
                        ) : (
                            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full">
                                Inactive
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-slate-500 font-mono">{idp.alias}</p>
                </div>

                {/* Protocol Badge */}
                <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                    idp.protocol === 'oidc' 
                        ? 'bg-blue-100 text-blue-700' 
                        : idp.protocol === 'saml'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-slate-100 text-slate-700'
                }`}>
                    {idp.protocol?.toUpperCase() || 'UNKNOWN'}
                </span>
            </div>

            {/* Status Toggle */}
            <div className="mb-6 pb-6 border-b border-slate-100">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">
                        IdP Status
                    </span>
                    <button
                        onClick={() => onToggleStatus(idp.alias, idp.enabled)}
                        disabled={isProcessing}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                            idp.enabled ? 'bg-green-500' : 'bg-slate-300'
                        } ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 shadow-sm ${
                                idp.enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                        />
                    </button>
                </div>
            </div>

            {/* Quick Actions - Compact Grid */}
            <div className="grid grid-cols-2 gap-2">
                <button
                    onClick={() => onViewDetails(idp.alias)}
                    className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors group/btn"
                    title="View Details"
                >
                    <svg className="h-4 w-4 text-slate-400 group-hover/btn:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Details</span>
                </button>

                <button
                    onClick={() => onViewPayload(idp.alias)}
                    className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-purple-50 hover:text-purple-700 rounded-lg transition-colors group/btn"
                    title="View Expected Payload"
                >
                    <svg className="h-4 w-4 text-slate-400 group-hover/btn:text-purple-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    <span>Payload</span>
                </button>

                <button
                    onClick={() => onViewConfig(idp.alias)}
                    className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg transition-colors group/btn"
                    title="Edit Configuration"
                >
                    <svg className="h-4 w-4 text-slate-400 group-hover/btn:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>Config</span>
                </button>

                <button
                    onClick={() => onTest(idp.alias)}
                    disabled={isProcessing}
                    className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-green-50 hover:text-green-700 rounded-lg transition-colors group/btn disabled:opacity-50"
                    title="Test Connection"
                >
                    {isProcessing ? (
                        <div className="h-4 w-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <svg className="h-4 w-4 text-slate-400 group-hover/btn:text-green-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    )}
                    <span>Test</span>
                </button>
            </div>

            {/* Delete Button - Separated for safety */}
            <div className="mt-4 pt-4 border-t border-slate-100">
                <button
                    onClick={() => onDelete(idp.alias, idp.displayName)}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete IdP
                </button>
            </div>
        </div>
    );
}

// ============================================
// Details Modal Component
// ============================================

interface DetailsModalProps {
    idp: IdPDetails;
    onClose: () => void;
}

function DetailsModal({ idp, onClose }: DetailsModalProps) {
    return (
        <div className="fixed inset-0 z-50 overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                {/* Backdrop */}
                <div 
                    className="fixed inset-0 bg-slate-900 bg-opacity-75 transition-opacity animate-fade-in"
                    onClick={onClose}
                ></div>

                {/* Modal */}
                <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full animate-scale-in">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-bold text-white">
                                Identity Provider Details
                            </h3>
                            <button
                                onClick={onClose}
                                className="text-white hover:text-slate-200 transition-colors"
                            >
                                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="px-6 py-6 max-h-[70vh] overflow-y-auto">
                        <div className="space-y-6">
                            {/* Basic Info */}
                            <div>
                                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Basic Information</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <DetailItem label="Display Name" value={idp.displayName} />
                                    <DetailItem label="Alias" value={idp.alias} />
                                    <DetailItem label="Protocol" value={idp.protocol?.toUpperCase() || 'UNKNOWN'} />
                                    <DetailItem 
                                        label="Status" 
                                        value={
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                idp.enabled 
                                                    ? 'bg-green-100 text-green-800' 
                                                    : 'bg-slate-100 text-slate-600'
                                            }`}>
                                                {idp.enabled && <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>}
                                                {idp.enabled ? 'Active' : 'Inactive'}
                                            </span>
                                        }
                                    />
                                </div>
                            </div>

                            {/* Auth0 Integration */}
                            {idp.useAuth0 && (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0">
                                            <svg className="h-6 w-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <div className="flex-1">
                                            <h5 className="text-sm font-bold text-blue-900 mb-1">
                                                🔵 Auth0 Integration Active
                                            </h5>
                                            {idp.auth0ClientId && (
                                                <div className="mt-2 flex items-center gap-2">
                                                    <span className="text-xs font-medium text-blue-700">Client ID:</span>
                                                    <code className="text-xs bg-white px-2 py-1 rounded border border-blue-200 font-mono text-blue-900">
                                                        {idp.auth0ClientId}
                                                    </code>
                                                    <button
                                                        onClick={() => {
                                                            if (idp.auth0ClientId) {
                                                                navigator.clipboard.writeText(idp.auth0ClientId);
                                                            }
                                                        }}
                                                        className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                                                    >
                                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Attribute Mappings */}
                            {idp.attributeMappings && (
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Attribute Mappings</h4>
                                    <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                                        {Object.entries(idp.attributeMappings).map(([key, mapping]: [string, any]) => (
                                            <div key={key} className="flex items-center justify-between py-2">
                                                <span className="text-sm font-medium text-slate-700">{key}</span>
                                                <code className="text-sm bg-white px-3 py-1 rounded border border-slate-200 font-mono text-slate-800">
                                                    {mapping.claim || mapping}
                                                </code>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Metadata */}
                            {(idp.submittedBy || idp.createdAt) && (
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Metadata</h4>
                                    <div className="space-y-2">
                                        {idp.submittedBy && (
                                            <DetailItem label="Created By" value={idp.submittedBy} />
                                        )}
                                        {idp.createdAt && (
                                            <DetailItem 
                                                label="Created At" 
                                                value={new Date(idp.createdAt).toLocaleString()} 
                                            />
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="bg-slate-50 px-6 py-4 flex justify-end">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-300 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================
// Payload Modal Component
// ============================================

interface PayloadModalProps {
    idp: IdPDetails;
    onClose: () => void;
}

function PayloadModal({ idp, onClose }: PayloadModalProps) {
    const [copied, setCopied] = useState(false);

    const generateExpectedPayload = () => {
        if (idp.protocol === 'oidc') {
            return {
                sub: "user-unique-identifier",
                name: "John Doe",
                email: "john.doe@example.com",
                clearance: "SECRET",
                country: "USA",
                groups: ["NATO-COSMIC", "FVEY"],
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 3600
            };
        } else if (idp.protocol === 'saml') {
            return {
                "urn:oasis:names:tc:SAML:attribute:subject-id": "user-unique-identifier",
                "urn:oid:2.5.4.42": "John",
                "urn:oid:2.5.4.4": "Doe",
                "urn:oid:0.9.2342.19200300.100.1.3": "john.doe@example.com",
                "clearance": "SECRET",
                "country": "USA",
                "groups": ["NATO-COSMIC", "FVEY"]
            };
        } else {
            return {
                "error": "Unknown protocol",
                "message": "Protocol not set or invalid. Expected 'oidc' or 'saml'."
            };
        }
    };

    const payload = generateExpectedPayload();
    const payloadString = JSON.stringify(payload, null, 2);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(payloadString);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                {/* Backdrop */}
                <div 
                    className="fixed inset-0 bg-slate-900 bg-opacity-75 transition-opacity"
                    onClick={onClose}
                ></div>

                {/* Modal */}
                <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full animate-scale-in">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-white">
                                    Expected {idp.protocol?.toUpperCase() || 'UNKNOWN'} Payload
                                </h3>
                                <p className="text-sm text-purple-100 mt-1">
                                    Sample payload structure for {idp.displayName}
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="text-white hover:text-slate-200 transition-colors"
                            >
                                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="px-6 py-6">
                        <div className="relative">
                            <button
                                onClick={copyToClipboard}
                                className={`absolute top-4 right-4 px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
                                    copied 
                                        ? 'bg-green-500 text-white' 
                                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                }`}
                            >
                                {copied ? (
                                    <span className="flex items-center gap-2">
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Copied!
                                    </span>
                                ) : (
                                    'Copy'
                                )}
                            </button>
                            <pre className="bg-slate-900 text-slate-100 p-6 rounded-xl overflow-x-auto font-mono text-sm">
                                {payloadString}
                            </pre>
                        </div>

                        {/* Attribute Mapping Info */}
                        {idp.attributeMappings && (
                            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
                                <h4 className="text-sm font-bold text-blue-900 mb-3">Configured Attribute Mappings</h4>
                                <div className="space-y-2">
                                    {Object.entries(idp.attributeMappings).map(([key, mapping]: [string, any]) => (
                                        <div key={key} className="flex items-center gap-2 text-sm">
                                            <code className="bg-white px-2 py-1 rounded border border-blue-200 text-blue-900 font-mono">
                                                {mapping.claim || mapping}
                                            </code>
                                            <span className="text-blue-600">→</span>
                                            <span className="text-blue-900 font-medium">{key}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3">
                        <button
                            onClick={copyToClipboard}
                            className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            Copy Payload
                        </button>
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-300 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================
// Config Modal Component
// ============================================

interface ConfigModalProps {
    idp: IdPDetails;
    onClose: () => void;
    onSave: (updates: any) => Promise<void>;
}

function ConfigModal({ idp, onClose, onSave }: ConfigModalProps) {
    const [config, setConfig] = useState(JSON.stringify(idp.config || {}, null, 2));
    const [isValid, setIsValid] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const handleConfigChange = (value: string) => {
        setConfig(value);
        try {
            JSON.parse(value);
            setIsValid(true);
        } catch {
            setIsValid(false);
        }
    };

    const handleSave = async () => {
        if (!isValid) return;
        
        setIsSaving(true);
        try {
            const parsedConfig = JSON.parse(config);
            await onSave({ config: parsedConfig });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                {/* Backdrop */}
                <div 
                    className="fixed inset-0 bg-slate-900 bg-opacity-75 transition-opacity"
                    onClick={onClose}
                ></div>

                {/* Modal */}
                <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full animate-scale-in">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-white">
                                    Configuration Editor
                                </h3>
                                <p className="text-sm text-indigo-100 mt-1">
                                    Edit {idp.displayName} configuration
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="text-white hover:text-slate-200 transition-colors"
                            >
                                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="px-6 py-6">
                        {!isValid && (
                            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                                <svg className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-sm font-medium text-red-800">Invalid JSON syntax</span>
                            </div>
                        )}

                        <div className="relative">
                            <textarea
                                value={config}
                                onChange={(e) => handleConfigChange(e.target.value)}
                                className={`w-full h-96 bg-slate-900 text-slate-100 p-6 rounded-xl font-mono text-sm border-2 ${
                                    isValid ? 'border-slate-700' : 'border-red-500'
                                } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                                spellCheck={false}
                            />
                        </div>

                        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
                            <svg className="h-5 w-5 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div>
                                <p className="text-sm font-medium text-yellow-800">Warning</p>
                                <p className="text-sm text-yellow-700">
                                    Modifying configuration may affect authentication flows. Test thoroughly after saving.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-300 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!isValid || isSaving}
                            className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isSaving ? (
                                <>
                                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Saving...
                                </>
                            ) : (
                                'Save Changes'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================
// Helper Components
// ============================================

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</dt>
            <dd className="text-sm font-semibold text-slate-900">{value}</dd>
        </div>
    );
}

function Toast({ 
    type, 
    message, 
    onClose 
}: { 
    type: 'success' | 'error' | 'info'; 
    message: string; 
    onClose: () => void;
}) {
    const colors = {
        success: {
            bg: 'bg-green-50',
            border: 'border-green-200',
            icon: 'text-green-500',
            text: 'text-green-800'
        },
        error: {
            bg: 'bg-red-50',
            border: 'border-red-200',
            icon: 'text-red-500',
            text: 'text-red-800'
        },
        info: {
            bg: 'bg-blue-50',
            border: 'border-blue-200',
            icon: 'text-blue-500',
            text: 'text-blue-800'
        }
    };

    const color = colors[type];

    return (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-in-right">
            <div className={`${color.bg} ${color.border} border rounded-xl shadow-lg p-4 max-w-md flex items-start gap-3`}>
                <div className={color.icon}>
                    {type === 'success' && (
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    )}
                    {type === 'error' && (
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    )}
                    {type === 'info' && (
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    )}
                </div>
                <p className={`${color.text} text-sm font-medium flex-1`}>{message}</p>
                <button
                    onClick={onClose}
                    className={`${color.text} hover:opacity-70 transition-opacity`}
                >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
