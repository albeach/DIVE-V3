import axios from 'axios';
import { MongoClient } from 'mongodb';
import { logger } from '../utils/logger';
import { getAllCircuitBreakerStats, CircuitState } from '../utils/circuit-breaker';
import { authzCacheService } from './authz-cache.service';

// ============================================
// Health Check Service (Phase 3)
// ============================================
// Purpose: Monitor system health and dependencies
// Endpoints: /health, /health/detailed, /health/ready, /health/live

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
        kas?: IServiceHealth;
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

    constructor() {
        this.startTime = new Date();
        logger.info('Health service initialized');
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
            keycloakHealth.status === 'degraded'
        ) {
            status = HealthStatus.DEGRADED;
        }

        return {
            status,
            timestamp: new Date().toISOString(),
            uptime,
            services: {
                mongodb: mongoHealth,
                opa: opaHealth,
                keycloak: keycloakHealth,
                kas: kasHealth,
            },
            metrics,
            memory,
            circuitBreakers,
        };
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

        const ready = checks.mongodb && checks.opa && checks.keycloak;

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
                const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dive-v3';
                this.mongoClient = new MongoClient(uri);
                await this.mongoClient.connect();
            }

            // Ping the database
            await this.mongoClient.db().admin().ping();

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
            const response = await axios.get(`${opaUrl}/health`, {
                timeout: 5000,
            });

            const responseTime = Date.now() - startTime;

            return {
                status: responseTime < 100 ? 'up' : 'degraded',
                responseTime,
                details: response.data,
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;

            logger.error('OPA health check failed', {
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
     * Check Keycloak health
     */
    private async checkKeycloak(): Promise<IServiceHealth> {
        const startTime = Date.now();
        const keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';

        try {
            const response = await axios.get(`${keycloakUrl}/health`, {
                timeout: 5000,
            });

            const responseTime = Date.now() - startTime;

            return {
                status: responseTime < 500 ? 'up' : 'degraded',
                responseTime,
                details: response.data,
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;

            // Keycloak might not have /health endpoint, try root
            try {
                await axios.get(keycloakUrl, { timeout: 2000 });
                const totalTime = Date.now() - startTime;
                return {
                    status: totalTime < 500 ? 'up' : 'degraded',
                    responseTime: totalTime,
                };
            } catch {
                logger.error('Keycloak health check failed', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                });

                return {
                    status: 'down',
                    responseTime,
                    error: error instanceof Error ? error.message : 'Connection failed',
                };
            }
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

        try {
            const response = await axios.get(`${kasUrl}/health`, {
                timeout: 5000,
            });

            const responseTime = Date.now() - startTime;

            return {
                status: responseTime < 200 ? 'up' : 'degraded',
                responseTime,
                details: response.data,
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;

            logger.error('KAS health check failed', {
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
                    const db = this.mongoClient.db();
                    
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
}

// Export singleton instance
export const healthService = new HealthService();

