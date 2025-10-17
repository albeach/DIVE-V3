import { Router, Request, Response } from 'express';
import { healthService } from '../services/health.service';

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

export default router;

