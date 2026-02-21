/**
 * DIVE V3 - Policy Bundle Service
 *
 * Manages OPA policy bundle building, signing, and distribution via OPAL.
 * Implements the following workflow:
 *   1. Build bundle from policies directory
 *   2. Sign bundle with RS256 key
 *   3. Publish to OPAL Server
 *   4. Track versions in MongoDB
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import zlib from 'zlib';
import { logger } from '../utils/logger';
import { opalClient } from './opal-client';
import { policyVersionStore } from '../models/policy-version.model';
import { prometheusMetrics } from './prometheus-metrics.service';

const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);
const gzip = promisify(zlib.gzip);

// ============================================
// TYPES
// ============================================

export interface IPolicyBundle {
  bundleId: string;
  version: string;
  scopes: string[];
  contents: Buffer;
  signature: string;
  signedAt: Date;
  signedBy: string;
  hash: string;
  manifest: IBundleManifest;
}

export interface IBundleManifest {
  revision: string;
  roots: string[];
  files: IBundleFile[];
  signatures?: IBundleSignature[];
}

export interface IBundleFile {
  path: string;
  hash: string;
  size: number;
}

export interface IBundleSignature {
  keyid: string;
  algorithm: string;
  signatures: string[];
}

export interface IBundleBuildOptions {
  scopes?: string[];
  includeData?: boolean;
  sign?: boolean;
  compress?: boolean;
}

export interface IBundleBuildResult {
  success: boolean;
  bundleId: string;
  version: string;
  hash: string;
  size: number;
  fileCount: number;
  signature?: string;
  error?: string;
}

export interface IBundlePublishResult {
  success: boolean;
  bundleId: string;
  version: string;
  hash?: string;
  publishedAt: Date;
  opalTransactionId?: string;
  error?: string;
}

// ============================================
// CONSTANTS
// ============================================

const getPoliciesDir = () => process.env.POLICIES_DIR || '/app/policies';
const BUNDLE_SIGNING_KEY_PATH =
  process.env.BUNDLE_SIGNING_KEY_PATH || '/app/certs/bundle-signing/bundle-signing.key';
const BUNDLE_SIGNING_ALGORITHM = process.env.BUNDLE_SIGNING_ALGORITHM || 'RS256';
const BUNDLE_KEYID = 'dive-v3-bundle-signer';

// Policy directories to include in bundles
const POLICY_DIRS = ['base', 'org', 'tenant', 'entrypoints', 'compat'];

// Scope to directory mapping
const SCOPE_DIR_MAP: Record<string, string[]> = {
  'policy:base': ['base'],
  'policy:fvey': ['org/fvey'],
  'policy:nato': ['org/nato'],
  'policy:usa': ['tenant/usa'],
  'policy:fra': ['tenant/fra'],
  'policy:gbr': ['tenant/gbr'],
  'policy:deu': ['tenant/deu'],
};

// ============================================
// POLICY BUNDLE SERVICE
// ============================================

export class PolicyBundleService {
  private signingKey: crypto.KeyObject | null = null;
  private signingKeyLoaded = false;
  private currentBundle: IPolicyBundle | null = null;

  constructor() {
    logger.info('Policy Bundle Service initialized', {
      policiesDir: getPoliciesDir(),
      signingAlgorithm: BUNDLE_SIGNING_ALGORITHM,
    });
  }

  // ============================================
  // SIGNING KEY MANAGEMENT
  // ============================================

  /**
   * Load the bundle signing key
   */
  private async loadSigningKey(): Promise<void> {
    if (this.signingKeyLoaded) return;

    try {
      // Check if key file exists
      if (!fs.existsSync(BUNDLE_SIGNING_KEY_PATH)) {
        logger.warn('Bundle signing key not found', {
          path: BUNDLE_SIGNING_KEY_PATH,
        });
        return;
      }

      const keyData = await readFile(BUNDLE_SIGNING_KEY_PATH, 'utf8');
      this.signingKey = crypto.createPrivateKey(keyData);
      this.signingKeyLoaded = true;

      logger.info('Bundle signing key loaded successfully');
    } catch (error) {
      logger.error('Failed to load bundle signing key', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: BUNDLE_SIGNING_KEY_PATH,
      });
    }
  }

  /**
   * Sign data with the bundle signing key
   */
  private sign(data: Buffer | string): string {
    if (!this.signingKey) {
      throw new Error('Signing key not loaded');
    }

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(data);
    return signer.sign(this.signingKey, 'base64');
  }

  // ============================================
  // BUNDLE BUILDING
  // ============================================

  /**
   * Build a policy bundle from the policies directory
   */
  async buildBundle(options: IBundleBuildOptions = {}): Promise<IBundleBuildResult> {
    const bundleId = `bundle-${crypto.randomBytes(4).toString('hex')}`;
    const version = this.generateVersion();
    const buildStartTime = Date.now();

    try {
      logger.info('Building policy bundle', {
        bundleId,
        version,
        scopes: options.scopes || ['all'],
        sign: options.sign ?? true,
      });

      // Load signing key if signing is enabled
      if (options.sign !== false) {
        await this.loadSigningKey();
      }

      // Collect policy files
      const files = await this.collectPolicyFiles(options.scopes);

      if (files.length === 0) {
        return {
          success: false,
          bundleId,
          version,
          hash: '',
          size: 0,
          fileCount: 0,
          error: 'No policy files found',
        };
      }

      // Build manifest
      const manifest: IBundleManifest = {
        revision: version,
        roots: this.getRoots(options.scopes),
        files: files.map((f) => ({
          path: f.relativePath,
          hash: f.hash,
          size: f.size,
        })),
      };

      // Create tarball content (simplified - actual implementation would use tar)
      const bundleContent = await this.createBundleContent(files, manifest, options.includeData);

      // Calculate bundle hash
      const bundleHash = crypto.createHash('sha256').update(bundleContent).digest('hex');

      // Sign the bundle if enabled
      let signature: string | undefined;
      if (options.sign !== false && this.signingKey) {
        signature = this.sign(bundleContent);
        manifest.signatures = [
          {
            keyid: BUNDLE_KEYID,
            algorithm: BUNDLE_SIGNING_ALGORITHM,
            signatures: [signature],
          },
        ];

        logger.debug('Bundle signed', { keyid: BUNDLE_KEYID });
      }

      // Compress if enabled
      let finalContent = bundleContent;
      if (options.compress !== false) {
        finalContent = await gzip(bundleContent);
      }

      // Store current bundle
      this.currentBundle = {
        bundleId,
        version,
        scopes: options.scopes || ['all'],
        contents: finalContent,
        signature: signature || '',
        signedAt: new Date(),
        signedBy: BUNDLE_KEYID,
        hash: bundleHash,
        manifest,
      };

      logger.info('Policy bundle built successfully', {
        bundleId,
        version,
        hash: bundleHash.substring(0, 16),
        size: finalContent.length,
        fileCount: files.length,
        signed: !!signature,
      });

      // Record Prometheus metrics
      const buildDurationMs = Date.now() - buildStartTime;
      prometheusMetrics.recordPolicyBundleBuild({
        signed: !!signature,
        durationMs: buildDurationMs,
      });
      prometheusMetrics.setPolicyBundleMetrics({
        size: finalContent.length,
        signed: !!signature,
      });

      // Persist version to MongoDB
      try {
        await policyVersionStore.saveVersion(
          {
            version,
            timestamp: new Date(),
            hash: bundleHash.substring(0, 16),
            layers: {
              base: version,
              org: {},
              tenant: {},
            },
          },
          {
            bundleHash: bundleHash,
            bundleSize: finalContent.length,
            bundleSigned: !!signature,
            description: `Bundle ${bundleId} with ${files.length} files`,
          }
        );
        logger.info('Policy version persisted to MongoDB', { version, bundleId });
      } catch (persistError) {
        logger.warn('Failed to persist policy version to MongoDB', {
          error: persistError instanceof Error ? persistError.message : 'Unknown error',
        });
      }

      return {
        success: true,
        bundleId,
        version,
        hash: bundleHash,
        size: finalContent.length,
        fileCount: files.length,
        signature,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Failed to build policy bundle', {
        bundleId,
        error: errorMessage,
      });

      return {
        success: false,
        bundleId,
        version,
        hash: '',
        size: 0,
        fileCount: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Collect policy files from the policies directory
   */
  private async collectPolicyFiles(
    scopes?: string[]
  ): Promise<Array<{ relativePath: string; content: Buffer; hash: string; size: number }>> {
    const files: Array<{ relativePath: string; content: Buffer; hash: string; size: number }> = [];

    // Determine which directories to include based on scopes
    let dirsToInclude = POLICY_DIRS;
    if (scopes && scopes.length > 0 && !scopes.includes('all')) {
      dirsToInclude = [];
      for (const scope of scopes) {
        const dirs = SCOPE_DIR_MAP[scope];
        if (dirs) {
          dirsToInclude.push(...dirs);
        }
      }
      // Always include base policies
      if (!dirsToInclude.includes('base')) {
        dirsToInclude.push('base');
      }
    }

    // Recursively collect .rego files
    for (const dir of dirsToInclude) {
      const dirPath = path.join(getPoliciesDir(), dir);
      if (fs.existsSync(dirPath)) {
        await this.collectFilesRecursive(dirPath, dir, files);
      }
    }

    return files;
  }

  /**
   * Recursively collect files from a directory
   */
  private async collectFilesRecursive(
    dirPath: string,
    relativePath: string,
    files: Array<{ relativePath: string; content: Buffer; hash: string; size: number }>
  ): Promise<void> {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const entryRelativePath = path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        // Skip test directories
        if (entry.name === 'tests' || entry.name === '__tests__') {
          continue;
        }
        await this.collectFilesRecursive(fullPath, entryRelativePath, files);
      } else if (entry.name.endsWith('.rego') && !entry.name.endsWith('_test.rego')) {
        const content = await readFile(fullPath);
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        const fileStat = await stat(fullPath);

        files.push({
          relativePath: entryRelativePath,
          content,
          hash,
          size: fileStat.size,
        });
      }
    }
  }

  /**
   * Create bundle content from files
   */
  private async createBundleContent(
    files: Array<{ relativePath: string; content: Buffer; hash: string; size: number }>,
    manifest: IBundleManifest,
    includeData?: boolean
  ): Promise<Buffer> {
    // For simplicity, we'll create a JSON structure
    // In production, this would be a proper tar.gz bundle
    const bundleData = {
      manifest,
      files: files.map((f) => ({
        path: f.relativePath,
        content: f.content.toString('utf8'),
        hash: f.hash,
      })),
    };

    // Optionally include data files
    if (includeData) {
      const dataPath = path.join(getPoliciesDir(), 'data');
      if (fs.existsSync(dataPath)) {
        const dataFile = path.join(dataPath, 'data.json');
        if (fs.existsSync(dataFile)) {
          const dataContent = await readFile(dataFile, 'utf8');
          (bundleData as Record<string, unknown>).data = JSON.parse(dataContent);
        }
      }
    }

    return Buffer.from(JSON.stringify(bundleData));
  }

  /**
   * Get policy roots based on scopes
   */
  private getRoots(scopes?: string[]): string[] {
    if (!scopes || scopes.length === 0 || scopes.includes('all')) {
      return ['dive'];
    }

    const roots = new Set<string>();
    roots.add('dive.base'); // Always include base

    for (const scope of scopes) {
      if (scope === 'policy:fvey') roots.add('dive.org.fvey');
      if (scope === 'policy:nato') roots.add('dive.org.nato');
      if (scope.startsWith('policy:') && scope !== 'policy:base') {
        const tenant = scope.replace('policy:', '');
        roots.add(`dive.tenant.${tenant}`);
      }
    }

    return Array.from(roots);
  }

  /**
   * Generate version string
   */
  private generateVersion(): string {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '.');
    const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    return `${dateStr}-${seq}`;
  }

  // ============================================
  // BUNDLE PUBLISHING
  // ============================================

  /**
   * Publish bundle to OPAL Server
   */
  async publishBundle(bundle?: IPolicyBundle): Promise<IBundlePublishResult> {
    const bundleToPublish = bundle || this.currentBundle;

    if (!bundleToPublish) {
      return {
        success: false,
        bundleId: '',
        version: '',
        hash: '',
        publishedAt: new Date(),
        error: 'No bundle to publish. Call buildBundle first.',
      };
    }

    try {
      logger.info('Publishing bundle to OPAL', {
        bundleId: bundleToPublish.bundleId,
        version: bundleToPublish.version,
      });

      // Check if OPAL is enabled
      if (!opalClient.isOPALEnabled()) {
        logger.warn('OPAL is not enabled - skipping publish');
        return {
          success: true,
          bundleId: bundleToPublish.bundleId,
          version: bundleToPublish.version,
          hash: bundleToPublish.hash,
          publishedAt: new Date(),
        };
      }

      // Trigger policy refresh via OPAL
      const refreshResult = await opalClient.triggerPolicyRefresh();

      // Publish bundle metadata as data update
      const dataResult = await opalClient.publishDataUpdate({
        topics: ['policy_data'],
        entries: [
          {
            dst_path: 'policy_bundle',
            data: {
              bundleId: bundleToPublish.bundleId,
              version: bundleToPublish.version,
              hash: bundleToPublish.hash,
              signedAt: bundleToPublish.signedAt.toISOString(),
              signedBy: bundleToPublish.signedBy,
              scopes: bundleToPublish.scopes,
              roots: bundleToPublish.manifest.roots,
              fileCount: bundleToPublish.manifest.files.length,
            },
          },
        ],
        reason: `Policy bundle ${bundleToPublish.version} published`,
      });

      const success = refreshResult.success || dataResult.success;

      logger.info('Bundle published to OPAL', {
        bundleId: bundleToPublish.bundleId,
        version: bundleToPublish.version,
        refreshSuccess: refreshResult.success,
        dataSuccess: dataResult.success,
        transactionId: dataResult.transactionId,
      });

      // Record publish metrics
      if (success) {
        prometheusMetrics.recordPolicyBundlePublish();
      }

      return {
        success,
        bundleId: bundleToPublish.bundleId,
        version: bundleToPublish.version,
        hash: bundleToPublish.hash,
        publishedAt: new Date(),
        opalTransactionId: dataResult.transactionId,
        error: success ? undefined : refreshResult.error || dataResult.error,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Failed to publish bundle to OPAL', {
        bundleId: bundleToPublish.bundleId,
        error: errorMessage,
      });

      return {
        success: false,
        bundleId: bundleToPublish.bundleId,
        version: bundleToPublish.version,
        hash: bundleToPublish.hash,
        publishedAt: new Date(),
        error: errorMessage,
      };
    }
  }

  /**
   * Build and publish bundle in one operation
   */
  async buildAndPublish(options: IBundleBuildOptions = {}): Promise<{
    buildResult: IBundleBuildResult;
    publishResult?: IBundlePublishResult;
  }> {
    const buildResult = await this.buildBundle(options);

    if (!buildResult.success) {
      return { buildResult };
    }

    const publishResult = await this.publishBundle();

    return { buildResult, publishResult };
  }

  // ============================================
  // BUNDLE RETRIEVAL
  // ============================================

  /**
   * Get the current bundle
   */
  getCurrentBundle(): IPolicyBundle | null {
    return this.currentBundle;
  }

  /**
   * Get bundle manifest
   */
  getCurrentManifest(): IBundleManifest | null {
    return this.currentBundle?.manifest || null;
  }

  /**
   * Verify bundle signature
   */
  async verifyBundleSignature(
    bundle: IPolicyBundle,
    publicKeyPath: string
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const publicKeyData = await readFile(publicKeyPath, 'utf8');
      const publicKey = crypto.createPublicKey(publicKeyData);

      // Decompress if needed
      let content = bundle.contents;
      try {
        content = zlib.gunzipSync(bundle.contents);
      } catch {
        // Content might not be compressed
      }

      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(content);
      const valid = verifier.verify(publicKey, bundle.signature, 'base64');

      return { valid };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  // ============================================
  // SCOPE FILTERING
  // ============================================

  /**
   * Get bundle filtered by scopes
   */
  async getBundleForScopes(scopes: string[]): Promise<IBundleBuildResult> {
    return this.buildBundle({
      scopes,
      sign: true,
      compress: true,
      includeData: true,
    });
  }

  /**
   * Check if a scope is valid
   */
  isValidScope(scope: string): boolean {
    return scope === 'all' || scope in SCOPE_DIR_MAP;
  }

  /**
   * Get available scopes
   */
  getAvailableScopes(): string[] {
    return Object.keys(SCOPE_DIR_MAP);
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const policyBundleService = new PolicyBundleService();

export default PolicyBundleService;
