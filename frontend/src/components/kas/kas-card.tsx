'use client';

/**
 * KAS Card Component
 * 
 * Individual KAS instance card with real-time metrics from MongoDB.
 * Follows 2025 design patterns with smooth animations and modern UX.
 */

import { useState } from 'react';
import { Server, TrendingUp, Shield, Clock, ExternalLink } from 'lucide-react';
import { KASHealthBadge } from './kas-health-badge';
import { 
  IKASEndpoint, 
  formatUptime, 
  formatResponseTime, 
  getCountryFlag 
} from '@/lib/api/kas';

interface KASCardProps {
  kas: IKASEndpoint;
  isSelected?: boolean;
  onSelect?: (kasId: string) => void;
}

export function KASCard({ kas, isSelected = false, onSelect }: KASCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    onSelect?.(kas.id);
  };

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        bg-white rounded-xl p-6 border-2 shadow-md
        transition-all duration-300 cursor-pointer
        ${isSelected
          ? 'border-blue-500 ring-4 ring-blue-100 scale-[1.02]'
          : 'border-gray-200 hover:border-blue-300 hover:shadow-xl'
        }
        ${isHovered && !isSelected ? 'scale-[1.01]' : ''}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`
            p-3 rounded-xl transition-colors duration-300
            ${kas.status === 'active' 
              ? 'bg-green-100' 
              : kas.status === 'pending' 
                ? 'bg-yellow-100' 
                : 'bg-gray-100'
            }
          `}>
            <Server className={`
              w-6 h-6 transition-colors duration-300
              ${kas.status === 'active' 
                ? 'text-green-600' 
                : kas.status === 'pending' 
                  ? 'text-yellow-600' 
                  : 'text-gray-400'
              }
            `} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl" role="img" aria-label={kas.country}>
                {getCountryFlag(kas.country)}
              </span>
              <h3 className="font-bold text-gray-900">{kas.name}</h3>
            </div>
            <p className="text-xs text-gray-500 font-mono">{kas.country}</p>
          </div>
        </div>
        
        <KASHealthBadge
          status={kas.status}
          lastHeartbeat={kas.lastHeartbeat || null}
          circuitBreakerState={kas.circuitBreakerState}
          size="sm"
        />
      </div>

      {/* Endpoint URL */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-1">Endpoint URL:</p>
        <p className="text-xs font-mono bg-gray-50 px-2 py-1.5 rounded border border-gray-200 break-all flex items-center gap-1">
          <ExternalLink className="w-3 h-3 text-gray-400 flex-shrink-0" />
          {kas.url}
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Uptime */}
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            Uptime
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div
                className={`
                  h-full rounded-full transition-all duration-500
                  ${kas.uptime >= 99 
                    ? 'bg-gradient-to-r from-green-400 to-emerald-500' 
                    : kas.uptime >= 95 
                      ? 'bg-gradient-to-r from-yellow-400 to-amber-500' 
                      : 'bg-gradient-to-r from-red-400 to-rose-500'
                  }
                `}
                style={{ width: `${Math.min(kas.uptime, 100)}%` }}
              />
            </div>
            <span className={`
              text-xs font-bold
              ${kas.uptime >= 99 ? 'text-green-600' : kas.uptime >= 95 ? 'text-yellow-600' : 'text-red-600'}
            `}>
              {formatUptime(kas.uptime)}
            </span>
          </div>
        </div>

        {/* Requests Today */}
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            Requests Today
          </p>
          <p className="text-lg font-bold text-blue-600">
            {kas.requestsToday.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Extended Metrics (shown on hover or selection) */}
      <div className={`
        overflow-hidden transition-all duration-300
        ${isSelected || isHovered ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}
      `}>
        <div className="pt-4 border-t border-gray-200 space-y-2">
          {/* Success Rate */}
          {kas.successRate !== undefined && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Success Rate</span>
              <span className={`
                font-semibold
                ${kas.successRate >= 99 ? 'text-green-600' : kas.successRate >= 95 ? 'text-yellow-600' : 'text-red-600'}
              `}>
                {kas.successRate.toFixed(2)}%
              </span>
            </div>
          )}

          {/* Response Time */}
          {kas.p95ResponseTime !== undefined && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">p95 Response</span>
              <span className="font-semibold text-gray-900">
                {formatResponseTime(kas.p95ResponseTime)}
              </span>
            </div>
          )}

          {/* Federation Trust */}
          {kas.federationTrust && kas.federationTrust.trustedPartners.length > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Trusted Partners</span>
              <span className="font-semibold text-purple-600">
                {kas.federationTrust.trustedPartners.length}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Selection Indicator */}
      {isSelected && (
        <div className="mt-4 pt-3 border-t border-blue-200">
          <p className="text-xs text-blue-600 font-semibold flex items-center gap-1">
            <Clock className="w-3 h-3" />
            View detailed metrics below
          </p>
        </div>
      )}
    </div>
  );
}

export default KASCard;
