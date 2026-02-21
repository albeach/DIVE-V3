/**
 * Tests for VaultTransitService
 *
 * Unit tests for Vault Transit encryption/decryption of federation credentials.
 */

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Save original env
const originalEnv = { ...process.env };

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv };
  // Reset fetch mock
  global.fetch = jest.fn() as jest.Mock<any>;
});

afterEach(() => {
  process.env = originalEnv;
});

describe('VaultTransitService', () => {
  describe('isConfigured', () => {
    it('should return false when VAULT_ADDR is not set', () => {
      delete process.env.VAULT_ADDR;
      delete process.env.VAULT_TOKEN;
      const { vaultTransitService } = require('../services/vault-transit.service');
      // When VAULT_ADDR is empty/unset AND VAULT_TOKEN is empty, not configured
      expect(vaultTransitService.isConfigured()).toBe(false);
    });

    it('should return true when VAULT_ADDR and VAULT_TOKEN are set', () => {
      process.env.VAULT_ADDR = 'http://localhost:8200';
      process.env.VAULT_TOKEN = 'test-token';
      const { vaultTransitService } = require('../services/vault-transit.service');
      expect(vaultTransitService.isConfigured()).toBe(true);
    });
  });

  describe('isEncrypted', () => {
    it('should detect Vault transit ciphertext', () => {
      const { vaultTransitService } = require('../services/vault-transit.service');
      expect(vaultTransitService.isEncrypted('vault:v1:abc123')).toBe(true);
      expect(vaultTransitService.isEncrypted('vault:v2:xyz')).toBe(true);
    });

    it('should not flag plaintext as encrypted', () => {
      const { vaultTransitService } = require('../services/vault-transit.service');
      expect(vaultTransitService.isEncrypted('plain-secret')).toBe(false);
      expect(vaultTransitService.isEncrypted('')).toBe(false);
    });
  });

  describe('encrypt', () => {
    it('should return plaintext with encrypted=false when Vault not configured', async () => {
      delete process.env.VAULT_TOKEN;
      const { vaultTransitService } = require('../services/vault-transit.service');
      const result = await vaultTransitService.encrypt('my-secret');
      expect(result.ciphertext).toBe('my-secret');
      expect(result.encrypted).toBe(false);
    });

    it('should encrypt successfully when Vault responds', async () => {
      process.env.VAULT_ADDR = 'http://localhost:8200';
      process.env.VAULT_TOKEN = 'test-token';

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { ciphertext: 'vault:v1:encrypted-data' },
        }),
      });

      const { vaultTransitService } = require('../services/vault-transit.service');
      const result = await vaultTransitService.encrypt('my-secret');
      expect(result.ciphertext).toBe('vault:v1:encrypted-data');
      expect(result.encrypted).toBe(true);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8200/v1/transit/encrypt/federation-credentials',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Vault-Token': 'test-token',
          }),
        }),
      );
    });

    it('should fallback to plaintext on Vault error', async () => {
      process.env.VAULT_ADDR = 'http://localhost:8200';
      process.env.VAULT_TOKEN = 'test-token';

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'service unavailable',
      });

      const { vaultTransitService } = require('../services/vault-transit.service');
      const result = await vaultTransitService.encrypt('my-secret');
      expect(result.ciphertext).toBe('my-secret');
      expect(result.encrypted).toBe(false);
    });

    it('should fallback to plaintext on network error', async () => {
      process.env.VAULT_ADDR = 'http://localhost:8200';
      process.env.VAULT_TOKEN = 'test-token';

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const { vaultTransitService } = require('../services/vault-transit.service');
      const result = await vaultTransitService.encrypt('my-secret');
      expect(result.ciphertext).toBe('my-secret');
      expect(result.encrypted).toBe(false);
    });
  });

  describe('decrypt', () => {
    it('should return plaintext as-is when not encrypted', async () => {
      const { vaultTransitService } = require('../services/vault-transit.service');
      const result = await vaultTransitService.decrypt('plain-secret');
      expect(result).toBe('plain-secret');
    });

    it('should decrypt Vault ciphertext', async () => {
      process.env.VAULT_ADDR = 'http://localhost:8200';
      process.env.VAULT_TOKEN = 'test-token';

      const plaintext = Buffer.from('my-secret').toString('base64');
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { plaintext },
        }),
      });

      const { vaultTransitService } = require('../services/vault-transit.service');
      const result = await vaultTransitService.decrypt('vault:v1:encrypted-data');
      expect(result).toBe('my-secret');
    });

    it('should throw when Vault not configured but ciphertext needs decryption', async () => {
      delete process.env.VAULT_TOKEN;
      const { vaultTransitService } = require('../services/vault-transit.service');
      await expect(
        vaultTransitService.decrypt('vault:v1:encrypted-data'),
      ).rejects.toThrow('Vault transit not configured');
    });

    it('should throw on Vault decrypt error', async () => {
      process.env.VAULT_ADDR = 'http://localhost:8200';
      process.env.VAULT_TOKEN = 'test-token';

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'invalid ciphertext',
      });

      const { vaultTransitService } = require('../services/vault-transit.service');
      await expect(
        vaultTransitService.decrypt('vault:v1:bad-data'),
      ).rejects.toThrow('Vault transit decrypt failed');
    });
  });

  describe('encryptCredentials', () => {
    it('should encrypt only sensitive fields', async () => {
      process.env.VAULT_ADDR = 'http://localhost:8200';
      process.env.VAULT_TOKEN = 'test-token';

      let callCount = 0;
      (global.fetch as jest.Mock).mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({
            data: { ciphertext: `vault:v1:enc-${callCount}` },
          }),
        };
      });

      const { vaultTransitService } = require('../services/vault-transit.service');
      const creds = {
        oidcClientId: 'client-id',
        oidcClientSecret: 'secret-value',
        oidcIssuerUrl: 'https://idp.example.com',
        oidcDiscoveryUrl: 'https://idp.example.com/.well-known/openid-configuration',
      };

      const result = await vaultTransitService.encryptCredentials(creds);
      // oidcClientSecret should be encrypted
      expect(result.credentials.oidcClientSecret).toMatch(/^vault:v1:/);
      // Non-sensitive fields untouched
      expect(result.credentials.oidcClientId).toBe('client-id');
      expect(result.credentials.oidcIssuerUrl).toBe('https://idp.example.com');
      expect(result.encrypted).toBe(true);
    });

    it('should not re-encrypt already encrypted values', async () => {
      process.env.VAULT_ADDR = 'http://localhost:8200';
      process.env.VAULT_TOKEN = 'test-token';

      const { vaultTransitService } = require('../services/vault-transit.service');
      const creds = {
        oidcClientId: 'client-id',
        oidcClientSecret: 'vault:v1:already-encrypted',
        oidcIssuerUrl: 'https://idp.example.com',
      };

      const result = await vaultTransitService.encryptCredentials(creds);
      expect(result.credentials.oidcClientSecret).toBe('vault:v1:already-encrypted');
      // fetch should not have been called — nothing to encrypt
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('decryptCredentials', () => {
    it('should decrypt only encrypted fields', async () => {
      process.env.VAULT_ADDR = 'http://localhost:8200';
      process.env.VAULT_TOKEN = 'test-token';

      const plaintext = Buffer.from('decrypted-secret').toString('base64');
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { plaintext },
        }),
      });

      const { vaultTransitService } = require('../services/vault-transit.service');
      const creds = {
        oidcClientId: 'client-id',
        oidcClientSecret: 'vault:v1:encrypted-data',
        oidcIssuerUrl: 'https://idp.example.com',
      };

      const result = await vaultTransitService.decryptCredentials(creds);
      expect(result.oidcClientSecret).toBe('decrypted-secret');
      expect(result.oidcClientId).toBe('client-id');
      expect(result.oidcIssuerUrl).toBe('https://idp.example.com');
    });

    it('should pass through plaintext credentials unchanged', async () => {
      const { vaultTransitService } = require('../services/vault-transit.service');
      const creds = {
        oidcClientId: 'client-id',
        oidcClientSecret: 'plain-secret',
      };

      const result = await vaultTransitService.decryptCredentials(creds);
      expect(result.oidcClientSecret).toBe('plain-secret');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
