/**
 * DIVE V3 - Clearance Value Localization
 *
 * Converts normalized clearance values (UNCLASSIFIED, SECRET, etc.) to
 * localized display values based on the instance's country.
 *
 * Uses backend MongoDB clearance equivalency database as SSOT.
 */

type ClearanceLevel = 'UNCLASSIFIED' | 'RESTRICTED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';

// In-memory cache of clearance mappings fetched from backend
let clearanceMappingsCache: Map<string, Record<ClearanceLevel, string>> | null = null;
let fetchPromise: Promise<void> | null = null;

/**
 * Fetch clearance mappings from backend API
 * Cached after first fetch to avoid repeated API calls
 */
async function fetchClearanceMappings(): Promise<Map<string, Record<ClearanceLevel, string>>> {
  // Return cached mappings if available
  if (clearanceMappingsCache) {
    return clearanceMappingsCache;
  }

  // If fetch is already in progress, wait for it
  if (fetchPromise) {
    await fetchPromise;
    return clearanceMappingsCache!;
  }

  // Start new fetch
  fetchPromise = (async () => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const response = await fetch(`${backendUrl}/api/admin/clearance/mappings`);

      if (!response.ok) {
        console.warn('[Clearance Localization] Failed to fetch mappings, using fallback');
        clearanceMappingsCache = getFallbackMappings();
        return;
      }

      const data = await response.json();
      clearanceMappingsCache = buildReverseMappingsFromAPI(data);
    } catch (error) {
      console.warn('[Clearance Localization] Error fetching mappings:', error);
      clearanceMappingsCache = getFallbackMappings();
    } finally {
      fetchPromise = null;
    }
  })();

  await fetchPromise;
  return clearanceMappingsCache!;
}

/**
 * Build reverse clearance mappings from API response
 */
function buildReverseMappingsFromAPI(apiData: any): Map<string, Record<ClearanceLevel, string>> {
  const reverseMappings = new Map<string, Record<ClearanceLevel, string>>();

  for (const mapping of apiData) {
    const standardLevel = mapping.standardLevel as ClearanceLevel;
    const nationalEquivalents = mapping.nationalEquivalents as Record<string, string[]>;

    // For each country, build reverse mapping (normalized → localized)
    for (const [countryCode, localValues] of Object.entries(nationalEquivalents)) {
      if (!reverseMappings.has(countryCode)) {
        reverseMappings.set(countryCode, {} as Record<ClearanceLevel, string>);
      }

      const countryMap = reverseMappings.get(countryCode)!;
      // Use first value as display value (usually the official term)
      countryMap[standardLevel] = localValues[0];
    }
  }

  return reverseMappings;
}

/**
 * Fallback mappings if API is unavailable
 * Uses SHORT FORMS commonly displayed in UI (not full official names)
 */
function getFallbackMappings(): Map<string, Record<ClearanceLevel, string>> {
  const fallback = new Map<string, Record<ClearanceLevel, string>>();

  // FRA (France) - Short forms used in UI
  fallback.set('FRA', {
    UNCLASSIFIED: 'NON CLASSIFIÉ',
    RESTRICTED: 'RESTREINT',           // Short form of "DIFFUSION RESTREINTE"
    CONFIDENTIAL: 'CONFIDENTIEL',       // Short form of "CONFIDENTIEL DÉFENSE"
    SECRET: 'SECRET',                   // Short form of "SECRET DÉFENSE"
    TOP_SECRET: 'TRÈS SECRET'           // Short form of "TRÈS SECRET DÉFENSE"
  });

  // USA, GBR, CAN use English
  const english: Record<ClearanceLevel, string> = {
    UNCLASSIFIED: 'UNCLASSIFIED',
    RESTRICTED: 'RESTRICTED',
    CONFIDENTIAL: 'CONFIDENTIAL',
    SECRET: 'SECRET',
    TOP_SECRET: 'TOP SECRET'
  };

  fallback.set('USA', english);
  fallback.set('GBR', english);
  fallback.set('CAN', english);

  return fallback;
}

/**
 * Get localized clearance display value
 *
 * @param normalizedClearance - The normalized clearance value (e.g., "UNCLASSIFIED")
 * @param instanceCode - The instance country code (e.g., "SVK", "HRV")
 * @returns The localized clearance value for display
 *
 * @example
 * // On SVK instance
 * getLocalizedClearance("UNCLASSIFIED", "SVK") // Returns "NEKLASIFIKOVANE"
 *
 * // On HRV instance
 * getLocalizedClearance("UNCLASSIFIED", "HRV") // Returns "NEKLASIFICIRANO"
 */
export function getLocalizedClearance(
  normalizedClearance: string | null | undefined,
  instanceCode?: string | null
): string {
  // Default to normalized value if no clearance provided
  if (!normalizedClearance) return 'UNCLASSIFIED';

  // Normalize the clearance value (handle arrays, uppercase)
  const normalizedValue = (Array.isArray(normalizedClearance)
    ? normalizedClearance[0]
    : normalizedClearance
  ).toUpperCase() as ClearanceLevel;

  // Get instance code from environment if not provided
  const code = instanceCode?.toUpperCase() || process.env.NEXT_PUBLIC_INSTANCE || 'USA';

  // Try to use cached mappings synchronously (common case after first load)
  if (clearanceMappingsCache) {
    const countryMapping = clearanceMappingsCache.get(code);
    if (countryMapping) {
      return countryMapping[normalizedValue] || normalizedValue;
    }
  }

  // If no cache yet, use fallback (mappings will load in background for next time)
  if (!clearanceMappingsCache) {
    // Trigger async fetch for next time (non-blocking)
    fetchClearanceMappings().catch(console.error);

    // Use fallback for this render
    const fallback = getFallbackMappings();
    const countryMapping = fallback.get(code);
    return countryMapping?.[normalizedValue] || normalizedValue;
  }

  // Country not found - return normalized value
  return normalizedValue;
}

/**
 * Get localized clearance with both values for display
 * Useful for showing both the local and normalized values
 *
 * @example
 * getLocalizedClearanceWithFallback("UNCLASSIFIED", "SVK")
 * // Returns { display: "NEKLASIFIKOVANE", normalized: "UNCLASSIFIED" }
 */
export function getLocalizedClearanceWithFallback(
  normalizedClearance: string | null | undefined,
  instanceCode?: string | null
): { display: string; normalized: string } {
  const normalized = normalizedClearance?.toString().toUpperCase() || 'UNCLASSIFIED';
  const display = getLocalizedClearance(normalizedClearance, instanceCode);

  return { display, normalized };
}

/**
 * Check if an instance uses localized clearance values
 */
export function usesLocalizedClearance(instanceCode?: string | null): boolean {
  const code = instanceCode?.toUpperCase() || process.env.NEXT_PUBLIC_INSTANCE || 'USA';
  // USA and GBR use English values, so no localization needed
  return code !== 'USA' && code !== 'GBR' && code !== 'CAN' && code !== 'AUS' && code !== 'NZL';
}

/**
 * Get the country name for an instance code
 */
export function getCountryName(instanceCode: string): string {
  // Hardcoded country names (lightweight, no API needed)
  const countryNames: Record<string, string> = {
    USA: 'United States', FRA: 'France', GBR: 'United Kingdom',
    DEU: 'Germany', CAN: 'Canada', ITA: 'Italy', ESP: 'Spain',
    POL: 'Poland', NLD: 'Netherlands'
  };
  return countryNames[instanceCode.toUpperCase()] || instanceCode;
}

/**
 * Get the language for an instance code
 */
export function getCountryLanguage(instanceCode: string): string {
  // Hardcoded language mappings (lightweight, no API needed)
  const languages: Record<string, string> = {
    USA: 'English', GBR: 'English', CAN: 'English',
    FRA: 'French', DEU: 'German', ITA: 'Italian',
    ESP: 'Spanish', POL: 'Polish', NLD: 'Dutch'
  };
  return languages[instanceCode.toUpperCase()] || 'English';
}
