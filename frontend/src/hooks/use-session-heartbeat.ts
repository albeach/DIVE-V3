/**
 * Session Heartbeat Hook
 * 
 * Modern 2025 session management patterns:
 * - Periodic server-side session validation
 * - Page visibility detection (pause when hidden)
 * - Clock skew detection and compensation
 * - Proper loading and error states
 * - Automatic retry with exponential backoff
 * 
 * Security: All validation happens server-side. Client never parses JWTs.
 * 
 * Week 3.4+: Advanced Session Management
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';

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

const HEARTBEAT_INTERVAL = 120000; // 2 minutes (normal)
const HEARTBEAT_INTERVAL_CRITICAL = 30000; // 30 seconds (when < 5 minutes remaining)
const CLOCK_SKEW_TOLERANCE = 5000; // 5 seconds tolerance
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_BASE = 2000; // 2 seconds base delay

export function useSessionHeartbeat() {
    const { status } = useSession();
    const [sessionHealth, setSessionHealth] = useState<SessionHealthStatus | null>(null);
    const [isPageVisible, setIsPageVisible] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    
    const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastHeartbeatRef = useRef<number>(0);
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Perform heartbeat check with retry logic
    const performHeartbeat = useCallback(async (isRetry = false): Promise<SessionHealthStatus | null> => {
        if (status !== 'authenticated') {
            setIsLoading(false);
            return null;
        }

        try {
            if (!isRetry) {
                setIsLoading(true);
                setError(null);
            }

            const clientTimeBefore = Date.now();

            const response = await fetch('/api/session/refresh', {
                method: 'GET',
                cache: 'no-store',
            });

            const clientTimeAfter = Date.now();
            const roundTripTime = clientTimeAfter - clientTimeBefore;

            if (!response.ok) {
                // Handle authentication failures
                if (response.status === 401) {
                    console.warn('[Heartbeat] Session invalid - 401 Unauthorized');
                    const invalidHealth = {
                        isValid: false,
                        expiresAt: 0,
                        serverTimeOffset: 0,
                        lastChecked: Date.now(),
                        needsRefresh: false,
                    };
                    setSessionHealth(invalidHealth);
                    setIsLoading(false);
                    setError('Session expired');
                    return invalidHealth;
                }

                // Handle other errors with retry
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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

            // Heartbeat-triggered logout failsafe
            if (!health.isValid && data.authenticated === false) {
                console.error('[Heartbeat] Server reports session invalid - forcing logout');
                await signOut({ callbackUrl: '/', redirect: true });
                return null;
            }

            // Session recovery: If server shows authenticated but tokens are invalid,
            // attempt to refresh the session
            if (data.authenticated === true && !data.isExpired && data.needsRefresh) {
                console.log('[Heartbeat] Server indicates session needs refresh - triggering manual refresh');
                try {
                    const refreshResponse = await fetch('/api/session/refresh', {
                        method: 'POST',
                        cache: 'no-store',
                    });

                    if (refreshResponse.ok) {
                        const refreshData = await refreshResponse.json();
                        console.log('[Heartbeat] Session refresh successful:', refreshData.message);

                        // Update health with new expiry time
                        health.expiresAt = new Date(refreshData.expiresAt).getTime();
                        health.needsRefresh = false;
                    } else {
                        console.warn('[Heartbeat] Session refresh failed:', refreshResponse.status);
                    }
                } catch (refreshError) {
                    console.error('[Heartbeat] Session refresh error:', refreshError);
                }
            }

            setSessionHealth(health);
            setIsLoading(false);
            setError(null);
            setRetryCount(0); // Reset retry count on success
            lastHeartbeatRef.current = Date.now();

            return health;

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            console.error('[Heartbeat] Failed:', errorMessage);

            // Implement exponential backoff retry
            if (retryCount < MAX_RETRY_ATTEMPTS) {
                const delay = RETRY_DELAY_BASE * Math.pow(2, retryCount);
                console.log(`[Heartbeat] Retry attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS} in ${delay}ms`);
                
                setRetryCount(prev => prev + 1);
                setError(`Connection issue (retry ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`);

                // Schedule retry
                retryTimeoutRef.current = setTimeout(() => {
                    performHeartbeat(true);
                }, delay);
            } else {
                console.error('[Heartbeat] Max retry attempts reached');
                setError('Unable to validate session. Please refresh the page.');
                setIsLoading(false);
            }

            return null;
        }
    }, [status, retryCount]);

    // Handle page visibility changes
    useEffect(() => {
        const handleVisibilityChange = () => {
            const isVisible = document.visibilityState === 'visible';
            setIsPageVisible(isVisible);

            // When page becomes visible, perform immediate heartbeat
            if (isVisible) {
                const timeSinceLastHeartbeat = Date.now() - lastHeartbeatRef.current;

                // If more than 2 minutes since last heartbeat, check immediately
                if (timeSinceLastHeartbeat > HEARTBEAT_INTERVAL) {
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
            // Clear any existing interval and timeouts
            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
                heartbeatIntervalRef.current = null;
            }
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
            setIsLoading(false);
            return;
        }

        // Perform initial heartbeat
        performHeartbeat();

        // Only run interval when page is visible
        if (isPageVisible) {
            // Dynamic heartbeat interval based on session health
            const timeUntilExpiry = sessionHealth?.expiresAt
                ? (sessionHealth.expiresAt - Date.now()) / 1000
                : Infinity;

            const intervalDuration = timeUntilExpiry < 300 // Less than 5 minutes
                ? HEARTBEAT_INTERVAL_CRITICAL  // 30 seconds
                : HEARTBEAT_INTERVAL;           // 2 minutes

            heartbeatIntervalRef.current = setInterval(() => {
                performHeartbeat();
            }, intervalDuration);
        } else {
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
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
        };
    }, [status, isPageVisible, sessionHealth?.expiresAt, performHeartbeat]);

    // Manual refresh function
    const triggerHeartbeat = useCallback(() => {
        return performHeartbeat();
    }, [performHeartbeat]);

    return {
        sessionHealth,
        isPageVisible,
        triggerHeartbeat,
        isLoading,
        error,
    };
}

