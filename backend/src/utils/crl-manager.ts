/**
 * Certificate Revocation List (CRL) Manager
 * 
 * NATO ACP-240 Section 5.4: Certificate Revocation
 * RFC 5280: X.509 Certificate and CRL Profile
 * 
 * Features:
 * - CRL loading and parsing
 * - Certificate revocation checking
 * - CRL freshness validation
 * - Certificate revocation operations
 * - CRL update and refresh
 * 
 * Production deployment:
 * - Integrate with OCSP (Online Certificate Status Protocol)
 * - Implement CRL Distribution Points (CDP)
 * - Schedule automated CRL updates
 * - Cache CRL data for performance
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

/**
 * Revocation reason codes (RFC 5280)
 */
export type RevocationReason =
    | 'unspecified'
    | 'keyCompromise'
    | 'caCompromise'
    | 'affiliationChanged'
    | 'superseded'
    | 'cessationOfOperation'
    | 'certificateHold'
    | 'removeFromCRL'
    | 'privilegeWithdrawn'
    | 'aaCompromise';

/**
 * Revoked certificate entry
 */
export interface IRevokedCertificate {
    serialNumber: string;
    revocationDate: Date;
    reason: RevocationReason;
    additionalInfo?: string;
}

/**
 * Certificate Revocation List structure
 */
export interface ICRL {
    version: number;
    issuer: {
        CN: string;
        O?: string;
        OU?: string;
        C?: string;
    };
    thisUpdate: Date;
    nextUpdate: Date;
    revokedCertificates: IRevokedCertificate[];
    signature?: string;
    crlNumber?: number;
}

/**
 * CRL validation result
 */
export interface ICRLValidationResult {
    valid: boolean;
    fresh: boolean;
    errors: string[];
    warnings: string[];
    revokedCount: number;
    age: number;  // Age in hours
}

/**
 * Certificate revocation check result
 */
export interface IRevocationCheckResult {
    revoked: boolean;
    reason?: RevocationReason;
    revocationDate?: Date;
    crlFresh: boolean;
    crlAge: number;  // Age in hours
}

/**
 * CRL Manager
 * Handles certificate revocation list operations
 */
export class CRLManager {
    private crlDir: string;
    private crlCache: Map<string, { crl: ICRL; loadedAt: Date }> = new Map();
    private readonly CRL_CACHE_TTL_MS = 3600000; // 1 hour
    private readonly CRL_FRESHNESS_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    constructor(crlDir?: string) {
        this.crlDir = crlDir || path.join(process.cwd(), 'certs', 'crl');

        // Ensure CRL directory exists
        if (!fs.existsSync(this.crlDir)) {
            fs.mkdirSync(this.crlDir, { recursive: true, mode: 0o700 });
        }

        logger.info('CRL Manager initialized', { crlDir: this.crlDir });
    }

    /**
     * Load CRL from file
     */
    async loadCRL(crlPath: string): Promise<ICRL> {
        try {
            // Check cache first
            const cached = this.crlCache.get(crlPath);
            if (cached) {
                const age = Date.now() - cached.loadedAt.getTime();
                if (age < this.CRL_CACHE_TTL_MS) {
                    logger.debug('CRL cache hit', { crlPath, ageMs: age });
                    return cached.crl;
                }
            }

            // Load from disk
            if (!fs.existsSync(crlPath)) {
                throw new Error(`CRL file not found: ${crlPath}`);
            }

            const data = fs.readFileSync(crlPath, 'utf8');
            const crl: ICRL = JSON.parse(data);

            // Convert date strings to Date objects
            crl.thisUpdate = new Date(crl.thisUpdate);
            crl.nextUpdate = new Date(crl.nextUpdate);
            crl.revokedCertificates = crl.revokedCertificates.map(rc => ({
                ...rc,
                revocationDate: new Date(rc.revocationDate)
            }));

            // Cache CRL
            this.crlCache.set(crlPath, {
                crl,
                loadedAt: new Date()
            });

            logger.debug('CRL loaded from disk', {
                crlPath,
                revokedCount: crl.revokedCertificates.length,
                thisUpdate: crl.thisUpdate.toISOString(),
                nextUpdate: crl.nextUpdate.toISOString()
            });

            return crl;

        } catch (error) {
            logger.error('Failed to load CRL', {
                error: error instanceof Error ? error.message : 'Unknown error',
                crlPath
            });
            throw error;
        }
    }

    /**
     * Save CRL to file
     */
    private async saveCRL(crlPath: string, crl: ICRL): Promise<void> {
        try {
            const data = JSON.stringify(crl, null, 2);
            fs.writeFileSync(crlPath, data, { mode: 0o644 });

            logger.info('CRL saved', {
                crlPath,
                revokedCount: crl.revokedCertificates.length
            });

        } catch (error) {
            logger.error('Failed to save CRL', {
                error: error instanceof Error ? error.message : 'Unknown error',
                crlPath
            });
            throw error;
        }
    }

    /**
     * Check if certificate is revoked
     */
    async isRevoked(serialNumber: string, crlPath: string): Promise<IRevocationCheckResult> {
        try {
            const crl = await this.loadCRL(crlPath);

            // Check CRL freshness
            const now = new Date();
            const crlFresh = now < crl.nextUpdate;
            const crlAge = (now.getTime() - crl.thisUpdate.getTime()) / (1000 * 60 * 60); // hours

            // Look for certificate in revocation list
            const revokedCert = crl.revokedCertificates.find(
                rc => rc.serialNumber.toLowerCase() === serialNumber.toLowerCase()
            );

            if (revokedCert) {
                logger.warn('Certificate is REVOKED', {
                    serialNumber,
                    reason: revokedCert.reason,
                    revocationDate: revokedCert.revocationDate.toISOString()
                });

                return {
                    revoked: true,
                    reason: revokedCert.reason,
                    revocationDate: revokedCert.revocationDate,
                    crlFresh,
                    crlAge
                };
            }

            logger.debug('Certificate not revoked', { serialNumber, crlAge });

            return {
                revoked: false,
                crlFresh,
                crlAge
            };

        } catch (error) {
            logger.error('Revocation check failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                serialNumber
            });
            throw error;
        }
    }

    /**
     * Add certificate to revocation list
     */
    async revokeCertificate(
        serialNumber: string,
        reason: RevocationReason,
        crlPath: string,
        additionalInfo?: string
    ): Promise<void> {
        try {
            // Load existing CRL
            const crl = await this.loadCRL(crlPath);

            // Check if already revoked
            const alreadyRevoked = crl.revokedCertificates.find(
                rc => rc.serialNumber.toLowerCase() === serialNumber.toLowerCase()
            );

            if (alreadyRevoked) {
                logger.warn('Certificate already revoked', {
                    serialNumber,
                    existingReason: alreadyRevoked.reason,
                    existingRevocationDate: alreadyRevoked.revocationDate
                });
                return;
            }

            // Add to revocation list
            crl.revokedCertificates.push({
                serialNumber,
                revocationDate: new Date(),
                reason,
                additionalInfo
            });

            // Update CRL metadata
            crl.thisUpdate = new Date();
            crl.nextUpdate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
            crl.crlNumber = (crl.crlNumber || 0) + 1;

            // Save updated CRL
            await this.saveCRL(crlPath, crl);

            // Clear cache
            this.crlCache.delete(crlPath);

            logger.warn('Certificate REVOKED', {
                serialNumber,
                reason,
                revocationDate: new Date().toISOString(),
                crlNumber: crl.crlNumber
            });

        } catch (error) {
            logger.error('Failed to revoke certificate', {
                error: error instanceof Error ? error.message : 'Unknown error',
                serialNumber,
                reason
            });
            throw error;
        }
    }

    /**
     * Update CRL (refresh from CA)
     * In production, this would fetch from CA's CRL Distribution Point
     */
    async updateCRL(crlPath: string): Promise<{
        updated: boolean;
        thisUpdate: Date;
        nextUpdate: Date;
        revokedCount: number;
    }> {
        try {
            // Load current CRL
            const crl = await this.loadCRL(crlPath);

            // Check if update is needed
            const now = new Date();
            if (now < crl.nextUpdate) {
                logger.info('CRL is still fresh, update not needed', {
                    nextUpdate: crl.nextUpdate.toISOString()
                });

                return {
                    updated: false,
                    thisUpdate: crl.thisUpdate,
                    nextUpdate: crl.nextUpdate,
                    revokedCount: crl.revokedCertificates.length
                };
            }

            // In production: Fetch new CRL from CA's CDP
            // For now, update timestamps to extend validity
            crl.thisUpdate = new Date();
            crl.nextUpdate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days

            // Save updated CRL
            await this.saveCRL(crlPath, crl);

            // Clear cache
            this.crlCache.delete(crlPath);

            logger.info('CRL updated', {
                thisUpdate: crl.thisUpdate.toISOString(),
                nextUpdate: crl.nextUpdate.toISOString(),
                revokedCount: crl.revokedCertificates.length
            });

            return {
                updated: true,
                thisUpdate: crl.thisUpdate,
                nextUpdate: crl.nextUpdate,
                revokedCount: crl.revokedCertificates.length
            };

        } catch (error) {
            logger.error('Failed to update CRL', {
                error: error instanceof Error ? error.message : 'Unknown error',
                crlPath
            });
            throw error;
        }
    }

    /**
     * Validate CRL is not expired
     */
    validateCRLFreshness(crl: ICRL): ICRLValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        const now = new Date();

        // Check if CRL is expired
        if (now > crl.nextUpdate) {
            errors.push(`CRL expired (nextUpdate: ${crl.nextUpdate.toISOString()})`);
        }

        // Check if CRL is not yet valid
        if (now < crl.thisUpdate) {
            errors.push(`CRL not yet valid (thisUpdate: ${crl.thisUpdate.toISOString()})`);
        }

        // Check CRL age
        const ageMs = now.getTime() - crl.thisUpdate.getTime();
        const ageHours = ageMs / (1000 * 60 * 60);

        if (ageMs > this.CRL_FRESHNESS_THRESHOLD_MS) {
            warnings.push(`CRL is old (${Math.floor(ageHours)} hours since last update)`);
        }

        // Warning if CRL expires soon (within 24 hours)
        const msUntilExpiry = crl.nextUpdate.getTime() - now.getTime();
        if (msUntilExpiry < 24 * 60 * 60 * 1000 && msUntilExpiry > 0) {
            warnings.push(`CRL expiring soon (in ${Math.floor(msUntilExpiry / (1000 * 60 * 60))} hours)`);
        }

        return {
            valid: errors.length === 0,
            fresh: now < crl.nextUpdate && ageMs < this.CRL_FRESHNESS_THRESHOLD_MS,
            errors,
            warnings,
            revokedCount: crl.revokedCertificates.length,
            age: ageHours
        };
    }

    /**
     * Initialize CRL for a CA
     * Creates empty CRL if it doesn't exist
     */
    async initializeCRL(
        caName: string,
        issuer: {
            CN: string;
            O?: string;
            OU?: string;
            C?: string;
        }
    ): Promise<ICRL> {
        try {
            const crlPath = path.join(this.crlDir, `${caName}-crl.pem`);

            // Check if CRL already exists
            if (fs.existsSync(crlPath)) {
                logger.info('CRL already exists', { crlPath });
                return this.loadCRL(crlPath);
            }

            // Create new CRL
            const crl: ICRL = {
                version: 2,
                issuer,
                thisUpdate: new Date(),
                nextUpdate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
                revokedCertificates: [],
                crlNumber: 1
            };

            // Save CRL
            await this.saveCRL(crlPath, crl);

            logger.info('CRL initialized', {
                caName,
                crlPath,
                nextUpdate: crl.nextUpdate.toISOString()
            });

            return crl;

        } catch (error) {
            logger.error('Failed to initialize CRL', {
                error: error instanceof Error ? error.message : 'Unknown error',
                caName
            });
            throw error;
        }
    }

    /**
     * Get CRL statistics
     */
    async getCRLStats(crlPath: string): Promise<{
        revokedCount: number;
        age: number;  // hours
        fresh: boolean;
        nextUpdateIn: number;  // hours
        issuer: string;
    }> {
        try {
            const crl = await this.loadCRL(crlPath);
            const now = new Date();

            const ageMs = now.getTime() - crl.thisUpdate.getTime();
            const ageHours = ageMs / (1000 * 60 * 60);

            const nextUpdateMs = crl.nextUpdate.getTime() - now.getTime();
            const nextUpdateHours = nextUpdateMs / (1000 * 60 * 60);

            const fresh = now < crl.nextUpdate;

            return {
                revokedCount: crl.revokedCertificates.length,
                age: ageHours,
                fresh,
                nextUpdateIn: nextUpdateHours,
                issuer: crl.issuer.CN
            };

        } catch (error) {
            logger.error('Failed to get CRL stats', {
                error: error instanceof Error ? error.message : 'Unknown error',
                crlPath
            });
            throw error;
        }
    }

    /**
     * Clear CRL cache
     */
    clearCache(): void {
        const size = this.crlCache.size;
        this.crlCache.clear();
        logger.info('CRL cache cleared', { entriesCleared: size });
    }
}

/**
 * Singleton instance
 */
export const crlManager = new CRLManager();

/**
 * Initialize CRL infrastructure
 * Call on application startup
 */
export async function initializeCRLInfrastructure(): Promise<void> {
    try {
        logger.info('Initializing CRL infrastructure...');

        // Initialize CRLs for each CA
        await crlManager.initializeCRL('root', {
            CN: 'DIVE-V3 Root CA',
            O: 'DIVE V3 Coalition ICAM',
            OU: 'Security Operations',
            C: 'US'
        });

        await crlManager.initializeCRL('intermediate', {
            CN: 'DIVE-V3 Intermediate CA',
            O: 'DIVE V3 Coalition ICAM',
            OU: 'Security Operations',
            C: 'US'
        });

        logger.info('CRL infrastructure initialized');

    } catch (error) {
        logger.error('Failed to initialize CRL infrastructure', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
}

