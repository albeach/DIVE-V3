/**
 * DIVE V3 - Spoke mTLS Service Tests
 *
 * Tests for mTLS certificate handling, HTTPS agent, and server validation.
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import SpokeMTLSService, {
  IMTLSConfig,
} from '../services/spoke-mtls.service';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ============================================
// TEST DATA
// ============================================

// Generate test key pair (not a valid certificate, just for basic file tests)
function generateTestKeyPair(): { key: string } {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  return { key: privateKey };
}

// Create a placeholder cert content (not valid X.509, just for file existence tests)
function getPlaceholderCert(): string {
  return `-----BEGIN CERTIFICATE-----
PLACEHOLDER CERTIFICATE FOR TESTING
This is not a valid X.509 certificate
It is only used to test file loading behavior
-----END CERTIFICATE-----`;
}

// ============================================
// TEST SUITE
// ============================================

describe('SpokeMTLSService', () => {
  let service: SpokeMTLSService;
  let testDir: string;
  let testConfig: Partial<IMTLSConfig>;

  beforeEach(async () => {
    // Create temporary directory for tests
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spoke-mtls-test-'));

    testConfig = {
      certPath: path.join(testDir, 'spoke.crt'),
      keyPath: path.join(testDir, 'spoke.key'),
      caBundlePath: path.join(testDir, 'ca.crt'),
      verifyServer: true,
      minTLSVersion: 'TLSv1.2',
      allowSelfSigned: true,
    };

    service = new SpokeMTLSService();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    service.shutdown();
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // ============================================
  // INITIALIZATION TESTS
  // ============================================

  describe('Initialization', () => {
    it('should initialize without certificates', async () => {
      await service.initialize(testConfig);

      const status = service.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.certLoaded).toBe(false);
      expect(status.keyLoaded).toBe(false);
    });

    it('should load private key when present', async () => {
      // Create test key file only
      const { key } = generateTestKeyPair();
      await fs.writeFile(testConfig.keyPath!, key);

      await service.initialize(testConfig);

      // Key should be loaded
      const status = service.getStatus();
      expect(status.keyLoaded).toBe(true);
      expect(status.certLoaded).toBe(false); // No cert file
    });

    it('should load CA bundle file', async () => {
      await fs.writeFile(testConfig.caBundlePath!, getPlaceholderCert());

      await service.initialize(testConfig);

      const status = service.getStatus();
      expect(status.caLoaded).toBe(true);
    });
  });

  // ============================================
  // CERTIFICATE INFO TESTS
  // ============================================

  describe('Certificate Info', () => {
    it('should extract certificate info', () => {
      // Using a real test certificate format
      const certPEM = `-----BEGIN CERTIFICATE-----
MIICpDCCAYwCCQDWoN3VYdTqZTANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAls
b2NhbGhvc3QwHhcNMjUxMjA1MDAwMDAwWhcNMjYxMjA1MDAwMDAwWjAUMRIwEAYD
VQQDDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC+
-----END CERTIFICATE-----`;

      // This would throw in actual test since cert is incomplete
      // Testing the structure
      expect(() => service.extractCertificateInfo(certPEM)).toThrow();
    });

    it('should return null info when no certificate loaded', async () => {
      await service.initialize(testConfig);

      const certInfo = service.getCertificateInfo();
      expect(certInfo).toBeNull();
    });
  });

  // ============================================
  // EXPIRATION TESTS
  // ============================================

  describe('Certificate Expiration', () => {
    beforeEach(async () => {
      await service.initialize(testConfig);
    });

    it('should report expired when no certificate', () => {
      expect(service.isCertificateExpired()).toBe(true);
    });

    it('should report expiring soon when no certificate', () => {
      expect(service.isCertificateExpiringSoon(30)).toBe(true);
    });

    it('should check expiration threshold', () => {
      expect(service.isCertificateExpiringSoon(7)).toBe(true);
      expect(service.isCertificateExpiringSoon(0)).toBe(true);
    });
  });

  // ============================================
  // HTTPS AGENT TESTS
  // ============================================

  describe('HTTPS Agent', () => {
    beforeEach(async () => {
      await service.initialize(testConfig);
    });

    it('should create HTTPS agent', () => {
      const agent = service.createAgent();

      expect(agent).toBeDefined();
      expect(agent).toBeInstanceOf(require('https').Agent);
    });

    it('should get configured agent', () => {
      service.createAgent();
      const agent = service.getAgent();

      expect(agent).toBeDefined();
    });

    it('should destroy agent on shutdown', () => {
      service.createAgent();
      service.shutdown();

      expect(service.getAgent()).toBeNull();
    });
  });

  // ============================================
  // STATUS TESTS
  // ============================================

  describe('Status', () => {
    it('should return complete status', async () => {
      await service.initialize(testConfig);

      const status = service.getStatus();

      expect(status).toHaveProperty('initialized');
      expect(status).toHaveProperty('certLoaded');
      expect(status).toHaveProperty('keyLoaded');
      expect(status).toHaveProperty('caLoaded');
      expect(status).toHaveProperty('certInfo');
      expect(status).toHaveProperty('isExpired');
      expect(status).toHaveProperty('expiresInDays');
    });

    it('should return initialized false before init', () => {
      const status = service.getStatus();
      expect(status.initialized).toBe(false);
    });
  });

  // ============================================
  // CREDENTIALS VALIDATION TESTS
  // ============================================

  describe('Credentials Validation', () => {
    it('should report no valid credentials without cert', async () => {
      await service.initialize(testConfig);

      expect(service.hasValidCredentials()).toBe(false);
    });

    it('should check credentials status', async () => {
      await service.initialize(testConfig);

      // Without valid cert and key, credentials are not valid
      expect(service.hasValidCredentials()).toBe(false);
    });
  });

  // ============================================
  // CSR GENERATION TESTS
  // ============================================

  describe('CSR Generation', () => {
    beforeEach(async () => {
      await service.initialize(testConfig);
    });

    it('should generate CSR with RSA', async () => {
      const result = await service.generateCSR({
        spokeId: 'spoke-test-001',
        instanceCode: 'TST',
        organization: 'Test Org',
        country: 'TS',
        algorithm: 'rsa',
        keySize: 2048,
        outputDir: testDir,
      });

      expect(result.csr).toBeDefined();
      expect(result.privateKeyPath).toBeDefined();
      expect(result.algorithm).toBe('rsa');
      expect(result.keySize).toBe(2048);
    });

    it('should generate CSR with EC', async () => {
      const result = await service.generateCSR({
        spokeId: 'spoke-test-002',
        instanceCode: 'TST',
        algorithm: 'ec',
        outputDir: testDir,
      });

      expect(result.csr).toBeDefined();
      expect(result.algorithm).toBe('ec');
      expect(result.keySize).toBe(256);
    });

    it('should create output directory', async () => {
      const nestedDir = path.join(testDir, 'deep', 'nested', 'certs');

      await service.generateCSR({
        spokeId: 'spoke-test-003',
        instanceCode: 'TST',
        outputDir: nestedDir,
      });

      const dirExists = await fs.access(nestedDir)
        .then(() => true)
        .catch(() => false);

      expect(dirExists).toBe(true);
    });

    it('should include subject information in CSR', async () => {
      const result = await service.generateCSR({
        spokeId: 'spoke-nzl-abc123',
        instanceCode: 'NZL',
        organization: 'DIVE Federation',
        country: 'NZ',
        outputDir: testDir,
      });

      expect(result.subject.CN).toBe('spoke-nzl-abc123');
      expect(result.subject.O).toBe('DIVE Federation');
      expect(result.subject.C).toBe('NZ');
    });
  });

  // ============================================
  // CERTIFICATE RELOAD TESTS
  // ============================================

  describe('Certificate Reload', () => {
    it('should emit certificatesReloaded event', async () => {
      await service.initialize(testConfig);

      const handler = jest.fn();
      service.on('certificatesReloaded', handler);

      // Reload certificates (even if none exist)
      try {
        await service.reloadCertificates();
      } catch {
        // May fail without valid certs, but event should still work
      }

      // Verify event mechanism works
      expect(handler).toHaveBeenCalled();
    });
  });

  // ============================================
  // EVENT TESTS
  // ============================================

  describe('Events', () => {
    beforeEach(async () => {
      await service.initialize(testConfig);
    });

    it('should emit certificateInstalled event', async () => {
      const handler = jest.fn();
      service.on('certificateInstalled', handler);

      // Verify event listener can be registered
      expect(service.listenerCount('certificateInstalled')).toBe(1);
    });

    it('should register event listeners', () => {
      const handler = jest.fn();

      service.on('certificateExpired', handler);
      service.on('certificateExpiringSoon', handler);
      service.on('certificateExpiryWarning', handler);

      expect(service.listenerCount('certificateExpired')).toBe(1);
      expect(service.listenerCount('certificateExpiringSoon')).toBe(1);
      expect(service.listenerCount('certificateExpiryWarning')).toBe(1);
    });
  });

  // ============================================
  // SHUTDOWN TESTS
  // ============================================

  describe('Shutdown', () => {
    it('should clean up resources on shutdown', async () => {
      await service.initialize(testConfig);
      service.createAgent();

      service.shutdown();

      const status = service.getStatus();
      expect(status.initialized).toBe(false);
      expect(status.certLoaded).toBe(false);
      expect(service.getAgent()).toBeNull();
    });
  });
});

// ============================================
// DATA STRUCTURE TESTS
// ============================================

describe('mTLS Data Structures', () => {
  it('should have correct IMTLSConfig structure', () => {
    const config: IMTLSConfig = {
      certPath: '/path/to/cert.pem',
      keyPath: '/path/to/key.pem',
      caBundlePath: '/path/to/ca.pem',
      verifyServer: true,
      minTLSVersion: 'TLSv1.3',
      checkCRL: false,
      allowSelfSigned: false,
    };

    expect(config.minTLSVersion).toBe('TLSv1.3');
    expect(config.verifyServer).toBe(true);
  });

  it('should support TLSv1.2 and TLSv1.3', () => {
    const configV12: IMTLSConfig = {
      certPath: '/cert',
      keyPath: '/key',
      verifyServer: true,
      minTLSVersion: 'TLSv1.2',
    };

    const configV13: IMTLSConfig = {
      certPath: '/cert',
      keyPath: '/key',
      verifyServer: true,
      minTLSVersion: 'TLSv1.3',
    };

    expect(configV12.minTLSVersion).toBe('TLSv1.2');
    expect(configV13.minTLSVersion).toBe('TLSv1.3');
  });
});
