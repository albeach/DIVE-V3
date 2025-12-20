/**
 * OPAL Token Service
 *
 * Generates JWT tokens for OPAL clients by calling the OPAL server's token endpoint.
 * These tokens allow spoke OPAL clients to connect and subscribe to policy updates.
 *
 * Token flow:
 * 1. Hub uses OPAL_AUTH_MASTER_TOKEN to authenticate with OPAL server
 * 2. OPAL server returns a signed JWT with RS256 algorithm
 * 3. Spoke uses this JWT as OPAL_CLIENT_TOKEN to connect
 */

import { logger } from '../utils/logger';
import https from 'https';

interface IOPALTokenResponse {
  token: string;
  type: 'bearer';
  details: {
    id: string;
    type: 'client';
    expired: string;
    claims: {
      peer_type: 'client';
    };
  };
}

interface IOPALClientToken {
  token: string;
  expiresAt: Date;
  clientId: string;
  type: 'opal_client';
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
   */
  async generateClientToken(spokeId: string, instanceCode: string): Promise<IOPALClientToken> {
    if (!this.masterToken) {
      throw new Error('OPAL master token not configured');
    }

    try {
      // Fetch token from OPAL server
      const response = await this.fetchOPALToken();

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
   * Fetch a client token from the OPAL server's /token endpoint.
   */
  private async fetchOPALToken(): Promise<IOPALTokenResponse> {
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
      body: JSON.stringify({ type: 'client' }),
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

