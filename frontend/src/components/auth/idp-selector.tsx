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
      {/* Federated Identity Providers */}
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

      {/* Direct Keycloak Login - Super Admin Access */}
      <div className="mt-6 pt-6 border-t-2 border-yellow-200">
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-lg p-4 mb-4">
          <div className="text-center">
            <div className="inline-block px-3 py-1 bg-yellow-500 text-white text-xs font-bold rounded-full mb-2">
              👑 SUPER ADMINISTRATOR ACCESS
            </div>
            <p className="text-sm text-gray-700 font-semibold mb-3">
              Direct Keycloak Login
            </p>
            
            {/* Broker Realm Admin (Preferred) */}
            <div className="bg-white border-2 border-green-300 rounded-md p-3 text-left mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded">
                  ✅ RECOMMENDED (Broker Realm)
                </span>
                <span className="text-xs text-gray-500">dive-v3-broker</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-600 font-medium">Username:</div>
                <div className="text-gray-900 font-mono bg-gray-100 px-2 py-1 rounded">admin-dive</div>
                <div className="text-gray-600 font-medium">Password:</div>
                <div className="text-gray-900 font-mono bg-gray-100 px-2 py-1 rounded">DiveAdmin2025!</div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-600">
                  <span className="font-semibold">Access:</span> TOP_SECRET clearance, Full IdP Management, All COIs
                </p>
              </div>
            </div>

            {/* Legacy Admin (dive-v3-pilot) */}
            <div className="bg-white border border-yellow-200 rounded-md p-3 text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-yellow-700 bg-yellow-100 px-2 py-1 rounded">
                  🔄 LEGACY (Pilot Realm)
                </span>
                <span className="text-xs text-gray-500">dive-v3-pilot</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-600 font-medium">Username:</div>
                <div className="text-gray-900 font-mono bg-gray-100 px-2 py-1 rounded">testuser-us</div>
                <div className="text-gray-600 font-medium">Password:</div>
                <div className="text-gray-900 font-mono bg-gray-100 px-2 py-1 rounded">Password123!</div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-600">
                  <span className="font-semibold">Access:</span> SECRET clearance, NATO-COSMIC & FVEY COI
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-3">
              Other test users: testuser-us-confid (CONFIDENTIAL), testuser-us-unclass (UNCLASSIFIED)
            </p>
          </div>
        </div>
        
        <button
          onClick={() => handleIdpClick(undefined)}
          className="group w-full p-4 border-2 border-yellow-400 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg hover:border-yellow-500 hover:shadow-lg transition-all duration-200 text-center"
        >
          <div className="flex items-center justify-center space-x-3">
            <div className="text-3xl">🔑</div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 group-hover:text-yellow-700">
                Login as Super Administrator
              </h3>
              <p className="text-xs text-gray-600 mt-1">
                Click to proceed to Keycloak login page (use credentials above)
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

