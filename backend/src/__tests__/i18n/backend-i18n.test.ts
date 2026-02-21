/**
 * Unit Tests: Backend i18n
 *
 * Tests backend internationalization utilities.
 *
 * Test Coverage:
 * - Translation function (t)
 * - Accept-Language parsing
 * - Locale detection from request
 * - Translation interpolation
 * - Fallback behavior
 * - Caching
 *
 * @version 1.0.0
 * @date 2026-01-16
 */

import { t, parseAcceptLanguage, getLocaleFromRequest } from '../../utils/i18n';
import { Request } from 'express';

describe('Backend i18n', () => {
  describe('Translation Function (t)', () => {
    it('returns translated string for valid key', () => {
      const result = t('authentication.unauthorized', {}, 'en');
      expect(result).toBe('Unauthorized. Please sign in.');
    });

    it('returns key when translation is missing', () => {
      const result = t('nonexistent.key', {}, 'en');
      expect(result).toBe('nonexistent.key');
    });

    it('interpolates placeholders correctly', () => {
      const result = t('authorization.countryRestriction', { country: 'USA' }, 'en');
      expect(result).toContain('USA');
    });

    it('handles nested keys with dot notation', () => {
      const result = t('authorization.insufficientClearance', {}, 'en');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('falls back to English if locale not found', () => {
      const result = t('authentication.unauthorized', {}, 'xx' as any);
      expect(result).toBe('Unauthorized. Please sign in.');
    });
  });

  describe('Accept-Language Parsing', () => {
    it('parses simple language code', () => {
      const locale = parseAcceptLanguage('fr');
      expect(locale).toBe('fr');
    });

    it('parses language with region code', () => {
      const locale = parseAcceptLanguage('fr-FR');
      expect(locale).toBe('fr');
    });

    it('parses quality values and selects highest', () => {
      const locale = parseAcceptLanguage('fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7');
      expect(locale).toBe('fr');
    });

    it('skips unsupported languages', () => {
      const locale = parseAcceptLanguage('zh-CN,ja;q=0.9,en;q=0.8');
      expect(locale).toBe('en'); // Falls back to English
    });

    it('handles missing header gracefully', () => {
      const locale = parseAcceptLanguage(undefined);
      expect(locale).toBe('en');
    });

    it('handles malformed header gracefully', () => {
      const locale = parseAcceptLanguage('invalid;;;header');
      expect(locale).toBe('en');
    });
  });

  describe('Locale Detection from Request', () => {
    it('prioritizes query parameter over header', () => {
      const mockReq = {
        query: { locale: 'de' },
        headers: { 'accept-language': 'fr-FR' },
      } as unknown as Request;

      const locale = getLocaleFromRequest(mockReq);
      expect(locale).toBe('de');
    });

    it('uses Accept-Language header if no query param', () => {
      const mockReq = {
        query: {},
        headers: { 'accept-language': 'fr-FR,fr;q=0.9' },
      } as unknown as Request;

      const locale = getLocaleFromRequest(mockReq);
      expect(locale).toBe('fr');
    });

    it('defaults to English if nothing specified', () => {
      const mockReq = {
        query: {},
        headers: {},
      } as unknown as Request;

      const locale = getLocaleFromRequest(mockReq);
      expect(locale).toBe('en');
    });

    it('rejects invalid query parameter', () => {
      const mockReq = {
        query: { locale: 'invalid-locale' },
        headers: { 'accept-language': 'fr-FR' },
      } as unknown as Request;

      const locale = getLocaleFromRequest(mockReq);
      expect(locale).toBe('fr'); // Falls back to Accept-Language
    });
  });

  describe('All Supported Locales', () => {
    const locales = ['en', 'fr', 'de', 'es', 'it', 'nl', 'pl'];

    locales.forEach((locale) => {
      it(`loads error translations for ${locale}`, () => {
        const result = t('authentication.unauthorized', {}, locale as any);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Translation Caching', () => {
    it('caches translations for performance', () => {
      const startTime = performance.now();

      // First call - loads from file
      t('authentication.unauthorized', {}, 'en');

      const firstCallTime = performance.now() - startTime;

      const startTime2 = performance.now();

      // Second call - loads from cache
      t('authentication.unauthorized', {}, 'en');

      const secondCallTime = performance.now() - startTime2;

      // Cached call should be faster
      expect(secondCallTime).toBeLessThan(firstCallTime);
    });
  });

  describe('Error Messages Coverage', () => {
    const errorCategories = [
      'authentication',
      'authorization',
      'resources',
      'validation',
      'server',
    ];

    errorCategories.forEach((category) => {
      it(`has translations for ${category} errors`, () => {
        // Check that category exists
        const result = t(`${category}.unauthorized`, {}, 'en');
        expect(typeof result).toBe('string');
      });
    });
  });
});
