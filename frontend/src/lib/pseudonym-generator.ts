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
 * 
 * Date: October 21, 2025
 * Compliance: ACP-240 Section 6.2, NIST SP 800-53 (IA-4)
 */

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
 * Fallback to email/username if UUID not available (migration period)
 * 
 * @param user - NextAuth session user object
 * @returns Pseudonym for display
 */
export function getPseudonymFromUser(user: {
    uniqueID?: string;
    email?: string;
    name?: string;
}): string {
    // Prefer uniqueID (UUID format)
    if (user.uniqueID && isValidUUID(user.uniqueID)) {
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


