import express, { Application } from 'express';
import https from 'https';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
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
import { initializeThemesCollection } from './services/idp-theme.service';
import { KeycloakConfigSyncService } from './services/keycloak-config-sync.service';
import { kasRegistryService } from './services/kas-registry.service';  // Phase 4: Cross-instance KAS
import { policyVersionMonitor } from './services/policy-version-monitor.service';  // Phase 4: Policy drift

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
const corsOrigins = [
  process.env.NEXT_PUBLIC_BASE_URL || 'https://localhost:3000',
  'https://localhost:3000',
  'http://localhost:3000'  // Fallback for development
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

// Federation endpoints (Phase 1)
app.use('/oauth', oauthRoutes);  // OAuth 2.0 Authorization Server
app.use('/scim/v2', scimRoutes);  // SCIM 2.0 User Provisioning
app.use('/federation', federationRoutes);  // Federation metadata and resource exchange
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
function startServer() {
  const serverCallback = async () => {
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

    // Phase 4: Initialize KAS Registry for cross-instance encrypted access
    try {
      logger.info('Loading KAS registry for cross-instance federation');
      await kasRegistryService.loadRegistry();
      const kasCount = kasRegistryService.getAllKAS().length;
      logger.info(`KAS registry loaded: ${kasCount} KAS servers configured`, {
        crossKASEnabled: kasRegistryService.isCrossKASEnabled()
      });
    } catch (error) {
      logger.warn('Failed to load KAS registry (cross-instance KAS disabled)', {
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
  startServer();
}

export default app;

