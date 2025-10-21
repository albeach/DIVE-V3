'use client';

import { getPseudonymFromUser } from '@/lib/pseudonym-generator';

interface User {
  uniqueID?: string | null;
  name?: string | null;  // Real name from IdP (DO NOT DISPLAY - PII minimization)
  email?: string | null;
  clearance?: string | null;
  countryOfAffiliation?: string | null;
  acpCOI?: string[] | null;
}

interface CompactProfileProps {
  user: User;
}

export function CompactProfile({ user }: CompactProfileProps) {
  return (
    <div className="rounded-2xl bg-white p-8 shadow-xl border-2 border-gray-200 animate-fade-in-up relative overflow-hidden">
      {/* Gradient accent border - prominent */}
      <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-r from-[#4396ac] via-[#6cb38b] to-[#90d56a]" />
      
      {/* Header */}
      <div className="mb-6 relative pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#4396ac] to-[#90d56a] flex items-center justify-center mr-4 shadow-lg">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Your Security Profile
              </h2>
              <div className="flex items-center text-sm text-gray-500">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse mr-2"></span>
                Active Security Attributes
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Two Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Column 1: Security Profile */}
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
            Security Profile
          </h3>
          
          <dl className="space-y-4">
            <div>
              <dt className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide flex items-center">
                Display Name
                <span className="ml-2 text-xs text-gray-400 normal-case" title="ACP-240 Section 6.2: PII minimization - pseudonym derived from UUID">
                  (Pseudonym)
                </span>
              </dt>
              <dd className="text-base font-bold text-gray-900">
                <span className="inline-flex items-center px-4 py-2 rounded-lg bg-cyan-50 border border-cyan-200 text-cyan-900">
                  {getPseudonymFromUser(user as any)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide">Clearance Level</dt>
              <dd className="text-base font-bold text-gray-900">
                <span className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
                  {user.clearance || 'Not Set'}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide">Country</dt>
              <dd className="text-base font-bold text-gray-900">
                <span className="inline-flex items-center px-4 py-2 rounded-lg bg-green-50 border border-green-200 text-green-900">
                  {user.countryOfAffiliation || 'Not Set'}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide">Communities of Interest</dt>
              <dd className="text-base font-bold text-gray-900">
                <span className="inline-flex items-center px-4 py-2 rounded-lg bg-purple-50 border border-purple-200 text-purple-900 truncate">
                  {user.acpCOI && user.acpCOI.length > 0 
                    ? user.acpCOI.join(', ')
                    : 'None'}
                </span>
              </dd>
            </div>
          </dl>
        </div>

        {/* Column 2: IdP Profile */}
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
            Identity Provider
          </h3>
          
          <dl className="space-y-4">
            <div>
              <dt className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide">Provider Name</dt>
              <dd className="text-base font-bold text-gray-900">
                <span className="inline-flex items-center px-4 py-2 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 truncate max-w-full">
                  Keycloak Federation
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide">Provider Country</dt>
              <dd className="text-base font-bold text-gray-900">
                <span className="inline-flex items-center px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 truncate max-w-full">
                  Coming Soon
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide">Administrator</dt>
              <dd className="text-base font-bold text-gray-900">
                <span className="inline-flex items-center px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 truncate max-w-full">
                  Coming Soon
                </span>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

