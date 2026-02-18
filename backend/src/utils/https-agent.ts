/**
 * Shared Secure HTTPS Agent
 *
 * Provides a reusable HTTPS agent that loads CA certificates from the standard
 * paths used across DIVE V3 infrastructure. Enables proper TLS verification
 * against mkcert/Vault PKI CA instead of disabling certificate checks.
 *
 * CA Certificate Loading Priority:
 *   1. /app/certs/ca/rootCA.pem (Docker container mount)
 *   2. NODE_EXTRA_CA_CERTS environment variable path
 *   3. certs/ca/rootCA.pem relative to cwd (local development)
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

const CA_PATHS = [
    '/app/certs/ca/rootCA.pem',
    process.env.NODE_EXTRA_CA_CERTS,
    path.join(process.cwd(), 'certs', 'ca', 'rootCA.pem'),
].filter(Boolean) as string[];

let _cachedCerts: Buffer[] | undefined;

function loadCACertificates(): Buffer[] | undefined {
    if (_cachedCerts !== undefined) return _cachedCerts.length > 0 ? _cachedCerts : undefined;

    _cachedCerts = [];
    for (const caPath of CA_PATHS) {
        try {
            if (fs.existsSync(caPath)) {
                _cachedCerts.push(fs.readFileSync(caPath));
            }
        } catch { /* skip unavailable certs */ }
    }
    return _cachedCerts.length > 0 ? _cachedCerts : undefined;
}

/**
 * Get a secure HTTPS agent with proper CA certificate verification.
 * If CA certs are found, rejectUnauthorized is true (strict verification).
 * If no CA certs are found, rejectUnauthorized is false (graceful degradation).
 */
export function getSecureHttpsAgent(): https.Agent {
    const certs = loadCACertificates();
    return new https.Agent({
        ca: certs,
        rejectUnauthorized: certs ? true : false,
        keepAlive: true,
    });
}
