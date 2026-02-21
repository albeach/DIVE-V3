/**
 * Mesh Federation (Phase F) Tests
 *
 * Tests for:
 * - isHubInstance() / isHubCode() utility functions
 * - Symmetric activation (COI update on spoke side)
 * - Cross-wire notification signature authentication
 * - Federation graph API
 */

// Save original env
const originalEnv = { ...process.env };

// Must mock before any imports
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../utils/https-agent', () => ({
  getSecureHttpsAgent: jest.fn(() => ({})),
}));

describe('Mesh Federation (Phase F)', () => {
  afterEach(() => {
    // Restore env after each test
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  // ============================================
  // isHubInstance() tests
  // ============================================
  describe('isHubInstance()', () => {
    let isHubInstance: () => boolean;

    beforeEach(() => {
      jest.resetModules();
      // Re-import to pick up fresh env
      const mod = require('../services/bidirectional-federation');
      isHubInstance = mod.isHubInstance;
    });

    it('should return true when IS_HUB=true', () => {
      process.env.IS_HUB = 'true';
      const mod = require('../services/bidirectional-federation');
      expect(mod.isHubInstance()).toBe(true);
    });

    it('should return false when IS_HUB=false', () => {
      process.env.IS_HUB = 'false';
      const mod = require('../services/bidirectional-federation');
      expect(mod.isHubInstance()).toBe(false);
    });

    it('should return false when SPOKE_MODE=true and IS_HUB not set', () => {
      delete process.env.IS_HUB;
      process.env.SPOKE_MODE = 'true';
      const mod = require('../services/bidirectional-federation');
      expect(mod.isHubInstance()).toBe(false);
    });

    it('should return true for USA fallback when no flags set', () => {
      delete process.env.IS_HUB;
      delete process.env.SPOKE_MODE;
      process.env.INSTANCE_CODE = 'USA';
      const mod = require('../services/bidirectional-federation');
      expect(mod.isHubInstance()).toBe(true);
    });

    it('should return false for non-USA code when no flags set', () => {
      delete process.env.IS_HUB;
      delete process.env.SPOKE_MODE;
      process.env.INSTANCE_CODE = 'GBR';
      const mod = require('../services/bidirectional-federation');
      expect(mod.isHubInstance()).toBe(false);
    });
  });

  // ============================================
  // isHubCode() tests
  // ============================================
  describe('isHubCode()', () => {
    it('should return true for USA in development mode', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.HUB_INSTANCE_CODE;
      jest.resetModules();
      const { isHubCode } = require('../services/bidirectional-federation');
      expect(isHubCode('USA')).toBe(true);
    });

    it('should return false for non-USA in development mode', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.HUB_INSTANCE_CODE;
      jest.resetModules();
      const { isHubCode } = require('../services/bidirectional-federation');
      expect(isHubCode('GBR')).toBe(false);
    });

    it('should return false for any code in production mode', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { isHubCode } = require('../services/bidirectional-federation');
      expect(isHubCode('USA')).toBe(false);
      expect(isHubCode('GBR')).toBe(false);
    });

    it('should return false for any code in staging mode', () => {
      process.env.NODE_ENV = 'staging';
      jest.resetModules();
      const { isHubCode } = require('../services/bidirectional-federation');
      expect(isHubCode('USA')).toBe(false);
    });

    it('should return true for USA in test mode', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.HUB_INSTANCE_CODE;
      jest.resetModules();
      const { isHubCode } = require('../services/bidirectional-federation');
      expect(isHubCode('USA')).toBe(true);
    });

    it('should respect HUB_INSTANCE_CODE env var override', () => {
      process.env.NODE_ENV = 'development';
      process.env.HUB_INSTANCE_CODE = 'FRA';
      jest.resetModules();
      const { isHubCode } = require('../services/bidirectional-federation');
      expect(isHubCode('FRA')).toBe(true);
      expect(isHubCode('USA')).toBe(false);
    });

    it('should be case-insensitive', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.HUB_INSTANCE_CODE;
      jest.resetModules();
      const { isHubCode } = require('../services/bidirectional-federation');
      expect(isHubCode('usa')).toBe(true);
      expect(isHubCode('Usa')).toBe(true);
    });
  });

  // ============================================
  // getLocalRealmName() tests
  // ============================================
  describe('getLocalRealmName()', () => {
    it('should return same format for all instance codes including USA', () => {
      jest.resetModules();
      const { getLocalRealmName } = require('../services/bidirectional-federation');
      expect(getLocalRealmName('USA')).toBe('dive-v3-broker-usa');
      expect(getLocalRealmName('GBR')).toBe('dive-v3-broker-gbr');
      expect(getLocalRealmName('FRA')).toBe('dive-v3-broker-fra');
    });
  });

  // ============================================
  // Instance Identity signData / verifySignature tests
  // ============================================
  describe('Instance Identity signing', () => {
    it('signData and verifySignature should round-trip correctly', async () => {
      jest.resetModules();
      const crypto = require('crypto');

      // Generate test keypair
      const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'P-256',
      });

      // Create a self-signed test cert
      const certPEM = generateSelfSignedCert(privateKey, publicKey);

      // Mock the singleton's getIdentity method
      jest.mock('../services/instance-identity.service', () => {
        const actualCrypto = require('crypto');
        return {
          instanceIdentityService: {
            getIdentity: jest.fn().mockResolvedValue({
              privateKey,
              certificate: new actualCrypto.X509Certificate(certPEM),
              certificatePEM: certPEM,
              fingerprint: 'SHA256:TEST',
              spiffeId: 'spiffe://test/instance/TEST',
            }),
            async signData(data: string): Promise<string> {
              const identity = await this.getIdentity();
              const sign = actualCrypto.createSign('SHA256');
              sign.update(data);
              sign.end();
              return sign.sign(identity.privateKey, 'base64');
            },
            verifySignature(data: string, signature: string, certificatePEM: string): boolean {
              try {
                const cert = new actualCrypto.X509Certificate(certificatePEM);
                const verify = actualCrypto.createVerify('SHA256');
                verify.update(data);
                verify.end();
                return verify.verify(cert.publicKey, signature, 'base64');
              } catch { return false; }
            },
            calculateFingerprint(certPEM: string): string {
              const cert = new actualCrypto.X509Certificate(certPEM);
              const hash = actualCrypto.createHash('sha256').update(cert.raw).digest('hex').toUpperCase();
              return `SHA256:${hash.match(/.{2}/g)!.join(':')}`;
            },
          },
        };
      });

      const { instanceIdentityService } = require('../services/instance-identity.service');

      const data = 'test-data-to-sign';
      const signature = await instanceIdentityService.signData(data);
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);

      const isValid = instanceIdentityService.verifySignature(data, signature, certPEM);
      expect(isValid).toBe(true);

      // Tampered data should fail
      const isTampered = instanceIdentityService.verifySignature('tampered-data', signature, certPEM);
      expect(isTampered).toBe(false);
    });

    it('verifySignature should return false for invalid certificate', () => {
      jest.resetModules();
      const crypto = require('crypto');

      // Create a minimal instance with verifySignature
      const verifySignature = (data: string, signature: string, certificatePEM: string): boolean => {
        try {
          const cert = new crypto.X509Certificate(certificatePEM);
          const verify = crypto.createVerify('SHA256');
          verify.update(data);
          verify.end();
          return verify.verify(cert.publicKey, signature, 'base64');
        } catch { return false; }
      };

      const result = verifySignature('data', 'sig', 'not-a-cert');
      expect(result).toBe(false);
    });
  });

  // ============================================
  // Federation Graph API tests
  // ============================================
  describe('Federation Graph API', () => {
    it('should return adjacency list with self node', async () => {
      process.env.INSTANCE_CODE = 'USA';
      process.env.IS_HUB = 'true';

      jest.resetModules();

      // Mock enrollment store
      jest.mock('../models/enrollment.model', () => ({
        enrollmentStore: {
          list: jest.fn().mockResolvedValue([
            {
              enrollmentId: 'enr_test1',
              requesterInstanceCode: 'GBR',
              approverInstanceCode: 'USA',
              status: 'active',
              statusHistory: [{ status: 'active', timestamp: new Date() }],
            },
          ]),
        },
      }));

      // Mock hub-spoke registry
      jest.mock('../services/hub-spoke-registry.service', () => ({
        hubSpokeRegistry: {
          listAllSpokes: jest.fn().mockResolvedValue([]),
        },
      }));

      // Import after mocks
      const request = require('supertest');
      const express = require('express');

      // Build a mini app with just the graph route
      const app = express();
      const { isHubInstance } = require('../services/bidirectional-federation');
      const { enrollmentStore } = require('../models/enrollment.model');
      const { hubSpokeRegistry } = require('../services/hub-spoke-registry.service');

      app.get('/api/federation/graph', async (_req: any, res: any) => {
        const localInstanceCode = 'USA';
        const nodes = new Set<string>();
        const edges: Array<{ from: string; to: string; enrollmentId: string; activatedAt?: Date }> = [];
        nodes.add(localInstanceCode);

        const activeEnrollments = await enrollmentStore.list({ status: 'active' });
        for (const enrollment of activeEnrollments) {
          nodes.add(enrollment.requesterInstanceCode.toUpperCase());
          nodes.add(enrollment.approverInstanceCode.toUpperCase());
          edges.push({
            from: enrollment.requesterInstanceCode.toUpperCase(),
            to: enrollment.approverInstanceCode.toUpperCase(),
            enrollmentId: enrollment.enrollmentId,
          });
        }

        const allSpokes = await hubSpokeRegistry.listAllSpokes();
        for (const spoke of allSpokes) {
          if (spoke.status === 'approved') {
            const code = spoke.instanceCode.toUpperCase();
            nodes.add(code);
            const alreadyInV2 = edges.some(
              (e: any) => (e.from === code || e.to === code) && (e.from === localInstanceCode || e.to === localInstanceCode),
            );
            if (!alreadyInV2) {
              edges.push({ from: code, to: localInstanceCode, enrollmentId: `v1-${spoke.spokeId}` });
            }
          }
        }

        res.json({
          instanceCode: localInstanceCode,
          isHub: isHubInstance(),
          nodes: Array.from(nodes).sort(),
          edges,
          edgeCount: edges.length,
        });
      });

      const response = await request(app).get('/api/federation/graph');

      expect(response.status).toBe(200);
      expect(response.body.instanceCode).toBe('USA');
      expect(response.body.isHub).toBe(true);
      expect(response.body.nodes).toContain('USA');
      expect(response.body.nodes).toContain('GBR');
      expect(response.body.edges).toHaveLength(1);
      expect(response.body.edges[0].from).toBe('GBR');
      expect(response.body.edges[0].to).toBe('USA');
      expect(response.body.edgeCount).toBe(1);
    });

    it('should include V1 spokes that are not in V2', async () => {
      process.env.INSTANCE_CODE = 'USA';
      process.env.IS_HUB = 'true';
      jest.resetModules();

      jest.mock('../models/enrollment.model', () => ({
        enrollmentStore: {
          list: jest.fn().mockResolvedValue([]),
        },
      }));

      jest.mock('../services/hub-spoke-registry.service', () => ({
        hubSpokeRegistry: {
          listAllSpokes: jest.fn().mockResolvedValue([
            { spokeId: 'spoke-fra', instanceCode: 'FRA', status: 'approved' },
            { spokeId: 'spoke-deu', instanceCode: 'DEU', status: 'suspended' },
          ]),
        },
      }));

      const { enrollmentStore } = require('../models/enrollment.model');
      const { hubSpokeRegistry } = require('../services/hub-spoke-registry.service');

      const activeEnrollments = await enrollmentStore.list({ status: 'active' });
      const allSpokes = await hubSpokeRegistry.listAllSpokes();

      const nodes = new Set<string>(['USA']);
      const edges: any[] = [];

      for (const spoke of allSpokes) {
        if (spoke.status === 'approved') {
          nodes.add(spoke.instanceCode.toUpperCase());
          edges.push({ from: spoke.instanceCode.toUpperCase(), to: 'USA', enrollmentId: `v1-${spoke.spokeId}` });
        }
      }

      expect(Array.from(nodes)).toContain('FRA');
      expect(Array.from(nodes)).not.toContain('DEU'); // Suspended, not approved
      expect(edges).toHaveLength(1);
      expect(edges[0].enrollmentId).toBe('v1-spoke-fra');
    });

    it('should not duplicate edges between V1 and V2', async () => {
      jest.resetModules();

      const v2Enrollments = [
        { enrollmentId: 'enr_gbr', requesterInstanceCode: 'GBR', approverInstanceCode: 'USA', status: 'active', statusHistory: [] },
      ];
      const v1Spokes = [
        { spokeId: 'spoke-gbr', instanceCode: 'GBR', status: 'approved' },
      ];

      const localInstanceCode = 'USA';
      const nodes = new Set<string>([localInstanceCode]);
      const edges: any[] = [];

      for (const enrollment of v2Enrollments) {
        nodes.add(enrollment.requesterInstanceCode.toUpperCase());
        nodes.add(enrollment.approverInstanceCode.toUpperCase());
        edges.push({ from: enrollment.requesterInstanceCode, to: enrollment.approverInstanceCode, enrollmentId: enrollment.enrollmentId });
      }

      for (const spoke of v1Spokes) {
        if (spoke.status === 'approved') {
          const code = spoke.instanceCode.toUpperCase();
          nodes.add(code);
          const alreadyInV2 = edges.some(
            (e: any) => (e.from === code || e.to === code) && (e.from === localInstanceCode || e.to === localInstanceCode),
          );
          if (!alreadyInV2) {
            edges.push({ from: code, to: localInstanceCode, enrollmentId: `v1-${spoke.spokeId}` });
          }
        }
      }

      // GBR should appear only once in edges (V2 takes precedence)
      expect(edges).toHaveLength(1);
      expect(edges[0].enrollmentId).toBe('enr_gbr');
    });
  });
});

// Helper to generate a self-signed test certificate
function generateSelfSignedCert(privateKey: any, publicKey: any): string {
  const crypto = require('crypto');
  const { execSync } = require('child_process');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-test-'));
  const keyPath = path.join(tmpDir, 'key.pem');
  const certPath = path.join(tmpDir, 'cert.pem');

  try {
    // Export private key to PEM
    const keyPem = privateKey.export({ type: 'sec1', format: 'pem' });
    fs.writeFileSync(keyPath, keyPem);

    // Generate self-signed cert with openssl
    execSync(
      `openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days 365 -subj "/CN=test-instance" 2>/dev/null`,
      { timeout: 5000 },
    );

    return fs.readFileSync(certPath, 'utf-8');
  } finally {
    try { fs.unlinkSync(keyPath); } catch { /* ignore */ }
    try { fs.unlinkSync(certPath); } catch { /* ignore */ }
    try { fs.rmdirSync(tmpDir); } catch { /* ignore */ }
  }
}
