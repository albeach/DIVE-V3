"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';
import { StandardsBadge } from '@/components/standards/StandardsBadge';
import { GitCompare, Shield, Globe, Key, Clock, Lock, CheckCircle } from 'lucide-react';

type PolicyView = 'federation' | 'object' | 'unified' | 'comparison';

/**
 * Policy Comparison Component
 *
 * Compares the modular OPA policy suite:
 * - Federation: ADatP-5663 identity federation checks
 * - Object: ACP-240 data-centric security checks
 * - Unified: dive.authz entrypoint composing all layers
 *
 * Updated to reflect the current modular architecture
 */
export function PolicyComparison() {
  const [activeView, setActiveView] = useState<PolicyView>('unified');

  const policies = [
    {
      id: 'federation',
      name: 'federation_abac_policy.rego',
      package: 'dive.federation',
      standard: '5663' as const,
      description: 'Identity federation and authentication assurance',
      rules: [
        { name: 'is_insufficient_aal', description: 'AAL enforcement (NIST SP 800-63B)', icon: Shield },
        { name: 'is_token_expired', description: 'Token lifetime check (15 min access)', icon: Clock },
        { name: 'is_issuer_not_trusted', description: 'Issuer in trusted federation list', icon: Globe },
        { name: 'is_mfa_not_verified', description: 'MFA verification via amr claims', icon: Lock },
      ],
    },
    {
      id: 'object',
      name: 'object_abac_policy.rego',
      package: 'dive.object',
      standard: '240' as const,
      description: 'Data-centric security and ZTDF enforcement',
      rules: [
        { name: 'is_ztdf_integrity_violation', description: 'ZTDF signature valid (STANAG 4778)', icon: CheckCircle },
        { name: 'is_kas_unavailable', description: 'KAS availability for key release', icon: Key },
        { name: 'is_policy_binding_broken', description: 'Policy hash verification', icon: Lock },
        { name: 'is_encryption_required_but_missing', description: 'Classification requires encryption', icon: Shield },
      ],
    },
    {
      id: 'unified',
      name: 'authz.rego',
      package: 'dive.authz',
      standard: 'both' as const,
      description: 'Unified entrypoint composing all policy layers',
      rules: [
        { name: 'allow', description: 'Primary authorization decision', icon: CheckCircle },
        { name: 'decision', description: 'Structured output with reason & obligations', icon: Shield },
        { name: 'imports acp240', description: 'NATO ACP-240 ABAC rules', icon: Globe },
        { name: 'imports tenant', description: 'Nation-specific configurations', icon: Globe },
        { name: 'imports base', description: 'Core utilities (clearance, COI, country)', icon: Lock },
      ],
    },
  ];

  const currentPolicy = policies.find(p => p.id === activeView) || policies[2];

  return (
    <div className="space-y-4">
      {/* Policy Selector Tabs */}
      <div className="flex flex-wrap gap-2">
        {policies.map(policy => (
          <button
            key={policy.id}
            onClick={() => setActiveView(policy.id as PolicyView)}
            className={`
              relative px-3 py-2 rounded-lg text-sm font-medium transition-all
              ${activeView === policy.id
                ? 'bg-slate-700/50 text-gray-100'
                : 'text-gray-400 hover:text-gray-200 hover:bg-slate-800/50'
              }
            `}
          >
            <StandardsBadge standard={policy.standard} size="sm" />
            {activeView === policy.id && (
              <motion.div
                layoutId="policy-tab-indicator"
                className="absolute inset-0 rounded-lg border border-teal-500/30"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              />
            )}
          </button>
        ))}

        <button
          onClick={() => setActiveView('comparison')}
          className={`
            flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all
            ${activeView === 'comparison'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              : 'text-gray-400 hover:text-gray-200 hover:bg-slate-800/50'
            }
          `}
        >
          <GitCompare className="w-4 h-4" />
          Compare
        </button>
      </div>

      {/* Policy Content */}
      {activeView !== 'comparison' ? (
        <motion.div
          key={activeView}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <div>
              <code className="text-xs font-mono text-teal-400 bg-teal-900/30 px-2 py-0.5 rounded">
                {currentPolicy.package}
              </code>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            {currentPolicy.description}
          </p>

          <div className="space-y-2">
            {currentPolicy.rules.map((rule, index) => {
              const Icon = rule.icon;
              return (
                <motion.div
                  key={rule.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-800/30 border border-slate-700/30"
                >
                  <Icon className="w-4 h-4 text-teal-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-gray-200">
                      {rule.name}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {rule.description}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            {/* 5663 Column */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <StandardsBadge standard="5663" size="sm" />
                <span className="text-xs text-gray-500">Federation</span>
              </div>
              {policies[0].rules.map((rule, i) => {
                const Icon = rule.icon;
                return (
                  <div
                    key={rule.name}
                    className="flex items-center gap-2 p-2 rounded bg-indigo-900/20 border border-indigo-500/20"
                  >
                    <Icon className="w-3 h-3 text-indigo-400" />
                    <span className="font-mono text-[10px] text-indigo-200 truncate">
                      {rule.name}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 240 Column */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <StandardsBadge standard="240" size="sm" />
                <span className="text-xs text-gray-500">Object</span>
              </div>
              {policies[1].rules.map((rule, i) => {
                const Icon = rule.icon;
                return (
                  <div
                    key={rule.name}
                    className="flex items-center gap-2 p-2 rounded bg-amber-900/20 border border-amber-500/20"
                  >
                    <Icon className="w-3 h-3 text-amber-400" />
                    <span className="font-mono text-[10px] text-amber-200 truncate">
                      {rule.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Shared Rules */}
          <div className="pt-3 border-t border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <StandardsBadge standard="both" size="sm" />
              <span className="text-xs text-gray-500">Shared ABAC Kernel</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['is_insufficient_clearance', 'is_not_releasable', 'is_coi_violation'].map(rule => (
                <div
                  key={rule}
                  className="p-2 rounded bg-teal-900/20 border border-teal-500/20 text-center"
                >
                  <span className="font-mono text-[9px] text-teal-200">
                    {rule}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
