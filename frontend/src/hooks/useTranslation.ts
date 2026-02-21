/**
 * useTranslation Hook
 *
 * Simple translation hook without external dependencies
 * Loads JSON locale files dynamically
 * Uses global LocaleContext for real-time language switching
 *
 * Phase 4.8: Translation Helper Hook
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Locale, defaultLocale } from '../i18n/config';
import { useLocale } from '../contexts/LocaleContext';

// Translation cache - with cache busting for development
const translationCache: Map<string, any> = new Map();

// Clear cache in development to prevent stale translations
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    translationCache.clear();
}

/**
 * Load translation file
 */
async function loadTranslation(locale: Locale, namespace: string): Promise<any> {
    const cacheKey = `${locale}-${namespace}`;

    // In development, skip cache to always get fresh translations
    if (process.env.NODE_ENV !== 'development' && translationCache.has(cacheKey)) {
        return translationCache.get(cacheKey);
    }

    try {
        const translations = await import(`../locales/${locale}/${namespace}.json`);
        translationCache.set(cacheKey, translations.default);
        return translations.default;
    } catch (error) {
        console.warn(`Failed to load translation: ${locale}/${namespace}`, error);

        // Fallback to default locale
        if (locale !== defaultLocale) {
            try {
                const fallback = await import(`../locales/${defaultLocale}/${namespace}.json`);
                return fallback.default;
            } catch {
                return {};
            }
        }

        return {};
    }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): string | undefined {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Replace variables in translation string
 */
function interpolate(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return variables[key] !== undefined ? String(variables[key]) : `{{${key}}}`;
    });
}

/**
 * useTranslation Hook
 */
export function useTranslation(namespace: string = 'common') {
    const { locale } = useLocale(); // Use global locale from context
    const [translations, setTranslations] = useState<any>({});

    // Load translations when locale or namespace changes
    useEffect(() => {
        loadTranslation(locale, namespace).then(setTranslations);
    }, [locale, namespace]);

    // Translation function
    const t = useCallback((key: string, variables?: Record<string, any>): string => {
        const value = getNestedValue(translations, key);

        if (!value) {
            console.warn(`Translation missing: ${locale}.${namespace}.${key}`);
            return key;
        }

        if (variables) {
            return interpolate(value, variables);
        }

        return value;
    }, [translations, locale, namespace]);

    return {
        t,
        locale
    };
}

/**
 * Shorthand hook for common translations
 */
export function useCommonTranslation() {
    return useTranslation('common');
}

/**
 * Shorthand hook for auth translations
 */
export function useAuthTranslation() {
    return useTranslation('auth');
}

/**
 * Shorthand hook for admin translations
 */
export function useAdminTranslation() {
    return useTranslation('admin');
}
