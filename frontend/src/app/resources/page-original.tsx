'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import PageLayout from '@/components/layout/page-layout';
import ResourceFilters, { ResourceFiltersState } from '@/components/resources/resource-filters';
import Pagination from '@/components/resources/pagination';
import AdvancedResourceCard, { ViewMode, IResourceCardData } from '@/components/resources/advanced-resource-card';
import ViewModeSwitcher from '@/components/resources/view-mode-switcher';
import AdvancedSearch from '@/components/resources/advanced-search';
import CategoryBrowser from '@/components/resources/category-browser';
import SavedFilters from '@/components/resources/saved-filters';

// Phase 1 Components
import { 
  CommandPaletteSearch,
  ResourcesPageSkeleton,
  ResourceGridSkeleton,
  ToolbarSkeleton,
} from '@/components/resources';

import { Globe2, Server, RefreshCw, Keyboard } from 'lucide-react';

const VIEW_MODE_KEY = 'dive_resources_view_mode';
const FEDERATED_MODE_KEY = 'dive_resources_federated_mode';

// Federation instances
const FEDERATION_INSTANCES = ['USA', 'FRA', 'GBR', 'DEU'] as const;
type FederationInstance = typeof FEDERATION_INSTANCES[number];

// Clearance hierarchy for filtering
const CLEARANCE_ORDER: Record<string, number> = {
  'UNCLASSIFIED': 0,
  'RESTRICTED': 0.5,
  'CONFIDENTIAL': 1,
  'SECRET': 2,
  'TOP_SECRET': 3,
};

function filterAndSortResources(
  resources: IResourceCardData[], 
  filters: ResourceFiltersState
): IResourceCardData[] {
  let filtered = [...resources];

  // Search filter (title or resource ID)
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(r => 
      r.title.toLowerCase().includes(searchLower) ||
      r.resourceId.toLowerCase().includes(searchLower)
    );
  }

  // Classification filter (OR logic - match any selected)
  if (filters.classifications.length > 0) {
    filtered = filtered.filter(r =>
      filters.classifications.includes(r.classification)
    );
  }

  // Country filter (AND logic - must be releasable to ALL selected countries)
  if (filters.countries.length > 0) {
    filtered = filtered.filter(r =>
      filters.countries.every(country => r.releasabilityTo.includes(country))
    );
  }

  // COI filter (OR logic - must have ANY selected COI)
  if (filters.cois.length > 0) {
    filtered = filtered.filter(r =>
      r.COI.some(coi => filters.cois.includes(coi))
    );
  }

  // Encryption filter
  if (filters.encryptionStatus === 'encrypted') {
    filtered = filtered.filter(r => r.encrypted);
  } else if (filters.encryptionStatus === 'unencrypted') {
    filtered = filtered.filter(r => !r.encrypted);
  }

  // Sort
  filtered.sort((a, b) => {
    let comparison = 0;

    if (filters.sortBy === 'title') {
      comparison = a.title.localeCompare(b.title);
    } else if (filters.sortBy === 'classification') {
      const aLevel = CLEARANCE_ORDER[a.classification] || 0;
      const bLevel = CLEARANCE_ORDER[b.classification] || 0;
      comparison = aLevel - bLevel;
    } else if (filters.sortBy === 'createdAt') {
      const aTime = new Date(a.creationDate || 0).getTime();
      const bTime = new Date(b.creationDate || 0).getTime();
      comparison = aTime - bTime;
    }

    return filters.sortOrder === 'asc' ? comparison : -comparison;
  });

  return filtered;
}

function paginateResources(resources: IResourceCardData[], page: number, perPage: number) {
  const totalPages = Math.ceil(resources.length / perPage);
  const start = (page - 1) * perPage;
  const end = start + perPage;

  return {
    items: resources.slice(start, end),
    totalPages,
    currentPage: page,
    totalItems: resources.length,
  };
}

export default function ResourcesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [resources, setResources] = useState<IResourceCardData[]>([]);
  const [filteredResources, setFilteredResources] = useState<IResourceCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // View mode with localStorage persistence
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  
  // Federated search state
  const [federatedMode, setFederatedMode] = useState(false);
  const [selectedInstances, setSelectedInstances] = useState<FederationInstance[]>(['USA']);
  const [federatedStats, setFederatedStats] = useState<Record<string, { count: number; latencyMs: number; error?: string }>>({});
  const [federatedLoading, setFederatedLoading] = useState(false);
  const [federatedTotalResults, setFederatedTotalResults] = useState<number>(0);
  
  // Timing stats (Phase 1)
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  
  // Filter state
  const [filters, setFilters] = useState<ResourceFiltersState>({
    search: '',
    classifications: [],
    countries: [],
    cois: [],
    fileTypes: [],
    encryptionStatus: 'all',
    sortBy: 'title',
    sortOrder: 'asc',
  });

  // UI state
  const [showCategoryBrowser, setShowCategoryBrowser] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  
  // Ref to prevent duplicate fetches
  const hasFetchedRef = useRef(false);
  const lastFederatedModeRef = useRef(federatedMode);
  const lastInstancesRef = useRef(selectedInstances.join(','));
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load preferences from localStorage
  useEffect(() => {
    try {
      const storedViewMode = localStorage.getItem(VIEW_MODE_KEY);
      if (storedViewMode && ['grid', 'list', 'compact'].includes(storedViewMode)) {
        setViewMode(storedViewMode as ViewMode);
      }
      
      const storedFederatedMode = localStorage.getItem(FEDERATED_MODE_KEY);
      if (storedFederatedMode === 'true') {
        setFederatedMode(true);
      }
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
  }, []);

  // Save view mode to localStorage
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch (error) {
      console.error('Failed to save view mode:', error);
    }
  };

  // Toggle federated mode
  const handleFederatedModeToggle = () => {
    const newMode = !federatedMode;
    setFederatedMode(newMode);
    try {
      localStorage.setItem(FEDERATED_MODE_KEY, String(newMode));
    } catch (error) {
      console.error('Failed to save federated mode:', error);
    }
  };

  // Toggle instance selection
  const toggleInstance = (instance: FederationInstance) => {
    setSelectedInstances(prev => {
      if (prev.includes(instance)) {
        if (prev.length === 1) return prev;
        return prev.filter(i => i !== instance);
      }
      return [...prev, instance];
    });
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status !== 'loading' && !session) {
      router.push('/login');
    }
  }, [status, session, router]);

  // Fetch resources with AbortController support
  const fetchResources = useCallback(async (isFederated: boolean, instanceList: FederationInstance[]) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    try {
      setLoading(true);
      setError(null);
      const startTime = Date.now();

      if (isFederated) {
        setFederatedLoading(true);
        const response = await fetch('/api/resources/federated-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: instanceList,
            limit: 500,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.message || `HTTP ${response.status}: Failed to fetch federated resources`);
        }

        const data = await response.json();
        const fetchedResources = data.results || [];
        
        setFederatedStats(data.instanceResults || {});
        
        const instanceStats = data.instanceResults || {};
        const trueTotalFromInstances = Object.values(instanceStats)
          .reduce((sum: number, stats: any) => sum + (stats?.count || 0), 0);
        setFederatedTotalResults(data.totalResults || trueTotalFromInstances);
        setExecutionTimeMs(data.executionTimeMs || (Date.now() - startTime));
        
        setResources(fetchedResources);
        setFilteredResources(fetchedResources);
        setFederatedLoading(false);
      } else {
        const response = await fetch('/api/resources', {
          method: 'GET',
          cache: 'no-store',
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.message || `HTTP ${response.status}: Failed to fetch resources`);
        }

        const data = await response.json();
        const fetchedResources = data.resources || [];
        
        setExecutionTimeMs(Date.now() - startTime);
        setResources(fetchedResources);
        setFilteredResources(fetchedResources);
        setFederatedStats({});
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Request was cancelled
      }
      const errorMessage = err instanceof Error ? err.message : 'Failed to load resources';
      setError(errorMessage);
      console.error('[Resources] Error fetching resources:', err);
      setFederatedLoading(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Initial fetch
  useEffect(() => {
    if (status === 'loading' || !session) return;
    if (hasFetchedRef.current) return;
    
    hasFetchedRef.current = true;
    fetchResources(federatedMode, selectedInstances);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session]);

  // Re-fetch when mode/instances change
  useEffect(() => {
    if (!hasFetchedRef.current) return;
    
    const modeChanged = lastFederatedModeRef.current !== federatedMode;
    const instancesChanged = lastInstancesRef.current !== selectedInstances.join(',');
    
    if (modeChanged || (federatedMode && instancesChanged)) {
      lastFederatedModeRef.current = federatedMode;
      lastInstancesRef.current = selectedInstances.join(',');
      fetchResources(federatedMode, selectedInstances);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps  
  }, [federatedMode, selectedInstances.join(',')]);

  // Handle filter changes
  const handleFilterChange = useCallback((newFilters: ResourceFiltersState) => {
    setFilters(newFilters);
    const filtered = filterAndSortResources(resources, newFilters);
    setFilteredResources(filtered);
    setCurrentPage(1);
  }, [resources]);

  // Re-filter when sort changes
  useEffect(() => {
    const filtered = filterAndSortResources(resources, filters);
    setFilteredResources(filtered);
  }, [filters.sortBy, filters.sortOrder, resources, filters]);

  // Handle category click
  const handleCategoryClick = (category: string, value: string) => {
    if (category === 'classification') {
      setFilters(prev => ({ ...prev, classifications: [value] }));
    } else if (category === 'country') {
      setFilters(prev => ({ ...prev, countries: [value] }));
    } else if (category === 'coi') {
      setFilters(prev => ({ ...prev, cois: [value] }));
    } else if (category === 'encryption') {
      setFilters(prev => ({
        ...prev,
        encryptionStatus: value.toLowerCase() === 'encrypted' ? 'encrypted' : 'unencrypted'
      }));
    }
    setShowCategoryBrowser(false);
  };

  // Handle refresh
  const handleRefresh = () => {
    setRefreshing(true);
    hasFetchedRef.current = false;
    fetchResources(federatedMode, selectedInstances);
  };

  // Handle command palette actions
  const handleCommandPaletteSearch = (query: string) => {
    setFilters(prev => ({ ...prev, search: query }));
  };

  const handleCommandPaletteFilter = (filter: { type: string; value: string }) => {
    if (filter.type === 'classification') {
      setFilters(prev => ({ ...prev, classifications: [filter.value] }));
    } else if (filter.type === 'country') {
      setFilters(prev => ({ ...prev, countries: [filter.value] }));
    } else if (filter.type === 'encrypted') {
      setFilters(prev => ({ ...prev, encryptionStatus: 'encrypted' }));
    }
  };

  // Pagination
  const paginatedData = paginateResources(filteredResources, currentPage, itemsPerPage);

  // Grid classes
  const getGridClasses = () => {
    switch (viewMode) {
      case 'grid': return 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4';
      case 'list': return 'space-y-3';
      case 'compact': return 'space-y-2';
      default: return 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4';
    }
  };

  // Loading state - use Phase 1 skeleton
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <ResourcesPageSkeleton />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <PageLayout 
      user={session.user}
      breadcrumbs={[{ label: 'Classified Documents', href: null }]}
    >
      {/* Document Search Palette (press "/" to open) */}
      {/* NOTE: ⌘K is reserved for global navigation (CommandPalette in /navigation/) */}
      <CommandPaletteSearch
        resources={resources}
        onSearch={handleCommandPaletteSearch}
        onFilterApply={handleCommandPaletteFilter}
        onResourceSelect={(resourceId) => router.push(`/resources/${resourceId}`)}
        userClearance={session.user?.clearance}
        userCountry={session.user?.countryOfAffiliation}
      />

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 mb-3">
              Classified Documents
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-3xl">
              Browse, search, and access classified documents based on your clearance level, 
              country affiliation, and communities of interest.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Keyboard Shortcuts Hint */}
            <button
              onClick={() => setShowKeyboardHelp(!showKeyboardHelp)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="Keyboard shortcuts: / for search, ⌘K for navigation"
            >
              <Keyboard className="w-4 h-4" />
              <span className="hidden md:inline font-mono text-xs">/</span>
            </button>
            
            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={loading || refreshing}
              className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              title="Refresh documents"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline text-sm font-medium">Refresh</span>
            </button>
            
            {/* Category Browser Toggle */}
            <button
              onClick={() => setShowCategoryBrowser(!showCategoryBrowser)}
              className={`flex-shrink-0 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm ${
                showCategoryBrowser
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-2 border-gray-200 dark:border-gray-700 hover:border-blue-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                {showCategoryBrowser ? 'Hide' : 'Browse'} Categories
              </span>
            </button>
          </div>
        </div>

        {/* Federated Search Toggle */}
        <div className="flex flex-wrap items-center gap-4 mb-4 p-4 bg-gradient-to-r from-slate-50 to-blue-50 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border-2 border-slate-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <button
              onClick={handleFederatedModeToggle}
              className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                federatedMode ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${
                  federatedMode ? 'translate-x-8' : 'translate-x-1'
                }`}
              />
            </button>
            <div className="flex items-center gap-2">
              {federatedMode ? (
                <Globe2 className="w-5 h-5 text-blue-600" />
              ) : (
                <Server className="w-5 h-5 text-gray-500" />
              )}
              <span className={`font-semibold ${federatedMode ? 'text-blue-700 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}>
                {federatedMode ? 'Federated Search' : 'Local Only'}
              </span>
            </div>
          </div>

          {/* Instance Selection */}
          {federatedMode && (
            <div className="flex items-center gap-2 ml-4 pl-4 border-l-2 border-slate-300 dark:border-gray-600">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Instances:</span>
              <div className="flex gap-1.5">
                {FEDERATION_INSTANCES.map((instance) => {
                  const isSelected = selectedInstances.includes(instance);
                  const stats = federatedStats[instance];
                  return (
                    <button
                      key={instance}
                      onClick={() => toggleInstance(instance)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:border-blue-400'
                      }`}
                      title={stats ? `${stats.count} docs, ${stats.latencyMs}ms` : undefined}
                    >
                      {instance}
                      {isSelected && stats && (
                        <span className="ml-1 opacity-75">({stats.count})</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {federatedLoading && (
                <div className="ml-2 animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
              )}
            </div>
          )}
        </div>

        {/* Compliance Badges & Stats */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold shadow-sm">
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            ACP-240 Compliant
          </span>
          <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-semibold">
            NATO STANAG 4774
          </span>
          <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-semibold">
            🔐 ZTDF Encrypted
          </span>
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-xs font-bold">
            {federatedMode && federatedTotalResults > 0 
              ? federatedTotalResults.toLocaleString() 
              : resources.length.toLocaleString()
            } Documents
            {federatedMode && Object.keys(federatedStats).length > 0 && (
              <span className="ml-1 text-blue-600 dark:text-blue-400">
                ({Object.keys(federatedStats).filter(k => !federatedStats[k].error).length} instances)
              </span>
            )}
            {federatedMode && resources.length < federatedTotalResults && (
              <span className="ml-1 text-gray-500 dark:text-gray-400">
                (showing {resources.length.toLocaleString()})
              </span>
            )}
          </span>
          {executionTimeMs && (
            <span className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium">
              {executionTimeMs}ms
            </span>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl p-5 mb-8 flex items-start gap-3">
          <svg className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-red-900 dark:text-red-200 mb-1">Error Loading Documents</h3>
            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Advanced Search Bar */}
      <div className="mb-6">
        <AdvancedSearch
          resources={resources}
          value={filters.search}
          onChange={(value) => setFilters(prev => ({ ...prev, search: value }))}
        />
      </div>

      {/* Category Browser */}
      {showCategoryBrowser && (
        <div className="mb-6 animate-in slide-in-from-top duration-300">
          <CategoryBrowser
            resources={resources}
            onCategoryClick={handleCategoryClick}
          />
        </div>
      )}

      {/* Keyboard Shortcuts Help */}
      {showKeyboardHelp && (
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Keyboard Shortcuts</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <kbd className="px-2.5 py-1 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 font-mono text-xs font-semibold">/</kbd>
              <span className="text-gray-600 dark:text-gray-400">Search documents</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 font-mono text-xs">⌘K</kbd>
              <span className="text-gray-600 dark:text-gray-400">Global navigation</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 font-mono text-xs">⌘R</kbd>
              <span className="text-gray-600 dark:text-gray-400">Refresh</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 font-mono text-xs">G</kbd>
              <span className="text-gray-600 dark:text-gray-400">Grid view</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 font-mono text-xs">L</kbd>
              <span className="text-gray-600 dark:text-gray-400">List view</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sidebar */}
        <div className="lg:col-span-3">
          <div className="sticky top-4 space-y-5">
            {/* User Access Level Card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-blue-900 dark:text-blue-200 mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Your Security Level
              </h3>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <dt className="text-blue-700 dark:text-blue-300 font-medium">Clearance:</dt>
                  <dd className="px-2.5 py-1 bg-white dark:bg-gray-800 rounded-md font-mono font-bold text-blue-900 dark:text-blue-200 text-xs border border-blue-200 dark:border-blue-700">
                    {session.user?.clearance || 'Not Set'}
                  </dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt className="text-blue-700 dark:text-blue-300 font-medium">Country:</dt>
                  <dd className="px-2.5 py-1 bg-white dark:bg-gray-800 rounded-md font-mono font-bold text-blue-900 dark:text-blue-200 text-xs border border-blue-200 dark:border-blue-700">
                    {session.user?.countryOfAffiliation || 'Not Set'}
                  </dd>
                </div>
                <div className="flex flex-col gap-2">
                  <dt className="text-blue-700 dark:text-blue-300 font-medium">Communities:</dt>
                  <dd className="flex flex-wrap gap-1">
                    {session.user?.acpCOI && session.user.acpCOI.length > 0 ? (
                      session.user.acpCOI.map(coi => (
                        <span key={coi} className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-md text-xs font-semibold border border-purple-200 dark:border-purple-700">
                          {coi}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-blue-600 dark:text-blue-400">None assigned</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Saved Filters */}
            <SavedFilters
              currentFilters={filters}
              onApplyFilter={(newFilters) => {
                setFilters(newFilters);
                const filtered = filterAndSortResources(resources, newFilters);
                setFilteredResources(filtered);
                setCurrentPage(1);
              }}
            />

            {/* Filter Resources */}
            <ResourceFilters
              userAttributes={{
                clearance: session.user?.clearance,
                country: session.user?.countryOfAffiliation,
                coi: session.user?.acpCOI,
              }}
              onFilterChange={handleFilterChange}
              totalCount={resources.length}
              filteredCount={filteredResources.length}
            />
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-9 space-y-5">
          {/* Toolbar */}
          {loading && resources.length === 0 ? (
            <ToolbarSkeleton />
          ) : (
            <div className="bg-white dark:bg-gray-800 shadow-sm border-2 border-gray-200 dark:border-gray-700 rounded-xl px-5 py-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1">
                  {/* Sort Dropdown */}
                  <div className="flex items-center gap-2">
                    <label htmlFor="sort-select" className="text-sm font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      Sort:
                    </label>
                    <select
                      id="sort-select"
                      value={`${filters.sortBy}-${filters.sortOrder}`}
                      onChange={(e) => {
                        const [sortBy, sortOrder] = e.target.value.split('-') as [any, any];
                        setFilters(prev => ({ ...prev, sortBy, sortOrder }));
                      }}
                      className="px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    >
                      <option value="title-asc">Title (A-Z)</option>
                      <option value="title-desc">Title (Z-A)</option>
                      <option value="createdAt-desc">Newest First</option>
                      <option value="createdAt-asc">Oldest First</option>
                      <option value="classification-desc">Highest Classification</option>
                      <option value="classification-asc">Lowest Classification</option>
                    </select>
                  </div>

                  {/* Results Count */}
                  <div className="hidden md:flex items-center gap-2 text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Showing</span>
                    <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200 rounded-lg font-bold">
                      {paginatedData.items.length}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400">of</span>
                    <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg font-bold">
                      {filteredResources.length}
                    </span>
                  </div>
                </div>

                {/* View Mode Switcher */}
                <ViewModeSwitcher
                  viewMode={viewMode}
                  onChange={handleViewModeChange}
                />
              </div>
            </div>
          )}

          {/* Document Grid/List with Skeleton Loading */}
          {loading && resources.length === 0 ? (
            <ResourceGridSkeleton viewMode={viewMode} count={6} />
          ) : paginatedData.items.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 shadow-md border-2 border-gray-200 dark:border-gray-700 rounded-2xl px-8 py-16 text-center">
              <div className="max-w-md mx-auto">
                <svg className="mx-auto h-16 w-16 text-gray-300 dark:text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">No Documents Found</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  No documents match your current filters. Try adjusting your search criteria or clearing some filters.
                </p>
                <button
                  onClick={() => {
                    setFilters({
                      search: '',
                      classifications: [],
                      countries: [],
                      cois: [],
                      fileTypes: [],
                      encryptionStatus: 'all',
                      sortBy: 'title',
                      sortOrder: 'asc',
                    });
                  }}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  Clear All Filters
                </button>
              </div>
            </div>
          ) : (
            <div className={getGridClasses()}>
              {paginatedData.items.map((resource) => (
                <AdvancedResourceCard
                  key={resource.resourceId}
                  resource={resource}
                  viewMode={viewMode}
                  userAttributes={{
                    clearance: session.user?.clearance,
                    country: session.user?.countryOfAffiliation,
                    coi: session.user?.acpCOI,
                  }}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {paginatedData.items.length > 0 && (
            <div className="mt-8">
              <Pagination
                currentPage={paginatedData.currentPage}
                totalPages={paginatedData.totalPages}
                totalItems={paginatedData.totalItems}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(newPerPage) => {
                  setItemsPerPage(newPerPage);
                  setCurrentPage(1);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
