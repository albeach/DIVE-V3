/**
 * Error Fallback Component
 * 
 * Shared UI component for displaying error states in the admin section
 * Used by error boundaries to show user-friendly error messages
 */

'use client';

import { AlertCircle, RefreshCcw, Home } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ErrorFallbackProps {
    error: Error & { digest?: string };
    reset: () => void;
    showHomeButton?: boolean;
}

export function ErrorFallback({ error, reset, showHomeButton = true }: ErrorFallbackProps) {
    const router = useRouter();

    const handleGoHome = () => {
        router.push('/admin');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
            <div className="max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8">
                <div className="text-center">
                    {/* Error Icon */}
                    <div className="flex justify-center mb-4">
                        <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-3">
                            <AlertCircle className="h-12 w-12 text-red-600 dark:text-red-400" />
                        </div>
                    </div>

                    {/* Title */}
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                        Something went wrong
                    </h2>

                    {/* Error Message */}
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        {error.message || 'An unexpected error occurred. Please try again.'}
                    </p>

                    {/* Error Details (for development) */}
                    {process.env.NODE_ENV === 'development' && error.digest && (
                        <div className="mb-6 p-3 bg-gray-100 dark:bg-gray-700 rounded text-left">
                            <p className="text-xs text-gray-600 dark:text-gray-400 font-mono break-all">
                                Error ID: {error.digest}
                            </p>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button
                            onClick={reset}
                            className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-200 font-medium"
                        >
                            <RefreshCcw className="h-4 w-4 mr-2" />
                            Try again
                        </button>

                        {showHomeButton && (
                            <button
                                onClick={handleGoHome}
                                className="inline-flex items-center justify-center px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-md transition-colors duration-200 font-medium"
                            >
                                <Home className="h-4 w-4 mr-2" />
                                Go to Dashboard
                            </button>
                        )}
                    </div>

                    {/* Help Text */}
                    <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
                        If this problem persists, please contact support.
                    </p>
                </div>
            </div>
        </div>
    );
}
