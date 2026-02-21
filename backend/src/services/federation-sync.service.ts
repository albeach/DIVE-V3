/**
 * DIVE V3 Federation State Synchronization Service
 *
 * Phase 5: Federation State Consistency (GAP-FS-001, GAP-FS-002)
 *
 * Implements proactive drift detection and automated reconciliation
 * across the three federation state layers:
 * 1. Keycloak IdPs - Identity providers configured in Hub Keycloak
 * 2. MongoDB federation_spokes - Registered spoke records
 * 3. Docker containers - Actually running spoke services
 *
 * Features:
 * - Periodic drift detection (configurable interval)
 * - Drift event recording and audit trail
 * - Automated reconciliation actions
 * - Real-time state change propagation
 *
 * @version 1.0.0
 * @date 2026-01-18
 */

import axios from 'axios';
import { EventEmitter } from 'events';
import { execSync } from 'child_process';
import { getSecureHttpsAgent } from '../utils/https-agent';
import { logger } from '../utils/logger';
import { hubSpokeRegistry } from './hub-spoke-registry.service';

// ============================================
// INTERFACES
// ============================================

export interface IFederationState {
  instanceCode: string;
  keycloak: {
    exists: boolean;
    enabled: boolean;
    alias?: string;
  };
  mongodb: {
    exists: boolean;
    status: 'pending' | 'approved' | 'suspended' | 'revoked' | null;
    lastHeartbeat?: Date;
    runtimeHealth: 'online' | 'degraded' | 'offline';
  };
  docker: {
    running: boolean;
    containers: string[];
    healthy: boolean;
  };
  synchronized: boolean;
  driftType?: 'orphaned_idp' | 'stale_mongodb' | 'missing_containers' | 'multiple_drift';
}

export interface IDriftEvent {
  id: string;
  timestamp: Date;
  instanceCode: string;
  driftType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  keycloakState: Record<string, unknown>;
  mongodbState: Record<string, unknown>;
  dockerState: Record<string, unknown>;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionAction?: string;
}

export interface IReconciliationAction {
  instanceCode: string;
  action: 'disable_idp' | 'enable_idp' | 'update_mongodb_status' | 'restart_container' | 'register_spoke' | 'remove_idp';
  reason: string;
  dryRun: boolean;
  success?: boolean;
  error?: string;
  timestamp: Date;
}

export interface IDriftReport {
  timestamp: Date;
  totalInstances: number;
  synchronizedCount: number;
  driftCount: number;
  states: IFederationState[];
  actions: IReconciliationAction[];
  healthy: boolean;
}

// ============================================
// CONFIGURATION
// ============================================

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'https://localhost:8443';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
const KEYCLOAK_ADMIN_USER = process.env.KEYCLOAK_ADMIN_USER || process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
const KEYCLOAK_ADMIN_PASSWORD = process.env.KC_ADMIN_PASSWORD || process.env.KEYCLOAK_ADMIN_PASSWORD || '';

// Drift detection interval (default: 5 minutes)
const DRIFT_CHECK_INTERVAL_MS = parseInt(process.env.DRIFT_CHECK_INTERVAL_MS || '300000', 10);

// Enable auto-reconciliation (default: false for safety)
const AUTO_RECONCILE_ENABLED = process.env.AUTO_RECONCILE_ENABLED === 'true';

const httpsAgent = getSecureHttpsAgent();

// ============================================
// FEDERATION SYNC SERVICE
// ============================================

class FederationSyncService extends EventEmitter {
  private checkInterval: NodeJS.Timeout | null = null;
  private driftEvents: Map<string, IDriftEvent> = new Map();
  private keycloakToken: string | null = null;
  private keycloakTokenExpiry: number = 0;

  constructor() {
    super();
    logger.info('FederationSyncService initialized', {
      driftCheckInterval: DRIFT_CHECK_INTERVAL_MS,
      autoReconcileEnabled: AUTO_RECONCILE_ENABLED
    });
  }

  // ============================================
  // KEYCLOAK OPERATIONS
  // ============================================

  private async getKeycloakToken(): Promise<string> {
    // Return cached token if still valid
    if (this.keycloakToken && Date.now() < this.keycloakTokenExpiry - 60000) {
      return this.keycloakToken;
    }

    try {
      const response = await axios.post(
        `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
        new URLSearchParams({
          grant_type: 'password',
          client_id: 'admin-cli',
          username: KEYCLOAK_ADMIN_USER,
          password: KEYCLOAK_ADMIN_PASSWORD,
        }),
        {
          httpsAgent,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000
        }
      );

      this.keycloakToken = response.data.access_token;
      // Token typically valid for 60 seconds
      this.keycloakTokenExpiry = Date.now() + (response.data.expires_in || 60) * 1000;

      return this.keycloakToken!;
    } catch (error) {
      logger.error('Failed to get Keycloak admin token', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async getKeycloakIdPs(): Promise<Map<string, { alias: string; enabled: boolean; displayName: string }>> {
    const idpMap = new Map<string, { alias: string; enabled: boolean; displayName: string }>();

    try {
      const token = await this.getKeycloakToken();
      const response = await axios.get(
        `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/identity-provider/instances`,
        {
          httpsAgent,
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000
        }
      );

      for (const idp of response.data) {
        const instanceCode = this.extractInstanceCode(idp.alias);
        if (instanceCode) {
          idpMap.set(instanceCode, {
            alias: idp.alias,
            enabled: idp.enabled,
            displayName: idp.displayName || idp.alias
          });
        }
      }

      logger.debug('Fetched Keycloak IdPs', { count: idpMap.size });
    } catch (error) {
      logger.warn('Failed to fetch Keycloak IdPs', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return idpMap;
  }

  private async disableKeycloakIdP(alias: string): Promise<boolean> {
    try {
      const token = await this.getKeycloakToken();

      // First get the current IdP config
      const getResponse = await axios.get(
        `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/identity-provider/instances/${alias}`,
        {
          httpsAgent,
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000
        }
      );

      const idpConfig = getResponse.data;
      idpConfig.enabled = false;

      // Update with enabled=false
      await axios.put(
        `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/identity-provider/instances/${alias}`,
        idpConfig,
        {
          httpsAgent,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      logger.info('Disabled Keycloak IdP', { alias });
      return true;
    } catch (error) {
      logger.error('Failed to disable Keycloak IdP', {
        alias,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  private async enableKeycloakIdP(alias: string): Promise<boolean> {
    try {
      const token = await this.getKeycloakToken();

      const getResponse = await axios.get(
        `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/identity-provider/instances/${alias}`,
        {
          httpsAgent,
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000
        }
      );

      const idpConfig = getResponse.data;
      idpConfig.enabled = true;

      await axios.put(
        `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/identity-provider/instances/${alias}`,
        idpConfig,
        {
          httpsAgent,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      logger.info('Enabled Keycloak IdP', { alias });
      return true;
    } catch (error) {
      logger.error('Failed to enable Keycloak IdP', {
        alias,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  // ============================================
  // DOCKER OPERATIONS
  // ============================================

  private getDockerContainerStatus(): Map<string, { running: boolean; containers: string[]; healthy: boolean }> {
    const statusMap = new Map<string, { running: boolean; containers: string[]; healthy: boolean }>();

    try {
      // Get all dive-spoke containers
      const output = execSync(
        'docker ps -a --format "{{.Names}}|{{.Status}}" 2>/dev/null | grep "dive-spoke-" || true',
        { encoding: 'utf-8', timeout: 10000 }
      );

      const containersByInstance = new Map<string, { name: string; running: boolean }[]>();

      for (const line of output.trim().split('\n')) {
        if (!line) continue;

        const [name, status] = line.split('|');
        const match = name.match(/^dive-spoke-([a-z]+)-/);

        if (match) {
          const instanceCode = match[1].toUpperCase();
          const isRunning = status.includes('Up');

          if (!containersByInstance.has(instanceCode)) {
            containersByInstance.set(instanceCode, []);
          }
          containersByInstance.get(instanceCode)!.push({ name, running: isRunning });
        }
      }

      for (const [instanceCode, containers] of containersByInstance) {
        const runningContainers = containers.filter(c => c.running);
        const allContainerNames = containers.map(c => c.name);

        // Consider healthy if key services are running
        const hasKeycloak = runningContainers.some(c => c.name.includes('keycloak'));
        const hasBackend = runningContainers.some(c => c.name.includes('backend'));
        const hasFrontend = runningContainers.some(c => c.name.includes('frontend'));

        statusMap.set(instanceCode, {
          running: runningContainers.length > 0,
          containers: allContainerNames,
          healthy: hasKeycloak && hasBackend && hasFrontend
        });
      }

      logger.debug('Fetched Docker container status', { instanceCount: statusMap.size });
    } catch (error) {
      logger.warn('Failed to get Docker container status', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return statusMap;
  }

  // ============================================
  // MONGODB OPERATIONS
  // ============================================

  private async getMongoDBSpokes(): Promise<Map<string, { status: string; lastHeartbeat?: Date; runtimeHealth: string }>> {
    const spokeMap = new Map<string, { status: string; lastHeartbeat?: Date; runtimeHealth: string }>();

    try {
      const spokesWithHealth = await hubSpokeRegistry.getActiveSpokesWithHealth();

      for (const spoke of spokesWithHealth) {
        spokeMap.set(spoke.instanceCode, {
          status: spoke.status,
          lastHeartbeat: spoke.lastHeartbeat || undefined,
          runtimeHealth: spoke.runtimeHealth
        });
      }

      // Also get non-approved spokes
      const allSpokes = await hubSpokeRegistry.listAllSpokes();
      for (const spoke of allSpokes) {
        if (!spokeMap.has(spoke.instanceCode)) {
          spokeMap.set(spoke.instanceCode, {
            status: spoke.status,
            lastHeartbeat: spoke.lastHeartbeat || undefined,
            runtimeHealth: 'offline'
          });
        }
      }

      logger.debug('Fetched MongoDB spokes', { count: spokeMap.size });
    } catch (error) {
      logger.warn('Failed to get MongoDB spokes', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return spokeMap;
  }

  // ============================================
  // DRIFT DETECTION
  // ============================================

  /**
   * Detect federation state drift across all three layers
   */
  async detectDrift(): Promise<IDriftReport> {
    logger.info('Starting federation drift detection');

    const timestamp = new Date();
    const states: IFederationState[] = [];
    const actions: IReconciliationAction[] = [];

    // Fetch state from all three layers
    const [keycloakIdPs, mongoSpokes, dockerStatus] = await Promise.all([
      this.getKeycloakIdPs(),
      this.getMongoDBSpokes(),
      Promise.resolve(this.getDockerContainerStatus())
    ]);

    // Collect all instance codes
    const allInstanceCodes = new Set<string>();
    keycloakIdPs.forEach((_, code) => allInstanceCodes.add(code));
    mongoSpokes.forEach((_, code) => allInstanceCodes.add(code));
    dockerStatus.forEach((_, code) => allInstanceCodes.add(code));

    // Analyze each instance
    for (const instanceCode of allInstanceCodes) {
      const keycloak = keycloakIdPs.get(instanceCode);
      const mongodb = mongoSpokes.get(instanceCode);
      const docker = dockerStatus.get(instanceCode);

      const state: IFederationState = {
        instanceCode,
        keycloak: {
          exists: !!keycloak,
          enabled: keycloak?.enabled || false,
          alias: keycloak?.alias
        },
        mongodb: {
          exists: !!mongodb,
          status: (mongodb?.status as any) || null,
          lastHeartbeat: mongodb?.lastHeartbeat,
          runtimeHealth: (mongodb?.runtimeHealth as any) || 'offline'
        },
        docker: {
          running: docker?.running || false,
          containers: docker?.containers || [],
          healthy: docker?.healthy || false
        },
        synchronized: false
      };

      // Determine if synchronized
      const isApproved = mongodb?.status === 'approved';
      const isRunning = docker?.running || false;
      const isEnabled = keycloak?.enabled || false;

      // Expected state: If approved and running, IdP should be enabled
      // If not approved or not running, IdP should be disabled or not exist
      if (isApproved && isRunning && isEnabled) {
        state.synchronized = true;
      } else if (!isApproved && !isEnabled) {
        state.synchronized = true;
      } else if (isApproved && !isRunning) {
        // Spoke approved but not running - drift
        state.synchronized = false;
        state.driftType = 'missing_containers';
      } else if (keycloak && !mongodb) {
        // IdP exists but no MongoDB record - orphaned
        state.synchronized = false;
        state.driftType = 'orphaned_idp';
      } else if (mongodb && mongodb.status === 'approved' && !keycloak) {
        // MongoDB approved but no IdP - missing IdP
        state.synchronized = false;
        state.driftType = 'stale_mongodb';
      } else if (isEnabled && !isRunning) {
        // IdP enabled but containers not running
        state.synchronized = false;
        state.driftType = 'missing_containers';
      } else {
        state.synchronized = false;
        state.driftType = 'multiple_drift';
      }

      states.push(state);

      // Record drift event if not synchronized
      if (!state.synchronized) {
        this.recordDriftEvent(state);

        // Generate reconciliation actions
        if (AUTO_RECONCILE_ENABLED) {
          const reconcileActions = this.generateReconciliationActions(state);
          actions.push(...reconcileActions);
        }
      }
    }

    const report: IDriftReport = {
      timestamp,
      totalInstances: states.length,
      synchronizedCount: states.filter(s => s.synchronized).length,
      driftCount: states.filter(s => !s.synchronized).length,
      states,
      actions,
      healthy: states.every(s => s.synchronized)
    };

    // Emit event
    this.emit('driftReport', report);

    logger.info('Federation drift detection complete', {
      total: report.totalInstances,
      synchronized: report.synchronizedCount,
      drifted: report.driftCount,
      healthy: report.healthy
    });

    return report;
  }

  /**
   * Record a drift event for audit purposes
   */
  private recordDriftEvent(state: IFederationState): void {
    const eventId = `${state.instanceCode}-${Date.now()}`;

    const event: IDriftEvent = {
      id: eventId,
      timestamp: new Date(),
      instanceCode: state.instanceCode,
      driftType: state.driftType || 'unknown',
      severity: this.determineSeverity(state),
      description: this.describeDrift(state),
      keycloakState: state.keycloak,
      mongodbState: state.mongodb,
      dockerState: state.docker,
      resolved: false
    };

    this.driftEvents.set(eventId, event);

    logger.warn('Federation drift detected', {
      instanceCode: state.instanceCode,
      driftType: state.driftType,
      severity: event.severity
    });

    this.emit('driftEvent', event);
  }

  private determineSeverity(state: IFederationState): 'low' | 'medium' | 'high' | 'critical' {
    // Orphaned IdP is critical - could allow unauthorized access
    if (state.driftType === 'orphaned_idp') {
      return 'critical';
    }

    // Missing containers for approved spoke is high
    if (state.driftType === 'missing_containers' && state.mongodb.status === 'approved') {
      return 'high';
    }

    // Multiple drift types is medium
    if (state.driftType === 'multiple_drift') {
      return 'medium';
    }

    return 'low';
  }

  private describeDrift(state: IFederationState): string {
    switch (state.driftType) {
      case 'orphaned_idp':
        return `Keycloak IdP '${state.keycloak.alias}' exists but no MongoDB spoke record found`;
      case 'stale_mongodb':
        return `MongoDB spoke '${state.instanceCode}' is approved but no Keycloak IdP exists`;
      case 'missing_containers':
        return `Spoke '${state.instanceCode}' is approved but Docker containers are not running`;
      case 'multiple_drift':
        return `Multiple synchronization issues for '${state.instanceCode}'`;
      default:
        return `Unknown drift state for '${state.instanceCode}'`;
    }
  }

  // ============================================
  // RECONCILIATION
  // ============================================

  /**
   * Generate reconciliation actions for a drifted state
   */
  private generateReconciliationActions(state: IFederationState): IReconciliationAction[] {
    const actions: IReconciliationAction[] = [];
    const timestamp = new Date();

    switch (state.driftType) {
      case 'orphaned_idp':
        // Disable the orphaned IdP
        actions.push({
          instanceCode: state.instanceCode,
          action: 'disable_idp',
          reason: 'IdP has no corresponding MongoDB spoke record',
          dryRun: !AUTO_RECONCILE_ENABLED,
          timestamp
        });
        break;

      case 'missing_containers':
        // If IdP is enabled, disable it since containers aren't running
        if (state.keycloak.enabled) {
          actions.push({
            instanceCode: state.instanceCode,
            action: 'disable_idp',
            reason: 'Docker containers not running',
            dryRun: !AUTO_RECONCILE_ENABLED,
            timestamp
          });
        }
        // Update MongoDB status
        actions.push({
          instanceCode: state.instanceCode,
          action: 'update_mongodb_status',
          reason: 'Containers not running - marking offline',
          dryRun: !AUTO_RECONCILE_ENABLED,
          timestamp
        });
        break;

      case 'stale_mongodb':
        // MongoDB approved but no IdP - may need to create IdP or suspend spoke
        actions.push({
          instanceCode: state.instanceCode,
          action: 'update_mongodb_status',
          reason: 'No IdP configured - marking suspended',
          dryRun: !AUTO_RECONCILE_ENABLED,
          timestamp
        });
        break;
    }

    return actions;
  }

  /**
   * Execute reconciliation actions
   */
  async executeReconciliation(actions: IReconciliationAction[], dryRun: boolean = true): Promise<IReconciliationAction[]> {
    const executedActions: IReconciliationAction[] = [];

    for (const action of actions) {
      const executed: IReconciliationAction = {
        ...action,
        dryRun,
        timestamp: new Date()
      };

      if (dryRun) {
        logger.info('[DRY-RUN] Would execute reconciliation action', {
          instanceCode: action.instanceCode,
          action: action.action,
          reason: action.reason
        });
        executed.success = true;
      } else {
        try {
          switch (action.action) {
            case 'disable_idp':
              const alias = `${action.instanceCode.toLowerCase()}-idp`;
              executed.success = await this.disableKeycloakIdP(alias);
              break;

            case 'enable_idp':
              const enableAlias = `${action.instanceCode.toLowerCase()}-idp`;
              executed.success = await this.enableKeycloakIdP(enableAlias);
              break;

            case 'update_mongodb_status':
              // Mark spoke as suspended due to drift
              try {
                await hubSpokeRegistry.suspendSpoke(
                  action.instanceCode,
                  `Auto-suspended due to federation drift: ${action.reason}`
                );
                executed.success = true;
              } catch (e) {
                executed.success = false;
                executed.error = e instanceof Error ? e.message : 'Unknown error';
              }
              break;

            default:
              executed.success = false;
              executed.error = `Unknown action: ${action.action}`;
          }
        } catch (error) {
          executed.success = false;
          executed.error = error instanceof Error ? error.message : 'Unknown error';
        }
      }

      executedActions.push(executed);
    }

    this.emit('reconciliationComplete', executedActions);

    return executedActions;
  }

  // ============================================
  // PERIODIC CHECK
  // ============================================

  /**
   * Start periodic drift detection
   */
  startPeriodicCheck(): void {
    if (this.checkInterval) {
      logger.warn('Periodic drift check already running');
      return;
    }

    logger.info('Starting periodic federation drift check', {
      intervalMs: DRIFT_CHECK_INTERVAL_MS
    });

    // Run immediately
    this.detectDrift().catch(err => {
      logger.error('Initial drift check failed', { error: err.message });
    });

    // Then run periodically
    this.checkInterval = setInterval(async () => {
      try {
        await this.detectDrift();
      } catch (error) {
        logger.error('Periodic drift check failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, DRIFT_CHECK_INTERVAL_MS);
  }

  /**
   * Stop periodic drift detection
   */
  stopPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Stopped periodic federation drift check');
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  private extractInstanceCode(idpAlias: string): string | null {
    const match = idpAlias.match(/^([a-z]+)-idp$/i);
    return match ? match[1].toUpperCase() : null;
  }

  /**
   * Get all recorded drift events
   */
  getDriftEvents(): IDriftEvent[] {
    return Array.from(this.driftEvents.values());
  }

  /**
   * Get unresolved drift events
   */
  getUnresolvedDriftEvents(): IDriftEvent[] {
    return Array.from(this.driftEvents.values()).filter(e => !e.resolved);
  }

  /**
   * Mark a drift event as resolved
   */
  resolveDriftEvent(eventId: string, resolvedBy: string, resolutionAction: string): boolean {
    const event = this.driftEvents.get(eventId);
    if (event) {
      event.resolved = true;
      event.resolvedAt = new Date();
      event.resolvedBy = resolvedBy;
      event.resolutionAction = resolutionAction;
      return true;
    }
    return false;
  }

  /**
   * Get a summary of current federation health
   */
  async getHealthSummary(): Promise<{
    healthy: boolean;
    totalInstances: number;
    synchronizedCount: number;
    driftCount: number;
    unresolvedDriftEvents: number;
    lastCheck?: Date;
  }> {
    const report = await this.detectDrift();

    return {
      healthy: report.healthy,
      totalInstances: report.totalInstances,
      synchronizedCount: report.synchronizedCount,
      driftCount: report.driftCount,
      unresolvedDriftEvents: this.getUnresolvedDriftEvents().length,
      lastCheck: report.timestamp
    };
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const federationSyncService = new FederationSyncService();
export default federationSyncService;
