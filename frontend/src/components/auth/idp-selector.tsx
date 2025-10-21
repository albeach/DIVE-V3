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
  // Match specific patterns (order matters - check specific before generic)
  if (alias.includes('germany') || alias.includes('deu')) return '🇩🇪';
  if (alias.includes('france') || alias.includes('fra')) return '🇫🇷';
  if (alias.includes('canada') || alias.includes('can')) return '🇨🇦';
  if (alias.includes('uk') || alias.includes('gbr')) return '🇬🇧';
  if (alias.includes('industry') || alias.includes('contractor')) return '🏢';
  // Check for US last (since "industry" doesn't contain "us")
  if (alias.includes('us-') || alias.includes('dod') || alias.includes('-us')) return '🇺🇸';
  
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
      <div className="flex justify-center items-center py-16">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-[#009ab3]"></div>
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-b-[#79d85a] animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1s' }}></div>
        </div>
        <p className="ml-4 text-gray-600 font-medium">Loading identity providers...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 px-6 bg-red-50 rounded-xl border-2 border-red-200">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-red-600 font-semibold mb-4">{error}</p>
        <button
          onClick={fetchEnabledIdPs}
          className="px-6 py-3 bg-gradient-to-r from-[#009ab3] to-[#79d85a] text-white font-bold rounded-lg hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
        >
          Retry
        </button>
      </div>
    );
  }

  if (idps.length === 0) {
    return (
      <div className="text-center py-12 px-6 bg-gray-50 rounded-xl border-2 border-gray-200">
        <div className="text-4xl mb-4">🔒</div>
        <p className="text-gray-700 font-semibold mb-2">No identity providers are currently available.</p>
        <p className="text-sm text-gray-500">Please contact your administrator.</p>
      </div>
    );
  }

  return (
    <>
      {/* Federated Identity Providers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {idps.map((idp) => (
          <button
            key={idp.alias}
            onClick={() => handleIdpClick(idp.alias)}
            className="group p-6 border-2 border-gray-200 rounded-xl hover:border-[#79d85a] hover:shadow-xl transition-all duration-300 hover:-translate-y-1 text-left bg-gradient-to-br from-white to-gray-50"
          >
            <div className="flex items-center space-x-4">
              <div className="text-5xl group-hover:scale-110 transition-transform duration-300">{getFlagForIdP(idp.alias)}</div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 group-hover:text-[#009ab3] transition-colors">
                  {idp.displayName}
                </h3>
                <p className="text-xs text-gray-500 mt-1 font-medium">
                  {idp.protocol.toUpperCase()} • {idp.alias}
                </p>
              </div>
              <div className="flex-shrink-0">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#009ab3] to-[#79d85a] text-white text-xs font-bold rounded-full shadow-md">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                  Active
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Direct Keycloak Login - Super Admin Access */}
      <div className="mt-8 pt-8 border-t-2 border-gray-200">
        <button
          onClick={() => handleIdpClick(undefined)}
          className="group w-full p-6 border-2 border-[#009ab3] bg-gradient-to-br from-[#009ab3]/5 to-[#79d85a]/5 rounded-xl hover:border-[#79d85a] hover:shadow-xl transition-all duration-300 hover:-translate-y-1 text-center"
        >
          <div className="flex items-center justify-center space-x-4">
            <div className="text-4xl group-hover:scale-110 transition-transform duration-300">👑</div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 group-hover:text-[#009ab3] transition-colors">
                Login as Super Administrator
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Click to proceed...
              </p>
            </div>
          </div>
        </button>
      </div>

      <div className="mt-6 text-center text-sm text-gray-500">
        <p>Showing {idps.length} federated identity provider{idps.length !== 1 ? 's' : ''}</p>
      </div>
    </>
  );
}

