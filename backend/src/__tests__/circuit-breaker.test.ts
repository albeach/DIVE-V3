/**
 * Circuit Breaker Tests (Phase 3)
 * 
 * Test coverage:
 * - State transitions (CLOSED → OPEN → HALF_OPEN → CLOSED)
 * - Failure threshold detection
 * - Timeout-based recovery
 * - Success threshold for closing
 * - Statistics tracking
 * - Manual operations
 */

import { CircuitBreaker, CircuitState } from '../utils/circuit-breaker';

describe('CircuitBreaker', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
        breaker = new CircuitBreaker({
            name: 'TestService',
            failureThreshold: 3,
            timeout: 1000,
            successThreshold: 2,
        });
    });

    describe('Initial State', () => {
        it('should start in CLOSED state', () => {
            expect(breaker.getState()).toBe(CircuitState.CLOSED);
            expect(breaker.isClosed()).toBe(true);
            expect(breaker.isOpen()).toBe(false);
            expect(breaker.isHalfOpen()).toBe(false);
        });

        it('should have zero statistics initially', () => {
            const stats = breaker.getStats();
            expect(stats.failures).toBe(0);
            expect(stats.successes).toBe(0);
            expect(stats.totalRequests).toBe(0);
            expect(stats.rejectCount).toBe(0);
        });
    });

    describe('Successful Execution', () => {
        it('should execute function and return result on success', async () => {
            const result = await breaker.execute(async () => {
                return 'success';
            });

            expect(result).toBe('success');
            expect(breaker.getState()).toBe(CircuitState.CLOSED);
        });

        it('should increment total requests on success', async () => {
            await breaker.execute(async () => 'success');
            
            const stats = breaker.getStats();
            expect(stats.totalRequests).toBe(1);
            expect(stats.failures).toBe(0);
        });

        it('should reset failure count on success', async () => {
            // Fail once
            try {
                await breaker.execute(async () => {
                    throw new Error('failure');
                });
            } catch {}

            expect(breaker.getStats().failures).toBe(1);

            // Then succeed
            await breaker.execute(async () => 'success');

            expect(breaker.getStats().failures).toBe(0);
        });
    });

    describe('Failed Execution', () => {
        it('should throw error on failure', async () => {
            await expect(
                breaker.execute(async () => {
                    throw new Error('test error');
                })
            ).rejects.toThrow('test error');
        });

        it('should increment failure count on error', async () => {
            try {
                await breaker.execute(async () => {
                    throw new Error('failure');
                });
            } catch {}

            const stats = breaker.getStats();
            expect(stats.failures).toBe(1);
            expect(stats.totalRequests).toBe(1);
        });

        it('should remain CLOSED until failure threshold', async () => {
            // Fail twice (threshold is 3)
            for (let i = 0; i < 2; i++) {
                try {
                    await breaker.execute(async () => {
                        throw new Error('failure');
                    });
                } catch {}
            }

            expect(breaker.getState()).toBe(CircuitState.CLOSED);
        });

        it('should transition to OPEN when failure threshold exceeded', async () => {
            // Fail 3 times (threshold)
            for (let i = 0; i < 3; i++) {
                try {
                    await breaker.execute(async () => {
                        throw new Error('failure');
                    });
                } catch {}
            }

            expect(breaker.getState()).toBe(CircuitState.OPEN);
            expect(breaker.isOpen()).toBe(true);
        });
    });

    describe('OPEN State Behavior', () => {
        beforeEach(async () => {
            // Open the circuit by exceeding failure threshold
            for (let i = 0; i < 3; i++) {
                try {
                    await breaker.execute(async () => {
                        throw new Error('failure');
                    });
                } catch {}
            }
            expect(breaker.getState()).toBe(CircuitState.OPEN);
        });

        it('should reject requests immediately when OPEN', async () => {
            await expect(
                breaker.execute(async () => 'success')
            ).rejects.toThrow('Circuit breaker is OPEN');
        });

        it('should increment reject count when OPEN', async () => {
            const statsBefore = breaker.getStats();
            const rejectsBefore = statsBefore.rejectCount;

            try {
                await breaker.execute(async () => 'success');
            } catch {}

            const statsAfter = breaker.getStats();
            expect(statsAfter.rejectCount).toBe(rejectsBefore + 1);
        });

        it('should include retryAfter in error when OPEN', async () => {
            try {
                await breaker.execute(async () => 'success');
                fail('Should have thrown error');
            } catch (error: any) {
                expect(error.circuitBreakerOpen).toBe(true);
                expect(error.retryAfter).toBeGreaterThanOrEqual(0);
            }
        });
    });

    describe('HALF_OPEN State Transition', () => {
        beforeEach(async () => {
            // Open the circuit
            for (let i = 0; i < 3; i++) {
                try {
                    await breaker.execute(async () => {
                        throw new Error('failure');
                    });
                } catch {}
            }
        });

        it('should transition to HALF_OPEN after timeout', async () => {
            expect(breaker.getState()).toBe(CircuitState.OPEN);

            // Wait for timeout
            await new Promise(resolve => setTimeout(resolve, 1100));

            // Next request should transition to HALF_OPEN
            try {
                await breaker.execute(async () => 'success');
            } catch {}

            expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
        });

        it('should allow request through when transitioning to HALF_OPEN', async () => {
            // Wait for timeout
            await new Promise(resolve => setTimeout(resolve, 1100));

            const result = await breaker.execute(async () => 'test result');

            expect(result).toBe('test result');
        });
    });

    describe('HALF_OPEN State Behavior', () => {
        beforeEach(async () => {
            // Open the circuit
            for (let i = 0; i < 3; i++) {
                try {
                    await breaker.execute(async () => {
                        throw new Error('failure');
                    });
                } catch {}
            }

            // Wait and transition to HALF_OPEN
            await new Promise(resolve => setTimeout(resolve, 1100));
            await breaker.execute(async () => 'success');
            
            expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
        });

        it('should close circuit after success threshold in HALF_OPEN', async () => {
            // Need 1 more success (success threshold is 2, already had 1)
            await breaker.execute(async () => 'success');

            expect(breaker.getState()).toBe(CircuitState.CLOSED);
        });

        it('should reopen circuit on failure in HALF_OPEN', async () => {
            expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

            try {
                await breaker.execute(async () => {
                    throw new Error('failure');
                });
            } catch {}

            expect(breaker.getState()).toBe(CircuitState.OPEN);
        });
    });

    describe('Statistics', () => {
        it('should track total requests accurately', async () => {
            await breaker.execute(async () => 'success');
            
            try {
                await breaker.execute(async () => {
                    throw new Error('failure');
                });
            } catch {}

            await breaker.execute(async () => 'success');

            const stats = breaker.getStats();
            expect(stats.totalRequests).toBe(3);
        });

        it('should track failure count accurately', async () => {
            try {
                await breaker.execute(async () => {
                    throw new Error('failure');
                });
            } catch {}

            try {
                await breaker.execute(async () => {
                    throw new Error('failure');
                });
            } catch {}

            const stats = breaker.getStats();
            expect(stats.failures).toBe(2);
        });

        it('should track last failure time', async () => {
            const before = new Date();

            try {
                await breaker.execute(async () => {
                    throw new Error('failure');
                });
            } catch {}

            const after = new Date();
            const stats = breaker.getStats();

            expect(stats.lastFailureTime).not.toBeNull();
            expect(stats.lastFailureTime!.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(stats.lastFailureTime!.getTime()).toBeLessThanOrEqual(after.getTime());
        });
    });

    describe('Manual Operations', () => {
        it('should force OPEN when forceOpen called', () => {
            expect(breaker.getState()).toBe(CircuitState.CLOSED);

            breaker.forceOpen();

            expect(breaker.getState()).toBe(CircuitState.OPEN);
        });

        it('should force CLOSED when forceClose called', async () => {
            // Open the circuit
            for (let i = 0; i < 3; i++) {
                try {
                    await breaker.execute(async () => {
                        throw new Error('failure');
                    });
                } catch {}
            }

            expect(breaker.getState()).toBe(CircuitState.OPEN);

            breaker.forceClose();

            expect(breaker.getState()).toBe(CircuitState.CLOSED);
            expect(breaker.getStats().failures).toBe(0);
        });

        it('should reset all statistics when reset called', async () => {
            // Generate some stats
            await breaker.execute(async () => 'success');
            
            try {
                await breaker.execute(async () => {
                    throw new Error('failure');
                });
            } catch {}

            expect(breaker.getStats().totalRequests).toBeGreaterThan(0);

            breaker.reset();

            const stats = breaker.getStats();
            expect(stats.totalRequests).toBe(0);
            expect(stats.failures).toBe(0);
            expect(stats.successes).toBe(0);
            expect(stats.rejectCount).toBe(0);
            expect(breaker.getState()).toBe(CircuitState.CLOSED);
        });
    });

    describe('Edge Cases', () => {
        it('should handle synchronous errors', async () => {
            await expect(
                breaker.execute(async () => {
                    throw new Error('sync error');
                })
            ).rejects.toThrow('sync error');
        });

        it('should handle async errors', async () => {
            await expect(
                breaker.execute(async () => {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    throw new Error('async error');
                })
            ).rejects.toThrow('async error');
        });

        it('should handle successful null return', async () => {
            const result = await breaker.execute(async () => {
                return null;
            });

            expect(result).toBeNull();
            expect(breaker.getState()).toBe(CircuitState.CLOSED);
        });

        it('should handle successful undefined return', async () => {
            const result = await breaker.execute(async () => {
                return undefined;
            });

            expect(result).toBeUndefined();
            expect(breaker.getState()).toBe(CircuitState.CLOSED);
        });
    });

    describe('Concurrent Requests', () => {
        it('should handle concurrent successes', async () => {
            const promises = Array.from({ length: 10 }, () =>
                breaker.execute(async () => 'success')
            );

            const results = await Promise.all(promises);

            expect(results).toHaveLength(10);
            expect(results.every(r => r === 'success')).toBe(true);
            expect(breaker.getStats().totalRequests).toBe(10);
        });

        it('should handle concurrent failures', async () => {
            const promises = Array.from({ length: 5 }, () =>
                breaker.execute(async () => {
                    throw new Error('failure');
                }).catch(() => 'error')
            );

            await Promise.all(promises);

            const stats = breaker.getStats();
            expect(stats.totalRequests).toBe(5);
            expect(breaker.getState()).toBe(CircuitState.OPEN);
        });
    });
});

