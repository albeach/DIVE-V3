/**
 * DIVE V3 - COI Definitions MongoDB Model
 *
 * Single source of truth for ALL COI (Community of Interest) definitions.
 * Replaces hardcoded COI_MEMBERSHIP in coi-validation.service.ts
 *
 * Collection: coi_definitions
 *
 * Supports two types of COIs:
 * 1. Country-Based COI (NATO, FVEY, EU-RESTRICTED):
 *    - Members are country codes (USA, FRA, GBR, etc.)
 *    - Auto-updated when federation changes
 *    - Immutable by default (admin override allowed)
 *
 * 2. Program-Based COI (Alpha, Beta, Project-X):
 *    - Members assigned per-user via coi_keys collection
 *    - Empty members array (membership is user-specific)
 *    - Fully mutable via API
 *
 * @version 1.0.0
 * @date 2026-01-22
 */

import { Collection, Db, MongoClient } from 'mongodb';
import { logger } from '../utils/logger';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';
const COLLECTION_COI_DEFINITIONS = 'coi_definitions';

/**
 * COI Definition Document
 */
export interface ICoiDefinition {
  coiId: string; // Unique identifier (US-ONLY, FVEY, NATO, Alpha, etc.)
  name: string; // Display name
  type: 'country-based' | 'program-based' | 'coalition';
  members: string[]; // Country codes (ISO 3166-1 alpha-3) or empty for program COIs
  description?: string;
  mutable: boolean; // Can members be updated via API?
  autoUpdate: boolean; // Auto-update from active federation?
  priority: number; // For conflict resolution (higher = more restrictive)
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    createdBy?: string;
    lastModifiedBy?: string;
    source?: 'manual' | 'federation_auto' | 'migration';
  };
  enabled: boolean;
}

/**
 * MongoDB store for COI definitions
 */
export class MongoCoiDefinitionStore {
  private db: Db | null = null;
  private client: MongoClient | null = null;
  private collection: Collection<ICoiDefinition> | null = null;
  private initialized = false;

  /**
   * Initialize MongoDB connection and indexes
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.client = new MongoClient(MONGODB_URL);
      await this.client.connect();
      this.db = this.client.db(DB_NAME);

      this.collection = this.db.collection<ICoiDefinition>(COLLECTION_COI_DEFINITIONS);

      // Create indexes
      await this.collection.createIndex({ coiId: 1 }, { unique: true });
      await this.collection.createIndex({ type: 1 });
      await this.collection.createIndex({ members: 1 });
      await this.collection.createIndex({ enabled: 1 });
      await this.collection.createIndex({ autoUpdate: 1 });

      this.initialized = true;
      logger.info('MongoDB COI Definitions Store initialized', {
        database: DB_NAME,
        collection: COLLECTION_COI_DEFINITIONS
      });

      // Seed baseline COI definitions if empty
      await this.seedBaselineCOIs();
    } catch (error) {
      logger.error('Failed to initialize MongoDB COI Definitions Store', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Seed baseline COI definitions (on clean slate only)
   * 
   * Best Practice: Minimal baseline data, auto-updated from federation
   */
  private async seedBaselineCOIs(): Promise<void> {
    try {
      const count = await this.collection!.countDocuments();
      if (count > 0) {
        logger.debug('COI definitions already seeded', { count });
        return;
      }

      const baselineCOIs: ICoiDefinition[] = [
        // US-Only (never changes)
        {
          coiId: 'US-ONLY',
          name: 'US Only',
          type: 'country-based',
          members: ['USA'],
          description: 'United States only - no foreign release',
          mutable: false,
          autoUpdate: false,
          priority: 100,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            source: 'migration'
          },
          enabled: true
        },
        // Five Eyes (static members)
        {
          coiId: 'FVEY',
          name: 'Five Eyes',
          type: 'coalition',
          members: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
          description: 'Five Eyes intelligence sharing (US, UK, Canada, Australia, New Zealand)',
          mutable: false,
          autoUpdate: false,
          priority: 90,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            source: 'migration'
          },
          enabled: true
        },
        // NATO (auto-updated from active spokes)
        {
          coiId: 'NATO',
          name: 'NATO',
          type: 'coalition',
          members: [], // Will be auto-populated from active NATO-member spokes
          description: 'North Atlantic Treaty Organization - auto-updated from active federation',
          mutable: true,
          autoUpdate: true, // Auto-update when NATO spokes join/leave
          priority: 80,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            source: 'migration'
          },
          enabled: true
        },
        // NATO-COSMIC (subset of NATO)
        {
          coiId: 'NATO-COSMIC',
          name: 'NATO COSMIC',
          type: 'coalition',
          members: [], // Auto-populated from NATO members
          description: 'NATO COSMIC TOP SECRET - auto-updated from NATO members',
          mutable: true,
          autoUpdate: true,
          priority: 85,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            source: 'migration'
          },
          enabled: true
        },
        // Program-based COIs (members assigned per-user in coi_keys)
        {
          coiId: 'Alpha',
          name: 'Project Alpha',
          type: 'program-based',
          members: [], // Per-user assignment via coi_keys collection
          description: 'Program-based COI - members assigned individually',
          mutable: true,
          autoUpdate: false,
          priority: 50,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            source: 'migration'
          },
          enabled: true
        },
        {
          coiId: 'Beta',
          name: 'Project Beta',
          type: 'program-based',
          members: [],
          description: 'Program-based COI - members assigned individually',
          mutable: true,
          autoUpdate: false,
          priority: 50,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            source: 'migration'
          },
          enabled: true
        },
        {
          coiId: 'Gamma',
          name: 'Project Gamma',
          type: 'program-based',
          members: [],
          description: 'Program-based COI - members assigned individually',
          mutable: true,
          autoUpdate: false,
          priority: 50,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            source: 'migration'
          },
          enabled: true
        }
      ];

      await this.collection!.insertMany(baselineCOIs);
      logger.info(`Seeded ${baselineCOIs.length} baseline COI definitions`, {
        coiIds: baselineCOIs.map(c => c.coiId)
      });
    } catch (error) {
      logger.warn('Failed to seed baseline COI definitions', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  /**
   * Add or update COI definition
   */
  async upsert(coi: Omit<ICoiDefinition, 'metadata'>, modifiedBy?: string): Promise<ICoiDefinition> {
    await this.ensureInitialized();

    const existing = await this.collection!.findOne({ coiId: coi.coiId });

    const doc: ICoiDefinition = {
      ...coi,
      metadata: {
        createdAt: existing?.metadata.createdAt || new Date(),
        updatedAt: new Date(),
        createdBy: existing?.metadata.createdBy,
        lastModifiedBy: modifiedBy,
        source: existing?.metadata.source || 'manual'
      }
    };

    await this.collection!.updateOne(
      { coiId: coi.coiId },
      { $set: doc },
      { upsert: true }
    );

    logger.info('COI definition upserted', {
      coiId: coi.coiId,
      type: coi.type,
      memberCount: coi.members.length,
      modifiedBy
    });

    return doc;
  }

  /**
   * Get COI definition by ID
   */
  async findById(coiId: string): Promise<ICoiDefinition | null> {
    await this.ensureInitialized();
    return this.collection!.findOne({ coiId, enabled: true });
  }

  /**
   * Get all COI definitions
   */
  async findAll(): Promise<ICoiDefinition[]> {
    await this.ensureInitialized();
    return this.collection!.find({ enabled: true }).toArray();
  }

  /**
   * Get COI definitions by type
   */
  async findByType(type: ICoiDefinition['type']): Promise<ICoiDefinition[]> {
    await this.ensureInitialized();
    return this.collection!.find({ type, enabled: true }).toArray();
  }

  /**
   * Get all country-based COIs that should auto-update from federation
   */
  async findAutoUpdateCOIs(): Promise<ICoiDefinition[]> {
    await this.ensureInitialized();
    return this.collection!.find({
      autoUpdate: true,
      enabled: true
    }).toArray();
  }

  /**
   * Update COI members (for auto-update COIs when federation changes)
   */
  async updateMembers(coiId: string, members: string[], source: 'manual' | 'federation_auto'): Promise<void> {
    await this.ensureInitialized();

    await this.collection!.updateOne(
      { coiId },
      {
        $set: {
          members,
          'metadata.updatedAt': new Date(),
          'metadata.source': source
        }
      }
    );

    logger.info('COI members updated', {
      coiId,
      memberCount: members.length,
      source
    });
  }

  /**
   * Delete COI definition
   */
  async delete(coiId: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await this.collection!.deleteOne({ coiId });
    return result.deletedCount === 1;
  }

  /**
   * Get COI membership map for OPA (format: { "coiId": ["USA", "FRA", ...] })
   */
  async getCoiMembershipMapForOpa(): Promise<Record<string, string[]>> {
    await this.ensureInitialized();
    
    const cois = await this.collection!.find({ enabled: true }).toArray();
    
    const map: Record<string, string[]> = {};
    for (const coi of cois) {
      map[coi.coiId] = coi.members;
    }

    return map;
  }

  /**
   * Update NATO COI from active federation spokes
   * Called automatically when spokes join/leave
   */
  async updateNATOFromFederation(activeSpokeCountryCodes: string[]): Promise<void> {
    await this.ensureInitialized();

    // NATO members (ISO 3166-1 alpha-3)
    const NATO_MEMBER_CODES = [
      'ALB', 'BEL', 'BGR', 'CAN', 'HRV', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
      'DEU', 'GRC', 'HUN', 'ISL', 'ITA', 'LVA', 'LTU', 'LUX', 'MNE', 'NLD',
      'MKD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE', 'TUR',
      'GBR', 'USA'
    ];

    // Intersection: Active spokes that are NATO members
    const activeNATOMembers = activeSpokeCountryCodes.filter(code =>
      NATO_MEMBER_CODES.includes(code.toUpperCase())
    );

    await this.updateMembers('NATO', activeNATOMembers, 'federation_auto');
    await this.updateMembers('NATO-COSMIC', activeNATOMembers, 'federation_auto');

    logger.info('NATO COI auto-updated from active federation', {
      totalNATOMembers: NATO_MEMBER_CODES.length,
      activeSpokeCount: activeSpokeCountryCodes.length,
      activeNATOCount: activeNATOMembers.length,
      activeNATOMembers
    });
  }

  /**
   * Shutdown (close MongoDB connection)
   */
  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.collection = null;
      this.initialized = false;
      logger.info('MongoDB COI Definitions Store shutdown');
    }
  }
}

// Export singleton
export const mongoCoiDefinitionStore = new MongoCoiDefinitionStore();

export default MongoCoiDefinitionStore;
