/**
 * DIVE V3 - OPAL/OPA Trust Management
 *
 * Standalone functions for managing OPAL notifications, OPA trusted issuer
 * updates, federation matrix updates, and policy push triggers.
 *
 * Extracted from hub-spoke-registry.service.ts for modularity.
 *
 * @version 1.0.0
 * @date 2026-02-14
 */

import { logger } from '../utils/logger';
import { opalClient } from './opal-client';
import { opalDataService } from './opal-data.service';
import { getPortOffsetForCountry } from './federation-cascade';
import type { ISpokeRegistration } from './registry-types';

// ============================================
// OPAL NOTIFICATION
// ============================================

/**
 * Notify OPAL of spoke status change
 * This triggers policy scope updates
 */
export async function notifyOPALOfSpokeChange(
  spoke: ISpokeRegistration,
  event: 'approved' | 'suspended' | 'revoked'
): Promise<void> {
  if (!opalClient.isOPALEnabled()) {
    logger.debug('OPAL disabled, skipping spoke notification');
    return;
  }

  try {
    // NOTE: Spokes data is already included in /api/opal/policy-data response
    // No need for separate authorized_spokes topic - it was redundant and caused warnings
    // The /api/opal/policy-data endpoint includes spokes list in federation.spokes[]

    // OPAL will automatically fetch updated policy-data via regular polling or CDC trigger
    // If immediate update needed, the trusted_issuers CDC will trigger policy-data refresh

    logger.debug('Spoke status change will be reflected in next policy-data fetch', {
      event,
      spokeId: spoke.spokeId,
      instanceCode: spoke.instanceCode,
      hint: 'policy-data endpoint includes spokes list'
    });
  } catch (error) {
    logger.error('Failed to process spoke change notification', {
      error: error instanceof Error ? error.message : 'Unknown error',
      event,
      spokeId: spoke.spokeId
    });
  }
}

// ============================================
// OPA TRUST MANAGEMENT
// ============================================

/**
 * Update OPA trusted issuers and federation matrix for a spoke
 *
 * This method dynamically updates OPA's policy data when:
 * - A spoke is approved: Add its Keycloak as a trusted issuer
 * - A spoke is suspended/revoked: Remove its Keycloak from trusted issuers
 */
export async function updateOPATrustForSpoke(
  spoke: ISpokeRegistration,
  action: 'add' | 'remove'
): Promise<void> {
  const instanceCode = spoke.instanceCode.toUpperCase();

  const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
  let issuerUrl: string;

  if (isDevelopment) {
    const portOffset = getPortOffsetForCountry(instanceCode);
    const keycloakHttpsPort = 8443 + portOffset;
    const realmName = `dive-v3-broker-${instanceCode.toLowerCase()}`;
    issuerUrl = `https://localhost:${keycloakHttpsPort}/realms/${realmName}`;
  } else {
    issuerUrl = spoke.idpPublicUrl || spoke.idpUrl;
  }

  logger.info(`${action === 'add' ? 'Adding' : 'Removing'} trusted issuer for spoke`, {
    spokeId: spoke.spokeId,
    instanceCode,
    issuerUrl,
    action
  });

  if (action === 'add') {
    await opalDataService.updateTrustedIssuer(issuerUrl, {
      tenant: instanceCode,
      name: `${spoke.name || instanceCode} Keycloak`,
      country: instanceCode,
      trust_level: mapTrustLevel(spoke.trustLevel),
      enabled: true,
      protocol: 'oidc',
      federation_class: isDevelopment ? 'LOCAL' : 'NATIONAL'
    });

    const hubInstanceCode = process.env.INSTANCE_CODE || 'USA';
    const currentPartners = await getCurrentFederationPartners(hubInstanceCode);
    if (!currentPartners.includes(instanceCode)) {
      currentPartners.push(instanceCode);
      await opalDataService.updateFederationMatrix(hubInstanceCode, currentPartners);
    }

    logger.info('OPA trust data updated for approved spoke', {
      spokeId: spoke.spokeId,
      instanceCode,
      issuerUrl,
      federationPartners: currentPartners
    });
  } else {
    await opalDataService.removeTrustedIssuer(issuerUrl);

    const hubInstanceCode = process.env.INSTANCE_CODE || 'USA';
    const currentPartners = await getCurrentFederationPartners(hubInstanceCode);
    const updatedPartners = currentPartners.filter(p => p !== instanceCode);
    if (updatedPartners.length !== currentPartners.length) {
      await opalDataService.updateFederationMatrix(hubInstanceCode, updatedPartners);
    }

    logger.info('OPA trust data removed for suspended/revoked spoke', {
      spokeId: spoke.spokeId,
      instanceCode,
      issuerUrl,
      federationPartners: updatedPartners
    });
  }
}

/**
 * Map spoke trust level to OPA trust level
 */
export function mapTrustLevel(trustLevel: string): 'HIGH' | 'MEDIUM' | 'LOW' | 'DEVELOPMENT' {
  switch (trustLevel?.toUpperCase()) {
    case 'FULL': return 'HIGH';
    case 'PARTIAL': return 'MEDIUM';
    case 'MINIMAL': return 'LOW';
    default: return 'DEVELOPMENT';
  }
}

/**
 * Get current federation partners from OPA data
 */
export async function getCurrentFederationPartners(instanceCode: string): Promise<string[]> {
  try {
    const federationMatrix = await opalDataService.getFederationMatrix();
    return federationMatrix[instanceCode] || [];
  } catch (error) {
    logger.warn('Could not get current federation partners, starting with empty list', {
      instanceCode,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return [];
  }
}

/**
 * Push policy update to specific spoke (or all)
 */
export async function pushPolicyUpdate(spokeId?: string): Promise<void> {
  const result = await opalClient.triggerPolicyRefresh();

  logger.info('Policy push triggered', {
    targetSpoke: spokeId || 'all',
    success: result.success,
    transactionId: result.transactionId
  });
}
