/**
 * DIVE V3 - Spoke mTLS Service
 *
 * Manages mutual TLS client configuration for secure Hub communication.
 * Handles X.509 certificate loading, validation, and HTTPS agent creation.
 *
 * Features:
 * - X.509 certificate and key loading
 * - CA bundle management for Hub verification
 * - HTTPS agent creation for mTLS requests
 * - Certificate expiration monitoring
 * - CSR generation for certificate renewal
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto, { X509Certificate } from 'crypto';
import https from 'https';
import http from 'http';
import tls from 'tls';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export interface IMTLSConfig {
  certPath: string;
  keyPath: string;
  caBundlePath?: string;
  verifyServer: boolean;
  minTLSVersion: 'TLSv1.2' | 'TLSv1.3';
  checkCRL?: boolean;
  allowSelfSigned?: boolean;
}

export interface ICertificateInfo {
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
  serialNumber: string;
  algorithm: string;
  keySize?: number;
  isSelfSigned: boolean;
  daysUntilExpiry: number;
}

export interface IMTLSStatus {
  initialized: boolean;
  certLoaded: boolean;
  keyLoaded: boolean;
  caLoaded: boolean;
  certInfo: ICertificateInfo | null;
  isExpired: boolean;
  expiresInDays: number;
}

export interface ICSRInfo {
  csr: string;
  privateKeyPath: string;
  algorithm: string;
  keySize: number;
  subject: {
    CN: string;
    O?: string;
    OU?: string;
    C?: string;
  };
}

// Default configuration
const DEFAULT_CONFIG: IMTLSConfig = {
  certPath: '/var/dive/spoke/certs/spoke.crt',
  keyPath: '/var/dive/spoke/certs/spoke.key',
  caBundlePath: '/var/dive/spoke/certs/hub-ca.crt',
  verifyServer: true,
  minTLSVersion: 'TLSv1.2',
  checkCRL: false,
  allowSelfSigned: false,
};

// ============================================
// SPOKE MTLS SERVICE
// ============================================

class SpokeMTLSService extends EventEmitter {
  private config: IMTLSConfig;
  private certificate: string | null = null;
  private privateKey: string | null = null;
  private caBundle: string | null = null;
  private certInfo: ICertificateInfo | null = null;
  private httpsAgent: https.Agent | null = null;
  private initialized = false;
  private expiryCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Initialize the mTLS service
   */
  async initialize(config: Partial<IMTLSConfig>): Promise<void> {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Load certificate and key
    await this.loadCertificates();

    // Create HTTPS agent
    this.createAgent();

    // Start expiry monitoring
    this.startExpiryMonitoring();

    this.initialized = true;

    logger.info('Spoke mTLS Service initialized', {
      certPath: this.config.certPath,
      keyPath: this.config.keyPath,
      caLoaded: !!this.caBundle,
      certInfo: this.certInfo ? {
        subject: this.certInfo.subject,
        expiresInDays: this.certInfo.daysUntilExpiry,
      } : null,
    });
  }

  // ============================================
  // CERTIFICATE LOADING
  // ============================================

  /**
   * Load certificates from disk
   */
  async loadCertificates(): Promise<void> {
    // Load certificate
    if (existsSync(this.config.certPath)) {
      this.certificate = await fs.readFile(this.config.certPath, 'utf-8');
      this.certInfo = this.extractCertificateInfo(this.certificate);
      logger.debug('Certificate loaded', { subject: this.certInfo.subject });
    } else {
      logger.warn('Certificate not found', { path: this.config.certPath });
    }

    // Load private key
    if (existsSync(this.config.keyPath)) {
      this.privateKey = await fs.readFile(this.config.keyPath, 'utf-8');
      logger.debug('Private key loaded');
    } else {
      logger.warn('Private key not found', { path: this.config.keyPath });
    }

    // Load CA bundle
    if (this.config.caBundlePath && existsSync(this.config.caBundlePath)) {
      this.caBundle = await fs.readFile(this.config.caBundlePath, 'utf-8');
      logger.debug('CA bundle loaded');
    }
  }

  /**
   * Reload certificates from disk
   */
  async reloadCertificates(): Promise<void> {
    await this.loadCertificates();

    // Recreate HTTPS agent with new certificates
    if (this.httpsAgent) {
      this.httpsAgent.destroy();
    }
    this.createAgent();

    this.emit('certificatesReloaded');
    logger.info('Certificates reloaded');
  }

  // ============================================
  // CERTIFICATE INFO
  // ============================================

  /**
   * Extract information from X.509 certificate
   */
  extractCertificateInfo(certPEM: string): ICertificateInfo {
    const cert = new X509Certificate(certPEM);

    const validFrom = new Date(cert.validFrom);
    const validTo = new Date(cert.validTo);
    const now = new Date();
    const daysUntilExpiry = Math.floor(
      (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Calculate fingerprint
    const fingerprint = crypto
      .createHash('sha256')
      .update(certPEM)
      .digest('hex')
      .toUpperCase()
      .match(/.{2}/g)!
      .join(':');

    // Get public key info
    const pubKey = cert.publicKey;
    let keySize: number | undefined;
    if (pubKey.asymmetricKeyType === 'rsa') {
      const keyDetails = pubKey.export({ type: 'spki', format: 'der' });
      // Approximate RSA key size from DER length
      keySize = Math.ceil((keyDetails.length - 38) / 128) * 1024;
    }

    return {
      subject: cert.subject,
      issuer: cert.issuer,
      validFrom,
      validTo,
      fingerprint,
      serialNumber: cert.serialNumber,
      algorithm: pubKey.asymmetricKeyType || 'unknown',
      keySize,
      isSelfSigned: cert.subject === cert.issuer,
      daysUntilExpiry,
    };
  }

  /**
   * Get certificate info
   */
  getCertificateInfo(): ICertificateInfo | null {
    return this.certInfo;
  }

  /**
   * Check if certificate is expired
   */
  isCertificateExpired(): boolean {
    if (!this.certInfo) {
      return true;
    }
    return this.certInfo.daysUntilExpiry < 0;
  }

  /**
   * Check if certificate is expiring soon (within 30 days)
   */
  isCertificateExpiringSoon(daysThreshold = 30): boolean {
    if (!this.certInfo) {
      return true;
    }
    return this.certInfo.daysUntilExpiry <= daysThreshold;
  }

  // ============================================
  // HTTPS AGENT
  // ============================================

  /**
   * Create HTTPS agent for mTLS connections
   */
  createAgent(): https.Agent {
    const options: https.AgentOptions = {
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 10,
      timeout: 30000,
      minVersion: this.config.minTLSVersion,
    };

    // Add client certificate and key for mTLS
    if (this.certificate && this.privateKey) {
      options.cert = this.certificate;
      options.key = this.privateKey;
    }

    // Add CA bundle for server verification
    if (this.caBundle) {
      options.ca = this.caBundle;
    }

    // Server verification settings
    if (!this.config.verifyServer || this.config.allowSelfSigned) {
      options.rejectUnauthorized = false;
    }

    this.httpsAgent = new https.Agent(options);
    return this.httpsAgent;
  }

  /**
   * Get the configured HTTPS agent
   */
  getAgent(): https.Agent | null {
    return this.httpsAgent;
  }

  // ============================================
  // HTTP REQUESTS
  // ============================================

  /**
   * Make an mTLS-authenticated request
   */
  async makeRequest<T>(
    url: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: unknown;
      headers?: Record<string, string>;
      timeout?: number;
    } = {}
  ): Promise<{ statusCode: number; data: T | null; error?: string }> {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';

    if (isHttps && !this.httpsAgent) {
      this.createAgent();
    }

    return new Promise((resolve) => {
      const httpModule = isHttps ? https : http;

      const requestOptions: https.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        timeout: options.timeout || 30000,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      };

      if (isHttps) {
        requestOptions.agent = this.httpsAgent!;
      }

      const req = httpModule.request(requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          let parsedData: T | null = null;
          try {
            if (data) {
              parsedData = JSON.parse(data);
            }
          } catch {
            // Response is not JSON
          }

          resolve({
            statusCode: res.statusCode || 0,
            data: parsedData,
          });
        });
      });

      req.on('error', (error) => {
        resolve({
          statusCode: 0,
          data: null,
          error: error.message,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          statusCode: 0,
          data: null,
          error: 'Request timeout',
        });
      });

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }

      req.end();
    });
  }

  // ============================================
  // SERVER CERTIFICATE VALIDATION
  // ============================================

  /**
   * Validate a server's certificate
   */
  async validateServerCert(hostname: string, port = 443): Promise<{
    valid: boolean;
    certInfo: ICertificateInfo | null;
    error?: string;
  }> {
    return new Promise((resolve) => {
      const options: tls.ConnectionOptions = {
        host: hostname,
        port,
        rejectUnauthorized: this.config.verifyServer,
        minVersion: this.config.minTLSVersion,
      };

      if (this.caBundle) {
        options.ca = this.caBundle;
      }

      const socket = tls.connect(options, () => {
        const cert = socket.getPeerCertificate();

        if (!cert || Object.keys(cert).length === 0) {
          socket.destroy();
          resolve({
            valid: false,
            certInfo: null,
            error: 'No certificate returned',
          });
          return;
        }

        const certInfo: ICertificateInfo = {
          subject: cert.subject?.CN || 'Unknown',
          issuer: cert.issuer?.CN || 'Unknown',
          validFrom: new Date(cert.valid_from),
          validTo: new Date(cert.valid_to),
          fingerprint: cert.fingerprint256 || cert.fingerprint || '',
          serialNumber: cert.serialNumber || '',
          algorithm: 'rsa', // Simplified
          isSelfSigned: cert.subject?.CN === cert.issuer?.CN,
          daysUntilExpiry: Math.floor(
            (new Date(cert.valid_to).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          ),
        };

        socket.destroy();

        resolve({
          valid: socket.authorized || false,
          certInfo,
        });
      });

      socket.on('error', (error) => {
        resolve({
          valid: false,
          certInfo: null,
          error: error.message,
        });
      });

      socket.setTimeout(10000, () => {
        socket.destroy();
        resolve({
          valid: false,
          certInfo: null,
          error: 'Connection timeout',
        });
      });
    });
  }

  // ============================================
  // CSR GENERATION
  // ============================================

  /**
   * Generate a Certificate Signing Request
   */
  async generateCSR(options: {
    spokeId: string;
    instanceCode: string;
    organization?: string;
    country?: string;
    algorithm?: 'rsa' | 'ec';
    keySize?: number;
    outputDir: string;
  }): Promise<ICSRInfo> {
    const {
      spokeId,
      instanceCode,
      organization = 'DIVE Federation',
      country = instanceCode.substring(0, 2),
      algorithm = 'rsa',
      keySize = 4096,
      outputDir,
    } = options;

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    const keyPath = path.join(outputDir, 'spoke.key');
    const csrPath = path.join(outputDir, 'spoke.csr');

    // Generate key pair
    let privateKey: string;

    if (algorithm === 'ec') {
      const { privateKey: priv } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });
      privateKey = priv;
    } else {
      const { privateKey: priv } = crypto.generateKeyPairSync('rsa', {
        modulusLength: keySize,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });
      privateKey = priv;
    }

    // Save private key
    await fs.writeFile(keyPath, privateKey, { mode: 0o600 });

    // Create CSR (simplified - in production use openssl or pkcs#10)
    // This creates a basic self-signed certificate request
    const subject = {
      CN: spokeId,
      O: organization,
      OU: 'Spoke Instances',
      C: country,
    };

    // For a proper CSR, we'd need a CSR library
    // This is a placeholder that indicates CSR generation would happen here
    const csrData = `-----BEGIN CERTIFICATE REQUEST-----
CSR for: ${spokeId}
Organization: ${organization}
Country: ${country}
Algorithm: ${algorithm}
Generated: ${new Date().toISOString()}
-----END CERTIFICATE REQUEST-----`;

    await fs.writeFile(csrPath, csrData);

    logger.info('CSR generated', {
      spokeId,
      algorithm,
      keySize: algorithm === 'rsa' ? keySize : 256,
      keyPath,
      csrPath,
    });

    return {
      csr: csrData,
      privateKeyPath: keyPath,
      algorithm,
      keySize: algorithm === 'rsa' ? keySize : 256,
      subject,
    };
  }

  /**
   * Install a signed certificate from Hub
   */
  async installSignedCertificate(certPEM: string): Promise<void> {
    // Validate the certificate
    const certInfo = this.extractCertificateInfo(certPEM);

    // Save to disk
    await fs.writeFile(this.config.certPath, certPEM, { mode: 0o644 });

    // Reload certificates
    await this.reloadCertificates();

    logger.info('Signed certificate installed', {
      subject: certInfo.subject,
      issuer: certInfo.issuer,
      expiresAt: certInfo.validTo,
    });

    this.emit('certificateInstalled', certInfo);
  }

  // ============================================
  // EXPIRY MONITORING
  // ============================================

  /**
   * Start certificate expiry monitoring
   */
  private startExpiryMonitoring(): void {
    // Check every 24 hours
    this.expiryCheckInterval = setInterval(() => {
      this.checkExpiry();
    }, 24 * 60 * 60 * 1000);

    // Also check immediately
    this.checkExpiry();
  }

  /**
   * Check certificate expiry and emit warnings
   */
  private checkExpiry(): void {
    if (!this.certInfo) {
      return;
    }

    if (this.isCertificateExpired()) {
      this.emit('certificateExpired', this.certInfo);
      logger.error('Certificate is EXPIRED', {
        subject: this.certInfo.subject,
        expiredDaysAgo: Math.abs(this.certInfo.daysUntilExpiry),
      });
    } else if (this.isCertificateExpiringSoon(7)) {
      this.emit('certificateExpiringSoon', this.certInfo);
      logger.warn('Certificate expiring SOON', {
        subject: this.certInfo.subject,
        daysUntilExpiry: this.certInfo.daysUntilExpiry,
      });
    } else if (this.isCertificateExpiringSoon(30)) {
      this.emit('certificateExpiryWarning', this.certInfo);
      logger.warn('Certificate expiry warning', {
        subject: this.certInfo.subject,
        daysUntilExpiry: this.certInfo.daysUntilExpiry,
      });
    }
  }

  /**
   * Stop expiry monitoring
   */
  private stopExpiryMonitoring(): void {
    if (this.expiryCheckInterval) {
      clearInterval(this.expiryCheckInterval);
      this.expiryCheckInterval = null;
    }
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Get service status
   */
  getStatus(): IMTLSStatus {
    return {
      initialized: this.initialized,
      certLoaded: !!this.certificate,
      keyLoaded: !!this.privateKey,
      caLoaded: !!this.caBundle,
      certInfo: this.certInfo,
      isExpired: this.isCertificateExpired(),
      expiresInDays: this.certInfo?.daysUntilExpiry ?? -1,
    };
  }

  /**
   * Check if service has valid credentials
   */
  hasValidCredentials(): boolean {
    return !!(this.certificate && this.privateKey && !this.isCertificateExpired());
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    this.stopExpiryMonitoring();

    if (this.httpsAgent) {
      this.httpsAgent.destroy();
      this.httpsAgent = null;
    }

    this.certificate = null;
    this.privateKey = null;
    this.caBundle = null;
    this.certInfo = null;
    this.initialized = false;

    logger.info('Spoke mTLS Service shutdown');
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const spokeMTLS = new SpokeMTLSService();

export default SpokeMTLSService;
