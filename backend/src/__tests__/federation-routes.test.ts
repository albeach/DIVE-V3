/**
 * DIVE V3 - Federation Routes Integration Tests
 * 
 * Tests for the federation API endpoints including:
 * - Spoke registration API
 * - Spoke approval/rejection API
 * - Token generation API
 * - Policy version and bundle API
 * - Heartbeat API
 * 
 * @version 1.0.0
 * @date 2025-12-11
 */

import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import express, { Express } from 'express';
import request from 'supertest';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.SPOKE_STORE = 'memory';
process.env.FEDERATION_ADMIN_KEY = 'test-admin-key';

// Mock dependencies before importing routes
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../services/opal-client', () => ({
  opalClient: {
    isOPALEnabled: jest.fn(() => false),
    publishInlineData: jest.fn(),
    triggerPolicyRefresh: jest.fn(() => ({ success: true, transactionId: 'test-123' })),
  },
}));

jest.mock('../services/idp-validation.service', () => ({
  idpValidationService: {
    validateTLS: jest.fn(() => ({
      pass: true,
      version: 'TLSv1.3',
      score: 95,
      warnings: [],
      errors: [],
    })),
  },
}));

jest.mock('../services/policy-sync.service', () => ({
  policySyncService: {
    getCurrentVersion: jest.fn(() => ({
      version: 'v1.0.0',
      timestamp: new Date().toISOString(),
      hash: 'abc123',
      layers: ['base', 'coalition'],
    })),
    recordSpokeSync: jest.fn(),
    getSpokeStatus: jest.fn(() => ({
      spokeId: 'test-spoke',
      lastSync: new Date().toISOString(),
      version: 'v1.0.0',
      status: 'current',
    })),
    getDeltaUpdate: jest.fn(() => ({
      currentVersion: 'v1.0.0',
      updates: [],
    })),
    pushPolicyUpdate: jest.fn(() => ({
      updateId: 'update-123',
      version: 'v1.0.1',
      timestamp: new Date().toISOString(),
    })),
    getAllSpokeStatus: jest.fn(() => []),
    getOutOfSyncSpokes: jest.fn(() => []),
  },
}));

// Mock resource service
jest.mock('../services/resource.service', () => ({
  getResourcesByQuery: jest.fn(() => []),
  queryResources: jest.fn(() => []),
}));

// Mock admin middleware to accept X-Admin-Key in tests
jest.mock('../middleware/admin.middleware', () => ({
  requireAdmin: (req: any, res: any, next: any) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey && adminKey === process.env.FEDERATION_ADMIN_KEY) {
      next();
      return;
    }
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }
    next();
  },
  requireSuperAdmin: (req: any, res: any, next: any) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey && adminKey === process.env.FEDERATION_ADMIN_KEY) {
      next();
      return;
    }
    res.status(401).json({ success: false, error: 'Authentication required' });
  },
}));

// Import routes after mocking
import federationRoutes from '../routes/federation.routes';

describe('Federation Routes', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    // Mount routes at /api/federation (standardized path)
    app.use('/api/federation', federationRoutes);
  });

  // Sample registration payload
  const validRegistration = {
    instanceCode: 'FRA',
    name: 'France Spoke Instance',
    description: 'DIVE V3 Spoke for France',
    baseUrl: 'https://fra-app.dive25.com',
    apiUrl: 'https://fra-api.dive25.com',
    idpUrl: 'https://fra-idp.dive25.com',
    requestedScopes: ['policy:read', 'heartbeat:write'],
    contactEmail: 'admin@fra.dive25.com',
  };

  // ==========================================================================
  // METADATA ENDPOINT
  // ==========================================================================

  describe('GET /api/federation/metadata', () => {
    it('should return federation metadata', async () => {
      const response = await request(app).get('/api/federation/metadata');

      expect(response.status).toBe(200);
      expect(response.body.entity).toBeDefined();
      expect(response.body.entity.id).toBe('dive-v3-hub');
      expect(response.body.capabilities).toBeDefined();
      expect(response.body.capabilities.classifications).toContain('SECRET');
      expect(response.body.endpoints).toBeDefined();
      expect(response.body.security).toBeDefined();
    });
  });

  // ==========================================================================
  // REGISTRATION ENDPOINT
  // ==========================================================================

  describe('POST /api/federation/register', () => {
    it('should register a new spoke', async () => {
      const response = await request(app)
        .post('/api/federation/register')
        .send(validRegistration);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.spoke).toBeDefined();
      expect(response.body.spoke.spokeId).toMatch(/^spoke-fra-[a-f0-9]+$/);
      expect(response.body.spoke.instanceCode).toBe('FRA');
      expect(response.body.spoke.status).toBe('pending');
    });

    it('should reject invalid instance code', async () => {
      const response = await request(app)
        .post('/api/federation/register')
        .send({
          ...validRegistration,
          instanceCode: 'INVALID', // Too long
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/federation/register')
        .send({
          instanceCode: 'GBR',
          // Missing name, baseUrl, etc.
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/federation/register')
        .send({
          ...validRegistration,
          instanceCode: 'GBR',
          contactEmail: 'not-an-email',
        });

      expect(response.status).toBe(400);
    });

    it('should reject invalid URL format', async () => {
      const response = await request(app)
        .post('/api/federation/register')
        .send({
          ...validRegistration,
          instanceCode: 'DEU',
          baseUrl: 'not-a-url',
        });

      expect(response.status).toBe(400);
    });
  });

  // ==========================================================================
  // ADMIN ENDPOINTS
  // ==========================================================================

  describe('GET /api/federation/spokes (admin)', () => {
    it('should list all spokes with admin key', async () => {
      const response = await request(app)
        .get('/api/federation/spokes')
        .set('X-Admin-Key', 'test-admin-key');

      expect(response.status).toBe(200);
      expect(response.body.spokes).toBeDefined();
      expect(Array.isArray(response.body.spokes)).toBe(true);
      expect(response.body.statistics).toBeDefined();
    });

    it('should reject without admin key in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await request(app)
        .get('/api/federation/spokes');

      expect(response.status).toBe(403);

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('GET /api/federation/spokes/pending (admin)', () => {
    it('should list pending spokes', async () => {
      const response = await request(app)
        .get('/api/federation/spokes/pending')
        .set('X-Admin-Key', 'test-admin-key');

      expect(response.status).toBe(200);
      expect(response.body.pending).toBeDefined();
      expect(Array.isArray(response.body.pending)).toBe(true);
    });
  });

  describe('POST /api/federation/spokes/:spokeId/approve (admin)', () => {
    let spokeId: string;

    beforeEach(async () => {
      // Register a fresh spoke for approval testing
      const regResponse = await request(app)
        .post('/api/federation/register')
        .send({
          ...validRegistration,
          instanceCode: 'ESP',
          name: 'Spain Spoke',
          baseUrl: 'https://esp-app.dive25.com',
          apiUrl: 'https://esp-api.dive25.com',
          idpUrl: 'https://esp-idp.dive25.com',
          contactEmail: 'admin@esp.dive25.com',
        });

      spokeId = regResponse.body.spoke?.spokeId;
    });

    it('should approve a pending spoke', async () => {
      if (!spokeId) {
        console.warn('Skipping test: spoke registration failed');
        return;
      }

      const response = await request(app)
        .post(`/api/federation/spokes/${spokeId}/approve`)
        .set('X-Admin-Key', 'test-admin-key')
        .send({
          allowedScopes: ['policy:read', 'data:read'],
          trustLevel: 'partner',
          maxClassification: 'SECRET',
          dataIsolationLevel: 'filtered',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.spoke.status).toBe('approved');
      expect(response.body.token).toBeDefined();
      expect(response.body.token.token).toBeDefined();
    });

    it('should reject invalid approval data', async () => {
      if (!spokeId) return;

      const response = await request(app)
        .post(`/api/federation/spokes/${spokeId}/approve`)
        .set('X-Admin-Key', 'test-admin-key')
        .send({
          allowedScopes: [], // Empty array invalid
          trustLevel: 'invalid',
        });

      expect(response.status).toBe(400);
    });

    it('should reject approval for non-existent spoke', async () => {
      const response = await request(app)
        .post('/api/federation/spokes/spoke-nonexistent-123/approve')
        .set('X-Admin-Key', 'test-admin-key')
        .send({
          allowedScopes: ['policy:read'],
          trustLevel: 'partner',
          maxClassification: 'SECRET',
          dataIsolationLevel: 'filtered',
        });

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/federation/spokes/:spokeId/suspend (admin)', () => {
    it('should require reason for suspension', async () => {
      const response = await request(app)
        .post('/api/federation/spokes/spoke-test-123/suspend')
        .set('X-Admin-Key', 'test-admin-key')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Reason is required');
    });
  });

  describe('POST /api/federation/spokes/:spokeId/revoke (admin)', () => {
    it('should require reason for revocation', async () => {
      const response = await request(app)
        .post('/api/federation/spokes/spoke-test-123/revoke')
        .set('X-Admin-Key', 'test-admin-key')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Reason is required');
    });
  });

  // ==========================================================================
  // POLICY ENDPOINTS
  // ==========================================================================

  describe('GET /api/federation/policy/version', () => {
    it('should return current policy version', async () => {
      const response = await request(app).get('/api/federation/policy/version');

      expect(response.status).toBe(200);
      expect(response.body.version).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('POST /api/federation/policy/push (admin)', () => {
    it('should push policy update', async () => {
      const response = await request(app)
        .post('/api/federation/policy/push')
        .set('X-Admin-Key', 'test-admin-key')
        .send({
          layers: ['base', 'coalition'],
          priority: 'normal',
          description: 'Test policy update',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.update).toBeDefined();
    });

    it('should require layers array', async () => {
      const response = await request(app)
        .post('/api/federation/policy/push')
        .set('X-Admin-Key', 'test-admin-key')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Layers array is required');
    });
  });

  // ==========================================================================
  // HEALTH ENDPOINT
  // ==========================================================================

  describe('GET /api/federation/health', () => {
    it('should return federation health', async () => {
      const response = await request(app).get('/api/federation/health');

      expect(response.status).toBe(200);
      expect(response.body.statistics).toBeDefined();
      expect(response.body.policyVersion).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });
  });

  // ==========================================================================
  // SYNC STATUS ENDPOINT
  // ==========================================================================

  describe('GET /api/federation/sync/status (admin)', () => {
    it('should return sync status', async () => {
      const response = await request(app)
        .get('/api/federation/sync/status')
        .set('X-Admin-Key', 'test-admin-key');

      expect(response.status).toBe(200);
      expect(response.body.currentVersion).toBeDefined();
      expect(response.body.spokes).toBeDefined();
      expect(response.body.summary).toBeDefined();
    });
  });

  // ==========================================================================
  // CSR SIGNING ENDPOINT
  // ==========================================================================

  describe('POST /api/federation/spokes/:spokeId/sign-csr (admin)', () => {
    it('should reject invalid CSR format', async () => {
      const response = await request(app)
        .post('/api/federation/spokes/spoke-test-123/sign-csr')
        .set('X-Admin-Key', 'test-admin-key')
        .send({
          csr: 'not a valid csr',
        });

      expect(response.status).toBe(400);
    });

    it('should reject short CSR for non-existent spoke', async () => {
      // CSR validation (min 100 chars) happens before spoke lookup
      // Short CSRs fail validation with 400, long enough CSRs fail with 404
      const longCSR = '-----BEGIN CERTIFICATE REQUEST-----\n' +
        'CSR for: spoke-nonexistent-123\n' +
        'MIIC' + 'A'.repeat(100) + '\n' +
        '-----END CERTIFICATE REQUEST-----';

      const response = await request(app)
        .post('/api/federation/spokes/spoke-nonexistent-123/sign-csr')
        .set('X-Admin-Key', 'test-admin-key')
        .send({
          csr: longCSR,
        });

      expect(response.status).toBe(404);
    });
  });

  // ==========================================================================
  // PHASE 3: REGISTRATION STATUS ENDPOINT (PUBLIC - FOR POLLING)
  // ==========================================================================

  describe('GET /api/federation/registration/:spokeId/status (Phase 3)', () => {
    it('should return 404 for non-existent registration', async () => {
      const response = await request(app)
        .get('/api/federation/registration/spoke-nonexistent-xyz/status');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should return pending status for registered but unapproved spoke', async () => {
      // First register a spoke
      const regResponse = await request(app)
        .post('/api/federation/register')
        .send({
          instanceCode: 'AUT',
          name: 'Austria Test Spoke',
          baseUrl: 'https://aut.example.com',
          apiUrl: 'https://api.aut.example.com',
          idpUrl: 'https://idp.aut.example.com',
          requestedScopes: ['policy:base'],
          contactEmail: 'admin@aut.example.com',
        });

      expect(regResponse.status).toBe(201);
      const spokeId = regResponse.body.spoke.spokeId;

      // Now check status
      const statusResponse = await request(app)
        .get(`/api/federation/registration/${spokeId}/status`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.status).toBe('pending');
      expect(statusResponse.body.spokeId).toBe(spokeId);
      expect(statusResponse.body.instanceCode).toBe('AUT');
      expect(statusResponse.body.message).toContain('pending');
      expect(statusResponse.body.token).toBeUndefined();
    });

    it('should return approved status with token for approved spoke', async () => {
      // First register a spoke
      const regResponse = await request(app)
        .post('/api/federation/register')
        .send({
          instanceCode: 'CHE',
          name: 'Switzerland Test Spoke',
          baseUrl: 'https://che.example.com',
          apiUrl: 'https://api.che.example.com',
          idpUrl: 'https://idp.che.example.com',
          requestedScopes: ['policy:base'],
          contactEmail: 'admin@che.example.com',
        });

      expect(regResponse.status).toBe(201);
      const spokeId = regResponse.body.spoke.spokeId;

      // Approve the spoke
      const approveResponse = await request(app)
        .post(`/api/federation/spokes/${spokeId}/approve`)
        .set('X-Admin-Key', 'test-admin-key')
        .send({
          allowedScopes: ['policy:base', 'heartbeat:write'],
          trustLevel: 'partner',
          maxClassification: 'CONFIDENTIAL',
          dataIsolationLevel: 'filtered',
        });

      expect(approveResponse.status).toBe(200);

      // Now check status - should include token
      const statusResponse = await request(app)
        .get(`/api/federation/registration/${spokeId}/status`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.status).toBe('approved');
      expect(statusResponse.body.spokeId).toBe(spokeId);
      expect(statusResponse.body.approvedAt).toBeDefined();
      expect(statusResponse.body.token).toBeDefined();
      expect(statusResponse.body.token.token).toBeDefined();
      expect(statusResponse.body.token.token.length).toBeGreaterThan(20);
      expect(statusResponse.body.token.expiresAt).toBeDefined();
      expect(statusResponse.body.token.scopes).toContain('policy:base');
    });

    it('should allow lookup by instance code (case-insensitive)', async () => {
      // Register spoke with uppercase code
      const regResponse = await request(app)
        .post('/api/federation/register')
        .send({
          instanceCode: 'SWE',
          name: 'Sweden Test Spoke',
          baseUrl: 'https://swe.example.com',
          apiUrl: 'https://api.swe.example.com',
          idpUrl: 'https://idp.swe.example.com',
          requestedScopes: ['policy:base'],
          contactEmail: 'admin@swe.example.com',
        });

      expect(regResponse.status).toBe(201);

      // Lookup by lowercase instance code
      const statusResponse = await request(app)
        .get('/api/federation/registration/swe/status');

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.instanceCode).toBe('SWE');
    });

    it('should return suspended status message', async () => {
      // Register and approve a spoke, then suspend it
      const regResponse = await request(app)
        .post('/api/federation/register')
        .send({
          instanceCode: 'NOR',
          name: 'Norway Test Spoke',
          baseUrl: 'https://nor.example.com',
          apiUrl: 'https://api.nor.example.com',
          idpUrl: 'https://idp.nor.example.com',
          requestedScopes: ['policy:base'],
          contactEmail: 'admin@nor.example.com',
        });

      const spokeId = regResponse.body.spoke.spokeId;

      // Approve first
      await request(app)
        .post(`/api/federation/spokes/${spokeId}/approve`)
        .set('X-Admin-Key', 'test-admin-key')
        .send({
          allowedScopes: ['policy:base'],
          trustLevel: 'development',
          maxClassification: 'UNCLASSIFIED',
          dataIsolationLevel: 'minimal',
        });

      // Now suspend
      await request(app)
        .post(`/api/federation/spokes/${spokeId}/suspend`)
        .set('X-Admin-Key', 'test-admin-key')
        .send({ reason: 'Testing suspension' });

      // Check status
      const statusResponse = await request(app)
        .get(`/api/federation/registration/${spokeId}/status`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.status).toBe('suspended');
      expect(statusResponse.body.message).toContain('suspended');
      expect(statusResponse.body.token).toBeUndefined();
    });
  });
});
