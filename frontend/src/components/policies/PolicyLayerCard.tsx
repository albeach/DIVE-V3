'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ChevronDown, ChevronRight, FileCode, Shield, Globe } from 'lucide-react';
import { useState } from 'react';
import type { IPolicyMetadata, PolicyLayer, ILayerConfig } from '@/types/policy.types';
import { LAYER_CONFIGS, TENANT_CONFIGS } from '@/types/policy.types';

interface PolicyLayerCardProps {
  layer: PolicyLayer;
  policies: IPolicyMetadata[];
  index: number;
}

export default function PolicyLayerCard({ layer, policies, index }: PolicyLayerCardProps) {
  const [isExpanded, setIsExpanded] = useState(layer === 'entrypoints');
  const config = LAYER_CONFIGS[layer];

  const totalRules = policies.reduce((sum, p) => sum + p.ruleCount, 0);
  const totalTests = policies.reduce((sum, p) => sum + p.testCount, 0);

  // Group tenant policies by tenant code
  const byTenant = policies.reduce((acc, policy) => {
    const key = policy.tenant || 'common';
    if (!acc[key]) acc[key] = [];
    acc[key].push(policy);
    return acc;
  }, {} as Record<string, IPolicyMetadata[]>);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`
        rounded-xl border backdrop-blur-sm overflow-hidden
        ${config.bgColor} ${config.borderColor}
        dark:bg-opacity-40
      `}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          w-full px-5 py-4 flex items-center justify-between
          hover:bg-white/5 transition-colors
        `}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{config.icon}</span>
          <div className="text-left">
            <h3 className={`font-semibold ${config.color}`}>
              {config.name}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {config.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Stats badges */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="px-2 py-1 rounded-md bg-white/10 text-xs font-mono">
              {policies.length} policies
            </span>
            <span className="px-2 py-1 rounded-md bg-white/10 text-xs font-mono">
              {totalRules} rules
            </span>
          </div>

          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="border-t border-white/10"
        >
          {layer === 'tenant' ? (
            // Special rendering for tenant layer - group by country
            <div className="p-4 space-y-4">
              {Object.entries(byTenant).map(([tenant, tenantPolicies]) => (
                <div key={tenant} className="space-y-2">
                  {tenant !== 'common' && (
                    <div className="flex items-center gap-2 px-2">
                      <span className="text-lg">
                        {TENANT_CONFIGS[tenant as keyof typeof TENANT_CONFIGS]?.flag || '🌐'}
                      </span>
                      <span className="text-sm font-medium text-gray-300">
                        {TENANT_CONFIGS[tenant as keyof typeof TENANT_CONFIGS]?.name || tenant}
                      </span>
                    </div>
                  )}
                  <div className="grid gap-2">
                    {tenantPolicies.map((policy) => (
                      <PolicyListItem key={policy.policyId} policy={policy} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Regular rendering for other layers
            <div className="p-4 grid gap-2">
              {policies.map((policy) => (
                <PolicyListItem key={policy.policyId} policy={policy} />
              ))}
            </div>
          )}

          {/* Layer Stats Footer */}
          <div className="px-5 py-3 bg-black/20 border-t border-white/5 flex items-center justify-between text-xs">
            <span className="text-gray-500">
              {totalTests} test cases across {policies.length} modules
            </span>
            {policies.some(p => p.natoCompliance.length > 0) && (
              <div className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-cyan-400" />
                <span className="text-cyan-400/80">NATO Compliant</span>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function PolicyListItem({ policy }: { policy: IPolicyMetadata }) {
  return (
    <Link
      href={`/policies/${policy.policyId}`}
      className="
        group flex items-center justify-between px-4 py-3
        rounded-lg bg-white/5 hover:bg-white/10
        border border-transparent hover:border-white/10
        transition-all
      "
    >
      <div className="flex items-center gap-3 min-w-0">
        <FileCode className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-200 truncate">
              {policy.name}
            </span>
            {policy.tenant && (
              <span className="text-xs">
                {TENANT_CONFIGS[policy.tenant]?.flag}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 font-mono truncate">
            {policy.package}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
          <span>{policy.ruleCount} rules</span>
          <span>•</span>
          <span>{policy.testCount} tests</span>
        </div>

        {policy.natoCompliance.length > 0 && (
          <div className="flex gap-1">
            {policy.natoCompliance.slice(0, 2).map((c) => (
              <span
                key={c}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-900/30 text-cyan-300"
              >
                {c.replace('STANAG ', '').replace('ADatP-', '')}
              </span>
            ))}
          </div>
        )}

        <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
      </div>
    </Link>
  );
}

