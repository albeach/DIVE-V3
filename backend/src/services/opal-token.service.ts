/**
 * OPAL Token Service
 *
 * Generates JWT tokens for OPAL interactions by calling the OPAL server's token endpoint.
 * 
 * OPAL Token Types:
 * - `client`: For OPAL clients to connect and subscribe to policy/data updates
 * - `datasource`: For data publishers to push data updates to OPAL server
 *
 * Token flow:
 * 1. Hub uses OPAL_AUTH_MASTER_TOKEN to authenticate with OPAL server
 * 2. OPAL server returns a signed JWT with RS256 algorithm
 * 3. Token is used for specific operations based on peer_type:
 *    - client: Spoke OPAL clients use this to subscribe to updates
 *    - datasource: Hub backend uses this to publish data updates
 */

import { logger } from '../utils/logger';
import https from 'https';

// Token types supported by OPAL
type OPALPeerType = 'client' | 'datasource';

interface IOPALTokenResponse {
  token: string;
  type: 'bearer';
  details: {
    id: string;
    type: OPALPeerType;
    expired: string;
    claims: {
      peer_type: OPALPeerType;
    };
  };
}

interface IOPALClientToken {
  token: string;
  expiresAt: Date;
  clientId: string;
  type: 'opal_client';
}

interface IOPALDatasourceToken {
  token: string;
  expiresAt: Date;
  clientId: string;
  type: 'opal_datasource';
}

class OPALTokenService {
  private masterToken: string;
  private opalServerUrl: string;

  constructor() {
    this.masterToken = process.env.OPAL_AUTH_MASTER_TOKEN || '';
    // Internal Docker URL for OPAL server
    this.opalServerUrl = process.env.OPAL_SERVER_URL || 'https://opal-server:7002';

    if (!this.masterToken) {
      logger.warn('OPAL_AUTH_MASTER_TOKEN not set - OPAL token generation will fail');
    }
  }

  /**
   * Generate an OPAL client JWT for a spoke.
   * This token allows the spoke's OPAL client to connect to the Hub's OPAL server.
   * Token type: 'client' (peer_type: PeerType.client)
   */
  async generateClientToken(spokeId: string, instanceCode: string): Promise<IOPALClientToken> {
    if (!this.masterToken) {
      throw new Error('OPAL master token not configured');
    }

    try {
      // Fetch CLIENT type token from OPAL server
      const response = await this.fetchOPALToken('client');

      const token: IOPALClientToken = {
        token: response.token,
        expiresAt: new Date(response.details.expired),
        clientId: response.details.id,
        type: 'opal_client'
      };

      logger.info('OPAL client token generated', {
        spokeId,
        instanceCode,
        clientId: token.clientId,
        expiresAt: token.expiresAt.toISOString()
      });

      return token;
    } catch (error) {
      logger.error('Failed to generate OPAL client token', {
        spokeId,
        instanceCode,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Generate an OPAL datasource JWT for data publishing.
   * This token allows the Hub backend to publish data updates to the OPAL server.
   * Token type: 'datasource' (peer_type: PeerType.datasource)
   * 
   * OPAL requires datasource tokens for:
   * - POST /data/config (data update notifications)
   * - Any endpoint that modifies OPAL data
   */
  async generateDatasourceToken(serviceId: string): Promise<IOPALDatasourceToken> {
    if (!this.masterToken) {
      throw new Error('OPAL master token not configured');
    }

    try {
      // Fetch DATASOURCE type token from OPAL server
      const response = await this.fetchOPALToken('datasource');

      const token: IOPALDatasourceToken = {
        token: response.token,
        expiresAt: new Date(response.details.expired),
        clientId: response.details.id,
        type: 'opal_datasource'
      };

      logger.info('OPAL datasource token generated', {
        serviceId,
        clientId: token.clientId,
        expiresAt: token.expiresAt.toISOString()
      });

      return token;
    } catch (error) {
      logger.error('Failed to generate OPAL datasource token', {
        serviceId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Fetch a token from the OPAL server's /token endpoint.
   * @param peerType - 'client' for subscriptions, 'datasource' for data publishing
   */
  private async fetchOPALToken(peerType: OPALPeerType): Promise<IOPALTokenResponse> {
    const url = new URL('/token', this.opalServerUrl);

    // Create custom HTTPS agent to handle self-signed certs
    const agent = new https.Agent({
      rejectUnauthorized: false // For self-signed certificates in development
    });

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.masterToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type: peerType }),
      // @ts-ignore - Node.js fetch supports agent
      agent
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OPAL token request failed: ${response.status} ${text}`);
    }

    return await response.json() as IOPALTokenResponse;
  }

  /**
   * Verify an OPAL client token is still valid.
   */
  isTokenValid(token: IOPALClientToken): boolean {
    return new Date() < token.expiresAt;
  }

  /**
   * Check if OPAL token service is properly configured.
   */
  isConfigured(): boolean {
    return !!this.masterToken && !!this.opalServerUrl;
  }

  /**
   * Get token expiry duration (default: 1 year).
   */
  getDefaultExpiry(): Date {
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);
    return expiry;
  }
}

export const opalTokenService = new OPALTokenService();

