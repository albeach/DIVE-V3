"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

/**
 * IdP Selector Component - Dynamic with Enable/Disable Support
 * 
 * Fetches enabled IdPs from Keycloak and displays them dynamically.
 * When admin enables/disables IdPs, this list updates automatically.
 */

interface IdPOption {
  alias: string;
  displayName: string;
  protocol: string;
  enabled: boolean;
}

// Flag mapping for known IdPs
const getFlagForIdP = (alias: string): string => {
  if (alias.includes('us') || alias.includes('dod')) return '🇺🇸';
  if (alias.includes('france') || alias.includes('fra')) return '🇫🇷';
  if (alias.includes('canada') || alias.includes('can')) return '🇨🇦';
  if (alias.includes('germany') || alias.includes('deu')) return '🇩🇪';
  if (alias.includes('uk') || alias.includes('gbr')) return '🇬🇧';
  if (alias.includes('industry') || alias.includes('contractor')) return '🏢';
  return '🌐'; // Default globe icon
};

export function IdpSelector() {
  const [idps, setIdps] = useState<IdPOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEnabledIdPs();
  }, []);

  const fetchEnabledIdPs = async () => {
    try {
      // Fetch public list of enabled IdPs from backend
      // Note: This endpoint should be public or use a different auth method
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/idps/public`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch IdPs');
      }

      const data = await response.json();
      
      // Filter to only enabled IdPs
      const enabledIdps = data.idps?.filter((idp: IdPOption) => idp.enabled) || [];
      setIdps(enabledIdps);
    } catch (err) {
      console.error('Error fetching IdPs:', err);
      setError('Unable to load identity providers');
      
      // Fallback to hardcoded IdPs if fetch fails
      setIdps([
        { alias: 'canada-idp', displayName: 'Canada', protocol: 'oidc', enabled: true },
        { alias: 'france-idp', displayName: 'France', protocol: 'saml', enabled: true },
        { alias: 'industry-idp', displayName: 'Industry Partner', protocol: 'oidc', enabled: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleIdpClick = (idpAlias?: string) => {
    // NextAuth v5 signIn with authorization params
    signIn("keycloak", {
      callbackUrl: "/dashboard",
      redirect: true,
    }, 
    // Authorization params - passed to Keycloak
    idpAlias ? { kc_idp_hint: idpAlias } : undefined
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="ml-4 text-gray-600">Loading identity providers...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchEnabledIdPs}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (idps.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600 mb-4">No identity providers are currently available.</p>
        <p className="text-sm text-gray-500">Please contact your administrator.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {idps.map((idp) => (
          <button
            key={idp.alias}
            onClick={() => handleIdpClick(idp.alias)}
            className="group p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-lg transition-all duration-200 text-left"
          >
            <div className="flex items-center space-x-4">
              <div className="text-4xl">{getFlagForIdP(idp.alias)}</div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
                  {idp.displayName}
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  {idp.protocol.toUpperCase()} • {idp.alias}
                </p>
              </div>
              <div className="flex-shrink-0">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                  Active
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-6 text-center text-sm text-gray-500">
        <p>Showing {idps.length} active identity provider{idps.length !== 1 ? 's' : ''}</p>
      </div>
    </>
  );
}

