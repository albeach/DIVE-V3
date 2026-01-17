'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Layers,
  GitBranch,
  Sparkles,
  BookOpen,
  AlertTriangle,
  RefreshCw,
  ArrowRight
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { IPolicyHierarchy, PolicyLayer } from '@/types/policy.types';
import { LAYER_CONFIGS } from '@/types/policy.types';
import PolicyBundleHeader from '@/components/policies/PolicyBundleHeader';
import PolicyHierarchyTree from '@/components/policies/PolicyHierarchyTree';
import PolicyDependencyGraph from '@/components/policies/PolicyDependencyGraph';
import PolicyLayerCard from '@/components/policies/PolicyLayerCard';
import { PolicyComparison } from '@/components/policies/PolicyComparison';

interface PoliciesPageClientProps {
  hierarchy: IPolicyHierarchy | null;
}

type ViewMode = 'layers' | 'tree' | 'graph';

export default function PoliciesPageClient({ hierarchy }: PoliciesPageClientProps) {
  const { t } = useTranslation('policies');
  const [viewMode, setViewMode] = useState<ViewMode>('layers');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Error state when hierarchy fetch failed
  if (!hierarchy) {
    return (
      <div className="min-h-[600px] flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-200 mb-2">
            {t('error.unableToLoad')}
          </h2>
          <p className="text-gray-500 mb-6">
            {t('error.backendConnection')}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-200 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  const layerOrder: PolicyLayer[] = ['entrypoints', 'org', 'tenant', 'base', 'standalone'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-8">
        {/* Hero Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-300 text-xs font-medium mb-3">
                <BookOpen className="w-3 h-3" />
                Policy Library
              </div>
              <h1 className="text-3xl lg:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-400 mb-3">
                Authorization Policy Suite
              </h1>
              <p className="text-gray-400 max-w-2xl leading-relaxed">
                Explore the modular OPA policies powering DIVE's coalition ABAC engine.
                Navigate the policy hierarchy, visualize dependencies, and dive into rule details.
              </p>
            </div>

            {/* CTA to Sandbox */}
            <div className="flex flex-col gap-3">
              <Link
                href="/policies/sandbox"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-sm font-semibold transition-all hover:from-cyan-400 hover:to-purple-500 shadow-lg shadow-cyan-500/25 group"
              >
                <Sparkles className="w-5 h-5" />
                Open Policy Sandbox
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <p className="text-xs text-gray-500 text-center">
                Create, test, and refine custom policies
              </p>
            </div>
          </div>

          {/* Bundle Header */}
          <PolicyBundleHeader hierarchy={hierarchy} />
        </motion.div>

        {/* View Mode Tabs */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-2 mb-6"
        >
          <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
            <ViewTab
              icon={<Layers className="w-4 h-4" />}
              label="Layers"
              isActive={viewMode === 'layers'}
              onClick={() => setViewMode('layers')}
            />
            <ViewTab
              icon={<BookOpen className="w-4 h-4" />}
              label="Tree"
              isActive={viewMode === 'tree'}
              onClick={() => setViewMode('tree')}
            />
            <ViewTab
              icon={<GitBranch className="w-4 h-4" />}
              label="Graph"
              isActive={viewMode === 'graph'}
              onClick={() => setViewMode('graph')}
            />
          </div>

          <div className="flex-1" />

          {/* Layer Quick Stats */}
          <div className="hidden lg:flex items-center gap-3">
            {layerOrder.map(layer => {
              const count = hierarchy.stats.byLayer[layer];
              if (count === 0) return null;
              const config = LAYER_CONFIGS[layer];
              return (
                <div key={layer} className="flex items-center gap-1.5">
                  <span className="text-sm">{config.icon}</span>
                  <span className={`text-xs font-medium ${config.color}`}>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Main Content Area */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {viewMode === 'layers' && (
            <div className="space-y-4">
              {layerOrder.map((layer, index) => {
                const policies = hierarchy.layers[layer];
                if (policies.length === 0) return null;
                return (
                  <PolicyLayerCard
                    key={layer}
                    layer={layer}
                    policies={policies}
                    index={index}
                  />
                );
              })}
            </div>
          )}

          {viewMode === 'tree' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <PolicyHierarchyTree hierarchy={hierarchy} />
              </div>
              <div className="lg:col-span-2">
                <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-6">
                  <h3 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-teal-400" />
                    Policy Architecture
                  </h3>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <p className="text-gray-400">
                      The DIVE V3 policy suite follows a modular, layered architecture:
                    </p>
                    <ul className="space-y-3 mt-4">
                      <li className="flex items-start gap-3">
                        <span className="text-lg">🎯</span>
                        <div>
                          <strong className="text-purple-400">Entrypoints</strong>
                          <span className="text-gray-400"> - Primary decision endpoints that compose all layers</span>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-lg">🏛️</span>
                        <div>
                          <strong className="text-blue-400">Organization</strong>
                          <span className="text-gray-400"> - NATO/FVEY organizational rules (ACP-240, STANAG)</span>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-lg">🌍</span>
                        <div>
                          <strong className="text-teal-400">Tenant</strong>
                          <span className="text-gray-400"> - Nation-specific configurations (USA, FRA, GBR, DEU)</span>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-lg">🧱</span>
                        <div>
                          <strong className="text-amber-400">Base</strong>
                          <span className="text-gray-400"> - Core utilities: clearance, COI, country, time functions</span>
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {viewMode === 'graph' && (
            <PolicyDependencyGraph hierarchy={hierarchy} />
          )}
        </motion.div>

        {/* Policy Comparison Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          {/* Policy Comparison */}
          <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-200">
                Policy Standards Comparison
              </h3>
              <span className="text-xs text-gray-500 font-mono">
                NATO Standards
              </span>
            </div>
            <PolicyComparison />
          </div>

          {/* Why Rego Info */}
          <div className="bg-gradient-to-br from-teal-900/20 to-cyan-900/10 rounded-xl border border-teal-500/20 p-6">
            <h3 className="text-lg font-semibold text-teal-300 mb-3 flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Why Rego?
            </h3>
            <p className="text-sm text-gray-300 mb-4 leading-relaxed">
              Rego lets us encode ACP-240 rules as readable, testable logic. Each violation
              function mirrors a real coalition guardrail: authentication, clearance,
              releasability, COI, embargo, and ZTDF integrity.
            </p>
            <ul className="text-sm text-gray-400 space-y-2">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                Default deny with explicit violation checks
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                Structured JSON output with KAS obligations
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                {hierarchy.stats.totalTests}+ automated tests via <code className="text-teal-300">opa test</code>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                Modular architecture for coalition extensibility
              </li>
            </ul>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

interface ViewTabProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function ViewTab({ icon, label, isActive, onClick }: ViewTabProps) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
        transition-all duration-200
        ${isActive
          ? 'bg-teal-500/20 text-teal-300 shadow-sm'
          : 'text-gray-400 hover:text-gray-200 hover:bg-slate-700/30'
        }
      `}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

