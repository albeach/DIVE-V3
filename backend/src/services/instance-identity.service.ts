/**
 * DIVE V3 - Instance Identity Service
 *
 * Manages the cryptographic identity of a DIVE instance for Zero Trust federation.
 * Each instance has an ECDSA P-256 keypair used for:
 * - Signing enrollment requests (proves ownership of identity)
 * - Generating fingerprints for out-of-band verification (TOFU model)
 * - Creating CSRs for CA signing during federation approval
 *
 * Identity files are stored in the instance's cert directory:
 *   /app/certs/identity/instance.key   - ECDSA P-256 private key
 *   /app/certs/identity/instance.crt   - Self-signed certificate
 *   /app/certs/identity/fingerprint.txt - SHA256 fingerprint
 *
 * Standards: RFC 8705 (mTLS), SPIFFE-inspired workload identity
 *
 * @version 1.0.0
 * @date 2026-02-21
 */

import crypto from 'crypto';
import { X509Certificate } from 'crypto';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export interface InstanceIdentity {
  instanceCode: string;
  privateKey: crypto.KeyObject;
  certificate: X509Certificate;
  certificatePEM: string;
  fingerprint: string;          // SHA256:XX:XX:XX:... format
  spiffeId: string;             // spiffe://dive25.com/instance/{CODE}
  createdAt: Date;
}

export interface EnrollmentSignaturePayload {
  instanceCode: string;
  targetUrl: string;
  timestamp: string;
  nonce: string;
}

// ============================================
// CONSTANTS
// ============================================

const CERT_BASE = process.env.CERT_DIR || '/app/certs';
const IDENTITY_DIR = path.join(CERT_BASE, 'identity');
const KEY_FILE = 'instance.key';
const CERT_FILE = 'instance.crt';
const FINGERPRINT_FILE = 'fingerprint.txt';
const SPIFFE_DOMAIN = process.env.SPIFFE_DOMAIN || 'dive25.com';

// Certificate validity: 10 years for identity cert (not TLS cert)
const CERT_VALIDITY_DAYS = 3650;

// ============================================
// SERVICE
// ============================================

class InstanceIdentityService {
  private identity: InstanceIdentity | null = null;

  /**
   * Get or create the instance identity.
   * Loads from disk if available, generates fresh if not.
   */
  async getIdentity(): Promise<InstanceIdentity> {
    if (this.identity) {
      return this.identity;
    }

    const instanceCode = this.getInstanceCode();
    const keyPath = path.join(IDENTITY_DIR, KEY_FILE);
    const certPath = path.join(IDENTITY_DIR, CERT_FILE);

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      this.identity = this.loadFromDisk(instanceCode, keyPath, certPath);
      logger.info('Instance identity loaded from disk', {
        instanceCode,
        fingerprint: this.identity.fingerprint,
        spiffeId: this.identity.spiffeId,
      });
    } else {
      this.identity = this.generate(instanceCode);
      this.saveToDisk(this.identity);
      logger.info('Instance identity generated', {
        instanceCode,
        fingerprint: this.identity.fingerprint,
        spiffeId: this.identity.spiffeId,
      });
    }

    return this.identity;
  }

  /**
   * Get fingerprint for OOB verification display.
   * Returns SHA256:XX:XX:XX:... format (like SSH fingerprints).
   */
  async getFingerprint(): Promise<string> {
    const identity = await this.getIdentity();
    return identity.fingerprint;
  }

  /**
   * Get the instance certificate in PEM format.
   */
  async getCertificatePEM(): Promise<string> {
    const identity = await this.getIdentity();
    return identity.certificatePEM;
  }

  /**
   * Sign an enrollment request payload with the instance private key.
   * The receiving instance can verify this signature against the presented certificate.
   */
  async signEnrollment(payload: EnrollmentSignaturePayload): Promise<string> {
    const identity = await this.getIdentity();
    const canonical = this.canonicalize(payload);

    const sign = crypto.createSign('SHA256');
    sign.update(canonical);
    sign.end();

    return sign.sign(identity.privateKey, 'base64');
  }

  /**
   * Verify an enrollment signature against a presented certificate.
   * Used by the receiving instance to verify the enrollment request.
   */
  verifyEnrollmentSignature(
    payload: EnrollmentSignaturePayload,
    signature: string,
    certificatePEM: string,
  ): boolean {
    try {
      const cert = new X509Certificate(certificatePEM);
      const publicKey = cert.publicKey;
      const canonical = this.canonicalize(payload);

      const verify = crypto.createVerify('SHA256');
      verify.update(canonical);
      verify.end();

      return verify.verify(publicKey, signature, 'base64');
    } catch (error) {
      logger.warn('Enrollment signature verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Sign arbitrary data with the instance private key.
   * Used for cross-wire notification authentication.
   */
  async signData(data: string): Promise<string> {
    const identity = await this.getIdentity();
    const sign = crypto.createSign('SHA256');
    sign.update(data);
    sign.end();
    return sign.sign(identity.privateKey, 'base64');
  }

  /**
   * Verify a signature against arbitrary data using a presented certificate.
   * Used for cross-wire notification authentication.
   */
  verifySignature(data: string, signature: string, certificatePEM: string): boolean {
    try {
      const cert = new X509Certificate(certificatePEM);
      const verify = crypto.createVerify('SHA256');
      verify.update(data);
      verify.end();
      return verify.verify(cert.publicKey, signature, 'base64');
    } catch (error) {
      logger.warn('Signature verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Calculate the SHA256 fingerprint of a certificate PEM.
   * Returns SHA256:XX:XX:XX:... format for display.
   */
  calculateFingerprint(certificatePEM: string): string {
    // Parse DER from PEM to get the actual certificate bytes
    const cert = new X509Certificate(certificatePEM);
    const derBytes = cert.raw;

    const hash = crypto.createHash('sha256').update(derBytes).digest('hex').toUpperCase();
    const colonSeparated = hash.match(/.{2}/g)!.join(':');
    return `SHA256:${colonSeparated}`;
  }

  /**
   * Generate a real PKCS#10 CSR (Certificate Signing Request) for CA signing during approval.
   * Uses openssl via child_process since Node.js crypto lacks native CSR generation.
   * Returns PEM-encoded CSR with SPIFFE SAN.
   */
  async generateCSR(): Promise<string> {
    const identity = await this.getIdentity();
    const instanceCode = identity.instanceCode;
    const cn = `dive-instance-${instanceCode.toLowerCase()}`;
    const spiffeUri = `URI:spiffe://${SPIFFE_DOMAIN}/instance/${instanceCode}`;
    const dnsName = `DNS:${cn}`;

    logger.debug('Generating PKCS#10 CSR', { instanceCode, cn });

    // Write private key to temp file for openssl
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dive-csr-'));
    const keyPath = path.join(tmpDir, 'instance.key');

    try {
      const keyPem = identity.privateKey.export({ type: 'sec1', format: 'pem' });
      fs.writeFileSync(keyPath, keyPem, { mode: 0o600 });

      // Generate CSR with openssl
      const csrPem = execSync(
        `openssl req -new -key "${keyPath}" ` +
        `-subj "/CN=${cn}/O=DIVE Federation/OU=Instance Identity" ` +
        `-addext "subjectAltName=${spiffeUri},${dnsName}"`,
        { encoding: 'utf-8', timeout: 10000 },
      ).trim();

      if (!csrPem.includes('-----BEGIN CERTIFICATE REQUEST-----')) {
        throw new Error('openssl did not produce a valid CSR');
      }

      logger.info('CSR generated successfully', { instanceCode, cn });
      return csrPem;
    } finally {
      // Cleanup temp files
      try {
        fs.unlinkSync(keyPath);
        fs.rmdirSync(tmpDir);
      } catch {
        // Best-effort cleanup
      }
    }
  }

  /**
   * Validate that a certificate is structurally valid and extract metadata.
   */
  validateCertificate(certificatePEM: string): {
    valid: boolean;
    instanceCode: string | null;
    spiffeId: string | null;
    fingerprint: string;
    notBefore: Date;
    notAfter: Date;
    errors: string[];
  } {
    const errors: string[] = [];
    try {
      const cert = new X509Certificate(certificatePEM);
      const fingerprint = this.calculateFingerprint(certificatePEM);

      // Extract instance code from CN
      const subjectStr = cert.subject;
      const cnMatch = subjectStr.match(/CN=dive-instance-(\w+)/i);
      const instanceCode = cnMatch ? cnMatch[1].toUpperCase() : null;

      // Extract SPIFFE ID from SAN
      const sanStr = cert.subjectAltName || '';
      const spiffeMatch = sanStr.match(/URI:spiffe:\/\/[^/]+\/instance\/(\w+)/i);
      const spiffeId = spiffeMatch ? `spiffe://${SPIFFE_DOMAIN}/instance/${spiffeMatch[1]}` : null;

      // Check expiry
      const notAfter = new Date(cert.validTo);
      const notBefore = new Date(cert.validFrom);
      if (notAfter < new Date()) {
        errors.push('Certificate has expired');
      }
      if (notBefore > new Date()) {
        errors.push('Certificate is not yet valid');
      }

      return {
        valid: errors.length === 0,
        instanceCode,
        spiffeId,
        fingerprint,
        notBefore,
        notAfter,
        errors,
      };
    } catch (error) {
      return {
        valid: false,
        instanceCode: null,
        spiffeId: null,
        fingerprint: '',
        notBefore: new Date(0),
        notAfter: new Date(0),
        errors: [error instanceof Error ? error.message : 'Invalid certificate'],
      };
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private getInstanceCode(): string {
    const code = process.env.INSTANCE_CODE || process.env.COUNTRY_CODE || 'USA';
    return code.toUpperCase();
  }

  /**
   * Generate a new ECDSA P-256 keypair and self-signed certificate.
   */
  private generate(instanceCode: string): InstanceIdentity {
    const codeLower = instanceCode.toLowerCase();
    const spiffeId = `spiffe://${SPIFFE_DOMAIN}/instance/${instanceCode}`;

    // Generate ECDSA P-256 keypair
    const { privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });

    // Create self-signed certificate using Node.js crypto
    // Node 19+ has X509Certificate generation, but for compatibility we use
    // a manual approach with createSign
    const certificatePEM = this.createSelfSignedCert(privateKey, instanceCode, spiffeId);
    const certificate = new X509Certificate(certificatePEM);
    const fingerprint = this.calculateFingerprint(certificatePEM);

    return {
      instanceCode,
      privateKey,
      certificate,
      certificatePEM,
      fingerprint,
      spiffeId,
      createdAt: new Date(),
    };
  }

  /**
   * Create a self-signed X.509 certificate.
   *
   * Uses Node.js built-in crypto to generate a minimal self-signed cert.
   * For production deployments, the cert will be re-signed by the partner's CA.
   */
  private createSelfSignedCert(
    privateKey: crypto.KeyObject,
    instanceCode: string,
    spiffeId: string,
  ): string {
    const codeLower = instanceCode.toLowerCase();

    // Generate certificate using openssl-compatible DER encoding
    // Node.js 20+ supports certificate creation via crypto.X509Certificate
    // For broader compatibility, we'll use a minimal ASN.1 DER approach

    // Actually, Node.js doesn't have native cert generation in stable API.
    // Use the createCertificate helper which shells out to openssl if available,
    // or generates a minimal self-signed cert using pure JS.
    return this.generateCertWithCrypto(privateKey, instanceCode, spiffeId);
  }

  /**
   * Generate self-signed cert using Node.js crypto module.
   * This creates a valid X.509 v3 certificate with SAN extension.
   */
  private generateCertWithCrypto(
    privateKey: crypto.KeyObject,
    instanceCode: string,
    spiffeId: string,
  ): string {
    // For Node.js environments without native cert generation,
    // we generate using a child process call to openssl.
    // This is safe since openssl is available in all our Docker images.
    const { execSync } = require('child_process');

    const codeLower = instanceCode.toLowerCase();
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'dive-identity-'));

    try {
      const keyPath = path.join(tmpDir, 'key.pem');
      const certPath = path.join(tmpDir, 'cert.pem');
      const confPath = path.join(tmpDir, 'openssl.cnf');

      // Write private key
      const keyPEM = privateKey.export({ type: 'sec1', format: 'pem' });
      fs.writeFileSync(keyPath, keyPEM as string, { mode: 0o600 });

      // Write OpenSSL config with SAN
      const opensslConf = `
[req]
default_bits = 256
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_ext
req_extensions = v3_ext

[dn]
CN = dive-instance-${codeLower}
O = DIVE Federation
OU = Instance Identity

[v3_ext]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyAgreement
extendedKeyUsage = clientAuth, serverAuth
subjectAltName = @alt_names

[alt_names]
URI.1 = ${spiffeId}
DNS.1 = dive-instance-${codeLower}
`;
      fs.writeFileSync(confPath, opensslConf);

      // Generate self-signed certificate
      execSync(
        `openssl req -new -x509 -key "${keyPath}" -out "${certPath}" ` +
        `-days ${CERT_VALIDITY_DAYS} -config "${confPath}" 2>/dev/null`,
        { timeout: 10000 },
      );

      const certPEM = fs.readFileSync(certPath, 'utf-8');
      return certPEM;
    } finally {
      // Clean up temp files
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Best effort cleanup
      }
    }
  }

  /**
   * Load identity from disk.
   */
  private loadFromDisk(instanceCode: string, keyPath: string, certPath: string): InstanceIdentity {
    const keyPEM = fs.readFileSync(keyPath, 'utf-8');
    const certPEM = fs.readFileSync(certPath, 'utf-8');

    const privateKey = crypto.createPrivateKey(keyPEM);
    const certificate = new X509Certificate(certPEM);
    const fingerprint = this.calculateFingerprint(certPEM);

    const spiffeId = `spiffe://${SPIFFE_DOMAIN}/instance/${instanceCode}`;

    // Read creation time from cert's notBefore
    const createdAt = new Date(certificate.validFrom);

    return {
      instanceCode,
      privateKey,
      certificate,
      certificatePEM: certPEM,
      fingerprint,
      spiffeId,
      createdAt,
    };
  }

  /**
   * Save identity to disk.
   */
  private saveToDisk(identity: InstanceIdentity): void {
    // Ensure directory exists
    fs.mkdirSync(IDENTITY_DIR, { recursive: true });

    const keyPath = path.join(IDENTITY_DIR, KEY_FILE);
    const certPath = path.join(IDENTITY_DIR, CERT_FILE);
    const fpPath = path.join(IDENTITY_DIR, FINGERPRINT_FILE);

    // Write private key (restricted permissions)
    const keyPEM = identity.privateKey.export({ type: 'sec1', format: 'pem' });
    fs.writeFileSync(keyPath, keyPEM as string, { mode: 0o600 });

    // Write certificate
    fs.writeFileSync(certPath, identity.certificatePEM, { mode: 0o644 });

    // Write fingerprint for easy display
    fs.writeFileSync(fpPath, identity.fingerprint + '\n', { mode: 0o644 });

    logger.info('Instance identity saved to disk', {
      keyPath,
      certPath,
      fingerprint: identity.fingerprint,
    });
  }

  /**
   * Create canonical JSON string for signing.
   * Ensures deterministic ordering for signature verification.
   */
  private canonicalize(obj: EnrollmentSignaturePayload): string {
    // Spread to plain object for deterministic key sorting
    const plain: Record<string, string> = { ...obj };
    const sorted = Object.keys(plain).sort().reduce(
      (acc, key) => {
        acc[key] = plain[key];
        return acc;
      },
      {} as Record<string, string>,
    );
    return JSON.stringify(sorted);
  }
}

// Singleton
export const instanceIdentityService = new InstanceIdentityService();
