/**
 * Federation Constraint Model
 *
 * Stores bilateral access constraints between tenants for spoke↔spoke federation.
 * Implements data-driven tenant policy overlays with hub↔spoke protection.
 *
 * NATO Compliance: ADatP-5663 §3.10, §6.8 - Federation Constraints
 * Phase 2, Task 1.1
 *
 * Uses native MongoDB driver (consistent with rest of codebase)
 */

import { Collection, Db, MongoClient } from 'mongodb';
import { getMongoDBUrl, getMongoDBName } from '../utils/mongodb-config';
import { logger } from '../utils/logger';
import { connectToMongoDBWithRetry } from '../utils/mongodb-connection';

// ============================================
// Interface
// ============================================

export interface IFederationConstraint {
  // Identity
  ownerTenant: string;                      // Resource owner (e.g., "FRA")
  partnerTenant: string;                    // Accessing partner (e.g., "DEU")
  relationshipType: 'spoke_spoke' | 'hub_spoke';  // CRITICAL for hub protection

  // Classification constraints
  maxClassification: string;                // "UNCLASSIFIED" | "CONFIDENTIAL" | "SECRET" | "TOP_SECRET"

  // COI constraints
  allowedCOIs: string[];                    // Whitelist (empty = no restriction)
  deniedCOIs: string[];                     // Blacklist (deny always wins)
  coiOperator: 'ALL' | 'ANY';               // How to evaluate multiple COIs

  // Resource tag constraints (future extension)
  allowedResourceTags?: string[];
  deniedResourceTags?: string[];

  // Purpose constraints (future extension)
  allowedPurposes?: string[];               // E.g., ["TRAINING", "OPERATIONAL"]

  // Temporal constraints
  effectiveDate: Date;
  expirationDate?: Date;

  // Audit trail
  createdBy: string;                        // User who created (uniqueID)
  createdAt: Date;
  modifiedBy: string;                       // User who last modified
  modifiedAt: Date;

  // Lifecycle
  status: 'active' | 'suspended' | 'expired';
  suspensionReason?: string;

  // Metadata
  description?: string;
  rationale?: string;                       // Why this constraint exists (audit)
}

// ============================================
// Database Connection
// ============================================

const COLLECTION_NAME = 'federation_constraints';
let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

async function getMongoClient(): Promise<MongoClient> {
  if (cachedClient) {
    try {
      await cachedClient.db().admin().ping();
      return cachedClient;
    } catch {
      // Connection lost, reconnect
      cachedClient = null;
    }
  }

  try {
    const MONGODB_URL = getMongoDBUrl();
    // Use production-grade retry logic for replica set initialization
    const client = await connectToMongoDBWithRetry(MONGODB_URL);
    cachedClient = client;
    logger.debug('Federation constraints MongoDB connected');
    return client;
  } catch (error) {
    logger.error('Failed to connect to MongoDB for federation constraints', { error });
    throw error;
  }
}

async function getCollection(): Promise<Collection<IFederationConstraint>> {
  const client = await getMongoClient();
  const DB_NAME = getMongoDBName();
  if (!cachedDb) {
    cachedDb = client.db(DB_NAME);
  }
  return cachedDb.collection<IFederationConstraint>(COLLECTION_NAME);
}

// ============================================
// FederationConstraint Repository Class
// ============================================

export class FederationConstraint {
  /**
   * Find one constraint by filter
   */
  static async findOne(filter: Partial<IFederationConstraint>): Promise<IFederationConstraint | null> {
    try {
      const collection = await getCollection();
      return await collection.findOne(filter as any);
    } catch (error) {
      logger.error('Failed to find federation constraint', { error, filter });
      throw error;
    }
  }

  /**
   * Find all constraints matching filter
   */
  static async find(filter: Partial<IFederationConstraint> = {}): Promise<IFederationConstraint[]> {
    try {
      const collection = await getCollection();
      return await collection.find(filter as any).toArray();
    } catch (error) {
      logger.error('Failed to find federation constraints', { error, filter });
      throw error;
    }
  }

  /**
   * Create a new constraint
   */
  static async create(constraint: Omit<IFederationConstraint, 'createdAt' | 'modifiedAt'>): Promise<IFederationConstraint> {
    try {
      // Validation: Cannot have same tenant as owner and partner
      if (constraint.ownerTenant === constraint.partnerTenant) {
        throw new Error('Owner and partner tenants cannot be the same');
      }

      const collection = await getCollection();
      const now = new Date();
      const doc: IFederationConstraint = {
        ...constraint,
        createdAt: now,
        modifiedAt: now,
      };

      await collection.insertOne(doc as any);
      logger.info('Federation constraint created', {
        ownerTenant: constraint.ownerTenant,
        partnerTenant: constraint.partnerTenant,
        relationshipType: constraint.relationshipType,
        createdBy: constraint.createdBy,
      });
      return doc;
    } catch (error) {
      // Check for duplicate key error
      if (error instanceof Error && error.message.includes('E11000')) {
        throw new Error(`Constraint already exists for ${constraint.ownerTenant}→${constraint.partnerTenant}`);
      }
      logger.error('Failed to create federation constraint', { error, constraint });
      throw error;
    }
  }

  /**
   * Update a constraint
   */
  static async updateOne(
    filter: Partial<IFederationConstraint>,
    update: Partial<IFederationConstraint>
  ): Promise<boolean> {
    try {
      const collection = await getCollection();
      const result = await collection.updateOne(
        filter as any,
        {
          $set: {
            ...update,
            modifiedAt: new Date(),
          },
        }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      logger.error('Failed to update federation constraint', { error, filter });
      throw error;
    }
  }

  /**
   * Soft delete a constraint (set status to suspended)
   */
  static async softDelete(
    ownerTenant: string,
    partnerTenant: string,
    reason: string,
    modifiedBy: string
  ): Promise<boolean> {
    try {
      return await this.updateOne(
        { ownerTenant, partnerTenant },
        {
          status: 'suspended',
          suspensionReason: reason,
          modifiedBy,
        }
      );
    } catch (error) {
      logger.error('Failed to soft delete federation constraint', { error, ownerTenant, partnerTenant });
      throw error;
    }
  }

  /**
   * Hard delete a constraint (permanent removal)
   */
  static async deleteOne(filter: Partial<IFederationConstraint>): Promise<boolean> {
    try {
      const collection = await getCollection();
      const result = await collection.deleteOne(filter as any);
      return result.deletedCount > 0;
    } catch (error) {
      logger.error('Failed to delete federation constraint', { error, filter });
      throw error;
    }
  }

  /**
   * Get active constraints for OPAL distribution (nested structure)
   */
  static async getActiveConstraintsForOPAL(): Promise<Record<string, any>> {
    try {
      const constraints = await this.find({ status: 'active' });

      // Transform to nested structure: constraints[owner][partner] = {...}
      const matrix: Record<string, Record<string, any>> = {};

      for (const c of constraints) {
        // Check expiration
        if (c.expirationDate && new Date() > c.expirationDate) {
          // Auto-expire (update in background, don't block response)
          this.updateOne(
            { ownerTenant: c.ownerTenant, partnerTenant: c.partnerTenant },
            { status: 'expired' }
          ).catch((err) => logger.error('Failed to auto-expire constraint', { error: err, constraint: c }));
          continue; // Skip expired
        }

        if (!matrix[c.ownerTenant]) {
          matrix[c.ownerTenant] = {};
        }

        matrix[c.ownerTenant][c.partnerTenant] = {
          maxClassification: c.maxClassification,
          allowedCOIs: c.allowedCOIs,
          deniedCOIs: c.deniedCOIs,
          coiOperator: c.coiOperator,
          relationshipType: c.relationshipType,
          effectiveDate: c.effectiveDate,
          expirationDate: c.expirationDate,
          modifiedBy: c.modifiedBy,  // CRITICAL: For OPA guardrail checks
        };
      }

      return matrix;
    } catch (error) {
      logger.error('Failed to get active constraints for OPAL', { error });
      throw error;
    }
  }

  /**
   * Initialize indexes
   */
  static async initializeIndexes(): Promise<void> {
    try {
      const collection = await getCollection();

      // Compound unique index for owner-partner pair
      await collection.createIndex(
        { ownerTenant: 1, partnerTenant: 1 },
        { unique: true, name: 'idx_owner_partner_unique' }
      );

      // Index for efficient status+date queries
      await collection.createIndex(
        { status: 1, effectiveDate: 1 },
        { name: 'idx_status_effective' }
      );

      // Index for relationship type (hub protection queries)
      await collection.createIndex(
        { relationshipType: 1 },
        { name: 'idx_relationship_type' }
      );

      // Sparse index for expiration date (only for constraints with expiration)
      await collection.createIndex(
        { expirationDate: 1 },
        { sparse: true, name: 'idx_expiration' }
      );

      // Index for tenant-scoped queries
      await collection.createIndex(
        { ownerTenant: 1, status: 1 },
        { name: 'idx_owner_status' }
      );

      logger.info('Federation constraint indexes created successfully');
    } catch (error) {
      logger.error('Failed to create federation constraint indexes', { error });
      // Don't throw - indexes are optimization, not critical for functionality
    }
  }

  /**
   * Count constraints by filter
   */
  static async count(filter: Partial<IFederationConstraint> = {}): Promise<number> {
    try {
      const collection = await getCollection();
      return await collection.countDocuments(filter as any);
    } catch (error) {
      logger.error('Failed to count federation constraints', { error, filter });
      throw error;
    }
  }

  /**
   * Get all hub↔spoke constraints (for governance checks)
   */
  static async getHubSpokeConstraints(): Promise<IFederationConstraint[]> {
    return await this.find({ relationshipType: 'hub_spoke', status: 'active' });
  }

  /**
   * Get constraints for a specific tenant (outbound)
   */
  static async getOutboundConstraints(ownerTenant: string): Promise<IFederationConstraint[]> {
    return await this.find({ ownerTenant: ownerTenant.toUpperCase(), status: 'active' });
  }

  /**
   * Get constraints for a specific tenant (inbound)
   */
  static async getInboundConstraints(partnerTenant: string): Promise<IFederationConstraint[]> {
    return await this.find({ partnerTenant: partnerTenant.toUpperCase(), status: 'active' });
  }

  /**
   * Get bilateral constraint (both directions)
   */
  static async getBilateralConstraints(
    tenantA: string,
    tenantB: string
  ): Promise<{ outbound: IFederationConstraint | null; inbound: IFederationConstraint | null }> {
    const [outbound, inbound] = await Promise.all([
      this.findOne({
        ownerTenant: tenantA.toUpperCase(),
        partnerTenant: tenantB.toUpperCase(),
        status: 'active',
      }),
      this.findOne({
        ownerTenant: tenantB.toUpperCase(),
        partnerTenant: tenantA.toUpperCase(),
        status: 'active',
      }),
    ]);

    return { outbound, inbound };
  }
}

// Export for use in controllers
export default FederationConstraint;
