/**
 * Bidirectional Federation Helpers
 *
 * Pure utility functions for bidirectional federation orchestration:
 * URL builders, instance name resolution, secret retrieval, and
 * remote Keycloak frontend URL management.
 *
 * Extracted from keycloak-federation.service.ts (Phase 4C decomposition).
 *
 * @module bidirectional-federation
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import { getSecureHttpsAgent } from '../utils/https-agent';
import { logger } from '../utils/logger';

const httpsAgent = getSecureHttpsAgent();

// ============================================
// URL BUILDERS
// ============================================

/**
 * Get internal Keycloak URL for backend-to-backend communication.
 *
 * In local development: uses Docker container names (e.g., gbr-keycloak-gbr-1:8443)
 * In production: uses external domains (same as public URL)
 */
export function getInternalKeycloakUrl(instanceCode: string, publicUrl: string): string {
  const env = process.env.NODE_ENV || 'development';
  const code = instanceCode.toUpperCase();

  if (env === 'development' || env === 'local') {
    // Local development: use Docker container names for internal communication
    let internalUrl: string;

    if (code === 'USA') {
      // USA Hub uses dive-hub-keycloak with HTTPS on port 8443
      internalUrl = 'https://dive-hub-keycloak:8443';
    } else {
      // All spokes use dive-spoke-{code}-keycloak with HTTPS on 8443
      internalUrl = `https://dive-spoke-${code.toLowerCase()}-keycloak:8443`;
    }

    logger.debug('Using internal Docker URL for backend communication', {
      instanceCode: code,
      publicUrl,
      internalUrl,
    });
    return internalUrl;
  }

  // Production or unknown instance: use public URL for everything
  logger.debug('Using public URL for backend communication (production mode)', {
    instanceCode: code,
    publicUrl,
  });
  return publicUrl;
}

/**
 * Get instance display name by country code.
 */
export function getInstanceName(instanceCode: string): string {
  const names: Record<string, string> = {
    'USA': 'United States',
    'FRA': 'France',
    'GBR': 'United Kingdom',
    'DEU': 'Germany',
    'CAN': 'Canada',
  };
  return names[instanceCode.toUpperCase()] || instanceCode;
}

/**
 * Get local IdP URL from environment.
 */
export function getLocalIdpUrl(): string {
  // Try environment variable first
  if (process.env.KEYCLOAK_PUBLIC_URL) {
    return process.env.KEYCLOAK_PUBLIC_URL;
  }

  // Fallback: construct from KEYCLOAK_URL
  const keycloakUrl = process.env.KEYCLOAK_URL || 'https://localhost:8443';

  // For local development, map internal URLs to external
  if (keycloakUrl.includes('keycloak:')) {
    // Container name -> localhost mapping
    const instance = (process.env.INSTANCE_CODE || 'USA').toUpperCase();
    const portMap: Record<string, string> = {
      'USA': '8081',
      'FRA': '8444',
      'GBR': '8446',
      'DEU': '8447',
    };
    const port = portMap[instance] || '8443';
    return `https://localhost:${port}`;
  }

  return keycloakUrl;
}

/**
 * Get local realm name by instance code.
 */
export function getLocalRealmName(instanceCode: string): string {
  const code = instanceCode.toLowerCase();

  // USA uses base realm name, others have suffix
  if (code === 'usa') {
    return 'dive-v3-broker-usa';
  }

  return `dive-v3-broker-${code}`;
}

// ============================================
// REMOTE KEYCLOAK CONFIGURATION
// ============================================

/**
 * Ensure remote Keycloak realm has frontendUrl set.
 *
 * CRITICAL: Forces the remote realm to always return the public issuer URL,
 * regardless of whether it's accessed via internal Docker hostname or public URL.
 *
 * This enables the hybrid strategy:
 * - Backend communication: Internal hostnames (fast, Docker network)
 * - Token validation: Public issuer (consistent, matches browser flow)
 */
export async function ensureRemoteFrontendUrl(
  remoteKeycloakUrl: string,
  remoteRealm: string,
  remoteAdminPassword: string,
  publicFrontendUrl: string
): Promise<void> {
  try {
    const remoteAdmin = new KcAdminClient({
      baseUrl: remoteKeycloakUrl,
      realmName: 'master',
      requestOptions: {
        /* @ts-expect-error - httpsAgent is supported by node-fetch */
        httpsAgent,
      },
    });

    await remoteAdmin.auth({
      username: 'admin',
      password: remoteAdminPassword,
      grantType: 'password',
      clientId: 'admin-cli',
    });

    // Get current realm config
    const realm = await remoteAdmin.realms.findOne({ realm: remoteRealm });
    if (!realm) {
      logger.warn('Remote realm not found, cannot set frontendUrl', { remoteRealm });
      return;
    }

    // Set frontendUrl if not already set or different
    const currentFrontendUrl = realm.attributes?.frontendUrl;
    if (currentFrontendUrl !== publicFrontendUrl) {
      await remoteAdmin.realms.update(
        { realm: remoteRealm },
        {
          ...realm,
          attributes: {
            ...realm.attributes,
            frontendUrl: publicFrontendUrl,
          },
        }
      );
      logger.info('Set frontendUrl on remote Keycloak realm for consistent issuer', {
        remoteRealm,
        frontendUrl: publicFrontendUrl,
        reason: 'Ensures public issuer is returned even when accessed via internal hostname',
      });
    } else {
      logger.debug('Remote frontendUrl already correctly set', {
        remoteRealm,
        frontendUrl: currentFrontendUrl,
      });
    }
  } catch (error) {
    logger.warn('Failed to set frontendUrl on remote Keycloak (non-fatal, but may cause issuer mismatch)', {
      remoteRealm,
      publicFrontendUrl,
      error: error instanceof Error ? error.message : 'Unknown error',
      impact: 'Token validation may fail if issuer does not match',
    });
  }
}

// ============================================
// FEDERATION SECRET MANAGEMENT
// ============================================

/**
 * Get or create federation client secret.
 *
 * Secrets are stored in GCP Secret Manager:
 * Format: dive-v3-federation-{from}-{to}
 * Example: dive-v3-federation-usa-gbr
 */
export async function getFederationSecret(fromInstance: string, toInstance: string): Promise<string> {
  const from = fromInstance.toLowerCase();
  const to = toInstance.toLowerCase();

  // Federation secrets are bidirectional, use alphabetical order for consistency
  const instances = [from, to].sort();
  const secretName = `federation-${instances[0]}-${instances[1]}`;

  try {
    // Try to get secret from GCP (if USE_GCP_SECRETS is enabled)
    if (process.env.USE_GCP_SECRETS === 'true') {
      const { getSecret } = await import('../utils/gcp-secrets');
      const secret = await getSecret(secretName as any);
      if (secret) {
        logger.debug('Retrieved federation secret from GCP', { secretName });
        return secret;
      }
    }
  } catch (error) {
    logger.warn('Federation secret not found in GCP, using fallback', {
      secretName,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Fallback: Use env var only (no hardcoded defaults)
  const envSecret = process.env.CROSS_BORDER_CLIENT_SECRET;
  if (envSecret && envSecret.length >= 16) {
    logger.debug('Using CROSS_BORDER_CLIENT_SECRET from environment', { secretName });
    return envSecret;
  }

  // FAIL FAST: No hardcoded fallbacks - security requirement
  const errorMessage = `FATAL: Federation secret not found for ${secretName}.\n` +
    `Required: Configure secret in one of:\n` +
    `  1. GCP Secret Manager: ${secretName} (project: dive25)\n` +
    `  2. Environment variable: CROSS_BORDER_CLIENT_SECRET\n\n` +
    `To create the secret:\n` +
    `  gcloud secrets create ${secretName} --project=dive25\n` +
    `  echo -n "$(openssl rand -base64 32)" | gcloud secrets versions add ${secretName} --data-file=-`;

  logger.error('Federation secret not available - failing fast', {
    secretName,
    message: 'No hardcoded fallbacks allowed'
  });

  throw new Error(errorMessage);
}
