/**
 * SPIF Markings Utility
 *
 * Client-side utility for generating STANAG 4774-compliant marking text
 * from ZTDF resource attributes.
 *
 * Reference: NATO Security Policy Information File (SPIF)
 */

/**
 * Classification levels with marking information
 */
export const CLASSIFICATIONS = {
    UNCLASSIFIED: {
        pageTopBottom: { en: 'UNCLASSIFIED', fr: 'SANS CLASSIFICATION' },
        portionMarking: 'NU',
        hierarchy: 1,
        color: { bg: '#22c55e', text: '#ffffff', border: '#16a34a' },
    },
    RESTRICTED: {
        pageTopBottom: { en: 'RESTRICTED', fr: 'DIFFUSION RESTREINTE' },
        portionMarking: 'NR',
        hierarchy: 2,
        color: { bg: '#3b82f6', text: '#ffffff', border: '#2563eb' },
    },
    CONFIDENTIAL: {
        pageTopBottom: { en: 'CONFIDENTIAL', fr: 'CONFIDENTIEL' },
        portionMarking: 'NC',
        hierarchy: 3,
        color: { bg: '#3b82f6', text: '#ffffff', border: '#2563eb' },
    },
    SECRET: {
        pageTopBottom: { en: 'SECRET', fr: 'SECRET' },
        portionMarking: 'NS',
        hierarchy: 4,
        color: { bg: '#ef4444', text: '#ffffff', border: '#dc2626' },
    },
    TOP_SECRET: {
        pageTopBottom: { en: 'TOP SECRET', fr: 'TRES SECRET' },
        portionMarking: 'CTS',
        hierarchy: 5,
        color: { bg: '#f97316', text: '#ffffff', border: '#ea580c' },
    },
} as const;

/**
 * Country codes to full names mapping
 */
export const COUNTRY_NAMES: Record<string, { en: string; fr: string }> = {
    USA: { en: 'United States of America', fr: 'États-Unis' },
    GBR: { en: 'United Kingdom', fr: 'Royaume-Uni' },
    FRA: { en: 'France', fr: 'France' },
    DEU: { en: 'Germany', fr: 'Allemagne' },
    CAN: { en: 'Canada', fr: 'Canada' },
    AUS: { en: 'Australia', fr: 'Australie' },
    NZL: { en: 'New Zealand', fr: 'Nouvelle-Zélande' },
    ITA: { en: 'Italy', fr: 'Italie' },
    ESP: { en: 'Spain', fr: 'Espagne' },
    NLD: { en: 'Netherlands', fr: 'Pays-Bas' },
    BEL: { en: 'Belgium', fr: 'Belgique' },
    POL: { en: 'Poland', fr: 'Pologne' },
    NOR: { en: 'Norway', fr: 'Norvège' },
    DNK: { en: 'Denmark', fr: 'Danemark' },
    PRT: { en: 'Portugal', fr: 'Portugal' },
    TUR: { en: 'Turkey', fr: 'Turquie' },
    GRC: { en: 'Greece', fr: 'Grèce' },
    CZE: { en: 'Czech Republic', fr: 'République Tchèque' },
    HUN: { en: 'Hungary', fr: 'Hongrie' },
    ROU: { en: 'Romania', fr: 'Roumanie' },
    BGR: { en: 'Bulgaria', fr: 'Bulgarie' },
    SVK: { en: 'Slovakia', fr: 'Slovaquie' },
    SVN: { en: 'Slovenia', fr: 'Slovénie' },
    EST: { en: 'Estonia', fr: 'Estonie' },
    LVA: { en: 'Latvia', fr: 'Lettonie' },
    LTU: { en: 'Lithuania', fr: 'Lituanie' },
    LUX: { en: 'Luxembourg', fr: 'Luxembourg' },
    ISL: { en: 'Iceland', fr: 'Islande' },
    ALB: { en: 'Albania', fr: 'Albanie' },
    HRV: { en: 'Croatia', fr: 'Croatie' },
    MNE: { en: 'Montenegro', fr: 'Monténégro' },
    NOM: { en: 'North Macedonia', fr: 'Macédoine du Nord' },
    NATO: { en: 'NATO', fr: 'OTAN' },
    FVEY: { en: 'Five Eyes', fr: 'Five Eyes' },
};

/**
 * Common caveats/handling instructions
 */
export const CAVEATS: Record<string, string> = {
    NOFORN: 'Not Releasable to Foreign Nationals',
    NOCONTRACT: 'Not Releasable to Contractors',
    PROPIN: 'Proprietary Information Involved',
    RELIDO: 'Releasable by Information Disclosure Official',
    ORCON: 'Originator Controlled',
    IMCON: 'Imagery Intelligence Controlled',
    ATOMAL: 'Atomic Information',
    CRYPTO: 'Cryptographic Information',
    SIOP: 'Single Integrated Operational Plan',
    BOHEMIA: 'BOHEMIA Compartment',
};

export type ClassificationLevel = keyof typeof CLASSIFICATIONS;
export type Language = 'en' | 'fr';

/**
 * Generated marking result
 */
export interface IGeneratedMarking {
    displayMarking: string;
    pageTopBottom: string;
    portionMarking: string;
    watermarkText: string;
    classification: ClassificationLevel;
    releasabilityPhrase: string;
    color: { bg: string; text: string; border: string };
}

/**
 * Normalize classification string to enum key
 */
export function normalizeClassification(classification: string): ClassificationLevel {
    const normalized = classification.toUpperCase().replace(/\s+/g, '_');

    if (normalized === 'TOP SECRET') return 'TOP_SECRET';
    if (normalized in CLASSIFICATIONS) return normalized as ClassificationLevel;

    // Fallback to SECRET for safety
    console.warn(`Unknown classification "${classification}", defaulting to SECRET`);
    return 'SECRET';
}

/**
 * Generate marking text from resource attributes
 */
export function generateMarkingText(
    classification: string,
    releasabilityTo: string[],
    options: {
        COI?: string[];
        caveats?: string[];
        language?: Language;
    } = {}
): IGeneratedMarking {
    const language = options.language || 'en';
    const normalizedClassification = normalizeClassification(classification);
    const classData = CLASSIFICATIONS[normalizedClassification];

    // Get classification phrase
    const classificationPhrase = classData.pageTopBottom[language];
    const portionMarking = `(${classData.portionMarking})`;

    // Build releasability phrase
    let releasabilityPhrase = '';
    if (releasabilityTo && releasabilityTo.length > 0) {
        // Use short country codes for display
        releasabilityPhrase = `REL TO ${releasabilityTo.join(', ')}`;
    }

    // Build caveats phrase
    let caveatsPhrase = '';
    if (options.caveats && options.caveats.length > 0) {
        caveatsPhrase = options.caveats.join('/');
    }

    // Build COI phrase
    let coiPhrase = '';
    if (options.COI && options.COI.length > 0) {
        coiPhrase = options.COI.join('/');
    }

    // Construct full display marking
    const parts: string[] = [classificationPhrase];
    if (caveatsPhrase) parts.push(caveatsPhrase);
    if (coiPhrase) parts.push(coiPhrase);
    if (releasabilityPhrase) parts.push(releasabilityPhrase);

    const displayMarking = parts.join(' // ');

    return {
        displayMarking,
        pageTopBottom: classificationPhrase,
        portionMarking,
        watermarkText: classificationPhrase,
        classification: normalizedClassification,
        releasabilityPhrase,
        color: classData.color,
    };
}

/**
 * Get classification color
 */
export function getClassificationColor(classification: string): { bg: string; text: string; border: string } {
    const normalized = normalizeClassification(classification);
    return CLASSIFICATIONS[normalized].color;
}

/**
 * Get portion marking abbreviation
 */
export function getPortionMarking(classification: string): string {
    const normalized = normalizeClassification(classification);
    return `(${CLASSIFICATIONS[normalized].portionMarking})`;
}

/**
 * Compare classification levels
 * Returns: negative if a < b, positive if a > b, 0 if equal
 */
export function compareClassifications(a: string, b: string): number {
    const levelA = CLASSIFICATIONS[normalizeClassification(a)]?.hierarchy || 0;
    const levelB = CLASSIFICATIONS[normalizeClassification(b)]?.hierarchy || 0;
    return levelA - levelB;
}

/**
 * Check if classification meets minimum requirement
 */
export function meetsClassificationRequirement(userClearance: string, resourceClassification: string): boolean {
    return compareClassifications(userClearance, resourceClassification) >= 0;
}

/**
 * Get country name from ISO code
 */
export function getCountryName(code: string, language: Language = 'en'): string {
    return COUNTRY_NAMES[code]?.[language] || code;
}

/**
 * Format releasability list for display
 */
export function formatReleasability(countries: string[], style: 'codes' | 'names' = 'codes', language: Language = 'en'): string {
    if (!countries || countries.length === 0) return '';

    if (style === 'codes') {
        return `REL TO ${countries.join(', ')}`;
    }

    const names = countries.map(c => getCountryName(c, language));
    return `Releasable to ${names.join(', ')}`;
}

/**
 * Parse display marking back to components
 */
export function parseDisplayMarking(displayMarking: string): {
    classification: string;
    caveats: string[];
    releasability: string[];
} {
    const parts = displayMarking.split(' // ').map(p => p.trim());
    const classification = parts[0] || 'UNCLASSIFIED';
    const caveats: string[] = [];
    const releasability: string[] = [];

    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (part.startsWith('REL TO ')) {
            const countries = part.replace('REL TO ', '').split(',').map(c => c.trim());
            releasability.push(...countries);
        } else if (part.includes('/')) {
            caveats.push(...part.split('/'));
        } else {
            caveats.push(part);
        }
    }

    return { classification, caveats, releasability };
}

/**
 * Generate watermark SVG pattern
 */
export function generateWatermarkPattern(text: string, color: string = 'rgba(0,0,0,0.08)'): string {
    const encodedText = encodeURIComponent(text);
    return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Ctext x='100' y='100' font-family='Arial, sans-serif' font-size='16' fill='${encodeURIComponent(color)}' text-anchor='middle' transform='rotate(-45, 100, 100)'%3E${encodedText}%3C/text%3E%3C/svg%3E")`;
}
