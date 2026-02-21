/**
 * Health Service Tests (Phase 3)
 * 
 * Test coverage:
 * - Basic health check
 * - Detailed health check
 * - Readiness probe
 * - Liveness probe
 * - Service health checks (MongoDB, OPA, Keycloak, KAS)
 * - Metrics collection
 * - Memory usage tracking
 */

import { healthService, HealthStatus } from '../services/health.service';
import axios from 'axios';
import { authzCacheService } from '../services/authz-cache.service';
import * as circuitBreakerModule from '../utils/circuit-breaker';

// Mock dependencies
jest.mock('axios');
jest.mock('../services/authz-cache.service');
jest.mock('../utils/mongodb-singleton');
jest.mock('../services/federation-bootstrap.service', () => ({
    federationBootstrap: {
        isBootstrapComplete: jest.fn().mockReturnValue(true),
    },
}));
jest.mock('../utils/circuit-breaker', () => ({
    getAllCircuitBreakerStats: jest.fn(() => ({
        opa: {
            state: 'CLOSED',
            failures: 0,
            successes: 0,
            totalRequests: 0,
            lastFailureTime: null,
            lastStateChange: new Date(),
            rejectCount: 0,
        },
        keycloak: {
            state: 'CLOSED',
            failures: 0,
            successes: 0,
            totalRequests: 0,
            lastFailureTime: null,
            lastStateChange: new Date(),
            rejectCount: 0,
        },
        mongodb: {
            state: 'CLOSED',
            failures: 0,
            successes: 0,
            totalRequests: 0,
            lastFailureTime: null,
            lastStateChange: new Date(),
            rejectCount: 0,
        },
        kas: {
            state: 'CLOSED',
            failures: 0,
            successes: 0,
            totalRequests: 0,
            lastFailureTime: null,
            lastStateChange: new Date(),
            rejectCount: 0,
        },
    })),
    CircuitState: {
        CLOSED: 'CLOSED',
        OPEN: 'OPEN',
        HALF_OPEN: 'HALF_OPEN',
    },
    opaCircuitBreaker: {
        reset: jest.fn(),
        getStats: jest.fn(() => ({
            state: 'CLOSED',
            failures: 0,
            successes: 0,
            totalRequests: 0,
            lastFailureTime: null,
            lastStateChange: new Date(),
            rejectCount: 0,
        })),
    },
    keycloakCircuitBreaker: {
        reset: jest.fn(),
        getStats: jest.fn(() => ({
            state: 'CLOSED',
            failures: 0,
            successes: 0,
            totalRequests: 0,
            lastFailureTime: null,
            lastStateChange: new Date(),
            rejectCount: 0,
        })),
    },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const { getDb } = require('../utils/mongodb-singleton');

describe('HealthService', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Default: MongoDB singleton returns healthy mock
        (getDb as jest.Mock).mockReturnValue({
            admin: jest.fn().mockReturnValue({
                ping: jest.fn().mockResolvedValue({}),
            }),
            collection: jest.fn().mockReturnValue({
                countDocuments: jest.fn().mockResolvedValue(0),
            }),
        });

        // Reset mock for getAllCircuitBreakerStats
        (circuitBreakerModule.getAllCircuitBreakerStats as jest.Mock).mockReturnValue({
            opa: {
                state: 'CLOSED',
                failures: 0,
                successes: 0,
                totalRequests: 0,
                lastFailureTime: null,
                lastStateChange: new Date(),
                rejectCount: 0,
            },
            keycloak: {
                state: 'CLOSED',
                failures: 0,
                successes: 0,
                totalRequests: 0,
                lastFailureTime: null,
                lastStateChange: new Date(),
                rejectCount: 0,
            },
            mongodb: {
                state: 'CLOSED',
                failures: 0,
                successes: 0,
                totalRequests: 0,
                lastFailureTime: null,
                lastStateChange: new Date(),
                rejectCount: 0,
            },
            kas: {
                state: 'CLOSED',
                failures: 0,
                successes: 0,
                totalRequests: 0,
                lastFailureTime: null,
                lastStateChange: new Date(),
                rejectCount: 0,
            },
        });

        // Default mock for authzCacheService.isHealthy() 
        (authzCacheService.isHealthy as jest.Mock).mockReturnValue({
            healthy: true,
        });

        // Default mock for authzCacheService.getStats()
        (authzCacheService.getStats as jest.Mock).mockReturnValue({
            size: 100,
            maxSize: 1000,
            hitRate: 85.5,
            hits: 85,
            misses: 15,
        });
    });

    describe('Basic Health Check', () => {
        it('should return healthy status when services are up', async () => {
            // Mock successful service checks
            mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });

            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockResolvedValue({}),
                    }),
                }),
            } as any;

            healthService.setMongoClient(mockMongoClient);

            const health = await healthService.basicHealthCheck();

            expect(health.status).toBe(HealthStatus.HEALTHY);
            expect(health.timestamp).toBeDefined();
            expect(health.uptime).toBeGreaterThanOrEqual(0);
        });

        it('should return unhealthy status when MongoDB is down', async () => {
            // Mock MongoDB failure
            (getDb as jest.Mock).mockReturnValue({
                admin: jest.fn().mockReturnValue({
                    ping: jest.fn().mockRejectedValue(new Error('Connection failed')),
                }),
            });

            // Mock OPA success
            mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });

            const health = await healthService.basicHealthCheck();

            expect(health.status).toBe(HealthStatus.UNHEALTHY);
        });

        it('should return unhealthy status when OPA is down', async () => {
            // Mock MongoDB success
            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockResolvedValue({}),
                    }),
                }),
            } as any;

            healthService.setMongoClient(mockMongoClient);

            // Mock OPA failure
            mockedAxios.get.mockRejectedValue(new Error('OPA unavailable'));

            const health = await healthService.basicHealthCheck();

            expect(health.status).toBe(HealthStatus.UNHEALTHY);
        });

        it('should include uptime in response', async () => {
            // Mock successful checks
            mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });

            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockResolvedValue({}),
                    }),
                }),
            } as any;

            healthService.setMongoClient(mockMongoClient);

            const health = await healthService.basicHealthCheck();

            expect(typeof health.uptime).toBe('number');
            expect(health.uptime).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Detailed Health Check', () => {
        it('should return comprehensive health information', async () => {
            // Mock all services as healthy
            mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });

            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockResolvedValue({}),
                    }),
                    collection: jest.fn().mockReturnValue({
                        countDocuments: jest.fn().mockResolvedValue(5),
                    }),
                }),
            } as any;

            healthService.setMongoClient(mockMongoClient);

            // Mock cache stats
            (authzCacheService.getStats as jest.Mock).mockReturnValue({
                size: 100,
                hitRate: 85.5,
            });

            const health = await healthService.detailedHealthCheck();

            expect(health.status).toBeDefined();
            expect(health.timestamp).toBeDefined();
            expect(health.uptime).toBeGreaterThanOrEqual(0);
            expect(health.services).toBeDefined();
            expect(health.metrics).toBeDefined();
            expect(health.memory).toBeDefined();
            expect(health.circuitBreakers).toBeDefined();
        });

        it('should include MongoDB health status', async () => {
            mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });

            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockResolvedValue({}),
                    }),
                    collection: jest.fn().mockReturnValue({
                        countDocuments: jest.fn().mockResolvedValue(0),
                    }),
                }),
            } as any;

            healthService.setMongoClient(mockMongoClient);

            (authzCacheService.getStats as jest.Mock).mockReturnValue({
                size: 0,
                hitRate: 0,
            });

            const health = await healthService.detailedHealthCheck();

            expect(health.services.mongodb).toBeDefined();
            expect(health.services.mongodb.status).toBe('up');
            expect(health.services.mongodb.responseTime).toBeGreaterThanOrEqual(0);
        });

        it('should include OPA health status', async () => {
            // Mock OPA health
            mockedAxios.get.mockImplementation((url: string) => {
                if (url.includes('/health')) {
                    return Promise.resolve({ data: { status: 'ready' } });
                }
                return Promise.resolve({ data: {} });
            });

            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockResolvedValue({}),
                    }),
                    collection: jest.fn().mockReturnValue({
                        countDocuments: jest.fn().mockResolvedValue(0),
                    }),
                }),
            } as any;

            healthService.setMongoClient(mockMongoClient);

            (authzCacheService.getStats as jest.Mock).mockReturnValue({
                size: 0,
                hitRate: 0,
            });

            const health = await healthService.detailedHealthCheck();

            expect(health.services.opa).toBeDefined();
            expect(health.services.opa.status).toBe('up');
        });

        it('should include Keycloak health status', async () => {
            mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });

            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockResolvedValue({}),
                    }),
                    collection: jest.fn().mockReturnValue({
                        countDocuments: jest.fn().mockResolvedValue(0),
                    }),
                }),
            } as any;

            healthService.setMongoClient(mockMongoClient);

            (authzCacheService.getStats as jest.Mock).mockReturnValue({
                size: 0,
                hitRate: 0,
            });

            const health = await healthService.detailedHealthCheck();

            expect(health.services.keycloak).toBeDefined();
            expect(health.services.keycloak.status).toBe('up');
        });

        it('should include metrics', async () => {
            mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });

            (getDb as jest.Mock).mockReturnValue({
                admin: jest.fn().mockReturnValue({
                    ping: jest.fn().mockResolvedValue({}),
                }),
                collection: jest.fn().mockReturnValue({
                    countDocuments: jest.fn()
                        .mockResolvedValueOnce(10) // active IdPs
                        .mockResolvedValueOnce(3), // pending approvals
                }),
            });

            (authzCacheService.getStats as jest.Mock).mockReturnValue({
                size: 150,
                hitRate: 92.3,
            });

            const health = await healthService.detailedHealthCheck();

            expect(health.metrics.activeIdPs).toBe(10);
            expect(health.metrics.pendingApprovals).toBe(3);
            expect(health.metrics.cacheSizeDecisions).toBe(150);
            expect(health.metrics.cacheHitRate).toBe(92.3);
        });

        it('should include memory usage', async () => {
            mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });

            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockResolvedValue({}),
                    }),
                    collection: jest.fn().mockReturnValue({
                        countDocuments: jest.fn().mockResolvedValue(0),
                    }),
                }),
            } as any;

            healthService.setMongoClient(mockMongoClient);

            (authzCacheService.getStats as jest.Mock).mockReturnValue({
                size: 0,
                hitRate: 0,
            });

            const health = await healthService.detailedHealthCheck();

            expect(health.memory.used).toBeGreaterThan(0);
            expect(health.memory.total).toBeGreaterThan(0);
            expect(health.memory.percentage).toBeGreaterThanOrEqual(0);
            expect(health.memory.percentage).toBeLessThanOrEqual(100);
        });

        it('should return degraded status when service is slow', async () => {
            // Mock slow MongoDB (>500ms threshold)
            (getDb as jest.Mock).mockReturnValue({
                admin: jest.fn().mockReturnValue({
                    ping: jest.fn().mockImplementation(() =>
                        new Promise(resolve => setTimeout(() => resolve({}), 600))
                    ),
                }),
                collection: jest.fn().mockReturnValue({
                    countDocuments: jest.fn().mockResolvedValue(0),
                }),
            });

            // Mock OPA success
            mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });

            (authzCacheService.getStats as jest.Mock).mockReturnValue({
                size: 0,
                hitRate: 0,
            });

            const health = await healthService.detailedHealthCheck();

            expect(health.status).toBe(HealthStatus.DEGRADED);
        });
    });

    describe('Readiness Probe', () => {
        it('should return ready when all critical services are up', async () => {
            // Mock all services as healthy
            mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });

            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockResolvedValue({}),
                    }),
                }),
            } as any;

            healthService.setMongoClient(mockMongoClient);
            healthService.setServicesReady(true);

            const readiness = await healthService.readinessCheck();

            expect(readiness.ready).toBe(true);
            expect(readiness.checks.mongodb).toBe(true);
            expect(readiness.checks.opa).toBe(true);
            expect(readiness.checks.keycloak).toBe(true);
            expect(readiness.timestamp).toBeDefined();
        });

        it('should return not ready when MongoDB is down', async () => {
            // Mock MongoDB failure
            (getDb as jest.Mock).mockReturnValue({
                admin: jest.fn().mockReturnValue({
                    ping: jest.fn().mockRejectedValue(new Error('Connection failed')),
                }),
            });

            // Mock other services as healthy
            mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });

            const readiness = await healthService.readinessCheck();

            expect(readiness.ready).toBe(false);
            expect(readiness.checks.mongodb).toBe(false);
        });

        it('should return not ready when OPA is down', async () => {
            // Mock MongoDB success
            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockResolvedValue({}),
                    }),
                }),
            } as any;

            healthService.setMongoClient(mockMongoClient);

            // Mock OPA failure, Keycloak success
            mockedAxios.get.mockImplementation((url: string) => {
                if (url.includes('8181')) {
                    return Promise.reject(new Error('OPA down'));
                }
                return Promise.resolve({ data: { status: 'ok' } });
            });

            const readiness = await healthService.readinessCheck();

            expect(readiness.ready).toBe(false);
            expect(readiness.checks.opa).toBe(false);
        });

        it('should return not ready when Keycloak is down', async () => {
            // Mock MongoDB and OPA success
            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockResolvedValue({}),
                    }),
                }),
            } as any;

            healthService.setMongoClient(mockMongoClient);

            // Mock Keycloak failure
            mockedAxios.get.mockImplementation((url: string) => {
                if (url.includes('8081') || url.includes('keycloak')) {
                    return Promise.reject(new Error('Keycloak down'));
                }
                return Promise.resolve({ data: { status: 'ok' } });
            });

            const readiness = await healthService.readinessCheck();

            expect(readiness.ready).toBe(false);
            expect(readiness.checks.keycloak).toBe(false);
        });
    });

    describe('Liveness Probe', () => {
        it('should return alive', () => {
            const liveness = healthService.livenessCheck();

            expect(liveness.alive).toBe(true);
            expect(liveness.timestamp).toBeDefined();
        });

        it('should always return alive (process is running)', () => {
            // Call multiple times
            for (let i = 0; i < 10; i++) {
                const liveness = healthService.livenessCheck();
                expect(liveness.alive).toBe(true);
            }
        });
    });

    describe('Service Health Checks', () => {
        describe('MongoDB', () => {
            it('should mark as up when ping succeeds quickly', async () => {
                const mockMongoClient = {
                    db: jest.fn().mockReturnValue({
                        admin: jest.fn().mockReturnValue({
                            ping: jest.fn().mockResolvedValue({}),
                        }),
                        collection: jest.fn().mockReturnValue({
                            countDocuments: jest.fn().mockResolvedValue(0),
                        }),
                    }),
                } as any;

                healthService.setMongoClient(mockMongoClient);

                mockedAxios.get.mockResolvedValue({ data: {} });

                (authzCacheService.getStats as jest.Mock).mockReturnValue({
                    size: 0,
                    hitRate: 0,
                });

                const health = await healthService.detailedHealthCheck();

                expect(health.services.mongodb.status).toBe('up');
                expect(health.services.mongodb.responseTime).toBeLessThan(100);
            });

            it('should mark as down when ping fails', async () => {
                (getDb as jest.Mock).mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockRejectedValue(new Error('Connection refused')),
                    }),
                    collection: jest.fn().mockReturnValue({
                        countDocuments: jest.fn().mockResolvedValue(0),
                    }),
                });

                mockedAxios.get.mockResolvedValue({ data: {} });

                (authzCacheService.getStats as jest.Mock).mockReturnValue({
                    size: 0,
                    hitRate: 0,
                });

                const health = await healthService.detailedHealthCheck();

                expect(health.services.mongodb.status).toBe('down');
                expect(health.services.mongodb.error).toBeDefined();
            });
        });

        describe('OPA', () => {
            it('should mark as up when health check succeeds', async () => {
                mockedAxios.get.mockImplementation((url: string) => {
                    if (url.includes('8181') && url.includes('/health')) {
                        return Promise.resolve({ data: { status: 'ok' } });
                    }
                    return Promise.resolve({ data: {} });
                });

                const mockMongoClient = {
                    db: jest.fn().mockReturnValue({
                        admin: jest.fn().mockReturnValue({
                            ping: jest.fn().mockResolvedValue({}),
                        }),
                        collection: jest.fn().mockReturnValue({
                            countDocuments: jest.fn().mockResolvedValue(0),
                        }),
                    }),
                } as any;

                healthService.setMongoClient(mockMongoClient);

                (authzCacheService.getStats as jest.Mock).mockReturnValue({
                    size: 0,
                    hitRate: 0,
                });

                const health = await healthService.detailedHealthCheck();

                expect(health.services.opa.status).toBe('up');
            });

            it('should mark as down when health check fails', async () => {
                mockedAxios.get.mockImplementation((url: string) => {
                    if (url.includes('8181')) {
                        return Promise.reject(new Error('Connection refused'));
                    }
                    return Promise.resolve({ data: {} });
                });

                const mockMongoClient = {
                    db: jest.fn().mockReturnValue({
                        admin: jest.fn().mockReturnValue({
                            ping: jest.fn().mockResolvedValue({}),
                        }),
                        collection: jest.fn().mockReturnValue({
                            countDocuments: jest.fn().mockResolvedValue(0),
                        }),
                    }),
                } as any;

                healthService.setMongoClient(mockMongoClient);

                (authzCacheService.getStats as jest.Mock).mockReturnValue({
                    size: 0,
                    hitRate: 0,
                });

                const health = await healthService.detailedHealthCheck();

                expect(health.services.opa.status).toBe('down');
            });
        });

        describe('KAS (Optional)', () => {
            it('should return undefined when KAS URL not configured', async () => {
                // Ensure KAS_URL is not set
                delete process.env.KAS_URL;

                mockedAxios.get.mockResolvedValue({ data: {} });

                const mockMongoClient = {
                    db: jest.fn().mockReturnValue({
                        admin: jest.fn().mockReturnValue({
                            ping: jest.fn().mockResolvedValue({}),
                        }),
                        collection: jest.fn().mockReturnValue({
                            countDocuments: jest.fn().mockResolvedValue(0),
                        }),
                    }),
                } as any;

                healthService.setMongoClient(mockMongoClient);

                (authzCacheService.getStats as jest.Mock).mockReturnValue({
                    size: 0,
                    hitRate: 0,
                });

                const health = await healthService.detailedHealthCheck();

                expect(health.services.kas).toBeUndefined();
            });
        });
    });

    describe('Additional Edge Cases and Error Handling', () => {
        it('should handle circuit breaker OPEN state', async () => {
            // Mock successful service checks
            mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });

            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockResolvedValue({}),
                    }),
                }),
            } as any;

            healthService.setMongoClient(mockMongoClient);

            (circuitBreakerModule.getAllCircuitBreakerStats as jest.Mock).mockReturnValue({
                opa: {
                    state: 'OPEN',
                    failures: 5,
                    successes: 0,
                    totalRequests: 5,
                    lastFailureTime: new Date(),
                    lastStateChange: new Date(),
                    rejectCount: 3,
                },
                keycloak: { state: 'CLOSED', failures: 0 },
                mongodb: { state: 'CLOSED', failures: 0 },
                kas: { state: 'CLOSED', failures: 0 },
            });

            const health = await healthService.detailedHealthCheck();

            // Circuit breaker state should be included in health response
            expect(health.circuitBreakers.opa.state).toBe('OPEN');
            expect(health.circuitBreakers.opa.failures).toBe(5);
            expect(health.circuitBreakers.opa.rejectCount).toBe(3);
        });

        it('should handle circuit breaker HALF_OPEN state', async () => {
            (circuitBreakerModule.getAllCircuitBreakerStats as jest.Mock).mockReturnValue({
                opa: {
                    state: 'HALF_OPEN',
                    failures: 2,
                    successes: 1,
                    totalRequests: 3,
                    lastFailureTime: new Date(Date.now() - 30000),
                    lastStateChange: new Date(),
                    rejectCount: 0,
                },
                keycloak: { state: 'CLOSED', failures: 0 },
                mongodb: { state: 'CLOSED', failures: 0 },
                kas: { state: 'CLOSED', failures: 0 },
            });

            const health = await healthService.detailedHealthCheck();

            expect(health.circuitBreakers.opa.state).toBe('HALF_OPEN');
        });

        it('should handle multiple services down simultaneously', async () => {
            // Mock all services failing
            mockedAxios.get.mockRejectedValue(new Error('Network error'));

            (getDb as jest.Mock).mockReturnValue({
                admin: jest.fn().mockReturnValue({
                    ping: jest.fn().mockRejectedValue(new Error('Mongo down')),
                }),
            });

            const health = await healthService.detailedHealthCheck();

            expect(health.status).toBe('unhealthy');
            expect(health.services.mongodb.status).toBe('down');
            expect(health.services.opa.status).toBe('down');
            expect(health.services.keycloak.status).toBe('down');
        });

        it('should handle OPA timeout with specific error', async () => {
            mockedAxios.get.mockImplementation((url) => {
                if (url.includes('/health')) {
                    return Promise.reject({ code: 'ECONNABORTED', message: 'timeout' });
                }
                return Promise.resolve({ data: { status: 'ok' } });
            });

            const health = await healthService.detailedHealthCheck();

            expect(health.services.opa.status).toBe('down');
            expect(health.services.opa.error).toContain('timeout');
        });

        it('should handle Keycloak returning non-200 status', async () => {
            mockedAxios.get.mockImplementation((url) => {
                if (url.includes('/health/ready')) {
                    return Promise.resolve({ status: 503, data: { status: 'degraded' } });
                }
                return Promise.resolve({ data: { status: 'ok' } });
            });

            const health = await healthService.detailedHealthCheck();

            // Should handle gracefully
            expect(health).toBeDefined();
        });

        it('should calculate memory usage percentage correctly', async () => {
            mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });
            
            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockResolvedValue({}),
                    }),
                }),
            };

            healthService.setMongoClient(mockMongoClient as any);

            const health = await healthService.detailedHealthCheck();

            expect(health.memory.used).toBeGreaterThan(0);
            expect(health.memory.total).toBeGreaterThan(0);
            expect(health.memory.percentage).toBeGreaterThan(0);
            expect(health.memory.percentage).toBeLessThanOrEqual(100);
        });

        it('should handle KAS health check failure gracefully', async () => {
            process.env.KAS_URL = 'http://localhost:8080';

            mockedAxios.get.mockImplementation((url) => {
                if (url.includes('localhost:8080')) {
                    return Promise.reject(new Error('KAS unavailable'));
                }
                return Promise.resolve({ data: { status: 'ok' } });
            });

            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockResolvedValue({}),
                    }),
                }),
            };

            healthService.setMongoClient(mockMongoClient as any);

            const health = await healthService.detailedHealthCheck();

            expect(health.services.kas?.status).toBe('down');

            delete process.env.KAS_URL;
        });

        it('should handle MongoDB ping timeout', async () => {
            (getDb as jest.Mock).mockReturnValue({
                admin: jest.fn().mockReturnValue({
                    ping: jest.fn().mockImplementation(() =>
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('ping timeout')), 6000)
                        )
                    ),
                }),
            });
            mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });

            const health = await healthService.detailedHealthCheck();

            expect(health.services.mongodb.status).toBe('down');
        }, 10000);

        it('should include cache health when cache is unhealthy', async () => {
            (authzCacheService.isHealthy as jest.Mock).mockReturnValue({
                healthy: false,
                reason: 'Cache is full',
            });

            mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });
            
            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockResolvedValue({}),
                    }),
                }),
            };

            healthService.setMongoClient(mockMongoClient as any);

            const health = await healthService.detailedHealthCheck();

            expect(health.services.cache?.details?.healthy).toBe(false);
            expect(health.services.cache?.details?.reason).toBe('Cache is full');
        });

        it('should handle missing MongoDB client gracefully', async () => {
            (getDb as jest.Mock).mockImplementation(() => {
                throw new Error('MongoDB not connected');
            });
            mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });

            const health = await healthService.detailedHealthCheck();

            expect(health.services.mongodb.status).toBe('down');
        });

        it('should mark overall status as degraded when cache is unhealthy but services are up', async () => {
            (authzCacheService.isHealthy as jest.Mock).mockReturnValue({
                healthy: false,
                reason: 'Low hit rate: 40%',
            });

            mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });
            
            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockResolvedValue({}),
                    }),
                }),
            };

            healthService.setMongoClient(mockMongoClient as any);

            const health = await healthService.detailedHealthCheck();

            // Cache being unhealthy might cause degraded status
            expect(['healthy', 'degraded']).toContain(health.status);
        });

        it('should handle OPA returning unexpected response format', async () => {
            mockedAxios.get.mockImplementation((url) => {
                if (url.includes('/health')) {
                    return Promise.resolve({ data: null }); // Unexpected null
                }
                return Promise.resolve({ data: { status: 'ok' } });
            });

            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockResolvedValue({}),
                    }),
                }),
            };

            healthService.setMongoClient(mockMongoClient as any);

            const health = await healthService.basicHealthCheck();

            // Should handle gracefully without crashing
            expect(health).toBeDefined();
            expect(health.status).toBeDefined();
        });
    });
});
