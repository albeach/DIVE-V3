/**
 * Enhanced Access Denied Component
 * 
 * Professional error page when authorization is denied
 * Features:
 * - Clear explanation of denial reason
 * - Policy check details (which checks passed/failed)
 * - User attributes vs. required attributes comparison
 * - Action buttons (Back, Find Accessible, Request Access, Help)
 * - Suggested resources user can access
 */

'use client';

import React from 'react';
import Link from 'next/link';

interface AccessDeniedProps {
    resource: {
        resourceId: string;
        title: string;
        classification: string;
        releasabilityTo: string[];
        COI: string[];
    };
    denial: {
        error: string;
        message: string;
        reason?: string;
        details?: {
            checks?: Record<string, boolean>;
            subject?: {
                uniqueID?: string;
                clearance?: string;
                country?: string;
                coi?: string[];
            };
            resource?: {
                resourceId?: string;
                classification?: string;
                releasabilityTo?: string[];
                coi?: string[];
            };
        };
    };
    userCountry?: string;
    suggestedResources?: Array<{
        resourceId: string;
        title: string;
        classification: string;
        releasabilityTo: string[];
    }>;
}

export default function AccessDenied({ resource, denial, userCountry, suggestedResources }: AccessDeniedProps) {
    // Determine which checks failed
    const checks = denial.details?.checks || {};
    const failedChecks = Object.entries(checks).filter(([_, passed]) => !passed);
    const passedChecks = Object.entries(checks).filter(([_, passed]) => passed);

    const formatCheckName = (checkName: string): string => {
        return checkName
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase());
    };

    return (
        <div className="max-w-4xl mx-auto mt-8 space-y-6">
            {/* Main Error Card */}
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-8">
                <div className="text-center mb-6">
                    <span className="text-6xl">🚫</span>
                    <h1 className="text-3xl font-bold text-red-900 mt-4">
                        Access Denied
                    </h1>
                    <p className="text-lg text-red-800 mt-2">
                        {denial.message}
                    </p>
                </div>

                {/* Resource Info */}
                <div className="bg-white border border-red-200 rounded-lg p-4 mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">
                        Requested Resource:
                    </h3>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div>
                            <dt className="text-gray-600">Resource ID:</dt>
                            <dd className="font-mono font-medium text-gray-900">{resource.resourceId}</dd>
                        </div>
                        <div>
                            <dt className="text-gray-600">Title:</dt>
                            <dd className="font-medium text-gray-900">{resource.title}</dd>
                        </div>
                        <div>
                            <dt className="text-gray-600">Classification:</dt>
                            <dd className="font-mono font-medium text-gray-900">{resource.classification}</dd>
                        </div>
                        <div>
                            <dt className="text-gray-600">Releasable To:</dt>
                            <dd className="font-mono text-gray-900">{resource.releasabilityTo.join(', ')}</dd>
                        </div>
                    </dl>
                </div>

                {/* Denial Reason */}
                {denial.reason && (
                    <div className="bg-white border border-red-200 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-red-900 mb-2">
                            Specific Issue:
                        </h3>
                        <p className="text-sm text-red-800">{denial.reason}</p>
                    </div>
                )}
            </div>

            {/* Policy Check Details */}
            {denial.details && (checks && Object.keys(checks).length > 0) && (
                <div className="bg-white shadow rounded-lg p-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                        <svg className="h-6 w-6 mr-2 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Policy Evaluation Results
                    </h2>

                    <div className="space-y-3">
                        {/* Failed Checks (show first) */}
                        {failedChecks.length > 0 && (
                            <>
                                <h3 className="text-sm font-semibold text-red-900">❌ Failed Checks:</h3>
                                {failedChecks.map(([checkName, _]) => (
                                    <div 
                                        key={checkName}
                                        className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200"
                                    >
                                        <span className="text-sm font-medium text-gray-700">
                                            {formatCheckName(checkName)}
                                        </span>
                                        <span className="text-sm font-bold text-red-700">
                                            ✗ FAIL
                                        </span>
                                    </div>
                                ))}
                            </>
                        )}

                        {/* Passed Checks */}
                        {passedChecks.length > 0 && (
                            <>
                                <h3 className="text-sm font-semibold text-green-900 mt-4">✅ Passed Checks:</h3>
                                {passedChecks.map(([checkName, _]) => (
                                    <div 
                                        key={checkName}
                                        className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200"
                                    >
                                        <span className="text-sm font-medium text-gray-700">
                                            {formatCheckName(checkName)}
                                        </span>
                                        <span className="text-sm font-bold text-green-700">
                                            ✓ PASS
                                        </span>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>

                    {/* Attributes Comparison */}
                    {denial.details.subject && (
                        <div className="mt-6 grid grid-cols-2 gap-6">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                                    Your Attributes:
                                </h3>
                                <dl className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <dt className="text-gray-600">Clearance:</dt>
                                        <dd className="font-mono font-medium">{denial.details.subject.clearance || 'N/A'}</dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-gray-600">Country:</dt>
                                        <dd className="font-mono font-medium">{denial.details.subject.country || 'N/A'}</dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-gray-600">COI:</dt>
                                        <dd className="font-mono text-xs">
                                            {denial.details.subject.coi && denial.details.subject.coi.length > 0 
                                                ? denial.details.subject.coi.join(', ') 
                                                : 'None'}
                                        </dd>
                                    </div>
                                </dl>
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                                    Required Attributes:
                                </h3>
                                <dl className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <dt className="text-gray-600">Classification:</dt>
                                        <dd className="font-mono font-medium">
                                            {denial.details.resource?.classification || resource.classification}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-gray-600">Releasable To:</dt>
                                        <dd className="font-mono text-xs">
                                            {(denial.details.resource?.releasabilityTo || resource.releasabilityTo).join(', ')}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-gray-600">COI Required:</dt>
                                        <dd className="font-mono text-xs">
                                            {resource.COI && resource.COI.length > 0 ? resource.COI.join(', ') : 'None'}
                                        </dd>
                                    </div>
                                </dl>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Action Buttons */}
            <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    What Can I Do?
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Link
                        href="/resources"
                        className="flex items-center justify-center px-4 py-3 border-2 border-blue-300 rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 font-medium transition-colors"
                    >
                        <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back to Resources
                    </Link>
                    {userCountry && (
                        <Link
                            href={`/resources?country=${userCountry}`}
                            className="flex items-center justify-center px-4 py-3 border-2 border-green-300 rounded-lg text-green-700 bg-green-50 hover:bg-green-100 font-medium transition-colors"
                        >
                            <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            Find Resources I Can Access
                        </Link>
                    )}
                    <a
                        href="mailto:admin@example.com?subject=Access Request"
                        className="flex items-center justify-center px-4 py-3 border-2 border-purple-300 rounded-lg text-purple-700 bg-purple-50 hover:bg-purple-100 font-medium transition-colors"
                    >
                        <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Request Access
                    </a>
                    <Link
                        href="/policies"
                        className="flex items-center justify-center px-4 py-3 border-2 border-gray-300 rounded-lg text-gray-700 bg-gray-50 hover:bg-gray-100 font-medium transition-colors"
                    >
                        <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Learn About Access Control
                    </Link>
                </div>
            </div>

            {/* Suggested Resources (if available) */}
            {suggestedResources && suggestedResources.length > 0 && (
                <div className="bg-white shadow rounded-lg p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                        Resources You Can Access
                    </h2>
                    <div className="space-y-3">
                        {suggestedResources.map((suggested) => (
                            <Link
                                key={suggested.resourceId}
                                href={`/resources/${suggested.resourceId}`}
                                className="block p-4 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-gray-900">{suggested.title}</h3>
                                        <p className="text-sm text-gray-600 mt-1">
                                            <span className="font-mono">{suggested.resourceId}</span> •{' '}
                                            <span className="font-medium">{suggested.classification}</span> •{' '}
                                            Releasable to: {suggested.releasabilityTo.join(', ')}
                                        </p>
                                    </div>
                                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Help Section */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">
                    💡 Need Help?
                </h3>
                <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Visit the <Link href="/policies" className="underline hover:text-blue-900">Policy Viewer</Link> to understand authorization rules</li>
                    <li>• Contact your administrator to request access or report issues</li>
                    <li>• Review your account attributes (clearance, country, COI) with your IdP administrator</li>
                </ul>
            </div>
        </div>
    );
}



