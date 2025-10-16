'use client';

interface User {
  name?: string | null;
  clearance?: string | null;
  countryOfAffiliation?: string | null;
  acpCOI?: string[] | null;
}

interface ProfileBadgeProps {
  user: User;
}

// Convert ISO 3166-1 alpha-3 country code to flag emoji
function getCountryFlag(countryCode: string | null | undefined): string {
  if (!countryCode) return '🏳️';
  
  const alpha3ToAlpha2: Record<string, string> = {
    'USA': 'US',
    'FRA': 'FR',
    'CAN': 'CA',
    'GBR': 'GB',
    'DEU': 'DE',
    'ITA': 'IT',
    'ESP': 'ES',
    'POL': 'PL',
    'NLD': 'NL',
    'BEL': 'BE',
    'NOR': 'NO',
    'DNK': 'DK',
  };
  
  const alpha2 = alpha3ToAlpha2[countryCode.toUpperCase()];
  if (!alpha2) return '🏳️';
  
  // Convert alpha-2 to flag emoji using regional indicator symbols
  const codePoints = alpha2
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function ProfileBadge({ user }: ProfileBadgeProps) {
  return (
    <div className="p-6 rounded-2xl bg-white shadow-lg border-2 border-gray-200 animate-fade-in-up w-full" style={{ animationDelay: '100ms' }}>
      {/* Top gradient accent */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#4396ac] to-[#90d56a] rounded-t-2xl" />
      
      <div className="flex items-start space-x-5">
        {/* Animated Avatar */}
        <div className="relative flex-shrink-0">
          <div className="absolute inset-0 bg-gradient-to-br from-[#4396ac] to-[#90d56a] rounded-full blur-md animate-pulse" />
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-[#4396ac] to-[#90d56a] flex items-center justify-center shadow-lg">
            <span className="text-4xl">👤</span>
          </div>
          {/* Status indicator */}
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 border-3 border-white flex items-center justify-center shadow-md">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        {/* Profile Info - Expanded */}
        <div className="flex-1 min-w-0">
          {/* Name, Status, Clearance, Country - All inline */}
          <div className="flex items-center flex-wrap gap-2 mb-3">
            <h3 className="text-xl font-bold text-gray-900">
              {user.name || 'User'}
            </h3>
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-green-100 border border-green-300">
              <div className="w-2 h-2 rounded-full bg-green-500 mr-1.5 animate-pulse" />
              <span className="text-xs font-bold text-green-700 uppercase tracking-wide">Active</span>
            </span>
            
            {/* Clearance Badge with Tooltip */}
            <span 
              className="group/clearance relative inline-flex items-center px-3 py-1 rounded-lg bg-blue-50 border border-blue-200 cursor-help"
              title="Your security clearance level determines which classification levels you can access"
            >
              <span className="text-sm font-bold text-blue-900">{user.clearance || 'Not Set'}</span>
              {/* Tooltip */}
              <span className="invisible group-hover/clearance:visible absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-10">
                Security clearance level for classified access
                <span className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></span>
              </span>
            </span>
            
            {/* Country Badge with Real Flag and Tooltip */}
            <span 
              className="group/country relative inline-flex items-center px-3 py-1 rounded-lg bg-green-50 border border-green-200 cursor-help"
              title="Your country of affiliation determines releasability permissions"
            >
              <span className="text-lg mr-1.5">{getCountryFlag(user.countryOfAffiliation)}</span>
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

