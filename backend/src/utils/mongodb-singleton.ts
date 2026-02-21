/**
 * DIVE V3 - MongoDB Singleton Connection Pool
 * 
 * ROOT CAUSE FIX: Memory Leak from Connection Pool Leaks
 * 
 * Problem:
 * - 90+ files creating new MongoClient() instances (10 connections each)
 * - 442 connections created in 5 minutes (88/minute)
 * - Each connection: 10-20 MB overhead
 * - Total leak: 440-880 MB + unbounded growth
 * 
 * Solution:
 * - Single shared connection pool across entire application
 * - One MongoClient instance with 20 connections max
 * - Automatic retry logic for replica set initialization
 * - Graceful shutdown on process termination
 * 
 * Expected Impact:
 * - MongoDB connections: 442 in 5 min → ~20 stable
 * - Memory savings: 440-880 MB immediate + prevents unbounded growth
 * 
 * @version 1.0.0
 * @date 2026-02-16
 */

import { MongoClient, Db, MongoClientOptions } from 'mongodb';
import { logger } from './logger';
import { getMongoDBUrl, getMongoDBName } from './mongodb-config';
import { connectToMongoDBWithRetry, verifyReplicaSetStatus } from './mongodb-connection';

/**
 * Singleton MongoDB Connection Manager
 * 
 * Ensures only ONE MongoClient instance exists across the entire application.
 * All services share the same connection pool.
 */
class MongoDBSingleton {
  private static instance: MongoDBSingleton;
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private isConnecting: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  private constructor() {
    // Private constructor prevents external instantiation
  }

  /**
   * Get singleton instance
   */
  static getInstance(): MongoDBSingleton {
    if (!MongoDBSingleton.instance) {
      MongoDBSingleton.instance = new MongoDBSingleton();
    }
    return MongoDBSingleton.instance;
  }

  /**
   * Connect to MongoDB with production-grade configuration
   * 
   * Connection pooling settings:
   * - maxPoolSize: 20 (down from default 100, prevents connection explosion)
   * - minPoolSize: 5 (keeps warm connections ready)
   * - maxIdleTimeMS: 300000 (5 minutes - closes idle connections)
   * 
   * Retry logic:
   * - Automatic retry for replica set initialization
   * - Handles "not primary" errors gracefully
   * - Exponential backoff up to 40 seconds
   * 
   * @returns Promise that resolves when connected
   */
  async connect(): Promise<void> {
    // If already connected, return immediately
    if (this.client && this.db) {
      logger.debug('MongoDB singleton already connected');
      return;
    }

    // If connection in progress, wait for it
    if (this.isConnecting && this.connectionPromise) {
      logger.debug('MongoDB connection in progress, waiting...');
      return this.connectionPromise;
    }

    // Start new connection
    this.isConnecting = true;
    this.connectionPromise = this.doConnect();

    try {
      await this.connectionPromise;
    } finally {
      this.isConnecting = false;
      this.connectionPromise = null;
    }
  }

  /**
   * Internal connection logic
   */
  private async doConnect(): Promise<void> {
    const url = getMongoDBUrl();
    const dbName = getMongoDBName();

    // Production-grade connection options
    const options: MongoClientOptions = {
      maxPoolSize: 20,           // SSOT: Max 20 connections (down from 100 default)
      minPoolSize: 5,            // Keep 5 warm connections
      maxIdleTimeMS: 300000,     // Close idle connections after 5 minutes
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      retryWrites: true,         // Automatic retry for write failures
      retryReads: true,          // Automatic retry for read failures
      directConnection: true,    // Required for single-node replica sets
    };

    logger.info('MongoDB singleton connecting...', {
      database: dbName,
      poolConfig: {
        minPoolSize: options.minPoolSize,
        maxPoolSize: options.maxPoolSize,
        maxIdleTimeMS: options.maxIdleTimeMS,
      }
    });

    try {
      // Use existing retry logic from mongodb-connection.ts
      this.client = await connectToMongoDBWithRetry(url, options, {
        maxRetries: 15,
        initialRetryDelayMs: 1000,
        maxRetryDelayMs: 10000,
        backoffMultiplier: 1.5,
        useExponentialBackoff: true,
      });

      this.db = this.client.db(dbName);

      // Verify replica set status
      const replicaStatus = await verifyReplicaSetStatus(this.client);
      
      logger.info('MongoDB singleton connected successfully', {
        database: dbName,
        isReplicaSet: replicaStatus.isReplicaSet,
        isPrimary: replicaStatus.isPrimary,
        setName: replicaStatus.setName,
        poolSize: { min: options.minPoolSize, max: options.maxPoolSize }
      });

      // Setup graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      this.client = null;
      this.db = null;
      
      logger.error('MongoDB singleton connection failed', {
        error: error instanceof Error ? error.message : 'unknown',
        database: dbName
      });
      
      throw error;
    }
  }

  /**
   * Get database instance
   * 
   * Throws if not connected (fail-fast pattern)
   * 
   * @returns Db instance for the configured database
   */
  getDb(): Db {
    if (!this.db) {
      throw new Error(
        'MongoDB not connected - call mongoSingleton.connect() first. ' +
        'This should happen in server initialization (server.ts).'
      );
    }
    return this.db;
  }

  /**
   * Get MongoClient instance
   * 
   * Use sparingly - most code should use getDb() instead
   * 
   * @returns MongoClient instance
   */
  getClient(): MongoClient {
    if (!this.client) {
      throw new Error('MongoDB not connected - call mongoSingleton.connect() first');
    }
    return this.client;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.client !== null && this.db !== null;
  }

  /**
   * Get connection pool statistics
   * 
   * Useful for monitoring and debugging connection leaks
   */
  async getPoolStats(): Promise<{
    availableConnections: number;
    currentCheckedOut: number;
    totalCreated: number;
  }> {
    if (!this.client) {
      throw new Error('MongoDB not connected');
    }

    try {
      const serverStatus = await this.db!.admin().serverStatus();
      const connections = serverStatus.connections;

      return {
        availableConnections: connections.available || 0,
        currentCheckedOut: connections.current || 0,
        totalCreated: connections.totalCreated || 0,
      };
    } catch (error) {
      logger.error('Failed to get pool stats', {
        error: error instanceof Error ? error.message : 'unknown'
      });
      throw error;
    }
  }

  /**
   * Close MongoDB connection
   * 
   * Should only be called during graceful shutdown
   */
  async close(): Promise<void> {
    if (this.client) {
      logger.info('Closing MongoDB singleton connection...');
      
      try {
        await this.client.close();
        logger.info('MongoDB singleton closed successfully');
      } catch (error) {
        logger.error('Error closing MongoDB singleton', {
          error: error instanceof Error ? error.message : 'unknown'
        });
      } finally {
        this.client = null;
        this.db = null;
      }
    }
  }

  /**
   * Setup graceful shutdown handlers
   * 
   * Ensures connections are closed properly when process terminates
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, closing MongoDB connection...`);
      await this.close();
      process.exit(0);
    };

    // Handle various termination signals
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    
    // Handle uncaught exceptions (log and close)
    process.once('uncaughtException', async (error) => {
      logger.error('Uncaught exception, closing MongoDB...', {
        error: error.message,
        stack: error.stack
      });
      await this.close();
      process.exit(1);
    });

    // Handle unhandled promise rejections (log and close)
    process.once('unhandledRejection', async (reason) => {
      logger.error('Unhandled rejection, closing MongoDB...', {
        reason: reason instanceof Error ? reason.message : String(reason)
      });
      await this.close();
      process.exit(1);
    });
  }
}

// Export singleton instance
export const mongoSingleton = MongoDBSingleton.getInstance();

/**
 * Convenience function to get database instance
 * 
 * Usage:
 * ```typescript
 * import { getDb } from '../utils/mongodb-singleton';
 * 
 * const db = getDb();
 * const resources = db.collection('resources');
 * ```
 */
export const getDb = (): Db => mongoSingleton.getDb();

/**
 * Convenience function to get MongoClient instance
 * 
 * Use sparingly - most code should use getDb() instead
 */
export const getClient = (): MongoClient => mongoSingleton.getClient();

/**
 * Convenience function to check if connected
 */
export const isConnected = (): boolean => mongoSingleton.isConnected();

/**
 * Convenience function to get pool statistics
 */
export const getPoolStats = (): Promise<{
  availableConnections: number;
  currentCheckedOut: number;
  totalCreated: number;
}> => mongoSingleton.getPoolStats();

// Export class for testing purposes
export { MongoDBSingleton };
