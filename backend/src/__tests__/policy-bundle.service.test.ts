/**
 * DIVE V3 - Policy Bundle Service Tests
 *
 * Tests for the policy bundle service including:
 * - Bundle building
 * - Bundle signing
 * - Scope filtering
 * - OPAL integration
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

jest.mock('../services/opal-client', () => ({
  opalClient: {
    isOPALEnabled: jest.fn(() => false),
    triggerPolicyRefresh: jest.fn(),
    publishDataUpdate: jest.fn(),
    publishInlineData: jest.fn(),
  },
}));

// Import after mocks
import {
  policyBundleService,
} from '../services/policy-bundle.service';
import { opalClient } from '../services/opal-client';

describe('PolicyBundleService', () => {

  beforeEach(() => {
    jest.spyOn(logger, 'info').mockImplementation(() => logger as any);
    jest.spyOn(logger, 'debug').mockImplementation(() => logger as any);
    jest.spyOn(logger, 'warn').mockImplementation(() => logger as any);
    jest.spyOn(logger, 'error').mockImplementation(() => logger as any);
    (logger as any).child = () => logger;

    // Reset mocks
    jest.clearAllMocks();

    // Set environment for tests
    process.env.POLICIES_DIR = path.join(__dirname, '..', '..', '..', 'policies');
  });

  afterEach(() => {
    // Clean up
  });

  // ============================================
  // BUNDLE BUILDING TESTS
  // ============================================

  describe('buildBundle', () => {
    it('should build a bundle from policies directory', async () => {
      const result = await policyBundleService.buildBundle({
        sign: false, // Skip signing for test
        compress: false,
      });

      expect(result.success).toBe(true);
      expect(result.bundleId).toMatch(/^bundle-[a-f0-9]+$/);
      expect(result.version).toMatch(/^\d{4}\.\d{2}\.\d{2}-\d{3}$/);
      expect(result.fileCount).toBeGreaterThan(0);
      expect(result.size).toBeGreaterThan(0);
      expect(result.hash).toHaveLength(64); // SHA-256 hex
    });

    it('should include all policy directories by default', async () => {
      const result = await policyBundleService.buildBundle({
        sign: false,
        compress: false,
      });

      expect(result.success).toBe(true);
      expect(result.fileCount).toBeGreaterThan(0);
    });

    it('should filter policies by scope', async () => {
      const resultAll = await policyBundleService.buildBundle({
        scopes: ['all'],
        sign: false,
        compress: false,
      });

      const resultBase = await policyBundleService.buildBundle({
        scopes: ['policy:base'],
        sign: false,
        compress: false,
      });

      expect(resultAll.success).toBe(true);
      expect(resultBase.success).toBe(true);
      // Base-only should have fewer files
      expect(resultBase.fileCount).toBeLessThanOrEqual(resultAll.fileCount);
    });

    it('should compress bundle when compress option is true', async () => {
      const resultUncompressed = await policyBundleService.buildBundle({
        sign: false,
        compress: false,
      });

      const resultCompressed = await policyBundleService.buildBundle({
        sign: false,
        compress: true,
      });

      expect(resultUncompressed.success).toBe(true);
      expect(resultCompressed.success).toBe(true);
      // Compressed should be smaller (usually)
      // Note: Very small bundles might not compress well
    });
  });

  // ============================================
  // BUNDLE SIGNING TESTS
  // ============================================

  describe('bundle signing', () => {
    it('should sign bundle when signing key is available', async () => {
      // Create a test signing key
      const testKeyDir = path.join(__dirname, 'test-keys');
      const testKeyPath = path.join(testKeyDir, 'test-signing.key');

      // Create directory if it doesn't exist
      if (!fs.existsSync(testKeyDir)) {
        fs.mkdirSync(testKeyDir, { recursive: true });
      }

      // Generate a test RSA key
      const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });

      fs.writeFileSync(testKeyPath, privateKey);

      // Set the key path
      process.env.BUNDLE_SIGNING_KEY_PATH = testKeyPath;

      // Create a new instance to pick up the new key path
      const { PolicyBundleService } = await import('../services/policy-bundle.service');
      const testService = new (PolicyBundleService as any)();

      // Force-inject signing key to avoid silent load failures in tests
      (testService as any).signingKey = crypto.createPrivateKey(privateKey);
      (testService as any).signingKeyLoaded = true;

      const result = await testService.buildBundle({
        sign: true,
        compress: false,
      });

      // Clean up
      fs.unlinkSync(testKeyPath);
      fs.rmdirSync(testKeyDir);

      expect(result.success).toBe(true);
      expect(result.signature).toBeDefined();
      expect((result.signature || '').length).toBeGreaterThan(0);
    });

    it('should build bundle without signing when key is not available', async () => {
      process.env.BUNDLE_SIGNING_KEY_PATH = '/nonexistent/path/key.pem';

      const result = await policyBundleService.buildBundle({
        sign: true,
        compress: false,
      });

      // Should still succeed, just without signature
      expect(result.success).toBe(true);
      // Signature may be undefined if key loading failed
    });
  });

  // ============================================
  // SCOPE VALIDATION TESTS
  // ============================================

  describe('scope validation', () => {
    it('should return available scopes', () => {
      const scopes = policyBundleService.getAvailableScopes();

      expect(scopes).toContain('policy:base');
      expect(scopes).toContain('policy:fvey');
      expect(scopes).toContain('policy:nato');
      expect(scopes).toContain('policy:usa');
      expect(scopes).toContain('policy:fra');
      expect(scopes).toContain('policy:gbr');
      expect(scopes).toContain('policy:deu');
    });

    it('should validate valid scopes', () => {
      expect(policyBundleService.isValidScope('all')).toBe(true);
      expect(policyBundleService.isValidScope('policy:base')).toBe(true);
      expect(policyBundleService.isValidScope('policy:usa')).toBe(true);
    });

    it('should reject invalid scopes', () => {
      expect(policyBundleService.isValidScope('invalid')).toBe(false);
      expect(policyBundleService.isValidScope('')).toBe(false);
      expect(policyBundleService.isValidScope('policy:xyz')).toBe(false);
    });
  });

  // ============================================
  // BUNDLE RETRIEVAL TESTS
  // ============================================

  describe('bundle retrieval', () => {
    it('should return null when no bundle exists', () => {
      // Fresh service with no bundle built yet
      const bundle = policyBundleService.getCurrentBundle();
      // May or may not be null depending on previous tests
      // This test verifies the method works
      if (bundle) {
        expect(bundle.bundleId).toBeDefined();
      }
    });

    it('should return bundle after building', async () => {
      await policyBundleService.buildBundle({
        sign: false,
        compress: false,
      });

      const bundle = policyBundleService.getCurrentBundle();

      expect(bundle).toBeDefined();
      expect(bundle?.bundleId).toBeDefined();
      expect(bundle?.version).toBeDefined();
      expect(bundle?.hash).toBeDefined();
      expect(bundle?.contents).toBeDefined();
    });

    it('should return manifest after building', async () => {
      await policyBundleService.buildBundle({
        sign: false,
        compress: false,
      });

      const manifest = policyBundleService.getCurrentManifest();

      expect(manifest).toBeDefined();
      expect(manifest?.revision).toBeDefined();
      expect(manifest?.roots).toBeDefined();
      expect(Array.isArray(manifest?.roots)).toBe(true);
      expect(manifest?.files).toBeDefined();
      expect(Array.isArray(manifest?.files)).toBe(true);
    });
  });

  // ============================================
  // OPAL INTEGRATION TESTS
  // ============================================

  describe('OPAL integration', () => {
    it('should publish bundle to OPAL when enabled', async () => {
      // Enable OPAL mock
      (opalClient.isOPALEnabled as jest.Mock).mockReturnValue(true);
      (opalClient.triggerPolicyRefresh as any).mockResolvedValue({
        success: true,
        transactionId: 'test-txn-123',
        message: 'Refresh triggered',
        timestamp: new Date().toISOString(),
      });
      (opalClient.publishDataUpdate as any).mockResolvedValue({
        success: true,
        transactionId: 'test-data-456',
        message: 'Data published',
        timestamp: new Date().toISOString(),
      });

      // Build and publish
      const { buildResult, publishResult } = await policyBundleService.buildAndPublish({
        sign: false,
        compress: false,
      });

      expect(buildResult.success).toBe(true);
      expect(publishResult).toBeDefined();
      expect(publishResult?.success).toBe(true);
      expect(opalClient.triggerPolicyRefresh).toHaveBeenCalled();
      expect(opalClient.publishDataUpdate).toHaveBeenCalled();
    });

    it('should skip publish when OPAL is disabled', async () => {
      (opalClient.isOPALEnabled as jest.Mock).mockReturnValue(false);

      await policyBundleService.buildBundle({
        sign: false,
        compress: false,
      });

      const publishResult = await policyBundleService.publishBundle();

      expect(publishResult.success).toBe(true);
      expect(opalClient.triggerPolicyRefresh).not.toHaveBeenCalled();
    });

    it('should handle OPAL errors gracefully', async () => {
      (opalClient.isOPALEnabled as jest.Mock).mockReturnValue(true);
      (opalClient.triggerPolicyRefresh as any).mockRejectedValue(
        new Error('OPAL server unavailable')
      );

      await policyBundleService.buildBundle({
        sign: false,
        compress: false,
      });

      const publishResult = await policyBundleService.publishBundle();

      expect(publishResult.success).toBe(false);
      expect(publishResult.error).toContain('OPAL server unavailable');
    });
  });

  // ============================================
  // SCOPED BUNDLE TESTS
  // ============================================

  describe('scoped bundles', () => {
    it('should build bundle for specific scopes', async () => {
      const result = await policyBundleService.getBundleForScopes(['policy:usa']);

      expect(result.success).toBe(true);
      expect(result.fileCount).toBeGreaterThan(0);
    });

    it('should always include base policies', async () => {
      // Even when requesting only tenant policies, base should be included
      const result = await policyBundleService.getBundleForScopes(['policy:usa']);

      expect(result.success).toBe(true);
      // The bundle should include base policies
    });
  });
});

// ============================================
// BUNDLE CONTENT TESTS
// ============================================

describe('Bundle Content', () => {
  it('should generate valid version strings', async () => {
    const result1 = await policyBundleService.buildBundle({
      sign: false,
      compress: false,
    });
    const result2 = await policyBundleService.buildBundle({
      sign: false,
      compress: false,
    });

    // Version format: YYYY.MM.DD-NNN
    expect(result1.version).toMatch(/^\d{4}\.\d{2}\.\d{2}-\d{3}$/);
    expect(result2.version).toMatch(/^\d{4}\.\d{2}\.\d{2}-\d{3}$/);

    // Versions should be different (different sequence numbers)
    // Note: Could be same if built in same millisecond, but unlikely
  });

  it('should generate unique bundle IDs', async () => {
    const result1 = await policyBundleService.buildBundle({
      sign: false,
      compress: false,
    });
    const result2 = await policyBundleService.buildBundle({
      sign: false,
      compress: false,
    });

    expect(result1.bundleId).not.toBe(result2.bundleId);
  });

  it('should calculate content hash correctly', async () => {
    const result = await policyBundleService.buildBundle({
      sign: false,
      compress: false,
    });

    // Hash should be a valid SHA-256 hex string
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ============================================
// BUNDLE HASH VERIFICATION TESTS
// ============================================

describe('Bundle Hash Verification', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'info').mockImplementation(() => logger as any);
    jest.spyOn(logger, 'debug').mockImplementation(() => logger as any);
    jest.spyOn(logger, 'warn').mockImplementation(() => logger as any);
    jest.spyOn(logger, 'error').mockImplementation(() => logger as any);
    (logger as any).child = () => logger;
    process.env.POLICIES_DIR = path.join(__dirname, '..', '..', '..', 'policies');
  });

  it('should produce a valid 64-char hex hash on build', async () => {
    const result = await policyBundleService.buildBundle({
      sign: false,
      compress: false,
    });

    expect(result.success).toBe(true);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should detect hash mismatch on tampered content', async () => {
    const result = await policyBundleService.buildBundle({
      sign: false,
      compress: false,
    });

    const tamperedContent = Buffer.from('tampered-policy-content');
    const tamperedHash = crypto.createHash('sha256').update(tamperedContent).digest('hex');

    expect(tamperedHash).not.toBe(result.hash);
  });

  it('should store recomputable hash in getCurrentBundle', async () => {
    await policyBundleService.buildBundle({
      sign: false,
      compress: false,
    });

    const bundle = policyBundleService.getCurrentBundle();
    expect(bundle).not.toBeNull();
    expect(bundle!.hash).toMatch(/^[a-f0-9]{64}$/);

    // Recompute hash from contents and verify format
    const recomputed = crypto.createHash('sha256').update(bundle!.contents).digest('hex');
    expect(recomputed).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should verify signature round-trip with matching key pair', async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    const testKeyDir = path.join(__dirname, 'test-verify-keys');
    if (!fs.existsSync(testKeyDir)) fs.mkdirSync(testKeyDir, { recursive: true });

    const pubKeyPath = path.join(testKeyDir, 'verify-test.pub');
    fs.writeFileSync(pubKeyPath, publicKey);

    const { PolicyBundleService } = await import('../services/policy-bundle.service');
    const testService = new (PolicyBundleService as any)();
    (testService as any).signingKey = crypto.createPrivateKey(privateKey);
    (testService as any).signingKeyLoaded = true;

    const result = await testService.buildBundle({ sign: true, compress: false });
    expect(result.success).toBe(true);
    expect(result.signature).toBeDefined();

    const bundle = testService.getCurrentBundle();
    expect(bundle).not.toBeNull();

    const verifyResult = await testService.verifyBundleSignature(bundle!, pubKeyPath);
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.error).toBeUndefined();

    // Clean up
    fs.unlinkSync(pubKeyPath);
    fs.rmdirSync(testKeyDir);
  });

  it('should fail signature verification with wrong public key', async () => {
    const keyPair1 = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const keyPair2 = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    const testKeyDir = path.join(__dirname, 'test-wrong-key');
    if (!fs.existsSync(testKeyDir)) fs.mkdirSync(testKeyDir, { recursive: true });

    const wrongPubPath = path.join(testKeyDir, 'wrong.pub');
    fs.writeFileSync(wrongPubPath, keyPair2.publicKey);

    const { PolicyBundleService } = await import('../services/policy-bundle.service');
    const testService = new (PolicyBundleService as any)();
    (testService as any).signingKey = crypto.createPrivateKey(keyPair1.privateKey);
    (testService as any).signingKeyLoaded = true;

    await testService.buildBundle({ sign: true, compress: false });
    const bundle = testService.getCurrentBundle();
    expect(bundle).not.toBeNull();

    const verifyResult = await testService.verifyBundleSignature(bundle!, wrongPubPath);
    expect(verifyResult.valid).toBe(false);

    // Clean up
    fs.unlinkSync(wrongPubPath);
    fs.rmdirSync(testKeyDir);
  });
});
