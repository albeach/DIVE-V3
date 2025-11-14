import { getMongoDBUrl, getMongoDBName } from '../utils/mongodb-config';
import { MongoClient, Db, Collection } from 'mongodb';
import { logger } from '../utils/logger';
import { IZTDFResource, IZTDFObject } from '../types/ztdf.types';
import { validateZTDFIntegrity } from '../utils/ztdf.utils';

// MongoDB connection configured at runtime via getMongoDBUrl/getMongoDBName() helpers
const COLLECTION_NAME = 'resources';

// ============================================
// Legacy Resource Interface (backward compatibility)
// ============================================
export interface IResource {
    resourceId: string;
    title: string;
    classification: 'UNCLASSIFIED' | 'RESTRICTED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
    releasabilityTo: string[]; // ISO 3166-1 alpha-3 codes
    COI: string[];             // Communities of Interest
    creationDate?: string;     // ISO 8601 timestamp
    encrypted: boolean;
    content?: string;          // Plaintext content (if not encrypted)
    encryptedContent?: string; // Ciphertext (if encrypted)
    createdAt?: Date;
    updatedAt?: Date;
}

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

/**
 * Clear cached MongoDB connections (for testing)
 * @internal
 */
export function clearResourceServiceCache(): void {
    cachedClient = null;
    cachedDb = null;
}

async function getMongoClient(): Promise<MongoClient> {
    if (cachedClient) {
        // Try to ping to check if still connected
        try {
            await cachedClient.db().admin().ping();
            return cachedClient;
        } catch {
            // Connection lost, will reconnect below
        }
    }

    try {
        const MONGODB_URL = getMongoDBUrl(); // Read at runtime
        const client = new MongoClient(MONGODB_URL);
        await client.connect();
        cachedClient = client;
        logger.info('Connected to MongoDB');
        return client;
    } catch (error) {
        logger.error('Failed to connect to MongoDB', { error });
        throw error;
    }
}

async function getDatabase(): Promise<Db> {
    if (cachedDb) {
        return cachedDb;
    }

    const client = await getMongoClient();
    const DB_NAME = getMongoDBName(); // Read at runtime
    cachedDb = client.db(DB_NAME);
    return cachedDb;
}

async function getCollection(): Promise<Collection<IZTDFResource>> {
    const db = await getDatabase();
    return db.collection<IZTDFResource>(COLLECTION_NAME);
}

/**
 * Check if resource is ZTDF-enhanced
 */
function isZTDFResource(resource: any): resource is IZTDFResource {
    return resource && typeof resource === 'object' && 'ztdf' in resource;
}

/**
 * Extract legacy fields from ZTDF resource for backward compatibility
 */
function extractLegacyFields(ztdfResource: IZTDFResource): IResource {
    // If legacy fields are stored, use them
    if (ztdfResource.legacy) {
        return {
            resourceId: ztdfResource.resourceId,
            title: ztdfResource.title,
            classification: ztdfResource.legacy.classification,
            releasabilityTo: ztdfResource.legacy.releasabilityTo,
            COI: ztdfResource.legacy.COI,
            creationDate: ztdfResource.legacy.creationDate,
            encrypted: ztdfResource.legacy.encrypted,
            content: ztdfResource.legacy.content,
            encryptedContent: ztdfResource.legacy.encryptedContent,
            createdAt: ztdfResource.createdAt,
            updatedAt: ztdfResource.updatedAt
        };
    }

    // Otherwise, extract from ZTDF structure
    const { ztdf } = ztdfResource;
    return {
        resourceId: ztdfResource.resourceId,
        title: ztdfResource.title,
        classification: ztdf.policy.securityLabel.classification,
        releasabilityTo: ztdf.policy.securityLabel.releasabilityTo,
        COI: ztdf.policy.securityLabel.COI || [],
        creationDate: ztdf.policy.securityLabel.creationDate,
        encrypted: true, // ZTDF is always encrypted
        content: undefined, // ZTDF content is encrypted
        encryptedContent: ztdf.payload.encryptedChunks[0]?.encryptedData,
        createdAt: ztdfResource.createdAt,
        updatedAt: ztdfResource.updatedAt
    };
}

/**
 * Get all resources
 * Returns ZTDF-enhanced resources with backward compatibility
 */
export async function getAllResources(): Promise<IZTDFResource[]> {
    try {
        const collection = await getCollection();
        const resources = await collection.find({}).toArray();

        // Validate ZTDF integrity for all resources
        for (const resource of resources) {
            if (isZTDFResource(resource)) {
                const validation = await validateZTDFIntegrity(resource.ztdf);
                if (!validation.valid) {
                    logger.error('ZTDF integrity validation failed', {
                        resourceId: resource.resourceId,
                        errors: validation.errors
                    });
                    // Fail-closed: Log but return resource with warning flag
                    // In production, you might want to exclude this resource
                }

                if (validation.warnings.length > 0) {
                    logger.warn('ZTDF validation warnings', {
                        resourceId: resource.resourceId,
                        warnings: validation.warnings
                    });
                }
            }
        }

        return resources;
    } catch (error) {
        logger.error('Failed to fetch resources', { error });
        throw error;
    }
}

/**
 * Get all resources in legacy format (backward compatibility)
 */
export async function getAllResourcesLegacy(): Promise<IResource[]> {
    try {
        const ztdfResources = await getAllResources();
        return ztdfResources.map(r => extractLegacyFields(r));
    } catch (error) {
        logger.error('Failed to fetch resources in legacy format', { error });
        throw error;
    }
}

/**
 * Get resource by ID
 * Returns ZTDF-enhanced resource with integrity validation
 */
export async function getResourceById(resourceId: string): Promise<IZTDFResource | null> {
    try {
        const collection = await getCollection();
        const resource = await collection.findOne({ resourceId });

        if (!resource) {
            return null;
        }

        // Validate ZTDF integrity (fail-closed)
        if (isZTDFResource(resource)) {
            const validation = await validateZTDFIntegrity(resource.ztdf);

            if (!validation.valid) {
                logger.error('ZTDF integrity validation failed', {
                    resourceId: resource.resourceId,
                    errors: validation.errors
                });

                // ACP-240: Fail-closed enforcement
                // DO NOT decrypt if integrity check fails
                throw new Error(`ZTDF integrity validation failed: ${validation.errors.join(', ')}`);
            }

            if (validation.warnings.length > 0) {
                logger.warn('ZTDF validation warnings', {
                    resourceId: resource.resourceId,
                    warnings: validation.warnings
                });
            }
        }

        return resource;
    } catch (error) {
        logger.error('Failed to fetch resource by ID', { error, resourceId });
        throw error;
    }
}

/**
 * Get resource by ID in legacy format (backward compatibility)
 */
export async function getResourceByIdLegacy(resourceId: string): Promise<IResource | null> {
    try {
        const ztdfResource = await getResourceById(resourceId);
        if (!ztdfResource) {
            return null;
        }
        return extractLegacyFields(ztdfResource);
    } catch (error) {
        logger.error('Failed to fetch resource by ID in legacy format', { error, resourceId });
        throw error;
    }
}

/**
 * Create ZTDF-enhanced resource
 */
export async function createZTDFResource(resource: IZTDFResource): Promise<IZTDFResource> {
    try {
        const collection = await getCollection();
        const now = new Date();

        // Validate ZTDF integrity before storing
        const validation = await validateZTDFIntegrity(resource.ztdf);
        if (!validation.valid) {
            throw new Error(`ZTDF integrity validation failed: ${validation.errors.join(', ')}`);
        }

        const resourceWithTimestamps = {
            ...resource,
            createdAt: now,
            updatedAt: now
        };

        await collection.insertOne(resourceWithTimestamps as any);
        logger.info('ZTDF resource created', {
            resourceId: resource.resourceId,
            classification: resource.ztdf.policy.securityLabel.classification,
            displayMarking: resource.ztdf.policy.securityLabel.displayMarking
        });

        return resourceWithTimestamps;
    } catch (error) {
        logger.error('Failed to create ZTDF resource', { error, resourceId: resource.resourceId });
        throw error;
    }
}

/**
 * Create resource in legacy format (backward compatibility)
 * Converts to ZTDF internally
 */
export async function createResource(resource: IResource): Promise<IResource> {
    try {
        const { migrateLegacyResourceToZTDF } = await import('../utils/ztdf.utils');

        const ztdfObject = migrateLegacyResourceToZTDF(resource);
        const ztdfResource: IZTDFResource = {
            resourceId: resource.resourceId,
            title: resource.title,
            ztdf: ztdfObject,
            legacy: {
                classification: resource.classification,
                releasabilityTo: resource.releasabilityTo,
                COI: resource.COI,
                creationDate: resource.creationDate,
                encrypted: resource.encrypted,
                content: resource.content,
                encryptedContent: resource.encryptedContent
            },
            createdAt: resource.createdAt,
            updatedAt: resource.updatedAt
        };

        await createZTDFResource(ztdfResource);
        logger.info('Legacy resource converted to ZTDF and created', { resourceId: resource.resourceId });

        return resource;
    } catch (error) {
        logger.error('Failed to create resource', { error, resourceId: resource.resourceId });
        throw error;
    }
}

/**
 * Get ZTDF object from resource (for KAS integration)
 */
export async function getZTDFObject(resourceId: string): Promise<IZTDFObject | null> {
    try {
        const resource = await getResourceById(resourceId);
        if (!resource) {
            return null;
        }

        if (!isZTDFResource(resource)) {
            logger.warn('Resource is not ZTDF-enhanced', { resourceId });
            return null;
        }

        return resource.ztdf;
    } catch (error) {
        logger.error('Failed to get ZTDF object', { error, resourceId });
        throw error;
    }
}

/**
 * Query resources with flexible criteria (for federation)
 */
export async function getResourcesByQuery(
    query: any, 
    options?: { 
        limit?: number; 
        offset?: number; 
        fields?: any;
    }
): Promise<any[]> {
    const client = await getMongoClient();
    const DB_NAME = getMongoDBName(); // Read at runtime
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    try {
        // Default options
        const limit = options?.limit || 100;
        const offset = options?.offset || 0;
        const projection = options?.fields || {};

        // Build MongoDB query
        const mongoQuery: any = {};
        
        // Handle resourceId queries (single or array)
        if (query.resourceId) {
            if (typeof query.resourceId === 'string') {
                mongoQuery.resourceId = query.resourceId;
            } else if (query.resourceId.$in) {
                mongoQuery.resourceId = { $in: query.resourceId.$in };
            }
        }

        // Handle classification
        if (query.classification) {
            mongoQuery['ztdf.policy.securityLabel.classification'] = query.classification;
        }

        // Handle releasabilityTo
        if (query.releasabilityTo) {
            mongoQuery['ztdf.policy.securityLabel.releasabilityTo'] = query.releasabilityTo;
        }

        // Handle COI
        if (query.COI) {
            mongoQuery['ztdf.policy.securityLabel.COI'] = query.COI;
        }

        // Handle text search
        if (query.$text) {
            mongoQuery.$text = query.$text;
        }

        logger.debug('Executing resource query', {
            query: mongoQuery,
            limit,
            offset,
            projection
        });

        // Execute query
        const cursor = collection
            .find(mongoQuery)
            .project(projection)
            .skip(offset)
            .limit(limit);

        const resources = await cursor.toArray();

        // Transform ZTDF resources to simplified format for federation
        return resources.map(resource => {
            if (isZTDFResource(resource)) {
                return {
                    resourceId: resource.resourceId,
                    title: resource.title,
                    classification: resource.ztdf.policy.securityLabel.classification,
                    releasabilityTo: resource.ztdf.policy.securityLabel.releasabilityTo,
                    COI: resource.ztdf.policy.securityLabel.COI || [],
                    creationDate: resource.ztdf.policy.securityLabel.creationDate,
                    encrypted: true
                };
            }
            // Legacy resource format
            return resource;
        });

    } catch (error) {
        logger.error('Resource query failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            query
        });
        throw error;
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    if (cachedClient) {
        await cachedClient.close();
        logger.info('MongoDB connection closed');
    }
    process.exit(0);
});

