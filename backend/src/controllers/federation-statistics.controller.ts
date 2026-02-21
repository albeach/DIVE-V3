/**
 * Federation Statistics Controller
 *
 * Provides federation-wide statistics from real MongoDB data:
 * - Decision log statistics (allow/deny counts, latency)
 * - Spoke registration counts
 * - Federation audit trail queries
 */

import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { IAdminAPIResponse } from '../types/admin.types';
import { decisionLogService } from '../services/decision-log.service';
import { getDb } from '../utils/mongodb-singleton';

/**
 * Query real federation statistics from MongoDB
 */
async function queryFederationStatistics(): Promise<{
    totalSpokes: number;
    activeSpokes: number;
    totalRequests24h: number;
    successRate: number;
    averageLatency: number;
    peakLatency: number;
    requestsBySpoke: Record<string, number>;
    latencyBySpoke: Record<string, number>;
    errorsBySpoke: Record<string, number>;
    trends: {
        requestsChange7d: number;
        latencyChange7d: number;
        errorRateChange7d: number;
    };
}> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 3600000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 3600000);

    // Query spoke registrations
    const db = getDb();
    const spokeCollection = db.collection('spoke_registrations');
    const spokes = await spokeCollection.find({}).toArray();
    const totalSpokes = spokes.length;
    const activeSpokes = spokes.filter(s => s.status === 'approved').length;

    // Query 24h decision statistics
    const stats24h = await decisionLogService.getStatistics(oneDayAgo, now);
    const totalRequests24h = stats24h.totalDecisions;
    const successRate = totalRequests24h > 0
        ? Math.round((stats24h.allowCount / totalRequests24h) * 1000) / 10
        : 100;

    // Get peak latency from decisions collection
    const peakResult = await db.collection('decisions').aggregate([
        { $match: { timestamp: { $gte: oneDayAgo.toISOString() } } },
        { $group: { _id: null, peak: { $max: '$latency_ms' } } }
    ]).toArray();
    const peakLatency = peakResult.length > 0 ? peakResult[0].peak : 0;

    // Group by country of affiliation (spoke proxy)
    const requestsBySpoke = stats24h.decisionsByCountry;
    const latencyBySpoke: Record<string, number> = {};
    const errorsBySpoke: Record<string, number> = {};

    // Per-spoke latency and errors
    const spokeMetrics = await db.collection('decisions').aggregate([
        { $match: { timestamp: { $gte: oneDayAgo.toISOString() } } },
        {
            $group: {
                _id: '$subject.countryOfAffiliation',
                avgLatency: { $avg: '$latency_ms' },
                denyCount: { $sum: { $cond: [{ $eq: ['$decision', 'DENY'] }, 1, 0] } }
            }
        }
    ]).toArray();

    spokeMetrics.forEach(m => {
        if (m._id) {
            latencyBySpoke[m._id] = Math.round(m.avgLatency);
            errorsBySpoke[m._id] = m.denyCount;
        }
    });

    // 7-day trends: compare current vs previous week
    const stats7d = await decisionLogService.getStatistics(sevenDaysAgo, now);
    const statsPrev7d = await decisionLogService.getStatistics(fourteenDaysAgo, sevenDaysAgo);

    const requestsChange7d = statsPrev7d.totalDecisions > 0
        ? Math.round(((stats7d.totalDecisions - statsPrev7d.totalDecisions) / statsPrev7d.totalDecisions) * 1000) / 10
        : 0;
    const latencyChange7d = statsPrev7d.averageLatency > 0
        ? Math.round(((stats7d.averageLatency - statsPrev7d.averageLatency) / statsPrev7d.averageLatency) * 1000) / 10
        : 0;
    const currentErrorRate = stats7d.totalDecisions > 0 ? stats7d.denyCount / stats7d.totalDecisions : 0;
    const prevErrorRate = statsPrev7d.totalDecisions > 0 ? statsPrev7d.denyCount / statsPrev7d.totalDecisions : 0;
    const errorRateChange7d = prevErrorRate > 0
        ? Math.round(((currentErrorRate - prevErrorRate) / prevErrorRate) * 1000) / 10
        : 0;

    return {
        totalSpokes,
        activeSpokes,
        totalRequests24h,
        successRate,
        averageLatency: stats24h.averageLatency,
        peakLatency,
        requestsBySpoke,
        latencyBySpoke,
        errorsBySpoke,
        trends: { requestsChange7d, latencyChange7d, errorRateChange7d },
    };
}

/**
 * Query real federation traffic data from MongoDB
 */
async function queryFederationTraffic(): Promise<{
    timeRange: { start: string; end: string };
    totalRequests: number;
    totalBytes: number;
    history: Array<{ timestamp: string; requests: number; bytes: number; errors: number; latency: number }>;
    bySpoke: Array<{ spokeId: string; spokeName: string; requests: number; bytes: number; avgLatency: number }>;
    topEndpoints: Array<{ endpoint: string; count: number; avgLatency: number }>;
}> {
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 3600000);
    const db = getDb();

    // Hourly histogram from decisions collection
    const hourlyData = await db.collection('decisions').aggregate([
        { $match: { timestamp: { $gte: start.toISOString() } } },
        {
            $group: {
                _id: { $substr: ['$timestamp', 0, 13] }, // YYYY-MM-DDTHH
                requests: { $sum: 1 },
                errors: { $sum: { $cond: [{ $eq: ['$decision', 'DENY'] }, 1, 0] } },
                avgLatency: { $avg: '$latency_ms' }
            }
        },
        { $sort: { _id: 1 } }
    ]).toArray();

    const history = hourlyData.map(h => ({
        timestamp: `${h._id}:00:00.000Z`,
        requests: h.requests,
        bytes: h.requests * 5000, // Estimated avg 5KB per request
        errors: h.errors,
        latency: Math.round(h.avgLatency || 0),
    }));

    const totalRequests = history.reduce((sum, h) => sum + h.requests, 0);
    const totalBytes = history.reduce((sum, h) => sum + h.bytes, 0);

    // Per-spoke breakdown
    const spokeData = await db.collection('decisions').aggregate([
        { $match: { timestamp: { $gte: start.toISOString() } } },
        {
            $group: {
                _id: '$subject.countryOfAffiliation',
                requests: { $sum: 1 },
                avgLatency: { $avg: '$latency_ms' }
            }
        },
        { $sort: { requests: -1 } }
    ]).toArray();

    const bySpoke = spokeData.filter(s => s._id).map(s => ({
        spokeId: `spoke-${(s._id as string).toLowerCase()}`,
        spokeName: s._id as string,
        requests: s.requests,
        bytes: s.requests * 5000,
        avgLatency: Math.round(s.avgLatency || 0),
    }));

    // Top endpoints from decisions (group by action.operation)
    const endpointData = await db.collection('decisions').aggregate([
        { $match: { timestamp: { $gte: start.toISOString() } } },
        {
            $group: {
                _id: '$action.operation',
                count: { $sum: 1 },
                avgLatency: { $avg: '$latency_ms' }
            }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
    ]).toArray();

    const topEndpoints = endpointData.filter(e => e._id).map(e => ({
        endpoint: e._id as string,
        count: e.count,
        avgLatency: Math.round(e.avgLatency || 0),
    }));

    return {
        timeRange: { start: start.toISOString(), end: now.toISOString() },
        totalRequests,
        totalBytes,
        history,
        bySpoke,
        topEndpoints,
    };
}

/**
 * GET /api/federation/statistics
 * Get federation-wide statistics
 */
export const getFederationStatisticsHandler = async (
    _req: Request,
    res: Response
): Promise<void> => {
    const requestId = _req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        logger.info('Admin: Get federation statistics', { requestId });

        const statistics = await queryFederationStatistics();

        const response: IAdminAPIResponse = {
            success: true,
            data: {
                statistics,
                timestamp: new Date().toISOString(),
            },
            requestId,
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to get federation statistics', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to get federation statistics',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId,
        };

        res.status(500).json(response);
    }
};

/**
 * GET /api/federation/traffic
 * Get federation traffic data
 */
export const getFederationTrafficHandler = async (
    _req: Request,
    res: Response
): Promise<void> => {
    const requestId = _req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        logger.info('Admin: Get federation traffic', { requestId });

        const traffic = await queryFederationTraffic();

        const response: IAdminAPIResponse = {
            success: true,
            data: {
                traffic,
                timestamp: new Date().toISOString(),
            },
            requestId,
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to get federation traffic', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to get federation traffic',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId,
        };

        res.status(500).json(response);
    }
};
