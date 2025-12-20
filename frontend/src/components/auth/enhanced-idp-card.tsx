"use client";

import { getFlagComponent } from '../ui/flags';

interface IdPOption {
  alias: string;
  displayName: string;
  protocol: string;
  enabled: boolean;
}

export type IdPStatus = 'checking' | 'active' | 'warning' | 'offline';

interface EnhancedIdpCardProps {
  idp: IdPOption;
  status?: IdPStatus;
  onClick: () => void;
  index?: number;
  accentColor?: string;
}

/**
 * Enhanced IdP Card Component with 3D Effects
 *
 * Features:
 * - 3D transform on hover with parallax effect
 * - Stacked shadow layers for depth
 * - Accent color from country theme
 * - Status badges (online/degraded/offline)
 * - Smooth animations and micro-interactions
 * - Glassmorphism design
 */
export function EnhancedIdpCard({
  idp,
  status = 'active',
  onClick,
  index = 0,
  accentColor
}: EnhancedIdpCardProps) {
  const FlagComponent = getFlagComponent(idp.alias);

  // Extract clean display name
  const displayName = idp.displayName
    .replace(/^DIVE V3\s*-?\s*/i, '')
    .split('(')[0]
    .trim();

  // Status configurations
  const statusConfig = {
    checking: {
      bg: 'bg-gray-400',
      text: 'text-gray-600',
      label: 'Checking',
      icon: '🔄',
      ringColor: 'ring-gray-300/30',
    },
    active: {
      bg: 'bg-emerald-500',
      text: 'text-emerald-600',
      label: 'Online',
      icon: '✓',
      ringColor: 'ring-emerald-400/30',
    },
    warning: {
      bg: 'bg-amber-500',
      text: 'text-amber-600',
      label: 'Degraded',
      icon: '⚠',
      ringColor: 'ring-amber-400/30',
    },
    offline: {
      bg: 'bg-red-500',
      text: 'text-red-600',
      label: 'Offline',
      icon: '✕',
      ringColor: 'ring-red-400/30',
    },
  };

  const statusStyle = statusConfig[status];

  return (
    <button
      onClick={onClick}
      data-testid={`enhanced-idp-card-${idp.alias}`}
      className="group relative w-full h-24 animate-grid-reveal"
      style={{
        animationDelay: `${index * 0.03}s`,
        '--index': index,
      } as React.CSSProperties}
    >
      {/* Layer 1: Shadow layer (depth effect) */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900/5 to-gray-900/10 rounded-xl transform translate-y-1 translate-x-1 transition-transform duration-300 group-hover:translate-y-2 group-hover:translate-x-2" />

      {/* Layer 2: Base card with glassmorphism */}
      <div className="relative h-full bg-white/90 backdrop-blur-xl rounded-xl border border-gray-200 overflow-hidden transition-all duration-300 group-hover:border-transparent group-hover:shadow-2xl group-hover:-translate-y-2 transform-gpu will-change-transform">

        {/* Animated gradient background on hover */}
        <div
          className="absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-10 transition-opacity duration-300"
          style={{
            backgroundImage: accentColor
              ? `linear-gradient(145deg, ${accentColor}20, transparent)`
              : 'linear-gradient(145deg, rgba(0, 154, 179, 0.1), transparent)'
          }}
        />

        {/* Glow effect on hover */}
        <div
          className="absolute -inset-0.5 opacity-0 group-hover:opacity-20 blur-lg transition-opacity duration-300 rounded-2xl"
          style={{
            background: accentColor
              ? `linear-gradient(45deg, ${accentColor}, ${accentColor}50)`
              : 'linear-gradient(45deg, #009ab3, #79d85a)'
          }}
        />

        {/* Shimmer effect on hover */}
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out">
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12" />
        </div>

        {/* Layer 3: Content - Compact */}
        <div className="relative h-full p-3 flex items-center gap-3">
          {/* Status Badge (top-right) */}
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <span
              className={`relative flex h-2 w-2 ${status === 'active' || status === 'checking' ? 'animate-pulse' : ''}`}
              title={statusStyle.label}
            >
              {(status === 'active' || status === 'checking') && (
                <span className={`absolute inline-flex h-full w-full rounded-full ${statusStyle.bg} opacity-40 animate-ping`} />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${statusStyle.bg} shadow-lg ring-1 ${statusStyle.ringColor}`} />
            </span>
          </div>

          {/* Flag - Left side */}
          <div className="flex-shrink-0">
            <div className="relative group-hover:scale-110 transition-transform duration-300 transform-gpu">
              <div className="absolute inset-0 blur-md opacity-0 group-hover:opacity-30 transition-opacity duration-300"
                   style={{ background: accentColor || '#009ab3' }} />
              <div className={status === 'offline' ? 'grayscale opacity-50' : ''}>
                <FlagComponent size={40} className="relative drop-shadow-lg" />
              </div>
            </div>
          </div>

          {/* Country Info - Right side */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-gray-900 truncate transition-all duration-300 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:bg-clip-text group-hover:from-[#009ab3] group-hover:to-[#79d85a]">
              {displayName}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="px-1.5 py-0.5 bg-gray-100 group-hover:bg-gradient-to-r group-hover:from-[#009ab3]/10 group-hover:to-[#79d85a]/10 rounded text-[10px] font-medium text-gray-600 group-hover:text-gray-900 transition-all uppercase">
                {idp.protocol}
              </span>
              <span className={`text-[10px] font-medium ${statusStyle.text} opacity-0 group-hover:opacity-100 transition-opacity`}>
                {statusStyle.icon} {statusStyle.label}
              </span>
            </div>
          </div>
        </div>

        {/* Layer 4: Accent line (left border) */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-l-xl"
          style={{
            background: accentColor
              ? `linear-gradient(180deg, ${accentColor}, ${accentColor}80)`
              : 'linear-gradient(180deg, #009ab3, #79d85a)'
          }}
        />
      </div>

      {/* Accessibility: Focus ring */}
      <div className="absolute inset-0 rounded-2xl ring-2 ring-[#009ab3] ring-offset-2 opacity-0 focus-visible:opacity-100 pointer-events-none transition-opacity" />
    </button>
  );
}

/**
 * Status Indicator Component (for use in other contexts)
 */
export function StatusIndicator({ status = 'active' }: { status?: IdPStatus }) {
  const colors = {
    checking: {
      bg: 'bg-gray-400',
      glow: 'shadow-gray-400/50',
      ring: 'ring-gray-300/30',
      label: 'Checking...',
    },
    active: {
      bg: 'bg-emerald-500',
      glow: 'shadow-emerald-500/50',
      ring: 'ring-emerald-400/30',
      label: 'Online',
    },
    warning: {
      bg: 'bg-amber-500',
      glow: 'shadow-amber-500/50',
      ring: 'ring-amber-400/30',
      label: 'Degraded',
    },
    offline: {
      bg: 'bg-red-500',
      glow: 'shadow-red-500/50',
      ring: 'ring-red-400/30',
      label: 'Offline',
    },
  };

  const c = colors[status];

  return (
    <span className="relative flex h-2.5 w-2.5 flex-shrink-0" title={c.label}>
      {(status === 'active' || status === 'checking') && (
        <span className={`absolute inline-flex h-full w-full rounded-full ${c.bg} opacity-40 animate-ping`} />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${c.bg} shadow-lg ${c.glow} ring-1 ${c.ring}`} />
    </span>
  );
}

export default EnhancedIdpCard;

