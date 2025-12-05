/**
 * DIVE V3 - Spoke Token Service
 *
 * Manages spoke authentication tokens for Hub communication.
 * Handles token storage, validation, refresh, and expiration.
 *
 * Features:
 * - Secure file-based token storage
 * - Token validation and expiration checking
 * - Automatic token refresh scheduling
 * - Token rotation support
 * - Integration with Hub token API
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export interface ISpokeToken {
  token: string;
  spokeId: string;
  scopes: string[];
  issuedAt: Date;
  expiresAt: Date;
  refreshToken?: string;
  tokenType: 'bearer';
  version: number;
}

export interface ITokenStorageConfig {
  storagePath: string;
  encryptionKey?: string;
  refreshBufferMs: number;
  autoRefresh: boolean;
}

export interface ITokenValidation {
  valid: boolean;
  expired: boolean;
  expiresInMs: number;
  scopes: string[];
  error?: string;
}

export interface ITokenRefreshResult {
  success: boolean;
  token?: ISpokeToken;
  error?: string;
}

// Default configuration
const DEFAULT_CONFIG: ITokenStorageConfig = {
  storagePath: '/var/dive/spoke/token.json',
  refreshBufferMs: 5 * 60 * 1000, // 5 minutes before expiry
  autoRefresh: true,
};

// Token file encryption key derivation constant
const TOKEN_KEY_SALT = 'dive-v3-spoke-token-v1';

// ============================================
// SPOKE TOKEN SERVICE
// ============================================

class SpokeTokenService extends EventEmitter {
  private config: ITokenStorageConfig;
  private currentToken: ISpokeToken | null = null;
  private encryptionKey: Buffer | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Initialize the token service
   */
  async initialize(config: Partial<ITokenStorageConfig>): Promise<void> {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Derive encryption key if provided
    if (this.config.encryptionKey) {
      this.encryptionKey = crypto.scryptSync(
        this.config.encryptionKey,
        TOKEN_KEY_SALT,
        32
      );
    }

    // Ensure storage directory exists
    const storageDir = path.dirname(this.config.storagePath);
    await fs.mkdir(storageDir, { recursive: true });

    // Try to load existing token
    await this.loadToken();

    this.initialized = true;

    logger.info('Spoke Token Service initialized', {
      storagePath: this.config.storagePath,
      autoRefresh: this.config.autoRefresh,
      hasEncryption: !!this.encryptionKey,
    });
  }

  // ============================================
  // TOKEN STORAGE
  // ============================================

  /**
   * Store a new token
   */
  async storeToken(token: ISpokeToken): Promise<void> {
    if (!this.initialized) {
      throw new Error('Token service not initialized');
    }

    // Validate token structure
    if (!token.token || !token.spokeId || !token.expiresAt) {
      throw new Error('Invalid token structure');
    }

    // Store in memory
    this.currentToken = {
      ...token,
      issuedAt: new Date(token.issuedAt),
      expiresAt: new Date(token.expiresAt),
    };

    // Persist to disk
    await this.persistToken();

    // Schedule refresh if enabled
    if (this.config.autoRefresh) {
      this.scheduleRefresh();
    }

    logger.info('Token stored', {
      spokeId: token.spokeId,
      scopes: token.scopes,
      expiresAt: token.expiresAt,
    });

    this.emit('tokenStored', { spokeId: token.spokeId });
  }

  /**
   * Get the current token
   */
  async getToken(): Promise<string | null> {
    if (!this.currentToken) {
      await this.loadToken();
    }

    if (!this.currentToken) {
      return null;
    }

    // Check if expired
    if (this.isTokenExpired()) {
      logger.warn('Token is expired');
      this.emit('tokenExpired', { spokeId: this.currentToken.spokeId });
      return null;
    }

    return this.currentToken.token;
  }

  /**
   * Get full token object
   */
  async getTokenObject(): Promise<ISpokeToken | null> {
    if (!this.currentToken) {
      await this.loadToken();
    }
    return this.currentToken;
  }

  /**
   * Clear the stored token
   */
  async clearToken(): Promise<void> {
    this.currentToken = null;
    this.cancelRefreshTimer();

    try {
      await fs.unlink(this.config.storagePath);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    logger.info('Token cleared');
    this.emit('tokenCleared');
  }

  // ============================================
  // TOKEN VALIDATION
  // ============================================

  /**
   * Check if current token is valid
   */
  isTokenValid(): boolean {
    if (!this.currentToken) {
      return false;
    }

    return !this.isTokenExpired();
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(): boolean {
    if (!this.currentToken) {
      return true;
    }

    return new Date() >= new Date(this.currentToken.expiresAt);
  }

  /**
   * Get token expiry date
   */
  getTokenExpiry(): Date | null {
    return this.currentToken ? new Date(this.currentToken.expiresAt) : null;
  }

  /**
   * Get token scopes
   */
  getTokenScopes(): string[] {
    return this.currentToken?.scopes || [];
  }

  /**
   * Get time until token expires (ms)
   */
  getTimeUntilExpiry(): number {
    if (!this.currentToken) {
      return 0;
    }

    const expiresAt = new Date(this.currentToken.expiresAt).getTime();
    return Math.max(0, expiresAt - Date.now());
  }

  /**
   * Validate token and return detailed status
   */
  validateToken(): ITokenValidation {
    if (!this.currentToken) {
      return {
        valid: false,
        expired: true,
        expiresInMs: 0,
        scopes: [],
        error: 'No token available',
      };
    }

    const expiresInMs = this.getTimeUntilExpiry();
    const expired = expiresInMs <= 0;

    return {
      valid: !expired,
      expired,
      expiresInMs,
      scopes: this.currentToken.scopes,
    };
  }

  /**
   * Check if token needs refresh (close to expiry)
   */
  needsRefresh(): boolean {
    if (!this.currentToken) {
      return false;
    }

    const timeUntilExpiry = this.getTimeUntilExpiry();
    return timeUntilExpiry <= this.config.refreshBufferMs;
  }

  // ============================================
  // TOKEN REFRESH
  // ============================================

  /**
   * Schedule automatic token refresh
   */
  scheduleRefresh(): void {
    this.cancelRefreshTimer();

    const token = this.currentToken;
    if (!token) {
      return;
    }

    const timeUntilRefresh = this.getTimeUntilExpiry() - this.config.refreshBufferMs;

    if (timeUntilRefresh <= 0) {
      // Need to refresh now
      this.emit('tokenNeedsRefresh', { spokeId: token.spokeId });
      return;
    }

    const spokeId = token.spokeId;
    this.refreshTimer = setTimeout(() => {
      this.emit('tokenNeedsRefresh', { spokeId });
    }, timeUntilRefresh);

    logger.debug('Token refresh scheduled', {
      refreshInMs: timeUntilRefresh,
      refreshAt: new Date(Date.now() + timeUntilRefresh).toISOString(),
    });
  }

  /**
   * Cancel scheduled refresh
   */
  cancelRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Handle refreshed token from Hub
   */
  async handleRefreshedToken(newToken: ISpokeToken): Promise<void> {
    await this.storeToken(newToken);
    this.emit('tokenRefreshed', { spokeId: newToken.spokeId });
  }

  // ============================================
  // PERSISTENCE
  // ============================================

  /**
   * Load token from disk
   */
  private async loadToken(): Promise<void> {
    try {
      let data = await fs.readFile(this.config.storagePath, 'utf-8');

      // Decrypt if encryption is enabled
      if (this.encryptionKey) {
        data = this.decrypt(data);
      }

      const parsed = JSON.parse(data);

      const loadedToken: ISpokeToken = {
        ...parsed,
        issuedAt: new Date(parsed.issuedAt),
        expiresAt: new Date(parsed.expiresAt),
      };
      this.currentToken = loadedToken;

      logger.debug('Token loaded from disk', {
        spokeId: loadedToken.spokeId,
        expiresAt: loadedToken.expiresAt,
      });

      // Schedule refresh if valid and auto-refresh enabled
      if (this.config.autoRefresh && this.isTokenValid()) {
        this.scheduleRefresh();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('Failed to load token from disk', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      this.currentToken = null;
    }
  }

  /**
   * Persist token to disk
   */
  private async persistToken(): Promise<void> {
    if (!this.currentToken) {
      return;
    }

    let data = JSON.stringify({
      ...this.currentToken,
      issuedAt: this.currentToken.issuedAt.toISOString(),
      expiresAt: this.currentToken.expiresAt.toISOString(),
    }, null, 2);

    // Encrypt if encryption is enabled
    if (this.encryptionKey) {
      data = this.encrypt(data);
    }

    await fs.writeFile(this.config.storagePath, data, { mode: 0o600 });

    logger.debug('Token persisted to disk');
  }

  // ============================================
  // ENCRYPTION
  // ============================================

  /**
   * Encrypt data using AES-256-GCM
   */
  private encrypt(plaintext: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not set');
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:ciphertext
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  private decrypt(ciphertext: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not set');
    }

    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted token format');
    }

    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Check if service has a token
   */
  hasToken(): boolean {
    return this.currentToken !== null;
  }

  /**
   * Get spoke ID from token
   */
  getSpokeId(): string | null {
    return this.currentToken?.spokeId || null;
  }

  /**
   * Get token version
   */
  getTokenVersion(): number | null {
    return this.currentToken?.version || null;
  }

  /**
   * Get service status
   */
  getStatus(): {
    hasToken: boolean;
    isValid: boolean;
    expiresAt: Date | null;
    spokeId: string | null;
    scopes: string[];
  } {
    return {
      hasToken: this.hasToken(),
      isValid: this.isTokenValid(),
      expiresAt: this.getTokenExpiry(),
      spokeId: this.getSpokeId(),
      scopes: this.getTokenScopes(),
    };
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    this.cancelRefreshTimer();
    this.currentToken = null;
    this.initialized = false;

    logger.info('Spoke Token Service shutdown');
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const spokeToken = new SpokeTokenService();

export default SpokeTokenService;

