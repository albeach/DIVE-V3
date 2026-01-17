/**
 * Country to Locale Mapping
 *
 * Maps ISO 3166-1 alpha-3 country codes to locale codes
 * Used to automatically set the user's locale based on their country of affiliation
 */

import { Locale, idpLocaleMap } from '@/i18n/config';

// Country to locale mapping (ISO 3166-1 alpha-3 to locale)
const countryLocaleMap: Record<string, Locale> = {
    // Primary NATO countries with their locales
    'USA': 'en', // United States
    'GBR': 'en', // United Kingdom
    'CAN': 'en', // Canada (officially bilingual, but default to English)
    'FRA': 'fr', // France
    'DEU': 'de', // Germany
    'ITA': 'it', // Italy
    'ESP': 'es', // Spain
    'POL': 'pl', // Poland
    'NLD': 'nl', // Netherlands

    // Additional NATO countries
    'BEL': 'nl', // Belgium (Dutch/French, but Dutch is official for NATO)
    'DNK': 'da', // Denmark
    'NOR': 'no', // Norway
    'ISL': 'is', // Iceland
    'PRT': 'pt', // Portugal
    'LUX': 'fr', // Luxembourg (French)
    'CZE': 'cs', // Czech Republic
    'SVK': 'sk', // Slovakia
    'HUN': 'hu', // Hungary
    'BGR': 'bg', // Bulgaria
    'HRV': 'hr', // Croatia
    'SVN': 'sl', // Slovenia
    'ALB': 'sq', // Albania
    'MNE': 'sr', // Montenegro (Serbian)
    'MKD': 'mk', // North Macedonia
    'TUR': 'tr', // Turkey
    'GRC': 'el', // Greece
    'LTU': 'lt', // Lithuania
    'LVA': 'lv', // Latvia
    'EST': 'et', // Estonia
    'FIN': 'fi', // Finland
    'SWE': 'sv', // Sweden

    // Partner countries
    'AUS': 'en', // Australia
    'NZL': 'en', // New Zealand
    // 'JPN': 'ja', // Japan (not supported yet)
    // 'KOR': 'ko', // South Korea (not supported yet)
};

/**
 * Get locale from country code
 *
 * @param countryCode - ISO 3166-1 alpha-3 country code
 * @returns The appropriate locale for the country, defaults to 'en'
 */
export function getLocaleFromCountry(countryCode: string): Locale {
    if (!countryCode) return 'en';

    const upperCode = countryCode.toUpperCase();
    return countryLocaleMap[upperCode] || 'en';
}

/**
 * Get locale from IdP alias (for compatibility)
 *
 * @param idpAlias - The IdP alias (e.g., 'fra-idp')
 * @returns The appropriate locale for the IdP
 */
export function getLocaleFromIdPAlias(idpAlias: string): Locale {
    // This is a compatibility function that uses the existing idpLocaleMap
    // but falls back to country-based detection if not found
    if (idpAlias in idpLocaleMap) {
        return idpLocaleMap[idpAlias];
    }

    // Try to extract country code from alias (e.g., 'fra' from 'fra-idp')
    const countryCode = idpAlias.substring(0, 3).toUpperCase();
    return getLocaleFromCountry(countryCode);
}