/**
 * Ocean-Themed Pseudonym Generator
 * 
 * ACP-240 Section 6.2 Compliance: PII Minimization
 * 
 * Purpose: Generate deterministic, human-friendly pseudonyms from UUID
 * instead of displaying real names (firstName/lastName) from IdP.
 * 
 * Security Rationale:
 * - Prevents PII exposure in logs, UI, and audit trails
 * - Real names NOT needed for day-to-day operations
 * - Incident response: uniqueID → query IdP for actual identity
 * - Privacy-preserving: pseudonyms prevent identity correlation
 * 
 * Example:
 * uniqueID: "550e8400-e29b-41d4-a716-446655440000"
 * Pseudonym: "Azure Whale" (deterministic, always same for this UUID)
 * With nation: "Atlantic Azure Whale" (USA user)
 * 
 * Date: October 21, 2025
 * Updated: October 24, 2025 (Added NATO nation prefixes)
 * Compliance: ACP-240 Section 6.2, NIST SP 800-53 (IA-4)
 */

/**
 * Nation-specific ocean prefixes
 * Based on geographic/maritime associations of each nation
 * Updated: January 3, 2026 - Added NZL, AUS (Pacific partners)
 */
const NATION_PREFIXES: Record<string, string> = {
    'USA': 'Atlantic',      // Atlantic Ocean (US East Coast)
    'FRA': 'Mediterranean', // Mediterranean Sea (French Riviera)
    'CAN': 'Arctic',        // Arctic Ocean (Canadian North)
    'GBR': 'North',         // North Sea (UK waters)
    'DEU': 'Baltic',        // Baltic Sea (German coast)
    'ITA': 'Adriatic',      // Adriatic Sea (Italian coast)
    'ESP': 'Iberian',       // Iberian Peninsula (Spanish coast)
    'POL': 'Vistula',       // Vistula Lagoon (Polish waters)
    'NLD': 'Nordic',        // North Sea/Nordic waters (Dutch coast)
    'NZL': 'Pacific',       // Pacific Ocean (New Zealand/Oceania)
    'AUS': 'Southern',      // Southern Ocean (Australia)
    'INDUSTRY': 'Pacific'   // Pacific Ocean (neutral/global)
};

const OCEAN_ADJECTIVES = [
    'Azure', 'Blue', 'Cerulean', 'Deep', 'Electric', 'Frosted',
    'Golden', 'Jade', 'Midnight', 'Pacific', 'Royal', 'Sapphire',
    'Teal', 'Turquoise', 'Coral', 'Pearl', 'Silver', 'Arctic',
    'Crystalline', 'Emerald', 'Indigo', 'Obsidian', 'Platinum', 'Violet',
    'Aquamarine', 'Bronze', 'Cobalt', 'Diamond', 'Ebony', 'Fuchsia',
    'Garnet', 'Honey', 'Ivory', 'Jasper', 'Kyanite', 'Lavender'
];

const OCEAN_NOUNS = [
    'Whale', 'Dolphin', 'Orca', 'Marlin', 'Shark', 'Ray',
    'Reef', 'Current', 'Wave', 'Tide', 'Storm', 'Breeze',
    'Kelp', 'Anemone', 'Starfish', 'Octopus', 'Nautilus', 'Turtle',
    'Lagoon', 'Atoll', 'Channel', 'Harbor', 'Bay', 'Strait',
    'Jellyfish', 'Seahorse', 'Manta', 'Barracuda', 'Angelfish', 'Clownfish',
    'Eel', 'Grouper', 'Lobster', 'Manatee', 'Narwhal', 'Pufferfish'
];

/**
 * Generate deterministic pseudonym from UUID
 * 
 * @param uniqueID - User's uniqueID (UUID format)
 * @returns Ocean-themed pseudonym (e.g., "Azure Whale")
 * 
 * Properties:
 * - Deterministic: Same UUID always generates same pseudonym
 * - Human-friendly: Easy to remember and communicate
 * - Collision-resistant: Large namespace (36 adjectives × 36 nouns = 1,296 combinations)
 * - Privacy-preserving: No correlation to real name
 */
export function generatePseudonym(uniqueID: string): string {
    if (!uniqueID) {
        return 'Unknown User';
    }

    // Hash uniqueID to get deterministic indices
    // Use simple string-based hash (no crypto needed, just deterministic mapping)
    let hash = 0;
    for (let i = 0; i < uniqueID.length; i++) {
        const char = uniqueID.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }

    // Use different parts of hash for adjective and noun to reduce collisions
    const adjIndex = Math.abs(hash) % OCEAN_ADJECTIVES.length;
    const nounIndex = Math.abs(hash >> 8) % OCEAN_NOUNS.length;

    return `${OCEAN_ADJECTIVES[adjIndex]} ${OCEAN_NOUNS[nounIndex]}`;
}

/**
 * Generate pseudonym with number suffix for additional uniqueness
 * (optional, use if 1,296 combinations insufficient)
 * 
 * @param uniqueID - User's uniqueID (UUID format)
 * @returns Ocean-themed pseudonym with number (e.g., "Azure Whale #42")
 */
export function generatePseudonymWithNumber(uniqueID: string): string {
    const basePseudonym = generatePseudonym(uniqueID);

    // Use last 2 characters of UUID for number (00-99)
    const lastTwo = uniqueID.slice(-2);
    const number = parseInt(lastTwo, 16) % 100; // Convert hex to decimal, mod 100

    return `${basePseudonym} #${number.toString().padStart(2, '0')}`;
}

/**
 * Generate pseudonym with nation prefix for coalition operations
 * (NATO expansion feature - Phase 2)
 * 
 * @param uniqueID - User's uniqueID (UUID format)
 * @param countryCode - ISO 3166 alpha-3 country code (e.g., "USA", "DEU")
 * @returns Nation-prefixed pseudonym (e.g., "Baltic Azure Whale" for German user)
 * 
 * Examples:
 * - USA user: "Atlantic Azure Whale"
 * - DEU user: "Baltic Golden Dolphin"
 * - GBR user: "North Silver Orca"
 * - ITA user: "Adriatic Jade Marlin"
 * - ESP user: "Iberian Coral Shark"
 * - POL user: "Vistula Pearl Ray"
 * - NLD user: "Nordic Teal Turtle"
 * 
 * @since October 24, 2025 (NATO Expansion Phase 2)
 */
export function generatePseudonymWithNation(uniqueID: string, countryCode: string): string {
    const basePseudonym = generatePseudonym(uniqueID);
    const prefix = NATION_PREFIXES[countryCode.toUpperCase()] || NATION_PREFIXES['USA']; // Default to Atlantic

    return `${prefix} ${basePseudonym}`;
}

/**
 * Validate that uniqueID is UUID format (for safe hashing)
 * 
 * @param uniqueID - User's uniqueID
 * @returns true if valid UUID format
 */
export function isValidUUID(uniqueID: string): boolean {
    if (!uniqueID) return false;

    // UUID format: 8-4-4-4-12 hexadecimal characters
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uniqueID);
}

/**
 * Get pseudonym from session user object
 * FIX #4 (Jan 3, 2026): Prefer user.name from Keycloak token (now contains ocean pseudonym)
 * Fallback to email/username if UUID not available (migration period)
 * 
 * @param user - NextAuth session user object
 * @param options - Optional settings for pseudonym generation
 * @returns Pseudonym for display
 */
export function getPseudonymFromUser(
    user: {
        uniqueID?: string;
        email?: string;
        name?: string;
        countryOfAffiliation?: string;
        firstName?: string;
        lastName?: string;
    },
    options?: {
        includeNation?: boolean; // If true, prefix with nation (e.g., "Baltic Golden Dolphin")
    }
): string {
    // FIX #4: FIRST check if we have firstName + lastName from Keycloak token
    // This is now set by the auth.ts profile callback from Keycloak's given_name/family_name
    if (user.firstName && user.lastName) {
        const pseudonym = `${user.firstName} ${user.lastName}`;
        // Validate it looks like ocean pseudonym (Adjective Noun format)
        if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(pseudonym)) {
            if (options?.includeNation && user.countryOfAffiliation) {
                // Add nation prefix if requested
                const NATION_PREFIXES: Record<string, string> = {
                    'USA': 'Atlantic', 'FRA': 'Mediterranean', 'CAN': 'Arctic',
                    'GBR': 'North', 'DEU': 'Baltic', 'ITA': 'Adriatic',
                    'ESP': 'Iberian', 'POL': 'Vistula', 'NLD': 'Nordic',
                    'NZL': 'Pacific', 'AUS': 'Southern',
                };
                const prefix = NATION_PREFIXES[user.countryOfAffiliation.toUpperCase()] || 'Atlantic';
                return `${prefix} ${pseudonym}`;
            }
            return pseudonym;
        }
    }

    // SECOND: Try user.name from token (set by profile callback)
    // This is the constructed name from firstName + lastName
    if (user.name && user.name !== 'Unknown User') {
        // Check if it's already a valid ocean pseudonym
        if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(user.name) || 
            /^[A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+$/.test(user.name)) {
            return user.name; // Already formatted (e.g., "Azure Whale" or "Atlantic Azure Whale")
        }
    }

    // FALLBACK: Generate from uniqueID (for backwards compatibility)
    // This handles migration period where Keycloak may not have ocean pseudonyms yet
    if (user.uniqueID && isValidUUID(user.uniqueID)) {
        if (options?.includeNation && user.countryOfAffiliation) {
            return generatePseudonymWithNation(user.uniqueID, user.countryOfAffiliation);
        }
        return generatePseudonym(user.uniqueID);
    }

    // Fallback for migration period (non-UUID uniqueID)
    if (user.uniqueID) {
        // Hash non-UUID uniqueID (email, username)
        return generatePseudonym(user.uniqueID);
    }

    // Last resort: Use email/name for hashing (migration period only)
    if (user.email) {
        return generatePseudonym(user.email);
    }

    if (user.name) {
        return generatePseudonym(user.name);
    }

    return 'Unknown User';
}

/**
 * ACP-240 Compliance Logging Helper
 * Use this in audit logs instead of real names
 * 
 * @param uniqueID - User's uniqueID (UUID)
 * @returns Object with uniqueID and pseudonym for logging
 */
export function getAuditIdentity(uniqueID: string): {
    uniqueID: string;
    pseudonym: string;
} {
    return {
        uniqueID,
        pseudonym: generatePseudonym(uniqueID),
    };
}

/**
 * Examples (for documentation/testing):
 * 
 * USA User (john.doe):
 * UUID: "550e8400-e29b-41d4-a716-446655440000"
 * Pseudonym: deterministic based on UUID
 * 
 * France User (pierre.dubois):
 * UUID: "660f9511-e29b-41d4-a716-446655440000"
 * Pseudonym: different from USA user
 * 
 * Canada User (john.macdonald):
 * UUID: "770fa622-e29b-41d4-a716-446655440000"
 * Pseudonym: different from both above
 * 
 * Industry User (bob.contractor):
 * UUID: "880gb733-e29b-41d4-a716-446655440000"
 * Pseudonym: different from all above
 */
