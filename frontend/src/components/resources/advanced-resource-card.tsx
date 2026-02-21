/**
 * Advanced Resource Card Component (2025)
 *
 * Features:
 * - Multiple view modes (Grid, List, Compact)
 * - Enhanced metadata visualization
 * - Quick actions and preview
 * - Accessibility optimized
 * - Skeleton loading states
 *
 * IMPORTANT: Cards are NOT links by default.
 * - Single click: Select/focus the card
 * - Double click: Open preview modal
 * - Click "Open" button or press Enter: Navigate to resource
 * This enables bulk selection, keyboard navigation, and preview features.
 */

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { FileTypeBadge } from './file-type-badge';

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
  // Federation origin tracking
  originRealm?: string;    // Source instance code (USA, FRA, GBR, DEU)
  _federated?: boolean;    // True if from a remote instance
  // File type metadata
  contentType?: string;      // MIME type from backend
  fileExtension?: string;    // Pre-calculated or derived extension
  fileCategory?: 'document' | 'image' | 'video' | 'audio' | 'archive' | 'code' | 'other';
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
  /** If true, clicking anywhere navigates (legacy behavior). Default: false */
  clickToNavigate?: boolean;
}

const classificationColors: Record<string, { bg: string; text: string; border: string }> = {
  'UNCLASSIFIED': { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  'RESTRICTED': { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  'CONFIDENTIAL': { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  'SECRET': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  'TOP_SECRET': { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
};

// Instance flags for federated resources
const instanceFlags: Record<string, string> = {
  'USA': '🇺🇸',
  'FRA': '🇫🇷',
  'GBR': '🇬🇧',
  'DEU': '🇩🇪',
  'CAN': '🇨🇦',
  'AUS': '🇦🇺',
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
  const router = useRouter();
  const { t } = useTranslation('resources');
  const classColors = classificationColors[resource.classification] || {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-300',
  };

  const accessIndicator = getAccessIndicator(resource, userAttributes);

  const handleOpenResource = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering parent's onClick (selection)
    router.push(`/resources/${resource.resourceId}`);
  };

  // Grid View (Default - Most detailed)
  if (viewMode === 'grid') {
    // Check if multi-KAS (more than 1 KAO)
    const hasMultiKas = resource.encrypted && (resource.kaoCount || 0) > 1;

    return (
      <article
        className="block group h-full cursor-pointer"
        data-resource-id={resource.resourceId}
      >
        <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg hover:border-blue-400 transition-all duration-200 h-full flex flex-col">
          {/* Header Row: Classification + Access Status */}
          <div className="flex items-start justify-between gap-3 mb-3">
            {/* Classification Badge - Prominent without emoji clutter */}
            <div className={`flex-shrink-0 px-3 py-1.5 rounded-md text-sm font-bold ${classColors.bg} ${classColors.text} border ${classColors.border}`}>
              {t(`classifications.${resource.classification.toLowerCase()}`)}
            </div>

            {/* Access Indicator - Moved to top for immediate visibility */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium ${
              accessIndicator.status === 'likely' ? 'bg-green-50 text-green-700 border border-green-200' :
              accessIndicator.status === 'possible' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
              'bg-red-50 text-red-700 border border-red-200'
            }`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                accessIndicator.status === 'likely' ? 'bg-green-500' :
                accessIndicator.status === 'possible' ? 'bg-yellow-500' :
                'bg-red-500'
              }`} />
              <span className="text-xs font-semibold">{accessIndicator.message}</span>
            </div>
          </div>

          {/* Title - Now prominent and first in scan order */}
          <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors mb-3 line-clamp-2 leading-tight">
            {resource.title}
          </h3>

          {/* Metadata Row: Compact icons for secondary info */}
          <div className="flex items-center gap-3 mb-4 text-sm text-gray-600">
            {/* File Type - Icon only with tooltip */}
            {resource.contentType && (
              <div className="flex items-center gap-1.5" title={`${resource.fileExtension || resource.contentType}`}>
                <FileTypeBadge
                  contentType={resource.contentType}
                  fileExtension={resource.fileExtension}
                  size="sm"
                  showLabel={false}
                  animated={false}
                />
              </div>
            )}

            {/* Multi-KAS - Simplified */}
            {hasMultiKas && (
              <div className="flex items-center gap-1.5 text-purple-700" title={`${resource.kaoCount} Key Access Objects`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="font-medium">{resource.kaoCount}</span>
              </div>
            )}

            {/* Origin - Flag only with country code */}
            {resource.originRealm && (
              <div className="flex items-center gap-1.5" title={`Source: ${resource.originRealm} instance`}>
                <span className="text-base">{instanceFlags[resource.originRealm] || '🌐'}</span>
                <span className="text-xs font-medium text-gray-500">{resource.originRealm}</span>
              </div>
            )}

            {/* Date */}
            {resource.creationDate && (
              <div className="flex items-center gap-1.5 ml-auto">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm text-gray-500">{formatDate(resource.creationDate)}</span>
              </div>
            )}
          </div>

          {/* Policy Information - Minimal and scannable */}
          <div className="space-y-2 mb-4">
            {/* COI - Only if present */}
            {resource.COI && resource.COI.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 font-medium">COI:</span>
                <div className="flex flex-wrap gap-1.5">
                  {resource.COI.slice(0, 2).map((coi, idx) => (
                    <span key={`${coi}-${idx}`} className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs font-medium">
                      {coi}
                    </span>
                  ))}
                  {resource.COI.length > 2 && (
                    <span className="text-xs text-gray-500 font-medium">
                      +{resource.COI.length - 2} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* REL TO - Highly condensed */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 font-medium">REL TO:</span>
              <span className="text-gray-700 font-medium">
                {resource.releasabilityTo.slice(0, 4).join(', ')}
                {resource.releasabilityTo.length > 4 && (
                  <span className="text-gray-500"> +{resource.releasabilityTo.length - 4} more</span>
                )}
              </span>
            </div>
          </div>

          {/* Footer: Open Button only */}
          <div className="mt-auto pt-4 border-t border-gray-100">
            <button
              onClick={handleOpenResource}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              title="Open document (Enter)"
              aria-label="Open document"
            >
              Open Document
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          </div>
        </div>
      </article>
    );
  }

  // List View (Horizontal layout)
  if (viewMode === 'list') {
    // Check if multi-KAS (more than 1 KAO)
    const hasMultiKas = resource.encrypted && (resource.kaoCount || 0) > 1;

    return (
      <article className="block group cursor-pointer" data-resource-id={resource.resourceId}>
        <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-blue-400 transition-all duration-150">
          <div className="flex items-center gap-4">
            {/* Left: Classification + Access Status */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Classification */}
              <div className={`px-3 py-1.5 rounded-md text-sm font-bold ${classColors.bg} ${classColors.text} border ${classColors.border}`}>
                {t(`classifications.${resource.classification.toLowerCase()}`)}
              </div>

              {/* Access Indicator */}
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                accessIndicator.status === 'likely' ? 'bg-green-500' :
                accessIndicator.status === 'possible' ? 'bg-yellow-500' :
                'bg-red-500'
              }`} title={accessIndicator.message} />
            </div>

            {/* Center: Title + Metadata */}
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-gray-900 group-hover:text-blue-600 transition-colors truncate mb-1">
                {resource.title}
              </h3>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {/* File Type */}
                {resource.contentType && (
                  <div className="flex items-center gap-1" title={resource.fileExtension || resource.contentType}>
                    <FileTypeBadge
                      contentType={resource.contentType}
                      fileExtension={resource.fileExtension}
                      size="sm"
                      showLabel={false}
                      animated={false}
                    />
                  </div>
                )}
                {/* Multi-KAS */}
                {hasMultiKas && (
                  <span className="text-purple-700 font-medium" title={`${resource.kaoCount} Key Access Objects`}>
                    {resource.kaoCount} KAS
                  </span>
                )}
                {/* Origin */}
                {resource.originRealm && (
                  <span title={`Source: ${resource.originRealm}`}>
                    {instanceFlags[resource.originRealm] || '🌐'} {resource.originRealm}
                  </span>
                )}
                {/* Date */}
                {resource.creationDate && (
                  <span className="hidden md:inline">{formatDate(resource.creationDate)}</span>
                )}
              </div>
            </div>

            {/* Right: COI + REL TO + Open */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {/* COI count */}
              {resource.COI && resource.COI.length > 0 && (
                <div className="hidden lg:flex items-center gap-1.5 text-xs">
                  <span className="text-gray-500 font-medium">COI:</span>
                  <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded font-medium">
                    {resource.COI.length}
                  </span>
                </div>
              )}

              {/* REL TO countries - condensed */}
              <div className="hidden md:flex items-center gap-1.5 text-xs">
                <span className="text-gray-500 font-medium">Rel:</span>
                <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded font-medium">
                  {resource.releasabilityTo.slice(0, 3).join(', ')}
                  {resource.releasabilityTo.length > 3 && ` +${resource.releasabilityTo.length - 3}`}
                </span>
              </div>

              {/* Open Button */}
              <button
                onClick={handleOpenResource}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                title="Open document"
                aria-label="Open document"
              >
                Open
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  // Compact View (Minimal, table-like)
  // Check if multi-KAS (more than 1 KAO)
  const hasMultiKasCompact = resource.encrypted && (resource.kaoCount || 0) > 1;

  return (
    <article className="block group cursor-pointer" data-resource-id={resource.resourceId}>
      <div className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-sm hover:border-blue-400 transition-all duration-150">
        <div className="flex items-center gap-3">
          {/* Left: Classification + Access */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className={`px-2.5 py-1 rounded-md text-xs font-bold ${classColors.bg} ${classColors.text} border ${classColors.border}`}>
              {t(`classifications.${resource.classification.toLowerCase()}`)}
            </div>
            <div className={`w-2 h-2 rounded-full ${
              accessIndicator.status === 'likely' ? 'bg-green-500' :
              accessIndicator.status === 'possible' ? 'bg-yellow-500' :
              'bg-red-500'
            }`} title={accessIndicator.message} />
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
              {resource.title}
            </h3>
          </div>

          {/* Right: Metadata icons + Open */}
          <div className="flex items-center gap-2.5 flex-shrink-0 text-xs text-gray-500">
            {/* File Type */}
            {resource.contentType && (
              <FileTypeBadge
                contentType={resource.contentType}
                fileExtension={resource.fileExtension}
                size="sm"
                showLabel={false}
                animated={false}
              />
            )}
            {/* Multi-KAS */}
            {hasMultiKasCompact && (
              <span className="hidden sm:inline font-medium text-purple-700" title={`${resource.kaoCount} KAS`}>
                {resource.kaoCount} KAS
              </span>
            )}
            {/* Origin */}
            {resource.originRealm && (
              <span className="hidden md:inline" title={`Source: ${resource.originRealm}`}>
                {instanceFlags[resource.originRealm] || '🌐'}
              </span>
            )}

            {/* COI count */}
            {resource.COI && resource.COI.length > 0 && (
              <span className="hidden lg:inline text-purple-700 font-medium">
                COI: {resource.COI.length}
              </span>
            )}

            {/* REL TO count */}
            <span className="hidden lg:inline text-blue-700 font-medium">
              Rel: {resource.releasabilityTo.length}
            </span>

            <button
              onClick={handleOpenResource}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="Open document"
              aria-label="Open document"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </article>
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
