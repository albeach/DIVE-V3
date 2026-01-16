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
import { useTranslation } from '@/hooks/useTranslation';
import { useLocale } from '@/contexts/LocaleContext';

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

import { SmartFederationSelector } from '@/components/ui/smart-federation-selector';

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

// Get current instance from environment (FRA, USA, GBR, DEU)
// This determines the default instance for local searches
const CURRENT_INSTANCE = process.env.NEXT_PUBLIC_INSTANCE || 'USA';

const CLASSIFICATION_OPTIONS = [
  { value: 'UNCLASSIFIED', label: 'Unclassified', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'RESTRICTED', label: 'Restricted', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'CONFIDENTIAL', label: 'Confidential', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'SECRET', label: 'Secret', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'TOP_SECRET', label: 'Top Secret', color: 'bg-red-100 text-red-800 border-red-300' },
];

// ============================================
// Component
// ============================================

// ============================================
// Federation IdP Type
// ============================================

interface IFederationIdP {
  alias: string;
  displayName: string;
  enabled: boolean;
  instanceCode?: string;
}

export default function ResourcesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useTranslation('resources');
  const { locale } = useLocale();

  // Federated instances - loaded from API
  const [federationInstances, setFederationInstances] = useState<string[]>([CURRENT_INSTANCE]);
  const [federationIdPs, setFederationIdPs] = useState<IFederationIdP[]>([]);
  const [isLoadingIdPs, setIsLoadingIdPs] = useState(true);

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
    facets: apiFacets,
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
    // Only request facets from API for local search (federated search endpoint doesn't support facets)
    includeFacets: !federatedMode,
    federated: federatedMode,
    autoLoad: true,
    // KEY FIX: Only enable fetching when session is authenticated
    enabled: isSessionReady,
  });

  // Use API-provided facets when available (local search), otherwise calculate from loaded resources (federated search)
  const facets = useMemo(() => {
    // For local search, use API-provided facets which are accurate for all matching documents
    if (!federatedMode && apiFacets) {
      return apiFacets;
    }

    // For federated search or when API facets aren't available, calculate from currently loaded resources
    const facetCounts = {
      classifications: {} as Record<string, number>,
      countries: {} as Record<string, number>,
      cois: {} as Record<string, number>,
      encryptionStatus: {} as Record<string, number>,
      instances: {} as Record<string, number>,
    };

    // Count facets from currently loaded resources (these are already filtered by API)
    resources.forEach(resource => {
      // Classification facet
      if (resource.classification) {
        facetCounts.classifications[resource.classification] =
          (facetCounts.classifications[resource.classification] || 0) + 1;
      }

      // Releasable To facet (countries)
      if (resource.releasabilityTo && Array.isArray(resource.releasabilityTo)) {
        resource.releasabilityTo.forEach(country => {
          facetCounts.countries[country] = (facetCounts.countries[country] || 0) + 1;
        });
      }

      // Communities of Interest facet
      if (resource.COI && Array.isArray(resource.COI)) {
        resource.COI.forEach(coi => {
          facetCounts.cois[coi] = (facetCounts.cois[coi] || 0) + 1;
        });
      }

      // Encryption status facet
      const encryptionStatus = resource.encrypted ? 'encrypted' : 'unencrypted';
      facetCounts.encryptionStatus[encryptionStatus] =
        (facetCounts.encryptionStatus[encryptionStatus] || 0) + 1;

      // Instance facet (from originRealm or source instance)
      const instance = resource.originRealm || (resource as any).sourceInstance;
      if (instance) {
        facetCounts.instances[instance] = (facetCounts.instances[instance] || 0) + 1;
      }
    });

    // Convert to the expected facet format
    // For federated search, mark as approximate since we only have counts from loaded results
    const approximate = federatedMode;
    return {
      classifications: Object.entries(facetCounts.classifications).map(([value, count]) => ({ value, count, approximate })),
      countries: Object.entries(facetCounts.countries).map(([value, count]) => ({ value, count, approximate })),
      cois: Object.entries(facetCounts.cois).map(([value, count]) => ({ value, count, approximate })),
      encryptionStatus: Object.entries(facetCounts.encryptionStatus).map(([value, count]) => ({ value, count, approximate })),
      instances: Object.entries(facetCounts.instances).map(([value, count]) => ({ value, count, approximate })),
    };
  }, [federatedMode, apiFacets, resources]);

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

  // Load Federation IdPs from API (with online status check)
  useEffect(() => {
    async function loadFederationIdPs() {
      setIsLoadingIdPs(true);
      try {
        // Step 1: Get list of configured IdPs
        const idpsResponse = await fetch('/api/idps/public');
        if (!idpsResponse.ok) {
          console.warn('[Resources] Failed to load IdPs, using fallback');
          setFederationInstances([CURRENT_INSTANCE]);
          setIsLoadingIdPs(false);
          return;
        }

        const idpsData = await idpsResponse.json();
        const idpList: IFederationIdP[] = Array.isArray(idpsData) ? idpsData : (idpsData.idps || idpsData.data || []);
        const enabledIdPs = idpList.filter((idp: IFederationIdP) => idp.enabled);
        setFederationIdPs(enabledIdPs);

        // Extract instance codes from aliases
        const allCodes = enabledIdPs
          .map((idp: IFederationIdP) => {
            if (idp.instanceCode) return idp.instanceCode.toUpperCase();
            const match = idp.alias?.match(/^([a-z]{2,3})-idp$/i);
            return match ? match[1].toUpperCase() : null;
          })
          .filter((code): code is string => code !== null);

        // Step 2: Always show all configured IdPs (health checks can timeout)
        // The backend will handle unavailable instances gracefully during actual federated search
        const uniqueCodes = Array.from(new Set([CURRENT_INSTANCE, ...allCodes]));
        setFederationInstances(uniqueCodes);

        console.log('[Resources] Loaded federation IdPs:', {
          total: uniqueCodes.length,
          instances: uniqueCodes
        });

      } catch (error) {
        console.error('[Resources] Error loading federation IdPs:', error);
        setFederationInstances([CURRENT_INSTANCE]);
      } finally {
        setIsLoadingIdPs(false);
      }
    }
    loadFederationIdPs();
  }, []);

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

    // When enabling federated mode, auto-include user's home country
    // This ensures a HUN user sees HUN resources when federated mode is activated
    let instancesToUse = selectedInstances;
    if (newMode && session?.user?.countryOfAffiliation) {
      const userCountry = session.user.countryOfAffiliation;
      if (!selectedInstances.includes(userCountry)) {
        instancesToUse = [...selectedInstances, userCountry];
        setSelectedInstances(instancesToUse);
      }
    }

    setFilters({ ...filters, instances: newMode ? instancesToUse : undefined });
  }, [federatedMode, selectedInstances, filters, setFilters, session?.user?.countryOfAffiliation]);

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

  const handleFederationInstancesChange = useCallback((newInstances: string[]) => {
    setSelectedInstances(newInstances);
    // Also update selectedFilters to keep UI state in sync
    setSelectedFilters(prev => ({
      ...prev,
      instances: newInstances
    }));
    if (federatedMode) {
      setFilters({ ...filters, instances: newInstances.length > 0 ? newInstances : undefined });
      // KEY FIX: Refresh data when federation instances change to recalculate facets
      refresh();
    }
  }, [federatedMode, filters, setFilters, refresh]);

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
      RESTRICTED: facets?.classifications?.find(c => c.value === 'RESTRICTED')?.count || 0,
      CONFIDENTIAL: facets?.classifications?.find(c => c.value === 'CONFIDENTIAL')?.count || 0,
      SECRET: facets?.classifications?.find(c => c.value === 'SECRET')?.count || 0,
      TOP_SECRET: facets?.classifications?.find(c => c.value === 'TOP_SECRET')?.count || 0,
    };
    return breakdown;
  }, [facets]);

  // Calculate average document age from loaded resources
  const averageDocAge = useMemo(() => {
    if (resources.length === 0) return undefined;

    const now = new Date();
    const ages = resources
      .filter(r => r.creationDate)
      .map(r => (now.getTime() - new Date(r.creationDate!).getTime()) / (1000 * 60 * 60 * 24));

    if (ages.length === 0) return undefined;
    return ages.reduce((sum, age) => sum + age, 0) / ages.length;
  }, [resources]);

  // Calculate access rate (percentage of documents user can access)
  // For federated search, this is approximate based on loaded documents
  // For local search, this could be more accurate if we had total counts
  const accessRate = useMemo(() => {
    if (totalCount === 0) return undefined;

    // In federated mode, we show what percentage of loaded docs user can access
    // In local mode, resources array represents accessible documents
    if (federatedMode) {
      // This is approximate since we don't know total inaccessible docs
      const accessibleLoaded = resources.length;
      const estimatedTotal = totalCount;
      return estimatedTotal > 0 ? (accessibleLoaded / estimatedTotal) * 100 : undefined;
    } else {
      // For local search, assume all returned documents are accessible
      return totalCount > 0 ? 100 : undefined;
    }
  }, [resources.length, totalCount, federatedMode]);

  // Calculate top COIs from facets
  const topCOIs = useMemo(() => {
    return facets?.cois
      ?.sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(coi => ({ tag: coi.value, count: coi.count })) || [];
  }, [facets]);

  // Calculate releasability statistics (NATO, FVEY, restricted access)
  const releasabilityStats = useMemo(() => {
    const natoCount = facets?.countries?.find(c => c.value === 'NATO')?.count || 0;
    const fveyCount = facets?.countries?.find(c => c.value === 'FVEY')?.count || 0;
    // Restricted could be documents that are only releasable to specific countries
    // This is approximate - could be enhanced with more detailed analysis
    const restrictedCount = totalCount - natoCount - fveyCount;

    return {
      natoCount,
      fveyCount,
      restrictedCount: Math.max(0, restrictedCount)
    };
  }, [facets, totalCount]);

  // Track data freshness (when data was last loaded)
  const [dataFreshness, setDataFreshness] = useState<Date | undefined>();

  // Update data freshness when resources are loaded
  useEffect(() => {
    if (resources.length > 0 && !isLoading) {
      setDataFreshness(new Date());
    }
  }, [resources.length, isLoading]);

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
      <div className="mb-5">
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
      </div>

      {/* Toolbar: Federation + Actions - Modern 2025 Design */}
      <div className="flex items-center justify-between gap-4 mb-6">
        {/* Federation Mode Selector - Highly visible segmented control */}
        <div className="flex items-center gap-4">
          {/* Mode Toggle - Segmented Control Style */}
          <div className="inline-flex items-center p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
            <button
              onClick={() => !federatedMode || handleFederatedModeToggle()}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                !federatedMode
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Server className="w-4 h-4" />
              <span>Local</span>
              {!federatedMode && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              )}
            </button>
            <button
              onClick={() => federatedMode || handleFederatedModeToggle()}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                federatedMode
                  ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Globe2 className="w-4 h-4" />
              <span>Federated</span>
              {federatedMode && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />

          {/* Smart Federation Instance Selector - 2025 Modern UX */}
          {isLoadingIdPs ? (
            <div className="flex items-center gap-1.5">
              <div className="w-16 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              <div className="w-16 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              <div className="w-16 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
            </div>
          ) : (
            <SmartFederationSelector
              instances={federationInstances}
              selectedInstances={selectedInstances}
              onSelectionChange={handleFederationInstancesChange}
              disabled={!federatedMode}
              maxPrimaryChips={federationInstances.length <= 6 ? federationInstances.length : 4}
              showCounts={true}
              instanceCounts={facets?.instances?.reduce((acc, instance) => ({
                ...acc,
                [instance.value]: instance.count
              }), {}) || {}}
              userCountry={session.user?.countryOfAffiliation}
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <BookmarksTrigger onClick={() => setShowBookmarks(true)} />
          <button
            onClick={() => refresh()}
            disabled={isLoading}
            className="p-2.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Refresh"
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
          // Enhanced metrics
          averageDocAge={averageDocAge}
          accessRate={accessRate}
          topCOIs={topCOIs}
          releasabilityStats={releasabilityStats}
          dataFreshness={dataFreshness}
        />
      )}

      {/* Error State */}
      {error && !isLoading && <ErrorState message={error} onRetry={refresh} />}

      {/* Main Layout with Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Desktop Filters Sidebar */}
        <div className="hidden lg:block lg:col-span-3">
          <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-hidden">
            <FacetedFilters
              facets={{
                classifications: CLASSIFICATION_OPTIONS.map(o => ({
                  value: o.value,
                  label: o.label,
                  count: facets?.classifications?.find(c => c.value === o.value)?.count || 0
                })),
                countries: facets?.countries?.map(c => ({ value: c.value, label: c.value, count: c.count })) || [],
                cois: facets?.cois?.map(c => ({ value: c.value, label: c.value, count: c.count })) || [],
                // Removed instances from sidebar - handled by horizontal selector above
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
              hasApproximateCounts={
                facets?.classifications?.some(f => f.approximate) ||
                facets?.countries?.some(f => f.approximate) ||
                facets?.cois?.some(f => f.approximate) ||
                facets?.encryptionStatus?.some(f => f.approximate)
              }
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
          // Removed instances from sidebar - handled by horizontal selector above
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
