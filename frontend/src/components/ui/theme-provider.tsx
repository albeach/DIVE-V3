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

const INSTANCE_LOCALES: Record<string, string> = {
  USA: 'en',
  FRA: 'fr',
  DEU: 'de',
  GBR: 'en',
  CAN: 'en',
  ITA: 'it',
  ESP: 'es',
  NLD: 'nl',
  POL: 'pl',
};

const InstanceThemeContext = createContext<InstanceThemeContextValue>({
  instanceCode: 'USA',
  instanceName: 'United States',
  locale: 'en',
  theme: DEFAULT_THEME,
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

  useEffect(() => {
    // Get instance code from environment variable
    const code = process.env.NEXT_PUBLIC_INSTANCE || 'USA';
    const name = process.env.NEXT_PUBLIC_INSTANCE_NAME || INSTANCE_NAMES[code] || code;
    const loc = process.env.NEXT_PUBLIC_LOCALE || INSTANCE_LOCALES[code] || 'en';

    setInstanceCode(code);
    setInstanceName(name);
    setLocale(loc);

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

    setIsLoading(false);
  }, []);

  return (
    <InstanceThemeContext.Provider value={{ instanceCode, instanceName, locale, theme, isLoading }}>
      {children}
    </InstanceThemeContext.Provider>
  );
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
export { INSTANCE_THEMES, INSTANCE_NAMES, INSTANCE_LOCALES };

