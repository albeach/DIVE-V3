'use client';

/**
 * Custom 404 Not Found Page
 * 
 * Branded error page with:
 * - DIVE V3 branding
 * - Helpful navigation links
 * - Beautiful glassmorphism design
 * - Animated elements
 */

import Link from 'next/link';
import { HomeIcon, MagnifyingGlassIcon, ArrowLeftIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 flex items-center justify-center px-4">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-5">
                <div className="absolute inset-0" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }} />
            </div>

            <div className="relative max-w-2xl w-full">
                {/* Main Card */}
                <div className="relative">
                    {/* Glow Effect */}
                    <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl blur-2xl opacity-20 animate-pulse" />
                    
                    {/* Content */}
                    <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl border border-gray-200/50 dark:border-gray-700/50 shadow-2xl overflow-hidden">
                        {/* Header with Shield Icon */}
                        <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-12 text-center">
                            <div className="absolute inset-0 bg-grid-white/10" />
                            <div className="relative">
                                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm mb-6 animate-bounce">
                                    <ShieldCheckIcon className="h-10 w-10 text-white" />
                                </div>
                                <h1 className="text-6xl font-black text-white mb-3 drop-shadow-lg">
                                    404
                                </h1>
                                <p className="text-xl font-semibold text-white/90">
                                    Page Not Found
                                </p>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="px-8 py-12 text-center">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                                Classified Information Not Available
                            </h2>
                            <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
                                The resource you're looking for doesn't exist or you don't have the required clearance to access it.
                            </p>

                            {/* Action Buttons */}
                            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                                <Link
                                    href="/"
                                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                                >
                                    <HomeIcon className="h-5 w-5" />
                                    Return Home
                                </Link>
                                
                                <Link
                                    href="/dashboard"
                                    className="inline-flex items-center gap-2 px-6 py-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-semibold rounded-xl border-2 border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-500 transition-all duration-200 shadow-md hover:shadow-lg"
                                >
                                    <MagnifyingGlassIcon className="h-5 w-5" />
                                    View Dashboard
                                </Link>
                            </div>

                            {/* Additional Help */}
                            <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                    Common Resources
                                </p>
                                <div className="flex flex-wrap gap-3 justify-center">
                                    <Link
                                        href="/resources"
                                        className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                    >
                                        Documents
                                    </Link>
                                    <Link
                                        href="/policies"
                                        className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                    >
                                        Policies
                                    </Link>
                                    <Link
                                        href="/admin/dashboard"
                                        className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                    >
                                        Admin Console
                                    </Link>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-8 py-6 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between text-sm">
                                <p className="text-gray-600 dark:text-gray-400">
                                    <span className="font-semibold">DIVE V3</span> Coalition Federated Identity
                                </p>
                                <button
                                    onClick={() => window.history.back()}
                                    className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
                                >
                                    <ArrowLeftIcon className="h-4 w-4" />
                                    Go Back
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Security Classification Badge */}
                <div className="mt-6 text-center">
                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-full border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 shadow-lg">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        UNCLASSIFIED
                    </span>
                </div>
            </div>
        </div>
    );
}
