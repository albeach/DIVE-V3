/**
 * mTLS Configuration for Inter-KAS Communication
 * 
 * Implements ACP-240 KAS-REQ-084: PKI-based trust for inter-KAS forwarding
 * Reference: kas/CONTINUATION-PROMPT.md Phase 3.4.1
 * 
 * Features:
 * - Certificate loading from environment variables or file paths
 * - HTTPS agent creation with mutual TLS
 * - Certificate validation and verification
 * - Support for per-KAS certificates
 * - CA certificate chain validation
 * 
 * Security:
 * - Always requests client certificates (requestCert: true)
 * - Rejects unauthorized connections (rejectUnauthorized: true)
 * - Validates certificate chains against trusted CAs
 * - Supports certificate rotation via environment reload
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { kasLogger } from './kas-logger';

// ============================================
// Types
// ============================================

export interface IMTLSConfig {
    /** Client certificate (PEM format) */
    clientCert: string | Buffer;
    
    /** Client private key (PEM format) */
    clientKey: string | Buffer;
    
    /** CA certificate(s) for validation (PEM format) */
    caCert?: string | Buffer;
    
    /** Reject unauthorized (default: true) */
    rejectUnauthorized?: boolean;
    
    /** Request client certificate from server (default: true) */
    requestCert?: boolean;
    
    /** Passphrase for encrypted private key */
    passphrase?: string;
}

export interface IMTLSAgent {
    /** HTTPS agent with mTLS configuration */
    agent: https.Agent;
    
    /** Target KAS ID */
    targetKasId: string;
    
    /** Configuration used */
    config: IMTLSConfig;
}

// ============================================
// Certificate Loading
// ============================================

/**
 * Load Certificate from Path or String
 * 
 * Supports both file paths and inline PEM strings
 */
function loadCertificate(certPathOrContent: string, label: string): string {
    // If it looks like a PEM string (starts with -----BEGIN), return as-is
    if (certPathOrContent.trim().startsWith('-----BEGIN')) {
        kasLogger.debug(`${label}: Using inline PEM content`);
        return certPathOrContent;
    }
    
    // Otherwise treat as file path
    try {
        const resolvedPath = path.resolve(certPathOrContent);
        
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Certificate file not found: ${resolvedPath}`);
        }
        
        const content = fs.readFileSync(resolvedPath, 'utf-8');
        kasLogger.info(`${label}: Loaded certificate from ${resolvedPath}`);
        return content;
    } catch (error) {
        kasLogger.error(`${label}: Failed to load certificate`, { 
            path: certPathOrContent, 
            error: (error as Error).message 
        });
        throw error;
    }
}

/**
 * Load mTLS Configuration for Target KAS
 * 
 * Environment variables (per-KAS):
 * - MTLS_CLIENT_CERT_<KASID>: Client certificate path or PEM string
 * - MTLS_CLIENT_KEY_<KASID>: Client private key path or PEM string
 * - MTLS_CA_CERT_<KASID>: CA certificate path or PEM string (optional)
 * - MTLS_PASSPHRASE_<KASID>: Passphrase for encrypted key (optional)
 * 
 * Fallback environment variables (shared):
 * - MTLS_CLIENT_CERT: Default client certificate
 * - MTLS_CLIENT_KEY: Default client private key
 * - MTLS_CA_CERT: Default CA certificate
 * - MTLS_PASSPHRASE: Default passphrase
 */
export function loadMTLSConfig(targetKasId: string): IMTLSConfig | null {
    const kasIdUpper = targetKasId.toUpperCase().replace(/-/g, '_');
    
    // Try per-KAS config first
    const certEnv = process.env[`MTLS_CLIENT_CERT_${kasIdUpper}`];
    const keyEnv = process.env[`MTLS_CLIENT_KEY_${kasIdUpper}`];
    const caEnv = process.env[`MTLS_CA_CERT_${kasIdUpper}`];
    const passphraseEnv = process.env[`MTLS_PASSPHRASE_${kasIdUpper}`];
    
    // Fallback to shared config
    const certDefault = process.env.MTLS_CLIENT_CERT;
    const keyDefault = process.env.MTLS_CLIENT_KEY;
    const caDefault = process.env.MTLS_CA_CERT;
    const passphraseDefault = process.env.MTLS_PASSPHRASE;
    
    const certPath = certEnv || certDefault;
    const keyPath = keyEnv || keyDefault;
    const caPath = caEnv || caDefault;
    const passphrase = passphraseEnv || passphraseDefault;
    
    // mTLS requires both cert and key
    if (!certPath || !keyPath) {
        kasLogger.debug(`mTLS config not found for ${targetKasId} (no cert/key configured)`);
        return null;
    }
    
    try {
        const clientCert = loadCertificate(certPath, `Client Cert [${targetKasId}]`);
        const clientKey = loadCertificate(keyPath, `Client Key [${targetKasId}]`);
        const caCert = caPath ? loadCertificate(caPath, `CA Cert [${targetKasId}]`) : undefined;
        
        kasLogger.info(`mTLS config loaded for ${targetKasId}`, {
            hasCert: !!clientCert,
            hasKey: !!clientKey,
            hasCA: !!caCert,
            hasPassphrase: !!passphrase,
        });
        
        return {
            clientCert,
            clientKey,
            caCert,
            rejectUnauthorized: true,
            requestCert: true,
            passphrase,
        };
    } catch (error) {
        kasLogger.error(`Failed to load mTLS config for ${targetKasId}`, {
            error: (error as Error).message,
        });
        return null;
    }
}

// ============================================
// HTTPS Agent Creation
// ============================================

/**
 * Create HTTPS Agent with mTLS Configuration
 * 
 * Creates an HTTPS agent configured for mutual TLS with the target KAS.
 * The agent can be reused for multiple requests to the same KAS.
 * 
 * Security settings:
 * - rejectUnauthorized: true (always validate server cert)
 * - requestCert: true (always present client cert)
 * - keepAlive: true (connection pooling for performance)
 * - maxSockets: 50 (connection limit per host)
 * 
 * @param targetKasId - Target KAS identifier (e.g., 'kas-fra', 'kas-gbr')
 * @returns HTTPS agent with mTLS configuration, or null if config not found
 */
export function createMTLSAgent(targetKasId: string): IMTLSAgent | null {
    const config = loadMTLSConfig(targetKasId);
    
    if (!config) {
        kasLogger.warn(`Cannot create mTLS agent for ${targetKasId}: No configuration found`);
        return null;
    }
    
    try {
        const agentOptions: https.AgentOptions = {
            cert: config.clientCert,
            key: config.clientKey,
            ca: config.caCert,
            rejectUnauthorized: config.rejectUnauthorized ?? true,
            requestCert: config.requestCert ?? true,
            passphrase: config.passphrase,
            
            // Connection pooling settings
            keepAlive: true,
            keepAliveMsecs: 10000,
            maxSockets: 50,
            maxFreeSockets: 10,
            timeout: 30000,
        };
        
        const agent = new https.Agent(agentOptions);
        
        kasLogger.info(`Created mTLS agent for ${targetKasId}`, {
            rejectUnauthorized: agentOptions.rejectUnauthorized,
            requestCert: agentOptions.requestCert,
            hasCA: !!config.caCert,
        });
        
        return {
            agent,
            targetKasId,
            config,
        };
    } catch (error) {
        kasLogger.error(`Failed to create mTLS agent for ${targetKasId}`, {
            error: (error as Error).message,
        });
        return null;
    }
}

// ============================================
// Agent Cache (for performance)
// ============================================

const mtlsAgentCache = new Map<string, IMTLSAgent>();

/**
 * Get or Create mTLS Agent (with caching)
 * 
 * Reuses existing agents for performance. Agents are cached per target KAS.
 * Cache can be invalidated for certificate rotation.
 */
export function getMTLSAgent(targetKasId: string): IMTLSAgent | null {
    // Check cache first
    if (mtlsAgentCache.has(targetKasId)) {
        const cached = mtlsAgentCache.get(targetKasId)!;
        kasLogger.debug(`Using cached mTLS agent for ${targetKasId}`);
        return cached;
    }
    
    // Create new agent
    const agent = createMTLSAgent(targetKasId);
    
    if (agent) {
        mtlsAgentCache.set(targetKasId, agent);
    }
    
    return agent;
}

/**
 * Invalidate mTLS Agent Cache
 * 
 * Forces re-creation of agents. Use after certificate rotation.
 */
export function invalidateMTLSAgentCache(targetKasId?: string): void {
    if (targetKasId) {
        mtlsAgentCache.delete(targetKasId);
        kasLogger.info(`Invalidated mTLS agent cache for ${targetKasId}`);
    } else {
        mtlsAgentCache.clear();
        kasLogger.info('Invalidated all mTLS agent caches');
    }
}

/**
 * Get mTLS Agent Statistics
 */
export function getMTLSAgentStats(): {
    cachedAgents: number;
    agentIds: string[];
} {
    return {
        cachedAgents: mtlsAgentCache.size,
        agentIds: Array.from(mtlsAgentCache.keys()),
    };
}

// ============================================
// Validation Helpers
// ============================================

/**
 * Validate mTLS Configuration
 * 
 * Checks if mTLS is properly configured for a target KAS
 */
export function validateMTLSConfig(targetKasId: string): {
    valid: boolean;
    reason?: string;
    config?: IMTLSConfig;
} {
    const config = loadMTLSConfig(targetKasId);
    
    if (!config) {
        return {
            valid: false,
            reason: `No mTLS configuration found for ${targetKasId}`,
        };
    }
    
    // Validate cert and key are non-empty
    if (!config.clientCert || config.clientCert.toString().trim().length === 0) {
        return {
            valid: false,
            reason: 'Client certificate is empty',
        };
    }
    
    if (!config.clientKey || config.clientKey.toString().trim().length === 0) {
        return {
            valid: false,
            reason: 'Client key is empty',
        };
    }
    
    // Validate PEM format
    const certStr = config.clientCert.toString();
    const keyStr = config.clientKey.toString();
    
    if (!certStr.includes('-----BEGIN CERTIFICATE-----')) {
        return {
            valid: false,
            reason: 'Client certificate is not in PEM format',
        };
    }
    
    if (!keyStr.includes('-----BEGIN') || !keyStr.includes('PRIVATE KEY-----')) {
        return {
            valid: false,
            reason: 'Client key is not in PEM format',
        };
    }
    
    return {
        valid: true,
        config,
    };
}

/**
 * Check if mTLS is Enabled Globally
 */
export function isMTLSEnabled(): boolean {
    const enabled = process.env.FEDERATION_MTLS_ENABLED === 'true';
    kasLogger.debug(`mTLS globally enabled: ${enabled}`);
    return enabled;
}
