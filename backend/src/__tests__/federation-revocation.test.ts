/**
 * DIVE V3 - Federation Revocation Service Tests
 *
 * Tests for Phase E of the Zero Trust federation protocol:
 * - Hub-side revocation cascade (inverse of activation)
 * - Spoke-local revocation (cleanup of local trust artifacts)
 * - Cross-wire partner notification
 * - Non-fatal cascade behavior (partial failures)
 * - deleteFederationClientCore
 *
 * @version 1.0.0
 * @date 2026-02-21
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.INSTANCE_CODE = 'USA';
process.env.KEYCLOAK_REALM = 'dive-v3-broker-usa';

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

// Mock keycloak-federation.service
const mockDeleteIdentityProvider = jest.fn() as jest.MockedFunction<
  (alias: string) => Promise<void>
>;
mockDeleteIdentityProvider.mockResolvedValue(undefined);

const mockDeleteFederationClient = jest.fn() as jest.MockedFunction<
  (clientId: string) => Promise<boolean>
>;
mockDeleteFederationClient.mockResolvedValue(true);

jest.mock('../services/keycloak-federation.service', () => ({
  keycloakFederationService: {
    deleteIdentityProvider: mockDeleteIdentityProvider,
    deleteFederationClient: mockDeleteFederationClient,
  },
}));

// Mock opal-trust
const mockUpdateOPATrustForSpoke = jest.fn() as jest.MockedFunction<
  (spoke: unknown, action: string) => Promise<void>
>;
mockUpdateOPATrustForSpoke.mockResolvedValue(undefined);

jest.mock('../services/opal-trust', () => ({
  updateOPATrustForSpoke: mockUpdateOPATrustForSpoke,
}));

// Mock federation-cascade
const mockRemoveSpokeKAS = jest.fn() as jest.MockedFunction<
  (spoke: unknown) => Promise<void>
>;
mockRemoveSpokeKAS.mockResolvedValue(undefined);

const mockUpdateCoiMembershipsForFederation = jest.fn() as jest.MockedFunction<
  (store: unknown) => Promise<void>
>;
mockUpdateCoiMembershipsForFederation.mockResolvedValue(undefined);

jest.mock('../services/federation-cascade', () => ({
  removeSpokeKAS: mockRemoveSpokeKAS,
  updateCoiMembershipsForFederation: mockUpdateCoiMembershipsForFederation,
}));

// Mock opal-cdc.service
const mockForcePublishAll = jest.fn() as jest.MockedFunction<
  () => Promise<{ success: boolean; results: Record<string, boolean> }>
>;
mockForcePublishAll.mockResolvedValue({ success: true, results: {} });

jest.mock('../services/opal-cdc.service', () => ({
  opalCdcService: {
    forcePublishAll: mockForcePublishAll,
  },
}));

// Mock registry-types
jest.mock('../services/registry-types', () => ({
  createSpokeStore: jest.fn(() => ({
    findByStatus: (jest.fn() as jest.Mock<any>).mockResolvedValue([]),
    findAll: (jest.fn() as jest.Mock<any>).mockResolvedValue([]),
    findById: (jest.fn() as jest.Mock<any>).mockResolvedValue(null),
    findByInstanceCode: (jest.fn() as jest.Mock<any>).mockResolvedValue(null),
    save: (jest.fn() as jest.Mock<any>).mockResolvedValue(undefined),
    delete: (jest.fn() as jest.Mock<any>).mockResolvedValue(true),
    saveToken: (jest.fn() as jest.Mock<any>).mockResolvedValue(undefined),
    findToken: (jest.fn() as jest.Mock<any>).mockResolvedValue(null),
    findAllTokensBySpokeId: (jest.fn() as jest.Mock<any>).mockResolvedValue([]),
    revokeTokensForSpoke: (jest.fn() as jest.Mock<any>).mockResolvedValue(undefined),
  })),
}));

// Mock opal-data.service
const mockRemoveFederationLink = jest.fn() as jest.MockedFunction<
  (a: string, b: string) => Promise<{ success: boolean; transactionId: string }>
>;
mockRemoveFederationLink.mockResolvedValue({ success: true, transactionId: 'tx-remove-1' });

jest.mock('../services/opal-data.service', () => ({
  opalDataService: {
    removeFederationLink: mockRemoveFederationLink,
  },
}));

// Mock kas-registry.model
const mockKasRemove = jest.fn() as jest.MockedFunction<(kasId: string) => Promise<boolean>>;
mockKasRemove.mockResolvedValue(true);

const mockGetFederationAgreement = jest.fn() as jest.MockedFunction<(code: string) => Promise<unknown>>;
mockGetFederationAgreement.mockResolvedValue({
  trustedKAS: ['gbr-kas'],
  maxClassification: 'SECRET',
  allowedCOIs: [],
});

const mockSetFederationAgreement = jest.fn() as jest.MockedFunction<
  (code: string, trusted: string[], maxClass: string, cois: string[]) => Promise<void>
>;
mockSetFederationAgreement.mockResolvedValue(undefined);

jest.mock('../models/kas-registry.model', () => ({
  mongoKasRegistryStore: {
    remove: mockKasRemove,
    getFederationAgreement: mockGetFederationAgreement,
    setFederationAgreement: mockSetFederationAgreement,
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

// ============================================
// Test Data
// ============================================

const makeActiveEnrollment = () => ({
  enrollmentId: 'enr_test_revocation_001',
  requesterInstanceCode: 'GBR',
  requesterInstanceName: 'United Kingdom',
  requesterCertPEM: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
  requesterFingerprint: 'SHA256:test-fingerprint',
  requesterOidcDiscoveryUrl: 'https://localhost:8474/realms/dive-v3-broker-gbr/.well-known/openid-configuration',
  requesterApiUrl: 'https://localhost:4031',
  requesterIdpUrl: 'https://localhost:8474',
  requesterKasUrl: 'https://localhost:10031',
  requesterContactEmail: 'admin@gbr.dive25.com',
  requesterCapabilities: ['oidc-federation', 'data-sharing'],
  requesterTrustLevel: 'partner' as const,
  approverInstanceCode: 'USA',
  approverFingerprint: 'SHA256:hub-fingerprint',
  challengeNonce: 'test-nonce',
  enrollmentSignature: 'test-signature',
  status: 'revoked' as const,
  statusHistory: [
    { status: 'pending_verification', timestamp: new Date(), actor: 'system' },
    { status: 'fingerprint_verified', timestamp: new Date(), actor: 'admin@usa' },
    { status: 'approved', timestamp: new Date(), actor: 'admin@usa' },
    { status: 'credentials_exchanged', timestamp: new Date(), actor: 'system' },
    { status: 'active', timestamp: new Date(), actor: 'system' },
    { status: 'revoked', timestamp: new Date(), actor: 'admin@usa' },
  ],
  approverCredentials: {
    oidcClientId: 'dive-v3-broker-gbr',
    oidcClientSecret: 'test-secret-usa-to-gbr',
    oidcIssuerUrl: 'https://idp.usa.dive25.com/realms/dive-v3-broker-usa',
    oidcDiscoveryUrl: 'https://idp.usa.dive25.com/realms/dive-v3-broker-usa/.well-known/openid-configuration',
  },
  requesterCredentials: {
    oidcClientId: 'dive-v3-broker-usa',
    oidcClientSecret: 'test-secret-gbr-to-usa',
    oidcIssuerUrl: 'https://localhost:8474/realms/dive-v3-broker-gbr',
    oidcDiscoveryUrl: 'https://localhost:8474/realms/dive-v3-broker-gbr/.well-known/openid-configuration',
  },
  _secretsEncrypted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
});

const makeEnrollmentWithoutApiUrl = () => {
  const enrollment = makeActiveEnrollment();
  enrollment.requesterApiUrl = '';
  return enrollment;
};

// ============================================
// Tests
// ============================================

// Import after mocks (TDZ avoidance)
const { federationRevocationService } = require('../services/federation-revocation.service');

describe('FederationRevocationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteIdentityProvider.mockResolvedValue(undefined);
    mockDeleteFederationClient.mockResolvedValue(true);
    mockUpdateOPATrustForSpoke.mockResolvedValue(undefined);
    mockRemoveSpokeKAS.mockResolvedValue(undefined);
    mockUpdateCoiMembershipsForFederation.mockResolvedValue(undefined);
    mockForcePublishAll.mockResolvedValue({ success: true, results: {} });
    mockRemoveFederationLink.mockResolvedValue({ success: true, transactionId: 'tx-1' });
    mockKasRemove.mockResolvedValue(true);

    // Setup https mock for partner notification
    (mockHttpsRequest as jest.Mock<any>).mockImplementation((...args: unknown[]) => {
      const callback = args[1] as (res: unknown) => void;
      const res = {
        statusCode: 200,
        on: jest.fn((event: string, handler: (data?: Buffer) => void) => {
          if (event === 'data') handler(Buffer.from('{"acknowledged":true}'));
          if (event === 'end') handler();
          return res;
        }),
      };
      callback(res);
      return {
        on: jest.fn().mockReturnThis(),
        write: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn(),
      };
    });
  });

  // ============================================
  // revokeHubSide
  // ============================================

  describe('revokeHubSide', () => {
    it('should execute all 7 revocation steps successfully', async () => {
      const enrollment = makeActiveEnrollment();
      const summary = await federationRevocationService.revokeHubSide(enrollment);

      expect(summary.totalSteps).toBe(7);
      expect(summary.successfulSteps).toBe(7);
      expect(summary.failedSteps).toBe(0);
      expect(summary.partnerInstanceCode).toBe('GBR');
      expect(summary.enrollmentId).toBe('enr_test_revocation_001');
    });

    it('should delete the spoke IdP with correct alias', async () => {
      const enrollment = makeActiveEnrollment();
      await federationRevocationService.revokeHubSide(enrollment);

      expect(mockDeleteIdentityProvider).toHaveBeenCalledWith('gbr-idp');
    });

    it('should delete the spoke OIDC client with correct clientId', async () => {
      const enrollment = makeActiveEnrollment();
      await federationRevocationService.revokeHubSide(enrollment);

      expect(mockDeleteFederationClient).toHaveBeenCalledWith('dive-v3-broker-gbr');
    });

    it('should remove OPA trust with action=remove', async () => {
      const enrollment = makeActiveEnrollment();
      await federationRevocationService.revokeHubSide(enrollment);

      expect(mockUpdateOPATrustForSpoke).toHaveBeenCalledWith(
        expect.objectContaining({ instanceCode: 'GBR' }),
        'remove',
      );
    });

    it('should remove KAS registration', async () => {
      const enrollment = makeActiveEnrollment();
      await federationRevocationService.revokeHubSide(enrollment);

      expect(mockRemoveSpokeKAS).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceCode: 'GBR',
          spokeId: 'enr_test_revocation_001',
        }),
      );
    });

    it('should update COI memberships', async () => {
      const enrollment = makeActiveEnrollment();
      await federationRevocationService.revokeHubSide(enrollment);

      expect(mockUpdateCoiMembershipsForFederation).toHaveBeenCalled();
    });

    it('should force OPAL sync', async () => {
      const enrollment = makeActiveEnrollment();
      await federationRevocationService.revokeHubSide(enrollment);

      expect(mockForcePublishAll).toHaveBeenCalled();
    });

    it('should notify partner of revocation', async () => {
      const enrollment = makeActiveEnrollment();
      await federationRevocationService.revokeHubSide(enrollment);

      expect(mockHttpsRequest).toHaveBeenCalled();
    });

    // ============================================
    // Non-fatal cascade behavior
    // ============================================

    it('should continue cascade when IdP deletion fails', async () => {
      mockDeleteIdentityProvider.mockRejectedValueOnce(new Error('Keycloak unavailable'));
      const enrollment = makeActiveEnrollment();
      const summary = await federationRevocationService.revokeHubSide(enrollment);

      expect(summary.failedSteps).toBe(1);
      expect(summary.successfulSteps).toBe(6);
      // OPA trust, KAS, COI, OPAL should still run
      expect(mockUpdateOPATrustForSpoke).toHaveBeenCalled();
      expect(mockRemoveSpokeKAS).toHaveBeenCalled();
      expect(mockForcePublishAll).toHaveBeenCalled();
    });

    it('should continue cascade when OIDC client deletion fails', async () => {
      mockDeleteFederationClient.mockRejectedValueOnce(new Error('Client not found'));
      const enrollment = makeActiveEnrollment();
      const summary = await federationRevocationService.revokeHubSide(enrollment);

      expect(summary.failedSteps).toBe(1);
      expect(summary.steps.find((s: { step: string; success: boolean }) => s.step === 'delete_oidc_client')?.success).toBe(false);
      expect(mockUpdateOPATrustForSpoke).toHaveBeenCalled();
    });

    it('should continue cascade when OPA trust removal fails', async () => {
      mockUpdateOPATrustForSpoke.mockRejectedValueOnce(new Error('OPAL unavailable'));
      const enrollment = makeActiveEnrollment();
      const summary = await federationRevocationService.revokeHubSide(enrollment);

      expect(summary.failedSteps).toBe(1);
      // KAS removal should still execute
      expect(mockRemoveSpokeKAS).toHaveBeenCalled();
    });

    it('should continue cascade when KAS removal fails', async () => {
      mockRemoveSpokeKAS.mockRejectedValueOnce(new Error('KAS not found'));
      const enrollment = makeActiveEnrollment();
      const summary = await federationRevocationService.revokeHubSide(enrollment);

      expect(summary.failedSteps).toBe(1);
      // COI and OPAL should still run
      expect(mockUpdateCoiMembershipsForFederation).toHaveBeenCalled();
      expect(mockForcePublishAll).toHaveBeenCalled();
    });

    it('should succeed even when all cascade steps fail', async () => {
      mockDeleteIdentityProvider.mockRejectedValueOnce(new Error('fail'));
      mockDeleteFederationClient.mockRejectedValueOnce(new Error('fail'));
      mockUpdateOPATrustForSpoke.mockRejectedValueOnce(new Error('fail'));
      mockRemoveSpokeKAS.mockRejectedValueOnce(new Error('fail'));
      mockUpdateCoiMembershipsForFederation.mockRejectedValueOnce(new Error('fail'));
      mockForcePublishAll.mockRejectedValueOnce(new Error('fail'));
      mockHttpsRequest.mockImplementationOnce((_opts: unknown, _cb: unknown) => {
        const req = {
          on: jest.fn((event: string, handler: (err: Error) => void) => {
            if (event === 'error') handler(new Error('Network error'));
            return req;
          }),
          write: jest.fn(),
          end: jest.fn(),
          destroy: jest.fn(),
        };
        return req;
      });

      const enrollment = makeActiveEnrollment();
      const summary = await federationRevocationService.revokeHubSide(enrollment);

      expect(summary.failedSteps).toBe(7);
      expect(summary.successfulSteps).toBe(0);
      // Should still return a summary, not throw
      expect(summary.partnerInstanceCode).toBe('GBR');
    });

    it('should skip partner notification when requesterApiUrl is empty', async () => {
      const enrollment = makeEnrollmentWithoutApiUrl();
      const summary = await federationRevocationService.revokeHubSide(enrollment);

      // Notification step should still succeed (graceful skip)
      const notifyStep = summary.steps.find((s: { step: string }) => s.step === 'notify_partner');
      expect(notifyStep?.success).toBe(true);
    });

    it('should build correct spoke proxy from enrollment', async () => {
      const enrollment = makeActiveEnrollment();
      await federationRevocationService.revokeHubSide(enrollment);

      const spokeProxy = mockUpdateOPATrustForSpoke.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(spokeProxy).toMatchObject({
        spokeId: 'enr_test_revocation_001',
        instanceCode: 'GBR',
        name: 'United Kingdom',
        status: 'revoked',
        trustLevel: 'partner',
      });
    });

    it('should handle uppercase and lowercase instance codes', async () => {
      const enrollment = makeActiveEnrollment();
      enrollment.requesterInstanceCode = 'gbr';
      const summary = await federationRevocationService.revokeHubSide(enrollment);

      expect(mockDeleteIdentityProvider).toHaveBeenCalledWith('gbr-idp');
      expect(summary.partnerInstanceCode).toBe('GBR');
    });
  });

  // ============================================
  // revokeLocalSide
  // ============================================

  describe('revokeLocalSide', () => {
    it('should execute all 4 local revocation steps successfully', async () => {
      const summary = await federationRevocationService.revokeLocalSide('GBR');

      expect(summary.totalSteps).toBe(4);
      expect(summary.successfulSteps).toBe(4);
      expect(summary.failedSteps).toBe(0);
      expect(summary.partnerInstanceCode).toBe('GBR');
    });

    it('should delete partner IdP with correct alias', async () => {
      await federationRevocationService.revokeLocalSide('GBR');
      expect(mockDeleteIdentityProvider).toHaveBeenCalledWith('gbr-idp');
    });

    it('should remove federation link bidirectionally', async () => {
      await federationRevocationService.revokeLocalSide('GBR');
      expect(mockRemoveFederationLink).toHaveBeenCalledWith('USA', 'GBR');
    });

    it('should remove partner KAS', async () => {
      await federationRevocationService.revokeLocalSide('GBR');
      expect(mockKasRemove).toHaveBeenCalledWith('gbr-kas');
    });

    it('should clean local federation agreement', async () => {
      mockGetFederationAgreement.mockResolvedValueOnce({
        trustedKAS: ['gbr-kas', 'fra-kas'],
        maxClassification: 'SECRET',
        allowedCOIs: [],
      });

      await federationRevocationService.revokeLocalSide('GBR');

      expect(mockSetFederationAgreement).toHaveBeenCalledWith(
        'USA',
        ['fra-kas'],
        'SECRET',
        [],
      );
    });

    it('should skip agreement cleanup when partner KAS not in agreement', async () => {
      mockGetFederationAgreement.mockResolvedValueOnce({
        trustedKAS: ['fra-kas'],
        maxClassification: 'SECRET',
        allowedCOIs: [],
      });

      await federationRevocationService.revokeLocalSide('GBR');
      expect(mockSetFederationAgreement).not.toHaveBeenCalled();
    });

    it('should force OPAL sync', async () => {
      await federationRevocationService.revokeLocalSide('GBR');
      expect(mockForcePublishAll).toHaveBeenCalled();
    });

    it('should handle lowercase instance codes', async () => {
      await federationRevocationService.revokeLocalSide('gbr');
      expect(mockDeleteIdentityProvider).toHaveBeenCalledWith('gbr-idp');
      expect(mockKasRemove).toHaveBeenCalledWith('gbr-kas');
    });

    it('should continue when IdP deletion fails', async () => {
      mockDeleteIdentityProvider.mockRejectedValueOnce(new Error('Keycloak down'));
      const summary = await federationRevocationService.revokeLocalSide('GBR');

      expect(summary.failedSteps).toBe(1);
      expect(summary.successfulSteps).toBe(3);
      expect(mockRemoveFederationLink).toHaveBeenCalled();
      expect(mockKasRemove).toHaveBeenCalled();
    });

    it('should continue when trust removal fails', async () => {
      mockRemoveFederationLink.mockRejectedValueOnce(new Error('OPAL down'));
      const summary = await federationRevocationService.revokeLocalSide('GBR');

      expect(summary.failedSteps).toBe(1);
      expect(mockKasRemove).toHaveBeenCalled();
      expect(mockForcePublishAll).toHaveBeenCalled();
    });

    it('should succeed even when all steps fail', async () => {
      mockDeleteIdentityProvider.mockRejectedValueOnce(new Error('fail'));
      mockRemoveFederationLink.mockRejectedValueOnce(new Error('fail'));
      mockKasRemove.mockRejectedValueOnce(new Error('fail'));
      mockForcePublishAll.mockRejectedValueOnce(new Error('fail'));

      const summary = await federationRevocationService.revokeLocalSide('GBR');

      expect(summary.failedSteps).toBe(4);
      expect(summary.successfulSteps).toBe(0);
      expect(summary.partnerInstanceCode).toBe('GBR');
    });
  });

  // ============================================
  // RevocationSummary structure
  // ============================================

  describe('RevocationSummary', () => {
    it('should include step names for hub-side revocation', async () => {
      const enrollment = makeActiveEnrollment();
      const summary = await federationRevocationService.revokeHubSide(enrollment);

      const stepNames = summary.steps.map((s: { step: string }) => s.step);
      expect(stepNames).toContain('delete_idp');
      expect(stepNames).toContain('delete_oidc_client');
      expect(stepNames).toContain('remove_opa_trust');
      expect(stepNames).toContain('remove_kas');
      expect(stepNames).toContain('update_coi');
      expect(stepNames).toContain('opal_sync');
      expect(stepNames).toContain('notify_partner');
    });

    it('should include step names for local-side revocation', async () => {
      const summary = await federationRevocationService.revokeLocalSide('GBR');

      const stepNames = summary.steps.map((s: { step: string }) => s.step);
      expect(stepNames).toContain('delete_idp');
      expect(stepNames).toContain('remove_trust');
      expect(stepNames).toContain('remove_kas');
      expect(stepNames).toContain('opal_sync');
    });

    it('should include error messages for failed steps', async () => {
      mockDeleteIdentityProvider.mockRejectedValueOnce(new Error('Keycloak is down'));
      const enrollment = makeActiveEnrollment();
      const summary = await federationRevocationService.revokeHubSide(enrollment);

      const failedStep = summary.steps.find(
        (s: { step: string; success: boolean }) => s.step === 'delete_idp' && !s.success,
      );
      expect(failedStep).toBeDefined();
      expect(failedStep?.error).toBe('Keycloak is down');
    });
  });
});
