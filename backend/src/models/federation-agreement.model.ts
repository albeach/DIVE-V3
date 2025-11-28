/**
 * Federation Agreement Model
 * NATO Compliance: ADatP-5663 §3.10, §6.8 - Federation Agreements
 * Phase 4, Task 4.3
 * 
 * Uses native MongoDB driver (consistent with rest of codebase)
 */

import { Collection, Db, MongoClient } from 'mongodb';
import { getMongoDBUrl, getMongoDBName } from '../utils/mongodb-config';
import { logger } from '../utils/logger';

// ============================================
// Interface
// ============================================

export interface IFederationAgreement {
  spId: string;                           // Service Provider ID
  spName: string;                         // Human-readable name
  agreementId: string;                    // Unique agreement identifier
  
  // Allowed identity providers
  allowedIdPs: string[];                  // Realm IDs or aliases
  
  // Allowed countries (ISO 3166-1 alpha-3)
  allowedCountries: string[];             // ["USA", "GBR", "CAN", ...]
  
  // Allowed classification levels
  allowedClassifications: string[];       // ["UNCLASSIFIED", "CONFIDENTIAL", "SECRET"]
  maxClassification: string;              // Maximum classification
  
  // Allowed Communities of Interest
  allowedCOIs: string[];                  // ["NATO-COSMIC", "FVEY", ...]
  
  // Authentication requirements
  minAAL: number;                         // Minimum AAL (1, 2, or 3)
  maxAuthAge: number;                     // Maximum auth age (seconds)
  
  // Attribute release policy
  releaseAttributes: string[];            // Attributes to release to this SP
  
  // Agreement metadata
  effectiveDate: Date;
  expirationDate?: Date;
  status: 'active' | 'suspended' | 'expired';
  
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Database Connection
// ============================================

const COLLECTION_NAME = 'federation_agreements';
let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

async function getMongoClient(): Promise<MongoClient> {
  if (cachedClient) {
    try {
      await cachedClient.db().admin().ping();
      return cachedClient;
    } catch {
      // Connection lost, reconnect
    }
  }

  try {
    const MONGODB_URL = getMongoDBUrl();
    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    cachedClient = client;
    logger.debug('Federation agreement MongoDB connected');
    return client;
  } catch (error) {
    logger.error('Failed to connect to MongoDB for federation agreements', { error });
    throw error;
  }
}

async function getCollection(): Promise<Collection<IFederationAgreement>> {
  const client = await getMongoClient();
  const DB_NAME = getMongoDBName();
  if (!cachedDb) {
    cachedDb = client.db(DB_NAME);
  }
  return cachedDb.collection<IFederationAgreement>(COLLECTION_NAME);
}

// ============================================
// FederationAgreement Repository Class
// ============================================

export class FederationAgreement {
  /**
   * Find one agreement by filter
   */
  static async findOne(filter: Partial<IFederationAgreement>): Promise<IFederationAgreement | null> {
    try {
      const collection = await getCollection();
      return await collection.findOne(filter as any);
    } catch (error) {
      logger.error('Failed to find federation agreement', { error, filter });
      throw error;
    }
  }

  /**
   * Find all agreements matching filter
   */
  static async find(filter: Partial<IFederationAgreement> = {}): Promise<IFederationAgreement[]> {
    try {
      const collection = await getCollection();
      return await collection.find(filter as any).toArray();
    } catch (error) {
      logger.error('Failed to find federation agreements', { error, filter });
      throw error;
    }
  }

  /**
   * Create a new agreement
   */
  static async create(agreement: Omit<IFederationAgreement, 'createdAt' | 'updatedAt'>): Promise<IFederationAgreement> {
    try {
      const collection = await getCollection();
      const now = new Date();
      const doc: IFederationAgreement = {
        ...agreement,
        createdAt: now,
        updatedAt: now
      };
      
      await collection.insertOne(doc as any);
      logger.info('Federation agreement created', { spId: agreement.spId, agreementId: agreement.agreementId });
      return doc;
    } catch (error) {
      logger.error('Failed to create federation agreement', { error, spId: agreement.spId });
      throw error;
    }
  }

  /**
   * Update an agreement
   */
  static async updateOne(
    filter: Partial<IFederationAgreement>,
    update: Partial<IFederationAgreement>
  ): Promise<boolean> {
    try {
      const collection = await getCollection();
      const result = await collection.updateOne(
        filter as any,
        { 
          $set: { 
            ...update, 
            updatedAt: new Date() 
          } 
        }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      logger.error('Failed to update federation agreement', { error, filter });
      throw error;
    }
  }

  /**
   * Delete an agreement
   */
  static async deleteOne(filter: Partial<IFederationAgreement>): Promise<boolean> {
    try {
      const collection = await getCollection();
      const result = await collection.deleteOne(filter as any);
      return result.deletedCount > 0;
    } catch (error) {
      logger.error('Failed to delete federation agreement', { error, filter });
      throw error;
    }
  }

  /**
   * Check if SP has valid active agreement
   */
  static async hasActiveAgreement(spId: string): Promise<boolean> {
    const agreement = await this.findOne({ spId, status: 'active' });
    if (!agreement) return false;
    
    // Check expiration
    if (agreement.expirationDate && new Date() > agreement.expirationDate) {
      // Update status to expired
      await this.updateOne({ spId }, { status: 'expired' });
      return false;
    }
    
    return true;
  }

  /**
   * Initialize indexes
   */
  static async initializeIndexes(): Promise<void> {
    try {
      const collection = await getCollection();
      await collection.createIndex({ spId: 1 }, { unique: true });
      await collection.createIndex({ agreementId: 1 }, { unique: true });
      await collection.createIndex({ status: 1 });
      await collection.createIndex({ expirationDate: 1 });
      logger.info('Federation agreement indexes created');
    } catch (error) {
      logger.error('Failed to create federation agreement indexes', { error });
    }
  }
}

// Export for use in middleware
export default FederationAgreement;
