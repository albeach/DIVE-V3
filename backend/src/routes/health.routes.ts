import { Router, Request, Response } from 'express';
import { healthService } from '../services/health.service';
import { KeycloakConfigSyncService } from '../services/keycloak-config-sync.service';

const router = Router();

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

