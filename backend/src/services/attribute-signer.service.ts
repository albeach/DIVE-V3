/**
 * NATO Compliance: ADatP-5663 §5.4.2 - Attribute Signing
 * Phase 4, Task 4.2
 * 
 * JWS (RFC 7515) signing for attribute payloads.
 */

import * as jose from 'jose';
import { logger } from '../utils/logger';
import { promises as fs } from 'fs';
import * as path from 'path';

interface AttributePayload {
  sub: string;                        // Subject (uniqueID)
  iss: string;                        // Issuer (AA identifier)
  iat: number;                        // Issued at (Unix timestamp)
  exp: number;                        // Expiration (Unix timestamp)
  attributes: Record<string, any>;    // Attribute values
  attributeSources?: Record<string, string>; // Source per attribute (LDAP, DB, computed)
}

export class AttributeSignerService {
  private privateKey?: jose.KeyLike;
  private publicKey?: jose.KeyLike;
  private keyId = 'dive-aa-2025';

  constructor() {
    this.loadOrGenerateKeys();
  }

  /**
   * Loads or generates AA signing key pair
   */
  private async loadOrGenerateKeys(): Promise<void> {
    const keyPath = path.join(__dirname, '../../keys/aa-private-key.pem');
    const pubKeyPath = path.join(__dirname, '../../keys/aa-public-key.pem');

    try {
      // Try to load existing keys
      const privateKeyPem = await fs.readFile(keyPath, 'utf-8');
      const publicKeyPem = await fs.readFile(pubKeyPath, 'utf-8');

      this.privateKey = await jose.importPKCS8(privateKeyPem, 'RS256');
      this.publicKey = await jose.importSPKI(publicKeyPem, 'RS256');

      logger.info('✅ AA signing keys loaded from disk');
    } catch (error) {
      // Generate new key pair
      logger.info('Generating new AA signing key pair...');

      const { publicKey, privateKey } = await jose.generateKeyPair('RS256', {
        modulusLength: 4096,
      });

      this.privateKey = privateKey;
      this.publicKey = publicKey;

      // Export and save keys
      const privateKeyPem = await jose.exportPKCS8(privateKey);
      const publicKeyPem = await jose.exportSPKI(publicKey);

      await fs.mkdir(path.dirname(keyPath), { recursive: true });
      await fs.writeFile(keyPath, privateKeyPem, { mode: 0o600 });
      await fs.writeFile(pubKeyPath, publicKeyPem, { mode: 0o644 });

      logger.info('✅ AA signing keys generated and saved');
    }
  }

  /**
   * Signs attribute payload with JWS Compact Serialization
   */
  async signPayload(payload: AttributePayload): Promise<string> {
    if (!this.privateKey) {
      throw new Error('AA private key not initialized');
    }

    try {
      const jws = await new jose.SignJWT({ ...payload })
        .setProtectedHeader({
          alg: 'RS256',
          typ: 'JWT',
          kid: this.keyId,
        })
        .setIssuer(payload.iss)
        .setSubject(payload.sub)
        .setIssuedAt(payload.iat)
        .setExpirationTime(payload.exp)
        .sign(this.privateKey);

      logger.debug(`Signed attribute payload for ${payload.sub}`);
      return jws;
    } catch (error) {
      logger.error(`JWS signing failed: ${error}`);
      throw new Error(`Failed to sign attributes: ${(error as Error).message}`);
    }
  }

  /**
   * Verifies JWS signature
   */
  async verifySignature(jws: string): Promise<{
    valid: boolean;
    payload?: AttributePayload;
    error?: string;
  }> {
    if (!this.publicKey) {
      return { valid: false, error: 'AA public key not initialized' };
    }

    try {
      const { payload, protectedHeader } = await jose.jwtVerify(
        jws,
        this.publicKey,
        {
          issuer: 'dive-attribute-authority',
        }
      );

      // Verify key ID matches
      if (protectedHeader.kid !== this.keyId) {
        return {
          valid: false,
          error: `Key ID mismatch: ${protectedHeader.kid} != ${this.keyId}`,
        };
      }

      return {
        valid: true,
        payload: payload as unknown as AttributePayload,
      };
    } catch (error) {
      return {
        valid: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Exports public key as JWK
   */
  async exportPublicJWK(): Promise<jose.JWK> {
    if (!this.publicKey) {
      throw new Error('AA public key not initialized');
    }

    const jwk = await jose.exportJWK(this.publicKey);
    
    return {
      ...jwk,
      use: 'sig',
      kid: this.keyId,
      alg: 'RS256',
    };
  }

  /**
   * Exports public JWKS (JSON Web Key Set)
   */
  async exportPublicJWKS(): Promise<jose.JSONWebKeySet> {
    const jwk = await this.exportPublicJWK();
    return {
      keys: [jwk],
    };
  }
}

export const attributeSignerService = new AttributeSignerService();
