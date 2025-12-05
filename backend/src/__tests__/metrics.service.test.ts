/**
 * Metrics Service Test Suite
 * Target: 95%+ coverage for metrics.service.ts
 * 
 * Tests:
 * - Recording approval durations (with memory management)
 * - Recording test results (success/failure)
 * - Recording validation failures
 * - Recording API requests
 * - Calculating percentiles (p50, p95, p99)
 * - Getting metrics summary
 * - Exporting Prometheus format
 * - Resetting metrics
 */

import { metricsService } from '../services/metrics.service';

// Mock logger
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

describe('Metrics Service', () => {
    beforeEach(() => {
        // Reset metrics before each test
        metricsService.reset();
        jest.clearAllMocks();
    });

    describe('recordApprovalDuration', () => {
        it('should record approval duration', () => {
            metricsService.recordApprovalDuration(1500);

            const summary = metricsService.getSummary();
            expect(summary.approvalDurations.count).toBe(1);
            expect(summary.approvalDurations.avg).toBe(1500);
        });

        it('should record multiple approval durations', () => {
            metricsService.recordApprovalDuration(1000);
            metricsService.recordApprovalDuration(2000);
            metricsService.recordApprovalDuration(3000);

            const summary = metricsService.getSummary();
            expect(summary.approvalDurations.count).toBe(3);
            expect(summary.approvalDurations.avg).toBe(2000);
        });

        it('should keep only last 1000 data points', () => {
            // Add 1001 data points
            for (let i = 0; i < 1001; i++) {
                metricsService.recordApprovalDuration(i * 100);
            }

            const summary = metricsService.getSummary();
            expect(summary.approvalDurations.count).toBe(1000);
        });
    });

    describe('recordTestResult', () => {
        it('should record successful test result', () => {
            metricsService.recordTestResult(true);

            const summary = metricsService.getSummary();
            expect(summary.testResults.success).toBe(1);
            expect(summary.testResults.failed).toBe(0);
            expect(summary.testResults.successRate).toBe(100);
        });

        it('should record failed test result', () => {
            metricsService.recordTestResult(false);

            const summary = metricsService.getSummary();
            expect(summary.testResults.success).toBe(0);
            expect(summary.testResults.failed).toBe(1);
            expect(summary.testResults.successRate).toBe(0);
        });

        it('should calculate success rate correctly', () => {
            metricsService.recordTestResult(true);
            metricsService.recordTestResult(true);
            metricsService.recordTestResult(false);

            const summary = metricsService.getSummary();
            expect(summary.testResults.total).toBe(3);
            expect(summary.testResults.success).toBe(2);
            expect(summary.testResults.failed).toBe(1);
            expect(summary.testResults.successRate).toBeCloseTo(66.67, 1);
        });

        it('should handle zero tests', () => {
            const summary = metricsService.getSummary();
            expect(summary.testResults.successRate).toBe(0);
        });
    });

    describe('recordValidationFailure', () => {
        it('should record validation failure by protocol', () => {
            metricsService.recordValidationFailure('oidc', ['Missing issuer']);

            const summary = metricsService.getSummary();
            expect(summary.validationFailures.byType['oidc_failure']).toBe(1);
        });

        it('should record validation failure by failure type', () => {
            metricsService.recordValidationFailure('saml', [
                'Missing entity ID: Required field',
                'Invalid certificate: Expired'
            ]);

            const summary = metricsService.getSummary();
            expect(summary.validationFailures.byType['saml_failure']).toBe(1);
            expect(summary.validationFailures.byType['Missing entity ID']).toBe(1);
            expect(summary.validationFailures.byType['Invalid certificate']).toBe(1);
        });

        it('should increment existing failure counts', () => {
            metricsService.recordValidationFailure('oidc', ['Missing issuer']);
            metricsService.recordValidationFailure('oidc', ['Missing issuer']);

            const summary = metricsService.getSummary();
            expect(summary.validationFailures.byType['oidc_failure']).toBe(2);
            expect(summary.validationFailures.byType['Missing issuer']).toBe(2);
        });

        it('should calculate total validation failures', () => {
            metricsService.recordValidationFailure('oidc', ['Error 1', 'Error 2']);
            metricsService.recordValidationFailure('saml', ['Error 3']);

            const summary = metricsService.getSummary();
            expect(summary.validationFailures.total).toBeGreaterThan(0);
        });
    });

    describe('recordValidationSuccess', () => {
        it('should record validation success', () => {
            metricsService.recordValidationSuccess('oidc', 95);

            const summary = metricsService.getSummary();
            expect(summary.validationFailures.byType['oidc_success']).toBe(1);
        });

        it('should increment existing success counts', () => {
            metricsService.recordValidationSuccess('saml', 100);
            metricsService.recordValidationSuccess('saml', 98);

            const summary = metricsService.getSummary();
            expect(summary.validationFailures.byType['saml_success']).toBe(2);
        });
    });

    describe('recordAPIRequest', () => {
        it('should record successful API request', () => {
            metricsService.recordAPIRequest(false);

            const summary = metricsService.getSummary();
            expect(summary.apiRequests.total).toBe(1);
            expect(summary.apiRequests.errors).toBe(0);
            expect(summary.apiRequests.errorRate).toBe(0);
        });

        it('should record API request with error', () => {
            metricsService.recordAPIRequest(true);

            const summary = metricsService.getSummary();
            expect(summary.apiRequests.total).toBe(1);
            expect(summary.apiRequests.errors).toBe(1);
            expect(summary.apiRequests.errorRate).toBe(100);
        });

        it('should calculate error rate correctly', () => {
            metricsService.recordAPIRequest(false);
            metricsService.recordAPIRequest(false);
            metricsService.recordAPIRequest(true);

            const summary = metricsService.getSummary();
            expect(summary.apiRequests.total).toBe(3);
            expect(summary.apiRequests.errors).toBe(1);
            expect(summary.apiRequests.errorRate).toBeCloseTo(33.33, 1);
        });

        it('should handle default parameter (no error)', () => {
            metricsService.recordAPIRequest();

            const summary = metricsService.getSummary();
            expect(summary.apiRequests.total).toBe(1);
            expect(summary.apiRequests.errors).toBe(0);
        });
    });

    describe('Percentile Calculation', () => {
        it('should calculate p50 correctly', () => {
            const durations = [100, 200, 300, 400, 500];
            durations.forEach(d => metricsService.recordApprovalDuration(d));

            const summary = metricsService.getSummary();
            expect(summary.approvalDurations.p50).toBe(300);
        });

        it('should calculate p95 correctly', () => {
            for (let i = 1; i <= 100; i++) {
                metricsService.recordApprovalDuration(i * 10);
            }

            const summary = metricsService.getSummary();
            expect(summary.approvalDurations.p95).toBe(950);
        });

        it('should calculate p99 correctly', () => {
            for (let i = 1; i <= 100; i++) {
                metricsService.recordApprovalDuration(i * 10);
            }

            const summary = metricsService.getSummary();
            expect(summary.approvalDurations.p99).toBe(990);
        });

        it('should return 0 for empty data', () => {
            const summary = metricsService.getSummary();
            expect(summary.approvalDurations.p50).toBe(0);
            expect(summary.approvalDurations.p95).toBe(0);
            expect(summary.approvalDurations.p99).toBe(0);
            expect(summary.approvalDurations.avg).toBe(0);
        });

        it('should handle single value', () => {
            metricsService.recordApprovalDuration(1000);

            const summary = metricsService.getSummary();
            expect(summary.approvalDurations.p50).toBe(1000);
            expect(summary.approvalDurations.p95).toBe(1000);
            expect(summary.approvalDurations.p99).toBe(1000);
        });
    });

    describe('getSummary', () => {
        it('should return complete summary', () => {
            metricsService.recordApprovalDuration(1000);
            metricsService.recordTestResult(true);
            metricsService.recordValidationFailure('oidc', ['Error']);
            metricsService.recordAPIRequest(false);

            const summary = metricsService.getSummary();

            expect(summary).toHaveProperty('approvalDurations');
            expect(summary).toHaveProperty('testResults');
            expect(summary).toHaveProperty('validationFailures');
            expect(summary).toHaveProperty('apiRequests');
            expect(summary).toHaveProperty('lastReset');
        });

        it('should include lastReset timestamp', () => {
            const summary = metricsService.getSummary();
            expect(summary.lastReset).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        });
    });

    describe('exportPrometheus', () => {
        it('should export in Prometheus text format', () => {
            metricsService.recordApprovalDuration(1000);
            metricsService.recordTestResult(true);
            metricsService.recordAPIRequest(false);

            const prometheus = metricsService.exportPrometheus();

            expect(prometheus).toContain('# HELP');
            expect(prometheus).toContain('# TYPE');
            expect(prometheus).toContain('idp_approval_duration_seconds_p95');
            expect(prometheus).toContain('idp_test_success_total');
            expect(prometheus).toContain('idp_test_failed_total');
            expect(prometheus).toContain('api_requests_total');
            expect(prometheus).toContain('api_errors_total');
        });

        it('should convert milliseconds to seconds for duration', () => {
            metricsService.recordApprovalDuration(1500); // 1.5 seconds

            const prometheus = metricsService.exportPrometheus();
            expect(prometheus).toContain('idp_approval_duration_seconds_p95 1.');
        });

        it('should include failure types as labels', () => {
            metricsService.recordValidationFailure('oidc', ['Missing issuer']);

            const prometheus = metricsService.exportPrometheus();
            expect(prometheus).toContain('idp_validation_failures_total{failure_type="');
        });

        it('should end with newline', () => {
            const prometheus = metricsService.exportPrometheus();
            expect(prometheus).toMatch(/\n$/);
        });

        it('should include all required metrics', () => {
            const prometheus = metricsService.exportPrometheus();

            // Check for all metric names
            expect(prometheus).toContain('idp_approval_duration_seconds_p95');
            expect(prometheus).toContain('idp_test_success_total');
            expect(prometheus).toContain('idp_test_failed_total');
            expect(prometheus).toContain('idp_test_success_rate');
            expect(prometheus).toContain('idp_validation_failures_total');
            expect(prometheus).toContain('api_requests_total');
            expect(prometheus).toContain('api_errors_total');
            expect(prometheus).toContain('api_error_rate');
        });
    });

    describe('reset', () => {
        it('should reset all metrics', () => {
            // Populate metrics
            metricsService.recordApprovalDuration(1000);
            metricsService.recordTestResult(true);
            metricsService.recordValidationFailure('oidc', ['Error']);
            metricsService.recordAPIRequest(false);

            // Reset
            metricsService.reset();

            // Verify all metrics are reset
            const summary = metricsService.getSummary();
            expect(summary.approvalDurations.count).toBe(0);
            expect(summary.testResults.total).toBe(0);
            expect(summary.validationFailures.total).toBe(0);
            expect(summary.apiRequests.total).toBe(0);
        });

        it('should update lastReset timestamp', () => {
            const beforeReset = new Date();
            metricsService.reset();
            const summary = metricsService.getSummary();
            const afterReset = new Date(summary.lastReset);

            expect(afterReset.getTime()).toBeGreaterThanOrEqual(beforeReset.getTime());
        });
    });

    describe('Edge Cases', () => {
        it('should handle negative durations', () => {
            metricsService.recordApprovalDuration(-100);

            const summary = metricsService.getSummary();
            expect(summary.approvalDurations.count).toBe(1);
        });

        it('should handle very large durations', () => {
            metricsService.recordApprovalDuration(Number.MAX_SAFE_INTEGER);

            const summary = metricsService.getSummary();
            expect(summary.approvalDurations.count).toBe(1);
        });

        it('should handle empty failure array', () => {
            metricsService.recordValidationFailure('oidc', []);

            const summary = metricsService.getSummary();
            expect(summary.validationFailures.byType['oidc_failure']).toBe(1);
        });

        it('should handle failure with colon in message', () => {
            metricsService.recordValidationFailure('saml', [
                'Complex error: With: Multiple: Colons'
            ]);

            const summary = metricsService.getSummary();
            expect(summary.validationFailures.byType['Complex error']).toBe(1);
        });

        it('should handle unsorted duration values', () => {
            [500, 100, 300, 200, 400].forEach(d => 
                metricsService.recordApprovalDuration(d)
            );

            const summary = metricsService.getSummary();
            expect(summary.approvalDurations.p50).toBe(300);
        });
    });
});








