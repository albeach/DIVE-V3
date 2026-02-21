/**
 * DIVE V3 - Federation Policy Drift Detection Service
 *
 * Phase G2: Policy Data Exchange.
 * On-demand drift detection — compares local SHA256 hashes for trust
 * collections against active federation partners.
 *
 * Usage: Admin calls GET /api/federation/policy-drift to detect inconsistencies.
 *
 * @version 1.0.0
 * @date 2026-02-21
 */

import https from 'https';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export interface PartnerDriftReport {
  instanceCode: string;
  hashes: Record<string, string>;
  drift: string[];
  reachable: boolean;
  error?: string;
  responseTimeMs: number;
}

export interface DriftReport {
  timestamp: string;
  localInstanceCode: string;
  localHashes: Record<string, string>;
  partners: PartnerDriftReport[];
  hasDrift: boolean;
  totalPartners: number;
  reachablePartners: number;
}

// ============================================
// CONSTANTS
// ============================================

const QUERY_TIMEOUT_MS = 10000;

// ============================================
// SERVICE
// ============================================

class FederationPolicyDriftService {
  /**
   * Detect policy drift across all active federation partners.
   * Queries each partner's GET /api/federation/policy-summary endpoint
   * and compares SHA256 hashes per topic.
   */
  async detectDrift(): Promise<DriftReport> {
    const localInstanceCode = process.env.INSTANCE_CODE || 'USA';

    // Compute local hashes
    const { federationPolicyNotifyService } = await import('./federation-policy-notify.service');
    const localHashes = await federationPolicyNotifyService.computeAllHashes();

    // Get active enrollments
    let activeEnrollments: Array<{ requesterApiUrl: string; requesterInstanceCode: string }> = [];
    try {
      const { enrollmentStore } = await import('../models/enrollment.model');
      activeEnrollments = await enrollmentStore.list({ status: 'active' });
    } catch (error) {
      logger.warn('Could not fetch active enrollments for drift detection', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Query each partner in parallel
    const partnerResults = await Promise.allSettled(
      activeEnrollments.map(async (enrollment) => {
        const partnerUrl = enrollment.requesterApiUrl;
        const partnerCode = enrollment.requesterInstanceCode;
        if (!partnerUrl) {
          return {
            instanceCode: partnerCode,
            hashes: {},
            drift: [],
            reachable: false,
            error: 'No API URL configured',
            responseTimeMs: 0,
          } as PartnerDriftReport;
        }
        return this.queryPartnerSummary(partnerUrl, partnerCode, localHashes);
      }),
    );

    const partners: PartnerDriftReport[] = partnerResults.map((result) => {
      if (result.status === 'fulfilled') return result.value;
      return {
        instanceCode: 'unknown',
        hashes: {},
        drift: [],
        reachable: false,
        error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
        responseTimeMs: 0,
      };
    });

    const reachablePartners = partners.filter((p) => p.reachable).length;
    const hasDrift = partners.some((p) => p.drift.length > 0);

    const report: DriftReport = {
      timestamp: new Date().toISOString(),
      localInstanceCode,
      localHashes,
      partners,
      hasDrift,
      totalPartners: partners.length,
      reachablePartners,
    };

    logger.info('Policy drift detection complete', {
      localInstanceCode,
      totalPartners: report.totalPartners,
      reachablePartners,
      hasDrift,
      driftTopics: partners.flatMap((p) => p.drift),
    });

    return report;
  }

  /**
   * Query a single partner for their policy summary and compare hashes.
   */
  private async queryPartnerSummary(
    partnerApiUrl: string,
    partnerInstanceCode: string,
    localHashes: Record<string, string>,
  ): Promise<PartnerDriftReport> {
    const startTime = Date.now();
    const summaryUrl = `${partnerApiUrl}/api/federation/policy-summary`;

    try {
      const { getSecureHttpsAgent } = await import('../utils/https-agent');
      const responseData = await this.httpGet(summaryUrl, getSecureHttpsAgent());
      const responseTimeMs = Date.now() - startTime;

      const parsed = JSON.parse(responseData);
      const remoteHashes: Record<string, string> = parsed.hashes || {};

      // Compare hashes
      const drift: string[] = [];
      for (const topic of Object.keys(localHashes)) {
        if (localHashes[topic] && remoteHashes[topic] && localHashes[topic] !== remoteHashes[topic]) {
          drift.push(topic);
        }
      }

      return {
        instanceCode: partnerInstanceCode,
        hashes: remoteHashes,
        drift,
        reachable: true,
        responseTimeMs,
      };
    } catch (error) {
      return {
        instanceCode: partnerInstanceCode,
        hashes: {},
        drift: [],
        reachable: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Simple HTTPS GET with timeout.
   */
  private httpGet(url: string, agent: https.Agent): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      try {
        const parsed = new URL(url);

        const req = https.request(
          {
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname,
            method: 'GET',
            agent,
            timeout: QUERY_TIMEOUT_MS,
          },
          (res) => {
            let data = '';
            res.on('data', (chunk: Buffer) => {
              data += chunk.toString();
            });
            res.on('end', () => {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                resolve(data);
              } else {
                reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
              }
            });
          },
        );

        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timed out'));
        });

        req.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}

// Singleton export
export const federationPolicyDriftService = new FederationPolicyDriftService();
