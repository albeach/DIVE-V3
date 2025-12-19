'use client';

import { useEffect, useState } from 'react';

interface IdP {
  alias: string;
  displayName: string;
  protocol: 'oidc' | 'saml';
  enabled: boolean;
}

interface User {
  countryOfAffiliation?: string | null;
}

interface FederationPartnersRevampedProps {
  user: User;
}

// Consolidated style classes
const styles = {
  protocolIcon: "w-10 h-10 rounded-xl flex items-center justify-center shadow-md transform group-hover/card:scale-110 transition-transform duration-300",
  protocolColors: {
    oidc: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    saml: 'bg-gradient-to-br from-purple-500 to-pink-600',
  },
  card: "group/card relative rounded-xl bg-white p-3 shadow-md border-2 border-gray-200 hover:border-emerald-400 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden",
  statusDot: "w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse",
  headerIcon: "relative w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shadow-lg transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 mr-4",
  container: "group rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 p-8 shadow-lg border-2 border-emerald-200 hover:border-emerald-300 transition-all duration-500 animate-fade-in-up relative overflow-hidden",
};

export function FederationPartnersRevamped({ user }: FederationPartnersRevampedProps) {
  const [idps, setIdps] = useState<IdP[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchIdPs() {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';
        const response = await fetch(`${backendUrl}/api/idps/public`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch identity providers');
        }

        const data = await response.json();
        const allIdps: IdP[] = data.idps || [];
        setIdps(allIdps);
      } catch (err) {
        console.error('Error fetching IdPs:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchIdPs();
  }, [user.countryOfAffiliation]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 p-8 shadow-lg border-2 border-emerald-200 animate-pulse">
        <div className="h-6 w-64 bg-emerald-200 rounded mb-4" />
        <div className="h-4 w-full bg-emerald-200 rounded mb-6" />
        <div className="space-y-3">
          <div className="h-20 bg-emerald-200 rounded-xl" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-emerald-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-red-50 to-orange-50 p-8 shadow-lg border-2 border-red-200">
        <h3 className="text-xl font-bold text-red-900 mb-2 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Unable to Load Partners
        </h3>
        <p className="text-sm text-red-700">
          Could not fetch federation partners. Please try again later.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container} style={{ animationDelay: '200ms' }}>
      {/* Animated gradient border */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 animate-gradient-x opacity-20" />
      </div>

      {/* Floating particles effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute w-2 h-2 bg-emerald-400 rounded-full top-4 left-1/4 animate-float opacity-40" style={{ animationDelay: '0s' }} />
        <div className="absolute w-1.5 h-1.5 bg-teal-400 rounded-full top-8 right-1/3 animate-float opacity-40" style={{ animationDelay: '1s' }} />
        <div className="absolute w-2 h-2 bg-cyan-400 rounded-full bottom-6 left-2/3 animate-float opacity-40" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-2xl blur-lg animate-pulse opacity-50" />
              <div className={styles.headerIcon}>
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
              </div>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-2 flex flex-wrap items-center gap-2">
                <span>🌍 Federation Network</span>
                <span className="flex items-center text-sm text-gray-600 font-normal">
                  <span className={`${styles.statusDot} mr-2`}></span>
                  {idps.length} Active {idps.length === 1 ? 'Partner' : 'Partners'}
                </span>
              </h2>
            </div>
          </div>
        </div>

        {/* All IdPs - Grid */}
        {idps.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="font-semibold text-base">No partners configured</p>
          </div>
        ) : (
          <div className="animate-fade-in-up" style={{ animationDelay: '300ms' }}>
            <div className="grid grid-cols-2 gap-3">
              {idps.map((idp, index) => (
                <div
                  key={idp.alias}
                  className={styles.card}
                  style={{ animationDelay: `${400 + index * 75}ms` }}
                >
                  {/* Gradient accent bar */}
                  <div className={`absolute top-0 left-0 right-0 h-2 ${styles.protocolColors[idp.protocol]}`} />
                  
                  {/* Active indicator */}
                  <div className="flex items-center justify-end mb-2">
                    <div className="flex items-center space-x-1">
                      <div className={styles.statusDot} />
                      <span className="text-xs font-medium text-green-600">Active</span>
                    </div>
                  </div>

                  {/* Icon */}
                  <div className="flex justify-center mb-2">
                    <div className={`${styles.protocolIcon} ${styles.protocolColors[idp.protocol]}`}>
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                  </div>
                  
                  {/* IdP Name */}
                  <p className="text-xs font-bold text-gray-900 group-hover/card:text-emerald-600 transition-colors duration-200 text-center leading-tight">
                    {idp.displayName}
                  </p>
                  
                  {/* Hover effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/5 to-cyan-400/5 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 pointer-events-none rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-4 pt-4 border-t-2 border-white/50 animate-fade-in-up" style={{ animationDelay: '500ms' }}>
          <div className="bg-gradient-to-r from-emerald-100/50 to-cyan-100/50 backdrop-blur-sm p-4 rounded-xl border border-emerald-200">
            <div className="flex items-start space-x-2">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-md">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-gray-900 mb-1">
                  Cross-Partner Collaboration
                </p>
                <p className="text-xs text-gray-700 leading-relaxed">
                  Users from these partners <strong>may access your documents</strong> if they have matching attributes. All decisions evaluated by OPA.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
