/**
 * Session Status Indicator Component
 * 
 * Displays real-time session status to user:
 * - Time remaining until token expiry
 * - Visual color coding (green/yellow/red)
 * - Session health status
 * 
 * Week 3.4: Enhanced Session Management
 */

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useSessionHeartbeat } from '@/hooks/use-session-heartbeat';

interface SessionStatus {
    timeRemaining: number; // seconds
    expiresAt: Date | null;
    status: 'healthy' | 'warning' | 'critical' | 'expired' | 'unknown';
}

export function SessionStatusIndicator() {
    const { data: session, status: authStatus } = useSession();
    const { sessionHealth, isPageVisible } = useSessionHeartbeat();
    const [sessionStatus, setSessionStatus] = useState<SessionStatus>({
        timeRemaining: 0,
        expiresAt: null,
        status: 'unknown',
    });

    useEffect(() => {
        if (authStatus !== 'authenticated' || !session) {
            setSessionStatus({
                timeRemaining: 0,
                expiresAt: null,
                status: 'unknown',
            });
            return;
        }

        // Function to calculate session status using server-validated data
        const updateStatus = () => {
            // Prefer server-validated session health
            if (sessionHealth && sessionHealth.isValid) {
                const now = Date.now() - sessionHealth.serverTimeOffset; // Adjust for clock skew
                const timeRemaining = Math.max(0, Math.floor((sessionHealth.expiresAt - now) / 1000));

                // Determine status based on time remaining
                let status: SessionStatus['status'];
                if (timeRemaining <= 0) {
                    status = 'expired';
                } else if (timeRemaining < 120) { // Less than 2 minutes
                    status = 'critical';
                } else if (timeRemaining < 300) { // Less than 5 minutes
                    status = 'warning';
                } else {
                    status = 'healthy';
                }

                setSessionStatus({
                    timeRemaining,
                    expiresAt: new Date(sessionHealth.expiresAt),
                    status,
                });
                return;
            }

            // Fallback to client-side JWT parsing
            const accessToken = (session as any).accessToken;
            if (!accessToken) {
                setSessionStatus({
                    timeRemaining: 0,
                    expiresAt: null,
                    status: 'expired',
                });
                return;
            }

            try {
                const parts = accessToken.split('.');
                if (parts.length !== 3) {
                    setSessionStatus({
                        timeRemaining: 0,
                        expiresAt: null,
                        status: 'expired',
                    });
                    return;
                }

                const payload = JSON.parse(atob(parts[1]));
                const exp = payload.exp;

                if (!exp) {
                    setSessionStatus({
                        timeRemaining: 0,
                        expiresAt: null,
                        status: 'unknown',
                    });
                    return;
                }

                const expiresAt = new Date(exp * 1000);
                const now = Date.now();
                const timeRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now) / 1000));

                // Determine status based on time remaining
                let status: SessionStatus['status'];
                if (timeRemaining <= 0) {
                    status = 'expired';
                } else if (timeRemaining < 120) { // Less than 2 minutes
                    status = 'critical';
                } else if (timeRemaining < 300) { // Less than 5 minutes
                    status = 'warning';
                } else {
                    status = 'healthy';
                }

                setSessionStatus({
                    timeRemaining,
                    expiresAt,
                    status,
                });
            } catch (error) {
                console.error('[SessionStatus] Error parsing token:', error);
                setSessionStatus({
                    timeRemaining: 0,
                    expiresAt: null,
                    status: 'unknown',
                });
            }
        };

        // Update immediately
        updateStatus();

        // Only update every second when page is visible (performance optimization)
        if (isPageVisible) {
            const interval = setInterval(updateStatus, 1000);
            return () => clearInterval(interval);
        }
    }, [session, authStatus, sessionHealth, isPageVisible]);

    // Don't render if not authenticated
    if (authStatus !== 'authenticated') {
        return null;
    }

    // Format time remaining as MM:SS
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Status colors and icons
    const statusConfig = {
        healthy: {
            color: 'text-green-600',
            bg: 'bg-green-100',
            border: 'border-green-300',
            icon: '🟢',
            label: 'Active',
        },
        warning: {
            color: 'text-yellow-600',
            bg: 'bg-yellow-100',
            border: 'border-yellow-300',
            icon: '🟡',
            label: 'Expiring Soon',
        },
        critical: {
            color: 'text-red-600',
            bg: 'bg-red-100',
            border: 'border-red-300',
            icon: '🔴',
            label: 'Expiring!',
        },
        expired: {
            color: 'text-gray-600',
            bg: 'bg-gray-100',
            border: 'border-gray-300',
            icon: '⚫',
            label: 'Expired',
        },
        unknown: {
            color: 'text-gray-600',
            bg: 'bg-gray-100',
            border: 'border-gray-300',
            icon: '❓',
            label: 'Unknown',
        },
    };

    const config = statusConfig[sessionStatus.status];

    return (
        <div 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${config.bg} ${config.border} transition-all duration-300`}
            title={sessionStatus.expiresAt ? `Expires at ${sessionStatus.expiresAt.toLocaleTimeString()}` : 'Session status unknown'}
        >
            <span className="text-sm">{config.icon}</span>
            <div className="flex flex-col">
                <span className={`text-xs font-medium ${config.color}`}>
                    {config.label}
                </span>
                {sessionStatus.status !== 'unknown' && sessionStatus.status !== 'expired' && (
                    <span className={`text-xs font-mono ${config.color}`}>
                        {formatTime(sessionStatus.timeRemaining)}
                    </span>
                )}
            </div>
        </div>
    );
}

