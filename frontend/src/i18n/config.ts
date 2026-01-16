/**
 * i18n Configuration
 * 
 * Multi-language support for 25 languages across 32 NATO members.
 * 
 * Primary Languages (Complete):
 * - English (en) - USA, GBR, CAN, NZL
 * - French (fr) - France, Canada
 * - German (de) - Germany
 * - Italian (it) - Italy
 * - Spanish (es) - Spain
 * - Polish (pl) - Poland
 * - Dutch (nl) - Netherlands
 * 
 * NATO Expansion Languages (Skeleton):
 * - Romanian, Portuguese, Czech, Greek, Hungarian, Slovak, Bulgarian,
 *   Croatian, Lithuanian, Latvian, Estonian, Slovenian, Albanian,
 *   Macedonian, Serbian, Turkish, Norwegian, Icelandic, Danish, Finnish, Swedish
 * 
 * Phase 7: NATO Expansion Multi-Language
 */

// Primary languages (complete translations)
export const primaryLocales = ['en', 'fr', 'de', 'it', 'es', 'pl', 'nl'] as const;

// All supported locales (primary + NATO expansion)
export const locales = [
    ...primaryLocales,
    'ro', 'pt', 'cs', 'el', 'hu', 'sk', 'bg', 'hr', 'lt', 'lv', 'et', 'sl',
    'sq', 'mk', 'sr', 'tr', 'no', 'is', 'da', 'fi', 'sv'
] as const;

export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
    // Primary languages
    en: 'English',
    fr: 'Français',
    de: 'Deutsch',
    it: 'Italiano',
    es: 'Español',
    pl: 'Polski',
    nl: 'Nederlands',
    // NATO expansion languages
    ro: 'Română',           // Romanian
    pt: 'Português',        // Portuguese
    cs: 'Čeština',          // Czech
    el: 'Ελληνικά',         // Greek
    hu: 'Magyar',           // Hungarian
    sk: 'Slovenčina',       // Slovak
    bg: 'Български',        // Bulgarian
    hr: 'Hrvatski',         // Croatian
    lt: 'Lietuvių',         // Lithuanian
    lv: 'Latviešu',         // Latvian
    et: 'Eesti',            // Estonian
    sl: 'Slovenščina',      // Slovenian
    sq: 'Shqip',            // Albanian
    mk: 'Македонски',       // Macedonian
    sr: 'Српски',           // Serbian
    tr: 'Türkçe',           // Turkish
    no: 'Norsk',            // Norwegian
    is: 'Íslenska',         // Icelandic
    da: 'Dansk',            // Danish
    fi: 'Suomi',            // Finnish
    sv: 'Svenska',          // Swedish
};

export const localeFlags: Record<Locale, string> = {
    // Primary languages
    en: '🇺🇸',
    fr: '🇫🇷',
    de: '🇩🇪',
    it: '🇮🇹',
    es: '🇪🇸',
    pl: '🇵🇱',
    nl: '🇳🇱',
    // NATO expansion languages
    ro: '🇷🇴',  // Romania
    pt: '🇵🇹',  // Portugal
    cs: '🇨🇿',  // Czech Republic
    el: '🇬🇷',  // Greece
    hu: '🇭🇺',  // Hungary
    sk: '🇸🇰',  // Slovakia
    bg: '🇧🇬',  // Bulgaria
    hr: '🇭🇷',  // Croatia
    lt: '🇱🇹',  // Lithuania
    lv: '🇱🇻',  // Latvia
    et: '🇪🇪',  // Estonia
    sl: '🇸🇮',  // Slovenia
    sq: '🇦🇱',  // Albania
    mk: '🇲🇰',  // North Macedonia
    sr: '🇲🇪',  // Montenegro (Serbian)
    tr: '🇹🇷',  // Turkey
    no: '🇳🇴',  // Norway
    is: '🇮🇸',  // Iceland
    da: '🇩🇰',  // Denmark
    fi: '🇫🇮',  // Finland
    sv: '🇸🇪',  // Sweden
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
 * Supports all 32 NATO members + partners.
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

    // Canada (bilingual - default to English)
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

    // Romania
    'rou-idp': 'ro',
    'romania-idp': 'ro',
    'rou-realm-broker': 'ro',

    // Portugal
    'prt-idp': 'pt',
    'portugal-idp': 'pt',
    'prt-realm-broker': 'pt',

    // Czech Republic
    'cze-idp': 'cs',
    'czech-idp': 'cs',
    'cze-realm-broker': 'cs',

    // Greece
    'grc-idp': 'el',
    'greece-idp': 'el',
    'grc-realm-broker': 'el',

    // Hungary
    'hun-idp': 'hu',
    'hungary-idp': 'hu',
    'hun-realm-broker': 'hu',

    // Slovakia
    'svk-idp': 'sk',
    'slovakia-idp': 'sk',
    'svk-realm-broker': 'sk',

    // Bulgaria
    'bgr-idp': 'bg',
    'bulgaria-idp': 'bg',
    'bgr-realm-broker': 'bg',

    // Croatia
    'hrv-idp': 'hr',
    'croatia-idp': 'hr',
    'hrv-realm-broker': 'hr',

    // Lithuania
    'ltu-idp': 'lt',
    'lithuania-idp': 'lt',
    'ltu-realm-broker': 'lt',

    // Latvia
    'lva-idp': 'lv',
    'latvia-idp': 'lv',
    'lva-realm-broker': 'lv',

    // Estonia
    'est-idp': 'et',
    'estonia-idp': 'et',
    'est-realm-broker': 'et',

    // Slovenia
    'svn-idp': 'sl',
    'slovenia-idp': 'sl',
    'svn-realm-broker': 'sl',

    // Albania
    'alb-idp': 'sq',
    'albania-idp': 'sq',
    'alb-realm-broker': 'sq',

    // North Macedonia
    'mkd-idp': 'mk',
    'macedonia-idp': 'mk',
    'mkd-realm-broker': 'mk',

    // Montenegro (Serbian)
    'mne-idp': 'sr',
    'montenegro-idp': 'sr',
    'mne-realm-broker': 'sr',

    // Turkey
    'tur-idp': 'tr',
    'turkey-idp': 'tr',
    'tur-realm-broker': 'tr',

    // Norway
    'nor-idp': 'no',
    'norway-idp': 'no',
    'nor-realm-broker': 'no',

    // Iceland
    'isl-idp': 'is',
    'iceland-idp': 'is',
    'isl-realm-broker': 'is',

    // Denmark
    'dnk-idp': 'da',
    'denmark-idp': 'da',
    'dnk-realm-broker': 'da',

    // Finland (Enhanced Opportunities Partner)
    'fin-idp': 'fi',
    'finland-idp': 'fi',
    'fin-realm-broker': 'fi',

    // Sweden (Enhanced Opportunities Partner)
    'swe-idp': 'sv',
    'sweden-idp': 'sv',
    'swe-realm-broker': 'sv',

    // New Zealand (English)
    'nzl-idp': 'en',
    'newzealand-idp': 'en',
    'nzl-realm-broker': 'en',

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
