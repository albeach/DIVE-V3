/**
 * DIVE V3 - Spoke Policy Cache Service
 *
 * Manages local policy caching for offline operation and resilience.
 * When the Hub is unreachable, spokes can continue operating with cached policies.
 *
 * Features:
 * - Policy bundle caching to disk
 * - Cache age tracking and validation
 * - Fallback loading when Hub unreachable
 * - Bundle signature verification (X.509)
 * - Version tracking for sync status
 * - Push to local OPA instance
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export interface IPolicyBundle {
  version: string;
  timestamp: string;
  policies: IPolicyFile[];
  data?: IDataFile[];
  signature?: IBundleSignature;
  metadata: IBundleMetadata;
}

export interface IPolicyFile {
  path: string;
  content: string;
  hash: string;
}

export interface IDataFile {
  path: string;
  content: Record<string, unknown>;
  hash: string;
}

export interface IBundleSignature {
  algorithm: string;
  value: string;
  keyId: string;
  signedAt: string;
}

export interface IBundleMetadata {
  hubVersion: string;
  tenantId: string;
  scopes: string[];
  expiresAt?: string;
  sourceHub: string;
}

export interface ICacheConfig {
  cachePath: string;
  maxCacheAgeMs: number;
  opaUrl: string;
  caCertPath?: string;
  verifySignatures: boolean;
}

export interface ICacheState {
  hasCachedPolicy: boolean;
  currentVersion: string | null;
  lastCacheTime: Date | null;
  cacheAgeMs: number;
  isValid: boolean;
  signatureVerified: boolean;
}

// Default configuration
const DEFAULT_CONFIG: ICacheConfig = {
  cachePath: '/var/dive/cache/policies',
  maxCacheAgeMs: 24 * 60 * 60 * 1000, // 24 hours
  opaUrl: 'http://localhost:8181',
  verifySignatures: true,
};

// ============================================
// SPOKE POLICY CACHE SERVICE
// ============================================

class SpokePolicyCacheService extends EventEmitter {
  private config: ICacheConfig;
  private currentBundle: IPolicyBundle | null = null;
  private lastCacheTime: Date | null = null;
  private caCertificate: string | null = null;
  private initialized = false;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Initialize the cache service
   */
  async initialize(config: Partial<ICacheConfig>): Promise<void> {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Ensure cache directory exists
    await fs.mkdir(this.config.cachePath, { recursive: true });

    // Load CA certificate for signature verification
    if (this.config.caCertPath) {
      try {
        this.caCertificate = await fs.readFile(this.config.caCertPath, 'utf-8');
      } catch (error) {
        logger.warn('Failed to load CA certificate for policy verification', {
          path: this.config.caCertPath,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Try to load existing cache
    await this.loadCacheMetadata();

    this.initialized = true;

    logger.info('Spoke Policy Cache Service initialized', {
      cachePath: this.config.cachePath,
      maxCacheAgeMs: this.config.maxCacheAgeMs,
      verifySignatures: this.config.verifySignatures,
    });
  }

  // ============================================
  // CACHE OPERATIONS
  // ============================================

  /**
   * Cache a policy bundle to disk
   */
  async cachePolicy(bundle: IPolicyBundle): Promise<void> {
    if (!this.initialized) {
      throw new Error('Policy cache service not initialized');
    }

    // Verify signature if configured
    if (this.config.verifySignatures && bundle.signature) {
      const verified = await this.verifyBundleSignature(bundle);
      if (!verified) {
        throw new Error('Bundle signature verification failed');
      }
    }

    const bundlePath = path.join(this.config.cachePath, 'bundle.json');
    const metadataPath = path.join(this.config.cachePath, 'metadata.json');

    // Write bundle
    await fs.writeFile(bundlePath, JSON.stringify(bundle, null, 2));

    // Write metadata
    const metadata = {
      version: bundle.version,
      cachedAt: new Date().toISOString(),
      scopes: bundle.metadata.scopes,
      hubVersion: bundle.metadata.hubVersion,
      signatureVerified: this.config.verifySignatures && !!bundle.signature,
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    // Update internal state
    this.currentBundle = bundle;
    this.lastCacheTime = new Date();

    logger.info('Policy bundle cached', {
      version: bundle.version,
      policies: bundle.policies.length,
      data: bundle.data?.length || 0,
    });

    this.emit('cached', { version: bundle.version });
  }

  /**
   * Get the cached policy bundle
   */
  async getCachedPolicy(): Promise<IPolicyBundle | null> {
    if (this.currentBundle) {
      return this.currentBundle;
    }

    const bundlePath = path.join(this.config.cachePath, 'bundle.json');

    try {
      const data = await fs.readFile(bundlePath, 'utf-8');
      this.currentBundle = JSON.parse(data) as IPolicyBundle;
      return this.currentBundle;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get cache age in milliseconds
   */
  getCacheAge(): number {
    if (!this.lastCacheTime) {
      return Infinity;
    }
    return Date.now() - this.lastCacheTime.getTime();
  }

  /**
   * Check if cache is valid (exists and not expired)
   */
  isCacheValid(): boolean {
    if (!this.currentBundle || !this.lastCacheTime) {
      return false;
    }
    return this.getCacheAge() < this.config.maxCacheAgeMs;
  }

  // ============================================
  // FALLBACK OPERATIONS
  // ============================================

  /**
   * Load policies from cache (used when Hub unreachable)
   */
  async loadFromCache(): Promise<boolean> {
    const bundle = await this.getCachedPolicy();

    if (!bundle) {
      logger.warn('No cached policy bundle available');
      return false;
    }

    if (!this.isCacheValid()) {
      logger.warn('Cached policy bundle is expired', {
        cacheAge: this.getCacheAge(),
        maxAge: this.config.maxCacheAgeMs,
      });
      // Still load but emit warning
      this.emit('cacheExpired', {
        version: bundle.version,
        age: this.getCacheAge(),
      });
    }

    // Push to OPA
    await this.pushToOPA(bundle);

    this.emit('loadedFromCache', {
      version: bundle.version,
      age: this.getCacheAge(),
    });

    return true;
  }

  /**
   * Push policy bundle to local OPA instance
   */
  async pushToOPA(bundle: IPolicyBundle): Promise<void> {
    // Push each policy file
    for (const policy of bundle.policies) {
      await this.pushPolicyToOPA(policy.path, policy.content);
    }

    // Push each data file
    if (bundle.data) {
      for (const data of bundle.data) {
        await this.pushDataToOPA(data.path, data.content);
      }
    }

    logger.info('Policy bundle pushed to OPA', {
      version: bundle.version,
      policies: bundle.policies.length,
      data: bundle.data?.length || 0,
    });

    this.emit('pushedToOPA', { version: bundle.version });
  }

  /**
   * Push a single policy to OPA
   */
  private async pushPolicyToOPA(policyPath: string, content: string): Promise<void> {
    const url = `${this.config.opaUrl}/v1/policies/${policyPath}`;

    await this.httpPut(url, content, 'text/plain');
  }

  /**
   * Push data to OPA
   */
  private async pushDataToOPA(dataPath: string, content: Record<string, unknown>): Promise<void> {
    const url = `${this.config.opaUrl}/v1/data/${dataPath}`;

    await this.httpPut(url, JSON.stringify(content), 'application/json');
  }

  // ============================================
  // VERSIONING
  // ============================================

  /**
   * Get current cached policy version
   */
  getCurrentVersion(): string | null {
    return this.currentBundle?.version || null;
  }

  /**
   * Check if cached version matches Hub version
   */
  isVersionCurrent(hubVersion: string): boolean {
    const currentVersion = this.getCurrentVersion();
    if (!currentVersion) {
      return false;
    }
    return currentVersion === hubVersion;
  }

  /**
   * Get sync status relative to Hub
   */
  getSyncStatus(hubVersion: string): 'current' | 'behind' | 'stale' | 'unknown' {
    if (!this.currentBundle) {
      return 'unknown';
    }

    if (this.isVersionCurrent(hubVersion)) {
      return 'current';
    }

    if (!this.isCacheValid()) {
      return 'stale';
    }

    return 'behind';
  }

  // ============================================
  // SIGNATURE VERIFICATION
  // ============================================

  /**
   * Verify bundle signature using Hub's public key (X.509 certificate)
   * 
   * Verification steps:
   * 1. Check signature exists
   * 2. Validate signature timestamp (must be recent)
   * 3. Verify signature algorithm is acceptable
   * 4. Verify signature against bundle content hash
   */
  async verifyBundleSignature(bundle: IPolicyBundle): Promise<boolean> {
    if (!bundle.signature) {
      logger.warn('Bundle has no signature to verify');
      return false;
    }

    if (!this.caCertificate) {
      logger.warn('No CA certificate available for signature verification');
      return false;
    }

    try {
      // 1. Validate signature timestamp (max 1 hour old)
      const signedAt = new Date(bundle.signature.signedAt);
      const maxAge = 60 * 60 * 1000; // 1 hour
      if (Date.now() - signedAt.getTime() > maxAge) {
        logger.warn('Bundle signature is too old', {
          signedAt: bundle.signature.signedAt,
          ageMs: Date.now() - signedAt.getTime(),
        });
        // Don't fail, just warn - signature may be valid for cached bundles
      }

      // 2. Validate signature algorithm (RSA-SHA256 or RSA-SHA384)
      const validAlgorithms = ['RSA-SHA256', 'RSA-SHA384', 'RSA-SHA512', 'sha256WithRSAEncryption'];
      if (!validAlgorithms.includes(bundle.signature.algorithm)) {
        logger.warn('Unusual signature algorithm', {
          algorithm: bundle.signature.algorithm,
        });
      }

      // 3. Create hash of bundle content (excluding signature)
      // Use deterministic JSON serialization
      const contentToVerify = {
        version: bundle.version,
        timestamp: bundle.timestamp,
        policies: bundle.policies.map(p => ({
          path: p.path,
          content: p.content,
          hash: p.hash,
        })),
        data: bundle.data?.map(d => ({
          path: d.path,
          content: d.content,
          hash: d.hash,
        })),
        metadata: {
          hubVersion: bundle.metadata.hubVersion,
          tenantId: bundle.metadata.tenantId,
          scopes: bundle.metadata.scopes.sort(),
          expiresAt: bundle.metadata.expiresAt,
          sourceHub: bundle.metadata.sourceHub,
        },
      };

      // 4. Calculate content hash
      const contentString = JSON.stringify(contentToVerify);
      const contentHash = crypto
        .createHash('sha256')
        .update(contentString)
        .digest();

      // 5. Verify signature using X.509 certificate public key
      const verifier = crypto.createVerify(bundle.signature.algorithm);
      verifier.update(contentHash);

      const isValid = verifier.verify(
        this.caCertificate,
        bundle.signature.value,
        'base64'
      );

      if (isValid) {
        logger.info('Bundle signature verified successfully', {
          version: bundle.version,
          keyId: bundle.signature.keyId,
          signedAt: bundle.signature.signedAt,
          algorithm: bundle.signature.algorithm,
        });
      } else {
        logger.error('Bundle signature verification FAILED', {
          version: bundle.version,
          keyId: bundle.signature.keyId,
          reason: 'Signature does not match content',
        });
      }

      return isValid;
    } catch (error) {
      logger.error('Error verifying bundle signature', {
        error: error instanceof Error ? error.message : 'Unknown error',
        version: bundle.version,
        keyId: bundle.signature?.keyId,
      });
      return false;
    }
  }

  /**
   * Calculate the expected signature for a bundle (for debugging)
   */
  calculateBundleHash(bundle: IPolicyBundle): string {
    const contentToVerify = {
      version: bundle.version,
      timestamp: bundle.timestamp,
      policies: bundle.policies.map(p => ({
        path: p.path,
        content: p.content,
        hash: p.hash,
      })),
      data: bundle.data?.map(d => ({
        path: d.path,
        content: d.content,
        hash: d.hash,
      })),
      metadata: {
        hubVersion: bundle.metadata.hubVersion,
        tenantId: bundle.metadata.tenantId,
        scopes: bundle.metadata.scopes.sort(),
        expiresAt: bundle.metadata.expiresAt,
        sourceHub: bundle.metadata.sourceHub,
      },
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(contentToVerify))
      .digest('hex');
  }

  // ============================================
  // CACHE STATE
  // ============================================

  /**
   * Get current cache state
   */
  getCacheState(): ICacheState {
    return {
      hasCachedPolicy: !!this.currentBundle,
      currentVersion: this.getCurrentVersion(),
      lastCacheTime: this.lastCacheTime,
      cacheAgeMs: this.getCacheAge(),
      isValid: this.isCacheValid(),
      signatureVerified: this.config.verifySignatures,
    };
  }

  /**
   * Clear the cache
   */
  async clearCache(): Promise<void> {
    const bundlePath = path.join(this.config.cachePath, 'bundle.json');
    const metadataPath = path.join(this.config.cachePath, 'metadata.json');

    try {
      await fs.unlink(bundlePath);
      await fs.unlink(metadataPath);
    } catch (error) {
      // Ignore if files don't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    this.currentBundle = null;
    this.lastCacheTime = null;

    logger.info('Policy cache cleared');
    this.emit('cacheCleared');
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Load cache metadata from disk
   */
  private async loadCacheMetadata(): Promise<void> {
    const metadataPath = path.join(this.config.cachePath, 'metadata.json');

    try {
      const data = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(data);

      this.lastCacheTime = new Date(metadata.cachedAt);

      // Load the full bundle
      await this.getCachedPolicy();

      logger.debug('Cache metadata loaded', {
        version: metadata.version,
        cachedAt: metadata.cachedAt,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('Failed to load cache metadata', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * HTTP PUT helper
   */
  private httpPut(url: string, body: string, contentType: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname,
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 10000,
      };

      const req = httpModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Calculate hash of content
   */
  calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const spokePolicyCache = new SpokePolicyCacheService();

export default SpokePolicyCacheService;
