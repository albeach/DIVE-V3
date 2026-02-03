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
 * 2. Parse database from MONGODB_URI/MONGODB_URL (e.g., mongodb://host:port/dive-v3-rou?authSource=admin)
 * 3. Test database if NODE_ENV === 'test'
 * 4. Fallback: 'dive-v3'
 *
 * CRITICAL FIX: For dynamically deployed spokes, the database name is embedded in the URL
 * but MONGODB_DATABASE may not be explicitly set. We must extract it from the URL.
 */
export function getMongoDBName(): string {
    // Explicit env var takes priority
    if (process.env.MONGODB_DATABASE) {
        return process.env.MONGODB_DATABASE;
    }

    // Try to parse database from connection URL
    const mongoUrl = process.env.MONGODB_URI || process.env.MONGODB_URL;
    if (mongoUrl) {
        try {
            // Parse URL format: mongodb://[user:pass@]host:port/database?options
            const urlMatch = mongoUrl.match(/mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/);
            if (urlMatch && urlMatch[1]) {
                return urlMatch[1];
            }
        } catch {
            // Failed to parse, fall through to defaults
        }
    }

    // Fallbacks - CRITICAL FIX (Issue #5 - 2026-02-03)
    // Use INSTANCE_CODE to ensure instance-specific database naming
    if (process.env.NODE_ENV === 'test') {
        return 'dive-v3-test';
    }

    // For production spokes, use instance-specific database name
    const instanceCode = process.env.INSTANCE_CODE || process.env.INSTANCE_REALM;
    if (instanceCode && instanceCode !== 'USA') {
        return `dive-v3-${instanceCode.toLowerCase()}`;
    }

    // Default for Hub or when no instance code is set
    return 'dive-v3';
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
