'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageLayout from '@/components/layout/page-layout';
import ResourceFilters, { ResourceFiltersState } from '@/components/resources/resource-filters';
import Pagination from '@/components/resources/pagination';

interface IResource {
  resourceId: string;
  title: string;
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  encrypted: boolean;
  creationDate?: string;
  displayMarking?: string;
  ztdfVersion?: string;
}

const classificationColors: Record<string, string> = {
  'UNCLASSIFIED': 'bg-green-100 text-green-800 border-green-300',
  'CONFIDENTIAL': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'SECRET': 'bg-orange-100 text-orange-800 border-orange-300',
  'TOP_SECRET': 'bg-red-100 text-red-800 border-red-300',
};

// Clearance hierarchy for filtering
const CLEARANCE_ORDER: Record<string, number> = {
  'UNCLASSIFIED': 0,
  'CONFIDENTIAL': 1,
  'SECRET': 2,
  'TOP_SECRET': 3,
};

function filterAndSortResources(
  resources: IResource[], 
  filters: ResourceFiltersState
): IResource[] {
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

function paginateResources(resources: IResource[], page: number, perPage: number) {
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
  
  const [resources, setResources] = useState<IResource[]>([]);
  const [filteredResources, setFilteredResources] = useState<IResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Fetch resources
  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/login');
      return;
    }

    async function fetchResources() {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
      
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

  // Handle pagination
  const paginatedData = paginateResources(filteredResources, currentPage, itemsPerPage);

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading resources...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <PageLayout user={session.user}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Classified Documents
        </h1>
        <p className="text-gray-600">
          Click on a document to request access. Authorization will be determined by your clearance level, 
          country affiliation, and communities of interest.
        </p>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-100 text-blue-800 font-semibold">
            🛡️ ACP-240 Compliant
          </span>
          <span className="text-gray-600">
            NATO Data-Centric Security | STANAG 4774 Labels | ZTDF Encryption
          </span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Two-Column Split Layout: Filters + Results */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Filters (Sticky) */}
        <div className="lg:col-span-1">
          <div className="sticky top-4 space-y-4">
            {/* User Access Level Card (Above Filters) */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-bold text-blue-900 mb-3 flex items-center">
                <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Your Access Level
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <dt className="text-blue-700">Clearance:</dt>
                  <dd className="font-mono font-bold text-blue-900">
                    {session.user?.clearance || 'Not Set'}
                  </dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt className="text-blue-700">Country:</dt>
                  <dd className="font-mono font-bold text-blue-900">
                    {session.user?.countryOfAffiliation || 'Not Set'}
                  </dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt className="text-blue-700">COI:</dt>
                  <dd className="font-mono text-xs text-blue-900">
                    {session.user?.acpCOI && session.user.acpCOI.length > 0
                      ? session.user.acpCOI.join(', ')
                      : 'None'}
                  </dd>
                </div>
              </dl>
            </div>

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

        {/* Right Column: Resource List */}
        <div className="lg:col-span-3 space-y-4">
          {/* Sort Dropdown (Above Results) */}
          <div className="bg-white shadow-sm border border-gray-200 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label htmlFor="sort-select" className="text-sm font-medium text-gray-700">
                  Sort by:
                </label>
                <select
                  id="sort-select"
                  value={`${filters.sortBy}-${filters.sortOrder}`}
                  onChange={(e) => {
                    const [sortBy, sortOrder] = e.target.value.split('-') as [any, any];
                    setFilters(prev => ({ ...prev, sortBy, sortOrder }));
                  }}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="title-asc">Title (A-Z)</option>
                  <option value="title-desc">Title (Z-A)</option>
                  <option value="createdAt-desc">Newest First</option>
                  <option value="createdAt-asc">Oldest First</option>
                  <option value="classification-desc">Highest Classification</option>
                  <option value="classification-asc">Lowest Classification</option>
                </select>
              </div>
              <div className="text-sm text-gray-600">
                Showing <span className="font-semibold text-gray-900">{paginatedData.items.length}</span> of{' '}
                <span className="font-semibold text-gray-900">{filteredResources.length}</span>
              </div>
            </div>
          </div>

          {/* Resource List */}
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          {paginatedData.items.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No resources match your filters</h3>
              <p className="mt-1 text-sm text-gray-500">
                Try adjusting your search or filter selections.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {paginatedData.items.map((resource) => (
                <li key={resource.resourceId}>
                  <Link
                    href={`/resources/${resource.resourceId}`}
                    className="block hover:bg-gray-50 transition-colors"
                  >
                    <div className="px-6 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          {/* ACP-240 STANAG 4774 Display Marking */}
                          {resource.displayMarking && (
                            <div className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-bold border-2 mb-3 ${
                              classificationColors[resource.classification] || 'bg-gray-100 text-gray-800 border-gray-300'
                            }`}>
                              <span className="mr-2">🛡️</span>
                              <span className="font-mono tracking-wide">{resource.displayMarking}</span>
                              {resource.ztdfVersion && (
                                <span className="ml-3 text-xs opacity-75">(ZTDF v{resource.ztdfVersion})</span>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900 truncate">
                              {resource.title}
                            </h3>
                            {!resource.displayMarking && (
                              <span
                                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${
                                  classificationColors[resource.classification] || 'bg-gray-100 text-gray-800 border-gray-300'
                                }`}
                              >
                                {resource.classification}
                              </span>
                            )}
                            {resource.encrypted && (
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                🔐 ZTDF
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <div>
                              <span className="font-mono text-xs">{resource.resourceId}</span>
                            </div>
                            <div>
                              <span className="font-medium">Releasable to:</span>{' '}
                              {resource.releasabilityTo.length > 0
                                ? resource.releasabilityTo.join(', ')
                                : 'None'}
                            </div>
                            {resource.COI && resource.COI.length > 0 && (
                              <div>
                                <span className="font-medium">COI:</span>{' '}
                                {resource.COI.join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="ml-4 flex-shrink-0">
                          <svg
                            className="h-5 w-5 text-gray-400"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* Pagination */}
          {paginatedData.items.length > 0 && (
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
          )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
