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
  if (alias.includes('italy') || alias.includes('ita')) return '🇮🇹';
  if (alias.includes('spain') || alias.includes('esp')) return '🇪🇸';
  if (alias.includes('poland') || alias.includes('pol')) return '🇵🇱';
  if (alias.includes('netherlands') || alias.includes('nld')) return '🇳🇱';
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
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
      console.log('[IdP Selector] Fetching from:', `${backendUrl}/api/idps/public`);
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`${backendUrl}/api/idps/public`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch IdPs: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[IdP Selector] Received IdPs:', data);
      
      // Filter to only enabled IdPs
      const enabledIdps = data.idps?.filter((idp: IdPOption) => idp.enabled) || [];
      setIdps(enabledIdps);
      setError(null); // Clear any previous errors
    } catch (err) {
      console.error('[IdP Selector] Error fetching IdPs:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unable to load identity providers';
      setError(errorMessage);
      
      // Fallback to hardcoded IdPs if fetch fails
      console.warn('[IdP Selector] Using fallback IdPs');
      setIdps([
        { alias: 'usa-realm-broker', displayName: 'United States (DoD)', protocol: 'oidc', enabled: true },
        { alias: 'can-realm-broker', displayName: 'Canada (Forces canadiennes)', protocol: 'oidc', enabled: true },
        { alias: 'fra-realm-broker', displayName: 'France (Ministère des Armées)', protocol: 'oidc', enabled: true },
        { alias: 'industry-realm-broker', displayName: 'Industry Partners', protocol: 'oidc', enabled: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleIdpClick = async (idp: IdPOption) => {
    // Phase 4.1: ALL IdPs use custom login pages
    // Route to: /login/[idpAlias] with themed UI
    window.location.href = `/login/${idp.alias}?redirect_uri=/dashboard`;
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
            onClick={() => handleIdpClick(idp)}
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
          onClick={() => handleIdpClick({ alias: 'dive-v3-broker', displayName: 'Super Admin', protocol: 'oidc', enabled: true })}
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

