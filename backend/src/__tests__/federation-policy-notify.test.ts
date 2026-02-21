/**
 * DIVE V3 - Federation Policy Notification Service Tests
 *
 * Tests for Phase G1 of the Zero Trust federation protocol:
 * - Topic filtering (federation vs non-federation topics)
 * - Aggregate batching of topic changes
 * - Cross-wire notification dispatch to active partners
 * - ECDSA signing of notifications
 * - Non-fatal error handling
 * - SHA256 hash computation for policy data
 * - Audit trail creation
 *
 * @version 1.0.0
 * @date 2026-02-21
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

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

// Mock instance identity service
const mockSignData = jest.fn() as jest.MockedFunction<(data: string) => Promise<string>>;
mockSignData.mockResolvedValue('mock-ecdsa-signature-base64');

const mockGetCertificatePEM = jest.fn() as jest.MockedFunction<() => Promise<string>>;
mockGetCertificatePEM.mockResolvedValue(
  '-----BEGIN CERTIFICATE-----\nMOCKCERT\n-----END CERTIFICATE-----',
);

jest.mock('../services/instance-identity.service', () => ({
  instanceIdentityService: {
    signData: mockSignData,
    getCertificatePEM: mockGetCertificatePEM,
  },
}));

// Mock https-agent
jest.mock('../utils/https-agent', () => ({
  getSecureHttpsAgent: jest.fn(() => ({})),
}));

// Mock https module for partner notification
const mockHttpsRequest = jest.fn();
jest.mock('https', () => ({
  request: mockHttpsRequest,
}));

// Mock trusted-issuer.model (for computeTopicHash)
const mockGetIssuersForOpal = jest.fn() as jest.MockedFunction<
  () => Promise<Record<string, unknown>>
>;
mockGetIssuersForOpal.mockResolvedValue({
  'https://idp.usa.local/realms/dive-v3-broker-usa': {
    tenant: 'USA',
    name: 'USA Hub',
    country: 'US',
    trust_level: 'HIGH',
  },
});

const mockGetFederationMatrix = jest.fn() as jest.MockedFunction<
  () => Promise<Record<string, unknown>>
>;
mockGetFederationMatrix.mockResolvedValue({
  USA: ['GBR', 'FRA'],
  GBR: ['USA'],
});

jest.mock('../models/trusted-issuer.model', () => ({
  mongoOpalDataStore: {
    getIssuersForOpal: mockGetIssuersForOpal,
    getFederationMatrix: mockGetFederationMatrix,
  },
}));

// Mock federation-constraint.model (for computeTopicHash)
const mockGetActiveConstraintsForOPAL = jest.fn() as jest.MockedFunction<
  () => Promise<Record<string, unknown>>
>;
mockGetActiveConstraintsForOPAL.mockResolvedValue({});

jest.mock('../models/federation-constraint.model', () => ({
  FederationConstraint: {
    getActiveConstraintsForOPAL: mockGetActiveConstraintsForOPAL,
  },
}));

// Mock federation-audit.model
const mockAuditCreate = jest.fn() as jest.MockedFunction<(entry: unknown) => Promise<unknown>>;
mockAuditCreate.mockResolvedValue({ _id: 'audit-1' });

jest.mock('../models/federation-audit.model', () => ({
  federationAuditStore: {
    create: mockAuditCreate,
  },
}));

// ============================================
// Import AFTER mocks (TDZ avoidance)
// ============================================

const { federationPolicyNotifyService } = require('../services/federation-policy-notify.service');

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

function mockHttpsSuccess(statusCode = 200, body = '{"acknowledged":true}') {
  const mockRes = {
    statusCode,
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'data') handler(Buffer.from(body));
      if (event === 'end') handler();
      return mockRes;
    }),
  };
  const mockReq = {
    on: jest.fn().mockReturnThis(),
    write: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
  };
  (mockHttpsRequest as jest.Mock<any>).mockImplementation((_opts: unknown, callback: unknown) => {
    (callback as (res: unknown) => void)(mockRes);
    return mockReq;
  });
  return { mockReq, mockRes };
}

function mockHttpsError(errorMessage = 'Connection refused') {
  const mockReq = {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'error') {
        setTimeout(() => handler(new Error(errorMessage)), 0);
      }
      return mockReq;
    }),
    write: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
  };
  (mockHttpsRequest as jest.Mock<any>).mockReturnValue(mockReq);
  return { mockReq };
}

// ============================================
// TESTS
// ============================================

describe('FederationPolicyNotifyService', () => {
  beforeEach(async () => {
    // Wait for any pending dispatch from previous test
    await federationPolicyNotifyService.flush();
    jest.clearAllMocks();
    jest.useFakeTimers();
    federationPolicyNotifyService.shutdown();
    await federationPolicyNotifyService.initialize();
  });

  afterEach(async () => {
    // Fire any pending timers and wait for their dispatch
    jest.runAllTimers();
    jest.useRealTimers();
    await federationPolicyNotifyService.flush();
    federationPolicyNotifyService.shutdown();
  });

  // ========================================
  // queueTopicChange
  // ========================================

  describe('queueTopicChange', () => {
    it('should accept federation-relevant topics', () => {
      federationPolicyNotifyService.queueTopicChange('trusted_issuers');
      const status = federationPolicyNotifyService.getStatus();
      expect(status.pendingTopics).toContain('trusted_issuers');
    });

    it('should accept federation_matrix topic', () => {
      federationPolicyNotifyService.queueTopicChange('federation_matrix');
      const status = federationPolicyNotifyService.getStatus();
      expect(status.pendingTopics).toContain('federation_matrix');
    });

    it('should accept federation_constraints topic', () => {
      federationPolicyNotifyService.queueTopicChange('federation_constraints');
      const status = federationPolicyNotifyService.getStatus();
      expect(status.pendingTopics).toContain('federation_constraints');
    });

    it('should ignore non-federation topics (tenant_configs)', () => {
      federationPolicyNotifyService.queueTopicChange('tenant_configs');
      const status = federationPolicyNotifyService.getStatus();
      expect(status.pendingTopics).not.toContain('tenant_configs');
      expect(status.pendingTopics).toHaveLength(0);
    });

    it('should ignore non-federation topics (kas_registry)', () => {
      federationPolicyNotifyService.queueTopicChange('kas_registry');
      const status = federationPolicyNotifyService.getStatus();
      expect(status.pendingTopics).not.toContain('kas_registry');
    });

    it('should batch multiple topics within the aggregate window', () => {
      federationPolicyNotifyService.queueTopicChange('trusted_issuers');
      federationPolicyNotifyService.queueTopicChange('federation_matrix');
      federationPolicyNotifyService.queueTopicChange('federation_constraints');
      const status = federationPolicyNotifyService.getStatus();
      expect(status.pendingTopics).toHaveLength(3);
    });

    it('should deduplicate same topic queued multiple times', () => {
      federationPolicyNotifyService.queueTopicChange('trusted_issuers');
      federationPolicyNotifyService.queueTopicChange('trusted_issuers');
      federationPolicyNotifyService.queueTopicChange('trusted_issuers');
      const status = federationPolicyNotifyService.getStatus();
      expect(status.pendingTopics).toHaveLength(1);
    });

    it('should not queue when not initialized', () => {
      federationPolicyNotifyService.shutdown();
      federationPolicyNotifyService.queueTopicChange('trusted_issuers');
      const status = federationPolicyNotifyService.getStatus();
      expect(status.pendingTopics).toHaveLength(0);
    });
  });

  // ========================================
  // dispatchNotifications (via timer)
  // ========================================

  describe('dispatchNotifications', () => {
    it('should send notification to all active enrollments after aggregate window', async () => {
      const enrollments = [
        makeActiveEnrollment('GBR', 'https://gbr.local:4000'),
        makeActiveEnrollment('FRA', 'https://fra.local:4000'),
      ];
      mockEnrollmentList.mockResolvedValueOnce(enrollments);
      mockHttpsSuccess();

      federationPolicyNotifyService.queueTopicChange('trusted_issuers');

      // Advance past aggregate window
      jest.advanceTimersByTime(5000);
      await jest.runAllTimersAsync();

      expect(mockEnrollmentList).toHaveBeenCalledWith({ status: 'active' });
      // 2 partners = 2 HTTPS requests
      expect(mockHttpsRequest).toHaveBeenCalledTimes(2);
    });

    it('should not dispatch before aggregate window expires', async () => {
      mockEnrollmentList.mockResolvedValueOnce([
        makeActiveEnrollment('GBR', 'https://gbr.local:4000'),
      ]);

      federationPolicyNotifyService.queueTopicChange('trusted_issuers');

      // Advance only 3 seconds (window is 5s)
      jest.advanceTimersByTime(3000);

      expect(mockHttpsRequest).not.toHaveBeenCalled();
    });

    it('should skip when no active enrollments exist', async () => {
      mockEnrollmentList.mockResolvedValueOnce([]);

      federationPolicyNotifyService.queueTopicChange('trusted_issuers');
      jest.advanceTimersByTime(5000);
      jest.useRealTimers();
      await federationPolicyNotifyService.flush();

      // Enrollment list was queried
      expect(mockEnrollmentList).toHaveBeenCalledWith({ status: 'active' });
    });

    it('should include all changed topics in the notification body', async () => {
      mockEnrollmentList.mockResolvedValueOnce([
        makeActiveEnrollment('GBR', 'https://gbr.local:4000'),
      ]);
      const { mockReq } = mockHttpsSuccess();

      federationPolicyNotifyService.queueTopicChange('trusted_issuers');
      federationPolicyNotifyService.queueTopicChange('federation_matrix');
      jest.advanceTimersByTime(5000);
      jest.useRealTimers();
      await federationPolicyNotifyService.flush();

      // Verify the request body contains both topics
      expect(mockReq.write).toHaveBeenCalled();
      const writtenPayload = (mockReq.write as jest.Mock).mock.calls[0][0] as string;
      const body = JSON.parse(writtenPayload);
      expect(body.changedTopics).toEqual(expect.arrayContaining(['trusted_issuers', 'federation_matrix']));
      expect(body.senderInstanceCode).toBe('USA');
    });

    it('should sign notification with ECDSA', async () => {
      mockEnrollmentList.mockResolvedValueOnce([
        makeActiveEnrollment('GBR', 'https://gbr.local:4000'),
      ]);
      const { mockReq } = mockHttpsSuccess();

      federationPolicyNotifyService.queueTopicChange('trusted_issuers');
      jest.advanceTimersByTime(5000);
      await jest.runAllTimersAsync();

      expect(mockSignData).toHaveBeenCalled();
      expect(mockGetCertificatePEM).toHaveBeenCalled();

      const writtenPayload = (mockReq.write as jest.Mock).mock.calls[0][0] as string;
      const body = JSON.parse(writtenPayload);
      expect(body.signature).toBe('mock-ecdsa-signature-base64');
      expect(body.signerCertPEM).toContain('BEGIN CERTIFICATE');
    });

    it('should include topic hashes in notification', async () => {
      mockEnrollmentList.mockResolvedValueOnce([
        makeActiveEnrollment('GBR', 'https://gbr.local:4000'),
      ]);
      const { mockReq } = mockHttpsSuccess();

      federationPolicyNotifyService.queueTopicChange('trusted_issuers');
      jest.advanceTimersByTime(5000);
      await jest.runAllTimersAsync();

      const writtenPayload = (mockReq.write as jest.Mock).mock.calls[0][0] as string;
      const body = JSON.parse(writtenPayload);
      expect(body.topicHashes).toBeDefined();
      expect(body.topicHashes.trusted_issuers).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should create audit entry after dispatch', async () => {
      mockEnrollmentList.mockResolvedValueOnce([
        makeActiveEnrollment('GBR', 'https://gbr.local:4000'),
      ]);
      mockHttpsSuccess();

      federationPolicyNotifyService.queueTopicChange('trusted_issuers');
      jest.advanceTimersByTime(5000);
      await jest.runAllTimersAsync();

      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'POLICY_SYNC_SENT',
          actorId: 'system',
          actorInstance: 'USA',
        }),
      );
    });

    it('should handle partner unreachable gracefully (non-fatal)', async () => {
      mockEnrollmentList.mockResolvedValueOnce([
        makeActiveEnrollment('GBR', 'https://gbr.local:4000'),
      ]);
      mockHttpsError('Connection refused');

      federationPolicyNotifyService.queueTopicChange('trusted_issuers');
      jest.advanceTimersByTime(5000);
      await jest.runAllTimersAsync();

      // Should not throw — errors are logged but non-fatal
      expect(mockEnrollmentList).toHaveBeenCalled();
    });

    it('should handle enrollment fetch failure gracefully', async () => {
      mockEnrollmentList.mockRejectedValueOnce(new Error('MongoDB down'));

      federationPolicyNotifyService.queueTopicChange('trusted_issuers');
      jest.advanceTimersByTime(5000);
      jest.useRealTimers();
      await federationPolicyNotifyService.flush();

      // Should not throw — enrollment fetch failure is handled gracefully
      expect(mockEnrollmentList).toHaveBeenCalledWith({ status: 'active' });
    });

    it('should skip enrollments without API URL', async () => {
      mockEnrollmentList.mockResolvedValueOnce([
        { ...makeActiveEnrollment('GBR', ''), requesterApiUrl: '' },
      ]);

      federationPolicyNotifyService.queueTopicChange('trusted_issuers');
      jest.advanceTimersByTime(5000);
      await jest.runAllTimersAsync();

      expect(mockHttpsRequest).not.toHaveBeenCalled();
    });

    it('should clear pending topics after dispatch', async () => {
      mockEnrollmentList.mockResolvedValueOnce([]);

      federationPolicyNotifyService.queueTopicChange('trusted_issuers');
      federationPolicyNotifyService.queueTopicChange('federation_matrix');

      jest.advanceTimersByTime(5000);
      await jest.runAllTimersAsync();

      const status = federationPolicyNotifyService.getStatus();
      expect(status.pendingTopics).toHaveLength(0);
    });
  });

  // ========================================
  // computeTopicHash
  // ========================================

  describe('computeTopicHash', () => {
    it('should return SHA256 hex string for trusted_issuers', async () => {
      const hash = await federationPolicyNotifyService.computeTopicHash('trusted_issuers');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should return SHA256 hex string for federation_matrix', async () => {
      const hash = await federationPolicyNotifyService.computeTopicHash('federation_matrix');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should return SHA256 hex string for federation_constraints', async () => {
      const hash = await federationPolicyNotifyService.computeTopicHash('federation_constraints');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should return empty string for unknown topic', async () => {
      const hash = await federationPolicyNotifyService.computeTopicHash('unknown_topic');
      expect(hash).toBe('');
    });

    it('should return consistent hash for same data', async () => {
      const hash1 = await federationPolicyNotifyService.computeTopicHash('trusted_issuers');
      const hash2 = await federationPolicyNotifyService.computeTopicHash('trusted_issuers');
      expect(hash1).toBe(hash2);
    });

    it('should return different hash when data changes', async () => {
      const hash1 = await federationPolicyNotifyService.computeTopicHash('trusted_issuers');

      mockGetIssuersForOpal.mockResolvedValueOnce({
        'https://idp.gbr.local/realms/dive-v3-broker-gbr': {
          tenant: 'GBR',
          name: 'GBR Spoke',
          country: 'GB',
          trust_level: 'HIGH',
        },
      });

      const hash2 = await federationPolicyNotifyService.computeTopicHash('trusted_issuers');
      expect(hash1).not.toBe(hash2);
    });
  });

  // ========================================
  // computeAllHashes
  // ========================================

  describe('computeAllHashes', () => {
    it('should return hashes for all 3 federation topics', async () => {
      const hashes = await federationPolicyNotifyService.computeAllHashes();
      expect(Object.keys(hashes)).toHaveLength(3);
      expect(hashes).toHaveProperty('trusted_issuers');
      expect(hashes).toHaveProperty('federation_matrix');
      expect(hashes).toHaveProperty('federation_constraints');
    });

    it('should return empty string for topics that fail', async () => {
      mockGetIssuersForOpal.mockRejectedValueOnce(new Error('MongoDB down'));
      const hashes = await federationPolicyNotifyService.computeAllHashes();
      expect(hashes.trusted_issuers).toBe('');
      // Other topics should still have valid hashes
      expect(hashes.federation_matrix).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  // ========================================
  // shutdown
  // ========================================

  describe('shutdown', () => {
    it('should clear pending topics', () => {
      federationPolicyNotifyService.queueTopicChange('trusted_issuers');
      federationPolicyNotifyService.shutdown();
      const status = federationPolicyNotifyService.getStatus();
      expect(status.pendingTopics).toHaveLength(0);
    });

    it('should set initialized to false', () => {
      federationPolicyNotifyService.shutdown();
      const status = federationPolicyNotifyService.getStatus();
      expect(status.initialized).toBe(false);
    });

    it('should prevent further queueing', () => {
      federationPolicyNotifyService.shutdown();
      federationPolicyNotifyService.queueTopicChange('trusted_issuers');
      const status = federationPolicyNotifyService.getStatus();
      expect(status.pendingTopics).toHaveLength(0);
    });
  });

  // ========================================
  // getStatus
  // ========================================

  describe('getStatus', () => {
    it('should return initialized state', () => {
      const status = federationPolicyNotifyService.getStatus();
      expect(status.initialized).toBe(true);
    });

    it('should return pending topics', () => {
      federationPolicyNotifyService.queueTopicChange('trusted_issuers');
      federationPolicyNotifyService.queueTopicChange('federation_matrix');
      const status = federationPolicyNotifyService.getStatus();
      expect(status.pendingTopics).toEqual(
        expect.arrayContaining(['trusted_issuers', 'federation_matrix']),
      );
    });
  });
});
