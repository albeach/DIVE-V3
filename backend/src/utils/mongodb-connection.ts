/**
 * DIVE V3 - MongoDB Connection Utility with Replica Set Retry Logic
 * 
 * Production-grade MongoDB connection handling with automatic retry for replica set initialization.
 * 
 * Context:
 * Single-node replica sets have an initialization window where the container is "healthy"
 * but the replica set hasn't achieved PRIMARY status yet. This causes "not primary" errors
 * when applications attempt writes during this window.
 * 
 * Solution:
 * Implement exponential backoff retry with specific handling for "not primary" errors,
 * allowing the replica set time to fully initialize before failing.
 * 
 * Best Practices Followed:
 * - Exponential backoff (industry standard for distributed systems)
 * - Specific error detection ("not primary" vs other errors)
 * - Comprehensive logging for debugging
 * - Configurable retry parameters
 * - Type-safe implementation
 * 
 * References:
 * - MongoDB Driver Retry Specification: https://github.com/mongodb/specifications/blob/master/source/retryable-writes/retryable-writes.rst
 * - DIVE V3 MongoDB Replica Set: scripts/mongo-init-replicaset.sh
 * 
 * @version 1.0.0
 * @date 2026-01-24
 */

import { MongoClient, MongoClientOptions } from 'mongodb';
import { logger } from './logger';

/**
 * Configuration options for MongoDB connection retry logic
 */
export interface IMongoDBRetryConfig {
  /** Maximum number of retry attempts (default: 15) */
  maxRetries?: number;
  
  /** Initial retry delay in milliseconds (default: 1000ms) */
  initialRetryDelayMs?: number;
  
  /** Maximum retry delay in milliseconds (default: 10000ms) */
  maxRetryDelayMs?: number;
  
  /** Backoff multiplier for exponential backoff (default: 1.5) */
  backoffMultiplier?: number;
  
  /** Whether to use exponential backoff (default: true) */
  useExponentialBackoff?: boolean;
}

/**
 * Default retry configuration optimized for single-node replica sets
 * 
 * Timeline:
 * - Attempt 1: 0s (immediate)
 * - Attempt 2: 1s
 * - Attempt 3: 2.5s
 * - Attempt 4: 4.75s
 * - Attempt 5: 8.125s
 * - ...
 * - Attempt 15: ~40s total elapsed
 * 
 * This allows up to 40 seconds for replica set initialization,
 * which covers 99% of normal initialization scenarios.
 */
const DEFAULT_RETRY_CONFIG: Required<IMongoDBRetryConfig> = {
  maxRetries: 15,
  initialRetryDelayMs: 1000,
  maxRetryDelayMs: 10000,
  backoffMultiplier: 1.5,
  useExponentialBackoff: true
};

/**
 * Error types that warrant retry
 */
const RETRYABLE_ERROR_PATTERNS = [
  'not primary',           // Replica set not ready
  'not master',            // Legacy terminology
  'network timeout',       // Temporary network issue
  'connection refused',    // Container starting
  'ECONNREFUSED',         // Connection refused
  'MongoNetworkError',    // Network error
  'MongoServerSelectionError' // Server selection failed
];

/**
 * Check if an error is retryable (not primary, network issues, etc.)
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  const errorMessage = error.message.toLowerCase();
  const errorName = error.constructor.name.toLowerCase();
  
  return RETRYABLE_ERROR_PATTERNS.some(pattern => 
    errorMessage.includes(pattern.toLowerCase()) || 
    errorName.includes(pattern.toLowerCase())
  );
}

/**
 * Calculate delay for next retry attempt
 */
function calculateRetryDelay(
  attemptNumber: number,
  config: Required<IMongoDBRetryConfig>
): number {
  if (!config.useExponentialBackoff) {
    return config.initialRetryDelayMs;
  }
  
  // Exponential backoff: delay = initial * (multiplier ^ attempt)
  const delay = config.initialRetryDelayMs * Math.pow(config.backoffMultiplier, attemptNumber - 1);
  
  // Cap at max delay
  return Math.min(delay, config.maxRetryDelayMs);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Connect to MongoDB with automatic retry for replica set initialization
 * 
 * This function implements production-grade retry logic specifically designed for
 * single-node replica sets that need time to achieve PRIMARY status.
 * 
 * @param url MongoDB connection URL (must include directConnection=true for single-node replica sets)
 * @param options MongoDB client options (optional)
 * @param retryConfig Retry configuration (optional, uses defaults optimized for replica sets)
 * @returns Connected MongoClient instance
 * @throws Error if connection fails after all retries
 * 
 * @example
 * ```typescript
 * // Basic usage with defaults
 * const client = await connectToMongoDBWithRetry(
 *   'mongodb://admin:password@mongodb:27017?authSource=admin&directConnection=true'
 * );
 * 
 * // Custom retry configuration
 * const client = await connectToMongoDBWithRetry(url, {}, {
 *   maxRetries: 20,
 *   initialRetryDelayMs: 500,
 *   maxRetryDelayMs: 5000
 * });
 * ```
 */
export async function connectToMongoDBWithRetry(
  url: string,
  options: MongoClientOptions = {},
  retryConfig: IMongoDBRetryConfig = {}
): Promise<MongoClient> {
  const config: Required<IMongoDBRetryConfig> = {
    ...DEFAULT_RETRY_CONFIG,
    ...retryConfig
  };
  
  const client = new MongoClient(url, options);
  let lastError: Error | null = null;
  
  // Log initial connection attempt
  logger.info('Connecting to MongoDB with retry logic', {
    maxRetries: config.maxRetries,
    initialDelay: config.initialRetryDelayMs,
    exponentialBackoff: config.useExponentialBackoff
  });
  
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      // Attempt connection
      await client.connect();
      
      // Verify connection is actually ready (for replica sets)
      await client.db('admin').command({ ping: 1 });
      
      logger.info('MongoDB connected successfully', {
        attempt,
        totalAttempts: config.maxRetries,
        success: true
      });
      
      return client;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      // Check if error is retryable
      const retryable = isRetryableError(error);
      const errorMsg = lastError.message;
      
      if (!retryable) {
        // Fatal error - don't retry
        logger.error('MongoDB connection failed with non-retryable error', {
          attempt,
          error: errorMsg,
          retryable: false
        });
        
        // Close client before throwing
        try {
          await client.close();
        } catch (closeError) {
          // Ignore close errors
        }
        
        throw lastError;
      }
      
      // Calculate retry delay
      const delayMs = calculateRetryDelay(attempt, config);
      
      // Log retry attempt
      if (attempt < config.maxRetries) {
        logger.info('MongoDB connection failed, retrying...', {
          attempt,
          maxRetries: config.maxRetries,
          error: errorMsg,
          retryable: true,
          nextRetryIn: `${delayMs}ms`,
          estimatedTotalWait: `${(delayMs * (config.maxRetries - attempt)) / 1000}s`
        });
        
        await sleep(delayMs);
      } else {
        // Final attempt failed
        logger.error('MongoDB connection failed after all retries', {
          totalAttempts: config.maxRetries,
          lastError: errorMsg
        });
      }
    }
  }
  
  // All retries exhausted
  try {
    await client.close();
  } catch (closeError) {
    // Ignore close errors
  }
  
  throw new Error(
    `Failed to connect to MongoDB after ${config.maxRetries} attempts. ` +
    `Last error: ${lastError?.message || 'unknown'}`
  );
}

/**
 * Create a MongoDB client with retry logic pre-configured
 * 
 * This is a convenience wrapper around connectToMongoDBWithRetry that
 * returns an unconnected client. Use connectToMongoDBWithRetry() instead
 * for automatic connection with retry.
 * 
 * @deprecated Use connectToMongoDBWithRetry() for better error handling
 */
export function createMongoClientWithRetry(
  url: string,
  options: MongoClientOptions = {}
): MongoClient {
  logger.warn('createMongoClientWithRetry() is deprecated - use connectToMongoDBWithRetry() instead');
  return new MongoClient(url, options);
}

/**
 * Verify MongoDB replica set status
 * 
 * @param client Connected MongoDB client
 * @returns Replica set status information
 */
export async function verifyReplicaSetStatus(client: MongoClient): Promise<{
  isReplicaSet: boolean;
  isPrimary: boolean;
  setName?: string;
  members?: number;
}> {
  try {
    const admin = client.db('admin').admin();
    const status = await admin.command({ replSetGetStatus: 1 });
    
    const isPrimary = status.members?.[0]?.stateStr === 'PRIMARY';
    
    logger.info('Replica set status verified', {
      set: status.set,
      state: status.members?.[0]?.stateStr,
      isPrimary
    });
    
    return {
      isReplicaSet: true,
      isPrimary,
      setName: status.set,
      members: status.members?.length
    };
  } catch (error) {
    // Not a replica set or error checking status
    logger.debug('MongoDB is not a replica set or status check failed', {
      error: error instanceof Error ? error.message : 'unknown'
    });
    
    return {
      isReplicaSet: false,
      isPrimary: false
    };
  }
}

/**
 * Wait for MongoDB replica set to achieve PRIMARY status
 * 
 * This is useful in deployment scripts where you need to ensure MongoDB
 * is fully ready before proceeding with seeding or other operations.
 * 
 * @param client Connected MongoDB client
 * @param maxWaitSeconds Maximum time to wait (default: 60 seconds)
 * @returns true if PRIMARY achieved, false if timeout
 */
export async function waitForPrimaryStatus(
  client: MongoClient,
  maxWaitSeconds: number = 60
): Promise<boolean> {
  const startTime = Date.now();
  const maxWaitMs = maxWaitSeconds * 1000;
  
  logger.info('Waiting for MongoDB PRIMARY status', {
    maxWaitSeconds
  });
  
  while (Date.now() - startTime < maxWaitMs) {
    const status = await verifyReplicaSetStatus(client);
    
    if (status.isPrimary) {
      const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info('MongoDB achieved PRIMARY status', {
        elapsedSeconds,
        setName: status.setName
      });
      return true;
    }
    
    // Wait 2 seconds before checking again
    await sleep(2000);
  }
  
  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.warn('Timeout waiting for MongoDB PRIMARY status', {
    elapsedSeconds,
    maxWaitSeconds
  });
  
  return false;
}

/**
 * Test MongoDB connection and verify it's ready for operations
 * 
 * @param url MongoDB connection URL
 * @param options MongoDB client options
 * @returns true if connection successful and ready
 */
export async function testMongoDBConnection(
  url: string,
  options: MongoClientOptions = {}
): Promise<boolean> {
  try {
    const client = await connectToMongoDBWithRetry(url, options, {
      maxRetries: 5 // Fewer retries for testing
    });
    
    // Verify replica set status if applicable
    const status = await verifyReplicaSetStatus(client);
    
    if (status.isReplicaSet && !status.isPrimary) {
      logger.warn('MongoDB is replica set but not PRIMARY', {
        setName: status.setName,
        isPrimary: status.isPrimary
      });
    }
    
    await client.close();
    return true;
    
  } catch (error) {
    logger.error('MongoDB connection test failed', {
      error: error instanceof Error ? error.message : 'unknown'
    });
    return false;
  }
}

/**
 * Retry a MongoDB operation that may fail due to replica set initialization
 * 
 * This wraps any MongoDB operation (not just connection) with retry logic
 * for "not primary" errors. Useful for index creation, writes, etc.
 * 
 * @param operation Async function to retry
 * @param retryConfig Retry configuration
 * @returns Result of the operation
 * 
 * @example
 * ```typescript
 * await retryMongoOperation(async () => {
 *   await collection.createIndex({ field: 1 });
 * });
 * ```
 */
export async function retryMongoOperation<T>(
  operation: () => Promise<T>,
  retryConfig: IMongoDBRetryConfig = {}
): Promise<T> {
  const config: Required<IMongoDBRetryConfig> = {
    ...DEFAULT_RETRY_CONFIG,
    ...retryConfig
  };
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      // Check if error is retryable
      const retryable = isRetryableError(error);
      const errorMsg = lastError.message;
      
      if (!retryable) {
        // Fatal error - don't retry
        logger.error('MongoDB operation failed with non-retryable error', {
          attempt,
          error: errorMsg,
          retryable: false
        });
        throw lastError;
      }
      
      // Calculate retry delay
      const delayMs = calculateRetryDelay(attempt, config);
      
      // Log retry attempt
      if (attempt < config.maxRetries) {
        logger.debug('MongoDB operation failed, retrying...', {
          attempt,
          maxRetries: config.maxRetries,
          error: errorMsg,
          nextRetryIn: `${delayMs}ms`
        });
        
        await sleep(delayMs);
      } else {
        // Final attempt failed
        logger.error('MongoDB operation failed after all retries', {
          totalAttempts: config.maxRetries,
          lastError: errorMsg
        });
      }
    }
  }
  
  // All retries exhausted
  throw new Error(
    `MongoDB operation failed after ${config.maxRetries} attempts. ` +
    `Last error: ${lastError?.message || 'unknown'}`
  );
}

export default connectToMongoDBWithRetry;
