'use client';

/**
 * Instance Theme Provider
 * 
 * Reads instance configuration and dynamically injects CSS variables
 * to enable instance-specific theming across USA, FRA, DEU instances.
 * 
 * This ensures scalability - each new instance only needs an instance.json
 * file with theme configuration, no code changes required.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';

// Instance theme configuration (matches instance.json schema)
export interface InstanceTheme {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_image?: string;
  keycloak_theme?: string;
  css_variables: {
    '--instance-primary': string;
    '--instance-secondary': string;
    '--instance-accent': string;
    '--instance-text': string;
    '--instance-banner-bg': string;
    [key: string]: string;
  };
}

export interface InstanceConfig {
  instance_code: string;
  instance_name: string;
  locale: string;
  theme: InstanceTheme;
  federation_partners?: string[];
}

interface InstanceThemeContextValue {
  instanceCode: string;
  instanceName: string;
  locale: string;
  theme: InstanceTheme;
  strings: LocalizedStrings;
  coalitionPartners: string[];
  isLoading: boolean;
}

// Default USA theme (fallback)
const DEFAULT_THEME: InstanceTheme = {
  primary_color: '#1a365d',
  secondary_color: '#2b6cb0',
  accent_color: '#3182ce',
  background_image: 'background-usa.jpg',
  keycloak_theme: 'dive-v3-usa',
  css_variables: {
    '--instance-primary': '#1a365d',
    '--instance-secondary': '#2b6cb0',
    '--instance-accent': '#3182ce',
    '--instance-text': '#ffffff',
    '--instance-banner-bg': 'linear-gradient(135deg, #1a365d 0%, #2b6cb0 100%)',
  },
};

// Predefined themes for each instance (can be extended via instance.json)
const INSTANCE_THEMES: Record<string, InstanceTheme> = {
  USA: {
    primary_color: '#1a365d',
    secondary_color: '#2b6cb0',
    accent_color: '#3182ce',
    background_image: 'background-usa.jpg',
    keycloak_theme: 'dive-v3-usa',
    css_variables: {
      '--instance-primary': '#1a365d',
      '--instance-secondary': '#2b6cb0',
      '--instance-accent': '#3182ce',
      '--instance-text': '#ffffff',
      '--instance-banner-bg': 'linear-gradient(135deg, #1a365d 0%, #2b6cb0 100%)',
    },
  },
  FRA: {
    primary_color: '#002395',
    secondary_color: '#ED2939',
    accent_color: '#ffffff',
    background_image: 'background-fra.jpg',
    keycloak_theme: 'dive-v3-fra',
    css_variables: {
      '--instance-primary': '#002395',
      '--instance-secondary': '#ED2939',
      '--instance-accent': '#ffffff',
      '--instance-text': '#ffffff',
      '--instance-banner-bg': 'linear-gradient(135deg, #002395 0%, #ED2939 100%)',
    },
  },
  DEU: {
    primary_color: '#000000',
    secondary_color: '#DD0000',
    accent_color: '#FFCC00',
    background_image: 'background-deu.jpg',
    keycloak_theme: 'dive-v3-deu',
    css_variables: {
      '--instance-primary': '#000000',
      '--instance-secondary': '#DD0000',
      '--instance-accent': '#FFCC00',
      '--instance-text': '#ffffff',
      '--instance-banner-bg': 'linear-gradient(135deg, #000000 0%, #DD0000 50%, #FFCC00 100%)',
    },
  },
  GBR: {
    primary_color: '#012169',
    secondary_color: '#C8102E',
    accent_color: '#ffffff',
    background_image: 'background-gbr.jpg',
    keycloak_theme: 'dive-v3-gbr',
    css_variables: {
      '--instance-primary': '#012169',
      '--instance-secondary': '#C8102E',
      '--instance-accent': '#ffffff',
      '--instance-text': '#ffffff',
      '--instance-banner-bg': 'linear-gradient(135deg, #012169 0%, #C8102E 100%)',
    },
  },
  CAN: {
    primary_color: '#FF0000',
    secondary_color: '#ffffff',
    accent_color: '#FF0000',
    background_image: 'background-can.jpg',
    keycloak_theme: 'dive-v3-can',
    css_variables: {
      '--instance-primary': '#FF0000',
      '--instance-secondary': '#ffffff',
      '--instance-accent': '#FF0000',
      '--instance-text': '#000000',
      '--instance-banner-bg': 'linear-gradient(135deg, #FF0000 0%, #ffffff 50%, #FF0000 100%)',
    },
  },
  ITA: {
    primary_color: '#009246',
    secondary_color: '#CE2B37',
    accent_color: '#ffffff',
    background_image: 'background-ita.jpg',
    keycloak_theme: 'dive-v3-ita',
    css_variables: {
      '--instance-primary': '#009246',
      '--instance-secondary': '#CE2B37',
      '--instance-accent': '#ffffff',
      '--instance-text': '#ffffff',
      '--instance-banner-bg': 'linear-gradient(135deg, #009246 0%, #ffffff 50%, #CE2B37 100%)',
    },
  },
  NZL: {
    primary_color: '#00247D',
    secondary_color: '#CC142B',
    accent_color: '#ffffff',
    background_image: 'background-nzl.jpg',
    keycloak_theme: 'dive-v3-nzl',
    css_variables: {
      '--instance-primary': '#00247D',
      '--instance-secondary': '#CC142B',
      '--instance-accent': '#ffffff',
      '--instance-text': '#ffffff',
      '--instance-banner-bg': 'linear-gradient(135deg, #00247D 0%, #CC142B 100%)',
    },
  },
  AUS: {
    primary_color: '#00008B',
    secondary_color: '#FF0000',
    accent_color: '#ffffff',
    background_image: 'background-aus.jpg',
    keycloak_theme: 'dive-v3-aus',
    css_variables: {
      '--instance-primary': '#00008B',
      '--instance-secondary': '#FF0000',
      '--instance-accent': '#ffffff',
      '--instance-text': '#ffffff',
      '--instance-banner-bg': 'linear-gradient(135deg, #00008B 0%, #FF0000 100%)',
    },
  },
  // NATO Expansion Countries
  POL: {
    primary_color: '#DC143C',
    secondary_color: '#FFFFFF',
    accent_color: '#DC143C',
    background_image: 'background-pol.jpg',
    keycloak_theme: 'dive-v3-pol',
    css_variables: {
      '--instance-primary': '#DC143C',
      '--instance-secondary': '#FFFFFF',
      '--instance-accent': '#DC143C',
      '--instance-text': '#ffffff',
      '--instance-banner-bg': 'linear-gradient(135deg, #DC143C 0%, #FFFFFF 50%, #DC143C 100%)',
    },
  },
  NOR: {
    primary_color: '#BA0C2F',
    secondary_color: '#00205B',
    accent_color: '#ffffff',
    background_image: 'background-nor.jpg',
    keycloak_theme: 'dive-v3-nor',
    css_variables: {
      '--instance-primary': '#BA0C2F',
      '--instance-secondary': '#00205B',
      '--instance-accent': '#ffffff',
      '--instance-text': '#ffffff',
      '--instance-banner-bg': 'linear-gradient(135deg, #BA0C2F 0%, #00205B 100%)',
    },
  },
  ALB: {
    primary_color: '#E41E20',
    secondary_color: '#000000',
    accent_color: '#ffffff',
    background_image: 'background-alb.jpg',
    keycloak_theme: 'dive-v3-alb',
    css_variables: {
      '--instance-primary': '#E41E20',
      '--instance-secondary': '#000000',
      '--instance-accent': '#ffffff',
      '--instance-text': '#ffffff',
      '--instance-banner-bg': 'linear-gradient(135deg, #E41E20 0%, #000000 100%)',
    },
  },
  BEL: {
    primary_color: '#000000',
    secondary_color: '#FDDA24',
    accent_color: '#EF3340',
    background_image: 'background-bel.jpg',
    keycloak_theme: 'dive-v3-bel',
    css_variables: {
      '--instance-primary': '#000000',
      '--instance-secondary': '#FDDA24',
      '--instance-accent': '#EF3340',
      '--instance-text': '#ffffff',
      '--instance-banner-bg': 'linear-gradient(135deg, #000000 0%, #FDDA24 50%, #EF3340 100%)',
    },
  },
  DNK: {
    primary_color: '#C60C30',
    secondary_color: '#FFFFFF',
    accent_color: '#C60C30',
    background_image: 'background-dnk.jpg',
    keycloak_theme: 'dive-v3-dnk',
    css_variables: {
      '--instance-primary': '#C60C30',
      '--instance-secondary': '#FFFFFF',
      '--instance-accent': '#C60C30',
      '--instance-text': '#ffffff',
      '--instance-banner-bg': 'linear-gradient(135deg, #C60C30 0%, #FFFFFF 50%, #C60C30 100%)',
    },
  },
  ESP: {
    primary_color: '#AA151B',
    secondary_color: '#F1BF00',
    accent_color: '#ffffff',
    background_image: 'background-esp.jpg',
    keycloak_theme: 'dive-v3-esp',
    css_variables: {
      '--instance-primary': '#AA151B',
      '--instance-secondary': '#F1BF00',
      '--instance-accent': '#ffffff',
      '--instance-text': '#ffffff',
      '--instance-banner-bg': 'linear-gradient(135deg, #AA151B 0%, #F1BF00 100%)',
    },
  },
  NLD: {
    primary_color: '#AE1C28',
    secondary_color: '#21468B',
    accent_color: '#ffffff',
    background_image: 'background-nld.jpg',
    keycloak_theme: 'dive-v3-nld',
    css_variables: {
      '--instance-primary': '#AE1C28',
      '--instance-secondary': '#21468B',
      '--instance-accent': '#ffffff',
      '--instance-text': '#ffffff',
      '--instance-banner-bg': 'linear-gradient(135deg, #AE1C28 0%, #FFFFFF 50%, #21468B 100%)',
    },
  },
};

const INSTANCE_NAMES: Record<string, string> = {
  // NATO Founding Members (1949)
  BEL: 'Belgium',
  CAN: 'Canada',
  DNK: 'Denmark',
  FRA: 'France',
  ISL: 'Iceland',
  ITA: 'Italy',
  LUX: 'Luxembourg',
  NLD: 'Netherlands',
  NOR: 'Norway',
  PRT: 'Portugal',
  GBR: 'United Kingdom',
  USA: 'United States',
  
  // Cold War Expansion (1952-1982)
  GRC: 'Greece',
  TUR: 'Turkey',
  DEU: 'Germany',
  ESP: 'Spain',
  
  // Post-Cold War Expansion (1999)
  CZE: 'Czechia',
  HUN: 'Hungary',
  POL: 'Poland',
  
  // 2004 Expansion
  BGR: 'Bulgaria',
  EST: 'Estonia',
  LVA: 'Latvia',
  LTU: 'Lithuania',
  ROU: 'Romania',
  SVK: 'Slovakia',
  SVN: 'Slovenia',
  
  // 2009-2020 Expansion
  ALB: 'Albania',
  HRV: 'Croatia',
  MNE: 'Montenegro',
  MKD: 'North Macedonia',
  
  // Nordic Expansion (2023-2024)
  FIN: 'Finland',
  SWE: 'Sweden',
  
  // Non-NATO Partners (FVEY)
  AUS: 'Australia',
  NZL: 'New Zealand',
  JPN: 'Japan',
  KOR: 'South Korea',
};

const INSTANCE_LOCALES: Record<string, string> = {
  // NATO Founding Members (1949)
  BEL: 'nl', // Dutch/Flemish
  CAN: 'en',
  DNK: 'da',
  FRA: 'fr',
  ISL: 'is',
  ITA: 'it',
  LUX: 'fr',
  NLD: 'nl',
  NOR: 'no',
  PRT: 'pt',
  GBR: 'en',
  USA: 'en',
  
  // Cold War Expansion
  GRC: 'el',
  TUR: 'tr',
  DEU: 'de',
  ESP: 'es',
  
  // Post-Cold War Expansion
  CZE: 'cs',
  HUN: 'hu',
  POL: 'pl',
  
  // 2004 Expansion
  BGR: 'bg',
  EST: 'et',
  LVA: 'lv',
  LTU: 'lt',
  ROU: 'ro',
  SVK: 'sk',
  SVN: 'sl',
  
  // 2009-2020 Expansion
  ALB: 'sq',
  HRV: 'hr',
  MNE: 'sr', // Montenegrin uses Serbian script
  MKD: 'mk',
  
  // Nordic Expansion
  FIN: 'fi',
  SWE: 'sv',
  
  // Non-NATO Partners
  AUS: 'en',
  NZL: 'en',
  JPN: 'ja',
  KOR: 'ko',
};

// Helper function to generate default strings for a country
function generateDefaultStrings(countryName: string): LocalizedStrings {
  return {
    welcome: `Welcome to ${countryName}`,
    selectIdp: `Select your Identity Provider to access the ${countryName} DIVE V3 platform`,
    pilotCapabilities: 'Pilot Capabilities',
    poweredBy: 'Powered by Keycloak • Open Policy Agent • Next.js',
    coalitionPilot: 'DIVE V3 Coalition Pilot',
    federatedAuth: 'Federated Authentication',
    policyAuth: 'Policy-Driven Authorization',
    secureDoc: 'Secure Document Sharing',
  };
}

// Localized strings per instance
export interface LocalizedStrings {
  welcome: string;
  selectIdp: string;
  pilotCapabilities: string;
  poweredBy: string;
  coalitionPilot: string;
  federatedAuth: string;
  policyAuth: string;
  secureDoc: string;
}

const INSTANCE_STRINGS: Record<string, LocalizedStrings> = {
  USA: {
    welcome: 'Welcome to United States',
    selectIdp: 'Select your Identity Provider to access the United States DIVE V3 platform',
    pilotCapabilities: 'Pilot Capabilities',
    poweredBy: 'Powered by Keycloak • Open Policy Agent • Next.js',
    coalitionPilot: 'DIVE V3 Coalition Pilot',
    federatedAuth: 'Federated Authentication',
    policyAuth: 'Policy-Driven Authorization',
    secureDoc: 'Secure Document Sharing',
  },
  FRA: {
    welcome: 'Bienvenue en France',
    selectIdp: 'Sélectionnez votre fournisseur d\'identité pour accéder à la plateforme DIVE V3 France',
    pilotCapabilities: 'Capacités du Pilote',
    poweredBy: 'Propulsé par Keycloak • Open Policy Agent • Next.js',
    coalitionPilot: 'Pilote Coalition DIVE V3',
    federatedAuth: 'Authentification Fédérée',
    policyAuth: 'Autorisation par Politiques',
    secureDoc: 'Partage Sécurisé de Documents',
  },
  DEU: {
    welcome: 'Willkommen in Deutschland',
    selectIdp: 'Wählen Sie Ihren Identity Provider um auf die DIVE V3 Deutschland Plattform zuzugreifen',
    pilotCapabilities: 'Pilotfähigkeiten',
    poweredBy: 'Powered by Keycloak • Open Policy Agent • Next.js',
    coalitionPilot: 'DIVE V3 Koalitionspilot',
    federatedAuth: 'Föderierte Authentifizierung',
    policyAuth: 'Richtlinienbasierte Autorisierung',
    secureDoc: 'Sicherer Dokumentenaustausch',
  },
  GBR: {
    welcome: 'Welcome to United Kingdom',
    selectIdp: 'Select your Identity Provider to access the United Kingdom DIVE V3 platform',
    pilotCapabilities: 'Pilot Capabilities',
    poweredBy: 'Powered by Keycloak • Open Policy Agent • Next.js',
    coalitionPilot: 'DIVE V3 Coalition Pilot',
    federatedAuth: 'Federated Authentication',
    policyAuth: 'Policy-Driven Authorisation',
    secureDoc: 'Secure Document Sharing',
  },
  CAN: {
    welcome: 'Bienvenue au Canada / Welcome to Canada',
    selectIdp: 'Sélectionnez votre fournisseur / Select your Identity Provider',
    pilotCapabilities: 'Pilot Capabilities',
    poweredBy: 'Powered by Keycloak • Open Policy Agent • Next.js',
    coalitionPilot: 'DIVE V3 Coalition Pilot',
    federatedAuth: 'Federated Authentication',
    policyAuth: 'Policy-Driven Authorization',
    secureDoc: 'Secure Document Sharing',
  },
  ITA: {
    welcome: 'Benvenuti in Italia',
    selectIdp: 'Seleziona il tuo Identity Provider per accedere alla piattaforma DIVE V3 Italia',
    pilotCapabilities: 'Funzionalità Pilota',
    poweredBy: 'Powered by Keycloak • Open Policy Agent • Next.js',
    coalitionPilot: 'Pilota Coalizione DIVE V3',
    federatedAuth: 'Autenticazione Federata',
    policyAuth: 'Autorizzazione basata su Policy',
    secureDoc: 'Condivisione Documenti Sicura',
  },
  NZL: {
    welcome: 'Welcome to New Zealand',
    selectIdp: 'Select your Identity Provider to access the New Zealand DIVE V3 platform',
    pilotCapabilities: 'Pilot Capabilities',
    poweredBy: 'Powered by Keycloak • Open Policy Agent • Next.js',
    coalitionPilot: 'DIVE V3 Coalition Pilot',
    federatedAuth: 'Federated Authentication',
    policyAuth: 'Policy-Driven Authorisation',
    secureDoc: 'Secure Document Sharing',
  },
  AUS: {
    welcome: 'Welcome to Australia',
    selectIdp: 'Select your Identity Provider to access the Australia DIVE V3 platform',
    pilotCapabilities: 'Pilot Capabilities',
    poweredBy: 'Powered by Keycloak • Open Policy Agent • Next.js',
    coalitionPilot: 'DIVE V3 Coalition Pilot',
    federatedAuth: 'Federated Authentication',
    policyAuth: 'Policy-Driven Authorisation',
    secureDoc: 'Secure Document Sharing',
  },
  // NATO Expansion Countries with native language greetings
  POL: {
    welcome: 'Witamy w Polsce',
    selectIdp: 'Wybierz swojego dostawcę tożsamości, aby uzyskać dostęp do platformy DIVE V3 Polska',
    pilotCapabilities: 'Możliwości Pilotażowe',
    poweredBy: 'Obsługiwane przez Keycloak • Open Policy Agent • Next.js',
    coalitionPilot: 'Pilot Koalicji DIVE V3',
    federatedAuth: 'Uwierzytelnianie Federacyjne',
    policyAuth: 'Autoryzacja Oparta na Polityce',
    secureDoc: 'Bezpieczne Udostępnianie Dokumentów',
  },
  NOR: {
    welcome: 'Velkommen til Norge',
    selectIdp: 'Velg din identitetsleverandør for å få tilgang til DIVE V3 Norge-plattformen',
    pilotCapabilities: 'Pilotfunksjoner',
    poweredBy: 'Drevet av Keycloak • Open Policy Agent • Next.js',
    coalitionPilot: 'DIVE V3 Koalisjonspilot',
    federatedAuth: 'Føderert Autentisering',
    policyAuth: 'Policybasert Autorisasjon',
    secureDoc: 'Sikker Dokumentdeling',
  },
  ALB: {
    welcome: 'Mirësevini në Shqipëri',
    selectIdp: 'Zgjidhni ofruesin tuaj të identitetit për të hyrë në platformën DIVE V3 Shqipëri',
    pilotCapabilities: 'Aftësitë Pilote',
    poweredBy: 'Mundësuar nga Keycloak • Open Policy Agent • Next.js',
    coalitionPilot: 'DIVE V3 Pilot Koalicioni',
    federatedAuth: 'Autentifikim i Federuar',
    policyAuth: 'Autorizim i Bazuar në Politikë',
    secureDoc: 'Ndarje e Sigurt e Dokumenteve',
  },
  BEL: {
    welcome: 'Welkom in België / Bienvenue en Belgique',
    selectIdp: 'Selecteer uw identiteitsprovider / Sélectionnez votre fournisseur d\'identité',
    pilotCapabilities: 'Pilot Capabilities',
    poweredBy: 'Powered by Keycloak • Open Policy Agent • Next.js',
    coalitionPilot: 'DIVE V3 Coalition Pilot',
    federatedAuth: 'Federated Authentication',
    policyAuth: 'Policy-Driven Authorization',
    secureDoc: 'Secure Document Sharing',
  },
  DNK: {
    welcome: 'Velkommen til Danmark',
    selectIdp: 'Vælg din identitetsudbyder for at få adgang til DIVE V3 Danmark-platformen',
    pilotCapabilities: 'Pilotfunktioner',
    poweredBy: 'Drevet af Keycloak • Open Policy Agent • Next.js',
    coalitionPilot: 'DIVE V3 Koalitionspilot',
    federatedAuth: 'Fødereret Autentificering',
    policyAuth: 'Politikbaseret Autorisation',
    secureDoc: 'Sikker Dokumentdeling',
  },
  ESP: {
    welcome: 'Bienvenidos a España',
    selectIdp: 'Seleccione su proveedor de identidad para acceder a la plataforma DIVE V3 España',
    pilotCapabilities: 'Capacidades Piloto',
    poweredBy: 'Desarrollado por Keycloak • Open Policy Agent • Next.js',
    coalitionPilot: 'Piloto de Coalición DIVE V3',
    federatedAuth: 'Autenticación Federada',
    policyAuth: 'Autorización Basada en Políticas',
    secureDoc: 'Compartición Segura de Documentos',
  },
  NLD: {
    welcome: 'Welkom in Nederland',
    selectIdp: 'Selecteer uw identiteitsprovider om toegang te krijgen tot het DIVE V3 Nederland-platform',
    pilotCapabilities: 'Pilotmogelijkheden',
    poweredBy: 'Ondersteund door Keycloak • Open Policy Agent • Next.js',
    coalitionPilot: 'DIVE V3 Coalitiepilot',
    federatedAuth: 'Gefedereerde Authenticatie',
    policyAuth: 'Beleidsgestuurde Autorisatie',
    secureDoc: 'Veilig Documenten Delen',
  },
};

// Coalition partners for footer (which countries each instance shows)
const COALITION_PARTNERS: Record<string, string[]> = {
  // FVEY
  USA: ['CAN', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'NLD', 'POL'],
  CAN: ['USA', 'GBR', 'FRA'],
  GBR: ['USA', 'CAN', 'FRA', 'DEU'],
  AUS: ['NZL', 'USA', 'GBR', 'CAN'],
  NZL: ['AUS', 'USA', 'GBR', 'CAN'],
  // Western Europe
  FRA: ['DEU', 'GBR', 'ITA', 'ESP', 'USA', 'BEL', 'NLD'],
  DEU: ['FRA', 'GBR', 'ITA', 'USA', 'NLD', 'POL', 'BEL', 'DNK'],
  ITA: ['FRA', 'DEU', 'ESP', 'USA'],
  ESP: ['FRA', 'ITA', 'PRT', 'USA'],
  NLD: ['DEU', 'BEL', 'GBR', 'USA', 'DNK'],
  BEL: ['FRA', 'DEU', 'NLD', 'GBR', 'USA'],
  // Nordic
  NOR: ['DNK', 'SWE', 'FIN', 'USA', 'GBR'],
  DNK: ['NOR', 'DEU', 'NLD', 'GBR', 'USA'],
  // Central/Eastern Europe
  POL: ['DEU', 'CZE', 'SVK', 'LTU', 'USA'],
  ALB: ['ITA', 'GRC', 'MKD', 'MNE', 'USA'],
};

const DEFAULT_STRINGS: LocalizedStrings = INSTANCE_STRINGS.USA;
const DEFAULT_PARTNERS: string[] = COALITION_PARTNERS.USA;

const InstanceThemeContext = createContext<InstanceThemeContextValue>({
  instanceCode: 'USA',
  instanceName: 'United States',
  locale: 'en',
  theme: DEFAULT_THEME,
  strings: DEFAULT_STRINGS,
  coalitionPartners: DEFAULT_PARTNERS,
  isLoading: true,
});

export function useInstanceTheme() {
  return useContext(InstanceThemeContext);
}

interface InstanceThemeProviderProps {
  children: React.ReactNode;
}

export function InstanceThemeProvider({ children }: InstanceThemeProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [instanceCode, setInstanceCode] = useState('USA');
  const [instanceName, setInstanceName] = useState('United States');
  const [locale, setLocale] = useState('en');
  const [theme, setTheme] = useState<InstanceTheme>(DEFAULT_THEME);
  const [strings, setStrings] = useState<LocalizedStrings>(DEFAULT_STRINGS);
  const [coalitionPartners, setCoalitionPartners] = useState<string[]>(DEFAULT_PARTNERS);

  useEffect(() => {
    // Get instance code from environment variable
    const code = process.env.NEXT_PUBLIC_INSTANCE || 'USA';
    const name = process.env.NEXT_PUBLIC_INSTANCE_NAME || INSTANCE_NAMES[code] || code;
    const loc = process.env.NEXT_PUBLIC_LOCALE || INSTANCE_LOCALES[code] || 'en';

    setInstanceCode(code);
    setInstanceName(name);
    setLocale(loc);

    // Get localized strings - use predefined strings if available, otherwise generate dynamically
    const instanceStrings = INSTANCE_STRINGS[code] || generateDefaultStrings(name);
    setStrings(instanceStrings);
    
    // Get coalition partners - default to USA partners if not defined
    setCoalitionPartners(COALITION_PARTNERS[code] || DEFAULT_PARTNERS);

    // Get theme from predefined themes or use defaults
    const instanceTheme = INSTANCE_THEMES[code] || DEFAULT_THEME;

    // Allow environment variable overrides
    if (process.env.NEXT_PUBLIC_THEME_PRIMARY) {
      instanceTheme.primary_color = process.env.NEXT_PUBLIC_THEME_PRIMARY;
      instanceTheme.css_variables['--instance-primary'] = process.env.NEXT_PUBLIC_THEME_PRIMARY;
    }
    if (process.env.NEXT_PUBLIC_THEME_SECONDARY) {
      instanceTheme.secondary_color = process.env.NEXT_PUBLIC_THEME_SECONDARY;
      instanceTheme.css_variables['--instance-secondary'] = process.env.NEXT_PUBLIC_THEME_SECONDARY;
    }
    if (process.env.NEXT_PUBLIC_THEME_ACCENT) {
      instanceTheme.accent_color = process.env.NEXT_PUBLIC_THEME_ACCENT;
      instanceTheme.css_variables['--instance-accent'] = process.env.NEXT_PUBLIC_THEME_ACCENT;
    }

    setTheme(instanceTheme);

    // Inject CSS variables into :root
    injectCSSVariables(instanceTheme.css_variables);

    // Update document title dynamically
    if (typeof document !== 'undefined') {
      document.title = `DIVE V3 - ${name}`;
    }

    // Update favicon dynamically
    updateFavicon(code);

    setIsLoading(false);
  }, []);

  return (
    <InstanceThemeContext.Provider value={{ instanceCode, instanceName, locale, theme, strings, coalitionPartners, isLoading }}>
      {children}
    </InstanceThemeContext.Provider>
  );
}

/**
 * Updates the favicon based on instance code
 */
function updateFavicon(code: string) {
  if (typeof document === 'undefined') return;

  // Map instance codes to flag emoji or flag icon paths
  const faviconSvgs: Record<string, string> = {
    USA: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#1a365d"/><text x="16" y="22" text-anchor="middle" font-size="18">🇺🇸</text></svg>`,
    FRA: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#002395"/><text x="16" y="22" text-anchor="middle" font-size="18">🇫🇷</text></svg>`,
    DEU: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#000000"/><text x="16" y="22" text-anchor="middle" font-size="18">🇩🇪</text></svg>`,
    GBR: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#012169"/><text x="16" y="22" text-anchor="middle" font-size="18">🇬🇧</text></svg>`,
    CAN: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#FF0000"/><text x="16" y="22" text-anchor="middle" font-size="18">🇨🇦</text></svg>`,
    ITA: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#009246"/><text x="16" y="22" text-anchor="middle" font-size="18">🇮🇹</text></svg>`,
  };

  const svg = faviconSvgs[code] || faviconSvgs.USA;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  // Find or create favicon link
  let link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = url;
}

/**
 * Injects CSS variables into the document's :root element
 */
function injectCSSVariables(variables: Record<string, string>) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  // Also inject computed colors for Tailwind utility classes
  // Convert hex to RGB for use in rgba()
  const primaryRGB = hexToRGB(variables['--instance-primary']);
  const secondaryRGB = hexToRGB(variables['--instance-secondary']);
  const accentRGB = hexToRGB(variables['--instance-accent']);

  if (primaryRGB) {
    root.style.setProperty('--instance-primary-rgb', primaryRGB);
  }
  if (secondaryRGB) {
    root.style.setProperty('--instance-secondary-rgb', secondaryRGB);
  }
  if (accentRGB) {
    root.style.setProperty('--instance-accent-rgb', accentRGB);
  }
}

/**
 * Converts a hex color to RGB values
 */
function hexToRGB(hex: string): string | null {
  if (!hex || !hex.startsWith('#')) return null;
  
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

/**
 * Get theme colors for a specific instance code (static version)
 * Useful for server components or when context isn't available
 */
export function getInstanceTheme(code: string): InstanceTheme {
  return INSTANCE_THEMES[code.toUpperCase()] || DEFAULT_THEME;
}

/**
 * Get instance name from code
 */
export function getInstanceName(code: string): string {
  return INSTANCE_NAMES[code.toUpperCase()] || code;
}

// Export the themes for use in other components
export { INSTANCE_THEMES, INSTANCE_NAMES, INSTANCE_LOCALES, INSTANCE_STRINGS, COALITION_PARTNERS };

