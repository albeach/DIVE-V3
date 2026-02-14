/**
 * Backend Internationalization (i18n) Utility
 *
 * Provides locale-aware error messages and validation responses.
 * Supports 7 languages: en, fr, de, es, it, nl, pl
 *
 * Usage:
 * ```typescript
 * import { t, getLocaleFromRequest } from '@/utils/i18n';
 *
 * const locale = getLocaleFromRequest(req);
 * const message = t('errors.authentication.unauthorized', {}, locale);
 * ```
 *
 * @version 1.0.0
 * @date 2026-01-16
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Request, Response, NextFunction } from 'express';

export type Locale = 'en' | 'fr' | 'de' | 'es' | 'it' | 'nl' | 'pl';

export const supportedLocales: Locale[] = ['en', 'fr', 'de', 'es', 'it', 'nl', 'pl'];
export const defaultLocale: Locale = 'en';

// Translation cache
const translationsCache: Map<string, Record<string, unknown>> = new Map();

/**
 * Load translations for a specific locale and namespace
 */
function loadTranslations(locale: Locale, namespace: string = 'errors'): Record<string, unknown> {
  const cacheKey = `${locale}:${namespace}`;

  if (translationsCache.has(cacheKey)) {
    return translationsCache.get(cacheKey);
  }

  try {
    const filePath = join(__dirname, 'locales', locale, `${namespace}.json`);
    const content = readFileSync(filePath, 'utf-8');
    const translations = JSON.parse(content);
    translationsCache.set(cacheKey, translations);
    return translations;
  } catch (error) {
    console.error(`[i18n] Failed to load translations: ${locale}/${namespace}`, error);

    // Fallback to English if available
    if (locale !== defaultLocale) {
      return loadTranslations(defaultLocale, namespace);
    }

    return {};
  }
}

/**
 * Get value from nested object using dot notation
 * Example: "errors.authentication.unauthorized" -> translations.errors.authentication.unauthorized
 */
function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  return path.split('.').reduce<unknown>((current, key) => (current as Record<string, unknown>)?.[key], obj) as string | undefined;
}

/**
 * Replace placeholders in translation string
 * Example: "Hello {{name}}" with {name: "John"} -> "Hello John"
 */
function interpolate(str: string, params: Record<string, unknown> = {}): string {
  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

/**
 * Translate a key to the target locale
 *
 * @param key - Translation key (e.g., "errors.authentication.unauthorized")
 * @param params - Interpolation parameters (e.g., {field: "email"})
 * @param locale - Target locale (defaults to 'en')
 * @param namespace - Translation namespace (defaults to 'errors')
 * @returns Translated string
 */
export function t(
  key: string,
  params: Record<string, unknown> = {},
  locale: Locale = defaultLocale,
  namespace: string = 'errors'
): string {
  const translations = loadTranslations(locale, namespace);
  const value = getNestedValue(translations, key);

  if (!value) {
    console.warn(`[i18n] Translation missing: ${locale}:${namespace}:${key}`);
    return key; // Return key as fallback
  }

  return interpolate(value, params);
}

/**
 * Parse Accept-Language header to determine user's preferred locale
 *
 * Example: "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7" -> 'fr'
 *
 * @param acceptLanguage - Accept-Language header value
 * @returns Preferred locale
 */
export function parseAcceptLanguage(acceptLanguage: string | undefined): Locale {
  if (!acceptLanguage) {
    return defaultLocale;
  }

  // Parse quality values and sort by preference
  const languages = acceptLanguage
    .split(',')
    .map((lang) => {
      const parts = lang.trim().split(';');
      const code = parts[0].split('-')[0].toLowerCase();
      const quality = parts[1] ? parseFloat(parts[1].split('=')[1]) : 1.0;
      return { code, quality };
    })
    .sort((a, b) => b.quality - a.quality);

  // Find first supported locale
  for (const { code } of languages) {
    if (supportedLocales.includes(code as Locale)) {
      return code as Locale;
    }
  }

  return defaultLocale;
}

/**
 * Get locale from Express request
 *
 * Checks (in order):
 * 1. Query parameter: ?locale=fr
 * 2. Accept-Language header
 * 3. Default locale
 *
 * @param req - Express request object
 * @returns Determined locale
 */
export function getLocaleFromRequest(req: Request): Locale {
  // Check query parameter
  const queryLocale = req.query.locale as string;
  if (queryLocale && supportedLocales.includes(queryLocale as Locale)) {
    return queryLocale as Locale;
  }

  // Check Accept-Language header
  const acceptLanguage = req.headers['accept-language'];
  return parseAcceptLanguage(acceptLanguage);
}

/**
 * Express middleware to attach locale to request
 *
 * Usage:
 * ```typescript
 * app.use(localeMiddleware);
 *
 * // In route handler:
 * const message = t('errors.notFound', {}, req.locale);
 * ```
 */
export function localeMiddleware(req: Request, res: Response, next: NextFunction) {
  (req as Request & { locale?: Locale }).locale = getLocaleFromRequest(req);
  next();
}
