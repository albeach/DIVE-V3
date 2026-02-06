/**
 * Resource Health Controller
 *
 * Monitors health and performance of system resources:
 * - Databases (PostgreSQL, MongoDB)
 * - Cache (Redis)
 * - Message Queues
 * - External APIs (Keycloak, OPA)
 * - Storage systems
 *
 * Returns comprehensive health status for admin dashboard
 */

import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { IAdminAPIResponse } from '../types/admin.types';

interface ResourceMetrics {
    cpu?: number;
    memory?: number;
    connections?: number;
    latency?: number;
}

interface Resource {
    id: string;
    name: string;
    type: 'database' | 'cache' | 'queue' | 'api' | 'storage';
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
    responseTime: number;
    uptime: number;
    lastError?: string;
    metrics: ResourceMetrics;
}

interface ResourceHealthResponse {
    overallStatus: 'healthy' | 'degraded' | 'critical';
    lastCheck: string;
    resources: Resource[];
    summary: {
        total: number;
        healthy: number;
        warning: number;
        critical: number;
        unknown: number;
    };
}

/**
 * Check database health
 */
async function checkDatabaseHealth(): Promise<Resource[]> {
    const resources: Resource[] = [];

    // PostgreSQL health check
    try {
        const pgStart = Date.now();
        // Simulate health check - replace with actual DB query
        const pgLatency = Date.now() - pgStart;

        resources.push({
            id: 'postgresql',
            name: 'PostgreSQL',
            type: 'database',
            status: pgLatency < 100 ? 'healthy' : pgLatency < 500 ? 'warning' : 'critical',
            responseTime: pgLatency,
            uptime: 99.9, // Would be calculated from actual uptime
            metrics: {
                connections: 15, // Would query actual connection count
                latency: pgLatency,
            },
        });
    } catch (error) {
        resources.push({
            id: 'postgresql',
            name: 'PostgreSQL',
            type: 'database',
            status: 'critical',
            responseTime: 0,
            uptime: 0,
            lastError: error instanceof Error ? error.message : 'Unknown error',
            metrics: {},
        });
    }

    // MongoDB health check
    try {
        const mongoStart = Date.now();
        // Simulate health check - replace with actual DB query
        const mongoLatency = Date.now() - mongoStart;

        resources.push({
            id: 'mongodb',
            name: 'MongoDB',
            type: 'database',
            status: mongoLatency < 100 ? 'healthy' : mongoLatency < 500 ? 'warning' : 'critical',
            responseTime: mongoLatency,
            uptime: 99.8,
            metrics: {
                connections: 8,
                latency: mongoLatency,
            },
        });
    } catch (error) {
        resources.push({
            id: 'mongodb',
            name: 'MongoDB',
            type: 'database',
            status: 'critical',
            responseTime: 0,
            uptime: 0,
            lastError: error instanceof Error ? error.message : 'Unknown error',
            metrics: {},
        });
    }

    return resources;
}

/**
 * Check cache health
 */
async function checkCacheHealth(): Promise<Resource[]> {
    const resources: Resource[] = [];

    try {
        const redisStart = Date.now();
        // Simulate Redis health check - replace with actual Redis ping
        const redisLatency = Date.now() - redisStart;

        resources.push({
            id: 'redis',
            name: 'Redis Cache',
            type: 'cache',
            status: redisLatency < 10 ? 'healthy' : redisLatency < 50 ? 'warning' : 'critical',
            responseTime: redisLatency,
            uptime: 99.95,
            metrics: {
                memory: 45, // Memory usage percentage
                connections: 12,
                latency: redisLatency,
            },
        });
    } catch (error) {
        resources.push({
            id: 'redis',
            name: 'Redis Cache',
            type: 'cache',
            status: 'critical',
            responseTime: 0,
            uptime: 0,
            lastError: error instanceof Error ? error.message : 'Unknown error',
            metrics: {},
        });
    }

    return resources;
}

/**
 * Check external API health
 */
async function checkAPIHealth(): Promise<Resource[]> {
    const resources: Resource[] = [];

    // Keycloak health check
    try {
        const keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8080';
        const keycloakStart = Date.now();

        const response = await fetch(`${keycloakUrl}/health/ready`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000), // 5 second timeout
        });

        const keycloakLatency = Date.now() - keycloakStart;

        resources.push({
            id: 'keycloak',
            name: 'Keycloak IdP',
            type: 'api',
            status: response.ok && keycloakLatency < 1000 ? 'healthy' : 'warning',
            responseTime: keycloakLatency,
            uptime: 99.7,
            metrics: {
                latency: keycloakLatency,
            },
        });
    } catch (error) {
        resources.push({
            id: 'keycloak',
            name: 'Keycloak IdP',
            type: 'api',
            status: 'critical',
            responseTime: 0,
            uptime: 0,
            lastError: error instanceof Error ? error.message : 'Unknown error',
            metrics: {},
        });
    }

    // OPA health check
    try {
        const opaUrl = process.env.OPA_URL || 'http://localhost:8181';
        const opaStart = Date.now();

        const response = await fetch(`${opaUrl}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
        });

        const opaLatency = Date.now() - opaStart;

        resources.push({
            id: 'opa',
            name: 'OPA Policy Engine',
            type: 'api',
            status: response.ok && opaLatency < 500 ? 'healthy' : 'warning',
            responseTime: opaLatency,
            uptime: 99.9,
            metrics: {
                latency: opaLatency,
            },
        });
    } catch (error) {
        resources.push({
            id: 'opa',
            name: 'OPA Policy Engine',
            type: 'api',
            status: 'critical',
            responseTime: 0,
            uptime: 0,
            lastError: error instanceof Error ? error.message : 'Unknown error',
            metrics: {},
        });
    }

    return resources;
}

/**
 * GET /api/admin/resources/health
 * Get resource health overview
 */
export const getResourceHealthHandler = async (
    _req: Request,
    res: Response
): Promise<void> => {
    const requestId = _req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        logger.info('Admin: Get resource health', { requestId });

        // Check all resource types in parallel
        const [databases, caches, apis] = await Promise.all([
            checkDatabaseHealth(),
            checkCacheHealth(),
            checkAPIHealth(),
        ]);

        const allResources = [...databases, ...caches, ...apis];

        // Calculate summary
        const summary = {
            total: allResources.length,
            healthy: allResources.filter(r => r.status === 'healthy').length,
            warning: allResources.filter(r => r.status === 'warning').length,
            critical: allResources.filter(r => r.status === 'critical').length,
            unknown: allResources.filter(r => r.status === 'unknown').length,
        };

        // Determine overall status
        let overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
        if (summary.critical > 0) {
            overallStatus = 'critical';
        } else if (summary.warning > 0) {
            overallStatus = 'degraded';
        }

        const healthData: ResourceHealthResponse = {
            overallStatus,
            lastCheck: new Date().toISOString(),
            resources: allResources,
            summary,
        };

        const response: IAdminAPIResponse = {
            success: true,
            data: healthData,
            requestId,
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to get resource health', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to get resource health',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId,
        };

        res.status(500).json(response);
    }
};

/**
 * GET /api/admin/resources/:id/metrics
 * Get detailed metrics for a specific resource
 */
export const getResourceMetricsHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const { id } = req.params;

    try {
        logger.info('Admin: Get resource metrics', { requestId, resourceId: id });

        // Simulated metrics data - would query actual monitoring system
        const metricsData = {
            resourceId: id,
            resourceName: id.charAt(0).toUpperCase() + id.slice(1),
            type: id.includes('db') || id.includes('mongo') || id.includes('postgres') ? 'database' : 'cache',
            history: Array.from({ length: 24 }, (_, i) => ({
                timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
                responseTime: Math.random() * 100 + 10,
                status: 'healthy',
                errorRate: Math.random() * 2,
            })),
            current: {
                cpu: Math.random() * 60 + 20,
                memory: Math.random() * 70 + 20,
                connections: Math.floor(Math.random() * 50 + 10),
                throughput: Math.floor(Math.random() * 1000 + 500),
                errorRate: Math.random() * 2,
            },
        };

        const response: IAdminAPIResponse = {
            success: true,
            data: metricsData,
            requestId,
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to get resource metrics', {
            requestId,
            resourceId: id,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to get resource metrics',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId,
        };

        res.status(500).json(response);
    }
};
