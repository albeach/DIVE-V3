/**
 * DIVE V3 - Vault Dynamic Database Credential Manager
 *
 * High-level manager for Vault database secrets engine credentials.
 * Fetches ephemeral MongoDB credentials, builds connection URLs,
 * and manages lease renewal in the background.
 *
 * Usage:
 *   // Early in server startup (before any MongoClient connects):
 *   const result = await getMongoDBCredentials();
 *   if (result.isVaultManaged) {
 *     process.env.MONGODB_URL = result.url;
 *   }
 *
 * Date: February 2026
 */

import { logger } from './logger';
import { fetchDatabaseCredentials, renewLease } from './vault-secrets';

// ============================================
// STATE
// ============================================

let renewalTimer: ReturnType<typeof setInterval> | null = null;
let currentLeaseId: string | null = null;
let currentLeaseDuration: number = 0;

// ============================================
// PUBLIC API
// ============================================

export interface MongoDBCredentialResult {
    /** The MongoDB connection URL (either Vault-managed or static fallback) */
    url: string;
    /** Whether these credentials came from Vault dynamic secrets */
    isVaultManaged: boolean;
    /** Vault lease ID (if Vault-managed) */
    leaseId?: string;
    /** Lease duration in seconds (if Vault-managed) */
    leaseDuration?: number;
}

/**
 * Get MongoDB credentials from Vault database secrets engine.
 *
 * Fetches ephemeral credentials from Vault, builds a mongodb:// URL,
 * and starts background lease renewal. Falls back to the existing
 * MONGODB_URL environment variable if Vault is unavailable.
 *
 * @param roleName - Vault database role (e.g., "backend-hub-rw")
 * @returns Credential result with URL and Vault metadata
 */
export async function getMongoDBCredentials(
    roleName?: string
): Promise<MongoDBCredentialResult> {
    const effectiveRole = roleName || process.env.VAULT_DB_ROLE;

    if (!effectiveRole) {
        logger.debug('No VAULT_DB_ROLE configured, using static MONGODB_URL');
        return {
            url: process.env.MONGODB_URL || 'mongodb://localhost:27017',
            isVaultManaged: false,
        };
    }

    try {
        const creds = await fetchDatabaseCredentials(effectiveRole);

        if (!creds) {
            logger.warn('Vault database credentials unavailable, falling back to static MONGODB_URL');
            return {
                url: process.env.MONGODB_URL || 'mongodb://localhost:27017',
                isVaultManaged: false,
            };
        }

        // Build MongoDB URL with ephemeral credentials
        const encodedUser = encodeURIComponent(creds.username);
        const encodedPass = encodeURIComponent(creds.password);

        // Determine MongoDB host and database from existing env vars
        const mongoHost = process.env.MONGODB_HOST || 'mongodb:27017';
        const mongoDb = process.env.MONGODB_DATABASE || 'dive-v3';

        const url = `mongodb://${encodedUser}:${encodedPass}@${mongoHost}/${mongoDb}?authSource=admin&directConnection=true`;

        logger.info('Vault dynamic MongoDB credentials acquired', {
            role: effectiveRole,
            username: creds.username,
            leaseId: creds.leaseId,
            leaseDuration: creds.leaseDuration,
            renewable: creds.renewable,
        });

        // Start lease renewal if the credential is renewable
        if (creds.renewable && creds.leaseDuration > 0) {
            startLeaseRenewal(creds.leaseId, creds.leaseDuration);
        }

        return {
            url,
            isVaultManaged: true,
            leaseId: creds.leaseId,
            leaseDuration: creds.leaseDuration,
        };
    } catch (error) {
        logger.error('Failed to get Vault database credentials, falling back to static MONGODB_URL', {
            error: error instanceof Error ? error.message : 'Unknown error',
            role: effectiveRole,
        });
        return {
            url: process.env.MONGODB_URL || 'mongodb://localhost:27017',
            isVaultManaged: false,
        };
    }
}

// ============================================
// LEASE RENEWAL
// ============================================

/**
 * Start background lease renewal at 50% of TTL.
 *
 * Vault best practice: renew at half the lease duration to provide
 * ample buffer for transient failures before expiry.
 */
export function startLeaseRenewal(leaseId: string, leaseDuration: number): void {
    // Stop any existing renewal timer
    stopLeaseRenewal();

    currentLeaseId = leaseId;
    currentLeaseDuration = leaseDuration;

    // Renew at 50% of TTL (minimum 30 seconds)
    const renewalIntervalMs = Math.max(30_000, (leaseDuration / 2) * 1000);

    logger.info('Starting Vault lease renewal timer', {
        leaseId,
        leaseDuration,
        renewalIntervalSeconds: renewalIntervalMs / 1000,
    });

    renewalTimer = setInterval(async () => {
        if (!currentLeaseId) {
            stopLeaseRenewal();
            return;
        }

        const success = await renewLease(currentLeaseId, currentLeaseDuration);
        if (success) {
            logger.debug('Vault lease renewed successfully', { leaseId: currentLeaseId });
        } else {
            logger.warn('Vault lease renewal failed — credentials may expire', {
                leaseId: currentLeaseId,
                leaseDuration: currentLeaseDuration,
            });
        }
    }, renewalIntervalMs);

    // Don't block Node.js from exiting if only this timer is running
    if (renewalTimer.unref) {
        renewalTimer.unref();
    }
}

/**
 * Stop the background lease renewal timer.
 */
export function stopLeaseRenewal(): void {
    if (renewalTimer) {
        clearInterval(renewalTimer);
        renewalTimer = null;
        logger.info('Vault lease renewal timer stopped', { leaseId: currentLeaseId });
    }
    currentLeaseId = null;
    currentLeaseDuration = 0;
}
