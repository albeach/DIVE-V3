'use client';

import { useState, useEffect } from 'react';

interface SecurityLabelFormProps {
  userClearance: string;
  userCountry: string;
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  caveats: string[];
  title: string;
  description: string;
  onClassificationChange: (value: string) => void;
  onReleasabilityChange: (value: string[]) => void;
  onCOIChange: (value: string[]) => void;
  onCaveatsChange: (value: string[]) => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}

const CLASSIFICATION_LEVELS = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];

const CLASSIFICATION_HIERARCHY: Record<string, number> = {
  'UNCLASSIFIED': 0,
  'CONFIDENTIAL': 1,
  'SECRET': 2,
  'TOP_SECRET': 3
};

const COUNTRIES = [
  { code: 'USA', name: 'United States' },
  { code: 'GBR', name: 'United Kingdom' },
  { code: 'FRA', name: 'France' },
  { code: 'CAN', name: 'Canada' },
  { code: 'DEU', name: 'Germany' },
  { code: 'AUS', name: 'Australia' },
  { code: 'NZL', name: 'New Zealand' }
];

const COI_OPTIONS = [
  { value: 'FVEY', label: 'Five Eyes', description: 'USA, GBR, CAN, AUS, NZL' },
  { value: 'NATO-COSMIC', label: 'NATO COSMIC', description: 'NATO Top Secret' },
  { value: 'CAN-US', label: 'Canada-US', description: 'Bilateral Canada-US' },
  { value: 'US-ONLY', label: 'US Only', description: 'US Personnel Only' }
];

const CAVEAT_OPTIONS = [
  { value: 'NOFORN', label: 'NOFORN', description: 'No Foreign Nationals' },
  { value: 'RELIDO', label: 'RELIDO', description: 'Releasable by Information Disclosure Official' },
  { value: 'PROPIN', label: 'PROPIN', description: 'Caution—Proprietary Information Involved' },
  { value: 'ORCON', label: 'ORCON', description: 'Originator Controlled' },
  { value: 'IMCON', label: 'IMCON', description: 'Imagery Controlled' }
];

const classificationColors: Record<string, string> = {
  'UNCLASSIFIED': 'bg-green-100 text-green-800 border-green-300',
  'CONFIDENTIAL': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'SECRET': 'bg-orange-100 text-orange-800 border-orange-300',
  'TOP_SECRET': 'bg-red-100 text-red-800 border-red-300',
};

export default function SecurityLabelForm({
  userClearance,
  userCountry,
  classification,
  releasabilityTo,
  COI,
  caveats,
  title,
  description,
  onClassificationChange,
  onReleasabilityChange,
  onCOIChange,
  onCaveatsChange,
  onTitleChange,
  onDescriptionChange
}: SecurityLabelFormProps) {
  
  const [displayMarking, setDisplayMarking] = useState('');

  // Generate display marking whenever inputs change
  useEffect(() => {
    generateDisplayMarking();
  }, [classification, releasabilityTo, COI, caveats]);

  const generateDisplayMarking = () => {
    let marking = classification;
    
    if (COI.length > 0) {
      marking += `//${COI.join('/')}`;
    }
    
    if (releasabilityTo.length > 0) {
      marking += `//REL ${releasabilityTo.join(', ')}`;
    }
    
    if (caveats.length > 0) {
      marking += `//${caveats.join('/')}`;
    }
    
    setDisplayMarking(marking);
  };

  const toggleCountry = (countryCode: string) => {
    if (releasabilityTo.includes(countryCode)) {
      onReleasabilityChange(releasabilityTo.filter(c => c !== countryCode));
    } else {
      onReleasabilityChange([...releasabilityTo, countryCode]);
    }
  };

  const toggleCOI = (coiValue: string) => {
    if (COI.includes(coiValue)) {
      onCOIChange(COI.filter(c => c !== coiValue));
    } else {
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

  const isClassificationAllowed = (level: string): boolean => {
    return CLASSIFICATION_HIERARCHY[level] <= CLASSIFICATION_HIERARCHY[userClearance];
  };

  const isAboveUserClearance = CLASSIFICATION_HIERARCHY[classification] > CLASSIFICATION_HIERARCHY[userClearance];

  return (
    <div className="space-y-6">
      {/* Classification */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          Classification Level <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {CLASSIFICATION_LEVELS.map((level) => {
            const allowed = isClassificationAllowed(level);
            return (
              <button
                key={level}
                type="button"
                onClick={() => allowed && onClassificationChange(level)}
                disabled={!allowed}
                className={`px-4 py-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                  classification === level
                    ? classificationColors[level] + ' border-current'
                    : allowed
                    ? 'border-gray-300 bg-white hover:bg-gray-50 text-gray-700'
                    : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {level}
                {!allowed && ' 🔒'}
              </button>
            );
          })}
        </div>
        {isAboveUserClearance && (
          <p className="mt-2 text-sm text-red-600">
            ⚠️ Warning: You cannot upload above your clearance level ({userClearance})
          </p>
        )}
      </div>

      {/* Releasability To */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          Releasable To (Countries) <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {COUNTRIES.map((country) => (
            <button
              key={country.code}
              type="button"
              onClick={() => toggleCountry(country.code)}
              className={`px-3 py-2 rounded border text-xs font-medium transition-colors ${
                releasabilityTo.includes(country.code)
                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {country.code} - {country.name}
            </button>
          ))}
        </div>
        {releasabilityTo.length === 0 && (
          <p className="mt-2 text-sm text-red-600">
            ⚠️ At least one country must be selected
          </p>
        )}
        {!releasabilityTo.includes(userCountry) && releasabilityTo.length > 0 && (
          <p className="mt-2 text-sm text-yellow-600">
            ⚠️ Note: Your country ({userCountry}) is not in the releasability list
          </p>
        )}
      </div>

      {/* Communities of Interest */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          Communities of Interest (COI)
        </label>
        <div className="space-y-2">
          {COI_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleCOI(option.value)}
              className={`w-full px-4 py-3 rounded border text-left transition-colors ${
                COI.includes(option.value)
                  ? 'bg-purple-100 text-purple-800 border-purple-300'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-sm">{option.label}</span>
                  <p className="text-xs mt-1 opacity-75">{option.description}</p>
                </div>
                {COI.includes(option.value) && <span className="text-lg">✓</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Caveats */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          Handling Caveats
        </label>
        <div className="space-y-2">
          {CAVEAT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleCaveat(option.value)}
              className={`w-full px-4 py-3 rounded border text-left transition-colors ${
                caveats.includes(option.value)
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-sm">{option.label}</span>
                  <p className="text-xs mt-1 opacity-75">{option.description}</p>
                </div>
                {caveats.includes(option.value) && <span className="text-lg">✓</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Document Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Enter document title (max 200 characters)"
          maxLength={200}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          {title.length}/200 characters
        </p>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Description (Optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Enter document description"
          rows={3}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Display Marking Preview */}
      <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">
          🛡️ STANAG 4774 Display Marking Preview
        </h4>
        <div className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-bold border-2 ${
          classificationColors[classification] || 'bg-gray-100 text-gray-800 border-gray-300'
        }`}>
          <span className="font-mono tracking-wide">
            {displayMarking || 'Select classification and releasability'}
          </span>
        </div>
        <p className="text-xs text-gray-600 mt-2">
          This marking will be applied to your uploaded document per ACP-240 standards.
        </p>
      </div>
    </div>
  );
}

