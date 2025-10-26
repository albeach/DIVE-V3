"use client";

import { useStandardsLens } from '@/contexts/StandardsLensContext';
import { AttributeTag } from '@/components/standards/AttributeTag';
import { Shield, Clock, Key, Globe, Lock, FileCheck } from 'lucide-react';

interface IResource {
  resourceId: string;
  title: string;
  classification: string;
  originalClassification?: string;
  originalCountry?: string;
  releasabilityTo: string[];
  COI?: string[];
  encrypted: boolean;
  creationDate?: string;
}

interface IResourceCard5663vs240Props {
  resource: IResource;
  user?: {
    issuer?: string;
    acr?: string;
    amr?: string[];
    auth_time?: number;
    clearance?: string;
    countryOfAffiliation?: string;
    acpCOI?: string[];
  };
  onClick?: () => void;
}

/**
 * Resource Card with 5663 vs 240 Comparison
 * 
 * Displays resource in three modes based on active standards lens:
 * - 5663: Emphasize federation attributes (who can access based on identity)
 * - 240: Emphasize object attributes (how data is protected)
 * - Unified: Show both (default)
 * 
 * In unified mode, shows side-by-side comparison.
 */
export function ResourceCard5663vs240({ resource, user, onClick }: IResourceCard5663vs240Props) {
  const { activeLens, isUnifiedActive } = useStandardsLens();

  if (isUnifiedActive) {
    return <UnifiedView resource={resource} user={user} onClick={onClick} />;
  }

  if (activeLens === '5663') {
    return <FederationView resource={resource} user={user} onClick={onClick} />;
  }

  return <ObjectView resource={resource} onClick={onClick} />;
}

/**
 * Unified View: Side-by-side 5663 + 240
 */
function UnifiedView({ resource, user, onClick }: IResourceCard5663vs240Props) {
  return (
    <div 
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all cursor-pointer"
      onClick={onClick}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-bold text-gray-900 dark:text-gray-100">{resource.title}</h3>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-500">{resource.resourceId}</span>
        </div>
      </div>

      {/* Side-by-side Content */}
      <div className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700">
        {/* Left: Federation (5663) */}
        <div className="p-4 bg-indigo-50/30 dark:bg-indigo-900/10">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="text-xs font-bold text-indigo-900 dark:text-indigo-100">
              Federation (5663)
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <AttributeTag standard="5663" attribute="Issuer" size="xs" showLabel={false} />
              <span className="text-gray-700 dark:text-gray-300 text-xs">
                {user?.issuer?.split('/').pop() || 'N/A'}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <AttributeTag standard="5663" attribute="AAL" size="xs" showLabel={false} />
              <span className="text-gray-700 dark:text-gray-300 text-xs">
                {user?.acr?.toUpperCase() || 'N/A'}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <AttributeTag standard="both" attribute="Clearance" size="xs" showLabel={false} />
              <span className="text-gray-700 dark:text-gray-300 text-xs">
                {user?.clearance || 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Object (240) */}
        <div className="p-4 bg-amber-50/30 dark:bg-amber-900/10">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-bold text-amber-900 dark:text-amber-100">
              Object (240)
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <AttributeTag standard="both" attribute="Class" size="xs" showLabel={false} />
              <span className="text-gray-700 dark:text-gray-300 text-xs">
                {resource.classification}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <AttributeTag standard="240" attribute="ZTDF" size="xs" showLabel={false} />
              <span className="text-gray-700 dark:text-gray-300 text-xs">
                {resource.encrypted ? 'Encrypted' : 'Plain'}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <AttributeTag standard="240" attribute="Release" size="xs" showLabel={false} />
              <span className="text-gray-700 dark:text-gray-300 text-xs">
                {resource.releasabilityTo.slice(0, 2).join(', ')}
                {resource.releasabilityTo.length > 2 && ` +${resource.releasabilityTo.length - 2}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Federation View: Emphasize 5663 attributes
 */
function FederationView({ resource, user, onClick }: IResourceCard5663vs240Props) {
  return (
    <div 
      className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-xl border-2 border-indigo-200 dark:border-indigo-700 shadow-lg hover:shadow-xl transition-all cursor-pointer"
      onClick={onClick}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">{resource.title}</h3>
          <AttributeTag standard="5663" size="sm" />
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Globe className="w-4 h-4 text-indigo-600" />
            <span className="text-gray-700 dark:text-gray-300">
              Issuer: {user?.issuer?.split('/').pop() || 'Unknown'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Shield className="w-4 h-4 text-indigo-600" />
            <span className="text-gray-700 dark:text-gray-300">
              AAL: {user?.acr?.toUpperCase() || 'N/A'}
              {user?.amr && ` (${user.amr.join(' + ')})`}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-indigo-600" />
            <span className="text-gray-700 dark:text-gray-300">
              Auth: {user?.auth_time ? `${Math.floor((Date.now() / 1000 - user.auth_time) / 60)}m ago` : 'N/A'}
            </span>
          </div>
        </div>

        {/* Object details grayed out */}
        <div className="mt-3 pt-3 border-t border-indigo-200 dark:border-indigo-700 opacity-40">
          <span className="text-xs text-gray-500">
            ZTDF details hidden (240 view)
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Object View: Emphasize 240 attributes
 */
function ObjectView({ resource, onClick }: IResourceCard5663vs240Props) {
  return (
    <div 
      className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl border-2 border-amber-200 dark:border-amber-700 shadow-lg hover:shadow-xl transition-all cursor-pointer"
      onClick={onClick}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">{resource.title}</h3>
          <AttributeTag standard="240" size="sm" />
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <FileCheck className="w-4 h-4 text-amber-600" />
            <span className="text-gray-700 dark:text-gray-300">
              Classification: {resource.classification}
              {resource.originalClassification && ` (${resource.originalClassification})`}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Lock className="w-4 h-4 text-amber-600" />
            <span className="text-gray-700 dark:text-gray-300">
              ZTDF: {resource.encrypted ? 'Encrypted' : 'Plaintext'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Key className="w-4 h-4 text-amber-600" />
            <span className="text-gray-700 dark:text-gray-300">
              Releasable to: {resource.releasabilityTo.join(', ')}
            </span>
          </div>
        </div>

        {/* Federation details grayed out */}
        <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-700 opacity-40">
          <span className="text-xs text-gray-500">
            Federation details hidden (5663 view)
          </span>
        </div>
      </div>
    </div>
  );
}

