/**
 * DIVE V3 - Bundle Scope Selector
 *
 * Multi-select component for choosing policy scopes to include in a bundle.
 * Supports required scopes that cannot be deselected.
 *
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  Globe,
  Lock,
  CheckSquare,
  Square,
  Info,
} from 'lucide-react';
import { POLICY_SCOPES } from '@/types/federation.types';

interface BundleScopeSelectorProps {
  selectedScopes: string[];
  onScopesChange: (scopes: string[]) => void;
  disabled?: boolean;
  showDescriptions?: boolean;
}

const SCOPE_ICONS: Record<string, typeof Shield> = {
  'policy:base': Lock,
  'policy:fvey': Globe,
  'policy:nato': Shield,
};

const COUNTRY_FLAGS: Record<string, string> = {
  'policy:usa': '🇺🇸',
  'policy:fra': '🇫🇷',
  'policy:gbr': '🇬🇧',
  'policy:deu': '🇩🇪',
  'policy:nzl': '🇳🇿',
  'policy:aus': '🇦🇺',
  'policy:can': '🇨🇦',
};

export function BundleScopeSelector({
  selectedScopes,
  onScopesChange,
  disabled = false,
  showDescriptions = true,
}: BundleScopeSelectorProps) {
  const handleToggle = (scopeId: string, isRequired: boolean) => {
    if (disabled || isRequired) return;

    if (selectedScopes.includes(scopeId)) {
      onScopesChange(selectedScopes.filter((s) => s !== scopeId));
    } else {
      onScopesChange([...selectedScopes, scopeId]);
    }
  };

  const handleSelectAll = () => {
    if (disabled) return;
    onScopesChange(POLICY_SCOPES.map((s) => s.id));
  };

  const handleDeselectOptional = () => {
    if (disabled) return;
    const requiredScopes = POLICY_SCOPES.filter((s) => s.required).map((s) => s.id);
    onScopesChange(requiredScopes);
  };

  // Group scopes
  const coreScopes = POLICY_SCOPES.filter((s) => s.required || ['policy:fvey', 'policy:nato'].includes(s.id));
  const tenantScopes = POLICY_SCOPES.filter((s) => !s.required && !['policy:fvey', 'policy:nato'].includes(s.id));

  return (
    <div className="space-y-4">
      {/* Quick Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-600" />
          <span className="font-medium text-slate-800">Select Policy Scopes</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSelectAll}
            disabled={disabled}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
          >
            Select All
          </button>
          <span className="text-slate-300">|</span>
          <button
            type="button"
            onClick={handleDeselectOptional}
            disabled={disabled}
            className="text-sm text-slate-600 hover:text-slate-700 font-medium disabled:opacity-50"
          >
            Required Only
          </button>
        </div>
      </div>

      {/* Core Scopes */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Core Policies
        </h4>
        <div className="grid gap-2">
          {coreScopes.map((scope, index) => {
            const isSelected = selectedScopes.includes(scope.id);
            const Icon = SCOPE_ICONS[scope.id] || Shield;

            return (
              <motion.button
                key={scope.id}
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => handleToggle(scope.id, !!scope.required)}
                disabled={disabled || scope.required}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                  scope.required
                    ? 'bg-blue-50 border-blue-200 cursor-not-allowed'
                    : isSelected
                    ? 'bg-emerald-50 border-emerald-300 hover:border-emerald-400'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                } ${disabled ? 'opacity-60' : ''}`}
              >
                <div className={`mt-0.5 ${
                  scope.required ? 'text-blue-500' : isSelected ? 'text-emerald-500' : 'text-slate-400'
                }`}>
                  {scope.required ? (
                    <CheckSquare className="w-5 h-5" />
                  ) : isSelected ? (
                    <CheckSquare className="w-5 h-5" />
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${
                      scope.required ? 'text-blue-600' : isSelected ? 'text-emerald-600' : 'text-slate-500'
                    }`} />
                    <span className={`font-medium ${
                      scope.required ? 'text-blue-800' : isSelected ? 'text-emerald-800' : 'text-slate-700'
                    }`}>
                      {scope.label}
                    </span>
                    {scope.required && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                        Required
                      </span>
                    )}
                  </div>
                  {showDescriptions && (
                    <p className="text-sm text-slate-500 mt-1">{scope.description}</p>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Tenant Scopes */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Tenant Policies
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {tenantScopes.map((scope, index) => {
            const isSelected = selectedScopes.includes(scope.id);
            const flag = COUNTRY_FLAGS[scope.id];

            return (
              <motion.button
                key={scope.id}
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (coreScopes.length + index) * 0.05 }}
                onClick={() => handleToggle(scope.id, false)}
                disabled={disabled}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                  isSelected
                    ? 'bg-emerald-50 border-emerald-300 hover:border-emerald-400'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className={`${isSelected ? 'text-emerald-500' : 'text-slate-400'}`}>
                  {isSelected ? (
                    <CheckSquare className="w-5 h-5" />
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                </div>

                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {flag && <span className="text-xl">{flag}</span>}
                  <span className={`font-medium truncate ${
                    isSelected ? 'text-emerald-800' : 'text-slate-700'
                  }`}>
                    {scope.label}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Selection Summary */}
      <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
        <Info className="w-4 h-4 text-slate-500" />
        <span className="text-sm text-slate-600">
          <strong>{selectedScopes.length}</strong> of {POLICY_SCOPES.length} scopes selected
        </span>
      </div>
    </div>
  );
}

export default BundleScopeSelector;

