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
 * Norway Flag - Nordic Cross
 */
export const NorwayFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 48 32"
    width={size}
    height={size * 0.67}
    className={`drop-shadow-md ${className}`}
    role="img"
    aria-label="Norway"
  >
    <defs>
      <clipPath id="norClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath>
    </defs>
    <g clipPath="url(#norClip)">
      <rect width="48" height="32" fill="#BA0C2F"/>
      <rect x="14" y="0" width="8" height="32" fill="#FFFFFF"/>
      <rect x="0" y="12" width="48" height="8" fill="#FFFFFF"/>
      <rect x="16" y="0" width="4" height="32" fill="#00205B"/>
      <rect x="0" y="14" width="48" height="4" fill="#00205B"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Albania Flag - Double-headed eagle
 */
export const AlbaniaFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 48 32"
    width={size}
    height={size * 0.67}
    className={`drop-shadow-md ${className}`}
    role="img"
    aria-label="Albania"
  >
    <defs>
      <clipPath id="albClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath>
    </defs>
    <g clipPath="url(#albClip)">
      <rect width="48" height="32" fill="#E41E20"/>
      {/* Simplified double-headed eagle */}
      <path d="M24,8 L20,12 L22,12 L22,18 L18,18 L18,20 L22,20 L22,24 L26,24 L26,20 L30,20 L30,18 L26,18 L26,12 L28,12 Z" fill="#000000"/>
      <circle cx="21" cy="14" r="1.5" fill="#000000"/>
      <circle cx="27" cy="14" r="1.5" fill="#000000"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Belgium Flag - Vertical tricolor
 */
export const BelgiumFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 48 32"
    width={size}
    height={size * 0.67}
    className={`drop-shadow-md ${className}`}
    role="img"
    aria-label="Belgium"
  >
    <defs>
      <clipPath id="belClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath>
    </defs>
    <g clipPath="url(#belClip)">
      <rect x="0" width="16" height="32" fill="#000000"/>
      <rect x="16" width="16" height="32" fill="#FDDA24"/>
      <rect x="32" width="16" height="32" fill="#EF3340"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Denmark Flag - Nordic Cross (Dannebrog)
 */
export const DenmarkFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 48 32"
    width={size}
    height={size * 0.67}
    className={`drop-shadow-md ${className}`}
    role="img"
    aria-label="Denmark"
  >
    <defs>
      <clipPath id="dnkClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath>
    </defs>
    <g clipPath="url(#dnkClip)">
      <rect width="48" height="32" fill="#C60C30"/>
      <rect x="14" y="0" width="6" height="32" fill="#FFFFFF"/>
      <rect x="0" y="13" width="48" height="6" fill="#FFFFFF"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Sweden Flag - Nordic Cross (Blue & Yellow)
 */
export const SwedenFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="Sweden">
    <defs><clipPath id="sweClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#sweClip)">
      <rect width="48" height="32" fill="#006AA7"/>
      <rect x="14" y="0" width="6" height="32" fill="#FECC00"/>
      <rect x="0" y="13" width="48" height="6" fill="#FECC00"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Finland Flag - Nordic Cross (Blue on White)
 */
export const FinlandFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="Finland">
    <defs><clipPath id="finClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#finClip)">
      <rect width="48" height="32" fill="#FFFFFF"/>
      <rect x="14" y="0" width="6" height="32" fill="#002F6C"/>
      <rect x="0" y="13" width="48" height="6" fill="#002F6C"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Czechia Flag - Blue triangle with white and red
 */
export const CzechiaFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="Czechia">
    <defs><clipPath id="czeClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#czeClip)">
      <rect width="48" height="16" fill="#FFFFFF"/>
      <rect y="16" width="48" height="16" fill="#D7141A"/>
      <polygon points="0,0 24,16 0,32" fill="#11457E"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Slovakia Flag - Tricolor with coat of arms
 */
export const SlovakiaFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="Slovakia">
    <defs><clipPath id="svkClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#svkClip)">
      <rect width="48" height="10.67" fill="#FFFFFF"/>
      <rect y="10.67" width="48" height="10.67" fill="#0B4EA2"/>
      <rect y="21.33" width="48" height="10.67" fill="#EE1C25"/>
      <ellipse cx="16" cy="16" rx="6" ry="8" fill="#FFFFFF" stroke="#EE1C25" strokeWidth="1"/>
      <path d="M13,12 L16,8 L19,12 L19,20 L16,24 L13,20 Z" fill="#0B4EA2"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Lithuania Flag - Horizontal tricolor (Yellow, Green, Red)
 */
export const LithuaniaFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="Lithuania">
    <defs><clipPath id="ltuClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#ltuClip)">
      <rect width="48" height="10.67" fill="#FDB913"/>
      <rect y="10.67" width="48" height="10.67" fill="#006A44"/>
      <rect y="21.33" width="48" height="10.67" fill="#C1272D"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Greece Flag - Blue and white stripes with cross
 */
export const GreeceFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="Greece">
    <defs><clipPath id="grcClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#grcClip)">
      {/* Stripes */}
      <rect width="48" height="32" fill="#0D5EAF"/>
      <rect y="3.56" width="48" height="3.56" fill="#FFFFFF"/>
      <rect y="10.67" width="48" height="3.56" fill="#FFFFFF"/>
      <rect y="17.78" width="48" height="3.56" fill="#FFFFFF"/>
      <rect y="24.89" width="48" height="3.56" fill="#FFFFFF"/>
      {/* Canton with cross */}
      <rect width="17.78" height="17.78" fill="#0D5EAF"/>
      <rect x="7.11" y="0" width="3.56" height="17.78" fill="#FFFFFF"/>
      <rect x="0" y="7.11" width="17.78" height="3.56" fill="#FFFFFF"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Portugal Flag - Green and red with coat of arms
 */
export const PortugalFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="Portugal">
    <defs><clipPath id="prtClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#prtClip)">
      <rect width="18" height="32" fill="#006600"/>
      <rect x="18" width="30" height="32" fill="#FF0000"/>
      <circle cx="18" cy="16" r="7" fill="#FFCC00"/>
      <circle cx="18" cy="16" r="5" fill="#FF0000"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Croatia Flag - Tricolor with checkerboard
 */
export const CroatiaFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="Croatia">
    <defs><clipPath id="hrvClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#hrvClip)">
      <rect width="48" height="10.67" fill="#FF0000"/>
      <rect y="10.67" width="48" height="10.67" fill="#FFFFFF"/>
      <rect y="21.33" width="48" height="10.67" fill="#171796"/>
      {/* Simplified checkerboard */}
      <rect x="20" y="8" width="8" height="12" fill="#FF0000" stroke="#FFFFFF" strokeWidth="0.5"/>
      <rect x="22" y="10" width="2" height="2" fill="#FFFFFF"/>
      <rect x="26" y="10" width="2" height="2" fill="#FFFFFF"/>
      <rect x="24" y="12" width="2" height="2" fill="#FFFFFF"/>
      <rect x="22" y="14" width="2" height="2" fill="#FFFFFF"/>
      <rect x="26" y="14" width="2" height="2" fill="#FFFFFF"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Turkey Flag - Red with white crescent and star
 */
export const TurkeyFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="Turkey">
    <defs><clipPath id="turClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#turClip)">
      <rect width="48" height="32" fill="#E30A17"/>
      <circle cx="18" cy="16" r="8" fill="#FFFFFF"/>
      <circle cx="20" cy="16" r="6.4" fill="#E30A17"/>
      <polygon points="30,16 27,18 28,14.5 25,12.5 29,12.5" fill="#FFFFFF"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Hungary Flag - Horizontal tricolor (Red, White, Green)
 */
export const HungaryFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="Hungary">
    <defs><clipPath id="hunClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#hunClip)">
      <rect width="48" height="10.67" fill="#CD2A3E"/>
      <rect y="10.67" width="48" height="10.67" fill="#FFFFFF"/>
      <rect y="21.33" width="48" height="10.67" fill="#436F4D"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Romania Flag - Vertical tricolor (Blue, Yellow, Red)
 */
export const RomaniaFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="Romania">
    <defs><clipPath id="rouClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#rouClip)">
      <rect width="16" height="32" fill="#002B7F"/>
      <rect x="16" width="16" height="32" fill="#FCD116"/>
      <rect x="32" width="16" height="32" fill="#CE1126"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Bulgaria Flag - Horizontal tricolor (White, Green, Red)
 */
export const BulgariaFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="Bulgaria">
    <defs><clipPath id="bgrClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#bgrClip)">
      <rect width="48" height="10.67" fill="#FFFFFF"/>
      <rect y="10.67" width="48" height="10.67" fill="#00966E"/>
      <rect y="21.33" width="48" height="10.67" fill="#D62612"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Latvia Flag - Maroon with white stripe
 */
export const LatviaFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="Latvia">
    <defs><clipPath id="lvaClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#lvaClip)">
      <rect width="48" height="12.8" fill="#9E3039"/>
      <rect y="12.8" width="48" height="6.4" fill="#FFFFFF"/>
      <rect y="19.2" width="48" height="12.8" fill="#9E3039"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Estonia Flag - Horizontal tricolor (Blue, Black, White)
 */
export const EstoniaFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="Estonia">
    <defs><clipPath id="estClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#estClip)">
      <rect width="48" height="10.67" fill="#0072CE"/>
      <rect y="10.67" width="48" height="10.67" fill="#000000"/>
      <rect y="21.33" width="48" height="10.67" fill="#FFFFFF"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Slovenia Flag - Tricolor with coat of arms
 */
export const SloveniaFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="Slovenia">
    <defs><clipPath id="svnClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#svnClip)">
      <rect width="48" height="10.67" fill="#FFFFFF"/>
      <rect y="10.67" width="48" height="10.67" fill="#005DA4"/>
      <rect y="21.33" width="48" height="10.67" fill="#ED1C24"/>
      {/* Simplified coat of arms */}
      <path d="M8,4 L16,4 L16,14 L12,18 L8,14 Z" fill="#005DA4" stroke="#FFFFFF" strokeWidth="0.5"/>
      <path d="M10,8 L12,6 L14,8 L12,10 Z" fill="#FFFFFF"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Montenegro Flag - Red with gold border and coat of arms
 */
export const MontenegroFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="Montenegro">
    <defs><clipPath id="mneClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#mneClip)">
      <rect width="48" height="32" fill="#C40308"/>
      <rect x="2" y="2" width="44" height="28" fill="none" stroke="#D4AF37" strokeWidth="3"/>
      {/* Simplified eagle */}
      <circle cx="24" cy="16" r="6" fill="#D4AF37"/>
      <circle cx="24" cy="16" r="4" fill="#C40308"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * North Macedonia Flag - Red with yellow sun
 */
export const NorthMacedoniaFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="North Macedonia">
    <defs><clipPath id="mkdClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#mkdClip)">
      <rect width="48" height="32" fill="#D20000"/>
      {/* Sun rays */}
      <polygon points="24,0 26,16 24,32 22,16" fill="#FFE600"/>
      <polygon points="0,16 24,14 48,16 24,18" fill="#FFE600"/>
      <polygon points="0,0 26,14 48,32 22,18" fill="#FFE600"/>
      <polygon points="48,0 22,14 0,32 26,18" fill="#FFE600"/>
      <circle cx="24" cy="16" r="6" fill="#FFE600"/>
      <circle cx="24" cy="16" r="4" fill="#D20000"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Iceland Flag - Nordic Cross (Blue, White, Red)
 */
export const IcelandFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="Iceland">
    <defs><clipPath id="islClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#islClip)">
      <rect width="48" height="32" fill="#02529C"/>
      <rect x="12" y="0" width="10" height="32" fill="#FFFFFF"/>
      <rect x="0" y="11" width="48" height="10" fill="#FFFFFF"/>
      <rect x="14" y="0" width="6" height="32" fill="#DC1E35"/>
      <rect x="0" y="13" width="48" height="6" fill="#DC1E35"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
  </svg>
);

/**
 * Luxembourg Flag - Horizontal tricolor (Red, White, Light Blue)
 */
export const LuxembourgFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg viewBox="0 0 48 32" width={size} height={size * 0.67} className={`drop-shadow-md ${className}`} role="img" aria-label="Luxembourg">
    <defs><clipPath id="luxClip"><rect width="48" height="32" rx="3" ry="3"/></clipPath></defs>
    <g clipPath="url(#luxClip)">
      <rect width="48" height="10.67" fill="#ED2939"/>
      <rect y="10.67" width="48" height="10.67" fill="#FFFFFF"/>
      <rect y="21.33" width="48" height="10.67" fill="#00A1DE"/>
    </g>
    <rect width="48" height="32" rx="3" ry="3" fill="none" stroke="#1a1a2e" strokeWidth="0.5" strokeOpacity="0.3"/>
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
  
  // NATO Founding Members (1949) - 12 countries
  if (lowerAlias.includes('usa') || lowerAlias.includes('us-') || lowerAlias.includes('dod') || lowerAlias.includes('-us')) return USAFlag;
  if (lowerAlias.includes('canada') || lowerAlias.includes('can')) return CanadaFlag;
  if (lowerAlias.includes('uk') || lowerAlias.includes('gbr') || lowerAlias.includes('britain')) return UKFlag;
  if (lowerAlias.includes('france') || lowerAlias.includes('fra')) return FranceFlag;
  if (lowerAlias.includes('norway') || lowerAlias.includes('nor')) return NorwayFlag;
  if (lowerAlias.includes('denmark') || lowerAlias.includes('dnk')) return DenmarkFlag;
  if (lowerAlias.includes('belgium') || lowerAlias.includes('bel')) return BelgiumFlag;
  if (lowerAlias.includes('netherlands') || lowerAlias.includes('nld')) return NetherlandsFlag;
  if (lowerAlias.includes('italy') || lowerAlias.includes('ita')) return ItalyFlag;
  if (lowerAlias.includes('luxembourg') || lowerAlias.includes('lux')) return LuxembourgFlag;
  if (lowerAlias.includes('iceland') || lowerAlias.includes('isl')) return IcelandFlag;
  if (lowerAlias.includes('portugal') || lowerAlias.includes('prt')) return PortugalFlag;
  // Cold War Expansion (1952-1982)
  if (lowerAlias.includes('greece') || lowerAlias.includes('grc')) return GreeceFlag;
  if (lowerAlias.includes('turkey') || lowerAlias.includes('tur')) return TurkeyFlag;
  if (lowerAlias.includes('germany') || lowerAlias.includes('deu')) return GermanyFlag;
  if (lowerAlias.includes('spain') || lowerAlias.includes('esp')) return SpainFlag;
  // Post-Cold War Expansion (1999)
  if (lowerAlias.includes('czech') || lowerAlias.includes('cze')) return CzechiaFlag;
  if (lowerAlias.includes('hungary') || lowerAlias.includes('hun')) return HungaryFlag;
  if (lowerAlias.includes('poland') || lowerAlias.includes('pol')) return PolandFlag;
  // 2004 Expansion
  if (lowerAlias.includes('bulgaria') || lowerAlias.includes('bgr')) return BulgariaFlag;
  if (lowerAlias.includes('estonia') || lowerAlias.includes('est')) return EstoniaFlag;
  if (lowerAlias.includes('latvia') || lowerAlias.includes('lva')) return LatviaFlag;
  if (lowerAlias.includes('lithuania') || lowerAlias.includes('ltu')) return LithuaniaFlag;
  if (lowerAlias.includes('romania') || lowerAlias.includes('rou')) return RomaniaFlag;
  if (lowerAlias.includes('slovakia') || lowerAlias.includes('svk')) return SlovakiaFlag;
  if (lowerAlias.includes('slovenia') || lowerAlias.includes('svn')) return SloveniaFlag;
  // 2009-2020 Expansion
  if (lowerAlias.includes('albania') || lowerAlias.includes('alb')) return AlbaniaFlag;
  if (lowerAlias.includes('croatia') || lowerAlias.includes('hrv')) return CroatiaFlag;
  if (lowerAlias.includes('montenegro') || lowerAlias.includes('mne')) return MontenegroFlag;
  if (lowerAlias.includes('macedonia') || lowerAlias.includes('mkd')) return NorthMacedoniaFlag;
  // Nordic Expansion (2023-2024)
  if (lowerAlias.includes('finland') || lowerAlias.includes('fin')) return FinlandFlag;
  if (lowerAlias.includes('sweden') || lowerAlias.includes('swe')) return SwedenFlag;
  // Non-NATO Partners
  if (lowerAlias.includes('new zealand') || lowerAlias.includes('nzl') || lowerAlias.includes('nzdf')) return NewZealandFlag;
  if (lowerAlias.includes('australia') || lowerAlias.includes('aus')) return AustraliaFlag;
  if (lowerAlias.includes('industry') || lowerAlias.includes('contractor')) return IndustryIcon;
  
  return DefaultGlobeIcon;
};

/**
 * Get flag component by ISO 3166-1 alpha-3 country code
 */
export const getCountryFlagComponent = (countryCode: string | null | undefined): React.FC<FlagProps> => {
  if (!countryCode) return DefaultGlobeIcon;
  
  const code = countryCode.toUpperCase();
  
  switch (code) {
    // NATO Founding Members (1949) - 12 countries
    case 'USA': return USAFlag;
    case 'CAN': return CanadaFlag;
    case 'GBR': return UKFlag;
    case 'FRA': return FranceFlag;
    case 'NOR': return NorwayFlag;
    case 'DNK': return DenmarkFlag;
    case 'BEL': return BelgiumFlag;
    case 'NLD': return NetherlandsFlag;
    case 'ITA': return ItalyFlag;
    case 'LUX': return LuxembourgFlag;
    case 'ISL': return IcelandFlag;
    case 'PRT': return PortugalFlag;
    // Cold War Expansion (1952-1982) - 4 countries
    case 'GRC': return GreeceFlag;
    case 'TUR': return TurkeyFlag;
    case 'DEU': return GermanyFlag;
    case 'ESP': return SpainFlag;
    // Post-Cold War Expansion (1999) - 3 countries
    case 'CZE': return CzechiaFlag;
    case 'HUN': return HungaryFlag;
    case 'POL': return PolandFlag;
    // 2004 Expansion - 7 countries
    case 'BGR': return BulgariaFlag;
    case 'EST': return EstoniaFlag;
    case 'LVA': return LatviaFlag;
    case 'LTU': return LithuaniaFlag;
    case 'ROU': return RomaniaFlag;
    case 'SVK': return SlovakiaFlag;
    case 'SVN': return SloveniaFlag;
    // 2009-2020 Expansion - 4 countries
    case 'ALB': return AlbaniaFlag;
    case 'HRV': return CroatiaFlag;
    case 'MNE': return MontenegroFlag;
    case 'MKD': return NorthMacedoniaFlag;
    // Nordic Expansion (2023-2024) - 2 countries
    case 'FIN': return FinlandFlag;
    case 'SWE': return SwedenFlag;
    // Non-NATO Partners (FVEY)
    case 'NZL': return NewZealandFlag;
    case 'AUS': return AustraliaFlag;
    default: return DefaultGlobeIcon;
  }
};

/**
 * Country data with premium flag components
 */
export const COUNTRIES = [
  // FVEY (Five Eyes)
  { code: 'USA', name: 'United States', FlagComponent: USAFlag, region: 'FVEY' },
  { code: 'GBR', name: 'United Kingdom', FlagComponent: UKFlag, region: 'FVEY' },
  { code: 'CAN', name: 'Canada', FlagComponent: CanadaFlag, region: 'FVEY' },
  { code: 'AUS', name: 'Australia', FlagComponent: AustraliaFlag, region: 'FVEY' },
  { code: 'NZL', name: 'New Zealand', FlagComponent: NewZealandFlag, region: 'FVEY' },
  // NATO Founding Members (1949)
  { code: 'FRA', name: 'France', FlagComponent: FranceFlag, region: 'NATO' },
  { code: 'NOR', name: 'Norway', FlagComponent: NorwayFlag, region: 'NATO' },
  { code: 'DNK', name: 'Denmark', FlagComponent: DenmarkFlag, region: 'NATO' },
  { code: 'BEL', name: 'Belgium', FlagComponent: BelgiumFlag, region: 'NATO' },
  { code: 'NLD', name: 'Netherlands', FlagComponent: NetherlandsFlag, region: 'NATO' },
  { code: 'ITA', name: 'Italy', FlagComponent: ItalyFlag, region: 'NATO' },
  { code: 'LUX', name: 'Luxembourg', FlagComponent: LuxembourgFlag, region: 'NATO' },
  { code: 'ISL', name: 'Iceland', FlagComponent: IcelandFlag, region: 'NATO' },
  { code: 'PRT', name: 'Portugal', FlagComponent: PortugalFlag, region: 'NATO' },
  // Cold War Expansion
  { code: 'GRC', name: 'Greece', FlagComponent: GreeceFlag, region: 'NATO' },
  { code: 'TUR', name: 'Turkey', FlagComponent: TurkeyFlag, region: 'NATO' },
  { code: 'DEU', name: 'Germany', FlagComponent: GermanyFlag, region: 'NATO' },
  { code: 'ESP', name: 'Spain', FlagComponent: SpainFlag, region: 'NATO' },
  // Post-Cold War Expansion (1999)
  { code: 'CZE', name: 'Czechia', FlagComponent: CzechiaFlag, region: 'NATO' },
  { code: 'HUN', name: 'Hungary', FlagComponent: HungaryFlag, region: 'NATO' },
  { code: 'POL', name: 'Poland', FlagComponent: PolandFlag, region: 'NATO' },
  // 2004 Expansion
  { code: 'BGR', name: 'Bulgaria', FlagComponent: BulgariaFlag, region: 'NATO' },
  { code: 'EST', name: 'Estonia', FlagComponent: EstoniaFlag, region: 'NATO' },
  { code: 'LVA', name: 'Latvia', FlagComponent: LatviaFlag, region: 'NATO' },
  { code: 'LTU', name: 'Lithuania', FlagComponent: LithuaniaFlag, region: 'NATO' },
  { code: 'ROU', name: 'Romania', FlagComponent: RomaniaFlag, region: 'NATO' },
  { code: 'SVK', name: 'Slovakia', FlagComponent: SlovakiaFlag, region: 'NATO' },
  { code: 'SVN', name: 'Slovenia', FlagComponent: SloveniaFlag, region: 'NATO' },
  // 2009-2020 Expansion
  { code: 'ALB', name: 'Albania', FlagComponent: AlbaniaFlag, region: 'NATO' },
  { code: 'HRV', name: 'Croatia', FlagComponent: CroatiaFlag, region: 'NATO' },
  { code: 'MNE', name: 'Montenegro', FlagComponent: MontenegroFlag, region: 'NATO' },
  { code: 'MKD', name: 'North Macedonia', FlagComponent: NorthMacedoniaFlag, region: 'NATO' },
  // Nordic Expansion (2023-2024)
  { code: 'FIN', name: 'Finland', FlagComponent: FinlandFlag, region: 'NATO' },
  { code: 'SWE', name: 'Sweden', FlagComponent: SwedenFlag, region: 'NATO' },
] as const;
