/**
 * HTTPS Server Wrapper for Backend
 * Uses mkcert certificates for local development
 * Required for: HTTPS-only frontend to call backend without mixed content errors
 *
 * Single HTTPS Server (Best Practice):
 * - HTTPS (4000): All access (browser + Docker internal)
 * - Containers trust mkcert CA via NODE_EXTRA_CA_CERTS environment variable
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import app from './server';
import { federationBootstrap } from './services/federation-bootstrap.service';
import { authzCacheService } from './services/authz-cache.service';
import { spokeHeartbeat } from './services/spoke-heartbeat.service';
import { spokeIdentityService } from './services/spoke-identity.service';
import { logger } from './utils/logger';

const PORT = parseInt(process.env.PORT || '4000', 10);
const certPath = process.env.SSL_CERT_PATH || '/opt/keycloak/certs';

/**
 * Fetch dynamic MongoDB credentials from Vault database secrets engine.
 * Updates process.env.MONGODB_URL so all MongoDB connections use ephemeral credentials.
 * Retries up to 5 times with 2s backoff (Vault may not be reachable immediately
 * after container recreation during Phase 8).
 * Falls back gracefully to static MONGODB_URL if Vault is unavailable.
 */
async function initializeVaultCredentials() {
  if (process.env.SECRETS_PROVIDER !== 'vault' || !process.env.VAULT_DB_ROLE) {
    return;
  }

  const vaultAddr = process.env.VAULT_ADDR || 'https://dive-hub-vault:8200';
  const roleId = process.env.VAULT_ROLE_ID || '';
  const secretId = process.env.VAULT_SECRET_ID || '';
  const dbRole = process.env.VAULT_DB_ROLE || '';

  if (!roleId || !secretId) {
    logger.warn('Vault AppRole credentials not configured, using static MONGODB_URL');
    return;
  }

  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Step 1: Authenticate with AppRole
      const authResp = await fetch(`${vaultAddr}/v1/auth/approle/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_id: roleId, secret_id: secretId }),
        signal: AbortSignal.timeout(5000),
      });
      if (!authResp.ok) throw new Error(`AppRole auth: ${authResp.status}`);
      const authData = await authResp.json() as { auth: { client_token: string } };
      const token = authData.auth.client_token;

      // Step 2: Fetch dynamic credentials
      const credResp = await fetch(`${vaultAddr}/v1/database/creds/${dbRole}`, {
        headers: { 'X-Vault-Token': token },
        signal: AbortSignal.timeout(10000),
      });
      if (!credResp.ok) throw new Error(`DB creds: ${credResp.status}`);
      const credData = await credResp.json() as {
        data: { username: string; password: string };
        lease_id: string;
        lease_duration: number;
        renewable: boolean;
      };

      // Step 3: Build MongoDB URL and activate
      const mongoHost = process.env.MONGODB_HOST || 'mongodb:27017';
      const mongoDb = process.env.MONGODB_DATABASE || 'dive-v3';
      const encodedUser = encodeURIComponent(credData.data.username);
      const encodedPass = encodeURIComponent(credData.data.password);
      process.env.MONGODB_URL = `mongodb://${encodedUser}:${encodedPass}@${mongoHost}/${mongoDb}?authSource=admin&directConnection=true&tls=true`;

      logger.info('Vault dynamic MongoDB credentials activated', {
        role: dbRole,
        username: credData.data.username,
        leaseId: credData.lease_id,
        leaseDuration: credData.lease_duration,
      });

      // Step 4: Start lease renewal
      const { startLeaseRenewal } = await import('./utils/vault-db-credentials');
      if (credData.renewable && credData.lease_duration > 0) {
        startLeaseRenewal(credData.lease_id, credData.lease_duration);
      }
      return;
    } catch (error) {
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      logger.warn('Vault database credentials unavailable, using static MONGODB_URL', {
        error: error instanceof Error ? error.message : 'Unknown error',
        attempts: maxRetries,
      });
    }
  }
}

// Load SSL certificates (shared with Keycloak and Frontend)
const httpsOptions = {
  key: fs.readFileSync(path.join(certPath, 'key.pem')),
  cert: fs.readFileSync(path.join(certPath, 'certificate.pem')),
};

// Create HTTPS server
const server = https.createServer(httpsOptions, app);

server.listen(PORT, async () => {
  // Initialize Vault credentials BEFORE any services start
  await initializeVaultCredentials();
  logger.info('Backend HTTPS server running', {
    url: `https://localhost:${PORT}`,
    environment: process.env.NODE_ENV || 'development',
    sslCertificates: certPath,
    dockerInternal: `https://backend:${PORT}`,
  });

  // ============================================
  // PHASE 1 FIX: Federation Cascade Bootstrap
  // ============================================
  const isHub = process.env.SPOKE_MODE !== 'true';
  if (isHub) {
    try {
      logger.info('Initializing federation cascade system (Hub mode)');
      await federationBootstrap.initialize();
      const status = federationBootstrap.getStatus();
      logger.info('Federation cascade system initialized successfully', {
        ...status,
        cascadeEnabled: true
      });
    } catch (error) {
      logger.error('CRITICAL: Failed to initialize federation cascade', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        impact: 'Spoke approvals will NOT cascade to OPAL/MongoDB/Keycloak'
      });
    }
  } else {
    logger.info('Skipping federation cascade initialization (Spoke mode)');
  }

  // ============================================
  // PHASE 2: Distributed Cache Invalidation via Redis Pub/Sub
  // ============================================
  try {
    logger.info('Initializing Redis pub/sub for distributed cache invalidation');
    await authzCacheService.initializePubSub();
    const pubSubHealth = authzCacheService.isPubSubHealthy();
    if (pubSubHealth.healthy) {
      logger.info('Redis pub/sub initialized successfully for cache invalidation');
    } else {
      logger.warn('Redis pub/sub not fully healthy', { reason: pubSubHealth.reason });
    }
  } catch (error) {
    logger.warn('Failed to initialize Redis pub/sub (cache invalidation will be local only)', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // ============================================
  // PHASE 5: Spoke Identity & Heartbeat (SSOT Architecture)
  // ============================================
  // SSOT ARCHITECTURE (2026-01-22):
  // Hub MongoDB is the Single Source of Truth for spokeId.
  // SPOKE_TOKEN (from registration) is the identity - Hub knows which spokeId it belongs to.
  // Flow: Start heartbeat with SPOKE_TOKEN → Hub validates → returns spokeId → cache locally
  if (!isHub) {
    const hubUrl = process.env.HUB_URL || 'https://dive-hub-backend:4000';
    const instanceCode = process.env.INSTANCE_CODE || '';
    const spokeToken = process.env.SPOKE_TOKEN || '';

    if (!instanceCode) {
      logger.error('INSTANCE_CODE environment variable is required for spoke mode');
    } else if (!spokeToken) {
      logger.error('SPOKE_TOKEN environment variable is required for spoke mode. Register the spoke first.');
    } else {
      try {
        // Step 1: Initialize spoke identity service (loads cached identity, sets up listeners)
        const identity = await spokeIdentityService.initialize();
        
        logger.info('Spoke identity service initialized', {
          spokeId: identity.spokeId,
          instanceCode: identity.instanceCode,
          verifiedByHub: identity.verifiedByHub,
          hasToken: !!identity.token,
        });

        // Step 2: Start heartbeat with SPOKE_TOKEN
        // Hub validates token and returns authoritative spokeId in response
        // The spokeId passed here is just for initial payload - Hub ignores it
        spokeHeartbeat.initialize({
          hubUrl: hubUrl,
          spokeId: identity.spokeId,  // Cached or placeholder - Hub will return authoritative one
          instanceCode: instanceCode,
          spokeToken: spokeToken,      // SPOKE_TOKEN is the real identity
          intervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000'),
          timeoutMs: parseInt(process.env.HEARTBEAT_TIMEOUT_MS || '10000'),
          maxQueueSize: parseInt(process.env.HEARTBEAT_MAX_QUEUE_SIZE || '10'),
          maxRetries: parseInt(process.env.HEARTBEAT_MAX_RETRIES || '3'),
        });

        spokeHeartbeat.start();
        logger.info('Spoke heartbeat service started', {
          instanceCode,
          hubUrl,
          intervalMs: 30000,
        });

        // Step 3: Wait for Hub to verify identity (optional - can proceed with cached)
        // This happens asynchronously via heartbeat's identityVerified event
        if (!identity.verifiedByHub) {
          logger.info('Waiting for Hub to verify spoke identity via first heartbeat...');
          // Don't block startup - identity service will update when heartbeat succeeds
        }
      } catch (identityError) {
        logger.error('Failed to initialize spoke identity/heartbeat', {
          error: identityError instanceof Error ? identityError.message : 'Unknown error',
          impact: 'Heartbeat service disabled - spoke cannot communicate with Hub',
        });
        // Continue startup - spoke can still serve local requests
      }
    }
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTPS server');
  server.close(() => {
    logger.info('HTTPS server closed');
  });
});

export { server };
