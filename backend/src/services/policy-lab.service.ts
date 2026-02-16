/**
 * Policies Lab Service
 *
 * MEMORY LEAK FIX (2026-02-16): Refactored to use MongoDB singleton
 * OLD: Created new MongoClient() with connection caching (connection leak)
 * NEW: Uses shared singleton connection pool via getDb()
 * IMPACT: Prevents connection leaks during policy upload/management operations
 *
 * Service for managing user-uploaded policies in the Policies Lab.
 * Handles storage, retrieval, and metadata management for both Rego and XACML policies.
 *
 * Date: October 26, 2025
 */

import { Collection } from 'mongodb';
import { logger } from '../utils/logger';
import { getDb } from '../utils/mongodb-singleton';
import { IPolicyUpload } from '../types/policies-lab.types';

const COLLECTION_NAME = 'policy_uploads';

/**
 * Get policy uploads collection
 */
function getCollection(): Collection<IPolicyUpload> {
    const db = getDb();
    return db.collection<IPolicyUpload>(COLLECTION_NAME);
}

/**
 * Initialize collection with indexes
 */
export async function initializePolicyLabCollection(): Promise<void> {
    try {
        const collection = getCollection();

        // Create indexes for efficient querying
        await collection.createIndex({ policyId: 1 }, { unique: true });
        await collection.createIndex({ ownerId: 1 });
        await collection.createIndex({ type: 1 });
        await collection.createIndex({ 'metadata.packageOrPolicyId': 1 });
        await collection.createIndex({ createdAt: -1 });
        await collection.createIndex({ hash: 1 });

        logger.info('Policy uploads collection initialized with indexes');
    } catch (error) {
        logger.error('Failed to initialize policy uploads collection', { error });
        throw error;
    }
}

/**
 * Save a policy upload to the database
 */
export async function savePolicyUpload(policy: IPolicyUpload): Promise<void> {
    try {
        const collection = getCollection();
        await collection.insertOne(policy);
        logger.debug('Policy upload saved', { policyId: policy.policyId, type: policy.type, ownerId: policy.ownerId });
    } catch (error) {
        logger.error('Failed to save policy upload', { policyId: policy.policyId, error });
        throw new Error('Failed to save policy to database');
    }
}

/**
 * Get a policy by ID
 */
export async function getPolicyById(policyId: string, ownerId?: string): Promise<IPolicyUpload | null> {
    try {
        const collection = getCollection();
        const filter: Record<string, unknown> = { policyId };

        // If ownerId provided, enforce ownership
        if (ownerId) {
            filter.ownerId = ownerId;
        }

        const policy = await collection.findOne(filter);
        return policy;
    } catch (error) {
        logger.error('Failed to get policy by ID', { policyId, error });
        throw new Error('Failed to retrieve policy');
    }
}

/**
 * Get all policies for a user
 */
export async function getPoliciesByOwner(ownerId: string, limit: number = 50): Promise<IPolicyUpload[]> {
    try {
        const collection = getCollection();
        const policies = await collection
            .find({ ownerId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .toArray();

        return policies;
    } catch (error) {
        logger.error('Failed to get policies by owner', { ownerId, error });
        throw new Error('Failed to retrieve policies');
    }
}

/**
 * Count policies by owner
 */
export async function countPoliciesByOwner(ownerId: string): Promise<number> {
    try {
        const collection = getCollection();
        return await collection.countDocuments({ ownerId });
    } catch (error) {
        logger.error('Failed to count policies by owner', { ownerId, error });
        throw new Error('Failed to count policies');
    }
}

/**
 * Delete a policy by ID (with ownership check)
 */
export async function deletePolicyById(policyId: string, ownerId: string): Promise<boolean> {
    try {
        const collection = getCollection();
        const result = await collection.deleteOne({ policyId, ownerId });

        if (result.deletedCount === 0) {
            logger.warn('Policy not found or unauthorized delete attempt', { policyId, ownerId });
            return false;
        }

        logger.info('Policy deleted', { policyId, ownerId });
        return true;
    } catch (error) {
        logger.error('Failed to delete policy', { policyId, ownerId, error });
        throw new Error('Failed to delete policy');
    }
}

/**
 * Update policy metadata
 */
export async function updatePolicyMetadata(
    policyId: string,
    ownerId: string,
    updates: Partial<IPolicyUpload>
): Promise<boolean> {
    try {
        const collection = getCollection();
        const result = await collection.updateOne(
            { policyId, ownerId },
            {
                $set: {
                    ...updates,
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            logger.warn('Policy not found for update', { policyId, ownerId });
            return false;
        }

        logger.debug('Policy metadata updated', { policyId, ownerId });
        return true;
    } catch (error) {
        logger.error('Failed to update policy metadata', { policyId, ownerId, error });
        throw new Error('Failed to update policy');
    }
}

/**
 * Check if a policy hash already exists (duplicate detection)
 */
export async function policyHashExists(hash: string, ownerId: string): Promise<boolean> {
    try {
        const collection = getCollection();
        const count = await collection.countDocuments({ hash, ownerId });
        return count > 0;
    } catch (error) {
        logger.error('Failed to check policy hash', { hash, ownerId, error });
        return false;
    }
}

/**
 * Get policy statistics for admin/monitoring
 */
export async function getPolicyStats(): Promise<{
    totalPolicies: number;
    regoCount: number;
    xacmlCount: number;
    validatedCount: number;
    totalUsers: number;
}> {
    try {
        const collection = getCollection();

        const [totalPolicies, regoCount, xacmlCount, validatedCount] = await Promise.all([
            collection.countDocuments({}),
            collection.countDocuments({ type: 'rego' }),
            collection.countDocuments({ type: 'xacml' }),
            collection.countDocuments({ validated: true }),
        ]);

        // Get unique owner count
        const uniqueOwners = await collection.distinct('ownerId');
        const totalUsers = uniqueOwners.length;

        return {
            totalPolicies,
            regoCount,
            xacmlCount,
            validatedCount,
            totalUsers
        };
    } catch (error) {
        logger.error('Failed to get policy stats', { error });
        throw new Error('Failed to retrieve policy statistics');
    }
}

/**
 * @deprecated No longer needed with singleton - kept for test compatibility
 */
export function clearPolicyLabCache(): void {
    // No-op: Singleton pattern doesn't use per-service caching
}
