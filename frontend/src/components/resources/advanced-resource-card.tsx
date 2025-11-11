/**
 * Advanced Resource Card Component (2025)
 * 
 * Features:
 * - Multiple view modes (Grid, List, Compact)
 * - Enhanced metadata visualization
 * - Quick actions and preview
 * - Accessibility optimized
 * - Skeleton loading states
 */

'use client';

import React from 'react';
import Link from 'next/link';

export interface IResourceCardData {
  resourceId: string;
  title: string;
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  encrypted: boolean;
  creationDate?: string;
  displayMarking?: string;
  ztdfVersion?: string;
  kaoCount?: number;
  kaos?: Array<{
    kaoId: string;
    kasId: string;
    policyBinding?: {
      coiRequired?: string[];
      countriesAllowed?: string[];
    };
  }>;
}

export type ViewMode = 'grid' | 'list' | 'compact';

interface AdvancedResourceCardProps {
  resource: IResourceCardData;
  viewMode: ViewMode;
  userAttributes?: {
    clearance?: string;
    country?: string;
    coi?: string[];
  };
}

const classificationColors: Record<string, { bg: string; text: string; border: string }> = {
  'UNCLASSIFIED': { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  'RESTRICTED': { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  'CONFIDENTIAL': { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  'SECRET': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  'TOP_SECRET': { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
};

const classificationEmojis: Record<string, string> = {
  'UNCLASSIFIED': '🟢',
  'RESTRICTED': '🔵',
  'CONFIDENTIAL': '🟡',
  'SECRET': '🟠',
  'TOP_SECRET': '🔴',
};

function formatDate(dateString?: string): string {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return 'N/A';
  }
}

function getAccessIndicator(
  resource: IResourceCardData,
  userAttributes?: { clearance?: string; country?: string; coi?: string[] }
): { status: 'likely' | 'possible' | 'unlikely'; message: string } {
  if (!userAttributes?.clearance || !userAttributes?.country) {
    return { status: 'possible', message: 'Unknown' };
  }

  // CRITICAL: RESTRICTED is now a separate level above UNCLASSIFIED
  // Using numeric comparison instead of array indexOf
  const clearanceOrder: Record<string, number> = {
    'UNCLASSIFIED': 0,
    'RESTRICTED': 0.5,
    'CONFIDENTIAL': 1,
    'SECRET': 2,
    'TOP_SECRET': 3
  };
  const userClearanceLevel = clearanceOrder[userAttributes.clearance] ?? 0;
  const docClearanceLevel = clearanceOrder[resource.classification] ?? 0;

  // Check clearance
  if (userClearanceLevel < docClearanceLevel) {
    return { status: 'unlikely', message: 'Insufficient clearance' };
  }

  // Check country
  if (!resource.releasabilityTo.includes(userAttributes.country)) {
    return { status: 'unlikely', message: 'Country not authorized' };
  }

  // Check COI if required
  if (resource.COI.length > 0) {
    const userCOIs = userAttributes.coi || [];
    const hasRequiredCOI = resource.COI.some(coi => userCOIs.includes(coi));
    if (!hasRequiredCOI) {
      return { status: 'possible', message: 'COI may be required' };
    }
  }

  return { status: 'likely', message: 'Likely accessible' };
}

export default function AdvancedResourceCard({
  resource,
  viewMode,
  userAttributes,
}: AdvancedResourceCardProps) {
  const classColors = classificationColors[resource.classification] || {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-300',
  };

  const accessIndicator = getAccessIndicator(resource, userAttributes);

  // Grid View (Default - Most detailed)
  if (viewMode === 'grid') {
    return (
      <Link href={`/resources/${resource.resourceId}`} className="block group h-full">
        <div className="bg-white border-2 border-gray-200 rounded-xl p-5 hover:shadow-2xl hover:border-blue-400 transition-all duration-300 hover:-translate-y-1 h-full flex flex-col">
          {/* Header with Classification Badge */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border-2 ${classColors.bg} ${classColors.text} ${classColors.border}`}>
              <span className="mr-1">{classificationEmojis[resource.classification]}</span>
              {resource.classification.replace('_', ' ')}
            </div>
            {resource.encrypted && (
              <div className="flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
                <svg className="w-3 h-3 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                KAS
              </div>
            )}
          </div>

          {/* Title */}
          <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors mb-3 line-clamp-2">
            {resource.title}
          </h3>

          {/* Resource ID */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <span className="font-mono">{resource.resourceId}</span>
          </div>

          {/* Metadata Grid */}
          <div className="space-y-3 mb-4 flex-1">
            {/* Countries */}
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Releasability
              </div>
              <div className="flex flex-wrap gap-1">
                {resource.releasabilityTo.slice(0, 6).map(country => (
                  <span key={country} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-xs font-semibold border border-blue-200">
                    {country}
                  </span>
                ))}
                {resource.releasabilityTo.length > 6 && (
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-xs font-semibold">
                    +{resource.releasabilityTo.length - 6}
                  </span>
                )}
              </div>
            </div>

            {/* COI */}
            {resource.COI && resource.COI.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Communities
                </div>
                <div className="flex flex-wrap gap-1">
                  {resource.COI.map(coi => (
                    <span key={coi} className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md text-xs font-semibold border border-purple-200">
                      {coi}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Creation Date */}
            {resource.creationDate && (
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Created
                </div>
                <div className="text-xs text-gray-700 font-medium">{formatDate(resource.creationDate)}</div>
              </div>
            )}
          </div>

          {/* Footer: Access Indicator */}
          <div className="mt-auto pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-1.5 text-xs font-semibold ${
                accessIndicator.status === 'likely' ? 'text-green-700' :
                accessIndicator.status === 'possible' ? 'text-yellow-700' :
                'text-red-700'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  accessIndicator.status === 'likely' ? 'bg-green-500' :
                  accessIndicator.status === 'possible' ? 'bg-yellow-500' :
                  'bg-red-500'
                }`} />
                {accessIndicator.message}
              </div>
              <svg
                className="h-5 w-5 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // List View (Horizontal layout)
  if (viewMode === 'list') {
    return (
      <Link href={`/resources/${resource.resourceId}`} className="block group">
        <div className="bg-white border-2 border-gray-200 rounded-xl p-4 hover:shadow-xl hover:border-blue-400 transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Classification + Title */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border-2 ${classColors.bg} ${classColors.text} ${classColors.border}`}>
                <span className="mr-1">{classificationEmojis[resource.classification]}</span>
                {resource.classification.replace('_', ' ')}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-gray-900 group-hover:text-blue-600 transition-colors truncate mb-1">
                  {resource.title}
                </h3>
                <p className="text-xs text-gray-500 font-mono">{resource.resourceId}</p>
              </div>
            </div>

            {/* Center: Metadata */}
            <div className="hidden lg:flex items-center gap-6 flex-shrink-0">
              {/* Countries */}
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex gap-1">
                  {resource.releasabilityTo.slice(0, 3).map(country => (
                    <span key={country} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-semibold">
                      {country}
                    </span>
                  ))}
                  {resource.releasabilityTo.length > 3 && (
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-semibold">
                      +{resource.releasabilityTo.length - 3}
                    </span>
                  )}
                </div>
              </div>

              {/* COI */}
              {resource.COI && resource.COI.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="text-xs text-gray-600">{resource.COI.length}</span>
                </div>
              )}

              {/* Encrypted Badge */}
              {resource.encrypted && (
                <div className="px-2 py-1 rounded-md text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
                  🔐 KAS
                </div>
              )}

              {/* Date */}
              {resource.creationDate && (
                <div className="text-xs text-gray-500">
                  {formatDate(resource.creationDate)}
                </div>
              )}
            </div>

            {/* Right: Access Indicator + Arrow */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className={`hidden md:flex items-center gap-1.5 text-xs font-semibold ${
                accessIndicator.status === 'likely' ? 'text-green-700' :
                accessIndicator.status === 'possible' ? 'text-yellow-700' :
                'text-red-700'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  accessIndicator.status === 'likely' ? 'bg-green-500' :
                  accessIndicator.status === 'possible' ? 'bg-yellow-500' :
                  'bg-red-500'
                }`} />
              </div>
              <svg
                className="h-5 w-5 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // Compact View (Minimal, table-like)
  return (
    <Link href={`/resources/${resource.resourceId}`} className="block group">
      <div className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md hover:border-blue-400 transition-all duration-150">
        <div className="flex items-center justify-between gap-3">
          {/* Classification Icon */}
          <div className="flex-shrink-0 text-xl">
            {classificationEmojis[resource.classification]}
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
              {resource.title}
            </h3>
          </div>

          {/* Quick Badges */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="hidden sm:inline-block text-xs text-gray-500 font-mono">
              {resource.resourceId}
            </span>
            {resource.encrypted && (
              <span className="text-sm">🔐</span>
            )}
            {resource.releasabilityTo.length > 0 && (
              <span className="hidden md:inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-semibold">
                {resource.releasabilityTo.length}
              </span>
            )}
            <svg
              className="h-4 w-4 text-gray-400 group-hover:text-blue-600 transition-colors"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </Link>
  );
}

// Loading Skeleton
export function ResourceCardSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === 'grid') {
    return (
      <div className="bg-white border-2 border-gray-200 rounded-xl p-5 animate-pulse">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="h-7 w-24 bg-gray-200 rounded-lg" />
          <div className="h-6 w-12 bg-gray-200 rounded-md" />
        </div>
        <div className="h-6 bg-gray-200 rounded mb-3" />
        <div className="h-4 w-32 bg-gray-200 rounded mb-4" />
        <div className="space-y-3">
          <div className="h-12 bg-gray-200 rounded" />
          <div className="h-12 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div className="bg-white border-2 border-gray-200 rounded-xl p-4 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="h-8 w-24 bg-gray-200 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="h-5 bg-gray-200 rounded w-2/3" />
            <div className="h-4 bg-gray-200 rounded w-32" />
          </div>
          <div className="h-5 w-5 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-6 w-6 bg-gray-200 rounded-full" />
        <div className="flex-1 h-4 bg-gray-200 rounded" />
        <div className="h-4 w-4 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

