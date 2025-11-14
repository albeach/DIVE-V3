/**
 * Global Setup for Jest Tests
 * 
 * BEST PRACTICE: Start MongoDB Memory Server ONCE before all tests
 * 
 * Benefits:
 * - Consistent across local and CI environments
 * - No external MongoDB service needed
 * - Fast in-memory database
 * - Proper test isolation
 * - Industry standard approach
 * 
 * This runs BEFORE any test files or modules load, ensuring
 * all services use the memory server connection string.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { seedTestData } from './helpers/seed-test-data';

export default async function globalSetup() {
    console.log('🔧 Global Setup: Starting MongoDB Memory Server...');
    
    try {
        // Create MongoDB Memory Server (in-memory instance)
        const mongoServer = await MongoMemoryServer.create({
            instance: {
                dbName: 'dive-v3-test',
                port: undefined, // Random available port
            },
            binary: {
                version: '7.0.0', // Match production MongoDB version
                downloadDir: process.env.MONGODB_BINARY_CACHE || undefined,
            },
        });

        const uri = mongoServer.getUri();
        
        // Store URI and instance reference in global scope
        // (accessible in globalTeardown for cleanup)
        (global as any).__MONGO_URI__ = uri;
        (global as any).__MONGO_SERVER__ = mongoServer;
        
        // Set environment variables BEFORE any service modules load
        // All services read these env vars at import time
        process.env.MONGODB_URI = uri + 'dive-v3-test';
        process.env.MONGODB_URL = uri;
        process.env.MONGODB_DATABASE = 'dive-v3-test';

        console.log(`✅ MongoDB Memory Server started: ${uri}`);
        console.log(`   Database: dive-v3-test`);
        console.log(`   Environment: ${process.env.NODE_ENV}`);
        
        // BEST PRACTICE: Seed test data as part of infrastructure
        // This runs automatically every test run, ensuring consistent test data
        await seedTestData(uri);
        
        console.log(`   Benefit: Complete test infrastructure ready!`);
    } catch (error) {
        console.error('❌ Failed to start MongoDB Memory Server:', error);
        console.error('   This may happen if:');
        console.error('   - MongoDB binary download failed (check network)');
        console.error('   - Insufficient disk space');
        console.error('   - Port conflict (unlikely with random port)');
        throw error;
    }
}

