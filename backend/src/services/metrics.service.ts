/**
 * Metrics Service
 * 
 * Provides Prometheus-compatible metrics for observability
 * Lightweight implementation for pilot/PoC
 * 
 * Metrics tracked:
 * - IdP approval duration
 * - IdP test success rate
 * - Validation failures
 * - API response times
 */

import { logger } from '../utils/logger';

/**
 * In-memory metrics store (simple for pilot)
 * For production, consider prom-client library
 */
interface IMetrics {
    idpApprovalDurations: number[];
    idpTestResults: { success: number; failed: number };
    validationFailures: Map<string, number>;
    apiRequests: { total: number; errors: number };
    lastReset: Date;
}

class MetricsService {
    private metrics: IMetrics;

    constructor() {
        this.metrics = {
            idpApprovalDurations: [],
            idpTestResults: { success: 0, failed: 0 },
            validationFailures: new Map(),
            apiRequests: { total: 0, errors: 0 },
            lastReset: new Date()
        };
    }

    /**
     * Record IdP approval duration
     */
    recordApprovalDuration(durationMs: number): void {
        this.metrics.idpApprovalDurations.push(durationMs);
        
        // Keep only last 1000 data points (memory management for pilot)
        if (this.metrics.idpApprovalDurations.length > 1000) {
            this.metrics.idpApprovalDurations.shift();
        }
        
        logger.debug('Recorded approval duration', { durationMs });
    }

    /**
     * Record IdP test result
     */
    recordTestResult(success: boolean): void {
        if (success) {
            this.metrics.idpTestResults.success++;
        } else {
            this.metrics.idpTestResults.failed++;
        }
    }

    /**
     * Record validation failure (Phase 1)
     * 
     * @param protocol - IdP protocol (oidc or saml)
     * @param failures - Array of failure reasons
     */
    recordValidationFailure(protocol: string, failures: string[]): void {
        // Record by protocol
        const protocolKey = `${protocol}_failure`;
        const current = this.metrics.validationFailures.get(protocolKey) || 0;
        this.metrics.validationFailures.set(protocolKey, current + 1);
        
        // Record by failure type
        failures.forEach(failure => {
            const key = failure.split(':')[0].trim(); // Extract failure type
            const count = this.metrics.validationFailures.get(key) || 0;
            this.metrics.validationFailures.set(key, count + 1);
        });
        
        logger.debug('Recorded validation failure', { protocol, failureCount: failures.length });
    }
    
    /**
     * Record validation success (Phase 1)
     * 
     * @param protocol - IdP protocol (oidc or saml)
     * @param score - Validation score
     */
    recordValidationSuccess(protocol: string, score: number): void {
        const key = `${protocol}_success`;
        const current = this.metrics.validationFailures.get(key) || 0;
        this.metrics.validationFailures.set(key, current + 1);
        
        logger.debug('Recorded validation success', { protocol, score });
    }

    /**
     * Record API request
     */
    recordAPIRequest(isError: boolean = false): void {
        this.metrics.apiRequests.total++;
        if (isError) {
            this.metrics.apiRequests.errors++;
        }
    }

    /**
     * Calculate percentile (p50, p95, p99)
     */
    private calculatePercentile(values: number[], percentile: number): number {
        if (values.length === 0) return 0;
        
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[index];
    }

    /**
     * Get metrics summary
     */
    getSummary() {
        const approvalDurations = this.metrics.idpApprovalDurations;
        const testResults = this.metrics.idpTestResults;
        const totalTests = testResults.success + testResults.failed;
        
        return {
            approvalDurations: {
                count: approvalDurations.length,
                p50: this.calculatePercentile(approvalDurations, 50),
                p95: this.calculatePercentile(approvalDurations, 95),
                p99: this.calculatePercentile(approvalDurations, 99),
                avg: approvalDurations.length > 0
                    ? approvalDurations.reduce((a, b) => a + b, 0) / approvalDurations.length
                    : 0
            },
            testResults: {
                total: totalTests,
                success: testResults.success,
                failed: testResults.failed,
                successRate: totalTests > 0 ? (testResults.success / totalTests) * 100 : 0
            },
            validationFailures: {
                total: Array.from(this.metrics.validationFailures.values()).reduce((a, b) => a + b, 0),
                byType: Object.fromEntries(this.metrics.validationFailures)
            },
            apiRequests: {
                total: this.metrics.apiRequests.total,
                errors: this.metrics.apiRequests.errors,
                errorRate: this.metrics.apiRequests.total > 0
                    ? (this.metrics.apiRequests.errors / this.metrics.apiRequests.total) * 100
                    : 0
            },
            lastReset: this.metrics.lastReset.toISOString()
        };
    }

    /**
     * Export metrics in Prometheus text format
     * Simple implementation for pilot - just key metrics
     */
    exportPrometheus(): string {
        const summary = this.getSummary();
        const lines: string[] = [];

        // Help text and type declarations
        lines.push('# HELP idp_approval_duration_seconds_p95 95th percentile of IdP approval duration');
        lines.push('# TYPE idp_approval_duration_seconds_p95 gauge');
        lines.push(`idp_approval_duration_seconds_p95 ${(summary.approvalDurations.p95 / 1000).toFixed(3)}`);

        lines.push('# HELP idp_test_success_total Total number of successful IdP tests');
        lines.push('# TYPE idp_test_success_total counter');
        lines.push(`idp_test_success_total ${summary.testResults.success}`);

        lines.push('# HELP idp_test_failed_total Total number of failed IdP tests');
        lines.push('# TYPE idp_test_failed_total counter');
        lines.push(`idp_test_failed_total ${summary.testResults.failed}`);

        lines.push('# HELP idp_test_success_rate Success rate of IdP tests (percentage)');
        lines.push('# TYPE idp_test_success_rate gauge');
        lines.push(`idp_test_success_rate ${summary.testResults.successRate.toFixed(2)}`);

        lines.push('# HELP idp_validation_failures_total Total validation failures by type');
        lines.push('# TYPE idp_validation_failures_total counter');
        for (const [type, count] of Object.entries(summary.validationFailures.byType)) {
            lines.push(`idp_validation_failures_total{failure_type="${type}"} ${count}`);
        }

        lines.push('# HELP api_requests_total Total API requests');
        lines.push('# TYPE api_requests_total counter');
        lines.push(`api_requests_total ${summary.apiRequests.total}`);

        lines.push('# HELP api_errors_total Total API errors');
        lines.push('# TYPE api_errors_total counter');
        lines.push(`api_errors_total ${summary.apiRequests.errors}`);

        lines.push('# HELP api_error_rate API error rate (percentage)');
        lines.push('# TYPE api_error_rate gauge');
        lines.push(`api_error_rate ${summary.apiRequests.errorRate.toFixed(2)}`);

        return lines.join('\n') + '\n';
    }

    /**
     * Reset metrics (for testing or daily rollover)
     */
    reset(): void {
        this.metrics = {
            idpApprovalDurations: [],
            idpTestResults: { success: 0, failed: 0 },
            validationFailures: new Map(),
            apiRequests: { total: 0, errors: 0 },
            lastReset: new Date()
        };
        
        logger.info('Metrics reset');
    }
}

// Export singleton instance
export const metricsService = new MetricsService();
