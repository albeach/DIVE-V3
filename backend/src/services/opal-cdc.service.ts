/**
 * DIVE V3 - OPAL Change Data Capture Service
 *
 * Watches MongoDB collections for changes and publishes updates to OPAL data topics.
 * Implements real-time policy data synchronization (Phase 2, GAP-002).
 *
 * Watched Collections:
 *   - trusted_issuers → OPAL topic: trusted_issuers
 *   - federation_matrix → OPAL topic: federation_matrix
 *   - tenant_configs → OPAL topic: tenant_configs
 *
 * @version 1.0.0
 * @date 2025-01-03
 */

import { mongoOpalDataStore } from '../models/trusted-issuer.model';
import { opalClient } from './opal-client';
import { logger } from '../utils/logger';

/**
 * Debounce timer to batch rapid changes
 */
const DEBOUNCE_MS = 1000; // Wait 1 second after last change before publishing

/**
 * OPAL CDC Service - Watches MongoDB for changes and syncs to OPAL
 */
class OpalCdcService {
  private initialized = false;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private pendingChanges: Map<string, Set<string>> = new Map();

  /**
   * Initialize CDC service and start watching collections
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure MongoDB OPAL data store is initialized
      await mongoOpalDataStore.initialize();

      // Register change callback
      mongoOpalDataStore.onDataChange(this.handleChange.bind(this));

      // Start change stream
      await mongoOpalDataStore.startChangeStream();

      this.initialized = true;
      logger.info('OPAL CDC Service initialized - watching for policy data changes');
    } catch (error) {
      logger.error('Failed to initialize OPAL CDC Service', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Handle a change event from MongoDB
   */
  private handleChange(collection: string, change: unknown): void {
    const changeDoc = change as { operationType: string; fullDocument?: unknown; documentKey?: { _id: unknown } };

    logger.debug('CDC: Change detected', {
      collection,
      operationType: changeDoc.operationType,
    });

    // Map collection to OPAL topic
    const topicMap: Record<string, string> = {
      trusted_issuers: 'trusted_issuers',
      federation_matrix: 'federation_matrix',
      tenant_configs: 'tenant_configs',
    };

    const topic = topicMap[collection];
    if (!topic) {
      logger.debug('CDC: Ignoring change from unmapped collection', { collection });
      return;
    }

    // Track pending changes
    if (!this.pendingChanges.has(topic)) {
      this.pendingChanges.set(topic, new Set());
    }
    this.pendingChanges.get(topic)!.add(changeDoc.operationType);

    // Debounce: Clear existing timer and set a new one
    const existingTimer = this.debounceTimers.get(topic);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.debounceTimers.set(
      topic,
      setTimeout(() => {
        this.publishToOpal(topic);
      }, DEBOUNCE_MS)
    );
  }

  /**
   * Publish updated data to OPAL topic
   */
  private async publishToOpal(topic: string): Promise<void> {
    const operations = this.pendingChanges.get(topic);
    this.pendingChanges.delete(topic);
    this.debounceTimers.delete(topic);

    try {
      let data: unknown;

      // Fetch current data from MongoDB
      switch (topic) {
        case 'trusted_issuers':
          data = await mongoOpalDataStore.getIssuersForOpal();
          break;
        case 'federation_matrix':
          data = await mongoOpalDataStore.getFederationMatrix();
          break;
        case 'tenant_configs':
          data = await mongoOpalDataStore.getAllTenantConfigs();
          break;
        default:
          logger.warn('CDC: Unknown topic', { topic });
          return;
      }

      // Publish to OPAL
      const result = await opalClient.publishInlineData(topic, data, `CDC: ${Array.from(operations || []).join(', ')}`);

      if (result.success) {
        logger.info('CDC: Published data to OPAL', {
          topic,
          operations: Array.from(operations || []),
          transactionId: result.transactionId,
        });
      } else {
        logger.error('CDC: Failed to publish to OPAL', {
          topic,
          error: result.message,
        });
      }
    } catch (error) {
      logger.error('CDC: Error publishing to OPAL', {
        topic,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Force publish all data to OPAL (useful for initial sync or recovery)
   */
  async forcePublishAll(): Promise<{ success: boolean; results: Record<string, boolean> }> {
    const results: Record<string, boolean> = {};

    try {
      // Publish trusted issuers
      const issuers = await mongoOpalDataStore.getIssuersForOpal();
      const issuersResult = await opalClient.publishInlineData('trusted_issuers', issuers, 'Force sync: trusted_issuers');
      results['trusted_issuers'] = issuersResult.success;

      // Publish federation matrix
      const matrix = await mongoOpalDataStore.getFederationMatrix();
      const matrixResult = await opalClient.publishInlineData('federation_matrix', matrix, 'Force sync: federation_matrix');
      results['federation_matrix'] = matrixResult.success;

      // Publish tenant configs
      const configs = await mongoOpalDataStore.getAllTenantConfigs();
      const configsResult = await opalClient.publishInlineData('tenant_configs', configs, 'Force sync: tenant_configs');
      results['tenant_configs'] = configsResult.success;

      const success = Object.values(results).every((r) => r);

      logger.info('CDC: Force publish completed', { results, success });

      return { success, results };
    } catch (error) {
      logger.error('CDC: Force publish failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { success: false, results };
    }
  }

  /**
   * Get CDC service status
   */
  getStatus(): {
    initialized: boolean;
    pendingChanges: Record<string, string[]>;
    debounceTimers: string[];
  } {
    const pendingChanges: Record<string, string[]> = {};
    this.pendingChanges.forEach((ops, topic) => {
      pendingChanges[topic] = Array.from(ops);
    });

    return {
      initialized: this.initialized,
      pendingChanges,
      debounceTimers: Array.from(this.debounceTimers.keys()),
    };
  }

  /**
   * Stop watching for changes
   */
  async shutdown(): Promise<void> {
    // Clear all debounce timers
    this.debounceTimers.forEach((timer) => clearTimeout(timer));
    this.debounceTimers.clear();
    this.pendingChanges.clear();

    // Stop change stream
    await mongoOpalDataStore.stopChangeStream();

    this.initialized = false;
    logger.info('OPAL CDC Service shut down');
  }
}

// Export singleton instance
export const opalCdcService = new OpalCdcService();

export default OpalCdcService;
