/**
 * DIVE V3 - Performance Profiler Utility
 * Phase 9: Performance Optimization & Scalability
 * 
 * Provides comprehensive performance profiling for:
 * - Bundle build time measurement
 * - Decision latency profiling
 * - Memory usage tracking
 * - OPA query optimization analysis
 * - Throughput benchmarking
 * 
 * Targets (Phase 9):
 * - Bundle build time: <300ms
 * - Decision latency p95: <20ms
 * - Throughput: 300 req/s
 * - Memory per OPA: <500MB
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import { EventEmitter } from 'events';
import { logger } from './logger';

// ============================================
// TYPES
// ============================================

export interface IProfilerConfig {
  /** Enable memory profiling */
  enableMemoryProfiling: boolean;
  /** Sample interval for continuous profiling (ms) */
  sampleInterval: number;
  /** Maximum samples to retain */
  maxSamples: number;
  /** Enable detailed timing breakdown */
  detailedTiming: boolean;
  /** Export results to file */
  exportResults: boolean;
  /** Export path */
  exportPath: string;
}

export interface ITimingSample {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
  children?: ITimingSample[];
}

export interface IMemorySample {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  rss: number;
}

export interface ILatencyStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  stdDev: number;
}

export interface IBundleProfileResult {
  tenant: string;
  buildTimeMs: number;
  stagingTimeMs: number;
  compilationTimeMs: number;
  checksumTimeMs: number;
  filesProcessed: number;
  bundleSizeBytes: number;
  memoryUsedMB: number;
}

export interface IDecisionProfileResult {
  requestId: string;
  totalTimeMs: number;
  cacheCheckMs: number;
  opaQueryMs: number;
  policyEvaluationMs: number;
  cacheWriteMs: number;
  cacheHit: boolean;
  classification: string;
  tenant?: string;
}

export interface IThroughputMetrics {
  requestsPerSecond: number;
  averageLatencyMs: number;
  errorRate: number;
  duration: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
}

export interface IProfileReport {
  timestamp: string;
  duration: number;
  bundleProfiles: IBundleProfileResult[];
  decisionStats: ILatencyStats;
  memoryStats: {
    peakHeapMB: number;
    avgHeapMB: number;
    peakRssMB: number;
  };
  throughput: IThroughputMetrics | null;
  recommendations: string[];
}

// ============================================
// PERFORMANCE PROFILER SERVICE
// ============================================

class PerfProfiler extends EventEmitter {
  private config: IProfilerConfig;
  private timingSamples: Map<string, ITimingSample[]>;
  private memorySamples: IMemorySample[];
  private decisionLatencies: number[];
  private profileStartTime: number;
  private memoryProfilerInterval: NodeJS.Timeout | null = null;
  private bundleProfiles: IBundleProfileResult[];
  private isProfilingActive: boolean = false;

  constructor(config: Partial<IProfilerConfig> = {}) {
    super();
    
    this.config = {
      enableMemoryProfiling: process.env.PERF_MEMORY_PROFILING !== 'false',
      sampleInterval: parseInt(process.env.PERF_SAMPLE_INTERVAL || '100', 10),
      maxSamples: parseInt(process.env.PERF_MAX_SAMPLES || '10000', 10),
      detailedTiming: process.env.PERF_DETAILED_TIMING !== 'false',
      exportResults: process.env.PERF_EXPORT_RESULTS === 'true',
      exportPath: process.env.PERF_EXPORT_PATH || './perf-results',
      ...config,
    };

    this.timingSamples = new Map();
    this.memorySamples = [];
    this.decisionLatencies = [];
    this.bundleProfiles = [];
    this.profileStartTime = Date.now();

    logger.info('Performance profiler initialized', {
      enableMemoryProfiling: this.config.enableMemoryProfiling,
      sampleInterval: this.config.sampleInterval,
    });
  }

  // ============================================
  // TIMING METHODS
  // ============================================

  /**
   * Start a timing measurement
   */
  startTimer(name: string, metadata?: Record<string, unknown>): () => number {
    const sample: ITimingSample = {
      name,
      startTime: performance.now(),
      metadata,
    };

    if (!this.timingSamples.has(name)) {
      this.timingSamples.set(name, []);
    }
    
    const samples = this.timingSamples.get(name)!;
    samples.push(sample);

    // Trim if exceeds max samples
    if (samples.length > this.config.maxSamples) {
      samples.shift();
    }

    // Return stop function
    return () => {
      sample.endTime = performance.now();
      sample.duration = sample.endTime - sample.startTime;
      return sample.duration;
    };
  }

  /**
   * Time an async operation
   */
  async timeAsync<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<{ result: T; duration: number }> {
    const stopTimer = this.startTimer(name, metadata);
    try {
      const result = await fn();
      const duration = stopTimer();
      return { result, duration };
    } catch (error) {
      stopTimer();
      throw error;
    }
  }

  /**
   * Time a sync operation
   */
  timeSync<T>(
    name: string,
    fn: () => T,
    metadata?: Record<string, unknown>
  ): { result: T; duration: number } {
    const stopTimer = this.startTimer(name, metadata);
    try {
      const result = fn();
      const duration = stopTimer();
      return { result, duration };
    } catch (error) {
      stopTimer();
      throw error;
    }
  }

  /**
   * Get timing statistics for a named timer
   */
  getTimingStats(name: string): ILatencyStats | null {
    const samples = this.timingSamples.get(name);
    if (!samples || samples.length === 0) {
      return null;
    }

    const durations = samples
      .filter(s => s.duration !== undefined)
      .map(s => s.duration!);

    return this.calculateLatencyStats(durations);
  }

  // ============================================
  // MEMORY PROFILING
  // ============================================

  /**
   * Start continuous memory profiling
   */
  startMemoryProfiling(): void {
    if (!this.config.enableMemoryProfiling || this.memoryProfilerInterval) {
      return;
    }

    this.memoryProfilerInterval = setInterval(() => {
      const memUsage = process.memoryUsage();
      const sample: IMemorySample = {
        timestamp: Date.now(),
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers || 0,
        rss: memUsage.rss,
      };

      this.memorySamples.push(sample);

      // Trim if exceeds max samples
      if (this.memorySamples.length > this.config.maxSamples) {
        this.memorySamples.shift();
      }
    }, this.config.sampleInterval);

    logger.debug('Memory profiling started');
  }

  /**
   * Stop memory profiling
   */
  stopMemoryProfiling(): void {
    if (this.memoryProfilerInterval) {
      clearInterval(this.memoryProfilerInterval);
      this.memoryProfilerInterval = null;
      logger.debug('Memory profiling stopped');
    }
  }

  /**
   * Get current memory snapshot
   */
  getMemorySnapshot(): IMemorySample {
    const memUsage = process.memoryUsage();
    return {
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers || 0,
      rss: memUsage.rss,
    };
  }

  /**
   * Get memory statistics
   */
  getMemoryStats(): { peakHeapMB: number; avgHeapMB: number; peakRssMB: number } {
    if (this.memorySamples.length === 0) {
      const current = this.getMemorySnapshot();
      return {
        peakHeapMB: current.heapUsed / (1024 * 1024),
        avgHeapMB: current.heapUsed / (1024 * 1024),
        peakRssMB: current.rss / (1024 * 1024),
      };
    }

    const heapValues = this.memorySamples.map(s => s.heapUsed);
    const rssValues = this.memorySamples.map(s => s.rss);

    return {
      peakHeapMB: Math.max(...heapValues) / (1024 * 1024),
      avgHeapMB: heapValues.reduce((a, b) => a + b, 0) / heapValues.length / (1024 * 1024),
      peakRssMB: Math.max(...rssValues) / (1024 * 1024),
    };
  }

  // ============================================
  // DECISION LATENCY PROFILING
  // ============================================

  /**
   * Record a decision latency
   */
  recordDecisionLatency(latencyMs: number): void {
    this.decisionLatencies.push(latencyMs);

    // Trim if exceeds max samples
    if (this.decisionLatencies.length > this.config.maxSamples) {
      this.decisionLatencies.shift();
    }
  }

  /**
   * Profile an authorization decision
   */
  async profileDecision(
    requestId: string,
    decisionFn: () => Promise<{ allow: boolean; cached: boolean; classification: string; tenant?: string }>
  ): Promise<IDecisionProfileResult> {
    const startTotal = performance.now();
    const profile: Partial<IDecisionProfileResult> = {
      requestId,
    };

    try {
      // Run the decision function
      const result = await decisionFn();
      
      profile.totalTimeMs = performance.now() - startTotal;
      profile.cacheHit = result.cached;
      profile.classification = result.classification;
      profile.tenant = result.tenant;
      
      // Record latency
      this.recordDecisionLatency(profile.totalTimeMs);

      return profile as IDecisionProfileResult;
    } catch (error) {
      profile.totalTimeMs = performance.now() - startTotal;
      throw error;
    }
  }

  /**
   * Get decision latency statistics
   */
  getDecisionStats(): ILatencyStats {
    return this.calculateLatencyStats(this.decisionLatencies);
  }

  // ============================================
  // BUNDLE BUILD PROFILING
  // ============================================

  /**
   * Record bundle build profile
   */
  recordBundleProfile(profile: IBundleProfileResult): void {
    this.bundleProfiles.push(profile);
    logger.debug('Bundle profile recorded', { tenant: profile.tenant, buildTimeMs: profile.buildTimeMs });
  }

  /**
   * Get bundle build statistics
   */
  getBundleStats(): {
    avgBuildTimeMs: number;
    totalBuildTimeMs: number;
    profiles: IBundleProfileResult[];
  } {
    if (this.bundleProfiles.length === 0) {
      return { avgBuildTimeMs: 0, totalBuildTimeMs: 0, profiles: [] };
    }

    const totalBuildTimeMs = this.bundleProfiles.reduce((sum, p) => sum + p.buildTimeMs, 0);
    
    return {
      avgBuildTimeMs: totalBuildTimeMs / this.bundleProfiles.length,
      totalBuildTimeMs,
      profiles: this.bundleProfiles,
    };
  }

  // ============================================
  // THROUGHPUT MEASUREMENT
  // ============================================

  /**
   * Measure throughput over a period
   */
  async measureThroughput(
    requestFn: () => Promise<boolean>,
    durationSeconds: number,
    targetRPS: number
  ): Promise<IThroughputMetrics> {
    const startTime = Date.now();
    const endTime = startTime + (durationSeconds * 1000);
    const requestInterval = 1000 / targetRPS;
    
    const latencies: number[] = [];
    let successfulRequests = 0;
    let failedRequests = 0;
    let nextRequestTime = startTime;

    while (Date.now() < endTime) {
      const now = Date.now();
      
      if (now >= nextRequestTime) {
        const requestStart = performance.now();
        
        try {
          const success = await requestFn();
          if (success) {
            successfulRequests++;
          } else {
            failedRequests++;
          }
        } catch {
          failedRequests++;
        }
        
        latencies.push(performance.now() - requestStart);
        nextRequestTime += requestInterval;
      }
      
      // Small yield to prevent blocking
      await new Promise(resolve => setImmediate(resolve));
    }

    const actualDuration = (Date.now() - startTime) / 1000;
    const totalRequests = successfulRequests + failedRequests;

    return {
      requestsPerSecond: totalRequests / actualDuration,
      averageLatencyMs: latencies.length > 0 
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
        : 0,
      errorRate: totalRequests > 0 ? failedRequests / totalRequests : 0,
      duration: actualDuration,
      totalRequests,
      successfulRequests,
      failedRequests,
    };
  }

  // ============================================
  // STATISTICS HELPERS
  // ============================================

  /**
   * Calculate latency statistics from an array of values
   */
  private calculateLatencyStats(values: number[]): ILatencyStats {
    if (values.length === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        stdDev: 0,
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / count;
    
    // Standard deviation
    const squaredDiffs = sorted.map(v => Math.pow(v - avg, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / count;
    const stdDev = Math.sqrt(avgSquaredDiff);

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      avg,
      p50: this.percentile(sorted, 50),
      p75: this.percentile(sorted, 75),
      p90: this.percentile(sorted, 90),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99),
      stdDev,
    };
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  // ============================================
  // PROFILING SESSION MANAGEMENT
  // ============================================

  /**
   * Start a profiling session
   */
  startProfiling(): void {
    if (this.isProfilingActive) {
      logger.warn('Profiling session already active');
      return;
    }

    this.isProfilingActive = true;
    this.profileStartTime = Date.now();
    this.reset();
    
    if (this.config.enableMemoryProfiling) {
      this.startMemoryProfiling();
    }

    logger.info('Profiling session started');
    this.emit('profiling_started', { timestamp: this.profileStartTime });
  }

  /**
   * Stop profiling and generate report
   */
  stopProfiling(): IProfileReport {
    if (!this.isProfilingActive) {
      logger.warn('No active profiling session');
    }

    this.stopMemoryProfiling();
    this.isProfilingActive = false;

    const report = this.generateReport();
    
    logger.info('Profiling session stopped', {
      duration: report.duration,
      decisionP95: report.decisionStats.p95,
      peakHeapMB: report.memoryStats.peakHeapMB,
    });

    this.emit('profiling_stopped', report);
    return report;
  }

  /**
   * Generate profiling report
   */
  generateReport(): IProfileReport {
    const duration = (Date.now() - this.profileStartTime) / 1000;
    const decisionStats = this.getDecisionStats();
    const memoryStats = this.getMemoryStats();
    const bundleStats = this.getBundleStats();

    // Generate recommendations
    const recommendations: string[] = [];
    
    // Check decision latency
    if (decisionStats.p95 > 20) {
      recommendations.push(
        `Decision latency p95 (${decisionStats.p95.toFixed(1)}ms) exceeds target (20ms). ` +
        `Consider: enable caching, optimize OPA queries, or scale horizontally.`
      );
    }

    // Check bundle build time
    if (bundleStats.avgBuildTimeMs > 300) {
      recommendations.push(
        `Bundle build time (${bundleStats.avgBuildTimeMs.toFixed(0)}ms) exceeds target (300ms). ` +
        `Consider: enable parallel builds, incremental compilation, or policy optimization.`
      );
    }

    // Check memory usage
    if (memoryStats.peakHeapMB > 500) {
      recommendations.push(
        `Memory usage (${memoryStats.peakHeapMB.toFixed(0)}MB) exceeds target (500MB). ` +
        `Consider: optimize policy bundle size, enable streaming evaluation, or increase heap.`
      );
    }

    // Check cache hit rate from decision stats
    if (decisionStats.count > 100 && decisionStats.avg > 15) {
      recommendations.push(
        `High average decision latency (${decisionStats.avg.toFixed(1)}ms) suggests low cache hit rate. ` +
        `Consider: tuning cache TTL, prewarming cache, or increasing cache size.`
      );
    }

    return {
      timestamp: new Date().toISOString(),
      duration,
      bundleProfiles: this.bundleProfiles,
      decisionStats,
      memoryStats,
      throughput: null, // Populated when measureThroughput is called
      recommendations,
    };
  }

  /**
   * Reset profiler state
   */
  reset(): void {
    this.timingSamples.clear();
    this.memorySamples = [];
    this.decisionLatencies = [];
    this.bundleProfiles = [];
    this.profileStartTime = Date.now();
    logger.debug('Profiler state reset');
  }

  /**
   * Check if profiling is active
   */
  isProfiling(): boolean {
    return this.isProfilingActive;
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<IProfilerConfig> {
    return { ...this.config };
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const perfProfiler = new PerfProfiler();

export default PerfProfiler;









