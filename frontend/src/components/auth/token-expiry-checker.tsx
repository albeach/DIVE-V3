/**
 * Token Expiry Checker Component
 * 
 * Enhanced session management with:
 * - Warning modal 2 minutes before expiry
 * - Option to extend session
 * - Graceful handling of expired sessions
 * - Error handling for database/network issues
 * - Cross-tab synchronization via Broadcast Channel
 * - Page visibility detection and pause/resume
 * - Server-side validation via heartbeat
 * 
 * Week 3.4+: Advanced Session Management
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { SessionExpiryModal, type SessionExpiryReason } from './session-expiry-modal';
import { getSessionSyncManager } from '@/lib/session-sync-manager';
import { useSessionHeartbeat } from '@/hooks/use-session-heartbeat';

const WARNING_THRESHOLD = 120; // 2 minutes in seconds
const REFRESH_THRESHOLD = 300; // 5 minutes - attempt refresh when less than this remains

export function TokenExpiryChecker() {
    const { data: session, status, update } = useSession();
    const router = useRouter();
    const { sessionHealth, isPageVisible, triggerHeartbeat } = useSessionHeartbeat();
    
    const [modalOpen, setModalOpen] = useState(false);
    const [modalReason, setModalReason] = useState<SessionExpiryReason>('expired');
    const [timeRemaining, setTimeRemaining] = useState(0);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [hasShownWarning, setHasShownWarning] = useState(false);
    const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const syncManagerRef = useRef(getSessionSyncManager());

    // Function to refresh session
    const refreshSession = useCallback(async () => {
        try {
            console.log('[TokenExpiry] Attempting to refresh session...');
            
            // Call the session refresh API
            const response = await fetch('/api/session/refresh', { method: 'POST' });
            const data = await response.json();
            
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Refresh failed');
            }
            
            // Trigger NextAuth session update
            await update();
            
            // Notify other tabs via broadcast channel
            const expiresAtTimestamp = new Date(data.expiresAt).getTime();
            syncManagerRef.current.notifyTokenRefreshed(expiresAtTimestamp);
            
            // Trigger heartbeat to update session health
            await triggerHeartbeat();
            
            setHasShownWarning(false);
            setModalOpen(false);
            console.log('[TokenExpiry] Session refreshed successfully, notified other tabs');
            
        } catch (error) {
            console.error('[TokenExpiry] Failed to refresh session:', error);
            setModalReason('error');
            setErrorMessage('Failed to refresh your session. Please login again.');
            setModalOpen(true);
        }
    }, [update, triggerHeartbeat]);

    // Subscribe to cross-tab session sync events
    useEffect(() => {
        const syncManager = syncManagerRef.current;
        
        const unsubscribe = syncManager.subscribe((event) => {
            console.log('[TokenExpiry] Received sync event:', event.type);
            
            switch (event.type) {
                case 'TOKEN_REFRESHED':
                case 'SESSION_EXTENDED':
                    // Another tab refreshed the token - update our UI
                    console.log('[TokenExpiry] Token refreshed in another tab, updating session');
                    update(); // Refresh our session
                    setHasShownWarning(false);
                    setModalOpen(false);
                    break;
                    
                case 'SESSION_EXPIRED':
                    // Another tab detected expiry
                    console.warn('[TokenExpiry] Session expired in another tab');
                    setModalReason('expired');
                    setModalOpen(true);
                    break;
                    
                case 'USER_LOGOUT':
                    // User logged out in another tab
                    console.log('[TokenExpiry] User logged out in another tab');
                    signOut({ callbackUrl: '/' });
                    break;
                    
                case 'WARNING_SHOWN':
                    // Another tab showed warning - coordinate state
                    console.log('[TokenExpiry] Warning shown in another tab');
                    setHasShownWarning(true);
                    break;
                    
                case 'WARNING_DISMISSED':
                    // Another tab dismissed warning
                    console.log('[TokenExpiry] Warning dismissed in another tab');
                    // Don't reset hasShownWarning - we don't want to spam
                    break;
            }
        });
        
        return () => {
            unsubscribe();
        };
    }, [update]);

    // Main expiry checking logic - use server-validated session health when available
    useEffect(() => {
        if (status !== 'authenticated' || !session) {
            // Clear any existing timer
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
            return;
        }

        const accessToken = (session as any).accessToken;
        
        if (!accessToken) {
            console.warn('[TokenExpiry] No access token in session');
            setModalReason('error');
            setErrorMessage('Your session is invalid. Please login again.');
            setModalOpen(true);
            return;
        }

        // Prefer server-validated session health over client-side JWT parsing
        let expiresAt: number;
        let secondsRemaining: number;

        if (sessionHealth && sessionHealth.isValid) {
            // Use server-provided expiry (compensated for clock skew)
            expiresAt = sessionHealth.expiresAt;
            const now = Date.now() - sessionHealth.serverTimeOffset; // Adjust for clock skew
            secondsRemaining = Math.floor((expiresAt - now) / 1000);
            
            console.log('[TokenExpiry] Using server-validated session health:', {
                expiresAt: new Date(expiresAt).toISOString(),
                secondsRemaining,
                clockSkew: Math.floor(sessionHealth.serverTimeOffset / 1000) + 's',
            });
        } else {
            // Fallback to client-side JWT parsing
            try {
                const parts = accessToken.split('.');
                if (parts.length !== 3) {
                    console.warn('[TokenExpiry] Invalid token format');
                    setModalReason('error');
                    setErrorMessage('Your session is invalid. Please login again.');
                    setModalOpen(true);
                    return;
                }

                const payload = JSON.parse(atob(parts[1]));
                const exp = payload.exp;
                
                if (!exp) {
                    console.warn('[TokenExpiry] No expiration in token');
                    return;
                }

                expiresAt = exp * 1000;
                const now = Date.now();
                secondsRemaining = Math.floor((expiresAt - now) / 1000);
                
                console.log('[TokenExpiry] Using client-side JWT parsing (fallback):', {
                    expiresAt: new Date(expiresAt).toISOString(),
                    secondsRemaining,
                });
            } catch (error) {
                console.error('[TokenExpiry] Error parsing token:', error);
                setModalReason('error');
                setErrorMessage('An error occurred while checking your session.');
                setModalOpen(true);
                return;
            }
        }

        // If already expired, show expired modal
        if (secondsRemaining <= 0) {
            console.warn('[TokenExpiry] Token has expired');
            setModalReason('expired');
            setTimeRemaining(0);
            setModalOpen(true);
            syncManagerRef.current.notifySessionExpired();
            return;
        }

        // Auto-refresh if getting close to expiry (under 5 minutes) and page is visible
        if (secondsRemaining < REFRESH_THRESHOLD && secondsRemaining > WARNING_THRESHOLD && !hasShownWarning && isPageVisible) {
            console.log('[TokenExpiry] Auto-refreshing session (under 5 minutes, page visible)');
            refreshSession();
        }

        // Show warning if close to expiry (under 2 minutes) and haven't shown warning yet
        if (secondsRemaining <= WARNING_THRESHOLD && !hasShownWarning) {
            console.warn('[TokenExpiry] Token expiring soon - showing warning');
            setModalReason('warning');
            setTimeRemaining(secondsRemaining);
            setModalOpen(true);
            setHasShownWarning(true);
            syncManagerRef.current.notifyWarningShown();
        }

        // Update time remaining every second (only when page is visible)
        if (isPageVisible) {
            timerIntervalRef.current = setInterval(() => {
                const now = sessionHealth ? Date.now() - sessionHealth.serverTimeOffset : Date.now();
                const remaining = Math.floor((expiresAt - now) / 1000);
                
                setTimeRemaining(Math.max(0, remaining));
                
                // If expired while modal open, switch to expired
                if (remaining <= 0 && modalOpen) {
                    console.warn('[TokenExpiry] Token expired during warning period');
                    setModalReason('expired');
                    syncManagerRef.current.notifySessionExpired();
                    if (timerIntervalRef.current) {
                        clearInterval(timerIntervalRef.current);
                        timerIntervalRef.current = null;
                    }
                }
            }, 1000);
        }

        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        };
    }, [session, status, sessionHealth, isPageVisible, modalOpen, modalReason, hasShownWarning, refreshSession]);

    const handleExtendSession = async () => {
        await refreshSession();
    };

    const handleCloseWarning = () => {
        setModalOpen(false);
        // Don't reset hasShownWarning - we don't want to spam warnings
        syncManagerRef.current.notifyWarningDismissed();
    };

    return (
        <SessionExpiryModal
            isOpen={modalOpen}
            reason={modalReason}
            timeRemaining={timeRemaining}
            errorMessage={errorMessage}
            onExtendSession={handleExtendSession}
            onClose={modalReason === 'warning' ? handleCloseWarning : undefined}
        />
    );
}

