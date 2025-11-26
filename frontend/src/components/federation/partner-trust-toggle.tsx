'use client';

/**
 * Partner Trust Toggle Component
 * 
 * Allows federation administrators to view and toggle
 * trusted partners for their instance. For pilot mode,
 * this is a UI demonstration - changes are logged but
 * require backend sync to take effect.
 */

import React, { useState, useEffect } from 'react';
import { getFlagComponent } from '../ui/flags';

interface FederationPartner {
  code: string;
  name: string;
  status: 'trusted' | 'pending' | 'disabled';
  federation_type: 'oidc' | 'saml';
  last_sync?: string;
}

interface PartnerTrustToggleProps {
  instanceCode: string;
  onTrustChange?: (partnerCode: string, trusted: boolean) => void;
  className?: string;
}

// Default partners for pilot mode
const PILOT_PARTNERS: FederationPartner[] = [
  { code: 'USA', name: 'United States', status: 'trusted', federation_type: 'oidc' },
  { code: 'FRA', name: 'France', status: 'trusted', federation_type: 'oidc' },
  { code: 'DEU', name: 'Germany', status: 'trusted', federation_type: 'oidc' },
  { code: 'GBR', name: 'United Kingdom', status: 'pending', federation_type: 'oidc' },
  { code: 'CAN', name: 'Canada', status: 'disabled', federation_type: 'oidc' },
];

const STATUS_STYLES = {
  trusted: { 
    badge: 'bg-green-100 text-green-800 border-green-200',
    dot: 'bg-green-500',
    label: 'Trusted'
  },
  pending: { 
    badge: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    dot: 'bg-yellow-500',
    label: 'Pending'
  },
  disabled: { 
    badge: 'bg-gray-100 text-gray-600 border-gray-200',
    dot: 'bg-gray-400',
    label: 'Disabled'
  },
};

export default function PartnerTrustToggle({ 
  instanceCode, 
  onTrustChange,
  className = '' 
}: PartnerTrustToggleProps) {
  const [partners, setPartners] = useState<FederationPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingChanges, setPendingChanges] = useState<string[]>([]);
  
  useEffect(() => {
    // In pilot mode, use default partners excluding self
    const filteredPartners = PILOT_PARTNERS.filter(p => p.code !== instanceCode);
    setPartners(filteredPartners);
    setLoading(false);
  }, [instanceCode]);
  
  const handleToggle = (partnerCode: string) => {
    setPartners(prev => prev.map(p => {
      if (p.code === partnerCode) {
        const newStatus = p.status === 'trusted' ? 'disabled' : 'trusted';
        
        // Track pending change
        setPendingChanges(changes => {
          if (changes.includes(partnerCode)) {
            return changes.filter(c => c !== partnerCode);
          }
          return [...changes, partnerCode];
        });
        
        // Callback
        onTrustChange?.(partnerCode, newStatus === 'trusted');
        
        return { ...p, status: newStatus };
      }
      return p;
    }));
  };
  
  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div className={`${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Federation Partners
        </h3>
        {pendingChanges.length > 0 && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
            {pendingChanges.length} unsaved change{pendingChanges.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      
      {/* Pilot Mode Notice */}
      <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
          <span className="text-sm text-purple-800 font-medium">Pilot Mode</span>
        </div>
        <p className="text-xs text-purple-600 mt-1">
          Trust changes are simulated for demonstration. In production, 
          changes require approval workflow.
        </p>
      </div>
      
      {/* Partner List */}
      <div className="space-y-2">
        {partners.map(partner => {
          const FlagIcon = getFlagComponent(partner.code);
          const statusStyle = STATUS_STYLES[partner.status];
          const isPending = partner.status === 'pending';
          const hasChange = pendingChanges.includes(partner.code);
          
          return (
            <div 
              key={partner.code}
              className={`
                flex items-center justify-between p-3 rounded-lg border
                ${hasChange ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}
                transition-all duration-200
              `}
            >
              <div className="flex items-center gap-3">
                <FlagIcon size={32} />
                <div>
                  <div className="font-medium text-gray-900">{partner.name}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    <span className="uppercase">{partner.federation_type}</span>
                    {partner.last_sync && (
                      <>
                        <span>•</span>
                        <span>Synced {partner.last_sync}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {/* Status Badge */}
                <span className={`
                  text-xs font-medium px-2 py-1 rounded border
                  ${statusStyle.badge}
                  flex items-center gap-1.5
                `}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                  {statusStyle.label}
                </span>
                
                {/* Toggle Switch */}
                {!isPending && (
                  <button
                    onClick={() => handleToggle(partner.code)}
                    className={`
                      relative w-12 h-6 rounded-full transition-colors duration-200
                      ${partner.status === 'trusted' 
                        ? 'bg-green-500' 
                        : 'bg-gray-300'
                      }
                    `}
                    aria-label={`Toggle trust for ${partner.name}`}
                  >
                    <span 
                      className={`
                        absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow
                        transition-transform duration-200
                        ${partner.status === 'trusted' ? 'translate-x-6' : 'translate-x-0'}
                      `}
                    />
                  </button>
                )}
                
                {/* Pending indicator */}
                {isPending && (
                  <span className="text-xs text-yellow-600">
                    Awaiting approval
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Save Actions (for pilot demonstration) */}
      {pendingChanges.length > 0 && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={() => {
              setPendingChanges([]);
              // Reset to initial state
              const filteredPartners = PILOT_PARTNERS.filter(p => p.code !== instanceCode);
              setPartners(filteredPartners);
            }}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              console.log('[Pilot] Federation changes:', pendingChanges);
              alert(`[Pilot Demo] Would sync federation changes:\n${pendingChanges.join(', ')}`);
              setPendingChanges([]);
            }}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Apply Changes
          </button>
        </div>
      )}
    </div>
  );
}

// Compact partner list (read-only)
export function PartnerList({ 
  instanceCode, 
  className = '' 
}: { instanceCode: string; className?: string }) {
  const partners = PILOT_PARTNERS.filter(p => p.code !== instanceCode && p.status === 'trusted');
  
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs text-gray-500">Trusts:</span>
      <div className="flex -space-x-1">
        {partners.map(p => {
          const FlagIcon = getFlagComponent(p.code);
          return (
            <div 
              key={p.code} 
              className="w-6 h-6 rounded-full border-2 border-white overflow-hidden"
              title={p.name}
            >
              <FlagIcon size={24} />
            </div>
          );
        })}
      </div>
    </div>
  );
}


