import axios from 'axios';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { MongoClient } from 'mongodb';
import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { getAllCircuitBreakerStats, CircuitState } from '../utils/circuit-breaker';
import { authzCacheService } from './authz-cache.service';
import { prometheusMetrics } from './prometheus-metrics.service';

// ============================================
// Health Check Service (Phase 3)
// ============================================
// Purpose: Monitor system health and dependencies
// Endpoints: /health, /health/detailed, /health/ready, /health/live

// ============================================
// HTTPS Agent Configuration (Phase 3.1)
// ============================================
// Creates a reusable HTTPS agent that trusts mkcert CA certificates
// This ensures all health checks work with HTTPS services
//
// CA Certificate Loading Priority:
//   1. /app/certs/ca/rootCA.pem (Docker container mount)
//   2. NODE_EXTRA_CA_CERTS environment variable path
//   3. System CA store (includes mkcert if installed locally)
// ============================================

/**
 * Load CA certificates for HTTPS health checks
 * Supports both Docker container paths and local development
 */
function loadCACertificates(): Buffer[] | undefined {
    const caPaths = [
        '/app/certs/ca/rootCA.pem',           // Docker container path
        process.env.NODE_EXTRA_CA_CERTS,      // Environment variable
        path.join(process.cwd(), 'certs', 'ca', 'rootCA.pem'),  // Local dev
    ].filter(Boolean) as string[];

    const loadedCerts: Buffer[] = [];

    for (const caPath of caPaths) {
        try {
            if (fs.existsSync(caPath)) {
                const cert = fs.readFileSync(caPath);
                loadedCerts.push(cert);
                logger.debug('Loaded CA certificate for health checks', { path: caPath });
            }
        } catch (err) {
            logger.debug('Could not load CA certificate', { path: caPath, error: err });
        }
    }

    return loadedCerts.length > 0 ? loadedCerts : undefined;
}

// Load CA certs once at module initialization
const caCertificates = loadCACertificates();

/**
 * Create a shared HTTPS agent for health check requests
 * Trusts mkcert CA certificates for secure TLS verification
 */
function createHealthCheckHttpsAgent(): https.Agent {
    return new https.Agent({
        minVersion: 'TLSv1.2',
        // Use loaded CA certs, or let Node.js use system CA (which NODE_EXTRA_CA_CERTS augments)
        ca: caCertificates,
        // Enable TLS verification when CA certs are available, otherwise allow self-signed
        rejectUnauthorized: caCertificates ? true : false,
        // Keep connections alive for performance
        keepAlive: true,
        maxSockets: 10,
    });
}

// Shared HTTPS agent instance for all health check requests
const healthCheckHttpsAgent = createHealthCheckHttpsAgent();

// MongoDB configuration
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DATABASE || (process.env.NODE_ENV === 'test' ? 'dive-v3-test' : 'dive-v3');

/**
 * Overall health status
 */
export enum HealthStatus {
    HEALTHY = 'healthy',
    DEGRADED = 'degraded',
    UNHEALTHY = 'unhealthy'
}

/**
 * Service health check result
 */
export interface IServiceHealth {
    status: 'up' | 'down' | 'degraded';
    responseTime?: number;
    error?: string;
    details?: Record<string, any>;
}

/**
 * Basic health check response
 */
export interface IBasicHealth {
    status: HealthStatus;
    timestamp: string;
    uptime: number;
}

/**
 * Detailed health check response
 */
export interface IDetailedHealth extends IBasicHealth {
    services: {
        mongodb: IServiceHealth;
        opa: IServiceHealth;
        keycloak: IServiceHealth;
        redis?: IServiceHealth;
        kas?: IServiceHealth;
        cache?: IServiceHealth;
        blacklistRedis?: IServiceHealth;
    };
    metrics: {
        activeIdPs: number;
        pendingApprovals: number;
        cacheSizeDecisions: number;
        cacheHitRate: number;
    };
    memory: {
        used: number;
        total: number;
        percentage: number;
    };
    circuitBreakers: Record<string, {
        state: CircuitState;
        failures: number;
        rejectCount: number;
    }>;
}

/**
 * Readiness check response (Kubernetes)
 */
export interface IReadinessCheck {
    ready: boolean;
    checks: {
        mongodb: boolean;
        opa: boolean;
        keycloak: boolean;
    };
    timestamp: string;
}

/**
 * Liveness check response (Kubernetes)
 */
export interface ILivenessCheck {
    alive: boolean;
    timestamp: string;
}

/**
 * Health Service Class
 */
class HealthService {
    private startTime: Date;
    private mongoClient: MongoClient | null = null;
    private metricsIntervalId: NodeJS.Timeout | null = null;

    // Metrics update interval (10 seconds)
    private readonly METRICS_UPDATE_INTERVAL_MS = 10000;

    constructor() {
        this.startTime = new Date();
        logger.info('Health service initialized');

        // Start periodic metrics publishing (Phase 3.2)
        this.startMetricsPolling();
    }

    /**
     * Start periodic polling to update Prometheus metrics (Phase 3.2)
     * Updates circuit breaker states every 10 seconds
     */
    private startMetricsPolling(): void {
        this.metricsIntervalId = setInterval(() => {
            this.publishCircuitBreakerMetrics();
        }, this.METRICS_UPDATE_INTERVAL_MS);

        // Publish initial metrics immediately
        this.publishCircuitBreakerMetrics();

        logger.info('Started periodic circuit breaker metrics polling', {
            intervalMs: this.METRICS_UPDATE_INTERVAL_MS
        });
    }

    /**
     * Publish circuit breaker states to Prometheus (Phase 3.2)
     * Called periodically by metricsPolling
     */
    private publishCircuitBreakerMetrics(): void {
        try {
            const cbStats = getAllCircuitBreakerStats();

            for (const [service, stats] of Object.entries(cbStats)) {
                // Update circuit breaker state gauge
                prometheusMetrics.setCircuitBreakerState(
                    service,
                    stats.state as 'CLOSED' | 'HALF_OPEN' | 'OPEN'
                );

                // Update failure count
                prometheusMetrics.setCircuitBreakerFailures(service, stats.failures);

                // Log state changes for debugging
                if (stats.state !== CircuitState.CLOSED) {
                    logger.debug('Circuit breaker metric published', {
                        service,
                        state: stats.state,
                        failures: stats.failures,
                        rejectCount: stats.rejectCount
                    });
                }
            }
        } catch (error) {
            logger.error('Failed to publish circuit breaker metrics', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Stop metrics polling (for cleanup)
     */
    stopMetricsPolling(): void {
        if (this.metricsIntervalId) {
            clearInterval(this.metricsIntervalId);
            this.metricsIntervalId = null;
            logger.info('Stopped circuit breaker metrics polling');
        }
    }

    /**
     * Set MongoDB client for health checks
     */
    setMongoClient(client: MongoClient): void {
        this.mongoClient = client;
    }

    /**
     * Basic health check
     * Used by load balancers for quick health status
     */
    async basicHealthCheck(): Promise<IBasicHealth> {
        const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);

        // Quick health determination
        let status = HealthStatus.HEALTHY;

        try {
            // Check if critical services are responding
            const mongoHealth = await this.checkMongoDB();
            const opaHealth = await this.checkOPA();

            if (mongoHealth.status === 'down' || opaHealth.status === 'down') {
                status = HealthStatus.UNHEALTHY;
            } else if (mongoHealth.status === 'degraded' || opaHealth.status === 'degraded') {
                status = HealthStatus.DEGRADED;
            }
        } catch (error) {
            status = HealthStatus.UNHEALTHY;
        }

        return {
            status,
            timestamp: new Date().toISOString(),
            uptime,
        };
    }

    /**
     * Detailed health check
     * Provides comprehensive system status
     */
    async detailedHealthCheck(): Promise<IDetailedHealth> {
        const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);

        // Check all services
        const [mongoHealth, opaHealth, keycloakHealth, kasHealth] = await Promise.all([
            this.checkMongoDB(),
            this.checkOPA(),
            this.checkKeycloak(),
            this.checkKAS(),
        ]);

        // Check Redis health
        const redisHealth = await this.checkRedis();
        const blacklistRedisHealth = await this.checkBlacklistRedis();

        // Check cache health
        const cacheHealthCheck = authzCacheService.isHealthy();
        const cacheHealth: IServiceHealth = {
            status: cacheHealthCheck.healthy ? 'up' : 'degraded',
            details: {
                healthy: cacheHealthCheck.healthy,
                reason: cacheHealthCheck.reason,
            },
        };

        // Get metrics
        const metrics = await this.getMetrics();

        // Get memory usage
        const memory = this.getMemoryUsage();

        // Get circuit breaker states
        const circuitBreakers = this.getCircuitBreakerInfo();

        // Determine overall status
        let status = HealthStatus.HEALTHY;

        if (mongoHealth.status === 'down' || opaHealth.status === 'down') {
            status = HealthStatus.UNHEALTHY;
        } else if (
            mongoHealth.status === 'degraded' ||
            opaHealth.status === 'degraded' ||
            keycloakHealth.status === 'degraded' ||
            redisHealth.status === 'down' ||
            blacklistRedisHealth.status === 'down' ||
            !cacheHealthCheck.healthy
        ) {
            status = HealthStatus.DEGRADED;
        }

        // Publish service health metrics to Prometheus (Phase 3.2)
        this.publishServiceHealthMetrics({
            mongodb: mongoHealth,
            opa: opaHealth,
            keycloak: keycloakHealth,
            redis: redisHealth,
            kas: kasHealth,
            blacklistRedis: blacklistRedisHealth,
        });

        return {
            status,
            timestamp: new Date().toISOString(),
            uptime,
            services: {
                mongodb: mongoHealth,
                opa: opaHealth,
                keycloak: keycloakHealth,
                redis: redisHealth,
                kas: kasHealth,
                cache: cacheHealth,
                // Include blacklist Redis in services for visibility
                blacklistRedis: blacklistRedisHealth,
            },
            metrics,
            memory,
            circuitBreakers,
        };
    }

    /**
     * Publish service health metrics to Prometheus (Phase 3.2)
     */
    private publishServiceHealthMetrics(services: Record<string, IServiceHealth | undefined>): void {
        try {
            for (const [service, health] of Object.entries(services)) {
                if (health) {
                    const isHealthy = health.status === 'up';

                    // Map service names to appropriate Prometheus method
                    switch (service) {
                        case 'opa':
                            prometheusMetrics.setOPAHealth(
                                process.env.INSTANCE_NAME || 'default',
                                isHealthy
                            );
                            break;
                        case 'mongodb':
                            prometheusMetrics.setMongoHealth(
                                process.env.MONGODB_REPLICA_SET || 'standalone',
                                isHealthy
                            );
                            break;
                        case 'redis':
                        case 'blacklistRedis':
                            prometheusMetrics.setRedisHealth(
                                service === 'redis' ? 'cache' : 'blacklist',
                                isHealthy
                            );
                            break;
                        default:
                            prometheusMetrics.setServiceHealth(service, isHealthy);
                    }
                }
            }
        } catch (error) {
            logger.error('Failed to publish service health metrics', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Readiness check for Kubernetes
     * Returns whether the service is ready to accept traffic
     */
    async readinessCheck(): Promise<IReadinessCheck> {
        const checks = {
            mongodb: false,
            opa: false,
            keycloak: false,
        };

        try {
            const mongoHealth = await this.checkMongoDB();
            checks.mongodb = mongoHealth.status === 'up';
        } catch (error) {
            checks.mongodb = false;
        }

        try {
            const opaHealth = await this.checkOPA();
            checks.opa = opaHealth.status === 'up';
        } catch (error) {
            checks.opa = false;
        }

        try {
            const keycloakHealth = await this.checkKeycloak();
            checks.keycloak = keycloakHealth.status === 'up';
        } catch (error) {
            checks.keycloak = false;
        }

        // CRITICAL: For Hub instances, also check if bootstrap is complete
        // This ensures seeding doesn't start until Hub self-registration is done
        const isHub = process.env.SPOKE_MODE !== 'true';
        let bootstrapReady = true;  // Spokes don't need bootstrap check

        if (isHub) {
            try {
                const { federationBootstrap } = await import('./federation-bootstrap.service');
                bootstrapReady = federationBootstrap.isBootstrapComplete();

                if (!bootstrapReady) {
                    logger.debug('Readiness check waiting for Hub bootstrap to complete');
                }
            } catch (error) {
                logger.warn('Could not check bootstrap status', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                // If bootstrap service is not available, don't block readiness
                bootstrapReady = true;
            }
        }

        const ready = checks.mongodb && checks.opa && checks.keycloak && bootstrapReady;

        return {
            ready,
            checks,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Liveness check for Kubernetes
     * Returns whether the process is alive
     */
    livenessCheck(): ILivenessCheck {
        return {
            alive: true,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Check MongoDB health
     */
    private async checkMongoDB(): Promise<IServiceHealth> {
        const startTime = Date.now();

        try {
            if (!this.mongoClient) {
                // Try to connect
                this.mongoClient = new MongoClient(MONGODB_URL);
                await this.mongoClient.connect();
            } else {
                // Verify existing connection
                try {
                    await this.mongoClient.db().admin().ping();
                } catch {
                    // Connection lost, reconnect
                    this.mongoClient = new MongoClient(MONGODB_URL);
                    await this.mongoClient.connect();
                }
            }

            // Ping the database
            await this.mongoClient.db(DB_NAME).admin().ping();

            const responseTime = Date.now() - startTime;

            return {
                status: responseTime < 100 ? 'up' : 'degraded',
                responseTime,
                details: {
                    connected: true,
                },
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;

            logger.error('MongoDB health check failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            return {
                status: 'down',
                responseTime,
                error: error instanceof Error ? error.message : 'Connection failed',
            };
        }
    }

    /**
     * Check OPA health
     */
    private async checkOPA(): Promise<IServiceHealth> {
        const startTime = Date.now();
        const opaUrl = process.env.OPA_URL || 'http://localhost:8181';

        try {
            const config: any = {
                timeout: 5000,
            };

            // Use shared HTTPS agent for HTTPS URLs (trusts mkcert CA)
            if (opaUrl.startsWith('https://')) {
                config.httpsAgent = healthCheckHttpsAgent;
            }

            const response = await axios.get(`${opaUrl}/health`, config);

            const responseTime = Date.now() - startTime;

            return {
                status: responseTime < 100 ? 'up' : 'degraded',
                responseTime,
                details: response.data,
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;

            const errorMessage = error instanceof Error
                ? error.message
                : (error && typeof error === 'object' && 'message' in error ? String((error as any).message) : 'Unknown error');

            logger.error('OPA health check failed', {
                opaUrl,
                error: errorMessage,
                hasHttpsAgent: opaUrl.startsWith('https://'),
                hasCACerts: !!caCertificates,
            });

            return {
                status: 'down',
                responseTime,
                error: error instanceof Error
                    ? error.message
                    : (error && typeof error === 'object' && 'message' in error ? String((error as any).message) : 'Connection failed'),
            };
        }
    }

    /**
     * Check Keycloak health
     *
     * Health check priority:
     * 1. /health/ready (Keycloak 17+ with health-enabled=true)
     * 2. /health (older Keycloak versions)
     * 3. /realms/master (always works - checks if Keycloak is serving)
     */
    private async checkKeycloak(): Promise<IServiceHealth> {
        const startTime = Date.now();
        const keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';

        // Build axios config with HTTPS agent if needed
        const config: any = {
            timeout: 5000,
        };
        if (keycloakUrl.startsWith('https://')) {
            config.httpsAgent = healthCheckHttpsAgent;
        }

        // Try health endpoints first
        const healthEndpoints = ['/health/ready', '/health'];

        for (const endpoint of healthEndpoints) {
            try {
                const response = await axios.get(`${keycloakUrl}${endpoint}`, { ...config, timeout: 2000 });
                const responseTime = Date.now() - startTime;
                return {
                    status: responseTime < 500 ? 'up' : 'degraded',
                    responseTime,
                    details: response.data,
                };
            } catch {
                // Try next endpoint
            }
        }

        // Final fallback: check /realms/master (always available)
        // This confirms Keycloak is running even if health endpoints are disabled
        try {
            await axios.get(`${keycloakUrl}/realms/master`, { ...config, timeout: 2000 });
            const responseTime = Date.now() - startTime;
            return {
                status: responseTime < 500 ? 'up' : 'degraded',
                responseTime,
                details: { note: 'Health endpoints not enabled, verified via /realms/master' },
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;

            logger.error('Keycloak health check failed', {
                keycloakUrl,
                error: error instanceof Error ? error.message : 'Unknown error',
                hasCACerts: !!caCertificates,
            });

            return {
                status: 'down',
                responseTime,
                error: error instanceof Error ? error.message : 'Connection failed',
            };
        }
    }

    /**
     * Check KAS health (optional)
     */
    private async checkKAS(): Promise<IServiceHealth | undefined> {
        const kasUrl = process.env.KAS_URL;

        if (!kasUrl) {
            // KAS is optional
            return undefined;
        }

        const startTime = Date.now();

        // Build axios config with HTTPS agent if needed
        const config: any = {
            timeout: 5000,
        };
        if (kasUrl.startsWith('https://')) {
            config.httpsAgent = healthCheckHttpsAgent;
        }

        try {
            const response = await axios.get(`${kasUrl}/health`, config);

            const responseTime = Date.now() - startTime;

            return {
                status: responseTime < 200 ? 'up' : 'degraded',
                responseTime,
                details: response.data,
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;

            logger.error('KAS health check failed', {
                kasUrl,
                error: error instanceof Error ? error.message : 'Unknown error',
                hasCACerts: !!caCertificates,
            });

            return {
                status: 'down',
                responseTime,
                error: error instanceof Error ? error.message : 'Connection failed',
            };
        }
    }

    /**
     * Get application metrics
     */
    private async getMetrics(): Promise<{
        activeIdPs: number;
        pendingApprovals: number;
        cacheSizeDecisions: number;
        cacheHitRate: number;
    }> {
        try {
            // Get cache stats
            const cacheStats = authzCacheService.getStats();

            // Get IdP counts (if MongoDB available)
            let activeIdPs = 0;
            let pendingApprovals = 0;

            if (this.mongoClient) {
                try {
                    const db = this.mongoClient.db(DB_NAME);

                    // Count active IdPs (approved submissions)
                    activeIdPs = await db.collection('idp_submissions').countDocuments({
                        status: 'approved',
                    });

                    // Count pending approvals
                    pendingApprovals = await db.collection('idp_submissions').countDocuments({
                        status: 'pending',
                    });
                } catch (error) {
                    logger.warn('Could not fetch IdP metrics', { error });
                }
            }

            return {
                activeIdPs,
                pendingApprovals,
                cacheSizeDecisions: cacheStats.size,
                cacheHitRate: cacheStats.hitRate,
            };
        } catch (error) {
            logger.error('Error getting metrics', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            return {
                activeIdPs: 0,
                pendingApprovals: 0,
                cacheSizeDecisions: 0,
                cacheHitRate: 0,
            };
        }
    }

    /**
     * Get memory usage
     */
    private getMemoryUsage(): {
        used: number;
        total: number;
        percentage: number;
    } {
        const memUsage = process.memoryUsage();
        const used = Math.round(memUsage.heapUsed / 1024 / 1024); // MB
        const total = Math.round(memUsage.heapTotal / 1024 / 1024); // MB
        const percentage = Math.round((used / total) * 100);

        return {
            used,
            total,
            percentage,
        };
    }

    /**
     * Get circuit breaker information
     */
    private getCircuitBreakerInfo(): Record<string, {
        state: CircuitState;
        failures: number;
        rejectCount: number;
    }> {
        const stats = getAllCircuitBreakerStats();
        const info: Record<string, any> = {};

        for (const [name, stat] of Object.entries(stats)) {
            info[name] = {
                state: stat.state,
                failures: stat.failures,
                rejectCount: stat.rejectCount,
            };
        }

        return info;
    }

    /**
     * Check Redis health
     */
    private async checkRedis(): Promise<IServiceHealth> {
        const startTime = Date.now();

        let redisClient: Redis | null = null;

        try {
            const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';

            // Create a temporary Redis client for health check
            redisClient = new Redis(redisUrl, {
                connectTimeout: 5000,
                commandTimeout: 5000,
                maxRetriesPerRequest: 1,
                lazyConnect: false,
            });

            // Wait for connection
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Redis connection timeout'));
                }, 5000);

                redisClient!.once('ready', () => {
                    clearTimeout(timeout);
                    resolve();
                });

                redisClient!.once('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });

            // Ping test
            await redisClient.ping();

            const responseTime = Date.now() - startTime;

            return {
                status: 'up',
                responseTime,
                details: {
                    mode: 'standalone',
                    message: 'Redis ping successful',
                },
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown Redis error';

            logger.error('Redis health check failed', {
                error: errorMessage,
                responseTime,
            });

            return {
                status: 'down',
                responseTime,
                error: errorMessage,
                details: {
                    reason: 'Redis connection failed',
                },
            };
        } finally {
            if (redisClient) {
                try {
                    redisClient.disconnect();
                } catch (err) {
                    // Ignore disconnect errors
                }
            }
        }
    }

    /**
     * Check blacklist Redis health
     */
    private async checkBlacklistRedis(): Promise<IServiceHealth> {
        const startTime = Date.now();

        let redisClient: Redis | null = null;

        try {
            const redisUrl = process.env.BLACKLIST_REDIS_URL || 'redis://redis-blacklist:6380';

            // Create a temporary Redis client for health check
            redisClient = new Redis(redisUrl, {
                connectTimeout: 5000,
                commandTimeout: 5000,
                maxRetriesPerRequest: 1,
                lazyConnect: false,
            });

            // Wait for connection
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Blacklist Redis connection timeout'));
                }, 5000);

                redisClient!.once('ready', () => {
                    clearTimeout(timeout);
                    resolve();
                });

                redisClient!.once('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });

            // Ping test
            await redisClient.ping();

            const responseTime = Date.now() - startTime;

            return {
                status: 'up',
                responseTime,
                details: {
                    mode: 'standalone',
                    message: 'Blacklist Redis ping successful',
                },
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown Blacklist Redis error';

            logger.error('Blacklist Redis health check failed', {
                error: errorMessage,
                responseTime,
            });

            return {
                status: 'down',
                responseTime,
                error: errorMessage,
                details: {
                    reason: 'Blacklist Redis connection failed',
                },
            };
        } finally {
            if (redisClient) {
                try {
                    redisClient.disconnect();
                } catch (err) {
                    // Ignore disconnect errors
                }
            }
        }
    }
}

// Export singleton instance
export const healthService = new HealthService();
