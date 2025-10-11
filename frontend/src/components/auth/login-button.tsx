"use client";

import { signIn } from "next-auth/react";

interface LoginButtonProps {
  idpHint?: string;
}

export function LoginButton({ idpHint }: LoginButtonProps) {
  const handleLogin = () => {
    signIn("keycloak", { 
      callbackUrl: "/dashboard",
      ...(idpHint && { kc_idp_hint: idpHint })
    });
  };

  return (
    <button
      type="button"
      onClick={handleLogin}
      className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
    >
      Sign in with Keycloak
    </button>
  );
}

