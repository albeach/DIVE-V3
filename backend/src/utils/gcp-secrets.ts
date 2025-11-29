/**
 * DIVE V3 - GCP Secret Manager Utility
 * 
 * Provides secure access to secrets stored in GCP Secret Manager.
 * Falls back to environment variables for local development.
 * 
 * Secrets naming convention: dive-v3-<type>-<instance>
 * Example: dive-v3-mongodb-usa, dive-v3-mongodb-fra
 * 
 * Date: November 29, 2025
 */

import { logger } from './logger';

// ============================================
// CONFIGURATION
// ============================================

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'dive25';
const SECRET_PREFIX = 'dive-v3';
const USE_GCP_SECRETS = process.env.USE_GCP_SECRETS === 'true';

// Secret types
export type SecretType = 
    | 'mongodb'           // MongoDB root password
    | 'keycloak'          // Keycloak admin password
    | 'kas'               // KAS signing key
    | 'federation'        // Federation client secrets
    | 'jwt-signing';      // JWT signing key

// ============================================
// INTERFACES
// ============================================

interface ISecretCache {
    value: string;
    expiresAt: number;
}

interface IGCPSecretResponse {
    payload: {
        data: string;
    };
}

// ============================================
// SECRET CACHE
// ============================================

// In-memory cache with 5-minute TTL
const secretCache = new Map<string, ISecretCache>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedSecret(key: string): string | null {
    const cached = secretCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }
    secretCache.delete(key);
    return null;
}

function setCachedSecret(key: string, value: string): void {
    secretCache.set(key, {
        value,
        expiresAt: Date.now() + CACHE_TTL_MS
    });
}

// ============================================
// GCP SECRET MANAGER ACCESS
// ============================================

/**
 * Fetch secret from GCP Secret Manager using gcloud CLI
 * This is more reliable in development environments where ADC may be expired
 */
async function fetchFromGCloudCLI(secretName: string): Promise<string | null> {
    try {
        const { execSync } = await import('child_process');
        const result = execSync(
            `gcloud secrets versions access latest --secret=${secretName} --project=${GCP_PROJECT_ID}`,
            { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
        );
        logger.info(`Fetched secret from GCP via gcloud CLI: ${secretName}`);
        return result.trim();
    } catch (error) {
        logger.debug(`gcloud CLI failed for ${secretName}`, { error });
        return null;
    }
}

/**
 * Fetch secret from GCP Secret Manager using REST API
 * Requires GOOGLE_APPLICATION_CREDENTIALS or gcloud auth application-default login
 */
async function fetchFromGCPSecretManager(secretName: string): Promise<string | null> {
    // First try gcloud CLI (most reliable in dev environments)
    const cliResult = await fetchFromGCloudCLI(secretName);
    if (cliResult) {
        return cliResult;
    }
    
    // Fall back to REST API with google-auth-library
    try {
        const { GoogleAuth } = await import('google-auth-library');
        const auth = new GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
        
        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();
        
        if (!accessToken.token) {
            throw new Error('Failed to obtain access token');
        }
        
        const url = `https://secretmanager.googleapis.com/v1/projects/${GCP_PROJECT_ID}/secrets/${secretName}/versions/latest:access`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken.token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                logger.warn(`Secret not found in GCP: ${secretName}`);
                return null;
            }
            throw new Error(`GCP API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json() as IGCPSecretResponse;
        const secretValue = Buffer.from(data.payload.data, 'base64').toString('utf-8');
        
        logger.info(`Fetched secret from GCP Secret Manager API: ${secretName}`);
        return secretValue;
        
    } catch (error) {
        logger.error(`Failed to fetch secret from GCP: ${secretName}`, { error });
        return null;
    }
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Get secret name for a given type and instance
 */
export function getSecretName(type: SecretType, instanceCode?: string): string {
    if (instanceCode) {
        return `${SECRET_PREFIX}-${type}-${instanceCode.toLowerCase()}`;
    }
    return `${SECRET_PREFIX}-${type}`;
}

/**
 * Get MongoDB password for an instance
 * Priority: GCP Secret Manager > Environment Variable > Default
 */
export async function getMongoDBPassword(instanceCode: string): Promise<string> {
    const secretName = getSecretName('mongodb', instanceCode);
    
    // Check cache first
    const cached = getCachedSecret(secretName);
    if (cached) {
        return cached;
    }
    
    // Try GCP Secret Manager if enabled
    if (USE_GCP_SECRETS) {
        const gcpSecret = await fetchFromGCPSecretManager(secretName);
        if (gcpSecret) {
            setCachedSecret(secretName, gcpSecret);
            return gcpSecret;
        }
        
        // Try instance-agnostic secret
        const genericSecret = await fetchFromGCPSecretManager(`${SECRET_PREFIX}-mongodb`);
        if (genericSecret) {
            setCachedSecret(secretName, genericSecret);
            return genericSecret;
        }
    }
    
    // Fall back to environment variables
    const envPassword = process.env[`MONGO_PASSWORD_${instanceCode.toUpperCase()}`] 
        || process.env.MONGO_INITDB_ROOT_PASSWORD 
        || process.env.MONGO_PASSWORD;
    
    if (envPassword) {
        setCachedSecret(secretName, envPassword);
        return envPassword;
    }
    
    // Default for local development
    logger.warn(`Using default MongoDB password for ${instanceCode} - NOT FOR PRODUCTION`);
    return 'password';
}

/**
 * Get Keycloak admin password
 */
export async function getKeycloakPassword(instanceCode?: string): Promise<string> {
    const secretName = getSecretName('keycloak', instanceCode);
    
    const cached = getCachedSecret(secretName);
    if (cached) return cached;
    
    if (USE_GCP_SECRETS) {
        const gcpSecret = await fetchFromGCPSecretManager(secretName);
        if (gcpSecret) {
            setCachedSecret(secretName, gcpSecret);
            return gcpSecret;
        }
    }
    
    const envPassword = process.env.KEYCLOAK_ADMIN_PASSWORD || process.env.KC_BOOTSTRAP_ADMIN_PASSWORD;
    if (envPassword) {
        setCachedSecret(secretName, envPassword);
        return envPassword;
    }
    
    logger.warn('Using default Keycloak password - NOT FOR PRODUCTION');
    return 'admin';
}

/**
 * Get a generic secret by type and optional instance
 */
export async function getSecret(type: SecretType, instanceCode?: string): Promise<string | null> {
    const secretName = getSecretName(type, instanceCode);
    
    const cached = getCachedSecret(secretName);
    if (cached) return cached;
    
    if (USE_GCP_SECRETS) {
        const gcpSecret = await fetchFromGCPSecretManager(secretName);
        if (gcpSecret) {
            setCachedSecret(secretName, gcpSecret);
            return gcpSecret;
        }
    }
    
    // Try environment variable
    const envKey = `${type.toUpperCase().replace('-', '_')}${instanceCode ? `_${instanceCode.toUpperCase()}` : ''}`;
    const envValue = process.env[envKey];
    
    if (envValue) {
        setCachedSecret(secretName, envValue);
        return envValue;
    }
    
    return null;
}

/**
 * Check if GCP Secret Manager is available and configured
 * Checks both gcloud CLI and google-auth-library
 */
export async function isGCPSecretsAvailable(): Promise<boolean> {
    if (!USE_GCP_SECRETS) {
        return false;
    }
    
    // First check if gcloud CLI is available and authenticated
    try {
        const { execSync } = await import('child_process');
        execSync('gcloud auth print-access-token', { 
            encoding: 'utf-8', 
            timeout: 5000, 
            stdio: ['pipe', 'pipe', 'pipe'] 
        });
        return true;
    } catch {
        // gcloud CLI not available, try google-auth-library
    }
    
    try {
        const { GoogleAuth } = await import('google-auth-library');
        const auth = new GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
        await auth.getClient();
        return true;
    } catch {
        return false;
    }
}

/**
 * Clear the secret cache (for testing or rotation)
 */
export function clearSecretCache(): void {
    secretCache.clear();
    logger.info('Secret cache cleared');
}

// ============================================
// INITIALIZATION LOGGING
// ============================================

if (USE_GCP_SECRETS) {
    logger.info('GCP Secret Manager integration ENABLED', { 
        projectId: GCP_PROJECT_ID,
        secretPrefix: SECRET_PREFIX 
    });
} else {
    logger.debug('GCP Secret Manager integration disabled, using environment variables');
}

