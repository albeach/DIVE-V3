"use client";

import { useState } from 'react';
import { HelpCircle, ExternalLink } from 'lucide-react';
import { AttributeTag } from './AttributeTag';

interface ContextualHelpProps {
  field: string;
  standard: '5663' | '240' | 'both';
  specRefs: Array<{ standard: '5663' | '240'; section: string; description: string }>;
  why: string;
}

/**
 * Contextual Help Component
 * 
 * Shows help icon (?) next to form fields with detailed information:
 * - Which standard governs this field
 * - Why it's required
 * - Link to spec section
 * - Link to Integration Guide
 * 
 * Usage:
 * ```tsx
 * <ContextualHelp 
 *   field="clearance"
 *   standard="both"
 *   specRefs={[
 *     { standard: '5663', section: '§4.4', description: 'Required for identity verification' },
 *     { standard: '240', section: '§2.1', description: 'Required for object access control' }
 *   ]}
 *   why="Used in PDP authorization decision"
 * />
 * ```
 */
export function ContextualHelp({ field, standard, specRefs, why }: ContextualHelpProps) {
  const [showPopover, setShowPopover] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShowPopover(true)}
        onMouseLeave={() => setShowPopover(false)}
        onClick={(e) => { e.preventDefault(); setShowPopover(!showPopover); }}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        aria-label={`Help for ${field}`}
      >
        <HelpCircle className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
      </button>

      {showPopover && (
        <div className="absolute left-full ml-2 top-0 w-80 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4">
          {/* Field Name */}
          <div className="flex items-center gap-2 mb-3">
            <h4 className="font-bold text-gray-900 dark:text-gray-100">{field}</h4>
            <AttributeTag standard={standard} size="xs" />
          </div>

          {/* Governed By */}
          <div className="mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
              Governed By
            </div>
            <div className="space-y-2">
              {specRefs.map((ref, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs">
                  <AttributeTag standard={ref.standard} size="xs" showLabel={false} />
                  <div className="flex-1">
                    <div className="font-mono font-bold text-gray-900 dark:text-gray-100">
                      {ref.standard === '5663' ? 'ADatP-5663' : 'ACP-240'} {ref.section}
                    </div>
                    <div className="text-gray-600 dark:text-gray-400 mt-0.5">
                      {ref.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Why Required */}
          <div className="mb-3">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Why Required
            </div>
            <div className="text-xs text-gray-700 dark:text-gray-300">
              {why}
            </div>
          </div>

          {/* Learn More Link */}
          <a
            href="/integration/federation-vs-object"
            target="_blank"
            className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline"
          >
            Learn More in Integration Guide
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}
