"use client";

import { signIn } from "next-auth/react";

/**
 * IdP Selector Component - Week 3 Multi-IdP Support
 * 
 * Provides buttons for selecting identity provider with proper kc_idp_hint forwarding.
 * Uses NextAuth v5 signIn function with authorization params for Keycloak IdP broker.
 */

const idpOptions = [
  {
    id: "us",
    name: "U.S. DoD",
    subtitle: "Department of Defense",
    protocol: "OIDC • CAC/PKI",
    flag: "🇺🇸",
    hint: undefined, // No hint = default dive-v3-pilot login
  },
  {
    id: "france",
    name: "France",
    subtitle: "Ministry of Defense",
    protocol: "SAML • FranceConnect",
    flag: "🇫🇷",
    hint: "france-idp",
  },
  {
    id: "canada",
    name: "Canada",
    subtitle: "Dep't of National Defence",
    protocol: "OIDC • GCKey",
    flag: "🇨🇦",
    hint: "canada-idp",
  },
  {
    id: "industry",
    name: "Industry Partner",
    subtitle: "Approved Contractors",
    protocol: "OIDC • Azure AD / Okta",
    flag: "🏢",
    hint: "industry-idp",
  },
];

export function IdpSelector() {
  const handleIdpClick = (idpHint?: string) => {
    // NextAuth v5 signIn with authorization params
    signIn("keycloak", {
      callbackUrl: "/dashboard",
      redirect: true,
    }, 
    // Authorization params - passed to Keycloak
    idpHint ? { kc_idp_hint: idpHint } : undefined
    );
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {idpOptions.map((idp) => (
          <button
            key={idp.id}
            onClick={() => handleIdpClick(idp.hint)}
            className="group p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-lg transition-all duration-200 text-left"
          >
            <div className="flex items-center space-x-4">
              <div className="text-4xl">{idp.flag}</div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
                  {idp.name}
                </h3>
                <p className="text-sm text-gray-500">{idp.subtitle}</p>
                <p className="text-xs text-gray-400 mt-1">{idp.protocol}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-6 text-center">
        <button
          onClick={() => handleIdpClick()}
          className="text-blue-600 hover:text-blue-800 text-sm underline"
        >
          Continue without selecting (default login)
        </button>
      </div>
    </>
  );
}

