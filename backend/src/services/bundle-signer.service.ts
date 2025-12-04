/**
 * DIVE V3 - Bundle Signer Service
 * Phase 7: Production Hardening
 * 
 * Provides cryptographic signing for OPA policy bundles with:
 * - RSA-4096 key pair management
 * - Bundle signing with SHA-256
 * - Signature verification
 * - Key rotation support
 * - GCP Secret Manager integration for private keys
 * 
 * OPA Bundle Signing Specification:
 * - Signs the bundle tarball with RSA-PSS
 * - Creates detached signature file (.sig)
 * - Includes public key for verification
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export interface ISigningKey {
  /** Private key PEM */
  privateKey: string;
  /** Public key PEM */
  publicKey: string;
  /** Key ID (fingerprint) */
  keyId: string;
  /** Creation date */
  createdAt: string;
  /** Expiration date */
  expiresAt?: string;
  /** Key algorithm */
  algorithm: 'RSA-PSS' | 'RSA-PKCS1-v1_5';
  /** Key size in bits */
  keySize: number;
}

export interface ISignatureResult {
  /** Success flag */
  success: boolean;
  /** Signature (base64) */
  signature?: string;
  /** Key ID used */
  keyId?: string;
  /** Timestamp */
  timestamp?: string;
  /** Error message */
  error?: string;
}

export interface IVerificationResult {
  /** Verification success */
  valid: boolean;
  /** Key ID used */
  keyId?: string;
  /** Timestamp when signed */
  signedAt?: string;
  /** Error message */
  error?: string;
}

export interface IBundleSignatureManifest {
  /** Bundle revision */
  revision: string;
  /** Tenant ID */
  tenant: string;
  /** Checksum of bundle (SHA-256) */
  bundleChecksum: string;
  /** Signature (base64) */
  signature: string;
  /** Key ID used for signing */
  keyId: string;
  /** Signing timestamp */
  signedAt: string;
  /** Algorithm used */
  algorithm: string;
  /** Public key PEM */
  publicKey: string;
}

// ============================================
// CONFIGURATION
// ============================================

const DEFAULT_KEY_SIZE = 4096;
const SIGNING_ALGORITHM = 'RSA-PSS';
const HASH_ALGORITHM = 'sha256';
const SALT_LENGTH = 32;

// GCP Secret name for signing key
const GCP_SIGNING_KEY_SECRET = 'dive-v3-bundle-signing-key';
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'dive25';

// ============================================
// BUNDLE SIGNER SERVICE
// ============================================

class BundleSignerService {
  private signingKey: ISigningKey | null = null;
  private initialized: boolean = false;

  constructor() {
    logger.info('Bundle signer service created');
  }

  /**
   * Initialize the signing service
   * Loads key from GCP Secret Manager or local file
   */
  async initialize(options: {
    keySource: 'gcp' | 'file' | 'generate';
    keyPath?: string;
    generateIfMissing?: boolean;
  }): Promise<void> {
    if (this.initialized) {
      logger.debug('Bundle signer already initialized');
      return;
    }

    const { keySource, keyPath, generateIfMissing = false } = options;

    try {
      switch (keySource) {
        case 'gcp':
          await this.loadKeyFromGCP();
          break;
        case 'file':
          if (!keyPath) {
            throw new Error('keyPath required for file source');
          }
          await this.loadKeyFromFile(keyPath);
          break;
        case 'generate':
          this.signingKey = this.generateKeyPair();
          break;
      }

      // If key not loaded and generateIfMissing is true, generate new key
      if (!this.signingKey && generateIfMissing) {
        logger.warn('No signing key found, generating new key pair');
        this.signingKey = this.generateKeyPair();
        
        // Save to file if path provided
        if (keyPath) {
          await this.saveKeyToFile(keyPath);
        }
      }

      if (!this.signingKey) {
        throw new Error('Failed to initialize signing key');
      }

      this.initialized = true;
      logger.info('Bundle signer initialized', {
        keyId: this.signingKey.keyId,
        algorithm: this.signingKey.algorithm,
        keySize: this.signingKey.keySize,
      });
    } catch (error) {
      logger.error('Failed to initialize bundle signer', { error });
      throw error;
    }
  }

  /**
   * Load signing key from GCP Secret Manager
   */
  private async loadKeyFromGCP(): Promise<void> {
    try {
      const { execSync } = await import('child_process');
      
      // Try to fetch private key from GCP
      const privateKey = execSync(
        `gcloud secrets versions access latest --secret=${GCP_SIGNING_KEY_SECRET} --project=${GCP_PROJECT_ID}`,
        { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();

      // Derive public key from private key
      const publicKey = crypto
        .createPublicKey(privateKey)
        .export({ type: 'spki', format: 'pem' }) as string;

      // Calculate key ID (fingerprint of public key)
      const keyId = this.calculateKeyId(publicKey);

      this.signingKey = {
        privateKey,
        publicKey,
        keyId,
        createdAt: new Date().toISOString(),
        algorithm: SIGNING_ALGORITHM,
        keySize: DEFAULT_KEY_SIZE,
      };

      logger.info('Loaded signing key from GCP Secret Manager', { keyId });
    } catch (error) {
      logger.warn('Failed to load signing key from GCP', { error });
      throw error;
    }
  }

  /**
   * Load signing key from local file
   */
  private async loadKeyFromFile(keyPath: string): Promise<void> {
    const privateKeyPath = keyPath.endsWith('.pem') ? keyPath : `${keyPath}.pem`;
    const publicKeyPath = privateKeyPath.replace('.pem', '.pub.pem');

    if (!fs.existsSync(privateKeyPath)) {
      throw new Error(`Private key file not found: ${privateKeyPath}`);
    }

    const privateKey = fs.readFileSync(privateKeyPath, 'utf-8');
    
    let publicKey: string;
    if (fs.existsSync(publicKeyPath)) {
      publicKey = fs.readFileSync(publicKeyPath, 'utf-8');
    } else {
      // Derive public key from private key
      publicKey = crypto
        .createPublicKey(privateKey)
        .export({ type: 'spki', format: 'pem' }) as string;
    }

    const keyId = this.calculateKeyId(publicKey);

    this.signingKey = {
      privateKey,
      publicKey,
      keyId,
      createdAt: new Date().toISOString(),
      algorithm: SIGNING_ALGORITHM,
      keySize: DEFAULT_KEY_SIZE,
    };

    logger.info('Loaded signing key from file', { keyPath: privateKeyPath, keyId });
  }

  /**
   * Save signing key to file
   */
  private async saveKeyToFile(keyPath: string): Promise<void> {
    if (!this.signingKey) {
      throw new Error('No signing key to save');
    }

    const privateKeyPath = keyPath.endsWith('.pem') ? keyPath : `${keyPath}.pem`;
    const publicKeyPath = privateKeyPath.replace('.pem', '.pub.pem');

    // Ensure directory exists
    fs.mkdirSync(path.dirname(privateKeyPath), { recursive: true });

    // Save private key (with restrictive permissions)
    fs.writeFileSync(privateKeyPath, this.signingKey.privateKey, { mode: 0o600 });
    
    // Save public key
    fs.writeFileSync(publicKeyPath, this.signingKey.publicKey, { mode: 0o644 });
    logger.info('Saved signing key to file', { privateKeyPath, publicKeyPath });
  }

  /**
   * Generate new RSA key pair
   */
  generateKeyPair(keySize: number = DEFAULT_KEY_SIZE): ISigningKey {
    logger.info('Generating new RSA key pair', { keySize });

    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: keySize,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    const keyId = this.calculateKeyId(publicKey);

    return {
      privateKey,
      publicKey,
      keyId,
      createdAt: new Date().toISOString(),
      algorithm: SIGNING_ALGORITHM,
      keySize,
    };
  }

  /**
   * Calculate key ID (fingerprint)
   */
  private calculateKeyId(publicKey: string): string {
    const hash = crypto.createHash('sha256').update(publicKey).digest('hex');
    return hash.substring(0, 16);
  }

  /**
   * Sign data with private key
   */
  sign(data: Buffer | string): ISignatureResult {
    if (!this.signingKey) {
      return { success: false, error: 'Signing key not initialized' };
    }

    try {
      const dataBuffer = typeof data === 'string' ? Buffer.from(data) : data;
      
      const signature = crypto.sign(HASH_ALGORITHM, dataBuffer, {
        key: this.signingKey.privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: SALT_LENGTH,
      });

      return {
        success: true,
        signature: signature.toString('base64'),
        keyId: this.signingKey.keyId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to sign data', { error });
      return { success: false, error: String(error) };
    }
  }

  /**
   * Verify signature with public key
   */
  verify(data: Buffer | string, signature: string, publicKey?: string): IVerificationResult {
    try {
      const dataBuffer = typeof data === 'string' ? Buffer.from(data) : data;
      const signatureBuffer = Buffer.from(signature, 'base64');
      
      const keyToUse = publicKey || this.signingKey?.publicKey;
      if (!keyToUse) {
        return { valid: false, error: 'No public key available for verification' };
      }

      const valid = crypto.verify(HASH_ALGORITHM, dataBuffer, {
        key: keyToUse,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: SALT_LENGTH,
      }, signatureBuffer);

      return {
        valid,
        keyId: this.signingKey?.keyId,
      };
    } catch (error) {
      logger.error('Failed to verify signature', { error });
      return { valid: false, error: String(error) };
    }
  }

  /**
   * Sign an OPA bundle file
   */
  async signBundle(bundlePath: string): Promise<IBundleSignatureManifest | null> {
    if (!this.signingKey) {
      logger.error('Cannot sign bundle: signing key not initialized');
      return null;
    }

    if (!fs.existsSync(bundlePath)) {
      logger.error('Bundle file not found', { bundlePath });
      return null;
    }

    try {
      // Read bundle file
      const bundleData = fs.readFileSync(bundlePath);
      
      // Calculate checksum
      const bundleChecksum = crypto
        .createHash('sha256')
        .update(bundleData)
        .digest('hex');

      // Sign the bundle
      const signResult = this.sign(bundleData);
      if (!signResult.success || !signResult.signature) {
        throw new Error(signResult.error || 'Failed to sign bundle');
      }

      // Extract revision from manifest if available
      let revision = 'unknown';
      const manifestPath = bundlePath.replace('bundle.tar.gz', 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        revision = manifest.revision || revision;
      }

      // Extract tenant from path
      const pathParts = bundlePath.split(path.sep);
      const bundlesIndex = pathParts.indexOf('bundles');
      const tenant = bundlesIndex >= 0 ? pathParts[bundlesIndex + 1]?.toUpperCase() || 'UNKNOWN' : 'UNKNOWN';

      const signatureManifest: IBundleSignatureManifest = {
        revision,
        tenant,
        bundleChecksum,
        signature: signResult.signature,
        keyId: this.signingKey.keyId,
        signedAt: signResult.timestamp!,
        algorithm: `${SIGNING_ALGORITHM}-${HASH_ALGORITHM.toUpperCase()}`,
        publicKey: this.signingKey.publicKey,
      };

      // Write signature manifest
      const sigManifestPath = bundlePath.replace('bundle.tar.gz', 'signature.json');
      fs.writeFileSync(sigManifestPath, JSON.stringify(signatureManifest, null, 2));

      // Write detached signature file
      const sigPath = `${bundlePath}.sig`;
      fs.writeFileSync(sigPath, signResult.signature);

      logger.info('Bundle signed successfully', {
        bundlePath,
        keyId: this.signingKey.keyId,
        checksum: bundleChecksum.substring(0, 16) + '...',
      });

      return signatureManifest;
    } catch (error) {
      logger.error('Failed to sign bundle', { bundlePath, error });
      return null;
    }
  }

  /**
   * Verify a signed bundle
   */
  async verifyBundle(bundlePath: string): Promise<IVerificationResult> {
    const sigManifestPath = bundlePath.replace('bundle.tar.gz', 'signature.json');
    
    if (!fs.existsSync(bundlePath)) {
      return { valid: false, error: 'Bundle file not found' };
    }

    if (!fs.existsSync(sigManifestPath)) {
      return { valid: false, error: 'Signature manifest not found' };
    }

    try {
      const bundleData = fs.readFileSync(bundlePath);
      const sigManifest: IBundleSignatureManifest = JSON.parse(
        fs.readFileSync(sigManifestPath, 'utf-8')
      );

      // Verify checksum first
      const actualChecksum = crypto
        .createHash('sha256')
        .update(bundleData)
        .digest('hex');

      if (actualChecksum !== sigManifest.bundleChecksum) {
        return {
          valid: false,
          error: 'Bundle checksum mismatch - file may have been modified',
        };
      }

      // Verify signature
      const verifyResult = this.verify(
        bundleData,
        sigManifest.signature,
        sigManifest.publicKey
      );

      if (verifyResult.valid) {
        logger.info('Bundle signature verified', {
          bundlePath,
          keyId: sigManifest.keyId,
          signedAt: sigManifest.signedAt,
        });
      }

      return {
        ...verifyResult,
        keyId: sigManifest.keyId,
        signedAt: sigManifest.signedAt,
      };
    } catch (error) {
      logger.error('Failed to verify bundle signature', { bundlePath, error });
      return { valid: false, error: String(error) };
    }
  }

  /**
   * Get current signing key info (without private key)
   */
  getKeyInfo(): Omit<ISigningKey, 'privateKey'> | null {
    if (!this.signingKey) return null;

    const { privateKey, ...keyInfo } = this.signingKey;
    return keyInfo;
  }

  /**
   * Get public key PEM
   */
  getPublicKey(): string | null {
    return this.signingKey?.publicKey || null;
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Rotate signing key
   */
  async rotateKey(saveToFile?: string): Promise<ISigningKey> {
    logger.warn('Rotating signing key');
    
    const oldKeyId = this.signingKey?.keyId;
    this.signingKey = this.generateKeyPair();
    
    if (saveToFile) {
      await this.saveKeyToFile(saveToFile);
    }

    logger.info('Signing key rotated', {
      oldKeyId,
      newKeyId: this.signingKey.keyId,
    });

    return this.signingKey;
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const bundleSignerService = new BundleSignerService();

export default BundleSignerService;


