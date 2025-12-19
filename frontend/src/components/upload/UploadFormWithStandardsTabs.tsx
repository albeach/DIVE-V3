"use client";

import { useState } from 'react';
import { AttributeTag, AttributeTagGroup } from '@/components/standards/AttributeTag';
import { StandardsBadge } from '@/components/standards/StandardsBadge';
import { FileText, Shield, Lock, Eye } from 'lucide-react';

/**
 * Upload Form with Standards Tabs
 * 
 * Tabbed upload form showing which fields belong to which standard:
 * - [Basic Info]: File selection, title
 * - [🔵 Federation (5663)]: Issuer, AAL context (auto-populated)
 * - [🟠 Object (240)]: Classification, releasability, encryption, KAS
 * - [Preview]: Final ZTDF structure with color-coded JSON
 * 
 * Educational: Users learn which standard governs each field
 */
export function UploadFormWithStandardsTabs() {
  const [activeTab, setActiveTab] = useState<'basic' | 'federation' | 'object' | 'preview'>('basic');
  
  // Mock user context (would come from session)
  const userContext = {
    issuer: 'dive-v3-usa',
    aal: 'AAL2',
    authTime: '5m ago',
    amr: ['pwd', 'otp'],
  };

  const tabs = [
    { id: 'basic', label: 'Basic Info', icon: FileText },
    { id: 'federation', label: 'Federation (5663)', icon: Shield, badge: '5663' as const },
    { id: 'object', label: 'Object (240)', icon: Lock, badge: '240' as const },
    { id: 'preview', label: 'Preview', icon: Eye },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg">
      {/* Tab Headers */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`
                  flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all
                  ${isActive
                    ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white border-b-2 border-teal-600'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge && <AttributeTag standard={tab.badge} size="xs" showLabel={false} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'basic' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select File
              </label>
              <input
                type="file"
                className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 dark:bg-gray-700 dark:text-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Document Title
              </label>
              <input
                type="text"
                placeholder="Enter document title"
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
        )}

        {activeTab === 'federation' && (
          <div className="space-y-6">
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-bold text-indigo-900 dark:text-indigo-100">
                  Federation Context (ADatP-5663)
                </h3>
              </div>
              <p className="text-sm text-indigo-800 dark:text-indigo-200 mb-4">
                These attributes are automatically populated from your authentication session.
                They determine WHO can access the document based on federation rules.
              </p>
            </div>

            {/* Auto-populated fields */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Issuer (IdP)
                  </label>
                  <AttributeTag standard="5663" attribute="§4.4" size="xs" />
                </div>
                <input
                  type="text"
                  value={userContext.issuer}
                  disabled
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                />
                <p className="text-xs text-gray-500 mt-1">Auto-detected from your login session</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Authentication Assurance Level (AAL)
                  </label>
                  <AttributeTag standard="5663" attribute="§5.1.2" size="xs" />
                </div>
                <input
                  type="text"
                  value={`${userContext.aal} (${userContext.amr.join(' + ')})`}
                  disabled
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                />
                <p className="text-xs text-gray-500 mt-1">Based on your MFA authentication</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Authentication Time
                  </label>
                  <AttributeTag standard="5663" attribute="§5.1.3" size="xs" />
                </div>
                <input
                  type="text"
                  value={userContext.authTime}
                  disabled
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                />
                <p className="text-xs text-gray-500 mt-1">Token lifetime tracking (max 15 minutes)</p>
              </div>
            </div>

            <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 rounded-lg p-4">
              <p className="text-sm text-teal-800 dark:text-teal-200">
                <strong>Note:</strong> Clearance and Country are <strong>shared attributes</strong> (used by both 5663 and 240).
                You'll set these in the Basic Info or Object tabs.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'object' && (
          <div className="space-y-6">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <h3 className="font-bold text-amber-900 dark:text-amber-100">
                  Object Security (ACP-240)
                </h3>
              </div>
              <p className="text-sm text-amber-800 dark:text-amber-200 mb-4">
                These attributes define HOW the document is protected and WHAT data policies apply.
                They create the ZTDF structure with cryptographic binding.
              </p>
            </div>

            {/* User-configured fields */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Classification Level
                  </label>
                  <AttributeTag standard="both" attribute="§4" size="xs" />
                </div>
                <select className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
                  <option>UNCLASSIFIED</option>
                  <option>CONFIDENTIAL</option>
                  <option>SECRET</option>
                  <option>TOP_SECRET</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Determines minimum clearance required (used by both standards)</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Releasability To (Countries)
                  </label>
                  <AttributeTag standard="240" attribute="§5.1" size="xs" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {['USA', 'GBR', 'CAN', 'FRA', 'DEU'].map(country => (
                    <label key={country} className="inline-flex items-center gap-1 px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                      <input type="checkbox" className="rounded" />
                      <span className="text-sm">{country}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">Controls which nations can access (ACP-240 ZTDF policy)</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Communities of Interest (COI)
                  </label>
                  <AttributeTag standard="240" attribute="§5.1" size="xs" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {['FVEY', 'NATO', 'US-ONLY', 'CAN-US'].map(coi => (
                    <label key={coi} className="inline-flex items-center gap-1 px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                      <input type="checkbox" className="rounded" />
                      <span className="text-sm">{coi}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">Enables COI-based key selection (ACP-240 Multi-KAS)</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Encryption
                  </label>
                  <AttributeTag standard="240" attribute="§5.2" size="xs" />
                </div>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="encryption" value="yes" defaultChecked />
                    <span className="text-sm">Yes (KAS-mediated)</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="encryption" value="no" />
                    <span className="text-sm">No (Plaintext)</span>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-1">Encrypted resources require KAS for access (ACP-240 §5.2)</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    KAS Selection
                  </label>
                  <AttributeTag standard="240" attribute="§5.3" size="xs" />
                </div>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="kas" value="auto" defaultChecked />
                    <span className="text-sm">Auto (COI-based keys)</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="kas" value="manual" />
                    <span className="text-sm">Manual (select KAS)</span>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-1">Auto mode uses Multi-KAS with COI-based community keys</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-3">
                Final ZTDF Structure
              </h4>
              <pre className="text-xs font-mono overflow-x-auto">
                <code>
{`{
  `}<span className="text-amber-600">"policySection"</span>{`: {          `}<AttributeTag standard="240" size="xs" />{`
    `}<span className="text-teal-600">"classification"</span>{`: "SECRET",  `}<AttributeTag standard="both" size="xs" />{`
    `}<span className="text-amber-600">"releasabilityTo"</span>{`: ["USA"], `}<AttributeTag standard="240" size="xs" />{`
    `}<span className="text-amber-600">"COI"</span>{`: ["FVEY"]              `}<AttributeTag standard="240" size="xs" />{`
  },
  `}<span className="text-amber-600">"payloadSection"</span>{`: {        `}<AttributeTag standard="240" size="xs" />{`
    `}<span className="text-amber-600">"encrypted"</span>{`: true,
    `}<span className="text-amber-600">"algorithm"</span>{`: "AES-256-GCM"
  },
  `}<span className="text-indigo-600">"metadata"</span>{`: {              `}<AttributeTag standard="5663" size="xs" />{`
    `}<span className="text-indigo-600">"issuer"</span>{`: "dive-v3-usa",
    `}<span className="text-indigo-600">"aal"</span>{`: "AAL2",
    `}<span className="text-indigo-600">"authTime"</span>{`: 1698345600
  }
}`}
                </code>
              </pre>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-3">
                <AttributeTag standard="5663" size="sm" />
                <p className="text-xs text-indigo-800 dark:text-indigo-200 mt-2">
                  3 federation attributes
                </p>
              </div>
              <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 rounded-lg p-3">
                <AttributeTag standard="both" size="sm" />
                <p className="text-xs text-teal-800 dark:text-teal-200 mt-2">
                  1 shared attribute
                </p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                <AttributeTag standard="240" size="sm" />
                <p className="text-xs text-amber-800 dark:text-amber-200 mt-2">
                  4 object attributes
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
