/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures when external dependencies (OPA, backend) are unavailable.
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service unavailable, requests fail fast
 * - HALF_OPEN: Testing if service recovered, limited requests allowed
 * 
 * Reference: https://martinfowler.com/bliki/CircuitBreaker.html
 */

import { kasLogger } from './kas-logger';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface ICircuitBreakerConfig {
    /** Failure threshold before opening circuit */
    failureThreshold: number;
    /** Time in ms before attempting recovery (half-open) */
    recoveryTimeout: number;
    /** Success threshold to close circuit from half-open */
    successThreshold: number;
    /** Time window for counting failures (ms) */
    failureWindow: number;
}

export interface ICircuitBreakerStats {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime: number | null;
    lastSuccessTime: number | null;
    totalRequests: number;
    totalFailures: number;
}

const DEFAULT_CONFIG: ICircuitBreakerConfig = {
    failureThreshold: parseInt(process.env.KAS_CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5', 10),
    recoveryTimeout: parseInt(process.env.KAS_CIRCUIT_BREAKER_TIMEOUT_MS || '30000', 10),
    successThreshold: parseInt(process.env.KAS_CIRCUIT_BREAKER_SUCCESS_THRESHOLD || '2', 10),
    failureWindow: parseInt(process.env.KAS_CIRCUIT_BREAKER_FAILURE_WINDOW_MS || '60000', 10),
};

/**
 * Circuit Breaker for protecting external service calls
 */
export class CircuitBreaker {
    private state: CircuitState = 'CLOSED';
    private failures: number = 0;
    private successes: number = 0;
    private lastFailureTime: number | null = null;
    private lastSuccessTime: number | null = null;
    private totalRequests: number = 0;
    private totalFailures: number = 0;
    private failureTimestamps: number[] = [];
    private readonly config: ICircuitBreakerConfig;
    private readonly name: string;

    constructor(name: string, config?: Partial<ICircuitBreakerConfig>) {
        this.name = name;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Execute a function with circuit breaker protection
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        this.totalRequests++;

        // Check if circuit should transition
        this.updateState();

        // Fast fail if circuit is open
        if (this.state === 'OPEN') {
            this.totalFailures++;
            const error = new Error(`Circuit breaker OPEN: ${this.name} service unavailable`);
            kasLogger.warn('Circuit breaker: fast fail', {
                circuit: this.name,
                state: this.state,
                failures: this.failures,
            });
            throw error;
        }

        // Execute the function
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    /**
     * Update circuit state based on current conditions
     */
    private updateState(): void {
        const now = Date.now();

        // Clean old failure timestamps outside the window
        this.failureTimestamps = this.failureTimestamps.filter(
            ts => now - ts < this.config.failureWindow
        );

        // Count failures in the current window
        const recentFailures = this.failureTimestamps.length;

        switch (this.state) {
            case 'CLOSED':
                // Transition to OPEN if failure threshold exceeded
                if (recentFailures >= this.config.failureThreshold) {
                    this.state = 'OPEN';
                    this.lastFailureTime = now;
                    kasLogger.error('Circuit breaker: CLOSED → OPEN', {
                        circuit: this.name,
                        failures: recentFailures,
                        threshold: this.config.failureThreshold,
                    });
                }
                break;

            case 'OPEN':
                // Transition to HALF_OPEN after recovery timeout
                if (this.lastFailureTime && now - this.lastFailureTime >= this.config.recoveryTimeout) {
                    this.state = 'HALF_OPEN';
                    this.successes = 0;
                    kasLogger.info('Circuit breaker: OPEN → HALF_OPEN', {
                        circuit: this.name,
                        recoveryTimeout: this.config.recoveryTimeout,
                    });
                }
                break;

            case 'HALF_OPEN':
                // Transition to CLOSED if success threshold met
                if (this.successes >= this.config.successThreshold) {
                    this.state = 'CLOSED';
                    this.failures = 0;
                    this.failureTimestamps = [];
                    this.lastSuccessTime = now;
                    kasLogger.info('Circuit breaker: HALF_OPEN → CLOSED', {
                        circuit: this.name,
                        successes: this.successes,
                    });
                }
                // Transition back to OPEN if failure occurs
                else if (recentFailures > 0) {
                    this.state = 'OPEN';
                    this.lastFailureTime = now;
                    kasLogger.warn('Circuit breaker: HALF_OPEN → OPEN', {
                        circuit: this.name,
                        failures: recentFailures,
                    });
                }
                break;
        }
    }

    /**
     * Handle successful execution
     */
    private onSuccess(): void {
        this.lastSuccessTime = Date.now();

        if (this.state === 'HALF_OPEN') {
            this.successes++;
        } else if (this.state === 'CLOSED') {
            // Reset failure count on success in CLOSED state
            this.failures = 0;
        }
    }

    /**
     * Handle failed execution
     */
    private onFailure(): void {
        this.failures++;
        this.totalFailures++;
        const now = Date.now();
        this.lastFailureTime = now;
        this.failureTimestamps.push(now);

        kasLogger.warn('Circuit breaker: failure recorded', {
            circuit: this.name,
            state: this.state,
            failures: this.failures,
            totalFailures: this.totalFailures,
        });
    }

    /**
     * Get current circuit breaker statistics
     */
    getStats(): ICircuitBreakerStats {
        return {
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            lastFailureTime: this.lastFailureTime,
            lastSuccessTime: this.lastSuccessTime,
            totalRequests: this.totalRequests,
            totalFailures: this.totalFailures,
        };
    }

    /**
     * Reset circuit breaker to CLOSED state (for testing/maintenance)
     */
    reset(): void {
        this.state = 'CLOSED';
        this.failures = 0;
        this.successes = 0;
        this.failureTimestamps = [];
        this.lastFailureTime = null;
        kasLogger.info('Circuit breaker: manually reset', { circuit: this.name });
    }

    /**
     * Check if circuit is currently open
     */
    isOpen(): boolean {
        this.updateState();
        return this.state === 'OPEN';
    }
}

/**
 * Global circuit breakers for external services
 */
export const opaCircuitBreaker = new CircuitBreaker('OPA', {
    failureThreshold: 5,
    recoveryTimeout: 30000,
    successThreshold: 2,
});

export const backendCircuitBreaker = new CircuitBreaker('Backend', {
    failureThreshold: 5,
    recoveryTimeout: 30000,
    successThreshold: 2,
});

