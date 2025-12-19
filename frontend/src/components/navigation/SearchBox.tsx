/**
 * SearchBox Component - Phase 3
 * 
 * Features:
 * - Real-time search with debouncing
 * - Search across documents, policies, navigation
 * - Dropdown results (max 10)
 * - Mobile full-screen modal
 * - Keyboard navigation
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, FileText, ScrollText, Loader2 } from 'lucide-react';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { navItems, adminItems } from './nav-config';
import Fuse from 'fuse.js';

interface SearchResult {
  id: string;
  title: string;
  description?: string;
  href: string;
  type: 'document' | 'policy' | 'navigation' | 'admin';
  classification?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface SearchBoxProps {
  className?: string;
  user?: {
    roles?: string[];
  } | null;
}

export function SearchBox({ className = '', user }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Check if user is admin
  const isAdmin = user?.roles?.includes('admin');

  // Build search index from navigation items
  const searchableItems: SearchResult[] = [
    ...navItems.map((item) => ({
      id: item.href,
      title: item.name,
      description: item.description,
      href: item.href,
      type: 'navigation' as const,
      icon: item.icon,
    })),
    ...(isAdmin ? adminItems.map((item) => ({
      id: item.href,
      title: item.name,
      description: item.description,
      href: item.href,
      type: 'admin' as const,
      icon: item.icon,
    })) : []),
  ];

  // Fuse.js configuration for fuzzy search
  const fuse = new Fuse(searchableItems, {
    keys: ['title', 'description'],
    threshold: 0.3, // Lower = stricter matching
    includeScore: true,
  });

  // Perform search
  useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Simulate async search (you can add API calls here)
    const searchResults = fuse.search(debouncedQuery);
    const items = searchResults
      .slice(0, 10) // Max 10 results
      .map((result) => result.item);

    setResults(items);
    setIsLoading(false);
  }, [debouncedQuery]);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  // Handle result selection
  const handleSelect = (href: string) => {
    setIsOpen(false);
    setQuery('');
    router.push(href);
  };

  // Classification badge colors
  const classificationColor = (classification: string): string => {
    switch (classification.toUpperCase()) {
      case 'TOP_SECRET':
      case 'TOP SECRET':
        return 'bg-red-100 text-red-800';
      case 'SECRET':
        return 'bg-orange-100 text-orange-800';
      case 'CONFIDENTIAL':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          placeholder="Search..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => query && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full pl-10 pr-10 py-2 text-sm border border-gray-300 dark:border-gray-600 
                     rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 
                     placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#4497ac] 
                     focus:border-transparent transition-all"
          aria-label="Search navigation and content"
          aria-expanded={isOpen}
          aria-autocomplete="list"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 
                       dark:hover:text-gray-300 transition-colors"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
        )}
      </div>

      {/* Search Results Dropdown */}
      {isOpen && (query || results.length > 0) && (
        <div
          ref={dropdownRef}
          className="absolute top-full mt-2 w-full min-w-[320px] max-w-md bg-white dark:bg-gray-900 
                     rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden 
                     z-50 animate-in fade-in slide-in-from-top-2"
        >
          {results.length > 0 ? (
            <div className="max-h-80 overflow-y-auto">
              {results.map((result) => {
                const Icon = result.icon || Search;
                return (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result.href)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 
                               dark:hover:bg-gray-800 transition-colors text-left border-b 
                               border-gray-100 dark:border-gray-800 last:border-0"
                  >
                    <Icon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {result.title}
                      </div>
                      {result.description && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {result.description}
                        </div>
                      )}
                    </div>
                    {result.classification && (
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded flex-shrink-0 ${classificationColor(result.classification)}`}>
                        {result.classification}
                      </span>
                    )}
                    {result.type === 'admin' && (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-800 rounded flex-shrink-0">
                        Admin
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : query && !isLoading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No results found for &quot;{query}&quot;
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Mobile Search Modal (full-screen)
 */
export function MobileSearchModal({ isOpen, onClose, user }: { 
  isOpen: boolean; 
  onClose: () => void; 
  user?: { roles?: string[] } | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={onClose}
          className="p-2 -ml-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 
                     dark:hover:bg-gray-800 rounded-lg transition-colors"
          aria-label="Close search"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <SearchBox user={user} className="w-full" />
        </div>
      </div>

      {/* Content area for recent searches, suggestions, etc */}
      <div className="p-4">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Search for documents, policies, or navigation items
        </div>
      </div>
    </div>
  );
}
