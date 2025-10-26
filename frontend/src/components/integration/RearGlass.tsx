"use client";

import { Database, Lock, FileCheck, Shield, CheckCircle, XCircle } from "lucide-react";

interface Resource {
  resourceId: string;
  classification: string;
  originalClassification: string;
  originalCountry: string;
  releasabilityTo: string[];
  COI: string[];
  creationDate: string;
  encrypted: boolean;
  kaoCount: number;
  signatureValid: boolean;
}

interface RearGlassProps {
  resource: Resource;
}

/**
 * Rear Glass Layer Component
 * 
 * Displays object and policy information (ACP-240):
 * - ZTDF structure (resource ID, classification)
 * - Security policy (releasabilityTo, COI)
 * - Encryption status (encrypted, KAO count)
 * - Integrity verification (signature valid)
 * 
 * Design:
 * - Glassmorphism (backdrop-blur-lg, semi-transparent amber background)
 * - Amber color scheme (object model)
 * - Icons for each attribute type
 */
export function RearGlass({ resource }: RearGlassProps) {
  // Parse creation date
  const creationDate = new Date(resource.creationDate);
  const createdAgo = Math.floor((Date.now() - creationDate.getTime()) / 1000 / 60);

  return (
    <div className="h-full bg-amber-500/10 dark:bg-amber-500/20 backdrop-blur-lg border border-amber-300/20 dark:border-amber-500/30 rounded-2xl shadow-2xl p-6 overflow-y-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center shadow-lg">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-amber-900 dark:text-amber-100">
              Object Layer
            </h3>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              ACP-240 (Data-Centric)
            </p>
          </div>
        </div>
      </div>

      {/* ZTDF Attributes */}
      <div className="space-y-4">
        {/* Resource ID */}
        <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3 border border-amber-200/30 dark:border-amber-700/30">
          <div className="flex items-start gap-2">
            <FileCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Resource ID
              </div>
              <div className="text-sm font-mono text-gray-900 dark:text-gray-100">
                {resource.resourceId}
              </div>
            </div>
          </div>
        </div>

        {/* Classification */}
        <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3 border border-amber-200/30 dark:border-amber-700/30">
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Classification
              </div>
              <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-yellow-500 text-yellow-900 shadow-md">
                {resource.classification}
              </div>
              {resource.originalClassification !== resource.classification && (
                <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  Original: {resource.originalClassification} ({resource.originalCountry})
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Releasability */}
        <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3 border border-amber-200/30 dark:border-amber-700/30">
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Releasability To
              </div>
              <div className="flex flex-wrap gap-1.5">
                {resource.releasabilityTo.map((country) => (
                  <span
                    key={country}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200"
                  >
                    {country}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* COI */}
        <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3 border border-amber-200/30 dark:border-amber-700/30">
          <div className="flex items-start gap-2">
            <Database className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Communities of Interest
              </div>
              <div className="flex flex-wrap gap-1.5">
                {resource.COI.map((coi) => (
                  <span
                    key={coi}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200"
                  >
                    {coi}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Encryption Status */}
        <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3 border border-amber-200/30 dark:border-amber-700/30">
          <div className="flex items-start gap-2">
            <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Encryption Status
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Encrypted:</span>
                  <span className={`font-semibold ${resource.encrypted ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}`}>
                    {resource.encrypted ? 'Yes' : 'No'}
                  </span>
                </div>
                {resource.encrypted && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">KAOs:</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {resource.kaoCount}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Signature:</span>
                  <span className="flex items-center gap-1">
                    {resource.signatureValid ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <span className="font-semibold text-green-600 dark:text-green-400">Valid</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                        <span className="font-semibold text-red-600 dark:text-red-400">Invalid</span>
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3 border border-amber-200/30 dark:border-amber-700/30">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            ZTDF Metadata
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Created:</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {createdAgo}m ago
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Format:</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                ZTDF v1.0
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-amber-200/30 dark:border-amber-700/30">
        <div className="text-xs text-amber-700 dark:text-amber-300 text-center">
          Zero Trust Data Format (ACP-240 §5.1)
        </div>
      </div>
    </div>
  );
}

