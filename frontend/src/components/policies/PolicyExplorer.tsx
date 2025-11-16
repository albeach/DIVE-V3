'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Fuse from 'fuse.js';
import type { IPolicyMetadata, PolicyStatus } from '@/types/policy.types';

interface PolicyExplorerProps {
  policies: IPolicyMetadata[];
}

type SortOption = 'recent' | 'rules' | 'tests';
type ViewMode = 'grid' | 'table';

const statusStyles: Record<PolicyStatus, string> = {
  active: 'bg-green-100 text-green-800 border border-green-200',
  draft: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  deprecated: 'bg-gray-100 text-gray-700 border border-gray-200',
};

const sortLabels: Record<SortOption, string> = {
  recent: 'Recently Updated',
  rules: 'Most Rules',
  tests: 'Most Tests',
};

const viewModeLabels: Record<ViewMode, string> = {
  grid: 'Card View',
  table: 'Table View',
};

function formatDate(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown';
  }
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function PolicyExplorer({ policies }: PolicyExplorerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<PolicyStatus[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const fuse = useMemo(() => {
    return new Fuse(policies, {
      keys: [
        { name: 'name', weight: 0.5 },
        { name: 'description', weight: 0.3 },
        { name: 'package', weight: 0.2 },
      ],
      threshold: 0.35,
    });
  }, [policies]);

  const filteredPolicies = useMemo(() => {
    let results = policies;

    if (searchTerm.trim()) {
      results = fuse.search(searchTerm.trim()).map((match) => match.item);
    }

    if (selectedStatuses.length > 0) {
      results = results.filter((policy) => selectedStatuses.includes(policy.status));
    }

    return [...results].sort((a, b) => {
      switch (sortBy) {
        case 'rules':
          return b.ruleCount - a.ruleCount;
        case 'tests':
          return b.testCount - a.testCount;
        case 'recent':
        default:
          return (
            new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
          );
      }
    });
  }, [policies, fuse, searchTerm, selectedStatuses, sortBy]);

  const toggleStatus = (status: PolicyStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((item) => item !== status)
        : [...prev, status],
    );
  };

  return (
    <section className="bg-white shadow rounded-lg border border-gray-200 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-2xl font-semibold text-gray-900">Policy Explorer</h3>
          <p className="text-sm text-gray-600 mt-1">
            Search, filter, and sort live policy metadata. Jump into any policy for
            rule explainers, decision tester, and audit-ready logs.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start lg:self-auto">
          {(Object.keys(viewModeLabels) as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                viewMode === mode
                  ? 'border-blue-500 text-blue-700 bg-blue-50'
                  : 'border-gray-300 text-gray-600 hover:border-gray-400'
              }`}
              aria-pressed={viewMode === mode}
            >
              {viewModeLabels[mode]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label
            htmlFor="policy-search"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Search Policies
          </label>
          <input
            id="policy-search"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by name, package, description..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="policy-sort"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Sort By
          </label>
          <select
            id="policy-sort"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortOption)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          >
            {(Object.keys(sortLabels) as SortOption[]).map((option) => (
              <option key={option} value={option}>
                {sortLabels[option]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700 mb-1">
            Quick Actions
          </span>
          <Link
            href="/policies/lab"
            className="inline-flex justify-center items-center w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Upload & Evaluate →
          </Link>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
          Status Filters
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(statusStyles) as PolicyStatus[]).map((status) => (
            <button
              key={status}
              onClick={() => toggleStatus(status)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                selectedStatuses.includes(status)
                  ? statusStyles[status]
                  : 'bg-gray-100 text-gray-600 border border-transparent hover:bg-gray-200'
              }`}
              aria-pressed={selectedStatuses.includes(status)}
            >
              {status.toUpperCase()}
            </button>
          ))}
          {selectedStatuses.length > 0 && (
            <button
              onClick={() => setSelectedStatuses([])}
              className="px-3 py-1 rounded-full text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
          <span>
            Showing {filteredPolicies.length} of {policies.length} policies
          </span>
          {searchTerm && (
            <span>
              Matching "<span className="font-semibold">{searchTerm}</span>"
            </span>
          )}
        </div>

        {filteredPolicies.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
            <p className="text-gray-600 font-semibold mb-1">No policies found</p>
            <p className="text-sm text-gray-500 mb-4">
              Adjust filters or open Policies Lab to upload a new Rego file.
            </p>
            <Link
              href="/policies/lab"
              className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              Go to Policies Lab
            </Link>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredPolicies.map((policy) => (
              <article
                key={policy.policyId}
                className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/policies/${policy.policyId}`}
                      className="text-lg font-semibold text-gray-900 hover:text-blue-600"
                    >
                      {policy.name}
                    </Link>
                    <p className="text-xs text-gray-500 mt-1 font-mono">
                      {policy.package}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusStyles[policy.status]}`}
                    >
                      {policy.status.toUpperCase()}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                      v{policy.version}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-3 line-clamp-3">
                  {policy.description || 'No description provided.'}
                </p>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-xs text-gray-600">
                  <div>
                    <dt className="font-medium text-gray-500">Rules</dt>
                    <dd className="text-gray-900 text-base font-semibold">
                      {policy.ruleCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-500">Tests</dt>
                    <dd className="text-gray-900 text-base font-semibold">
                      {policy.testCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-500">Updated</dt>
                    <dd>{formatDate(policy.lastModified)}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <Link
                    href={`/policies/${policy.policyId}`}
                    className="text-blue-600 font-medium hover:text-blue-800"
                  >
                    View details →
                  </Link>
                  <Link
                    href={`/policies/${policy.policyId}`}
                    className="inline-flex items-center text-gray-600 hover:text-gray-900"
                  >
                    Open tester
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Policy
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Package
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Rules
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Tests
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Updated
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPolicies.map((policy) => (
                  <tr key={policy.policyId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/policies/${policy.policyId}`}
                        className="font-medium text-gray-900 hover:text-blue-600"
                      >
                        {policy.name}
                      </Link>
                      <p className="text-xs text-gray-500">v{policy.version}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {policy.package}
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-semibold">
                      {policy.ruleCount}
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-semibold">
                      {policy.testCount}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatDate(policy.lastModified)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusStyles[policy.status]}`}
                      >
                        {policy.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

