/**
 * Policy Version Monitor Service
 * Phase 4, Task 3.1: Prevent policy drift across federation instances
 * 
 * Monitors OPA policy versions across all federated instances and alerts
 * when policy drift is detected (instances running different versions).
 * 
 * NATO Compliance: ACP-240 §4.2 (Policy Consistency Requirements)
 */

import axios from 'axios';
import { logger } from '../utils/logger';

// ============================================
// Interfaces
// ============================================

export interface IPolicyVersion {
  version: string;
  bundleId: string;
  timestamp: string;
  gitCommit: string;
  modules: string[];
  compliance: string[];
  features: Record<string, boolean>;
  compatibleWith: string[];
  breakingChanges: string[];
}

export interface IInstancePolicyStatus {
  instanceCode: string;
  instanceUrl: string;
  policyVersion: IPolicyVersion | null;
  healthy: boolean;
  error?: string;
  latencyMs: number;
  lastChecked: Date;
}

export interface IPolicyDriftReport {
  consistent: boolean;
  checkTimestamp: Date;
  expectedVersion: string;
  instances: IInstancePolicyStatus[];
  driftDetails?: {
    driftingInstances: string[];
    versions: Record<string, string>;
    recommendation: string;
  };
  alertSent: boolean;
}

// ============================================
// Configuration
// ============================================

interface FederationInstance {
  code: string;
  apiUrl: string;
  opaUrl?: string;
  type: 'local' | 'remote';
}

// Load from federation registry or environment
const FEDERATION_INSTANCES: FederationInstance[] = [
  {
    code: 'USA',
    apiUrl: process.env.USA_API_URL || 'https://usa-api.dive25.com',
    opaUrl: process.env.USA_OPA_URL || 'http://opa:8181',
    type: 'local'
  },
  {
    code: 'FRA',
    apiUrl: process.env.FRA_API_URL || 'https://fra-api.dive25.com',
    opaUrl: process.env.FRA_OPA_URL,
    type: 'local'
  },
  {
    code: 'GBR',
    apiUrl: process.env.GBR_API_URL || 'https://gbr-api.dive25.com',
    opaUrl: process.env.GBR_OPA_URL,
    type: 'local'
  },
  {
    code: 'DEU',
    apiUrl: process.env.DEU_API_URL || 'https://deu-api.prosecurity.biz',
    opaUrl: process.env.DEU_OPA_URL,
    type: 'remote'
  }
];

// ============================================
// Policy Version Monitor
// ============================================

class PolicyVersionMonitor {
  private instances: FederationInstance[];
  private checkInterval: NodeJS.Timeout | null = null;
  private lastReport: IPolicyDriftReport | null = null;
  private instanceRealm: string;
  private opaUrl: string;

  constructor() {
    this.instances = FEDERATION_INSTANCES;
    this.instanceRealm = process.env.INSTANCE_REALM || 'USA';
    this.opaUrl = process.env.OPA_URL || 'http://opa:8181';
  }

  /**
   * Get local OPA policy version
   */
  async getLocalPolicyVersion(): Promise<IPolicyVersion | null> {
    try {
      const response = await axios.get(
        `${this.opaUrl}/v1/data/dive/policy_version`,
        { timeout: 5000 }
      );

      return response.data.result as IPolicyVersion;
    } catch (error) {
      logger.error('Failed to get local policy version', {
        error: error instanceof Error ? error.message : 'Unknown error',
        opaUrl: this.opaUrl
      });
      return null;
    }
  }

  /**
   * Get policy version from a remote instance via its API
   */
  async getRemotePolicyVersion(instance: FederationInstance): Promise<IInstancePolicyStatus> {
    const startTime = Date.now();

    try {
      const response = await axios.get(
        `${instance.apiUrl}/api/health/policy-version`,
        { timeout: 5000 }
      );

      return {
        instanceCode: instance.code,
        instanceUrl: instance.apiUrl,
        policyVersion: response.data.policyVersion,
        healthy: true,
        latencyMs: Date.now() - startTime,
        lastChecked: new Date()
      };
    } catch (error) {
      return {
        instanceCode: instance.code,
        instanceUrl: instance.apiUrl,
        policyVersion: null,
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
        lastChecked: new Date()
      };
    }
  }

  /**
   * Check policy consistency across all instances
   */
  async checkPolicyConsistency(): Promise<IPolicyDriftReport> {
    const checkTimestamp = new Date();
    const instanceStatuses: IInstancePolicyStatus[] = [];

    logger.info('Starting policy consistency check', {
      instanceCount: this.instances.length,
      timestamp: checkTimestamp.toISOString()
    });

    // Check local instance first
    const localInstance = this.instances.find(i => i.code === this.instanceRealm);
    if (localInstance) {
      const localVersion = await this.getLocalPolicyVersion();
      instanceStatuses.push({
        instanceCode: localInstance.code,
        instanceUrl: localInstance.apiUrl,
        policyVersion: localVersion,
        healthy: localVersion !== null,
        latencyMs: 0,
        lastChecked: checkTimestamp
      });
    }

    // Check remote instances in parallel
    const remoteInstances = this.instances.filter(i => i.code !== this.instanceRealm);
    const remoteChecks = await Promise.all(
      remoteInstances.map(instance => this.getRemotePolicyVersion(instance))
    );
    instanceStatuses.push(...remoteChecks);

    // Analyze results
    const healthyInstances = instanceStatuses.filter(s => s.healthy && s.policyVersion);
    const versions: Record<string, string> = {};
    
    for (const status of healthyInstances) {
      if (status.policyVersion) {
        versions[status.instanceCode] = status.policyVersion.version;
      }
    }

    const uniqueVersions = new Set(Object.values(versions));
    const isConsistent = uniqueVersions.size <= 1;

    // Find expected (latest) version
    const expectedVersion = this.getLatestVersion(Object.values(versions));

    // Build report
    const report: IPolicyDriftReport = {
      consistent: isConsistent,
      checkTimestamp,
      expectedVersion,
      instances: instanceStatuses,
      alertSent: false
    };

    if (!isConsistent) {
      const driftingInstances = Object.entries(versions)
        .filter(([, version]) => version !== expectedVersion)
        .map(([code]) => code);

      report.driftDetails = {
        driftingInstances,
        versions,
        recommendation: `Update instances [${driftingInstances.join(', ')}] to policy version ${expectedVersion}`
      };

      logger.warn('⚠️  POLICY DRIFT DETECTED', {
        versions,
        expectedVersion,
        driftingInstances,
        recommendation: report.driftDetails.recommendation
      });

      // Send alert if drift detected
      await this.sendDriftAlert(report);
      report.alertSent = true;

    } else {
      logger.info('✅ Policy versions consistent across all instances', {
        version: expectedVersion,
        healthyInstances: healthyInstances.length,
        totalInstances: this.instances.length
      });
    }

    this.lastReport = report;
    return report;
  }

  /**
   * Get the latest semantic version from a list
   */
  private getLatestVersion(versions: string[]): string {
    if (versions.length === 0) return 'unknown';
    
    return versions.sort((a, b) => {
      const aParts = a.split('.').map(Number);
      const bParts = b.split('.').map(Number);

      for (let i = 0; i < 3; i++) {
        if (aParts[i] > bParts[i]) return -1;
        if (aParts[i] < bParts[i]) return 1;
      }
      return 0;
    })[0];
  }

  /**
   * Send drift alert (placeholder - integrate with Slack, PagerDuty, etc.)
   */
  private async sendDriftAlert(report: IPolicyDriftReport): Promise<void> {
    // Log as security event
    logger.error('SECURITY ALERT: Policy drift detected across federation', {
      alertLevel: 'HIGH',
      eventType: 'POLICY_DRIFT',
      timestamp: report.checkTimestamp.toISOString(),
      driftDetails: report.driftDetails,
      instances: report.instances.map(i => ({
        code: i.instanceCode,
        version: i.policyVersion?.version || 'unavailable',
        healthy: i.healthy
      }))
    });

    // TODO: Integrate with external alerting systems
    // - Slack webhook
    // - PagerDuty
    // - Email
    // - SMS
  }

  /**
   * Start periodic policy consistency checks
   */
  startMonitoring(intervalMs: number = 5 * 60 * 1000): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    logger.info('Starting policy version monitoring', {
      intervalMs,
      instanceCount: this.instances.length
    });

    // Perform initial check
    this.checkPolicyConsistency().catch(err => {
      logger.error('Initial policy consistency check failed', {
        error: err.message
      });
    });

    // Schedule periodic checks
    this.checkInterval = setInterval(async () => {
      try {
        await this.checkPolicyConsistency();
      } catch (error) {
        logger.error('Scheduled policy consistency check failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Policy version monitoring stopped');
    }
  }

  /**
   * Get last consistency report
   */
  getLastReport(): IPolicyDriftReport | null {
    return this.lastReport;
  }

  /**
   * Get all configured instances
   */
  getInstances(): FederationInstance[] {
    return this.instances;
  }
}

// Singleton instance
export const policyVersionMonitor = new PolicyVersionMonitor();

export default policyVersionMonitor;















