/**
 * IdP Approvals Page
 * 
 * Review and approve/reject pending IdP submissions
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import RiskScoreBadge from '@/components/admin/risk-score-badge';
import RiskBreakdown from '@/components/admin/risk-breakdown';
import ComplianceStatusCard from '@/components/admin/compliance-status-card';
import SLACountdown from '@/components/admin/sla-countdown';
import RiskFactorAnalysis from '@/components/admin/risk-factor-analysis';

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
    // Auth0 Integration (Week 3.4.6)
    useAuth0?: boolean;
    auth0ClientId?: string;
    auth0ClientSecret?: string;
    // Phase 2: Comprehensive Risk Scoring & Compliance
    comprehensiveRiskScore?: {
        total: number;
        riskLevel: 'minimal' | 'low' | 'medium' | 'high';
        tier: 'gold' | 'silver' | 'bronze' | 'fail';
        breakdown: {
            technicalSecurity: number;
            authenticationStrength: number;
            operationalMaturity: number;
            complianceGovernance: number;
        };
        factors: any[];
        recommendations: string[];
    };
    complianceCheck?: any;
    approvalDecision?: {
        action: string;
        reason: string;
        slaDeadline?: string;
        nextSteps?: string[];
    };
    slaDeadline?: string;
    slaStatus?: 'within' | 'approaching' | 'exceeded';
    autoApproved?: boolean;
    fastTrack?: boolean;
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
        if (status === 'authenticated') {
            fetchPending();
        }
    }, [status]);

    // Redirect to login if not authenticated (separate effect to avoid render-phase updates)
    useEffect(() => {
        if (status !== 'loading' && status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

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
        return null;
    }

    return (
        <PageLayout 
            user={session?.user || {}}
            breadcrumbs={[
                { label: 'Admin', href: '/admin/dashboard' },
                { label: 'Approvals', href: null }
            ]}
        >
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
                                    {/* Header with Risk Score Badge */}
                                    <div className="flex items-start justify-between mb-6 gap-4">
                                        <div className="flex-1">
                                            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                                                {submission.displayName}
                                            </h3>
                                            <p className="mt-1 text-sm text-gray-500">
                                                Alias: <code className="text-blue-600">{submission.alias}</code>
                                            </p>
                                            <div className="mt-2 flex items-center gap-2">
                                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                    {submission.protocol.toUpperCase()}
                                                </span>
                                                {submission.fastTrack && (
                                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                                        ⚡ Fast-Track
                                                    </span>
                                                )}
                                                {submission.autoApproved && (
                                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                        ✅ Auto-Approved
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {/* Phase 2: Risk Score Badge */}
                                        {submission.comprehensiveRiskScore && (
                                            <div className="flex-shrink-0">
                                                <RiskScoreBadge
                                                    score={submission.comprehensiveRiskScore.total}
                                                    tier={submission.comprehensiveRiskScore.tier}
                                                    riskLevel={submission.comprehensiveRiskScore.riskLevel}
                                                    size="md"
                                                />
                                            </div>
                                        )}
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
                                        {submission.useAuth0 && (
                                            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                                                <div className="flex items-start">
                                                    <svg className="h-5 w-5 text-blue-600 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                    </svg>
                                                    <div className="flex-1">
                                                        <h4 className="text-sm font-semibold text-blue-900 mb-1">
                                                            🔵 Auth0 Integration Included
                                                        </h4>
                                                        <p className="text-xs text-blue-800 mb-2">
                                                            This IdP was created with Auth0 integration. Credentials have been auto-generated:
                                                        </p>
                                                        {submission.auth0ClientId && (
                                                            <div className="bg-white rounded border border-blue-300 p-2 space-y-1">
                                                                <div className="text-xs text-blue-700">
                                                                    <strong>Client ID:</strong>
                                                                    <code className="ml-1 bg-blue-100 px-1 py-0.5 rounded">{submission.auth0ClientId}</code>
                                                                </div>
                                                                {submission.auth0ClientSecret && (
                                                                    <div className="text-xs text-blue-700">
                                                                        <strong>Client Secret:</strong>
                                                                        <code className="ml-1 bg-blue-100 px-1 py-0.5 rounded">
                                                                            {submission.auth0ClientSecret.substring(0, 20)}...
                                                                        </code>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Phase 2: Risk Score Breakdown */}
                                    {submission.comprehensiveRiskScore && (
                                        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <RiskBreakdown breakdown={submission.comprehensiveRiskScore.breakdown} />
                                            {submission.complianceCheck && (
                                                <ComplianceStatusCard complianceCheck={submission.complianceCheck} />
                                            )}
                                        </div>
                                    )}

                                    {/* Phase 2: SLA Countdown */}
                                    {submission.slaDeadline && submission.slaStatus && submission.approvalDecision && (
                                        <div className="mb-6">
                                            <SLACountdown
                                                slaDeadline={submission.slaDeadline}
                                                slaStatus={submission.slaStatus}
                                                action={submission.approvalDecision.action as any}
                                            />
                                        </div>
                                    )}

                                    {/* Phase 2: Risk Factor Analysis (Expandable) */}
                                    {submission.comprehensiveRiskScore?.factors && (
                                        <details className="mb-6">
                                            <summary className="cursor-pointer text-sm font-semibold text-blue-600 hover:text-blue-500">
                                                📊 View Detailed Risk Factor Analysis ({submission.comprehensiveRiskScore.factors.length} factors)
                                            </summary>
                                            <div className="mt-4">
                                                <RiskFactorAnalysis factors={submission.comprehensiveRiskScore.factors} />
                                            </div>
                                        </details>
                                    )}

                                    {/* View Details Button */}
                                    <button
                                        onClick={() => setSelectedIdP(selectedIdP?.alias === submission.alias ? null : submission)}
                                        className="text-sm text-gray-600 hover:text-gray-500 mb-4"
                                    >
                                        {selectedIdP?.alias === submission.alias ? 'Hide' : 'Show'} Configuration Details
                                    </button>

                                    {/* Configuration Details (Expandable) */}
                                    {selectedIdP?.alias === submission.alias && (
                                        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                                            <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
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
        </PageLayout>
    );
}
