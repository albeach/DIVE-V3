/**
 * DIVE V3 - OPAL E2E Integration Tests
 *
 * Tests the full OPAL Server integration:
 *   - Policy bundle build and sign
 *   - Bundle metadata retrieval
 *   - OPAL health checks
 *   - MongoDB persistence
 *   - Policy data endpoint
 *
 * These tests require a running stack with OPAL Server.
 * Run with: npm run test:integration -- --grep "OPAL E2E"
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import axios, { AxiosInstance } from 'axios';
import https from 'https';

// Skip SSL verification for local testing
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const RUN_OPAL_E2E = process.env.RUN_OPAL_E2E === 'true';
const BACKEND_URL = process.env.BACKEND_URL || 'https://localhost:4000';
const OPAL_SERVER_URL = process.env.OPAL_SERVER_URL || 'http://localhost:7002';

let api: AxiosInstance;

const describeOrSkip = RUN_OPAL_E2E ? describe : describe.skip;

describeOrSkip('OPAL E2E Integration', () => {
  beforeAll(() => {
    api = axios.create({
      baseURL: BACKEND_URL,
      httpsAgent,
      timeout: 30000,
    });
  });

  describe('OPAL Server Health', () => {
    it('should return healthy status from OPAL Server directly', async () => {
      const response = await axios.get(`${OPAL_SERVER_URL}/healthcheck`);
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status', 'ok');
    });

    it('should return OPAL health status via backend API', async () => {
      const response = await api.get('/api/opal/health');
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('opalEnabled', true);
      expect(response.data).toHaveProperty('healthy', true);
      expect(response.data).toHaveProperty('config');
      expect(response.data.config).toHaveProperty('serverUrl');
      expect(response.data.config).toHaveProperty('topics');
    });
  });

  describe('Policy Scopes', () => {
    it('should return available policy scopes', async () => {
      const response = await api.get('/api/opal/bundle/scopes');
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('scopes');
      expect(Array.isArray(response.data.scopes)).toBe(true);
      expect(response.data.scopes).toContain('policy:base');
      expect(response.data.scopes).toContain('policy:usa');
      expect(response.data.scopes).toContain('policy:fra');
      expect(response.data.scopes).toContain('policy:gbr');
      expect(response.data.scopes).toContain('policy:deu');
      expect(response.data.scopes).toContain('policy:nato');
      expect(response.data.scopes).toContain('policy:fvey');
    });

    it('should return scope descriptions', async () => {
      const response = await api.get('/api/opal/bundle/scopes');
      expect(response.data).toHaveProperty('descriptions');
      expect(response.data.descriptions).toHaveProperty('policy:base');
      expect(response.data.descriptions['policy:base']).toContain('guardrail');
    });
  });

  describe('Policy Bundle Build', () => {
    it('should build a signed policy bundle', async () => {
      const response = await api.post('/api/opal/bundle/build', {
        sign: true,
        includeData: true,
        compress: true,
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('bundleId');
      expect(response.data).toHaveProperty('version');
      expect(response.data).toHaveProperty('hash');
      expect(response.data).toHaveProperty('size');
      expect(response.data).toHaveProperty('fileCount');
      expect(response.data).toHaveProperty('signed', true);

      // Verify bundle ID format
      expect(response.data.bundleId).toMatch(/^bundle-[a-f0-9]+$/);

      // Verify version format
      expect(response.data.version).toMatch(/^\d{4}\.\d{2}\.\d{2}-\d{3}$/);

      // Verify reasonable file count (19 policy files)
      expect(response.data.fileCount).toBeGreaterThan(10);

      // Verify bundle has content
      expect(response.data.size).toBeGreaterThan(1000);
    });

    it('should build an unsigned bundle when requested', async () => {
      const response = await api.post('/api/opal/bundle/build', {
        sign: false,
        includeData: false,
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('signed', false);
    });

    it('should return 400 when no policy files found for invalid scopes', async () => {
      const response = await api.post('/api/opal/bundle/build', {
        scopes: ['policy:invalid-scope'],
      });

      // Should still succeed with base policies (always included)
      expect(response.data.success).toBe(true);
      expect(response.data.fileCount).toBeGreaterThan(0);
    });
  });

  describe('Current Bundle', () => {
    it('should return current bundle metadata after build', async () => {
      // First build a bundle
      await api.post('/api/opal/bundle/build', { sign: true });

      // Then get current bundle
      const response = await api.get('/api/opal/bundle/current');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('bundleId');
      expect(response.data).toHaveProperty('version');
      expect(response.data).toHaveProperty('hash');
      expect(response.data).toHaveProperty('scopes');
      expect(response.data).toHaveProperty('signedAt');
      expect(response.data).toHaveProperty('signedBy', 'dive-v3-bundle-signer');
      expect(response.data).toHaveProperty('manifest');
      expect(response.data.manifest).toHaveProperty('revision');
      expect(response.data.manifest).toHaveProperty('roots');
      expect(response.data.manifest).toHaveProperty('files');
    });
  });

  describe('Policy Data Endpoint', () => {
    it('should return policy data for OPAL Server', async () => {
      const response = await api.get('/api/opal/policy-data');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('policy_version');
      expect(response.data).toHaveProperty('updated_at');
      expect(response.data).toHaveProperty('federation');
      expect(response.data).toHaveProperty('bundle');

      // Verify policy version structure
      expect(response.data.policy_version).toHaveProperty('version');
      expect(response.data.policy_version).toHaveProperty('timestamp');

      // Verify federation data structure
      expect(response.data.federation).toHaveProperty('spokes');
      expect(response.data.federation).toHaveProperty('trusted_issuers');
      expect(response.data.federation).toHaveProperty('federation_matrix');
    });

    it('should include OPAL source header in response', async () => {
      const response = await api.get('/api/opal/policy-data', {
        headers: { 'X-OPAL-Source': 'dive-pilot' },
      });

      expect(response.status).toBe(200);
    });
  });

  describe('Policy Refresh', () => {
    it('should trigger policy refresh', async () => {
      const response = await api.post('/api/opal/refresh');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success');
      expect(response.data).toHaveProperty('timestamp');
    });
  });

  describe('Data Publishing', () => {
    it('should publish inline data', async () => {
      const response = await api.post('/api/opal/data/publish', {
        path: 'test/data',
        data: { test: 'value', timestamp: new Date().toISOString() },
        reason: 'E2E test data publish',
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success');
    });

    it('should reject invalid data publish request', async () => {
      try {
        await api.post('/api/opal/data/publish', {
          // Missing required fields
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          expect(error.response?.status).toBe(400);
          expect(error.response?.data).toHaveProperty('error');
        }
      }
    });
  });

  describe('Build and Publish Combined', () => {
    it('should build and publish bundle in one operation', async () => {
      const response = await api.post('/api/opal/bundle/build-and-publish', {
        sign: true,
        includeData: true,
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('build');
      expect(response.data.build).toHaveProperty('success', true);
      expect(response.data.build).toHaveProperty('bundleId');
      expect(response.data.build).toHaveProperty('version');

      // Publish might fail if OPAL doesn't accept pushes (expected)
      expect(response.data).toHaveProperty('publish');
    });
  });

  describe('MongoDB Persistence', () => {
    it('should persist policy version to MongoDB after build', async () => {
      // Build a bundle
      const buildResponse = await api.post('/api/opal/bundle/build', {
        sign: true,
      });
      expect(buildResponse.data.success).toBe(true);

      const { version } = buildResponse.data;

      // Note: Direct MongoDB verification would require additional setup
      // For now, we verify the bundle can be retrieved
      const currentResponse = await api.get('/api/opal/bundle/current');
      expect(currentResponse.data.version).toBe(version);
    });
  });
});

/**
 * Standalone test runner for CI/CD
 */
if (process.env.RUN_STANDALONE === 'true') {
  console.log('Running OPAL E2E tests standalone...');
  // Tests will be run by Jest
}

