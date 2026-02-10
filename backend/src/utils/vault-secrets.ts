/**
 * DIVE V3 - HashiCorp Vault Secret Manager Utility
 *
 * Provides secure access to secrets stored in HashiCorp Vault KV v2.
 * Used when SECRETS_PROVIDER=vault is set.
 *
 * Vault path hierarchy:
 *   dive-v3/core/{instance}/{type}   - Service credentials
 *   dive-v3/auth/{instance}/{type}   - Authentication secrets
 *   dive-v3/federation/{pair}        - Federation secrets
 *   dive-v3/opal/{type}             - OPAL policy engine tokens
 *
 * Date: February 2026
 */

import { logger } from './logger';

// ============================================
// CONFIGURATION
// ============================================

const VAULT_ADDR = process.env.VAULT_ADDR || 'http://dive-hub-vault:8200';
const VAULT_TOKEN = process.env.VAULT_TOKEN || '';

// Track Vault availability (cached on first check)
let vaultAvailable: boolean | null = null;

// ============================================
// INTERFACES
// ============================================

interface VaultKVResponse {
    data: {
        data: Record<string, string>;
        metadata: {
            created_time: string;
            version: number;
            destroyed: boolean;
        };
    };
}

// ============================================
// VAULT API ACCESS
// ============================================

/**
 * Check if Vault is available and we have a valid token
 */
async function checkVaultAvailability(): Promise<boolean> {
    if (vaultAvailable !== null) {
        return vaultAvailable;
    }

    if (!VAULT_TOKEN) {
        vaultAvailable = false;
        logger.debug('Vault token not configured');
        return false;
    }

    try {
        const response = await fetch(`${VAULT_ADDR}/v1/sys/health`, {
            headers: { 'X-Vault-Token': VAULT_TOKEN },
            signal: AbortSignal.timeout(5000),
            redirect: 'follow', // HA: follow standby → leader 307 redirects
        });

        vaultAvailable = response.ok;

        if (vaultAvailable) {
            logger.info('HashiCorp Vault is available and authenticated');
        } else {
            logger.warn(`Vault health check failed: ${response.status}`);
        }

        return vaultAvailable;
    } catch {
        vaultAvailable = false;
        logger.debug('Vault not reachable');
        return false;
    }
}

/**
 * Fetch a secret from Vault KV v2
 *
 * @param category - Mount point category (core, auth, federation, opal)
 * @param path - Secret path within the category (e.g., "usa/mongodb")
 * @param field - Field name within the secret (e.g., "password")
 * @returns Secret value or null if not found
 */
export async function fetchFromVault(
    category: string,
    path: string,
    field: string = 'password'
): Promise<string | null> {
    if (!(await checkVaultAvailability())) {
        return null;
    }

    try {
        // KV v2 uses /data/ prefix in API path
        const apiPath = `${VAULT_ADDR}/v1/dive-v3/${category}/data/${path}`;

        const response = await fetch(apiPath, {
            headers: { 'X-Vault-Token': VAULT_TOKEN },
            signal: AbortSignal.timeout(10000),
            redirect: 'follow', // HA: follow standby → leader 307 redirects
        });

        if (!response.ok) {
            if (response.status === 404) {
                logger.debug(`Vault secret not found: ${category}/${path}`);
                return null;
            }
            throw new Error(`Vault API error: ${response.status}`);
        }

        const data = (await response.json()) as VaultKVResponse;
        const value = data.data.data[field];

        if (value) {
            logger.info(`Fetched secret from Vault: ${category}/${path}`);
            return value;
        }

        logger.debug(`Vault secret field "${field}" empty in ${category}/${path}`);
        return null;
    } catch (error) {
        logger.error(`Failed to fetch secret from Vault: ${category}/${path}`, { error });
        return null;
    }
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Get MongoDB password from Vault
 */
export async function getMongoDBPassword(instanceCode: string): Promise<string | null> {
    return fetchFromVault('core', `${instanceCode.toLowerCase()}/mongodb`, 'password');
}

/**
 * Get Keycloak admin password from Vault
 */
export async function getKeycloakPassword(instanceCode: string): Promise<string | null> {
    return fetchFromVault('core', `${instanceCode.toLowerCase()}/keycloak-admin`, 'password');
}

/**
 * Get federation secret from Vault
 * Federation secrets use alphabetically-sorted instance pair
 */
export async function getFederationSecret(
    instance1: string,
    instance2: string
): Promise<string | null> {
    const [first, second] = [instance1.toLowerCase(), instance2.toLowerCase()].sort();
    return fetchFromVault('federation', `${first}-${second}`, 'client-secret');
}

/**
 * Get KAS signing key from Vault
 */
export async function getKASSigningKey(): Promise<string | null> {
    return fetchFromVault('auth', 'shared/kas-signing', 'key');
}

/**
 * Get KAS encryption key from Vault
 */
export async function getKASEncryptionKey(): Promise<string | null> {
    return fetchFromVault('auth', 'shared/kas-encryption', 'key');
}

/**
 * Get a generic secret by type and instance from Vault
 */
export async function getSecret(
    type: string,
    instanceCode?: string
): Promise<string | null> {
    const path = instanceCode
        ? `${instanceCode.toLowerCase()}/${type}`
        : `shared/${type}`;

    // Try core first, then auth
    const coreResult = await fetchFromVault('core', path, 'password');
    if (coreResult) return coreResult;

    return fetchFromVault('auth', path, 'secret');
}

/**
 * Check if Vault is available
 */
export async function isVaultAvailable(): Promise<boolean> {
    return checkVaultAvailability();
}

/**
 * Reset Vault availability cache (for testing or reconnection)
 */
export function resetVaultCache(): void {
    vaultAvailable = null;
    logger.info('Vault availability cache reset');
}

// ============================================
// DATABASE DYNAMIC CREDENTIALS
// ============================================

export interface VaultDatabaseCredential {
    username: string;
    password: string;
    leaseId: string;
    leaseDuration: number;
    renewable: boolean;
}

/**
 * Fetch dynamic database credentials from Vault database secrets engine
 *
 * @param roleName - Database role name (e.g., "backend-hub-rw", "kas-hub-ro")
 * @returns Credential object with username, password, and lease info, or null if unavailable
 */
export async function fetchDatabaseCredentials(
    roleName: string
): Promise<VaultDatabaseCredential | null> {
    if (!(await checkVaultAvailability())) {
        return null;
    }

    try {
        const response = await fetch(`${VAULT_ADDR}/v1/database/creds/${roleName}`, {
            headers: { 'X-Vault-Token': VAULT_TOKEN },
            signal: AbortSignal.timeout(10000),
            redirect: 'follow',
        });

        if (!response.ok) {
            logger.error(`Vault database creds failed: ${response.status} for role ${roleName}`);
            return null;
        }

        const data = await response.json() as {
            lease_id: string;
            renewable: boolean;
            lease_duration: number;
            data: { username: string; password: string };
        };

        logger.info(`Fetched dynamic database credentials for role: ${roleName}`, {
            username: data.data.username,
            leaseId: data.lease_id,
            leaseDuration: data.lease_duration,
            renewable: data.renewable,
        });

        return {
            username: data.data.username,
            password: data.data.password,
            leaseId: data.lease_id,
            leaseDuration: data.lease_duration,
            renewable: data.renewable,
        };
    } catch (error) {
        logger.error(`Failed to fetch database credentials for role: ${roleName}`, { error });
        return null;
    }
}

/**
 * Renew a Vault lease (for dynamic database credentials)
 *
 * @param leaseId - The lease ID to renew
 * @param increment - TTL increment in seconds (default: 43200 = 12h)
 * @returns true if renewal succeeded
 */
export async function renewLease(
    leaseId: string,
    increment: number = 43200
): Promise<boolean> {
    if (!(await checkVaultAvailability())) {
        return false;
    }

    try {
        const response = await fetch(`${VAULT_ADDR}/v1/sys/leases/renew`, {
            method: 'POST',
            headers: {
                'X-Vault-Token': VAULT_TOKEN,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ lease_id: leaseId, increment }),
            signal: AbortSignal.timeout(10000),
            redirect: 'follow',
        });

        if (response.ok) {
            logger.info(`Renewed lease: ${leaseId}`);
            return true;
        }

        logger.warn(`Lease renewal failed: ${response.status} for ${leaseId}`);
        return false;
    } catch (error) {
        logger.error(`Failed to renew lease: ${leaseId}`, { error });
        return false;
    }
}
