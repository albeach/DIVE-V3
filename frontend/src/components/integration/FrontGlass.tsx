"use client";

import { Shield, Clock, Key, Globe, Users } from "lucide-react";

interface Subject {
  issuer: string;
  sub: string;
  uniqueID: string;
  clearance: string;
  countryOfAffiliation: string;
  acpCOI: string[];
  auth_time: number;
  acr: string;
  amr: string[];
}

interface FrontGlassProps {
  subject: Subject;
}

/**
 * Front Glass Layer Component
 * 
 * Displays identity and token information (ADatP-5663):
 * - JWT claims (issuer, sub, uniqueID)
 * - Subject attributes (clearance, country, COI)
 * - Authentication context (auth_time, AAL, MFA factors)
 * 
 * Design:
 * - Glassmorphism (backdrop-blur-md, semi-transparent indigo background)
 * - Indigo color scheme (federation model)
 * - Icons for each attribute type
 */
export function FrontGlass({ subject }: FrontGlassProps) {
  // Calculate time since authentication
  const timeSinceAuth = Math.floor((Date.now() / 1000) - subject.auth_time);
  const minutesAgo = Math.floor(timeSinceAuth / 60);

  // Map ACR to AAL level
  const aalLevel = subject.acr.toUpperCase().replace("AAL", "AAL ");

  return (
    <div className="h-full bg-indigo-500/10 dark:bg-indigo-500/20 backdrop-blur-md border border-indigo-300/20 dark:border-indigo-500/30 rounded-2xl shadow-2xl p-6 overflow-y-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center shadow-lg">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-100">
              Identity Layer
            </h3>
            <p className="text-xs text-indigo-700 dark:text-indigo-300">
              ADatP-5663 (Federation)
            </p>
          </div>
        </div>
      </div>

      {/* JWT Claims */}
      <div className="space-y-4">
        {/* Issuer */}
        <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3 border border-indigo-200/30 dark:border-indigo-700/30">
          <div className="flex items-start gap-2">
            <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Issuer
              </div>
              <div className="text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
                {subject.issuer}
              </div>
            </div>
          </div>
        </div>

        {/* Subject ID */}
        <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3 border border-indigo-200/30 dark:border-indigo-700/30">
          <div className="flex items-start gap-2">
            <Key className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Unique ID
              </div>
              <div className="text-sm font-mono text-gray-900 dark:text-gray-100">
                {subject.uniqueID}
              </div>
            </div>
          </div>
        </div>

        {/* Clearance */}
        <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3 border border-indigo-200/30 dark:border-indigo-700/30">
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Clearance
              </div>
              <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-yellow-500 text-yellow-900 shadow-md">
                {subject.clearance}
              </div>
            </div>
          </div>
        </div>

        {/* Country */}
        <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3 border border-indigo-200/30 dark:border-indigo-700/30">
          <div className="flex items-start gap-2">
            <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Country of Affiliation
              </div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {subject.countryOfAffiliation}
              </div>
            </div>
          </div>
        </div>

        {/* COI */}
        <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3 border border-indigo-200/30 dark:border-indigo-700/30">
          <div className="flex items-start gap-2">
            <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Communities of Interest
              </div>
              <div className="flex flex-wrap gap-1.5">
                {subject.acpCOI.map((coi) => (
                  <span
                    key={coi}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200"
                  >
                    {coi}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Authentication Context */}
        <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3 border border-indigo-200/30 dark:border-indigo-700/30">
          <div className="flex items-start gap-2">
            <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Authentication Context
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">AAL:</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {aalLevel}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Auth Time:</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {minutesAgo}m ago
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Methods:</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {subject.amr.join(" + ")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-indigo-200/30 dark:border-indigo-700/30">
        <div className="text-xs text-indigo-700 dark:text-indigo-300 text-center">
          Federation Token (ADatP-5663 §5.1.3)
        </div>
      </div>
    </div>
  );
}
