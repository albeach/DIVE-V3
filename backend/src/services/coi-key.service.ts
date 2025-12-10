/**
 * COI Key Management Service
 * 
 * Centralized service for managing Community of Interest (COI) Keys
 * with MongoDB persistence. Serves as single source of truth for:
 * - COI metadata (name, description, member countries)
 * - COI validation rules (mutual exclusivity, subset/superset relationships)
 * - COI encryption keys (via coi-key-registry)
 * 
 * Replaces hardcoded COI lists across frontend and backend.
 * 
 * Date: October 21, 2025
 */

import { MongoClient, Db, Collection } from 'mongodb';
import { logger } from '../utils/logger';
import { getMongoDBUrl, getMongoDBName } from '../utils/mongodb-config';
import { ICOIKey, ICreateCOIKeyRequest, IUpdateCOIKeyRequest, ICOIKeyListResponse } from '../types/coi-key.types';

const COLLECTION_NAME = 'coi_keys';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

/**
 * Get MongoDB connection (with caching)
 * BEST PRACTICE: Read MongoDB config at runtime
 */
async function getMongoClient(): Promise<{ client: MongoClient; db: Db }> {
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }

    const MONGODB_URL = getMongoDBUrl(); // Read at runtime
    const DB_NAME = getMongoDBName();

    const client = new MongoClient(MONGODB_URL);
    await client.connect();
    const db = client.db(DB_NAME);

    cachedClient = client;
    cachedDb = db;

    logger.info('Connected to MongoDB (COI Keys)', { database: DB_NAME, collection: COLLECTION_NAME });

    return { client, db };
}

/**
 * Get COI Keys collection
 */
async function getCollection(): Promise<Collection<ICOIKey>> {
    const { db } = await getMongoClient();
    return db.collection<ICOIKey>(COLLECTION_NAME);
}

/**
 * Initialize COI Keys collection with indexes
 */
export async function initializeCOIKeyCollection(): Promise<void> {
    try {
        const collection = await getCollection();

        // Create unique index on coiId
        await collection.createIndex({ coiId: 1 }, { unique: true });

        // Create index on status for filtering
        await collection.createIndex({ status: 1 });

        // Create index on memberCountries for queries
        await collection.createIndex({ memberCountries: 1 });

        logger.info('COI Keys collection initialized with indexes', { collection: COLLECTION_NAME });
    } catch (error) {
        logger.error('Failed to initialize COI Keys collection', { error });
        throw error;
    }
}

/**
 * Create a new COI Key
 */
export async function createCOIKey(request: ICreateCOIKeyRequest): Promise<ICOIKey> {
    try {
        const collection = await getCollection();

        // Check if COI already exists
        const existing = await collection.findOne({ coiId: request.coiId });
        if (existing) {
            throw new Error(`COI Key with ID '${request.coiId}' already exists`);
        }

        const now = new Date();
        const coiKey: ICOIKey = {
            coiId: request.coiId,
            name: request.name,
            description: request.description,
            memberCountries: request.memberCountries.sort(), // Sort for consistency
            status: request.status || 'active',
            color: request.color || '#6B7280', // Default gray
            icon: request.icon || '🔑',
            resourceCount: 0, // Will be computed
            algorithm: 'AES-256-GCM',
            keyVersion: 1,
            mutuallyExclusiveWith: request.mutuallyExclusiveWith,
            subsetOf: request.subsetOf,
            supersetOf: request.supersetOf,
            createdAt: now,
            updatedAt: now
        };

        await collection.insertOne(coiKey as any);

        logger.info('COI Key created', { coiId: request.coiId, memberCount: coiKey.memberCountries.length });

        return coiKey;
    } catch (error) {
        logger.error('Failed to create COI Key', { coiId: request.coiId, error });
        throw error;
    }
}

/**
 * Get all COI Keys (optionally filtered by status)
 */
export async function getAllCOIKeys(status?: 'active' | 'deprecated' | 'pending'): Promise<ICOIKeyListResponse> {
    try {
        const collection = await getCollection();

        const filter = status ? { status } : {};
        const cois = await collection.find(filter).sort({ coiId: 1 }).toArray();

        // TODO: Implement proper resource counting based on COI tags in resources
        // For now, set all counts to 0 until resource schema is updated
        for (const coi of cois) {
            coi.resourceCount = 0;
        }

        logger.debug('Retrieved COI Keys', { count: cois.length, status });

        return {
            cois: cois as ICOIKey[],
            total: cois.length
        };
    } catch (error) {
        logger.error('Failed to get COI Keys', { status, error });
        throw error;
    }
}

/**
 * Get a single COI Key by ID
 */
export async function getCOIKeyById(coiId: string): Promise<ICOIKey | null> {
    try {
        const collection = await getCollection();
        const coiKey = await collection.findOne({ coiId });

        if (coiKey) {
            // Compute resource count
            const { db } = await getMongoClient();
            const resourcesCollection = db.collection('resources');
            const count = await resourcesCollection.countDocuments({
                $or: [
                    { 'ztdf.policy.securityLabel.COI': coiId },
                    { 'legacy.COI': coiId }
                ]
            });
            coiKey.resourceCount = count;
        }

        return coiKey as ICOIKey | null;
    } catch (error) {
        logger.error('Failed to get COI Key', { coiId, error });
        throw error;
    }
}

/**
 * Update a COI Key
 */
export async function updateCOIKey(coiId: string, request: IUpdateCOIKeyRequest): Promise<ICOIKey> {
    try {
        const collection = await getCollection();

        const updateDoc: any = {
            updatedAt: new Date()
        };

        if (request.name !== undefined) updateDoc.name = request.name;
        if (request.description !== undefined) updateDoc.description = request.description;
        if (request.memberCountries !== undefined) updateDoc.memberCountries = request.memberCountries.sort();
        if (request.status !== undefined) updateDoc.status = request.status;
        if (request.color !== undefined) updateDoc.color = request.color;
        if (request.icon !== undefined) updateDoc.icon = request.icon;
        if (request.mutuallyExclusiveWith !== undefined) updateDoc.mutuallyExclusiveWith = request.mutuallyExclusiveWith;
        if (request.subsetOf !== undefined) updateDoc.subsetOf = request.subsetOf;
        if (request.supersetOf !== undefined) updateDoc.supersetOf = request.supersetOf;

        const result = await collection.findOneAndUpdate(
            { coiId },
            { $set: updateDoc },
            { returnDocument: 'after' }
        );

        if (!result) {
            throw new Error(`COI Key '${coiId}' not found`);
        }

        logger.info('COI Key updated', { coiId, updates: Object.keys(updateDoc) });

        return result as ICOIKey;
    } catch (error) {
        logger.error('Failed to update COI Key', { coiId, error });
        throw error;
    }
}

/**
 * Delete a COI Key (soft delete by setting status to deprecated)
 */
export async function deprecateCOIKey(coiId: string): Promise<void> {
    try {
        const collection = await getCollection();

        // Check if any resources use this COI
        const { db } = await getMongoClient();
        const resourcesCollection = db.collection('resources');
        const resourceCount = await resourcesCollection.countDocuments({
            $or: [
                { 'ztdf.policy.securityLabel.COI': coiId },
                { 'legacy.COI': coiId }
            ]
        });

        if (resourceCount > 0) {
            throw new Error(`Cannot deprecate COI '${coiId}': ${resourceCount} resources still use it`);
        }

        const result = await collection.updateOne(
            { coiId },
            { $set: { status: 'deprecated', updatedAt: new Date() } }
        );

        if (result.matchedCount === 0) {
            throw new Error(`COI Key '${coiId}' not found`);
        }

        logger.info('COI Key deprecated', { coiId });
    } catch (error) {
        logger.error('Failed to deprecate COI Key', { coiId, error });
        throw error;
    }
}

/**
 * Get COI membership map for validation (backwards compatibility)
 * Returns a map of coiId -> Set<country codes>
 */
export async function getCOIMembershipMap(): Promise<Record<string, Set<string>>> {
    try {
        const { cois } = await getAllCOIKeys('active');

        const membershipMap: Record<string, Set<string>> = {};
        for (const coi of cois) {
            membershipMap[coi.coiId] = new Set(coi.memberCountries);
        }

        return membershipMap;
    } catch (error) {
        logger.error('Failed to get COI membership map', { error });
        throw error;
    }
}

/**
 * Get all distinct countries used across all COIs
 */
export async function getAllCOICountries(): Promise<string[]> {
    try {
        const collection = await getCollection();

        // Get all active COIs and aggregate their member countries
        const cois = await collection.find({ status: 'active' }, { projection: { memberCountries: 1 } }).toArray();

        const countries = new Set<string>();
        for (const coi of cois) {
            coi.memberCountries.forEach((c: string) => countries.add(c));
        }

        return Array.from(countries).sort();
    } catch (error) {
        logger.error('Failed to get COI countries', { error });
        throw error;
    }
}

/**
 * Find all COIs that a specific country is a member of
 */
export async function getCOIsForCountry(countryCode: string): Promise<ICOIKey[]> {
    try {
        const collection = await getCollection();

        const cois = await collection.find({
            memberCountries: countryCode,
            status: 'active'
        }).sort({ coiId: 1 }).toArray();

        return cois as ICOIKey[];
    } catch (error) {
        logger.error('Failed to get COIs for country', { countryCode, error });
        throw error;
    }
}

/**
 * Get COI Keys statistics
 */
export async function getCOIKeyStatistics(): Promise<{
    total: number;
    active: number;
    deprecated: number;
    pending: number;
    totalCountries: number;
    totalResources: number;
}> {
    try {
        const collection = await getCollection();

        const total = await collection.countDocuments();
        const active = await collection.countDocuments({ status: 'active' });
        const deprecated = await collection.countDocuments({ status: 'deprecated' });
        const pending = await collection.countDocuments({ status: 'pending' });

        const countries = await getAllCOICountries();

        // TODO: Count total resources with COIs
        // For now, set to 0 until resource schema is properly implemented
        const totalResources = 0;

        return {
            total,
            active,
            deprecated,
            pending,
            totalCountries: countries.length,
            totalResources
        };
    } catch (error) {
        logger.error('Failed to get COI Key statistics', { error });
        throw error;
    }
}

/**
 * Close MongoDB connection (for graceful shutdown)
 */
export async function closeCOIKeyConnection(): Promise<void> {
    if (cachedClient) {
        await cachedClient.close();
        cachedClient = null;
        cachedDb = null;
        logger.info('Closed MongoDB connection (COI Keys)');
    }
}

