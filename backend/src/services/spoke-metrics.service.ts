/**
 * DIVE V3 - Spoke Metrics Service
 *
 * Exports Prometheus-compatible metrics for spoke operations.
 * Provides observability for spoke health, performance, and federation.
 *
 * Features:
 * - Prometheus text format export
 * - Counter, gauge, and histogram metrics
 * - Latency tracking per operation type
 * - Health score calculation
 * - Custom labels for federation context
 *
 * Metrics exported:
 * - dive_spoke_authorization_decisions_total
 * - dive_spoke_authorization_latency_seconds
 * - dive_spoke_policy_sync_total
 * - dive_spoke_heartbeat_total
 * - dive_spoke_circuit_breaker_state
 * - dive_spoke_audit_queue_size
 * - dive_spoke_health_score
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface IMetricDefinition {
    name: string;
    help: string;
    type: MetricType;
    labelNames: string[];
}

export interface IMetricValue {
    value: number;
    labels: Record<string, string>;
    timestamp?: number;
}

export interface IHistogramValue {
    sum: number;
    count: number;
    buckets: Map<number, number>;
    labels: Record<string, string>;
}

export interface IMetricsConfig {
    /** Spoke identifier */
    spokeId: string;
    /** Instance code (USA, FRA, etc.) */
    instanceCode: string;
    /** Prefix for all metrics */
    prefix: string;
    /** Include timestamps in export */
    includeTimestamps: boolean;
    /** Histogram buckets for latency */
    latencyBuckets: number[];
    /** Health score calculation interval */
    healthScoreIntervalMs: number;
}

export interface IHealthScore {
    overall: number; // 0-100
    components: {
        authorization: number;
        connectivity: number;
        policySync: number;
        auditQueue: number;
    };
    status: 'healthy' | 'degraded' | 'unhealthy';
    lastCalculated: Date;
}

// Default configuration
const DEFAULT_CONFIG: IMetricsConfig = {
    spokeId: process.env.SPOKE_ID || 'local',
    instanceCode: process.env.INSTANCE_CODE || 'USA',
    prefix: 'dive_spoke',
    includeTimestamps: false,
    latencyBuckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    healthScoreIntervalMs: 30000,
};

// ============================================
// METRIC DEFINITIONS
// ============================================

const METRIC_DEFINITIONS: IMetricDefinition[] = [
    {
        name: 'authorization_decisions_total',
        help: 'Total number of authorization decisions',
        type: 'counter',
        labelNames: ['decision', 'action', 'instance'],
    },
    {
        name: 'authorization_latency_seconds',
        help: 'Authorization decision latency in seconds',
        type: 'histogram',
        labelNames: ['action', 'instance'],
    },
    {
        name: 'policy_sync_total',
        help: 'Total number of policy sync operations',
        type: 'counter',
        labelNames: ['result', 'source'],
    },
    {
        name: 'policy_version',
        help: 'Current policy version (unix timestamp of last update)',
        type: 'gauge',
        labelNames: ['version'],
    },
    {
        name: 'heartbeat_total',
        help: 'Total number of heartbeats sent',
        type: 'counter',
        labelNames: ['result'],
    },
    {
        name: 'circuit_breaker_state',
        help: 'Circuit breaker state (0=closed, 1=half_open, 2=open)',
        type: 'gauge',
        labelNames: ['target'],
    },
    {
        name: 'audit_queue_size',
        help: 'Current size of the audit queue',
        type: 'gauge',
        labelNames: [],
    },
    {
        name: 'audit_queue_sync_total',
        help: 'Total audit queue sync operations',
        type: 'counter',
        labelNames: ['result'],
    },
    {
        name: 'health_score',
        help: 'Overall health score (0-100)',
        type: 'gauge',
        labelNames: ['component'],
    },
    {
        name: 'uptime_seconds',
        help: 'Spoke uptime in seconds',
        type: 'gauge',
        labelNames: [],
    },
    {
        name: 'token_exchange_total',
        help: 'Total token exchange operations',
        type: 'counter',
        labelNames: ['result', 'origin', 'target'],
    },
    {
        name: 'cross_instance_requests_total',
        help: 'Total cross-instance requests',
        type: 'counter',
        labelNames: ['result', 'source', 'target'],
    },
    {
        name: 'cache_hits_total',
        help: 'Total cache hits',
        type: 'counter',
        labelNames: ['cache_type'],
    },
    {
        name: 'cache_misses_total',
        help: 'Total cache misses',
        type: 'counter',
        labelNames: ['cache_type'],
    },
];

// ============================================
// SPOKE METRICS SERVICE
// ============================================

class SpokeMetricsService extends EventEmitter {
    private config: IMetricsConfig;
    private counters: Map<string, Map<string, number>> = new Map();
    private gauges: Map<string, Map<string, number>> = new Map();
    private histograms: Map<string, Map<string, IHistogramValue>> = new Map();
    private startTime: Date;
    private healthScore: IHealthScore;
    private healthScoreInterval: NodeJS.Timeout | null = null;
    private initialized = false;

    constructor() {
        super();
        this.config = { ...DEFAULT_CONFIG };
        this.startTime = new Date();
        this.healthScore = this.getInitialHealthScore();
    }

    private getInitialHealthScore(): IHealthScore {
        return {
            overall: 100,
            components: {
                authorization: 100,
                connectivity: 100,
                policySync: 100,
                auditQueue: 100,
            },
            status: 'healthy',
            lastCalculated: new Date(),
        };
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    /**
     * Initialize the metrics service
     */
    initialize(config: Partial<IMetricsConfig> = {}): void {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.startTime = new Date();

        // Initialize metric stores
        for (const def of METRIC_DEFINITIONS) {
            switch (def.type) {
                case 'counter':
                    this.counters.set(def.name, new Map());
                    break;
                case 'gauge':
                    this.gauges.set(def.name, new Map());
                    break;
                case 'histogram':
                    this.histograms.set(def.name, new Map());
                    break;
            }
        }

        this.initialized = true;

        logger.info('Spoke Metrics Service initialized', {
            spokeId: this.config.spokeId,
            instanceCode: this.config.instanceCode,
            prefix: this.config.prefix,
        });

        this.emit('initialized', { config: this.config });
    }

    /**
     * Start health score calculation
     */
    startHealthScoreCalculation(): void {
        if (!this.initialized) {
            throw new Error('Metrics service not initialized');
        }

        if (this.healthScoreInterval) {
            return;
        }

        this.healthScoreInterval = setInterval(() => {
            this.calculateHealthScore();
        }, this.config.healthScoreIntervalMs);

        // Initial calculation
        this.calculateHealthScore();
    }

    /**
     * Stop health score calculation
     */
    stopHealthScoreCalculation(): void {
        if (this.healthScoreInterval) {
            clearInterval(this.healthScoreInterval);
            this.healthScoreInterval = null;
        }
    }

    // ============================================
    // COUNTER OPERATIONS
    // ============================================

    /**
     * Increment a counter metric
     */
    incrementCounter(name: string, labels: Record<string, string> = {}, value: number = 1): void {
        const counter = this.counters.get(name);
        if (!counter) {
            logger.warn(`Unknown counter: ${name}`);
            return;
        }

        const labelKey = this.serializeLabels(labels);
        const current = counter.get(labelKey) || 0;
        counter.set(labelKey, current + value);

        this.emit('counterIncremented', { name, labels, value });
    }

    /**
     * Get counter value
     */
    getCounter(name: string, labels: Record<string, string> = {}): number {
        const counter = this.counters.get(name);
        if (!counter) {
            return 0;
        }

        const labelKey = this.serializeLabels(labels);
        return counter.get(labelKey) || 0;
    }

    // ============================================
    // GAUGE OPERATIONS
    // ============================================

    /**
     * Set a gauge metric
     */
    setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
        const gauge = this.gauges.get(name);
        if (!gauge) {
            logger.warn(`Unknown gauge: ${name}`);
            return;
        }

        const labelKey = this.serializeLabels(labels);
        gauge.set(labelKey, value);

        this.emit('gaugeSet', { name, labels, value });
    }

    /**
     * Get gauge value
     */
    getGauge(name: string, labels: Record<string, string> = {}): number {
        const gauge = this.gauges.get(name);
        if (!gauge) {
            return 0;
        }

        const labelKey = this.serializeLabels(labels);
        return gauge.get(labelKey) || 0;
    }

    /**
     * Increment a gauge
     */
    incrementGauge(name: string, labels: Record<string, string> = {}, value: number = 1): void {
        const current = this.getGauge(name, labels);
        this.setGauge(name, current + value, labels);
    }

    /**
     * Decrement a gauge
     */
    decrementGauge(name: string, labels: Record<string, string> = {}, value: number = 1): void {
        const current = this.getGauge(name, labels);
        this.setGauge(name, Math.max(0, current - value), labels);
    }

    // ============================================
    // HISTOGRAM OPERATIONS
    // ============================================

    /**
     * Observe a histogram value
     */
    observeHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
        const histogram = this.histograms.get(name);
        if (!histogram) {
            logger.warn(`Unknown histogram: ${name}`);
            return;
        }

        const labelKey = this.serializeLabels(labels);
        let hist = histogram.get(labelKey);

        if (!hist) {
            hist = {
                sum: 0,
                count: 0,
                buckets: new Map(),
                labels,
            };
            // Initialize buckets
            for (const bucket of this.config.latencyBuckets) {
                hist.buckets.set(bucket, 0);
            }
            hist.buckets.set(Infinity, 0);
            histogram.set(labelKey, hist);
        }

        hist.sum += value;
        hist.count++;

        // Update buckets
        for (const bucket of this.config.latencyBuckets) {
            if (value <= bucket) {
                hist.buckets.set(bucket, (hist.buckets.get(bucket) || 0) + 1);
            }
        }
        hist.buckets.set(Infinity, (hist.buckets.get(Infinity) || 0) + 1);

        this.emit('histogramObserved', { name, labels, value });
    }

    /**
     * Get histogram stats
     */
    getHistogramStats(name: string, labels: Record<string, string> = {}): { sum: number; count: number; avg: number } | null {
        const histogram = this.histograms.get(name);
        if (!histogram) {
            return null;
        }

        const labelKey = this.serializeLabels(labels);
        const hist = histogram.get(labelKey);

        if (!hist) {
            return null;
        }

        return {
            sum: hist.sum,
            count: hist.count,
            avg: hist.count > 0 ? hist.sum / hist.count : 0,
        };
    }

    // ============================================
    // CONVENIENCE METHODS
    // ============================================

    /**
     * Record an authorization decision
     */
    recordAuthorizationDecision(
        decision: 'allow' | 'deny' | 'error',
        action: string,
        latencyMs: number,
        instance: string = 'local'
    ): void {
        this.incrementCounter('authorization_decisions_total', { decision, action, instance });
        this.observeHistogram('authorization_latency_seconds', latencyMs / 1000, { action, instance });
    }

    /**
     * Record a policy sync operation
     */
    recordPolicySync(result: 'success' | 'failure', source: string = 'hub'): void {
        this.incrementCounter('policy_sync_total', { result, source });
    }

    /**
     * Record a heartbeat
     */
    recordHeartbeat(result: 'success' | 'failure'): void {
        this.incrementCounter('heartbeat_total', { result });
    }

    /**
     * Set circuit breaker state
     */
    setCircuitBreakerState(state: 'closed' | 'half_open' | 'open', target: string = 'hub'): void {
        const stateValue = state === 'closed' ? 0 : state === 'half_open' ? 1 : 2;
        this.setGauge('circuit_breaker_state', stateValue, { target });
    }

    /**
     * Set audit queue size
     */
    setAuditQueueSize(size: number): void {
        this.setGauge('audit_queue_size', size);
    }

    /**
     * Record audit queue sync
     */
    recordAuditQueueSync(result: 'success' | 'failure'): void {
        this.incrementCounter('audit_queue_sync_total', { result });
    }

    /**
     * Record token exchange
     */
    recordTokenExchange(
        result: 'success' | 'failure',
        origin: string,
        target: string
    ): void {
        this.incrementCounter('token_exchange_total', { result, origin, target });
    }

    /**
     * Record cross-instance request
     */
    recordCrossInstanceRequest(
        result: 'success' | 'failure',
        source: string,
        target: string
    ): void {
        this.incrementCounter('cross_instance_requests_total', { result, source, target });
    }

    /**
     * Record cache hit/miss
     */
    recordCacheAccess(cacheType: string, hit: boolean): void {
        if (hit) {
            this.incrementCounter('cache_hits_total', { cache_type: cacheType });
        } else {
            this.incrementCounter('cache_misses_total', { cache_type: cacheType });
        }
    }

    // ============================================
    // HEALTH SCORE
    // ============================================

    /**
     * Calculate overall health score
     */
    calculateHealthScore(): IHealthScore {
        const now = new Date();

        // Authorization health: based on error rate
        const authAllow = this.sumCountersWithLabel('authorization_decisions_total', 'decision', 'allow');
        const authDeny = this.sumCountersWithLabel('authorization_decisions_total', 'decision', 'deny');
        const authErrors = this.sumCountersWithLabel('authorization_decisions_total', 'decision', 'error');
        const authTotal = authAllow + authDeny + authErrors;
        const authHealth = authTotal > 0 ? Math.max(0, 100 - (authErrors / authTotal) * 100) : 100;

        // Connectivity health: based on heartbeat success rate
        const heartbeatSuccess = this.sumCountersWithLabel('heartbeat_total', 'result', 'success');
        const heartbeatFailure = this.sumCountersWithLabel('heartbeat_total', 'result', 'failure');
        const heartbeatTotal = heartbeatSuccess + heartbeatFailure;
        const connectivityHealth =
            heartbeatTotal > 0 ? Math.max(0, (heartbeatSuccess / heartbeatTotal) * 100) : 100;

        // Policy sync health
        const policySyncSuccess = this.sumCountersWithLabel('policy_sync_total', 'result', 'success');
        const policySyncFailure = this.sumCountersWithLabel('policy_sync_total', 'result', 'failure');
        const policySyncTotal = policySyncSuccess + policySyncFailure;
        const policySyncHealth =
            policySyncTotal > 0 ? Math.max(0, (policySyncSuccess / policySyncTotal) * 100) : 100;

        // Audit queue health: based on queue size
        const queueSize = this.getGauge('audit_queue_size');
        const auditQueueHealth = Math.max(0, 100 - (queueSize / 100) * 10); // -10% per 100 items

        // Calculate overall (weighted average)
        const overall =
            authHealth * 0.4 +
            connectivityHealth * 0.3 +
            policySyncHealth * 0.2 +
            auditQueueHealth * 0.1;

        // Determine status
        let status: IHealthScore['status'];
        if (overall >= 80) {
            status = 'healthy';
        } else if (overall >= 50) {
            status = 'degraded';
        } else {
            status = 'unhealthy';
        }

        this.healthScore = {
            overall: Math.round(overall * 10) / 10,
            components: {
                authorization: Math.round(authHealth * 10) / 10,
                connectivity: Math.round(connectivityHealth * 10) / 10,
                policySync: Math.round(policySyncHealth * 10) / 10,
                auditQueue: Math.round(auditQueueHealth * 10) / 10,
            },
            status,
            lastCalculated: now,
        };

        // Update gauge
        this.setGauge('health_score', this.healthScore.overall, { component: 'overall' });
        this.setGauge('health_score', this.healthScore.components.authorization, { component: 'authorization' });
        this.setGauge('health_score', this.healthScore.components.connectivity, { component: 'connectivity' });
        this.setGauge('health_score', this.healthScore.components.policySync, { component: 'policy_sync' });
        this.setGauge('health_score', this.healthScore.components.auditQueue, { component: 'audit_queue' });

        this.emit('healthScoreCalculated', this.healthScore);

        return this.healthScore;
    }

    /**
     * Get current health score
     */
    getHealthScore(): IHealthScore {
        return { ...this.healthScore };
    }

    // ============================================
    // PROMETHEUS EXPORT
    // ============================================

    /**
     * Export metrics in Prometheus text format
     */
    exportPrometheus(): string {
        const lines: string[] = [];
        const prefix = this.config.prefix;
        const defaultLabels = {
            spoke_id: this.config.spokeId,
            instance_code: this.config.instanceCode,
        };

        // Export counters
        for (const def of METRIC_DEFINITIONS.filter((d) => d.type === 'counter')) {
            const counter = this.counters.get(def.name);
            if (counter) {
                lines.push(`# HELP ${prefix}_${def.name} ${def.help}`);
                lines.push(`# TYPE ${prefix}_${def.name} counter`);

                for (const [labelKey, value] of counter) {
                    const labels = { ...defaultLabels, ...this.deserializeLabels(labelKey) };
                    lines.push(`${prefix}_${def.name}${this.formatLabels(labels)} ${value}`);
                }
            }
        }

        // Export gauges
        for (const def of METRIC_DEFINITIONS.filter((d) => d.type === 'gauge')) {
            const gauge = this.gauges.get(def.name);
            if (gauge) {
                lines.push(`# HELP ${prefix}_${def.name} ${def.help}`);
                lines.push(`# TYPE ${prefix}_${def.name} gauge`);

                for (const [labelKey, value] of gauge) {
                    const labels = { ...defaultLabels, ...this.deserializeLabels(labelKey) };
                    lines.push(`${prefix}_${def.name}${this.formatLabels(labels)} ${value}`);
                }
            }
        }

        // Export uptime
        const uptimeSeconds = (Date.now() - this.startTime.getTime()) / 1000;
        lines.push(`# HELP ${prefix}_uptime_seconds Spoke uptime in seconds`);
        lines.push(`# TYPE ${prefix}_uptime_seconds gauge`);
        lines.push(`${prefix}_uptime_seconds${this.formatLabels(defaultLabels)} ${uptimeSeconds}`);

        // Export histograms
        for (const def of METRIC_DEFINITIONS.filter((d) => d.type === 'histogram')) {
            const histogram = this.histograms.get(def.name);
            if (histogram && histogram.size > 0) {
                lines.push(`# HELP ${prefix}_${def.name} ${def.help}`);
                lines.push(`# TYPE ${prefix}_${def.name} histogram`);

                for (const [, hist] of histogram) {
                    const labels = { ...defaultLabels, ...hist.labels };
                    const labelStr = this.formatLabels(labels);

                    // Buckets
                    for (const bucket of this.config.latencyBuckets) {
                        const bucketLabels = { ...labels, le: bucket.toString() };
                        lines.push(
                            `${prefix}_${def.name}_bucket${this.formatLabels(bucketLabels)} ${hist.buckets.get(bucket) || 0}`
                        );
                    }
                    const infLabels = { ...labels, le: '+Inf' };
                    lines.push(
                        `${prefix}_${def.name}_bucket${this.formatLabels(infLabels)} ${hist.buckets.get(Infinity) || 0}`
                    );

                    // Sum and count
                    lines.push(`${prefix}_${def.name}_sum${labelStr} ${hist.sum}`);
                    lines.push(`${prefix}_${def.name}_count${labelStr} ${hist.count}`);
                }
            }
        }

        return lines.join('\n');
    }

    // ============================================
    // HELPERS
    // ============================================

    /**
     * Sum all counter values that have a specific label value
     */
    private sumCountersWithLabel(counterName: string, labelName: string, labelValue: string): number {
        const counter = this.counters.get(counterName);
        if (!counter) {
            return 0;
        }

        let sum = 0;
        for (const [labelKey, value] of counter) {
            if (labelKey.includes(`${labelName}="${labelValue}"`)) {
                sum += value;
            }
        }
        return sum;
    }

    /**
     * Serialize labels to string key
     */
    private serializeLabels(labels: Record<string, string>): string {
        const sorted = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
        return sorted.map(([k, v]) => `${k}="${v}"`).join(',');
    }

    /**
     * Deserialize labels from string key
     */
    private deserializeLabels(labelKey: string): Record<string, string> {
        if (!labelKey) {
            return {};
        }

        const labels: Record<string, string> = {};
        const matches = labelKey.match(/(\w+)="([^"]*)"/g);

        if (matches) {
            for (const match of matches) {
                const [key, value] = match.split('=');
                labels[key] = value.replace(/"/g, '');
            }
        }

        return labels;
    }

    /**
     * Format labels for Prometheus
     */
    private formatLabels(labels: Record<string, string>): string {
        const entries = Object.entries(labels);
        if (entries.length === 0) {
            return '';
        }

        return '{' + entries.map(([k, v]) => `${k}="${v}"`).join(',') + '}';
    }

    /**
     * Reset all metrics
     */
    reset(): void {
        this.counters.clear();
        this.gauges.clear();
        this.histograms.clear();
        this.healthScore = this.getInitialHealthScore();
        this.startTime = new Date();

        // Re-initialize metric stores
        for (const def of METRIC_DEFINITIONS) {
            switch (def.type) {
                case 'counter':
                    this.counters.set(def.name, new Map());
                    break;
                case 'gauge':
                    this.gauges.set(def.name, new Map());
                    break;
                case 'histogram':
                    this.histograms.set(def.name, new Map());
                    break;
            }
        }

        logger.info('Metrics reset');
        this.emit('reset');
    }

    /**
     * Shutdown the service
     */
    shutdown(): void {
        this.stopHealthScoreCalculation();
        this.initialized = false;

        logger.info('Spoke Metrics Service shutdown');
        this.emit('shutdown');
    }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const spokeMetrics = new SpokeMetricsService();

export default SpokeMetricsService;
