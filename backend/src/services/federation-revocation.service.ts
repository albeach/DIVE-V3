/**
 * DIVE V3 - Federation Revocation Service
 *
 * Orchestrates full trust revocation for the V2 Zero Trust enrollment protocol.
 * This is the inverse of federation-activation.service.ts — removes all trust
 * artifacts created during activation.
 *
 * Hub side: Auto-triggered when enrollment is revoked (via EventEmitter).
 * Spoke side: Triggered by cross-wire notification or manual CLI.
 *
 * All cascade steps are non-fatal — partial cleanup is better than no cleanup.
 *
 * @version 1.0.0
 * @date 2026-02-21
 */

import { logger } from '../utils/logger';
import type { IEnrollment } from '../models/enrollment.model';
import type { ISpokeRegistration } from './registry-types';

// ============================================
// TYPES
// ============================================

export interface RevocationStepResult {
  step: string;
  success: boolean;
  error?: string;
}

export interface RevocationSummary {
  enrollmentId?: string;
  partnerInstanceCode: string;
  steps: RevocationStepResult[];
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
}

// ============================================
// FEDERATION REVOCATION SERVICE
// ============================================

class FederationRevocationService {
  /**
   * Revoke federation on the Hub side — inverse of activateHubSide().
   *
   * Removes all trust artifacts created during activation:
   * IdP, OIDC client, trusted issuers, federation matrix, KAS, COI, OPAL sync.
   * Then notifies the partner (best-effort).
   *
   * @param enrollment - The enrollment record (status already transitioned to 'revoked')
   */
  async revokeHubSide(enrollment: IEnrollment): Promise<RevocationSummary> {
    const requesterCode = enrollment.requesterInstanceCode.toUpperCase();
    const steps: RevocationStepResult[] = [];

    logger.info('Starting Hub-side federation revocation', {
      enrollmentId: enrollment.enrollmentId,
      requesterInstanceCode: requesterCode,
    });

    // Step 1: Delete spoke's IdP from Hub Keycloak
    try {
      const { keycloakFederationService } = await import('./keycloak-federation.service');
      const alias = `${requesterCode.toLowerCase()}-idp`;
      await keycloakFederationService.deleteIdentityProvider(alias);
      steps.push({ step: 'delete_idp', success: true });
      logger.info('Deleted spoke IdP from Hub Keycloak', {
        enrollmentId: enrollment.enrollmentId,
        alias,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      steps.push({ step: 'delete_idp', success: false, error: msg });
      logger.warn('Failed to delete spoke IdP during revocation (non-fatal)', {
        enrollmentId: enrollment.enrollmentId,
        error: msg,
      });
    }

    // Step 2: Delete spoke's OIDC client from Hub Keycloak
    try {
      const { keycloakFederationService } = await import('./keycloak-federation.service');
      const clientId = `dive-v3-broker-${requesterCode.toLowerCase()}`;
      const deleted = await keycloakFederationService.deleteFederationClient(clientId);
      steps.push({ step: 'delete_oidc_client', success: true });
      logger.info('OIDC client cleanup complete', {
        enrollmentId: enrollment.enrollmentId,
        clientId,
        deleted,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      steps.push({ step: 'delete_oidc_client', success: false, error: msg });
      logger.warn('Failed to delete OIDC client during revocation (non-fatal)', {
        enrollmentId: enrollment.enrollmentId,
        error: msg,
      });
    }

    // Step 3: Remove OPA trust (trusted_issuers + federation_matrix)
    try {
      const { updateOPATrustForSpoke } = await import('./opal-trust');
      const spokeProxy = this.buildSpokeProxy(enrollment);
      await updateOPATrustForSpoke(spokeProxy, 'remove');
      steps.push({ step: 'remove_opa_trust', success: true });
      logger.info('OPA trust removed for revoked enrollment', {
        enrollmentId: enrollment.enrollmentId,
        instanceCode: requesterCode,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      steps.push({ step: 'remove_opa_trust', success: false, error: msg });
      logger.warn('Failed to remove OPA trust during revocation (non-fatal)', {
        enrollmentId: enrollment.enrollmentId,
        error: msg,
      });
    }

    // Step 4: Remove KAS registration + federation agreement
    try {
      const { removeSpokeKAS } = await import('./federation-cascade');
      const spokeProxy = this.buildSpokeProxy(enrollment);
      await removeSpokeKAS(spokeProxy);
      steps.push({ step: 'remove_kas', success: true });
      logger.info('KAS removed for revoked enrollment', {
        enrollmentId: enrollment.enrollmentId,
        kasId: `${requesterCode.toLowerCase()}-kas`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      steps.push({ step: 'remove_kas', success: false, error: msg });
      logger.warn('Failed to remove KAS during revocation (non-fatal)', {
        enrollmentId: enrollment.enrollmentId,
        error: msg,
      });
    }

    // Step 5: Update COI memberships (auto-excludes revoked spoke)
    try {
      const { updateCoiMembershipsForFederation } = await import('./federation-cascade');
      const { createSpokeStore } = await import('./registry-types');
      const store = createSpokeStore();
      await updateCoiMembershipsForFederation(store);
      steps.push({ step: 'update_coi', success: true });
      logger.info('COI memberships updated after revocation', {
        enrollmentId: enrollment.enrollmentId,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      steps.push({ step: 'update_coi', success: false, error: msg });
      logger.warn('Failed to update COI during revocation (non-fatal)', {
        enrollmentId: enrollment.enrollmentId,
        error: msg,
      });
    }

    // Step 6: Force OPAL data sync
    try {
      const { opalCdcService } = await import('./opal-cdc.service');
      await opalCdcService.forcePublishAll();
      steps.push({ step: 'opal_sync', success: true });
      logger.info('OPAL data synced after revocation', {
        enrollmentId: enrollment.enrollmentId,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      steps.push({ step: 'opal_sync', success: false, error: msg });
      logger.warn('OPAL sync failed after revocation (non-fatal)', {
        enrollmentId: enrollment.enrollmentId,
        error: msg,
      });
    }

    // Step 7: Notify partner of revocation (best-effort)
    try {
      await this.notifyPartnerOfRevocation(enrollment);
      steps.push({ step: 'notify_partner', success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      steps.push({ step: 'notify_partner', success: false, error: msg });
      logger.warn('Failed to notify partner of revocation (non-fatal)', {
        enrollmentId: enrollment.enrollmentId,
        requesterApiUrl: enrollment.requesterApiUrl,
        error: msg,
      });
    }

    const summary: RevocationSummary = {
      enrollmentId: enrollment.enrollmentId,
      partnerInstanceCode: requesterCode,
      steps,
      totalSteps: steps.length,
      successfulSteps: steps.filter(s => s.success).length,
      failedSteps: steps.filter(s => !s.success).length,
    };

    logger.info('Hub-side federation revocation complete', {
      enrollmentId: enrollment.enrollmentId,
      requesterInstanceCode: requesterCode,
      successfulSteps: summary.successfulSteps,
      failedSteps: summary.failedSteps,
    });

    return summary;
  }

  /**
   * Revoke federation on the local side — inverse of activateSpokeSide().
   *
   * Triggered by cross-wire notification from partner or manual CLI command.
   * Removes local trust artifacts: IdP, trusted issuers, federation matrix, KAS.
   *
   * @param partnerInstanceCode - The revoking partner's instance code
   */
  async revokeLocalSide(partnerInstanceCode: string): Promise<RevocationSummary> {
    const code = partnerInstanceCode.toUpperCase();
    const localInstanceCode = (process.env.INSTANCE_CODE || process.env.COUNTRY_CODE || 'USA').toUpperCase();
    const steps: RevocationStepResult[] = [];

    logger.info('Starting local-side federation revocation', {
      partnerInstanceCode: code,
      localInstanceCode,
    });

    // Step 1: Delete partner's IdP from local Keycloak
    try {
      const { keycloakFederationService } = await import('./keycloak-federation.service');
      const alias = `${code.toLowerCase()}-idp`;
      await keycloakFederationService.deleteIdentityProvider(alias);
      steps.push({ step: 'delete_idp', success: true });
      logger.info('Deleted partner IdP from local Keycloak', {
        partnerInstanceCode: code,
        alias,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      steps.push({ step: 'delete_idp', success: false, error: msg });
      logger.warn('Failed to delete partner IdP during local revocation (non-fatal)', {
        partnerInstanceCode: code,
        error: msg,
      });
    }

    // Step 2: Remove partner's trusted issuer
    try {
      const { opalDataService } = await import('./opal-data.service');
      // Remove the bidirectional federation link (handles both directions)
      await opalDataService.removeFederationLink(localInstanceCode, code);
      steps.push({ step: 'remove_trust', success: true });
      logger.info('Federation trust removed locally', {
        partnerInstanceCode: code,
        localInstanceCode,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      steps.push({ step: 'remove_trust', success: false, error: msg });
      logger.warn('Failed to remove federation trust during local revocation (non-fatal)', {
        partnerInstanceCode: code,
        error: msg,
      });
    }

    // Step 3: Remove partner's KAS + clean federation agreement
    try {
      const { mongoKasRegistryStore } = await import('../models/kas-registry.model');
      const kasId = `${code.toLowerCase()}-kas`;
      await mongoKasRegistryStore.remove(kasId);

      // Clean local federation agreement — remove partner's KAS from our trusted list
      const localAgreement = await mongoKasRegistryStore.getFederationAgreement(localInstanceCode);
      if (localAgreement?.trustedKAS?.includes(kasId)) {
        const updatedTrusted = localAgreement.trustedKAS.filter((k: string) => k !== kasId);
        await mongoKasRegistryStore.setFederationAgreement(
          localInstanceCode,
          updatedTrusted,
          localAgreement.maxClassification || 'SECRET',
          localAgreement.allowedCOIs || [],
        );
      }

      steps.push({ step: 'remove_kas', success: true });
      logger.info('Partner KAS removed locally', {
        partnerInstanceCode: code,
        kasId,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      steps.push({ step: 'remove_kas', success: false, error: msg });
      logger.warn('Failed to remove partner KAS during local revocation (non-fatal)', {
        partnerInstanceCode: code,
        error: msg,
      });
    }

    // Step 4: Force OPAL data sync
    try {
      const { opalCdcService } = await import('./opal-cdc.service');
      await opalCdcService.forcePublishAll();
      steps.push({ step: 'opal_sync', success: true });
      logger.info('OPAL data synced after local revocation', {
        partnerInstanceCode: code,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      steps.push({ step: 'opal_sync', success: false, error: msg });
      logger.warn('OPAL sync failed after local revocation (non-fatal)', {
        partnerInstanceCode: code,
        error: msg,
      });
    }

    const summary: RevocationSummary = {
      partnerInstanceCode: code,
      steps,
      totalSteps: steps.length,
      successfulSteps: steps.filter(s => s.success).length,
      failedSteps: steps.filter(s => !s.success).length,
    };

    logger.info('Local-side federation revocation complete', {
      partnerInstanceCode: code,
      successfulSteps: summary.successfulSteps,
      failedSteps: summary.failedSteps,
    });

    return summary;
  }

  /**
   * Notify the partner instance that federation has been revoked.
   *
   * Best-effort POST to the partner's API. If it fails, the partner
   * retains stale trust artifacts until manually cleaned up.
   */
  private async notifyPartnerOfRevocation(enrollment: IEnrollment): Promise<void> {
    const partnerApiUrl = enrollment.requesterApiUrl;
    if (!partnerApiUrl) {
      logger.warn('No partner API URL available for revocation notification', {
        enrollmentId: enrollment.enrollmentId,
      });
      return;
    }

    const https = await import('https');
    const { getSecureHttpsAgent } = await import('../utils/https-agent');

    const notificationUrl = `${partnerApiUrl}/api/federation/notify-revocation`;
    const payload = JSON.stringify({
      enrollmentId: enrollment.enrollmentId,
      revokerInstanceCode: enrollment.approverInstanceCode || process.env.INSTANCE_CODE || 'USA',
      reason: 'Federation revoked by approver',
    });

    logger.info('Notifying partner of revocation', {
      enrollmentId: enrollment.enrollmentId,
      notificationUrl,
    });

    return new Promise<void>((resolve, reject) => {
      const url = new URL(notificationUrl);
      const agent = getSecureHttpsAgent();

      const req = https.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
          agent,
          timeout: 10000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              logger.info('Partner notified of revocation', {
                enrollmentId: enrollment.enrollmentId,
                statusCode: res.statusCode,
              });
              resolve();
            } else {
              reject(new Error(`Partner notification returned ${res.statusCode}: ${data}`));
            }
          });
        },
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Partner notification timed out'));
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Build a minimal ISpokeRegistration proxy from enrollment data.
   * Same pattern as federation-activation.service.ts.
   */
  private buildSpokeProxy(enrollment: IEnrollment): ISpokeRegistration {
    const code = enrollment.requesterInstanceCode.toUpperCase();
    const issuerUrl = enrollment.requesterCredentials?.oidcIssuerUrl || '';

    return {
      spokeId: enrollment.enrollmentId,
      instanceCode: code,
      name: enrollment.requesterInstanceName,
      description: `V2 enrollment: ${enrollment.enrollmentId}`,
      baseUrl: enrollment.requesterApiUrl,
      apiUrl: enrollment.requesterApiUrl,
      idpUrl: issuerUrl,
      idpPublicUrl: issuerUrl,
      status: 'revoked',
      approvedAt: new Date(),
      allowedPolicyScopes: enrollment.requesterCapabilities || [],
      dataIsolationLevel: 'filtered',
      registeredAt: enrollment.createdAt,
      heartbeatIntervalMs: 30000,
      trustLevel: enrollment.requesterTrustLevel || 'partner',
      maxClassificationAllowed: 'SECRET',
      rateLimit: { requestsPerMinute: 60, burstSize: 100 },
      auditRetentionDays: 90,
    };
  }
}

// Singleton
export const federationRevocationService = new FederationRevocationService();
