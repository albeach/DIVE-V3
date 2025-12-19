/**
 * Federated Logout Utility
 * 
 * CRITICAL: All logout operations MUST use this utility instead of calling
 * NextAuth signOut() directly. Direct signOut() calls only clear the local
 * session cookie but do NOT terminate the Keycloak SSO session.
 * 
 * This utility ensures complete logout by:
 * 1. Fetching the idToken from server (for Keycloak logout URL)
 * 2. Calling server-side logout (clears DB sessions + tokens)
 * 3. Calling NextAuth signOut (clears cookies)
 * 4. Redirecting to Keycloak logout endpoint (terminates SSO)
 * 
 * @see https://www.keycloak.org/docs/latest/securing_apps/#logout
 */

import { signOut } from 'next-auth/react';
import { getSessionSyncManager } from '@/lib/session-sync-manager';

interface LogoutOptions {
  /** Skip redirect to Keycloak (for programmatic cleanup) */
  skipKeycloakRedirect?: boolean;
  /** Custom redirect URL after logout (default: '/') */
  redirectUrl?: string;
  /** Reason for logout (for logging) */
  reason?: string;
}

/**
 * Perform complete federated logout
 * 
 * @example
 * // User-initiated logout
 * await federatedLogout();
 * 
 * @example
 * // Session expired - logout without redirect
 * await federatedLogout({ skipKeycloakRedirect: true });
 * 
 * @example
 * // Error recovery - logout with custom redirect
 * await federatedLogout({ redirectUrl: '/error', reason: 'Session error' });
 */
export async function federatedLogout(options: LogoutOptions = {}): Promise<void> {
  const { skipKeycloakRedirect = false, redirectUrl = '/', reason = 'user_logout' } = options;

  console.log('[DIVE Logout] Starting federated logout...', { reason, skipKeycloakRedirect });

  try {
    // STEP 1: Get Keycloak logout URL FIRST (before clearing anything!)
    // The idToken is needed for the id_token_hint parameter
    let keycloakLogoutUrl: string | null = null;
    
    if (!skipKeycloakRedirect) {
      try {
        console.log('[DIVE Logout] Step 1: Fetching idToken from server...');
        const tokenResponse = await fetch('/api/auth/session-tokens');
        
        if (tokenResponse.ok) {
          const tokens = await tokenResponse.json();
          
          if (tokens.idToken) {
            const keycloakUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'https://localhost:8443';
            const realm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'dive-v3-broker';
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                           (typeof window !== 'undefined' ? window.location.origin : 'https://localhost:3000');
            
            keycloakLogoutUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/logout?id_token_hint=${tokens.idToken}&post_logout_redirect_uri=${encodeURIComponent(redirectUrl.startsWith('/') ? baseUrl + redirectUrl : redirectUrl)}`;
            
            console.log('[DIVE Logout] ✅ Keycloak logout URL constructed');
          } else {
            console.warn('[DIVE Logout] ⚠️ No idToken in response - SSO session may persist');
          }
        } else {
          console.warn('[DIVE Logout] ⚠️ Failed to fetch tokens:', tokenResponse.status);
        }
      } catch (error) {
        console.error('[DIVE Logout] ⚠️ Token fetch error:', error);
        // Continue with local logout
      }
    }

    // STEP 2: Server-side logout (clears DB sessions + tokens + revokes at Keycloak)
    console.log('[DIVE Logout] Step 2: Server-side cleanup...');
    try {
      const logoutResponse = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (logoutResponse.ok) {
        console.log('[DIVE Logout] ✅ Server-side logout complete');
      } else {
        console.warn('[DIVE Logout] ⚠️ Server-side logout returned:', logoutResponse.status);
      }
    } catch (error) {
      console.error('[DIVE Logout] ⚠️ Server-side logout error:', error);
      // Continue with local cleanup
    }

    // STEP 3: NextAuth signOut (clears cookies)
    console.log('[DIVE Logout] Step 3: NextAuth signOut...');
    await signOut({ redirect: false });
    console.log('[DIVE Logout] ✅ NextAuth signOut complete');

    // STEP 4: Clear browser storage
    console.log('[DIVE Logout] Step 4: Clearing browser storage...');
    try {
      localStorage.clear();
      sessionStorage.clear();
      console.log('[DIVE Logout] ✅ Browser storage cleared');
    } catch (storageError) {
      console.warn('[DIVE Logout] ⚠️ Storage clear error:', storageError);
    }

    // STEP 5: Notify other tabs via BroadcastChannel
    console.log('[DIVE Logout] Step 5: Notifying other tabs...');
    try {
      const syncManager = getSessionSyncManager();
      syncManager.notifyUserLogout();
      console.log('[DIVE Logout] ✅ Other tabs notified');
    } catch (broadcastError) {
      console.warn('[DIVE Logout] ⚠️ Broadcast error:', broadcastError);
    }

    // STEP 6: Redirect to Keycloak logout (or home if no URL)
    console.log('[DIVE Logout] Step 6: Final redirect...');
    
    if (keycloakLogoutUrl && !skipKeycloakRedirect) {
      console.log('[DIVE Logout] Redirecting to Keycloak for SSO termination');
      // Keycloak will terminate SSO session and redirect back to post_logout_redirect_uri
      window.location.href = keycloakLogoutUrl;
    } else {
      console.log('[DIVE Logout] Redirecting to:', redirectUrl);
      window.location.href = redirectUrl;
    }

  } catch (error) {
    console.error('[DIVE Logout] ❌ Logout error:', error);
    
    // Emergency cleanup
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      // Ignore
    }
    
    // Force redirect to home
    if (typeof window !== 'undefined') {
      window.location.href = redirectUrl;
    }
  }
}

/**
 * Perform local-only logout (for error recovery scenarios)
 * 
 * Use this when Keycloak redirect is not possible/desired,
 * such as during error recovery or programmatic cleanup.
 */
export async function localLogout(redirectUrl = '/'): Promise<void> {
  return federatedLogout({ skipKeycloakRedirect: true, redirectUrl, reason: 'local_cleanup' });
}
