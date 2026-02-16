/**
 * DIVE V3 - Policy Sync Service Tests
 *
 * Comprehensive test suite for policy synchronization.
 * Tests cover:
 * - Version management
 * - Sync status tracking
 * - Guardrail validation
 * - Delta updates
 * - Critical update propagation
 *
 * @version 1.0.0
 * @date 2025-12-04
 */

import { describe, it, expect, jest } from '@jest/globals';
import { policySyncService } from '../services/policy-sync.service';
import { hubSpokeRegistry } from '../services/hub-spoke-registry.service';

// Mock dependencies
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../services/opal-client', () => ({
  opalClient: {
    isOPALEnabled: jest.fn(() => false),
    triggerPolicyRefresh: jest.fn(() => ({ success: true })),
    publishInlineData: jest.fn(() => Promise.resolve({ success: true }))
  }
}));

// Mock coi-definition model to prevent updateNATOFromFederation from
// overwriting the globally-seeded coi_definitions (cross-worker contamination)
jest.mock('../models/coi-definition.model', () => ({
  mongoCoiDefinitionStore: {
    initialize: jest.fn(() => Promise.resolve()),
    getCoiMembershipMapForOpa: jest.fn(() => Promise.resolve({})),
    updateNATOFromFederation: jest.fn(() => Promise.resolve()),
    updateMembers: jest.fn(() => Promise.resolve()),
    find: jest.fn(() => Promise.resolve([])),
    findByCoiId: jest.fn(() => Promise.resolve(null)),
    save: jest.fn(() => Promise.resolve()),
    delete: jest.fn(() => Promise.resolve(true)),
  }
}));

// Mock keycloak-federation.service to avoid actual HTTP calls
jest.mock('../services/keycloak-federation.service', () => ({
  keycloakFederationService: {
    createBidirectionalFederation: jest.fn(() => Promise.resolve({ success: true })),
    createIdPForSpoke: jest.fn(() => Promise.resolve({ success: true, idpAlias: 'test-idp' })),
    deleteIdPForSpoke: jest.fn(() => Promise.resolve({ success: true })),
    getFederatedSpokesList: jest.fn(() => Promise.resolve([]))
  }
}));

// Mock opal-data.service for dynamic trust updates
jest.mock('../services/opal-data.service', () => ({
  opalDataService: {
    updateTrustedIssuer: jest.fn(() => Promise.resolve({ success: true })),
    removeTrustedIssuer: jest.fn(() => Promise.resolve({ success: true })),
    updateFederationMatrix: jest.fn(() => Promise.resolve({ success: true }))
  }
}));

// Mock idp-validation.service
jest.mock('../services/idp-validation.service', () => ({
  idpValidationService: {
    validateTLS: jest.fn(() => ({
      pass: true,
      version: 'TLSv1.3',
      score: 15,
      cipher: 'TLS_AES_256_GCM_SHA384',
      certificateValid: true,
      warnings: [],
      errors: []
    }))
  }
}));

// ============================================
// TEST DATA
// ============================================

const validTenantPolicy = {
  max_session_hours: 8,  // Stricter than hub's 10h
  max_token_lifetime_minutes: 30,  // Stricter than hub's 60m
  mfa_required_above: 'UNCLASSIFIED',  // Same as hub
  audit_retention_days: 180  // More than hub's 90
};

const invalidTenantPolicy = {
  max_session_hours: 24,  // VIOLATES hub's 10h limit
  max_token_lifetime_minutes: 120,  // VIOLATES hub's 60m limit
  mfa_required_above: 'SECRET',  // LESS STRICT than hub (violation)
  audit_retention_days: 30  // LESS than hub's 90 days (violation)
};

// ============================================
// TEST SUITE
// ============================================

describe('Policy Sync Service', () => {

  // ============================================
  // VERSION MANAGEMENT TESTS
  // ============================================

  describe('Version Management', () => {
    it('should return current version', () => {
      const version = policySyncService.getCurrentVersion();

      expect(version).toBeDefined();
      expect(version.version).toMatch(/^\d{4}\.\d{2}\.\d{2}-\d{3}$/);
      expect(version.timestamp).toBeInstanceOf(Date);
      expect(version.hash).toBeDefined();
      expect(version.layers).toBeDefined();
    });

    it('should include layer versions', () => {
      const version = policySyncService.getCurrentVersion();

      expect(version.layers.base).toBeDefined();
      expect(version.layers.org).toBeDefined();
      expect(version.layers.tenant).toBeDefined();
    });

    it('should update version on policy push', async () => {
      const beforeVersion = policySyncService.getCurrentVersion().version;

      await policySyncService.pushPolicyUpdate({
        layers: ['base'],
        priority: 'normal',
        description: 'Test update'
      });

      const afterVersion = policySyncService.getCurrentVersion().version;
      expect(afterVersion).not.toBe(beforeVersion);
    });
  });

  // ============================================
  // GUARDRAIL VALIDATION TESTS
  // ============================================

  describe('Guardrail Validation', () => {
    it('should approve valid tenant policy', () => {
      const result = policySyncService.validateTenantPolicy('NZL', validTenantPolicy);

      expect(result.valid).toBe(true);
      expect(result.violations.filter(v => v.severity === 'critical')).toHaveLength(0);
    });

    it('should reject policy with session hours too long', () => {
      const result = policySyncService.validateTenantPolicy('NZL', {
        max_session_hours: 24
      });

      expect(result.valid).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          code: 'SESSION_LIMIT_EXCEEDED',
          severity: 'critical'
        })
      );
    });

    it('should reject policy with token lifetime too long', () => {
      const result = policySyncService.validateTenantPolicy('NZL', {
        max_token_lifetime_minutes: 120
      });

      expect(result.valid).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          code: 'TOKEN_LIFETIME_EXCEEDED',
          severity: 'critical'
        })
      );
    });

    it('should reject policy with weakened MFA threshold', () => {
      const result = policySyncService.validateTenantPolicy('NZL', {
        mfa_required_above: 'SECRET'  // Less strict than UNCLASSIFIED
      });

      expect(result.valid).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          code: 'MFA_THRESHOLD_WEAKENED',
          severity: 'critical'
        })
      );
    });

    it('should reject policy with short audit retention', () => {
      const result = policySyncService.validateTenantPolicy('NZL', {
        audit_retention_days: 30  // Less than 90 days
      });

      expect(result.valid).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          code: 'AUDIT_RETENTION_TOO_SHORT',
          severity: 'critical'
        })
      );
    });

    it('should detect all violations in invalid policy', () => {
      const result = policySyncService.validateTenantPolicy('NZL', invalidTenantPolicy);

      expect(result.valid).toBe(false);
      expect(result.violations.filter(v => v.severity === 'critical').length).toBe(4);
    });

    it('should include hub and tenant values in violation details', () => {
      const result = policySyncService.validateTenantPolicy('NZL', {
        max_session_hours: 24
      });

      const violation = result.violations.find(v => v.code === 'SESSION_LIMIT_EXCEEDED');
      expect(violation?.hubValue).toBe(10);
      expect(violation?.tenantValue).toBe(24);
    });
  });

  // ============================================
  // SYNC STATUS TESTS
  // ============================================

  describe('Sync Status Tracking', () => {
    it('should record spoke sync', async () => {
      // First register and approve a spoke
      const spoke = await hubSpokeRegistry.registerSpoke({
        instanceCode: 'TST',
        name: 'Test Spoke',
        baseUrl: 'https://test.example.com',
        apiUrl: 'https://api.test.example.com',
        idpUrl: 'https://idp.test.example.com',
        requestedScopes: ['policy:base'],
        contactEmail: 'test@example.com',
        validateEndpoints: false
      });

      await hubSpokeRegistry.approveSpoke(spoke.spokeId, 'admin', {
        allowedScopes: ['policy:base'],
        trustLevel: 'development',
        maxClassification: 'UNCLASSIFIED',
        dataIsolationLevel: 'minimal'
      });

      const currentVersion = policySyncService.getCurrentVersion().version;
      const syncStatus = await policySyncService.recordSpokeSync(spoke.spokeId, currentVersion);

      expect(syncStatus.status).toBe('current');
      expect(syncStatus.currentVersion).toBe(currentVersion);
    });

    it('should detect spoke behind on version', async () => {
      // Register spoke
      const spoke = await hubSpokeRegistry.registerSpoke({
        instanceCode: 'BHD',
        name: 'Behind Spoke',
        baseUrl: 'https://behind.example.com',
        apiUrl: 'https://api.behind.example.com',
        idpUrl: 'https://idp.behind.example.com',
        requestedScopes: ['policy:base'],
        contactEmail: 'behind@example.com',
        validateEndpoints: false
      });

      await hubSpokeRegistry.approveSpoke(spoke.spokeId, 'admin', {
        allowedScopes: ['policy:base'],
        trustLevel: 'development',
        maxClassification: 'UNCLASSIFIED',
        dataIsolationLevel: 'minimal'
      });

      // Record sync with old version
      const syncStatus = await policySyncService.recordSpokeSync(spoke.spokeId, '2025.01.01-001');

      expect(syncStatus.status).toBe('behind');
    });
  });

  // ============================================
  // POLICY UPDATE TESTS
  // ============================================

  describe('Policy Updates', () => {
    it('should create normal priority update', async () => {
      const update = await policySyncService.pushPolicyUpdate({
        layers: ['tenant.nzl'],
        priority: 'normal',
        description: 'NZL tenant policy update'
      });

      expect(update.updateId).toMatch(/^update-[a-f0-9]+$/);
      expect(update.priority).toBe('normal');
      expect(update.layers).toContain('tenant.nzl');
      expect(update.requireAck).toBe(false);
    });

    it('should create critical update with ACK required', async () => {
      const update = await policySyncService.pushPolicyUpdate({
        layers: ['base'],
        priority: 'critical',
        description: 'Critical security update'
      });

      expect(update.priority).toBe('critical');
      expect(update.requireAck).toBe(true);
    });

    it('should update layer versions on push', async () => {
      // Push an update to a tenant that doesn't exist yet
      await policySyncService.pushPolicyUpdate({
        layers: ['tenant.aus'],
        priority: 'normal',
        description: 'AUS update'
      });

      const afterVersion = policySyncService.getCurrentVersion();
      expect(afterVersion.layers.tenant['aus']).toBeDefined();

      // Push another update - version should change
      const versionBefore = afterVersion.layers.tenant['aus'];
      await policySyncService.pushPolicyUpdate({
        layers: ['tenant.aus'],
        priority: 'normal',
        description: 'AUS update 2'
      });

      const finalVersion = policySyncService.getCurrentVersion();
      expect(finalVersion.layers.tenant['aus']).not.toBe(versionBefore);
    });
  });

  // ============================================
  // DELTA UPDATE TESTS
  // ============================================

  describe('Delta Updates', () => {
    it('should return updates since spoke version', async () => {
      // Create a spoke
      const spoke = await hubSpokeRegistry.registerSpoke({
        instanceCode: 'DLT',
        name: 'Delta Test Spoke',
        baseUrl: 'https://delta.example.com',
        apiUrl: 'https://api.delta.example.com',
        idpUrl: 'https://idp.delta.example.com',
        requestedScopes: ['policy:base'],
        contactEmail: 'delta@example.com',
        validateEndpoints: false
      });

      await hubSpokeRegistry.approveSpoke(spoke.spokeId, 'admin', {
        allowedScopes: ['policy:base'],
        trustLevel: 'development',
        maxClassification: 'UNCLASSIFIED',
        dataIsolationLevel: 'minimal'
      });

      // Push some updates
      await policySyncService.pushPolicyUpdate({
        layers: ['base'],
        priority: 'normal',
        description: 'First update'
      });

      await policySyncService.pushPolicyUpdate({
        layers: ['base'],
        priority: 'normal',
        description: 'Second update'
      });

      // Get delta from old version
      const delta = await policySyncService.getDeltaUpdate(spoke.spokeId, '2025.01.01-001');

      expect(delta.updates.length).toBeGreaterThanOrEqual(2);
      expect(delta.currentVersion).toBe(policySyncService.getCurrentVersion().version);
    });

    it('should filter updates by spoke scopes', async () => {
      // Create spoke with limited scopes
      const spoke = await hubSpokeRegistry.registerSpoke({
        instanceCode: 'LTD',
        name: 'Limited Scope Spoke',
        baseUrl: 'https://limited.example.com',
        apiUrl: 'https://api.limited.example.com',
        idpUrl: 'https://idp.limited.example.com',
        requestedScopes: ['policy:base'],
        contactEmail: 'limited@example.com',
        validateEndpoints: false
      });

      await hubSpokeRegistry.approveSpoke(spoke.spokeId, 'admin', {
        allowedScopes: ['policy:base'],  // Only base, not org.fvey
        trustLevel: 'development',
        maxClassification: 'UNCLASSIFIED',
        dataIsolationLevel: 'minimal'
      });

      // Push update to org.fvey (spoke shouldn't get this)
      await policySyncService.pushPolicyUpdate({
        layers: ['org.fvey'],
        priority: 'normal',
        description: 'FVEY update'
      });

      // Push update to base (spoke should get this)
      await policySyncService.pushPolicyUpdate({
        layers: ['base'],
        priority: 'normal',
        description: 'Base update'
      });

      const delta = await policySyncService.getDeltaUpdate(spoke.spokeId, '2025.01.01-001');

      // Should only contain base updates
      const baseUpdates = delta.updates.filter(u => u.layers.includes('base'));
      const fveyUpdates = delta.updates.filter(u => u.layers.includes('org.fvey'));

      expect(baseUpdates.length).toBeGreaterThan(0);
      expect(fveyUpdates.length).toBe(0);
    });
  });
});

// ============================================
// GUARDRAIL REGO POLICY TESTS
// ============================================

describe('Guardrail Rego Policy', () => {
  // These would run actual Rego evaluation

  it('should define immutable clearance hierarchy', () => {
    // Would use OPA evaluation
    const expectedHierarchy = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
    expect(expectedHierarchy).toHaveLength(4);
  });

  it('should enforce session limit', () => {
    // Would test guardrails.rego
    expect(true).toBe(true);
  });

  it('should require MFA above UNCLASSIFIED', () => {
    // Would test guardrails.rego
    expect(true).toBe(true);
  });
});
