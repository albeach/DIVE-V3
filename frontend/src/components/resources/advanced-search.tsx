/**
 * Advanced Search Component (2025)
 * 
 * Features:
 * - Real-time autocomplete with keyboard navigation
 * - Recent searches persistence
 * - Search suggestions based on content
 * - Advanced search operators
 */

'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { IResourceCardData } from './advanced-resource-card';

interface AdvancedSearchProps {
  resources: IResourceCardData[];
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
}

interface SearchSuggestion {
  type: 'recent' | 'title' | 'id' | 'classification' | 'country' | 'coi';
  value: string;
  label: string;
  metadata?: string;
}

const RECENT_SEARCHES_KEY = 'dive_recent_searches';
const MAX_RECENT_SEARCHES = 5;

export default function AdvancedSearch({
  resources,
  value,
  onChange,
  onFocus,
}: AdvancedSearchProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load recent searches:', error);
    }
  }, []);

  // Save to recent searches
  const addToRecentSearches = (searchTerm: string) => {
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
  };

  // Generate suggestions based on input
  const suggestions = useMemo(() => {
    const results: SearchSuggestion[] = [];

    if (!value.trim()) {
      // Show recent searches when input is empty
      recentSearches.forEach(search => {
        results.push({
          type: 'recent',
          value: search,
          label: search,
          metadata: 'Recent',
        });
      });
      return results.slice(0, 8);
    }

    const query = value.toLowerCase();
    const maxSuggestions = 10;

    // Search in titles
    resources
      .filter(r => r.title.toLowerCase().includes(query))
      .slice(0, 5)
      .forEach(r => {
        results.push({
          type: 'title',
          value: r.title,
          label: r.title,
          metadata: `${r.classification} • ${r.resourceId}`,
        });
      });

    // Search in resource IDs
    resources
      .filter(r => r.resourceId.toLowerCase().includes(query))
      .slice(0, 3)
      .forEach(r => {
        if (!results.find(s => s.label === r.title)) {
          results.push({
            type: 'id',
            value: r.resourceId,
            label: r.resourceId,
            metadata: r.title,
          });
        }
      });

    // Search in classifications
    const classifications = ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
    classifications
      .filter(c => c.toLowerCase().includes(query))
      .forEach(c => {
        const count = resources.filter(r => r.classification === c).length;
        results.push({
          type: 'classification',
          value: c,
          label: c,
          metadata: `${count} documents`,
        });
      });

    // Search in countries
    const allCountries = new Set<string>();
    resources.forEach(r => r.releasabilityTo.forEach(c => allCountries.add(c)));
    Array.from(allCountries)
      .filter(c => c.toLowerCase().includes(query))
      .slice(0, 3)
      .forEach(c => {
        const count = resources.filter(r => r.releasabilityTo.includes(c)).length;
        results.push({
          type: 'country',
          value: c,
          label: c,
          metadata: `${count} documents`,
        });
      });

    // Search in COI
    const allCOIs = new Set<string>();
    resources.forEach(r => r.COI.forEach(c => allCOIs.add(c)));
    Array.from(allCOIs)
      .filter(c => c.toLowerCase().includes(query))
      .slice(0, 3)
      .forEach(c => {
        const count = resources.filter(r => r.COI.includes(c)).length;
        results.push({
          type: 'coi',
          value: c,
          label: c,
          metadata: `${count} documents`,
        });
      });

    return results.slice(0, maxSuggestions);
  }, [value, resources, recentSearches]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isFocused || suggestions.length === 0) return;

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
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          const suggestion = suggestions[selectedIndex];
          onChange(suggestion.value);
          addToRecentSearches(suggestion.value);
          setIsFocused(false);
          inputRef.current?.blur();
        } else {
          addToRecentSearches(value);
          setIsFocused(false);
          inputRef.current?.blur();
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsFocused(false);
        inputRef.current?.blur();
        break;
    }
  };

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset selected index when suggestions change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [suggestions]);

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case 'recent':
        return (
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'title':
        return (
          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'id':
        return (
          <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        );
      case 'classification':
        return (
          <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        );
      case 'country':
        return (
          <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'coi':
        return (
          <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        );
    }
  };

  return (
    <div className="relative">
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            setIsFocused(true);
            onFocus?.();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search documents, IDs, classifications, countries..."
          className="block w-full pl-11 pr-12 py-3 border-2 border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
        />
        {value && (
          <button
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {isFocused && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-2xl overflow-hidden"
        >
          <div className="max-h-80 overflow-y-auto">
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.type}-${suggestion.value}-${index}`}
                onClick={() => {
                  onChange(suggestion.value);
                  addToRecentSearches(suggestion.value);
                  setIsFocused(false);
                  inputRef.current?.blur();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                  selectedIndex === index
                    ? 'bg-blue-50 border-l-4 border-blue-600'
                    : 'hover:bg-gray-50 border-l-4 border-transparent'
                }`}
              >
                <div className="flex-shrink-0">
                  {getSuggestionIcon(suggestion.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">
                    {suggestion.label}
                  </div>
                  {suggestion.metadata && (
                    <div className="text-xs text-gray-500 truncate mt-0.5">
                      {suggestion.metadata}
                    </div>
                  )}
                </div>
                {suggestion.type === 'recent' && (
                  <div className="flex-shrink-0">
                    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Footer with keyboard hints */}
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">↵</kbd>
                select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">esc</kbd>
                close
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
