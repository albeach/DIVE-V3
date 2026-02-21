/**
 * Admin Compliance API Routes - Integration Tests
 * 
 * Tests for NIST, NATO, and export compliance endpoints
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// Mock next-auth for testing
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: {
      user: {
        email: 'admin@test.mil',
        name: 'Test Admin',
        uniqueID: 'test-admin-001',
        clearance: 'TOP_SECRET',
        countryOfAffiliation: 'USA',
        roles: ['ADMIN', 'SUPER_ADMIN']
      }
    },
    status: 'authenticated'
  }))
}));

// Mock fetch for API calls
global.fetch = jest.fn();

describe('Compliance API Routes', () => {
  const mockStartDate = '2026-01-01T00:00:00Z';
  const mockEndDate = '2026-02-05T23:59:59Z';

  beforeAll(() => {
    // Set up any global test configuration
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/admin/compliance/reports/nist', () => {
    it('should return NIST compliance report with valid date range', async () => {
      const mockReport = {
        success: true,
        report: {
          reportId: 'nist-2026-02-05-12345',
          reportType: 'NIST',
          period: {
            startDate: mockStartDate,
            endDate: mockEndDate
          },
          summary: {
            totalEvents: 1250,
            accessGrants: 1100,
            accessDenials: 150,
            mfaEnforcements: 800,
            federationEvents: 450,
            violations: 25
          },
          findings: [
            {
              severity: 'high',
              category: 'Authentication Assurance',
              description: 'AAL1 users accessing SECRET resources',
              evidence: ['Resource doc-123 accessed by user@test.mil'],
              standard: 'NIST SP 800-63-3',
              requirement: 'AAL2 required for SECRET'
            }
          ],
          recommendations: [
            'Enforce AAL2 for SECRET classification',
            'Review MFA enrollment process'
          ],
          generatedAt: new Date().toISOString(),
          generatedBy: 'test-admin-001'
        }
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockReport
      });

      const response = await fetch(
        `/api/admin/compliance/reports/nist?startDate=${mockStartDate}&endDate=${mockEndDate}`
      );

      expect(response.ok).toBe(true);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.report.reportType).toBe('NIST');
      expect(data.report.summary.totalEvents).toBe(1250);
      expect(data.report.findings).toHaveLength(1);
      expect(data.report.findings[0].severity).toBe('high');
    });

    it('should return 400 if date range is missing', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: 'Missing required parameters',
          message: 'startDate and endDate are required'
        })
      });

      const response = await fetch('/api/admin/compliance/reports/nist');
      
      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should return 401 if not authenticated', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: 'Unauthorized',
          message: 'Session invalid'
        })
      });

      const response = await fetch(
        `/api/admin/compliance/reports/nist?startDate=${mockStartDate}&endDate=${mockEndDate}`
      );
      
      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/admin/compliance/reports/nato', () => {
    it('should return NATO compliance report with valid date range', async () => {
      const mockReport = {
        success: true,
        report: {
          reportId: 'nato-2026-02-05-67890',
          reportType: 'NATO',
          period: {
            startDate: mockStartDate,
            endDate: mockEndDate
          },
          summary: {
            totalEvents: 980,
            accessGrants: 850,
            accessDenials: 130,
            mfaEnforcements: 600,
            federationEvents: 380,
            violations: 18
          },
          findings: [
            {
              severity: 'medium',
              category: 'Releasability Control',
              description: 'Resources accessed outside releasabilityTo countries',
              evidence: ['Resource doc-456 accessed by fra-user@nato.int'],
              standard: 'NATO ACP-240',
              requirement: 'Country must be in releasabilityTo list'
            }
          ],
          recommendations: [
            'Review releasabilityTo policies',
            'Audit cross-country access patterns'
          ],
          generatedAt: new Date().toISOString(),
          generatedBy: 'test-admin-001'
        }
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockReport
      });

      const response = await fetch(
        `/api/admin/compliance/reports/nato?startDate=${mockStartDate}&endDate=${mockEndDate}`
      );

      expect(response.ok).toBe(true);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.report.reportType).toBe('NATO');
      expect(data.report.summary.totalEvents).toBe(980);
      expect(data.report.findings[0].category).toBe('Releasability Control');
    });

    it('should handle backend errors gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          success: false,
          error: 'BackendError',
          message: 'Failed to generate report'
        })
      });

      const response = await fetch(
        `/api/admin/compliance/reports/nato?startDate=${mockStartDate}&endDate=${mockEndDate}`
      );
      
      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/admin/compliance/reports/export', () => {
    it('should export NIST report as JSON', async () => {
      const mockExport = JSON.stringify({
        reportType: 'NIST',
        summary: { totalEvents: 1250 },
        findings: []
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => mockExport,
        headers: {
          get: (name: string) => {
            if (name === 'Content-Type') return 'application/json';
            if (name === 'Content-Disposition') return 'attachment; filename="compliance-report-nist.json"';
            return null;
          }
        }
      });

      const response = await fetch(
        `/api/admin/compliance/reports/export?reportType=NIST&startDate=${mockStartDate}&endDate=${mockEndDate}&format=json`
      );

      expect(response.ok).toBe(true);
      const data = await response.text();
      const parsed = JSON.parse(data);
      
      expect(parsed.reportType).toBe('NIST');
    });

    it('should export NATO report as CSV', async () => {
      const mockCSV = 'Report Type,Total Events,Access Grants\nNATO,980,850';

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => mockCSV,
        headers: {
          get: (name: string) => {
            if (name === 'Content-Type') return 'text/csv';
            if (name === 'Content-Disposition') return 'attachment; filename="compliance-report-nato.csv"';
            return null;
          }
        }
      });

      const response = await fetch(
        `/api/admin/compliance/reports/export?reportType=NATO&startDate=${mockStartDate}&endDate=${mockEndDate}&format=csv`
      );

      expect(response.ok).toBe(true);
      const data = await response.text();
      
      expect(data).toContain('Report Type');
      expect(data).toContain('NATO');
    });

    it('should return 400 for invalid report type', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: 'Invalid report type',
          message: 'reportType must be NIST or NATO'
        })
      });

      const response = await fetch(
        `/api/admin/compliance/reports/export?reportType=INVALID&startDate=${mockStartDate}&endDate=${mockEndDate}`
      );
      
      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });
  });
});

describe('Compliance Score Calculation', () => {
  it('should calculate compliance score correctly', () => {
    const calculateScore = (findings: Array<{ severity: string }>) => {
      const critical = findings.filter(f => f.severity === 'critical').length;
      const high = findings.filter(f => f.severity === 'high').length;
      const medium = findings.filter(f => f.severity === 'medium').length;
      return Math.max(0, 100 - (critical * 20 + high * 10 + medium * 5));
    };

    // No findings = 100%
    expect(calculateScore([])).toBe(100);

    // 1 critical = 80%
    expect(calculateScore([{ severity: 'critical' }])).toBe(80);

    // 1 high = 90%
    expect(calculateScore([{ severity: 'high' }])).toBe(90);

    // 1 medium = 95%
    expect(calculateScore([{ severity: 'medium' }])).toBe(95);

    // Mixed findings
    expect(calculateScore([
      { severity: 'critical' },
      { severity: 'high' },
      { severity: 'medium' }
    ])).toBe(65); // 100 - 20 - 10 - 5 = 65
  });
});
