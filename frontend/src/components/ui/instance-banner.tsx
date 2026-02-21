'use client';

/**
 * Instance Banner Component
 * 
 * Displays the current DIVE V3 instance (USA, FRA, DEU, etc.)
 * with country flag, name, status indicator, and pilot mode flag.
 * 
 * 🎨 Updated to use CSS variables from ThemeProvider for dynamic theming
 * Each instance automatically gets its configured colors from instance.json
 */

import React from 'react';
import { getFlagComponent } from './flags';
import { useInstanceTheme, getInstanceName } from './theme-provider';

interface InstanceBannerProps {
  instanceCode?: string;
  instanceName?: string;
  status?: 'active' | 'inactive' | 'degraded';
  isPilotMode?: boolean;
  className?: string;
}

// Status indicator configuration
const STATUS_CONFIG = {
  active: { dot: 'bg-green-500', glow: 'shadow-green-400/50', label: 'Online' },
  inactive: { dot: 'bg-gray-400', glow: '', label: 'Offline' },
  degraded: { dot: 'bg-yellow-500', glow: 'shadow-yellow-400/50', label: 'Degraded' },
};

export default function InstanceBanner({ 
  instanceCode, 
  instanceName,
  status = 'active',
  isPilotMode = true,
  className = '' 
}: InstanceBannerProps) {
  // Get instance info from ThemeProvider context
  const themeContext = useInstanceTheme();
  
  // Use provided props or fall back to context/env
  const code = instanceCode || themeContext.instanceCode || process.env.NEXT_PUBLIC_INSTANCE || 'USA';
  const name = instanceName || themeContext.instanceName || getInstanceName(code);
  const statusStyle = STATUS_CONFIG[status];
  
  const FlagIcon = getFlagComponent(code);
  
  return (
    <div 
      className={`
        bg-instance-banner
        border-l-4 border-instance-primary
        px-4 py-2
        flex items-center justify-between
        ${className}
      `}
    >
      <div className="flex items-center gap-3">
        <FlagIcon size={28} />
        <div>
          <div className="font-semibold text-sm text-white drop-shadow-sm">{code} Instance</div>
          <div className="text-xs text-white/80">{name}</div>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Pilot Mode Badge */}
        {isPilotMode && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded border border-white/30">
            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-white">PILOT</span>
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
          <span className="text-xs text-white/90">{statusStyle.label}</span>
        </div>
      </div>
    </div>
  );
}

// Compact version for headers - now uses CSS variables
export function InstanceBadge({ className = '' }: { className?: string }) {
  const themeContext = useInstanceTheme();
  const code = themeContext.instanceCode || process.env.NEXT_PUBLIC_INSTANCE || 'USA';
  const FlagIcon = getFlagComponent(code);
  
  return (
    <div 
      className={`
        bg-[rgba(var(--instance-primary-rgb),0.1)]
        border border-instance-primary
        text-instance-primary
        rounded-full px-3 py-1
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

/**
 * Minimal instance indicator for tight spaces
 * Shows just the flag and a small colored dot
 */
export function InstanceIndicator({ className = '' }: { className?: string }) {
  const themeContext = useInstanceTheme();
  const code = themeContext.instanceCode || process.env.NEXT_PUBLIC_INSTANCE || 'USA';
  const FlagIcon = getFlagComponent(code);
  
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <FlagIcon size={20} />
      <div 
        className="w-1.5 h-1.5 rounded-full animate-pulse"
        style={{ backgroundColor: 'var(--instance-accent)' }}
      />
    </div>
  );
}

/**
 * Full-width hero banner for landing pages
 * Uses the instance gradient background
 */
export function InstanceHeroBanner({ 
  children,
  className = '' 
}: { 
  children?: React.ReactNode;
  className?: string;
}) {
  const themeContext = useInstanceTheme();
  const code = themeContext.instanceCode || process.env.NEXT_PUBLIC_INSTANCE || 'USA';
  const name = themeContext.instanceName || getInstanceName(code);
  const FlagIcon = getFlagComponent(code);
  
  return (
    <div 
      className={`
        bg-instance-banner
        relative overflow-hidden
        ${className}
      `}
    >
      {/* Decorative elements */}
      <div className="absolute inset-0 bg-[url('/patterns/grid.svg')] opacity-10" />
      <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      
      <div className="relative z-10 px-6 py-8">
        <div className="flex items-center gap-4 mb-4">
          <FlagIcon size={48} />
          <div>
            <h1 className="text-2xl font-bold text-white">{name} Instance</h1>
            <p className="text-white/70 text-sm">DIVE V3 Coalition ICAM Platform</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
