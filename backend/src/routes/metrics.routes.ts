/**
 * DIVE V3 - Metrics Routes
 * 
 * Phase 8: Observability & Alerting
 * 
 * Exposes Prometheus metrics endpoint for scraping.
 * Provides additional metrics endpoints for debugging and dashboards.
 * 
 * Endpoints:
 * - GET /metrics - Prometheus exposition format
 * - GET /metrics/json - JSON format for debugging
 * - GET /metrics/health - Aggregated health status
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prometheusMetrics } from '../services/prometheus-metrics.service';
import { metricsService } from '../services/metrics.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /metrics
 * Prometheus metrics endpoint
 * 
 * Returns metrics in Prometheus exposition format for scraping
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const metrics = await prometheusMetrics.getMetrics();
    
    res.set('Content-Type', prometheusMetrics.getContentType());
    res.end(metrics);
  } catch (error) {
    logger.error('Failed to export Prometheus metrics', { error });
    next(error);
  }
});

/**
 * GET /metrics/prometheus
 * Alias for /metrics - explicit Prometheus endpoint
 */
router.get('/prometheus', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const metrics = await prometheusMetrics.getMetrics();
    
    res.set('Content-Type', prometheusMetrics.getContentType());
    res.end(metrics);
  } catch (error) {
    logger.error('Failed to export Prometheus metrics', { error });
    next(error);
  }
});

/**
 * GET /metrics/json
 * Metrics in JSON format for debugging and dashboards
 */
router.get('/json', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const prometheusJson = await prometheusMetrics.getMetricsJSON();
    const legacyMetrics = metricsService.getSummary();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      instance: process.env.INSTANCE_NAME || 'usa',
      prometheus: prometheusJson,
      legacy: legacyMetrics
    });
  } catch (error) {
    logger.error('Failed to export JSON metrics', { error });
    next(error);
  }
});

/**
 * GET /metrics/health
 * Aggregated health status for all services
 */
router.get('/health', async (_req: Request, res: Response, _next: NextFunction) => {
  try {
    // Import health service dynamically to avoid circular dependencies
    const { healthService } = await import('../services/health.service');
    const healthStatus = await healthService.detailedHealthCheck();
    
    // Update Prometheus health metrics
    prometheusMetrics.setServiceHealth('backend', healthStatus.services.mongodb?.status === 'up');
    prometheusMetrics.setOPAHealth(
      process.env.INSTANCE_NAME || 'usa',
      healthStatus.services.opa?.status === 'up'
    );
    prometheusMetrics.setRedisHealth(
      'primary',
      healthStatus.services.cache?.status === 'up'
    );
    prometheusMetrics.setMongoHealth(
      process.env.INSTANCE_NAME || 'usa',
      healthStatus.services.mongodb?.status === 'up'
    );
    
    const overallHealthy = Object.values(healthStatus).every(
      (s: any) => s?.healthy !== false
    );
    
    res.status(overallHealthy ? 200 : 503).json({
      success: true,
      timestamp: new Date().toISOString(),
      instance: process.env.INSTANCE_NAME || 'usa',
      healthy: overallHealthy,
      services: healthStatus
    });
  } catch (error) {
    logger.error('Failed to get health metrics', { error });
    
    res.status(503).json({
      success: false,
      timestamp: new Date().toISOString(),
      healthy: false,
      error: 'Health check failed'
    });
  }
});

/**
 * GET /metrics/authorization
 * Authorization-specific metrics for dashboards
 */
router.get('/authorization', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const metricsJson = await prometheusMetrics.getMetricsJSON();
    
    // Filter to authorization-related metrics
    const authzMetrics = (metricsJson as any[]).filter((m: any) =>
      m.name.includes('authorization') || 
      m.name.includes('decision') ||
      m.name.includes('policy')
    );
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      instance: process.env.INSTANCE_NAME || 'usa',
      metrics: authzMetrics
    });
  } catch (error) {
    logger.error('Failed to get authorization metrics', { error });
    next(error);
  }
});

/**
 * GET /metrics/cache
 * Cache-specific metrics for dashboards
 */
router.get('/cache', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const metricsJson = await prometheusMetrics.getMetricsJSON();
    
    // Filter to cache-related metrics
    const cacheMetrics = (metricsJson as any[]).filter((m: any) =>
      m.name.includes('cache')
    );
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      instance: process.env.INSTANCE_NAME || 'usa',
      metrics: cacheMetrics
    });
  } catch (error) {
    logger.error('Failed to get cache metrics', { error });
    next(error);
  }
});

/**
 * GET /metrics/federation
 * Federation-specific metrics for dashboards
 */
router.get('/federation', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const metricsJson = await prometheusMetrics.getMetricsJSON();
    
    // Filter to federation-related metrics
    const fedMetrics = (metricsJson as any[]).filter((m: any) =>
      m.name.includes('federation') || m.name.includes('federated')
    );
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      instance: process.env.INSTANCE_NAME || 'usa',
      metrics: fedMetrics
    });
  } catch (error) {
    logger.error('Failed to get federation metrics', { error });
    next(error);
  }
});

/**
 * GET /metrics/opal
 * OPAL policy distribution metrics for dashboards
 */
router.get('/opal', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const metricsJson = await prometheusMetrics.getMetricsJSON();
    
    // Filter to OPAL and policy-related metrics
    const opalMetrics = (metricsJson as any[]).filter((m: any) =>
      m.name.includes('opal') ||
      m.name.includes('bundle') ||
      m.name.includes('spoke') ||
      m.name.includes('sp_clients') ||
      m.name.includes('opa_test')
    );
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      instance: process.env.INSTANCE_NAME || 'usa',
      metrics: opalMetrics
    });
  } catch (error) {
    logger.error('Failed to get OPAL metrics', { error });
    next(error);
  }
});

/**
 * POST /metrics/reset
 * Reset all metrics (admin only, for testing)
 */
router.post('/reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only allow reset in non-production environments
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({
        success: false,
        error: 'Metrics reset not allowed in production'
      });
      return;
    }
    
    prometheusMetrics.resetMetrics();
    metricsService.reset();
    
    logger.warn('Metrics reset by admin request', {
      ip: req.ip,
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      message: 'All metrics reset',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to reset metrics', { error });
    next(error);
  }
});

export default router;


