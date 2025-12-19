/**
 * KMS (Key Management Service) - Phase 4
 * 
 * Manages KEKs (Key Encryption Keys) for ZTDF cryptographic binding.
 * 
 * PILOT MODE: Simulated KMS using in-memory KEK storage
 * PRODUCTION: Replace with AWS KMS, Azure Key Vault, or HSM
 * 
 * Features:
 * - KEK generation and retrieval
 * - KEK rotation (future)
 * - Audit logging of key operations
 * 
 * Compliance: STANAG 4778, ACP-240 Section 5.4
 * 
 * Security Warning: THIS IS PILOT ONLY. Production must use real HSM/KMS.
 * 
 * Created: October 29, 2025 (Phase 4)
 */

import crypto from 'crypto';
import { logger } from '../utils/logger';

/**
 * KEK entry interface
 */
export interface IKEKEntry {
    kekId: string;
    key: Buffer;  // 256-bit AES key
    algorithm: 'AES-256';
    createdAt: string;
    status: 'active' | 'rotated' | 'revoked';
    usageCount?: number;
}

/**
 * KMS Service (Simulated for Pilot)
 * 
 * PRODUCTION REQUIREMENTS:
 * - Replace with AWS KMS SDK or Azure Key Vault SDK
 * - Use HSM for FIPS 140-2 Level 3 compliance
 * - Implement proper key rotation policies
 * - Add audit logging to SIEM
 * - Implement key usage policies
 * - Add MFA for administrative operations
 */
export class KMSService {
    private keks: Map<string, IKEKEntry> = new Map();

    constructor() {
        // Initialize default KEK for pilot
        this.initializeDefaultKEK();

        logger.warn('KMS Service initialized in PILOT MODE', {
            warning: 'DO NOT USE IN PRODUCTION',
            message: 'KEKs are stored in memory (not persistent)',
            recommendation: 'Use AWS KMS, Azure Key Vault, or HSM for production',
            compliance: 'Production requires FIPS 140-2 Level 3 HSM'
        });
    }

    /**
     * Initialize default KEK for pilot
     */
    private initializeDefaultKEK(): void {
        const defaultKEK: IKEKEntry = {
            kekId: 'kek-default-001',
            key: crypto.randomBytes(32),  // 256-bit AES key
            algorithm: 'AES-256',
            createdAt: new Date().toISOString(),
            status: 'active',
            usageCount: 0
        };

        this.keks.set(defaultKEK.kekId, defaultKEK);

        logger.info('Default KEK initialized', {
            kekId: defaultKEK.kekId,
            algorithm: defaultKEK.algorithm,
            keyHash: crypto.createHash('sha256').update(defaultKEK.key).digest('hex')  // Log hash only
        });
    }

    /**
     * Get KEK by ID
     * 
     * @param kekId - KEK identifier
     * @returns KEK as Buffer
     * @throws Error if KEK not found or not active
     */
    getKEK(kekId: string = 'kek-default-001'): Buffer {
        const kekEntry = this.keks.get(kekId);

        if (!kekEntry) {
            logger.error('KEK not found', { kekId });
            throw new Error(`KEK not found: ${kekId}`);
        }

        if (kekEntry.status !== 'active') {
            logger.error('KEK not active', { kekId, status: kekEntry.status });
            throw new Error(`KEK not active: ${kekId} (status: ${kekEntry.status})`);
        }

        // Increment usage counter
        if (kekEntry.usageCount !== undefined) {
            kekEntry.usageCount++;
        }

        logger.debug('KEK retrieved', {
            kekId,
            usageCount: kekEntry.usageCount,
            keyHash: crypto.createHash('sha256').update(kekEntry.key).digest('hex')  // Log hash only
        });

        return kekEntry.key;
    }

    /**
     * Generate new KEK
     * 
     * @param kekId - Optional KEK identifier
     * @returns New KEK entry
     */
    generateKEK(kekId?: string): IKEKEntry {
        const newKekId = kekId || `kek-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

        const kekEntry: IKEKEntry = {
            kekId: newKekId,
            key: crypto.randomBytes(32),
            algorithm: 'AES-256',
            createdAt: new Date().toISOString(),
            status: 'active',
            usageCount: 0
        };

        this.keks.set(newKekId, kekEntry);

        logger.info('New KEK generated', {
            kekId: newKekId,
            algorithm: kekEntry.algorithm,
            keyHash: crypto.createHash('sha256').update(kekEntry.key).digest('hex')
        });

        return kekEntry;
    }

    /**
     * Rotate KEK (mark old as rotated, create new)
     * 
     * @param oldKekId - KEK to rotate
     * @returns New KEK entry
     */
    rotateKEK(oldKekId: string): IKEKEntry {
        const oldKek = this.keks.get(oldKekId);

        if (!oldKek) {
            throw new Error(`KEK not found for rotation: ${oldKekId}`);
        }

        // Mark old KEK as rotated
        oldKek.status = 'rotated';

        // Generate new KEK
        const newKek = this.generateKEK(`${oldKekId}-rotated-${Date.now()}`);

        logger.warn('KEK rotated', {
            oldKekId,
            newKekId: newKek.kekId,
            rotationTime: new Date().toISOString()
        });

        return newKek;
    }

    /**
     * Revoke KEK (security incident)
     * 
     * @param kekId - KEK to revoke
     */
    revokeKEK(kekId: string): void {
        const kek = this.keks.get(kekId);

        if (!kek) {
            throw new Error(`KEK not found for revocation: ${kekId}`);
        }

        kek.status = 'revoked';

        logger.error('KEK REVOKED', {
            kekId,
            revocationTime: new Date().toISOString(),
            reason: 'Administrative action'
        });
    }

    /**
     * List all KEKs (metadata only, not keys)
     * 
     * @returns KEK metadata
     */
    listKEKs(): Array<{ kekId: string; algorithm: string; status: string; createdAt: string; usageCount?: number }> {
        return Array.from(this.keks.values()).map(kek => ({
            kekId: kek.kekId,
            algorithm: kek.algorithm,
            status: kek.status,
            createdAt: kek.createdAt,
            usageCount: kek.usageCount
        }));
    }

    /**
     * Get KEK statistics
     */
    getStatistics(): {
        totalKEKs: number;
        activeKEKs: number;
        rotatedKEKs: number;
        revokedKEKs: number;
    } {
        const keks = Array.from(this.keks.values());

        return {
            totalKEKs: keks.length,
            activeKEKs: keks.filter(k => k.status === 'active').length,
            rotatedKEKs: keks.filter(k => k.status === 'rotated').length,
            revokedKEKs: keks.filter(k => k.status === 'revoked').length
        };
    }
}

// Export singleton instance
export const kmsService = new KMSService();
