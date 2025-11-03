import express, { Application } from 'express';
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
import { initializeThemesCollection } from './services/idp-theme.service';
import { KeycloakConfigSyncService } from './services/keycloak-config-sync.service';

// Load environment variables from parent directory
config({ path: '../.env.local' });

const app: Application = express();
const PORT = process.env.PORT || 4000;

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
app.use('/api/decision-replay', decisionReplayRoutes);  // ADatP-5663 x ACP-240: Decision replay for UI

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

// Only start server if not in test environment AND not imported by https-server
// This allows https-server.ts to import app without starting HTTP server
const isImported = require.main !== module;

if (process.env.NODE_ENV !== 'test' && !isImported) {
  app.listen(PORT, async () => {
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
  });
}

export default app;


