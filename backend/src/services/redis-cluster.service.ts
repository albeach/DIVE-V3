/**
 * DIVE V3 - Redis Cluster Service
 * Phase 7: Production Hardening
 *
 * Provides high-availability Redis client with:
 * - Sentinel support for automatic failover
 * - Connection pooling
 * - Retry logic with exponential backoff
 * - Health monitoring
 * - Cluster metrics
 *
 * Configuration:
 *   REDIS_SENTINEL_ENABLED=true
 *   REDIS_SENTINELS=sentinel-1:26379,sentinel-2:26380,sentinel-3:26381
 *   REDIS_MASTER_NAME=mymaster
 *   REDIS_PASSWORD=<from GCP Secret Manager>
 *
 * @version 1.0.0
 * @date 2025-12-03
 */

import Redis, { RedisOptions, SentinelAddress } from 'ioredis';
// import { Cluster } from 'ioredis'; // Unused import
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export interface IRedisClusterConfig {
  /** Enable Sentinel mode */
  sentinelEnabled: boolean;
  /** Sentinel addresses */
  sentinels: SentinelAddress[];
  /** Master name for Sentinel */
  masterName: string;
  /** Redis password */
  password?: string;
  /** Database number */
  db: number;
  /** Connection timeout (ms) */
  connectTimeout: number;
  /** Command timeout (ms) */
  commandTimeout: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Retry delay base (ms) */
  retryDelayBase: number;
  /** Enable read from replicas */
  enableReadReplica: boolean;
  /** Key prefix for namespacing */
  keyPrefix: string;
}

export interface IRedisClusterHealth {
  healthy: boolean;
  mode: 'sentinel' | 'standalone' | 'cluster';
  master: {
    host: string;
    port: number;
    connected: boolean;
  } | null;
  replicas: Array<{
    host: string;
    port: number;
    connected: boolean;
    lag: number;
  }>;
  sentinels: Array<{
    host: string;
    port: number;
    connected: boolean;
  }>;
  stats: {
    connectedClients: number;
    usedMemory: number;
    usedMemoryPeak: number;
    totalConnections: number;
    opsPerSecond: number;
  };
  latency: number;
  lastCheck: string;
}

export interface IRedisMetrics {
  operations: {
    get: number;
    set: number;
    del: number;
    total: number;
  };
  hits: number;
  misses: number;
  errors: number;
  avgLatencyMs: number;
  failovers: number;
}

// ============================================
// CONFIGURATION
// ============================================

const DEFAULT_CONFIG: IRedisClusterConfig = {
  sentinelEnabled: process.env.REDIS_SENTINEL_ENABLED === 'true',
  sentinels: parseSentinels(process.env.REDIS_SENTINELS || 'redis-sentinel-1:26379,redis-sentinel-2:26380,redis-sentinel-3:26381'),
  masterName: process.env.REDIS_MASTER_NAME || 'mymaster',
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10),
  commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000', 10),
  maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
  retryDelayBase: parseInt(process.env.REDIS_RETRY_DELAY || '100', 10),
  enableReadReplica: process.env.REDIS_READ_REPLICA === 'true',
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'dive:',
};

function parseSentinels(sentinelString: string): SentinelAddress[] {
  return sentinelString.split(',').map(addr => {
    const [host, portStr] = addr.trim().split(':');
    return { host, port: parseInt(portStr || '26379', 10) };
  });
}

// ============================================
// REDIS CLUSTER SERVICE
// ============================================

class RedisClusterService extends EventEmitter {
  private client: Redis | null = null;
  private config: IRedisClusterConfig;
  private metrics: IRedisMetrics;
  private latencies: number[] = [];
  private initialized: boolean = false;

  constructor(config: Partial<IRedisClusterConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = {
      operations: { get: 0, set: 0, del: 0, total: 0 },
      hits: 0,
      misses: 0,
      errors: 0,
      avgLatencyMs: 0,
      failovers: 0,
    };

    logger.info('Redis cluster service created', {
      sentinelEnabled: this.config.sentinelEnabled,
      masterName: this.config.masterName,
      sentinelCount: this.config.sentinels.length,
    });
  }

  /**
   * Initialize Redis connection
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug('Redis cluster already initialized');
      return;
    }

    try {
      if (this.config.sentinelEnabled) {
        await this.initializeSentinel();
      } else {
        await this.initializeStandalone();
      }

      this.setupEventHandlers();
      this.initialized = true;

      logger.info('Redis cluster service initialized', {
        mode: this.config.sentinelEnabled ? 'sentinel' : 'standalone',
      });
    } catch (error) {
      logger.error('Failed to initialize Redis cluster', { error });
      throw error;
    }
  }

  /**
   * Initialize Sentinel connection
   */
  private async initializeSentinel(): Promise<void> {
    logger.info('Connecting to Redis via Sentinel', {
      sentinels: this.config.sentinels,
      masterName: this.config.masterName,
    });

    const options: RedisOptions = {
      sentinels: this.config.sentinels,
      name: this.config.masterName,
      password: this.config.password,
      sentinelPassword: this.config.password,
      db: this.config.db,
      connectTimeout: this.config.connectTimeout,
      commandTimeout: this.config.commandTimeout,
      retryStrategy: this.retryStrategy.bind(this),
      keyPrefix: this.config.keyPrefix,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      lazyConnect: false,
    };

    this.client = new Redis(options);

    // Wait for ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout'));
      }, this.config.connectTimeout);

      this.client!.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.client!.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Initialize standalone connection
   */
  private async initializeStandalone(): Promise<void> {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);

    logger.info('Connecting to Redis standalone', { host, port });

    const options: RedisOptions = {
      host,
      port,
      password: this.config.password,
      db: this.config.db,
      connectTimeout: this.config.connectTimeout,
      commandTimeout: this.config.commandTimeout,
      retryStrategy: this.retryStrategy.bind(this),
      keyPrefix: this.config.keyPrefix,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      lazyConnect: false,
    };

    this.client = new Redis(options);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout'));
      }, this.config.connectTimeout);

      this.client!.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.client!.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Retry strategy for connections
   */
  private retryStrategy(times: number): number | void {
    if (times > this.config.maxRetries) {
      logger.error('Redis max retries exceeded', { attempts: times });
      return undefined; // Stop retrying
    }

    const delay = Math.min(
      this.config.retryDelayBase * Math.pow(2, times - 1),
      30000 // Max 30 seconds
    );

    logger.warn('Redis reconnecting', { attempt: times, delayMs: delay });
    return delay;
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('connect', () => {
      logger.info('Redis connected');
      this.emit('connect');
    });

    this.client.on('ready', () => {
      logger.info('Redis ready');
      this.emit('ready');
    });

    this.client.on('close', () => {
      logger.warn('Redis connection closed');
      this.emit('close');
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis reconnecting');
      this.emit('reconnecting');
    });

    this.client.on('error', (error) => {
      logger.error('Redis error', { error });
      this.metrics.errors++;
      this.emit('error', error);
    });

    // Sentinel-specific events
    if (this.config.sentinelEnabled) {
      this.client.on('+switch-master', (name, oldMaster, newMaster) => {
        logger.warn('Redis failover detected', { name, oldMaster, newMaster });
        this.metrics.failovers++;
        this.emit('failover', { oldMaster, newMaster });
      });
    }
  }

  /**
   * Record latency measurement
   */
  private recordLatency(latencyMs: number): void {
    this.latencies.push(latencyMs);

    // Keep last 1000 measurements
    if (this.latencies.length > 1000) {
      this.latencies.shift();
    }

    // Update average
    this.metrics.avgLatencyMs = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
  }

  /**
   * Get value from cache
   */
  async get<T = string>(key: string): Promise<T | null> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }

    const start = Date.now();
    try {
      const value = await this.client.get(key);
      this.recordLatency(Date.now() - start);
      this.metrics.operations.get++;
      this.metrics.operations.total++;

      if (value) {
        this.metrics.hits++;
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as unknown as T;
        }
      }

      this.metrics.misses++;
      return null;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis get error', { key, error });
      throw error;
    }
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }

    const start = Date.now();
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);

      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }

      this.recordLatency(Date.now() - start);
      this.metrics.operations.set++;
      this.metrics.operations.total++;
      return true;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis set error', { key, error });
      throw error;
    }
  }

  /**
   * Delete key from cache
   */
  async del(key: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }

    const start = Date.now();
    try {
      const result = await this.client.del(key);
      this.recordLatency(Date.now() - start);
      this.metrics.operations.del++;
      this.metrics.operations.total++;
      return result;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis del error', { key, error });
      throw error;
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  async delByPattern(pattern: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }

    try {
      const keys = await this.client.keys(this.config.keyPrefix + pattern);
      if (keys.length === 0) {
        return 0;
      }

      // Remove prefix for deletion (ioredis adds prefix automatically)
      const keysWithoutPrefix = keys.map(k => k.replace(this.config.keyPrefix, ''));
      const result = await this.client.del(...keysWithoutPrefix);

      this.metrics.operations.del += keys.length;
      this.metrics.operations.total += keys.length;

      return result;
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis delByPattern error', { pattern, error });
      throw error;
    }
  }

  /**
   * Publish message to channel
   */
  async publish(channel: string, message: unknown): Promise<number> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }

    try {
      const serialized = typeof message === 'string' ? message : JSON.stringify(message);
      return await this.client.publish(channel, serialized);
    } catch (error) {
      this.metrics.errors++;
      logger.error('Redis publish error', { channel, error });
      throw error;
    }
  }

  /**
   * Subscribe to channel
   */
  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }

    // Create a separate subscriber connection
    const subscriber = this.client.duplicate();

    await subscriber.subscribe(channel);

    subscriber.on('message', (ch, message) => {
      if (ch === this.config.keyPrefix + channel) {
        callback(message);
      }
    });

    logger.info('Subscribed to Redis channel', { channel });
  }

  /**
   * Get cluster health status
   */
  async getHealth(): Promise<IRedisClusterHealth> {
    const health: IRedisClusterHealth = {
      healthy: false,
      mode: this.config.sentinelEnabled ? 'sentinel' : 'standalone',
      master: null,
      replicas: [],
      sentinels: [],
      stats: {
        connectedClients: 0,
        usedMemory: 0,
        usedMemoryPeak: 0,
        totalConnections: 0,
        opsPerSecond: 0,
      },
      latency: this.metrics.avgLatencyMs,
      lastCheck: new Date().toISOString(),
    };

    if (!this.client) {
      return health;
    }

    try {
      // Ping test
      const start = Date.now();
      await this.client.ping();
      health.latency = Date.now() - start;
      health.healthy = true;

      // Get server info
      const info = await this.client.info();
      const lines = info.split('\r\n');

      for (const line of lines) {
        const [key, value] = line.split(':');
        switch (key) {
          case 'connected_clients':
            health.stats.connectedClients = parseInt(value, 10);
            break;
          case 'used_memory':
            health.stats.usedMemory = parseInt(value, 10);
            break;
          case 'used_memory_peak':
            health.stats.usedMemoryPeak = parseInt(value, 10);
            break;
          case 'total_connections_received':
            health.stats.totalConnections = parseInt(value, 10);
            break;
          case 'instantaneous_ops_per_sec':
            health.stats.opsPerSecond = parseInt(value, 10);
            break;
        }
      }

      // Get replication info
      const replicationInfo = await this.client.info('replication');
      const replicationLines = replicationInfo.split('\r\n');

      // Check if this node is the master
      for (const line of replicationLines) {
        const [key, value] = line.split(':');
        if (key === 'role' && value === 'master') {
          // This node is the master
          health.master = {
            host: 'localhost',
            port: 6379,
            connected: true,
          };
        }
        if (key.startsWith('slave') && key.includes(':')) {
          const parts = value.split(',');
          const replicaInfo: { host: string; port: number; connected: boolean; lag: number } = {
            host: '',
            port: 6379,
            connected: false,
            lag: 0,
          };
          for (const part of parts) {
            const [k, v] = part.split('=');
            switch (k) {
              case 'ip':
                replicaInfo.host = v;
                break;
              case 'port':
                replicaInfo.port = parseInt(v, 10);
                break;
              case 'state':
                replicaInfo.connected = v === 'online';
                break;
              case 'lag':
                replicaInfo.lag = parseInt(v, 10);
                break;
            }
          }
          if (replicaInfo.host) {
            health.replicas.push(replicaInfo);
          }
        }
      }

      // Check sentinels if in sentinel mode
      if (this.config.sentinelEnabled) {
        for (const sentinel of this.config.sentinels) {
          try {
            const sentinelClient = new Redis({
              host: sentinel.host,
              port: sentinel.port,
              connectTimeout: 2000,
            });
            await sentinelClient.ping();
            health.sentinels.push({
              host: sentinel.host,
              port: sentinel.port,
              connected: true,
            });
            await sentinelClient.quit();
          } catch {
            health.sentinels.push({
              host: sentinel.host,
              port: sentinel.port,
              connected: false,
            });
          }
        }
      }
    } catch (error) {
      logger.error('Failed to get Redis health', { error });
      health.healthy = false;
    }

    return health;
  }

  /**
   * Get metrics
   */
  getMetrics(): IRedisMetrics {
    return { ...this.metrics };
  }

  /**
   * Get configuration (without sensitive data)
   */
  getConfig(): Omit<IRedisClusterConfig, 'password'> {
    const { password, ...config } = this.config;
    return config;
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.client?.status === 'ready';
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.initialized = false;
      logger.info('Redis connection closed');
    }
  }

  /**
   * Flush all keys (use with caution!)
   */
  async flushAll(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }

    logger.warn('Flushing all Redis keys');
    await this.client.flushall();
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const redisClusterService = new RedisClusterService();

export default RedisClusterService;
