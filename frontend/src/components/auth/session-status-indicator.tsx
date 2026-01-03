/**
 * Session Status Indicator Component
 * 
 * Displays real-time session status to user:
 * - Time remaining until token expiry
 * - Visual color coding (green/yellow/red)
 * - Session health status
 * 
 * SECURITY: Uses server-side database sessions (DrizzleAdapter)
 * - No client-side JWT parsing
 * - Session validation happens via heartbeat API
 * - Database session expiry used as fallback
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
            // PREFERRED: Use server-validated session health from heartbeat API
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

            // FALLBACK: Use database session expiry (NextAuth session.expires)
            // This is available when using database sessions with DrizzleAdapter
            const sessionExpires = (session as any).expires;
            if (sessionExpires) {
                const expiresAt = new Date(sessionExpires);
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
                return;
            }

            // DEFAULT: If no session data yet, assume healthy (waiting for heartbeat)
            // This prevents showing "expired" flash during initial load
            setSessionStatus({
                timeRemaining: 3600, // Assume 1 hour as default
                expiresAt: null,
                status: 'healthy',
            });
        };

        updateStatus();

        // Update every second when page is visible
        const interval = isPageVisible ? setInterval(updateStatus, 1000) : null;

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [authStatus, session, sessionHealth, isPageVisible]);

    // Don't render anything if not authenticated
    if (authStatus !== 'authenticated') {
        return null;
    }

    return (
        <div className="flex items-center gap-2 text-sm">
            <StatusDot status={sessionStatus.status} />
            <span className="hidden sm:inline">
                {formatTimeRemaining(sessionStatus.timeRemaining)}
            </span>
        </div>
    );
}

function StatusDot({ status }: { status: SessionStatus['status'] }) {
    const colors = {
        healthy: 'bg-green-500',
        warning: 'bg-yellow-500',
        critical: 'bg-red-500 animate-pulse',
        expired: 'bg-gray-500',
        unknown: 'bg-gray-400',
    };

    return (
        <span
            className={`w-2 h-2 rounded-full ${colors[status]}`}
            title={`Session status: ${status}`}
        />
    );
}

function formatTimeRemaining(seconds: number): string {
    if (seconds <= 0) return 'Expired';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// Export for testing
export { formatTimeRemaining, StatusDot };
