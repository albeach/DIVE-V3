/**
 * Search Analytics Utility
 * 
 * Phase 2: Search & Discovery Enhancement
 * Client-side analytics tracking for search events
 * 
 * Features:
 * - Non-blocking analytics tracking
 * - Automatic session ID generation
 * - Batch event queuing (optional)
 * - Retry on failure (optional)
 */

// ============================================
// Types
// ============================================

export type SearchEventType = 
  | 'search'           // User performed a search
  | 'click'            // User clicked on a result
  | 'filter_apply'     // User applied a filter
  | 'zero_results'     // Search returned no results
  | 'preview'          // User previewed a resource
  | 'download'         // User downloaded a resource
  | 'export';          // User exported search results

export interface ISearchFilters {
  classifications?: string[];
  countries?: string[];
  cois?: string[];
  instances?: string[];
  encrypted?: boolean;
}

export interface ISearchAnalyticsEvent {
  event: SearchEventType;
  query: string;
  filters?: ISearchFilters;
  resultCount?: number;
  clickedResourceId?: string;
  clickPosition?: number;
  latencyMs?: number;
  timestamp: string;
  sessionId?: string;
  source?: 'command_palette' | 'search_bar' | 'facet_filter' | 'federation_search' | 'keyboard_shortcut';
}

// ============================================
// Session Management
// ============================================

const SESSION_KEY = 'dive_analytics_session';
const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'server';

  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const { id, expires } = JSON.parse(stored);
      if (Date.now() < expires) {
        // Extend session on activity
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
          id,
          expires: Date.now() + SESSION_DURATION_MS,
        }));
        return id;
      }
    }

    // Create new session
    const newId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      id: newId,
      expires: Date.now() + SESSION_DURATION_MS,
    }));
    return newId;
  } catch (error) {
    // Fallback if sessionStorage fails
    return `temp-${Date.now()}`;
  }
}

// ============================================
// Analytics Tracking
// ============================================

/**
 * Track a search analytics event
 * Non-blocking - will not throw or affect user experience
 */
export async function trackSearchEvent(
  event: SearchEventType,
  data: Partial<Omit<ISearchAnalyticsEvent, 'event' | 'timestamp' | 'sessionId'>>
): Promise<void> {
  // Don't track in development unless explicitly enabled
  if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_ENABLE_DEV_ANALYTICS) {
    console.debug('[Analytics] Skipping in development:', event, data);
    return;
  }

  const payload: ISearchAnalyticsEvent = {
    event,
    query: data.query || '',
    filters: data.filters,
    resultCount: data.resultCount,
    clickedResourceId: data.clickedResourceId,
    clickPosition: data.clickPosition,
    latencyMs: data.latencyMs,
    timestamp: new Date().toISOString(),
    sessionId: getOrCreateSessionId(),
    source: data.source,
  };

  try {
    // Fire and forget - don't await
    fetch('/api/analytics/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(err => {
      // Silently fail - analytics should never break the app
      console.debug('[Analytics] Failed to track:', err.message);
    });
  } catch (error) {
    // Silently fail
    console.debug('[Analytics] Error:', error);
  }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Track a search query
 */
export function trackSearch(
  query: string,
  options: {
    resultCount?: number;
    latencyMs?: number;
    filters?: ISearchFilters;
    source?: ISearchAnalyticsEvent['source'];
  } = {}
): void {
  const eventType = options.resultCount === 0 ? 'zero_results' : 'search';
  trackSearchEvent(eventType, {
    query,
    ...options,
  });
}

/**
 * Track a result click
 */
export function trackResultClick(
  query: string,
  resourceId: string,
  position: number,
  source?: ISearchAnalyticsEvent['source']
): void {
  trackSearchEvent('click', {
    query,
    clickedResourceId: resourceId,
    clickPosition: position,
    source,
  });
}

/**
 * Track a filter application
 */
export function trackFilterApply(
  filters: ISearchFilters,
  source?: ISearchAnalyticsEvent['source']
): void {
  trackSearchEvent('filter_apply', {
    query: '',
    filters,
    source,
  });
}

/**
 * Track a resource preview
 */
export function trackPreview(
  query: string,
  resourceId: string,
  position: number
): void {
  trackSearchEvent('preview', {
    query,
    clickedResourceId: resourceId,
    clickPosition: position,
  });
}

/**
 * Track a resource download
 */
export function trackDownload(
  resourceId: string,
  query?: string
): void {
  trackSearchEvent('download', {
    query: query || '',
    clickedResourceId: resourceId,
  });
}

/**
 * Track search results export
 */
export function trackExport(
  query: string,
  resultCount: number,
  filters?: ISearchFilters
): void {
  trackSearchEvent('export', {
    query,
    resultCount,
    filters,
  });
}

// ============================================
// React Hook (Optional)
// ============================================

import { useCallback, useRef } from 'react';

export interface UseSearchAnalyticsReturn {
  trackSearch: (query: string, resultCount?: number, latencyMs?: number) => void;
  trackClick: (resourceId: string, position: number) => void;
  trackFilter: (filters: ISearchFilters) => void;
  trackPreview: (resourceId: string, position: number) => void;
}

/**
 * React hook for search analytics tracking
 * Maintains query context for click tracking
 */
export function useSearchAnalytics(
  source: ISearchAnalyticsEvent['source'] = 'search_bar'
): UseSearchAnalyticsReturn {
  const lastQueryRef = useRef<string>('');
  const lastFiltersRef = useRef<ISearchFilters>({});

  const handleTrackSearch = useCallback((
    query: string,
    resultCount?: number,
    latencyMs?: number
  ) => {
    lastQueryRef.current = query;
    trackSearch(query, {
      resultCount,
      latencyMs,
      filters: lastFiltersRef.current,
      source,
    });
  }, [source]);

  const handleTrackClick = useCallback((
    resourceId: string,
    position: number
  ) => {
    trackResultClick(lastQueryRef.current, resourceId, position, source);
  }, [source]);

  const handleTrackFilter = useCallback((filters: ISearchFilters) => {
    lastFiltersRef.current = filters;
    trackFilterApply(filters, source);
  }, [source]);

  const handleTrackPreview = useCallback((
    resourceId: string,
    position: number
  ) => {
    trackPreview(lastQueryRef.current, resourceId, position);
  }, []);

  return {
    trackSearch: handleTrackSearch,
    trackClick: handleTrackClick,
    trackFilter: handleTrackFilter,
    trackPreview: handleTrackPreview,
  };
}

export default {
  trackSearchEvent,
  trackSearch,
  trackResultClick,
  trackFilterApply,
  trackPreview,
  trackDownload,
  trackExport,
  useSearchAnalytics,
};





