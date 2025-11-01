'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import PageLayout from '@/components/layout/page-layout';
import ResourceFilters, { ResourceFiltersState } from '@/components/resources/resource-filters';
import Pagination from '@/components/resources/pagination';
import AdvancedResourceCard, { ViewMode, ResourceCardSkeleton, IResourceCardData } from '@/components/resources/advanced-resource-card';
import ViewModeSwitcher from '@/components/resources/view-mode-switcher';
import AdvancedSearch from '@/components/resources/advanced-search';
import CategoryBrowser from '@/components/resources/category-browser';
import SavedFilters from '@/components/resources/saved-filters';

// ViewMode and IResourceCardData now imported from advanced-resource-card

const VIEW_MODE_KEY = 'dive_resources_view_mode';

// Clearance hierarchy for filtering
const CLEARANCE_ORDER: Record<string, number> = {
  'UNCLASSIFIED': 0,
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

  // View mode with localStorage persistence
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  
  // Filter state (lifted from child component for sort dropdown)
  const [filters, setFilters] = useState<ResourceFiltersState>({
    search: '',
    classifications: [],
    countries: [],
    cois: [],
    encryptionStatus: 'all',
    sortBy: 'title',
    sortOrder: 'asc',
  });

  // UI state
  const [showCategoryBrowser, setShowCategoryBrowser] = useState(false);

  // Load view mode from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_MODE_KEY);
      if (stored && ['grid', 'list', 'compact'].includes(stored)) {
        setViewMode(stored as ViewMode);
      }
    } catch (error) {
      console.error('Failed to load view mode:', error);
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

  // Redirect to login if not authenticated (separate effect to avoid render-phase updates)
  useEffect(() => {
    if (status !== 'loading' && !session) {
      router.push('/login');
    }
  }, [status, session, router]);

  // Fetch resources
  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      return;
    }

    async function fetchResources() {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';
      
      try {
        const response = await fetch(`${backendUrl}/api/resources`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch resources');
        }

        const data = await response.json();
        const fetchedResources = data.resources || [];
        setResources(fetchedResources);
        setFilteredResources(fetchedResources);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load resources');
        console.error('Error fetching resources:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchResources();
  }, [session, status, router]);

  // Handle filter changes - wrapped in useCallback to prevent infinite loops
  const handleFilterChange = useCallback((newFilters: ResourceFiltersState) => {
    setFilters(newFilters);
    const filtered = filterAndSortResources(resources, newFilters);
    setFilteredResources(filtered);
    setCurrentPage(1); // Reset to page 1 when filters change
  }, [resources]); // Only recreate when resources change

  // Re-filter when sort changes from dropdown (local state change)
  useEffect(() => {
    const filtered = filterAndSortResources(resources, filters);
    setFilteredResources(filtered);
  }, [filters.sortBy, filters.sortOrder, resources, filters]);

  // Handle category click from browser
  const handleCategoryClick = (category: string, value: string) => {
    if (category === 'classification') {
      setFilters(prev => ({
        ...prev,
        classifications: [value]
      }));
    } else if (category === 'country') {
      setFilters(prev => ({
        ...prev,
        countries: [value]
      }));
    } else if (category === 'coi') {
      setFilters(prev => ({
        ...prev,
        cois: [value]
      }));
    } else if (category === 'encryption') {
      setFilters(prev => ({
        ...prev,
        encryptionStatus: value.toLowerCase() === 'encrypted' ? 'encrypted' : 'unencrypted'
      }));
    }
    setShowCategoryBrowser(false);
  };

  // Handle pagination
  const paginatedData = paginateResources(filteredResources, currentPage, itemsPerPage);

  // Get grid classes based on view mode
  const getGridClasses = () => {
    switch (viewMode) {
      case 'grid':
        return 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4';
      case 'list':
        return 'space-y-3';
      case 'compact':
        return 'space-y-2';
      default:
        return 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4';
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto"></div>
          <p className="mt-6 text-lg font-semibold text-gray-700">Loading classified documents...</p>
          <p className="mt-2 text-sm text-gray-500">Verifying security clearance</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <PageLayout 
      user={session.user}
      breadcrumbs={[
        { label: 'Classified Documents', href: null }
      ]}
    >
      {/* Modern Header with Gradient */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 mb-3">
              Classified Documents
            </h1>
            <p className="text-lg text-gray-600 max-w-3xl">
              Browse, search, and access classified documents based on your clearance level, 
              country affiliation, and communities of interest.
            </p>
          </div>
          <button
            onClick={() => setShowCategoryBrowser(!showCategoryBrowser)}
            className={`flex-shrink-0 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm ${
              showCategoryBrowser
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-blue-300 hover:text-blue-600'
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

        {/* Compliance Badges */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold shadow-sm">
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            ACP-240 Compliant
          </span>
          <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white border-2 border-gray-200 text-gray-700 text-sm font-semibold">
            NATO STANAG 4774
          </span>
          <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white border-2 border-gray-200 text-gray-700 text-sm font-semibold">
            🔐 ZTDF Encrypted
          </span>
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs font-bold">
            {resources.length} Documents
          </span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-5 mb-8 flex items-start gap-3">
          <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-red-900 mb-1">Error Loading Documents</h3>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Advanced Search Bar (Full Width) */}
      <div className="mb-6">
        <AdvancedSearch
          resources={resources}
          value={filters.search}
          onChange={(value) => setFilters(prev => ({ ...prev, search: value }))}
        />
      </div>

      {/* Category Browser (Collapsible) */}
      {showCategoryBrowser && (
        <div className="mb-6 animate-in slide-in-from-top duration-300">
          <CategoryBrowser
            resources={resources}
            onCategoryClick={handleCategoryClick}
          />
        </div>
      )}

      {/* Three-Column Layout: Sidebar + Main + Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sidebar: User Info, Filters, Saved Filters */}
        <div className="lg:col-span-3">
          <div className="sticky top-4 space-y-5">
            {/* User Access Level Card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-blue-900 mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Your Security Level
              </h3>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <dt className="text-blue-700 font-medium">Clearance:</dt>
                  <dd className="px-2.5 py-1 bg-white rounded-md font-mono font-bold text-blue-900 text-xs border border-blue-200">
                    {session.user?.clearance || 'Not Set'}
                  </dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt className="text-blue-700 font-medium">Country:</dt>
                  <dd className="px-2.5 py-1 bg-white rounded-md font-mono font-bold text-blue-900 text-xs border border-blue-200">
                    {session.user?.countryOfAffiliation || 'Not Set'}
                  </dd>
                </div>
                <div className="flex flex-col gap-2">
                  <dt className="text-blue-700 font-medium">Communities:</dt>
                  <dd className="flex flex-wrap gap-1">
                    {session.user?.acpCOI && session.user.acpCOI.length > 0 ? (
                      session.user.acpCOI.map(coi => (
                        <span key={coi} className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-md text-xs font-semibold border border-purple-200">
                          {coi}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-blue-600">None assigned</span>
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

        {/* Main Content: Document Grid/List */}
        <div className="lg:col-span-9 space-y-5">
          {/* Toolbar: Sort + View Mode + Results Count */}
          <div className="bg-white shadow-sm border-2 border-gray-200 rounded-xl px-5 py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1">
                {/* Sort Dropdown */}
                <div className="flex items-center gap-2">
                  <label htmlFor="sort-select" className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                    Sort:
                  </label>
                  <select
                    id="sort-select"
                    value={`${filters.sortBy}-${filters.sortOrder}`}
                    onChange={(e) => {
                      const [sortBy, sortOrder] = e.target.value.split('-') as [any, any];
                      setFilters(prev => ({ ...prev, sortBy, sortOrder }));
                    }}
                    className="px-3 py-2 border-2 border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
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
                  <span className="text-gray-600">Showing</span>
                  <span className="px-2.5 py-1 bg-blue-100 text-blue-900 rounded-lg font-bold">
                    {paginatedData.items.length}
                  </span>
                  <span className="text-gray-600">of</span>
                  <span className="px-2.5 py-1 bg-gray-100 text-gray-900 rounded-lg font-bold">
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

            {/* Mobile Results Count */}
            <div className="md:hidden mt-3 pt-3 border-t border-gray-200 text-sm text-center text-gray-600">
              Showing <span className="font-bold text-gray-900">{paginatedData.items.length}</span> of{' '}
              <span className="font-bold text-gray-900">{filteredResources.length}</span> documents
            </div>
          </div>

          {/* Document Grid/List */}
          {paginatedData.items.length === 0 ? (
            <div className="bg-white shadow-md border-2 border-gray-200 rounded-2xl px-8 py-16 text-center">
              <div className="max-w-md mx-auto">
                <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No Documents Found</h3>
                <p className="text-gray-600 mb-6">
                  No documents match your current filters. Try adjusting your search criteria or clearing some filters.
                </p>
                <button
                  onClick={() => {
                    setFilters({
                      search: '',
                      classifications: [],
                      countries: [],
                      cois: [],
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
