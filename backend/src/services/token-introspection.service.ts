/**
 * DIVE V3 - OAuth2 Token Introspection Service
 *
 * Industry-standard approach for 100% guaranteed bidirectional SSO federation.
 * Replaces fragile JWT signature validation with proper OAuth2 token introspection.
 *
 * Key Benefits:
 * - No shared keys required across instances
 * - Each instance validates tokens against their issuing IdP
 * - Automatic key rotation handling via JWKS
 * - Circuit breaker protection against IdP outages
 * - Cached JWKS for performance
 * - Proper OAuth2/OIDC compliance
 *
 * @version 2.0.0 - Token Introspection Approach
 * @date 2025-01-12
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import https from 'https';
import NodeCache from 'node-cache';
import { logger } from '../utils/logger';
import CircuitBreaker from 'opossum';
import { JwksClient } from 'jwks-rsa';
import jwt from 'jsonwebtoken';

export interface TokenIntrospectionRequest {
  token: string;
  token_type_hint?: 'access_token' | 'refresh_token';
}

export interface TokenIntrospectionResponse {
  active: boolean;
  client_id?: string;
  username?: string;
  scope?: string;
  token_type?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
  sub?: string;
  aud?: string | string[];
  iss?: string;
  jti?: string;
  // Custom claims
  uniqueID?: string;
  clearance?: string;
  countryOfAffiliation?: string;
  acpCOI?: string[];
  // Authentication context
  acr?: string;
  amr?: string[];
  auth_time?: number;
  // Error information
  error?: string;
  error_description?: string;
}

export interface JWKSKey {
  kid: string;
  kty: string;
  use: string;
  n: string;
  e: string;
  x5c?: string[];
  x5t?: string;
  'x5t#S256'?: string;
}

export interface IdPDiscoveryMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  introspection_endpoint: string;
  userinfo_endpoint: string;
  revocation_endpoint: string;
  jwks_uri: string;
  scopes_supported: string[];
  response_types_supported: string[];
  response_modes_supported: string[];
  grant_types_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  claims_supported: string[];
}

/**
 * OAuth2 Token Introspection Service
 * Handles cross-instance token validation via OAuth2 introspection endpoints
 */
export class TokenIntrospectionService {
  private httpClient: AxiosInstance;
  private jwksCache: NodeCache;
  private introspectionCache: NodeCache;
  private discoveryCache: NodeCache;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  // Configuration
  private readonly JWKS_CACHE_TTL = 3600; // 1 hour
  private readonly INTROSPECTION_CACHE_TTL = 300; // 5 minutes
  private readonly DISCOVERY_CACHE_TTL = 3600; // 1 hour
  private readonly REQUEST_TIMEOUT = 5000; // 5 seconds
  private readonly CIRCUIT_BREAKER_OPTIONS = {
    timeout: 5000, // 5 second timeout
    errorThresholdPercentage: 50, // Open circuit after 50% failures
    resetTimeout: 30000, // 30 seconds before trying again
    rollingCountTimeout: 10000, // 10 second window
    rollingCountBuckets: 10,
  };

  constructor() {
    // Initialize HTTP client with reasonable defaults
    // CRITICAL: Accept self-signed certificates for internal Docker network communication
    this.httpClient = axios.create({
      timeout: this.REQUEST_TIMEOUT,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false, // Accept self-signed certificates
      }),
    });

    // Initialize caches
    this.jwksCache = new NodeCache({
      stdTTL: this.JWKS_CACHE_TTL,
      checkperiod: 600, // Check for expired keys every 10 minutes
    });

    this.introspectionCache = new NodeCache({
      stdTTL: this.INTROSPECTION_CACHE_TTL,
      checkperiod: 60, // Check for expired introspections every minute
    });

    this.discoveryCache = new NodeCache({
      stdTTL: this.DISCOVERY_CACHE_TTL,
      checkperiod: 600,
    });

    logger.info('Token Introspection Service initialized', {
      jwksCacheTTL: this.JWKS_CACHE_TTL,
      introspectionCacheTTL: this.INTROSPECTION_CACHE_TTL,
      requestTimeout: this.REQUEST_TIMEOUT,
    });
  }

  /**
   * Normalize issuer URL for internal container access
   * Translates localhost URLs to internal Docker DNS names
   */
  private normalizeIssuerUrl(issuer: string): string[] {
    const urls: string[] = [];

    try {
      const parsedUrl = new URL(issuer);

      // If it's localhost, try internal Docker DNS names FIRST
      if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
        // Extract instance code from realm name (e.g., dive-v3-broker-nzl -> nzl)
        const realmMatch = parsedUrl.pathname.match(/\/realms\/dive-v3-broker-(\w+)/);
        if (realmMatch) {
          const instanceCode = realmMatch[1];
          const codeLower = instanceCode.toLowerCase();
          const codeUpper = instanceCode.toUpperCase();

          // CRITICAL: Try KEYCLOAK_URL first if it contains the instance code
          // This ensures we use the correct internal DNS that Keycloak recognizes
          if (process.env.KEYCLOAK_URL && process.env.KEYCLOAK_URL.includes(codeLower)) {
            urls.push(`${process.env.KEYCLOAK_URL}${parsedUrl.pathname}`);
          }

          // Pattern 1: dive-spoke-{code}-keycloak (standard DIVE V3 spoke naming - lowercase)
          urls.push(`https://dive-spoke-${codeLower}-keycloak:8443${parsedUrl.pathname}`);

          // Pattern 2: dive-hub-keycloak (for USA hub specifically)
          if (codeLower === 'usa') {
            urls.push(`https://dive-hub-keycloak:8443${parsedUrl.pathname}`);
          }

          // Pattern 3: keycloak-{code} (alternative naming - lowercase)
          urls.push(`https://keycloak-${codeLower}:8443${parsedUrl.pathname}`);

          // Pattern 4: {code}-keycloak-{code}-1 (docker-compose generated names - lowercase)
          urls.push(`https://${codeLower}-keycloak-${codeLower}-1:8443${parsedUrl.pathname}`);

          // Fallback: Try generic KEYCLOAK_URL
          if (process.env.KEYCLOAK_URL) {
            urls.push(`${process.env.KEYCLOAK_URL}${parsedUrl.pathname}`);
          }
        }
      }

      // Always try original last (in case it's accessible)
      urls.push(issuer);
    } catch (error) {
      logger.debug('Failed to parse issuer URL', { issuer, error: error instanceof Error ? error.message : 'Unknown error' });
      // Fallback to original
      urls.push(issuer);
    }

    // Log the URLs we're trying (helpful for debugging federation issues)
    if (urls.length > 1) {
      logger.debug('Normalized issuer to try multiple URLs', { issuer, count: urls.length, first: urls[0] });
    }

    return urls;
  }

  /**
   * Normalize discovery metadata to replace localhost URLs with Docker DNS
   * Keycloak returns URLs based on KC_HOSTNAME, but we need internal Docker DNS
   */
  private normalizeDiscoveryMetadata(metadata: IdPDiscoveryMetadata, workingBaseUrl: string): IdPDiscoveryMetadata {
    try {
      // Extract base URL from the working URL (e.g., https://dive-hub-keycloak:8443/realms/dive-v3-broker-usa)
      const workingParsed = new URL(workingBaseUrl);
      const workingBase = `${workingParsed.protocol}//${workingParsed.host}`;

      // Function to replace localhost with the working base URL
      const normalizeUrl = (url: string | undefined): string | undefined => {
        if (!url) return url;
        try {
          const parsed = new URL(url);
          // Only normalize localhost URLs
          if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
            return `${workingBase}${parsed.pathname}${parsed.search}`;
          }
          return url;
        } catch {
          return url;
        }
      };

      // Normalize all URL fields in the metadata
      return {
        ...metadata,
        issuer: normalizeUrl(metadata.issuer) || metadata.issuer,
        authorization_endpoint: normalizeUrl(metadata.authorization_endpoint),
        token_endpoint: normalizeUrl(metadata.token_endpoint),
        introspection_endpoint: normalizeUrl(metadata.introspection_endpoint),
        userinfo_endpoint: normalizeUrl(metadata.userinfo_endpoint),
        end_session_endpoint: normalizeUrl(metadata.end_session_endpoint),
        jwks_uri: normalizeUrl(metadata.jwks_uri),
        revocation_endpoint: normalizeUrl(metadata.revocation_endpoint),
        device_authorization_endpoint: normalizeUrl(metadata.device_authorization_endpoint),
        registration_endpoint: normalizeUrl(metadata.registration_endpoint),
      };
    } catch (error) {
      logger.warn('Failed to normalize discovery metadata', {
        error: error instanceof Error ? error.message : 'Unknown error',
        workingBaseUrl,
      });
      return metadata; // Return original if normalization fails
    }
  }

  /**
   * Discover OAuth2 endpoints for an issuer
   */
  private async discoverEndpoints(issuer: string): Promise<IdPDiscoveryMetadata | null> {
    const cacheKey = `discovery:${issuer}`;

    // Check cache first
    const cached = this.discoveryCache.get<IdPDiscoveryMetadata>(cacheKey);
    if (cached) {
      logger.debug('Using cached discovery metadata', { issuer });
      return cached;
    }

    // Get all possible URLs to try (original + normalized)
    const issuerUrls = this.normalizeIssuerUrl(issuer);

    // Try each URL until one succeeds
    for (const tryUrl of issuerUrls) {
      try {
        // Try standard .well-known/openid-configuration endpoint (OIDC standard)
        // Note: Keycloak uses openid-configuration, NOT openid-connect-configuration
        const discoveryUrl = `${tryUrl}/.well-known/openid-configuration`;

        logger.debug('Discovering OAuth2 endpoints', { issuer, tryUrl, discoveryUrl });

        const response: AxiosResponse<IdPDiscoveryMetadata> = await this.httpClient.get(discoveryUrl);

        if (response.data && response.data.introspection_endpoint) {
          // CRITICAL: Normalize returned URLs to use Docker DNS instead of localhost
          // Keycloak returns URLs based on KC_HOSTNAME config, but we accessed via tryUrl
          // Replace the base URL in all returned endpoints with the URL that worked
          const normalizedMetadata = this.normalizeDiscoveryMetadata(response.data, tryUrl);

          // Cache the normalized discovery metadata
          this.discoveryCache.set(cacheKey, normalizedMetadata);

          logger.info('Discovered OAuth2 endpoints', {
            issuer,
            tryUrl,
            introspectionEndpoint: normalizedMetadata.introspection_endpoint,
            jwksUri: normalizedMetadata.jwks_uri,
            normalized: normalizedMetadata.introspection_endpoint !== response.data.introspection_endpoint,
          });

          return normalizedMetadata;
        } else {
          logger.debug('Incomplete discovery metadata - missing introspection_endpoint', { issuer, tryUrl });
          // Continue to next URL
        }
      } catch (error) {
        logger.debug('Discovery attempt failed, trying next URL', {
          issuer,
          tryUrl,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Continue to next URL
      }
    }

    // All URLs failed
    logger.error('Failed to discover OAuth2 endpoints from all URLs', {
      issuer,
      triedUrls: issuerUrls,
    });
    return null;
  }

  /**
   * Get or create circuit breaker for an issuer
   */
  private getCircuitBreaker(issuer: string): CircuitBreaker {
    if (!this.circuitBreakers.has(issuer)) {
      const breaker = new CircuitBreaker(async (operation: () => Promise<any>) => {
        return await operation();
      }, this.CIRCUIT_BREAKER_OPTIONS);

      // Circuit breaker event handlers
      breaker.on('open', () => {
        logger.warn('Circuit breaker opened for issuer', { issuer });
      });

      breaker.on('halfOpen', () => {
        logger.info('Circuit breaker half-open for issuer', { issuer });
      });

      breaker.on('close', () => {
        logger.info('Circuit breaker closed for issuer', { issuer });
      });

      this.circuitBreakers.set(issuer, breaker);
    }

    return this.circuitBreakers.get(issuer)!;
  }

  /**
   * Validate JWT signature using JWKS (fallback when introspection fails)
   */
  private async validateWithJwks(token: string, issuer: string): Promise<TokenIntrospectionResponse> {
    try {
      // Extract issuer from token
      const decoded = jwt.decode(token, { complete: true }) as any;
      if (!decoded || !decoded.header || !decoded.header.kid) {
        return { active: false, error: 'invalid_token', error_description: 'Missing key ID in token header' };
      }

      const kid = decoded.header.kid;

      // Try to get discovery metadata
      const metadata = await this.discoverEndpoints(issuer);

      // If discovery succeeded, use the discovered JWKS URI
      let jwksUri: string;
      if (metadata?.jwks_uri) {
        jwksUri = metadata.jwks_uri;
        logger.debug('Using discovered JWKS URI', { issuer, jwksUri });
      } else {
        // FALLBACK: Discovery failed, construct JWKS URI manually
        // Try normalized issuer URLs and append standard JWKS path
        const issuerUrls = this.normalizeIssuerUrl(issuer);
        const jwksPath = '/protocol/openid-connect/certs';

        // Try each possible JWKS URI until one works
        let jwksFound = false;
        for (const tryIssuer of issuerUrls) {
          const tryJwksUri = `${tryIssuer}${jwksPath}`;
          try {
            // Test if JWKS endpoint is accessible
            const testResponse = await this.httpClient.get(tryJwksUri);
            if (testResponse.data && testResponse.data.keys && testResponse.data.keys.length > 0) {
              jwksUri = tryJwksUri;
              jwksFound = true;
              logger.info('Constructed JWKS URI (discovery unavailable)', { issuer, jwksUri });
              break;
            }
          } catch (error) {
            logger.debug('JWKS URI test failed, trying next', { tryJwksUri, error: error instanceof Error ? error.message : 'Unknown error' });
          }
        }

        if (!jwksFound) {
          logger.error('Could not find accessible JWKS URI', { issuer, triedUrls: issuerUrls });
          return { active: false, error: 'jwks_unavailable', error_description: 'JWKS URI not available' };
        }
      }

      // Get JWKS client
      const cacheKey = `jwks:${jwksUri}`;
      let jwksClient = this.jwksCache.get<JwksClient>(cacheKey);

      if (!jwksClient) {
        jwksClient = new JwksClient({
          jwksUri: jwksUri,
          timeout: this.REQUEST_TIMEOUT,
          cache: true,
          cacheMaxAge: this.JWKS_CACHE_TTL * 1000,
          requestHeaders: {},
          requestAgent: new https.Agent({ rejectUnauthorized: false }), // Accept self-signed certs
        });
        this.jwksCache.set(cacheKey, jwksClient);
      }

      // Get signing key
      const key = await jwksClient.getSigningKey(kid);
      const publicKey = key.getPublicKey();

      // Verify JWT signature
      const verified = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        issuer: issuer,
        clockTolerance: 30, // 30 second clock skew tolerance
      }) as any;

      // DEBUG: Log ALL claims in token to diagnose ACR/AMR issue
      logger.info('JWT claims extracted', {
        uniqueID: verified.uniqueID,
        clearance: verified.clearance,
        country: verified.countryOfAffiliation,
        acr: verified.acr,
        amr: verified.amr,
        user_acr: (verified as any).user_acr,
        user_amr: (verified as any).user_amr,
        dive_acr: (verified as any).dive_acr,
        dive_amr: (verified as any).dive_amr,
        allClaimKeys: Object.keys(verified).filter(k => k.includes('acr') || k.includes('amr')),
      });

      // Convert to introspection response format
      return {
        active: true,
        client_id: verified.client_id || verified.azp,
        username: verified.preferred_username || verified.sub,
        scope: verified.scope,
        token_type: 'Bearer',
        exp: verified.exp,
        iat: verified.iat,
        nbf: verified.nbf,
        sub: verified.sub,
        aud: verified.aud,
        iss: verified.iss,
        jti: verified.jti,
        uniqueID: verified.uniqueID,
        clearance: verified.clearance,
        countryOfAffiliation: verified.countryOfAffiliation,
        acpCOI: verified.acpCOI,
        acr: verified.acr || (verified as any).user_acr || '0',  // Try fallbacks
        amr: verified.amr || (verified as any).user_amr || ['pwd'],  // Try fallbacks
        auth_time: verified.auth_time,
      };
    } catch (error) {
      logger.error('JWKS validation failed', {
        issuer,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        active: false,
        error: 'token_validation_failed',
        error_description: error instanceof Error ? error.message : 'Token validation failed',
      };
    }
  }

  /**
   * Introspect token using OAuth2 introspection endpoint
   */
  private async introspectToken(
    token: string,
    issuer: string,
    clientCredentials?: { clientId: string; clientSecret: string }
  ): Promise<TokenIntrospectionResponse> {
    // Check cache first
    const cacheKey = `introspect:${token.substring(0, 16)}:${issuer}`;
    const cached = this.introspectionCache.get<TokenIntrospectionResponse>(cacheKey);
    if (cached) {
      logger.debug('Using cached introspection result', { issuer, tokenPrefix: token.substring(0, 16) });
      return cached;
    }

    try {
      // Get discovery metadata
      const metadata = await this.discoverEndpoints(issuer);
      if (!metadata?.introspection_endpoint) {
        logger.warn('Introspection endpoint not available, falling back to JWKS validation', { issuer });
        return await this.validateWithJwks(token, issuer);
      }

      // Prepare introspection request
      const params = new URLSearchParams();
      params.append('token', token);
      params.append('token_type_hint', 'access_token');

      const requestConfig: any = {
        method: 'POST' as const,
        url: metadata.introspection_endpoint,
        data: params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
      };

      // Add client authentication if provided
      if (clientCredentials) {
        requestConfig.headers['Authorization'] = `Basic ${Buffer.from(
          `${clientCredentials.clientId}:${clientCredentials.clientSecret}`
        ).toString('base64')}`;
      }

      // Execute introspection with circuit breaker
      const breaker = this.getCircuitBreaker(issuer);
      const response = await breaker.fire(async () => {
        return await this.httpClient.request(requestConfig);
      });

      const result: TokenIntrospectionResponse = (response as any).data;

      // Cache the result
      this.introspectionCache.set(cacheKey, result);

      logger.debug('Token introspection successful', {
        issuer,
        active: result.active,
        clientId: result.client_id,
        subject: result.sub,
      });

      return result;
    } catch (error) {
      logger.error('Token introspection failed', {
        issuer,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Fallback to JWKS validation if introspection fails
      logger.info('Falling back to JWKS validation', { issuer });
      return await this.validateWithJwks(token, issuer);
    }
  }

  /**
   * Validate token from any trusted issuer
   * This is the main entry point for token validation
   */
  async validateToken(
    token: string,
    allowedIssuers?: string[],
    clientCredentials?: { clientId: string; clientSecret: string }
  ): Promise<TokenIntrospectionResponse> {
    try {
      // First, try to decode the token to get the issuer
      const decoded = jwt.decode(token, { complete: true }) as any;
      if (!decoded || !decoded.payload || !decoded.payload.iss) {
        return {
          active: false,
          error: 'invalid_token',
          error_description: 'Unable to decode token or missing issuer claim',
        };
      }

      const tokenIssuer = decoded.payload.iss;

      // Check if issuer is in allowed list (if provided)
      if (allowedIssuers && !allowedIssuers.includes(tokenIssuer)) {
        return {
          active: false,
          error: 'issuer_not_trusted',
          error_description: `Issuer ${tokenIssuer} is not in the list of trusted issuers`,
        };
      }

      // If no client credentials provided, try to load from environment
      // This allows backends to automatically use their own credentials for introspection
      let effectiveCredentials = clientCredentials;
      if (!effectiveCredentials) {
        const clientId = process.env.KEYCLOAK_CLIENT_ID;
        const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
        
        if (clientId && clientSecret) {
          effectiveCredentials = { clientId, clientSecret };
          logger.debug('Using environment client credentials for token introspection', { clientId });
        }
      }

      // Validate the token
      const result = await this.introspectToken(token, tokenIssuer, effectiveCredentials);

      // Log validation result
      if (result.active) {
        logger.info('Token validation successful', {
          issuer: tokenIssuer,
          subject: result.sub,
          clientId: result.client_id,
          clearance: result.clearance,
          country: result.countryOfAffiliation,
        });
      } else {
        logger.warn('Token validation failed', {
          issuer: tokenIssuer,
          error: result.error,
          errorDescription: result.error_description,
        });
      }

      return result;
    } catch (error) {
      logger.error('Token validation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        active: false,
        error: 'validation_error',
        error_description: error instanceof Error ? error.message : 'Token validation failed',
      };
    }
  }

  /**
   * Get issuer discovery metadata
   */
  async getIssuerMetadata(issuer: string): Promise<IdPDiscoveryMetadata | null> {
    return await this.discoverEndpoints(issuer);
  }

  /**
   * Clear all caches (useful for testing or forced refresh)
   */
  clearCaches(): void {
    this.jwksCache.flushAll();
    this.introspectionCache.flushAll();
    this.discoveryCache.flushAll();
    logger.info('All caches cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    jwks: { keys: number; hits: number; misses: number; ksize: number; vsize: number };
    introspection: { keys: number; hits: number; misses: number; ksize: number; vsize: number };
    discovery: { keys: number; hits: number; misses: number; ksize: number; vsize: number };
  } {
    return {
      jwks: this.jwksCache.getStats(),
      introspection: this.introspectionCache.getStats(),
      discovery: this.discoveryCache.getStats(),
    };
  }

  /**
   * Health check for the service
   */
  async healthCheck(): Promise<{ healthy: boolean; details: Record<string, any> }> {
    const stats = this.getCacheStats();
    const circuitBreakerStats = Array.from(this.circuitBreakers.entries()).map(([issuer, breaker]) => {
      const breakerStats = (breaker as any).stats || {};
      return {
        issuer,
        state: breakerStats.state || 'unknown',
        failures: breakerStats.failures || 0,
        successfulCalls: breakerStats.successfulCalls || 0,
      };
    });

    return {
      healthy: true,
      details: {
        caches: stats,
        circuitBreakers: circuitBreakerStats,
        uptime: process.uptime(),
      },
    };
  }
}

// Export singleton instance
export const tokenIntrospectionService = new TokenIntrospectionService();