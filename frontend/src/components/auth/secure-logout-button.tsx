"use client";

import { signOut, useSession } from "next-auth/react";
import { useState } from "react";

export function SecureLogoutButton() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { data: session } = useSession();
  
  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      
      // Step 1: Get the Keycloak logout URL from our API
      const keycloakLogoutUrl = await getKeycloakLogoutUrl();
      
      // Step 2: Clear client-side storage
      localStorage.clear();
      sessionStorage.clear();
      
      // Step 3: Sign out from NextAuth (clears session and cookies)
      // Use redirect: false so we can control the flow
      await signOut({ redirect: false });
      
      // Step 4: Redirect to Keycloak logout endpoint
      // This terminates the Keycloak session and redirects back to our app
      if (keycloakLogoutUrl) {
        window.location.href = keycloakLogoutUrl;
      } else {
        // Fallback: just go to home page
        window.location.href = "/";
      }
      
    } catch (error) {
      console.error("Logout error:", error);
      // Force redirect to home even if error
      window.location.href = "/";
    }
  };
  
  const getKeycloakLogoutUrl = async (): Promise<string | null> => {
    try {
      // Use the session's idToken to construct Keycloak logout URL
      if (!session?.idToken) {
        console.warn("No idToken found in session");
        return null;
      }
      
      const keycloakUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL || "http://localhost:8081";
      const realm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM || "dive-v3-pilot";
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      
      // Build the Keycloak end_session_endpoint URL
      const logoutUrl = new URL(
        `${keycloakUrl}/realms/${realm}/protocol/openid-connect/logout`
      );
      
      // Add required parameters for proper OIDC logout
      logoutUrl.searchParams.set("id_token_hint", session.idToken);
      logoutUrl.searchParams.set("post_logout_redirect_uri", baseUrl);
      
      return logoutUrl.toString();
      
    } catch (error) {
      console.error("Error building Keycloak logout URL:", error);
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

