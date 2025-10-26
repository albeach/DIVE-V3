"use client";

import { StandardsBadge } from '@/components/standards/StandardsBadge';
import { AttributeTag } from '@/components/standards/AttributeTag';
import { X } from 'lucide-react';

interface IUser {
  issuer?: string;
  uniqueID?: string | null;
  clearance?: string | null;
  countryOfAffiliation?: string | null;
  acpCOI?: string[];
  dutyOrg?: string;
  orgUnit?: string;
  authTime?: number;
  acr?: string;
  amr?: string[];
}

/**
 * User Attributes Standards Breakdown Modal
 * 
 * Shows user attributes organized by governing standard:
 * - 🔵 Federation (5663): issuer, uniqueID, auth_time, AAL, amr
 * - 🟠 Object (240): dutyOrg, orgUnit (for organization-based policies)
 * - 🟢 Shared (Both): clearance, country, COI
 */
export function UserAttributesStandardsBreakdown({ user, onClose }: { user: IUser; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white p-6 rounded-t-xl relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-2xl font-bold mb-2">Your Attributes by Standard</h2>
          <p className="text-sm text-teal-100">See which NATO standard governs each of your identity attributes</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Federation (5663) */}
          <div>
            <StandardsBadge standard="5663" />
            <div className="mt-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
              <div className="space-y-3">
                <AttributeRow 
                  label="Issuer" 
                  value={user.issuer || 'N/A'} 
                  standard="5663"
                  specRef="§4.4"
                  description="Your home IdP in the federation"
                />
                <AttributeRow 
                  label="Unique ID" 
                  value={user.uniqueID || 'N/A'} 
                  standard="5663"
                  specRef="§4.4"
                  description="Globally unique identifier (issuer + local ID)"
                />
                <AttributeRow 
                  label="Auth Time" 
                  value={user.authTime ? new Date(user.authTime * 1000).toLocaleString() : 'N/A'} 
                  standard="5663"
                  specRef="§5.1.3"
                  description="When you authenticated (for token lifetime validation)"
                />
                <AttributeRow 
                  label="AAL" 
                  value={user.acr?.toUpperCase() || 'N/A'} 
                  standard="5663"
                  specRef="§5.1.2"
                  description="Authentication Assurance Level (AAL1/2/3)"
                />
                <AttributeRow 
                  label="Auth Methods (amr)" 
                  value={user.amr?.join(' + ') || 'N/A'} 
                  standard="5663"
                  specRef="§5.1.2"
                  description="MFA factors used (pwd, otp, hwtoken)"
                />
              </div>
            </div>
          </div>

          {/* Object (240) */}
          <div>
            <StandardsBadge standard="240" />
            <div className="mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
              <div className="space-y-3">
                <AttributeRow 
                  label="Duty Organization" 
                  value={user.dutyOrg || 'N/A'} 
                  standard="240"
                  specRef="§2.1"
                  description="Your organizational affiliation (e.g., US_ARMY, FR_DEFENSE)"
                />
                <AttributeRow 
                  label="Organizational Unit" 
                  value={user.orgUnit || 'N/A'} 
                  standard="240"
                  specRef="§2.1"
                  description="Your unit within organization (e.g., CYBER_DEFENSE)"
                />
              </div>
            </div>
          </div>

          {/* Shared (Both) */}
          <div>
            <StandardsBadge standard="both" />
            <div className="mt-4 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 rounded-lg p-4">
              <div className="space-y-3">
                <AttributeRow 
                  label="Clearance" 
                  value={user.clearance || 'N/A'} 
                  standard="both"
                  specRef="§4.4 (5663), §2.1 (240)"
                  description="Used by BOTH: 5663 for identity, 240 for object access"
                />
                <AttributeRow 
                  label="Country of Affiliation" 
                  value={user.countryOfAffiliation || 'N/A'} 
                  standard="both"
                  specRef="§4.4 (5663), §2.1 (240)"
                  description="Used by BOTH: 5663 citizenship, 240 releasability"
                />
                <AttributeRow 
                  label="COI Membership" 
                  value={user.acpCOI?.join(', ') || 'N/A'} 
                  standard="both"
                  specRef="§4.4 (5663), §2.1 (240)"
                  description="Used by BOTH: 5663 attribute exchange, 240 COI-based keys"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttributeRow({ label, value, standard, specRef, description }: {
  label: string;
  value: string;
  standard: '5663' | '240' | 'both';
  specRef: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
          <AttributeTag standard={standard} attribute={specRef} size="xs" />
        </div>
        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</div>
        <div className="text-xs text-gray-500 mt-1">{description}</div>
      </div>
    </div>
  );
}

