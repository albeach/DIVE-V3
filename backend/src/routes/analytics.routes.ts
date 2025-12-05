/**
 * Search Analytics Routes
 * 
 * Phase 2: Search & Discovery Enhancement
 * API routes for search analytics tracking and metrics
 */

import { Router } from 'express';
import {
  trackSearchEventHandler,
  getSearchMetricsHandler,
  getPopularSearchesHandler,
  getZeroResultQueriesHandler,
  cleanupAnalyticsHandler,
} from '../controllers/search-analytics.controller';
import { authenticateJWT } from '../middleware/authz.middleware';

const router = Router();

/**
 * POST /api/analytics/search
 * Track a search analytics event (search, click, filter_apply, zero_results)
 * Requires authentication but no specific authorization
 */
router.post('/search', authenticateJWT, trackSearchEventHandler);

/**
 * GET /api/analytics/search/metrics
 * Get aggregated search metrics for dashboard
 * Query params: days (default: 7, max: 90)
 */
router.get('/search/metrics', authenticateJWT, getSearchMetricsHandler);

/**
 * GET /api/analytics/search/popular
 * Get popular searches for autocomplete/suggestions
 * Query params: limit (default: 10, max: 50), days (default: 7, max: 30)
 */
router.get('/search/popular', authenticateJWT, getPopularSearchesHandler);

/**
 * GET /api/analytics/search/zero-results
 * Get queries that returned zero results (content gap analysis)
 * Query params: limit (default: 20, max: 100), days (default: 7, max: 30)
 */
router.get('/search/zero-results', authenticateJWT, getZeroResultQueriesHandler);

/**
 * DELETE /api/analytics/search/cleanup
 * Clean up old analytics data (admin only)
 * Query params: days (default: 90, min: 7)
 */
router.delete('/search/cleanup', authenticateJWT, cleanupAnalyticsHandler);

export default router;






