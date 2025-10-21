"use client";

import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import { getSessionSyncManager } from "@/lib/session-sync-manager";

export function SecureLogoutButton() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { data: session } = useSession();
  
  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      
      console.log('[DIVE] User-initiated logout - starting COMPREHENSIVE cleanup...');
      console.log('[DIVE] This will: 1) Delete DB sessions, 2) Clear tokens, 3) Delete cookies, 4) Clear storage, 5) Terminate Keycloak SSO');
      
      // STEP 1: Complete server-side logout FIRST
      // This deletes database sessions AND clears account tokens
      // CRITICAL: Must happen before NextAuth signOut to prevent session recreation
      console.log('[DIVE] Step 1: Complete server-side logout (DB + tokens)...');
      try {
        const response = await fetch('/api/auth/logout', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log('[DIVE] Server-side logout SUCCESS:', result);
        } else {
          console.error('[DIVE] Server-side logout FAILED:', response.status);
        }
      } catch (serverError) {
        console.error('[DIVE] Server-side logout API error:', serverError);
        // Continue with local cleanup even if server fails
      }
      
      // Step 2: Call NextAuth signOut (client-side cookie deletion)
      console.log('[DIVE] Step 2: NextAuth signOut (delete cookies)...');
      await signOut({ redirect: false });
      console.log('[DIVE] NextAuth signOut complete');
      
      // Step 3: Clear browser storage
      console.log('[DIVE] Step 3: Clearing browser storage...');
      localStorage.clear();
      sessionStorage.clear();
      console.log('[DIVE] Browser storage cleared');
      
      // Step 4: Notify other tabs
      console.log('[DIVE] Step 4: Notifying other tabs via BroadcastChannel...');
      const syncManager = getSessionSyncManager();
      syncManager.notifyUserLogout();
      console.log('[DIVE] Other tabs notified');
      
      // Step 5: Terminate Keycloak SSO session
      console.log('[DIVE] Step 5: Getting Keycloak logout URL...');
      const keycloakLogoutUrl = await getKeycloakLogoutUrl();
      
      if (keycloakLogoutUrl) {
        console.log('[DIVE] Redirecting to Keycloak for SSO termination');
        console.log('[DIVE] Full logout URL:', keycloakLogoutUrl.substring(0, 100) + '...');
        
        // Redirect to Keycloak - this terminates the SSO session
        // All local cleanup is done, so user is fully logged out even if Keycloak fails
        window.location.href = keycloakLogoutUrl;
        
      } else {
        console.warn('[DIVE] No Keycloak logout URL - doing local logout only');
        console.log('[DIVE] Complete logout done, redirecting to home');
        
        // All cleanup complete, redirect home
        window.location.href = "/";
      }
      
    } catch (error) {
      console.error("[DIVE] Logout error:", error);
      
      // Emergency cleanup even on error
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (storageError) {
        console.error("[DIVE] Emergency storage clear error:", storageError);
      }
      
      // Force redirect home
      console.log('[DIVE] Forcing redirect after error');
      window.location.href = "/";
    }
  };
  
  const getKeycloakLogoutUrl = async (): Promise<string | null> => {
    try {
      console.log('[DIVE] Building Keycloak logout URL...');
      console.log('[DIVE] Session state:', {
        hasSession: !!session,
        hasIdToken: !!session?.idToken,
        idTokenLength: session?.idToken?.length || 0
      });
      
      // Use the session's idToken to construct Keycloak logout URL
      if (!session?.idToken) {
        console.error("[DIVE] CRITICAL: No idToken found in session - cannot logout from Keycloak!");
        console.error("[DIVE] Will do local logout only (Keycloak session will persist)");
        return null;
      }
      
      const keycloakUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL || "http://localhost:8081";
      const realm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM || "dive-v3-broker";  // Multi-realm: Use broker realm
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      
      console.log('[DIVE] Keycloak logout config:', {
        keycloakUrl,
        realm,
        baseUrl,
        idTokenPreview: session.idToken.substring(0, 20) + '...'
      });
      
      // Build the Keycloak end_session_endpoint URL
      const logoutUrl = new URL(
        `${keycloakUrl}/realms/${realm}/protocol/openid-connect/logout`
      );
      
      // Add required parameters for proper OIDC logout
      logoutUrl.searchParams.set("id_token_hint", session.idToken);
      logoutUrl.searchParams.set("post_logout_redirect_uri", baseUrl);
      
      const finalUrl = logoutUrl.toString();
      console.log('[DIVE] Keycloak logout URL constructed:', finalUrl.substring(0, 100) + '...');
      console.log('[DIVE] This should clear Keycloak cookies: AUTH_SESSION_ID, KEYCLOAK_SESSION, etc.');
      
      return finalUrl;
      
    } catch (error) {
      console.error("[DIVE] Error building Keycloak logout URL:", error);
      return null;
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoggingOut}
      className="relative group w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-900 text-white text-sm font-semibold rounded-xl shadow-md hover:shadow-lg active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2 overflow-hidden"
      aria-label="Sign out"
    >
      {/* Animated background shine effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
      
      {/* Content */}
      <span className="relative flex items-center gap-2">
        {isLoggingOut ? (
          <>
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Signing out...</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-[-2px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Sign Out</span>
          </>
        )}
      </span>
    </button>
  );
}

