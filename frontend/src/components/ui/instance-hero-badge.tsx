'use client';

/**
 * Instance Hero Badge
 * 
 * Displays the current instance's country flag and name prominently
 * in the hero section. Uses the ThemeProvider context for instance info.
 */

import React from 'react';
import { useInstanceTheme } from './theme-provider';
import { getCountryFlagComponent } from './flags';

interface InstanceHeroBadgeProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function InstanceHeroBadge({ className = '', size = 'lg' }: InstanceHeroBadgeProps) {
  const { instanceCode, instanceName } = useInstanceTheme();
  const FlagComponent = getCountryFlagComponent(instanceCode);
  
  const sizeClasses = {
    sm: 'gap-2',
    md: 'gap-3',
    lg: 'gap-4',
  };
  
  const flagSizes = {
    sm: 32,
    md: 48,
    lg: 64,
  };
  
  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl md:text-3xl',
  };

  return (
    <div className={`flex items-center ${sizeClasses[size]} ${className}`}>
      <div className="relative">
        {/* Glow effect behind flag */}
        <div 
          className="absolute inset-0 blur-xl opacity-50 rounded-lg"
          style={{ backgroundColor: 'var(--instance-accent, white)' }}
        />
        <FlagComponent size={flagSizes[size]} className="relative drop-shadow-lg" />
      </div>
      <div>
        <div className={`font-bold text-white ${textSizes[size]} drop-shadow-md`}>
          {instanceName}
        </div>
        <div className="text-white/70 text-sm">
          DIVE V3 Instance
        </div>
      </div>
    </div>
  );
}

/**
 * Instance Name Display for headings
 */
export function InstanceName({ className = '' }: { className?: string }) {
  const { instanceName } = useInstanceTheme();
  return <span className={className}>{instanceName}</span>;
}

/**
 * Instance Code Display
 */
export function InstanceCode({ className = '' }: { className?: string }) {
  const { instanceCode } = useInstanceTheme();
  return <span className={className}>{instanceCode}</span>;
}

/**
 * Instance Flag only
 */
export function InstanceFlag({ size = 32, className = '' }: { size?: number; className?: string }) {
  const { instanceCode } = useInstanceTheme();
  const FlagComponent = getCountryFlagComponent(instanceCode);
  return <FlagComponent size={size} className={className} />;
}

/**
 * IdP Section Header with instance name
 */
export function IdpSectionHeader({ className = '' }: { className?: string }) {
  const { instanceName, instanceCode } = useInstanceTheme();
  const FlagComponent = getCountryFlagComponent(instanceCode);
  
  return (
    <div className={`text-center mb-8 ${className}`}>
      <div className="flex items-center justify-center gap-3 mb-4">
        <FlagComponent size={36} className="drop-shadow-md" />
        <h2 className="text-3xl font-bold text-gray-900">
          Welcome to {instanceName}
        </h2>
        <FlagComponent size={36} className="drop-shadow-md" />
      </div>
      <p className="text-gray-600 text-lg">
        Select your Identity Provider to access the {instanceName} DIVE V3 platform
      </p>
    </div>
  );
}

/**
 * Compact inline instance indicator
 */
export function InstanceInline({ className = '' }: { className?: string }) {
  const { instanceCode, instanceName } = useInstanceTheme();
  const FlagComponent = getCountryFlagComponent(instanceCode);
  
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <FlagComponent size={20} />
      <span>{instanceName}</span>
    </span>
  );
}

export default InstanceHeroBadge;

