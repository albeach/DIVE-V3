/**
 * MongoDB Memory Server Helper for Unit Tests
 * 
 * Provides an in-memory MongoDB instance for testing without external database.
 * Uses mongodb-memory-server for fast, isolated unit tests.
 * 
 * Usage:
 * ```typescript
 * import { setupMongoMemoryServer, teardownMongoMemoryServer } from './helpers/mongodb-memory-server.helper';
 * 
 * describe('My Test', () => {
 *   beforeAll(async () => {
 *     await setupMongoMemoryServer();
 *   });
 * 
 *   afterAll(async () => {
 *     await teardownMongoMemoryServer();
 *   });
 * });
 * ```
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';

/**
 * Global MongoDB Memory Server instance
 */
let mongoServer: MongoMemoryServer | null = null;
let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;

/**
 * Setup MongoDB Memory Server for testing
 * 
 * Creates an in-memory MongoDB instance and updates environment variables
 * so all code using process.env.MONGODB_URI connects to test database.
 * 
 * @returns Connection URI for the memory server
 */
export async function setupMongoMemoryServer(): Promise<string> {
    try {
        // Start MongoDB Memory Server
        console.log('🔧 Starting MongoDB Memory Server...');
        mongoServer = await MongoMemoryServer.create({
            instance: {
                dbName: 'dive-v3-test',
                port: undefined, // Use random available port
            },
            binary: {
                version: '7.0.0', // Match production MongoDB version
            },
        });

        const uri = mongoServer.getUri();
        
        // Update environment variables so all code uses the memory server
        process.env.MONGODB_URI = uri + 'dive-v3-test';
        process.env.MONGODB_URL = uri;
        process.env.MONGODB_DATABASE = 'dive-v3-test';

        console.log(`✅ MongoDB Memory Server started: ${uri}`);
        
        // Connect client for helper operations
        mongoClient = new MongoClient(uri);
        await mongoClient.connect();
        mongoDb = mongoClient.db('dive-v3-test');

        return uri;
    } catch (error) {
        console.error('❌ Failed to start MongoDB Memory Server:', error);
        throw error;
    }
}

/**
 * Teardown MongoDB Memory Server
 * 
 * Closes connections and stops the memory server.
 */
export async function teardownMongoMemoryServer(): Promise<void> {
    try {
        // Close client connection
        if (mongoClient) {
            await mongoClient.close();
            mongoClient = null;
            mongoDb = null;
        }

        // Stop memory server
        if (mongoServer) {
            await mongoServer.stop();
            mongoServer = null;
            console.log('✅ MongoDB Memory Server stopped');
        }
    } catch (error) {
        console.error('❌ Error stopping MongoDB Memory Server:', error);
        throw error;
    }
}

/**
 * Get database instance (for direct access if needed)
 */
export function getMemoryDb(): Db {
    if (!mongoDb) {
        throw new Error('MongoDB Memory Server not initialized. Call setupMongoMemoryServer() first.');
    }
    return mongoDb;
}

/**
 * Clear all collections in the test database
 * Useful for test isolation (call in beforeEach)
 */
export async function clearMemoryDatabase(): Promise<void> {
    if (!mongoDb) {
        return;
    }

    try {
        const collections = await mongoDb.listCollections().toArray();
        
        for (const collection of collections) {
            await mongoDb.collection(collection.name).deleteMany({});
        }
        
        console.log(`🧹 Cleared ${collections.length} collections`);
    } catch (error) {
        console.error('Error clearing database:', error);
    }
}

/**
 * Get MongoDB Memory Server connection URI
 */
export function getMongoMemoryUri(): string {
    if (!mongoServer) {
        throw new Error('MongoDB Memory Server not initialized');
    }
    return mongoServer.getUri();
}

/**
 * Check if MongoDB Memory Server is running
 */
export function isMongoMemoryServerRunning(): boolean {
    return mongoServer !== null && mongoDb !== null;
}

