/**
 * DIVE V3 - Spoke Lifecycle Operations
 *
 * Standalone functions for spoke status transitions (approve, suspend,
 * unsuspend, revoke) and their cascading side-effects across federation,
 * OPAL/OPA, KAS, and COI systems.
 *
 * Extracted from hub-spoke-registry.service.ts for modularity.
 *
 * @version 1.0.0
 * @date 2026-02-14
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import type { ISpokeRegistration, ISpokeStore } from './registry-types';
import {
  createFederationIdP,
  registerSpokeKAS,
  suspendSpokeKAS,
  reactivateSpokeKAS,
  removeSpokeKAS,
  updateCoiMembershipsForFederation,
} from './federation-cascade';
import {
  notifyOPALOfSpokeChange,
  updateOPATrustForSpoke,
} from './opal-trust';

// ============================================
// LIFECYCLE CONTEXT
// ============================================

export interface LifecycleContext {
  store: ISpokeStore;
  emit: (event: string, ...args: unknown[]) => boolean;
}

// ============================================
// APPROVE SPOKE
// ============================================

/**
 * Approve a pending spoke registration
 *
 * Phase 3 Enhancement: Automatically creates Keycloak IdP federation
 * This enables cross-border SSO immediately upon approval.
 */
export async function approveSpoke(
  ctx: LifecycleContext,
  spokeId: string,
  approvedBy: string,
  options: {
    allowedScopes: string[];
    trustLevel: ISpokeRegistration['trustLevel'];
    maxClassification: string;
    dataIsolationLevel: ISpokeRegistration['dataIsolationLevel'];
    autoLinkIdP?: boolean;
    autoRegenFederation?: boolean;
  }
): Promise<ISpokeRegistration> {
  const spoke = await ctx.store.findById(spokeId);
  if (!spoke) {
    throw new Error(`Spoke ${spokeId} not found`);
  }

  if (spoke.status === 'approved') {
    throw new Error(`Spoke ${spokeId} is already approved`);
  }

  spoke.status = 'approved';
  spoke.approvedAt = new Date();
  spoke.approvedBy = approvedBy;
  spoke.allowedPolicyScopes = options.allowedScopes;
  spoke.trustLevel = options.trustLevel;
  spoke.maxClassificationAllowed = options.maxClassification;
  spoke.dataIsolationLevel = options.dataIsolationLevel;

  await ctx.store.save(spoke);

  const correlationId = `spoke-approval-${uuidv4()}`;

  logger.info('Spoke approved', {
    spokeId,
    instanceCode: spoke.instanceCode,
    approvedBy,
    allowedScopes: options.allowedScopes,
    trustLevel: options.trustLevel,
    correlationId
  });

  // Notify OPAL to include this spoke in policy distribution
  await notifyOPALOfSpokeChange(spoke, 'approved');

  // EVENT-DRIVEN CASCADE
  ctx.emit('spoke:approved', {
    spoke,
    timestamp: new Date(),
    approvedBy,
    correlationId
  });

  // AUTO-LINK IDENTITY PROVIDER (Bidirectional)
  if (options.autoLinkIdP !== false) {
    try {
      await createFederationIdP(spoke, ctx.store);

      spoke.federationIdPAlias = `${spoke.instanceCode.toLowerCase()}-idp`;
      await ctx.store.save(spoke);

      // Clear the Keycloak password after successful federation (security best practice)
      spoke.keycloakAdminPassword = undefined;
      await ctx.store.save(spoke);

      logger.info('BIDIRECTIONAL IdP federation established successfully', {
        spokeId,
        instanceCode: spoke.instanceCode,
        hubIdpAlias: spoke.federationIdPAlias,
        spokeIdpAlias: `${(process.env.INSTANCE_CODE || 'usa').toLowerCase()}-idp`,
        bidirectional: true,
        passwordCleared: true,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // FIX (2026-02-09): Don't suspend on federation failure during auto-approval.
      logger.warn('Bidirectional federation failed during auto-approval (non-fatal)', {
        spokeId,
        instanceCode: spoke.instanceCode,
        error: errorMessage,
        impact: 'CLI pipeline will handle federation setup as fallback',
        previousBehavior: 'Would have suspended spoke - now continues with approved status',
      });

      spoke.federationIdPAlias = undefined;
      await ctx.store.save(spoke);

      logger.info('Spoke remains approved despite federation error — CLI will complete setup', {
        spokeId,
        instanceCode: spoke.instanceCode,
        status: spoke.status,
      });
    }
  }

  // DYNAMIC TRUSTED ISSUER UPDATE
  try {
    await updateOPATrustForSpoke(spoke, 'add');
  } catch (error) {
    logger.error('Failed to update OPA trust data during spoke approval', {
      spokeId,
      instanceCode: spoke.instanceCode,
      error: error instanceof Error ? error.message : 'Unknown error',
      warning: 'Spoke approved but OPA trust not updated - tokens may be rejected'
    });
  }

  // AUTO-REGISTER KAS INSTANCE
  try {
    await registerSpokeKAS(spoke);
    logger.info('KAS auto-registered during spoke approval', {
      spokeId,
      instanceCode: spoke.instanceCode,
      kasId: `${spoke.instanceCode.toLowerCase()}-kas`
    });
  } catch (error) {
    logger.warn('KAS auto-registration failed (non-blocking)', {
      spokeId,
      instanceCode: spoke.instanceCode,
      error: error instanceof Error ? error.message : 'Unknown error',
      impact: 'Encrypted document sharing may not work until KAS manually registered'
    });
  }

  // AUTO-UPDATE COI MEMBERSHIPS
  try {
    await updateCoiMembershipsForFederation(ctx.store);
    logger.info('COI memberships auto-updated from active federation', {
      spokeId,
      instanceCode: spoke.instanceCode
    });
  } catch (error) {
    logger.warn('COI membership auto-update failed (non-blocking)', {
      spokeId,
      instanceCode: spoke.instanceCode,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // FORCE OPAL DATA SYNC TO ALL OPA INSTANCES
  try {
    logger.info('Triggering OPAL data sync to all OPA instances after spoke approval', {
      spokeId,
      instanceCode: spoke.instanceCode
    });

    const { opalCdcService } = await import('./opal-cdc.service');
    const syncResult = await opalCdcService.forcePublishAll();

    if (syncResult.success) {
      logger.info('OPAL data successfully synced to all OPA instances', {
        spokeId,
        instanceCode: spoke.instanceCode,
        publishedDataTypes: Object.keys(syncResult.results || {}),
        message: 'Federation is now active - spoke tokens will be accepted'
      });
    } else {
      logger.error('OPAL sync failed after spoke approval - OPA may have stale data', {
        spokeId,
        instanceCode: spoke.instanceCode,
        syncResults: syncResult.results,
        impact: 'Spoke SSO may not work until manual sync: curl -X POST /api/opal/sync/force'
      });
      ctx.emit('spoke:opal-sync-failed', { spoke, syncResult });
    }
  } catch (error) {
    logger.error('Failed to trigger OPAL sync after spoke approval', {
      spokeId,
      instanceCode: spoke.instanceCode,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      impact: 'Spoke approved but OPA data not synced - tokens may be rejected until manual sync'
    });
  }

  return spoke;
}

// ============================================
// SUSPEND SPOKE
// ============================================

/**
 * Suspend a spoke (temporary block)
 */
export async function suspendSpoke(
  ctx: LifecycleContext,
  spokeId: string,
  reason: string
): Promise<ISpokeRegistration> {
  const spoke = await ctx.store.findById(spokeId);
  if (!spoke) {
    throw new Error(`Spoke ${spokeId} not found`);
  }

  spoke.status = 'suspended';
  await ctx.store.save(spoke);

  // Revoke all tokens for this spoke
  await ctx.store.revokeTokensForSpoke(spokeId);

  logger.warn('Spoke suspended', {
    spokeId,
    instanceCode: spoke.instanceCode,
    reason
  });

  await notifyOPALOfSpokeChange(spoke, 'suspended');

  // DYNAMIC TRUSTED ISSUER UPDATE
  try {
    await updateOPATrustForSpoke(spoke, 'remove');
  } catch (error) {
    logger.error('Failed to remove OPA trust data during spoke suspension', {
      spokeId,
      instanceCode: spoke.instanceCode,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // SUSPEND KAS INSTANCE
  try {
    await suspendSpokeKAS(spoke, reason);
  } catch (error) {
    logger.warn('Failed to suspend KAS during spoke suspension', {
      spokeId,
      instanceCode: spoke.instanceCode,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // AUTO-UPDATE COI MEMBERSHIPS
  try {
    await updateCoiMembershipsForFederation(ctx.store);
  } catch (error) {
    logger.warn('COI membership auto-update failed during suspension', {
      spokeId,
      instanceCode: spoke.instanceCode,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // EVENT-DRIVEN CASCADE
  const correlationId = `spoke-suspension-${uuidv4()}`;
  ctx.emit('spoke:suspended', {
    spoke,
    timestamp: new Date(),
    suspendedBy: 'admin',
    reason,
    correlationId
  });

  return spoke;
}

// ============================================
// UNSUSPEND SPOKE
// ============================================

/**
 * Unsuspend a spoke (reactivate after suspension)
 */
export async function unsuspendSpoke(
  ctx: LifecycleContext,
  spokeId: string,
  unsuspendedBy: string,
  options: { retryFederation?: boolean } = {}
): Promise<ISpokeRegistration> {
  const spoke = await ctx.store.findById(spokeId);
  if (!spoke) {
    throw new Error(`Spoke ${spokeId} not found`);
  }

  if (spoke.status !== 'suspended') {
    throw new Error(`Spoke ${spokeId} is not suspended (current status: ${spoke.status})`);
  }

  spoke.status = 'approved';
  spoke.suspendedReason = undefined;
  await ctx.store.save(spoke);

  logger.info('Spoke unsuspended', {
    spokeId,
    instanceCode: spoke.instanceCode,
    unsuspendedBy,
    retryFederation: options.retryFederation,
  });

  // Re-add to OPAL
  await notifyOPALOfSpokeChange(spoke, 'approved');

  // Re-add to OPA trust
  try {
    await updateOPATrustForSpoke(spoke, 'add');
  } catch (error) {
    logger.error('Failed to restore OPA trust data during spoke unsuspension', {
      spokeId,
      instanceCode: spoke.instanceCode,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Optionally retry bidirectional federation
  if (options.retryFederation) {
    logger.info('Retrying bidirectional federation for unsuspended spoke', {
      spokeId,
      instanceCode: spoke.instanceCode,
    });

    try {
      await createFederationIdP(spoke, ctx.store);
      spoke.federationIdPAlias = `${spoke.instanceCode.toLowerCase()}-idp`;
      await ctx.store.save(spoke);

      logger.info('Bidirectional federation restored successfully', {
        spokeId,
        instanceCode: spoke.instanceCode,
      });
    } catch (error) {
      logger.warn('Federation retry failed but spoke remains approved', {
        spokeId,
        instanceCode: spoke.instanceCode,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // REACTIVATE KAS
  try {
    await reactivateSpokeKAS(spoke);
  } catch (error) {
    logger.warn('Failed to reactivate KAS during spoke unsuspension', {
      spokeId,
      instanceCode: spoke.instanceCode,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // AUTO-UPDATE COI MEMBERSHIPS
  try {
    await updateCoiMembershipsForFederation(ctx.store);
  } catch (error) {
    logger.warn('COI membership auto-update failed during unsuspension', {
      spokeId,
      instanceCode: spoke.instanceCode,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // Emit event
  const correlationId = `spoke-unsuspension-${uuidv4()}`;
  ctx.emit('spoke:unsuspended', {
    spoke,
    timestamp: new Date(),
    unsuspendedBy,
    correlationId,
  });

  return spoke;
}

// ============================================
// REVOKE SPOKE
// ============================================

/**
 * Permanently revoke a spoke
 */
export async function revokeSpoke(
  ctx: LifecycleContext,
  spokeId: string,
  reason: string
): Promise<void> {
  const spoke = await ctx.store.findById(spokeId);
  if (!spoke) {
    throw new Error(`Spoke ${spokeId} not found`);
  }

  spoke.status = 'revoked';
  await ctx.store.save(spoke);

  // Revoke all tokens
  await ctx.store.revokeTokensForSpoke(spokeId);

  logger.error('Spoke revoked', {
    spokeId,
    instanceCode: spoke.instanceCode,
    reason
  });

  await notifyOPALOfSpokeChange(spoke, 'revoked');

  // DYNAMIC TRUSTED ISSUER UPDATE
  try {
    await updateOPATrustForSpoke(spoke, 'remove');
  } catch (error) {
    logger.error('Failed to remove OPA trust data during spoke revocation', {
      spokeId,
      instanceCode: spoke.instanceCode,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // REMOVE KAS INSTANCE
  try {
    await removeSpokeKAS(spoke);
  } catch (error) {
    logger.warn('Failed to remove KAS during spoke revocation', {
      spokeId,
      instanceCode: spoke.instanceCode,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // AUTO-UPDATE COI MEMBERSHIPS
  try {
    await updateCoiMembershipsForFederation(ctx.store);
  } catch (error) {
    logger.warn('COI membership auto-update failed during revocation', {
      spokeId,
      instanceCode: spoke.instanceCode,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // EVENT-DRIVEN CASCADE
  const correlationId = `spoke-revocation-${uuidv4()}`;
  ctx.emit('spoke:revoked', {
    spoke,
    timestamp: new Date(),
    revokedBy: 'admin',
    reason,
    correlationId
  });
}
