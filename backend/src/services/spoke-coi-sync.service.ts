/**
 * Spoke COI Sync Service
 *
 * Fetches COI definitions from Hub's MongoDB (via API) and populates
 * the spoke's local coi_definitions collection.
 *
 * CRITICAL FIX (Issue #2 - 2026-02-03):
 * Spokes need COI definitions for ABAC policy evaluation. Without this,
 * coi-validation.service.ts fails with "Failed to load COI membership from MongoDB"
 * because the spoke's local coi_definitions collection is empty.
 *
 * Architecture:
 * - Hub seeds COI definitions via initialize-coi-keys.ts
 * - Spokes call Hub's GET /api/federation/coi/sync on startup
 * - Data is written to spoke's local MongoDB coi_definitions collection
 * - coi-validation.service.ts reads from local MongoDB (transparent)
 *
 * @version 1.0.0
 * @date 2026-02-03
 */

import https from 'https';
import { logger } from '../utils/logger';
import { getMongoDBUrl, getMongoDBName } from '../utils/mongodb-config';

// HTTPS agent for self-signed certificates (local dev / Docker)
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

interface ISyncedCoiDefinition {
  coiId: string;
  name: string;
  type?: string;
  members?: string[];
  memberCountries?: string[];
  description?: string;
  status?: string;
  color?: string;
  icon?: string;
  mutable?: boolean;
  autoUpdate?: boolean;
  priority?: number;
  mutuallyExclusiveWith?: string[];
  subsetOf?: string;
  supersetOf?: string[];
}

interface ISyncResult {
  success: boolean;
  syncedCount: number;
  errors: string[];
}

class SpokeCoiSyncService {
  private hubApiUrl: string;
  private spokeToken: string;
  private instanceCode: string;

  constructor() {
    this.hubApiUrl = process.env.HUB_URL || process.env.HUB_API_URL || 'https://dive-hub-backend:4000';
    this.spokeToken = process.env.SPOKE_TOKEN || '';
    this.instanceCode = process.env.INSTANCE_CODE || '';
  }

  /**
   * Sync COI definitions from Hub to spoke's local MongoDB
   *
   * Called during spoke startup to populate local coi_definitions collection.
   * Uses upsert to avoid duplicates on repeated syncs.
   */
  async syncFromHub(): Promise<ISyncResult> {
    const result: ISyncResult = { success: false, syncedCount: 0, errors: [] };

    if (!this.instanceCode) {
      result.errors.push('INSTANCE_CODE not set - cannot sync COI definitions');
      logger.error('COI sync failed: INSTANCE_CODE not set');
      return result;
    }

    logger.info('Starting COI sync from Hub', {
      hubApiUrl: this.hubApiUrl,
      instanceCode: this.instanceCode
    });

    try {
      // Step 1: Fetch COI definitions from Hub
      const coiDefinitions = await this.fetchFromHub();

      if (!coiDefinitions || coiDefinitions.length === 0) {
        result.errors.push('No COI definitions received from Hub');
        logger.warn('COI sync: No definitions received from Hub');
        return result;
      }

      logger.info('Received COI definitions from Hub', {
        count: coiDefinitions.length,
        coiIds: coiDefinitions.map(c => c.coiId)
      });

      // Step 2: Write to spoke's local MongoDB
      const syncedCount = await this.writeToLocalMongoDB(coiDefinitions);

      result.success = true;
      result.syncedCount = syncedCount;

      logger.info('COI sync completed successfully', {
        instanceCode: this.instanceCode,
        syncedCount,
        totalReceived: coiDefinitions.length
      });

      return result;

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(msg);
      logger.error('COI sync failed', {
        instanceCode: this.instanceCode,
        error: msg
      });
      return result;
    }
  }

  /**
   * Fetch COI definitions from Hub's federation API
   */
  private async fetchFromHub(): Promise<ISyncedCoiDefinition[]> {
    const axios = (await import('axios')).default;

    const url = `${this.hubApiUrl}/api/federation/coi/sync`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Origin-Realm': this.instanceCode
    };

    // Include spoke token if available
    if (this.spokeToken) {
      headers['Authorization'] = `Bearer ${this.spokeToken}`;
    }

    const response = await axios.get(url, {
      headers,
      httpsAgent,
      timeout: 15000
    });

    if (!response.data?.success) {
      throw new Error(`Hub COI sync returned failure: ${response.data?.error || 'Unknown error'}`);
    }

    return response.data.coiDefinitions || [];
  }

  /**
   * Write synced COI definitions to spoke's local MongoDB
   *
   * Handles the schema mapping between:
   * - Hub format (may have memberCountries from ICOIKey or members from ICoiDefinition)
   * - Spoke format (ICoiDefinition with members field)
   *
   * Uses upsert to handle both initial sync and re-sync scenarios.
   */
  private async writeToLocalMongoDB(coiDefinitions: ISyncedCoiDefinition[]): Promise<number> {
    const { getDb } = await import('../utils/mongodb-singleton');
    const db = getDb();
    const collection = db.collection('coi_definitions');

    // Create indexes (idempotent)
    await collection.createIndex({ coiId: 1 }, { unique: true });
    await collection.createIndex({ enabled: 1 });
    await collection.createIndex({ members: 1 });

    let syncedCount = 0;

    for (const coi of coiDefinitions) {
      try {
        // Normalize members: handle both memberCountries (ICOIKey) and members (ICoiDefinition)
        const members = coi.members || coi.memberCountries || [];

        const doc = {
          coiId: coi.coiId,
          name: coi.name,
          type: coi.type || 'country-based',
          members: Array.isArray(members) ? members.sort() : [],
          description: coi.description || '',
          mutable: coi.mutable ?? false,
          autoUpdate: coi.autoUpdate ?? false,
          priority: coi.priority ?? 0,
          enabled: coi.status !== 'inactive',
          // Preserve extra fields for coi-key.service.ts compatibility
          memberCountries: Array.isArray(members) ? members.sort() : [],
          status: coi.status === 'inactive' ? 'deprecated' : 'active',
          color: coi.color || '#6B7280',
          icon: coi.icon || '',
          mutuallyExclusiveWith: coi.mutuallyExclusiveWith || [],
          subsetOf: coi.subsetOf || undefined,
          supersetOf: coi.supersetOf || [],
          metadata: {
            updatedAt: new Date(),
            source: 'hub_sync' as const
          }
        };

        await collection.updateOne(
          { coiId: coi.coiId },
          {
            $set: doc,
            $setOnInsert: { 'metadata.createdAt': new Date() }
          },
          { upsert: true }
        );

        syncedCount++;
      } catch (error) {
        logger.warn('Failed to upsert COI definition', {
          coiId: coi.coiId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return syncedCount;
  }
}

// Singleton export
export const spokeCoiSync = new SpokeCoiSyncService();
