/**
 * KAS Prometheus Metrics
 * 
 * Implements comprehensive metrics collection for the Key Access Service.
 * Provides visibility into federation operations, key requests, and system health.
 * 
 * Metrics categories:
 * - Key request metrics (requests, latency, success/failure)
 * - Federation metrics (cross-instance communication)
 * - Circuit breaker metrics (availability tracking)
 * - DEK cache metrics (cache hits/misses)
 * 
 * Reference: ACP-240 Section 6 (Audit & Monitoring)
 */

import { kasLogger } from './kas-logger';

// ============================================
// Metric Types
// ============================================

interface ICounter {
    labels: Record<string, string>;
    value: number;
}

interface IHistogram {
    labels: Record<string, string>;
    buckets: Map<number, number>;
    sum: number;
    count: number;
}

interface IGauge {
    labels: Record<string, string>;
    value: number;
}

// ============================================
// Metrics Registry
// ============================================

class MetricsRegistry {
    private counters: Map<string, ICounter[]> = new Map();
    private histograms: Map<string, IHistogram[]> = new Map();
    private gauges: Map<string, IGauge[]> = new Map();
    private metricDescriptions: Map<string, { help: string; type: string }> = new Map();
    
    constructor() {
        this.initializeMetrics();
    }
    
    private initializeMetrics(): void {
        // Key Request Metrics
        this.registerCounter('kas_key_requests_total', 'Total number of key requests');
        this.registerCounter('kas_key_requests_success_total', 'Total number of successful key requests');
        this.registerCounter('kas_key_requests_denied_total', 'Total number of denied key requests');
        this.registerCounter('kas_key_requests_error_total', 'Total number of errored key requests');
        
        // Federation Metrics
        this.registerCounter('kas_federation_requests_total', 'Total number of federated key requests');
        this.registerCounter('kas_federation_success_total', 'Total number of successful federated requests');
        this.registerCounter('kas_federation_denied_total', 'Total number of denied federated requests');
        this.registerCounter('kas_federation_error_total', 'Total number of errored federated requests');
        
        // Latency Histograms
        this.registerHistogram('kas_key_request_duration_seconds', 'Key request duration in seconds');
        this.registerHistogram('kas_federation_request_duration_seconds', 'Federation request duration in seconds');
        this.registerHistogram('kas_opa_evaluation_duration_seconds', 'OPA policy evaluation duration in seconds');
        
        // DEK Cache Metrics
        this.registerCounter('kas_dek_cache_hits_total', 'Total DEK cache hits');
        this.registerCounter('kas_dek_cache_misses_total', 'Total DEK cache misses');
        this.registerGauge('kas_dek_cache_size', 'Current DEK cache size');
        
        // Circuit Breaker Metrics
        this.registerGauge('kas_circuit_breaker_state', 'Circuit breaker state (0=closed, 1=half-open, 2=open)');
        this.registerCounter('kas_circuit_breaker_trips_total', 'Total circuit breaker trips');
        
        // Multi-KAO Metrics
        this.registerCounter('kas_multi_kao_attempts_total', 'Total multi-KAO decryption attempts');
        this.registerCounter('kas_multi_kao_fallback_used_total', 'Total times fallback KAO was used');
        this.registerHistogram('kas_multi_kao_attempts_per_request', 'Number of KAO attempts per request');
        
        // Authorization Metrics
        this.registerCounter('kas_authz_clearance_check_pass', 'Clearance checks passed');
        this.registerCounter('kas_authz_clearance_check_fail', 'Clearance checks failed');
        this.registerCounter('kas_authz_country_check_pass', 'Country/releasability checks passed');
        this.registerCounter('kas_authz_country_check_fail', 'Country/releasability checks failed');
        this.registerCounter('kas_authz_coi_check_pass', 'COI checks passed');
        this.registerCounter('kas_authz_coi_check_fail', 'COI checks failed');
        
        kasLogger.info('KAS metrics initialized', {
            counters: this.counters.size,
            histograms: this.histograms.size,
            gauges: this.gauges.size,
        });
    }
    
    private registerCounter(name: string, help: string): void {
        this.counters.set(name, []);
        this.metricDescriptions.set(name, { help, type: 'counter' });
    }
    
    private registerHistogram(name: string, help: string): void {
        this.histograms.set(name, []);
        this.metricDescriptions.set(name, { help, type: 'histogram' });
    }
    
    private registerGauge(name: string, help: string): void {
        this.gauges.set(name, []);
        this.metricDescriptions.set(name, { help, type: 'gauge' });
    }
    
    // ============================================
    // Counter Operations
    // ============================================
    
    incCounter(name: string, labels: Record<string, string> = {}, value: number = 1): void {
        const counters = this.counters.get(name);
        if (!counters) {
            kasLogger.warn('Unknown counter metric', { name });
            return;
        }
        
        const labelKey = JSON.stringify(labels);
        let counter = counters.find(c => JSON.stringify(c.labels) === labelKey);
        
        if (!counter) {
            counter = { labels, value: 0 };
            counters.push(counter);
        }
        
        counter.value += value;
    }
    
    // ============================================
    // Histogram Operations
    // ============================================
    
    private readonly defaultBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
    
    observeHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
        const histograms = this.histograms.get(name);
        if (!histograms) {
            kasLogger.warn('Unknown histogram metric', { name });
            return;
        }
        
        const labelKey = JSON.stringify(labels);
        let histogram = histograms.find(h => JSON.stringify(h.labels) === labelKey);
        
        if (!histogram) {
            histogram = {
                labels,
                buckets: new Map(this.defaultBuckets.map(b => [b, 0])),
                sum: 0,
                count: 0,
            };
            histograms.push(histogram);
        }
        
        histogram.sum += value;
        histogram.count += 1;
        
        // Update buckets
        for (const bucket of this.defaultBuckets) {
            if (value <= bucket) {
                histogram.buckets.set(bucket, (histogram.buckets.get(bucket) || 0) + 1);
            }
        }
    }
    
    // ============================================
    // Gauge Operations
    // ============================================
    
    setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
        const gauges = this.gauges.get(name);
        if (!gauges) {
            kasLogger.warn('Unknown gauge metric', { name });
            return;
        }
        
        const labelKey = JSON.stringify(labels);
        let gauge = gauges.find(g => JSON.stringify(g.labels) === labelKey);
        
        if (!gauge) {
            gauge = { labels, value: 0 };
            gauges.push(gauge);
        }
        
        gauge.value = value;
    }
    
    incGauge(name: string, labels: Record<string, string> = {}, value: number = 1): void {
        const gauges = this.gauges.get(name);
        if (!gauges) return;
        
        const labelKey = JSON.stringify(labels);
        let gauge = gauges.find(g => JSON.stringify(g.labels) === labelKey);
        
        if (!gauge) {
            gauge = { labels, value: 0 };
            gauges.push(gauge);
        }
        
        gauge.value += value;
    }
    
    decGauge(name: string, labels: Record<string, string> = {}, value: number = 1): void {
        this.incGauge(name, labels, -value);
    }
    
    // ============================================
    // Export Prometheus Format
    // ============================================
    
    toPrometheusFormat(): string {
        const lines: string[] = [];
        
        // Export counters
        for (const [name, counters] of this.counters) {
            const desc = this.metricDescriptions.get(name);
            lines.push(`# HELP ${name} ${desc?.help || ''}`);
            lines.push(`# TYPE ${name} counter`);
            
            for (const counter of counters) {
                const labelStr = this.formatLabels(counter.labels);
                lines.push(`${name}${labelStr} ${counter.value}`);
            }
            lines.push('');
        }
        
        // Export histograms
        for (const [name, histograms] of this.histograms) {
            const desc = this.metricDescriptions.get(name);
            lines.push(`# HELP ${name} ${desc?.help || ''}`);
            lines.push(`# TYPE ${name} histogram`);
            
            for (const histogram of histograms) {
                const baseLabels = this.formatLabels(histogram.labels);
                
                // Bucket entries
                let cumulative = 0;
                for (const [bucket, count] of Array.from(histogram.buckets.entries()).sort((a, b) => a[0] - b[0])) {
                    cumulative += count;
                    const bucketLabels = histogram.labels;
                    lines.push(`${name}_bucket${this.formatLabels({ ...bucketLabels, le: bucket.toString() })} ${cumulative}`);
                }
                lines.push(`${name}_bucket${this.formatLabels({ ...histogram.labels, le: '+Inf' })} ${histogram.count}`);
                lines.push(`${name}_sum${baseLabels} ${histogram.sum}`);
                lines.push(`${name}_count${baseLabels} ${histogram.count}`);
            }
            lines.push('');
        }
        
        // Export gauges
        for (const [name, gauges] of this.gauges) {
            const desc = this.metricDescriptions.get(name);
            lines.push(`# HELP ${name} ${desc?.help || ''}`);
            lines.push(`# TYPE ${name} gauge`);
            
            for (const gauge of gauges) {
                const labelStr = this.formatLabels(gauge.labels);
                lines.push(`${name}${labelStr} ${gauge.value}`);
            }
            lines.push('');
        }
        
        return lines.join('\n');
    }
    
    private formatLabels(labels: Record<string, string>): string {
        const entries = Object.entries(labels);
        if (entries.length === 0) return '';
        
        const parts = entries.map(([key, value]) => `${key}="${value}"`);
        return `{${parts.join(',')}}`;
    }
    
    // ============================================
    // JSON Export (for debugging)
    // ============================================
    
    toJSON(): Record<string, unknown> {
        return {
            counters: Object.fromEntries(
                Array.from(this.counters.entries()).map(([name, values]) => [
                    name,
                    values.map(v => ({ labels: v.labels, value: v.value })),
                ])
            ),
            histograms: Object.fromEntries(
                Array.from(this.histograms.entries()).map(([name, values]) => [
                    name,
                    values.map(v => ({
                        labels: v.labels,
                        sum: v.sum,
                        count: v.count,
                        buckets: Object.fromEntries(v.buckets),
                    })),
                ])
            ),
            gauges: Object.fromEntries(
                Array.from(this.gauges.entries()).map(([name, values]) => [
                    name,
                    values.map(v => ({ labels: v.labels, value: v.value })),
                ])
            ),
        };
    }
}

// ============================================
// KAS Metrics Helper Functions
// ============================================

export const kasMetrics = new MetricsRegistry();

/**
 * Record a key request
 */
export function recordKeyRequest(params: {
    outcome: 'success' | 'denied' | 'error';
    durationMs: number;
    kasId?: string;
    clearanceCheck?: 'pass' | 'fail';
    countryCheck?: 'pass' | 'fail';
    coiCheck?: 'pass' | 'fail';
}): void {
    const labels = params.kasId ? { kas_id: params.kasId } : {};
    
    kasMetrics.incCounter('kas_key_requests_total', labels);
    
    switch (params.outcome) {
        case 'success':
            kasMetrics.incCounter('kas_key_requests_success_total', labels);
            break;
        case 'denied':
            kasMetrics.incCounter('kas_key_requests_denied_total', labels);
            break;
        case 'error':
            kasMetrics.incCounter('kas_key_requests_error_total', labels);
            break;
    }
    
    // Record latency (convert ms to seconds)
    kasMetrics.observeHistogram('kas_key_request_duration_seconds', params.durationMs / 1000, labels);
    
    // Record authorization check metrics
    if (params.clearanceCheck) {
        kasMetrics.incCounter(
            params.clearanceCheck === 'pass' ? 'kas_authz_clearance_check_pass' : 'kas_authz_clearance_check_fail',
            labels
        );
    }
    if (params.countryCheck) {
        kasMetrics.incCounter(
            params.countryCheck === 'pass' ? 'kas_authz_country_check_pass' : 'kas_authz_country_check_fail',
            labels
        );
    }
    if (params.coiCheck) {
        kasMetrics.incCounter(
            params.coiCheck === 'pass' ? 'kas_authz_coi_check_pass' : 'kas_authz_coi_check_fail',
            labels
        );
    }
}

/**
 * Record a federation request
 */
export function recordFederationRequest(params: {
    outcome: 'success' | 'denied' | 'error';
    durationMs: number;
    originKasId: string;
    targetKasId: string;
}): void {
    const labels = {
        origin_kas: params.originKasId,
        target_kas: params.targetKasId,
    };
    
    kasMetrics.incCounter('kas_federation_requests_total', labels);
    
    switch (params.outcome) {
        case 'success':
            kasMetrics.incCounter('kas_federation_success_total', labels);
            break;
        case 'denied':
            kasMetrics.incCounter('kas_federation_denied_total', labels);
            break;
        case 'error':
            kasMetrics.incCounter('kas_federation_error_total', labels);
            break;
    }
    
    kasMetrics.observeHistogram('kas_federation_request_duration_seconds', params.durationMs / 1000, labels);
}

/**
 * Record OPA evaluation
 */
export function recordOPAEvaluation(durationMs: number): void {
    kasMetrics.observeHistogram('kas_opa_evaluation_duration_seconds', durationMs / 1000);
}

/**
 * Record DEK cache operation
 */
export function recordDEKCacheOperation(hit: boolean): void {
    if (hit) {
        kasMetrics.incCounter('kas_dek_cache_hits_total');
    } else {
        kasMetrics.incCounter('kas_dek_cache_misses_total');
    }
}

/**
 * Update DEK cache size
 */
export function updateDEKCacheSize(size: number): void {
    kasMetrics.setGauge('kas_dek_cache_size', size);
}

/**
 * Record circuit breaker state change
 */
export function recordCircuitBreakerState(kasId: string, state: 'closed' | 'half-open' | 'open'): void {
    const stateValue = state === 'closed' ? 0 : state === 'half-open' ? 1 : 2;
    kasMetrics.setGauge('kas_circuit_breaker_state', stateValue, { kas_id: kasId });
    
    if (state === 'open') {
        kasMetrics.incCounter('kas_circuit_breaker_trips_total', { kas_id: kasId });
    }
}

/**
 * Record multi-KAO attempt
 */
export function recordMultiKAOAttempt(params: {
    totalAttempts: number;
    successfulAttempt: number;
    fallbackUsed: boolean;
}): void {
    kasMetrics.incCounter('kas_multi_kao_attempts_total');
    
    if (params.fallbackUsed) {
        kasMetrics.incCounter('kas_multi_kao_fallback_used_total');
    }
    
    kasMetrics.observeHistogram('kas_multi_kao_attempts_per_request', params.totalAttempts);
}

/**
 * Get metrics in Prometheus format
 */
export function getPrometheusMetrics(): string {
    return kasMetrics.toPrometheusFormat();
}

/**
 * Get metrics as JSON (for debugging)
 */
export function getMetricsJSON(): Record<string, unknown> {
    return kasMetrics.toJSON();
}






