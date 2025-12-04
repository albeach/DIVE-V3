/**
 * DIVE V3 - Decision Batch Service
 * Phase 9: Performance Optimization & Scalability
 * 
 * Provides batch authorization decision processing for:
 * - Reduced HTTP overhead via batching multiple decisions
 * - Parallel OPA query execution
 * - Efficient cache utilization
 * - Improved throughput for bulk operations
 * 
 * Targets (Phase 9):
 * - Throughput: 300 req/s (from ~150 req/s)
 * - Batch latency: <50ms for up to 10 decisions
 * - Zero duplicate OPA queries within batch
 * 
 * Usage:
 *   const results = await decisionBatchService.evaluateBatch([
 *     { subject, action, resource, context },
 *     { subject, action, resource, context },
 *   ]);
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import { EventEmitter } from 'events';
import * as http from 'http';
import * as https from 'https';
import { logger } from '../utils/logger';
import { decisionCacheService } from './decision-cache.service';

// ============================================
// TYPES
// ============================================

export interface IBatchConfig {
  /** Maximum decisions in a single batch */
  maxBatchSize: number;
  /** Maximum wait time before processing partial batch (ms) */
  maxWaitMs: number;
  /** Enable parallel OPA queries */
  parallelQueries: boolean;
  /** Maximum concurrent OPA connections */
  maxConcurrency: number;
  /** Enable result deduplication */
  deduplication: boolean;
  /** Cache results after batch evaluation */
  cacheResults: boolean;
  /** OPA URL */
  opaUrl: string;
  /** OPA timeout (ms) */
  opaTimeout: number;
}

export interface IOPAInput {
  subject: {
    uniqueID: string;
    clearance: string;
    countryOfAffiliation: string;
    acpCOI?: string[];
    authenticated?: boolean;
    mfaVerified?: boolean;
    aal?: number;
  };
  action: {
    type: string;
  };
  resource: {
    resourceId: string;
    classification: string;
    releasabilityTo: string[];
    COI?: string[];
    creationDate?: string;
    encrypted?: boolean;
  };
  context?: {
    requestId?: string;
    currentTime?: string;
    sourceIP?: string;
    tenant?: string;
  };
}

export interface IOPAResult {
  allow: boolean;
  reason: string;
  obligations?: Array<{
    type: string;
    resourceId?: string;
  }>;
  evaluation_details?: Record<string, unknown>;
}

export interface IBatchItem {
  id: string;
  input: IOPAInput;
  priority?: number;
}

export interface IBatchResult {
  id: string;
  success: boolean;
  result?: IOPAResult;
  error?: string;
  cacheHit: boolean;
  latencyMs: number;
}

export interface IBatchEvaluationResult {
  batchId: string;
  totalItems: number;
  successCount: number;
  errorCount: number;
  cacheHits: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  results: IBatchResult[];
}

interface PendingBatch {
  items: IBatchItem[];
  resolve: (result: IBatchEvaluationResult) => void;
  reject: (error: Error) => void;
  createdAt: number;
}

// ============================================
// HTTP AGENT POOL
// ============================================

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 30000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 30000,
  rejectUnauthorized: false,
});

// ============================================
// DECISION BATCH SERVICE
// ============================================

class DecisionBatchService extends EventEmitter {
  private config: IBatchConfig;
  private pendingBatch: PendingBatch | null = null;
  private batchTimeout: NodeJS.Timeout | null = null;
  private batchCounter: number = 0;
  private stats: {
    totalBatches: number;
    totalDecisions: number;
    cacheHits: number;
    opaQueries: number;
    errors: number;
    avgBatchSize: number;
    avgLatencyMs: number;
  };

  constructor(config: Partial<IBatchConfig> = {}) {
    super();

    this.config = {
      maxBatchSize: parseInt(process.env.BATCH_MAX_SIZE || '50', 10),
      maxWaitMs: parseInt(process.env.BATCH_MAX_WAIT_MS || '10', 10),
      parallelQueries: process.env.BATCH_PARALLEL !== 'false',
      maxConcurrency: parseInt(process.env.BATCH_MAX_CONCURRENCY || '10', 10),
      deduplication: process.env.BATCH_DEDUP !== 'false',
      cacheResults: process.env.BATCH_CACHE !== 'false',
      opaUrl: process.env.OPA_URL || 'http://localhost:8181',
      opaTimeout: parseInt(process.env.OPA_TIMEOUT || '5000', 10),
      ...config,
    };

    this.stats = {
      totalBatches: 0,
      totalDecisions: 0,
      cacheHits: 0,
      opaQueries: 0,
      errors: 0,
      avgBatchSize: 0,
      avgLatencyMs: 0,
    };

    logger.info('Decision batch service initialized', {
      maxBatchSize: this.config.maxBatchSize,
      maxWaitMs: this.config.maxWaitMs,
      parallelQueries: this.config.parallelQueries,
    });
  }

  /**
   * Generate cache key for deduplication
   */
  private generateCacheKey(input: IOPAInput): string {
    return [
      input.context?.tenant || 'default',
      input.subject.uniqueID,
      input.resource.resourceId,
      input.subject.clearance,
      input.subject.countryOfAffiliation,
    ].join(':');
  }

  /**
   * Make OPA request
   */
  private async queryOPA(input: IOPAInput): Promise<IOPAResult> {
    const url = new URL('/v1/data/dive/authorization/decision', this.config.opaUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const agent = isHttps ? httpsAgent : httpAgent;

    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ input });
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        agent,
        timeout: this.config.opaTimeout,
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.result) {
              resolve(parsed.result);
            } else {
              // Default deny if no result
              resolve({
                allow: false,
                reason: 'No decision result from OPA',
              });
            }
          } catch (error) {
            reject(new Error(`Failed to parse OPA response: ${error}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('OPA request timeout'));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Evaluate a single item (with cache check)
   */
  private async evaluateItem(item: IBatchItem): Promise<IBatchResult> {
    const startTime = performance.now();
    const cacheKey = this.generateCacheKey(item.input);

    try {
      // Check cache first
      const cached = decisionCacheService.get(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        return {
          id: item.id,
          success: true,
          result: cached.result,
          cacheHit: true,
          latencyMs: performance.now() - startTime,
        };
      }

      // Query OPA
      this.stats.opaQueries++;
      const result = await this.queryOPA(item.input);

      // Cache the result
      if (this.config.cacheResults) {
        decisionCacheService.set(
          cacheKey,
          result,
          item.input.resource.classification,
          item.input.context?.tenant
        );
      }

      return {
        id: item.id,
        success: true,
        result,
        cacheHit: false,
        latencyMs: performance.now() - startTime,
      };
    } catch (error) {
      this.stats.errors++;
      logger.error('Decision evaluation error', { itemId: item.id, error });
      return {
        id: item.id,
        success: false,
        error: String(error),
        cacheHit: false,
        latencyMs: performance.now() - startTime,
      };
    }
  }

  /**
   * Process a batch of items
   */
  private async processBatch(items: IBatchItem[]): Promise<IBatchEvaluationResult> {
    const batchId = `batch-${++this.batchCounter}`;
    const startTime = performance.now();

    logger.debug('Processing batch', { batchId, itemCount: items.length });

    let results: IBatchResult[];

    // Deduplicate if enabled
    let itemsToProcess = items;
    const dedupeMap = new Map<string, IBatchItem[]>();

    if (this.config.deduplication) {
      for (const item of items) {
        const key = this.generateCacheKey(item.input);
        if (!dedupeMap.has(key)) {
          dedupeMap.set(key, []);
        }
        dedupeMap.get(key)!.push(item);
      }
      // Only process unique items
      itemsToProcess = Array.from(dedupeMap.values()).map(group => group[0]);
    }

    if (this.config.parallelQueries) {
      // Parallel execution with concurrency limit
      const chunks: IBatchItem[][] = [];
      for (let i = 0; i < itemsToProcess.length; i += this.config.maxConcurrency) {
        chunks.push(itemsToProcess.slice(i, i + this.config.maxConcurrency));
      }

      const allResults: IBatchResult[] = [];
      for (const chunk of chunks) {
        const chunkResults = await Promise.all(
          chunk.map(item => this.evaluateItem(item))
        );
        allResults.push(...chunkResults);
      }
      results = allResults;
    } else {
      // Sequential execution
      results = [];
      for (const item of itemsToProcess) {
        results.push(await this.evaluateItem(item));
      }
    }

    // Expand deduplicated results
    if (this.config.deduplication && dedupeMap.size > 0) {
      const expandedResults: IBatchResult[] = [];
      const resultMap = new Map(results.map(r => [this.generateCacheKey(items.find(i => i.id === r.id)!.input), r]));
      
      for (const item of items) {
        const key = this.generateCacheKey(item.input);
        const baseResult = resultMap.get(key)!;
        expandedResults.push({
          ...baseResult,
          id: item.id,
          // Duplicates are effectively cache hits
          cacheHit: baseResult.id !== item.id ? true : baseResult.cacheHit,
        });
      }
      results = expandedResults;
    }

    const totalLatencyMs = performance.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    const cacheHits = results.filter(r => r.cacheHit).length;

    // Update stats
    this.stats.totalBatches++;
    this.stats.totalDecisions += items.length;
    const totalBatches = this.stats.totalBatches;
    this.stats.avgBatchSize = (this.stats.avgBatchSize * (totalBatches - 1) + items.length) / totalBatches;
    this.stats.avgLatencyMs = (this.stats.avgLatencyMs * (totalBatches - 1) + totalLatencyMs) / totalBatches;

    const batchResult: IBatchEvaluationResult = {
      batchId,
      totalItems: items.length,
      successCount,
      errorCount: items.length - successCount,
      cacheHits,
      totalLatencyMs,
      avgLatencyMs: totalLatencyMs / items.length,
      results,
    };

    // Emit event
    this.emit('batch_completed', batchResult);

    // Audit log
    // Note: Individual decisions are logged during processing
    // Batch summary logging can be added to audit service if needed
    // For now, batch processing is logged via individual decision logs

    logger.debug('Batch completed', {
      batchId,
      totalItems: items.length,
      successCount,
      cacheHits,
      totalLatencyMs: totalLatencyMs.toFixed(2),
    });

    return batchResult;
  }

  /**
   * Flush pending batch immediately
   */
  private async flushBatch(): Promise<void> {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    if (!this.pendingBatch || this.pendingBatch.items.length === 0) {
      return;
    }

    const batch = this.pendingBatch;
    this.pendingBatch = null;

    try {
      const result = await this.processBatch(batch.items);
      batch.resolve(result);
    } catch (error) {
      batch.reject(error as Error);
    }
  }

  /**
   * Add item to current batch
   */
  private addToBatch(item: IBatchItem): Promise<IBatchEvaluationResult> {
    return new Promise((resolve, reject) => {
      if (!this.pendingBatch) {
        this.pendingBatch = {
          items: [],
          resolve,
          reject,
          createdAt: Date.now(),
        };

        // Set timeout for partial batch
        this.batchTimeout = setTimeout(() => {
          this.flushBatch();
        }, this.config.maxWaitMs);
      }

      this.pendingBatch.items.push(item);

      // Flush if batch is full
      if (this.pendingBatch.items.length >= this.config.maxBatchSize) {
        this.flushBatch();
      }
    });
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Evaluate a single decision (adds to batch)
   */
  async evaluate(input: IOPAInput, id?: string): Promise<IBatchResult> {
    const itemId = id || `item-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const batchResult = await this.addToBatch({ id: itemId, input });
    return batchResult.results.find(r => r.id === itemId)!;
  }

  /**
   * Evaluate a batch of decisions immediately
   */
  async evaluateBatch(inputs: IOPAInput[]): Promise<IBatchEvaluationResult> {
    const items: IBatchItem[] = inputs.map((input, index) => ({
      id: `batch-item-${index}`,
      input,
    }));
    return this.processBatch(items);
  }

  /**
   * Evaluate batch with custom IDs
   */
  async evaluateBatchWithIds(items: IBatchItem[]): Promise<IBatchEvaluationResult> {
    return this.processBatch(items);
  }

  /**
   * Force flush any pending batch
   */
  async flush(): Promise<void> {
    await this.flushBatch();
  }

  /**
   * Get service statistics
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<IBatchConfig> {
    return { ...this.config };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalBatches: 0,
      totalDecisions: 0,
      cacheHits: 0,
      opaQueries: 0,
      errors: 0,
      avgBatchSize: 0,
      avgLatencyMs: 0,
    };
  }

  /**
   * Check service health
   */
  async checkHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const startTime = performance.now();
    try {
      const testInput: IOPAInput = {
        subject: {
          uniqueID: 'health-check',
          clearance: 'UNCLASSIFIED',
          countryOfAffiliation: 'USA',
          authenticated: true,
        },
        action: { type: 'read' },
        resource: {
          resourceId: 'health-check',
          classification: 'UNCLASSIFIED',
          releasabilityTo: ['USA'],
        },
      };

      await this.queryOPA(testInput);
      return {
        healthy: true,
        latencyMs: performance.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: performance.now() - startTime,
        error: String(error),
      };
    }
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const decisionBatchService = new DecisionBatchService();

export default DecisionBatchService;


