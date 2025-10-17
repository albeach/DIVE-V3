import { logger } from './logger';

// ============================================
// Circuit Breaker Pattern (Phase 3)
// ============================================
// Purpose: Prevent cascading failures when external services fail
// Pattern: Fail fast when a service is known to be down
// States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing recovery)

/**
 * Circuit breaker states
 */
export enum CircuitState {
    CLOSED = 'CLOSED',       // Normal operation, requests pass through
    OPEN = 'OPEN',           // Service is failing, reject requests immediately
    HALF_OPEN = 'HALF_OPEN'  // Testing if service has recovered
}

/**
 * Circuit breaker configuration
 */
export interface ICircuitBreakerConfig {
    /**
     * Number of failures before opening the circuit
     */
    failureThreshold: number;

    /**
     * Time in milliseconds before attempting to close the circuit (transition to HALF_OPEN)
     */
    timeout: number;

    /**
     * Number of successful requests required to close the circuit from HALF_OPEN
     */
    successThreshold: number;

    /**
     * Name of the circuit breaker (for logging)
     */
    name: string;
}

/**
 * Circuit breaker statistics
 */
export interface ICircuitBreakerStats {
    state: CircuitState;
    failures: number;
    successes: number;
    totalRequests: number;
    lastFailureTime: Date | null;
    lastStateChange: Date;
    rejectCount: number;
}

/**
 * Circuit Breaker Implementation
 * 
 * Usage:
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   name: 'OPA',
 *   failureThreshold: 5,
 *   timeout: 60000,
 *   successThreshold: 2
 * });
 * 
 * const result = await breaker.execute(async () => {
 *   return await callOPA(input);
 * });
 * ```
 */
export class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private failureCount: number = 0;
    private successCount: number = 0;
    private totalRequests: number = 0;
    private rejectCount: number = 0;
    private lastFailureTime: Date | null = null;
    private lastStateChange: Date = new Date();
    private config: ICircuitBreakerConfig;

    constructor(config: ICircuitBreakerConfig) {
        this.config = config;

        logger.info('Circuit breaker initialized', {
            name: this.config.name,
            failureThreshold: this.config.failureThreshold,
            timeout: this.config.timeout,
            successThreshold: this.config.successThreshold,
        });
    }

    /**
     * Execute a function with circuit breaker protection
     * 
     * @param fn Function to execute
     * @returns Result of the function
     * @throws Error if circuit is open or function fails
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        this.totalRequests++;

        // Check circuit state
        if (this.state === CircuitState.OPEN) {
            // Check if timeout has elapsed
            if (this.shouldAttemptReset()) {
                logger.info('Circuit breaker transitioning to HALF_OPEN', {
                    name: this.config.name,
                    timeSinceFailure: Date.now() - (this.lastFailureTime?.getTime() || 0),
                });
                this.transitionTo(CircuitState.HALF_OPEN);
            } else {
                this.rejectCount++;
                
                logger.warn('Circuit breaker OPEN - request rejected', {
                    name: this.config.name,
                    failures: this.failureCount,
                    rejectCount: this.rejectCount,
                    nextRetry: this.getTimeUntilRetry(),
                });

                const error = new Error(`Circuit breaker is OPEN for ${this.config.name}`);
                (error as any).circuitBreakerOpen = true;
                (error as any).retryAfter = this.getTimeUntilRetry();
                throw error;
            }
        }

        // Execute the function
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure(error);
            throw error;
        }
    }

    /**
     * Handle successful execution
     */
    private onSuccess(): void {
        this.failureCount = 0;

        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;

            logger.debug('Circuit breaker success in HALF_OPEN state', {
                name: this.config.name,
                successCount: this.successCount,
                threshold: this.config.successThreshold,
            });

            // If we've had enough successes, close the circuit
            if (this.successCount >= this.config.successThreshold) {
                logger.info('Circuit breaker closing - service recovered', {
                    name: this.config.name,
                    successCount: this.successCount,
                });

                this.transitionTo(CircuitState.CLOSED);
                this.successCount = 0;
            }
        }
    }

    /**
     * Handle failed execution
     */
    private onFailure(error: unknown): void {
        this.failureCount++;
        this.lastFailureTime = new Date();

        logger.error('Circuit breaker failure', {
            name: this.config.name,
            failures: this.failureCount,
            threshold: this.config.failureThreshold,
            state: this.state,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        // If in HALF_OPEN, immediately open the circuit on failure
        if (this.state === CircuitState.HALF_OPEN) {
            logger.warn('Circuit breaker reopening - service still unhealthy', {
                name: this.config.name,
            });

            this.transitionTo(CircuitState.OPEN);
            this.successCount = 0;
            return;
        }

        // If threshold exceeded, open the circuit
        if (this.failureCount >= this.config.failureThreshold) {
            logger.error('Circuit breaker opening - failure threshold exceeded', {
                name: this.config.name,
                failures: this.failureCount,
                threshold: this.config.failureThreshold,
            });

            this.transitionTo(CircuitState.OPEN);
        }
    }

    /**
     * Check if we should attempt to reset the circuit
     */
    private shouldAttemptReset(): boolean {
        if (!this.lastFailureTime) {
            return false;
        }

        const timeSinceFailure = Date.now() - this.lastFailureTime.getTime();
        return timeSinceFailure >= this.config.timeout;
    }

    /**
     * Get time in milliseconds until next retry attempt
     */
    private getTimeUntilRetry(): number {
        if (!this.lastFailureTime) {
            return 0;
        }

        const timeSinceFailure = Date.now() - this.lastFailureTime.getTime();
        const remaining = this.config.timeout - timeSinceFailure;
        return Math.max(0, remaining);
    }

    /**
     * Transition to a new state
     */
    private transitionTo(newState: CircuitState): void {
        const oldState = this.state;
        this.state = newState;
        this.lastStateChange = new Date();

        logger.info('Circuit breaker state transition', {
            name: this.config.name,
            from: oldState,
            to: newState,
            timestamp: this.lastStateChange.toISOString(),
        });
    }

    /**
     * Get current circuit breaker statistics
     */
    getStats(): ICircuitBreakerStats {
        return {
            state: this.state,
            failures: this.failureCount,
            successes: this.successCount,
            totalRequests: this.totalRequests,
            lastFailureTime: this.lastFailureTime,
            lastStateChange: this.lastStateChange,
            rejectCount: this.rejectCount,
        };
    }

    /**
     * Get current state
     */
    getState(): CircuitState {
        return this.state;
    }

    /**
     * Check if circuit is open
     */
    isOpen(): boolean {
        return this.state === CircuitState.OPEN;
    }

    /**
     * Check if circuit is closed
     */
    isClosed(): boolean {
        return this.state === CircuitState.CLOSED;
    }

    /**
     * Check if circuit is half-open
     */
    isHalfOpen(): boolean {
        return this.state === CircuitState.HALF_OPEN;
    }

    /**
     * Force circuit to open (for testing or manual intervention)
     */
    forceOpen(): void {
        logger.warn('Circuit breaker manually forced OPEN', {
            name: this.config.name,
        });

        this.transitionTo(CircuitState.OPEN);
        this.lastFailureTime = new Date();
    }

    /**
     * Force circuit to close (for testing or manual intervention)
     */
    forceClose(): void {
        logger.warn('Circuit breaker manually forced CLOSED', {
            name: this.config.name,
        });

        this.transitionTo(CircuitState.CLOSED);
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = null;
    }

    /**
     * Reset all statistics (for testing)
     */
    reset(): void {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.totalRequests = 0;
        this.rejectCount = 0;
        this.lastFailureTime = null;
        this.lastStateChange = new Date();

        logger.info('Circuit breaker reset', {
            name: this.config.name,
        });
    }
}

/**
 * Pre-configured circuit breakers for common services
 */

/**
 * Circuit breaker for OPA service
 * - 5 failures before opening
 * - 60 second timeout
 * - 2 successes to close
 */
export const opaCircuitBreaker = new CircuitBreaker({
    name: 'OPA',
    failureThreshold: parseInt(process.env.OPA_CIRCUIT_BREAKER_THRESHOLD || '5', 10),
    timeout: parseInt(process.env.OPA_CIRCUIT_BREAKER_TIMEOUT || '60000', 10),
    successThreshold: 2,
});

/**
 * Circuit breaker for Keycloak service
 * - 3 failures before opening (stricter for auth)
 * - 30 second timeout
 * - 2 successes to close
 */
export const keycloakCircuitBreaker = new CircuitBreaker({
    name: 'Keycloak',
    failureThreshold: parseInt(process.env.KEYCLOAK_CIRCUIT_BREAKER_THRESHOLD || '3', 10),
    timeout: parseInt(process.env.KEYCLOAK_CIRCUIT_BREAKER_TIMEOUT || '30000', 10),
    successThreshold: 2,
});

/**
 * Circuit breaker for MongoDB
 * - 5 failures before opening
 * - 60 second timeout
 * - 3 successes to close (database should be stable)
 */
export const mongoCircuitBreaker = new CircuitBreaker({
    name: 'MongoDB',
    failureThreshold: parseInt(process.env.MONGO_CIRCUIT_BREAKER_THRESHOLD || '5', 10),
    timeout: parseInt(process.env.MONGO_CIRCUIT_BREAKER_TIMEOUT || '60000', 10),
    successThreshold: 3,
});

/**
 * Circuit breaker for KAS service
 * - 3 failures before opening (critical for security)
 * - 30 second timeout
 * - 2 successes to close
 */
export const kasCircuitBreaker = new CircuitBreaker({
    name: 'KAS',
    failureThreshold: parseInt(process.env.KAS_CIRCUIT_BREAKER_THRESHOLD || '3', 10),
    timeout: parseInt(process.env.KAS_CIRCUIT_BREAKER_TIMEOUT || '30000', 10),
    successThreshold: 2,
});

/**
 * Get all circuit breaker statistics
 */
export function getAllCircuitBreakerStats(): Record<string, ICircuitBreakerStats> {
    return {
        opa: opaCircuitBreaker.getStats(),
        keycloak: keycloakCircuitBreaker.getStats(),
        mongodb: mongoCircuitBreaker.getStats(),
        kas: kasCircuitBreaker.getStats(),
    };
}

