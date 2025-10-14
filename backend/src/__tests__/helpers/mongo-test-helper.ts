/**
 * MongoDB Test Helper
 * Utilities for MongoDB testing with memory server
 */

import { MongoClient, Db, Collection } from 'mongodb';
import { IZTDFResource } from '../../types/ztdf.types';
import { TEST_RESOURCES } from './test-fixtures';

/**
 * MongoDB Test Helper Class
 * Manages test database lifecycle
 */
export class MongoTestHelper {
    private client: MongoClient | null = null;
    private db: Db | null = null;
    private connectionString: string;

    constructor(connectionString?: string) {
        this.connectionString = connectionString || process.env.MONGODB_URI || 'mongodb://localhost:27017/dive-v3-test';
    }

    /**
     * Connect to MongoDB
     */
    async connect(): Promise<void> {
        if (this.client) {
            return; // Already connected
        }

        try {
            this.client = new MongoClient(this.connectionString);
            await this.client.connect();
            this.db = this.client.db();
            console.log('MongoDB test helper connected');
        } catch (error) {
            console.error('Failed to connect to MongoDB:', error);
            throw error;
        }
    }

    /**
     * Disconnect from MongoDB
     */
    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.db = null;
            console.log('MongoDB test helper disconnected');
        }
    }

    /**
     * Get database instance
     */
    getDb(): Db {
        if (!this.db) {
            throw new Error('MongoDB not connected. Call connect() first.');
        }
        return this.db;
    }

    /**
     * Get resources collection
     */
    getResourcesCollection(): Collection<IZTDFResource> {
        return this.getDb().collection<IZTDFResource>('resources');
    }

    /**
     * Clear all data from the database
     */
    async clearDatabase(): Promise<void> {
        if (!this.db) {
            return;
        }

        const collections = await this.db.listCollections().toArray();
        for (const collection of collections) {
            await this.db.collection(collection.name).deleteMany({});
        }
        console.log('Database cleared');
    }

    /**
     * Seed test resources into the database
     */
    async seedResources(): Promise<void> {
        const collection = this.getResourcesCollection();

        const resources = Object.values(TEST_RESOURCES);

        // Clear existing resources first
        await collection.deleteMany({});

        // Insert test resources
        await collection.insertMany(resources as any[]);

        console.log(`Seeded ${resources.length} test resources`);
    }

    /**
     * Insert a single resource
     */
    async insertResource(resource: IZTDFResource): Promise<void> {
        const collection = this.getResourcesCollection();
        await collection.insertOne(resource as any);
    }

    /**
     * Find resource by ID
     */
    async findResourceById(resourceId: string): Promise<IZTDFResource | null> {
        const collection = this.getResourcesCollection();
        return await collection.findOne({ resourceId });
    }

    /**
     * Count resources in collection
     */
    async countResources(): Promise<number> {
        const collection = this.getResourcesCollection();
        return await collection.countDocuments();
    }

    /**
     * Create indexes for performance
     */
    async createIndexes(): Promise<void> {
        const collection = this.getResourcesCollection();

        await collection.createIndex({ resourceId: 1 }, { unique: true });
        await collection.createIndex({ 'ztdf.policy.securityLabel.classification': 1 });
        await collection.createIndex({ 'ztdf.policy.securityLabel.releasabilityTo': 1 });

        console.log('Indexes created');
    }

    /**
     * Drop all indexes
     */
    async dropIndexes(): Promise<void> {
        const collection = this.getResourcesCollection();
        await collection.dropIndexes();
        console.log('Indexes dropped');
    }

    /**
     * Get MongoDB connection URI
     */
    getConnectionString(): string {
        return this.connectionString;
    }
}

/**
 * Global test helper instance
 */
let globalHelper: MongoTestHelper | null = null;

/**
 * Get or create global MongoDB test helper
 */
export function getMongoTestHelper(): MongoTestHelper {
    if (!globalHelper) {
        globalHelper = new MongoTestHelper();
    }
    return globalHelper;
}

/**
 * Setup MongoDB for tests (call in beforeAll)
 */
export async function setupMongoDB(): Promise<MongoTestHelper> {
    const helper = getMongoTestHelper();
    await helper.connect();
    await helper.clearDatabase();
    return helper;
}

/**
 * Teardown MongoDB for tests (call in afterAll)
 */
export async function teardownMongoDB(): Promise<void> {
    const helper = getMongoTestHelper();
    await helper.clearDatabase();
    await helper.disconnect();
    globalHelper = null;
}

