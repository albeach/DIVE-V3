/**
 * i18n Configuration
 * 
 * Multi-language support for:
 * - English (en) - Default, USA, Canada, UK
 * - French (fr) - France, Canada
 * - German (de) - Germany
 * - Italian (it) - Italy
 * - Spanish (es) - Spain
 * - Polish (pl) - Poland
 * - Dutch (nl) - Netherlands
 * 
 * Phase 4.5: i18n Setup
 * Phase 5: NATO Expansion Multi-Language
 */

export const locales = ['en', 'fr', 'de', 'it', 'es', 'pl', 'nl'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
    en: 'English',
    fr: 'Français',
    de: 'Deutsch',
    it: 'Italiano',
    es: 'Español',
    pl: 'Polski',
    nl: 'Nederlands'
};

export const localeFlags: Record<Locale, string> = {
    en: '🇺🇸',
    fr: '🇫🇷',
    de: '🇩🇪',
    it: '🇮🇹',
    es: '🇪🇸',
    pl: '🇵🇱',
    nl: '🇳🇱'
};

/**
 * Get browser language preference
 */
export function getBrowserLocale(): Locale {
    if (typeof window === 'undefined') return defaultLocale;

    const browserLang = navigator.language.split('-')[0];
    return locales.includes(browserLang as Locale) ? (browserLang as Locale) : defaultLocale;
}

/**
 * Get stored language preference
 */
export function getStoredLocale(): Locale {
    if (typeof window === 'undefined') return defaultLocale;

    const stored = localStorage.getItem('dive-v3-locale');
    return stored && locales.includes(stored as Locale) ? (stored as Locale) : defaultLocale;
}

/**
 * Store language preference
 */
export function setStoredLocale(locale: Locale): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('dive-v3-locale', locale);
}

/**
 * IdP-to-Locale Mapping
 * 
 * Maps IdP aliases to their primary language/locale.
 * This enables automatic language detection based on the IdP being used.
 */
export const idpLocaleMap: Record<string, Locale> = {
    // USA
    'usa-idp': 'en',
    'us-idp': 'en',
    'usa-realm-broker': 'en',

    // France
    'fra-idp': 'fr',
    'france-idp': 'fr',
    'fra-realm-broker': 'fr',

    // Canada (bilingual - default to English, but also supports French)
    'can-idp': 'en',
    'canada-idp': 'en',
    'can-realm-broker': 'en',

    // Germany
    'deu-idp': 'de',
    'germany-idp': 'de',
    'deu-realm-broker': 'de',

    // United Kingdom
    'gbr-idp': 'en',
    'uk-idp': 'en',
    'gbr-realm-broker': 'en',

    // Italy
    'ita-idp': 'it',
    'italy-idp': 'it',
    'ita-realm-broker': 'it',

    // Spain
    'esp-idp': 'es',
    'spain-idp': 'es',
    'esp-realm-broker': 'es',

    // Poland
    'pol-idp': 'pl',
    'poland-idp': 'pl',
    'pol-realm-broker': 'pl',

    // Netherlands
    'nld-idp': 'nl',
    'netherlands-idp': 'nl',
    'nld-realm-broker': 'nl',

    // Industry/Broker (default to English)
    'industry-idp': 'en',
    'dive-v3-broker': 'en'
};

/**
 * Get locale from IdP alias
 * 
 * Automatically determines the appropriate language based on the IdP.
 * Falls back to stored preference or default locale.
 * 
 * @param idpAlias - The IdP alias from the route (e.g., 'ita-realm-broker')
 * @returns The appropriate locale for the IdP
 */
export function getLocaleFromIdP(idpAlias: string): Locale {
    // Check direct mapping
    if (idpAlias in idpLocaleMap) {
        return idpLocaleMap[idpAlias];
    }

    // Try to match by country code (first 3 chars: 'ita' in 'ita-realm-broker')
    const countryCode = idpAlias.substring(0, 3).toLowerCase();
    const matchingKey = Object.keys(idpLocaleMap).find(key =>
        key.startsWith(countryCode)
    );

    if (matchingKey) {
        return idpLocaleMap[matchingKey];
    }

    // Fall back to stored or default
    return getStoredLocale();
}
