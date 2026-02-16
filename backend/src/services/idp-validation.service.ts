/**
 * @file idp-validation.service.ts
 * @description IdP configuration validation service
 *
 * Phase 1: Automated security validation of IdP submissions
 *
 * Validates:
 * - TLS version and cipher strength
 * - Cryptographic algorithms (JWKS for OIDC, XML signatures for SAML)
 * - Endpoint reachability
 *
 * Rejects:
 * - TLS < 1.2
 * - Weak algorithms (MD5, SHA-1 in strict mode)
 * - Unreachable endpoints
 */

import * as tls from 'tls';
import * as https from 'https';
import * as fs from 'fs';
import axios from 'axios';
import { URL } from 'url';
import { logger } from '../utils/logger';
import {
  ITLSCheckResult,
  IAlgorithmCheckResult,
  IEndpointCheckResult,
  IValidationConfig,
} from '../types/validation.types';

/**
 * Default validation configuration
 */
const DEFAULT_CONFIG: IValidationConfig = {
  minTlsVersion: process.env.TLS_MIN_VERSION || '1.2',
  allowedAlgorithms: (process.env.ALLOWED_SIGNATURE_ALGORITHMS || 'RS256,RS512,ES256,ES512,PS256,PS512').split(','),
  deniedAlgorithms: (process.env.DENIED_SIGNATURE_ALGORITHMS || 'HS1,MD5,SHA1,RS1,none').split(','),
  timeoutMs: parseInt(process.env.ENDPOINT_TIMEOUT_MS || '5000', 10),
  strictMode: process.env.VALIDATION_STRICT_MODE === 'true',
  allowSelfSigned: process.env.ALLOW_SELF_SIGNED_CERTS !== 'false', // Default true for pilot
};

/**
 * TLS version to numeric mapping for comparison
 */
const TLS_VERSION_MAP: Record<string, number> = {
  'SSLv3': 0,
  'TLSv1': 1,
  'TLSv1.1': 1.1,
  'TLSv1.2': 1.2,
  'TLSv1.3': 1.3,
};

/**
 * IdP Validation Service
 *
 * Performs automated security checks on IdP configurations
 * before allowing submission for admin approval.
 */
class IdPValidationService {
  private config: IValidationConfig;

  constructor(config: IValidationConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  /**
   * Translate external URL to internal container address for validation
   * In containerized environments, external localhost URLs need to be translated
   * to internal container names for proper validation
   *
   * @param url - External URL to translate
   * @param instanceCode - Instance code (e.g., 'PRT', 'FRA')
   * @returns Translated URL for internal validation
   */
  private translateUrlForContainerValidation(url: string, instanceCode?: string): string {
    // Check if we're in a containerized environment (has DIVE_CONTAINERIZED env var or is running in Docker)
    const isContainerized = process.env.DIVE_CONTAINERIZED === 'true' ||
      fs.existsSync('/.dockerenv') ||
      process.env.HOSTNAME?.includes('dive-');

    if (!isContainerized) {
      return url; // Use original URL for non-containerized environments
    }

    try {
      const parsedUrl = new URL(url);

      // If it's localhost with a port that matches spoke Keycloak pattern (8xxx)
      if (parsedUrl.hostname === 'localhost' && parsedUrl.port && instanceCode) {
        const port = parseInt(parsedUrl.port);
        // Spoke Keycloak ports are typically 8xxx (e.g., 8467 for PRT)
        if (port >= 8000 && port < 9000) {
          // Translate to internal container name: {instanceCode}-keycloak-{instanceCode}-1
          const containerName = `${instanceCode.toLowerCase()}-keycloak-${instanceCode.toLowerCase()}-1`;
          const internalUrl = `https://${containerName}:8443${parsedUrl.pathname}`;
          logger.debug('Translated URL for container validation', {
            original: url,
            translated: internalUrl,
            instanceCode,
            containerName
          });
          return internalUrl;
        }
      }
    } catch (error) {
      logger.warn('Failed to translate URL for container validation', { url, error: error instanceof Error ? error.message : 'Unknown error' });
    }

    return url; // Fallback to original URL
  }

  /**
   * Validate TLS version and cipher strength
   *
   * @param url - The URL to check (IdP issuer or SSO endpoint)
   * @param instanceCode - Optional instance code for container URL translation
   * @returns TLS validation results with scoring
   *
   * Scoring:
   * - TLS 1.3 = 15 points
   * - TLS 1.2 = 12 points
   * - TLS < 1.2 = 0 points (fail)
   */
  async validateTLS(url: string, instanceCode?: string): Promise<ITLSCheckResult> {
    const startTime = Date.now();
    logger.debug('Validating TLS for URL', { url });

    const result: ITLSCheckResult = {
      pass: false,
      version: '',
      cipher: '',
      certificateValid: false,
      score: 0,
      errors: [],
      warnings: [],
    };

    try {
      // Translate URL for containerized environments if needed
      const translatedUrl = this.translateUrlForContainerValidation(url, instanceCode);

      // Parse URL to extract host and port
      const parsedUrl = new URL(translatedUrl);
      const host = parsedUrl.hostname;
      const port = parseInt(parsedUrl.port || '443', 10);

      logger.debug('Validating TLS connection', {
        originalUrl: url,
        translatedUrl,
        host,
        port,
        instanceCode
      });

      // Perform TLS handshake
      const tlsResult = await this.performTLSHandshake(host, port);

      result.version = tlsResult.version;
      result.cipher = tlsResult.cipher;
      result.certificateValid = tlsResult.certificateValid;
      result.certificateExpiry = tlsResult.certificateExpiry;

      // Best Practice: Always warn about unauthorized certificates, even if we allow them
      if (!tlsResult.authorized && this.config.allowSelfSigned) {
        result.warnings.push('Certificate not authorized (self-signed or untrusted CA). Allowed for pilot.');
      }

      // Check TLS version
      const tlsVersionNum = TLS_VERSION_MAP[tlsResult.version] || 0;
      const minVersionNum = TLS_VERSION_MAP[`TLSv${this.config.minTlsVersion}`] || 1.2;

      if (tlsVersionNum < minVersionNum) {
        result.pass = false;
        result.score = 0;
        result.errors.push(
          `TLS version too old: ${tlsResult.version}. Minimum required: TLS ${this.config.minTlsVersion}`
        );
      } else {
        result.pass = true;

        // Score based on TLS version
        if (tlsVersionNum >= 1.3) {
          result.score = 15;
        } else if (tlsVersionNum >= 1.2) {
          result.score = 12;
        } else {
          result.score = 0;
        }
      }

      // Check certificate validity
      if (!tlsResult.certificateValid) {
        if (this.config.allowSelfSigned) {
          result.warnings.push('Certificate validation failed (self-signed or expired). Allowed for pilot.');
        } else {
          result.pass = false;
          result.errors.push('Certificate is invalid or expired');
        }
      }

      // Check certificate expiry
      if (tlsResult.certificateExpiry) {
        const daysUntilExpiry = Math.floor(
          (tlsResult.certificateExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntilExpiry < 0) {
          result.errors.push('Certificate has expired');
          if (!this.config.allowSelfSigned) {
            result.pass = false;
          }
        } else if (daysUntilExpiry < 30) {
          result.warnings.push(`Certificate expires in ${daysUntilExpiry} days`);
        }
      }

      // Check cipher strength
      if (tlsResult.cipher) {
        if (this.isWeakCipher(tlsResult.cipher)) {
          result.warnings.push(`Weak cipher suite detected: ${tlsResult.cipher}`);
        }
      }

      const duration = Date.now() - startTime;
      logger.info('TLS validation complete', {
        url,
        version: result.version,
        score: result.score,
        pass: result.pass,
        durationMs: duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('TLS validation failed', { url, error: errorMessage, durationMs: duration });

      result.pass = false;
      result.score = 0;
      result.errors.push(`TLS connection failed: ${errorMessage}`);

      return result;
    }
  }

  /**
   * Perform TLS handshake with target host
   *
   * @private
   */
  private performTLSHandshake(
    host: string,
    port: number
  ): Promise<{
    version: string;
    cipher: string;
    certificateValid: boolean;
    certificateExpiry?: Date;
    authorized: boolean;
  }> {
    return new Promise((resolve, reject) => {
      const socket = tls.connect(
        {
          host,
          port,
          servername: host,
          timeout: this.config.timeoutMs,
          // Allow unauthorized for pilot (we'll check manually)
          rejectUnauthorized: false,
        },
        () => {
          const version = socket.getProtocol() || 'unknown';
          const cipher = socket.getCipher()?.name || 'unknown';
          const cert = socket.getPeerCertificate(true);

          let certificateValid = false;
          let certificateExpiry: Date | undefined;

          if (cert && Object.keys(cert).length > 0) {
            // Check if certificate is valid (authorized by CA or allowed self-signed)
            certificateValid = socket.authorized || this.config.allowSelfSigned;

            // Extract expiry date
            if (cert.valid_to) {
              certificateExpiry = new Date(cert.valid_to);
            }
          }

          // Note: We'll check if self-signed later and add warning even if allowed

          socket.end();

          resolve({
            version,
            cipher,
            certificateValid,
            certificateExpiry,
            authorized: socket.authorized,
          });
        }
      );

      socket.on('error', (error) => {
        reject(error);
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('TLS handshake timeout'));
      });
    });
  }

  /**
   * Check if cipher suite is considered weak
   *
   * @private
   */
  private isWeakCipher(cipher: string): boolean {
    const weakPatterns = [
      /MD5/i,
      /RC4/i,
      /DES/i,
      /3DES/i,
      /NULL/i,
      /EXPORT/i,
      /anon/i,
    ];

    return weakPatterns.some(pattern => pattern.test(cipher));
  }

  /**
   * Validate cryptographic algorithms in OIDC JWKS
   *
   * @param jwksUrl - The JWKS endpoint URL
   * @returns Algorithm validation results with scoring
   *
   * Scoring:
   * - All SHA-256+ = 25 points
   * - Contains SHA-1 = 10 points (warning)
   * - Contains MD5 or denied = 0 points (fail)
   */
  async validateOIDCAlgorithms(jwksUrl: string): Promise<IAlgorithmCheckResult> {
    const startTime = Date.now();
    logger.debug('Validating OIDC algorithms', { jwksUrl });

    const result: IAlgorithmCheckResult = {
      pass: false,
      algorithms: [],
      violations: [],
      score: 0,
      recommendations: [],
    };

    try {
      // Fetch JWKS
      const response = await axios.get(jwksUrl, {
        timeout: this.config.timeoutMs,
        httpsAgent: new https.Agent({
          rejectUnauthorized: !this.config.allowSelfSigned,
        }),
      });

      const jwks = response.data;

      if (!jwks.keys || !Array.isArray(jwks.keys)) {
        result.violations.push('Invalid JWKS format: missing keys array');
        return result;
      }

      // Extract algorithms from keys
      const algorithms: string[] = jwks.keys
        .map((key: { alg: string }) => key.alg)
        .filter((alg: string | undefined): alg is string => !!alg); // Filter out undefined

      result.algorithms = algorithms;

      // Check against deny-list
      const deniedFound = algorithms.filter((alg: string) =>
        this.config.deniedAlgorithms.some(denied => alg.toLowerCase().includes(denied.toLowerCase()))
      );

      if (deniedFound.length > 0) {
        result.pass = false;
        result.score = 0;
        result.violations = deniedFound.map(alg => `Denied algorithm: ${alg}`);
        result.recommendations.push('Remove weak algorithms and use RS256, RS512, ES256, or PS256');

        const duration = Date.now() - startTime;
        logger.warn('OIDC algorithms validation failed - denied algorithms found', {
          jwksUrl,
          deniedFound,
          durationMs: duration,
        });

        return result;
      }

      // Check for SHA-1 (warning in pilot mode)
      const sha1Found = algorithms.some((alg: string) =>
        alg.toLowerCase().includes('sha1') || alg === 'RS1' || alg === 'HS1'
      );

      if (sha1Found) {
        if (this.config.strictMode) {
          result.pass = false;
          result.score = 0;
          result.violations.push('SHA-1 based algorithms not allowed in strict mode');
        } else {
          result.pass = true;
          result.score = 10;
          result.violations.push('Weak algorithm: SHA-1 detected (warning)');
          result.recommendations.push('Upgrade to SHA-256 or stronger (RS256, RS512, ES256, ES512)');
        }
      } else {
        result.pass = true;
        result.score = 25;
      }

      // Check if using recommended algorithms
      const recommendedAlgs = ['RS256', 'RS512', 'ES256', 'ES512', 'PS256', 'PS512'];
      const hasRecommended = algorithms.some((alg: string) => recommendedAlgs.includes(alg));

      if (!hasRecommended && result.pass) {
        result.recommendations.push('Consider using recommended algorithms: RS256, RS512, ES256, or ES512');
      }

      const duration = Date.now() - startTime;
      logger.info('OIDC algorithms validation complete', {
        jwksUrl,
        algorithms,
        score: result.score,
        pass: result.pass,
        durationMs: duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('OIDC algorithms validation error', {
        jwksUrl,
        error: errorMessage,
        durationMs: duration,
      });

      result.pass = false;
      result.score = 0;
      result.violations = [`Failed to fetch JWKS: ${errorMessage}`];

      return result;
    }
  }

  /**
   * Validate cryptographic algorithms in SAML metadata
   *
   * @param signatureAlgorithm - Signature algorithm URI from SAML metadata
   * @returns Algorithm validation results with scoring
   */
  validateSAMLAlgorithm(signatureAlgorithm: string): IAlgorithmCheckResult {
    logger.debug('Validating SAML algorithm', { signatureAlgorithm });

    const result: IAlgorithmCheckResult = {
      pass: false,
      algorithms: [signatureAlgorithm],
      violations: [],
      score: 0,
      recommendations: [],
    };

    // SAML algorithm URIs
    const sha256Patterns = [
      'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256',
      'rsa-sha256',
      'sha256',
    ];

    const sha1Patterns = [
      'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
      'http://www.w3.org/2000/09/xmldsig#dsa-sha1',
      'rsa-sha1',
      'sha1',
    ];

    const md5Patterns = [
      'md5',
      'rsa-md5',
    ];

    // Check for SHA-256+ (good)
    if (sha256Patterns.some(pattern => signatureAlgorithm.toLowerCase().includes(pattern.toLowerCase()))) {
      result.pass = true;
      result.score = 25;
      logger.info('SAML algorithm validation passed - SHA-256', { signatureAlgorithm });
      return result;
    }

    // Check for MD5 (fail)
    if (md5Patterns.some(pattern => signatureAlgorithm.toLowerCase().includes(pattern.toLowerCase()))) {
      result.pass = false;
      result.score = 0;
      result.violations.push('MD5 algorithm not allowed');
      result.recommendations.push('Use SHA-256 or stronger algorithm');
      logger.warn('SAML algorithm validation failed - MD5', { signatureAlgorithm });
      return result;
    }

    // Check for SHA-1 (warn)
    if (sha1Patterns.some(pattern => signatureAlgorithm.toLowerCase().includes(pattern.toLowerCase()))) {
      if (this.config.strictMode) {
        result.pass = false;
        result.score = 0;
        result.violations.push('SHA-1 algorithm not allowed in strict mode');
      } else {
        result.pass = true;
        result.score = 10;
        result.violations.push('Weak algorithm: SHA-1 detected (warning)');
        result.recommendations.push('Upgrade to SHA-256 or stronger');
      }
      logger.warn('SAML algorithm validation - SHA-1 detected', { signatureAlgorithm, strictMode: this.config.strictMode });
      return result;
    }

    // Unknown algorithm
    result.pass = false;
    result.score = 0;
    result.violations.push(`Unknown or unsupported algorithm: ${signatureAlgorithm}`);
    result.recommendations.push('Use standard SHA-256 based signature algorithm');
    logger.warn('SAML algorithm validation failed - unknown algorithm', { signatureAlgorithm });

    return result;
  }

  /**
   * Check endpoint reachability
   *
   * @param url - The endpoint URL to check
   * @returns Endpoint check results with scoring
   */
  async checkEndpointReachability(url: string): Promise<IEndpointCheckResult> {
    const startTime = Date.now();
    logger.debug('Checking endpoint reachability', { url });

    const result: IEndpointCheckResult = {
      reachable: false,
      latency_ms: 0,
      score: 0,
      errors: [],
    };

    try {
      const response = await axios.get(url, {
        timeout: this.config.timeoutMs,
        httpsAgent: new https.Agent({
          rejectUnauthorized: !this.config.allowSelfSigned,
        }),
        validateStatus: (status) => status < 500, // Accept 4xx but not 5xx
      });

      const duration = Date.now() - startTime;
      result.latency_ms = duration;

      if (response.status >= 200 && response.status < 400) {
        result.reachable = true;
        result.score = 10;
      } else {
        result.reachable = false;
        result.score = 0;
        result.errors.push(`Endpoint returned status ${response.status}`);
      }

      logger.info('Endpoint reachability check complete', {
        url,
        reachable: result.reachable,
        status: response.status,
        latencyMs: duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : (error as { message?: string })?.message || 'Unknown error';
      result.latency_ms = duration;
      result.reachable = false;
      result.score = 0;
      result.errors.push(`Endpoint unreachable: ${errorMessage}`);

      logger.error('Endpoint reachability check failed', {
        url,
        error: errorMessage,
        latencyMs: duration,
      });

      return result;
    }
  }
}

// Export class for testing with custom configs
export { IdPValidationService };

// Export singleton instance for production use
export const idpValidationService = new IdPValidationService();
