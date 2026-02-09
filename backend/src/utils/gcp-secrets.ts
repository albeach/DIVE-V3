/**
 * DIVE V3 - Secret Manager Utility (Vault + GCP fallback)
 *
 * Provides secure access to secrets stored in HashiCorp Vault or GCP Secret Manager.
 *
 * Provider Selection (SECRETS_PROVIDER env var):
 *   vault  - Use HashiCorp Vault KV v2 (default, recommended)
 *   gcp    - Use GCP Secret Manager (legacy fallback)
 *
 * Vault is used BY DEFAULT. Falls back to environment variables if unavailable.
 * GCP Secret Manager is available as an optional legacy provider.
 *
 * Secrets naming convention: dive-v3-<type>-<instance>
 * Example: dive-v3-mongodb-usa, dive-v3-mongodb-fra
 *
 * Environment Variables:
 *   SECRETS_PROVIDER=vault - Use HashiCorp Vault (default)
 *   SECRETS_PROVIDER=gcp   - Use GCP Secret Manager (legacy)
 *   USE_GCP_SECRETS=false  - Explicitly disable GCP (uses env vars only)
 *   USE_GCP_SECRETS=true   - Force GCP (fails if unavailable)
 *
 * Date: December 1, 2025 (Updated: February 2026 - Vault integration)
 */

import { logger } from './logger';
import * as vaultSecrets from './vault-secrets';

// ============================================
// CONFIGURATION
// ============================================

const SECRETS_PROVIDER = process.env.SECRETS_PROVIDER || 'vault';
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'dive25';
const SECRET_PREFIX = 'dive-v3';

// GCP Secrets mode: 'force' | 'disabled' | 'auto'
const GCP_MODE = process.env.USE_GCP_SECRETS === 'false' ? 'disabled' 
               : process.env.USE_GCP_SECRETS === 'true' ? 'force' 
               : 'auto';

// Track if gcloud CLI is available (cached on first check)
let gcpCliAvailable: boolean | null = null;

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
 * Check if gcloud CLI is available and authenticated (cached)
 */
async function checkGCloudCLI(): Promise<boolean> {
    if (gcpCliAvailable !== null) {
        return gcpCliAvailable;
    }
    
    try {
        const { execSync } = await import('child_process');
        execSync('gcloud auth print-access-token', { 
            encoding: 'utf-8', 
            timeout: 5000, 
            stdio: ['pipe', 'pipe', 'pipe'] 
        });
        gcpCliAvailable = true;
        logger.info('GCP gcloud CLI is authenticated and available');
        return true;
    } catch {
        gcpCliAvailable = false;
        logger.debug('GCP gcloud CLI not available or not authenticated');
        return false;
    }
}

/**
 * Fetch secret from GCP Secret Manager using gcloud CLI
 * This is the most reliable method in development environments
 */
async function fetchFromGCloudCLI(secretName: string): Promise<string | null> {
    // Quick check if gcloud is available
    if (!(await checkGCloudCLI())) {
        return null;
    }
    
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
 * Priority (in 'auto' mode): GCP Secret Manager > Environment Variable > ERROR
 * 
 * SECURITY: No default password fallback! Must have valid credentials.
 */
export async function getMongoDBPassword(instanceCode: string): Promise<string> {
    const secretName = getSecretName('mongodb', instanceCode);

    // Check cache first
    const cached = getCachedSecret(secretName);
    if (cached) {
        return cached;
    }

    // Try Vault first when configured
    if (SECRETS_PROVIDER === 'vault') {
        const vaultSecret = await vaultSecrets.getMongoDBPassword(instanceCode);
        if (vaultSecret) {
            setCachedSecret(secretName, vaultSecret);
            return vaultSecret;
        }
    }

    // Try GCP Secret Manager (unless explicitly disabled)
    if (GCP_MODE !== 'disabled' && SECRETS_PROVIDER !== 'vault') {
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

        // If GCP mode is 'force' and we didn't get a secret, that's an error
        if (GCP_MODE === 'force') {
            throw new Error(`GCP Secret Manager required but secret not found: ${secretName}. Ensure gcloud is authenticated and secret exists.`);
        }
    }

    // Fall back to environment variables
    const envPassword = process.env[`MONGO_PASSWORD_${instanceCode.toUpperCase()}`]
        || process.env.MONGO_INITDB_ROOT_PASSWORD
        || process.env.MONGO_PASSWORD;

    if (envPassword) {
        logger.info(`Using MongoDB password from environment variable for ${instanceCode}`);
        setCachedSecret(secretName, envPassword);
        return envPassword;
    }

    // NO DEFAULT PASSWORD - this is a security risk
    throw new Error(
        `MongoDB password not found for ${instanceCode}!\n` +
        `Options:\n` +
        `  1. Run: source ./scripts/sync-gcp-secrets.sh (loads from GCP)\n` +
        `  2. Set: export MONGO_PASSWORD=<password>\n` +
        `  3. Ensure gcloud is authenticated: gcloud auth login\n` +
        `  4. Set SECRETS_PROVIDER=vault and ensure Vault is configured`
    );
}

/**
 * Get Keycloak admin password
 * 
 * SECURITY: No default password fallback! Must have valid credentials.
 */
export async function getKeycloakPassword(instanceCode?: string): Promise<string> {
    const secretName = getSecretName('keycloak', instanceCode);

    const cached = getCachedSecret(secretName);
    if (cached) return cached;

    // Try Vault first when configured
    if (SECRETS_PROVIDER === 'vault' && instanceCode) {
        const vaultSecret = await vaultSecrets.getKeycloakPassword(instanceCode);
        if (vaultSecret) {
            setCachedSecret(secretName, vaultSecret);
            return vaultSecret;
        }
    }

    // Try GCP Secret Manager (unless explicitly disabled)
    if (GCP_MODE !== 'disabled' && SECRETS_PROVIDER !== 'vault') {
        const gcpSecret = await fetchFromGCPSecretManager(secretName);
        if (gcpSecret) {
            setCachedSecret(secretName, gcpSecret);
            return gcpSecret;
        }

        if (GCP_MODE === 'force') {
            throw new Error(`GCP Secret Manager required but secret not found: ${secretName}`);
        }
    }

    const envPassword = process.env.KEYCLOAK_ADMIN_PASSWORD || process.env.KC_BOOTSTRAP_ADMIN_PASSWORD;
    if (envPassword) {
        logger.info('Using Keycloak password from environment variable');
        setCachedSecret(secretName, envPassword);
        return envPassword;
    }

    throw new Error(
        `Keycloak password not found${instanceCode ? ` for ${instanceCode}` : ''}!\n` +
        `Run: source ./scripts/sync-gcp-secrets.sh or set KEYCLOAK_ADMIN_PASSWORD`
    );
}

/**
 * Get a generic secret by type and optional instance
 */
export async function getSecret(type: SecretType, instanceCode?: string): Promise<string | null> {
    const secretName = getSecretName(type, instanceCode);

    const cached = getCachedSecret(secretName);
    if (cached) return cached;

    // Try Vault first when configured
    if (SECRETS_PROVIDER === 'vault') {
        const vaultSecret = await vaultSecrets.getSecret(type, instanceCode);
        if (vaultSecret) {
            setCachedSecret(secretName, vaultSecret);
            return vaultSecret;
        }
    }

    // Try GCP Secret Manager (unless explicitly disabled)
    if (GCP_MODE !== 'disabled' && SECRETS_PROVIDER !== 'vault') {
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
 * Get federation secret for cross-instance communication
 * Format: dive-v3-federation-{instance1}-{instance2} (alphabetical order)
 * Example: dive-v3-federation-gbr-usa
 */
export async function getFederationSecret(instance1: string, instance2: string): Promise<string | null> {
    const inst1 = instance1.toLowerCase();
    const inst2 = instance2.toLowerCase();

    // Use alphabetical order for consistency (gbr-usa, not usa-gbr)
    const [first, second] = [inst1, inst2].sort();
    const fullSecretName = `${SECRET_PREFIX}-federation-${first}-${second}`;

    const cached = getCachedSecret(fullSecretName);
    if (cached) return cached;

    // Try Vault first when configured
    if (SECRETS_PROVIDER === 'vault') {
        const vaultSecret = await vaultSecrets.getFederationSecret(instance1, instance2);
        if (vaultSecret) {
            setCachedSecret(fullSecretName, vaultSecret);
            return vaultSecret;
        }
    }

    // Try GCP Secret Manager (unless explicitly disabled)
    if (GCP_MODE !== 'disabled' && SECRETS_PROVIDER !== 'vault') {
        const gcpSecret = await fetchFromGCPSecretManager(fullSecretName);
        if (gcpSecret) {
            setCachedSecret(fullSecretName, gcpSecret);
            return gcpSecret;
        }
    }

    // Try environment variable (e.g., FEDERATION_GBR_USA)
    const envKey = `FEDERATION_${first.toUpperCase()}_${second.toUpperCase()}`;
    const envValue = process.env[envKey];

    if (envValue) {
        setCachedSecret(fullSecretName, envValue);
        return envValue;
    }

    return null;
}

/**
 * Get KAS signing key for JWT signature
 * Used for KAS-to-KAS authentication in federation
 * 
 * SECURITY: Required for production. No fallback.
 */
export async function getKASSigningKey(): Promise<string> {
    const secretName = `${SECRET_PREFIX}-kas-signing-key`;

    // Check cache first
    const cached = getCachedSecret(secretName);
    if (cached) {
        return cached;
    }

    // Try Vault first when configured
    if (SECRETS_PROVIDER === 'vault') {
        const vaultSecret = await vaultSecrets.getKASSigningKey();
        if (vaultSecret) {
            setCachedSecret(secretName, vaultSecret);
            return vaultSecret;
        }
    }

    // Try GCP Secret Manager
    if (GCP_MODE !== 'disabled' && SECRETS_PROVIDER !== 'vault') {
        const gcpSecret = await fetchFromGCPSecretManager(secretName);
        if (gcpSecret) {
            setCachedSecret(secretName, gcpSecret);
            return gcpSecret;
        }

        if (GCP_MODE === 'force') {
            throw new Error(`GCP Secret Manager required but secret not found: ${secretName}`);
        }
    }

    // Fall back to environment variable
    const envKey = process.env.KAS_SIGNING_KEY;
    if (envKey) {
        logger.info('Using KAS signing key from environment variable');
        setCachedSecret(secretName, envKey);
        return envKey;
    }

    throw new Error('KAS signing key not configured. Set KAS_SIGNING_KEY or create GCP/Vault secret.');
}

/**
 * Get KAS encryption key for DEK wrapping
 * Used for encrypting/decrypting Data Encryption Keys
 * 
 * SECURITY: Required for production. No fallback.
 */
export async function getKASEncryptionKey(): Promise<string> {
    const secretName = `${SECRET_PREFIX}-kas-encryption-key`;

    // Check cache first
    const cached = getCachedSecret(secretName);
    if (cached) {
        return cached;
    }

    // Try Vault first when configured
    if (SECRETS_PROVIDER === 'vault') {
        const vaultSecret = await vaultSecrets.getKASEncryptionKey();
        if (vaultSecret) {
            setCachedSecret(secretName, vaultSecret);
            return vaultSecret;
        }
    }

    // Try GCP Secret Manager
    if (GCP_MODE !== 'disabled' && SECRETS_PROVIDER !== 'vault') {
        const gcpSecret = await fetchFromGCPSecretManager(secretName);
        if (gcpSecret) {
            setCachedSecret(secretName, gcpSecret);
            return gcpSecret;
        }

        if (GCP_MODE === 'force') {
            throw new Error(`GCP Secret Manager required but secret not found: ${secretName}`);
        }
    }

    // Fall back to environment variable
    const envKey = process.env.KAS_ENCRYPTION_KEY;
    if (envKey) {
        logger.info('Using KAS encryption key from environment variable');
        setCachedSecret(secretName, envKey);
        return envKey;
    }

    throw new Error('KAS encryption key not configured. Set KAS_ENCRYPTION_KEY or create GCP/Vault secret.');
}

/**
 * Get all KAS secrets (for initialization)
 * Returns an object with all KAS-related secrets
 */
export async function getKASSecrets(): Promise<{
    signingKey: string;
    encryptionKey: string;
}> {
    const [signingKey, encryptionKey] = await Promise.all([
        getKASSigningKey(),
        getKASEncryptionKey()
    ]);
    
    return { signingKey, encryptionKey };
}

/**
 * Check if GCP Secret Manager is available and configured
 * Returns true if gcloud CLI is authenticated
 */
export async function isGCPSecretsAvailable(): Promise<boolean> {
    if (GCP_MODE === 'disabled') {
        return false;
    }
    
    return await checkGCloudCLI();
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

logger.info('Secret Manager configuration', {
    provider: SECRETS_PROVIDER,
    gcpMode: GCP_MODE,
    projectId: GCP_PROJECT_ID,
    secretPrefix: SECRET_PREFIX,
    description: SECRETS_PROVIDER === 'vault' ? 'HashiCorp Vault (primary), env vars (fallback)' :
                 GCP_MODE === 'force' ? 'GCP required - will fail without secrets' :
                 GCP_MODE === 'disabled' ? 'GCP disabled - using env vars only' :
                 'Auto-detect - GCP if available, else env vars'
});
