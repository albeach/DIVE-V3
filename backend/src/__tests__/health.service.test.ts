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
import { opaCircuitBreaker, keycloakCircuitBreaker } from '../utils/circuit-breaker';

// Mock dependencies
jest.mock('axios');
jest.mock('mongodb');
jest.mock('../services/authz-cache.service');
jest.mock('../utils/circuit-breaker');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HealthService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Reset circuit breakers
        if (opaCircuitBreaker.reset) {
            opaCircuitBreaker.reset();
        }
        if (keycloakCircuitBreaker.reset) {
            keycloakCircuitBreaker.reset();
        }
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
            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockRejectedValue(new Error('Connection failed')),
                    }),
                }),
            } as any;

            healthService.setMongoClient(mockMongoClient);

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

            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockResolvedValue({}),
                    }),
                    collection: jest.fn().mockReturnValue({
                        countDocuments: jest.fn()
                            .mockResolvedValueOnce(10) // active IdPs
                            .mockResolvedValueOnce(3), // pending approvals
                    }),
                }),
            } as any;

            healthService.setMongoClient(mockMongoClient);

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
            // Mock slow MongoDB (>100ms)
            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockImplementation(() => 
                            new Promise(resolve => setTimeout(() => resolve({}), 150))
                        ),
                    }),
                    collection: jest.fn().mockReturnValue({
                        countDocuments: jest.fn().mockResolvedValue(0),
                    }),
                }),
            } as any;

            healthService.setMongoClient(mockMongoClient);

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

            const readiness = await healthService.readinessCheck();

            expect(readiness.ready).toBe(true);
            expect(readiness.checks.mongodb).toBe(true);
            expect(readiness.checks.opa).toBe(true);
            expect(readiness.checks.keycloak).toBe(true);
            expect(readiness.timestamp).toBeDefined();
        });

        it('should return not ready when MongoDB is down', async () => {
            // Mock MongoDB failure
            const mockMongoClient = {
                db: jest.fn().mockReturnValue({
                    admin: jest.fn().mockReturnValue({
                        ping: jest.fn().mockRejectedValue(new Error('Connection failed')),
                    }),
                }),
            } as any;

            healthService.setMongoClient(mockMongoClient);

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
                const mockMongoClient = {
                    db: jest.fn().mockReturnValue({
                        admin: jest.fn().mockReturnValue({
                            ping: jest.fn().mockRejectedValue(new Error('Connection refused')),
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
});

