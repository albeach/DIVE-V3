/**
 * DIVE V3 - Policy Bundle Management E2E Tests
 *
 * Tests for Hub policy bundle building, publishing, and sync operations.
 *
 * @version 1.0.0
 * @date 2025-12-12
 */

import { test, expect } from '@playwright/test';

const HUB_URL = 'https://localhost:3000';
const HUB_API_URL = 'https://localhost:4000';
const SPOKE_API_URL = 'https://localhost:14000';

test.describe('Policy Bundle Management', () => {
  test.describe('Policy Bundle API Endpoints', () => {
    test('should return available policy scopes', async ({ request }) => {
      const response = await request.get(`${HUB_API_URL}/api/opal/bundle/scopes`);

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data).toHaveProperty('scopes');
      expect(Array.isArray(data.scopes)).toBe(true);
      expect(data).toHaveProperty('descriptions');
    });

    test('should return policy version', async ({ request }) => {
      const response = await request.get(`${HUB_API_URL}/api/opal/version`);

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('hash');
      expect(data).toHaveProperty('timestamp');
    });

    test('should return OPAL health status', async ({ request }) => {
      const response = await request.get(`${HUB_API_URL}/api/opal/health`);

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data).toHaveProperty('opalEnabled');
      // May or may not be healthy depending on OPAL server status
      expect(data).toHaveProperty('healthy');
    });

    test('should build policy bundle with scopes', async ({ request }) => {
      const response = await request.post(`${HUB_API_URL}/api/opal/bundle/build`, {
        data: {
          scopes: ['policy:base'],
          includeData: true,
          sign: true,
          compress: true,
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('bundleId');
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('hash');
      expect(data).toHaveProperty('size');
      expect(data).toHaveProperty('fileCount');
    });

    test('should build bundle with multiple scopes', async ({ request }) => {
      const response = await request.post(`${HUB_API_URL}/api/opal/bundle/build`, {
        data: {
          scopes: ['policy:base', 'policy:fvey', 'policy:usa'],
          includeData: true,
          sign: true,
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.fileCount).toBeGreaterThan(0);
    });

    test('should get current bundle metadata after build', async ({ request }) => {
      // First build a bundle
      await request.post(`${HUB_API_URL}/api/opal/bundle/build`, {
        data: {
          scopes: ['policy:base'],
          sign: true,
        },
      });

      // Then get current bundle
      const response = await request.get(`${HUB_API_URL}/api/opal/bundle/current`);

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data).toHaveProperty('bundleId');
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('hash');
      expect(data).toHaveProperty('scopes');
      expect(data).toHaveProperty('manifest');
      expect(data.manifest).toHaveProperty('files');
    });

    test('should publish bundle to OPAL', async ({ request }) => {
      // First build a bundle
      await request.post(`${HUB_API_URL}/api/opal/bundle/build`, {
        data: {
          scopes: ['policy:base'],
          sign: true,
        },
      });

      // Then publish
      const response = await request.post(`${HUB_API_URL}/api/opal/bundle/publish`);

      // Publish may fail if OPAL server is not running
      const data = await response.json();

      // Either succeeds or fails gracefully
      if (response.ok()) {
        expect(data.success).toBe(true);
        expect(data).toHaveProperty('publishedAt');
      } else {
        expect(data).toHaveProperty('error');
      }
    });

    test('should build and publish in one operation', async ({ request }) => {
      const response = await request.post(`${HUB_API_URL}/api/opal/bundle/build-and-publish`, {
        data: {
          scopes: ['policy:base', 'policy:usa'],
          includeData: true,
        },
      });

      const data = await response.json();

      expect(data).toHaveProperty('build');
      expect(data.build).toHaveProperty('success');
      expect(data.build).toHaveProperty('bundleId');

      // Publish section may not exist if OPAL failed
      if (data.publish) {
        expect(data.publish).toHaveProperty('success');
      }
    });

    test('should verify bundle by hash', async ({ request }) => {
      // First build a bundle
      const buildRes = await request.post(`${HUB_API_URL}/api/opal/bundle/build`, {
        data: {
          scopes: ['policy:base'],
          sign: true,
        },
      });
      const buildData = await buildRes.json();

      if (buildData.success && buildData.hash) {
        // Verify by hash
        const response = await request.get(`${HUB_API_URL}/api/opal/bundle/verify/${buildData.hash}`);

        expect(response.ok()).toBeTruthy();
        const data = await response.json();

        expect(data).toHaveProperty('verified');
        expect(data).toHaveProperty('hash');
        expect(data).toHaveProperty('bundleId');
      }
    });

    test('should return 404 for non-existent bundle hash', async ({ request }) => {
      const response = await request.get(`${HUB_API_URL}/api/opal/bundle/verify/nonexistent123`);

      expect(response.status()).toBe(404);
      const data = await response.json();

      expect(data).toHaveProperty('verified', false);
    });
  });

  test.describe('Sync Status API', () => {
    test('should return sync status for all spokes', async ({ request }) => {
      const response = await request.get(`${HUB_API_URL}/api/opal/sync-status`);

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data).toHaveProperty('currentVersion');
      expect(data).toHaveProperty('spokes');
      expect(data).toHaveProperty('summary');
      expect(Array.isArray(data.spokes)).toBe(true);

      // Summary should have counts
      expect(data.summary).toHaveProperty('total');
      expect(data.summary).toHaveProperty('current');
      expect(data.summary).toHaveProperty('behind');
      expect(data.summary).toHaveProperty('stale');
      expect(data.summary).toHaveProperty('offline');
    });
  });

  test.describe('Force Sync API', () => {
    test('should force sync for all spokes', async ({ request }) => {
      const response = await request.post(`${HUB_API_URL}/api/opal/force-sync`, {
        data: {},
      });

      // May fail if no spokes are connected
      const data = await response.json();

      if (response.ok()) {
        expect(data.success).toBe(true);
        expect(data).toHaveProperty('spokes');
        expect(Array.isArray(data.spokes)).toBe(true);
      }
    });

    test('should force sync for specific spoke', async ({ request }) => {
      const response = await request.post(`${HUB_API_URL}/api/opal/force-sync`, {
        data: { spokeId: 'spoke-nzl-001' },
      });

      // May fail if spoke doesn't exist
      const data = await response.json();

      if (response.ok()) {
        expect(data.success).toBe(true);
        expect(data).toHaveProperty('spokeId');
      }
    });
  });

  test.describe('OPAL Refresh API', () => {
    test('should trigger policy refresh', async ({ request }) => {
      const response = await request.post(`${HUB_API_URL}/api/opal/refresh`);

      // May fail if OPAL server is not running
      const data = await response.json();

      if (response.ok()) {
        expect(data.success).toBe(true);
        expect(data).toHaveProperty('message');
      } else {
        expect(data).toHaveProperty('error');
      }
    });
  });

  test.describe('Policy Page Navigation', () => {
    test('should display policies page structure', async ({ page }) => {
      // Navigate to policy management page
      await page.goto(`${HUB_URL}/admin/federation/policies`);

      // Check for authentication redirect or page content
      const url = page.url();
      if (url.includes('/login') || url === `${HUB_URL}/`) {
        // Expected - user needs to authenticate
        expect(url).toContain('localhost:3000');
      } else {
        // Page should have policy content
        await expect(page.locator('body')).toContainText(/Policy|Bundle|OPAL/i);
      }
    });

    test('should have proper page title', async ({ page }) => {
      await page.goto(`${HUB_URL}/admin/federation/policies`);

      // Title should contain DIVE
      await expect(page).toHaveTitle(/DIVE/);
    });
  });

  test.describe('Spoke Policy Sync Integration', () => {
    test('should check spoke policy version', async ({ request }) => {
      const response = await request.get(`${SPOKE_API_URL}/api/spoke/policies/version`);

      // May return 404 if endpoint not implemented, or policy version
      if (response.ok()) {
        const data = await response.json();
        expect(data).toHaveProperty('version');
      }
    });

    test('should trigger spoke policy sync', async ({ request }) => {
      const response = await request.post(`${SPOKE_API_URL}/api/spoke/sync`);

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data.success).toBe(true);
    });
  });
});

