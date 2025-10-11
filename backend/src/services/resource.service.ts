import { MongoClient, Db, Collection } from 'mongodb';
import { logger } from '../utils/logger';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';
const COLLECTION_NAME = 'resources';

export interface IResource {
    resourceId: string;
    title: string;
    classification: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
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
    cachedDb = client.db(DB_NAME);
    return cachedDb;
}

async function getCollection(): Promise<Collection<IResource>> {
    const db = await getDatabase();
    return db.collection<IResource>(COLLECTION_NAME);
}

export async function getAllResources(): Promise<IResource[]> {
    try {
        const collection = await getCollection();
        const resources = await collection.find({}).toArray();
        return resources;
    } catch (error) {
        logger.error('Failed to fetch resources', { error });
        throw error;
    }
}

export async function getResourceById(resourceId: string): Promise<IResource | null> {
    try {
        const collection = await getCollection();
        const resource = await collection.findOne({ resourceId });
        return resource;
    } catch (error) {
        logger.error('Failed to fetch resource by ID', { error, resourceId });
        throw error;
    }
}

export async function createResource(resource: IResource): Promise<IResource> {
    try {
        const collection = await getCollection();
        const now = new Date();

        const resourceWithTimestamps = {
            ...resource,
            createdAt: now,
            updatedAt: now
        };

        await collection.insertOne(resourceWithTimestamps as any);
        logger.info('Resource created', { resourceId: resource.resourceId });

        return resourceWithTimestamps;
    } catch (error) {
        logger.error('Failed to create resource', { error, resourceId: resource.resourceId });
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

