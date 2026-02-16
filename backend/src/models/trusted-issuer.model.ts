/**
 * DIVE V3 - Trusted Issuer MongoDB Model
 *
 * MEMORY LEAK FIX (2026-02-16): Refactored to use MongoDB singleton
 * OLD: Created separate MongoClient() instance in initialize() method (connection leak)
 * NEW: Uses shared singleton connection pool via getDb()
 * IMPACT: Prevents connection leak from OPAL data store initialization
 *
 * Persists trusted issuers for OPAL policy data distribution.
 * Replaces static policies/data.json with dynamic MongoDB-backed storage.
 *
 * Collection: trusted_issuers
 *
 * @version 1.0.0
 * @date 2025-01-03
 */

import { Collection, Db, ChangeStream } from 'mongodb';
import { logger } from '../utils/logger';
import { getDb, mongoSingleton } from '../utils/mongodb-singleton';

const COLLECTION_ISSUERS = 'trusted_issuers';
const COLLECTION_FED_MATRIX = 'federation_matrix';
const COLLECTION_TENANT_CONFIGS = 'tenant_configs';

/**
 * Trusted Issuer record
 */
export interface ITrustedIssuer {
  issuerUrl: string; // e.g., https://localhost:8443/realms/dive-v3-broker-usa
  tenant: string; // e.g., USA, FRA, GBR
  name: string; // Human-readable name
  country: string; // ISO 3166-1 alpha-3
  trustLevel: 'HIGH' | 'MEDIUM' | 'DEVELOPMENT' | 'LOW';
  realm?: string; // Optional: realm name
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    port?: number;
    internalUrl?: string;
    capabilities?: string[];
  };
}

/**
 * Federation matrix entry
 */
export interface IFederationMatrixEntry {
  sourceCountry: string; // Country granting access
  trustedCountries: string[]; // Countries that are trusted
  updatedAt: Date;
}

/**
 * Tenant configuration
 */
export interface ITenantConfig {
  code: string;
  name: string;
  locale: string;
  mfa_required_above: string;
  max_session_hours: number;
  default_coi: string[];
  allow_industry_access: boolean;
  industry_max_classification: string;
  updatedAt: Date;
}

/**
 * MongoDB-backed store for OPAL policy data
 */
export class MongoOpalDataStore {
  private db: Db | null = null;
  private issuersCollection: Collection<ITrustedIssuer> | null = null;
  private fedMatrixCollection: Collection<IFederationMatrixEntry> | null = null;
  private tenantConfigsCollection: Collection<ITenantConfig> | null = null;
  private initialized = false;
  private changeStream: ChangeStream | null = null;
  private changeCallbacks: Array<(collection: string, change: unknown) => void> = [];

  /**
   * Initialize MongoDB connection and create indexes
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.info('Initializing MongoDB OPAL Data Store with singleton');

      // Use singleton connection
      await mongoSingleton.connect();
      this.db = getDb();

      this.issuersCollection = this.db.collection<ITrustedIssuer>(COLLECTION_ISSUERS);
      this.fedMatrixCollection = this.db.collection<IFederationMatrixEntry>(COLLECTION_FED_MATRIX);
      this.tenantConfigsCollection = this.db.collection<ITenantConfig>(COLLECTION_TENANT_CONFIGS);

      logger.info('Creating MongoDB indexes...');

      // CRITICAL FIX (2026-01-27): Retry index creation if MongoDB is not PRIMARY yet
      // Background: Healthcheck passes when MongoDB accepts connections, but may not be PRIMARY
      // Solution: Retry with exponential backoff (2s, 4s, 8s, 16s, 32s = 62s total)
      const maxRetries = 5;
      let attempt = 0;
      let indexesCreated = false;

      while (attempt < maxRetries && !indexesCreated) {
        try {
          // Create indexes for issuers (with ignoreExisting to avoid duplicate key errors)
          await this.issuersCollection.createIndex({ issuerUrl: 1 }, { unique: true });
          await this.issuersCollection.createIndex({ tenant: 1 });
          await this.issuersCollection.createIndex({ country: 1 });
          await this.issuersCollection.createIndex({ trustLevel: 1 });
          await this.issuersCollection.createIndex({ enabled: 1 });

          // Create indexes for federation matrix
          await this.fedMatrixCollection.createIndex({ sourceCountry: 1 }, { unique: true });

          // Create indexes for tenant configs
          await this.tenantConfigsCollection.createIndex({ code: 1 }, { unique: true });

          indexesCreated = true;
          logger.info('MongoDB indexes created successfully');
        } catch (error) {
          // Check if error is "not primary"
          if (error instanceof Error && error.message.includes('not primary')) {
            attempt++;
            const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s, 16s, 32s
            logger.warn(`MongoDB not PRIMARY yet (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            // Different error - throw immediately
            throw error;
          }
        }
      }

      if (!indexesCreated) {
        throw new Error('Failed to create MongoDB indexes: replica set not PRIMARY after retries');
      }

      this.initialized = true;
      logger.info('MongoDB OPAL Data Store initialized successfully', {
        collections: [COLLECTION_ISSUERS, COLLECTION_FED_MATRIX, COLLECTION_TENANT_CONFIGS],
      });

      // SSOT ARCHITECTURE (2026-01-22): DO NOT seed from static JSON files
      // MongoDB is the Single Source of Truth. Data is populated dynamically:
      // - Hub deployment registers USA's trusted issuer
      // - Spoke deployment registers spoke's trusted issuer via Hub API
      // - Federation links are created during spoke registration
      // Static files (policies/data.json) should NOT be used for seeding
    } catch (error) {
      logger.error('Failed to initialize MongoDB OPAL Data Store', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Seed data from static JSON files if collections are empty
   */
  private async seedFromStaticFiles(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');

      // Check if collections are empty
      const issuerCount = await this.issuersCollection!.countDocuments();
      if (issuerCount === 0) {
        // Try to load from policies/data.json
        const dataPath = path.join(process.cwd(), 'policies', 'data.json');
        if (fs.existsSync(dataPath)) {
          const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

          // Seed trusted issuers
          if (data.trusted_issuers) {
            const issuers: ITrustedIssuer[] = Object.entries(data.trusted_issuers)
              .filter(([url]) => !url.includes('https://localhost:/')) // Skip invalid URLs
              .map(([url, issuer]: [string, unknown]) => {
                const i = issuer as Record<string, unknown>;
                return {
                  issuerUrl: url,
                  tenant: (i.tenant as string) || 'UNKNOWN',
                  name: (i.name as string) || url,
                  country: (i.country as string) || 'UNKNOWN',
                  trustLevel: ((i.trust_level as string) || 'DEVELOPMENT').toUpperCase() as ITrustedIssuer['trustLevel'],
                  realm: i.realm as string | undefined,
                  enabled: i.enabled !== false,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
              });

            if (issuers.length > 0) {
              await this.issuersCollection!.insertMany(issuers);
              logger.info(`Seeded ${issuers.length} trusted issuers from policies/data.json`);
            }
          }

          // Seed federation matrix
          if (data.federation_matrix) {
            const entries: IFederationMatrixEntry[] = Object.entries(data.federation_matrix).map(
              ([country, trusted]: [string, unknown]) => ({
                sourceCountry: country,
                trustedCountries: trusted as string[],
                updatedAt: new Date(),
              })
            );

            if (entries.length > 0) {
              await this.fedMatrixCollection!.insertMany(entries);
              logger.info(`Seeded ${entries.length} federation matrix entries`);
            }
          }

          // Seed tenant configs
          if (data.tenant_configs) {
            const configs: ITenantConfig[] = Object.entries(data.tenant_configs).map(
              ([code, config]: [string, unknown]) => {
                const c = config as Record<string, unknown>;
                return {
                  code,
                  name: (c.name as string) || code,
                  locale: (c.locale as string) || 'en-US',
                  mfa_required_above: (c.mfa_required_above as string) || 'UNCLASSIFIED',
                  max_session_hours: (c.max_session_hours as number) || 8,
                  default_coi: (c.default_coi as string[]) || ['NATO'],
                  allow_industry_access: c.allow_industry_access !== false,
                  industry_max_classification: (c.industry_max_classification as string) || 'CONFIDENTIAL',
                  updatedAt: new Date(),
                };
              }
            );

            if (configs.length > 0) {
              await this.tenantConfigsCollection!.insertMany(configs);
              logger.info(`Seeded ${configs.length} tenant configs`);
            }
          }
        }
      }
    } catch (error) {
      logger.warn('Could not seed from static files', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Ensure initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // ============================================
  // CHANGE STREAM SUPPORT
  // ============================================

  /**
   * Register callback for change events
   */
  onDataChange(callback: (collection: string, change: unknown) => void): void {
    this.changeCallbacks.push(callback);
  }

  /**
   * Start watching for changes (for OPAL real-time sync)
   */
  async startChangeStream(): Promise<void> {
    await this.ensureInitialized();

    if (this.changeStream) return;

    // Watch all three collections
    const pipeline = [{ $match: { operationType: { $in: ['insert', 'update', 'delete', 'replace'] } } }];

    try {
      this.changeStream = this.db!.watch(pipeline, {
        fullDocument: 'updateLookup',
      });

      this.changeStream.on('change', (change) => {
        const collection = (change as { ns?: { coll: string } }).ns?.coll || 'unknown';
        logger.debug('OPAL data change detected', { collection, operationType: change.operationType });

        // Notify all callbacks
        this.changeCallbacks.forEach((cb) => cb(collection, change));
      });

      this.changeStream.on('error', (error) => {
        logger.error('Change stream error', { error: error.message });
      });

      logger.info('OPAL data change stream started');
    } catch (error) {
      // Change streams require replica set - log warning for standalone MongoDB
      logger.warn('Could not start OPAL data change stream', {
        error: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Change streams require MongoDB replica set. OPAL data will be updated via polling/API calls.'
      });
      // Don't set this.changeStream - leave it null so polling fallback can work
    }
  }

  /**
   * Stop watching for changes
   */
  async stopChangeStream(): Promise<void> {
    if (this.changeStream) {
      await this.changeStream.close();
      this.changeStream = null;
      logger.info('OPAL data change stream stopped');
    }
  }

  // ============================================
  // TRUSTED ISSUERS
  // ============================================

  async addIssuer(issuer: Omit<ITrustedIssuer, 'createdAt' | 'updatedAt'>): Promise<ITrustedIssuer> {
    await this.ensureInitialized();

    const doc: ITrustedIssuer = {
      ...issuer,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.issuersCollection!.insertOne(doc);
    logger.info('Trusted issuer added', { issuerUrl: issuer.issuerUrl, tenant: issuer.tenant });
    return doc;
  }

  async updateIssuer(issuerUrl: string, updates: Partial<ITrustedIssuer>): Promise<ITrustedIssuer | null> {
    await this.ensureInitialized();

    const result = await this.issuersCollection!.findOneAndUpdate(
      { issuerUrl },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    return result;
  }

  async removeIssuer(issuerUrl: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await this.issuersCollection!.deleteOne({ issuerUrl });
    return result.deletedCount === 1;
  }

  async findIssuerByUrl(issuerUrl: string): Promise<ITrustedIssuer | null> {
    await this.ensureInitialized();
    return this.issuersCollection!.findOne({ issuerUrl });
  }

  async findIssuersByTenant(tenant: string): Promise<ITrustedIssuer[]> {
    await this.ensureInitialized();
    return this.issuersCollection!.find({ tenant: tenant.toUpperCase(), enabled: true }).toArray();
  }

  async getAllIssuers(includeDisabled = false): Promise<ITrustedIssuer[]> {
    await this.ensureInitialized();
    const filter = includeDisabled ? {} : { enabled: true };
    return this.issuersCollection!.find(filter).toArray();
  }

  /**
   * Get issuers in OPAL-compatible format (keyed by URL)
   */
  async getIssuersForOpal(): Promise<Record<string, unknown>> {
    const issuers = await this.getAllIssuers();
    const result: Record<string, unknown> = {};

    for (const issuer of issuers) {
      result[issuer.issuerUrl] = {
        tenant: issuer.tenant,
        name: issuer.name,
        country: issuer.country,
        trust_level: issuer.trustLevel,
        realm: issuer.realm,
        enabled: issuer.enabled,
      };
    }

    return result;
  }

  // ============================================
  // FEDERATION MATRIX
  // ============================================

  async setFederationTrust(sourceCountry: string, trustedCountries: string[]): Promise<void> {
    await this.ensureInitialized();

    await this.fedMatrixCollection!.updateOne(
      { sourceCountry: sourceCountry.toUpperCase() },
      {
        $set: {
          trustedCountries: trustedCountries.map((c) => c.toUpperCase()),
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
  }

  async addFederationTrust(sourceCountry: string, targetCountry: string): Promise<void> {
    await this.ensureInitialized();

    await this.fedMatrixCollection!.updateOne(
      { sourceCountry: sourceCountry.toUpperCase() },
      {
        $addToSet: { trustedCountries: targetCountry.toUpperCase() },
        $set: { updatedAt: new Date() },
      },
      { upsert: true }
    );
  }

  async removeFederationTrust(sourceCountry: string, targetCountry: string): Promise<void> {
    await this.ensureInitialized();

    await this.fedMatrixCollection!.updateOne(
      { sourceCountry: sourceCountry.toUpperCase() },
      {
        $pull: { trustedCountries: targetCountry.toUpperCase() },
        $set: { updatedAt: new Date() },
      }
    );
  }

  async getFederationMatrix(): Promise<Record<string, string[]>> {
    await this.ensureInitialized();
    const entries = await this.fedMatrixCollection!.find().toArray();

    const result: Record<string, string[]> = {};
    for (const entry of entries) {
      result[entry.sourceCountry] = entry.trustedCountries;
    }
    return result;
  }

  // ============================================
  // TENANT CONFIGS
  // ============================================

  async setTenantConfig(code: string, config: Omit<ITenantConfig, 'code' | 'updatedAt'>): Promise<void> {
    await this.ensureInitialized();

    await this.tenantConfigsCollection!.updateOne(
      { code: code.toUpperCase() },
      {
        $set: {
          ...config,
          code: code.toUpperCase(),
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
  }

  async getTenantConfig(code: string): Promise<ITenantConfig | null> {
    await this.ensureInitialized();
    return this.tenantConfigsCollection!.findOne({ code: code.toUpperCase() });
  }

  async getAllTenantConfigs(): Promise<Record<string, ITenantConfig>> {
    await this.ensureInitialized();
    const configs = await this.tenantConfigsCollection!.find().toArray();

    const result: Record<string, ITenantConfig> = {};
    for (const config of configs) {
      result[config.code] = config;
    }
    return result;
  }
}

// Export singleton instance
export const mongoOpalDataStore = new MongoOpalDataStore();

export default MongoOpalDataStore;
