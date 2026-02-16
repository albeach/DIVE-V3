/**
 * @file oidc-discovery.service.ts
 * @description OIDC discovery endpoint validator
 * 
 * Phase 1: Automated OIDC configuration validation
 * 
 * Validates:
 * - .well-known/openid-configuration endpoint
 * - Required OIDC fields (issuer, endpoints, response_types)
 * - JWKS endpoint reachability
 * - MFA support detection (ACR values)
 * 
 * Conforms to OpenID Connect Discovery 1.0 specification
 */

import axios from 'axios';
import * as https from 'https';
import { logger } from '../utils/logger';
import { IOIDCDiscoveryResult, IJWKSInfo, IMFASupportInfo } from '../types/validation.types';

/**
 * OIDC Discovery Validator Service
 * 
 * Fetches and validates OpenID Connect discovery documents
 */
class OIDCDiscoveryService {
  private readonly timeoutMs: number;
  private readonly allowSelfSigned: boolean;

  constructor() {
    this.timeoutMs = parseInt(process.env.ENDPOINT_TIMEOUT_MS || '5000', 10);
    this.allowSelfSigned = process.env.ALLOW_SELF_SIGNED_CERTS !== 'false';
  }

  /**
   * Validate OIDC discovery endpoint and configuration
   * 
   * @param issuer - The OIDC issuer URL
   * @returns Discovery validation results
   * 
   * Fetches /.well-known/openid-configuration and validates:
   * - Required fields present
   * - Issuer matches
   * - JWKS endpoint reachable
   * - Response types include 'code'
   */
  async validateOIDCDiscovery(issuer: string): Promise<IOIDCDiscoveryResult> {
    const startTime = Date.now();
    logger.debug('Validating OIDC discovery', { issuer });

    const result: IOIDCDiscoveryResult = {
      valid: false,
      issuer: '',
      endpoints: {
        authorization: '',
        token: '',
        jwks: '',
      },
      jwks: {
        reachable: false,
        keyCount: 0,
        algorithms: [],
      },
      mfaSupport: {
        detected: false,
        acrValues: [],
      },
      errors: [],
      warnings: [],
    };

    try {
      // Ensure issuer doesn't end with slash
      const cleanIssuer = issuer.replace(/\/$/, '');

      // Construct discovery URL
      const discoveryUrl = `${cleanIssuer}/.well-known/openid-configuration`;

      logger.debug('Fetching OIDC discovery document', { discoveryUrl });

      // Fetch discovery document
      const response = await axios.get(discoveryUrl, {
        timeout: this.timeoutMs,
        httpsAgent: new https.Agent({
          rejectUnauthorized: !this.allowSelfSigned,
        }),
      });

      const discovery = response.data;

      // Validate issuer field
      if (!discovery.issuer) {
        result.errors.push('Missing required field: issuer');
        return result;
      }

      // Check issuer matches
      const discoveryIssuer = discovery.issuer.replace(/\/$/, '');
      if (discoveryIssuer !== cleanIssuer) {
        result.warnings.push(
          `Issuer mismatch: expected ${cleanIssuer}, got ${discoveryIssuer}`
        );
      }
      result.issuer = discovery.issuer;

      // Extract required endpoints
      const requiredEndpoints = [
        'authorization_endpoint',
        'token_endpoint',
        'jwks_uri',
      ];

      for (const endpoint of requiredEndpoints) {
        if (!discovery[endpoint]) {
          result.errors.push(`Missing required field: ${endpoint}`);
        }
      }

      // If missing required endpoints, fail
      if (result.errors.length > 0) {
        return result;
      }

      // Populate endpoints
      result.endpoints.authorization = discovery.authorization_endpoint;
      result.endpoints.token = discovery.token_endpoint;
      result.endpoints.jwks = discovery.jwks_uri;

      // Optional endpoints
      if (discovery.userinfo_endpoint) {
        result.endpoints.userinfo = discovery.userinfo_endpoint;
      } else {
        result.warnings.push('UserInfo endpoint not specified (optional but recommended)');
      }

      if (discovery.end_session_endpoint) {
        result.endpoints.endSession = discovery.end_session_endpoint;
      } else {
        result.warnings.push('End session endpoint not specified (optional)');
      }

      // Validate response types
      if (!discovery.response_types_supported) {
        result.warnings.push('response_types_supported not specified');
      } else if (!discovery.response_types_supported.includes('code')) {
        result.errors.push('Authorization code flow (response_type=code) not supported');
        return result;
      }

      // Validate subject types
      if (!discovery.subject_types_supported) {
        result.warnings.push('subject_types_supported not specified');
      }

      // Check for MFA support (ACR values)
      result.mfaSupport = this.detectMFASupport(discovery);

      // Validate JWKS endpoint
      result.jwks = await this.validateJWKS(discovery.jwks_uri);

      if (!result.jwks.reachable) {
        result.errors.push('JWKS endpoint unreachable');
        return result;
      }

      if (result.jwks.keyCount === 0) {
        result.errors.push('JWKS contains no keys');
        return result;
      }

      // Validation successful
      result.valid = true;

      const duration = Date.now() - startTime;
      logger.info('OIDC discovery validation complete', {
        issuer,
        valid: result.valid,
        mfaDetected: result.mfaSupport.detected,
        keyCount: result.jwks.keyCount,
        durationMs: duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const err = error as Error & { response?: { status?: number; statusText?: string }; code?: string };
      logger.error('OIDC discovery validation failed', {
        issuer,
        error: err.message,
        durationMs: duration,
      });

      result.valid = false;

      if (err.response) {
        result.errors.push(
          `Discovery endpoint returned ${err.response.status}: ${err.response.statusText}`
        );
      } else if (err.code === 'ECONNREFUSED') {
        result.errors.push('Connection refused - IdP may be offline');
      } else if (err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
        result.errors.push('Discovery endpoint unreachable');
      } else {
        result.errors.push(`Discovery fetch failed: ${err.message}`);
      }

      return result;
    }
  }

  /**
   * Validate JWKS endpoint
   * 
   * @private
   * @param jwksUri - The JWKS endpoint URL
   * @returns JWKS validation info
   */
  private async validateJWKS(jwksUri: string): Promise<IJWKSInfo> {
    const jwksInfo: IJWKSInfo = {
      reachable: false,
      keyCount: 0,
      algorithms: [],
    };

    try {
      logger.debug('Validating JWKS endpoint', { jwksUri });

      const response = await axios.get(jwksUri, {
        timeout: this.timeoutMs,
        httpsAgent: new https.Agent({
          rejectUnauthorized: !this.allowSelfSigned,
        }),
      });

      const jwks = response.data;

      if (!jwks.keys || !Array.isArray(jwks.keys)) {
        logger.warn('JWKS missing keys array', { jwksUri });
        return jwksInfo;
      }

      jwksInfo.reachable = true;
      jwksInfo.keyCount = jwks.keys.length;

      // Extract algorithms
      const algorithms: string[] = jwks.keys
        .map((key: { alg: string }) => key.alg)
        .filter((alg: string | undefined): alg is string => !!alg);

      jwksInfo.algorithms = [...new Set(algorithms)]; // Deduplicate

      logger.debug('JWKS validated successfully', {
        jwksUri,
        keyCount: jwksInfo.keyCount,
        algorithms: jwksInfo.algorithms,
      });

      return jwksInfo;
    } catch (error) {
      logger.error('JWKS validation failed', { jwksUri, error: error instanceof Error ? error.message : String(error) });
      return jwksInfo;
    }
  }

  /**
   * Detect MFA support from discovery document
   * 
   * @private
   * @param discovery - The OIDC discovery document
   * @returns MFA support detection results
   * 
   * Checks:
   * - acr_values_supported for MFA-related URNs
   * - claims_supported for 'amr' (authentication methods reference)
   */
  private detectMFASupport(discovery: Record<string, unknown>): IMFASupportInfo {
    const mfaInfo: IMFASupportInfo = {
      detected: false,
      acrValues: [],
    };

    // Known MFA-related ACR values
    const mfaAcrPatterns = [
      'mfa',
      'multifactor',
      'urn:mace:incommon:iap:silver', // InCommon Silver (MFA required)
      'urn:mace:incommon:iap:gold',   // InCommon Gold (2FA + hardware)
      'phrh',                         // NIST 800-63 High Assurance
      'urn:oasis:names:tc:SAML:2.0:ac:classes:MultiFactor',
    ];

    // Check acr_values_supported
    if (discovery.acr_values_supported && Array.isArray(discovery.acr_values_supported)) {
      const mfaAcrs = discovery.acr_values_supported.filter((acr: string) =>
        mfaAcrPatterns.some(pattern =>
          acr.toLowerCase().includes(pattern.toLowerCase())
        )
      );

      if (mfaAcrs.length > 0) {
        mfaInfo.detected = true;
        mfaInfo.acrValues = mfaAcrs;
      }
    }

    // Check claims_supported for 'amr' (authentication methods reference)
    if (discovery.claims_supported && Array.isArray(discovery.claims_supported)) {
      if (discovery.claims_supported.includes('amr')) {
        mfaInfo.detected = true;
        logger.debug('MFA detection: AMR claim supported');
      }
    }

    // Check for scope 'mfa' or 'multifactor'
    if (discovery.scopes_supported && Array.isArray(discovery.scopes_supported)) {
      const hasMfaScope = discovery.scopes_supported.some((scope: string) =>
        scope.toLowerCase().includes('mfa') || scope.toLowerCase().includes('multifactor')
      );

      if (hasMfaScope) {
        mfaInfo.detected = true;
        logger.debug('MFA detection: MFA scope supported');
      }
    }

    logger.debug('MFA support detection complete', {
      detected: mfaInfo.detected,
      acrValues: mfaInfo.acrValues,
    });

    return mfaInfo;
  }
}

// Export singleton instance
export const oidcDiscoveryService = new OIDCDiscoveryService();
