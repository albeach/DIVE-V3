/**
 * HTTPS Agent with proper CA trust for local development
 *
 * SECURITY BEST PRACTICE:
 * Instead of disabling TLS verification (NODE_TLS_REJECT_UNAUTHORIZED=0),
 * we trust the mkcert root CA explicitly. This maintains security while
 * allowing self-signed certificates from mkcert.
 *
 * For production, use properly issued certificates (e.g., Let's Encrypt).
 */

import https from 'https';
import fs from 'fs';
import path from 'path';

let cachedAgent: https.Agent | null = null;

/**
 * Creates an HTTPS agent that trusts the mkcert root CA
 *
 * The agent is cached to avoid re-reading the CA file on every request.
 * Falls back to default behavior if CA file is not found (production mode).
 */
export function getSecureHttpsAgent(): https.Agent {
    if (cachedAgent) {
        return cachedAgent;
    }

    // Standardized CA location: /app/certs/ca/rootCA.pem
    // This is the single source of truth for mkcert CA in all containers
    // Mount: ./certs/mkcert:/app/certs/ca:ro
    const CA_PATH = '/app/certs/ca/rootCA.pem';
    let caBundle: Buffer | undefined;

    try {
        if (fs.existsSync(CA_PATH)) {
            caBundle = fs.readFileSync(CA_PATH);
            console.log(`[HTTPS] Loaded mkcert root CA from: ${CA_PATH}`);
        }
    } catch (error) {
        // CA not found - will fall back to system CAs
        console.warn(`[HTTPS] mkcert CA not found at ${CA_PATH}`);
    }

    if (caBundle) {
        // Create agent that trusts the mkcert CA in addition to system CAs
        cachedAgent = new https.Agent({
            ca: caBundle,
            // Keep connections alive for performance
            keepAlive: true,
            keepAliveMsecs: 30000,
        });
    } else if (process.env.NODE_ENV === 'production') {
        // Production: use default (system CAs)
        console.log('[HTTPS] Production mode: using system CAs');
        cachedAgent = new https.Agent({ keepAlive: true });
    } else {
        // Development fallback: warn and create default agent
        console.warn('[HTTPS] WARNING: mkcert root CA not found. HTTPS calls may fail.');
        console.warn('[HTTPS] Expected locations:', caLocations);
        cachedAgent = new https.Agent({
            keepAlive: true,
            // Only as last resort in development
            rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' ? true : false
        });
    }

    return cachedAgent;
}

/**
 * Creates fetch options with the secure HTTPS agent
 * Use this for all internal API calls to backend services
 */
export function getSecureFetchOptions(): RequestInit {
    return {
        agent: getSecureHttpsAgent(),
    } as RequestInit;
}

/**
 * Check if we're running in a secure configuration
 */
export function isSecureConfiguration(): boolean {
    // Check if NODE_TLS_REJECT_UNAUTHORIZED is disabled
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
        return false;
    }
    return true;
}

