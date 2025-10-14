/**
 * Session Expiry Modal Component
 * 
 * Replaces generic alert() with proper modal UI
 * Handles different expiry scenarios:
 * - Warning: 2 minutes before expiry (allow extension)
 * - Expired: Session has expired (require re-login)
 * - Error: Database or network issues
 * 
 * Week 3.4: Enhanced Session Management
 */

'use client';

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { signOut } from 'next-auth/react';

export type SessionExpiryReason = 'warning' | 'expired' | 'error' | 'inactivity';

interface SessionExpiryModalProps {
    isOpen: boolean;
    reason: SessionExpiryReason;
    timeRemaining?: number; // seconds (for warning state)
    errorMessage?: string; // (for error state)
    onExtendSession?: () => void; // Only available in warning state
    onClose?: () => void; // Only available in warning state
}

export function SessionExpiryModal({
    isOpen,
    reason,
    timeRemaining = 0,
    errorMessage,
    onExtendSession,
    onClose,
}: SessionExpiryModalProps) {
    const handleLogout = async () => {
        console.log('[SessionExpiry] User logging out from modal');
        await signOut({ callbackUrl: '/' });
    };

    const handleExtend = () => {
        console.log('[SessionExpiry] User extending session');
        onExtendSession?.();
    };

    // Modal content based on reason
    const modalConfig = {
        warning: {
            icon: '⏰',
            iconBg: 'bg-yellow-100',
            iconColor: 'text-yellow-600',
            title: 'Session Expiring Soon',
            message: `Your session will expire in ${Math.floor(timeRemaining / 60)} minute(s). Would you like to continue working?`,
            primaryAction: 'Extend Session',
            primaryColor: 'bg-blue-600 hover:bg-blue-700',
            secondaryAction: 'Logout Now',
            allowClose: true,
        },
        expired: {
            icon: '🔒',
            iconBg: 'bg-red-100',
            iconColor: 'text-red-600',
            title: 'Session Expired',
            message: 'Your session has expired for security reasons. Please login again to continue.',
            primaryAction: 'Login Again',
            primaryColor: 'bg-blue-600 hover:bg-blue-700',
            secondaryAction: null,
            allowClose: false,
        },
        inactivity: {
            icon: '💤',
            iconBg: 'bg-gray-100',
            iconColor: 'text-gray-600',
            title: 'Session Timeout',
            message: 'Your session has expired due to inactivity. Please login again to continue.',
            primaryAction: 'Login Again',
            primaryColor: 'bg-blue-600 hover:bg-blue-700',
            secondaryAction: null,
            allowClose: false,
        },
        error: {
            icon: '⚠️',
            iconBg: 'bg-orange-100',
            iconColor: 'text-orange-600',
            title: 'Session Error',
            message: errorMessage || 'An error occurred with your session. Please login again.',
            primaryAction: 'Login Again',
            primaryColor: 'bg-blue-600 hover:bg-blue-700',
            secondaryAction: null,
            allowClose: false,
        },
    };

    const config = modalConfig[reason];

    return (
        <Transition.Root show={isOpen} as={Fragment}>
            <Dialog 
                as="div" 
                className="relative z-50" 
                onClose={config.allowClose && onClose ? onClose : () => {}}
            >
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
                </Transition.Child>

                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            enterTo="opacity-100 translate-y-0 sm:scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        >
                            <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                                <div>
                                    <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${config.iconBg}`}>
                                        <span className={`text-2xl ${config.iconColor}`} aria-hidden="true">
                                            {config.icon}
                                        </span>
                                    </div>
                                    <div className="mt-3 text-center sm:mt-5">
                                        <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900">
                                            {config.title}
                                        </Dialog.Title>
                                        <div className="mt-2">
                                            <p className="text-sm text-gray-500">
                                                {config.message}
                                            </p>
                                        </div>

                                        {/* Show countdown for warning state */}
                                        {reason === 'warning' && timeRemaining > 0 && (
                                            <div className="mt-4 p-3 bg-yellow-50 rounded-md border border-yellow-200">
                                                <p className="text-2xl font-mono font-bold text-yellow-700">
                                                    {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                                                </p>
                                                <p className="text-xs text-yellow-600 mt-1">
                                                    Time remaining
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                                    {/* Primary Action */}
                                    <button
                                        type="button"
                                        className={`inline-flex w-full justify-center rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:col-start-2 ${config.primaryColor}`}
                                        onClick={reason === 'warning' ? handleExtend : handleLogout}
                                    >
                                        {config.primaryAction}
                                    </button>

                                    {/* Secondary Action (if available) */}
                                    {config.secondaryAction && (
                                        <button
                                            type="button"
                                            className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0"
                                            onClick={handleLogout}
                                        >
                                            {config.secondaryAction}
                                        </button>
                                    )}
                                </div>

                                {/* Close button for warning state */}
                                {config.allowClose && onClose && (
                                    <button
                                        type="button"
                                        className="absolute right-4 top-4 text-gray-400 hover:text-gray-500"
                                        onClick={onClose}
                                    >
                                        <span className="sr-only">Close</span>
                                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition.Root>
    );
}

