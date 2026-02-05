/**
 * Keycloak Service Account Token Utility
 * Issues JWT tokens for backend services (KAS, etc.)
 *
 * CRITICAL SECURITY: These tokens are for backend-to-backend communication
 * NEVER expose service account credentials to frontend
 */

import jwt from 'jsonwebtoken';
import axios from 'axios';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';
import { getSecret } from './gcp-secrets';

// HTTPS agent for Keycloak requests (self-signed cert support)
// Loads mkcert CA if available, otherwise allows self-signed certs
function createKeycloakHttpsAgent(): https.Agent {
    const caPaths = [
        '/app/certs/ca/rootCA.pem',
        process.env.NODE_EXTRA_CA_CERTS,
        path.join(process.cwd(), 'certs', 'ca', 'rootCA.pem'),
    ].filter(Boolean) as string[];

    const loadedCerts: Buffer[] = [];
    for (const caPath of caPaths) {
        try {
            if (fs.existsSync(caPath)) {
                loadedCerts.push(fs.readFileSync(caPath));
            }
        } catch { /* skip unavailable certs */ }
    }

    return new https.Agent({
        ca: loadedCerts.length > 0 ? loadedCerts : undefined,
        rejectUnauthorized: loadedCerts.length > 0,
        keepAlive: true,
    });
}

const keycloakHttpsAgent = createKeycloakHttpsAgent();

// Service account configuration
const SERVICE_ACCOUNTS = {
  'backend-kas': {
    clientId: 'dive-v3-backend-client',
    audience: 'kas',
    roles: ['kas_client'],
  },
  'backend-cross-kas': {
    clientId: 'dive-v3-backend-client',
    audience: 'kas',
    roles: ['cross_kas_client'],
  },
} as const;

type ServiceAccountType = keyof typeof SERVICE_ACCOUNTS;

/**
 * Get service account token for backend-to-backend calls
 * @param serviceType - Type of service account needed
 * @param userIdentity - User identity to include in token (for audit)
 * @returns JWT token for service account
 */
export async function getServiceAccountToken(
  serviceType: ServiceAccountType,
  userIdentity?: {
    uniqueID: string;
    clearance: string;
    countryOfAffiliation: string;
    acpCOI?: string[];
  }
): Promise<string> {
  const requestId = `sa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    const serviceConfig = SERVICE_ACCOUNTS[serviceType];
    if (!serviceConfig) {
      throw new Error(`Unknown service account type: ${serviceType}`);
    }

    // Get service account credentials from environment
    const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
    if (!clientSecret) {
      throw new Error('KEYCLOAK_CLIENT_SECRET environment variable not set');
    }

    const keycloakUrl = process.env.KEYCLOAK_URL || 'https://keycloak:8443';
    const realm = process.env.INSTANCE_CODE || process.env.INSTANCE_REALM || 'USA';

    // Get access token for service account
    const axiosConfig: any = {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 5000,
    };

    // Add HTTPS agent for self-signed cert support
    if (keycloakUrl.startsWith('https://')) {
      axiosConfig.httpsAgent = keycloakHttpsAgent;
    }

    const tokenResponse = await axios.post(
      `${keycloakUrl}/realms/dive-v3-broker-${realm.toLowerCase()}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: serviceConfig.clientId,
        client_secret: clientSecret,
        // audience: serviceConfig.audience, // Remove audience - not required for client_credentials
        scope: 'openid profile',
      }),
      axiosConfig
    );

    const accessToken = tokenResponse.data.access_token;

    if (!accessToken) {
      throw new Error('No access token received from Keycloak');
    }

    logger.info('Service account token obtained', {
      requestId,
      serviceType,
      audience: serviceConfig.audience,
      hasUserIdentity: !!userIdentity,
    });

    // If user identity provided, decode and enhance token (optional)
    // This allows KAS to see original user identity for audit while using service account auth

    return accessToken;

  } catch (error) {
    logger.error('Failed to get service account token', {
      requestId,
      serviceType,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Get KAS-specific service account token
 * @param userIdentity - Original user identity for audit purposes
 * @returns JWT token with KAS audience
 */
export async function getKASServiceAccountToken(userIdentity?: {
  uniqueID: string;
  clearance: string;
  countryOfAffiliation: string;
  acpCOI?: string[];
}): Promise<string> {
  return getServiceAccountToken('backend-kas', userIdentity);
}

/**
 * Validate service account token (for debugging)
 * @param token - Token to validate
 * @returns Decoded token payload
 */
export async function validateServiceAccountToken(token: string): Promise<any> {
  try {
    // Decode without verification for debugging
    const decoded = jwt.decode(token, { complete: true });
    return {
      header: decoded?.header,
      payload: decoded?.payload,
      signature: decoded?.signature ? 'present' : 'missing',
    };
  } catch (error) {
    throw new Error(`Token validation failed: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}