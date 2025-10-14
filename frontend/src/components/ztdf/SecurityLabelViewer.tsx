'use client';

import { useState } from 'react';

// ============================================
// Type Definitions
// ============================================

interface ISecurityLabel {
  classification: string;
  releasabilityTo: string[];
  COI?: string[];
  caveats?: string[];
  originatingCountry: string;
  creationDate: string;
  displayMarking?: string;
}

interface SecurityLabelViewerProps {
  label: ISecurityLabel;
  showDetailedExplanations?: boolean;
}

// ============================================
// Constants
// ============================================

const CLASSIFICATION_INFO = {
  'TOP_SECRET': {
    color: 'bg-red-100 text-red-800 border-red-300',
    description: '⚠️ Unauthorized disclosure could cause exceptionally grave damage to national security',
    level: 4
  },
  'SECRET': {
    color: 'bg-orange-100 text-orange-800 border-orange-300',
    description: '⚠️ Unauthorized disclosure could cause serious damage to national security',
    level: 3
  },
  'CONFIDENTIAL': {
    color: 'bg-blue-100 text-blue-800 border-blue-300',
    description: 'ℹ️ Unauthorized disclosure could cause damage to national security',
    level: 2
  },
  'UNCLASSIFIED': {
    color: 'bg-green-100 text-green-800 border-green-300',
    description: 'ℹ️ Not classified - publicly releasable information',
    level: 1
  }
};

const COUNTRY_NAMES: Record<string, string> = {
  'USA': 'United States',
  'GBR': 'United Kingdom',
  'FRA': 'France',
  'CAN': 'Canada',
  'DEU': 'Germany',
  'AUS': 'Australia',
  'NZL': 'New Zealand',
  'ITA': 'Italy',
  'ESP': 'Spain',
  'NLD': 'Netherlands',
  'BEL': 'Belgium',
  'POL': 'Poland',
  'DNK': 'Denmark',
  'NOR': 'Norway'
};

const COI_DESCRIPTIONS: Record<string, string> = {
  'FVEY': 'Five Eyes Intelligence Alliance (USA, GBR, CAN, AUS, NZL)',
  'NATO-COSMIC': 'NATO COSMIC Top Secret classification',
  'NATO': 'North Atlantic Treaty Organization',
  'CAN-US': 'Canada-United States bilateral sharing',
  'US-ONLY': 'United States personnel only',
  'NOFORN': 'Not releasable to foreign nationals'
};

// Full list of NATO countries for releasability matrix
const NATO_COUNTRIES = ['USA', 'GBR', 'FRA', 'CAN', 'DEU', 'ITA', 'ESP', 'NLD', 'BEL', 'POL', 'DNK', 'NOR', 'GRC', 'PRT', 'TUR', 'CZE', 'HUN', 'SVK', 'SVN', 'EST', 'LVA', 'LTU', 'ROU', 'BGR', 'HRV', 'ALB', 'MNE', 'MKD', 'ISL', 'LUX', 'SWE', 'FIN'];

// ============================================
// Components
// ============================================

function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {children}
      </div>
      {show && (
        <div className="absolute z-10 px-3 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg -top-10 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
          {content}
          <div className="absolute w-2 h-2 bg-gray-900 transform rotate-45 -bottom-1 left-1/2 -translate-x-1/2"></div>
        </div>
      )}
    </div>
  );
}

export default function SecurityLabelViewer({ 
  label, 
  showDetailedExplanations = false 
}: SecurityLabelViewerProps) {
  const classInfo = CLASSIFICATION_INFO[label.classification as keyof typeof CLASSIFICATION_INFO] 
    || CLASSIFICATION_INFO.UNCLASSIFIED;

  // Determine which countries can access (in releasabilityTo list)
  const canAccess = (country: string) => label.releasabilityTo.includes(country);

  return (
    <div className="space-y-6">
      {/* Display Marking (STANAG 4774) */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-lg p-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              STANAG 4774 Display Marking
            </h3>
            <Tooltip content="NATO standardized security label format">
              <svg className="h-4 w-4 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </Tooltip>
          </div>
        </div>
        <div className="bg-white border-2 border-gray-300 rounded p-4">
          <p className="text-xl md:text-2xl font-bold text-gray-900 font-mono text-center break-all">
            {label.displayMarking || 'N/A'}
          </p>
        </div>
        <p className="text-xs text-gray-600 mt-2 text-center">
          This marking must appear on all extractions, derivations, and copies of this data
        </p>
      </div>

      {/* Classification Level */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-base font-semibold text-gray-900">Classification Level</h4>
          <Tooltip content="Indicates the sensitivity and required clearance">
            <svg className="h-4 w-4 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </Tooltip>
        </div>
        
        <div className="flex items-center justify-between">
          <span className={`inline-flex items-center px-6 py-3 rounded-md border-2 font-bold text-lg ${classInfo.color}`}>
            {label.classification}
          </span>
          <div className="flex items-center space-x-1">
            {[1, 2, 3, 4].map((level) => (
              <div
                key={level}
                className={`h-8 w-2 rounded ${
                  level <= classInfo.level 
                    ? level === 4 ? 'bg-red-500' : level === 3 ? 'bg-orange-500' : level === 2 ? 'bg-blue-500' : 'bg-green-500'
                    : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
          <p className="text-sm text-gray-700">{classInfo.description}</p>
        </div>

        {showDetailedExplanations && (
          <div className="mt-3 text-xs text-gray-600 space-y-1">
            <p>• Personnel must have {label.classification} clearance or higher to access this data</p>
            <p>• Storage must comply with {label.classification}-level security requirements</p>
            <p>• Transmission must use approved {label.classification}-level encryption</p>
          </div>
        )}
      </div>

      {/* Releasability Matrix */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-base font-semibold text-gray-900">Releasability Matrix</h4>
          <Tooltip content="Countries authorized to access this data">
            <svg className="h-4 w-4 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </Tooltip>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Data is releasable to <strong>{label.releasabilityTo.length}</strong> countr{label.releasabilityTo.length === 1 ? 'y' : 'ies'}
        </p>

        {/* Key Coalition Countries */}
        <div className="space-y-2 mb-4">
          {['USA', 'GBR', 'FRA', 'CAN', 'DEU', 'AUS', 'NZL'].map((country) => {
            const allowed = canAccess(country);
            return (
              <div
                key={country}
                className={`flex items-center justify-between p-3 rounded border ${
                  allowed 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center space-x-3">
                  {allowed ? (
                    <svg className="h-5 w-5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <span className="font-mono text-sm font-semibold">{country}</span>
                  <span className="text-sm text-gray-600">{COUNTRY_NAMES[country] || country}</span>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded ${
                  allowed ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'
                }`}>
                  {allowed ? 'ALLOWED' : 'DENIED'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Additional Countries */}
        {label.releasabilityTo.some(c => !['USA', 'GBR', 'FRA', 'CAN', 'DEU', 'AUS', 'NZL'].includes(c)) && (
          <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
            <p className="text-sm font-medium text-blue-900 mb-2">Additional Countries:</p>
            <div className="flex flex-wrap gap-2">
              {label.releasabilityTo
                .filter(c => !['USA', 'GBR', 'FRA', 'CAN', 'DEU', 'AUS', 'NZL'].includes(c))
                .map((country) => (
                  <span
                    key={country}
                    className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-300"
                  >
                    {country} - {COUNTRY_NAMES[country] || 'Unknown'}
                  </span>
                ))}
            </div>
          </div>
        )}

        {showDetailedExplanations && (
          <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
            <p className="text-xs text-gray-600">
              <strong>Releasability Enforcement:</strong> Only personnel from countries in the releasability 
              list may access this data. Sharing with non-listed countries constitutes unauthorized disclosure 
              and may result in serious consequences under national and international law.
            </p>
          </div>
        )}
      </div>

      {/* Communities of Interest (COI) */}
      {label.COI && label.COI.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-base font-semibold text-gray-900">Communities of Interest (COI)</h4>
            <Tooltip content="Special access groups or intelligence sharing communities">
              <svg className="h-4 w-4 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            </Tooltip>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            Access requires membership in at least one of the following communities:
          </p>

          <div className="space-y-3">
            {label.COI.map((coi) => (
              <div key={coi} className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-purple-100 text-purple-800 border border-purple-300">
                    {coi}
                  </span>
                </div>
                {COI_DESCRIPTIONS[coi] && (
                  <p className="text-sm text-gray-700 mt-2">
                    {COI_DESCRIPTIONS[coi]}
                  </p>
                )}
              </div>
            ))}
          </div>

          {showDetailedExplanations && (
            <div className="mt-4 p-3 bg-purple-50 rounded border border-purple-200">
              <p className="text-xs text-gray-600">
                <strong>COI Membership:</strong> Communities of Interest represent specialized groups with 
                need-to-know access. Personnel must be explicitly granted COI membership through formal 
                authorization processes. COI tags are independent of country affiliation.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Caveats */}
      {label.caveats && label.caveats.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-base font-semibold text-gray-900">Handling Caveats</h4>
            <Tooltip content="Special handling restrictions and warnings">
              <svg className="h-4 w-4 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            </Tooltip>
          </div>

          <div className="space-y-2">
            {label.caveats.map((caveat, idx) => (
              <div key={idx} className="flex items-center p-3 bg-yellow-50 border border-yellow-200 rounded">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-800 border border-yellow-300">
                  {caveat}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Origin & Metadata */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h4 className="text-base font-semibold text-gray-900 mb-4">Label Metadata</h4>
        
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm font-medium text-gray-500 mb-1">Originating Country</dt>
            <dd className="text-sm text-gray-900 flex items-center space-x-2">
              <span className="font-mono font-semibold">{label.originatingCountry}</span>
              <span className="text-gray-600">({COUNTRY_NAMES[label.originatingCountry] || 'Unknown'})</span>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 mb-1">Creation Date</dt>
            <dd className="text-sm text-gray-900">
              {new Date(label.creationDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </dd>
          </div>
        </dl>

        {showDetailedExplanations && (
          <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
            <p className="text-xs text-gray-600">
              <strong>Original Classification Authority:</strong> {label.originatingCountry} created this 
              security label on {new Date(label.creationDate).toLocaleDateString()}. The originating 
              country has jurisdiction over classification changes and declassification decisions.
            </p>
          </div>
        )}
      </div>

      {/* STANAG Compliance Notice */}
      {showDetailedExplanations && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-2">NATO STANAG 4774 Compliance</p>
              <p className="text-xs text-blue-800">
                This security label conforms to NATO Standardization Agreement (STANAG) 4774, which 
                establishes common standards for marking and handling classified information across 
                coalition partners. All systems processing this data must implement STANAG 4774 
                display marking requirements and enforce releasability restrictions.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

