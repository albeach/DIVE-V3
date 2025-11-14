/**
 * Self-contained SVG flag components for DIVE V3
 * No external dependencies - all flags are inline SVG for secure environments
 */

import React from 'react';

interface FlagProps {
  className?: string;
  size?: number;
}

export const USAFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 60 30"
    width={size}
    height={size * 0.5}
    className={className}
    role="img"
    aria-label="United States flag"
  >
    <rect width="60" height="30" fill="#B22234" />
    <path d="M0,3.46h60M0,6.92h60M0,10.38h60M0,13.84h60M0,17.3h60M0,20.76h60M0,24.22h60M0,27.68h60" stroke="#fff" strokeWidth="2.3" />
    <rect width="24" height="17.3" fill="#3C3B6E" />
    <g fill="#fff">
      <g id="s">
        <g id="c">
          <path id="t" d="M2,1 v1 h1z" transform="translate(0,0)" />
          <use href="#t" y="2" />
          <use href="#t" y="4" />
        </g>
        <use href="#c" transform="translate(3,0)" />
        <use href="#c" transform="translate(6,0)" />
        <use href="#c" transform="translate(9,0)" />
        <use href="#c" transform="translate(12,0)" />
        <use href="#c" transform="translate(15,0)" />
      </g>
      <use href="#s" transform="translate(1.5,1)" />
      <use href="#s" transform="translate(0,2)" />
      <use href="#s" transform="translate(1.5,3)" />
      <use href="#s" transform="translate(0,4)" />
      <use href="#s" transform="translate(1.5,5)" />
      <use href="#s" transform="translate(0,6)" />
      <use href="#s" transform="translate(1.5,7)" />
      <use href="#s" transform="translate(0,8)" />
      <use href="#s" transform="translate(1.5,9)" />
    </g>
  </svg>
);

export const FranceFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 90 60"
    width={size}
    height={size * 0.67}
    className={className}
    role="img"
    aria-label="France flag"
  >
    <rect width="90" height="60" fill="#ED2939" />
    <rect width="60" height="60" fill="#fff" />
    <rect width="30" height="60" fill="#002395" />
  </svg>
);

export const CanadaFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 1000 500"
    width={size}
    height={size * 0.5}
    className={className}
    role="img"
    aria-label="Canada flag"
  >
    <rect width="1000" height="500" fill="#fff" />
    <rect width="250" height="500" fill="#D52B1E" />
    <rect x="750" width="250" height="500" fill="#D52B1E" />
    <path
      fill="#D52B1E"
      d="M 500,100 L 475,200 L 400,175 L 450,250 L 400,300 L 475,275 L 450,350 L 500,300 L 550,350 L 525,275 L 600,300 L 550,250 L 600,175 L 525,200 Z"
    />
  </svg>
);

export const UKFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 60 30"
    width={size}
    height={size * 0.5}
    className={className}
    role="img"
    aria-label="United Kingdom flag"
  >
    <rect width="60" height="30" fill="#012169" />
    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="4" />
    <path d="M30,0 V30 M0,15 H60" stroke="#fff" strokeWidth="10" />
    <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
  </svg>
);

export const GermanyFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 5 3"
    width={size}
    height={size * 0.6}
    className={className}
    role="img"
    aria-label="Germany flag"
  >
    <rect width="5" height="3" fill="#000" />
    <rect width="5" height="2" y="1" fill="#D00" />
    <rect width="5" height="1" y="2" fill="#FFCE00" />
  </svg>
);

export const ItalyFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 3 2"
    width={size}
    height={size * 0.67}
    className={className}
    role="img"
    aria-label="Italy flag"
  >
    <rect width="3" height="2" fill="#009246" />
    <rect x="1" width="2" height="2" fill="#fff" />
    <rect x="2" width="1" height="2" fill="#CE2B37" />
  </svg>
);

export const SpainFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 750 500"
    width={size}
    height={size * 0.67}
    className={className}
    role="img"
    aria-label="Spain flag"
  >
    <rect width="750" height="500" fill="#AA151B" />
    <rect y="125" width="750" height="250" fill="#F1BF00" />
  </svg>
);

export const PolandFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 8 5"
    width={size}
    height={size * 0.625}
    className={className}
    role="img"
    aria-label="Poland flag"
  >
    <rect width="8" height="5" fill="#fff" />
    <rect y="2.5" width="8" height="2.5" fill="#DC143C" />
  </svg>
);

export const NetherlandsFlag: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 9 6"
    width={size}
    height={size * 0.67}
    className={className}
    role="img"
    aria-label="Netherlands flag"
  >
    <rect width="9" height="6" fill="#21468B" />
    <rect width="9" height="4" fill="#fff" />
    <rect width="9" height="2" fill="#AE1C28" />
  </svg>
);

export const IndustryIcon: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    role="img"
    aria-label="Industry icon"
  >
    <rect x="2" y="8" width="20" height="14" rx="2" />
    <path d="M6 4h12v4H6z" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="2" y1="16" x2="22" y2="16" />
    <line x1="8" y1="8" x2="8" y2="22" />
    <line x1="16" y1="8" x2="16" y2="22" />
  </svg>
);

export const DefaultGlobeIcon: React.FC<FlagProps> = ({ className = '', size = 32 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    role="img"
    aria-label="Globe icon"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
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
  if (lowerAlias.includes('industry') || lowerAlias.includes('contractor')) return IndustryIcon;
  if (lowerAlias.includes('usa') || lowerAlias.includes('us-') || lowerAlias.includes('dod') || lowerAlias.includes('-us')) return USAFlag;
  
  return DefaultGlobeIcon;
};

/**
 * Get flag component by ISO 3166-1 alpha-3 country code
 * Used for user profiles, releasability tags, etc.
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
    default: return DefaultGlobeIcon;
  }
};

/**
 * Country data with SVG flag components
 * Replaces emoji-based country lists throughout the application
 */
export const COUNTRIES = [
  { code: 'USA', name: 'United States', FlagComponent: USAFlag, region: 'FVEY' },
  { code: 'GBR', name: 'United Kingdom', FlagComponent: UKFlag, region: 'FVEY' },
  { code: 'CAN', name: 'Canada', FlagComponent: CanadaFlag, region: 'FVEY' },
  { code: 'FRA', name: 'France', FlagComponent: FranceFlag, region: 'NATO' },
  { code: 'DEU', name: 'Germany', FlagComponent: GermanyFlag, region: 'NATO' },
  { code: 'ESP', name: 'Spain', FlagComponent: SpainFlag, region: 'NATO' },
  { code: 'ITA', name: 'Italy', FlagComponent: ItalyFlag, region: 'NATO' },
  { code: 'POL', name: 'Poland', FlagComponent: PolandFlag, region: 'NATO' },
  { code: 'NLD', name: 'Netherlands', FlagComponent: NetherlandsFlag, region: 'NATO' },
] as const;

