/**
 * DIVE V3 - Frontend Attribute Normalizer
 * 
 * Normalizes user attributes that may come as arrays from external IdPs
 * to strings for consistent frontend usage
 */

/**
 * Normalize clearance attribute (string or array to string)
 */
export function normalizeClearance(clearance: string | string[] | null | undefined): string {
    if (!clearance) return 'UNCLASSIFIED';
    if (Array.isArray(clearance)) {
        return clearance[0] || 'UNCLASSIFIED';
    }
    return clearance;
}

/**
 * Normalize country of affiliation (string or array to string)
 */
export function normalizeCountry(country: string | string[] | null | undefined): string {
    if (!country) return '';
    if (Array.isArray(country)) {
        return country[0] || '';
    }
    return country;
}

/**
 * Normalize acpCOI (ensure array)
 */
export function normalizeCOI(coi: string | string[] | null | undefined): string[] {
    if (!coi) return [];
    if (Array.isArray(coi)) {
        return coi;
    }
    // If it's a string, split by comma or return as single-item array
    if (typeof coi === 'string') {
        return coi.includes(',') ? coi.split(',').map(s => s.trim()) : [coi];
    }
    return [];
}

/**
 * Normalize uniqueID (string or array to string)
 */
export function normalizeUniqueID(uniqueID: string | string[] | null | undefined): string {
    if (!uniqueID) return '';
    if (Array.isArray(uniqueID)) {
        return uniqueID[0] || '';
    }
    return uniqueID;
}
