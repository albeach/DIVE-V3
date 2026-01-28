import express, { Application } from 'express';
import https from 'https';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import axios from 'axios';
import { config } from 'dotenv';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/error.middleware';
import { policySelectorMiddleware } from './middleware/policy-selector.middleware';
import resourceRoutes from './routes/resource.routes';
import healthRoutes from './routes/health.routes';
import policyRoutes from './routes/policy.routes';
import uploadRoutes from './routes/upload.routes';
import adminRoutes from './routes/admin.routes';
import publicRoutes from './routes/public.routes';
import complianceRoutes from './routes/compliance.routes';
import coiKeysRoutes from './routes/coi-keys.routes';
import authRoutes from './controllers/auth.controller';  // Gap #7: Token revocation
import otpRoutes from './routes/otp.routes';  // OTP enrollment endpoints
import decisionReplayRoutes from './routes/decision-replay.routes';
import policiesLabRoutes from './routes/policies-lab.routes';  // Policies Lab
import oauthRoutes from './routes/oauth.routes';  // OAuth 2.0 for SP federation
import scimRoutes from './routes/scim.routes';  // SCIM 2.0 user provisioning
import federationRoutes from './routes/federation.routes';  // Federation endpoints
import federationSyncRoutes from './routes/federation-sync.routes';  // Phase 5: Federation state sync
import spManagementRoutes from './routes/sp-management.routes';  // SP Registry management
import blacklistRoutes from './routes/blacklist.routes';  // Phase 2 GAP-007: Token blacklist
import dashboardRoutes from './routes/dashboard.routes';  // Dashboard statistics
import seedStatusRoutes from './routes/seed-status.routes';  // Seed status monitoring
import kasRoutes from './routes/kas.routes';  // KAS proxy routes for ZTDF key access
import federatedQueryRoutes from './routes/federated-query.routes';  // Phase 3: Direct MongoDB federation
import analyticsRoutes from './routes/analytics.routes';  // Phase 2: Search analytics
import metricsRoutes from './routes/metrics.routes';  // Phase 8: Enhanced Prometheus metrics
import opalRoutes from './routes/opal.routes';  // Phase 2: OPAL policy distribution
import spokeRoutes from './routes/spoke.routes';  // Phase 5: Spoke resilience operations
import notificationRoutes from './routes/notifications.routes';
import notificationCountRoutes from './routes/notifications-count.routes';
import activityRoutes from './routes/activity.routes';  // User activity endpoints
import swaggerRoutes from './routes/swagger.routes';  // API Documentation (OpenAPI/Swagger)
import clearanceManagementRoutes from './routes/clearance-management.routes';  // Phase 3: Clearance management
import spifRoutes from './routes/spif.routes';  // STANAG 4774 SPIF marking rules
import documentConvertRoutes from './routes/document-convert.routes';  // Server-side document conversion
import { initializeThemesCollection } from './services/idp-theme.service';
import { KeycloakConfigSyncService } from './services/keycloak-config-sync.service';
import { mongoKasRegistryStore } from './models/kas-registry.model';  // Phase 4: Cross-instance KAS (MongoDB SSOT)
import { policyVersionMonitor } from './services/policy-version-monitor.service';  // Phase 4: Policy drift
import { spokeFailover } from './services/spoke-failover.service';  // Phase 5: Circuit breaker
import { spokeAuditQueue } from './services/spoke-audit-queue.service';  // Phase 5: Audit queue
import { spokeIdentityService } from './services/spoke-identity.service';  // SSOT: Hub-assigned spokeId
import { spokeHeartbeat } from './services/spoke-heartbeat.service';  // Phase 5: Heartbeat service
import { federationBootstrap } from './services/federation-bootstrap.service';  // Phase 1 Fix: Federation cascade
import { authzCacheService } from './services/authz-cache.service';  // Phase 2: Distributed cache invalidation

// Load environment variables from parent directory
config({ path: '../.env.local' });

const app: Application = express();
const PORT = process.env.PORT || 4000;
const HTTPS_ENABLED = process.env.HTTPS_ENABLED === 'true';

// ============================================
// Middleware
// ============================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", process.env.KEYCLOAK_BASE_URL || 'http://localhost:8081']
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true
  }
}));

// CORS - Allow HTTPS frontend and federation partners
const corsOrigins: (string | RegExp)[] = [
  process.env.NEXT_PUBLIC_BASE_URL || 'https://localhost:3000',
  'https://localhost:3000',
  'http://localhost:3000',  // Fallback for development
  // Allow all localhost ports for spoke instances (development)
  /^https?:\/\/localhost:\d+$/,
];

// Add federation partner origins from environment
if (process.env.FEDERATION_ALLOWED_ORIGINS) {
  corsOrigins.push(...process.env.FEDERATION_ALLOWED_ORIGINS.split(','));
}

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-DIVE-Signature'],
  exposedHeaders: ['Location', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// i18n middleware - Attach user's locale to request
// Parses Accept-Language header or ?locale query parameter
import { localeMiddleware } from './utils/i18n';
app.use(localeMiddleware);

// Policy selector (determines which OPA policy to use)
app.use(policySelectorMiddleware);

// Request logging
app.use((req, _res, next) => {
  const requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  req.headers['x-request-id'] = requestId as string;

  logger.info('Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip
  });

  next();
});

// ============================================
// Routes
// ============================================

// Phase 8: Enhanced Prometheus metrics routes (no auth required)
app.use('/metrics', metricsRoutes);

app.use('/health', healthRoutes);
app.use('/api', publicRoutes);  // Public routes (no auth required)
app.use('/api/resources', resourceRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/policies-lab', policiesLabRoutes);  // Policies Lab (distinct from /api/policies)
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/clearance', clearanceManagementRoutes);  // Phase 3: Clearance management
app.use('/api/compliance', complianceRoutes);
app.use('/api/coi-keys', coiKeysRoutes);
app.use('/api/auth/otp', otpRoutes);  // OTP enrollment endpoints (must be before /api/auth)
app.use('/api/auth', authRoutes);  // Gap #7: Token revocation endpoints
app.use('/', blacklistRoutes);  // Phase 2 GAP-007: Token blacklist (mounted at root for /api/auth/blacklist-token and /api/blacklist/stats)
app.use('/api/decision-replay', decisionReplayRoutes);  // ADatP-5663 x ACP-240: Decision replay for UI
app.use('/api/dashboard', dashboardRoutes);  // Dashboard statistics
app.use('/api/resources', seedStatusRoutes);  // Seed status monitoring (appended to /api/resources)
app.use('/api/resources', federatedQueryRoutes);  // Phase 3: Direct MongoDB federation queries
app.use('/api/analytics', analyticsRoutes);  // Phase 2: Search analytics tracking
app.use('/api/kas', kasRoutes);  // KAS proxy routes for ZTDF key access (matches KAO URLs)
app.use('/api/opal', opalRoutes);  // Phase 2: OPAL policy distribution and bundle management
app.use('/api/spoke', spokeRoutes);  // Phase 5: Spoke resilience operations (failover, maintenance, audit)
app.use('/api/notifications', notificationRoutes);
app.use('/api/notifications-count', notificationCountRoutes);
app.use('/api/activity', activityRoutes);  // User activity endpoints
app.use('/api/spif', spifRoutes);  // STANAG 4774 SPIF marking rules and country codes
app.use('/api/documents', documentConvertRoutes);  // Server-side document conversion (DOCX to HTML/PDF)
app.use('/api-docs', swaggerRoutes);  // API Documentation (OpenAPI/Swagger UI)

// Federation endpoints (Phase 1)
app.use('/oauth', oauthRoutes);  // OAuth 2.0 Authorization Server
app.use('/scim/v2', scimRoutes);  // SCIM 2.0 User Provisioning
app.use('/api/federation', federationRoutes);  // Hub-Spoke federation management (Phase 3-5)
app.use('/api/drift', federationSyncRoutes);  // Phase 5: Federation state drift detection (no auth required)
app.use('/api/sp-management', spManagementRoutes);  // SP Registry management (admin-only)

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    service: 'DIVE V3 Backend API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// Error Handling
// ============================================

app.use(errorHandler);

// ============================================
// Server Startup
// ============================================
// Server initialization logic (moved to startServer callback to avoid duplicate startup)

// ============================================
// Start Server (HTTP or HTTPS)
// ============================================
async function startServer() {
  // ============================================
  // PHASE 0: Pre-startup Bootstrap (CRITICAL)
  // ============================================
  // MUST run BEFORE server starts listening to ensure:
  // - Hub instance is registered in MongoDB
  // - Hub KAS is registered in MongoDB
  // - Trusted issuers are registered
  // This allows seeding to run immediately after health check passes

  const isHub = process.env.SPOKE_MODE !== 'true';
  if (isHub) {
    try {
      logger.info('Running Hub bootstrap before server startup');
      await federationBootstrap.initialize();
      const status = federationBootstrap.getStatus();
      logger.info('Hub bootstrap completed successfully', {
        ...status,
        note: 'Bootstrap completed BEFORE server started listening'
      });
    } catch (error) {
      logger.error('CRITICAL: Hub bootstrap failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        impact: 'Seeding will fail - Hub instance and KAS not registered'
      });
      // Fatal for Hub - can't proceed without instance registration
      throw error;
    }
  }

  const serverCallback = async () => {
    console.log('🚀 SERVER CALLBACK STARTED - SPOKE_MODE:', process.env.SPOKE_MODE);
    logger.info('DIVE V3 Backend API started', {
      port: PORT,
      env: process.env.NODE_ENV,
      keycloak: process.env.KEYCLOAK_URL,
      opa: process.env.OPA_URL,
      mongodb: process.env.MONGODB_URL
    });

    // Initialize IdP themes collection (Phase 1.9)
    try {
      await initializeThemesCollection();
      logger.info('IdP themes collection initialized');
    } catch (error) {
      logger.error('Failed to initialize themes collection', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // Task 4.3: Sync Keycloak brute force configuration for all realms
    try {
      logger.info('Starting Keycloak configuration sync for all realms');
      await KeycloakConfigSyncService.syncAllRealms();
      logger.info('Keycloak configuration sync completed successfully');
    } catch (error) {
      logger.error('Failed to sync Keycloak configuration', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      // Non-fatal: will fallback to defaults during rate limiting
    }

    // Set up periodic sync (every 5 minutes)
    setInterval(async () => {
      try {
        logger.debug('Running periodic Keycloak configuration sync');
        await KeycloakConfigSyncService.syncAllRealms();
      } catch (error) {
        logger.error('Periodic sync failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, 5 * 60 * 1000); // 5 minutes

    logger.info('Periodic Keycloak configuration sync scheduled (every 5 minutes)');

    // ============================================
    // PHASE 1 FIX: Federation Cascade Event Handlers
    // ============================================
    // Note: Hub bootstrap already ran before server started
    // This section just logs status and sets up additional services
    if (isHub) {
      logger.info('Hub bootstrap already completed - federation cascade active');
    } else {
      logger.info('Running in Spoke mode - no federation cascade needed');
    }

    // ============================================
    // PHASE 5: Federation State Drift Detection
    // ============================================
    // Start periodic drift detection for three-layer consistency
    // (Keycloak IdPs, MongoDB spokes, Docker containers)
    if (isHub) {
      try {
        const { federationSyncService } = await import('./services/federation-sync.service');
        logger.info('Starting federation drift detection service');
        federationSyncService.startPeriodicCheck();
        logger.info('Federation drift detection active (5-minute intervals)');
      } catch (error) {
        logger.warn('Failed to start federation drift detection', {
          error: error instanceof Error ? error.message : 'Unknown error',
          impact: 'Manual drift monitoring required'
        });
      }
    }

    // ============================================
    // PHASE 2: Distributed Cache Invalidation via Redis Pub/Sub
    // ============================================
    // All backend instances (Hub and Spokes) should initialize pub/sub
    // to receive cache invalidation events when federation changes
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
      // Non-fatal: fall back to local cache invalidation
    }

    // Phase 4: Initialize KAS Registry for cross-instance encrypted access (MongoDB SSOT)
    try {
      logger.info('Initializing MongoDB KAS registry for cross-instance federation');
      await mongoKasRegistryStore.initialize();
      const activeKAS = await mongoKasRegistryStore.findActive();
      logger.info(`MongoDB KAS registry initialized: ${activeKAS.length} active KAS servers`, {
        kasIds: activeKAS.map(k => k.kasId),
        crossKASEnabled: true
      });
    } catch (error) {
      logger.warn('Failed to initialize MongoDB KAS registry (cross-instance KAS disabled)', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Non-fatal: cross-instance access will fail gracefully
    }

    // Phase 4: Start policy version monitoring for drift detection
    try {
      const policyCheckInterval = parseInt(process.env.POLICY_CHECK_INTERVAL_MS || '300000'); // 5 min default
      logger.info('Starting policy version monitoring', {
        intervalMs: policyCheckInterval
      });
      policyVersionMonitor.startMonitoring(policyCheckInterval);
    } catch (error) {
      logger.warn('Failed to start policy version monitoring', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Non-fatal: policy drift detection disabled
    }

    // Phase 5: Initialize spoke failover service (circuit breaker)
    try {
      const spokeId = process.env.SPOKE_ID || process.env.INSTANCE_CODE || 'local';
      const instanceCode = process.env.INSTANCE_CODE || 'USA';

      logger.info('Initializing spoke failover service', { spokeId, instanceCode });
      spokeFailover.initialize({
        spokeId,
        instanceCode,
        autoFailover: process.env.AUTO_FAILOVER !== 'false',
        maxOfflineTimeMs: parseInt(process.env.MAX_OFFLINE_TIME_MS || '86400000'), // 24 hours
        healthCheckIntervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '30000'), // 30s
      });
      spokeFailover.startMonitoring();
      logger.info('Spoke failover service initialized and monitoring started');
    } catch (error) {
      logger.warn('Failed to initialize spoke failover service', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Non-fatal: failover service disabled
    }

    // Phase 5: Initialize spoke audit queue service
    try {
      const auditQueuePath = process.env.AUDIT_QUEUE_PATH || './data/audit-queue';
      const spokeId = process.env.SPOKE_ID || process.env.INSTANCE_CODE || 'local';
      const instanceCode = process.env.INSTANCE_CODE || 'USA';
      const hubUrl = process.env.HUB_URL || 'https://hub.dive25.com';

      logger.info('Initializing spoke audit queue service', {
        queuePath: auditQueuePath,
        spokeId,
        instanceCode
      });
      await spokeAuditQueue.initialize({
        queuePath: auditQueuePath,
        spokeId,
        instanceCode,
        hubUrl,
        maxQueueSize: parseInt(process.env.AUDIT_QUEUE_MAX_SIZE || '10000'),
        batchSize: parseInt(process.env.AUDIT_QUEUE_BATCH_SIZE || '100'),
      });
      spokeAuditQueue.startAutoFlush();
      logger.info('Spoke audit queue service initialized and auto-flush started');
    } catch (error) {
      logger.warn('Failed to initialize spoke audit queue service', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Non-fatal: audit queue service disabled
    }

    // ============================================
    // PHASE 5: Spoke Identity Service (SSOT Architecture)
    // ============================================
    // CRITICAL: Hub MongoDB is the SINGLE SOURCE OF TRUTH for spokeId
    // SSOT ARCHITECTURE (2026-01-22):
    // Hub MongoDB is the Single Source of Truth for spokeId.
    // SPOKE_TOKEN (from registration) is the identity - Hub knows which spokeId it belongs to.
    // Flow: Start heartbeat with SPOKE_TOKEN → Hub validates → returns spokeId → cache locally
    console.log('🔄 Initializing spoke identity and heartbeat services...');

    const isSpokeMode = process.env.SPOKE_MODE === 'true';

    if (isSpokeMode) {
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
    } else {
      // Hub mode - no spoke identity needed
      logger.info('Hub mode - skipping spoke identity initialization');
    }

  };

  if (HTTPS_ENABLED) {
    try {
      const certPath = process.env.CERT_PATH || '/opt/app/certs';
      const httpsOptions = {
        key: fs.readFileSync(path.join(certPath, process.env.KEY_FILE || 'key.pem')),
        cert: fs.readFileSync(path.join(certPath, process.env.CERT_FILE || 'certificate.pem')),
      };

      https.createServer(httpsOptions, app).listen(PORT, serverCallback);
      logger.info(`🔒 Starting HTTPS server on port ${PORT}`);
    } catch (error) {
      logger.error('Failed to start HTTPS server, falling back to HTTP', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Fallback to HTTP if certificates are missing
      app.listen(PORT, serverCallback);
      logger.warn(`⚠️  Starting HTTP server (HTTPS failed) on port ${PORT}`);
    }
  } else {
    app.listen(PORT, serverCallback);
    logger.info(`Starting HTTP server on port ${PORT}`);
  }
}

// Start the server if not being imported as a module
if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  });
}

export default app;
