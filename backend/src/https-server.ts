/**
 * HTTPS Server Wrapper for Backend
 * Uses self-signed certificates for local development
 * Required for: HTTPS-only frontend to call backend without mixed content errors
 *
 * Single HTTPS Server (Best Practice):
 * - HTTPS (4000): All access (browser + Docker internal)
 * - Containers trust self-signed certs via NODE_TLS_REJECT_UNAUTHORIZED=0
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import app from './server';
import { federationBootstrap } from './services/federation-bootstrap.service';
import { authzCacheService } from './services/authz-cache.service';
import { spokeHeartbeat } from './services/spoke-heartbeat.service';
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
  // PHASE 5: Spoke Heartbeat Service (for policy sync tracking)
  // ============================================
  // Only spokes need to send heartbeats to the Hub
  if (!isHub) {
    try {
      const spokeId = process.env.SPOKE_ID || process.env.INSTANCE_CODE || 'local';
      const instanceCode = process.env.INSTANCE_CODE || 'USA';
      const hubUrl = process.env.HUB_URL || 'https://hub.dive25.com';
      const spokeToken = process.env.SPOKE_OPAL_TOKEN || process.env.SPOKE_TOKEN;

      logger.info('Initializing spoke heartbeat service', { spokeId, instanceCode, hubUrl, hasToken: !!spokeToken });

      if (!spokeToken) {
        logger.warn('SPOKE_OPAL_TOKEN or SPOKE_TOKEN not configured, heartbeat service disabled');
      } else {
        spokeHeartbeat.initialize({
          hubUrl: hubUrl,  // The service adds /api/federation/heartbeat internally
          spokeId,
          instanceCode,
          spokeToken,
          intervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000'), // 30 seconds
          timeoutMs: parseInt(process.env.HEARTBEAT_TIMEOUT_MS || '10000'), // 10 seconds
          maxQueueSize: parseInt(process.env.HEARTBEAT_MAX_QUEUE_SIZE || '10'),
          maxRetries: parseInt(process.env.HEARTBEAT_MAX_RETRIES || '3'),
        });

        spokeHeartbeat.start();
        logger.info('Spoke heartbeat service initialized and started', {
          spokeId,
          instanceCode,
          hubUrl: hubUrl,
          intervalMs: 30000
        });
      }
    } catch (error) {
      logger.warn('Failed to initialize spoke heartbeat service', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Non-fatal: heartbeat service disabled
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
