"use client";

import { useState } from 'react';
import { StandardsBadge } from '@/components/standards/StandardsBadge';
import { AttributeTag } from '@/components/standards/AttributeTag';
import { FileText, Shield, Lock, Scale } from 'lucide-react';

/**
 * Resource Detail Tabs Component
 * 
 * Tabs for resource detail view:
 * - [Content]: Document viewer
 * - [🔵 Federation]: Who can access (5663 rules)
 * - [🟠 Object]: How it's protected (240 rules)
 * - [🟢 Decision]: Combined authorization (both)
 */
export function ResourceDetailTabs() {
  const [activeTab, setActiveTab] = useState<'content' | 'federation' | 'object' | 'decision'>('content');

  const tabs = [
    { id: 'content', label: 'Content', icon: FileText },
    { id: 'federation', label: 'Federation', icon: Shield, standard: '5663' as const },
    { id: 'object', label: 'Object', icon: Lock, standard: '240' as const },
    { id: 'decision', label: 'Decision', icon: Scale, standard: 'both' as const },
  ];

  return (
    <div>
      {/* Tab Headers */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`
                flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all
                ${isActive
                  ? 'border-teal-500 text-teal-900 dark:text-teal-100'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }
              `}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.standard && <AttributeTag standard={tab.standard} size="xs" showLabel={false} />}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'federation' && (
        <div className="space-y-4">
          <StandardsBadge standard="5663" />
          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
            <h4 className="font-bold text-indigo-900 dark:text-indigo-100 mb-3">
              Who Can Access (Federation Rules)
            </h4>
            <div className="space-y-2 text-sm text-indigo-800 dark:text-indigo-200">
              <div>✓ Users from trusted IdPs (usa, fra, can, deu, gbr, ...)</div>
              <div>✓ Users with AAL2+ authentication (MFA required)</div>
              <div>✓ Users with clearance ≥ SECRET</div>
              <div>✓ Users from countries in releasabilityTo list</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'object' && (
        <div className="space-y-4">
          <StandardsBadge standard="240" />
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
            <h4 className="font-bold text-amber-900 dark:text-amber-100 mb-3">
              How It's Protected (Object Rules)
            </h4>
            <div className="space-y-2 text-sm text-amber-800 dark:text-amber-200">
              <div>✓ ZTDF structure (policy + payload + encryption info)</div>
              <div>✓ KAS mediation (3 Key Access Objects)</div>
              <div>✓ STANAG 4778 binding (policy hash: 3a7bd3e2...)</div>
              <div>✓ Multi-KAS support (USA, DEU, GBR KAS endpoints)</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'decision' && (
        <div className="space-y-4">
          <StandardsBadge standard="both" />
          <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 rounded-lg p-4">
            <h4 className="font-bold text-teal-900 dark:text-teal-100 mb-3">
              Authorization Decision (Combined)
            </h4>
            <p className="text-sm text-teal-800 dark:text-teal-200">
              This tab shows how federation (5663) and object (240) attributes combine in the PDP
              for the final authorization decision.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
