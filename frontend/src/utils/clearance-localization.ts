/**
 * DIVE V3 - Clearance Value Localization
 *
 * Converts normalized clearance values (UNCLASSIFIED, SECRET, etc.) to
 * localized display values based on the instance's country.
 *
 * Uses NATO attribute mappings as SSOT for all localization.
 */

// Import the NATO mappings (this will be bundled at build time)
import natoMappings from '../data/nato-attribute-mappings.json';

type ClearanceLevel = 'UNCLASSIFIED' | 'RESTRICTED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';

interface CountryMappings {
  name: string;
  language: string;
  attributes: Record<string, string>;
  clearance_values: Record<string, string>;
  latin_attributes?: Record<string, string>;
}

type NATOCountryCode = keyof typeof natoMappings.countries;

/**
 * Build reverse clearance mappings (normalized → localized) for each country
 */
function buildReverseClearanceMappings(): Map<string, Record<ClearanceLevel, string>> {
  const reverseMappings = new Map<string, Record<ClearanceLevel, string>>();

  const countries = natoMappings.countries as Record<string, CountryMappings>;

  for (const [countryCode, countryData] of Object.entries(countries)) {
    const reverseMap: Partial<Record<ClearanceLevel, string>> = {};

    // Build reverse mapping: normalized → localized
    for (const [localValue, normalizedValue] of Object.entries(countryData.clearance_values)) {
      reverseMap[normalizedValue as ClearanceLevel] = localValue;
    }

    // Fill in any missing mappings with the normalized value as fallback
    const defaultLevels: ClearanceLevel[] = ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
    for (const level of defaultLevels) {
      if (!reverseMap[level]) {
        reverseMap[level] = level;
      }
    }

    reverseMappings.set(countryCode, reverseMap as Record<ClearanceLevel, string>);
  }

  return reverseMappings;
}

// Pre-build the reverse mappings at module load time
const reverseClearanceMappings = buildReverseClearanceMappings();

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

  // Get the reverse mapping for this country
  const countryMapping = reverseClearanceMappings.get(code);

  if (!countryMapping) {
    // Country not found - return normalized value
    return normalizedValue;
  }

  // Return localized value or fall back to normalized
  return countryMapping[normalizedValue] || normalizedValue;
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
  const countries = natoMappings.countries as Record<string, CountryMappings>;
  return countries[instanceCode.toUpperCase()]?.name || instanceCode;
}

/**
 * Get the language for an instance code
 */
export function getCountryLanguage(instanceCode: string): string {
  const countries = natoMappings.countries as Record<string, CountryMappings>;
  return countries[instanceCode.toUpperCase()]?.language || 'English';
}
