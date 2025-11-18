/**
 * Jest Global Teardown
 * 
 * Ensures all MongoDB connections and async operations are properly closed
 * after all tests complete, preventing "force exit" warnings.
 * Also stops MongoDB Memory Server if running.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { closeAuditLogConnection } from '../utils/acp240-logger';
import { closeCOIKeyConnection } from '../services/coi-key.service';
import { closeRedisConnection } from '../services/token-blacklist.service';

export default async function globalTeardown() {
    console.log('🔧 Starting global teardown...');

    try {
        // Close ACP-240 logger MongoDB connection
        await closeAuditLogConnection();
        console.log('  ✓ ACP-240 logger connection closed');
    } catch (error) {
        // Ignore errors if connection wasn't established
    }

    try {
        // Close COI Key Service MongoDB connection
        await closeCOIKeyConnection();
        console.log('  ✓ COI Key Service connection closed');
    } catch (error) {
        // Ignore errors if connection wasn't established
    }

    try {
        // Close Redis connection from token blacklist service
        await closeRedisConnection();
        console.log('  ✓ Redis connection closed');
    } catch (error) {
        // Ignore errors if connection wasn't established
    }

    try {
        // Stop MongoDB Memory Server if it exists
        const mongoServer = (global as any).__MONGO_SERVER__ as MongoMemoryServer | undefined;
        
        if (mongoServer) {
            await mongoServer.stop({ doCleanup: true, force: true });
            console.log('  ✓ MongoDB Memory Server stopped');
        }
    } catch (error) {
        console.error('  ⚠️ Error stopping MongoDB Memory Server:', error);
    }

    try {
        // Force garbage collection if available (helps clean up dangling references)
        if (global.gc) {
            global.gc();
            console.log('  ✓ Garbage collection triggered');
        }
    } catch (error) {
        // GC not available, ignore
    }

    // Give MongoDB driver time to clean up internal connections
    // MongoDB NodeJS driver uses connection pooling which takes time to fully close
    // Best practice: Allow sufficient time for graceful shutdown
    const delay = process.env.CI ? 1000 : 500;
    await new Promise(resolve => setTimeout(resolve, delay));

    console.log('✅ Global teardown complete - all connections closed');
    
    // Clear the global mongo server reference
    delete (global as any).__MONGO_SERVER__;
}

