'use client';

/**
 * Demo Mode Badge Component
 * 
 * Shows current test user's clearance level and country
 * for pilot demonstrations. Helps coordinators verify
 * the correct user context during demos.
 */

import React from 'react';
import { getFlagComponent } from './flags';

interface DemoModeBadgeProps {
  user?: {
    uniqueID?: string | null;
    clearance?: string | null;
    countryOfAffiliation?: string | null;
  };
  className?: string;
}

// Clearance level styling
const CLEARANCE_STYLES: Record<string, { bg: string; text: string; level: number }> = {
  UNCLASSIFIED: { bg: 'bg-green-100', text: 'text-green-800', level: 1 },
  CONFIDENTIAL: { bg: 'bg-blue-100', text: 'text-blue-800', level: 2 },
  SECRET: { bg: 'bg-yellow-100', text: 'text-yellow-800', level: 3 },
  TOP_SECRET: { bg: 'bg-red-100', text: 'text-red-800', level: 4 },
};

export default function DemoModeBadge({ user, className = '' }: DemoModeBadgeProps) {
  // Only show in demo/pilot mode when user is a test user
  const isTestUser = user?.uniqueID?.startsWith('testuser-');
  
  if (!isTestUser || !user) {
    return null;
  }
  
  const clearance = user.clearance || 'UNCLASSIFIED';
  const country = user.countryOfAffiliation || 'USA';
  const style = CLEARANCE_STYLES[clearance] || CLEARANCE_STYLES.UNCLASSIFIED;
  
  // Extract level from uniqueID (e.g., testuser-usa-3 → 3)
  const levelMatch = user.uniqueID?.match(/-(\d)$/);
  const level = levelMatch ? parseInt(levelMatch[1]) : style.level;
  
  const FlagIcon = getFlagComponent(country);
  
  return (
    <div 
      className={`
        fixed bottom-4 right-4 z-50
        bg-white border-2 border-purple-500 rounded-lg shadow-lg
        p-3 max-w-xs
        ${className}
      `}
    >
      {/* Pilot Mode Header */}
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-purple-200">
        <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
        <span className="text-xs font-bold text-purple-700 uppercase tracking-wide">
          Pilot Mode
        </span>
      </div>
      
      {/* User Info */}
      <div className="flex items-center gap-3">
        <FlagIcon size={24} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">
            {user.uniqueID}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {/* Clearance Badge */}
            <span className={`${style.bg} ${style.text} text-xs font-medium px-2 py-0.5 rounded`}>
              {clearance.replace('_', ' ')}
            </span>
            {/* Level Indicator */}
            <span className="text-xs text-gray-500">
              Level {level}
            </span>
          </div>
        </div>
      </div>
      
      {/* Quick Tip */}
      <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
        Higher level = Higher clearance
      </div>
    </div>
  );
}

// Compact inline version
export function DemoModeInlineBadge({ 
  user, 
  className = '' 
}: DemoModeBadgeProps) {
  const isTestUser = user?.uniqueID?.startsWith('testuser-');
  
  if (!isTestUser || !user) {
    return null;
  }
  
  const clearance = user.clearance || 'UNCLASSIFIED';
  const style = CLEARANCE_STYLES[clearance] || CLEARANCE_STYLES.UNCLASSIFIED;
  
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
      <span className="text-xs text-purple-600 font-medium">PILOT</span>
      <span className={`${style.bg} ${style.text} text-xs font-medium px-1.5 py-0.5 rounded`}>
        {clearance.replace('_', ' ')}
      </span>
    </div>
  );
}











