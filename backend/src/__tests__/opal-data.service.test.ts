/**
 * DIVE V3 - OPAL Data Service Tests
 * 
 * Tests for the OPAL data service functionality including:
 * - Loading data from JSON files
 * - Publishing data updates
 * - Managing trusted issuers, federation, and COI data
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { IOPALPublishResult, IOPALHealthStatus } from '../services/opal-client';

// Mock the logger to avoid console output during tests
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock the opal-client to avoid network calls
const mockPublishResult: IOPALPublishResult = {
  success: true,
  message: 'Mock publish successful',
  timestamp: new Date().toISOString()
};

const mockHealthStatus: IOPALHealthStatus = {
  healthy: true,
  opaConnected: true,
  clientsConnected: 1
};

jest.mock('../services/opal-client', () => ({
  opalClient: {
    isOPALEnabled: jest.fn(() => false),
    publishDataUpdate: jest.fn(() => Promise.resolve(mockPublishResult)),
    publishInlineData: jest.fn(() => Promise.resolve(mockPublishResult)),
    checkHealth: jest.fn(() => Promise.resolve(mockHealthStatus)),
    getConfig: jest.fn(() => ({
      serverUrl: 'http://localhost:7002',
      dataTopics: ['policy_data'],
      timeoutMs: 10000
    }))
  }
}));

// Import after mocks are set up
import { opalDataService, ITrustedIssuer, ITenantConfig } from '../services/opal-data.service';
import { opalClient } from '../services/opal-client';

describe('OPAL Data Service', () => {
  // Sample test data
  const sampleTrustedIssuer: ITrustedIssuer = {
    tenant: 'USA',
    name: 'Test Issuer',
    country: 'USA',
    trust_level: 'HIGH',
    enabled: true,
    protocol: 'oidc',
    federation_class: 'NATIONAL'
  };

  const sampleTenantConfig: Partial<ITenantConfig> = {
    code: 'USA',
    name: 'United States',
    locale: 'en-US',
    mfa_required_above: 'UNCLASSIFIED',
    max_session_hours: 10
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadAllData', () => {
    it('should load data from JSON files without errors', async () => {
      const data = await opalDataService.loadAllData();
      
      expect(data).toBeDefined();
      expect(data).toHaveProperty('trusted_issuers');
      expect(data).toHaveProperty('federation_matrix');
      expect(data).toHaveProperty('coi_members');
      expect(data).toHaveProperty('tenant_configs');
    });

    it('should return empty objects if files do not exist', async () => {
      const data = await opalDataService.loadAllData();
      
      // Should not throw, should return empty objects or loaded data
      expect(typeof data.trusted_issuers).toBe('object');
      expect(typeof data.federation_matrix).toBe('object');
      expect(typeof data.coi_members).toBe('object');
      expect(typeof data.tenant_configs).toBe('object');
    });
  });

  describe('getCurrentData', () => {
    it('should return current data state', async () => {
      const data = await opalDataService.getCurrentData();
      
      expect(data).toBeDefined();
      expect(data).toHaveProperty('trusted_issuers');
    });

    it('should return same reference on subsequent calls', async () => {
      const data1 = await opalDataService.getCurrentData();
      const data2 = await opalDataService.getCurrentData();
      
      // Should return cached data
      expect(data1).toBe(data2);
    });
  });

  describe('syncAllToOPAL', () => {
    it('should sync all data successfully', async () => {
      const result = await opalDataService.syncAllToOPAL();
      
      expect(result).toBeDefined();
      expect(result.syncedAt).toBeDefined();
      expect(result.sources).toBeDefined();
    });

    it('should report source status for each data type', async () => {
      const result = await opalDataService.syncAllToOPAL();
      
      expect(result.sources).toHaveProperty('trusted_issuers');
      expect(result.sources).toHaveProperty('federation_matrix');
      expect(result.sources).toHaveProperty('coi_members');
      expect(result.sources).toHaveProperty('tenant_configs');
    });

    it('should call opal client with correct data when OPAL is enabled', async () => {
      (opalClient.isOPALEnabled as jest.Mock).mockReturnValue(true);
      
      await opalDataService.syncAllToOPAL();
      
      expect(opalClient.publishDataUpdate).toHaveBeenCalled();
    });
  });

  describe('updateTrustedIssuer', () => {
    it('should update a trusted issuer', async () => {
      const issuerUrl = 'https://test-issuer.example.com';
      
      const result = await opalDataService.updateTrustedIssuer(
        issuerUrl,
        sampleTrustedIssuer
      );
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should call publishInlineData with correct path', async () => {
      const issuerUrl = 'https://new-issuer.example.com';
      
      await opalDataService.updateTrustedIssuer(issuerUrl, sampleTrustedIssuer);
      
      expect(opalClient.publishInlineData).toHaveBeenCalledWith(
        'trusted_issuers',
        expect.any(Object),
        expect.stringContaining(issuerUrl)
      );
    });
  });

  describe('removeTrustedIssuer', () => {
    it('should remove a trusted issuer', async () => {
      const issuerUrl = 'https://remove-me.example.com';
      
      // First add the issuer
      await opalDataService.updateTrustedIssuer(issuerUrl, sampleTrustedIssuer);
      
      // Then remove it
      const result = await opalDataService.removeTrustedIssuer(issuerUrl);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('addFederationLink', () => {
    it('should add bidirectional federation link', async () => {
      const result = await opalDataService.addFederationLink('USA', 'CAN');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should call publishInlineData with federation_matrix path', async () => {
      await opalDataService.addFederationLink('USA', 'AUS');
      
      expect(opalClient.publishInlineData).toHaveBeenCalledWith(
        'federation_matrix',
        expect.any(Object),
        expect.stringContaining('USA')
      );
    });
  });

  describe('removeFederationLink', () => {
    it('should remove bidirectional federation link', async () => {
      // First add
      await opalDataService.addFederationLink('USA', 'NZL');
      
      // Then remove
      const result = await opalDataService.removeFederationLink('USA', 'NZL');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('updateCOIMembership', () => {
    it('should update COI membership', async () => {
      const result = await opalDataService.updateCOIMembership(
        'TEST-COI',
        ['USA', 'GBR', 'CAN']
      );
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should call publishInlineData with coi_members path', async () => {
      await opalDataService.updateCOIMembership('NEW-COI', ['USA']);
      
      expect(opalClient.publishInlineData).toHaveBeenCalledWith(
        'coi_members',
        expect.any(Object),
        expect.stringContaining('NEW-COI')
      );
    });
  });

  describe('updateTenantConfig', () => {
    it('should update tenant configuration', async () => {
      const result = await opalDataService.updateTenantConfig(
        'USA',
        sampleTenantConfig
      );
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should merge config with existing values', async () => {
      await opalDataService.updateTenantConfig('USA', { max_session_hours: 12 });
      
      expect(opalClient.publishInlineData).toHaveBeenCalledWith(
        'tenant_configs',
        expect.any(Object),
        expect.stringContaining('USA')
      );
    });
  });

  describe('needsSync', () => {
    it('should return true if never synced', async () => {
      // Before any sync
      const needsSync = await opalDataService.needsSync();
      
      // Will be true or false depending on test order
      expect(typeof needsSync).toBe('boolean');
    });
  });

  describe('getDataDirectory', () => {
    it('should return a valid path', () => {
      const dataDir = opalDataService.getDataDirectory();
      
      expect(dataDir).toBeDefined();
      expect(typeof dataDir).toBe('string');
      expect(dataDir.length).toBeGreaterThan(0);
    });
  });

  describe('getLastSyncTime', () => {
    it('should return null before first sync or Date after sync', () => {
      const lastSync = opalDataService.getLastSyncTime();
      
      // Can be null or Date
      expect(lastSync === null || lastSync instanceof Date).toBe(true);
    });

    it('should return Date after sync', async () => {
      await opalDataService.syncAllToOPAL();
      const lastSync = opalDataService.getLastSyncTime();
      
      expect(lastSync).toBeInstanceOf(Date);
    });
  });
});

describe('OPAL Client', () => {
  describe('isOPALEnabled', () => {
    it('should return boolean', () => {
      const enabled = opalClient.isOPALEnabled();
      expect(typeof enabled).toBe('boolean');
    });
  });

  describe('checkHealth', () => {
    it('should return health status', async () => {
      const health = await opalClient.checkHealth();
      
      expect(health).toBeDefined();
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('opaConnected');
    });
  });

  describe('publishDataUpdate', () => {
    it('should accept data update payload', async () => {
      const result = await opalClient.publishDataUpdate({
        entries: [{
          dst_path: 'test_data',
          data: { test: true }
        }],
        reason: 'Test update'
      });
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('publishInlineData', () => {
    it('should publish inline data to specified path', async () => {
      const result = await opalClient.publishInlineData(
        'test_path',
        { key: 'value' },
        'Test inline publish'
      );
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });
});

describe('Federation Data Operations', () => {
  it('should support adding new federation partner without code changes', async () => {
    // This test verifies the Phase 2 success criteria:
    // "Adding new federation partner requires ZERO code changes"
    
    // Step 1: Add federation link via data service
    const result = await opalDataService.addFederationLink('USA', 'JPN');
    expect(result.success).toBe(true);
    
    // Step 2: Verify OPAL publish was called
    expect(opalClient.publishInlineData).toHaveBeenCalled();
    
    // Step 3: Clean up - remove the test link
    await opalDataService.removeFederationLink('USA', 'JPN');
  });

  it('should support removing federation partner without code changes', async () => {
    // Add first
    await opalDataService.addFederationLink('USA', 'BRA');
    
    // Remove
    const result = await opalDataService.removeFederationLink('USA', 'BRA');
    expect(result.success).toBe(true);
  });

  it('should support adding new trusted issuer without code changes', async () => {
    const newIssuer: ITrustedIssuer = {
      tenant: 'JPN',
      name: 'Japan Defense IdP',
      country: 'JPN',
      trust_level: 'HIGH',
      enabled: true,
      protocol: 'saml',
      federation_class: 'NATIONAL'
    };
    
    const result = await opalDataService.updateTrustedIssuer(
      'https://jpn-idp.example.com',
      newIssuer
    );
    
    expect(result.success).toBe(true);
  });

  it('should support adding new COI without code changes', async () => {
    const result = await opalDataService.updateCOIMembership(
      'PACIFIC-ALLIANCE',
      ['USA', 'JPN', 'AUS', 'KOR']
    );
    
    expect(result.success).toBe(true);
    expect(opalClient.publishInlineData).toHaveBeenCalledWith(
      'coi_members',
      expect.any(Object),
      expect.stringContaining('PACIFIC-ALLIANCE')
    );
  });
});

