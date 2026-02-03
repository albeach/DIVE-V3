/**
 * NATO Compliance: ADatP-5663 §3.4, §5.4.2 - Attribute Authority
 * Phase 4, Task 4.1
 *
 * Standalone Attribute Authority service that:
 * 1. Fetches additional attributes (LDAP, database, computed)
 * 2. Signs attributes with JWS (RFC 7515)
 * 3. Returns signed attribute payload
 */

import * as jose from 'jose';
import { logger } from '../utils/logger';
import { attributeSignerService } from './attribute-signer.service';

interface AttributeRequest {
  accessToken: string;
  attributeNames: string[];
}

interface SignedAttributes {
  attributes: Record<string, any>;
  signature: string;  // JWS Compact Serialization
  issuedAt: string;
  expiresAt: string;
}

export class AttributeAuthorityService {
  /**
   * Validates access token
   */
  private async validateAccessToken(
    accessToken: string
  ): Promise<jose.JWTPayload> {
    try {
      // Fetch JWKS from Keycloak
      const keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
      const realm = process.env.KEYCLOAK_REALM || 'dive-v3-broker';
      const jwksUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`;
      const JWKS = jose.createRemoteJWKSet(new URL(jwksUrl));

      // Verify token
      const { payload } = await jose.jwtVerify(accessToken, JWKS, {
        issuer: `${keycloakUrl}/realms/${realm}`,
        audience: 'dive-v3-client',
      });

      return payload;
    } catch (error) {
      throw new Error(`Access token validation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Fetches attributes from multiple sources
   */
  private async fetchAttributes(
    userId: string,
    attributeNames: string[]
  ): Promise<Record<string, any>> {
    const attributes: Record<string, any> = {};

    // TODO: Implement attribute fetching from:
    // 1. Attribute cache (Redis) - Phase 2
    // 2. LDAP via Keycloak UserInfo
    // 3. MongoDB user attributes
    // 4. Computed attributes (e.g., derived COI)

    // For now, return placeholder attributes
    for (const name of attributeNames) {
      switch (name) {
        case 'clearance':
          attributes[name] = 'SECRET'; // From token or LDAP
          break;
        case 'countryOfAffiliation':
          attributes[name] = 'USA'; // From token
          break;
        case 'acpCOI':
          attributes[name] = ['NATO-COSMIC', 'FVEY']; // From token or computed
          break;
        case 'uniqueID':
          attributes[name] = userId;
          break;
        default:
          // Attribute not available
          logger.warn(`Attribute ${name} not available for user ${userId}`);
      }
    }

    return attributes;
  }

  /**
   * Main AA endpoint: Get signed attributes
   *
   * ADatP-5663 §5.4.2:
   * - AA retrieval requires valid access token
   * - Attributes digitally signed by AA for integrity
   */
  async getSignedAttributes(
    request: AttributeRequest
  ): Promise<SignedAttributes> {
    try {
      logger.info('Attribute Authority request received');

      // 1. Validate access token
      const tokenClaims = await this.validateAccessToken(request.accessToken);
      const subject = tokenClaims.sub as string;

      logger.info(`Access token valid for subject: ${subject}`);

      // 2. Fetch requested attributes
      const attributes = await this.fetchAttributes(
        subject,
        request.attributeNames
      );

      logger.info(
        `Fetched ${Object.keys(attributes).length} attributes for ${subject}`
      );

      // 3. Sign attributes with AA private key
      const now = Math.floor(Date.now() / 1000);
      const exp = now + 900; // 15 minutes

      const payload = {
        sub: subject,
        iss: 'dive-attribute-authority',
        iat: now,
        exp,
        attributes,
        attributeSources: {}, // Could track sources per attribute
      };

      const signature = await attributeSignerService.signPayload(payload);

      const issuedAt = new Date(now * 1000);
      const expiresAt = new Date(exp * 1000);

      logger.info(`✅ Signed attributes issued for ${subject}`);

      return {
        attributes,
        signature,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      logger.error(`Attribute Authority error: ${error}`);
      throw error;
    }
  }

  /**
   * Verifies signed attributes
   */
  async verifySignedAttributes(jws: string): Promise<{
    valid: boolean;
    attributes?: Record<string, any>;
    error?: string;
  }> {
    try {
      const result = await attributeSignerService.verifySignature(jws);

      if (!result.valid) {
        return {
          valid: false,
          error: result.error,
        };
      }

      return {
        valid: true,
        attributes: result.payload?.attributes,
      };
    } catch (error) {
      logger.error(`Attribute signature verification failed: ${error}`);
      return {
        valid: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Exports AA public key for SPs (JWKS format)
   */
  async getPublicJWKS(): Promise<jose.JSONWebKeySet> {
    try {
      return await attributeSignerService.exportPublicJWKS();
    } catch (error) {
      logger.error(`Failed to export JWKS: ${error}`);
      throw new Error('Failed to generate JWKS');
    }
  }
}

export const attributeAuthorityService = new AttributeAuthorityService();

