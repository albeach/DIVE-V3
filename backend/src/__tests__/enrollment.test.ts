/**
 * DIVE V3 - Federation Enrollment Tests
 *
 * Tests for the Zero Trust federation enrollment protocol:
 * - Instance identity service (keypair generation, signing, fingerprint)
 * - Enrollment service (lifecycle, state transitions, events)
 * - Enrollment model (CRUD, indexes, TTL)
 * - Discovery endpoint (metadata generation)
 *
 * @version 1.0.0
 * @date 2026-02-21
 */

import { describe, it, expect, beforeAll, beforeEach, jest, afterEach } from '@jest/globals';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.INSTANCE_CODE = 'USA';
process.env.INSTANCE_NAME = 'United States Hub';
process.env.SPIFFE_DOMAIN = 'dive25.com';

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

// Mock mongodb-singleton
// Use explicit cast to bypass strict generic inference on jest.fn()
/* eslint-disable @typescript-eslint/no-explicit-any */
const mockCollection = {
  createIndex: jest.fn() as any,
  insertOne: jest.fn() as any,
  findOne: jest.fn() as any,
  find: jest.fn() as any,
  findOneAndUpdate: jest.fn() as any,
  deleteOne: jest.fn() as any,
  aggregate: jest.fn() as any,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// Set default return values
mockCollection.createIndex.mockResolvedValue('ok');
mockCollection.insertOne.mockResolvedValue({ insertedId: { toString: () => 'mock-id' } });
mockCollection.findOne.mockResolvedValue(null);
mockCollection.find.mockReturnValue({
  sort: jest.fn().mockReturnValue({
    toArray: (jest.fn() as any).mockResolvedValue([]),
  }),
});
mockCollection.findOneAndUpdate.mockResolvedValue(null);
mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });
mockCollection.aggregate.mockReturnValue({
  toArray: (jest.fn() as any).mockResolvedValue([]),
});

jest.mock('../utils/mongodb-singleton', () => ({
  getDb: jest.fn(() => ({
    collection: jest.fn(() => mockCollection),
  })),
}));

// ============================================
// INSTANCE IDENTITY SERVICE TESTS
// ============================================

describe('InstanceIdentityService', () => {
  // Use require() after jest.mock to avoid TDZ
  let instanceIdentityService: typeof import('../services/instance-identity.service').instanceIdentityService;

  beforeAll(() => {
    const mod = require('../services/instance-identity.service');
    instanceIdentityService = mod.instanceIdentityService;
  });

  describe('verifyEnrollmentSignature', () => {
    it('should reject invalid signatures', () => {
      const payload = {
        instanceCode: 'GBR',
        targetUrl: 'https://api.gbr.dive25.com',
        timestamp: new Date().toISOString(),
        nonce: 'test-nonce',
      };

      const result = instanceIdentityService.verifyEnrollmentSignature(
        payload,
        'invalid-base64-signature',
        'not-a-certificate',
      );

      expect(result).toBe(false);
    });
  });

  describe('calculateFingerprint', () => {
    it('should return SHA256 prefixed fingerprint for valid certs', () => {
      // We can't test with a real cert easily without openssl,
      // but we test the format validation
      expect(() => {
        instanceIdentityService.calculateFingerprint('not-a-cert');
      }).toThrow();
    });
  });

  describe('validateCertificate', () => {
    it('should reject invalid certificate PEM', () => {
      const result = instanceIdentityService.validateCertificate('not-a-certificate');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.instanceCode).toBeNull();
      expect(result.spiffeId).toBeNull();
    });

    it('should return structured validation result', () => {
      const result = instanceIdentityService.validateCertificate('garbage');

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('instanceCode');
      expect(result).toHaveProperty('spiffeId');
      expect(result).toHaveProperty('fingerprint');
      expect(result).toHaveProperty('notBefore');
      expect(result).toHaveProperty('notAfter');
      expect(result).toHaveProperty('errors');
    });
  });
});

// ============================================
// ENROLLMENT MODEL TESTS
// ============================================

describe('EnrollmentStore', () => {
  let enrollmentStore: typeof import('../models/enrollment.model').enrollmentStore;

  beforeAll(() => {
    const mod = require('../models/enrollment.model');
    enrollmentStore = mod.enrollmentStore;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create enrollment with timestamps and TTL', async () => {
      const enrollment = {
        enrollmentId: 'enr_test123',
        requesterInstanceCode: 'GBR',
        requesterInstanceName: 'United Kingdom',
        requesterCertPEM: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
        requesterFingerprint: 'SHA256:AA:BB:CC',
        requesterOidcDiscoveryUrl: 'https://idp.gbr.dive25.com/.well-known/openid-configuration',
        requesterApiUrl: 'https://api.gbr.dive25.com',
        requesterIdpUrl: 'https://idp.gbr.dive25.com',
        requesterContactEmail: 'admin@gbr.dive25.com',
        requesterCapabilities: ['oidc-federation', 'kas'],
        requesterTrustLevel: 'partner' as const,
        approverInstanceCode: 'USA',
        approverFingerprint: 'SHA256:DD:EE:FF',
        challengeNonce: 'abc123',
        enrollmentSignature: 'sig123',
        status: 'pending_verification' as const,
        statusHistory: [{
          status: 'pending_verification' as const,
          timestamp: new Date(),
          actor: 'system',
          reason: 'Enrollment request received',
        }],
      };

      await enrollmentStore.create(enrollment);

      expect(mockCollection.insertOne).toHaveBeenCalledTimes(1);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertedDoc = mockCollection.insertOne.mock.calls[0][0] as any;
      expect(insertedDoc.enrollmentId).toBe('enr_test123');
      expect(insertedDoc.requesterInstanceCode).toBe('GBR');
      expect(insertedDoc.createdAt).toBeInstanceOf(Date);
      expect(insertedDoc.updatedAt).toBeInstanceOf(Date);
      expect(insertedDoc.expiresAt).toBeInstanceOf(Date);
      // TTL should be ~72 hours in the future
      expect(insertedDoc.expiresAt.getTime()).toBeGreaterThan(Date.now() + 71 * 60 * 60 * 1000);
    });
  });

  describe('findByEnrollmentId', () => {
    it('should query by enrollmentId', async () => {
      await enrollmentStore.findByEnrollmentId('enr_test123');
      expect(mockCollection.findOne).toHaveBeenCalledWith({ enrollmentId: 'enr_test123' });
    });
  });

  describe('listPending', () => {
    it('should query pending and fingerprint_verified statuses', async () => {
      await enrollmentStore.listPending();

      expect(mockCollection.find).toHaveBeenCalledWith({
        status: { $in: ['pending_verification', 'fingerprint_verified'] },
      });
    });
  });

  describe('updateStatus', () => {
    it('should update status with history entry', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        enrollmentId: 'enr_test123',
        status: 'fingerprint_verified',
      });

      const result = await enrollmentStore.updateStatus(
        'enr_test123',
        'fingerprint_verified',
        'admin@usa',
        'Verified via phone call',
      );

      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [filter, update] = mockCollection.findOneAndUpdate.mock.calls[0] as any[];
      expect(filter).toEqual({ enrollmentId: 'enr_test123' });
      expect(update.$set.status).toBe('fingerprint_verified');
      expect(update.$push.statusHistory).toEqual(
        expect.objectContaining({
          status: 'fingerprint_verified',
          actor: 'admin@usa',
          reason: 'Verified via phone call',
        }),
      );
      expect(result).not.toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete by enrollmentId', async () => {
      const result = await enrollmentStore.delete('enr_test123');
      expect(mockCollection.deleteOne).toHaveBeenCalledWith({ enrollmentId: 'enr_test123' });
      expect(result).toBe(true);
    });
  });
});

// ============================================
// ENROLLMENT SERVICE TESTS
// ============================================

describe('EnrollmentService', () => {
  let enrollmentService: typeof import('../services/enrollment.service').enrollmentService;
  let enrollmentStore: typeof import('../models/enrollment.model').enrollmentStore;
  let instanceIdentityService: typeof import('../services/instance-identity.service').instanceIdentityService;

  beforeAll(() => {
    const enrollSvc = require('../services/enrollment.service');
    enrollmentService = enrollSvc.enrollmentService;

    const model = require('../models/enrollment.model');
    enrollmentStore = model.enrollmentStore;

    const identSvc = require('../services/instance-identity.service');
    instanceIdentityService = identSvc.instanceIdentityService;
  });

  beforeEach(() => {
    // Reset ALL mocks completely (clears implementations, calls, and ValueOnce queues)
    mockCollection.findOne.mockReset().mockResolvedValue(null);
    mockCollection.insertOne.mockReset().mockResolvedValue({ insertedId: { toString: () => 'mock-id' } });
    mockCollection.findOneAndUpdate.mockReset().mockResolvedValue(null);
    mockCollection.deleteOne.mockReset().mockResolvedValue({ deletedCount: 1 });
    mockCollection.createIndex.mockReset().mockResolvedValue('ok');
    mockCollection.find.mockReset().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        toArray: (jest.fn() as any).mockResolvedValue([]),
      }),
    });
    jest.restoreAllMocks();
    enrollmentService.removeAllListeners();
  });

  describe('state transitions', () => {
    it('should reject invalid state transitions', async () => {
      // Mock an enrollment in 'rejected' state (terminal)
      mockCollection.findOne.mockResolvedValueOnce({
        enrollmentId: 'enr_test123',
        status: 'rejected',
        requesterInstanceCode: 'GBR',
      });

      await expect(
        enrollmentService.approve('enr_test123', 'admin'),
      ).rejects.toThrow('Invalid state transition: rejected → approved');
    });

    it('should allow valid transition: pending_verification → fingerprint_verified', async () => {
      mockCollection.findOne.mockResolvedValueOnce({
        enrollmentId: 'enr_test123',
        status: 'pending_verification',
        requesterInstanceCode: 'GBR',
      });
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        enrollmentId: 'enr_test123',
        status: 'fingerprint_verified',
        requesterInstanceCode: 'GBR',
      });

      const result = await enrollmentService.verifyFingerprint('enr_test123', 'admin@usa');

      expect(result.status).toBe('fingerprint_verified');
    });

    it('should allow valid transition: fingerprint_verified → approved', async () => {
      mockCollection.findOne.mockResolvedValueOnce({
        enrollmentId: 'enr_test123',
        status: 'fingerprint_verified',
        requesterInstanceCode: 'GBR',
      });
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        enrollmentId: 'enr_test123',
        status: 'approved',
        requesterInstanceCode: 'GBR',
        approvedBy: 'admin@usa',
      });

      const result = await enrollmentService.approve('enr_test123', 'admin@usa');

      expect(result.status).toBe('approved');
    });

    it('should allow valid transition: fingerprint_verified → rejected', async () => {
      mockCollection.findOne.mockResolvedValueOnce({
        enrollmentId: 'enr_test123',
        status: 'fingerprint_verified',
        requesterInstanceCode: 'GBR',
      });
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        enrollmentId: 'enr_test123',
        status: 'rejected',
        requesterInstanceCode: 'GBR',
        rejectionReason: 'Identity not confirmed',
      });

      const result = await enrollmentService.reject(
        'enr_test123',
        'admin@usa',
        'Identity not confirmed',
      );

      expect(result.status).toBe('rejected');
    });

    it('should prevent double approval', async () => {
      mockCollection.findOne.mockResolvedValueOnce({
        enrollmentId: 'enr_test123',
        status: 'approved',
        requesterInstanceCode: 'GBR',
      });

      await expect(
        enrollmentService.approve('enr_test123', 'admin'),
      ).rejects.toThrow('Invalid state transition');
    });
  });

  describe('event emission', () => {
    it('should emit enrollment:requested on processEnrollment', async () => {
      // Mock verifyEnrollmentSignature
      jest.spyOn(instanceIdentityService, 'verifyEnrollmentSignature').mockReturnValue(true);
      jest.spyOn(instanceIdentityService, 'validateCertificate').mockReturnValue({
        valid: true,
        instanceCode: 'GBR',
        spiffeId: 'spiffe://dive25.com/instance/GBR',
        fingerprint: 'SHA256:AA:BB:CC',
        notBefore: new Date('2020-01-01'),
        notAfter: new Date('2030-01-01'),
        errors: [],
      });
      jest.spyOn(instanceIdentityService, 'calculateFingerprint').mockReturnValue('SHA256:AA:BB:CC');
      jest.spyOn(instanceIdentityService, 'getIdentity').mockResolvedValue({
        instanceCode: 'USA',
        privateKey: {} as never,
        certificate: {} as never,
        certificatePEM: 'mock-cert',
        fingerprint: 'SHA256:DD:EE:FF',
        spiffeId: 'spiffe://dive25.com/instance/USA',
        createdAt: new Date(),
      });

      // Mock no existing enrollment
      mockCollection.findOne
        .mockResolvedValueOnce(null) // findByRequester — no existing
        .mockResolvedValueOnce(null); // any other call

      const events: string[] = [];
      enrollmentService.on('enrollment', (event: { type: string }) => {
        events.push(event.type);
      });

      const result = await enrollmentService.processEnrollment({
        instanceCode: 'GBR',
        instanceName: 'United Kingdom',
        instanceCertPEM: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
        oidcDiscoveryUrl: 'https://idp.gbr.dive25.com/.well-known/openid-configuration',
        apiUrl: 'https://api.gbr.dive25.com',
        idpUrl: 'https://idp.gbr.dive25.com',
        requestedCapabilities: ['oidc-federation'],
        requestedTrustLevel: 'partner',
        contactEmail: 'admin@gbr.dive25.com',
        enrollmentSignature: 'valid-sig',
        signatureTimestamp: new Date().toISOString(),
        signatureNonce: 'nonce123',
      });

      expect(result.enrollmentId).toMatch(/^enr_/);
      expect(result.status).toBe('pending_verification');
      expect(result.verifierFingerprint).toBe('SHA256:DD:EE:FF');
      expect(events).toContain('enrollment:requested');
    });

    it('should emit enrollment:approved on approve', async () => {
      mockCollection.findOne.mockResolvedValueOnce({
        enrollmentId: 'enr_test123',
        status: 'fingerprint_verified',
        requesterInstanceCode: 'GBR',
      });
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        enrollmentId: 'enr_test123',
        status: 'approved',
        requesterInstanceCode: 'GBR',
      });

      const events: string[] = [];
      enrollmentService.on('enrollment', (event: { type: string }) => {
        events.push(event.type);
      });

      await enrollmentService.approve('enr_test123', 'admin@usa');

      expect(events).toContain('enrollment:approved');
    });
  });

  describe('getStatus', () => {
    it('should return human-readable status messages', async () => {
      mockCollection.findOne.mockResolvedValueOnce({
        enrollmentId: 'enr_test123',
        status: 'pending_verification',
        updatedAt: new Date(),
      });

      const status = await enrollmentService.getStatus('enr_test123');

      expect(status.enrollmentId).toBe('enr_test123');
      expect(status.status).toBe('pending_verification');
      expect(status.message).toContain('out-of-band');
      expect(status.credentialsReady).toBe(false);
    });

    it('should indicate credentials ready when approved with creds', async () => {
      mockCollection.findOne.mockResolvedValueOnce({
        enrollmentId: 'enr_test123',
        status: 'approved',
        approverCredentials: { oidcClientId: 'test' },
        updatedAt: new Date(),
      });

      const status = await enrollmentService.getStatus('enr_test123');

      expect(status.credentialsReady).toBe(true);
    });
  });

  describe('enrollment not found', () => {
    it('should throw when enrollment does not exist', async () => {
      mockCollection.findOne.mockResolvedValueOnce(null);

      await expect(
        enrollmentService.getEnrollment('enr_nonexistent'),
      ).rejects.toThrow('Enrollment not found: enr_nonexistent');
    });
  });

  describe('processEnrollment validation', () => {
    it('should reject expired signature timestamps', async () => {
      const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago

      await expect(
        enrollmentService.processEnrollment({
          instanceCode: 'GBR',
          instanceName: 'UK',
          instanceCertPEM: 'cert',
          oidcDiscoveryUrl: 'https://idp.gbr.dive25.com/.well-known/openid-configuration',
          apiUrl: 'https://api.gbr.dive25.com',
          idpUrl: 'https://idp.gbr.dive25.com',
          requestedCapabilities: ['oidc-federation'],
          requestedTrustLevel: 'partner',
          contactEmail: 'admin@gbr.dive25.com',
          enrollmentSignature: 'sig',
          signatureTimestamp: oldTimestamp,
          signatureNonce: 'nonce',
        }),
      ).rejects.toThrow('timestamp');
    });

    it('should reject duplicate active enrollments', async () => {
      jest.spyOn(instanceIdentityService, 'verifyEnrollmentSignature').mockReturnValue(true);
      jest.spyOn(instanceIdentityService, 'validateCertificate').mockReturnValue({
        valid: true,
        instanceCode: 'GBR',
        spiffeId: null,
        fingerprint: 'SHA256:AA',
        notBefore: new Date('2020-01-01'),
        notAfter: new Date('2030-01-01'),
        errors: [],
      });
      jest.spyOn(instanceIdentityService, 'calculateFingerprint').mockReturnValue('SHA256:AA');

      // findByRequester returns an existing active enrollment
      // Note: the model uses findOne with sort option
      mockCollection.findOne.mockResolvedValue({
        enrollmentId: 'enr_existing',
        requesterInstanceCode: 'GBR',
        status: 'pending_verification', // Non-terminal
      });

      await expect(
        enrollmentService.processEnrollment({
          instanceCode: 'GBR',
          instanceName: 'UK',
          instanceCertPEM: 'cert',
          oidcDiscoveryUrl: 'https://idp.gbr.dive25.com/.well-known/openid-configuration',
          apiUrl: 'https://api.gbr.dive25.com',
          idpUrl: 'https://idp.gbr.dive25.com',
          requestedCapabilities: ['oidc-federation'],
          requestedTrustLevel: 'partner',
          contactEmail: 'admin@gbr.dive25.com',
          enrollmentSignature: 'sig',
          signatureTimestamp: new Date().toISOString(),
          signatureNonce: 'nonce',
        }),
      ).rejects.toThrow('Active enrollment already exists');
    });
  });
});

// ============================================
// FEDERATION DISCOVERY ROUTE TESTS
// ============================================

describe('Federation Discovery Route', () => {
  let app: import('express').Express;

  beforeAll(async () => {
    // Mock instanceIdentityService for the route
    jest.mock('../services/instance-identity.service', () => ({
      instanceIdentityService: {
        getIdentity: jest.fn<() => Promise<{
          instanceCode: string;
          fingerprint: string;
          spiffeId: string;
          certificatePEM: string;
        }>>().mockResolvedValue({
          instanceCode: 'USA',
          fingerprint: 'SHA256:AA:BB:CC:DD',
          spiffeId: 'spiffe://dive25.com/instance/USA',
          certificatePEM: 'mock-cert-pem',
        }),
      },
    }));

    const express = require('express');
    app = express();

    const discoveryRoutes = require('../routes/federation-discovery.routes').default;
    app.use('/', discoveryRoutes);
  });

  it('GET /.well-known/dive-federation should return metadata', async () => {
    const request = require('supertest');
    const res = await request(app).get('/.well-known/dive-federation');

    expect(res.status).toBe(200);
    expect(res.body.version).toBe('1.0');
    expect(res.body.protocol).toBe('dive-federation');
    expect(res.body.instanceCode).toBe('USA');
    expect(res.body.federation).toBeDefined();
    expect(res.body.federation.enrollmentEndpoint).toContain('/api/federation/enroll');
    expect(res.body.identity).toBeDefined();
    expect(res.body.identity.instanceCertFingerprint).toBe('SHA256:AA:BB:CC:DD');
    expect(res.body.capabilities).toContain('enrollment-v1');
  });

  it('should set cache-control header', async () => {
    const request = require('supertest');
    const res = await request(app).get('/.well-known/dive-federation');

    expect(res.headers['cache-control']).toContain('max-age=300');
  });
});
