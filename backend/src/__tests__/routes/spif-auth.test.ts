/**
 * SPIF Routes - Authentication & Authorization Tests
 *
 * Verifies that raw SPIF data endpoint is protected by JWT auth + admin role checks.
 */

import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express, { Express } from 'express';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.FEDERATION_ADMIN_KEY = 'test-admin-key';

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../services/spif-parser.service', () => ({
  getSPIFMarkingRules: jest.fn(),
  generateMarking: jest.fn(),
  getCountryName: jest.fn(),
  getClassificationLevel: jest.fn(),
  isValidClassification: jest.fn(),
  getValidCountryCodes: jest.fn(),
  expandMembership: jest.fn(),
  getRawSPIFData: jest.fn(async () => ({
    policyName: 'NATO Security Classification Framework',
    policyId: 'nato-spif-v3',
    version: '3.0.0',
    creationDate: '2026-02-20T00:00:00.000Z',
    classifications: new Map([['SECRET', { hierarchy: 3 }]]),
    categorySets: new Map([
      ['RELEASABILITY', {
        displayName: 'Releasability',
        tags: [
          {
            id: 'NATO',
            categories: new Map([['countries', ['USA', 'GBR', 'FRA']]]),
          },
        ],
      }],
    ]),
    memberships: new Map([['NATO', ['USA', 'GBR', 'FRA']]]),
  })),
}));

const mockAuthenticateJWT = jest.fn((req: any, res: any, next: () => void) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.replace('Bearer ', '');
  if (token === 'admin-token') {
    req.user = { roles: ['admin'] };
  } else if (token === 'user-token') {
    req.user = { roles: ['user'] };
  }

  next();
});

const mockRequireAdmin = jest.fn((req: any, res: any, next: () => void) => {
  const roles = req.user?.roles || [];
  if (roles.includes('admin') || roles.includes('super_admin')) {
    next();
    return;
  }
  res.status(403).json({ error: 'Forbidden' });
});

jest.mock('../../middleware/authz.middleware', () => ({
  authenticateJWT: mockAuthenticateJWT,
}));

jest.mock('../../middleware/admin.middleware', () => ({
  requireAdmin: mockRequireAdmin,
}));

import spifRoutes from '../../routes/spif.routes';

describe('SPIF Routes - Authentication & Authorization', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/spif', spifRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/spif/raw', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/spif/raw');

      expect(response.status).toBe(401);
      expect(mockAuthenticateJWT).toHaveBeenCalled();
      expect(mockRequireAdmin).not.toHaveBeenCalled();
    });

    it('should return 403 with non-admin token', async () => {
      const response = await request(app)
        .get('/api/spif/raw')
        .set('Authorization', 'Bearer user-token');

      expect(response.status).toBe(403);
      expect(mockAuthenticateJWT).toHaveBeenCalled();
      expect(mockRequireAdmin).toHaveBeenCalled();
    });

    it('should return 200 with admin token', async () => {
      const response = await request(app)
        .get('/api/spif/raw')
        .set('Authorization', 'Bearer admin-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.policyName).toBe('NATO Security Classification Framework');
      expect(mockAuthenticateJWT).toHaveBeenCalled();
      expect(mockRequireAdmin).toHaveBeenCalled();
    });
  });
});
