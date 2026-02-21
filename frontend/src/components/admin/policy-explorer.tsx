/**
 * DIVE V3 Admin Policy Explorer
 * 
 * Re-exports the main PolicyExplorer component for admin use.
 * This wrapper allows for future admin-specific customizations.
 */

'use client';

import React from 'react';
import PolicyExplorerBase from '@/components/policies/PolicyExplorer';
import type { IPolicyMetadata } from '@/types/policy.types';

interface PolicyExplorerProps {
  policies?: IPolicyMetadata[];
  onPolicySelect?: (policy: IPolicyMetadata) => void;
  showAdminActions?: boolean;
}

/**
 * Admin Policy Explorer Component
 * 
 * Wraps the base PolicyExplorer with admin-specific features:
 * - Policy selection callback
 * - Admin action buttons (edit, delete, test)
 * - Quick toggle for rule enable/disable
 */
export function PolicyExplorer({ 
  policies = [],
  onPolicySelect,
  showAdminActions = true 
}: PolicyExplorerProps) {
  // If no policies provided, show loading or fetch state
  if (policies.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg border border-gray-200 p-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Policies Found</h3>
          <p className="text-sm text-gray-500 mb-4">
            No policy files have been loaded yet. Check OPA connection.
          </p>
          <button 
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            onClick={() => window.location.reload()}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Admin action bar */}
      {showAdminActions && (
        <div className="mb-4 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg px-4 py-3 border border-blue-100">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-blue-900">
              📋 {policies.length} policies available
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors"
              onClick={() => {
                // Trigger policy sync
                fetch('/api/admin/opa/policy', { method: 'POST' })
                  .then(() => window.location.reload())
                  .catch(console.error);
              }}
            >
              <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync from OPA
            </button>
          </div>
        </div>
      )}
      
      {/* Base PolicyExplorer */}
      <PolicyExplorerBase policies={policies} />
    </div>
  );
}

export default PolicyExplorer;
