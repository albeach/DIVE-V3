/**
 * DIVE V3 - KAS Registry MongoDB Model
 *
 * Persists KAS instance registrations for federated key management.
 * Replaces static kas/config/kas-registry.json with dynamic MongoDB-backed storage.
 *
 * Collection: kas_registry
 *
 * @version 1.0.0
 * @date 2025-01-03
 */

import { Collection, Db, MongoClient } from 'mongodb';
import { logger } from '../utils/logger';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';
const COLLECTION_KAS_INSTANCES = 'kas_registry';
const COLLECTION_KAS_AGREEMENTS = 'kas_federation_agreements';

/**
 * KAS Instance record
 *
 * IMPORTANT: All country codes MUST be ISO 3166-1 alpha-3 (USA, FRA, EST, etc.)
 * Reference: .cursorrules specification for DIVE V3
 */
export interface IKasInstance {
  kasId: string; // e.g., usa-kas, fra-kas (format: {iso-code-lower}-kas)
  organization: string; // e.g., United States, France
  countryCode: string; // ISO 3166-1 alpha-3 - SSOT for KAS home country (USA, FRA, EST)
  kasUrl: string; // External URL: https://localhost:10008 (dev) or https://usa-kas.dive25.com (prod)
  internalKasUrl?: string; // Docker service URL: https://kas:8080 (container-to-container)
  authMethod: 'jwt' | 'mtls' | 'api_key';
  authConfig: {
    jwtIssuer?: string;
    certificateFingerprint?: string;
    apiKeyHash?: string;
  };
  trustLevel: 'high' | 'medium' | 'low';
  supportedCountries: string[]; // ISO 3166-1 alpha-3 codes this KAS can serve
  supportedCOIs: string[];
  policyTranslation?: {
    clearanceMapping?: Record<string, string>;
    countryMapping?: Record<string, string>;
  };
  metadata: {
    version: string;
    capabilities: string[];
    contact?: string;
    lastVerified?: Date;
    registeredAt?: Date;
    lastHeartbeat?: Date;
  };
  enabled: boolean;
  status: 'active' | 'pending' | 'suspended' | 'offline';
}

/**
 * KAS Federation Agreement
 */
export interface IKasFederationAgreement {
  countryCode: string;
  trustedKAS: string[];
  maxClassification: string;
  allowedCOIs: string[];
  updatedAt: Date;
}

/**
 * MongoDB-backed store for KAS registry
 */
export class MongoKasRegistryStore {
  private db: Db | null = null;
  private client: MongoClient | null = null;
  private kasCollection: Collection<IKasInstance> | null = null;
  private agreementsCollection: Collection<IKasFederationAgreement> | null = null;
  private initialized = false;

  /**
   * Initialize MongoDB connection and create indexes
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.client = new MongoClient(MONGODB_URL);
      await this.client.connect();
      this.db = this.client.db(DB_NAME);

      this.kasCollection = this.db.collection<IKasInstance>(COLLECTION_KAS_INSTANCES);
      this.agreementsCollection = this.db.collection<IKasFederationAgreement>(COLLECTION_KAS_AGREEMENTS);

      // Create indexes
      await this.kasCollection.createIndex({ kasId: 1 }, { unique: true });
      await this.kasCollection.createIndex({ kasUrl: 1 }, { unique: true });
      await this.kasCollection.createIndex({ countryCode: 1 }); // ISO 3166-1 alpha-3 - SSOT
      await this.kasCollection.createIndex({ organization: 1 });
      await this.kasCollection.createIndex({ status: 1 });
      await this.kasCollection.createIndex({ 'authConfig.jwtIssuer': 1 }, { sparse: true });
      await this.kasCollection.createIndex({ supportedCountries: 1 });

      await this.agreementsCollection.createIndex({ countryCode: 1 }, { unique: true });

      this.initialized = true;
      logger.info('MongoDB KAS Registry Store initialized', {
        database: DB_NAME,
        collections: [COLLECTION_KAS_INSTANCES, COLLECTION_KAS_AGREEMENTS],
      });

      // Seed from static file if empty
      await this.seedFromStaticFile();
    } catch (error) {
      logger.error('Failed to initialize MongoDB KAS Registry Store', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Seed from static JSON file if collection is empty
   */
  private async seedFromStaticFile(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const count = await this.kasCollection!.countDocuments();
      if (count === 0) {
        // Try config/kas-registry.json first, then kas/config/kas-registry.json
        let registryPath = path.join(process.cwd(), 'config', 'kas-registry.json');
        if (!fs.existsSync(registryPath)) {
          registryPath = path.join(process.cwd(), '..', 'kas', 'config', 'kas-registry.json');
        }

        if (fs.existsSync(registryPath)) {
          const data = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

          // Seed KAS servers
          if (data.kasServers) {
            const instances: IKasInstance[] = data.kasServers.map((instance: Record<string, unknown>) => ({
              kasId: instance.kasId as string,
              organization: instance.organization as string,
              // countryCode: ISO 3166-1 alpha-3 - SSOT for KAS home country
              countryCode: (instance.countryCode as string) || (instance.supportedCountries as string[])?.[0] || 'USA',
              kasUrl: instance.kasUrl as string,
              authMethod: (instance.authMethod as string) || 'jwt',
              authConfig: instance.authConfig as IKasInstance['authConfig'],
              trustLevel: (instance.trustLevel as string) || 'medium',
              supportedCountries: (instance.supportedCountries as string[]) || [],
              supportedCOIs: (instance.supportedCOIs as string[]) || [],
              policyTranslation: instance.policyTranslation as IKasInstance['policyTranslation'],
              metadata: {
                ...(instance.metadata as Record<string, unknown>),
                registeredAt: new Date(),
              },
              enabled: true,
              status: 'active' as const,
            }));

            if (instances.length > 0) {
              await this.kasCollection!.insertMany(instances);
              logger.info(`Seeded ${instances.length} KAS instances from static file`);
            }
          }

          // Seed federation agreements
          if (data.federationAgreements) {
            const agreements: IKasFederationAgreement[] = Object.entries(data.federationAgreements).map(
              ([code, agreement]: [string, unknown]) => {
                const a = agreement as Record<string, unknown>;
                return {
                  countryCode: code,
                  trustedKAS: (a.trustedKAS as string[]) || [],
                  maxClassification: (a.maxClassification as string) || 'SECRET',
                  allowedCOIs: (a.allowedCOIs as string[]) || ['NATO'],
                  updatedAt: new Date(),
                };
              }
            );

            if (agreements.length > 0) {
              await this.agreementsCollection!.insertMany(agreements);
              logger.info(`Seeded ${agreements.length} KAS federation agreements`);
            }
          }
        }
      }
    } catch (error) {
      logger.warn('Could not seed KAS registry from static file', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // ============================================
  // KAS INSTANCE MANAGEMENT
  // ============================================

  /**
   * Register a new KAS instance
   */
  async register(instance: Omit<IKasInstance, 'status'>): Promise<IKasInstance> {
    await this.ensureInitialized();

    const doc: IKasInstance = {
      ...instance,
      status: 'pending', // Requires approval
      metadata: {
        ...instance.metadata,
        registeredAt: new Date(),
        lastHeartbeat: new Date(),
      },
    };

    await this.kasCollection!.insertOne(doc);
    logger.info('KAS instance registered', { kasId: instance.kasId, organization: instance.organization });
    return doc;
  }

  /**
   * Approve a pending KAS registration
   */
  async approve(kasId: string): Promise<IKasInstance | null> {
    await this.ensureInitialized();

    return this.kasCollection!.findOneAndUpdate(
      { kasId, status: 'pending' },
      { $set: { status: 'active', enabled: true } },
      { returnDocument: 'after' }
    );
  }

  /**
   * Suspend a KAS instance
   */
  async suspend(kasId: string, reason: string): Promise<IKasInstance | null> {
    await this.ensureInitialized();

    return this.kasCollection!.findOneAndUpdate(
      { kasId },
      {
        $set: {
          status: 'suspended',
          enabled: false,
          'metadata.suspendedReason': reason,
          'metadata.suspendedAt': new Date(),
        },
      },
      { returnDocument: 'after' }
    );
  }

  /**
   * Update heartbeat timestamp
   */
  async heartbeat(kasId: string): Promise<void> {
    await this.ensureInitialized();

    await this.kasCollection!.updateOne(
      { kasId },
      { $set: { 'metadata.lastHeartbeat': new Date() } }
    );
  }

  /**
   * Find KAS by ID
   */
  async findById(kasId: string): Promise<IKasInstance | null> {
    await this.ensureInitialized();
    return this.kasCollection!.findOne({ kasId });
  }

  /**
   * Find KAS by JWT issuer
   */
  async findByJwtIssuer(issuer: string): Promise<IKasInstance | null> {
    await this.ensureInitialized();
    return this.kasCollection!.findOne({ 'authConfig.jwtIssuer': issuer });
  }

  /**
   * Get all active KAS instances
   */
  async findActive(): Promise<IKasInstance[]> {
    await this.ensureInitialized();
    return this.kasCollection!.find({ status: 'active', enabled: true }).toArray();
  }

  /**
   * Get all KAS instances (including inactive)
   */
  async findAll(): Promise<IKasInstance[]> {
    await this.ensureInitialized();
    return this.kasCollection!.find().toArray();
  }

  /**
   * Find KAS instance by countryCode (ISO 3166-1 alpha-3)
   * This is the primary lookup method as countryCode is the SSOT
   */
  async findByCountryCode(countryCode: string): Promise<IKasInstance | null> {
    await this.ensureInitialized();
    return this.kasCollection!.findOne({
      countryCode: countryCode.toUpperCase(),
      status: 'active',
      enabled: true,
    });
  }

  /**
   * Find KAS instances that support a specific country
   */
  async findByCountry(country: string): Promise<IKasInstance[]> {
    await this.ensureInitialized();
    return this.kasCollection!.find({
      supportedCountries: country.toUpperCase(),
      status: 'active',
      enabled: true,
    }).toArray();
  }

  /**
   * Remove a KAS instance
   */
  async remove(kasId: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await this.kasCollection!.deleteOne({ kasId });
    return result.deletedCount === 1;
  }

  /**
   * Get KAS registry for OPAL format
   */
  async getRegistryForOpal(): Promise<Record<string, unknown>> {
    const instances = await this.findActive();

    const kasServers = instances.map((kas) => ({
      kasId: kas.kasId,
      organization: kas.organization,
      kasUrl: kas.kasUrl,
      authMethod: kas.authMethod,
      authConfig: kas.authConfig,
      trustLevel: kas.trustLevel,
      supportedCountries: kas.supportedCountries,
      supportedCOIs: kas.supportedCOIs,
    }));

    return {
      kasServers,
      count: kasServers.length,
    };
  }

  // ============================================
  // FEDERATION AGREEMENTS
  // ============================================

  /**
   * Get federation agreement for a country
   */
  async getFederationAgreement(countryCode: string): Promise<IKasFederationAgreement | null> {
    await this.ensureInitialized();
    return this.agreementsCollection!.findOne({ countryCode: countryCode.toUpperCase() });
  }

  /**
   * Update federation agreement
   */
  async setFederationAgreement(
    countryCode: string,
    trustedKAS: string[],
    maxClassification: string,
    allowedCOIs: string[]
  ): Promise<void> {
    await this.ensureInitialized();

    await this.agreementsCollection!.updateOne(
      { countryCode: countryCode.toUpperCase() },
      {
        $set: {
          trustedKAS,
          maxClassification,
          allowedCOIs,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
  }

  /**
   * Get all federation agreements
   */
  async getAllFederationAgreements(): Promise<Record<string, IKasFederationAgreement>> {
    await this.ensureInitialized();
    const agreements = await this.agreementsCollection!.find().toArray();

    const result: Record<string, IKasFederationAgreement> = {};
    for (const agreement of agreements) {
      result[agreement.countryCode] = agreement;
    }
    return result;
  }
}

// Export singleton
export const mongoKasRegistryStore = new MongoKasRegistryStore();

export default MongoKasRegistryStore;
