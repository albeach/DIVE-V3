/**
 * Search Analytics Controller
 *
 * Phase 2: Search & Discovery Enhancement
 * Track search queries, click-through rates, and zero-result searches
 *
 * MEMORY LEAK FIX (2026-02-16): Refactored to use MongoDB singleton
 * OLD: Created new MongoClient() instances on every call (connection leak)
 * NEW: Uses shared singleton connection pool via getDb()
 * IMPACT: Prevents connection leak accumulation in high-frequency analytics endpoints
 *
 * Features:
 * - Anonymized search query logging
 * - Click-through event tracking
 * - Zero-result search flagging
 * - Popular searches aggregation
 * - Search performance metrics
 */

import { Request, Response, NextFunction } from 'express';
import { Collection } from 'mongodb';
import { getDb } from '../utils/mongodb-singleton';
import { logger } from '../utils/logger';

// ============================================
// Types
// ============================================

export interface ISearchAnalyticsEvent {
  event: 'search' | 'click' | 'filter_apply' | 'zero_results' | 'preview';
  query: string;
  filters?: {
    classifications?: string[];
    countries?: string[];
    cois?: string[];
    instances?: string[];
    encrypted?: boolean;
  };
  resultCount?: number;
  clickedResourceId?: string;
  clickPosition?: number;
  latencyMs?: number;
  timestamp: string;
  sessionId?: string;
  source?: 'command_palette' | 'search_bar' | 'facet_filter' | 'federation_search';
}

interface IStoredSearchEvent {
  _id?: string;
  event: string;
  queryHash: string;  // Hashed query for privacy
  queryLength: number;
  hasFilters: boolean;
  filterTypes: string[];
  resultCount: number;
  clickedResourceId?: string;
  clickPosition?: number;
  latencyMs?: number;
  timestamp: Date;
  sessionId?: string;
  source?: string;
  instance: string;
  createdAt: Date;
}

interface IPopularSearch {
  queryHash: string;
  searchCount: number;
  avgResultCount: number;
  avgLatencyMs: number;
  lastSearched: Date;
  clickThroughRate: number;
}

interface ISearchMetrics {
  totalSearches: number;
  uniqueQueries: number;
  avgResultCount: number;
  avgLatencyMs: number;
  zeroResultRate: number;
  clickThroughRate: number;
  topFilters: { filter: string; count: number }[];
  searchesByHour: { hour: number; count: number }[];
  searchesBySource: { source: string; count: number }[];
}

// ============================================
// Constants
// ============================================

const COLLECTION_NAME = 'search_analytics';
// const MAX_STORED_EVENTS = 100000; // Rotate oldest events - Unused constant
const RETENTION_DAYS = 90;

// ============================================
// MongoDB Collection Access (Singleton Pattern)
// ============================================

async function getAnalyticsCollection(): Promise<Collection<IStoredSearchEvent>> {
  const db = getDb();
  return db.collection<IStoredSearchEvent>(COLLECTION_NAME);
}

// ============================================
// Utility Functions
// ============================================

/**
 * Hash query for privacy (we don't store raw queries)
 * Uses a simple hash - in production, use crypto.createHash
 */
function hashQuery(query: string): string {
  const normalized = query.toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get instance from request
 */
function getInstanceFromRequest(req: Request): string {
  const host = req.headers.host || '';
  if (host.includes('fra')) return 'FRA';
  if (host.includes('gbr')) return 'GBR';
  if (host.includes('deu')) return 'DEU';
  return process.env.DIVE_INSTANCE || 'USA';
}

// ============================================
// Controller Handlers
// ============================================

/**
 * POST /api/analytics/search
 * Track a search analytics event
 */
export const trackSearchEventHandler = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;

  try {
    const event: ISearchAnalyticsEvent = req.body;
    const instance = getInstanceFromRequest(req);

    // Validate event type
    const validEvents = ['search', 'click', 'filter_apply', 'zero_results', 'preview'];
    if (!validEvents.includes(event.event)) {
      res.status(400).json({ error: 'Invalid event type' });
      return;
    }

    // Transform to stored format (anonymized)
    const storedEvent: IStoredSearchEvent = {
      event: event.event,
      queryHash: event.query ? hashQuery(event.query) : '',
      queryLength: event.query?.length || 0,
      hasFilters: !!(event.filters && Object.keys(event.filters).length > 0),
      filterTypes: event.filters ? Object.keys(event.filters).filter(k => {
        const val = (event.filters as Record<string, unknown>)[k];
        return val !== undefined && (Array.isArray(val) ? val.length > 0 : val !== null);
      }) : [],
      resultCount: event.resultCount || 0,
      clickedResourceId: event.clickedResourceId,
      clickPosition: event.clickPosition,
      latencyMs: event.latencyMs,
      timestamp: new Date(event.timestamp || Date.now()),
      sessionId: event.sessionId,
      source: event.source,
      instance,
      createdAt: new Date(),
    };

    // Store event
    const collection = await getAnalyticsCollection();
    await collection.insertOne(storedEvent);

    // Log for monitoring (without PII)
    logger.info('Search analytics event tracked', {
      requestId,
      event: event.event,
      queryLength: storedEvent.queryLength,
      hasFilters: storedEvent.hasFilters,
      resultCount: storedEvent.resultCount,
      latencyMs: storedEvent.latencyMs,
      instance,
    });

    res.status(201).json({ success: true });

  } catch (error) {
    logger.error('Failed to track search analytics', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Don't fail the request - analytics should be non-blocking
    res.status(201).json({ success: true, warning: 'Analytics tracking failed' });
  }
};

/**
 * GET /api/analytics/search/metrics
 * Get aggregated search metrics
 */
export const getSearchMetricsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;

  try {
    const { days = 7 } = req.query;
    const daysNum = Math.min(parseInt(days as string) || 7, 90);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    const collection = await getAnalyticsCollection();

    // Aggregate metrics
    const pipeline = [
      { $match: { timestamp: { $gte: startDate } } },
      {
        $facet: {
          totalSearches: [
            { $match: { event: 'search' } },
            { $count: 'count' },
          ],
          uniqueQueries: [
            { $match: { event: 'search' } },
            { $group: { _id: '$queryHash' } },
            { $count: 'count' },
          ],
          avgResultCount: [
            { $match: { event: 'search' } },
            { $group: { _id: null as unknown, avg: { $avg: '$resultCount' } } },
          ],
          avgLatencyMs: [
            { $match: { event: 'search', latencyMs: { $exists: true } } },
            { $group: { _id: null as unknown, avg: { $avg: '$latencyMs' } } },
          ],
          zeroResults: [
            { $match: { event: { $in: ['search', 'zero_results'] }, resultCount: 0 } },
            { $count: 'count' },
          ],
          clicks: [
            { $match: { event: 'click' } },
            { $count: 'count' },
          ],
          topFilters: [
            { $match: { hasFilters: true } },
            { $unwind: '$filterTypes' },
            { $group: { _id: '$filterTypes', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ],
          searchesByHour: [
            { $match: { event: 'search' } },
            { $group: { _id: { $hour: '$timestamp' }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
          searchesBySource: [
            { $match: { event: 'search' } },
            { $group: { _id: { $ifNull: ['$source', 'unknown'] }, count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    const data = results[0] || {};

    const totalSearches = data.totalSearches?.[0]?.count || 0;
    const clickCount = data.clicks?.[0]?.count || 0;
    const zeroResultCount = data.zeroResults?.[0]?.count || 0;

    const metrics: ISearchMetrics = {
      totalSearches,
      uniqueQueries: data.uniqueQueries?.[0]?.count || 0,
      avgResultCount: Math.round(data.avgResultCount?.[0]?.avg || 0),
      avgLatencyMs: Math.round(data.avgLatencyMs?.[0]?.avg || 0),
      zeroResultRate: totalSearches > 0 ? (zeroResultCount / totalSearches) * 100 : 0,
      clickThroughRate: totalSearches > 0 ? (clickCount / totalSearches) * 100 : 0,
      topFilters: (data.topFilters || []).map((f: { _id: string; count: number }) => ({
        filter: f._id,
        count: f.count,
      })),
      searchesByHour: (data.searchesByHour || []).map((h: { _id: number; count: number }) => ({
        hour: h._id,
        count: h.count,
      })),
      searchesBySource: (data.searchesBySource || []).map((s: { _id: string; count: number }) => ({
        source: s._id,
        count: s.count,
      })),
    };

    logger.info('Search metrics retrieved', {
      requestId,
      days: daysNum,
      totalSearches: metrics.totalSearches,
    });

    res.json({
      period: {
        days: daysNum,
        start: startDate.toISOString(),
        end: new Date().toISOString(),
      },
      metrics,
    });

  } catch (error) {
    logger.error('Failed to get search metrics', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    next(error);
  }
};

/**
 * GET /api/analytics/search/popular
 * Get popular searches (for autocomplete/suggestions)
 */
export const getPopularSearchesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;

  try {
    const { limit = 10, days = 7 } = req.query;
    const limitNum = Math.min(parseInt(limit as string) || 10, 50);
    const daysNum = Math.min(parseInt(days as string) || 7, 30);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    const collection = await getAnalyticsCollection();

    const pipeline = [
      { $match: { event: 'search', timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: '$queryHash',
          searchCount: { $sum: 1 },
          avgResultCount: { $avg: '$resultCount' },
          avgLatencyMs: { $avg: '$latencyMs' },
          lastSearched: { $max: '$timestamp' },
          queryLength: { $first: '$queryLength' },
        },
      },
      { $match: { searchCount: { $gte: 2 } } }, // Only show queries searched multiple times
      { $sort: { searchCount: -1 } },
      { $limit: limitNum },
    ];

    const popularSearches = await collection.aggregate(pipeline).toArray();

    // Get click-through rates
    const clickData = await collection.aggregate([
      { $match: { event: 'click', timestamp: { $gte: startDate } } },
      { $group: { _id: '$queryHash', clicks: { $sum: 1 } } },
    ]).toArray();

    const clickMap = new Map((clickData as Array<{ _id: string; clicks: number }>).map((c) => [c._id, c.clicks]));

    const results: IPopularSearch[] = (popularSearches as Array<{ _id: string; searchCount: number; avgResultCount: number; avgLatencyMs: number; lastSearched: Date; queryLength: number }>).map((search) => ({
      queryHash: search._id,
      searchCount: search.searchCount,
      avgResultCount: Math.round(search.avgResultCount || 0),
      avgLatencyMs: Math.round(search.avgLatencyMs || 0),
      lastSearched: search.lastSearched,
      clickThroughRate: search.searchCount > 0
        ? ((clickMap.get(search._id) || 0) / search.searchCount) * 100
        : 0,
    }));

    logger.info('Popular searches retrieved', {
      requestId,
      count: results.length,
      days: daysNum,
    });

    res.json({
      period: {
        days: daysNum,
        start: startDate.toISOString(),
        end: new Date().toISOString(),
      },
      searches: results,
    });

  } catch (error) {
    logger.error('Failed to get popular searches', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    next(error);
  }
};

/**
 * GET /api/analytics/search/zero-results
 * Get queries that returned zero results (for content gap analysis)
 */
export const getZeroResultQueriesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;

  try {
    const { limit = 20, days = 7 } = req.query;
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);
    const daysNum = Math.min(parseInt(days as string) || 7, 30);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    const collection = await getAnalyticsCollection();

    const pipeline = [
      {
        $match: {
          event: { $in: ['search', 'zero_results'] },
          resultCount: 0,
          timestamp: { $gte: startDate },
        }
      },
      {
        $group: {
          _id: '$queryHash',
          count: { $sum: 1 },
          avgQueryLength: { $avg: '$queryLength' },
          lastOccurred: { $max: '$timestamp' },
          sources: { $addToSet: '$source' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limitNum },
    ];

    const zeroResults = await collection.aggregate(pipeline).toArray();

    logger.info('Zero-result queries retrieved', {
      requestId,
      count: zeroResults.length,
      days: daysNum,
    });

    res.json({
      period: {
        days: daysNum,
        start: startDate.toISOString(),
        end: new Date().toISOString(),
      },
      queries: (zeroResults as Array<{ _id: string; count: number; avgQueryLength: number; lastOccurred: Date; sources: string[] }>).map((q) => ({
        queryHash: q._id,
        occurrences: q.count,
        avgQueryLength: Math.round(q.avgQueryLength || 0),
        lastOccurred: q.lastOccurred,
        sources: q.sources.filter(Boolean),
      })),
    });

  } catch (error) {
    logger.error('Failed to get zero-result queries', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    next(error);
  }
};

/**
 * DELETE /api/analytics/search/cleanup
 * Clean up old analytics data (admin only)
 */
export const cleanupAnalyticsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;

  try {
    const { days = RETENTION_DAYS } = req.query;
    const daysNum = Math.max(parseInt(days as string) || RETENTION_DAYS, 7);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNum);

    const collection = await getAnalyticsCollection();

    const result = await collection.deleteMany({
      timestamp: { $lt: cutoffDate },
    });

    logger.info('Analytics cleanup completed', {
      requestId,
      deletedCount: result.deletedCount,
      retentionDays: daysNum,
    });

    res.json({
      success: true,
      deletedCount: result.deletedCount,
      cutoffDate: cutoffDate.toISOString(),
    });

  } catch (error) {
    logger.error('Failed to cleanup analytics', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    next(error);
  }
};
