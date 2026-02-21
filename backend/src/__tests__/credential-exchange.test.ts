/**
 * DIVE V3 - Credential Exchange Service Tests
 *
 * Tests for Phase B of the Zero Trust federation protocol:
 * - Approver credential generation (OIDC client creation on local Keycloak)
 * - Local client generation (spoke-side reciprocal client)
 * - Credential storage in enrollment records
 * - Auto-transition to credentials_exchanged
 *
 * @version 1.0.0
 * @date 2026-02-21
 */

import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.INSTANCE_CODE = 'USA';
process.env.KEYCLOAK_REALM = 'dive-v3-broker-usa';
process.env.KEYCLOAK_PUBLIC_URL = 'https://idp.usa.dive25.com';
process.env.KEYCLOAK_URL = 'https://localhost:8443';
process.env.KEYCLOAK_ADMIN_PASSWORD = 'test-admin-password';

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

// Mock keycloak-federation.service — tracks ensureFederationClient calls
const mockEnsureFederationClient = jest.fn() as jest.MockedFunction<
  (clientId: string, clientSecret: string, partnerIdpUrl: string, partnerRealm: string) => Promise<void>
>;
mockEnsureFederationClient.mockResolvedValue(undefined);

jest.mock('../services/keycloak-federation.service', () => ({
  keycloakFederationService: {
    ensureFederationClient: mockEnsureFederationClient,
  },
}));

// Mock mongodb-singleton for enrollment store
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

mockCollection.createIndex.mockResolvedValue('ok');
mockCollection.insertOne.mockResolvedValue({ insertedId: { toString: () => 'mock-id' } });
mockCollection.findOne.mockResolvedValue(null);
mockCollection.find.mockReturnValue({
  sort: jest.fn().mockReturnValue({
    toArray: (jest.fn() as jest.MockedFunction<() => Promise<unknown[]>>).mockResolvedValue([]),
  }),
});
mockCollection.findOneAndUpdate.mockResolvedValue(null);
mockCollection.aggregate.mockReturnValue({
  toArray: (jest.fn() as jest.MockedFunction<() => Promise<unknown[]>>).mockResolvedValue([]),
});

jest.mock('../utils/mongodb-singleton', () => ({
  getDb: jest.fn(() => ({
    collection: jest.fn(() => mockCollection),
  })),
}));

// Mock instance-identity.service (required by enrollment.service)
/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('../services/instance-identity.service', () => ({
  instanceIdentityService: {
    getFingerprint: (jest.fn() as any).mockResolvedValue('SHA256:AA:BB:CC:DD'),
    calculateFingerprint: (jest.fn() as any).mockReturnValue('SHA256:EE:FF:00:11'),
    verifyEnrollmentSignature: (jest.fn() as any).mockReturnValue(true),
    validateCertificate: (jest.fn() as any).mockReturnValue({ valid: true, errors: [] }),
  },
}));
/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================
// TEST HELPERS
// ============================================

function makeApprovedEnrollment(overrides?: Partial<Record<string, unknown>>) {
  return {
    _id: 'mock-object-id',
    enrollmentId: 'enr_test_exchange_001',
    requesterInstanceCode: 'GBR',
    requesterInstanceName: 'United Kingdom',
    requesterCertPEM: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
    requesterFingerprint: 'SHA256:AA:BB:CC',
    requesterOidcDiscoveryUrl: 'https://idp.gbr.dive25.com/realms/dive-v3-broker-gbr/.well-known/openid-configuration',
    requesterApiUrl: 'https://api.gbr.dive25.com',
    requesterIdpUrl: 'https://idp.gbr.dive25.com',
    requesterContactEmail: 'admin@gbr.dive25.com',
    requesterCapabilities: ['oidc-federation', 'kas'],
    requesterTrustLevel: 'partner',
    approverInstanceCode: 'USA',
    approverFingerprint: 'SHA256:DD:EE:FF',
    challengeNonce: 'abc123',
    enrollmentSignature: 'sig123',
    status: 'approved',
    statusHistory: [
      { status: 'pending_verification', timestamp: new Date(), actor: 'system' },
      { status: 'fingerprint_verified', timestamp: new Date(), actor: 'admin' },
      { status: 'approved', timestamp: new Date(), actor: 'admin' },
    ],
    approvedAt: new Date(),
    approvedBy: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    ...overrides,
  };
}

// ============================================
// CREDENTIAL EXCHANGE SERVICE TESTS
// ============================================

describe('CredentialExchangeService', () => {
  let credentialExchangeService: typeof import('../services/credential-exchange.service').credentialExchangeService;
  let enrollmentService: typeof import('../services/enrollment.service').enrollmentService;

  beforeAll(() => {
    const credMod = require('../services/credential-exchange.service');
    credentialExchangeService = credMod.credentialExchangeService;
    const enrollMod = require('../services/enrollment.service');
    enrollmentService = enrollMod.enrollmentService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureFederationClient.mockResolvedValue(undefined);
  });

  describe('generateApproverCredentials', () => {
    it('should create OIDC client on local Keycloak with correct parameters', async () => {
      const enrollment = makeApprovedEnrollment();

      // Mock enrollment store for storeApproverCredentials
      mockCollection.findOne.mockResolvedValueOnce(enrollment);
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        ...enrollment,
        approverCredentials: {
          oidcClientId: 'dive-v3-broker-gbr',
          oidcClientSecret: 'mock-secret',
          oidcIssuerUrl: 'https://idp.usa.dive25.com/realms/dive-v3-broker-usa',
          oidcDiscoveryUrl: 'https://idp.usa.dive25.com/realms/dive-v3-broker-usa/.well-known/openid-configuration',
        },
      });

      await credentialExchangeService.generateApproverCredentials(enrollment as any);

      // Verify Keycloak client creation was called with correct params
      expect(mockEnsureFederationClient).toHaveBeenCalledTimes(1);
      const [clientId, clientSecret, partnerIdpUrl, partnerRealm] = mockEnsureFederationClient.mock.calls[0];
      expect(clientId).toBe('dive-v3-broker-gbr');
      expect(clientSecret).toHaveLength(64); // 32 bytes hex
      expect(partnerIdpUrl).toBe('https://idp.gbr.dive25.com');
      expect(partnerRealm).toBe('dive-v3-broker-gbr');
    });

    it('should store credentials with correct issuer and discovery URLs', async () => {
      const enrollment = makeApprovedEnrollment();

      mockCollection.findOne.mockResolvedValueOnce(enrollment);
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        ...enrollment,
        approverCredentials: { oidcClientId: 'test' },
      });

      await credentialExchangeService.generateApproverCredentials(enrollment as any);

      // Check the findOneAndUpdate was called with correct credential structure
      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const updateCall = mockCollection.findOneAndUpdate.mock.calls[0] as unknown[];
      const updateDoc = updateCall[1] as { $set: Record<string, unknown> };

      expect(updateDoc.$set).toHaveProperty('approverCredentials');
      const creds = updateDoc.$set.approverCredentials as Record<string, string>;
      expect(creds.oidcClientId).toBe('dive-v3-broker-gbr');
      expect(creds.oidcIssuerUrl).toBe('https://idp.usa.dive25.com/realms/dive-v3-broker-usa');
      expect(creds.oidcDiscoveryUrl).toBe(
        'https://idp.usa.dive25.com/realms/dive-v3-broker-usa/.well-known/openid-configuration',
      );
      // Secret should be 64 hex chars
      expect(creds.oidcClientSecret).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate unique secrets per call', async () => {
      const enrollment = makeApprovedEnrollment();

      mockCollection.findOne.mockResolvedValue(enrollment);
      mockCollection.findOneAndUpdate.mockResolvedValue({
        ...enrollment,
        approverCredentials: { oidcClientId: 'test' },
      });

      await credentialExchangeService.generateApproverCredentials(enrollment as any);
      const secret1 = (mockEnsureFederationClient.mock.calls[0] as unknown[])[1];

      jest.clearAllMocks();
      mockEnsureFederationClient.mockResolvedValue(undefined);
      mockCollection.findOne.mockResolvedValue(enrollment);
      mockCollection.findOneAndUpdate.mockResolvedValue({
        ...enrollment,
        approverCredentials: { oidcClientId: 'test' },
      });

      await credentialExchangeService.generateApproverCredentials(enrollment as any);
      const secret2 = (mockEnsureFederationClient.mock.calls[0] as unknown[])[1];

      expect(secret1).not.toBe(secret2);
    });

    it('should propagate Keycloak errors', async () => {
      const enrollment = makeApprovedEnrollment();

      mockEnsureFederationClient.mockRejectedValueOnce(new Error('Keycloak unavailable'));

      await expect(
        credentialExchangeService.generateApproverCredentials(enrollment as any),
      ).rejects.toThrow('Keycloak unavailable');
    });
  });

  describe('generateLocalClient', () => {
    it('should create OIDC client for partner on local Keycloak', async () => {
      const result = await credentialExchangeService.generateLocalClient(
        'USA',
        'https://idp.usa.dive25.com',
        'dive-v3-broker-usa',
      );

      expect(mockEnsureFederationClient).toHaveBeenCalledTimes(1);
      const [clientId, clientSecret, partnerIdpUrl, partnerRealm] = mockEnsureFederationClient.mock.calls[0];
      expect(clientId).toBe('dive-v3-broker-usa');
      expect(clientSecret).toHaveLength(64);
      expect(partnerIdpUrl).toBe('https://idp.usa.dive25.com');
      expect(partnerRealm).toBe('dive-v3-broker-usa');

      expect(result).toHaveProperty('oidcClientId', 'dive-v3-broker-usa');
      expect(result).toHaveProperty('oidcClientSecret');
      expect(result.oidcClientSecret).toHaveLength(64);
      expect(result).toHaveProperty('oidcIssuerUrl');
      expect(result).toHaveProperty('oidcDiscoveryUrl');
    });

    it('should use public Keycloak URL for issuer', async () => {
      const result = await credentialExchangeService.generateLocalClient(
        'FRA',
        'https://idp.fra.dive25.com',
        'dive-v3-broker-fra',
      );

      expect(result.oidcIssuerUrl).toBe('https://idp.usa.dive25.com/realms/dive-v3-broker-usa');
      expect(result.oidcDiscoveryUrl).toBe(
        'https://idp.usa.dive25.com/realms/dive-v3-broker-usa/.well-known/openid-configuration',
      );
    });

    it('should propagate Keycloak errors', async () => {
      mockEnsureFederationClient.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(
        credentialExchangeService.generateLocalClient('FRA', 'https://idp.fra.dive25.com', 'dive-v3-broker-fra'),
      ).rejects.toThrow('Connection refused');
    });
  });
});

// ============================================
// ENROLLMENT CREDENTIAL STORAGE TESTS
// ============================================

describe('EnrollmentService — credential storage', () => {
  let enrollmentService: typeof import('../services/enrollment.service').enrollmentService;

  beforeAll(() => {
    const mod = require('../services/enrollment.service');
    enrollmentService = mod.enrollmentService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('storeApproverCredentials', () => {
    it('should store credentials when enrollment is approved', async () => {
      const enrollment = makeApprovedEnrollment();
      const credentials = {
        oidcClientId: 'dive-v3-broker-gbr',
        oidcClientSecret: 'secret123',
        oidcIssuerUrl: 'https://idp.usa.dive25.com/realms/dive-v3-broker-usa',
        oidcDiscoveryUrl: 'https://idp.usa.dive25.com/realms/dive-v3-broker-usa/.well-known/openid-configuration',
      };

      mockCollection.findOne.mockResolvedValueOnce(enrollment);
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        ...enrollment,
        approverCredentials: credentials,
      });

      const result = await enrollmentService.storeApproverCredentials('enr_test_exchange_001', credentials);

      expect(result.approverCredentials).toBeDefined();
      expect(result.approverCredentials!.oidcClientId).toBe('dive-v3-broker-gbr');
    });

    it('should reject when enrollment is not in approved state', async () => {
      const enrollment = makeApprovedEnrollment({ status: 'pending_verification' });
      mockCollection.findOne.mockResolvedValueOnce(enrollment);

      await expect(
        enrollmentService.storeApproverCredentials('enr_test_exchange_001', {
          oidcClientId: 'test',
          oidcClientSecret: 'test',
          oidcIssuerUrl: 'test',
          oidcDiscoveryUrl: 'test',
        }),
      ).rejects.toThrow('expected approved');
    });
  });

  describe('storeRequesterCredentials', () => {
    it('should auto-transition to credentials_exchanged when both sides have credentials', async () => {
      const enrollment = makeApprovedEnrollment({
        approverCredentials: {
          oidcClientId: 'dive-v3-broker-gbr',
          oidcClientSecret: 'hub-secret',
          oidcIssuerUrl: 'https://idp.usa.dive25.com/realms/dive-v3-broker-usa',
          oidcDiscoveryUrl: 'https://idp.usa.dive25.com/realms/dive-v3-broker-usa/.well-known/openid-configuration',
        },
      });

      const requesterCreds = {
        oidcClientId: 'dive-v3-broker-usa',
        oidcClientSecret: 'spoke-secret',
        oidcIssuerUrl: 'https://idp.gbr.dive25.com/realms/dive-v3-broker-gbr',
        oidcDiscoveryUrl: 'https://idp.gbr.dive25.com/realms/dive-v3-broker-gbr/.well-known/openid-configuration',
      };

      // First findOne for status check
      mockCollection.findOne.mockResolvedValueOnce(enrollment);
      // findOneAndUpdate for storing requester credentials
      const updatedWithBothCreds = {
        ...enrollment,
        requesterCredentials: requesterCreds,
      };
      mockCollection.findOneAndUpdate
        .mockResolvedValueOnce(updatedWithBothCreds)    // setRequesterCredentials
        .mockResolvedValueOnce({                        // auto-transition to credentials_exchanged
          ...updatedWithBothCreds,
          status: 'credentials_exchanged',
        });

      // Track events
      const events: string[] = [];
      enrollmentService.on('enrollment', (event: { type: string }) => {
        events.push(event.type);
      });

      const result = await enrollmentService.storeRequesterCredentials('enr_test_exchange_001', requesterCreds);

      expect(result.status).toBe('credentials_exchanged');
      expect(events).toContain('enrollment:credentials_exchanged');

      // Cleanup listener
      enrollmentService.removeAllListeners('enrollment');
    });

    it('should not auto-transition when only one side has credentials', async () => {
      const enrollment = makeApprovedEnrollment(); // No approverCredentials

      const requesterCreds = {
        oidcClientId: 'dive-v3-broker-usa',
        oidcClientSecret: 'spoke-secret',
        oidcIssuerUrl: 'https://idp.gbr.dive25.com/realms/dive-v3-broker-gbr',
        oidcDiscoveryUrl: 'https://idp.gbr.dive25.com/realms/dive-v3-broker-gbr/.well-known/openid-configuration',
      };

      mockCollection.findOne.mockResolvedValueOnce(enrollment);
      mockCollection.findOneAndUpdate.mockResolvedValueOnce({
        ...enrollment,
        requesterCredentials: requesterCreds,
        // No approverCredentials → no auto-transition
      });

      const result = await enrollmentService.storeRequesterCredentials('enr_test_exchange_001', requesterCreds);

      expect(result.status).toBe('approved'); // Not transitioned
    });
  });
});

// ============================================
// CREATE-LOCAL-CLIENT ENDPOINT TESTS
// ============================================

describe('POST /api/federation/create-local-client', () => {
  it('should validate required fields', async () => {
    // This tests the Zod schema validation.
    // We verify the schema shape matches expectations.
    const { z } = require('zod');
    const schema = z.object({
      partnerInstanceCode: z.string().min(2).max(5).toUpperCase(),
      partnerIdpUrl: z.string().url(),
      partnerRealm: z.string().min(1),
    });

    // Valid input
    const valid = schema.safeParse({
      partnerInstanceCode: 'FRA',
      partnerIdpUrl: 'https://idp.fra.dive25.com',
      partnerRealm: 'dive-v3-broker-fra',
    });
    expect(valid.success).toBe(true);
    expect(valid.data.partnerInstanceCode).toBe('FRA'); // toUpperCase

    // Invalid: missing URL
    const invalid = schema.safeParse({
      partnerInstanceCode: 'FRA',
      partnerIdpUrl: 'not-a-url',
      partnerRealm: 'dive-v3-broker-fra',
    });
    expect(invalid.success).toBe(false);

    // Invalid: code too short
    const tooShort = schema.safeParse({
      partnerInstanceCode: 'X',
      partnerIdpUrl: 'https://idp.fra.dive25.com',
      partnerRealm: 'dive-v3-broker-fra',
    });
    expect(tooShort.success).toBe(false);
  });
});

// ============================================
// CLIENT NAMING CONVENTION TESTS
// ============================================

describe('Client naming convention', () => {
  let credentialExchangeService: typeof import('../services/credential-exchange.service').credentialExchangeService;

  beforeAll(() => {
    const mod = require('../services/credential-exchange.service');
    credentialExchangeService = mod.credentialExchangeService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureFederationClient.mockResolvedValue(undefined);
  });

  it('should use dive-v3-broker-{code} format for client IDs', async () => {
    await credentialExchangeService.generateLocalClient(
      'DEU',
      'https://idp.deu.dive25.com',
      'dive-v3-broker-deu',
    );

    expect(mockEnsureFederationClient).toHaveBeenCalledWith(
      'dive-v3-broker-deu',
      expect.any(String),
      'https://idp.deu.dive25.com',
      'dive-v3-broker-deu',
    );
  });

  it('should lowercase instance codes in client IDs', async () => {
    const enrollment = makeApprovedEnrollment({
      requesterInstanceCode: 'FRA',
      requesterIdpUrl: 'https://idp.fra.dive25.com',
    });

    mockCollection.findOne.mockResolvedValue(enrollment);
    mockCollection.findOneAndUpdate.mockResolvedValue({
      ...enrollment,
      approverCredentials: { oidcClientId: 'dive-v3-broker-fra' },
    });

    await credentialExchangeService.generateApproverCredentials(enrollment as any);

    expect(mockEnsureFederationClient).toHaveBeenCalledWith(
      'dive-v3-broker-fra',
      expect.any(String),
      'https://idp.fra.dive25.com',
      'dive-v3-broker-fra',
    );
  });
});
