/**
 * FRA Federation Service
 * Handles metadata synchronization between FRA and USA instances
 * GAP-003: Resource consistency with versioning
 * GAP-004: Correlation IDs for sync operations
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { MongoClient, Db, Collection } from 'mongodb';
import jwt from 'jsonwebtoken';

interface FederationResource {
  resourceId: string;
  title: string;
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  originRealm: string;
  version: number;
  lastModified: Date;
  syncStatus?: {
    [realm: string]: {
      synced: boolean;
      timestamp: Date;
      version: number;
    };
  };
}

interface SyncResult {
  correlationId: string;
  timestamp: Date;
  sourceRealm: string;
  targetRealm: string;
  resourcesSynced: number;
  resourcesUpdated: number;
  resourcesConflicted: number;
  conflicts: ConflictRecord[];
  duration: number;
}

interface ConflictRecord {
  resourceId: string;
  localVersion: number;
  remoteVersion: number;
  resolution: 'local_wins' | 'remote_wins' | 'merged' | 'pending';
  reason: string;
}

export class FRAFederationService {
  private db: Db;
  private resourcesCollection: Collection<FederationResource>;
  private syncLogCollection: Collection<SyncResult>;
  private readonly INSTANCE_REALM = 'FRA';
  private readonly USA_FEDERATION_ENDPOINT = process.env.USA_FEDERATION_ENDPOINT || 'https://dev-api.dive25.com/federation';
  private readonly SYNC_INTERVAL = parseInt(process.env.FEDERATION_SYNC_INTERVAL || '300') * 1000; // 5 minutes default

  constructor(private mongoUrl: string = 'mongodb://localhost:27018/dive-v3-fra') { }

  /**
   * Initialize database connection
   */
  async initialize(): Promise<void> {
    const client = new MongoClient(this.mongoUrl);
    await client.connect();
    this.db = client.db('dive-v3-fra');
    this.resourcesCollection = this.db.collection<FederationResource>('resources');
    this.syncLogCollection = this.db.collection<SyncResult>('federation_sync');

    // Create indexes for performance
    await this.resourcesCollection.createIndex({ originRealm: 1, lastModified: -1 });
    await this.resourcesCollection.createIndex({ 'syncStatus.USA.synced': 1 });
    await this.syncLogCollection.createIndex({ timestamp: -1 });
  }

  /**
   * Get federation-eligible resources
   * Excludes TOP_SECRET and single-country resources
   */
  async getFederationResources(): Promise<FederationResource[]> {
    return await this.resourcesCollection.find({
      $and: [
        { originRealm: this.INSTANCE_REALM },
        { classification: { $ne: 'TOP_SECRET' } },
        { 'releasabilityTo.1': { $exists: true } }, // Has multiple countries
        { encrypted: { $ne: true } } // Don't federate encrypted resources
      ]
    }).toArray();
  }

  /**
   * Sync resources with USA instance
   * Implements bidirectional sync with conflict resolution
   */
  async syncWithUSA(): Promise<SyncResult> {
    const startTime = Date.now();
    const correlationId = `sync-fra-usa-${uuidv4()}`;

    console.log(`[${correlationId}] Starting federation sync with USA`);

    const result: SyncResult = {
      correlationId,
      timestamp: new Date(),
      sourceRealm: this.INSTANCE_REALM,
      targetRealm: 'USA',
      resourcesSynced: 0,
      resourcesUpdated: 0,
      resourcesConflicted: 0,
      conflicts: [],
      duration: 0
    };

    try {
      // Step 1: Push FRA resources to USA
      const fraResources = await this.getFederationResources();
      const pushResult = await this.pushResources(fraResources, correlationId);
      result.resourcesSynced += pushResult.synced;
      result.resourcesUpdated += pushResult.updated;
      result.resourcesConflicted += pushResult.conflicted;
      result.conflicts.push(...pushResult.conflicts);

      // Step 2: Pull USA resources
      const usaResources = await this.pullResources(correlationId);
      const importResult = await this.importResources(usaResources, 'USA');
      result.resourcesSynced += importResult.synced;
      result.resourcesUpdated += importResult.updated;
      result.resourcesConflicted += importResult.conflicted;
      result.conflicts.push(...importResult.conflicts);

      // Step 3: Update sync status
      await this.updateSyncStatus(fraResources, 'USA');

      result.duration = Date.now() - startTime;

      // Log sync result
      await this.syncLogCollection.insertOne(result);

      console.log(`[${correlationId}] Sync complete: ${result.resourcesSynced} synced, ${result.resourcesUpdated} updated, ${result.resourcesConflicted} conflicts`);

      return result;
    } catch (error) {
      console.error(`[${correlationId}] Sync error:`, error);
      result.duration = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * Push resources to USA instance
   */
  private async pushResources(resources: FederationResource[], correlationId: string): Promise<any> {
    const token = await this.generateFederationToken();

    try {
      const response = await axios.post(
        `${this.USA_FEDERATION_ENDPOINT}/resources`,
        {
          correlationId,
          sourceRealm: this.INSTANCE_REALM,
          resources: resources.map(r => ({
            ...r,
            // Ensure USA can verify origin
            originRealm: this.INSTANCE_REALM,
            federationMetadata: {
              exportedAt: new Date(),
              exportedBy: this.INSTANCE_REALM,
              correlationId
            }
          }))
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Correlation-ID': correlationId,
            'X-Origin-Realm': this.INSTANCE_REALM
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error(`Failed to push resources: ${error.message}`);
      return { synced: 0, updated: 0, conflicted: 0, conflicts: [] };
    }
  }

  /**
   * Pull resources from USA instance
   */
  private async pullResources(correlationId: string): Promise<FederationResource[]> {
    const token = await this.generateFederationToken();

    try {
      const response = await axios.get(
        `${this.USA_FEDERATION_ENDPOINT}/resources`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Correlation-ID': correlationId,
            'X-Origin-Realm': this.INSTANCE_REALM
          },
          params: {
            releasableTo: 'FRA',
            excludeOrigin: this.INSTANCE_REALM // Don't pull our own resources back
          }
        }
      );

      return response.data.resources || [];
    } catch (error: any) {
      console.error(`Failed to pull resources: ${error.message}`);
      return [];
    }
  }

  /**
   * Import resources from another realm
   */
  private async importResources(resources: FederationResource[], sourceRealm: string): Promise<any> {
    let synced = 0;
    let updated = 0;
    let conflicted = 0;
    const conflicts: ConflictRecord[] = [];

    for (const resource of resources) {
      // Check if FRA is in releasability list
      if (!resource.releasabilityTo.includes('FRA')) {
        console.log(`Resource ${resource.resourceId} not releasable to FRA`);
        continue;
      }

      // Check for existing resource
      const existing = await this.resourcesCollection.findOne({
        resourceId: resource.resourceId
      });

      if (!existing) {
        // New resource - import it
        await this.resourcesCollection.insertOne({
          ...resource,
          importedFrom: sourceRealm,
          importedAt: new Date()
        });
        synced++;
      } else {
        // Existing resource - check for conflicts
        const conflictResolution = await this.resolveConflict(existing, resource);

        if (conflictResolution.resolution === 'remote_wins') {
          await this.resourcesCollection.updateOne(
            { resourceId: resource.resourceId },
            {
              $set: {
                ...resource,
                lastSyncedFrom: sourceRealm,
                lastSyncedAt: new Date()
              }
            }
          );
          updated++;
        } else if (conflictResolution.resolution === 'pending') {
          conflicted++;
          conflicts.push(conflictResolution);
        }
      }
    }

    return { synced, updated, conflicted, conflicts };
  }

  /**
   * Resolve conflicts between local and remote resources
   * GAP-003: Version-based conflict resolution
   */
  private async resolveConflict(local: FederationResource, remote: FederationResource): Promise<ConflictRecord> {
    // Origin realm always wins for its own resources
    if (local.originRealm === this.INSTANCE_REALM) {
      return {
        resourceId: local.resourceId,
        localVersion: local.version,
        remoteVersion: remote.version,
        resolution: 'local_wins',
        reason: 'Origin realm authority'
      };
    }

    // For resources from other realms, use version comparison
    if (remote.version > local.version) {
      return {
        resourceId: local.resourceId,
        localVersion: local.version,
        remoteVersion: remote.version,
        resolution: 'remote_wins',
        reason: 'Higher version number'
      };
    }

    // If versions are equal, compare timestamps
    if (remote.version === local.version) {
      const remoteTime = new Date(remote.lastModified).getTime();
      const localTime = new Date(local.lastModified).getTime();

      if (remoteTime > localTime) {
        return {
          resourceId: local.resourceId,
          localVersion: local.version,
          remoteVersion: remote.version,
          resolution: 'remote_wins',
          reason: 'More recent timestamp'
        };
      }
    }

    // Default: keep local
    return {
      resourceId: local.resourceId,
      localVersion: local.version,
      remoteVersion: remote.version,
      resolution: 'local_wins',
      reason: 'No update needed'
    };
  }

  /**
   * Update sync status for resources
   */
  private async updateSyncStatus(resources: FederationResource[], targetRealm: string): Promise<void> {
    const bulkOps = resources.map(resource => ({
      updateOne: {
        filter: { resourceId: resource.resourceId },
        update: {
          $set: {
            [`syncStatus.${targetRealm}`]: {
              synced: true,
              timestamp: new Date(),
              version: resource.version
            }
          }
        }
      }
    }));

    if (bulkOps.length > 0) {
      await this.resourcesCollection.bulkWrite(bulkOps);
    }
  }

  /**
   * Generate JWT token for federation authentication
   */
  private async generateFederationToken(): Promise<string> {
    const payload = {
      iss: 'https://fra-idp.dive25.com/realms/dive-v3-broker-fra',
      sub: 'fra-federation-service',
      aud: 'usa-federation-endpoint',
      realm: this.INSTANCE_REALM,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes
      federationVersion: '1.0',
      capabilities: ['read', 'write', 'sync']
    };

    // In production, use proper key management
    const secret = process.env.FEDERATION_JWT_SECRET || 'fra-federation-secret';
    return jwt.sign(payload, secret);
  }

  /**
   * Start automated sync scheduler
   */
  startSyncScheduler(): void {
    console.log(`Starting federation sync scheduler (interval: ${this.SYNC_INTERVAL / 1000}s)`);

    setInterval(async () => {
      try {
        await this.syncWithUSA();
      } catch (error) {
        console.error('Scheduled sync failed:', error);
      }
    }, this.SYNC_INTERVAL);

    // Also run immediately
    this.syncWithUSA().catch(console.error);
  }

  /**
   * Get sync history
   */
  async getSyncHistory(limit: number = 10): Promise<SyncResult[]> {
    return await this.syncLogCollection
      .find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Get conflict report
   */
  async getConflictReport(): Promise<any> {
    const recentSyncs = await this.getSyncHistory(100);
    const allConflicts = recentSyncs.flatMap(s => s.conflicts);

    return {
      totalConflicts: allConflicts.length,
      byResolution: {
        local_wins: allConflicts.filter(c => c.resolution === 'local_wins').length,
        remote_wins: allConflicts.filter(c => c.resolution === 'remote_wins').length,
        pending: allConflicts.filter(c => c.resolution === 'pending').length
      },
      recentConflicts: allConflicts.slice(0, 10)
    };
  }
}




