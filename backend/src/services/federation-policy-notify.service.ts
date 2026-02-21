/**
 * DIVE V3 - Federation Policy Notification Service
 *
 * Phase G1: Cross-Instance Policy Notification.
 * When trust-related policy data changes locally (CDC event),
 * notify all active federation partners within 30 seconds.
 *
 * Event flow:
 *   MongoDB CDC → opal-cdc.service publishToOpal() → queueTopicChange()
 *   → 5s aggregate window → dispatchNotifications()
 *   → POST /api/federation/notify-policy-update to each active partner
 *   → Partner calls opalCdcService.forcePublishAll()
 *
 * Follows existing patterns: ECDSA signing, best-effort delivery,
 * lazy imports, non-fatal errors.
 *
 * @version 1.0.0
 * @date 2026-02-21
 */

import crypto from 'crypto';
import https from 'https';
import { logger } from '../utils/logger';

// ============================================
// CONSTANTS
// ============================================

/** Topics that require cross-instance notification (trust-related only) */
const FEDERATION_TOPICS = new Set([
  'trusted_issuers',
  'federation_matrix',
  'federation_constraints',
]);

/** Aggregate window: collect topic changes before dispatching (ms) */
const AGGREGATE_WINDOW_MS = 5000;

/** Cross-wire HTTP timeout (ms) */
const NOTIFY_TIMEOUT_MS = 10000;

// ============================================
// SERVICE
// ============================================

class FederationPolicyNotifyService {
  private pendingTopics: Set<string> = new Set();
  private aggregateTimer: NodeJS.Timeout | null = null;
  private initialized = false;
  private _dispatchPromise: Promise<void> = Promise.resolve();

  /**
   * Initialize the service.
   * Called from federation-bootstrap.service.ts after enrollment handlers.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    logger.info('Federation policy notification service initialized');
  }

  /**
   * Queue a topic change for cross-instance notification.
   * Called from opal-cdc.service.ts after successful OPAL publish.
   * Only federation-relevant topics are accepted; others are silently ignored.
   */
  queueTopicChange(topic: string): void {
    if (!this.initialized) return;
    if (!FEDERATION_TOPICS.has(topic)) return;

    this.pendingTopics.add(topic);

    // Reset aggregate timer
    if (this.aggregateTimer) {
      clearTimeout(this.aggregateTimer);
    }

    this.aggregateTimer = setTimeout(() => {
      this.aggregateTimer = null;
      this._dispatchPromise = this.dispatchNotifications().catch((error) => {
        logger.error('Federation policy notification dispatch failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }, AGGREGATE_WINDOW_MS);
  }

  /**
   * Dispatch aggregated notifications to all active federation partners.
   * Non-fatal: errors are logged but don't propagate.
   */
  private async dispatchNotifications(): Promise<void> {
    // Snapshot and clear pending topics
    const changedTopics = Array.from(this.pendingTopics);
    this.pendingTopics.clear();

    if (changedTopics.length === 0) return;

    // Compute hashes for changed topics
    const topicHashes = await this.computeAllHashes();

    // Get all active enrollments where this instance is the approver
    let activeEnrollments;
    try {
      const { enrollmentStore } = await import('../models/enrollment.model');
      activeEnrollments = await enrollmentStore.list({ status: 'active' });
    } catch (error) {
      logger.warn('Could not fetch active enrollments for policy notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return;
    }

    if (!activeEnrollments || activeEnrollments.length === 0) {
      logger.debug('No active enrollments to notify of policy changes', { changedTopics });
      return;
    }

    const localInstanceCode = process.env.INSTANCE_CODE || 'USA';
    logger.info('Dispatching policy change notifications', {
      changedTopics,
      partnerCount: activeEnrollments.length,
    });

    // Fan out notifications (best-effort, parallel)
    const results = await Promise.allSettled(
      activeEnrollments.map(async (enrollment) => {
        const partnerUrl = enrollment.requesterApiUrl;
        const partnerCode = enrollment.requesterInstanceCode;
        if (!partnerUrl) {
          logger.warn('No API URL for active enrollment, skipping notification', {
            enrollmentId: enrollment.enrollmentId,
            partnerCode,
          });
          return false;
        }
        return this.notifyPartner(partnerUrl, partnerCode, changedTopics, topicHashes);
      }),
    );

    // Audit trail
    const successCount = results.filter(
      (r) => r.status === 'fulfilled' && r.value === true,
    ).length;
    const failCount = activeEnrollments.length - successCount;

    try {
      const { federationAuditStore } = await import('../models/federation-audit.model');
      await federationAuditStore.create({
        eventType: 'POLICY_SYNC_SENT',
        actorId: 'system',
        actorInstance: localInstanceCode,
        correlationId: `policy-sync-${Date.now()}`,
        timestamp: new Date(),
        compliantWith: ['ACP-240', 'ADatP-5663'],
        metadata: {
          changedTopics,
          topicHashes,
          partnersNotified: successCount,
          partnersFailed: failCount,
        },
      });
    } catch (error) {
      logger.debug('Could not create policy sync audit entry', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    logger.info('Policy change notifications dispatched', {
      changedTopics,
      successCount,
      failCount,
    });
  }

  /**
   * Send notification to a single partner. Best-effort.
   * Follows exact pattern from federation-revocation.service.ts::notifyPartnerOfRevocation.
   */
  private async notifyPartner(
    partnerApiUrl: string,
    partnerInstanceCode: string,
    changedTopics: string[],
    topicHashes: Record<string, string>,
  ): Promise<boolean> {
    const { getSecureHttpsAgent } = await import('../utils/https-agent');

    const senderInstanceCode = process.env.INSTANCE_CODE || 'USA';
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomBytes(16).toString('hex');

    const body: Record<string, unknown> = {
      senderInstanceCode,
      changedTopics,
      topicHashes,
      timestamp,
      nonce,
    };

    // Sign the notification
    try {
      const { instanceIdentityService } = await import('./instance-identity.service');
      const signedFields: Record<string, string> = {
        senderInstanceCode,
        changedTopics: JSON.stringify(changedTopics),
        timestamp,
        nonce,
      };
      const canonical = JSON.stringify(
        Object.keys(signedFields)
          .sort()
          .reduce((acc, key) => {
            acc[key] = signedFields[key];
            return acc;
          }, {} as Record<string, string>),
      );
      body.signature = await instanceIdentityService.signData(canonical);
      body.signerCertPEM = await instanceIdentityService.getCertificatePEM();
    } catch (error) {
      logger.warn('Could not sign policy notification (sending unsigned)', {
        partnerInstanceCode,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    const payload = JSON.stringify(body);
    const notificationUrl = `${partnerApiUrl}/api/federation/notify-policy-update`;

    return new Promise<boolean>((resolve) => {
      try {
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
            timeout: NOTIFY_TIMEOUT_MS,
          },
          (res) => {
            let data = '';
            res.on('data', (chunk: Buffer) => {
              data += chunk.toString();
            });
            res.on('end', () => {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                logger.info('Partner notified of policy change', {
                  partnerInstanceCode,
                  statusCode: res.statusCode,
                  changedTopics,
                });
                resolve(true);
              } else {
                logger.warn('Partner policy notification returned non-2xx', {
                  partnerInstanceCode,
                  statusCode: res.statusCode,
                  response: data.substring(0, 200),
                });
                resolve(false);
              }
            });
          },
        );

        req.on('error', (error) => {
          logger.warn('Partner policy notification failed', {
            partnerInstanceCode,
            error: error.message,
          });
          resolve(false);
        });

        req.on('timeout', () => {
          req.destroy();
          logger.warn('Partner policy notification timed out', {
            partnerInstanceCode,
            timeoutMs: NOTIFY_TIMEOUT_MS,
          });
          resolve(false);
        });

        req.write(payload);
        req.end();
      } catch (error) {
        logger.warn('Partner policy notification error', {
          partnerInstanceCode,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        resolve(false);
      }
    });
  }

  /**
   * Compute SHA256 hash for a trust collection's current data.
   * Used for both G1 notifications and G2 drift detection.
   */
  async computeTopicHash(topic: string): Promise<string> {
    let data: unknown;

    switch (topic) {
      case 'trusted_issuers': {
        const { mongoOpalDataStore } = await import('../models/trusted-issuer.model');
        data = await mongoOpalDataStore.getIssuersForOpal();
        break;
      }
      case 'federation_matrix': {
        const { mongoOpalDataStore } = await import('../models/trusted-issuer.model');
        data = await mongoOpalDataStore.getFederationMatrix();
        break;
      }
      case 'federation_constraints': {
        const { FederationConstraint } = await import('../models/federation-constraint.model');
        data = await FederationConstraint.getActiveConstraintsForOPAL();
        break;
      }
      default:
        return '';
    }

    const json = JSON.stringify(data, Object.keys(data as Record<string, unknown>).sort());
    return crypto.createHash('sha256').update(json).digest('hex');
  }

  /**
   * Compute hashes for all federation topics.
   */
  async computeAllHashes(): Promise<Record<string, string>> {
    const hashes: Record<string, string> = {};
    for (const topic of FEDERATION_TOPICS) {
      try {
        hashes[topic] = await this.computeTopicHash(topic);
      } catch (error) {
        logger.warn('Could not compute hash for topic', {
          topic,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        hashes[topic] = '';
      }
    }
    return hashes;
  }

  /**
   * Wait for any pending dispatch to complete.
   * Useful for graceful shutdown and testing.
   */
  async flush(): Promise<void> {
    await this._dispatchPromise;
  }

  /**
   * Get service status.
   */
  getStatus(): { initialized: boolean; pendingTopics: string[] } {
    return {
      initialized: this.initialized,
      pendingTopics: Array.from(this.pendingTopics),
    };
  }

  /**
   * Shutdown: clear timers and pending state.
   */
  shutdown(): void {
    if (this.aggregateTimer) {
      clearTimeout(this.aggregateTimer);
      this.aggregateTimer = null;
    }
    this.pendingTopics.clear();
    this.initialized = false;
  }
}

// Singleton export
export const federationPolicyNotifyService = new FederationPolicyNotifyService();
