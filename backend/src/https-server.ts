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

// Load SSL certificates (shared with Keycloak and Frontend)
const httpsOptions = {
  key: fs.readFileSync(path.join(certPath, 'key.pem')),
  cert: fs.readFileSync(path.join(certPath, 'certificate.pem')),
};

// Create HTTPS server
const server = https.createServer(httpsOptions, app);

server.listen(PORT, async () => {
  console.log(`✅ Backend HTTPS server running on https://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   SSL Certificates: ${certPath}`);
  console.log(`   Docker internal: https://backend:${PORT}`);

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
  // Hub MongoDB is the SINGLE SOURCE OF TRUTH for spokeId
  // Spoke queries Hub at startup to get its identity
  if (!isHub) {
    try {
      // Initialize spoke identity from Hub (authoritative source)
      const identity = await spokeIdentityService.initialize();
      
      logger.info('Spoke identity initialized from Hub (SSOT)', {
        spokeId: identity.spokeId,
        instanceCode: identity.instanceCode,
        status: identity.status,
      });

      const hubUrl = process.env.HUB_URL || 'https://dive-hub-backend:4000';

      if (identity.status === 'approved' && identity.token) {
        spokeHeartbeat.initialize({
          hubUrl: hubUrl,
          spokeId: identity.spokeId,  // From Hub, NOT from env
          instanceCode: identity.instanceCode,
          spokeToken: identity.token,
          intervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000'),
          timeoutMs: parseInt(process.env.HEARTBEAT_TIMEOUT_MS || '10000'),
          maxQueueSize: parseInt(process.env.HEARTBEAT_MAX_QUEUE_SIZE || '10'),
          maxRetries: parseInt(process.env.HEARTBEAT_MAX_RETRIES || '3'),
        });

        spokeHeartbeat.start();
        logger.info('Spoke heartbeat service initialized with Hub-assigned identity', {
          spokeId: identity.spokeId,
          instanceCode: identity.instanceCode,
          hubUrl,
          intervalMs: 30000,
        });
      } else {
        logger.warn('Spoke not approved - heartbeat disabled', {
          spokeId: identity.spokeId,
          status: identity.status,
        });
      }
    } catch (error) {
      logger.error('Failed to initialize spoke identity', {
        error: error instanceof Error ? error.message : 'Unknown error',
        impact: 'Heartbeat service disabled',
      });
    }
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTPS server');
  server.close(() => {
    console.log('HTTPS server closed');
  });
});

export { server };
