"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

export function SecureLogoutButton() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      
      // Step 1: Clear client-side storage
      localStorage.clear();
      sessionStorage.clear();
      
      // Step 2: Call server-side logout to clear httpOnly cookies
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
        });
      } catch (err) {
        console.warn("Server-side cookie clearing failed:", err);
      }
      
      // Step 3: Sign out through NextAuth
      // This should trigger NextAuth's built-in logout which also clears cookies
      await signOut({ 
        callbackUrl: "/",
        redirect: true
      });
      
    } catch (error) {
      console.error("Logout error:", error);
      // Force redirect to home even if error
      window.location.href = "/";
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

