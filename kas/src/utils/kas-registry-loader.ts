/**
 * KAS Registry Loader
 * 
 * Loads KAS registry entries from configuration file or environment variables.
 * Supports JSON configuration files and environment-based configuration.
 */

import { kasLogger } from './kas-logger';
import { kasRegistry, IKASRegistryEntry } from './kas-federation';
import fs from 'fs';
import path from 'path';

/**
 * REMOVED: loadKASRegistryFromFile() - NO JSON FILE LOADING
 * 
 * KAS registry must be loaded from MongoDB (SSOT) or Hub API
 * JSON files are NOT used - MongoDB is the Single Source of Truth
 */
export function loadKASRegistryFromFile(configPath: string): void {
    kasLogger.warn('loadKASRegistryFromFile() is deprecated - use MongoDB/Hub API instead');
    kasLogger.warn('NO JSON FILE LOADING - MongoDB is SSOT');
    // Function removed - KAS registry must come from database) {
            try {
                const kasEntry: IKASRegistryEntry = {
                    kasId: entry.kasId,
                    organization: entry.organization,
                    kasUrl: entry.kasUrl,
                    authMethod: entry.authMethod || 'apikey',
                    authConfig: entry.authConfig || {},
                    trustLevel: entry.trustLevel || 'medium',
                    supportedCountries: entry.supportedCountries || [],
                    supportedCOIs: entry.supportedCOIs || [],
                    policyTranslation: entry.policyTranslation,
                    metadata: {
                        version: entry.metadata?.version || '1.0.0',
                        capabilities: entry.metadata?.capabilities || [],
                        contact: entry.metadata?.contact || '',
                        lastVerified: entry.metadata?.lastVerified || new Date().toISOString(),
                    },
                };

                kasRegistry.register(kasEntry);
                kasLogger.info('KAS loaded from config', {
                    kasId: kasEntry.kasId,
                    organization: kasEntry.organization,
                });
            } catch (error) {
                kasLogger.error('Failed to register KAS from config', {
                    entry: entry.kasId,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        kasLogger.info('KAS registry loaded', {
            totalKAS: config.kasInstances.length,
            configPath: fullPath,
        });
    } catch (error) {
        kasLogger.error('Failed to load KAS registry from file', {
            path: configPath,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Load KAS registry from environment variables
 * 
 * Format: KAS_REGISTRY_<ID>_<PROPERTY>=value
 * Example:
 *   KAS_REGISTRY_USA_KAS_ID=usa-kas
 *   KAS_REGISTRY_USA_KAS_URL=https://kas.usa.mil/request-key
 *   KAS_REGISTRY_USA_ORG=United States
 *   KAS_REGISTRY_USA_AUTH_METHOD=mtls
 */
export function loadKASRegistryFromEnv(): void {
    const kasIds = new Set<string>();

    // Find all KAS IDs from environment variables
    for (const key of Object.keys(process.env)) {
        const match = key.match(/^KAS_REGISTRY_([A-Z0-9_]+)_KAS_ID$/);
        if (match) {
            kasIds.add(match[1]);
        }
    }

    for (const id of kasIds) {
        try {
            const prefix = `KAS_REGISTRY_${id}_`;
            const kasId = process.env[`${prefix}KAS_ID`];
            const organization = process.env[`${prefix}ORG`] || id;
            const kasUrl = process.env[`${prefix}KAS_URL`];
            const authMethod = (process.env[`${prefix}AUTH_METHOD`] || 'apikey') as 'mtls' | 'apikey' | 'jwt' | 'oauth2';
            const trustLevel = (process.env[`${prefix}TRUST_LEVEL`] || 'medium') as 'high' | 'medium' | 'low';

            if (!kasId || !kasUrl) {
                kasLogger.warn('Incomplete KAS registry entry from env', { id, kasId, kasUrl });
                continue;
            }

            // Parse supported countries and COIs
            const supportedCountries = process.env[`${prefix}SUPPORTED_COUNTRIES`]?.split(',') || [];
            const supportedCOIs = process.env[`${prefix}SUPPORTED_COIS`]?.split(',') || [];

            // Build auth config
            const authConfig: any = {};
            if (authMethod === 'mtls') {
                authConfig.clientCert = process.env[`${prefix}CLIENT_CERT`];
                authConfig.clientKey = process.env[`${prefix}CLIENT_KEY`];
                authConfig.caCert = process.env[`${prefix}CA_CERT`];
            } else if (authMethod === 'apikey') {
                authConfig.apiKey = process.env[`${prefix}API_KEY`];
                authConfig.apiKeyHeader = process.env[`${prefix}API_KEY_HEADER`] || 'X-API-Key';
            } else if (authMethod === 'jwt') {
                authConfig.jwtIssuer = process.env[`${prefix}JWT_ISSUER`];
            } else if (authMethod === 'oauth2') {
                authConfig.oauth2ClientId = process.env[`${prefix}OAUTH2_CLIENT_ID`];
                authConfig.oauth2ClientSecret = process.env[`${prefix}OAUTH2_CLIENT_SECRET`];
                authConfig.oauth2TokenUrl = process.env[`${prefix}OAUTH2_TOKEN_URL`];
            }

            const kasEntry: IKASRegistryEntry = {
                kasId,
                organization,
                kasUrl,
                authMethod,
                authConfig,
                trustLevel,
                supportedCountries,
                supportedCOIs,
                metadata: {
                    version: process.env[`${prefix}VERSION`] || '1.0.0',
                    capabilities: process.env[`${prefix}CAPABILITIES`]?.split(',') || [],
                    contact: process.env[`${prefix}CONTACT`] || '',
                    lastVerified: new Date().toISOString(),
                },
            };

            kasRegistry.register(kasEntry);
            kasLogger.info('KAS loaded from environment', {
                kasId,
                organization,
            });
        } catch (error) {
            kasLogger.error('Failed to load KAS from environment', {
                id,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    if (kasIds.size > 0) {
        kasLogger.info('KAS registry loaded from environment', {
            totalKAS: kasIds.size,
        });
    }
}

/**
 * Initialize KAS registry (NO JSON FILE LOADING)
 * 
 * KAS registry must be loaded from:
 * 1. MongoDB (SSOT) - via backend API
 * 2. Environment variables (for development/testing)
 * 
 * JSON files are NOT used - MongoDB is the Single Source of Truth
 */
export function initializeKASRegistry(): void {
    // REMOVED: JSON file loading - NO JSON FILES
    // Load from environment variables only (for development/testing)
    loadKASRegistryFromEnv();

    const totalKAS = kasRegistry.listAll().length;
    kasLogger.info('KAS registry initialized (environment variables only)', {
        totalKAS,
        note: 'NO JSON files - MongoDB is SSOT'
    });
}
