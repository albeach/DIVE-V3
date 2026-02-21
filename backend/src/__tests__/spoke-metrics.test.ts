/**
 * DIVE V3 - Spoke Metrics Service Tests
 *
 * Tests for Prometheus-compatible metrics export and health scoring.
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import SpokeMetricsService, { spokeMetrics } from '../services/spoke-metrics.service';

describe('SpokeMetricsService', () => {
    let service: SpokeMetricsService;

    beforeEach(() => {
        service = new SpokeMetricsService();
        service.initialize({
            spokeId: 'test-spoke',
            instanceCode: 'TST',
            prefix: 'dive_spoke',
            healthScoreIntervalMs: 100,
        });
    });

    afterEach(() => {
        service.shutdown();
    });

    // ===========================================
    // INITIALIZATION TESTS
    // ===========================================

    describe('Initialization', () => {
        it('should initialize with default config', () => {
            const defaultService = new SpokeMetricsService();
            defaultService.initialize();

            const prometheus = defaultService.exportPrometheus();
            expect(prometheus).toContain('dive_spoke');

            defaultService.shutdown();
        });

        it('should initialize with custom config', () => {
            const prometheus = service.exportPrometheus();
            expect(prometheus).toContain('spoke_id="test-spoke"');
            expect(prometheus).toContain('instance_code="TST"');
        });

        it('should emit initialized event', () => {
            const newService = new SpokeMetricsService();
            const handler = jest.fn();

            newService.on('initialized', handler);
            newService.initialize();

            expect(handler).toHaveBeenCalled();
            newService.shutdown();
        });
    });

    // ===========================================
    // COUNTER TESTS
    // ===========================================

    describe('Counter Operations', () => {
        it('should increment counter', () => {
            service.incrementCounter('authorization_decisions_total', { decision: 'allow', action: 'read', instance: 'local' });

            const value = service.getCounter('authorization_decisions_total', { decision: 'allow', action: 'read', instance: 'local' });
            expect(value).toBe(1);
        });

        it('should increment counter by custom value', () => {
            service.incrementCounter('authorization_decisions_total', { decision: 'allow', action: 'read', instance: 'local' }, 5);

            const value = service.getCounter('authorization_decisions_total', { decision: 'allow', action: 'read', instance: 'local' });
            expect(value).toBe(5);
        });

        it('should accumulate counter values', () => {
            service.incrementCounter('heartbeat_total', { result: 'success' });
            service.incrementCounter('heartbeat_total', { result: 'success' });
            service.incrementCounter('heartbeat_total', { result: 'success' });

            const value = service.getCounter('heartbeat_total', { result: 'success' });
            expect(value).toBe(3);
        });

        it('should track separate label combinations', () => {
            service.incrementCounter('authorization_decisions_total', { decision: 'allow', action: 'read', instance: 'local' });
            service.incrementCounter('authorization_decisions_total', { decision: 'deny', action: 'read', instance: 'local' });

            expect(service.getCounter('authorization_decisions_total', { decision: 'allow', action: 'read', instance: 'local' })).toBe(1);
            expect(service.getCounter('authorization_decisions_total', { decision: 'deny', action: 'read', instance: 'local' })).toBe(1);
        });

        it('should emit counterIncremented event', () => {
            const handler = jest.fn();
            service.on('counterIncremented', handler);

            service.incrementCounter('heartbeat_total', { result: 'success' });

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'heartbeat_total',
                    value: 1,
                })
            );
        });

        it('should return 0 for unknown counter', () => {
            const value = service.getCounter('nonexistent', {});
            expect(value).toBe(0);
        });
    });

    // ===========================================
    // GAUGE TESTS
    // ===========================================

    describe('Gauge Operations', () => {
        it('should set gauge value', () => {
            service.setGauge('audit_queue_size', 42);

            const value = service.getGauge('audit_queue_size');
            expect(value).toBe(42);
        });

        it('should overwrite gauge value', () => {
            service.setGauge('audit_queue_size', 10);
            service.setGauge('audit_queue_size', 20);

            const value = service.getGauge('audit_queue_size');
            expect(value).toBe(20);
        });

        it('should increment gauge', () => {
            service.setGauge('audit_queue_size', 10);
            service.incrementGauge('audit_queue_size');

            expect(service.getGauge('audit_queue_size')).toBe(11);
        });

        it('should decrement gauge', () => {
            service.setGauge('audit_queue_size', 10);
            service.decrementGauge('audit_queue_size', {}, 3);

            expect(service.getGauge('audit_queue_size')).toBe(7);
        });

        it('should not go below zero when decrementing', () => {
            service.setGauge('audit_queue_size', 2);
            service.decrementGauge('audit_queue_size', {}, 10);

            expect(service.getGauge('audit_queue_size')).toBe(0);
        });

        it('should emit gaugeSet event', () => {
            const handler = jest.fn();
            service.on('gaugeSet', handler);

            service.setGauge('audit_queue_size', 100);

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'audit_queue_size',
                    value: 100,
                })
            );
        });
    });

    // ===========================================
    // HISTOGRAM TESTS
    // ===========================================

    describe('Histogram Operations', () => {
        it('should observe histogram value', () => {
            service.observeHistogram('authorization_latency_seconds', 0.05, { action: 'read', instance: 'local' });

            const stats = service.getHistogramStats('authorization_latency_seconds', { action: 'read', instance: 'local' });
            expect(stats).not.toBeNull();
            expect(stats?.count).toBe(1);
            expect(stats?.sum).toBeCloseTo(0.05);
        });

        it('should accumulate histogram observations', () => {
            service.observeHistogram('authorization_latency_seconds', 0.01, { action: 'read', instance: 'local' });
            service.observeHistogram('authorization_latency_seconds', 0.02, { action: 'read', instance: 'local' });
            service.observeHistogram('authorization_latency_seconds', 0.03, { action: 'read', instance: 'local' });

            const stats = service.getHistogramStats('authorization_latency_seconds', { action: 'read', instance: 'local' });
            expect(stats?.count).toBe(3);
            expect(stats?.sum).toBeCloseTo(0.06);
            expect(stats?.avg).toBeCloseTo(0.02);
        });

        it('should emit histogramObserved event', () => {
            const handler = jest.fn();
            service.on('histogramObserved', handler);

            service.observeHistogram('authorization_latency_seconds', 0.1, { action: 'read', instance: 'local' });

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'authorization_latency_seconds',
                    value: 0.1,
                })
            );
        });

        it('should return null for unknown histogram', () => {
            const stats = service.getHistogramStats('nonexistent', {});
            expect(stats).toBeNull();
        });
    });

    // ===========================================
    // CONVENIENCE METHOD TESTS
    // ===========================================

    describe('Convenience Methods', () => {
        it('should record authorization decision', () => {
            service.recordAuthorizationDecision('allow', 'read', 50);

            expect(service.getCounter('authorization_decisions_total', { decision: 'allow', action: 'read', instance: 'local' })).toBe(1);

            const stats = service.getHistogramStats('authorization_latency_seconds', { action: 'read', instance: 'local' });
            expect(stats?.count).toBe(1);
        });

        it('should record policy sync', () => {
            service.recordPolicySync('success');

            expect(service.getCounter('policy_sync_total', { result: 'success', source: 'hub' })).toBe(1);
        });

        it('should record heartbeat', () => {
            service.recordHeartbeat('success');
            service.recordHeartbeat('failure');

            expect(service.getCounter('heartbeat_total', { result: 'success' })).toBe(1);
            expect(service.getCounter('heartbeat_total', { result: 'failure' })).toBe(1);
        });

        it('should set circuit breaker state', () => {
            service.setCircuitBreakerState('open');

            expect(service.getGauge('circuit_breaker_state', { target: 'hub' })).toBe(2);
        });

        it('should record token exchange', () => {
            service.recordTokenExchange('success', 'USA', 'FRA');

            expect(service.getCounter('token_exchange_total', { result: 'success', origin: 'USA', target: 'FRA' })).toBe(1);
        });

        it('should record cross-instance request', () => {
            service.recordCrossInstanceRequest('success', 'USA', 'FRA');

            expect(service.getCounter('cross_instance_requests_total', { result: 'success', source: 'USA', target: 'FRA' })).toBe(1);
        });

        it('should record cache access', () => {
            service.recordCacheAccess('authz', true);
            service.recordCacheAccess('authz', false);

            expect(service.getCounter('cache_hits_total', { cache_type: 'authz' })).toBe(1);
            expect(service.getCounter('cache_misses_total', { cache_type: 'authz' })).toBe(1);
        });

        it('should set audit queue size', () => {
            service.setAuditQueueSize(150);

            expect(service.getGauge('audit_queue_size')).toBe(150);
        });

        it('should record audit queue sync', () => {
            service.recordAuditQueueSync('success');

            expect(service.getCounter('audit_queue_sync_total', { result: 'success' })).toBe(1);
        });
    });

    // ===========================================
    // HEALTH SCORE TESTS
    // ===========================================

    describe('Health Score', () => {
        it('should calculate health score', () => {
            const score = service.calculateHealthScore();

            expect(score.overall).toBeGreaterThanOrEqual(0);
            expect(score.overall).toBeLessThanOrEqual(100);
            expect(score.status).toBeDefined();
        });

        it('should start with healthy status', () => {
            const score = service.getHealthScore();

            expect(score.status).toBe('healthy');
            expect(score.overall).toBe(100);
        });

        it('should decrease health on errors', () => {
            // Record some successes and errors
            for (let i = 0; i < 5; i++) {
                service.recordAuthorizationDecision('allow', 'read', 100);
            }
            for (let i = 0; i < 5; i++) {
                service.recordAuthorizationDecision('error', 'read', 100);
            }

            const score = service.calculateHealthScore();
            // 5 errors out of 10 total = 50% error rate = 50% health
            expect(score.components.authorization).toBeLessThan(100);
            expect(score.components.authorization).toBe(50);
        });

        it('should track heartbeat failures', () => {
            service.recordHeartbeat('failure');
            service.recordHeartbeat('failure');
            service.recordHeartbeat('success');

            const score = service.calculateHealthScore();
            // 1 success out of 3 = ~33%
            expect(score.components.connectivity).toBeLessThan(50);
        });

        it('should emit healthScoreCalculated event', () => {
            const handler = jest.fn();
            service.on('healthScoreCalculated', handler);

            service.calculateHealthScore();

            expect(handler).toHaveBeenCalled();
        });

        it('should start health score calculation', (done) => {
            service.startHealthScoreCalculation();

            setTimeout(() => {
                const score = service.getHealthScore();
                expect(score.lastCalculated).toBeDefined();
                service.stopHealthScoreCalculation();
                done();
            }, 150);
        });
    });

    // ===========================================
    // PROMETHEUS EXPORT TESTS
    // ===========================================

    describe('Prometheus Export', () => {
        it('should export in Prometheus format', () => {
            service.recordHeartbeat('success');

            const prometheus = service.exportPrometheus();

            expect(prometheus).toContain('# HELP');
            expect(prometheus).toContain('# TYPE');
            expect(prometheus).toContain('dive_spoke_heartbeat_total');
        });

        it('should include labels in export', () => {
            service.recordHeartbeat('success');

            const prometheus = service.exportPrometheus();

            expect(prometheus).toContain('result="success"');
            expect(prometheus).toContain('spoke_id="test-spoke"');
            expect(prometheus).toContain('instance_code="TST"');
        });

        it('should export uptime', () => {
            const prometheus = service.exportPrometheus();

            expect(prometheus).toContain('dive_spoke_uptime_seconds');
        });

        it('should export histogram with buckets', () => {
            service.observeHistogram('authorization_latency_seconds', 0.05, { action: 'read', instance: 'local' });

            const prometheus = service.exportPrometheus();

            expect(prometheus).toContain('dive_spoke_authorization_latency_seconds_bucket');
            expect(prometheus).toContain('dive_spoke_authorization_latency_seconds_sum');
            expect(prometheus).toContain('dive_spoke_authorization_latency_seconds_count');
            expect(prometheus).toContain('le=');
        });

        it('should include counter type', () => {
            service.recordHeartbeat('success');

            const prometheus = service.exportPrometheus();

            expect(prometheus).toContain('# TYPE dive_spoke_heartbeat_total counter');
        });

        it('should include gauge type', () => {
            service.setAuditQueueSize(10);

            const prometheus = service.exportPrometheus();

            expect(prometheus).toContain('# TYPE dive_spoke_audit_queue_size gauge');
        });
    });

    // ===========================================
    // RESET TESTS
    // ===========================================

    describe('Reset', () => {
        it('should reset all metrics', () => {
            service.recordHeartbeat('success');
            service.setAuditQueueSize(100);

            service.reset();

            expect(service.getCounter('heartbeat_total', { result: 'success' })).toBe(0);
            expect(service.getGauge('audit_queue_size')).toBe(0);
        });

        it('should emit reset event', () => {
            const handler = jest.fn();
            service.on('reset', handler);

            service.reset();

            expect(handler).toHaveBeenCalled();
        });

        it('should reset health score', () => {
            service.recordAuthorizationDecision('error', 'read', 100);
            service.calculateHealthScore();

            service.reset();

            const score = service.getHealthScore();
            expect(score.overall).toBe(100);
        });
    });

    // ===========================================
    // SINGLETON TESTS
    // ===========================================

    describe('Singleton', () => {
        it('should export singleton instance', () => {
            expect(spokeMetrics).toBeInstanceOf(SpokeMetricsService);
        });
    });
});
