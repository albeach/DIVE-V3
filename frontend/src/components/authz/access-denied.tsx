/**
 * Enhanced Access Denied Component - 2025 Edition
 * 
 * Modern, animated error page when authorization is denied
 * Features:
 * - Modern 2025 design patterns with animations
 * - Microinteractions and smooth transitions
 * - Clear explanation of denial reason
 * - Policy check details (which checks passed/failed)
 * - User attributes vs. required attributes comparison
 * - Action buttons with hover effects
 * - Suggested resources with animations
 */

'use client';

import React, { useEffect, useState } from 'react';
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
                title?: string;
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
    const [isVisible, setIsVisible] = useState(false);
    
    useEffect(() => {
        // Trigger entrance animation
        setTimeout(() => setIsVisible(true), 50);
    }, []);

    // Use resource data from error details if available (backend provides complete data)
    const displayResource = {
        resourceId: denial.details?.resource?.resourceId || resource.resourceId,
        title: denial.details?.resource?.title || resource.title,
        classification: denial.details?.resource?.classification || resource.classification,
        releasabilityTo: denial.details?.resource?.releasabilityTo || resource.releasabilityTo,
        coi: denial.details?.resource?.coi || resource.COI
    };

    // Determine which checks failed
    const checks = denial.details?.checks || {};
    const failedChecks = Object.entries(checks).filter(([_, passed]) => !passed);
    const passedChecks = Object.entries(checks).filter(([_, passed]) => passed);

    const formatCheckName = (checkName: string): string => {
        return checkName
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase());
    };

    const classificationColors: Record<string, { bg: string; border: string; text: string; glow: string }> = {
        'UNCLASSIFIED': { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-900', glow: 'shadow-green-200' },
        'CONFIDENTIAL': { bg: 'bg-yellow-100', border: 'border-yellow-400', text: 'text-yellow-900', glow: 'shadow-yellow-200' },
        'SECRET': { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-900', glow: 'shadow-orange-200' },
        'TOP_SECRET': { bg: 'bg-red-100', border: 'border-red-400', text: 'text-red-900', glow: 'shadow-red-200' },
    };

    const getClassificationStyle = (classification: string) => {
        return classificationColors[classification] || { 
            bg: 'bg-gray-100', 
            border: 'border-gray-400', 
            text: 'text-gray-900',
            glow: 'shadow-gray-200'
        };
    };

    const style = getClassificationStyle(displayResource.classification);

    return (
        <div className={`max-w-5xl mx-auto mt-8 space-y-6 transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}>
            {/* Animated CSS for modern effects */}
            <style jsx>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
                    20%, 40%, 60%, 80% { transform: translateX(4px); }
                }
                @keyframes pulse-glow {
                    0%, 100% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.3); }
                    50% { box-shadow: 0 0 40px rgba(239, 68, 68, 0.5); }
                }
                @keyframes slide-in-left {
                    from { opacity: 0; transform: translateX(-20px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes slide-in-right {
                    from { opacity: 0; transform: translateX(20px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes fade-in-up {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-shake { animation: shake 0.6s ease-in-out; }
                .animate-pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
                .animate-slide-in-left { animation: slide-in-left 0.5s ease-out forwards; }
                .animate-slide-in-right { animation: slide-in-right 0.5s ease-out forwards; }
                .animate-fade-in-up { animation: fade-in-up 0.6s ease-out forwards; }
                .delay-100 { animation-delay: 0.1s; }
                .delay-200 { animation-delay: 0.2s; }
                .delay-300 { animation-delay: 0.3s; }
                .delay-400 { animation-delay: 0.4s; }
            `}</style>

            {/* Main Error Card - Modern Glassmorphism Design */}
            <div className="relative bg-gradient-to-br from-red-50 via-red-50 to-pink-50 border-2 border-red-300 rounded-2xl p-8 shadow-2xl animate-pulse-glow overflow-hidden">
                {/* Decorative background pattern */}
                <div className="absolute inset-0 bg-gradient-to-br from-red-100/20 to-transparent pointer-events-none"></div>
                
                <div className="relative z-10">
                    {/* Header with animated icon */}
                    <div className="text-center mb-8 animate-shake">
                        <div className="inline-block relative">
                            <span className="text-8xl filter drop-shadow-lg">🚫</span>
                            <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full"></div>
                        </div>
                        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-red-900 mt-6 mb-2">
                            Access Denied
                        </h1>
                        <p className="text-xl text-red-700 font-semibold">
                            {denial.message}
                        </p>
                    </div>

                    {/* Resource Info Card - Modern Card Design */}
                    <div className="bg-white/80 backdrop-blur-sm border border-red-200 rounded-xl p-6 mb-6 shadow-lg hover:shadow-xl transition-all duration-300">
                        <div className="flex items-center gap-2 mb-4">
                            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <h3 className="text-lg font-bold text-gray-900">
                                Requested Resource
                            </h3>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Resource ID */}
                            <div className="group hover:scale-105 transition-transform duration-200">
                                <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Resource ID</dt>
                                <dd className="font-mono text-sm font-medium text-gray-900 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                                    {displayResource.resourceId}
                                </dd>
                            </div>
                            
                            {/* Title */}
                            <div className="group hover:scale-105 transition-transform duration-200">
                                <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Title</dt>
                                <dd className="text-sm font-semibold text-gray-900 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 truncate">
                                    {displayResource.title}
                                </dd>
                            </div>
                            
                            {/* Classification Badge */}
                            <div className="group hover:scale-105 transition-transform duration-200">
                                <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Classification</dt>
                                <dd>
                                    <span className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-bold border-2 ${style.bg} ${style.border} ${style.text} shadow-md ${style.glow}`}>
                                        <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                        </svg>
                                        {displayResource.classification}
                                    </span>
                                </dd>
                            </div>
                            
                            {/* Releasability */}
                            <div className="group hover:scale-105 transition-transform duration-200">
                                <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Releasable To</dt>
                                <dd className="flex flex-wrap gap-1">
                                    {displayResource.releasabilityTo && displayResource.releasabilityTo.length > 0 ? (
                                        displayResource.releasabilityTo.map((country) => (
                                            <span key={country} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
                                                🌍 {country}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-xs text-gray-500 italic">None specified</span>
                                    )}
                                </dd>
                            </div>

                            {/* COI */}
                            {displayResource.coi && displayResource.coi.length > 0 && (
                                <div className="col-span-full group hover:scale-105 transition-transform duration-200">
                                    <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Communities of Interest</dt>
                                    <dd className="flex flex-wrap gap-1">
                                        {displayResource.coi.map((coi) => (
                                            <span key={coi} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-300">
                                                👥 {coi}
                                            </span>
                                        ))}
                                    </dd>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Denial Reason - Prominent Alert */}
                    {denial.reason && (
                        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300">
                            <div className="flex items-start gap-3">
                                <svg className="w-6 h-6 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <div>
                                    <h3 className="text-lg font-bold mb-2">Authorization Failure</h3>
                                    <p className="text-red-50 text-sm leading-relaxed">{denial.reason}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Policy Check Details - Modern Animated Cards */}
            {denial.details && (checks && Object.keys(checks).length > 0) && (
                <div className="bg-gradient-to-br from-white to-gray-50 shadow-xl rounded-2xl p-8 border border-gray-200 animate-fade-in-up">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">
                            Policy Evaluation Results
                        </h2>
                    </div>

                    <div className="space-y-4">
                        {/* Failed Checks - Prominent Display */}
                        {failedChecks.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-2xl">❌</span>
                                    <h3 className="text-lg font-bold text-red-900">Failed Checks</h3>
                                </div>
                                {failedChecks.map(([checkName, _], index) => (
                                    <div 
                                        key={checkName}
                                        className="group flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-red-50 to-red-100 border-2 border-red-300 hover:border-red-400 transition-all duration-300 hover:scale-105 hover:shadow-lg animate-slide-in-left"
                                        style={{ animationDelay: `${index * 0.1}s` }}
                                    >
                                        <span className="text-sm font-semibold text-gray-800">
                                            {formatCheckName(checkName)}
                                        </span>
                                        <span className="flex items-center gap-2 text-sm font-bold text-red-700 bg-white px-3 py-1 rounded-lg shadow">
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            FAIL
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Passed Checks - Success Display */}
                        {passedChecks.length > 0 && (
                            <div className="space-y-2 mt-6">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-2xl">✅</span>
                                    <h3 className="text-lg font-bold text-green-900">Passed Checks</h3>
                                </div>
                                {passedChecks.map(([checkName, _], index) => (
                                    <div 
                                        key={checkName}
                                        className="group flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-300 hover:border-green-400 transition-all duration-300 hover:scale-105 hover:shadow-lg animate-slide-in-right"
                                        style={{ animationDelay: `${index * 0.1}s` }}
                                    >
                                        <span className="text-sm font-semibold text-gray-800">
                                            {formatCheckName(checkName)}
                                        </span>
                                        <span className="flex items-center gap-2 text-sm font-bold text-green-700 bg-white px-3 py-1 rounded-lg shadow">
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            PASS
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Attributes Comparison - Modern Side-by-Side Cards */}
                    {denial.details.subject && (
                        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Your Attributes */}
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border-2 border-blue-300 shadow-lg hover:shadow-xl transition-all duration-300">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="p-2 bg-blue-600 rounded-lg">
                                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-lg font-bold text-blue-900">
                                        Your Attributes
                                    </h3>
                                </div>
                                <dl className="space-y-3">
                                    <div className="bg-white/60 backdrop-blur rounded-lg p-3">
                                        <dt className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1">Clearance</dt>
                                        <dd className="font-mono text-sm font-semibold text-gray-900">{denial.details.subject.clearance || 'N/A'}</dd>
                                    </div>
                                    <div className="bg-white/60 backdrop-blur rounded-lg p-3">
                                        <dt className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1">Country</dt>
                                        <dd className="font-mono text-sm font-semibold text-gray-900">{denial.details.subject.country || 'N/A'}</dd>
                                    </div>
                                    <div className="bg-white/60 backdrop-blur rounded-lg p-3">
                                        <dt className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1">COI</dt>
                                        <dd className="font-mono text-xs text-gray-900">
                                            {denial.details.subject.coi && denial.details.subject.coi.length > 0 
                                                ? denial.details.subject.coi.join(', ') 
                                                : 'None'}
                                        </dd>
                                    </div>
                                </dl>
                            </div>

                            {/* Required Attributes */}
                            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border-2 border-purple-300 shadow-lg hover:shadow-xl transition-all duration-300">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="p-2 bg-purple-600 rounded-lg">
                                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-lg font-bold text-purple-900">
                                        Required Attributes
                                    </h3>
                                </div>
                                <dl className="space-y-3">
                                    <div className="bg-white/60 backdrop-blur rounded-lg p-3">
                                        <dt className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-1">Classification</dt>
                                        <dd className="font-mono text-sm font-semibold text-gray-900">
                                            {displayResource.classification}
                                        </dd>
                                    </div>
                                    <div className="bg-white/60 backdrop-blur rounded-lg p-3">
                                        <dt className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-1">Releasable To</dt>
                                        <dd className="font-mono text-xs text-gray-900">
                                            {displayResource.releasabilityTo.join(', ') || 'None'}
                                        </dd>
                                    </div>
                                    <div className="bg-white/60 backdrop-blur rounded-lg p-3">
                                        <dt className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-1">COI Required</dt>
                                        <dd className="font-mono text-xs text-gray-900">
                                            {displayResource.coi && displayResource.coi.length > 0 ? displayResource.coi.join(', ') : 'None'}
                                        </dd>
                                    </div>
                                </dl>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Action Buttons - Modern Interactive Cards */}
            <div className="bg-gradient-to-br from-white to-gray-50 shadow-xl rounded-2xl p-8 border border-gray-200 animate-fade-in-up delay-100">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-lg">
                        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">
                        What Can I Do?
                    </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Link
                        href="/resources"
                        className="group relative overflow-hidden flex items-center justify-center px-6 py-4 rounded-xl text-blue-700 bg-gradient-to-r from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 font-semibold transition-all duration-300 hover:scale-105 hover:shadow-xl border-2 border-blue-300 hover:border-blue-400"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-400/0 via-blue-400/10 to-blue-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                        <svg className="h-5 w-5 mr-2 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span className="relative">Back to Resources</span>
                    </Link>
                    {userCountry && (
                        <Link
                            href={`/resources?country=${userCountry}`}
                            className="group relative overflow-hidden flex items-center justify-center px-6 py-4 rounded-xl text-green-700 bg-gradient-to-r from-green-50 to-green-100 hover:from-green-100 hover:to-green-200 font-semibold transition-all duration-300 hover:scale-105 hover:shadow-xl border-2 border-green-300 hover:border-green-400"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-green-400/0 via-green-400/10 to-green-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                            <svg className="h-5 w-5 mr-2 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <span className="relative">Find Accessible Resources</span>
                        </Link>
                    )}
                    <a
                        href="mailto:admin@example.com?subject=Access Request"
                        className="group relative overflow-hidden flex items-center justify-center px-6 py-4 rounded-xl text-purple-700 bg-gradient-to-r from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-200 font-semibold transition-all duration-300 hover:scale-105 hover:shadow-xl border-2 border-purple-300 hover:border-purple-400"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-400/0 via-purple-400/10 to-purple-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                        <svg className="h-5 w-5 mr-2 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span className="relative">Request Access</span>
                    </a>
                    <Link
                        href="/policies"
                        className="group relative overflow-hidden flex items-center justify-center px-6 py-4 rounded-xl text-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200 font-semibold transition-all duration-300 hover:scale-105 hover:shadow-xl border-2 border-gray-300 hover:border-gray-400"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-gray-400/0 via-gray-400/10 to-gray-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                        <svg className="h-5 w-5 mr-2 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="relative">Learn About Policies</span>
                    </Link>
                </div>
            </div>

            {/* Suggested Resources - Modern Carousel Cards */}
            {suggestedResources && suggestedResources.length > 0 && (
                <div className="bg-gradient-to-br from-white to-emerald-50 shadow-xl rounded-2xl p-8 border border-emerald-200 animate-fade-in-up delay-200">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-lg">
                            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">
                                Resources You Can Access
                            </h2>
                            <p className="text-sm text-gray-600">Try these resources instead</p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {suggestedResources.map((suggested, index) => {
                            const suggestedStyle = getClassificationStyle(suggested.classification);
                            return (
                                <Link
                                    key={suggested.resourceId}
                                    href={`/resources/${suggested.resourceId}`}
                                    className="group block p-5 border-2 border-gray-200 rounded-xl hover:border-emerald-400 bg-white hover:bg-gradient-to-r hover:from-emerald-50 hover:to-white transition-all duration-300 hover:scale-105 hover:shadow-xl animate-slide-in-left"
                                    style={{ animationDelay: `${index * 0.1 + 0.2}s` }}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 space-y-2">
                                            <div className="flex items-center gap-3">
                                                <svg className="w-5 h-5 text-emerald-600 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                                <h3 className="font-bold text-gray-900 group-hover:text-emerald-900">{suggested.title}</h3>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                                                <span className="font-mono bg-gray-100 px-2 py-1 rounded">{suggested.resourceId}</span>
                                                <span className={`inline-flex items-center px-2 py-1 rounded font-bold ${suggestedStyle.bg} ${suggestedStyle.text} border ${suggestedStyle.border}`}>
                                                    {suggested.classification}
                                                </span>
                                                <span className="text-gray-500">•</span>
                                                <span className="flex items-center gap-1">
                                                    🌍 {suggested.releasabilityTo.join(', ')}
                                                </span>
                                            </div>
                                        </div>
                                        <svg className="h-6 w-6 text-gray-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Help Section - Modern Info Card */}
            <div className="relative bg-gradient-to-br from-blue-50 via-blue-50 to-indigo-50 border-2 border-blue-300 rounded-2xl p-8 shadow-lg animate-fade-in-up delay-300 overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-400/10 rounded-full blur-3xl"></div>
                <div className="relative z-10">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                            <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div className="flex-1">
                            <h3 className="text-xl font-bold text-blue-900 mb-3">
                                💡 Need Help?
                            </h3>
                            <ul className="space-y-3">
                                <li className="flex items-start gap-3 text-blue-800">
                                    <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    <span>
                                        Visit the <Link href="/policies" className="font-semibold underline hover:text-blue-900 transition-colors">Policy Viewer</Link> to understand authorization rules
                                    </span>
                                </li>
                                <li className="flex items-start gap-3 text-blue-800">
                                    <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    <span>
                                        Contact your administrator to request access or report issues
                                    </span>
                                </li>
                                <li className="flex items-start gap-3 text-blue-800">
                                    <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    <span>
                                        Review your account attributes (clearance, country, COI) with your IdP administrator
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}



