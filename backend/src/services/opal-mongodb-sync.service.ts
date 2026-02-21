/**
 * DIVE V3 - OPAL MongoDB Sync Service
 * 
 * Watches MongoDB change streams and publishes updates to OPAL.
 * This enables real-time synchronization of federation configuration
 * stored in MongoDB to OPA policies via OPAL.
 * 
 * Watched Collections:
 * - federation_partners: Bilateral trust relationships
 * - trusted_issuers: Token issuer registry  
 * - tenant_configs: Per-tenant policy settings
 * - coi_memberships: Community of Interest membership (dynamic, user-based)
 * 
 * Note: Static COI membership (country-based) comes from JSON files.
 * This service handles dynamic program-based COI assignments.
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import { ChangeStream, ChangeStreamDocument, MongoClient, Db } from 'mongodb';
import { opalClient, IOPALPublishResult } from './opal-client';
import { opalDataService, ITrustedIssuer } from './opal-data.service';
import { logger } from '../utils/logger';
import { connectToMongoDBWithRetry, verifyReplicaSetStatus } from '../utils/mongodb-connection';

// ============================================
// TYPES
// ============================================

export interface IFederationPartnerDoc {
  _id?: string;
  sourceInstance: string;
  targetInstance: string;
  enabled: boolean;
  trustLevel: 'bilateral' | 'multilateral';
  maxClassification: string;
  allowedCOI: string[];
  attributeMapping?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITrustedIssuerDoc {
  _id?: string;
  issuerUrl: string;
  tenant: string;
  name: string;
  country: string;
  trust_level: 'HIGH' | 'MEDIUM' | 'LOW' | 'DEVELOPMENT';
  enabled: boolean;
  protocol: 'oidc' | 'saml';
  federation_class: 'NATIONAL' | 'PARTNER' | 'LOCAL';
  jwks_uri?: string;
  metadata_url?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICOIMembershipDoc {
  _id?: string;
  userId: string;
  uniqueID: string;
  coiName: string;
  grantedBy: string;
  grantedAt: Date;
  expiresAt?: Date;
  reason?: string;
}

export interface ISyncStats {
  federationPartners: number;
  trustedIssuers: number;
  coiMemberships: number;
  lastSyncAt: Date | null;
  changeEventsProcessed: number;
  errors: number;
}

// ============================================
// CONFIGURATION
// ============================================

const MONGODB_URL =
  process.env.MONGODB_URL ||
  (process.env.MONGO_PASSWORD
    ? `mongodb://admin:${process.env.MONGO_PASSWORD}@localhost:27017?authSource=admin`
    : '');
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'dive-v3';

const COLLECTIONS = {
  federationPartners: 'federation_partners',
  trustedIssuers: 'trusted_issuers',
  tenantConfigs: 'tenant_configs',
  coiMemberships: 'coi_memberships'
};

// Debounce interval for batching updates (ms)
const DEBOUNCE_INTERVAL = 5000;

// ============================================
// OPAL MONGODB SYNC SERVICE CLASS
// ============================================

class OPALMongoDBSyncService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private changeStreams: ChangeStream[] = [];
  private isRunning = false;
  private stats: ISyncStats = {
    federationPartners: 0,
    trustedIssuers: 0,
    coiMemberships: 0,
    lastSyncAt: null,
    changeEventsProcessed: 0,
    errors: 0
  };
  
  // Debounce timers for batching updates
  private pendingUpdates = new Map<string, NodeJS.Timeout>();

  constructor() {
    logger.info('OPAL MongoDB Sync Service initialized');
  }

  /**
   * Connect to MongoDB
   */
  async connect(): Promise<boolean> {
    if (this.client && this.db) {
      return true;
    }

    if (!MONGODB_URL) {
      logger.error('MongoDB URL is not configured for OPAL sync');
      return false;
    }

    try {
      logger.info('Connecting to MongoDB for OPAL sync', {
        database: MONGODB_DATABASE
      });

      // Use production-grade retry logic for replica set initialization
      this.client = await connectToMongoDBWithRetry(MONGODB_URL);
      this.db = this.client.db(MONGODB_DATABASE);

      // Verify replica set status for change streams
      const status = await verifyReplicaSetStatus(this.client);
      if (status.isReplicaSet && !status.isPrimary) {
        logger.warn('MongoDB is replica set but not PRIMARY - change streams may not work yet');
      }

      logger.info('MongoDB connection established for OPAL sync', {
        isReplicaSet: status.isReplicaSet,
        isPrimary: status.isPrimary
      });
      return true;
    } catch (error) {
      logger.error('Failed to connect to MongoDB for OPAL sync', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Start watching MongoDB change streams
   */
  async startWatching(): Promise<void> {
    if (this.isRunning) {
      logger.warn('OPAL MongoDB sync already running');
      return;
    }

    const connected = await this.connect();
    if (!connected || !this.db) {
      logger.error('Cannot start watching - MongoDB not connected');
      return;
    }

    logger.info('Starting MongoDB change stream watchers');

    try {
      // Watch federation partners collection
      await this.watchCollection(
        COLLECTIONS.federationPartners,
        this.handleFederationPartnerChange.bind(this)
      );

      // Watch trusted issuers collection
      await this.watchCollection(
        COLLECTIONS.trustedIssuers,
        this.handleTrustedIssuerChange.bind(this)
      );

      // Watch COI memberships collection
      await this.watchCollection(
        COLLECTIONS.coiMemberships,
        this.handleCOIMembershipChange.bind(this)
      );

      this.isRunning = true;
      logger.info('MongoDB change stream watchers started', {
        collections: Object.values(COLLECTIONS)
      });

      // Perform initial sync
      await this.performFullSync();
    } catch (error) {
      logger.error('Failed to start MongoDB change stream watchers', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      this.stats.errors++;
    }
  }

  /**
   * Watch a single collection for changes
   */
  private async watchCollection(
    collectionName: string,
    handler: (change: ChangeStreamDocument) => Promise<void>
  ): Promise<void> {
    if (!this.db) return;

    try {
      const collection = this.db.collection(collectionName);
      
      // Ensure collection exists (create if not)
      const collections = await this.db.listCollections({ name: collectionName }).toArray();
      if (collections.length === 0) {
        await this.db.createCollection(collectionName);
        logger.info('Created collection for OPAL sync', { collectionName });
      }

      // Start change stream
      const changeStream = collection.watch([], {
        fullDocument: 'updateLookup'
      });

      changeStream.on('change', async (change) => {
        try {
          logger.debug('MongoDB change event received', {
            collection: collectionName,
            operationType: change.operationType
          });

          await handler(change);
          this.stats.changeEventsProcessed++;
        } catch (error) {
          logger.error('Error handling change event', {
            collection: collectionName,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          this.stats.errors++;
        }
      });

      changeStream.on('error', (error) => {
        logger.error('Change stream error', {
          collection: collectionName,
          error: error.message
        });
        this.stats.errors++;
      });

      this.changeStreams.push(changeStream);
      logger.info('Started change stream watcher', { 
        collectionName,
        replicaSet: 'rs0',
        cdcEnabled: true
      });
    } catch (error) {
      // Change streams require replica set - CRITICAL ERROR since we now require replica set
      logger.error('CRITICAL: Could not start change stream watcher', {
        collection: collectionName,
        error: error instanceof Error ? error.message : 'Unknown error',
        hint: 'MongoDB MUST be configured as replica set (rs0). Check docker-compose configuration.'
      });
      throw error; // Fail fast - change streams are required for OPAL CDC
    }
  }

  /**
   * Handle federation partner changes
   */
  private async handleFederationPartnerChange(
    _change: ChangeStreamDocument
  ): Promise<void> {
    // Debounce updates to batch multiple changes
    this.scheduleUpdate('federation_matrix', async () => {
      await this.syncFederationPartnersToOPAL();
    });
  }

  /**
   * Handle trusted issuer changes
   */
  private async handleTrustedIssuerChange(
    _change: ChangeStreamDocument
  ): Promise<void> {
    this.scheduleUpdate('trusted_issuers', async () => {
      await this.syncTrustedIssuersToOPAL();
    });
  }

  /**
   * Handle COI membership changes
   */
  private async handleCOIMembershipChange(
    change: ChangeStreamDocument
  ): Promise<void> {
    // COI membership changes affect user-specific access
    // This is handled differently - we notify OPAL of the affected user
    const doc = (change as any).fullDocument as ICOIMembershipDoc | undefined;
    
    if (doc) {
      logger.info('COI membership changed', {
        userId: doc.userId,
        coi: doc.coiName,
        operation: change.operationType
      });
    }

    this.scheduleUpdate('coi_memberships', async () => {
      await this.syncCOIMembershipsToOPAL();
    });
  }

  /**
   * Schedule a debounced update
   */
  private scheduleUpdate(key: string, updateFn: () => Promise<void>): void {
    // Clear existing timer
    const existing = this.pendingUpdates.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    // Schedule new update
    const timer = setTimeout(async () => {
      this.pendingUpdates.delete(key);
      try {
        await updateFn();
      } catch (error) {
        logger.error('Debounced update failed', {
          key,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, DEBOUNCE_INTERVAL);

    this.pendingUpdates.set(key, timer);
  }

  /**
   * Sync federation partners from MongoDB to OPAL
   */
  private async syncFederationPartnersToOPAL(): Promise<IOPALPublishResult> {
    if (!this.db) {
      return { success: false, message: 'Not connected', timestamp: new Date().toISOString() };
    }

    try {
      const collection = this.db.collection<IFederationPartnerDoc>(
        COLLECTIONS.federationPartners
      );

      const partners = await collection.find({ enabled: true }).toArray();

      // Build federation matrix from documents
      const federationMatrix: Record<string, string[]> = {};

      for (const partner of partners) {
        if (!federationMatrix[partner.sourceInstance]) {
          federationMatrix[partner.sourceInstance] = [];
        }
        if (!federationMatrix[partner.sourceInstance].includes(partner.targetInstance)) {
          federationMatrix[partner.sourceInstance].push(partner.targetInstance);
        }
      }

      this.stats.federationPartners = partners.length;

      logger.info('Syncing federation partners to OPAL', {
        partnerCount: partners.length,
        tenants: Object.keys(federationMatrix)
      });

      return opalClient.publishInlineData(
        'federation_matrix',
        federationMatrix,
        `MongoDB sync: ${partners.length} federation partners`
      );
    } catch (error) {
      logger.error('Failed to sync federation partners', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        success: false,
        message: 'Sync failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Sync trusted issuers from MongoDB to OPAL
   */
  private async syncTrustedIssuersToOPAL(): Promise<IOPALPublishResult> {
    if (!this.db) {
      return { success: false, message: 'Not connected', timestamp: new Date().toISOString() };
    }

    try {
      const collection = this.db.collection<ITrustedIssuerDoc>(
        COLLECTIONS.trustedIssuers
      );

      const issuers = await collection.find({ enabled: true }).toArray();

      // Build trusted issuers map
      const trustedIssuers: Record<string, ITrustedIssuer> = {};

      for (const issuer of issuers) {
        trustedIssuers[issuer.issuerUrl] = {
          tenant: issuer.tenant,
          name: issuer.name,
          country: issuer.country,
          trust_level: issuer.trust_level,
          enabled: issuer.enabled,
          protocol: issuer.protocol,
          federation_class: issuer.federation_class,
          jwks_uri: issuer.jwks_uri
        };
      }

      this.stats.trustedIssuers = issuers.length;

      logger.info('Syncing trusted issuers to OPAL', {
        issuerCount: issuers.length
      });

      return opalClient.publishInlineData(
        'trusted_issuers',
        trustedIssuers,
        `MongoDB sync: ${issuers.length} trusted issuers`
      );
    } catch (error) {
      logger.error('Failed to sync trusted issuers', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        success: false,
        message: 'Sync failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Sync dynamic COI memberships from MongoDB to OPAL
   * This handles program-based COI (user assignments), not country-based COI
   */
  private async syncCOIMembershipsToOPAL(): Promise<IOPALPublishResult> {
    if (!this.db) {
      return { success: false, message: 'Not connected', timestamp: new Date().toISOString() };
    }

    try {
      const collection = this.db.collection<ICOIMembershipDoc>(
        COLLECTIONS.coiMemberships
      );

      const now = new Date();
      
      // Get all active (non-expired) memberships
      const memberships = await collection.find({
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: { $gt: now } }
        ]
      }).toArray();

      // Build user COI map: userId -> [coi1, coi2, ...]
      const userCOIMemberships: Record<string, string[]> = {};

      for (const membership of memberships) {
        if (!userCOIMemberships[membership.uniqueID]) {
          userCOIMemberships[membership.uniqueID] = [];
        }
        if (!userCOIMemberships[membership.uniqueID].includes(membership.coiName)) {
          userCOIMemberships[membership.uniqueID].push(membership.coiName);
        }
      }

      this.stats.coiMemberships = memberships.length;

      logger.info('Syncing COI memberships to OPAL', {
        membershipCount: memberships.length,
        uniqueUsers: Object.keys(userCOIMemberships).length
      });

      // Publish user-specific COI memberships
      return opalClient.publishInlineData(
        'user_coi_memberships',
        userCOIMemberships,
        `MongoDB sync: ${memberships.length} COI memberships`
      );
    } catch (error) {
      logger.error('Failed to sync COI memberships', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        success: false,
        message: 'Sync failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Perform full sync of all data to OPAL
   */
  async performFullSync(): Promise<void> {
    logger.info('Performing full OPAL data sync from MongoDB');

    try {
      // First sync from JSON files (base data)
      await opalDataService.syncAllToOPAL();

      // Then overlay MongoDB data (dynamic overrides)
      if (this.db) {
        // Check if collections have data
        const fpCount = await this.db.collection(COLLECTIONS.federationPartners).countDocuments();
        const tiCount = await this.db.collection(COLLECTIONS.trustedIssuers).countDocuments();
        const cmCount = await this.db.collection(COLLECTIONS.coiMemberships).countDocuments();

        if (fpCount > 0) {
          await this.syncFederationPartnersToOPAL();
        }
        if (tiCount > 0) {
          await this.syncTrustedIssuersToOPAL();
        }
        if (cmCount > 0) {
          await this.syncCOIMembershipsToOPAL();
        }
      }

      this.stats.lastSyncAt = new Date();
      logger.info('Full OPAL data sync completed', { stats: this.stats });
    } catch (error) {
      logger.error('Full OPAL data sync failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      this.stats.errors++;
    }
  }

  /**
   * Stop watching and disconnect
   */
  async stop(): Promise<void> {
    logger.info('Stopping OPAL MongoDB sync service');

    this.isRunning = false;

    // Close change streams
    for (const stream of this.changeStreams) {
      await stream.close();
    }
    this.changeStreams = [];

    // Clear pending updates
    for (const timer of this.pendingUpdates.values()) {
      clearTimeout(timer);
    }
    this.pendingUpdates.clear();

    // Close MongoDB connection
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }

    logger.info('OPAL MongoDB sync service stopped');
  }

  /**
   * Get current sync stats
   */
  getStats(): Readonly<ISyncStats> {
    return { ...this.stats };
  }

  /**
   * Check if service is running
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const opalMongoDBSyncService = new OPALMongoDBSyncService();

export default OPALMongoDBSyncService;
