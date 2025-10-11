"use client";

/**
 * Logout Message Listener
 * 
 * Based on: https://koyukan.medium.com/mastering-keycloak-front-channel-logout-with-next-js-nextauth-js-a-post-mortem-turned-how-to-631d06118d7b
 * 
 * Listens for postMessage from frontchannel logout iframe.
 * When Keycloak triggers front-channel logout:
 * 1. Keycloak loads /api/auth/logout-callback in iframe
 * 2. Iframe deletes cookies and sends 'logout-complete' message
 * 3. This listener receives message
 * 4. Completes logout by redirecting to home
 */

import { useEffect } from 'react';
import { signOut } from 'next-auth/react';

export function LogoutListener({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const handleLogoutMessage = async (event: MessageEvent) => {
            // Security: Verify message origin if needed
            // For now, accept from any origin (iframe sends '*')
            
            if (event.data === 'logout-complete') {
                console.log('[DIVE] Received logout-complete message from iframe');
                
                try {
                    // Call NextAuth signOut to clear any remaining state
                    await signOut({ redirect: false });
                    console.log('[DIVE] NextAuth signOut complete');
                    
                    // Redirect to home page
                    window.location.href = '/';
                    
                } catch (error) {
                    console.error('[DIVE] Error completing logout:', error);
                    // Force redirect anyway
                    window.location.href = '/';
                }
            }
        };
        
        // Listen for messages from logout iframe
        window.addEventListener('message', handleLogoutMessage);
        
        console.log('[DIVE] Logout listener registered');
        
        // Cleanup
        return () => {
            window.removeEventListener('message', handleLogoutMessage);
        };
    }, []);
    
    return <>{children}</>;
}

