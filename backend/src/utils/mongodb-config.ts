/**
 * MongoDB Configuration Utility
 * 
 * BEST PRACTICE: Centralized MongoDB configuration that reads env vars at runtime
 * 
 * This ensures all services use the same MongoDB connection strategy and allows
 * globalSetup to configure MongoDB Memory Server before any services connect.
 * 
 * Usage in services:
 * ```typescript
 * import { getMongoDBUrl, getMongoDBName } from '../utils/mongodb-config';
 * 
 * // In connect() method (not at module level):
 * const url = getMongoDBUrl();
 * const dbName = getMongoDBName();
 * this.client = new MongoClient(url);
 * this.db = this.client.db(dbName);
 * ```
 */

/**
 * Get MongoDB connection URL
 * 
 * Priority:
 * 1. MONGODB_URI (full connection string with database)
 * 2. MONGODB_URL (connection string without database)
 * 3. Fallback: localhost:27017
 * 
 * BEST PRACTICE: Read at connection time, not module load time
 * This allows globalSetup to start MongoDB Memory Server first.
 */
export function getMongoDBUrl(): string {
    return process.env.MONGODB_URI || 
           process.env.MONGODB_URL || 
           'mongodb://localhost:27017';
}

/**
 * Get MongoDB database name
 * 
 * Priority:
 * 1. MONGODB_DATABASE env var
 * 2. Test database if NODE_ENV === 'test'
 * 3. Production database
 */
export function getMongoDBName(): string {
    return process.env.MONGODB_DATABASE || 
           (process.env.NODE_ENV === 'test' ? 'dive-v3-test' : 'dive-v3');
}

/**
 * Get full MongoDB connection string with database name
 * 
 * Combines URL and database name if needed
 */
export function getMongoDBConnectionString(): string {
    const url = getMongoDBUrl();
    const dbName = getMongoDBName();
    
    // If URI already includes database, use it as-is
    if (url.includes(`/${dbName}`)) {
        return url;
    }
    
    // Otherwise, append database name
    return `${url}/${dbName}`;
}

/**
 * Log MongoDB connection info (for debugging)
 * Masks credentials if present
 */
export function logMongoDBConnection(context: string): void {
    const url = getMongoDBUrl();
    const maskedUrl = url.replace(/\/\/.*:.*@/, '//***:***@');
    
    console.log(`MongoDB connection (${context}):`, {
        url: maskedUrl,
        database: getMongoDBName(),
        environment: process.env.NODE_ENV
    });
}

