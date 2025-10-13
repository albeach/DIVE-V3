/**
 * Token Expiry Checker Component
 * 
 * Monitors JWT token expiration and auto-logs out user when token expires
 * Prevents "zombie sessions" where UI shows logged in but API calls fail
 */

'use client';

import { useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export function TokenExpiryChecker() {
    const { data: session, status } = useSession();
    const router = useRouter();

    useEffect(() => {
        if (status !== 'authenticated' || !session) {
            return;
        }

        // Check if access token is present
        const accessToken = (session as any).accessToken;
        
        if (!accessToken) {
            console.warn('[TokenExpiry] No access token in session - logging out');
            signOut({ callbackUrl: '/' });
            return;
        }

        // Decode token to check expiration
        try {
            const parts = accessToken.split('.');
            if (parts.length !== 3) {
                console.warn('[TokenExpiry] Invalid token format - logging out');
                signOut({ callbackUrl: '/' });
                return;
            }

            const payload = JSON.parse(atob(parts[1]));
            const exp = payload.exp;
            
            if (!exp) {
                console.warn('[TokenExpiry] No expiration in token');
                return;
            }

            const expiresAt = exp * 1000; // Convert to milliseconds
            const now = Date.now();
            const timeUntilExpiry = expiresAt - now;

            console.log('[TokenExpiry] Token status:', {
                expiresAt: new Date(expiresAt).toISOString(),
                timeUntilExpiry: Math.floor(timeUntilExpiry / 1000) + ' seconds',
                expired: timeUntilExpiry <= 0
            });

            // If already expired, logout immediately
            if (timeUntilExpiry <= 0) {
                console.warn('[TokenExpiry] Token has expired - logging out');
                alert('Your session has expired. Please login again.');
                signOut({ callbackUrl: '/' });
                return;
            }

            // Set timer to logout when token expires
            const timer = setTimeout(() => {
                console.warn('[TokenExpiry] Token expired - auto-logout');
                alert('Your session has expired. Please login again.');
                signOut({ callbackUrl: '/' });
            }, timeUntilExpiry);

            return () => clearTimeout(timer);
        } catch (error) {
            console.error('[TokenExpiry] Error checking token:', error);
        }
    }, [session, status, router]);

    return null; // This component doesn't render anything
}

