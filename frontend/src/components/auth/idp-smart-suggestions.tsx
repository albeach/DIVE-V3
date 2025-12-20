"use client";

import { useEffect, useState } from 'react';
import { MapPin, Clock, Users } from 'lucide-react';
import { getFlagComponent } from '../ui/flags';

interface IdPOption {
  alias: string;
  displayName: string;
  protocol: string;
  enabled: boolean;
}

interface IdpSmartSuggestionsProps {
  idps: IdPOption[];
  onSelect: (idp: IdPOption) => void;
  instanceCode: string;
}

type SuggestionType = 'geo' | 'recent' | 'alliance';

interface Suggestion {
  type: SuggestionType;
  idp: IdPOption;
  reason: string;
  icon: typeof MapPin;
  badge: string;
  color: string;
}

/**
 * Smart Suggestions Component
 *
 * Features:
 * - Geo-detection based on browser locale
 * - Recently used IdPs from localStorage
 * - Alliance group suggestions (FVEY, NATO Core)
 * - Conditional rendering (hide if no suggestions)
 * - Click to quick-select IdP
 */
export function IdpSmartSuggestions({ idps, onSelect, instanceCode }: IdpSmartSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    const detectedSuggestions: Suggestion[] = [];

    // 1. Geo-detection based on browser locale
    const geoIdp = detectGeoLocation(idps, instanceCode);
    if (geoIdp) {
      detectedSuggestions.push({
        type: 'geo',
        idp: geoIdp,
        reason: 'Detected from your location',
        icon: MapPin,
        badge: 'Recommended',
        color: 'from-blue-500 to-cyan-500',
      });
    }

    // 2. Recently used IdP from localStorage
    const recentIdp = getRecentlyUsedIdP(idps);
    if (recentIdp && recentIdp.alias !== geoIdp?.alias) {
      detectedSuggestions.push({
        type: 'recent',
        idp: recentIdp,
        reason: 'You recently authenticated here',
        icon: Clock,
        badge: 'Recent',
        color: 'from-purple-500 to-pink-500',
      });
    }

    // 3. Alliance suggestion (FVEY or NATO Core)
    const allianceIdp = getAllianceSuggestion(idps, instanceCode, [geoIdp?.alias, recentIdp?.alias].filter(Boolean) as string[]);
    if (allianceIdp) {
      detectedSuggestions.push({
        type: 'alliance',
        idp: allianceIdp,
        reason: 'Common alliance partner',
        icon: Users,
        badge: 'Partner',
        color: 'from-emerald-500 to-teal-500',
      });
    }

    setSuggestions(detectedSuggestions);
  }, [idps, instanceCode]);

  // Don't render if no suggestions
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
      {/* Section Header */}
      <div className="text-center mb-4">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          ✨ Smart Suggestions
        </h3>
        <p className="text-xs text-gray-400 mt-1">
          Quick access based on your context
        </p>
      </div>

      {/* Suggestions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
        {suggestions.map((suggestion, index) => (
          <SuggestionCard
            key={suggestion.idp.alias}
            suggestion={suggestion}
            onSelect={onSelect}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Individual Suggestion Card
 */
function SuggestionCard({
  suggestion,
  onSelect,
  index
}: {
  suggestion: Suggestion;
  onSelect: (idp: IdPOption) => void;
  index: number;
}) {
  const { idp, reason, icon: Icon, badge, color } = suggestion;
  const FlagComponent = getFlagComponent(idp.alias);

  return (
    <button
      onClick={() => onSelect(idp)}
      className="group relative p-4 rounded-2xl border-2 border-gray-200
               hover:border-transparent hover:shadow-2xl transition-all duration-300
               hover:-translate-y-1 bg-white overflow-hidden animate-scale-in"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      {/* Gradient background on hover */}
      <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />

      {/* Glow effect */}
      <div className={`absolute -inset-0.5 bg-gradient-to-r ${color} opacity-0 group-hover:opacity-20 blur rounded-2xl transition-opacity duration-300`} />

      {/* Content */}
      <div className="relative">
        {/* Badge */}
        <div className="flex items-center justify-between mb-3">
          <span className={`px-2 py-1 rounded-full text-xs font-bold text-white bg-gradient-to-r ${color}`}>
            {badge}
          </span>
          <Icon className="text-gray-400 group-hover:text-gray-600 transition-colors" size={16} />
        </div>

        {/* Flag and Country */}
        <div className="flex items-center gap-3 mb-2">
          <div className="group-hover:scale-110 transition-transform duration-300">
            <FlagComponent size={40} />
          </div>
          <div className="text-left flex-1">
            <h4 className="font-bold text-gray-900 text-sm group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:bg-clip-text group-hover:from-[#009ab3] group-hover:to-[#79d85a] transition-all">
              {idp.displayName.replace(/^DIVE V3\s*-?\s*/i, '').split('(')[0].trim()}
            </h4>
            <p className="text-xs text-gray-500">
              {idp.protocol.toUpperCase()}
            </p>
          </div>
        </div>

        {/* Reason */}
        <p className="text-xs text-gray-600 text-left">
          {reason}
        </p>

        {/* Hover indicator */}
        <div className="mt-3 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <span className="text-xs font-medium text-[#009ab3]">
            Click to authenticate →
          </span>
        </div>
      </div>
    </button>
  );
}

/**
 * Detect user's geo-location based on browser locale
 */
function detectGeoLocation(idps: IdPOption[], currentInstance: string): IdPOption | null {
  // Get browser locale (e.g., "en-US", "fr-FR", "de-DE")
  const locale = navigator.language || (navigator as any).userLanguage;

  if (!locale) return null;

  // Extract country code from locale (last 2 characters)
  const countryCode = locale.split('-')[1]?.toUpperCase();

  if (!countryCode) return null;

  // Map 2-letter codes to 3-letter ISO codes
  const codeMap: Record<string, string> = {
    'US': 'USA',
    'GB': 'GBR',
    'FR': 'FRA',
    'DE': 'DEU',
    'IT': 'ITA',
    'CA': 'CAN',
    'ES': 'ESP',
    'PL': 'POL',
    'NL': 'NLD',
    'BE': 'BEL',
    'NO': 'NOR',
    'DK': 'DNK',
    'PT': 'PRT',
    'GR': 'GRC',
    'TR': 'TUR',
    'CZ': 'CZE',
    'HU': 'HUN',
    'RO': 'ROU',
    'BG': 'BGR',
    'SK': 'SVK',
    'SI': 'SVN',
    'HR': 'HRV',
    'AL': 'ALB',
    'ME': 'MNE',
    'EE': 'EST',
    'LV': 'LVA',
    'LT': 'LTU',
    'LU': 'LUX',
    'IS': 'ISL',
    'FI': 'FIN',
    'SE': 'SWE',
    'AU': 'AUS',
    'NZ': 'NZL',
  };

  const iso3Code = codeMap[countryCode] || countryCode;

  // Don't suggest the current instance
  if (iso3Code.toLowerCase() === currentInstance.toLowerCase()) {
    return null;
  }

  // Find matching IdP
  return idps.find(idp =>
    idp.alias.toLowerCase().includes(iso3Code.toLowerCase())
  ) || null;
}

/**
 * Get recently used IdP from localStorage
 */
function getRecentlyUsedIdP(idps: IdPOption[]): IdPOption | null {
  try {
    const recentAlias = localStorage.getItem('dive-recent-idp');
    if (!recentAlias) return null;

    return idps.find(idp => idp.alias === recentAlias) || null;
  } catch {
    return null;
  }
}

/**
 * Save recently used IdP to localStorage
 */
export function saveRecentIdP(alias: string) {
  try {
    localStorage.setItem('dive-recent-idp', alias);
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Get alliance suggestion (FVEY or NATO Core)
 */
function getAllianceSuggestion(
  idps: IdPOption[],
  currentInstance: string,
  excludeAliases: string[]
): IdPOption | null {
  const instanceLower = currentInstance.toLowerCase();

  // FVEY members
  const fveyCountries = ['usa', 'gbr', 'can', 'aus', 'nzl'];

  // NATO Core (original members)
  const natoCore = ['usa', 'gbr', 'fra', 'deu', 'ita', 'can'];

  // If current instance is FVEY, suggest another FVEY partner
  if (fveyCountries.includes(instanceLower)) {
    const fveyIdp = idps.find(idp =>
      fveyCountries.some(c => idp.alias.toLowerCase().includes(c)) &&
      !idp.alias.toLowerCase().includes(instanceLower) &&
      !excludeAliases.includes(idp.alias)
    );
    if (fveyIdp) return fveyIdp;
  }

  // Otherwise, suggest a NATO Core partner
  const natoIdp = idps.find(idp =>
    natoCore.some(c => idp.alias.toLowerCase().includes(c)) &&
    !idp.alias.toLowerCase().includes(instanceLower) &&
    !excludeAliases.includes(idp.alias)
  );

  return natoIdp || null;
}

export default IdpSmartSuggestions;

