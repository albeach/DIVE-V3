/**
 * Saved Filters Component (2025)
 * 
 * Features:
 * - Save current filter state as preset
 * - Quick access to saved filters
 * - Persists to localStorage
 * - Pre-built common presets
 */

'use client';

import React, { useState, useEffect } from 'react';
import { ResourceFiltersState } from './resource-filters';

interface SavedFiltersProps {
  currentFilters: ResourceFiltersState;
  onApplyFilter: (filters: ResourceFiltersState) => void;
}

interface SavedFilter {
  id: string;
  name: string;
  filters: ResourceFiltersState;
  createdAt: string;
}

const SAVED_FILTERS_KEY = 'dive_saved_filters';

// Pre-built common filters
const COMMON_PRESETS: SavedFilter[] = [
  {
    id: 'secret-encrypted',
    name: 'SECRET+ & Encrypted',
    filters: {
      search: '',
      classifications: ['SECRET', 'TOP_SECRET'],
      countries: [],
      cois: [],
      fileTypes: [],
      encryptionStatus: 'encrypted',
      sortBy: 'classification',
      sortOrder: 'desc',
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fvey-only',
    name: 'FVEY Documents',
    filters: {
      search: '',
      classifications: [],
      countries: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
      cois: ['FVEY'],
      fileTypes: [],
      encryptionStatus: 'all',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'unclass-public',
    name: 'UNCLASSIFIED',
    filters: {
      search: '',
      classifications: ['UNCLASSIFIED'],
      countries: [],
      cois: [],
      fileTypes: [],
      encryptionStatus: 'all',
      sortBy: 'title',
      sortOrder: 'asc',
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'recent-secret',
    name: 'Recent SECRET',
    filters: {
      search: '',
      classifications: ['SECRET'],
      countries: [],
      cois: [],
      fileTypes: [],
      encryptionStatus: 'all',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    },
    createdAt: new Date().toISOString(),
  },
];

export default function SavedFilters({ currentFilters, onApplyFilter }: SavedFiltersProps) {
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  // Load saved filters
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SAVED_FILTERS_KEY);
      if (stored) {
        setSavedFilters(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load saved filters:', error);
    }
  }, []);

  // Save current filter
  const handleSaveFilter = () => {
    if (!filterName.trim()) return;

    const newFilter: SavedFilter = {
      id: Date.now().toString(),
      name: filterName.trim(),
      filters: currentFilters,
      createdAt: new Date().toISOString(),
    };

    const updated = [newFilter, ...savedFilters].slice(0, 10); // Keep max 10 custom filters
    setSavedFilters(updated);

    try {
      localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save filter:', error);
    }

    setFilterName('');
    setShowSaveDialog(false);
  };

  // Delete saved filter
  const handleDeleteFilter = (id: string) => {
    const updated = savedFilters.filter(f => f.id !== id);
    setSavedFilters(updated);

    try {
      localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to delete filter:', error);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-4 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 transition-colors"
      >
        <div className="flex items-center gap-2 text-white">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          <h2 className="text-lg font-bold">Saved Filters</h2>
        </div>
        <svg
          className={`w-5 h-5 text-white transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="p-5 space-y-4">
          {/* Save Current Filter Button */}
          {!showSaveDialog ? (
            <button
              onClick={() => setShowSaveDialog(true)}
              className="w-full px-4 py-2.5 bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg text-blue-700 font-semibold text-sm hover:bg-blue-100 hover:border-blue-400 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Save Current Filters
            </button>
          ) : (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3 space-y-2">
              <input
                type="text"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveFilter();
                  if (e.key === 'Escape') setShowSaveDialog(false);
                }}
                placeholder="Enter filter name..."
                className="w-full px-3 py-2 border border-blue-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveFilter}
                  disabled={!filterName.trim()}
                  className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowSaveDialog(false);
                    setFilterName('');
                  }}
                  className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Common Presets */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Quick Filters</h3>
            <div className="space-y-1.5">
              {COMMON_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => onApplyFilter(preset.filters)}
                  className="w-full px-3 py-2 bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-lg text-left hover:from-blue-50 hover:to-indigo-50 hover:border-blue-300 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                      {preset.name}
                    </span>
                    <svg
                      className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Saved Filters */}
          {savedFilters.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Your Saved Filters</h3>
              <div className="space-y-1.5">
                {savedFilters.map(filter => (
                  <div
                    key={filter.id}
                    className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                  >
                    <button
                      onClick={() => onApplyFilter(filter.filters)}
                      className="flex-1 px-3 py-2 text-left hover:bg-blue-50 rounded-l-lg transition-colors group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                          {filter.name}
                        </span>
                        <svg
                          className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                    <button
                      onClick={() => handleDeleteFilter(filter.id)}
                      className="px-3 py-2 text-red-500 hover:bg-red-50 rounded-r-lg transition-colors"
                      title="Delete filter"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
