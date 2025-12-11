"use client";

import { signIn } from "next-auth/react";

interface LoginButtonProps {
  idpHint?: string;
}

export function LoginButton({ idpHint }: LoginButtonProps) {
  const handleSignIn = () => {
    // NextAuth v5: Use signIn() function with provider name
    // Don't use Link to /api/auth/signin - causes UnknownAction error
    // Use root as callback to let NextAuth manage return path; avoids stale state
    const callbackUrl = "/";
    const options: any = { callbackUrl };
    
    // Add kc_idp_hint for Keycloak broker IdP selection
    if (idpHint) {
      options.kc_idp_hint = idpHint;
    }
    
    signIn("keycloak", options);
  };

  return (
    <button
      onClick={handleSignIn}
      className="block w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg text-center"
    >
      {idpHint 
        ? `Sign in with ${idpHint.replace('-idp', '').toUpperCase()}`
        : 'Sign in with Keycloak'}
    </button>
  );
}

