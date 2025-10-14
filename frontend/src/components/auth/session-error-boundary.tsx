/**
 * Session Error Boundary
 * 
 * Catches errors related to session management:
 * - Database connection failures
 * - Token parsing errors
 * - Network issues
 * 
 * Provides graceful degradation instead of white screen
 * 
 * Week 3.4: Enhanced Session Management
 */

'use client';

import React, { Component, ReactNode } from 'react';
import { signOut } from 'next-auth/react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: React.ErrorInfo | null;
}

export class SessionErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI
        return {
            hasError: true,
            error,
            errorInfo: null,
        };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        // Log error to console
        console.error('[SessionErrorBoundary] Caught error:', error);
        console.error('[SessionErrorBoundary] Error info:', errorInfo);

        // Update state with error info
        this.setState({
            error,
            errorInfo,
        });

        // Check if it's a session-related error
        const errorMessage = error.message.toLowerCase();
        const isSessionError = 
            errorMessage.includes('session') ||
            errorMessage.includes('token') ||
            errorMessage.includes('auth') ||
            errorMessage.includes('database') ||
            errorMessage.includes('fetch');

        if (isSessionError) {
            console.error('[SessionErrorBoundary] Session-related error detected');
        }
    }

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
        });
        // Reload the page to recover
        window.location.reload();
    };

    handleLogout = async () => {
        try {
            await signOut({ callbackUrl: '/' });
        } catch (error) {
            console.error('[SessionErrorBoundary] Error during logout:', error);
            // Force redirect
            window.location.href = '/';
        }
    };

    render() {
        if (this.state.hasError) {
            const errorMessage = this.state.error?.message || 'An unexpected error occurred';
            
            return (
                <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
                    <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
                        <div className="flex items-center justify-center mb-4">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                                <span className="text-2xl">⚠️</span>
                            </div>
                        </div>
                        
                        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
                            Session Error
                        </h1>
                        
                        <p className="text-gray-600 text-center mb-6">
                            We encountered an error with your session. This might be due to:
                        </p>

                        <ul className="text-sm text-gray-500 mb-6 space-y-2">
                            <li className="flex items-start">
                                <span className="mr-2">•</span>
                                <span>Network connectivity issues</span>
                            </li>
                            <li className="flex items-start">
                                <span className="mr-2">•</span>
                                <span>Database connection problems</span>
                            </li>
                            <li className="flex items-start">
                                <span className="mr-2">•</span>
                                <span>Expired or invalid session tokens</span>
                            </li>
                        </ul>

                        {process.env.NODE_ENV === 'development' && (
                            <div className="mb-6 p-3 bg-gray-100 rounded-md">
                                <p className="text-xs font-mono text-gray-700 break-all">
                                    {errorMessage}
                                </p>
                            </div>
                        )}

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={this.handleReset}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition-colors"
                            >
                                Try Again
                            </button>
                            
                            <button
                                onClick={this.handleLogout}
                                className="w-full bg-white hover:bg-gray-50 text-gray-900 font-semibold py-2 px-4 rounded-md border border-gray-300 transition-colors"
                            >
                                Logout and Return Home
                            </button>
                        </div>

                        <div className="mt-6 pt-6 border-t border-gray-200">
                            <p className="text-xs text-gray-500 text-center">
                                If the problem persists, please contact your system administrator.
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

