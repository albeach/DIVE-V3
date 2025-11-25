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
 * IdP Section Header with localized instance name
 */
export function IdpSectionHeader({ className = '' }: { className?: string }) {
  const { instanceCode, strings } = useInstanceTheme();
  const FlagComponent = getCountryFlagComponent(instanceCode);
  
  return (
    <div className={`text-center mb-8 ${className}`}>
      <div className="flex items-center justify-center gap-3 mb-4">
        <FlagComponent size={36} className="drop-shadow-md" />
        <h2 className="text-3xl font-bold text-gray-900">
          {strings.welcome}
        </h2>
        <FlagComponent size={36} className="drop-shadow-md" />
      </div>
      <p className="text-gray-600 text-lg">
        {strings.selectIdp}
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

/**
 * Coalition Partners Footer - shows which countries are federated partners
 */
export function CoalitionPartnersFooter({ className = '' }: { className?: string }) {
  const { instanceCode, instanceName, coalitionPartners, strings } = useInstanceTheme();
  const FlagComponent = getCountryFlagComponent(instanceCode);
  
  // Get names for coalition partners
  const partnerNames: Record<string, string> = {
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
  
  return (
    <div className={`text-center ${className}`}>
      <div className="flex items-center justify-center gap-3 text-sm text-gray-500 mb-4">
        <span className="inline-flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-[var(--instance-primary)] to-[var(--instance-secondary)] text-white rounded-full font-semibold">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
          LIVE
        </span>
        <span>•</span>
        <span>{strings.coalitionPilot}</span>
        <span>•</span>
        <span>November 2025</span>
      </div>
      
      {/* Coalition Partners */}
      <div className="mb-4">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
          <FlagComponent size={16} className="inline mr-1" />
          {instanceName} Coalition Partners
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {coalitionPartners.map((code) => {
            const PartnerFlag = getCountryFlagComponent(code);
            return (
              <div key={code} className="flex items-center gap-1 text-xs text-gray-500">
                <PartnerFlag size={18} />
                <span>{partnerNames[code] || code}</span>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Powered by */}
      <p className="text-xs text-gray-400">
        {strings.poweredBy}
      </p>
    </div>
  );
}

/**
 * Localized Feature Badges for hero section
 */
export function LocalizedFeatureBadges({ className = '' }: { className?: string }) {
  const { strings } = useInstanceTheme();
  
  return (
    <div className={`flex flex-wrap justify-center md:justify-start gap-2 ${className}`}>
      <span className="px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-full text-xs md:text-sm text-white border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105">
        🔐 {strings.federatedAuth}
      </span>
      <span className="px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-full text-xs md:text-sm text-white border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105">
        🛡️ {strings.policyAuth}
      </span>
      <span className="px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-full text-xs md:text-sm text-white border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105">
        📄 {strings.secureDoc}
      </span>
    </div>
  );
}

/**
 * Localized Pilot Capabilities heading
 */
export function LocalizedPilotCapabilities({ className = '' }: { className?: string }) {
  const { strings } = useInstanceTheme();
  
  return (
    <div className={`text-center mb-6 ${className}`}>
      <h3 className="text-2xl font-bold text-gray-900 mb-2">
        {strings.pilotCapabilities}
      </h3>
      <div className="inline-block w-20 h-0.5 bg-gradient-to-r from-[var(--instance-primary)] to-[var(--instance-secondary)] rounded-full"></div>
    </div>
  );
}

export default InstanceHeroBadge;

