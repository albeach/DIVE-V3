/**
 * AI Search Wrapper - Fuzzy search with query suggestions
 * 
 * Phase 3.3: AI-Assisted Search
 * Provides intelligent fuzzy matching and search history-based suggestions
 * 
 * Features:
 * - Fuse.js fuzzy matching with typo tolerance
 * - Query suggestion engine based on frequency
 * - Search history tracking with localStorage
 * - Performance optimized (<500ms)
 * - Type-safe responses
 * 
 * @version 1.0.0
 * @date 2026-02-05
 */

import Fuse from 'fuse.js';

// ============================================
// TYPES
// ============================================

export interface AISearchOptions<T> {
  /** Keys to search in the data objects */
  keys: (keyof T | string)[];
  
  /** Search threshold (0.0 = exact match, 1.0 = match anything) */
  threshold?: number;
  
  /** Sort results by score */
  shouldSort?: boolean;
  
  /** Minimum character length to match */
  minMatchCharLength?: number;
  
  /** Include match score in results */
  includeScore?: boolean;
  
  /** Enable extended search syntax */
  useExtendedSearch?: boolean;
  
  /** Ignore location of match in string */
  ignoreLocation?: boolean;
}

export interface QuerySuggestion {
  /** The search query */
  query: string;
  
  /** Number of times this query was used */
  frequency: number;
  
  /** Last time this query was used */
  lastUsed: number;
}

export interface AISearchResult<T> {
  /** The matching item */
  item: T;
  
  /** Match score (0-1, lower is better) */
  score?: number;
  
  /** Matched indices in the searched fields */
  matches?: ReadonlyArray<{
    indices: ReadonlyArray<[number, number]>;
    value?: string;
    key?: string;
  }>;
}

// ============================================
// CORE CLASS
// ============================================

/**
 * AI Search Wrapper Class
 * 
 * Provides fuzzy search with query suggestions based on search history
 */
export class AISearchWrapper<T> {
  private fuse: Fuse<T>;
  private searchHistory: QuerySuggestion[] = [];
  private storageKey: string;
  private maxHistorySize: number;
  
  constructor(
    data: T[],
    options: AISearchOptions<T>,
    storageKey: string,
    maxHistorySize: number = 100
  ) {
    // Initialize Fuse.js with optimized defaults
    this.fuse = new Fuse(data, {
      keys: options.keys as string[],
      threshold: options.threshold ?? 0.3, // 30% typo tolerance
      shouldSort: options.shouldSort ?? true,
      minMatchCharLength: options.minMatchCharLength ?? 2,
      includeScore: options.includeScore ?? true,
      useExtendedSearch: options.useExtendedSearch ?? false,
      ignoreLocation: options.ignoreLocation ?? true,
      findAllMatches: true,
      // Performance optimizations
      distance: 100,
      location: 0,
    });
    
    this.storageKey = storageKey;
    this.maxHistorySize = maxHistorySize;
    this.loadSearchHistory();
  }
  
  /**
   * Execute fuzzy search with typo tolerance
   * 
   * @example
   * ```ts
   * const results = searcher.search('secrat'); // Matches "secret"
   * ```
   */
  search(query: string): T[] {
    if (!query.trim()) return [];
    
    const startTime = performance.now();
    
    // Track query for suggestions
    this.trackQuery(query.trim());
    
    // Execute fuzzy search
    const results = this.fuse.search(query.trim());
    
    const endTime = performance.now();
    const latency = endTime - startTime;
    
    // Log performance (should be <500ms)
    if (latency > 500) {
      console.warn(`[AISearch] Slow search: ${latency.toFixed(2)}ms for query "${query}"`);
    }
    
    // Return just the items (not scores)
    return results.map(result => result.item);
  }
  
  /**
   * Execute search with detailed results (including scores and matches)
   */
  searchWithDetails(query: string): AISearchResult<T>[] {
    if (!query.trim()) return [];
    
    this.trackQuery(query.trim());
    
    const results = this.fuse.search(query.trim());
    
    return results.map(result => ({
      item: result.item,
      score: result.score,
      matches: result.matches,
    }));
  }
  
  /**
   * Get query suggestions based on search history
   * 
   * @param partial - Partial query to match against
   * @param limit - Maximum number of suggestions to return
   * 
   * @example
   * ```ts
   * const suggestions = searcher.getSuggestions('den', 5);
   * // Returns: ['denied', 'deny', 'denied access', ...]
   * ```
   */
  getSuggestions(partial: string, limit: number = 5): string[] {
    if (!partial.trim()) {
      // No partial query - return most frequent recent searches
      return this.searchHistory
        .sort((a, b) => {
          // Sort by frequency first, then by recency
          const freqDiff = b.frequency - a.frequency;
          if (freqDiff !== 0) return freqDiff;
          return b.lastUsed - a.lastUsed;
        })
        .slice(0, limit)
        .map(s => s.query);
    }
    
    const partialLower = partial.toLowerCase();
    
    return this.searchHistory
      .filter(s => s.query.toLowerCase().includes(partialLower))
      .sort((a, b) => {
        // Exact prefix match gets priority
        const aStartsWith = a.query.toLowerCase().startsWith(partialLower);
        const bStartsWith = b.query.toLowerCase().startsWith(partialLower);
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        
        // Then sort by frequency
        const freqDiff = b.frequency - a.frequency;
        if (freqDiff !== 0) return freqDiff;
        
        // Finally by recency
        return b.lastUsed - a.lastUsed;
      })
      .slice(0, limit)
      .map(s => s.query);
  }
  
  /**
   * Get "Did you mean?" suggestions for queries with no results
   * 
   * Uses Levenshtein distance to find similar queries
   */
  getDidYouMeanSuggestions(query: string, limit: number = 3): string[] {
    if (!query.trim()) return [];
    
    const queryLower = query.toLowerCase();
    
    // Get similar queries from history
    return this.searchHistory
      .filter(s => {
        // Calculate simple similarity (Levenshtein-like)
        const distance = this.getLevenshteinDistance(queryLower, s.query.toLowerCase());
        const maxLength = Math.max(queryLower.length, s.query.length);
        const similarity = 1 - (distance / maxLength);
        
        // Only suggest if similarity is > 60%
        return similarity > 0.6 && similarity < 1.0;
      })
      .sort((a, b) => {
        // Sort by frequency
        return b.frequency - a.frequency;
      })
      .slice(0, limit)
      .map(s => s.query);
  }
  
  /**
   * Update search data (when underlying data changes)
   */
  updateData(data: T[]): void {
    this.fuse.setCollection(data);
  }
  
  /**
   * Clear search history
   */
  clearHistory(): void {
    this.searchHistory = [];
    this.saveSearchHistory();
  }
  
  /**
   * Get search statistics
   */
  getStats(): {
    totalQueries: number;
    uniqueQueries: number;
    mostFrequentQuery: string | null;
    recentQueries: string[];
  } {
    const totalQueries = this.searchHistory.reduce((sum, s) => sum + s.frequency, 0);
    const uniqueQueries = this.searchHistory.length;
    
    const mostFrequent = this.searchHistory.length > 0
      ? [...this.searchHistory].sort((a, b) => b.frequency - a.frequency)[0]
      : null;
    
    const recent = [...this.searchHistory]
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, 10)
      .map(s => s.query);
    
    return {
      totalQueries,
      uniqueQueries,
      mostFrequentQuery: mostFrequent?.query || null,
      recentQueries: recent,
    };
  }
  
  // ============================================
  // PRIVATE METHODS
  // ============================================
  
  /**
   * Track search query for suggestions
   */
  private trackQuery(query: string): void {
    const existing = this.searchHistory.find(s => s.query === query);
    
    if (existing) {
      existing.frequency++;
      existing.lastUsed = Date.now();
    } else {
      this.searchHistory.push({
        query,
        frequency: 1,
        lastUsed: Date.now(),
      });
    }
    
    // Keep only top N queries (by frequency)
    if (this.searchHistory.length > this.maxHistorySize) {
      this.searchHistory.sort((a, b) => b.frequency - a.frequency);
      this.searchHistory = this.searchHistory.slice(0, this.maxHistorySize);
    }
    
    this.saveSearchHistory();
  }
  
  /**
   * Load search history from localStorage
   */
  private loadSearchHistory(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.searchHistory = JSON.parse(stored);
      }
    } catch (error) {
      console.error('[AISearch] Failed to load history:', error);
    }
  }
  
  /**
   * Save search history to localStorage
   */
  private saveSearchHistory(): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.searchHistory));
    } catch (error) {
      console.error('[AISearch] Failed to save history:', error);
    }
  }
  
  /**
   * Calculate Levenshtein distance between two strings
   * (for "Did you mean?" suggestions)
   */
  private getLevenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  }
}

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Create an AI search instance
 * 
 * @example
 * ```ts
 * const searcher = createAISearch(
 *   users,
 *   { keys: ['name', 'email', 'role'] },
 *   'dive-v3-search-users'
 * );
 * 
 * const results = searcher.search('admin');
 * const suggestions = searcher.getSuggestions('ad', 5);
 * ```
 */
export function createAISearch<T>(
  data: T[],
  options: AISearchOptions<T>,
  storageKey: string,
  maxHistorySize?: number
): AISearchWrapper<T> {
  return new AISearchWrapper(data, options, storageKey, maxHistorySize);
}

export default AISearchWrapper;
