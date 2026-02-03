/**
 * DIVE V3 - Policy Sync Service
 *
 * Manages policy synchronization between Hub and Spokes.
 * Handles:
 * - Version tracking across all spokes
 * - Delta sync for efficient updates
 * - Critical update propagation
 * - Stale policy detection and handling
 * - Guardrail validation for tenant policies
 *
 * @version 1.0.0
 * @date 2025-12-04
 */

import crypto from 'crypto';
import { logger } from '../utils/logger';
import { opalClient } from './opal-client';
import { hubSpokeRegistry } from './hub-spoke-registry.service';
import { policyVersionStore } from '../models/policy-version.model';

// ============================================
// TYPES
// ============================================

export interface IPolicyVersion {
  version: string;
  timestamp: Date;
  hash: string;
  layers: {
    base: string;
    org: Record<string, string>;
    tenant: Record<string, string>;
  };
}

export interface ISpokeSync {
  spokeId: string;
  instanceCode: string;
  lastSyncTime: Date;
  currentVersion: string;
  status: 'current' | 'behind' | 'stale' | 'critical_stale' | 'offline';
  pendingUpdates: number;
  lastAckTime?: Date;
}

export interface IPolicyUpdate {
  updateId: string;
  priority: 'normal' | 'high' | 'critical';
  layers: string[];
  version: string;
  timestamp: Date;
  requireAck: boolean;
  description: string;
}

export interface IGuardrailValidation {
  valid: boolean;
  violations: IGuardrailViolation[];
}

export interface IGuardrailViolation {
  code: string;
  message: string;
  severity: 'warning' | 'error' | 'critical';
  path: string;
  hubValue?: unknown;
  tenantValue?: unknown;
}

export interface ISyncResult {
  success: boolean;
  spokeId: string;
  version: string;
  syncTime: Date;
  deltaSize: number;
  ackReceived: boolean;
  error?: string;
}

// ============================================
// CONSTANTS
// ============================================

// Sync status thresholds (in milliseconds)
const SYNC_THRESHOLDS = {
  CURRENT: 5 * 60 * 1000,           // 5 minutes
  BEHIND: 30 * 60 * 1000,           // 30 minutes
  STALE: 4 * 60 * 60 * 1000,        // 4 hours
  CRITICAL_STALE: 24 * 60 * 60 * 1000, // 24 hours
};

// Guardrail limits (must match guardrails.rego)
const HUB_GUARDRAILS = {
  MAX_SESSION_HOURS: 10,
  MAX_TOKEN_LIFETIME_MINUTES: 60,
  MFA_REQUIRED_ABOVE: 'UNCLASSIFIED',
  MIN_AUDIT_RETENTION_DAYS: 90,
  VALID_CLEARANCES: ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'],
};

// ============================================
// POLICY SYNC SERVICE
// ============================================

class PolicySyncService {
  private currentVersion: IPolicyVersion;
  private spokeSyncStatus: Map<string, ISpokeSync> = new Map(); // In-memory cache, backed by MongoDB
  private pendingUpdates: Map<string, IPolicyUpdate> = new Map();
  private updateHistory: IPolicyUpdate[] = [];
  private useMongoDb: boolean;
  private initialized = false;

  constructor() {
    this.currentVersion = this.initializeVersion();
    // Enable MongoDB persistence unless explicitly disabled
    this.useMongoDb = process.env.POLICY_SYNC_STORE !== 'memory';

    logger.info('Policy Sync Service initialized', {
      version: this.currentVersion.version,
      persistence: this.useMongoDb ? 'mongodb' : 'memory'
    });

    // Initialize MongoDB store asynchronously
    if (this.useMongoDb) {
      this.initializeStore().catch(err => {
        logger.error('Failed to initialize MongoDB store for policy sync', {
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      });
    }
  }

  /**
   * Initialize MongoDB store and load latest version
   */
  private async initializeStore(): Promise<void> {
    if (this.initialized) return;

    try {
      await policyVersionStore.initialize();

      // Load latest version from MongoDB if available
      const latestVersion = await policyVersionStore.getLatestVersion();
      if (latestVersion) {
        this.currentVersion = {
          version: latestVersion.version,
          timestamp: latestVersion.timestamp,
          hash: latestVersion.hash,
          layers: latestVersion.layers
        };
        logger.info('Loaded latest policy version from MongoDB', {
          version: this.currentVersion.version
        });
      }

      // Load sync status cache
      const syncStatuses = await policyVersionStore.getAllSyncStatus();
      for (const status of syncStatuses) {
        this.spokeSyncStatus.set(status.spokeId, {
          spokeId: status.spokeId,
          instanceCode: status.instanceCode,
          lastSyncTime: status.lastSyncTime,
          currentVersion: status.currentVersion,
          status: status.status,
          pendingUpdates: status.pendingUpdates,
          lastAckTime: status.lastAckTime
        });
      }

      this.initialized = true;
      logger.info('Policy sync MongoDB store initialized', {
        cachedStatuses: this.spokeSyncStatus.size
      });
    } catch (error) {
      logger.error('Failed to initialize policy sync store', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Fall back to in-memory only
      this.useMongoDb = false;
    }
  }

  // ============================================
  // VERSION MANAGEMENT
  // ============================================

  private initializeVersion(): IPolicyVersion {
    const now = new Date();
    return {
      version: this.generateVersionString(now),
      timestamp: now,
      hash: this.generateHash('initial'),
      layers: {
        base: '2025.12.01-001',
        org: {
          fvey: '2025.11.15-003',
          nato: '2025.10.20-002'
        },
        tenant: {}
      }
    };
  }

  private generateVersionString(date: Date): string {
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '.');
    const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    return `${dateStr}-${seq}`;
  }

  private generateHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  getCurrentVersion(): IPolicyVersion {
    return { ...this.currentVersion };
  }

  // ============================================
  // SPOKE SYNC STATUS
  // ============================================

  /**
   * Record a sync heartbeat from a spoke
   */
  async recordSpokeSync(
    spokeId: string,
    reportedVersion: string
  ): Promise<ISpokeSync> {
    const spoke = await hubSpokeRegistry.getSpoke(spokeId);
    if (!spoke) {
      throw new Error(`Unknown spoke: ${spokeId}`);
    }

    const now = new Date();
    const isCurrentVersion = reportedVersion === this.currentVersion.version;

    const syncStatus: ISpokeSync = {
      spokeId,
      instanceCode: spoke.instanceCode,
      lastSyncTime: now,
      currentVersion: reportedVersion,
      status: isCurrentVersion ? 'current' : 'behind',
      pendingUpdates: isCurrentVersion ? 0 : this.countPendingUpdates(reportedVersion),
      lastAckTime: isCurrentVersion ? now : this.spokeSyncStatus.get(spokeId)?.lastAckTime
    };

    // Update in-memory cache
    this.spokeSyncStatus.set(spokeId, syncStatus);

    // Persist to MongoDB
    if (this.useMongoDb) {
      try {
        await policyVersionStore.saveSyncStatus(syncStatus);
      } catch (error) {
        logger.warn('Failed to persist sync status to MongoDB', {
          spokeId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    logger.debug('Spoke sync recorded', {
      spokeId,
      instanceCode: spoke.instanceCode,
      version: reportedVersion,
      status: syncStatus.status,
      persisted: this.useMongoDb
    });

    return syncStatus;
  }

  /**
   * Get sync status for a spoke
   */
  getSpokeStatus(spokeId: string): ISpokeSync | undefined {
    const status = this.spokeSyncStatus.get(spokeId);
    if (!status) return undefined;

    // Update status based on time since last sync
    const timeSinceSync = Date.now() - status.lastSyncTime.getTime();

    if (timeSinceSync > SYNC_THRESHOLDS.CRITICAL_STALE) {
      status.status = 'offline';
    } else if (timeSinceSync > SYNC_THRESHOLDS.STALE) {
      status.status = 'critical_stale';
    } else if (timeSinceSync > SYNC_THRESHOLDS.BEHIND) {
      status.status = 'stale';
    } else if (status.currentVersion !== this.currentVersion.version) {
      status.status = 'behind';
    } else {
      status.status = 'current';
    }

    return status;
  }

  /**
   * Get all spokes with their sync status
   */
  async getAllSpokeStatus(): Promise<ISpokeSync[]> {
    const spokes = await hubSpokeRegistry.listActiveSpokes();

    return spokes.map(spoke => {
      const status = this.getSpokeStatus(spoke.spokeId);
      if (status) return status;

      // Spoke hasn't synced yet
      return {
        spokeId: spoke.spokeId,
        instanceCode: spoke.instanceCode,
        lastSyncTime: spoke.registeredAt,
        currentVersion: 'unknown',
        status: 'offline' as const,
        pendingUpdates: -1
      };
    });
  }

  /**
   * Get spokes that are behind or stale
   */
  async getOutOfSyncSpokes(): Promise<ISpokeSync[]> {
    const allStatus = await this.getAllSpokeStatus();
    return allStatus.filter(s => s.status !== 'current');
  }

  private countPendingUpdates(fromVersion: string): number {
    // Count updates since the spoke's version
    return this.updateHistory.filter(u => u.version > fromVersion).length;
  }

  // ============================================
  // POLICY UPDATES
  // ============================================

  /**
   * Create and push a policy update to all spokes
   */
  async pushPolicyUpdate(options: {
    layers: string[];
    priority: IPolicyUpdate['priority'];
    description: string;
  }): Promise<IPolicyUpdate> {
    const now = new Date();
    const newVersion = this.generateVersionString(now);

    const update: IPolicyUpdate = {
      updateId: `update-${crypto.randomBytes(4).toString('hex')}`,
      priority: options.priority,
      layers: options.layers,
      version: newVersion,
      timestamp: now,
      requireAck: options.priority === 'critical',
      description: options.description
    };

    // Update current version
    this.currentVersion.version = newVersion;
    this.currentVersion.timestamp = now;
    this.currentVersion.hash = this.generateHash(JSON.stringify(update));

    // Update layer versions
    for (const layer of options.layers) {
      if (layer.startsWith('tenant.')) {
        const tenant = layer.replace('tenant.', '');
        this.currentVersion.layers.tenant[tenant] = newVersion;
      } else if (layer.startsWith('org.')) {
        const org = layer.replace('org.', '');
        this.currentVersion.layers.org[org] = newVersion;
      } else if (layer === 'base') {
        this.currentVersion.layers.base = newVersion;
      }
    }

    // Store update in memory
    this.pendingUpdates.set(update.updateId, update);
    this.updateHistory.push(update);

    // Persist version to MongoDB
    if (this.useMongoDb) {
      try {
        await policyVersionStore.saveVersion(this.currentVersion, {
          releasedBy: 'system',
          description: options.description
        });
      } catch (error) {
        logger.warn('Failed to persist policy version to MongoDB', {
          version: newVersion,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Push via OPAL
    if (opalClient.isOPALEnabled()) {
      await opalClient.triggerPolicyRefresh();
    }

    logger.info('Policy update pushed', {
      updateId: update.updateId,
      version: newVersion,
      priority: options.priority,
      layers: options.layers,
      requireAck: update.requireAck,
      persisted: this.useMongoDb
    });

    // For critical updates, track ACKs
    if (update.requireAck) {
      this.trackCriticalUpdate(update);
    }

    return update;
  }

  /**
   * Track acknowledgments for critical updates
   */
  private async trackCriticalUpdate(update: IPolicyUpdate): Promise<void> {
    const spokes = await hubSpokeRegistry.listActiveSpokes();
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();

    const checkAcks = async (): Promise<void> => {
      const unackedSpokes: string[] = [];

      for (const spoke of spokes) {
        const status = this.getSpokeStatus(spoke.spokeId);
        if (!status || status.currentVersion !== update.version) {
          unackedSpokes.push(spoke.instanceCode);
        }
      }

      if (unackedSpokes.length === 0) {
        logger.info('All spokes acknowledged critical update', {
          updateId: update.updateId,
          version: update.version
        });
        return;
      }

      if (Date.now() - startTime > timeout) {
        logger.error('Critical update not acknowledged by all spokes', {
          updateId: update.updateId,
          unackedSpokes
        });
        // TODO: Alert admin, consider suspending unacked spokes
        return;
      }

      // Check again in 5 seconds
      setTimeout(checkAcks, 5000);
    };

    // Start tracking
    setTimeout(checkAcks, 5000);
  }

  // ============================================
  // GUARDRAIL VALIDATION
  // ============================================

  /**
   * Validate tenant policy against hub guardrails
   */
  validateTenantPolicy(
    tenantCode: string,
    tenantPolicy: Record<string, unknown>
  ): IGuardrailValidation {
    const violations: IGuardrailViolation[] = [];

    // Check max_session_hours
    if (tenantPolicy.max_session_hours !== undefined) {
      const value = tenantPolicy.max_session_hours as number;
      if (value > HUB_GUARDRAILS.MAX_SESSION_HOURS) {
        violations.push({
          code: 'SESSION_LIMIT_EXCEEDED',
          message: `Tenant max_session_hours (${value}) exceeds hub limit (${HUB_GUARDRAILS.MAX_SESSION_HOURS})`,
          severity: 'critical',
          path: 'max_session_hours',
          hubValue: HUB_GUARDRAILS.MAX_SESSION_HOURS,
          tenantValue: value
        });
      }
    }

    // Check max_token_lifetime_minutes
    if (tenantPolicy.max_token_lifetime_minutes !== undefined) {
      const value = tenantPolicy.max_token_lifetime_minutes as number;
      if (value > HUB_GUARDRAILS.MAX_TOKEN_LIFETIME_MINUTES) {
        violations.push({
          code: 'TOKEN_LIFETIME_EXCEEDED',
          message: `Tenant max_token_lifetime_minutes (${value}) exceeds hub limit (${HUB_GUARDRAILS.MAX_TOKEN_LIFETIME_MINUTES})`,
          severity: 'critical',
          path: 'max_token_lifetime_minutes',
          hubValue: HUB_GUARDRAILS.MAX_TOKEN_LIFETIME_MINUTES,
          tenantValue: value
        });
      }
    }

    // Check mfa_required_above (can only be stricter)
    if (tenantPolicy.mfa_required_above !== undefined) {
      const value = tenantPolicy.mfa_required_above as string;
      const hubIndex = HUB_GUARDRAILS.VALID_CLEARANCES.indexOf(HUB_GUARDRAILS.MFA_REQUIRED_ABOVE);
      const tenantIndex = HUB_GUARDRAILS.VALID_CLEARANCES.indexOf(value);

      if (tenantIndex > hubIndex) {
        // Tenant is trying to require MFA at a HIGHER clearance (less strict)
        violations.push({
          code: 'MFA_THRESHOLD_WEAKENED',
          message: `Tenant mfa_required_above (${value}) is less strict than hub (${HUB_GUARDRAILS.MFA_REQUIRED_ABOVE})`,
          severity: 'critical',
          path: 'mfa_required_above',
          hubValue: HUB_GUARDRAILS.MFA_REQUIRED_ABOVE,
          tenantValue: value
        });
      }
    }

    // Check audit_retention_days
    if (tenantPolicy.audit_retention_days !== undefined) {
      const value = tenantPolicy.audit_retention_days as number;
      if (value < HUB_GUARDRAILS.MIN_AUDIT_RETENTION_DAYS) {
        violations.push({
          code: 'AUDIT_RETENTION_TOO_SHORT',
          message: `Tenant audit_retention_days (${value}) is less than hub minimum (${HUB_GUARDRAILS.MIN_AUDIT_RETENTION_DAYS})`,
          severity: 'critical',
          path: 'audit_retention_days',
          hubValue: HUB_GUARDRAILS.MIN_AUDIT_RETENTION_DAYS,
          tenantValue: value
        });
      }
    }

    const result: IGuardrailValidation = {
      valid: violations.filter(v => v.severity === 'critical').length === 0,
      violations
    };

    if (!result.valid) {
      logger.warn('Tenant policy guardrail validation failed', {
        tenantCode,
        violationCount: violations.length,
        criticalCount: violations.filter(v => v.severity === 'critical').length
      });
    }

    return result;
  }

  /**
   * Submit tenant policy for hub approval
   */
  async submitTenantPolicy(
    spokeId: string,
    tenantCode: string,
    policy: Record<string, unknown>
  ): Promise<{
    approved: boolean;
    validation: IGuardrailValidation;
    signedBundle?: string;
  }> {
    const spoke = await hubSpokeRegistry.getSpoke(spokeId);
    if (!spoke || spoke.status !== 'approved') {
      throw new Error('Spoke not authorized to submit policies');
    }

    // Validate against guardrails
    const validation = this.validateTenantPolicy(tenantCode, policy);

    if (!validation.valid) {
      return {
        approved: false,
        validation
      };
    }

    // Sign the policy bundle
    const signedBundle = await this.signPolicyBundle(tenantCode, policy);

    // Update tenant layer version
    await this.pushPolicyUpdate({
      layers: [`tenant.${tenantCode.toLowerCase()}`],
      priority: 'normal',
      description: `Tenant ${tenantCode} policy update`
    });

    logger.info('Tenant policy approved and signed', {
      spokeId,
      tenantCode,
      version: this.currentVersion.version
    });

    return {
      approved: true,
      validation,
      signedBundle
    };
  }

  private async signPolicyBundle(
    tenantCode: string,
    policy: Record<string, unknown>
  ): Promise<string> {
    // In production, this would use a real signing key
    const content = JSON.stringify({ tenantCode, policy, timestamp: new Date().toISOString() });
    const signature = crypto.createHash('sha256').update(content).digest('base64');
    return `${Buffer.from(content).toString('base64')}.${signature}`;
  }

  // ============================================
  // SYNC OPERATIONS
  // ============================================

  /**
   * Get delta update for a spoke
   */
  async getDeltaUpdate(
    spokeId: string,
    fromVersion: string
  ): Promise<{
    updates: IPolicyUpdate[];
    currentVersion: string;
  }> {
    const spoke = await hubSpokeRegistry.getSpoke(spokeId);
    if (!spoke || spoke.status !== 'approved') {
      throw new Error('Spoke not authorized');
    }

    // Filter updates since spoke's version
    const updates = this.updateHistory.filter(u => u.version > fromVersion);

    // Filter by spoke's allowed scopes
    const filteredUpdates = updates.filter(update => {
      return update.layers.some(layer => {
        // Base policies go to everyone
        if (layer === 'base') return true;

        // Org policies check scope
        if (layer.startsWith('org.')) {
          const org = layer.replace('org.', '');
          return spoke.allowedPolicyScopes.includes(`policy:${org}`);
        }

        // Tenant policies only go to that tenant
        if (layer.startsWith('tenant.')) {
          const tenant = layer.replace('tenant.', '').toUpperCase();
          return tenant === spoke.instanceCode;
        }

        return false;
      });
    });

    return {
      updates: filteredUpdates,
      currentVersion: this.currentVersion.version
    };
  }

  /**
   * Force full sync for a spoke
   */
  async forceFullSync(spokeId: string): Promise<ISyncResult> {
    const spoke = await hubSpokeRegistry.getSpoke(spokeId);
    if (!spoke) {
      return {
        success: false,
        spokeId,
        version: '',
        syncTime: new Date(),
        deltaSize: 0,
        ackReceived: false,
        error: 'Spoke not found'
      };
    }

    try {
      // Trigger OPAL to push all data to this spoke
      if (opalClient.isOPALEnabled()) {
        await opalClient.triggerPolicyRefresh();
      }

      logger.info('Full sync triggered for spoke', {
        spokeId,
        instanceCode: spoke.instanceCode
      });

      return {
        success: true,
        spokeId,
        version: this.currentVersion.version,
        syncTime: new Date(),
        deltaSize: -1, // Full sync
        ackReceived: false // Will be updated on next heartbeat
      };
    } catch (error) {
      return {
        success: false,
        spokeId,
        version: this.currentVersion.version,
        syncTime: new Date(),
        deltaSize: 0,
        ackReceived: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const policySyncService = new PolicySyncService();

export default PolicySyncService;
