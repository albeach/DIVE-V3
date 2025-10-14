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
      
      console.log('[DIVE] User-initiated logout - starting...');
      
      // Notify other tabs before logout
      const syncManager = getSessionSyncManager();
      syncManager.notifyUserLogout();
      
      // Step 1: Get Keycloak logout URL (includes id_token_hint)
      const keycloakLogoutUrl = await getKeycloakLogoutUrl();
      
      if (keycloakLogoutUrl) {
        console.log('[DIVE] Redirecting to Keycloak logout endpoint');
        console.log('[DIVE] Keycloak will call frontchannel logout callback');
        console.log('[DIVE] Callback will send postMessage to parent');
        console.log('[DIVE] Parent LogoutListener will complete cleanup');
        
        // Redirect to Keycloak logout
        // Keycloak will:
        // 1. Terminate Keycloak SSO session
        // 2. Load /api/auth/logout-callback in iframe (frontchannel logout)
        // 3. Iframe deletes cookies and sends postMessage
        // 4. LogoutListener receives message and redirects to home
        window.location.href = keycloakLogoutUrl;
        
      } else {
        console.warn('[DIVE] No Keycloak logout URL, doing local logout only');
        
        // Fallback: Local logout without Keycloak
        localStorage.clear();
        sessionStorage.clear();
        await signOut({ redirect: false });
        window.location.href = "/";
      }
      
    } catch (error) {
      console.error("[DIVE] Logout error:", error);
      // Force redirect to home even if error
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
      const realm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM || "dive-v3-pilot";
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
      className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoggingOut ? "Signing out..." : "Sign Out"}
    </button>
  );
}

