"use client";

import Link from "next/link";

interface LoginButtonProps {
  idpHint?: string;
}

export function LoginButton({ idpHint }: LoginButtonProps) {
  const href = idpHint
    ? `/api/auth/signin/keycloak?callbackUrl=/dashboard&kc_idp_hint=${idpHint}`
    : "/api/auth/signin/keycloak?callbackUrl=/dashboard";

  return (
    <Link
      href={href}
      className="block w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg text-center"
    >
      {idpHint 
        ? `Sign in with ${idpHint.replace('-idp', '').toUpperCase()}`
        : 'Sign in with Keycloak'}
    </Link>
  );
}

