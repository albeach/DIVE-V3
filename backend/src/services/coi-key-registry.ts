/**
 * COI Key Registry Service
 * 
 * ACP-240 Section 5.3: Community of Interest (COI) Keys
 * 
 * Purpose: Manage shared encryption keys per Community of Interest
 * Benefits:
 * - New coalition members get instant access to historical data
 * - No re-encryption needed when membership changes
 * - Scalable for large coalitions (FVEY, NATO-COSMIC, etc.)
 * 
 * Security:
 * - Production: Keys stored in HashiCorp Vault or AWS KMS
 * - Pilot: Deterministic key generation from COI name (SHA-256 based)
 * - Key rotation supported via versioning
 */

import crypto from 'crypto';
import { logger } from '../utils/logger';

/**
 * COI Key Entry
 */
export interface ICOIKeyEntry {
    coi: string;                    // COI name (e.g., 'FVEY', 'NATO-COSMIC')
    key: Buffer;                    // 256-bit encryption key
    version: number;                // Key version for rotation
    createdAt: Date;                // Creation timestamp
    algorithm: 'AES-256-GCM';       // Encryption algorithm
}

/**
 * COI Key Registry
 * 
 * In production, this would integrate with:
 * - HashiCorp Vault (transit secrets engine)
 * - AWS KMS (customer master keys)
 * - Hardware Security Module (HSM)
 * 
 * For pilot, we use deterministic key generation to demonstrate the pattern.
 */
class COIKeyRegistry {
    private keys: Map<string, ICOIKeyEntry> = new Map();
    private keyVersion: number = 1;

    constructor() {
        this.initializeDefaultKeys();
    }

    /**
     * Initialize default COI keys for pilot demonstration
     */
    private initializeDefaultKeys(): void {
        const defaultCOIs = [
            'FVEY',           // Five Eyes (USA, GBR, CAN, AUS, NZL)
            'NATO-COSMIC',    // NATO Top Secret
            'US-ONLY',        // United States only
            'CAN-US',         // Canada-US bilateral
            'FRA-US',         // France-US bilateral
            'NATO',           // NATO Unclassified/Confidential/Secret
            'GBR-US'          // UK-US bilateral (UKUSA)
        ];

        for (const coi of defaultCOIs) {
            this.generateKeyForCOI(coi);
        }

        logger.info('COI Key Registry initialized', {
            coiCount: this.keys.size,
            cois: Array.from(this.keys.keys())
        });
    }

    /**
     * Generate deterministic key for COI
     * 
     * Production: Fetch from vault
     * Pilot: Use HMAC-SHA256 for deterministic generation
     */
    private generateKeyForCOI(coi: string): ICOIKeyEntry {
        // Use environment-specific seed for key derivation
        const seed = process.env.COI_KEY_SEED || 'dive-v3-broker-seed-2025';

        // Generate deterministic 256-bit key using HMAC-SHA256
        const hmac = crypto.createHmac('sha256', seed);
        hmac.update(`COI:${coi}:v${this.keyVersion}`);
        const key = hmac.digest(); // 256 bits

        const entry: ICOIKeyEntry = {
            coi,
            key,
            version: this.keyVersion,
            createdAt: new Date(),
            algorithm: 'AES-256-GCM'
        };

        this.keys.set(coi, entry);

        logger.debug('Generated COI key', {
            coi,
            version: this.keyVersion,
            keyLength: key.length * 8, // bits
            algorithm: 'AES-256-GCM'
        });

        return entry;
    }

    /**
     * Get encryption key for a COI
     * 
     * @param coi Community of Interest name
     * @returns Encryption key (256-bit Buffer)
     * @throws Error if COI not found
     */
    public getKey(coi: string): Buffer {
        const entry = this.keys.get(coi);

        if (!entry) {
            logger.warn('COI key not found, generating on-demand', { coi });
            // Generate key on-demand for unknown COIs
            const newEntry = this.generateKeyForCOI(coi);
            return newEntry.key;
        }

        logger.debug('Retrieved COI key', {
            coi,
            version: entry.version,
            keyAge: Date.now() - entry.createdAt.getTime()
        });

        return entry.key;
    }

    /**
     * Get key entry with metadata
     */
    public getKeyEntry(coi: string): ICOIKeyEntry | undefined {
        return this.keys.get(coi);
    }

    /**
     * Check if key exists for COI
     */
    public hasKey(coi: string): boolean {
        return this.keys.has(coi);
    }

    /**
     * List all registered COIs
     */
    public listCOIs(): string[] {
        return Array.from(this.keys.keys());
    }

    /**
     * Rotate key for a COI (create new version)
     * 
     * In production:
     * 1. Generate new key version
     * 2. Re-encrypt all resources with new key
     * 3. Keep old key for decryption during transition
     * 4. Retire old key after grace period
     */
    public rotateKey(coi: string): ICOIKeyEntry {
        logger.info('Rotating COI key', { coi, oldVersion: this.keyVersion });

        this.keyVersion++;
        const newEntry = this.generateKeyForCOI(coi);

        logger.info('COI key rotated', {
            coi,
            newVersion: this.keyVersion,
            algorithm: 'AES-256-GCM'
        });

        return newEntry;
    }

    /**
     * Get key statistics
     */
    public getStats(): {
        totalKeys: number;
        cois: string[];
        currentVersion: number;
    } {
        return {
            totalKeys: this.keys.size,
            cois: this.listCOIs(),
            currentVersion: this.keyVersion
        };
    }
}

/**
 * Singleton instance
 */
export const coiKeyRegistry = new COIKeyRegistry();

/**
 * Convenience function: Get COI key
 */
export function getCOIKey(coi: string): Buffer {
    return coiKeyRegistry.getKey(coi);
}

/**
 * Convenience function: Check if COI has key
 */
export function hasCOIKey(coi: string): boolean {
    return coiKeyRegistry.hasKey(coi);
}

/**
 * Get appropriate COI for resource based on releasability and COI tags
 * 
 * Priority:
 * 1. Use explicit COI if present (FVEY, NATO-COSMIC, etc.)
 * 2. Infer from releasability pattern (multi-nation → NATO, bilateral → specific)
 * 3. Fall back to most restrictive country-specific key
 */
export function selectCOIForResource(releasabilityTo: string[], coiTags: string[]): string {
    // Priority 1: Explicit COI tags
    if (coiTags && coiTags.length > 0) {
        // Use most restrictive COI (prefer specific over general)
        const priorityOrder = ['US-ONLY', 'CAN-US', 'FRA-US', 'GBR-US', 'FVEY', 'NATO-COSMIC', 'NATO'];

        for (const priority of priorityOrder) {
            if (coiTags.includes(priority)) {
                return priority;
            }
        }

        // Use first COI tag if no priority match
        return coiTags[0];
    }

    // Priority 2: Infer from releasability pattern
    if (releasabilityTo && releasabilityTo.length > 0) {
        const countries = new Set(releasabilityTo);

        // FVEY pattern (all five eyes)
        const fveyCountries = new Set(['USA', 'GBR', 'CAN', 'AUS', 'NZL']);
        if (countries.size === 5 && Array.from(countries).every(c => fveyCountries.has(c))) {
            return 'FVEY';
        }

        // Bilateral patterns
        if (countries.size === 2) {
            if (countries.has('USA') && countries.has('CAN')) return 'CAN-US';
            if (countries.has('USA') && countries.has('FRA')) return 'FRA-US';
            if (countries.has('USA') && countries.has('GBR')) return 'GBR-US';
        }

        // NATO pattern (3+ NATO countries)
        const natoCountries = new Set(['USA', 'GBR', 'FRA', 'DEU', 'CAN', 'ITA', 'ESP', 'POL', 'NLD', 'BEL']);
        const natoMatches = Array.from(countries).filter(c => natoCountries.has(c));
        if (natoMatches.length >= 3) {
            return 'NATO';
        }

        // Single country
        if (countries.size === 1) {
            const country = Array.from(countries)[0];
            return `${country}-ONLY`;
        }
    }

    // Priority 3: Default fallback
    return 'US-ONLY';
}

/**
 * Export for testing
 */
export const __testing__ = {
    COIKeyRegistry
};
