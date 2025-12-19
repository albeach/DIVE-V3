import { Router, Request, Response } from 'express';
import axios from 'axios';
import { healthService } from '../services/health.service';
import { KeycloakConfigSyncService } from '../services/keycloak-config-sync.service';
import { policyVersionMonitor } from '../services/policy-version-monitor.service';
import { kasRegistryService } from '../services/kas-registry.service';
import { authenticateJWT } from '../middleware/authz.middleware';

const router = Router();

const OPA_URL = process.env.OPA_URL || 'http://opa:8181';
const INSTANCE_REALM = process.env.INSTANCE_REALM || 'USA';

/**
 * GET /health
 * Basic health check for load balancers
 */
router.get('/', async (_req: Request, res: Response) => {
    try {
        const health = await healthService.basicHealthCheck();
        const statusCode = health.status === 'unhealthy' ? 503 : 200;
        res.status(statusCode).json(health);
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            uptime: 0,
            error: 'Health check failed',
        });
    }
});

/**
 * GET /health/detailed
 * Comprehensive health status (admin only in production)
 */
router.get('/detailed', async (_req: Request, res: Response) => {
    try {
        const health = await healthService.detailedHealthCheck();
        const statusCode = health.status === 'unhealthy' ? 503 : 200;
        res.status(statusCode).json(health);
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Detailed health check failed',
        });
    }
});

/**
 * GET /health/ready
 * Kubernetes readiness probe
 */
router.get('/ready', async (_req: Request, res: Response) => {
    try {
        const readiness = await healthService.readinessCheck();
        const statusCode = readiness.ready ? 200 : 503;
        res.status(statusCode).json(readiness);
    } catch (error) {
        res.status(503).json({
            ready: false,
            checks: {
                mongodb: false,
                opa: false,
                keycloak: false,
            },
            timestamp: new Date().toISOString(),
            error: 'Readiness check failed',
        });
    }
});

/**
 * GET /health/live
 * Kubernetes liveness probe
 */
router.get('/live', (_req: Request, res: Response) => {
    const liveness = healthService.livenessCheck();
    res.status(200).json(liveness);
});

/**
 * GET /health/redis
 * Redis-specific health check
 */
router.get('/redis', async (_req: Request, res: Response) => {
    try {
        const detailedHealth = await healthService.detailedHealthCheck();
        const redisHealth = detailedHealth.services.redis;

        if (!redisHealth) {
            res.status(503).json({
                status: 'unhealthy',
                message: 'Redis service not configured',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        const statusCode = redisHealth.status === 'up' ? 200 : 503;
        res.status(statusCode).json({
            status: redisHealth.status,
            responseTime: redisHealth.responseTime,
            timestamp: new Date().toISOString(),
            details: redisHealth.details,
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            message: 'Redis health check failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
        });
    }
});

/**
 * GET /health/policy-version
 * Phase 4, Task 3.1: Returns OPA policy version for drift detection
 * Used by policy drift monitor to verify consistency across instances
 */
router.get('/policy-version', async (_req: Request, res: Response) => {
    try {
        const opaResponse = await axios.get(
            `${OPA_URL}/v1/data/dive/policy_version`,
            { timeout: 5000 }
        );

        res.json({
            instance: INSTANCE_REALM,
            policyVersion: opaResponse.data.result,
            opaUrl: OPA_URL,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            error: 'Service Unavailable',
            message: 'OPA policy version unavailable',
            instance: INSTANCE_REALM,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /health/policy-consistency
 * Phase 4, Task 3.1: Check policy consistency across federation
 * Requires authentication (admin access)
 */
router.get('/policy-consistency', authenticateJWT, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user?.roles?.includes('admin') && !user?.roles?.includes('super-admin')) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'Admin privileges required'
            });
            return;
        }

        const report = await policyVersionMonitor.checkPolicyConsistency();

        res.json({
            consistent: report.consistent,
            expectedVersion: report.expectedVersion,
            checkTimestamp: report.checkTimestamp,
            instances: report.instances.map(i => ({
                code: i.instanceCode,
                version: i.policyVersion?.version || 'unavailable',
                healthy: i.healthy,
                latencyMs: i.latencyMs,
                error: i.error
            })),
            driftDetails: report.driftDetails
        });
    } catch (error) {
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Policy consistency check failed',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /health/kas-federation
 * Phase 4, Task 1.4: Returns KAS federation status
 */
router.get('/kas-federation', async (_req: Request, res: Response) => {
    try {
        const kasServers = kasRegistryService.getAllKAS();
        const kasHealth = kasRegistryService.getKASHealth();
        const crossKASEnabled = kasRegistryService.isCrossKASEnabled();

        res.json({
            instance: INSTANCE_REALM,
            crossKASEnabled,
            kasServers: kasServers.map(kas => ({
                kasId: kas.kasId,
                organization: kas.organization,
                countryCode: kas.countryCode,
                trustLevel: kas.trustLevel,
                health: kasHealth[kas.kasId] || { healthy: false, lastCheck: null }
            })),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get KAS federation status',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /health/brute-force-config
 * Task 4.4: Dynamic brute force configuration health check
 * Query params:
 *   - realm: Keycloak realm ID (defaults to 'dive-v3-broker')
 */
router.get('/brute-force-config', async (req: Request, res: Response) => {
    try {
        const realm = (req.query.realm as string) || 'dive-v3-broker';

        // Get current configuration for the realm
        const config = await KeycloakConfigSyncService.getConfig(realm);
        const maxAttempts = await KeycloakConfigSyncService.getMaxAttempts(realm);
        const windowMs = await KeycloakConfigSyncService.getWindowMs(realm);

        // Get cache statistics
        const cacheStats = KeycloakConfigSyncService.getCacheStats();

        if (!config) {
            res.status(404).json({
                success: false,
                error: `No configuration found for realm: ${realm}`,
                availableRealms: cacheStats.realms,
                timestamp: new Date().toISOString()
            });
            return;
        }

        res.status(200).json({
            success: true,
            realm,
            rateLimitConfig: {
                maxAttempts,
                windowMs,
                windowMinutes: Math.floor(windowMs / 60000),
                windowSeconds: Math.floor(windowMs / 1000)
            },
            keycloakConfig: {
                maxLoginFailures: config.maxLoginFailures,
                failureResetTimeSeconds: config.failureResetTimeSeconds,
                waitIncrementSeconds: config.waitIncrementSeconds,
                maxFailureWaitSeconds: config.maxFailureWaitSeconds,
                lastSynced: new Date(config.lastSynced).toISOString(),
                cacheAgeSeconds: Math.floor((Date.now() - config.lastSynced) / 1000)
            },
            cacheStats: {
                cachedRealms: cacheStats.realms,
                adminTokenExpiry: cacheStats.adminTokenExpiry
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve brute force configuration',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

export default router;
