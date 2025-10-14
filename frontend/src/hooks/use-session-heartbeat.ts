/**
 * Session Heartbeat Hook
 * 
 * Handles:
 * - Periodic session validation with server
 * - Page visibility detection (pause timers when hidden)
 * - Clock skew detection and compensation
 * - Server-side session status synchronization
 * 
 * Week 3.4+: Advanced Session Management
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';

interface HeartbeatResponse {
    authenticated: boolean;
    expiresAt: string | null;
    timeUntilExpiry: number;
    isExpired: boolean;
    needsRefresh: boolean;
    serverTime: number; // Unix timestamp in seconds
}

interface SessionHealthStatus {
    isValid: boolean;
    expiresAt: number; // Unix timestamp in milliseconds
    serverTimeOffset: number; // Milliseconds difference (client - server)
    lastChecked: number; // Unix timestamp in milliseconds
    needsRefresh: boolean;
}

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const CLOCK_SKEW_TOLERANCE = 5000; // 5 seconds tolerance

export function useSessionHeartbeat() {
    const { status } = useSession();
    const [sessionHealth, setSessionHealth] = useState<SessionHealthStatus | null>(null);
    const [isPageVisible, setIsPageVisible] = useState(true);
    const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastHeartbeatRef = useRef<number>(0);

    // Perform heartbeat check
    const performHeartbeat = useCallback(async () => {
        if (status !== 'authenticated') {
            return null;
        }

        try {
            const clientTimeBefore = Date.now();

            const response = await fetch('/api/session/refresh', {
                method: 'GET',
                cache: 'no-store',
            });

            const clientTimeAfter = Date.now();
            const roundTripTime = clientTimeAfter - clientTimeBefore;

            if (!response.ok) {
                console.warn('[Heartbeat] Session invalid:', response.status);
                return {
                    isValid: false,
                    expiresAt: 0,
                    serverTimeOffset: 0,
                    lastChecked: Date.now(),
                    needsRefresh: false,
                };
            }

            const data: HeartbeatResponse = await response.json();

            // Calculate server time offset (accounting for round-trip)
            const estimatedServerTime = (data.serverTime * 1000) + (roundTripTime / 2);
            const serverTimeOffset = Date.now() - estimatedServerTime;

            // Detect significant clock skew
            if (Math.abs(serverTimeOffset) > CLOCK_SKEW_TOLERANCE) {
                console.warn('[Heartbeat] Clock skew detected:', {
                    offset: serverTimeOffset,
                    offsetSeconds: Math.floor(serverTimeOffset / 1000),
                    tolerance: CLOCK_SKEW_TOLERANCE
                });
            }

            const health: SessionHealthStatus = {
                isValid: data.authenticated && !data.isExpired,
                expiresAt: data.expiresAt ? new Date(data.expiresAt).getTime() : 0,
                serverTimeOffset,
                lastChecked: Date.now(),
                needsRefresh: data.needsRefresh,
            };

            console.log('[Heartbeat] Health check:', {
                isValid: health.isValid,
                expiresAt: new Date(health.expiresAt).toISOString(),
                timeUntilExpiry: data.timeUntilExpiry,
                clockSkew: Math.floor(serverTimeOffset / 1000) + 's',
                needsRefresh: health.needsRefresh,
            });

            setSessionHealth(health);
            lastHeartbeatRef.current = Date.now();

            return health;

        } catch (error) {
            console.error('[Heartbeat] Failed:', error);
            return null;
        }
    }, [status]);

    // Handle page visibility changes
    useEffect(() => {
        const handleVisibilityChange = () => {
            const isVisible = document.visibilityState === 'visible';
            setIsPageVisible(isVisible);

            console.log('[Heartbeat] Page visibility changed:', {
                visible: isVisible,
                timeSinceLastHeartbeat: Date.now() - lastHeartbeatRef.current
            });

            // When page becomes visible, perform immediate heartbeat
            if (isVisible) {
                const timeSinceLastHeartbeat = Date.now() - lastHeartbeatRef.current;

                // If more than 30 seconds since last heartbeat, check immediately
                if (timeSinceLastHeartbeat > HEARTBEAT_INTERVAL) {
                    console.log('[Heartbeat] Page became visible, performing immediate check');
                    performHeartbeat();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [performHeartbeat]);

    // Setup heartbeat interval (only when page visible)
    useEffect(() => {
        if (status !== 'authenticated') {
            // Clear any existing interval
            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
                heartbeatIntervalRef.current = null;
            }
            return;
        }

        // Perform initial heartbeat
        performHeartbeat();

        // Only run interval when page is visible
        if (isPageVisible) {
            console.log('[Heartbeat] Starting interval (page visible)');

            heartbeatIntervalRef.current = setInterval(() => {
                console.log('[Heartbeat] Interval tick');
                performHeartbeat();
            }, HEARTBEAT_INTERVAL);
        } else {
            console.log('[Heartbeat] Pausing interval (page hidden)');

            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
                heartbeatIntervalRef.current = null;
            }
        }

        return () => {
            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
                heartbeatIntervalRef.current = null;
            }
        };
    }, [status, isPageVisible, performHeartbeat]);

    // Manual refresh function
    const triggerHeartbeat = useCallback(() => {
        return performHeartbeat();
    }, [performHeartbeat]);

    return {
        sessionHealth,
        isPageVisible,
        triggerHeartbeat,
    };
}

