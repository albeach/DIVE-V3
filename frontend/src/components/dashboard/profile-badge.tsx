'use client';

import { getPseudonymFromUser } from '@/lib/pseudonym-generator';
import { getCountryFlagComponent } from '@/components/ui/flags';
import { getLocalizedClearance, usesLocalizedClearance } from '@/utils/clearance-localization';
import { CountryAvatar } from '@/components/ui/country-avatar';

interface User {
  uniqueID?: string | null;
  name?: string | null;
  email?: string | null;
  clearance?: string | null;
  countryOfAffiliation?: string | null;
  acpCOI?: string[] | null;
}

interface ProfileBadgeProps {
  user: User;
  isFederated?: boolean;
}

export function ProfileBadge({ user, isFederated = false }: ProfileBadgeProps) {
  const country = user.countryOfAffiliation || 'USA';

  return (
    <div className="relative p-6 rounded-2xl bg-white shadow-lg border-2 border-gray-200 animate-fade-in-up w-full" style={{ animationDelay: '100ms' }}>
      {/* Top gradient accent - changes based on federation status */}
      <div className={`absolute top-0 left-0 right-0 h-1.5 rounded-t-2xl ${
        isFederated
          ? 'bg-gradient-to-r from-amber-500 to-orange-500'
          : 'bg-gradient-to-r from-emerald-500 to-teal-500'
      }`} />

      <div className="flex items-start space-x-5">
        {/* Country Avatar - replaces generic emoji */}
        <div className="flex-shrink-0">
          <CountryAvatar
            countryCode={country}
            size="md"
            clearance={user.clearance || undefined}
            isFederated={isFederated}
            showStatus={true}
          />
        </div>

        {/* Profile Info - Expanded */}
        <div className="flex-1 min-w-0">
          {/* Name (Pseudonym), Status, Clearance, Country - All inline */}
          {/* ACP-240 Section 6.2: Display ocean pseudonym from Keycloak token (PII minimization)
               FIX #4: getPseudonymFromUser() now reads firstName+lastName from token
               (set by Keycloak with ocean pseudonyms), falling back to uniqueID hash */}
          <div className="flex items-center flex-wrap gap-2 mb-3">
            <h3 className="text-xl font-bold text-gray-900">
              {getPseudonymFromUser(user as any)}
            </h3>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg border ${
              isFederated
                ? 'bg-amber-100 border-amber-300'
                : 'bg-green-100 border-green-300'
            }`}>
              <div className={`w-2 h-2 rounded-full mr-1.5 animate-pulse ${
                isFederated ? 'bg-amber-500' : 'bg-green-500'
              }`} />
              <span className={`text-xs font-bold uppercase tracking-wide ${
                isFederated ? 'text-amber-700' : 'text-green-700'
              }`}>
                {isFederated ? 'Federated' : 'Active'}
              </span>
            </span>

            {/* Clearance Badge with Tooltip - Localized for USER'S country, not instance */}
            <span
              className="group/clearance relative inline-flex items-center px-3 py-1 rounded-lg bg-blue-50 border border-blue-200 cursor-help"
              title={`Your security clearance level determines which classification levels you can access${usesLocalizedClearance(country) ? ` (${user.clearance})` : ''}`}
            >
              <span className="text-sm font-bold text-blue-900">
                {getLocalizedClearance(user.clearance, country)}
              </span>
              {/* Tooltip - shows normalized value if localized */}
              <span className="invisible group-hover/clearance:visible absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-10">
                {usesLocalizedClearance(country)
                  ? `${user.clearance || 'Not Set'} (NATO Standard)`
                  : 'Security clearance level for classified access'
                }
                <span className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></span>
              </span>
            </span>

            {/* Country Badge with SVG Flag and Tooltip */}
            <span
              className="group/country relative inline-flex items-center px-3 py-1 rounded-lg bg-green-50 border border-green-200 cursor-help"
              title="Your country of affiliation determines releasability permissions"
            >
              <span className="mr-1.5 flex items-center">
                {(() => {
                  const FlagComponent = getCountryFlagComponent(user.countryOfAffiliation);
                  return <FlagComponent size={20} />;
                })()}
              </span>
              <span className="text-sm font-bold text-green-900">{user.countryOfAffiliation || 'Not Set'}</span>
              {/* Tooltip */}
              <span className="invisible group-hover/country:visible absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-10">
                Country affiliation for releasability checks
                <span className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></span>
              </span>
            </span>
          </div>

          {/* COI - Inline with text label and separate badges */}
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">COI:</span>
            {user.acpCOI && user.acpCOI.length > 0 ? (
              user.acpCOI.map((coi, index) => (
                <span
                  key={index}
                  className="group/coi relative inline-flex items-center px-3 py-1 rounded-lg bg-purple-50 border border-purple-200 cursor-help"
                  title={`Community of Interest: ${coi}`}
                >
                  <span className="text-sm font-bold text-purple-900">{coi}</span>
                  {/* Tooltip */}
                  <span className="invisible group-hover/coi:visible absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-10">
                    Community of Interest membership
                    <span className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></span>
                  </span>
                </span>
              ))
            ) : (
              <span className="inline-flex items-center px-3 py-1 rounded-lg bg-gray-50 border border-gray-200">
                <span className="text-sm font-bold text-gray-500">None</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
