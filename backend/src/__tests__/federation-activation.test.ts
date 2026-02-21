/**
 * DIVE V3 - Federation Activation Service Tests
 *
 * Tests for Phase C of the Zero Trust federation protocol:
 * - Local IdP creation from exchanged credentials
 * - Hub-side activation (IdP + trust cascade + enrollment transition)
 * - Spoke-side activation (IdP + local trust cascade)
 *
 * @version 1.0.0
 * @date 2026-02-21
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

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

// Mock keycloak-federation.service
const mockCreateOIDCIdentityProvider = jest.fn() as jest.MockedFunction<
  (config: unknown) => Promise<{ alias: string; displayName: string; protocol: string; enabled: boolean; internalId: string }>
>;
mockCreateOIDCIdentityProvider.mockResolvedValue({
  alias: 'gbr-idp',
  displayName: 'United Kingdom',
  protocol: 'oidc',
  enabled: true,
  internalId: 'mock-internal-id',
});

jest.mock('../services/keycloak-federation.service', () => ({
  keycloakFederationService: {
    createOIDCIdentityProvider: mockCreateOIDCIdentityProvider,
  },
}));

// Mock bidirectional-federation
jest.mock('../services/bidirectional-federation', () => ({
  getInternalKeycloakUrl: jest.fn((instanceCode: string, publicUrl: string) => {
    if (instanceCode === 'USA') return 'https://dive-hub-keycloak:8443';
    return `https://dive-spoke-${instanceCode.toLowerCase()}-keycloak:8443`;
  }),
  getInstanceName: jest.fn((instanceCode: string) => {
    const names: Record<string, string> = {
      USA: 'United States',
      GBR: 'United Kingdom',
      FRA: 'France',
      DEU: 'Germany',
    };
    return names[instanceCode.toUpperCase()] || instanceCode;
  }),
}));

// Mock opal-trust
const mockUpdateOPATrustForSpoke = jest.fn() as jest.MockedFunction<
  (spoke: unknown, action: string) => Promise<void>
>;
mockUpdateOPATrustForSpoke.mockResolvedValue(undefined);

const mockGetCurrentFederationPartners = jest.fn() as jest.MockedFunction<
  (code: string) => Promise<string[]>
>;
mockGetCurrentFederationPartners.mockResolvedValue([]);

jest.mock('../services/opal-trust', () => ({
  updateOPATrustForSpoke: mockUpdateOPATrustForSpoke,
  getCurrentFederationPartners: mockGetCurrentFederationPartners,
}));

// Mock federation-cascade
const mockRegisterSpokeKAS = jest.fn() as jest.MockedFunction<
  (spoke: unknown) => Promise<void>
>;
mockRegisterSpokeKAS.mockResolvedValue(undefined);

const mockUpdateCoiMembershipsForFederation = jest.fn() as jest.MockedFunction<
  (store: unknown) => Promise<void>
>;
mockUpdateCoiMembershipsForFederation.mockResolvedValue(undefined);

const mockGetPortOffsetForCountry = jest.fn() as jest.MockedFunction<
  (code: string) => number
>;
mockGetPortOffsetForCountry.mockReturnValue(0);

const mockMapKASTrustLevel = jest.fn() as jest.MockedFunction<
  (level: string) => string
>;
mockMapKASTrustLevel.mockReturnValue('medium');

jest.mock('../services/federation-cascade', () => ({
  registerSpokeKAS: mockRegisterSpokeKAS,
  updateCoiMembershipsForFederation: mockUpdateCoiMembershipsForFederation,
  getPortOffsetForCountry: mockGetPortOffsetForCountry,
  mapKASTrustLevel: mockMapKASTrustLevel,
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

// Mock enrollment.service
const mockActivate = jest.fn() as jest.MockedFunction<
  (enrollmentId: string) => Promise<unknown>
>;
mockActivate.mockResolvedValue({ enrollmentId: 'test-enrollment', status: 'active' });

jest.mock('../services/enrollment.service', () => ({
  enrollmentService: {
    activate: mockActivate,
    getEnrollment: jest.fn(),
  },
}));

// Mock registry-types
const mockFindByStatus = jest.fn() as jest.MockedFunction<() => Promise<unknown[]>>;
mockFindByStatus.mockResolvedValue([]);

jest.mock('../services/registry-types', () => ({
  createSpokeStore: jest.fn(() => ({
    findByStatus: mockFindByStatus,
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
const mockUpdateTrustedIssuer = jest.fn() as jest.MockedFunction<
  (url: string, issuer: unknown) => Promise<{ success: boolean; transactionId: string }>
>;
mockUpdateTrustedIssuer.mockResolvedValue({ success: true, transactionId: 'tx-1' });

const mockUpdateFederationMatrix = jest.fn() as jest.MockedFunction<
  (tenant: string, partners: string[]) => Promise<{ success: boolean; transactionId: string }>
>;
mockUpdateFederationMatrix.mockResolvedValue({ success: true, transactionId: 'tx-2' });

const mockPublishKasRegistry = jest.fn() as jest.MockedFunction<
  () => Promise<{ success: boolean; transactionId: string }>
>;
mockPublishKasRegistry.mockResolvedValue({ success: true, transactionId: 'tx-3' });

jest.mock('../services/opal-data.service', () => ({
  opalDataService: {
    updateTrustedIssuer: mockUpdateTrustedIssuer,
    updateFederationMatrix: mockUpdateFederationMatrix,
    publishKasRegistry: mockPublishKasRegistry,
  },
}));

// Mock kas-registry.model
const mockKasRegister = jest.fn() as jest.MockedFunction<(instance: unknown) => Promise<unknown>>;
mockKasRegister.mockResolvedValue({ kasId: 'usa-kas', status: 'pending' });

const mockKasApprove = jest.fn() as jest.MockedFunction<(kasId: string) => Promise<unknown>>;
mockKasApprove.mockResolvedValue({ kasId: 'usa-kas', status: 'active' });

const mockKasFindById = jest.fn() as jest.MockedFunction<(kasId: string) => Promise<unknown>>;
mockKasFindById.mockResolvedValue(null);

const mockGetFederationAgreement = jest.fn() as jest.MockedFunction<(code: string) => Promise<unknown>>;
mockGetFederationAgreement.mockResolvedValue(null);

const mockSetFederationAgreement = jest.fn() as jest.MockedFunction<
  (code: string, trusted: string[], maxClass: string, cois: string[]) => Promise<void>
>;
mockSetFederationAgreement.mockResolvedValue(undefined);

jest.mock('../models/kas-registry.model', () => ({
  mongoKasRegistryStore: {
    register: mockKasRegister,
    approve: mockKasApprove,
    findById: mockKasFindById,
    getFederationAgreement: mockGetFederationAgreement,
    setFederationAgreement: mockSetFederationAgreement,
  },
}));

// ============================================
// Test Data
// ============================================

const makeGbrCredentials = () => ({
  oidcClientId: 'dive-v3-broker-usa',
  oidcClientSecret: 'test-secret-gbr-to-usa',
  oidcIssuerUrl: 'https://localhost:8474/realms/dive-v3-broker-gbr',
  oidcDiscoveryUrl: 'https://localhost:8474/realms/dive-v3-broker-gbr/.well-known/openid-configuration',
});

const makeUsaCredentials = () => ({
  oidcClientId: 'dive-v3-broker-gbr',
  oidcClientSecret: 'test-secret-usa-to-gbr',
  oidcIssuerUrl: 'https://idp.usa.dive25.com/realms/dive-v3-broker-usa',
  oidcDiscoveryUrl: 'https://idp.usa.dive25.com/realms/dive-v3-broker-usa/.well-known/openid-configuration',
});

const makeCredentialsExchangedEnrollment = () => ({
  enrollmentId: 'enr_test_activation_001',
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
  status: 'credentials_exchanged' as const,
  statusHistory: [],
  approverCredentials: makeUsaCredentials(),
  requesterCredentials: makeGbrCredentials(),
  createdAt: new Date(),
  updatedAt: new Date(),
  expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
});

// ============================================
// Tests
// ============================================

// Import after mocks (TDZ avoidance)
const { federationActivationService } = require('../services/federation-activation.service');

describe('FederationActivationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateOIDCIdentityProvider.mockResolvedValue({
      alias: 'gbr-idp',
      displayName: 'United Kingdom',
      protocol: 'oidc',
      enabled: true,
      internalId: 'mock-internal-id',
    });
    mockForcePublishAll.mockResolvedValue({ success: true, results: {} });
    mockActivate.mockResolvedValue({ enrollmentId: 'test-enrollment', status: 'active' });
    mockKasFindById.mockResolvedValue(null);
    mockGetCurrentFederationPartners.mockResolvedValue([]);
  });

  // ============================================
  // createLocalIdPFromCredentials
  // ============================================

  describe('createLocalIdPFromCredentials', () => {
    it('should create IdP with correct alias and display name', async () => {
      const credentials = makeGbrCredentials();
      const result = await federationActivationService.createLocalIdPFromCredentials('GBR', credentials);

      expect(result.alias).toBe('gbr-idp');
      expect(mockCreateOIDCIdentityProvider).toHaveBeenCalledTimes(1);

      const config = mockCreateOIDCIdentityProvider.mock.calls[0][0] as Record<string, unknown>;
      expect(config.alias).toBe('gbr-idp');
      expect(config.displayName).toBe('United Kingdom');
      expect(config.instanceCode).toBe('GBR');
      expect(config.protocol).toBe('oidc');
    });

    it('should parse issuerUrl into idpBaseUrl and idpRealm', async () => {
      const credentials = makeGbrCredentials();
      await federationActivationService.createLocalIdPFromCredentials('GBR', credentials);

      const config = mockCreateOIDCIdentityProvider.mock.calls[0][0] as Record<string, unknown>;
      expect(config.idpBaseUrl).toBe('https://localhost:8474');
      expect(config.idpRealm).toBe('dive-v3-broker-gbr');
    });

    it('should use internal Docker URL for backend communication', async () => {
      const credentials = makeGbrCredentials();
      await federationActivationService.createLocalIdPFromCredentials('GBR', credentials);

      const config = mockCreateOIDCIdentityProvider.mock.calls[0][0] as Record<string, unknown>;
      expect(config.idpInternalUrl).toBe('https://dive-spoke-gbr-keycloak:8443');
    });

    it('should pass through client credentials from partner', async () => {
      const credentials = makeGbrCredentials();
      await federationActivationService.createLocalIdPFromCredentials('GBR', credentials);

      const config = mockCreateOIDCIdentityProvider.mock.calls[0][0] as Record<string, unknown>;
      expect(config.clientId).toBe('dive-v3-broker-usa');
      expect(config.clientSecret).toBe('test-secret-gbr-to-usa');
    });

    it('should set syncMode FORCE and enable IdP', async () => {
      const credentials = makeGbrCredentials();
      await federationActivationService.createLocalIdPFromCredentials('GBR', credentials);

      const config = mockCreateOIDCIdentityProvider.mock.calls[0][0] as Record<string, unknown>;
      expect(config.syncMode).toBe('FORCE');
      expect(config.enabled).toBe(true);
      expect(config.storeToken).toBe(true);
    });

    it('should handle case-insensitive instance codes', async () => {
      const credentials = makeGbrCredentials();
      await federationActivationService.createLocalIdPFromCredentials('gbr', credentials);

      const config = mockCreateOIDCIdentityProvider.mock.calls[0][0] as Record<string, unknown>;
      expect(config.alias).toBe('gbr-idp');
      expect(config.instanceCode).toBe('GBR');
    });

    it('should throw on malformed issuer URL', async () => {
      const credentials = { ...makeGbrCredentials(), oidcIssuerUrl: 'not-a-valid-url' };

      await expect(
        federationActivationService.createLocalIdPFromCredentials('GBR', credentials),
      ).rejects.toThrow('Cannot parse issuer URL');
    });
  });

  // ============================================
  // activateHubSide
  // ============================================

  describe('activateHubSide', () => {
    it('should create IdP, run trust cascade, and activate enrollment', async () => {
      const enrollment = makeCredentialsExchangedEnrollment();

      await federationActivationService.activateHubSide(enrollment);

      // IdP created
      expect(mockCreateOIDCIdentityProvider).toHaveBeenCalledTimes(1);
      const config = mockCreateOIDCIdentityProvider.mock.calls[0][0] as Record<string, unknown>;
      expect(config.alias).toBe('gbr-idp');

      // Trust cascade
      expect(mockUpdateOPATrustForSpoke).toHaveBeenCalledTimes(1);
      expect(mockUpdateOPATrustForSpoke.mock.calls[0][1]).toBe('add');
      expect(mockRegisterSpokeKAS).toHaveBeenCalledTimes(1);
      expect(mockUpdateCoiMembershipsForFederation).toHaveBeenCalledTimes(1);

      // OPAL sync
      expect(mockForcePublishAll).toHaveBeenCalledTimes(1);

      // Enrollment activated
      expect(mockActivate).toHaveBeenCalledWith('enr_test_activation_001');
    });

    it('should build spokeProxy with correct fields from enrollment', async () => {
      const enrollment = makeCredentialsExchangedEnrollment();

      await federationActivationService.activateHubSide(enrollment);

      const spokeProxy = mockUpdateOPATrustForSpoke.mock.calls[0][0] as Record<string, unknown>;
      expect(spokeProxy.instanceCode).toBe('GBR');
      expect(spokeProxy.name).toBe('United Kingdom');
      expect(spokeProxy.trustLevel).toBe('partner');
      expect(spokeProxy.idpUrl).toBe('https://localhost:8474/realms/dive-v3-broker-gbr');
      expect(spokeProxy.idpPublicUrl).toBe('https://localhost:8474/realms/dive-v3-broker-gbr');
    });

    it('should throw if enrollment not in credentials_exchanged state', async () => {
      const enrollment = { ...makeCredentialsExchangedEnrollment(), status: 'approved' as const };

      await expect(
        federationActivationService.activateHubSide(enrollment),
      ).rejects.toThrow('Cannot activate');
    });

    it('should throw if requesterCredentials missing', async () => {
      const enrollment = {
        ...makeCredentialsExchangedEnrollment(),
        requesterCredentials: undefined,
      };

      await expect(
        federationActivationService.activateHubSide(enrollment),
      ).rejects.toThrow('requester credentials not available');
    });

    it('should continue if OPA trust update fails', async () => {
      mockUpdateOPATrustForSpoke.mockRejectedValueOnce(new Error('OPAL unreachable'));
      const enrollment = makeCredentialsExchangedEnrollment();

      // Should not throw — OPA trust failure is non-fatal
      await federationActivationService.activateHubSide(enrollment);

      // Other steps still ran
      expect(mockRegisterSpokeKAS).toHaveBeenCalledTimes(1);
      expect(mockActivate).toHaveBeenCalledTimes(1);
    });

    it('should continue if KAS registration fails', async () => {
      mockRegisterSpokeKAS.mockRejectedValueOnce(new Error('KAS store unavailable'));
      const enrollment = makeCredentialsExchangedEnrollment();

      await federationActivationService.activateHubSide(enrollment);

      // OPAL sync and activation still ran
      expect(mockForcePublishAll).toHaveBeenCalledTimes(1);
      expect(mockActivate).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================
  // activateSpokeSide
  // ============================================

  describe('activateSpokeSide', () => {
    it('should create local IdP from hub credentials', async () => {
      const hubCredentials = makeUsaCredentials();
      mockCreateOIDCIdentityProvider.mockResolvedValueOnce({
        alias: 'usa-idp',
        displayName: 'United States',
        protocol: 'oidc',
        enabled: true,
        internalId: 'mock-usa-idp',
      });

      const result = await federationActivationService.activateSpokeSide('USA', hubCredentials);

      expect(result.alias).toBe('usa-idp');
      expect(mockCreateOIDCIdentityProvider).toHaveBeenCalledTimes(1);

      const config = mockCreateOIDCIdentityProvider.mock.calls[0][0] as Record<string, unknown>;
      expect(config.alias).toBe('usa-idp');
      expect(config.clientId).toBe('dive-v3-broker-gbr');
    });

    it('should add partner to local trusted_issuers', async () => {
      const hubCredentials = makeUsaCredentials();
      mockCreateOIDCIdentityProvider.mockResolvedValueOnce({
        alias: 'usa-idp',
        displayName: 'United States',
        protocol: 'oidc',
        enabled: true,
        internalId: 'mock-usa-idp',
      });

      await federationActivationService.activateSpokeSide('USA', hubCredentials);

      expect(mockUpdateTrustedIssuer).toHaveBeenCalledWith(
        'https://idp.usa.dive25.com/realms/dive-v3-broker-usa',
        expect.objectContaining({
          tenant: 'USA',
          country: 'USA',
          enabled: true,
          protocol: 'oidc',
        }),
      );
    });

    it('should update local federation matrix', async () => {
      const hubCredentials = makeUsaCredentials();
      mockCreateOIDCIdentityProvider.mockResolvedValueOnce({
        alias: 'usa-idp',
        displayName: 'United States',
        protocol: 'oidc',
        enabled: true,
        internalId: 'mock-usa-idp',
      });

      await federationActivationService.activateSpokeSide('USA', hubCredentials);

      expect(mockUpdateFederationMatrix).toHaveBeenCalledWith('USA', ['USA']);
    });

    it('should register partner KAS with Hub-aware URL construction', async () => {
      const hubCredentials = makeUsaCredentials();
      mockGetPortOffsetForCountry.mockReturnValue(0);
      mockCreateOIDCIdentityProvider.mockResolvedValueOnce({
        alias: 'usa-idp',
        displayName: 'United States',
        protocol: 'oidc',
        enabled: true,
        internalId: 'mock-usa-idp',
      });

      await federationActivationService.activateSpokeSide('USA', hubCredentials);

      expect(mockKasRegister).toHaveBeenCalledTimes(1);
      const kasRegistration = mockKasRegister.mock.calls[0][0] as Record<string, unknown>;
      expect(kasRegistration.kasId).toBe('usa-kas');
      // Hub uses dive-hub-kas, NOT dive-spoke-usa-kas
      expect(kasRegistration.internalKasUrl).toBe('https://dive-hub-kas:8080');
      expect(kasRegistration.countryCode).toBe('USA');
    });

    it('should force local OPAL sync', async () => {
      const hubCredentials = makeUsaCredentials();
      mockCreateOIDCIdentityProvider.mockResolvedValueOnce({
        alias: 'usa-idp',
        displayName: 'United States',
        protocol: 'oidc',
        enabled: true,
        internalId: 'mock-usa-idp',
      });

      await federationActivationService.activateSpokeSide('USA', hubCredentials);

      expect(mockForcePublishAll).toHaveBeenCalledTimes(1);
    });

    it('should skip KAS registration if partner KAS already exists', async () => {
      const hubCredentials = makeUsaCredentials();
      mockKasFindById.mockResolvedValueOnce({ kasId: 'usa-kas', status: 'active' });
      mockCreateOIDCIdentityProvider.mockResolvedValueOnce({
        alias: 'usa-idp',
        displayName: 'United States',
        protocol: 'oidc',
        enabled: true,
        internalId: 'mock-usa-idp',
      });

      await federationActivationService.activateSpokeSide('USA', hubCredentials);

      expect(mockKasRegister).not.toHaveBeenCalled();
    });
  });
});
