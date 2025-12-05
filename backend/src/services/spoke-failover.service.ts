/**
 * DIVE V3 - Spoke Failover Service
 *
 * Implements circuit breaker pattern and automatic failover for Hub connectivity.
 * Ensures spoke continues operating when Hub becomes unreachable.
 *
 * Circuit Breaker States:
 * - CLOSED: Normal operation, all requests pass through
 * - OPEN: Hub failure detected, using cached policies, blocking Hub requests
 * - HALF_OPEN: Testing recovery, allowing limited probe requests
 *
 * Features:
 * - Circuit breaker with configurable thresholds
 * - Automatic failure detection from heartbeat/connectivity services
 * - Graceful recovery when Hub becomes available
 * - Maintenance mode for planned outages
 * - Comprehensive metrics and events
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export type CircuitState = 'closed' | 'open' | 'half_open';
export type FailoverMode = 'normal' | 'degraded' | 'offline' | 'maintenance';

export interface ICircuitBreakerConfig {
    /** Number of consecutive failures to open circuit */
    failureThreshold: number;
    /** Time in ms before attempting recovery (open → half_open) */
    recoveryTimeoutMs: number;
    /** Number of successful probes needed to close circuit */
    successThreshold: number;
    /** Maximum time in ms to stay in half_open state */
    halfOpenTimeoutMs: number;
    /** Time window in ms for counting failures (sliding window) */
    failureWindowMs: number;
    /** Percentage of requests to allow in half_open (0-100) */
    halfOpenRequestPercentage: number;
}

export interface IFailoverConfig {
    /** Unique spoke identifier */
    spokeId: string;
    /** Instance code (USA, FRA, etc.) */
    instanceCode: string;
    /** Circuit breaker configuration */
    circuitBreaker: ICircuitBreakerConfig;
    /** Enable automatic failover */
    autoFailover: boolean;
    /** Maximum time to operate offline in ms (policy cache validity) */
    maxOfflineTimeMs: number;
    /** Hub health check interval in ms */
    healthCheckIntervalMs: number;
    /** Enable maintenance mode */
    maintenanceMode: boolean;
}

export interface ICircuitBreakerState {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailure: Date | null;
    lastSuccess: Date | null;
    lastStateChange: Date;
    openedAt: Date | null;
    halfOpenAt: Date | null;
    failureHistory: Date[];
}

export interface IFailoverState {
    mode: FailoverMode;
    circuitBreaker: ICircuitBreakerState;
    offlineSince: Date | null;
    lastHubContact: Date | null;
    policyCacheValid: boolean;
    policyCacheExpiry: Date | null;
    maintenanceReason: string | null;
    maintenanceStartedAt: Date | null;
    recoveryAttempts: number;
    lastRecoveryAttempt: Date | null;
}

export interface IFailoverMetrics {
    totalFailures: number;
    totalSuccesses: number;
    totalRecoveries: number;
    totalCircuitOpens: number;
    totalHalfOpenProbes: number;
    averageRecoveryTimeMs: number;
    longestOutageMs: number;
    currentOutageMs: number;
    uptimePercentage: number;
}

export interface IProbeResult {
    success: boolean;
    latencyMs: number;
    error?: string;
    timestamp: Date;
}

// Default configuration
const DEFAULT_CONFIG: IFailoverConfig = {
    spokeId: process.env.SPOKE_ID || 'local',
    instanceCode: process.env.INSTANCE_CODE || 'USA',
    circuitBreaker: {
        failureThreshold: 5,
        recoveryTimeoutMs: 30000, // 30 seconds
        successThreshold: 3,
        halfOpenTimeoutMs: 60000, // 60 seconds
        failureWindowMs: 60000, // 60 seconds
        halfOpenRequestPercentage: 20,
    },
    autoFailover: true,
    maxOfflineTimeMs: 24 * 60 * 60 * 1000, // 24 hours
    healthCheckIntervalMs: 30000, // 30 seconds
    maintenanceMode: false,
};

// ============================================
// SPOKE FAILOVER SERVICE
// ============================================

class SpokeFailoverService extends EventEmitter {
    private config: IFailoverConfig;
    private state: IFailoverState;
    private metrics: IFailoverMetrics;
    private probeInterval: NodeJS.Timeout | null = null;
    private recoveryTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private startTime: Date;
    private initialized = false;

    constructor() {
        super();
        this.config = { ...DEFAULT_CONFIG };
        this.state = this.getInitialState();
        this.metrics = this.getInitialMetrics();
        this.startTime = new Date();
    }

    private getInitialState(): IFailoverState {
        return {
            mode: 'normal',
            circuitBreaker: {
                state: 'closed',
                failures: 0,
                successes: 0,
                lastFailure: null,
                lastSuccess: null,
                lastStateChange: new Date(),
                openedAt: null,
                halfOpenAt: null,
                failureHistory: [],
            },
            offlineSince: null,
            lastHubContact: null,
            policyCacheValid: true,
            policyCacheExpiry: null,
            maintenanceReason: null,
            maintenanceStartedAt: null,
            recoveryAttempts: 0,
            lastRecoveryAttempt: null,
        };
    }

    private getInitialMetrics(): IFailoverMetrics {
        return {
            totalFailures: 0,
            totalSuccesses: 0,
            totalRecoveries: 0,
            totalCircuitOpens: 0,
            totalHalfOpenProbes: 0,
            averageRecoveryTimeMs: 0,
            longestOutageMs: 0,
            currentOutageMs: 0,
            uptimePercentage: 100,
        };
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    /**
     * Initialize the failover service
     */
    initialize(config: Partial<IFailoverConfig> = {}): void {
        this.config = {
            ...DEFAULT_CONFIG,
            ...config,
            circuitBreaker: {
                ...DEFAULT_CONFIG.circuitBreaker,
                ...config.circuitBreaker,
            },
        };

        this.state = this.getInitialState();
        this.metrics = this.getInitialMetrics();
        this.startTime = new Date();
        this.initialized = true;

        // Set initial policy cache expiry
        this.state.policyCacheExpiry = new Date(
            Date.now() + this.config.maxOfflineTimeMs
        );

        logger.info('Spoke Failover Service initialized', {
            spokeId: this.config.spokeId,
            instanceCode: this.config.instanceCode,
            failureThreshold: this.config.circuitBreaker.failureThreshold,
            recoveryTimeoutMs: this.config.circuitBreaker.recoveryTimeoutMs,
            autoFailover: this.config.autoFailover,
        });

        this.emit('initialized', { config: this.config });
    }

    /**
     * Start failover monitoring
     */
    startMonitoring(): void {
        if (!this.initialized) {
            throw new Error('Failover service not initialized');
        }

        if (this.probeInterval) {
            logger.warn('Failover monitoring already running');
            return;
        }

        logger.info('Starting failover monitoring', {
            intervalMs: this.config.healthCheckIntervalMs,
        });

        // Schedule periodic probes when circuit is open
        this.probeInterval = setInterval(() => {
            if (this.state.circuitBreaker.state === 'open') {
                this.checkRecoveryTimeout();
            } else if (this.state.circuitBreaker.state === 'half_open') {
                this.checkHalfOpenTimeout();
            }
        }, this.config.healthCheckIntervalMs);

        this.emit('monitoringStarted');
    }

    /**
     * Stop failover monitoring
     */
    stopMonitoring(): void {
        if (this.probeInterval) {
            clearInterval(this.probeInterval);
            this.probeInterval = null;
        }

        // Clear all recovery timeouts
        for (const timeout of this.recoveryTimeouts.values()) {
            clearTimeout(timeout);
        }
        this.recoveryTimeouts.clear();

        logger.info('Failover monitoring stopped');
        this.emit('monitoringStopped');
    }

    // ============================================
    // CIRCUIT BREAKER OPERATIONS
    // ============================================

    /**
     * Record a successful operation
     */
    recordSuccess(): void {
        const now = new Date();
        this.state.circuitBreaker.lastSuccess = now;
        this.state.circuitBreaker.successes++;
        this.state.lastHubContact = now;
        this.metrics.totalSuccesses++;

        // Update policy cache validity
        this.state.policyCacheValid = true;
        this.state.policyCacheExpiry = new Date(
            Date.now() + this.config.maxOfflineTimeMs
        );

        logger.debug('Recorded success', {
            state: this.state.circuitBreaker.state,
            successes: this.state.circuitBreaker.successes,
        });

        if (this.state.circuitBreaker.state === 'half_open') {
            // Check if we've reached success threshold
            if (
                this.state.circuitBreaker.successes >=
                this.config.circuitBreaker.successThreshold
            ) {
                this.closeCircuit();
            }
        } else if (this.state.circuitBreaker.state === 'open') {
            // This shouldn't happen in normal operation
            logger.warn('Success recorded while circuit is open');
        }

        // Update mode if we were offline
        if (this.state.mode === 'offline' || this.state.mode === 'degraded') {
            this.transitionMode('normal');
        }

        this.emit('success', { timestamp: now });
    }

    /**
     * Record a failed operation
     */
    recordFailure(error?: string): void {
        const now = new Date();
        this.state.circuitBreaker.lastFailure = now;
        this.state.circuitBreaker.failures++;
        this.metrics.totalFailures++;

        // Add to failure history (sliding window)
        this.state.circuitBreaker.failureHistory.push(now);
        this.pruneFailureHistory();

        logger.debug('Recorded failure', {
            state: this.state.circuitBreaker.state,
            failures: this.state.circuitBreaker.failures,
            error,
        });

        if (this.state.circuitBreaker.state === 'closed') {
            // Check if we've reached failure threshold within window
            if (this.getRecentFailureCount() >= this.config.circuitBreaker.failureThreshold) {
                this.openCircuit();
            }
        } else if (this.state.circuitBreaker.state === 'half_open') {
            // Any failure in half_open re-opens the circuit
            this.openCircuit();
        }

        this.emit('failure', { timestamp: now, error });
    }

    /**
     * Open the circuit breaker
     */
    private openCircuit(): void {
        const wasOpen = this.state.circuitBreaker.state === 'open';
        const previousState = this.state.circuitBreaker.state;

        this.state.circuitBreaker.state = 'open';
        this.state.circuitBreaker.openedAt = new Date();
        this.state.circuitBreaker.lastStateChange = new Date();
        this.state.circuitBreaker.successes = 0;
        this.metrics.totalCircuitOpens++;

        // Set offline since if not already set
        if (!this.state.offlineSince) {
            this.state.offlineSince = new Date();
        }

        logger.warn('Circuit breaker OPENED', {
            spokeId: this.config.spokeId,
            previousState,
            failures: this.state.circuitBreaker.failures,
            recentFailures: this.getRecentFailureCount(),
        });

        // Transition to degraded mode
        this.transitionMode('degraded');

        // Schedule recovery timeout
        this.scheduleRecoveryAttempt();

        if (!wasOpen) {
            this.emit('circuitOpened', {
                timestamp: new Date(),
                failures: this.state.circuitBreaker.failures,
            });
        }
    }

    /**
     * Transition to half-open state
     */
    private halfOpenCircuit(): void {
        if (this.state.circuitBreaker.state !== 'open') {
            return;
        }

        this.state.circuitBreaker.state = 'half_open';
        this.state.circuitBreaker.halfOpenAt = new Date();
        this.state.circuitBreaker.lastStateChange = new Date();
        this.state.circuitBreaker.successes = 0;
        this.state.circuitBreaker.failures = 0;
        this.state.recoveryAttempts++;
        this.state.lastRecoveryAttempt = new Date();

        logger.info('Circuit breaker HALF-OPEN', {
            spokeId: this.config.spokeId,
            recoveryAttempts: this.state.recoveryAttempts,
        });

        this.emit('circuitHalfOpen', {
            timestamp: new Date(),
            recoveryAttempts: this.state.recoveryAttempts,
        });
    }

    /**
     * Close the circuit breaker (recovery complete)
     */
    private closeCircuit(): void {
        const wasOpen = this.state.circuitBreaker.state !== 'closed';
        const outageMs = this.state.offlineSince
            ? Date.now() - this.state.offlineSince.getTime()
            : 0;

        this.state.circuitBreaker.state = 'closed';
        this.state.circuitBreaker.lastStateChange = new Date();
        this.state.circuitBreaker.failures = 0;
        this.state.circuitBreaker.successes = 0;
        this.state.circuitBreaker.failureHistory = [];
        this.state.circuitBreaker.openedAt = null;
        this.state.circuitBreaker.halfOpenAt = null;

        // Update metrics
        if (outageMs > 0) {
            this.metrics.totalRecoveries++;
            this.metrics.longestOutageMs = Math.max(
                this.metrics.longestOutageMs,
                outageMs
            );
            this.metrics.averageRecoveryTimeMs =
                (this.metrics.averageRecoveryTimeMs *
                    (this.metrics.totalRecoveries - 1) +
                    outageMs) /
                this.metrics.totalRecoveries;
        }

        this.state.offlineSince = null;
        this.metrics.currentOutageMs = 0;

        logger.info('Circuit breaker CLOSED', {
            spokeId: this.config.spokeId,
            outageMs,
            recoveryAttempts: this.state.recoveryAttempts,
        });

        // Transition to normal mode
        this.transitionMode('normal');

        // Clear recovery timeouts
        this.clearRecoveryTimeouts();

        if (wasOpen) {
            this.emit('circuitClosed', {
                timestamp: new Date(),
                outageMs,
                recoveryAttempts: this.state.recoveryAttempts,
            });

            this.emit('recovered', {
                outageMs,
                recoveryAttempts: this.state.recoveryAttempts,
            });
        }
    }

    /**
     * Force close the circuit (manual recovery)
     */
    forceClose(): void {
        logger.info('Force closing circuit breaker', {
            spokeId: this.config.spokeId,
            previousState: this.state.circuitBreaker.state,
        });

        this.closeCircuit();
        this.emit('forceClosed', { timestamp: new Date() });
    }

    /**
     * Force open the circuit (manual failover)
     */
    forceOpen(reason: string = 'Manual failover'): void {
        logger.info('Force opening circuit breaker', {
            spokeId: this.config.spokeId,
            reason,
        });

        this.openCircuit();
        this.emit('forceOpened', { timestamp: new Date(), reason });
    }

    // ============================================
    // PROBE OPERATIONS
    // ============================================

    /**
     * Check if a request should be allowed through
     */
    shouldAllowRequest(): boolean {
        // In maintenance mode, block all requests
        if (this.state.mode === 'maintenance') {
            return false;
        }

        // Circuit closed - allow all
        if (this.state.circuitBreaker.state === 'closed') {
            return true;
        }

        // Circuit open - block all Hub requests
        if (this.state.circuitBreaker.state === 'open') {
            return false;
        }

        // Circuit half-open - allow percentage of requests
        const percentage = this.config.circuitBreaker.halfOpenRequestPercentage;
        const random = Math.random() * 100;
        return random < percentage;
    }

    /**
     * Execute a probe request to test Hub connectivity
     */
    async executeProbe(
        probeFunction: () => Promise<boolean>
    ): Promise<IProbeResult> {
        const startTime = Date.now();
        this.metrics.totalHalfOpenProbes++;

        try {
            const success = await probeFunction();
            const latencyMs = Date.now() - startTime;

            const result: IProbeResult = {
                success,
                latencyMs,
                timestamp: new Date(),
            };

            if (success) {
                this.recordSuccess();
            } else {
                this.recordFailure('Probe returned false');
            }

            this.emit('probeComplete', result);
            return result;
        } catch (error) {
            const latencyMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            const result: IProbeResult = {
                success: false,
                latencyMs,
                error: errorMessage,
                timestamp: new Date(),
            };

            this.recordFailure(errorMessage);
            this.emit('probeFailed', result);
            return result;
        }
    }

    // ============================================
    // MAINTENANCE MODE
    // ============================================

    /**
     * Enter maintenance mode
     */
    enterMaintenanceMode(reason: string): void {
        logger.info('Entering maintenance mode', {
            spokeId: this.config.spokeId,
            reason,
        });

        this.state.mode = 'maintenance';
        this.state.maintenanceReason = reason;
        this.state.maintenanceStartedAt = new Date();
        this.config.maintenanceMode = true;

        this.emit('maintenanceStarted', {
            timestamp: new Date(),
            reason,
        });
    }

    /**
     * Exit maintenance mode
     */
    exitMaintenanceMode(): void {
        logger.info('Exiting maintenance mode', {
            spokeId: this.config.spokeId,
            duration: this.state.maintenanceStartedAt
                ? Date.now() - this.state.maintenanceStartedAt.getTime()
                : 0,
        });

        this.state.maintenanceReason = null;
        this.state.maintenanceStartedAt = null;
        this.config.maintenanceMode = false;

        // Force mode transition out of maintenance
        this.state.mode = 'normal'; // Temporarily set to allow transition

        // Determine appropriate mode based on circuit state
        if (this.state.circuitBreaker.state === 'closed') {
            this.state.mode = 'normal';
        } else if (this.state.circuitBreaker.state === 'open') {
            this.state.mode = 'degraded';
        } else {
            this.state.mode = 'degraded';
        }

        this.emit('maintenanceEnded', { timestamp: new Date() });
    }

    /**
     * Check if in maintenance mode
     */
    isInMaintenanceMode(): boolean {
        return this.config.maintenanceMode || this.state.mode === 'maintenance';
    }

    // ============================================
    // MODE TRANSITIONS
    // ============================================

    /**
     * Transition to a new failover mode
     */
    private transitionMode(newMode: FailoverMode): void {
        if (this.state.mode === 'maintenance' && newMode !== 'maintenance') {
            // Don't transition out of maintenance mode automatically
            return;
        }

        const previousMode = this.state.mode;
        if (previousMode === newMode) {
            return;
        }

        this.state.mode = newMode;

        logger.info('Failover mode changed', {
            spokeId: this.config.spokeId,
            from: previousMode,
            to: newMode,
        });

        this.emit('modeChange', {
            from: previousMode,
            to: newMode,
            timestamp: new Date(),
        });
    }

    // ============================================
    // RECOVERY MANAGEMENT
    // ============================================

    /**
     * Schedule a recovery attempt
     */
    private scheduleRecoveryAttempt(): void {
        const timeoutId = crypto.randomUUID();
        const timeout = setTimeout(() => {
            this.recoveryTimeouts.delete(timeoutId);
            this.halfOpenCircuit();
        }, this.config.circuitBreaker.recoveryTimeoutMs);

        this.recoveryTimeouts.set(timeoutId, timeout);

        logger.debug('Scheduled recovery attempt', {
            spokeId: this.config.spokeId,
            timeoutMs: this.config.circuitBreaker.recoveryTimeoutMs,
        });
    }

    /**
     * Check if recovery timeout has expired
     */
    private checkRecoveryTimeout(): void {
        if (
            this.state.circuitBreaker.state === 'open' &&
            this.state.circuitBreaker.openedAt
        ) {
            const elapsed =
                Date.now() - this.state.circuitBreaker.openedAt.getTime();
            if (elapsed >= this.config.circuitBreaker.recoveryTimeoutMs) {
                this.halfOpenCircuit();
            }
        }
    }

    /**
     * Check if half-open timeout has expired
     */
    private checkHalfOpenTimeout(): void {
        if (
            this.state.circuitBreaker.state === 'half_open' &&
            this.state.circuitBreaker.halfOpenAt
        ) {
            const elapsed =
                Date.now() - this.state.circuitBreaker.halfOpenAt.getTime();
            if (elapsed >= this.config.circuitBreaker.halfOpenTimeoutMs) {
                // Timeout expired without success - re-open circuit
                logger.warn('Half-open timeout expired, re-opening circuit', {
                    spokeId: this.config.spokeId,
                    elapsed,
                });
                this.openCircuit();
            }
        }
    }

    /**
     * Clear all recovery timeouts
     */
    private clearRecoveryTimeouts(): void {
        for (const timeout of this.recoveryTimeouts.values()) {
            clearTimeout(timeout);
        }
        this.recoveryTimeouts.clear();
    }

    // ============================================
    // FAILURE HISTORY
    // ============================================

    /**
     * Prune old failures outside the sliding window
     */
    private pruneFailureHistory(): void {
        const windowStart = Date.now() - this.config.circuitBreaker.failureWindowMs;
        this.state.circuitBreaker.failureHistory =
            this.state.circuitBreaker.failureHistory.filter(
                (timestamp) => timestamp.getTime() > windowStart
            );
    }

    /**
     * Get count of recent failures within window
     */
    getRecentFailureCount(): number {
        this.pruneFailureHistory();
        return this.state.circuitBreaker.failureHistory.length;
    }

    // ============================================
    // PUBLIC API
    // ============================================

    /**
     * Get current failover state
     */
    getState(): IFailoverState {
        // Update current outage time
        if (this.state.offlineSince) {
            this.metrics.currentOutageMs =
                Date.now() - this.state.offlineSince.getTime();
        }

        return { ...this.state };
    }

    /**
     * Get circuit breaker state
     */
    getCircuitState(): CircuitState {
        return this.state.circuitBreaker.state;
    }

    /**
     * Get current failover mode
     */
    getMode(): FailoverMode {
        return this.state.mode;
    }

    /**
     * Get failover metrics
     */
    getMetrics(): IFailoverMetrics {
        // Calculate uptime percentage
        const totalTime = Date.now() - this.startTime.getTime();
        if (totalTime > 0) {
            const outageTime =
                this.metrics.longestOutageMs + this.metrics.currentOutageMs;
            this.metrics.uptimePercentage = Math.max(
                0,
                Math.min(100, ((totalTime - outageTime) / totalTime) * 100)
            );
        } else {
            this.metrics.uptimePercentage = 100;
        }

        return { ...this.metrics };
    }

    /**
     * Check if circuit is open
     */
    isCircuitOpen(): boolean {
        return this.state.circuitBreaker.state === 'open';
    }

    /**
     * Check if circuit is half-open
     */
    isCircuitHalfOpen(): boolean {
        return this.state.circuitBreaker.state === 'half_open';
    }

    /**
     * Check if circuit is closed
     */
    isCircuitClosed(): boolean {
        return this.state.circuitBreaker.state === 'closed';
    }

    /**
     * Check if operating in degraded mode
     */
    isDegraded(): boolean {
        return this.state.mode === 'degraded' || this.state.mode === 'offline';
    }

    /**
     * Get time since last Hub contact
     */
    getTimeSinceLastContact(): number | null {
        if (!this.state.lastHubContact) {
            return null;
        }
        return Date.now() - this.state.lastHubContact.getTime();
    }

    /**
     * Check if policy cache is still valid
     */
    isPolicyCacheValid(): boolean {
        if (!this.state.policyCacheExpiry) {
            return false;
        }
        return this.state.policyCacheExpiry.getTime() > Date.now();
    }

    /**
     * Update policy cache expiry
     */
    updatePolicyCacheExpiry(expiryDate: Date): void {
        this.state.policyCacheExpiry = expiryDate;
        this.state.policyCacheValid = expiryDate.getTime() > Date.now();
    }

    /**
     * Reset all state and metrics
     */
    reset(): void {
        this.stopMonitoring();
        this.state = this.getInitialState();
        this.metrics = this.getInitialMetrics();
        this.startTime = new Date();

        logger.info('Failover service reset', {
            spokeId: this.config.spokeId,
        });

        this.emit('reset', { timestamp: new Date() });
    }

    /**
     * Shutdown the service
     */
    shutdown(): void {
        this.stopMonitoring();
        this.initialized = false;

        logger.info('Spoke Failover Service shutdown', {
            spokeId: this.config.spokeId,
        });

        this.emit('shutdown');
    }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const spokeFailover = new SpokeFailoverService();

export default SpokeFailoverService;

