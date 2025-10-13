/**
 * IdP Approvals Page
 * 
 * Review and approve/reject pending IdP submissions
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/navigation';

interface IIdPSubmission {
    submissionId: string;
    alias: string;
    displayName: string;
    description?: string;
    protocol: 'oidc' | 'saml';
    status: string;
    config: any;
    attributeMappings: any;
    submittedBy: string;
    submittedAt: string;
}

export default function ApprovalsPage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [pending, setPending] = useState<IIdPSubmission[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedIdP, setSelectedIdP] = useState<IIdPSubmission | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (status === 'authenticated' && session?.accessToken) {
            fetchPending();
        }
    }, [status, session?.accessToken]);

    const fetchPending = async () => {
        setLoading(true);
        setError(null);

        try {
            const token = (session as any)?.accessToken;
            if (!token) {
                setError('No access token available. Please refresh the page.');
                setLoading(false);
                return;
            }

            const response = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/approvals/pending`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error(`Expected JSON but got ${contentType}. Backend may be down or returning HTML error.`);
            }

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `API error: ${response.status} ${response.statusText}`);
            }

            setPending(result.data?.pending || []);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to load pending approvals';
            setError(errorMsg);
            console.error('fetchPending error:', errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (alias: string) => {
        if (!confirm(`Approve IdP "${alias}" and activate it?`)) {
            return;
        }

        setIsProcessing(true);

        try {
            const token = (session as any)?.accessToken;
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/approvals/${alias}/approve`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to approve IdP');
            }

            // Refresh list
            fetchPending();
            setSelectedIdP(null);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to approve IdP');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReject = async (alias: string) => {
        if (!rejectReason.trim()) {
            alert('Please provide a rejection reason');
            return;
        }

        setIsProcessing(true);

        try {
            const token = (session as any)?.accessToken;
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/approvals/${alias}/reject`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ reason: rejectReason })
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to reject IdP');
            }

            // Refresh list
            fetchPending();
            setSelectedIdP(null);
            setRejectReason('');
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to reject IdP');
        } finally {
            setIsProcessing(false);
        }
    };

    if (status === 'loading' || loading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading approvals...</p>
                </div>
            </div>
        );
    }

    if (status === 'unauthenticated') {
        router.push('/login');
        return null;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <Navigation user={session?.user || {}} />
            
            <div className="py-8">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    {/* Header */}
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-gray-900">IdP Approvals</h1>
                    <p className="mt-2 text-sm text-gray-600">
                        Review and approve or reject pending identity provider submissions.
                    </p>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-6 rounded-md bg-red-50 p-4">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <p className="text-sm font-medium text-red-800">{error}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Pending Submissions */}
                {pending.length === 0 ? (
                    <div className="bg-white shadow sm:rounded-lg">
                        <div className="px-4 py-12 text-center">
                            <svg
                                className="mx-auto h-12 w-12 text-gray-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <h3 className="mt-2 text-sm font-medium text-gray-900">No Pending Approvals</h3>
                            <p className="mt-1 text-sm text-gray-500">
                                All identity provider submissions have been reviewed.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {pending.map((submission) => (
                            <div key={submission.submissionId} className="bg-white shadow sm:rounded-lg">
                                <div className="px-4 py-5 sm:p-6">
                                    {/* Header */}
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h3 className="text-lg font-medium text-gray-900">
                                                {submission.displayName}
                                            </h3>
                                            <p className="mt-1 text-sm text-gray-500">
                                                Alias: <code className="text-blue-600">{submission.alias}</code>
                                            </p>
                                        </div>
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                            {submission.protocol.toUpperCase()}
                                        </span>
                                    </div>

                                    {/* Details */}
                                    <div className="mb-4 space-y-2">
                                        <p className="text-sm text-gray-700">
                                            <strong>Description:</strong> {submission.description || 'N/A'}
                                        </p>
                                        <p className="text-sm text-gray-700">
                                            <strong>Submitted by:</strong> {submission.submittedBy}
                                        </p>
                                        <p className="text-sm text-gray-700">
                                            <strong>Submitted at:</strong> {new Date(submission.submittedAt).toLocaleString()}
                                        </p>
                                    </div>

                                    {/* View Details Button */}
                                    <button
                                        onClick={() => setSelectedIdP(selectedIdP?.alias === submission.alias ? null : submission)}
                                        className="text-sm text-blue-600 hover:text-blue-500 mb-4"
                                    >
                                        {selectedIdP?.alias === submission.alias ? 'Hide' : 'Show'} Configuration Details
                                    </button>

                                    {/* Configuration Details (Expandable) */}
                                    {selectedIdP?.alias === submission.alias && (
                                        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                                            <pre className="text-xs text-gray-700 overflow-x-auto">
                                                {JSON.stringify(
                                                    {
                                                        config: submission.config,
                                                        attributeMappings: submission.attributeMappings
                                                    },
                                                    null,
                                                    2
                                                )}
                                            </pre>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex items-center space-x-4">
                                        <button
                                            onClick={() => handleApprove(submission.alias)}
                                            disabled={isProcessing}
                                            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                                        >
                                            <svg className="-ml-1 mr-2 h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                            Approve
                                        </button>

                                        <div className="flex-1">
                                            <input
                                                type="text"
                                                placeholder="Rejection reason..."
                                                value={selectedIdP?.alias === submission.alias ? rejectReason : ''}
                                                onChange={(e) => {
                                                    setSelectedIdP(submission);
                                                    setRejectReason(e.target.value);
                                                }}
                                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm"
                                            />
                                        </div>

                                        <button
                                            onClick={() => handleReject(submission.alias)}
                                            disabled={isProcessing}
                                            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                                        >
                                            <svg className="-ml-1 mr-2 h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                            </svg>
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                </div>
            </div>
        </div>
    );
}

