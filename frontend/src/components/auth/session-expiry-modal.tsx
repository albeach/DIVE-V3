/**
 * Session Expiry Modal Component - 2025 Modern Design
 * 
 * Modern modal with glassmorphism, smooth animations, and gradient accents
 * Handles different expiry scenarios:
 * - Warning: 2 minutes before expiry (allow extension)
 * - Expired: Session has expired (require re-login)
 * - Error: Database or network issues
 * 
 * Design: 2025 patterns with backdrop blur, gradient borders, smooth micro-interactions
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

    // Modal content based on reason - 2025 Modern Design
    const modalConfig = {
        warning: {
            icon: '⏰',
            iconBg: 'bg-gradient-to-br from-amber-400 to-yellow-500',
            iconColor: 'text-white',
            iconRing: 'ring-amber-400/30',
            gradientFrom: 'from-amber-50',
            gradientTo: 'to-yellow-50',
            borderColor: 'border-amber-200',
            title: 'Session Expiring Soon',
            message: `Your session will expire in ${Math.floor(timeRemaining / 60)} minute(s). Would you like to continue working?`,
            primaryAction: 'Extend Session',
            primaryBg: 'bg-gradient-to-r from-blue-600 to-indigo-600',
            primaryHover: 'hover:from-blue-700 hover:to-indigo-700',
            secondaryAction: 'Logout Now',
            allowClose: true,
        },
        expired: {
            icon: '🔒',
            iconBg: 'bg-gradient-to-br from-red-500 to-pink-600',
            iconColor: 'text-white',
            iconRing: 'ring-red-400/30',
            gradientFrom: 'from-red-50',
            gradientTo: 'to-pink-50',
            borderColor: 'border-red-200',
            title: 'Session Expired',
            message: 'Your session has expired for security reasons. Please login again to continue.',
            primaryAction: 'Login Again',
            primaryBg: 'bg-gradient-to-r from-blue-600 to-indigo-600',
            primaryHover: 'hover:from-blue-700 hover:to-indigo-700',
            secondaryAction: null,
            allowClose: false,
        },
        inactivity: {
            icon: '💤',
            iconBg: 'bg-gradient-to-br from-slate-400 to-gray-500',
            iconColor: 'text-white',
            iconRing: 'ring-gray-400/30',
            gradientFrom: 'from-slate-50',
            gradientTo: 'to-gray-50',
            borderColor: 'border-slate-200',
            title: 'Session Timeout',
            message: 'Your session has expired due to inactivity. Please login again to continue.',
            primaryAction: 'Login Again',
            primaryBg: 'bg-gradient-to-r from-blue-600 to-indigo-600',
            primaryHover: 'hover:from-blue-700 hover:to-indigo-700',
            secondaryAction: null,
            allowClose: false,
        },
        error: {
            icon: '⚠️',
            iconBg: 'bg-gradient-to-br from-orange-500 to-amber-600',
            iconColor: 'text-white',
            iconRing: 'ring-orange-400/30',
            gradientFrom: 'from-orange-50',
            gradientTo: 'to-amber-50',
            borderColor: 'border-orange-200',
            title: 'Session Error',
            message: errorMessage || 'An error occurred with your session. Please login again.',
            primaryAction: 'Login Again',
            primaryBg: 'bg-gradient-to-r from-blue-600 to-indigo-600',
            primaryHover: 'hover:from-blue-700 hover:to-indigo-700',
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
                {/* 2025 Modern Backdrop with Blur */}
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-500"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-300"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-gradient-to-br from-slate-900/80 via-gray-900/80 to-slate-900/80 backdrop-blur-md transition-all" />
                </Transition.Child>

                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-500"
                            enterFrom="opacity-0 scale-90 translate-y-8"
                            enterTo="opacity-100 scale-100 translate-y-0"
                            leave="ease-in duration-300"
                            leaveFrom="opacity-100 scale-100 translate-y-0"
                            leaveTo="opacity-0 scale-90 translate-y-8"
                        >
                            <Dialog.Panel className={`relative transform overflow-hidden rounded-3xl bg-gradient-to-br ${config.gradientFrom} ${config.gradientTo} shadow-2xl transition-all w-full max-w-md border-2 ${config.borderColor}`}>
                                {/* Glassmorphism overlay */}
                                <div className="absolute inset-0 bg-white/60 backdrop-blur-xl" />
                                
                                {/* Content */}
                                <div className="relative p-8">
                                    {/* Animated Icon with Ring */}
                                    <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${config.iconBg} ring-8 ${config.iconRing} shadow-lg transform transition-transform duration-500 hover:scale-110 hover:rotate-6`}>
                                        <span className={`text-4xl ${config.iconColor} animate-pulse`} aria-hidden="true">
                                            {config.icon}
                                        </span>
                                    </div>
                                    
                                    <div className="mt-6 text-center">
                                        <Dialog.Title as="h3" className="text-2xl font-bold leading-7 bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                                            {config.title}
                                        </Dialog.Title>
                                        <div className="mt-3">
                                            <p className="text-base text-gray-700 leading-relaxed">
                                                {config.message}
                                            </p>
                                        </div>

                                        {/* Modern Countdown Timer with Animation */}
                                        {reason === 'warning' && timeRemaining > 0 && (
                                            <div className="mt-6 p-5 bg-gradient-to-br from-amber-100/80 to-yellow-100/80 backdrop-blur-sm rounded-2xl border-2 border-amber-300/50 shadow-inner transform transition-all duration-300 hover:scale-105">
                                                <p className="text-4xl font-mono font-black bg-gradient-to-r from-amber-600 to-yellow-600 bg-clip-text text-transparent animate-pulse">
                                                    {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                                                </p>
                                                <p className="text-xs font-semibold text-amber-700 mt-2 uppercase tracking-wider">
                                                    Time Remaining
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Modern Action Buttons - CENTERED when single button */}
                                <div className={`relative px-8 pb-8 ${config.secondaryAction ? 'grid grid-cols-2 gap-3' : 'flex justify-center'}`}>
                                    {/* Primary Action - Full width centered when alone */}
                                    <button
                                        type="button"
                                        className={`group relative inline-flex items-center justify-center rounded-xl px-6 py-3.5 text-base font-bold text-white shadow-xl ${config.primaryBg} ${config.primaryHover} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transform transition-all duration-300 hover:scale-105 hover:shadow-2xl ${!config.secondaryAction ? 'w-full max-w-xs' : 'w-full'}`}
                                        onClick={reason === 'warning' ? handleExtend : handleLogout}
                                    >
                                        <span className="relative z-10">{config.primaryAction}</span>
                                        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                                    </button>

                                    {/* Secondary Action */}
                                    {config.secondaryAction && (
                                        <button
                                            type="button"
                                            className="group relative inline-flex items-center justify-center rounded-xl bg-white/80 backdrop-blur-sm px-6 py-3.5 text-base font-bold text-gray-900 shadow-lg ring-2 ring-inset ring-gray-300 hover:bg-white hover:ring-gray-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 transform transition-all duration-300 hover:scale-105"
                                            onClick={handleLogout}
                                        >
                                            <span className="relative z-10">{config.secondaryAction}</span>
                                        </button>
                                    )}
                                </div>

                                {/* Modern Close Button */}
                                {config.allowClose && onClose && (
                                    <button
                                        type="button"
                                        className="absolute right-5 top-5 p-2 rounded-full bg-white/80 backdrop-blur-sm text-gray-500 hover:text-gray-700 hover:bg-white hover:scale-110 transform transition-all duration-200 shadow-lg"
                                        onClick={onClose}
                                    >
                                        <span className="sr-only">Close</span>
                                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
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

