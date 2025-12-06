/**
 * Resources Page - Clean Layout
 * 
 * Simplified layout with:
 * - Command palette search (press "/" to open)
 * - Horizontal filter pills (modern design)
 * - Bento dashboard in main content area
 * - Normalized card layout with compact IDs
 */

'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import PageLayout from '@/components/layout/page-layout';

import {
  VirtualResourceList,
  CommandPaletteSearch,
  FacetedFilters,
  MobileFilterDrawer,
  ResourcePreviewModal,
  ResourcesPageSkeleton,
  ViewModeSwitcher,
  BulkActionsToolbar,
  ResourceComparisonView,
  BookmarksPanel,
  BookmarksTrigger,
  BentoDashboard,
  BentoDashboardSkeleton,
  EmptySearchResults,
  EmptyFilterResults,
  ErrorState,
  MobileResourceDrawer,
} from '@/components/resources';

import type { IResourceCardData, ViewMode } from '@/components/resources/advanced-resource-card';

import { 
  useInfiniteScroll, 
  useKeyboardNavigation,
  useBookmarks,
} from '@/hooks';

import { Globe2, Server, RefreshCw, X, Filter } from 'lucide-react';

// ============================================
// Types
// ============================================

interface ISelectedFilters {
  classifications: string[];
  countries: string[];
  cois: string[];
  instances: string[];
  encryptionStatus: string;
  dateRange?: { start: string; end: string };
}

// ============================================
// Constants
// ============================================

const VIEW_MODE_KEY = 'dive_resources_view_mode_v2';
const FEDERATED_MODE_KEY = 'dive_resources_federated_mode';
const FEDERATION_INSTANCES = ['USA', 'FRA', 'GBR', 'DEU'] as const;

// Get current instance from environment (FRA, USA, GBR, DEU)
// This determines the default instance for local searches
const CURRENT_INSTANCE = process.env.NEXT_PUBLIC_INSTANCE || 'USA';

const CLASSIFICATION_OPTIONS = [
  { value: 'UNCLASSIFIED', label: 'Unclassified', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'CONFIDENTIAL', label: 'Confidential', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'SECRET', label: 'Secret', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'TOP_SECRET', label: 'Top Secret', color: 'bg-red-100 text-red-800 border-red-300' },
];

// ============================================
// Component
// ============================================

export default function ResourcesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // State
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [federatedMode, setFederatedMode] = useState(false);
  const [selectedInstances, setSelectedInstances] = useState<string[]>([CURRENT_INSTANCE]);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [previewResource, setPreviewResource] = useState<IResourceCardData | null>(null);
  const [previewIndex, setPreviewIndex] = useState(-1);
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonResources, setComparisonResources] = useState<IResourceCardData[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [mobileDrawerResource, setMobileDrawerResource] = useState<IResourceCardData | null>(null);
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);
  
  const { bookmarks, isItemBookmarked, toggle: toggleBookmark } = useBookmarks();
  
  const [selectedFilters, setSelectedFilters] = useState<ISelectedFilters>({
    classifications: [],
    countries: [],
    cois: [],
    instances: [CURRENT_INSTANCE],
    encryptionStatus: '',
  });

  // Infinite Scroll - only enabled when session is authenticated
  const isSessionReady = status === 'authenticated';
  
  const {
    items: resources,
    facets,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    totalCount,
    filters,
    sort,
    loadMore,
    refresh,
    setFilters,
    setSort,
    sentinelRef,
    timing,
  } = useInfiniteScroll<IResourceCardData>({
    initialFilters: {
      instances: federatedMode ? selectedInstances : undefined,
    },
    initialSort: { field: 'title', order: 'asc' },
    pageSize: 50,
    includeFacets: true,
    federated: federatedMode,
    autoLoad: true,
    // KEY FIX: Only enable fetching when session is authenticated
    enabled: isSessionReady,
  });

  // Keyboard Navigation
  const [navState, navActions] = useKeyboardNavigation({
    items: resources,
    getItemKey: (r) => r.resourceId,
    onSelect: (resource) => router.push(`/resources/${resource.resourceId}`),
    onPreview: (resource) => {
      const index = resources.findIndex(r => r.resourceId === resource.resourceId);
      setPreviewResource(resource);
      setPreviewIndex(index);
    },
    enableMultiSelect: true,
    enableVimNavigation: true,
  });

  // Load Preferences
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
    } catch (e) {}
  }, []);

  // Keyboard shortcut: 'B' for Bookmarks
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        setShowBookmarks(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handlers
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch (e) {}
  }, []);

  const handleFederatedModeToggle = useCallback(() => {
    const newMode = !federatedMode;
    setFederatedMode(newMode);
    try { localStorage.setItem(FEDERATED_MODE_KEY, String(newMode)); } catch (e) {}
    setFilters({ ...filters, instances: newMode ? selectedInstances : undefined });
  }, [federatedMode, selectedInstances, filters, setFilters]);

  const handleInstanceToggle = useCallback((instance: string) => {
    setSelectedInstances(prev => {
      const newInstances = prev.includes(instance)
        ? prev.filter(i => i !== instance)
        : [...prev, instance];
      if (newInstances.length === 0) return prev;
      if (federatedMode) setFilters({ ...filters, instances: newInstances });
      return newInstances;
    });
  }, [federatedMode, filters, setFilters]);

  const handleFilterChange = useCallback((newFilters: ISelectedFilters) => {
    setSelectedFilters(newFilters);
    setFilters({
      query: filters.query,
      classifications: newFilters.classifications.length > 0 ? newFilters.classifications : undefined,
      countries: newFilters.countries.length > 0 ? newFilters.countries : undefined,
      cois: newFilters.cois.length > 0 ? newFilters.cois : undefined,
      instances: federatedMode ? newFilters.instances : undefined,
      encrypted: newFilters.encryptionStatus === 'encrypted' ? true : 
                 newFilters.encryptionStatus === 'unencrypted' ? false : undefined,
      dateRange: newFilters.dateRange,
    });
  }, [federatedMode, filters.query, setFilters]);

  const handleSearch = useCallback((query: string) => {
    setFilters({ ...filters, query: query || undefined });
  }, [filters, setFilters]);

  const handleSortChange = useCallback((value: string) => {
    const [field, order] = value.split('-') as ['title' | 'classification' | 'creationDate' | 'resourceId', 'asc' | 'desc'];
    setSort({ field, order });
  }, [setSort]);

  const handlePreviewNavigate = useCallback((direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev' 
      ? Math.max(0, previewIndex - 1)
      : Math.min(resources.length - 1, previewIndex + 1);
    setPreviewIndex(newIndex);
    setPreviewResource(resources[newIndex]);
  }, [previewIndex, resources]);

  const handleClassificationToggle = useCallback((value: string) => {
    const newClassifications = selectedFilters.classifications.includes(value)
      ? selectedFilters.classifications.filter(c => c !== value)
      : [...selectedFilters.classifications, value];
    handleFilterChange({ ...selectedFilters, classifications: newClassifications });
  }, [selectedFilters, handleFilterChange]);

  const clearAllFilters = useCallback(() => {
    handleFilterChange({
      classifications: [],
      countries: [],
      cois: [],
      instances: [CURRENT_INSTANCE],
      encryptionStatus: '',
    });
  }, [handleFilterChange]);

  // Derived state
  const selectedResourcesForBulk = useMemo(() => 
    resources.filter(r => navState.selectedKeys.has(r.resourceId)), 
    [resources, navState.selectedKeys]
  );

  const activeFilterCount = useMemo(() => (
    selectedFilters.classifications.length +
    selectedFilters.countries.length +
    selectedFilters.cois.length +
    (selectedFilters.encryptionStatus ? 1 : 0)
  ), [selectedFilters]);

  // Compute classification breakdown from facets (all filtered results)
  // This ensures the Bento box reflects the current filter state accurately
  // Using facets instead of resources array because resources only contains paginated results
  const classificationBreakdown = useMemo(() => {
    const breakdown = {
      UNCLASSIFIED: facets?.classifications?.find(c => c.value === 'UNCLASSIFIED')?.count || 0,
      CONFIDENTIAL: facets?.classifications?.find(c => c.value === 'CONFIDENTIAL')?.count || 0,
      SECRET: facets?.classifications?.find(c => c.value === 'SECRET')?.count || 0,
      TOP_SECRET: facets?.classifications?.find(c => c.value === 'TOP_SECRET')?.count || 0,
    };
    return breakdown;
  }, [facets]);

  if (status === 'loading') {
    return <div className="min-h-screen bg-gray-50 dark:bg-gray-900"><ResourcesPageSkeleton /></div>;
  }

  if (!session) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <h2 className="text-xl font-semibold">Sign in to view resources</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            You need to be authenticated to access coalition resources.
          </p>
          <button
            data-testid="sign-in-button"
            onClick={() => signIn('keycloak', { callbackUrl: '/resources' })}
            className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            Sign In
          </button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      user={session.user}
      breadcrumbs={[{ label: 'Documents', href: null }]}
    >
      {/* Command Palette Search - Opens with "/" */}
      <CommandPaletteSearch
        resources={resources}
        onSearch={handleSearch}
        onFilterApply={(filter) => {
          if (filter.type === 'classification') {
            handleFilterChange({ ...selectedFilters, classifications: [filter.value] });
          } else if (filter.type === 'country') {
            handleFilterChange({ ...selectedFilters, countries: [filter.value] });
          } else if (filter.type === 'encrypted') {
            handleFilterChange({ ...selectedFilters, encryptionStatus: 'encrypted' });
          }
        }}
        onResourceSelect={(resourceId) => router.push(`/resources/${resourceId}`)}
        userClearance={session.user?.clearance}
        userCountry={session.user?.countryOfAffiliation}
      />

      {/* Toolbar: Federation + Actions */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          {/* Federation Toggle */}
          <button
            onClick={handleFederatedModeToggle}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              federatedMode 
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' 
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            {federatedMode ? <Globe2 className="w-4 h-4" /> : <Server className="w-4 h-4" />}
            {federatedMode ? 'Federated' : 'Local'}
          </button>

          {/* Instance Pills */}
          <div className="flex items-center gap-1">
            {FEDERATION_INSTANCES.map((instance) => {
              const isSelected = selectedInstances.includes(instance);
              return (
                <button
                  key={instance}
                  onClick={() => handleInstanceToggle(instance)}
                  disabled={!federatedMode && instance !== CURRENT_INSTANCE}
                  className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : federatedMode
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200'
                        : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                  }`}
                >
                  {instance}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <BookmarksTrigger onClick={() => setShowBookmarks(true)} />
          <button
            onClick={() => refresh()}
            disabled={isLoading}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Bento Dashboard - Now in main content */}
      {isLoading && resources.length === 0 ? (
        <BentoDashboardSkeleton />
      ) : (
        <BentoDashboard
          totalDocuments={totalCount}
          encryptedCount={resources.filter(r => r.encrypted).length}
          classificationBreakdown={classificationBreakdown}
          activeInstances={federatedMode ? selectedInstances : [CURRENT_INSTANCE]}
          federatedMode={federatedMode}
          timing={timing || undefined}
          userAttributes={{
            clearance: session.user?.clearance,
            country: session.user?.countryOfAffiliation,
            coi: session.user?.acpCOI,
          }}
          bookmarkCount={bookmarks.length}
          isLoading={isLoading}
        />
      )}

      {/* Error State */}
      {error && !isLoading && <ErrorState message={error} onRetry={refresh} />}

      {/* Main Layout with Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Desktop Filters Sidebar */}
        <div className="hidden lg:block lg:col-span-3">
          <div className="sticky top-4">
            <FacetedFilters
              facets={{
                classifications: CLASSIFICATION_OPTIONS.map(o => ({ 
                  value: o.value, 
                  label: o.label, 
                  count: facets?.classifications?.find(c => c.value === o.value)?.count || 0 
                })),
                countries: facets?.countries?.map(c => ({ value: c.value, label: c.value, count: c.count })) || [],
                cois: facets?.cois?.map(c => ({ value: c.value, label: c.value, count: c.count })) || [],
                instances: FEDERATION_INSTANCES.map(i => ({ 
                  value: i, 
                  label: i, 
                  count: facets?.instances?.find(f => f.value === i)?.count || 0 
                })),
                encryptionStatus: facets?.encryptionStatus?.map(e => ({
                  value: e.value,
                  label: e.value === 'encrypted' ? 'Encrypted (ZTDF)' : 'Unencrypted',
                  count: e.count,
                })) || [
                  { value: 'encrypted', label: 'Encrypted (ZTDF)', count: 0 },
                  { value: 'unencrypted', label: 'Unencrypted', count: 0 },
                ],
              }}
              selectedFilters={selectedFilters}
              onFilterChange={handleFilterChange}
              isLoading={isLoading}
              totalCount={totalCount}
              filteredCount={resources.length}
              userAttributes={{
                clearance: session.user?.clearance,
                country: session.user?.countryOfAffiliation,
                coi: session.user?.acpCOI,
              }}
            />
          </div>
        </div>

        {/* Mobile Filter Button */}
        <div className="lg:hidden mb-4">
          <button
            onClick={() => setShowMobileFilters(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full">{activeFilterCount}</span>
            )}
          </button>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-9 space-y-4">
          {/* Quick Classification Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {CLASSIFICATION_OPTIONS.map((opt) => {
              const isSelected = selectedFilters.classifications.includes(opt.value);
              const count = facets?.classifications?.find(c => c.value === opt.value)?.count || 0;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleClassificationToggle(opt.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    isSelected
                      ? opt.color + ' border-current shadow-sm'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400'
                  }`}
                >
                  {opt.label}
                  <span className={`${isSelected ? 'opacity-80' : 'text-gray-400'}`}>
                    {count.toLocaleString()}
                  </span>
                </button>
              );
            })}
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700"
              >
                <X className="w-3 h-3" />
                Clear all
              </button>
            )}
          </div>

          {/* Results Toolbar */}
          <div className="flex items-center justify-between gap-4 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
              <span>
                <strong className="text-gray-900 dark:text-white">{resources.length}</strong> of{' '}
                <strong className="text-gray-900 dark:text-white">{totalCount.toLocaleString()}</strong>
              </span>
              <select
                value={`${sort.field}-${sort.order}`}
                onChange={(e) => handleSortChange(e.target.value)}
                className="px-2 py-1 text-xs bg-transparent border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="title-asc">Title A-Z</option>
                <option value="title-desc">Title Z-A</option>
                <option value="creationDate-desc">Newest</option>
                <option value="creationDate-asc">Oldest</option>
              </select>
            </div>
            <ViewModeSwitcher viewMode={viewMode} onChange={handleViewModeChange} />
          </div>

          {/* Resource List */}
          {!isLoading && !error && resources.length === 0 && filters.query ? (
            <EmptySearchResults query={filters.query} onClearSearch={() => handleSearch('')} />
          ) : !isLoading && !error && resources.length === 0 && activeFilterCount > 0 ? (
            <EmptyFilterResults onClearFilters={clearAllFilters} />
          ) : (
            <VirtualResourceList
              resources={resources}
              viewMode={viewMode}
              userAttributes={{
                clearance: session.user?.clearance,
                country: session.user?.countryOfAffiliation,
                coi: session.user?.acpCOI,
              }}
              isLoading={isLoading}
              isLoadingMore={isLoadingMore}
              error={error}
              hasMore={hasMore}
              onLoadMore={loadMore}
              focusedIndex={navState.focusedIndex}
              selectedIds={navState.selectedKeys}
              onItemClick={(resource, index) => {
                navActions.focusIndex(index);
                if (window.innerWidth < 768) {
                  setMobileDrawerResource(resource);
                  setShowMobileDrawer(true);
                }
              }}
              onItemSelect={() => navActions.toggleSelection()}
              onItemPreview={(resource, index) => {
                setPreviewResource(resource);
                setPreviewIndex(index);
              }}
            />
          )}

          <div ref={sentinelRef} className="h-4" />
        </div>
      </div>

      {/* Modals & Panels */}
      <MobileFilterDrawer
        isOpen={showMobileFilters}
        onClose={() => setShowMobileFilters(false)}
        facets={{
          classifications: CLASSIFICATION_OPTIONS.map(o => ({ 
            value: o.value, label: o.label, count: facets?.classifications?.find(c => c.value === o.value)?.count || 0 
          })),
          countries: facets?.countries?.map(c => ({ value: c.value, label: c.value, count: c.count })) || [],
          cois: facets?.cois?.map(c => ({ value: c.value, label: c.value, count: c.count })) || [],
          instances: FEDERATION_INSTANCES.map(i => ({ 
            value: i, 
            label: i, 
            count: facets?.instances?.find(f => f.value === i)?.count || 0 
          })),
          encryptionStatus: facets?.encryptionStatus?.map(e => ({
            value: e.value,
            label: e.value === 'encrypted' ? 'Encrypted' : 'Unencrypted',
            count: e.count,
          })) || [
            { value: 'encrypted', label: 'Encrypted', count: 0 },
            { value: 'unencrypted', label: 'Unencrypted', count: 0 },
          ],
        }}
        selectedFilters={selectedFilters}
        onFilterChange={handleFilterChange}
        isLoading={isLoading}
        totalCount={totalCount}
        filteredCount={resources.length}
        userAttributes={{
          clearance: session.user?.clearance,
          country: session.user?.countryOfAffiliation,
          coi: session.user?.acpCOI,
        }}
      />

      <ResourcePreviewModal
        resource={previewResource}
        isOpen={!!previewResource}
        onClose={() => { setPreviewResource(null); setPreviewIndex(-1); }}
        onNavigate={handlePreviewNavigate}
        hasPrev={previewIndex > 0}
        hasNext={previewIndex < resources.length - 1}
        userAttributes={{
          clearance: session.user?.clearance,
          country: session.user?.countryOfAffiliation,
          coi: session.user?.acpCOI,
        }}
      />

      <BulkActionsToolbar
        selectedResources={selectedResourcesForBulk}
        totalResources={resources.length}
        onClearSelection={navActions.clearSelection}
        onSelectAll={navActions.selectAll}
        onCompare={(items) => { setComparisonResources(items); setShowComparison(true); }}
        allSelected={navState.selectedKeys.size === resources.length && resources.length > 0}
      />

      <ResourceComparisonView
        resources={comparisonResources}
        isOpen={showComparison}
        onClose={() => { setShowComparison(false); setComparisonResources([]); }}
        userAttributes={{
          clearance: session.user?.clearance,
          country: session.user?.countryOfAffiliation,
          coi: session.user?.acpCOI,
        }}
      />

      <BookmarksPanel isOpen={showBookmarks} onClose={() => setShowBookmarks(false)} />

      <MobileResourceDrawer
        resource={mobileDrawerResource}
        isOpen={showMobileDrawer}
        onClose={() => { setShowMobileDrawer(false); setMobileDrawerResource(null); }}
        onOpen={() => setShowMobileDrawer(true)}
        onBookmark={() => {
          if (mobileDrawerResource) {
            toggleBookmark({
              id: mobileDrawerResource.resourceId,
              title: mobileDrawerResource.title,
              type: 'document',
              classification: mobileDrawerResource.classification,
            });
          }
        }}
        isBookmarked={mobileDrawerResource ? isItemBookmarked(mobileDrawerResource.resourceId, 'document') : false}
        userAttributes={{
          clearance: session.user?.clearance,
          country: session.user?.countryOfAffiliation,
        }}
      />
    </PageLayout>
  );
}
