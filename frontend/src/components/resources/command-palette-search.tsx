/**
 * Document Search Palette Component (2025)
 * 
 * Phase 2: Search & Discovery Enhancement
 * Document-focused search experience with:
 * - "/" key activation (industry standard: GitHub, Notion, Linear)
 * - Server-side search with debouncing
 * - Advanced search syntax support
 * - Recent searches with persistence
 * - Pinned/starred searches
 * - Quick actions and filters
 * - Glass morphism design
 * 
 * NOTE: This uses "/" shortcut for document search.
 * The global "⌘K" shortcut is handled by CommandPalette in /navigation/
 * for app-wide navigation and actions.
 */

'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Command, 
  Clock, 
  FileText, 
  Filter, 
  Download, 
  Star,
  StarOff,
  Shield,
  Globe2,
  Users,
  Lock,
  ArrowRight,
  X,
  CornerDownLeft,
  Loader2,
  HelpCircle,
  Hash,
  Sparkles,
  Server,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';

// Phase 2: Import search syntax parser
import { parseSearchQuery, SEARCH_SYNTAX_HELP, AVAILABLE_FIELDS, type IParsedQuery } from '@/lib/search-syntax-parser';

// Phase 2: Import search analytics
import { trackSearch, trackResultClick, trackFilterApply } from '@/lib/search-analytics';

// ============================================
// Types
// ============================================

interface CommandPaletteSearchProps {
  resources: IResource[];
  onSearch: (query: string) => void;
  onFilterApply: (filter: QuickFilter) => void;
  onResourceSelect: (resourceId: string) => void;
  recentSearches?: string[];
  pinnedResources?: IResource[];
  userClearance?: string;
  userCountry?: string;
  /** Phase 2: Enable advanced search syntax */
  enableAdvancedSyntax?: boolean;
  /** Phase 2: Server-side search function */
  serverSearchFn?: (query: string) => Promise<IResource[]>;
}

interface IResource {
  resourceId: string;
  title: string;
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  encrypted: boolean;
  originRealm?: string;
}

interface QuickFilter {
  type: 'classification' | 'country' | 'coi' | 'encrypted' | 'instance';
  value: string;
  label: string;
}

interface SearchSuggestion {
  id: string;
  type: 'resource' | 'filter' | 'action' | 'recent' | 'pinned' | 'syntax' | 'loading';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string[];
  isPinned?: boolean;
}

// ============================================
// Constants
// ============================================

const RECENT_SEARCHES_KEY = 'dive_command_palette_recent';
const PINNED_SEARCHES_KEY = 'dive_command_palette_pinned';
const MAX_RECENT_SEARCHES = 10;
const MAX_PINNED_SEARCHES = 20;
const DEBOUNCE_MS = 150;

const CLASSIFICATION_FILTERS: QuickFilter[] = [
  { type: 'classification', value: 'UNCLASSIFIED', label: 'UNCLASSIFIED' },
  { type: 'classification', value: 'RESTRICTED', label: 'RESTRICTED' },
  { type: 'classification', value: 'CONFIDENTIAL', label: 'CONFIDENTIAL' },
  { type: 'classification', value: 'SECRET', label: 'SECRET' },
  { type: 'classification', value: 'TOP_SECRET', label: 'TOP SECRET' },
];

const INSTANCE_FILTERS: QuickFilter[] = [
  { type: 'instance', value: 'USA', label: '🇺🇸 USA Instance' },
  { type: 'instance', value: 'FRA', label: '🇫🇷 France Instance' },
  { type: 'instance', value: 'GBR', label: '🇬🇧 UK Instance' },
  { type: 'instance', value: 'DEU', label: '🇩🇪 Germany Instance' },
];

// ============================================
// Component
// ============================================

export default function CommandPaletteSearch({
  resources,
  onSearch,
  onFilterApply,
  onResourceSelect,
  recentSearches: externalRecentSearches,
  pinnedResources,
  userClearance,
  userCountry,
  enableAdvancedSyntax = true,
  serverSearchFn,
}: CommandPaletteSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>(externalRecentSearches || []);
  const [pinnedSearches, setPinnedSearches] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  
  // Phase 2: Server-side search state
  const [isSearching, setIsSearching] = useState(false);
  const [serverResults, setServerResults] = useState<IResource[]>([]);
  const [parsedQuery, setParsedQuery] = useState<IParsedQuery | null>(null);
  
  // Popular searches state
  const [popularSearches, setPopularSearches] = useState<Array<{ query: string; count: number }>>([]);
  const [loadingPopular, setLoadingPopular] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch popular searches
  useEffect(() => {
    async function fetchPopularSearches() {
      if (!isOpen) return;
      
      setLoadingPopular(true);
      try {
        const response = await fetch('/api/analytics/search/popular?limit=5&days=7', {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          if (data.popularSearches && Array.isArray(data.popularSearches)) {
            setPopularSearches(data.popularSearches);
          }
        }
      } catch (error) {
        console.debug('Failed to fetch popular searches:', error);
      } finally {
        setLoadingPopular(false);
      }
    }

    if (isOpen) {
      fetchPopularSearches();
    }
  }, [isOpen]);

  // Mount check for portal
  useEffect(() => {
    setMounted(true);
    
    // Load recent searches from localStorage
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
      
      // Phase 2: Load pinned searches
      const storedPinned = localStorage.getItem(PINNED_SEARCHES_KEY);
      if (storedPinned) {
        setPinnedSearches(JSON.parse(storedPinned));
      }
    } catch (error) {
      console.error('Failed to load search history:', error);
    }
  }, []);

  // Phase 2: Parse query for advanced syntax
  useEffect(() => {
    if (enableAdvancedSyntax && query.trim()) {
      const parsed = parseSearchQuery(query);
      setParsedQuery(parsed);
    } else {
      setParsedQuery(null);
    }
  }, [query, enableAdvancedSyntax]);

  // Phase 2: Server-side search with debouncing
  useEffect(() => {
    if (!serverSearchFn || query.trim().length < 2) {
      setServerResults([]);
      setIsSearching(false);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Clear previous timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    setIsSearching(true);
    
    debounceRef.current = setTimeout(async () => {
      abortControllerRef.current = new AbortController();
      try {
        const results = await serverSearchFn(query);
        setServerResults(results.slice(0, 8));
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Server search failed:', error);
        }
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, serverSearchFn]);

  // Document search keyboard shortcut: "/" key (industry standard)
  // NOTE: ⌘K is reserved for the global CommandPalette (navigation/actions)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // "/" to open document search (when not in an input field)
      // This is the standard pattern used by GitHub, Notion, Linear, Slack
      if (e.key === '/' && !isOpen) {
        const activeTag = document.activeElement?.tagName;
        const isEditable = activeTag === 'INPUT' || 
                          activeTag === 'TEXTAREA' || 
                          (document.activeElement as HTMLElement)?.isContentEditable;
        
        if (!isEditable) {
          e.preventDefault();
          setIsOpen(true);
        }
      }
      
      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Save to recent searches and track analytics
  const saveToRecent = useCallback((searchTerm: string, resultCount?: number) => {
    if (!searchTerm.trim()) return;
    
    const updated = [
      searchTerm,
      ...recentSearches.filter(s => s !== searchTerm),
    ].slice(0, MAX_RECENT_SEARCHES);
    
    setRecentSearches(updated);
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save recent searches:', error);
    }

    // Phase 2: Track search analytics
    trackSearch(searchTerm, {
      resultCount,
      source: 'command_palette',
    });
  }, [recentSearches]);

  // Phase 2: Toggle pinned search
  const togglePinSearch = useCallback((searchTerm: string) => {
    if (!searchTerm.trim()) return;
    
    const isPinned = pinnedSearches.includes(searchTerm);
    let updated: string[];
    
    if (isPinned) {
      updated = pinnedSearches.filter(s => s !== searchTerm);
    } else {
      if (pinnedSearches.length >= MAX_PINNED_SEARCHES) {
        console.warn(`Maximum pinned searches (${MAX_PINNED_SEARCHES}) reached`);
        return;
      }
      updated = [searchTerm, ...pinnedSearches];
    }
    
    setPinnedSearches(updated);
    try {
      localStorage.setItem(PINNED_SEARCHES_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save pinned searches:', error);
    }
  }, [pinnedSearches]);

  // Phase 2: Check if search is pinned
  const isPinned = useCallback((searchTerm: string): boolean => {
    return pinnedSearches.includes(searchTerm);
  }, [pinnedSearches]);

  // Generate suggestions based on query
  const suggestions = useMemo((): SearchSuggestion[] => {
    const results: SearchSuggestion[] = [];
    const queryLower = query.toLowerCase().trim();

    // Phase 2: Show syntax help
    if (queryLower === '?' || queryLower === 'help') {
      SEARCH_SYNTAX_HELP.forEach((help, idx) => {
        results.push({
          id: `syntax-${idx}`,
          type: 'syntax',
          title: help.syntax,
          subtitle: `${help.description} — Example: ${help.example}`,
          icon: <HelpCircle className="w-4 h-4 text-purple-500" />,
          action: () => {
            setQuery(help.example);
          },
        });
      });
      return results;
    }

    // Phase 2: Show field help on : prefix
    if (queryLower.endsWith(':') && enableAdvancedSyntax) {
      AVAILABLE_FIELDS.forEach(field => {
        results.push({
          id: `field-${field.field}`,
          type: 'syntax',
          title: `${field.field}:`,
          subtitle: `${field.description} — Aliases: ${field.aliases.join(', ')}`,
          icon: <Hash className="w-4 h-4 text-indigo-500" />,
          action: () => {
            setQuery(`${field.field}:`);
            inputRef.current?.focus();
          },
        });
      });
      return results;
    }

    // No query - show pinned, popular, recent, and quick actions
    if (!queryLower) {
      // Phase 2: Pinned searches first
      pinnedSearches.slice(0, 3).forEach((search, idx) => {
        results.push({
          id: `pinned-${idx}`,
          type: 'pinned',
          title: search,
          subtitle: 'Pinned search',
          icon: <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />,
          isPinned: true,
          action: () => {
            setQuery(search);
            onSearch(search);
            saveToRecent(search);
            setIsOpen(false);
          },
        });
      });

      // Popular searches (if available)
      if (popularSearches.length > 0) {
        popularSearches.forEach((item, idx) => {
          // Don't duplicate pinned or recent searches
          if (pinnedSearches.includes(item.query) || recentSearches.includes(item.query)) return;
          
          results.push({
            id: `popular-${idx}`,
            type: 'recent',
            title: item.query,
            subtitle: `Popular • ${item.count} searches`,
            icon: <TrendingUp className="w-4 h-4 text-orange-500" />,
            isPinned: false,
            action: () => {
              setQuery(item.query);
              onSearch(item.query);
              saveToRecent(item.query);
              setIsOpen(false);
            },
          });
        });
      }

      // Recent searches
      recentSearches.slice(0, 5).forEach((search, idx) => {
        // Don't duplicate pinned or popular searches
        if (pinnedSearches.includes(search) || popularSearches.some(p => p.query === search)) return;
        
        results.push({
          id: `recent-${idx}`,
          type: 'recent',
          title: search,
          subtitle: 'Recent search',
          icon: <Clock className="w-4 h-4 text-gray-400" />,
          isPinned: false,
          action: () => {
            setQuery(search);
            onSearch(search);
            saveToRecent(search);
            setIsOpen(false);
          },
        });
      });

      // Quick filters
      results.push({
        id: 'filter-my-clearance',
        type: 'filter',
        title: `Show ${userClearance || 'accessible'} documents`,
        subtitle: 'Filter by your clearance level',
        icon: <Shield className="w-4 h-4 text-green-500" />,
        action: () => {
          if (userClearance) {
            onFilterApply({ type: 'classification', value: userClearance, label: userClearance });
          }
          setIsOpen(false);
        },
      });

      results.push({
        id: 'filter-my-country',
        type: 'filter',
        title: `Show ${userCountry || 'releasable'} documents`,
        subtitle: 'Filter by your country',
        icon: <Globe2 className="w-4 h-4 text-blue-500" />,
        action: () => {
          if (userCountry) {
            onFilterApply({ type: 'country', value: userCountry, label: userCountry });
          }
          setIsOpen(false);
        },
      });

      results.push({
        id: 'filter-encrypted',
        type: 'filter',
        title: 'Show encrypted documents only',
        subtitle: 'ZTDF protected resources',
        icon: <Lock className="w-4 h-4 text-purple-500" />,
        action: () => {
          onFilterApply({ type: 'encrypted', value: 'true', label: 'Encrypted' });
          setIsOpen(false);
        },
      });

      // Phase 2: Add syntax help action
      results.push({
        id: 'action-help',
        type: 'action',
        title: 'Search syntax help',
        subtitle: 'Type ? or help to see advanced syntax',
        icon: <HelpCircle className="w-4 h-4 text-gray-400" />,
        action: () => {
          setQuery('?');
        },
      });

      return results;
    }

    // Search syntax detection
    const isFilterQuery = queryLower.startsWith(':') || /^\w+:/.test(queryLower);
    
    if (isFilterQuery) {
      // Parse filter commands
      if (queryLower.startsWith(':classification') || queryLower.startsWith(':c ')) {
        CLASSIFICATION_FILTERS.forEach(filter => {
          results.push({
            id: `filter-${filter.value}`,
            type: 'filter',
            title: filter.label,
            subtitle: 'Classification filter',
            icon: <Shield className="w-4 h-4 text-orange-500" />,
            action: () => {
              // Track filter analytics
              trackFilterApply({ classifications: [filter.value] }, 'command_palette');
              onFilterApply(filter);
              saveToRecent(`classification:${filter.value}`);
              setIsOpen(false);
            },
          });
        });
      } else if (queryLower.startsWith(':instance') || queryLower.startsWith(':i ')) {
        INSTANCE_FILTERS.forEach(filter => {
          results.push({
            id: `filter-${filter.value}`,
            type: 'filter',
            title: filter.label,
            subtitle: 'Federation instance',
            icon: <Server className="w-4 h-4 text-blue-500" />,
            action: () => {
              // Track filter analytics
              trackFilterApply({ instances: [filter.value] }, 'command_palette');
              onFilterApply(filter);
              saveToRecent(`instance:${filter.value}`);
              setIsOpen(false);
            },
          });
        });
      } else if (parsedQuery && parsedQuery.filters.length > 0) {
        // Phase 2: Show parsed query interpretation
        results.push({
          id: 'parsed-query',
          type: 'action',
          title: 'Search with filters',
          subtitle: parsedQuery.filters.map(f => `${f.field}:${f.value}`).join(', '),
          icon: <Sparkles className="w-4 h-4 text-indigo-500" />,
          action: () => {
            onSearch(query);
            saveToRecent(query);
            setIsOpen(false);
          },
        });
      }
    }

    // Phase 2: Loading indicator for server search
    if (isSearching) {
      results.push({
        id: 'loading',
        type: 'loading',
        title: 'Searching...',
        subtitle: 'Fetching results from server',
        icon: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
        action: () => {},
      });
    }

    // Phase 2: Show server results if available
    if (!isSearching && serverResults.length > 0) {
      serverResults.forEach((resource, index) => {
        results.push({
          id: resource.resourceId,
          type: 'resource',
          title: resource.title,
          subtitle: `${resource.classification} • ${resource.resourceId}`,
          icon: resource.encrypted 
            ? <Lock className="w-4 h-4 text-purple-500" />
            : <FileText className="w-4 h-4 text-blue-500" />,
          action: () => {
            // Track click analytics
            trackResultClick(query, resource.resourceId, index, 'command_palette');
            onResourceSelect(resource.resourceId);
            saveToRecent(query, serverResults.length);
            setIsOpen(false);
          },
        });
      });
    } else if (!isSearching && !isFilterQuery) {
      // Local resource search (fallback if no server search)
      const matchingResources = resources
        .filter(r => 
          r.title.toLowerCase().includes(queryLower) ||
          r.resourceId.toLowerCase().includes(queryLower)
        )
        .slice(0, 8);

      matchingResources.forEach((resource, index) => {
        // Don't duplicate server results
        if (serverResults.some(sr => sr.resourceId === resource.resourceId)) return;
        
        results.push({
          id: resource.resourceId,
          type: 'resource',
          title: resource.title,
          subtitle: `${resource.classification} • ${resource.resourceId}`,
          icon: resource.encrypted 
            ? <Lock className="w-4 h-4 text-purple-500" />
            : <FileText className="w-4 h-4 text-blue-500" />,
          action: () => {
            // Track click analytics
            trackResultClick(query, resource.resourceId, index, 'command_palette');
            onResourceSelect(resource.resourceId);
            saveToRecent(query, matchingResources.length);
            setIsOpen(false);
          },
        });
      });
    }

    // Add "Search for..." action
    if (queryLower.length > 2 && !isSearching) {
      results.push({
        id: 'search-all',
        type: 'action',
        title: `Search for "${query}"`,
        subtitle: `Search across all ${resources.length.toLocaleString()} documents`,
        icon: <Search className="w-4 h-4 text-indigo-500" />,
        action: () => {
          onSearch(query);
          saveToRecent(query);
          setIsOpen(false);
        },
      });
    }

    // Phase 2: Show query parse errors
    if (parsedQuery && !parsedQuery.isValid && parsedQuery.errors.length > 0) {
      results.push({
        id: 'parse-error',
        type: 'syntax',
        title: 'Syntax issue detected',
        subtitle: parsedQuery.errors.join('; '),
        icon: <AlertCircle className="w-4 h-4 text-yellow-500" />,
        action: () => {},
      });
    }

    return results;
  }, [
    query, 
    parsedQuery,
    resources, 
    serverResults,
    isSearching,
    recentSearches, 
    pinnedSearches,
    userClearance, 
    userCountry, 
    enableAdvancedSyntax,
    onSearch, 
    onFilterApply, 
    onResourceSelect, 
    saveToRecent
  ]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (suggestions[selectedIndex]) {
          suggestions[selectedIndex].action();
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!mounted) return null;

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={() => setIsOpen(false)}
          />

          {/* Command Palette - Centered using inset and margin auto */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed top-[15%] inset-x-0 mx-auto w-full max-w-2xl z-50 px-4"
          >
            <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
              {/* Search Input */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search documents, filters, or type : for commands..."
                  className="flex-1 bg-transparent text-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
                />
                <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-md font-mono">
                  ESC
                </kbd>
              </div>

              {/* Suggestions List */}
              <div 
                ref={listRef}
                className="max-h-96 overflow-y-auto py-2 scroll-smooth"
                role="listbox"
              >
                {suggestions.length > 0 ? (
                  suggestions.map((suggestion, index) => (
                    <div
                      key={suggestion.id}
                      role="option"
                      aria-selected={index === selectedIndex}
                      tabIndex={index === selectedIndex ? 0 : -1}
                      onClick={suggestion.type !== 'loading' ? suggestion.action : undefined}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && suggestion.type !== 'loading') {
                          suggestion.action?.();
                        }
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors group cursor-pointer ${
                        index === selectedIndex
                          ? 'bg-blue-50 dark:bg-blue-900/30'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      } ${suggestion.type === 'loading' ? 'cursor-wait pointer-events-none' : ''}`}
                    >
                      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                        index === selectedIndex
                          ? 'bg-blue-100 dark:bg-blue-800'
                          : 'bg-gray-100 dark:bg-gray-800'
                      }`}>
                        {suggestion.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {suggestion.title}
                        </div>
                        {suggestion.subtitle && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {suggestion.subtitle}
                          </div>
                        )}
                      </div>
                      {/* Phase 2: Pin button for recent/pinned searches */}
                      {(suggestion.type === 'recent' || suggestion.type === 'pinned') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePinSearch(suggestion.title);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-all"
                          title={suggestion.isPinned ? 'Unpin search' : 'Pin search'}
                        >
                          {suggestion.isPinned ? (
                            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                          ) : (
                            <StarOff className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      )}
                      {index === selectedIndex && suggestion.type !== 'loading' && (
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <CornerDownLeft className="w-3 h-3" />
                          <span>Enter</span>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-8 text-center text-gray-500">
                    <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No results found for "{query}"</p>
                    <p className="text-xs mt-1">Try a different search term</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 font-mono">↑</kbd>
                    <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 font-mono">↓</kbd>
                    navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 font-mono">↵</kbd>
                    select
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 font-mono">?</kbd>
                    syntax help
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">
                    {resources.length.toLocaleString()} documents
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {/* Trigger Button - Document Search */}
      <button
        onClick={() => setIsOpen(true)}
        className="group flex items-center gap-3 w-full px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 transition-all shadow-sm hover:shadow-md"
        aria-label="Search documents (press /)"
      >
        <Search className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
        <span className="flex-1 text-left text-gray-500 dark:text-gray-400">
          Search documents, filters...
        </span>
        <kbd className="hidden sm:inline-flex items-center px-2.5 py-1 text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-md font-mono font-semibold">
          /
        </kbd>
      </button>

      {/* Portal Modal */}
      {mounted && createPortal(modalContent, document.body)}
    </>
  );
}

// ============================================
// Trigger-only variant for embedding in toolbar
// ============================================

export function DocumentSearchTrigger({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      aria-label="Search documents (press /)"
    >
      <Search className="w-4 h-4" />
      <span className="hidden md:inline">Search Documents</span>
      <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-xs text-gray-400 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 font-mono font-semibold">
        /
      </kbd>
    </button>
  );
}

// Legacy export name for backwards compatibility
export { DocumentSearchTrigger as CommandPaletteSearchTrigger };

