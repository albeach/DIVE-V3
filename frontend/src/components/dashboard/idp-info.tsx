'use client';

import { useEffect, useState } from 'react';

interface User {
  uniqueID?: string | null;
  countryOfAffiliation?: string | null;
}

interface IdpInfoProps {
  user: User;
}

interface IdPDetails {
  alias: string;
  displayName: string;
  protocol: 'oidc' | 'saml';
  enabled: boolean;
  country?: string;
  administrator?: string;
}

// Map country codes to flag emojis
function getCountryFlag(countryCode: string | null | undefined): string {
  if (!countryCode) return '🌐';
  
  const alpha3ToAlpha2: Record<string, string> = {
    'USA': 'US', 'FRA': 'FR', 'CAN': 'CA', 'GBR': 'GB', 'DEU': 'DE',
    'ITA': 'IT', 'ESP': 'ES', 'POL': 'PL', 'NLD': 'NL', 'BEL': 'BE',
    'NOR': 'NO', 'DNK': 'DK',
  };
  
  const alpha2 = alpha3ToAlpha2[countryCode.toUpperCase()];
  if (!alpha2) return '🌐';
  
  const codePoints = alpha2.split('').map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function IdpInfo({ user }: IdpInfoProps) {
  const [userIdP, setUserIdP] = useState<IdPDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUserIdP() {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
        const response = await fetch(`${backendUrl}/api/idps/public`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch IdP info');
        }

        const data = await response.json();
        const idps: IdPDetails[] = data.idps || [];
        
        // Map countryOfAffiliation to IdP aliases
        const countryToIdPAlias: Record<string, string> = {
          'USA': 'usa-realm-broker',
          'FRA': 'france-realm-broker',
          'CAN': 'canada-realm-broker',
          // Industry users typically have USA country from email enrichment
        };
        
        // First try to match by country alias mapping
        const userCountry = user.countryOfAffiliation?.toUpperCase();
        let matchedIdP: IdPDetails | null = null;
        
        if (userCountry && countryToIdPAlias[userCountry]) {
          matchedIdP = idps.find(idp => idp.alias === countryToIdPAlias[userCountry]) || null;
        }
        
        // Fallback: If no match by alias, try matching display name with country
        if (!matchedIdP && userCountry) {
          // Map ISO 3166 alpha-3 to common display name patterns
          const countryDisplayNames: Record<string, string[]> = {
            'USA': ['united states', 'u.s.', 'usa', 'us dod', 'dod'],
            'FRA': ['france', 'french', 'fra'],
            'CAN': ['canada', 'canadian', 'can'],
            'GBR': ['britain', 'united kingdom', 'uk', 'gbr'],
          };
          
          const searchTerms = countryDisplayNames[userCountry] || [userCountry.toLowerCase()];
          matchedIdP = idps.find(idp => 
            searchTerms.some(term => idp.displayName.toLowerCase().includes(term))
          ) || null;
        }
        
        // Final fallback: Use first IdP if none matched
        if (!matchedIdP && idps.length > 0) {
          matchedIdP = idps[0];
        }
        
        setUserIdP(matchedIdP);
      } catch (err) {
        console.error('Error fetching user IdP:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchUserIdP();
  }, [user.countryOfAffiliation]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 p-6 shadow-lg border-2 border-purple-200 animate-pulse">
        <div className="flex items-start space-x-4">
          <div className="w-14 h-14 bg-purple-200 rounded-2xl" />
          <div className="flex-1 space-y-3">
            <div className="h-6 bg-purple-200 rounded w-1/2" />
            <div className="h-4 bg-purple-200 rounded w-3/4" />
            <div className="h-4 bg-purple-200 rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group rounded-2xl bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 p-6 shadow-lg border-2 border-purple-200 hover:border-purple-300 transition-all duration-500 animate-fade-in-up relative overflow-hidden" style={{ animationDelay: '100ms' }}>
      {/* Animated gradient border */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-400 via-pink-400 to-rose-400 animate-gradient-x opacity-20" />
      </div>

      {/* Floating particles effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute w-2 h-2 bg-purple-400 rounded-full top-4 right-1/4 animate-float opacity-40" style={{ animationDelay: '0.5s' }} />
        <div className="absolute w-1.5 h-1.5 bg-pink-400 rounded-full top-8 left-1/3 animate-float opacity-40" style={{ animationDelay: '1.5s' }} />
        <div className="absolute w-2 h-2 bg-rose-400 rounded-full bottom-6 right-2/3 animate-float opacity-40" style={{ animationDelay: '2.5s' }} />
      </div>

      <div className="relative z-10">
        <div className="flex items-start space-x-4">
          {/* Animated Icon */}
          <div className="flex-shrink-0">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-400 to-rose-500 rounded-2xl blur-lg animate-pulse opacity-50" />
              <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-rose-600 flex items-center justify-center shadow-lg transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                </svg>
              </div>
              {/* Pulse ring */}
              <div className="absolute inset-0 rounded-2xl border-2 border-purple-400 animate-ping opacity-20" />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-gray-900 flex items-center">
                <span className="mr-2">🔐</span>
                Your Identity Provider
              </h3>
              {userIdP && (
                <span className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full ${
                  userIdP.protocol === 'oidc' 
                    ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                    : 'bg-purple-100 text-purple-700 border border-purple-300'
                }`}>
                  {userIdP.protocol}
                </span>
              )}
            </div>

            {/* IdP Details */}
            {userIdP ? (
              <div className="space-y-3">
                <div className="flex items-center space-x-2 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
                    <span className="text-lg">{getCountryFlag(user.countryOfAffiliation)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{userIdP.displayName}</p>
                    <p className="text-xs text-gray-600">Provider Name</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Federation Broker</p>
                    <p className="text-xs text-gray-600">Authentication Method</p>
                  </div>
                </div>

                <div className="pt-3 border-t-2 border-white/50 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
                  <div className="flex items-start space-x-2 text-xs text-gray-700">
                    <svg className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <p className="leading-relaxed">
                      Your identity attributes are normalized by Keycloak and used for <span className="font-semibold">attribute-based access control</span> across the federation.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600">Unable to determine your identity provider.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

