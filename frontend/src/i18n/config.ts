/**
 * i18n Configuration
 * 
 * Multi-language support for:
 * - English (en) - Default
 * - French (fr) - France & Canada
 * - Future: German (de), Spanish (es)
 * 
 * Phase 4.5: i18n Setup
 */

export const locales = ['en', 'fr'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
    en: 'English',
    fr: 'Français'
};

export const localeFlags: Record<Locale, string> = {
    en: '🇺🇸',
    fr: '🇫🇷'
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

