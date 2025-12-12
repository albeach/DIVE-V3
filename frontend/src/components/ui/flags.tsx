/**
 * Premium SVG Flag Components for DIVE V3
 * 
 * ✨ High-quality, detailed flag designs with:
 * - Proper proportions and official colors
 * - Subtle gradients and shadows for depth
 * - Rounded corners for modern aesthetic
 * - No external dependencies (CSP compliant)
 * 
 * Inspired by premium icon sets - designed to impress!
 */

import React from 'react';

interface FlagProps {
  className?: string;
  size?: number;
}

/**
 * USA Flag - Stars and Stripes with depth
 */
export const USAFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 48 32"
    width={size}
    height={size * 0.67}
    className={`drop-shadow-md ${className}`}
    role="img"
    aria-label="United States"
  >
    <defs>
      <linearGradient id="usaShine" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.2"/>
        <stop offset="50%" stopColor="#fff" stopOpacity="0"/>
        <stop offset="100%" stopColor="#000" stopOpacity="0.1"/>
      </linearGradient>
      <clipPath id="usaClip">
        <rect width="48" height="32" rx="3" ry="3"/>
      </clipPath>
    </defs>
    <g clipPath="url(#usaClip)">
      {/* Stripes */}
      <rect width="48" height="32" fill="#B22234"/>
      <rect y="2.46" width="48" height="2.46" fill="#fff"/>
      <rect y="7.38" width="48" height="2.46" fill="#fff"/>
      <rect y="12.31" width="48" height="2.46" fill="#fff"/>
      <rect y="17.23" width="48" height="2.46" fill="#fff"/>
      <rect y="22.15" width="48" height="2.46" fill="#fff"/>
      <rect y="27.08" width="48" height="2.46" fill="#fff"/>
      {/* Canton */}
      <rect width="19.2" height="17.23" fill="#3C3B6E"/>
      {/* Stars - simplified 5x4 pattern */}
      <g fill="#fff">
        {[0,1,2,3,4].map(col => [0,1,2,3].map(row => (
          <circle key={`${col}-${row}`} cx={1.9 + col * 3.8} cy={2.15 + row * 4.3} r="1"/>
        )))}
        {[0,1,2,3].map(col => [0,1,2].map(row => (
          <circle key={`s${col}-${row}`} cx={3.8 + col * 3.8} cy={4.3 + row * 4.3} r="1"/>
        )))}
      </g>
      {/* Shine overlay */}
      <rect width="48" height="32" fill="url(#usaShine)"/>
    </g>
    {/* Border */}
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * France Flag - Tricolore with elegant gradient
 */
export const FranceFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 48 32"
    width={size}
    height={size * 0.67}
    className={`drop-shadow-md ${className}`}
    role="img"
    aria-label="France"
  >
    <defs>
      <linearGradient id="fraShine" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.15"/>
        <stop offset="50%" stopColor="#fff" stopOpacity="0"/>
        <stop offset="100%" stopColor="#000" stopOpacity="0.1"/>
      </linearGradient>
      <clipPath id="fraClip">
        <rect width="48" height="32" rx="3" ry="3"/>
      </clipPath>
    </defs>
    <g clipPath="url(#fraClip)">
      <rect x="32" width="16" height="32" fill="#ED2939"/>
      <rect x="16" width="16" height="32" fill="#fff"/>
      <rect width="16" height="32" fill="#002395"/>
      <rect width="48" height="32" fill="url(#fraShine)"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Canada Flag - Maple Leaf with stunning detail
 */
export const CanadaFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 48 32"
    width={size}
    height={size * 0.67}
    className={`drop-shadow-md ${className}`}
    role="img"
    aria-label="Canada"
  >
    <defs>
      <linearGradient id="canShine" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.15"/>
        <stop offset="50%" stopColor="#fff" stopOpacity="0"/>
        <stop offset="100%" stopColor="#000" stopOpacity="0.1"/>
      </linearGradient>
      <clipPath id="canClip">
        <rect width="48" height="32" rx="3" ry="3"/>
      </clipPath>
    </defs>
    <g clipPath="url(#canClip)">
      <rect width="48" height="32" fill="#fff"/>
      <rect width="12" height="32" fill="#FF0000"/>
      <rect x="36" width="12" height="32" fill="#FF0000"/>
      {/* Maple Leaf */}
      <path 
        fill="#FF0000" 
        d="M24,5 L25,10 L28,9 L26,13 L30,14 L26,16 L28,20 L24,18 L20,20 L22,16 L18,14 L22,13 L20,9 L23,10 Z M24,18 L24,27"
      />
      <rect width="48" height="32" fill="url(#canShine)"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * UK Flag - Union Jack with proper layering
 */
export const UKFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 48 32"
    width={size}
    height={size * 0.67}
    className={`drop-shadow-md ${className}`}
    role="img"
    aria-label="United Kingdom"
  >
    <defs>
      <linearGradient id="ukShine" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.15"/>
        <stop offset="50%" stopColor="#fff" stopOpacity="0"/>
        <stop offset="100%" stopColor="#000" stopOpacity="0.1"/>
      </linearGradient>
      <clipPath id="ukClip">
        <rect width="48" height="32" rx="3" ry="3"/>
      </clipPath>
    </defs>
    <g clipPath="url(#ukClip)">
      {/* Blue background */}
      <rect width="48" height="32" fill="#012169"/>
      {/* White diagonal stripes */}
      <path d="M0,0 L48,32 M48,0 L0,32" stroke="#fff" strokeWidth="6"/>
      {/* Red diagonal stripes (offset for proper Union Jack) */}
      <path d="M0,0 L24,16 M24,16 L48,32" stroke="#C8102E" strokeWidth="2"/>
      <path d="M48,0 L24,16 M24,16 L0,32" stroke="#C8102E" strokeWidth="2"/>
      {/* White cross */}
      <path d="M24,0 V32 M0,16 H48" stroke="#fff" strokeWidth="8"/>
      {/* Red cross */}
      <path d="M24,0 V32 M0,16 H48" stroke="#C8102E" strokeWidth="4"/>
      <rect width="48" height="32" fill="url(#ukShine)"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Germany Flag - Bold triband with depth
 */
export const GermanyFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 48 32"
    width={size}
    height={size * 0.67}
    className={`drop-shadow-md ${className}`}
    role="img"
    aria-label="Germany"
  >
    <defs>
      <linearGradient id="deuShine" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.15"/>
        <stop offset="50%" stopColor="#fff" stopOpacity="0"/>
        <stop offset="100%" stopColor="#000" stopOpacity="0.1"/>
      </linearGradient>
      <linearGradient id="blackBand" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#1a1a1a"/>
        <stop offset="100%" stopColor="#000"/>
      </linearGradient>
      <linearGradient id="goldBand" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFD700"/>
        <stop offset="100%" stopColor="#FFCC00"/>
      </linearGradient>
      <clipPath id="deuClip">
        <rect width="48" height="32" rx="3" ry="3"/>
      </clipPath>
    </defs>
    <g clipPath="url(#deuClip)">
      <rect y="21.33" width="48" height="10.67" fill="url(#goldBand)"/>
      <rect y="10.67" width="48" height="10.66" fill="#DD0000"/>
      <rect width="48" height="10.67" fill="url(#blackBand)"/>
      <rect width="48" height="32" fill="url(#deuShine)"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Italy Flag - Il Tricolore with vibrancy
 */
export const ItalyFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 48 32"
    width={size}
    height={size * 0.67}
    className={`drop-shadow-md ${className}`}
    role="img"
    aria-label="Italy"
  >
    <defs>
      <linearGradient id="itaShine" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.15"/>
        <stop offset="50%" stopColor="#fff" stopOpacity="0"/>
        <stop offset="100%" stopColor="#000" stopOpacity="0.1"/>
      </linearGradient>
      <clipPath id="itaClip">
        <rect width="48" height="32" rx="3" ry="3"/>
      </clipPath>
    </defs>
    <g clipPath="url(#itaClip)">
      <rect x="32" width="16" height="32" fill="#CE2B37"/>
      <rect x="16" width="16" height="32" fill="#fff"/>
      <rect width="16" height="32" fill="#009246"/>
      <rect width="48" height="32" fill="url(#itaShine)"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Spain Flag - Rojigualda with coat of arms hint
 */
export const SpainFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 48 32"
    width={size}
    height={size * 0.67}
    className={`drop-shadow-md ${className}`}
    role="img"
    aria-label="Spain"
  >
    <defs>
      <linearGradient id="espShine" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.15"/>
        <stop offset="50%" stopColor="#fff" stopOpacity="0"/>
        <stop offset="100%" stopColor="#000" stopOpacity="0.1"/>
      </linearGradient>
      <linearGradient id="espGold" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFC400"/>
        <stop offset="100%" stopColor="#F1BF00"/>
      </linearGradient>
      <clipPath id="espClip">
        <rect width="48" height="32" rx="3" ry="3"/>
      </clipPath>
    </defs>
    <g clipPath="url(#espClip)">
      <rect width="48" height="32" fill="#AA151B"/>
      <rect y="8" width="48" height="16" fill="url(#espGold)"/>
      {/* Simplified coat of arms hint */}
      <rect x="10" y="11" width="8" height="10" rx="1" fill="#AA151B" opacity="0.8"/>
      <rect x="11" y="12" width="6" height="8" rx="0.5" fill="#FFC400"/>
      <rect width="48" height="32" fill="url(#espShine)"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Poland Flag - Biało-czerwona with elegance
 */
export const PolandFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 48 32"
    width={size}
    height={size * 0.67}
    className={`drop-shadow-md ${className}`}
    role="img"
    aria-label="Poland"
  >
    <defs>
      <linearGradient id="polShine" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.15"/>
        <stop offset="50%" stopColor="#fff" stopOpacity="0"/>
        <stop offset="100%" stopColor="#000" stopOpacity="0.1"/>
      </linearGradient>
      <linearGradient id="polRed" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#DC143C"/>
        <stop offset="100%" stopColor="#C41230"/>
      </linearGradient>
      <clipPath id="polClip">
        <rect width="48" height="32" rx="3" ry="3"/>
      </clipPath>
    </defs>
    <g clipPath="url(#polClip)">
      <rect y="16" width="48" height="16" fill="url(#polRed)"/>
      <rect width="48" height="16" fill="#fff"/>
      <rect width="48" height="32" fill="url(#polShine)"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Netherlands Flag - Rood-wit-blauw with depth
 */
export const NetherlandsFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 48 32"
    width={size}
    height={size * 0.67}
    className={`drop-shadow-md ${className}`}
    role="img"
    aria-label="Netherlands"
  >
    <defs>
      <linearGradient id="nldShine" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.15"/>
        <stop offset="50%" stopColor="#fff" stopOpacity="0"/>
        <stop offset="100%" stopColor="#000" stopOpacity="0.1"/>
      </linearGradient>
      <clipPath id="nldClip">
        <rect width="48" height="32" rx="3" ry="3"/>
      </clipPath>
    </defs>
    <g clipPath="url(#nldClip)">
      <rect y="21.33" width="48" height="10.67" fill="#21468B"/>
      <rect y="10.67" width="48" height="10.66" fill="#fff"/>
      <rect width="48" height="10.67" fill="#AE1C28"/>
      <rect width="48" height="32" fill="url(#nldShine)"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * New Zealand Flag - Union Jack canton with Southern Cross
 */
export const NewZealandFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 48 32"
    width={size}
    height={size * 0.67}
    className={`drop-shadow-md ${className}`}
    role="img"
    aria-label="New Zealand"
  >
    <defs>
      <linearGradient id="nzlShine" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.15"/>
        <stop offset="50%" stopColor="#fff" stopOpacity="0"/>
        <stop offset="100%" stopColor="#000" stopOpacity="0.1"/>
      </linearGradient>
      <clipPath id="nzlClip">
        <rect width="48" height="32" rx="3" ry="3"/>
      </clipPath>
    </defs>
    <g clipPath="url(#nzlClip)">
      {/* Blue background */}
      <rect width="48" height="32" fill="#00247D"/>
      {/* Union Jack canton */}
      <g transform="scale(0.5)">
        <rect width="48" height="32" fill="#00247D"/>
        <path d="M0,0 L48,32 M48,0 L0,32" stroke="#fff" strokeWidth="6"/>
        <path d="M0,0 L48,32 M48,0 L0,32" stroke="#CC142B" strokeWidth="4"/>
        <path d="M24,0 V32 M0,16 H48" stroke="#fff" strokeWidth="10"/>
        <path d="M24,0 V32 M0,16 H48" stroke="#CC142B" strokeWidth="6"/>
      </g>
      {/* Southern Cross stars (4 red stars with white borders) */}
      <g fill="#CC142B" stroke="#fff" strokeWidth="0.5">
        <polygon points="38,8 39.5,11.5 43,11.5 40.5,14 41.5,17.5 38,15 34.5,17.5 35.5,14 33,11.5 36.5,11.5" transform="scale(0.7) translate(18, 3)"/>
        <polygon points="38,8 39.5,11.5 43,11.5 40.5,14 41.5,17.5 38,15 34.5,17.5 35.5,14 33,11.5 36.5,11.5" transform="scale(0.6) translate(25, 18)"/>
        <polygon points="38,8 39.5,11.5 43,11.5 40.5,14 41.5,17.5 38,15 34.5,17.5 35.5,14 33,11.5 36.5,11.5" transform="scale(0.7) translate(18, 30)"/>
        <polygon points="38,8 39.5,11.5 43,11.5 40.5,14 41.5,17.5 38,15 34.5,17.5 35.5,14 33,11.5 36.5,11.5" transform="scale(0.55) translate(30, 25)"/>
      </g>
      <rect width="48" height="32" fill="url(#nzlShine)"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Australia Flag - Union Jack canton with Commonwealth Star and Southern Cross
 */
export const AustraliaFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 48 32"
    width={size}
    height={size * 0.67}
    className={`drop-shadow-md ${className}`}
    role="img"
    aria-label="Australia"
  >
    <defs>
      <linearGradient id="ausShine" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.15"/>
        <stop offset="50%" stopColor="#fff" stopOpacity="0"/>
        <stop offset="100%" stopColor="#000" stopOpacity="0.1"/>
      </linearGradient>
      <clipPath id="ausClip">
        <rect width="48" height="32" rx="3" ry="3"/>
      </clipPath>
    </defs>
    <g clipPath="url(#ausClip)">
      {/* Blue background */}
      <rect width="48" height="32" fill="#00008B"/>
      {/* Union Jack canton */}
      <g transform="scale(0.5)">
        <rect width="48" height="32" fill="#00247D"/>
        <path d="M0,0 L48,32 M48,0 L0,32" stroke="#fff" strokeWidth="6"/>
        <path d="M0,0 L48,32 M48,0 L0,32" stroke="#CC142B" strokeWidth="4"/>
        <path d="M24,0 V32 M0,16 H48" stroke="#fff" strokeWidth="10"/>
        <path d="M24,0 V32 M0,16 H48" stroke="#CC142B" strokeWidth="6"/>
      </g>
      {/* Commonwealth Star */}
      <polygon fill="#fff" points="12,22 13.5,26 17.5,26 14.5,28.5 15.5,32 12,29.5 8.5,32 9.5,28.5 6.5,26 10.5,26" transform="scale(0.5)"/>
      {/* Southern Cross stars */}
      <g fill="#fff">
        <polygon points="38,8 39.2,11 42.5,11 40,13 41,16 38,14 35,16 36,13 33.5,11 36.8,11" transform="scale(0.5) translate(32, 5)"/>
        <polygon points="38,8 39.2,11 42.5,11 40,13 41,16 38,14 35,16 36,13 33.5,11 36.8,11" transform="scale(0.45) translate(42, 22)"/>
        <polygon points="38,8 39.2,11 42.5,11 40,13 41,16 38,14 35,16 36,13 33.5,11 36.8,11" transform="scale(0.5) translate(32, 35)"/>
        <polygon points="38,8 39.2,11 42.5,11 40,13 41,16 38,14 35,16 36,13 33.5,11 36.8,11" transform="scale(0.4) translate(52, 28)"/>
      </g>
      <rect width="48" height="32" fill="url(#ausShine)"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Industry Icon - Modern building with style
 */
export const IndustryIcon: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 48 32"
    width={size}
    height={size * 0.67}
    className={`drop-shadow-md ${className}`}
    role="img"
    aria-label="Industry Partner"
  >
    <defs>
      <linearGradient id="indGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6366f1"/>
        <stop offset="100%" stopColor="#4f46e5"/>
      </linearGradient>
      <linearGradient id="indShine" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.2"/>
        <stop offset="50%" stopColor="#fff" stopOpacity="0"/>
        <stop offset="100%" stopColor="#000" stopOpacity="0.1"/>
      </linearGradient>
      <clipPath id="indClip">
        <rect width="48" height="32" rx="3" ry="3"/>
      </clipPath>
    </defs>
    <g clipPath="url(#indClip)">
      <rect width="48" height="32" fill="url(#indGrad)"/>
      {/* Modern building */}
      <rect x="8" y="10" width="12" height="18" rx="1" fill="#fff" opacity="0.9"/>
      <rect x="28" y="6" width="12" height="22" rx="1" fill="#fff" opacity="0.9"/>
      {/* Windows */}
      <rect x="10" y="12" width="3" height="3" rx="0.5" fill="#4f46e5"/>
      <rect x="15" y="12" width="3" height="3" rx="0.5" fill="#4f46e5"/>
      <rect x="10" y="17" width="3" height="3" rx="0.5" fill="#4f46e5"/>
      <rect x="15" y="17" width="3" height="3" rx="0.5" fill="#4f46e5"/>
      <rect x="30" y="8" width="3" height="3" rx="0.5" fill="#4f46e5"/>
      <rect x="35" y="8" width="3" height="3" rx="0.5" fill="#4f46e5"/>
      <rect x="30" y="13" width="3" height="3" rx="0.5" fill="#4f46e5"/>
      <rect x="35" y="13" width="3" height="3" rx="0.5" fill="#4f46e5"/>
      <rect x="30" y="18" width="3" height="3" rx="0.5" fill="#4f46e5"/>
      <rect x="35" y="18" width="3" height="3" rx="0.5" fill="#4f46e5"/>
      {/* Door */}
      <rect x="12" y="22" width="5" height="6" rx="0.5" fill="#4f46e5"/>
      <rect x="32" y="22" width="5" height="6" rx="0.5" fill="#4f46e5"/>
      <rect width="48" height="32" fill="url(#indShine)"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#4338ca" strokeWidth="0.5" strokeOpacity="0.5"/>
  </svg>
);

/**
 * Default Globe Icon - Sleek world icon
 */
export const DefaultGlobeIcon: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 48 32"
    width={size}
    height={size * 0.67}
    className={`drop-shadow-md ${className}`}
    role="img"
    aria-label="International"
  >
    <defs>
      <linearGradient id="globeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0ea5e9"/>
        <stop offset="100%" stopColor="#0284c7"/>
      </linearGradient>
      <linearGradient id="globeShine" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.2"/>
        <stop offset="50%" stopColor="#fff" stopOpacity="0"/>
        <stop offset="100%" stopColor="#000" stopOpacity="0.1"/>
      </linearGradient>
      <clipPath id="globeClip">
        <rect width="48" height="32" rx="3" ry="3"/>
      </clipPath>
    </defs>
    <g clipPath="url(#globeClip)">
      <rect width="48" height="32" fill="url(#globeGrad)"/>
      {/* Globe */}
      <circle cx="24" cy="16" r="10" fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.9"/>
      <ellipse cx="24" cy="16" rx="4" ry="10" fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.9"/>
      <path d="M14,16 H34" stroke="#fff" strokeWidth="1.5" opacity="0.9"/>
      <path d="M16,10 Q24,12 32,10" fill="none" stroke="#fff" strokeWidth="1" opacity="0.7"/>
      <path d="M16,22 Q24,20 32,22" fill="none" stroke="#fff" strokeWidth="1" opacity="0.7"/>
      <rect width="48" height="32" fill="url(#globeShine)"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#0369a1" strokeWidth="0.5" strokeOpacity="0.5"/>
  </svg>
);

/**
 * Get the appropriate flag component for an IdP alias
 */
export const getFlagComponent = (alias: string): React.FC<FlagProps> => {
  const lowerAlias = alias.toLowerCase();
  
  if (lowerAlias.includes('germany') || lowerAlias.includes('deu')) return GermanyFlag;
  if (lowerAlias.includes('france') || lowerAlias.includes('fra')) return FranceFlag;
  if (lowerAlias.includes('canada') || lowerAlias.includes('can')) return CanadaFlag;
  if (lowerAlias.includes('uk') || lowerAlias.includes('gbr')) return UKFlag;
  if (lowerAlias.includes('italy') || lowerAlias.includes('ita')) return ItalyFlag;
  if (lowerAlias.includes('spain') || lowerAlias.includes('esp')) return SpainFlag;
  if (lowerAlias.includes('poland') || lowerAlias.includes('pol')) return PolandFlag;
  if (lowerAlias.includes('netherlands') || lowerAlias.includes('nld')) return NetherlandsFlag;
  if (lowerAlias.includes('new zealand') || lowerAlias.includes('nzl') || lowerAlias.includes('nzdf')) return NewZealandFlag;
  if (lowerAlias.includes('australia') || lowerAlias.includes('aus')) return AustraliaFlag;
  if (lowerAlias.includes('industry') || lowerAlias.includes('contractor')) return IndustryIcon;
  if (lowerAlias.includes('usa') || lowerAlias.includes('us-') || lowerAlias.includes('dod') || lowerAlias.includes('-us')) return USAFlag;
  
  return DefaultGlobeIcon;
};

/**
 * Get flag component by ISO 3166-1 alpha-3 country code
 */
export const getCountryFlagComponent = (countryCode: string | null | undefined): React.FC<FlagProps> => {
  if (!countryCode) return DefaultGlobeIcon;
  
  const code = countryCode.toUpperCase();
  
  switch (code) {
    case 'USA': return USAFlag;
    case 'FRA': return FranceFlag;
    case 'CAN': return CanadaFlag;
    case 'GBR': return UKFlag;
    case 'DEU': return GermanyFlag;
    case 'ITA': return ItalyFlag;
    case 'ESP': return SpainFlag;
    case 'POL': return PolandFlag;
    case 'NLD': return NetherlandsFlag;
    case 'NZL': return NewZealandFlag;
    case 'AUS': return AustraliaFlag;
    default: return DefaultGlobeIcon;
  }
};

/**
 * Country data with premium flag components
 */
export const COUNTRIES = [
  { code: 'USA', name: 'United States', FlagComponent: USAFlag, region: 'FVEY' },
  { code: 'GBR', name: 'United Kingdom', FlagComponent: UKFlag, region: 'FVEY' },
  { code: 'CAN', name: 'Canada', FlagComponent: CanadaFlag, region: 'FVEY' },
  { code: 'AUS', name: 'Australia', FlagComponent: AustraliaFlag, region: 'FVEY' },
  { code: 'NZL', name: 'New Zealand', FlagComponent: NewZealandFlag, region: 'FVEY' },
  { code: 'FRA', name: 'France', FlagComponent: FranceFlag, region: 'NATO' },
  { code: 'DEU', name: 'Germany', FlagComponent: GermanyFlag, region: 'NATO' },
  { code: 'ESP', name: 'Spain', FlagComponent: SpainFlag, region: 'NATO' },
  { code: 'ITA', name: 'Italy', FlagComponent: ItalyFlag, region: 'NATO' },
  { code: 'POL', name: 'Poland', FlagComponent: PolandFlag, region: 'NATO' },
  { code: 'NLD', name: 'Netherlands', FlagComponent: NetherlandsFlag, region: 'NATO' },
] as const;
