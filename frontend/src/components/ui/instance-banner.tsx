'use client';

/**
 * Instance Banner Component
 * 
 * Displays the current DIVE V3 instance (USA, FRA, DEU, etc.)
 * with country flag, name, status indicator, and pilot mode flag.
 * Helps demo observers identify which instance they're viewing.
 */

import React from 'react';
import { getFlagComponent } from './flags';

interface InstanceBannerProps {
  instanceCode?: string;
  instanceName?: string;
  status?: 'active' | 'inactive' | 'degraded';
  isPilotMode?: boolean;
  className?: string;
}

// Instance color themes
const INSTANCE_THEMES: Record<string, { bg: string; border: string; text: string }> = {
  USA: { bg: 'bg-blue-900/10', border: 'border-blue-600', text: 'text-blue-800' },
  FRA: { bg: 'bg-blue-900/10', border: 'border-blue-600', text: 'text-blue-800' },
  DEU: { bg: 'bg-gray-900/10', border: 'border-yellow-500', text: 'text-gray-800' },
  GBR: { bg: 'bg-red-900/10', border: 'border-red-600', text: 'text-red-800' },
  CAN: { bg: 'bg-red-900/10', border: 'border-red-600', text: 'text-red-800' },
  ITA: { bg: 'bg-green-900/10', border: 'border-green-600', text: 'text-green-800' },
  ESP: { bg: 'bg-yellow-900/10', border: 'border-red-600', text: 'text-red-800' },
  NLD: { bg: 'bg-orange-900/10', border: 'border-orange-500', text: 'text-orange-800' },
  POL: { bg: 'bg-red-900/10', border: 'border-red-500', text: 'text-red-800' },
};

// Status indicator configuration
const STATUS_CONFIG = {
  active: { dot: 'bg-green-500', glow: 'shadow-green-400/50', label: 'Online' },
  inactive: { dot: 'bg-gray-400', glow: '', label: 'Offline' },
  degraded: { dot: 'bg-yellow-500', glow: 'shadow-yellow-400/50', label: 'Degraded' },
};

const INSTANCE_NAMES: Record<string, string> = {
  USA: 'United States',
  FRA: 'France',
  DEU: 'Germany',
  GBR: 'United Kingdom',
  CAN: 'Canada',
  ITA: 'Italy',
  ESP: 'Spain',
  NLD: 'Netherlands',
  POL: 'Poland',
};

export default function InstanceBanner({ 
  instanceCode, 
  instanceName,
  status = 'active',
  isPilotMode = true,
  className = '' 
}: InstanceBannerProps) {
  // Get instance from environment if not provided
  const code = instanceCode || process.env.NEXT_PUBLIC_INSTANCE || 'USA';
  const name = instanceName || INSTANCE_NAMES[code] || code;
  const theme = INSTANCE_THEMES[code] || INSTANCE_THEMES.USA;
  const statusStyle = STATUS_CONFIG[status];
  
  const FlagIcon = getFlagComponent(code);
  
  return (
    <div 
      className={`
        ${theme.bg} ${theme.border} ${theme.text}
        border-l-4 px-4 py-2
        flex items-center justify-between
        ${className}
      `}
    >
      <div className="flex items-center gap-3">
        <FlagIcon size={28} />
        <div>
          <div className="font-semibold text-sm">{code} Instance</div>
          <div className="text-xs opacity-75">{name}</div>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Pilot Mode Badge */}
        {isPilotMode && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-purple-100 rounded border border-purple-300">
            <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-purple-700">PILOT</span>
          </div>
        )}
        
        {/* Status Indicator */}
        <div className="flex items-center gap-1.5">
          <div 
            className={`
              w-2 h-2 rounded-full ${statusStyle.dot}
              ${status === 'active' ? 'animate-pulse shadow-lg' : ''}
              ${statusStyle.glow}
            `} 
          />
          <span className="text-xs">{statusStyle.label}</span>
        </div>
      </div>
    </div>
  );
}

// Compact version for headers
export function InstanceBadge({ className = '' }: { className?: string }) {
  const code = process.env.NEXT_PUBLIC_INSTANCE || 'USA';
  const theme = INSTANCE_THEMES[code] || INSTANCE_THEMES.USA;
  const FlagIcon = getFlagComponent(code);
  
  return (
    <div 
      className={`
        ${theme.bg} ${theme.border} ${theme.text}
        border rounded-full px-3 py-1
        flex items-center gap-2
        text-xs font-medium
        ${className}
      `}
    >
      <FlagIcon size={16} />
      <span>{code}</span>
    </div>
  );
}

