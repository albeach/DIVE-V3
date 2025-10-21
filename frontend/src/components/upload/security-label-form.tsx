/**
 * Modern Security Label Form (2025)
 * 
 * Features:
 * - Visual country selector with flags
 * - User-scoped COI filtering (only show user's COIs)
 * - Smart caveat validation (incompatibility warnings)
 * - Clearance validation with visual feedback
 * - Auto-include user's country option
 * - Multi-select with visual cards
 * - Real-time validation
 */

'use client';

import { useState, useEffect, useMemo } from 'react';

interface SecurityLabelFormProps {
  userClearance: string;
  userCountry: string;
  userCOI?: string[]; // User's actual COI memberships
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  caveats: string[];
  onClassificationChange: (value: string) => void;
  onReleasabilityChange: (value: string[]) => void;
  onCOIChange: (value: string[]) => void;
  onCaveatsChange: (value: string[]) => void;
}

const CLASSIFICATION_LEVELS = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];

const CLASSIFICATION_HIERARCHY: Record<string, number> = {
  'UNCLASSIFIED': 0,
  'CONFIDENTIAL': 1,
  'SECRET': 2,
  'TOP_SECRET': 3
};

// Country data with flags and full names
const COUNTRIES = [
  { code: 'USA', name: 'United States', flag: '🇺🇸', region: 'FVEY' },
  { code: 'GBR', name: 'United Kingdom', flag: '🇬🇧', region: 'FVEY' },
  { code: 'CAN', name: 'Canada', flag: '🇨🇦', region: 'FVEY' },
  { code: 'AUS', name: 'Australia', flag: '🇦🇺', region: 'FVEY' },
  { code: 'NZL', name: 'New Zealand', flag: '🇳🇿', region: 'FVEY' },
  { code: 'FRA', name: 'France', flag: '🇫🇷', region: 'NATO' },
  { code: 'DEU', name: 'Germany', flag: '🇩🇪', region: 'NATO' },
  { code: 'ESP', name: 'Spain', flag: '🇪🇸', region: 'NATO' },
  { code: 'ITA', name: 'Italy', flag: '🇮🇹', region: 'NATO' },
  { code: 'POL', name: 'Poland', flag: '🇵🇱', region: 'NATO' }
];

// COI Options - now fetched dynamically from API
interface COIOption {
  value: string;
  label: string;
  description: string;
  requiredCountries: string[];
}

const CAVEAT_OPTIONS = [
  { 
    value: 'NOFORN', 
    label: 'NOFORN', 
    description: 'No Foreign Nationals',
    incompatibleWith: ['releasability'], // Can't have NOFORN + foreign countries
    severity: 'high'
  },
  { 
    value: 'ORCON', 
    label: 'ORCON', 
    description: 'Originator Controlled - requires originator approval for further release',
    severity: 'medium'
  },
  { 
    value: 'RELIDO', 
    label: 'RELIDO', 
    description: 'Releasable by Information Disclosure Official only',
    severity: 'medium'
  },
  { 
    value: 'PROPIN', 
    label: 'PROPIN', 
    description: 'Caution—Proprietary Information Involved',
    severity: 'low'
  },
  { 
    value: 'IMCON', 
    label: 'IMCON', 
    description: 'Imagery Controlled - special handling for imagery',
    severity: 'medium'
  }
];

const classificationColors: Record<string, string> = {
  'UNCLASSIFIED': 'bg-green-50 text-green-900 border-green-300',
  'CONFIDENTIAL': 'bg-yellow-50 text-yellow-900 border-yellow-300',
  'SECRET': 'bg-orange-50 text-orange-900 border-orange-300',
  'TOP_SECRET': 'bg-red-50 text-red-900 border-red-300',
};

const classificationAccents: Record<string, string> = {
  'UNCLASSIFIED': 'from-green-500 to-green-600',
  'CONFIDENTIAL': 'from-yellow-500 to-yellow-600',
  'SECRET': 'from-orange-500 to-orange-600',
  'TOP_SECRET': 'from-red-500 to-red-600',
};

export default function SecurityLabelForm({
  userClearance,
  userCountry,
  userCOI = [],
  classification,
  releasabilityTo,
  COI,
  caveats,
  onClassificationChange,
  onReleasabilityChange,
  onCOIChange,
  onCaveatsChange
}: SecurityLabelFormProps) {
  
  // Fetch COI options from API
  const [allCOIOptions, setAllCOIOptions] = useState<COIOption[]>([]);
  const [coiLoading, setCoiLoading] = useState(true);
  
  useEffect(() => {
    const fetchCOIs = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
        const response = await fetch(`${backendUrl}/api/coi-keys?status=active`);
        const data = await response.json();
        
        const coiOptions: COIOption[] = data.cois.map((coi: any) => ({
          value: coi.coiId,
          label: coi.name,
          description: coi.description,
          requiredCountries: coi.memberCountries
        }));
        
        setAllCOIOptions(coiOptions);
      } catch (error) {
        console.error('Failed to fetch COI options:', error);
        // Fallback to empty array - user can still use the form
        setAllCOIOptions([]);
      } finally {
        setCoiLoading(false);
      }
    };
    
    fetchCOIs();
  }, []);
  
  // Filter COI options to only show user's COIs
  const availableCOIs = useMemo(() => {
    if (coiLoading) return [];
    if (!userCOI || userCOI.length === 0) {
      return allCOIOptions; // Show all if user has no COIs
    }
    return allCOIOptions.filter(option => userCOI.includes(option.value));
  }, [userCOI, allCOIOptions, coiLoading]);

  // Quick select presets
  const selectFVEY = () => {
    const fveyCOI = availableCOIs.find(c => c.value === 'FVEY');
    if (fveyCOI) {
      onReleasabilityChange(fveyCOI.requiredCountries);
      onCOIChange(['FVEY']);
    } else {
      // Fallback if FVEY not available
      const fveyCountries = COUNTRIES.filter(c => c.region === 'FVEY').map(c => c.code);
      onReleasabilityChange(fveyCountries);
    }
  };

  const selectNATO = () => {
    const natoCountries = COUNTRIES.map(c => c.code);
    onReleasabilityChange(natoCountries);
  };

  const selectUserCountryOnly = () => {
    onReleasabilityChange([userCountry]);
  };

  // Validation warnings
  const warnings = useMemo(() => {
    const warns: string[] = [];
    
    // CRITICAL: User selecting COI they don't have
    if (COI.length > 0 && (!userCOI || userCOI.length === 0)) {
      warns.push(`⚠️ UPLOAD WILL FAIL: You are not a member of any COI. Remove COI selection or contact your administrator to add COI to your profile.`);
    } else if (COI.length > 0 && userCOI && userCOI.length > 0) {
      const invalidCOIs = COI.filter(coi => !userCOI.includes(coi));
      if (invalidCOIs.length > 0) {
        warns.push(`⚠️ UPLOAD WILL FAIL: You are not a member of ${invalidCOIs.join(', ')}. You can only assign COIs you belong to: ${userCOI.join(', ')}`);
      }
    }
    
    // NOFORN incompatibility
    if (caveats.includes('NOFORN') && releasabilityTo.some(c => c !== userCountry)) {
      warns.push('NOFORN caveat is incompatible with foreign country releasability');
    }
    
    // User country not included
    if (!releasabilityTo.includes(userCountry) && releasabilityTo.length > 0) {
      warns.push(`Your country (${userCountry}) is not in releasability list - you won't be able to access this document`);
    }
    
    // Classification above user clearance
    if (CLASSIFICATION_HIERARCHY[classification] > CLASSIFICATION_HIERARCHY[userClearance]) {
      warns.push(`Classification ${classification} is above your clearance level (${userClearance})`);
    }
    
    // COI selected but countries don't match
    COI.forEach(coi => {
      const coiOption = allCOIOptions.find(o => o.value === coi);
      if (coiOption?.requiredCountries && coiOption.requiredCountries.length > 0) {
        const missingCountries = coiOption.requiredCountries.filter(
          c => !releasabilityTo.includes(c)
        );
        if (missingCountries.length > 0) {
          warns.push(`${coi} requires countries: ${missingCountries.join(', ')}`);
        }
      }
    });
    
    return warns;
  }, [caveats, releasabilityTo, userCountry, classification, userClearance, COI, userCOI]);

  const isClassificationAllowed = (level: string): boolean => {
    return CLASSIFICATION_HIERARCHY[level] <= CLASSIFICATION_HIERARCHY[userClearance];
  };

  const toggleCountry = (countryCode: string) => {
    if (releasabilityTo.includes(countryCode)) {
      // Removing a country - check if it breaks any COI requirements
      const newReleasabilityTo = releasabilityTo.filter(c => c !== countryCode);
      onReleasabilityChange(newReleasabilityTo);
      
      // Auto-deselect COIs that require this country
      const newCOIs = COI.filter(coiValue => {
        const coiOption = allCOIOptions.find(o => o.value === coiValue);
        if (coiOption?.requiredCountries && coiOption.requiredCountries.length > 0) {
          // If this COI requires the removed country, deselect it
          return !coiOption.requiredCountries.includes(countryCode);
        }
        return true;
      });
      
      if (newCOIs.length !== COI.length) {
        onCOIChange(newCOIs);
      }
    } else {
      // Adding a country
      onReleasabilityChange([...releasabilityTo, countryCode]);
    }
  };

  const toggleCOI = (coiValue: string) => {
    if (COI.includes(coiValue)) {
      // Deselecting COI - remove countries that are only required by this COI
      const coiOption = allCOIOptions.find(o => o.value === coiValue);
      if (coiOption?.requiredCountries && coiOption.requiredCountries.length > 0) {
        // Get all countries required by remaining COIs
        const remainingCOIs = COI.filter(c => c !== coiValue);
        const countriesStillNeeded = new Set<string>();
        
        remainingCOIs.forEach(remainingCoi => {
          const remainingOption = allCOIOptions.find(o => o.value === remainingCoi);
          remainingOption?.requiredCountries?.forEach(country => {
            countriesStillNeeded.add(country);
          });
        });
        
        // Remove countries that are no longer needed by any COI
        const newCountries = releasabilityTo.filter(country => {
          // Keep the country if:
          // 1. It's not in the deselected COI's required countries, OR
          // 2. It's still needed by another selected COI
          if (!coiOption.requiredCountries.includes(country)) {
            return true; // Not related to this COI, keep it
          }
          return countriesStillNeeded.has(country); // Keep if still needed by another COI
        });
        
        if (newCountries.length !== releasabilityTo.length) {
          onReleasabilityChange(newCountries);
        }
      }
      
      onCOIChange(COI.filter(c => c !== coiValue));
    } else {
      // Selecting COI - auto-add required countries
      const coiOption = allCOIOptions.find(o => o.value === coiValue);
      if (coiOption?.requiredCountries && coiOption.requiredCountries.length > 0) {
        // Add all required countries that aren't already selected
        const newCountries = [...releasabilityTo];
        let countriesAdded = false;
        
        coiOption.requiredCountries.forEach(country => {
          if (!newCountries.includes(country)) {
            newCountries.push(country);
            countriesAdded = true;
          }
        });
        
        if (countriesAdded) {
          onReleasabilityChange(newCountries);
        }
      }
      
      onCOIChange([...COI, coiValue]);
    }
  };

  const toggleCaveat = (caveatValue: string) => {
    if (caveats.includes(caveatValue)) {
      onCaveatsChange(caveats.filter(c => c !== caveatValue));
    } else {
      onCaveatsChange([...caveats, caveatValue]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Classification Level */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-3">
          Classification Level <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {CLASSIFICATION_LEVELS.map((level) => {
            const allowed = isClassificationAllowed(level);
            const selected = classification === level;
            return (
              <button
                key={level}
                type="button"
                onClick={() => allowed && onClassificationChange(level)}
                disabled={!allowed}
                className={`relative px-4 py-4 rounded-lg border-2 text-sm font-bold transition-all transform ${
                  selected
                    ? `${classificationColors[level]} border-current shadow-lg scale-105`
                    : allowed
                    ? 'border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 text-gray-700 hover:scale-102'
                    : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                }`}
              >
                {selected && (
                  <div className={`absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br ${classificationAccents[level]} flex items-center justify-center`}>
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <div className="flex items-center justify-center">
                  {level}
                  {!allowed && ' 🔒'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Releasable To (Countries) - Visual Cards with Flags */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-semibold text-gray-900">
            Releasable To (Countries) <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectUserCountryOnly}
              className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-300 rounded hover:bg-blue-50"
            >
              My Country Only
            </button>
            <button
              type="button"
              onClick={selectFVEY}
              className="px-2 py-1 text-xs font-medium text-purple-600 hover:text-purple-800 border border-purple-300 rounded hover:bg-purple-50"
            >
              FVEY
            </button>
            <button
              type="button"
              onClick={selectNATO}
              className="px-2 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-300 rounded hover:bg-indigo-50"
            >
              All NATO
            </button>
          </div>
        </div>

        {/* Country Grid with Flags */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {COUNTRIES.map((country) => {
            const isSelected = releasabilityTo.includes(country.code);
            const isUserCountry = country.code === userCountry;
            
            return (
              <button
                key={country.code}
                type="button"
                onClick={() => toggleCountry(country.code)}
                className={`relative px-3 py-3 rounded-lg border-2 text-left transition-all transform hover:scale-105 ${
                  isSelected
                    ? 'bg-blue-50 text-blue-900 border-blue-400 shadow-md'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                }`}
              >
                {isSelected && (
                  <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                {isUserCountry && (
                  <div className="absolute -top-1.5 -left-1.5 px-1.5 py-0.5 rounded-full bg-green-500 text-white text-xs font-bold">
                    You
                  </div>
                )}
                <div className="text-2xl mb-1">{country.flag}</div>
                <div className="text-xs font-bold">{country.code}</div>
                <div className="text-xs text-gray-500 truncate">{country.name}</div>
              </button>
            );
          })}
        </div>

        {/* Selection Summary */}
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-gray-600">
            {releasabilityTo.length === 0 ? (
              <span className="text-red-600 font-medium">⚠️ No countries selected</span>
            ) : (
              <span className="text-green-600 font-medium">
                ✓ {releasabilityTo.length} {releasabilityTo.length === 1 ? 'country' : 'countries'} selected
              </span>
            )}
          </span>
          {releasabilityTo.length > 0 && (
            <button
              type="button"
              onClick={() => onReleasabilityChange([])}
              className="text-red-600 hover:text-red-800 font-medium"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Communities of Interest (User-Scoped) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-semibold text-gray-900">
            Communities of Interest (COI) <span className="text-gray-500 text-xs font-normal">(Optional)</span>
          </label>
          {userCOI && userCOI.length > 0 && (
            <span className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200">
              ✅ Your COIs: {userCOI.join(', ')}
            </span>
          )}
          {(!userCOI || userCOI.length === 0) && (
            <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
              ⚠️ You have no COI memberships
            </span>
          )}
        </div>

        {/* Smart COI-Country Sync Info */}
        <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-800">
            <strong>🔄 Auto-Sync:</strong> Selecting a COI automatically adds required countries. 
            Deselecting a COI removes its countries (unless needed by another COI). 
            Removing a required country deselects the COI.
          </p>
        </div>

        {availableCOIs.length > 0 && (
          <div className="space-y-2">
            {availableCOIs.map((option) => {
              const isSelected = COI.includes(option.value);
              const isUserCOI = userCOI && userCOI.includes(option.value);
              
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleCOI(option.value)}
                  className={`w-full px-4 py-3 rounded-lg border-2 text-left transition-all transform hover:scale-102 ${
                    isSelected
                      ? isUserCOI || (!userCOI || userCOI.length === 0)
                        ? 'bg-purple-50 text-purple-900 border-purple-400 shadow-md'
                        : 'bg-red-50 text-red-900 border-red-400 shadow-md'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{option.label}</span>
                        {isSelected && (isUserCOI || (!userCOI || userCOI.length === 0)) && (
                          <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                        {isSelected && userCOI && userCOI.length > 0 && !isUserCOI && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800">
                            ⚠️ Not your COI
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{option.description}</p>
                      {option.requiredCountries && option.requiredCountries.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          Requires: {option.requiredCountries.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {availableCOIs.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="h-5 w-5 text-amber-600 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900 mb-1">
                  No COI Memberships
                </p>
                <p className="text-xs text-amber-800">
                  You are not a member of any Communities of Interest. <strong>Do not select any COI</strong> or your upload will be rejected. 
                  Contact your administrator if you need COI assignments.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Handling Caveats (Modern Cards) */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-3">
          Handling Caveats (Optional)
        </label>
        <p className="text-xs text-gray-600 mb-3">
          Caveats restrict how the document can be further disseminated. Select only if required.
        </p>
        
        <div className="space-y-2">
          {CAVEAT_OPTIONS.map((option) => {
            const isSelected = caveats.includes(option.value);
            const severityColors: Record<string, string> = {
              high: 'border-red-300 hover:border-red-400',
              medium: 'border-yellow-300 hover:border-yellow-400',
              low: 'border-gray-300 hover:border-gray-400'
            };
            
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleCaveat(option.value)}
                className={`w-full px-4 py-3 rounded-lg border-2 text-left transition-all ${
                  isSelected
                    ? 'bg-amber-50 text-amber-900 border-amber-400 shadow-md'
                    : `bg-white text-gray-700 ${severityColors[option.severity] || 'border-gray-300'} hover:bg-gray-50`
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm font-mono">{option.label}</span>
                      {option.severity === 'high' && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800">
                          High Impact
                        </span>
                      )}
                      {isSelected && (
                        <svg className="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{option.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {caveats.length > 0 && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800">
              <strong>⚠️ Active caveats:</strong> {caveats.join(', ')}
            </p>
          </div>
        )}
      </div>

      {/* Validation Warnings */}
      {warnings.length > 0 && (
        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-yellow-900 mb-2">Validation Warnings</h4>
              <ul className="space-y-1">
                {warnings.map((warn, idx) => (
                  <li key={idx} className="text-xs text-yellow-800 flex items-start">
                    <span className="mr-2">•</span>
                    <span>{warn}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
