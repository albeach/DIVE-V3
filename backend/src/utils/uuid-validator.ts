/**
 * UUID Validation Utility
 * 
 * ACP-240 Section 2.1: Unique Identifier Requirements
 * "Globally unique (e.g., UUID per RFC 4122) for identities"
 * 
 * Validates that identity uniqueID fields conform to RFC 4122 UUID format.
 */

import { validate as isValidUUID, version as getUUIDVersion } from 'uuid';
import { logger } from './logger';

/**
 * UUID validation result
 */
export interface IUUIDValidationResult {
    valid: boolean;
    version?: number;
    error?: string;
}

/**
 * Validate UUID format per RFC 4122
 * 
 * Accepted versions: 1, 3, 4, 5 (not version 2)
 * Preferred: v4 (random) or v5 (SHA-1 hash)
 * 
 * @param uniqueID - Identifier to validate
 * @param strict - If true, only accept v4/v5 (recommended for security)
 * @returns Validation result
 */
export function validateUUID(
    uniqueID: string,
    strict: boolean = false
): IUUIDValidationResult {
    // Check null/undefined/empty
    if (!uniqueID || typeof uniqueID !== 'string') {
        return {
            valid: false,
            error: 'uniqueID is null, undefined, or not a string'
        };
    }

    // Trim whitespace
    const trimmed = uniqueID.trim();

    // Check basic UUID format (RFC 4122)
    if (!isValidUUID(trimmed)) {
        return {
            valid: false,
            error: `Invalid UUID format: ${trimmed} (must conform to RFC 4122)`
        };
    }

    // Get UUID version
    const uuidVersion = getUUIDVersion(trimmed);

    // Strict mode: Only accept v4 (random) or v5 (SHA-1 hash)
    if (strict && uuidVersion !== 4 && uuidVersion !== 5) {
        return {
            valid: false,
            version: uuidVersion,
            error: `UUID version ${uuidVersion} not recommended (use v4 or v5 for security)`
        };
    }

    // Warn if version 1 or 3 (weaker but acceptable)
    if (uuidVersion === 1 || uuidVersion === 3) {
        logger.warn('UUID validation: Non-preferred version detected', {
            uniqueID: trimmed,
            version: uuidVersion,
            recommendation: 'Use UUIDv4 (random) or UUIDv5 (SHA-1) for better security'
        });
    }

    return {
        valid: true,
        version: uuidVersion
    };
}

/**
 * Validate and normalize uniqueID
 * 
 * - Validates RFC 4122 format
 * - Normalizes to lowercase (canonical form)
 * - Removes hyphens if standardized format needed
 * 
 * @param uniqueID - Raw identifier
 * @param normalize - If true, convert to lowercase
 * @returns Validated and normalized uniqueID
 * @throws Error if invalid UUID
 */
export function validateAndNormalizeUUID(
    uniqueID: string,
    normalize: boolean = true
): string {
    const result = validateUUID(uniqueID, false);

    if (!result.valid) {
        throw new Error(result.error || 'Invalid UUID');
    }

    // Normalize to lowercase (RFC 4122 canonical form)
    if (normalize) {
        return uniqueID.trim().toLowerCase();
    }

    return uniqueID.trim();
}

/**
 * Check if string looks like a UUID (basic format check)
 * Does not validate checksum, just format
 * 
 * @param value - String to check
 * @returns True if matches UUID pattern
 */
export function looksLikeUUID(value: string): boolean {
    if (!value || typeof value !== 'string') {
        return false;
    }

    // UUID regex: 8-4-4-4-12 hex characters
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value.trim());
}

/**
 * Validate UUID or email-based identifier
 * 
 * Some IdPs may send email addresses as uniqueID.
 * This function accepts both UUIDs and emails, but logs non-UUID format.
 * 
 * @param uniqueID - Identifier (UUID or email)
 * @returns Validation result
 */
export function validateIdentifier(uniqueID: string): {
    valid: boolean;
    type: 'uuid' | 'email' | 'other';
    error?: string;
} {
    if (!uniqueID || typeof uniqueID !== 'string') {
        return { valid: false, type: 'other', error: 'Identifier is empty or not a string' };
    }

    const trimmed = uniqueID.trim();
    
    // Check if trimmed value is empty (whitespace-only input)
    if (!trimmed) {
        return { valid: false, type: 'other', error: 'Identifier is empty or whitespace-only' };
    }

    // Check if UUID
    if (isValidUUID(trimmed)) {
        return { valid: true, type: 'uuid' };
    }

    // Check if email (basic validation)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(trimmed)) {
        logger.warn('Non-UUID identifier detected (email format)', {
            uniqueID: trimmed,
            recommendation: 'Use RFC 4122 UUIDs for ACP-240 compliance'
        });
        return { valid: true, type: 'email' };
    }

    // Other format (not recommended)
    logger.warn('Non-standard identifier format', {
        uniqueID: trimmed,
        recommendation: 'Use RFC 4122 UUIDs for ACP-240 compliance'
    });

    return { valid: true, type: 'other' };
}

