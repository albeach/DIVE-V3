/**
 * DIVE V3 - Federation Discovery Route
 *
 * Public endpoint: GET /.well-known/dive-federation
 *
 * Returns this instance's federation metadata for prospective partners.
 * No authentication required — this is public discovery metadata
 * (similar to OIDC Discovery at /.well-known/openid-configuration).
 *
 * Standards: RFC 8414 (OAuth 2.0 Authorization Server Metadata)
 *
 * @version 1.0.0
 * @date 2026-02-21
 */

import { Router, Request, Response } from 'express';
import { instanceIdentityService } from '../services/instance-identity.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /.well-known/dive-federation
 *
 * Returns instance metadata for federation discovery.
 * Any prospective federation partner can consume this to begin enrollment.
 */
router.get('/.well-known/dive-federation', async (_req: Request, res: Response): Promise<void> => {
  try {
    const instanceCode = (process.env.INSTANCE_CODE || process.env.COUNTRY_CODE || 'USA').toUpperCase();
    const instanceName = process.env.INSTANCE_NAME || `DIVE Instance ${instanceCode}`;

    // Determine URLs from environment
    const apiUrl = process.env.PUBLIC_API_URL
      || process.env.API_URL
      || `https://api.dive25.com`;
    const idpUrl = process.env.PUBLIC_IDP_URL
      || process.env.IDP_URL
      || `https://idp.dive25.com`;
    const realm = process.env.KEYCLOAK_REALM || `dive-v3-broker-${instanceCode.toLowerCase()}`;

    // Get instance identity (generates on first call if not exists)
    const identity = await instanceIdentityService.getIdentity();

    const metadata = {
      version: '1.0',
      protocol: 'dive-federation',
      instanceCode,
      instanceName,

      // Federation endpoints
      federation: {
        enrollmentEndpoint: `${apiUrl}/api/federation/enroll`,
        statusEndpoint: `${apiUrl}/api/federation/enrollment/{id}/status`,
        credentialExchangeEndpoint: `${apiUrl}/api/federation/enrollment/{id}/credentials`,
        eventsEndpoint: `${apiUrl}/api/federation/enrollment/{id}/events`,
      },

      // Instance identity
      identity: {
        oidcIssuer: `${idpUrl}/realms/${realm}`,
        oidcDiscovery: `${idpUrl}/realms/${realm}/.well-known/openid-configuration`,
        instanceCertFingerprint: identity.fingerprint,
        spiffeId: identity.spiffeId,
      },

      // Capabilities this instance supports
      capabilities: [
        'oidc-federation',
        'kas',
        'opal-policy-sync',
        'acp240',
        'enrollment-v1',
      ],

      // Contact info
      contact: process.env.FEDERATION_CONTACT_EMAIL || `federation-admin@${instanceCode.toLowerCase()}.dive25.com`,

      // Metadata
      generatedAt: new Date().toISOString(),
    };

    // Cache for 5 minutes (metadata is relatively stable)
    res.set('Cache-Control', 'public, max-age=300');
    res.json(metadata);

  } catch (error) {
    logger.error('Failed to generate federation discovery metadata', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      error: 'InternalError',
      message: 'Failed to generate federation metadata',
    });
  }
});

export default router;
