/**
 * Keycloak Config Sync Service
 * 
 * Automatically syncs backend rate limiting with Keycloak brute force configuration
 * Eliminates hardcoded MAX_ATTEMPTS and WINDOW_MS values
 * 
 * Features:
 * - Automatic config sync with 60s cache TTL
 * - Admin token caching with expiration
 * - Graceful fallback to defaults on failure
 * - Multi-realm support (USA, France, Canada, Industry, Broker)
 * 
 * Usage:
 *   const maxAttempts = await KeycloakConfigSyncService.getMaxAttempts('dive-v3-broker-usa');
 *   const windowMs = await KeycloakConfigSyncService.getWindowMs('dive-v3-broker-usa');
 * 
 * @see docs/MFA-OTP-IMPLEMENTATION.md for architecture details
 */

import axios from 'axios';
import { logger } from '../utils/logger';

export interface BruteForceConfig {
    maxLoginFailures: number;
    waitIncrementSeconds: number;
    maxFailureWaitSeconds: number;
    failureResetTimeSeconds: number;
    lastSynced: number;
}

export class KeycloakConfigSyncService {
    private static configCache: Map<string, BruteForceConfig> = new Map();
    private static readonly SYNC_INTERVAL_MS = 60000; // 1 minute cache TTL
    private static adminTokenCache: { token: string; expiresAt: number } | null = null;

    /**
     * Get max login attempts for a realm
     * @param realmId Keycloak realm ID (e.g., 'dive-v3-broker-usa')
     * @returns Max login attempts before lockout
     */
    public static async getMaxAttempts(realmId: string): Promise<number> {
        await this.syncIfNeeded(realmId);
        const config = this.configCache.get(realmId);
        const maxAttempts = config?.maxLoginFailures || 8; // Fallback to 8

        logger.debug('Retrieved max attempts for realm', {
            realmId,
            maxAttempts,
            cached: !!config
        });

        return maxAttempts;
    }

    /**
     * Get rate limit window in milliseconds
     * @param realmId Keycloak realm ID
     * @returns Window in milliseconds
     */
    public static async getWindowMs(realmId: string): Promise<number> {
        await this.syncIfNeeded(realmId);
        const config = this.configCache.get(realmId);
        const seconds = config?.failureResetTimeSeconds || 900; // Fallback to 15 minutes
        const windowMs = seconds * 1000;

        logger.debug('Retrieved rate limit window for realm', {
            realmId,
            windowMs,
            windowMinutes: Math.floor(windowMs / 60000),
            cached: !!config
        });

        return windowMs;
    }

    /**
     * Get full brute force configuration
     * @param realmId Keycloak realm ID
     * @returns Complete brute force config or null if not cached
     */
    public static async getConfig(realmId: string): Promise<BruteForceConfig | null> {
        await this.syncIfNeeded(realmId);
        const config = this.configCache.get(realmId) || null;

        logger.debug('Retrieved full config for realm', {
            realmId,
            found: !!config
        });

        return config;
    }

    /**
     * Force immediate sync (bypass cache)
     * @param realmId Keycloak realm ID
     */
    public static async forceSync(realmId: string): Promise<void> {
        logger.info('Force syncing realm configuration', { realmId });
        this.configCache.delete(realmId);
        await this.syncFromKeycloak(realmId);
    }

    /**
     * Sync all known realms
     */
    public static async syncAllRealms(): Promise<void> {
        const realms = [
            'dive-v3-broker-usa',
            'dive-v3-usa',
            'dive-v3-fra',
            'dive-v3-can',
            'dive-v3-industry'
        ];

        logger.info('Starting sync for all realms', { realms });

        const results = await Promise.allSettled(
            realms.map(realm => this.forceSync(realm))
        );

        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        logger.info('Synced all realm configurations', {
            total: realms.length,
            succeeded,
            failed,
            cachedConfigs: Array.from(this.configCache.entries()).map(([realm, config]) => ({
                realm,
                maxAttempts: config.maxLoginFailures,
                windowMinutes: Math.floor(config.failureResetTimeSeconds / 60)
            }))
        });
    }

    /**
     * Sync if cache is stale
     */
    private static async syncIfNeeded(realmId: string): Promise<void> {
        const cached = this.configCache.get(realmId);
        const now = Date.now();

        if (!cached || (now - cached.lastSynced) > this.SYNC_INTERVAL_MS) {
            logger.debug('Cache stale or missing, syncing', {
                realmId,
                cacheAge: cached ? Math.floor((now - cached.lastSynced) / 1000) : 'N/A'
            });
            await this.syncFromKeycloak(realmId);
        }
    }

    /**
     * Fetch configuration from Keycloak Admin API
     */
    private static async syncFromKeycloak(realmId: string): Promise<void> {
        try {
            const keycloakUrl = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
            const adminToken = await this.getAdminToken();

            logger.debug('Fetching realm configuration from Keycloak', {
                realmId,
                keycloakUrl
            });

            // Fetch realm configuration
            const realmResponse = await axios.get(
                `${keycloakUrl}/admin/realms/${realmId}`,
                {
                    headers: { Authorization: `Bearer ${adminToken}` },
                    timeout: 5000
                }
            );

            const realmData = realmResponse.data;

            // Extract brute force settings
            // Note: Keycloak API returns different property names than Terraform uses
            const config: BruteForceConfig = {
                maxLoginFailures: realmData.bruteForceProtected
                    ? (realmData.maxFailureWaitSeconds || 8)
                    : 8,
                waitIncrementSeconds: realmData.waitIncrementSeconds || 60,
                maxFailureWaitSeconds: realmData.maxFailureWaitSeconds || 300,
                failureResetTimeSeconds: realmData.failureResetTime || realmData.failureResetTimeSeconds || 900,
                lastSynced: Date.now()
            };

            this.configCache.set(realmId, config);

            logger.info('Synced brute force config from Keycloak', {
                realmId,
                maxAttempts: config.maxLoginFailures,
                windowSeconds: config.failureResetTimeSeconds,
                windowMinutes: Math.floor(config.failureResetTimeSeconds / 60),
                cacheTTL: this.SYNC_INTERVAL_MS / 1000,
                bruteForceProtected: realmData.bruteForceProtected
            });

        } catch (error) {
            logger.error('Failed to sync Keycloak config', {
                realmId,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });

            // If sync fails and no cache exists, use defaults
            if (!this.configCache.has(realmId)) {
                const defaultConfig: BruteForceConfig = {
                    maxLoginFailures: 8,
                    waitIncrementSeconds: 60,
                    maxFailureWaitSeconds: 300,
                    failureResetTimeSeconds: 900,
                    lastSynced: Date.now()
                };

                this.configCache.set(realmId, defaultConfig);

                logger.warn('Using default brute force config', {
                    realmId,
                    reason: 'Keycloak sync failed',
                    config: defaultConfig
                });
            }
        }
    }

    /**
     * Get admin access token (cached with expiration)
     */
    private static async getAdminToken(): Promise<string> {
        const now = Date.now();

        // Return cached token if still valid (with 30s buffer)
        if (this.adminTokenCache && this.adminTokenCache.expiresAt > (now + 30000)) {
            logger.debug('Using cached admin token');
            return this.adminTokenCache.token;
        }

        logger.debug('Fetching new admin token');

        // Fetch new token
        const keycloakUrl = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
        const adminUsername = process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
        const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

        const tokenResponse = await axios.post(
            `${keycloakUrl}/realms/master/protocol/openid-connect/token`,
            new URLSearchParams({
                grant_type: 'password',
                client_id: 'admin-cli',
                username: adminUsername,
                password: adminPassword
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 5000
            }
        );

        const expiresIn = tokenResponse.data.expires_in || 60;
        this.adminTokenCache = {
            token: tokenResponse.data.access_token,
            expiresAt: now + (expiresIn * 1000)
        };

        logger.debug('Admin token fetched successfully', {
            expiresIn,
            expiresAt: new Date(this.adminTokenCache.expiresAt).toISOString()
        });

        return this.adminTokenCache.token;
    }

    /**
     * Clear all caches (useful for testing)
     */
    public static clearCaches(): void {
        logger.debug('Clearing all caches', {
            configCacheSize: this.configCache.size,
            adminTokenCached: !!this.adminTokenCache
        });

        this.configCache.clear();
        this.adminTokenCache = null;
    }

    /**
     * Get cache statistics (for monitoring/debugging)
     */
    public static getCacheStats(): { realms: string[]; adminTokenExpiry: string | null } {
        return {
            realms: Array.from(this.configCache.keys()),
            adminTokenExpiry: this.adminTokenCache
                ? new Date(this.adminTokenCache.expiresAt).toISOString()
                : null
        };
    }
}
