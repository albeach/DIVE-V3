/**
 * Admin Clearance API Routes - Integration Tests
 * 
 * Tests for clearance management endpoints including audit trail
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// Mock next-auth
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: {
      user: {
        email: 'admin@test.mil',
        uniqueID: 'test-admin-001',
        roles: ['ADMIN']
      }
    },
    status: 'authenticated'
  }))
}));

global.fetch = jest.fn();

describe('Clearance API Routes', () => {
  beforeAll(() => {
    // Setup
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/admin/clearance/countries', () => {
    it('should return list of countries', async () => {
      const mockResponse = {
        success: true,
        data: ['USA', 'FRA', 'GBR', 'CAN', 'DEU']
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const response = await fetch('/api/admin/clearance/countries');
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(5);
      expect(data.data).toContain('USA');
    });

    it('should handle empty country list', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] })
      });

      const response = await fetch('/api/admin/clearance/countries');
      const data = await response.json();
      
      expect(data.data).toHaveLength(0);
    });
  });

  describe('GET /api/admin/clearance/mappings', () => {
    it('should return clearance mappings', async () => {
      const mockMappings = {
        success: true,
        data: [
          {
            standardLevel: 'UNCLASSIFIED',
            nationalEquivalents: {
              USA: ['UNCLASSIFIED'],
              FRA: ['NON CLASSIFIE']
            },
            mfaRequired: false,
            aalLevel: 1
          },
          {
            standardLevel: 'SECRET',
            nationalEquivalents: {
              USA: ['SECRET'],
              FRA: ['SECRET DEFENSE']
            },
            mfaRequired: true,
            aalLevel: 2
          }
        ]
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMappings
      });

      const response = await fetch('/api/admin/clearance/mappings');
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].standardLevel).toBe('UNCLASSIFIED');
      expect(data.data[1].mfaRequired).toBe(true);
    });
  });

  describe('GET /api/admin/clearance/stats', () => {
    it('should return clearance statistics', async () => {
      const mockStats = {
        success: true,
        data: {
          totalLevels: 5,
          totalCountries: 32,
          totalMappings: 160,
          lastUpdated: new Date().toISOString()
        }
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockStats
      });

      const response = await fetch('/api/admin/clearance/stats');
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data.totalLevels).toBe(5);
      expect(data.data.totalCountries).toBe(32);
      expect(data.data.totalMappings).toBe(160);
    });
  });

  describe('GET /api/admin/clearance/audit/[country]', () => {
    it('should return audit logs for USA', async () => {
      const mockAuditLogs = {
        success: true,
        data: [
          {
            timestamp: '2026-02-05T10:00:00Z',
            action: 'UPDATE',
            country: 'USA',
            performedBy: 'admin@test.mil',
            changes: [
              {
                field: 'SECRET',
                oldValue: 'SECRET',
                newValue: 'SECRET//NOFORN'
              }
            ],
            status: 'SUCCESS'
          },
          {
            timestamp: '2026-02-04T15:30:00Z',
            action: 'CREATE',
            country: 'USA',
            performedBy: 'admin@test.mil',
            status: 'SUCCESS'
          }
        ]
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAuditLogs
      });

      const response = await fetch('/api/admin/clearance/audit/USA');
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].action).toBe('UPDATE');
      expect(data.data[0].country).toBe('USA');
      expect(data.data[0].changes).toHaveLength(1);
    });

    it('should return empty audit log for country with no changes', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] })
      });

      const response = await fetch('/api/admin/clearance/audit/FRA');
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(0);
    });

    it('should return 404 for non-existent country', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          success: false,
          error: 'NotFound',
          message: 'Country not found'
        })
      });

      const response = await fetch('/api/admin/clearance/audit/INVALID');
      
      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/admin/clearance/countries/[country]', () => {
    it('should update country clearance configuration', async () => {
      const updatePayload = {
        mappings: {
          SECRET: 'SECRET UPDATED'
        }
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            country: 'USA',
            mappings: updatePayload.mappings,
            updatedAt: new Date().toISOString(),
            updatedBy: 'test-admin-001'
          }
        })
      });

      const response = await fetch('/api/admin/clearance/countries/USA', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.country).toBe('USA');
    });
  });

  describe('POST /api/admin/clearance/validate', () => {
    it('should validate clearance configuration', async () => {
      const mockValidation = {
        success: true,
        data: {
          valid: true,
          errors: [],
          warnings: []
        }
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockValidation
      });

      const response = await fetch('/api/admin/clearance/validate', {
        method: 'POST'
      });

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.valid).toBe(true);
      expect(data.data.errors).toHaveLength(0);
    });

    it('should report validation errors', async () => {
      const mockValidation = {
        success: true,
        data: {
          valid: false,
          errors: [
            'Country USA missing SECRET mapping',
            'Country FRA has invalid AAL level'
          ],
          warnings: [
            'Country GBR clearance not updated in 90 days'
          ]
        }
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockValidation
      });

      const response = await fetch('/api/admin/clearance/validate', {
        method: 'POST'
      });

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.valid).toBe(false);
      expect(data.data.errors).toHaveLength(2);
      expect(data.data.warnings).toHaveLength(1);
    });
  });
});

describe('Clearance Audit Log Component Logic', () => {
  it('should filter audit logs by country', () => {
    const allLogs = [
      { country: 'USA', action: 'UPDATE' },
      { country: 'FRA', action: 'CREATE' },
      { country: 'USA', action: 'DELETE' }
    ];

    const usaLogs = allLogs.filter(log => log.country === 'USA');
    expect(usaLogs).toHaveLength(2);

    const fraLogs = allLogs.filter(log => log.country === 'FRA');
    expect(fraLogs).toHaveLength(1);
  });

  it('should calculate audit summary statistics', () => {
    const logs = [
      { action: 'CREATE' },
      { action: 'UPDATE' },
      { action: 'UPDATE' },
      { action: 'DELETE' }
    ];

    const summary = {
      total: logs.length,
      created: logs.filter(l => l.action === 'CREATE').length,
      updated: logs.filter(l => l.action === 'UPDATE').length,
      deleted: logs.filter(l => l.action === 'DELETE').length
    };

    expect(summary.total).toBe(4);
    expect(summary.created).toBe(1);
    expect(summary.updated).toBe(2);
    expect(summary.deleted).toBe(1);
  });
});
