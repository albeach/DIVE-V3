"use client";

import { useState } from 'react';
import { StandardsBadge } from '@/components/standards/StandardsBadge';
import { FileText, GitCompare } from 'lucide-react';

type PolicyView = 'federation' | 'object' | 'unified' | 'comparison';

/**
 * Policy Comparison Component
 * 
 * Allows switching between 3 OPA policies:
 * - Federation (5663): Emphasizes AAL, token lifetime, issuer trust
 * - Object (240): Emphasizes ZTDF integrity, KAS, crypto binding
 * - Unified: Complete policy (existing)
 * 
 * Comparison mode shows rules side-by-side with highlighting
 */
export function PolicyComparison() {
  const [activeView, setActiveView] = useState<PolicyView>('unified');

  const policies = [
    {
      id: 'federation',
      name: 'federation_abac_policy.rego',
      package: 'dive.federation',
      standard: '5663' as const,
      rules: [
        { name: 'is_insufficient_aal', description: 'AAL enforcement (NIST SP 800-63B)' },
        { name: 'is_token_expired', description: 'Token lifetime check (15 min)' },
        { name: 'is_issuer_not_trusted', description: 'Issuer in trusted federation' },
        { name: 'is_mfa_not_verified', description: 'MFA verification (amr claims)' },
      ],
    },
    {
      id: 'object',
      name: 'object_abac_policy.rego',
      package: 'dive.object',
      standard: '240' as const,
      rules: [
        { name: 'is_ztdf_integrity_violation', description: 'ZTDF signature valid (STANAG 4778)' },
        { name: 'is_kas_unavailable', description: 'KAS availability check' },
        { name: 'is_policy_binding_broken', description: 'Policy hash verification' },
        { name: 'is_encryption_required_but_missing', description: 'Encryption enforcement' },
      ],
    },
    {
      id: 'unified',
      name: 'fuel_inventory_abac_policy.rego',
      package: 'dive.authorization',
      standard: 'both' as const,
      rules: [
        { name: 'is_not_authenticated', description: 'Authentication check' },
        { name: 'is_insufficient_clearance', description: 'Clearance ≥ Classification' },
        { name: 'is_not_releasable_to_country', description: 'Country in releasabilityTo' },
        { name: 'is_coi_violation', description: 'COI intersection check' },
        { name: 'is_under_embargo', description: 'Creation date check' },
        { name: 'is_ztdf_integrity_violation', description: 'ZTDF signature' },
      ],
    },
  ];

  const currentPolicy = policies.find(p => p.id === activeView) || policies[2];

  return (
    <div className="space-y-6">
      {/* Policy Selector */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
          Select OPA Policy View
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {policies.map(policy => (
            <button
              key={policy.id}
              onClick={() => setActiveView(policy.id as PolicyView)}
              className={`
                p-4 rounded-lg border-2 transition-all text-left
                ${activeView === policy.id
                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }
              `}
            >
              <div className="mb-2">
                <StandardsBadge standard={policy.standard} size="sm" />
              </div>
              <div className="font-mono text-xs text-gray-700 dark:text-gray-300 mb-1">
                {policy.name}
              </div>
              <div className="text-xs text-gray-500">
                {policy.rules.length} rules
              </div>
            </button>
          ))}

          <button
            onClick={() => setActiveView('comparison')}
            className={`
              p-4 rounded-lg border-2 transition-all text-left
              ${activeView === 'comparison'
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }
            `}
          >
            <div className="flex items-center gap-2 mb-2 text-purple-600 dark:text-purple-400">
              <GitCompare className="w-5 h-5" />
              <span className="font-bold text-sm">Compare</span>
            </div>
            <div className="text-xs text-gray-700 dark:text-gray-300 mb-1">
              Side-by-side
            </div>
            <div className="text-xs text-gray-500">
              View differences
            </div>
          </button>
        </div>
      </div>

      {/* Policy Content */}
      {activeView !== 'comparison' ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {currentPolicy.name}
            </h3>
            <StandardsBadge standard={currentPolicy.standard} size="sm" />
          </div>

          <div className="space-y-3">
            <div className="text-sm text-gray-700 dark:text-gray-300 mb-4">
              <strong>Package:</strong> <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{currentPolicy.package}</code>
            </div>

            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Policy Rules ({currentPolicy.rules.length})
            </h4>
            <div className="space-y-2">
              {currentPolicy.rules.map(rule => (
                <div
                  key={rule.name}
                  className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="font-mono text-sm text-gray-900 dark:text-gray-100 mb-1">
                    {rule.name}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {rule.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
            <GitCompare className="w-5 h-5" />
            Policy Comparison
          </h3>

          <div className="grid md:grid-cols-2 gap-6">
            {/* 5663 Rules */}
            <div>
              <StandardsBadge standard="5663" size="sm" />
              <div className="mt-4 space-y-2">
                {policies[0].rules.map(rule => (
                  <div key={rule.name} className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded text-xs">
                    <div className="font-mono font-bold text-indigo-900 dark:text-indigo-100">{rule.name}</div>
                    <div className="text-indigo-700 dark:text-indigo-300">{rule.description}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 240 Rules */}
            <div>
              <StandardsBadge standard="240" size="sm" />
              <div className="mt-4 space-y-2">
                {policies[1].rules.map(rule => (
                  <div key={rule.name} className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-xs">
                    <div className="font-mono font-bold text-amber-900 dark:text-amber-100">{rule.name}</div>
                    <div className="text-amber-700 dark:text-amber-300">{rule.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Shared Rules */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <StandardsBadge standard="both" size="sm" />
            <div className="mt-4 grid md:grid-cols-2 gap-2">
              <div className="p-2 bg-teal-50 dark:bg-teal-900/20 rounded text-xs">
                <div className="font-mono font-bold text-teal-900 dark:text-teal-100">is_insufficient_clearance</div>
              </div>
              <div className="p-2 bg-teal-50 dark:bg-teal-900/20 rounded text-xs">
                <div className="font-mono font-bold text-teal-900 dark:text-teal-100">is_not_releasable_to_country</div>
              </div>
              <div className="p-2 bg-teal-50 dark:bg-teal-900/20 rounded text-xs">
                <div className="font-mono font-bold text-teal-900 dark:text-teal-100">is_coi_violation</div>
              </div>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">
              Shared ABAC kernel used by both 5663 and 240 policies
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

