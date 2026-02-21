/**
 * DIVE V3 - Spoke Failover Service Tests
 *
 * Tests for circuit breaker pattern, failover modes, and recovery.
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import SpokeFailoverService, {
    spokeFailover,
} from '../services/spoke-failover.service';

describe('SpokeFailoverService', () => {
    let service: SpokeFailoverService;

    beforeEach(() => {
        service = new SpokeFailoverService();
        service.initialize({
            spokeId: 'test-spoke',
            instanceCode: 'TST',
            circuitBreaker: {
                failureThreshold: 3,
                recoveryTimeoutMs: 100,
                successThreshold: 2,
                halfOpenTimeoutMs: 200,
                failureWindowMs: 1000,
                halfOpenRequestPercentage: 50,
            },
            autoFailover: true,
            maxOfflineTimeMs: 3600000,
            healthCheckIntervalMs: 50,
            maintenanceMode: false,
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
            const defaultService = new SpokeFailoverService();
            defaultService.initialize();

            expect(defaultService.getCircuitState()).toBe('closed');
            expect(defaultService.getMode()).toBe('normal');

            defaultService.shutdown();
        });

        it('should initialize with custom config', () => {
            expect(service.getCircuitState()).toBe('closed');
            expect(service.getMode()).toBe('normal');
        });

        it('should emit initialized event', () => {
            const newService = new SpokeFailoverService();
            const initHandler = jest.fn();

            newService.on('initialized', initHandler);
            newService.initialize();

            expect(initHandler).toHaveBeenCalled();
            newService.shutdown();
        });

        it('should set initial policy cache expiry', () => {
            const state = service.getState();
            expect(state.policyCacheExpiry).not.toBeNull();
            expect(state.policyCacheExpiry!.getTime()).toBeGreaterThan(Date.now());
        });
    });

    // ===========================================
    // CIRCUIT BREAKER STATE TESTS
    // ===========================================

    describe('Circuit Breaker States', () => {
        it('should start in closed state', () => {
            expect(service.isCircuitClosed()).toBe(true);
            expect(service.isCircuitOpen()).toBe(false);
            expect(service.isCircuitHalfOpen()).toBe(false);
        });

        it('should transition to open after reaching failure threshold', () => {
            // Record failures up to threshold
            service.recordFailure('Error 1');
            expect(service.isCircuitClosed()).toBe(true);

            service.recordFailure('Error 2');
            expect(service.isCircuitClosed()).toBe(true);

            service.recordFailure('Error 3');
            expect(service.isCircuitOpen()).toBe(true);
        });

        it('should emit circuitOpened event', () => {
            const handler = jest.fn();
            service.on('circuitOpened', handler);

            // Trigger circuit open
            for (let i = 0; i < 3; i++) {
                service.recordFailure(`Error ${i + 1}`);
            }

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    failures: expect.any(Number),
                })
            );
        });

        it('should transition to half-open after recovery timeout', async () => {
            // Open the circuit
            for (let i = 0; i < 3; i++) {
                service.recordFailure(`Error ${i + 1}`);
            }
            expect(service.isCircuitOpen()).toBe(true);

            // Wait for recovery timeout
            await new Promise((resolve) => setTimeout(resolve, 150));

            // Manually trigger check
            service.startMonitoring();
            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(service.isCircuitHalfOpen()).toBe(true);

            service.stopMonitoring();
        });

        it('should transition to closed after success threshold in half-open', async () => {
            // Open the circuit
            for (let i = 0; i < 3; i++) {
                service.recordFailure(`Error ${i + 1}`);
            }

            // Wait for recovery timeout
            await new Promise((resolve) => setTimeout(resolve, 150));
            service.startMonitoring();
            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(service.isCircuitHalfOpen()).toBe(true);

            // Record successes
            service.recordSuccess();
            expect(service.isCircuitHalfOpen()).toBe(true); // Need 2 successes

            service.recordSuccess();
            expect(service.isCircuitClosed()).toBe(true);

            service.stopMonitoring();
        });

        it('should re-open circuit on failure in half-open state', async () => {
            // Open the circuit
            for (let i = 0; i < 3; i++) {
                service.recordFailure(`Error ${i + 1}`);
            }

            // Wait for recovery timeout
            await new Promise((resolve) => setTimeout(resolve, 150));
            service.startMonitoring();
            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(service.isCircuitHalfOpen()).toBe(true);

            // Record one success, then failure
            service.recordSuccess();
            service.recordFailure('Error in half-open');

            expect(service.isCircuitOpen()).toBe(true);

            service.stopMonitoring();
        });
    });

    // ===========================================
    // SUCCESS/FAILURE RECORDING TESTS
    // ===========================================

    describe('Success/Failure Recording', () => {
        it('should record successes', () => {
            service.recordSuccess();

            const state = service.getState();
            expect(state.circuitBreaker.successes).toBe(1);
            expect(state.circuitBreaker.lastSuccess).not.toBeNull();
            expect(state.lastHubContact).not.toBeNull();
        });

        it('should record failures', () => {
            service.recordFailure('Test error');

            const state = service.getState();
            expect(state.circuitBreaker.failures).toBe(1);
            expect(state.circuitBreaker.lastFailure).not.toBeNull();
        });

        it('should maintain failure history', () => {
            service.recordFailure('Error 1');
            service.recordFailure('Error 2');

            expect(service.getRecentFailureCount()).toBe(2);
        });

        it('should prune failures outside window', async () => {
            service.recordFailure('Error 1');

            // Create a new service with very short window
            const shortWindowService = new SpokeFailoverService();
            shortWindowService.initialize({
                circuitBreaker: {
                    failureThreshold: 5,
                    recoveryTimeoutMs: 100,
                    successThreshold: 2,
                    halfOpenTimeoutMs: 200,
                    failureWindowMs: 50, // 50ms window
                    halfOpenRequestPercentage: 50,
                },
            });

            shortWindowService.recordFailure('Error 1');
            expect(shortWindowService.getRecentFailureCount()).toBe(1);

            // Wait for window to expire
            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(shortWindowService.getRecentFailureCount()).toBe(0);

            shortWindowService.shutdown();
        });

        it('should emit success event', () => {
            const handler = jest.fn();
            service.on('success', handler);

            service.recordSuccess();

            expect(handler).toHaveBeenCalled();
        });

        it('should emit failure event', () => {
            const handler = jest.fn();
            service.on('failure', handler);

            service.recordFailure('Test error');

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Test error',
                })
            );
        });
    });

    // ===========================================
    // MODE TRANSITION TESTS
    // ===========================================

    describe('Mode Transitions', () => {
        it('should start in normal mode', () => {
            expect(service.getMode()).toBe('normal');
        });

        it('should transition to degraded when circuit opens', () => {
            for (let i = 0; i < 3; i++) {
                service.recordFailure(`Error ${i + 1}`);
            }

            expect(service.getMode()).toBe('degraded');
            expect(service.isDegraded()).toBe(true);
        });

        it('should transition to normal when circuit closes', async () => {
            // Open circuit
            for (let i = 0; i < 3; i++) {
                service.recordFailure(`Error ${i + 1}`);
            }

            // Force close
            service.forceClose();

            expect(service.getMode()).toBe('normal');
            expect(service.isDegraded()).toBe(false);
        });

        it('should emit modeChange event', () => {
            const handler = jest.fn();
            service.on('modeChange', handler);

            // Trigger mode change
            for (let i = 0; i < 3; i++) {
                service.recordFailure(`Error ${i + 1}`);
            }

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    from: 'normal',
                    to: 'degraded',
                })
            );
        });

        it('should recover to normal mode on success after being offline', () => {
            // Go to degraded
            for (let i = 0; i < 3; i++) {
                service.recordFailure(`Error ${i + 1}`);
            }
            expect(service.getMode()).toBe('degraded');

            // Record success (simulating recovery)
            service.forceClose();
            service.recordSuccess();

            expect(service.getMode()).toBe('normal');
        });
    });

    // ===========================================
    // MAINTENANCE MODE TESTS
    // ===========================================

    describe('Maintenance Mode', () => {
        it('should enter maintenance mode', () => {
            service.enterMaintenanceMode('Planned maintenance');

            expect(service.isInMaintenanceMode()).toBe(true);
            expect(service.getMode()).toBe('maintenance');
        });

        it('should exit maintenance mode', () => {
            service.enterMaintenanceMode('Planned maintenance');
            service.exitMaintenanceMode();

            expect(service.isInMaintenanceMode()).toBe(false);
        });

        it('should store maintenance reason', () => {
            service.enterMaintenanceMode('System upgrade');

            const state = service.getState();
            expect(state.maintenanceReason).toBe('System upgrade');
            expect(state.maintenanceStartedAt).not.toBeNull();
        });

        it('should emit maintenance events', () => {
            const startHandler = jest.fn();
            const endHandler = jest.fn();

            service.on('maintenanceStarted', startHandler);
            service.on('maintenanceEnded', endHandler);

            service.enterMaintenanceMode('Test maintenance');
            expect(startHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    reason: 'Test maintenance',
                })
            );

            service.exitMaintenanceMode();
            expect(endHandler).toHaveBeenCalled();
        });

        it('should block requests in maintenance mode', () => {
            service.enterMaintenanceMode('Test');

            expect(service.shouldAllowRequest()).toBe(false);
        });

        it('should not auto-transition out of maintenance', () => {
            service.enterMaintenanceMode('Test');

            // Try to change mode via success
            service.recordSuccess();

            // Should still be in maintenance
            expect(service.isInMaintenanceMode()).toBe(true);
        });
    });

    // ===========================================
    // REQUEST ALLOWANCE TESTS
    // ===========================================

    describe('Request Allowance', () => {
        it('should allow all requests when circuit is closed', () => {
            expect(service.shouldAllowRequest()).toBe(true);
        });

        it('should block all requests when circuit is open', () => {
            // Open circuit
            for (let i = 0; i < 3; i++) {
                service.recordFailure(`Error ${i + 1}`);
            }

            expect(service.shouldAllowRequest()).toBe(false);
        });

        it('should allow some requests when circuit is half-open', async () => {
            // Open circuit
            for (let i = 0; i < 3; i++) {
                service.recordFailure(`Error ${i + 1}`);
            }

            // Wait for recovery
            await new Promise((resolve) => setTimeout(resolve, 150));
            service.startMonitoring();
            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(service.isCircuitHalfOpen()).toBe(true);

            // With 50% rate, some should be allowed
            let allowed = 0;
            for (let i = 0; i < 100; i++) {
                if (service.shouldAllowRequest()) {
                    allowed++;
                }
            }

            // Should be roughly around 50 (with some variance)
            expect(allowed).toBeGreaterThan(20);
            expect(allowed).toBeLessThan(80);

            service.stopMonitoring();
        });
    });

    // ===========================================
    // PROBE TESTS
    // ===========================================

    describe('Probe Operations', () => {
        it('should execute successful probe', async () => {
            const probeFunction = jest.fn().mockResolvedValue(true);

            const result = await service.executeProbe(probeFunction);

            expect(result.success).toBe(true);
            expect(result.latencyMs).toBeGreaterThanOrEqual(0);
            expect(probeFunction).toHaveBeenCalled();
        });

        it('should execute failed probe', async () => {
            const probeFunction = jest.fn().mockResolvedValue(false);

            const result = await service.executeProbe(probeFunction);

            expect(result.success).toBe(false);
        });

        it('should handle probe errors', async () => {
            const probeFunction = jest
                .fn()
                .mockRejectedValue(new Error('Connection failed'));

            const result = await service.executeProbe(probeFunction);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Connection failed');
        });

        it('should emit probeComplete event on success', async () => {
            const handler = jest.fn();
            service.on('probeComplete', handler);

            await service.executeProbe(async () => true);

            expect(handler).toHaveBeenCalled();
        });

        it('should emit probeFailed event on failure', async () => {
            const handler = jest.fn();
            service.on('probeFailed', handler);

            await service.executeProbe(async () => {
                throw new Error('Probe error');
            });

            expect(handler).toHaveBeenCalled();
        });

        it('should record success after successful probe', async () => {
            const initialSuccesses = service.getState().circuitBreaker.successes;

            await service.executeProbe(async () => true);

            expect(service.getState().circuitBreaker.successes).toBe(
                initialSuccesses + 1
            );
        });

        it('should record failure after failed probe', async () => {
            await service.executeProbe(async () => false);

            expect(service.getState().circuitBreaker.failures).toBe(1);
        });
    });

    // ===========================================
    // FORCE OPERATIONS TESTS
    // ===========================================

    describe('Force Operations', () => {
        it('should force close circuit', () => {
            // Open circuit first
            for (let i = 0; i < 3; i++) {
                service.recordFailure(`Error ${i + 1}`);
            }
            expect(service.isCircuitOpen()).toBe(true);

            // Force close
            service.forceClose();

            expect(service.isCircuitClosed()).toBe(true);
        });

        it('should force open circuit', () => {
            expect(service.isCircuitClosed()).toBe(true);

            service.forceOpen('Manual failover test');

            expect(service.isCircuitOpen()).toBe(true);
        });

        it('should emit forceClosed event', () => {
            const handler = jest.fn();
            service.on('forceClosed', handler);

            // Open then force close
            for (let i = 0; i < 3; i++) {
                service.recordFailure(`Error ${i + 1}`);
            }
            service.forceClose();

            expect(handler).toHaveBeenCalled();
        });

        it('should emit forceOpened event', () => {
            const handler = jest.fn();
            service.on('forceOpened', handler);

            service.forceOpen('Test reason');

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    reason: 'Test reason',
                })
            );
        });
    });

    // ===========================================
    // METRICS TESTS
    // ===========================================

    describe('Metrics', () => {
        it('should track total failures', () => {
            service.recordFailure('Error 1');
            service.recordFailure('Error 2');

            const metrics = service.getMetrics();
            expect(metrics.totalFailures).toBe(2);
        });

        it('should track total successes', () => {
            service.recordSuccess();
            service.recordSuccess();

            const metrics = service.getMetrics();
            expect(metrics.totalSuccesses).toBe(2);
        });

        it('should track circuit opens', () => {
            // Open circuit
            for (let i = 0; i < 3; i++) {
                service.recordFailure(`Error ${i + 1}`);
            }

            const metrics = service.getMetrics();
            expect(metrics.totalCircuitOpens).toBe(1);
        });

        it('should track recoveries', async () => {
            // Open circuit
            for (let i = 0; i < 3; i++) {
                service.recordFailure(`Error ${i + 1}`);
            }

            // Wait a bit for outage time to accumulate
            await new Promise((resolve) => setTimeout(resolve, 10));

            // Force close (recovery)
            service.forceClose();

            const metrics = service.getMetrics();
            expect(metrics.totalRecoveries).toBe(1);
        });

        it('should calculate uptime percentage', () => {
            const metrics = service.getMetrics();
            expect(metrics.uptimePercentage).toBeGreaterThanOrEqual(0);
            expect(metrics.uptimePercentage).toBeLessThanOrEqual(100);
        });

        it('should track current outage time', () => {
            // Open circuit
            for (let i = 0; i < 3; i++) {
                service.recordFailure(`Error ${i + 1}`);
            }

            const state = service.getState();
            expect(state.offlineSince).not.toBeNull();
        });
    });

    // ===========================================
    // POLICY CACHE TESTS
    // ===========================================

    describe('Policy Cache', () => {
        it('should have valid policy cache initially', () => {
            expect(service.isPolicyCacheValid()).toBe(true);
        });

        it('should update policy cache validity on success', () => {
            service.recordSuccess();

            const state = service.getState();
            expect(state.policyCacheValid).toBe(true);
            expect(state.policyCacheExpiry!.getTime()).toBeGreaterThan(Date.now());
        });

        it('should allow updating policy cache expiry', () => {
            const newExpiry = new Date(Date.now() + 100000);
            service.updatePolicyCacheExpiry(newExpiry);

            const state = service.getState();
            expect(state.policyCacheExpiry).toEqual(newExpiry);
        });

        it('should detect expired policy cache', () => {
            const expiredDate = new Date(Date.now() - 1000);
            service.updatePolicyCacheExpiry(expiredDate);

            expect(service.isPolicyCacheValid()).toBe(false);
        });
    });

    // ===========================================
    // UTILITY TESTS
    // ===========================================

    describe('Utility Methods', () => {
        it('should return time since last contact', () => {
            service.recordSuccess();

            const timeSince = service.getTimeSinceLastContact();
            expect(timeSince).not.toBeNull();
            expect(timeSince).toBeGreaterThanOrEqual(0);
        });

        it('should return null if no contact', () => {
            expect(service.getTimeSinceLastContact()).toBeNull();
        });

        it('should reset state and metrics', () => {
            // Build up some state
            service.recordFailure('Error');
            service.recordSuccess();

            // Reset
            service.reset();

            const state = service.getState();
            expect(state.circuitBreaker.failures).toBe(0);
            expect(state.circuitBreaker.successes).toBe(0);

            const metrics = service.getMetrics();
            expect(metrics.totalFailures).toBe(0);
            expect(metrics.totalSuccesses).toBe(0);
        });

        it('should emit reset event', () => {
            const handler = jest.fn();
            service.on('reset', handler);

            service.reset();

            expect(handler).toHaveBeenCalled();
        });
    });

    // ===========================================
    // MONITORING TESTS
    // ===========================================

    describe('Monitoring', () => {
        it('should start monitoring', () => {
            const handler = jest.fn();
            service.on('monitoringStarted', handler);

            service.startMonitoring();

            expect(handler).toHaveBeenCalled();

            service.stopMonitoring();
        });

        it('should stop monitoring', () => {
            const handler = jest.fn();
            service.on('monitoringStopped', handler);

            service.startMonitoring();
            service.stopMonitoring();

            expect(handler).toHaveBeenCalled();
        });

        it('should warn on duplicate start', () => {
            service.startMonitoring();
            service.startMonitoring(); // Should warn, not error

            service.stopMonitoring();
        });

        it('should throw if not initialized', () => {
            const uninitService = new SpokeFailoverService();

            expect(() => uninitService.startMonitoring()).toThrow();
        });
    });

    // ===========================================
    // SINGLETON TESTS
    // ===========================================

    describe('Singleton', () => {
        it('should export singleton instance', () => {
            expect(spokeFailover).toBeInstanceOf(SpokeFailoverService);
        });
    });
});
