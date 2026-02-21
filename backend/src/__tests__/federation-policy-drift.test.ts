/**
 * DIVE V3 - Federation Policy Drift Detection Tests
 *
 * Tests for Phase G2 of the Zero Trust federation protocol:
 * - On-demand drift detection across federation partners
 * - Local hash computation
 * - Partner summary querying
 * - Unreachable partner handling
 *
 * @version 1.0.0
 * @date 2026-02-21
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.INSTANCE_CODE = 'USA';

// ============================================
// Mock dependencies
// ============================================

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock enrollment model
const mockEnrollmentList = jest.fn() as jest.MockedFunction<
  (filter?: { status?: string }) => Promise<unknown[]>
>;
mockEnrollmentList.mockResolvedValue([]);

jest.mock('../models/enrollment.model', () => ({
  enrollmentStore: {
    list: mockEnrollmentList,
  },
}));

// Mock federation-policy-notify.service (for computeAllHashes)
const mockComputeAllHashes = jest.fn() as jest.MockedFunction<
  () => Promise<Record<string, string>>
>;
mockComputeAllHashes.mockResolvedValue({
  trusted_issuers: 'aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233',
  federation_matrix: 'eeff00112233445566778899aabbccddeeff00112233445566778899aabbccdd',
  federation_constraints: '1122334455667788990011223344556677889900112233445566778899001122',
});

jest.mock('../services/federation-policy-notify.service', () => ({
  federationPolicyNotifyService: {
    computeAllHashes: mockComputeAllHashes,
  },
}));

// Mock https-agent
jest.mock('../utils/https-agent', () => ({
  getSecureHttpsAgent: jest.fn(() => ({})),
}));

// Mock https module for partner querying
const mockHttpsRequest = jest.fn();
jest.mock('https', () => ({
  request: mockHttpsRequest,
}));

// ============================================
// Import AFTER mocks (TDZ avoidance)
// ============================================

const { federationPolicyDriftService } = require('../services/federation-policy-drift.service');

// ============================================
// Test Data
// ============================================

const makeActiveEnrollment = (code: string, apiUrl: string) => ({
  enrollmentId: `enr_${code.toLowerCase()}_001`,
  requesterInstanceCode: code,
  requesterInstanceName: `${code} Instance`,
  requesterApiUrl: apiUrl,
  approverInstanceCode: 'USA',
  status: 'active',
});

// ============================================
// Helper to create mock HTTPS response
// ============================================

function mockHttpsGetSuccess(body: string) {
  const mockRes = {
    statusCode: 200,
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'data') handler(Buffer.from(body));
      if (event === 'end') handler();
      return mockRes;
    }),
  };
  const mockReq = {
    on: jest.fn().mockReturnThis(),
    end: jest.fn(),
    destroy: jest.fn(),
  };
  (mockHttpsRequest as jest.Mock<any>).mockImplementation((_opts: unknown, callback: unknown) => {
    (callback as (res: unknown) => void)(mockRes);
    return mockReq;
  });
  return { mockReq, mockRes };
}

function mockHttpsGetError(errorMessage = 'Connection refused') {
  const mockReq = {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'error') {
        setTimeout(() => handler(new Error(errorMessage)), 0);
      }
      return mockReq;
    }),
    end: jest.fn(),
    destroy: jest.fn(),
  };
  (mockHttpsRequest as jest.Mock<any>).mockReturnValue(mockReq);
  return { mockReq };
}

// ============================================
// TESTS
// ============================================

describe('FederationPolicyDriftService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ========================================
  // detectDrift
  // ========================================

  describe('detectDrift', () => {
    it('should compute local hashes for 3 topics', async () => {
      mockEnrollmentList.mockResolvedValueOnce([]);

      const report = await federationPolicyDriftService.detectDrift();

      expect(mockComputeAllHashes).toHaveBeenCalled();
      expect(report.localHashes).toHaveProperty('trusted_issuers');
      expect(report.localHashes).toHaveProperty('federation_matrix');
      expect(report.localHashes).toHaveProperty('federation_constraints');
    });

    it('should return report with zero partners when no enrollments', async () => {
      mockEnrollmentList.mockResolvedValueOnce([]);

      const report = await federationPolicyDriftService.detectDrift();

      expect(report.totalPartners).toBe(0);
      expect(report.reachablePartners).toBe(0);
      expect(report.hasDrift).toBe(false);
      expect(report.localInstanceCode).toBe('USA');
    });

    it('should query each active partner', async () => {
      const enrollments = [
        makeActiveEnrollment('GBR', 'https://gbr.local:4000'),
        makeActiveEnrollment('FRA', 'https://fra.local:4000'),
      ];
      mockEnrollmentList.mockResolvedValueOnce(enrollments);

      // Both partners return matching hashes
      mockHttpsGetSuccess(
        JSON.stringify({
          instanceCode: 'GBR',
          hashes: {
            trusted_issuers: 'aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233',
            federation_matrix: 'eeff00112233445566778899aabbccddeeff00112233445566778899aabbccdd',
            federation_constraints: '1122334455667788990011223344556677889900112233445566778899001122',
          },
        }),
      );

      const report = await federationPolicyDriftService.detectDrift();

      expect(report.totalPartners).toBe(2);
      expect(mockHttpsRequest).toHaveBeenCalledTimes(2);
    });

    it('should report no drift when all hashes match', async () => {
      mockEnrollmentList.mockResolvedValueOnce([
        makeActiveEnrollment('GBR', 'https://gbr.local:4000'),
      ]);

      mockHttpsGetSuccess(
        JSON.stringify({
          hashes: {
            trusted_issuers: 'aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233',
            federation_matrix: 'eeff00112233445566778899aabbccddeeff00112233445566778899aabbccdd',
            federation_constraints: '1122334455667788990011223344556677889900112233445566778899001122',
          },
        }),
      );

      const report = await federationPolicyDriftService.detectDrift();

      expect(report.hasDrift).toBe(false);
      expect(report.partners[0].drift).toHaveLength(0);
      expect(report.partners[0].reachable).toBe(true);
    });

    it('should report drift when hashes differ', async () => {
      mockEnrollmentList.mockResolvedValueOnce([
        makeActiveEnrollment('GBR', 'https://gbr.local:4000'),
      ]);

      mockHttpsGetSuccess(
        JSON.stringify({
          hashes: {
            trusted_issuers: '0000000000000000000000000000000000000000000000000000000000000000',
            federation_matrix: 'eeff00112233445566778899aabbccddeeff00112233445566778899aabbccdd',
            federation_constraints: '1122334455667788990011223344556677889900112233445566778899001122',
          },
        }),
      );

      const report = await federationPolicyDriftService.detectDrift();

      expect(report.hasDrift).toBe(true);
      expect(report.partners[0].drift).toContain('trusted_issuers');
      expect(report.partners[0].drift).not.toContain('federation_matrix');
    });

    it('should handle unreachable partner gracefully', async () => {
      mockEnrollmentList.mockResolvedValueOnce([
        makeActiveEnrollment('GBR', 'https://gbr.local:4000'),
      ]);

      mockHttpsGetError('Connection refused');

      const report = await federationPolicyDriftService.detectDrift();

      expect(report.totalPartners).toBe(1);
      expect(report.reachablePartners).toBe(0);
      expect(report.partners[0].reachable).toBe(false);
      expect(report.partners[0].error).toBeDefined();
    });

    it('should include response time per partner', async () => {
      mockEnrollmentList.mockResolvedValueOnce([
        makeActiveEnrollment('GBR', 'https://gbr.local:4000'),
      ]);

      mockHttpsGetSuccess(
        JSON.stringify({
          hashes: {
            trusted_issuers: 'aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233',
            federation_matrix: 'eeff00112233445566778899aabbccddeeff00112233445566778899aabbccdd',
            federation_constraints: '1122334455667788990011223344556677889900112233445566778899001122',
          },
        }),
      );

      const report = await federationPolicyDriftService.detectDrift();

      expect(report.partners[0].responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle enrollment fetch failure gracefully', async () => {
      mockEnrollmentList.mockRejectedValueOnce(new Error('MongoDB down'));

      const report = await federationPolicyDriftService.detectDrift();

      expect(report.totalPartners).toBe(0);
      expect(report.hasDrift).toBe(false);
    });

    it('should handle partner without API URL', async () => {
      mockEnrollmentList.mockResolvedValueOnce([
        { ...makeActiveEnrollment('GBR', ''), requesterApiUrl: '' },
      ]);

      const report = await federationPolicyDriftService.detectDrift();

      expect(report.partners[0].reachable).toBe(false);
      expect(report.partners[0].error).toBe('No API URL configured');
    });

    it('should set hasDrift=true when any partner has drift', async () => {
      const enrollments = [
        makeActiveEnrollment('GBR', 'https://gbr.local:4000'),
        makeActiveEnrollment('FRA', 'https://fra.local:4000'),
      ];
      mockEnrollmentList.mockResolvedValueOnce(enrollments);

      // First partner: matching hashes
      // Second partner: different hashes
      let callCount = 0;
      (mockHttpsRequest as jest.Mock<any>).mockImplementation((_opts: unknown, callback: unknown) => {
        callCount++;
        const hashes =
          callCount === 1
            ? {
                trusted_issuers: 'aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233',
                federation_matrix: 'eeff00112233445566778899aabbccddeeff00112233445566778899aabbccdd',
                federation_constraints: '1122334455667788990011223344556677889900112233445566778899001122',
              }
            : {
                trusted_issuers: '0000000000000000000000000000000000000000000000000000000000000000',
                federation_matrix: 'eeff00112233445566778899aabbccddeeff00112233445566778899aabbccdd',
                federation_constraints: '1122334455667788990011223344556677889900112233445566778899001122',
              };

        const mockRes = {
          statusCode: 200,
          on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
            if (event === 'data') handler(Buffer.from(JSON.stringify({ hashes })));
            if (event === 'end') handler();
            return mockRes;
          }),
        };
        (callback as (res: unknown) => void)(mockRes);
        return {
          on: jest.fn().mockReturnThis(),
          end: jest.fn(),
          destroy: jest.fn(),
        };
      });

      const report = await federationPolicyDriftService.detectDrift();

      expect(report.hasDrift).toBe(true);
    });

    it('should include timestamp in report', async () => {
      mockEnrollmentList.mockResolvedValueOnce([]);

      const report = await federationPolicyDriftService.detectDrift();

      expect(report.timestamp).toBeDefined();
      expect(new Date(report.timestamp).getTime()).not.toBeNaN();
    });
  });
});
