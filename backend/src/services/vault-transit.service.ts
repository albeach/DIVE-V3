/**
 * Vault Transit Encryption Service
 *
 * Encrypts/decrypts sensitive credential fields (oidcClientSecret, opalToken, spokeToken)
 * using Vault's Transit secrets engine. Graceful degradation: if Vault is unavailable,
 * logs a warning and returns plaintext (caller must set _secretsEncrypted = false).
 *
 * Transit API: POST /v1/transit/encrypt/:keyName, POST /v1/transit/decrypt/:keyName
 * Ciphertext format: vault:v1:<base64>
 */

import { logger } from '../utils/logger';

const VAULT_ADDR = process.env.VAULT_ADDR || 'http://dive-hub-vault:8200';
const DEFAULT_KEY_NAME = 'federation-credentials';

// Vault transit ciphertext prefix
const VAULT_CIPHER_PREFIX = 'vault:v';

interface TransitResponse {
  data: {
    ciphertext?: string;
    plaintext?: string;
  };
  errors?: string[];
}

class VaultTransitService {
  private static instance: VaultTransitService;

  static getInstance(): VaultTransitService {
    if (!VaultTransitService.instance) {
      VaultTransitService.instance = new VaultTransitService();
    }
    return VaultTransitService.instance;
  }

  private getToken(): string {
    return process.env.VAULT_TOKEN || '';
  }

  /**
   * Check whether Vault transit is available for encryption.
   * Returns false if VAULT_ADDR or VAULT_TOKEN is missing.
   */
  isConfigured(): boolean {
    return !!(VAULT_ADDR && this.getToken());
  }

  /**
   * Check if a string looks like Vault transit ciphertext.
   */
  isEncrypted(value: string): boolean {
    return value.startsWith(VAULT_CIPHER_PREFIX);
  }

  /**
   * Encrypt a plaintext string using Vault transit.
   * Returns ciphertext in format "vault:v1:<base64>".
   * On failure, returns the original plaintext and logs a warning.
   */
  async encrypt(plaintext: string, keyName: string = DEFAULT_KEY_NAME): Promise<{ ciphertext: string; encrypted: boolean }> {
    if (!this.isConfigured()) {
      logger.warn('Vault transit not configured — storing plaintext', { keyName });
      return { ciphertext: plaintext, encrypted: false };
    }

    try {
      const b64 = Buffer.from(plaintext).toString('base64');
      const response = await fetch(`${VAULT_ADDR}/v1/transit/encrypt/${keyName}`, {
        method: 'POST',
        headers: {
          'X-Vault-Token': this.getToken(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plaintext: b64 }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const text = await response.text();
        logger.warn('Vault transit encrypt failed — storing plaintext', {
          keyName,
          status: response.status,
          body: text.substring(0, 200),
        });
        return { ciphertext: plaintext, encrypted: false };
      }

      const data = (await response.json()) as TransitResponse;
      if (data.errors?.length) {
        logger.warn('Vault transit encrypt returned errors — storing plaintext', {
          keyName,
          errors: data.errors,
        });
        return { ciphertext: plaintext, encrypted: false };
      }

      const ciphertext = data.data.ciphertext;
      if (!ciphertext) {
        logger.warn('Vault transit encrypt returned no ciphertext — storing plaintext', { keyName });
        return { ciphertext: plaintext, encrypted: false };
      }

      return { ciphertext, encrypted: true };
    } catch (error) {
      logger.warn('Vault transit encrypt error — storing plaintext', {
        keyName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { ciphertext: plaintext, encrypted: false };
    }
  }

  /**
   * Decrypt a Vault transit ciphertext string.
   * If the value doesn't look like Vault ciphertext, returns it as-is (backward compat).
   */
  async decrypt(ciphertext: string, keyName: string = DEFAULT_KEY_NAME): Promise<string> {
    // Backward compatibility: if not encrypted, return as-is
    if (!this.isEncrypted(ciphertext)) {
      return ciphertext;
    }

    if (!this.isConfigured()) {
      logger.warn('Vault transit not configured — cannot decrypt', { keyName });
      throw new Error('Vault transit not configured but ciphertext requires decryption');
    }

    try {
      const response = await fetch(`${VAULT_ADDR}/v1/transit/decrypt/${keyName}`, {
        method: 'POST',
        headers: {
          'X-Vault-Token': this.getToken(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ciphertext }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Vault transit decrypt failed: ${response.status} ${text.substring(0, 200)}`);
      }

      const data = (await response.json()) as TransitResponse;
      if (data.errors?.length) {
        throw new Error(`Vault transit decrypt errors: ${data.errors.join(', ')}`);
      }

      const b64 = data.data.plaintext;
      if (!b64) {
        throw new Error('Vault transit decrypt returned no plaintext');
      }

      return Buffer.from(b64, 'base64').toString('utf-8');
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Vault transit')) {
        throw error;
      }
      throw new Error(`Vault transit decrypt error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  /**
   * Encrypt sensitive fields in a credentials object.
   * Returns a copy with oidcClientSecret, opalToken, spokeToken encrypted.
   */
  async encryptCredentials<T extends Record<string, unknown>>(
    credentials: T,
    keyName: string = DEFAULT_KEY_NAME,
  ): Promise<{ credentials: T; encrypted: boolean }> {
    const sensitiveFields = ['oidcClientSecret', 'opalToken', 'spokeToken'];
    const copy = { ...credentials };
    let allEncrypted = true;

    for (const field of sensitiveFields) {
      const value = copy[field];
      if (typeof value === 'string' && value.length > 0 && !this.isEncrypted(value)) {
        const result = await this.encrypt(value, keyName);
        (copy as Record<string, unknown>)[field] = result.ciphertext;
        if (!result.encrypted) allEncrypted = false;
      }
    }

    return { credentials: copy, encrypted: allEncrypted };
  }

  /**
   * Decrypt sensitive fields in a credentials object.
   * Returns a copy with oidcClientSecret, opalToken, spokeToken decrypted.
   */
  async decryptCredentials<T extends Record<string, unknown>>(
    credentials: T,
    keyName: string = DEFAULT_KEY_NAME,
  ): Promise<T> {
    const sensitiveFields = ['oidcClientSecret', 'opalToken', 'spokeToken'];
    const copy = { ...credentials };

    for (const field of sensitiveFields) {
      const value = copy[field];
      if (typeof value === 'string' && this.isEncrypted(value)) {
        (copy as Record<string, unknown>)[field] = await this.decrypt(value, keyName);
      }
    }

    return copy;
  }
}

export const vaultTransitService = VaultTransitService.getInstance();
