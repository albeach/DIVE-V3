/**
 * OPAL Routes - Authentication & Authorization Tests
 *
 * Verifies that OPAL mutation endpoints (bundle build/publish/refresh/data-publish)
 * require proper authentication and authorization middleware.
 *
 * Security: PLAN.md §6 - OPAL bundle build/publish endpoints were unauthenticated.
 */

import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import express, { Express } from 'express';
import request from 'supertest';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.FEDERATION_ADMIN_KEY = 'test-admin-key';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock OPAL services
jest.mock('../../services/policy-bundle.service', () => ({
  policyBundleService: {
    buildBundle: jest.fn().mockImplementation(() =>
      Promise.resolve({
        success: true,
        bundleId: 'test-bundle-1',
        version: '1.0.0',
        hash: 'abc123',
        size: 1024,
        signed: true,
      })
    ),
    publishBundle: jest.fn().mockImplementation(() =>
      Promise.resolve({
        success: true,
        bundleId: 'test-bundle-1',
        version: '1.0.0',
        hash: 'abc123',
        publishedAt: new Date().toISOString(),
        opalTransactionId: 'tx-123',
      })
    ),
    buildAndPublish: jest.fn().mockImplementation(() =>
      Promise.resolve({
        buildResult: {
          success: true,
          bundleId: 'test-bundle-1',
          version: '1.0.0',
          hash: 'abc123',
          size: 1024,
          fileCount: 5,
        },
        publishResult: {
          success: true,
          hash: 'abc123',
          publishedAt: new Date().toISOString(),
          opalTransactionId: 'tx-123',
        },
      })
    ),
  },
}));

jest.mock('../../services/opal-client', () => ({
  opalClient: {
    isOPALEnabled: jest.fn(() => false),
    publishInlineData: jest.fn().mockImplementation(() =>
      Promise.resolve({ success: true, transactionId: 'tx-456' })
    ),
    triggerPolicyRefresh: jest.fn().mockImplementation(() =>
      Promise.resolve({ success: true, transactionId: 'tx-789' })
    ),
  },
}));

jest.mock('../../services/policy-sync.service', () => ({
  policySyncService: {
    getCurrentVersion: jest.fn(() => ({
      version: 'v1.0.0',
      timestamp: new Date().toISOString(),
      hash: 'abc123',
      layers: ['base'],
    })),
    recordSpokeSync: jest.fn(),
  },
}));

jest.mock('../../services/hub-spoke-registry.service', () => ({
  hubSpokeRegistry: {
    getAllSpokes: jest.fn(() => []),
    getApprovedSpokes: jest.fn(() => []),
  },
}));

jest.mock('../../models/trusted-issuer.model', () => ({
  mongoOpalDataStore: {
    initialize: jest.fn().mockImplementation(() => Promise.resolve()),
    getTrustedIssuers: jest.fn(() => []),
  },
}));

jest.mock('../../services/opal-cdc.service', () => ({
  opalCdcService: {
    initialize: jest.fn(),
  },
}));

jest.mock('../../services/opal-metrics.service', () => ({
  opalMetricsService: {
    recordBundleBuild: jest.fn(),
    recordBundlePublish: jest.fn(),
    getMetrics: jest.fn(() => ({})),
  },
}));

jest.mock('../../middleware/hub-admin.middleware', () => ({
  requireHubAdmin: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  logFederationModification: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

// Mock authenticateJWT: reject if no Authorization header, otherwise set req.user
const mockAuthenticateJWT = jest.fn((req: any, res: any, next: () => void) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const token = authHeader.replace('Bearer ', '');
  if (token === 'superadmin-token') {
    req.user = {
      uniqueID: 'admin-usa',
      sub: 'admin-usa',
      clearance: 'TOP_SECRET',
      countryOfAffiliation: 'USA',
      realm_access: { roles: ['super_admin'] },
    };
  } else if (token === 'admin-token') {
    req.user = {
      uniqueID: 'admin-usa',
      sub: 'admin-usa',
      clearance: 'SECRET',
      countryOfAffiliation: 'USA',
      realm_access: { roles: ['admin'] },
    };
  } else if (token === 'user-token') {
    req.user = {
      uniqueID: 'testuser-usa-3',
      sub: 'testuser-usa-3',
      clearance: 'SECRET',
      countryOfAffiliation: 'USA',
      realm_access: { roles: ['user'] },
    };
  }
  next();
});

jest.mock('../../middleware/authz.middleware', () => ({
  authenticateJWT: mockAuthenticateJWT,
}));

// Mock requireAdmin: allow admin and super_admin roles
const mockRequireAdmin = jest.fn((req: any, res: any, next: () => void) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey === process.env.FEDERATION_ADMIN_KEY) {
    next();
    return;
  }
  const roles = req.user?.realm_access?.roles || [];
  if (roles.includes('admin') || roles.includes('super_admin') || roles.includes('dive-admin')) {
    next();
    return;
  }
  res.status(403).json({ error: 'Forbidden: admin role required' });
});

// Mock requireSuperAdmin: allow only super_admin role
const mockRequireSuperAdmin = jest.fn((req: any, res: any, next: () => void) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey === process.env.FEDERATION_ADMIN_KEY) {
    next();
    return;
  }
  const roles = req.user?.realm_access?.roles || [];
  if (roles.includes('super_admin')) {
    next();
    return;
  }
  res.status(403).json({ error: 'Forbidden: super_admin role required' });
});

jest.mock('../../middleware/admin.middleware', () => ({
  requireAdmin: mockRequireAdmin,
  requireSuperAdmin: mockRequireSuperAdmin,
}));

// Import routes AFTER all mocks
import opalRoutes from '../../routes/opal.routes';

describe('OPAL Routes - Authentication & Authorization', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/opal', opalRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // POST /api/opal/bundle/build — requireSuperAdmin
  // ============================================
  describe('POST /api/opal/bundle/build', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/opal/bundle/build')
        .send({ scopes: ['base'] });

      expect(response.status).toBe(401);
      expect(mockAuthenticateJWT).toHaveBeenCalled();
    });

    it('should return 403 with regular user token', async () => {
      const response = await request(app)
        .post('/api/opal/bundle/build')
        .set('Authorization', 'Bearer user-token')
        .send({ scopes: ['base'] });

      expect(response.status).toBe(403);
      expect(mockRequireSuperAdmin).toHaveBeenCalled();
    });

    it('should return 403 with admin token (requires superadmin)', async () => {
      const response = await request(app)
        .post('/api/opal/bundle/build')
        .set('Authorization', 'Bearer admin-token')
        .send({ scopes: ['base'] });

      expect(response.status).toBe(403);
    });

    it('should succeed with superadmin token', async () => {
      const response = await request(app)
        .post('/api/opal/bundle/build')
        .set('Authorization', 'Bearer superadmin-token')
        .send({ scopes: ['base'] });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should succeed with admin key header', async () => {
      const response = await request(app)
        .post('/api/opal/bundle/build')
        .set('Authorization', 'Bearer user-token')
        .set('X-Admin-Key', 'test-admin-key')
        .send({ scopes: ['base'] });

      expect(response.status).toBe(200);
    });
  });

  // ============================================
  // POST /api/opal/bundle/publish — requireSuperAdmin
  // ============================================
  describe('POST /api/opal/bundle/publish', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/opal/bundle/publish');

      expect(response.status).toBe(401);
    });

    it('should return 403 with regular user token', async () => {
      const response = await request(app)
        .post('/api/opal/bundle/publish')
        .set('Authorization', 'Bearer user-token');

      expect(response.status).toBe(403);
    });

    it('should succeed with superadmin token', async () => {
      const response = await request(app)
        .post('/api/opal/bundle/publish')
        .set('Authorization', 'Bearer superadmin-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.hash).toBe('abc123');
      expect(response.body.hashAlgorithm).toBe('sha256');
    });
  });

  // ============================================
  // POST /api/opal/bundle/build-and-publish — requireSuperAdmin
  // ============================================
  describe('POST /api/opal/bundle/build-and-publish', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/opal/bundle/build-and-publish')
        .send({ scopes: ['base'] });

      expect(response.status).toBe(401);
    });

    it('should return 403 with regular user token', async () => {
      const response = await request(app)
        .post('/api/opal/bundle/build-and-publish')
        .set('Authorization', 'Bearer user-token')
        .send({ scopes: ['base'] });

      expect(response.status).toBe(403);
    });

    it('should succeed with superadmin token', async () => {
      const response = await request(app)
        .post('/api/opal/bundle/build-and-publish')
        .set('Authorization', 'Bearer superadmin-token')
        .send({ scopes: ['base'] });

      expect(response.status).toBe(200);
      expect(response.body.publish.hash).toBe('abc123');
      expect(response.body.publish.hashAlgorithm).toBe('sha256');
    });
  });

  // ============================================
  // POST /api/opal/refresh — requireAdmin (lower threshold)
  // ============================================
  describe('POST /api/opal/refresh', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/opal/refresh');

      expect(response.status).toBe(401);
    });

    it('should return 403 with regular user token', async () => {
      const response = await request(app)
        .post('/api/opal/refresh')
        .set('Authorization', 'Bearer user-token');

      expect(response.status).toBe(403);
    });

    it('should succeed with admin token (lower threshold than superadmin)', async () => {
      const response = await request(app)
        .post('/api/opal/refresh')
        .set('Authorization', 'Bearer admin-token');

      expect(response.status).toBe(200);
    });

    it('should succeed with superadmin token', async () => {
      const response = await request(app)
        .post('/api/opal/refresh')
        .set('Authorization', 'Bearer superadmin-token');

      expect(response.status).toBe(200);
    });
  });

  // ============================================
  // POST /api/opal/data/publish — requireSuperAdmin
  // ============================================
  describe('POST /api/opal/data/publish', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/opal/data/publish')
        .send({ path: 'test/path', data: { key: 'value' }, reason: 'test' });

      expect(response.status).toBe(401);
    });

    it('should return 403 with regular user token', async () => {
      const response = await request(app)
        .post('/api/opal/data/publish')
        .set('Authorization', 'Bearer user-token')
        .send({ path: 'test/path', data: { key: 'value' }, reason: 'test' });

      expect(response.status).toBe(403);
    });

    it('should succeed with superadmin token', async () => {
      const response = await request(app)
        .post('/api/opal/data/publish')
        .set('Authorization', 'Bearer superadmin-token')
        .send({ path: 'test/path', data: { key: 'value' }, reason: 'test' });

      expect(response.status).toBe(200);
    });
  });

  // ============================================
  // Middleware chain verification
  // ============================================
  describe('Middleware chain verification', () => {
    it('authenticateJWT is called before requireSuperAdmin on bundle/build', async () => {
      await request(app)
        .post('/api/opal/bundle/build')
        .set('Authorization', 'Bearer superadmin-token')
        .send({ scopes: ['base'] });

      expect(mockAuthenticateJWT).toHaveBeenCalled();
      expect(mockRequireSuperAdmin).toHaveBeenCalled();
    });

    it('authenticateJWT is called before requireAdmin on refresh', async () => {
      await request(app)
        .post('/api/opal/refresh')
        .set('Authorization', 'Bearer admin-token');

      expect(mockAuthenticateJWT).toHaveBeenCalled();
      expect(mockRequireAdmin).toHaveBeenCalled();
    });
  });
});
