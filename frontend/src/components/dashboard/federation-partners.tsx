'use client';

import { useEffect, useState } from 'react';

interface IdP {
  alias: string;
  displayName: string;
  protocol: 'oidc' | 'saml';
  enabled: boolean;
}

const protocolColors = {
  oidc: 'from-blue-500 to-indigo-600',
  saml: 'from-purple-500 to-pink-600',
};

const protocolBadgeColors = {
  oidc: 'bg-blue-100 text-blue-700 border-blue-300',
  saml: 'bg-purple-100 text-purple-700 border-purple-300',
};

export function FederationPartners() {
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
        setIdps(data.idps || []);
      } catch (err) {
        console.error('Error fetching IdPs:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchIdPs();
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 p-8 shadow-lg animate-pulse">
        <div className="h-6 w-48 bg-slate-200 rounded mb-4" />
        <div className="h-4 w-full bg-slate-200 rounded mb-6" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-slate-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-red-50 to-orange-50 p-8 shadow-lg border border-red-200">
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
    <div className="rounded-2xl bg-white p-8 shadow-xl border-2 border-gray-200 animate-fade-in-up relative overflow-hidden" style={{ animationDelay: '100ms' }}>
      {/* Gradient accent border - prominent */}
      <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-r from-[#4396ac] via-[#6cb38b] to-[#90d56a]" />
      
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #4396ac 1px, transparent 0)', backgroundSize: '24px 24px' }} />
      
      {/* Header */}
      <div className="mb-8 relative">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#4396ac] to-[#90d56a] flex items-center justify-center mr-4 shadow-lg">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">
                Trusted Federation Partners
              </h2>
              <div className="flex items-center text-sm text-gray-500">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-2"></span>
                {idps.length} Active {idps.length === 1 ? 'Partner' : 'Partners'}
              </div>
            </div>
          </div>
          
          {/* Attention badge */}
          <div className="hidden sm:block px-3 py-1.5 rounded-full bg-gradient-to-r from-[#4396ac] to-[#90d56a] text-white text-xs font-bold uppercase tracking-wider shadow-lg animate-bounce-subtle">
            Important
          </div>
        </div>
        
        <div className="bg-blue-50 border-l-4 border-[#4396ac] p-4 rounded-r-lg">
          <p className="text-sm text-gray-700 leading-relaxed font-medium">
            <span className="font-bold text-[#4396ac]">🔒 Security Notice:</span> When you classify and upload documents, 
            users from these identity providers <strong>may</strong> access your resources if they have matching security 
            attributes: <span className="font-semibold">Clearance</span>, <span className="font-semibold">Country</span>, 
            and <span className="font-semibold">Communities of Interest (COI)</span>.
          </p>
        </div>
      </div>

      {/* Partners Grid */}
      {idps.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <svg className="w-20 h-20 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <p className="font-semibold text-lg">No federation partners configured</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 relative">
          {idps.map((idp, index) => (
            <div
              key={idp.alias}
              className="group relative rounded-lg bg-white p-3 shadow-sm border border-gray-200 hover:shadow-md hover:border-[#4396ac] transition-all duration-300 hover:-translate-y-1 animate-scale-in overflow-hidden"
              style={{ animationDelay: `${200 + index * 75}ms` }}
            >
              {/* Gradient accent bar - custom theme */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#4396ac] to-[#90d56a]" />
              
              {/* Protocol badge */}
              <div className="flex items-center justify-between mb-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${protocolBadgeColors[idp.protocol]} uppercase`}>
                  {idp.protocol}
                </span>
                
                {/* Active indicator */}
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs font-medium text-green-600">Active</span>
                </div>
              </div>
              
              {/* IdP Name */}
              <p className="text-sm font-bold text-gray-900 group-hover:text-[#4396ac] transition-colors duration-200 mb-1 leading-tight">
                {idp.displayName}
              </p>
              
              {/* Description hint */}
              <p className="text-xs text-gray-500">
                Federated identity provider
              </p>
              
              {/* Hover effect - subtle gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#4396ac]/5 to-[#90d56a]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* Info footer */}
      <div className="mt-8 pt-6 border-t-2 border-gray-200">
        <div className="flex items-start text-sm text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <svg className="w-5 h-5 mr-3 mt-0.5 text-[#4396ac] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="leading-relaxed font-medium mb-2">
              <strong className="font-bold text-gray-900">Authorization is Attribute-Based (ABAC):</strong>
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Users from these partners must have matching <span className="font-semibold text-gray-800">clearance levels</span>, 
              <span className="font-semibold text-gray-800"> country affiliation</span>, and 
              <span className="font-semibold text-gray-800"> Communities of Interest (COI)</span> to access resources. 
              All decisions are evaluated in real-time by the OPA Policy Decision Point.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

