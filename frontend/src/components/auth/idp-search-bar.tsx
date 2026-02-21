"use client";

import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { getFlagComponent } from '../ui/flags';

interface IdPOption {
  alias: string;
  displayName: string;
  protocol: string;
  enabled: boolean;
}

interface IdpSearchBarProps {
  idps: IdPOption[];
  onSelect: (idp: IdPOption) => void;
  onSearchChange?: (query: string) => void;
  placeholder?: string;
}

/**
 * IdP Search Bar with Glassmorphism and Autocomplete
 *
 * Features:
 * - Real-time fuzzy search
 * - Autocomplete dropdown with flag previews
 * - Keyboard navigation (arrow keys, enter, escape)
 * - Clear button with animation
 * - Glassmorphism design
 */
export function IdpSearchBar({
  idps,
  onSelect,
  onSearchChange,
  placeholder = "Search coalition partners by country name..."
}: IdpSearchBarProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fuzzy search implementation
  const filteredIdps = query.trim() === '' ? [] : idps.filter(idp => {
    const searchTerm = query.toLowerCase();
    const displayName = idp.displayName.toLowerCase();
    const alias = idp.alias.toLowerCase();

    // Simple fuzzy match: check if all characters appear in order
    const matches = displayName.includes(searchTerm) ||
                   alias.includes(searchTerm) ||
                   fuzzyMatch(displayName, searchTerm);

    return matches;
  }).slice(0, 8); // Limit to 8 results

  // Simple fuzzy matching
  function fuzzyMatch(str: string, pattern: string): boolean {
    let patternIdx = 0;
    let strIdx = 0;

    while (strIdx < str.length && patternIdx < pattern.length) {
      if (str[strIdx] === pattern[patternIdx]) {
        patternIdx++;
      }
      strIdx++;
    }

    return patternIdx === pattern.length;
  }

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setIsOpen(value.length > 0);
    setSelectedIndex(0);
    onSearchChange?.(value);
  };

  // Handle clear button
  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
    setSelectedIndex(0);
    onSearchChange?.('');
    inputRef.current?.focus();
  };

  // Handle IdP selection
  const handleSelect = (idp: IdPOption) => {
    onSelect(idp);
    setQuery('');
    setIsOpen(false);
    setSelectedIndex(0);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || filteredIdps.length === 0) {
      if (e.key === 'Escape') {
        handleClear();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < filteredIdps.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredIdps[selectedIndex]) {
          handleSelect(filteredIdps[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        handleClear();
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
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  return (
    <div className="relative w-full max-w-2xl mx-auto mb-4" style={{ zIndex: 100 }}>
      {/* Search Input with Glassmorphism */}
      <div className="relative group" style={{ zIndex: 100 }}>
        {/* Glow effect on focus */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-[#009ab3] to-[#79d85a] rounded-xl opacity-0 group-focus-within:opacity-20 blur transition-opacity duration-300" />

        <div className="relative flex items-center">
          {/* Search Icon */}
          <div className="absolute left-4 pointer-events-none">
            <Search
              className="text-gray-400 group-focus-within:text-[#009ab3] transition-colors"
              size={20}
            />
          </div>

          {/* Input Field */}
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full h-11 pl-12 pr-12 rounded-xl bg-white/90 backdrop-blur-xl border border-gray-200
                     focus:border-[#009ab3] focus:outline-none focus:ring-2 focus:ring-[#009ab3]/20
                     text-gray-900 placeholder:text-gray-400 placeholder:italic
                     shadow-lg hover:shadow-xl transition-all duration-300
                     text-sm"
            aria-label="Search identity providers"
            aria-autocomplete="list"
            aria-controls="idp-autocomplete-list"
            aria-expanded={isOpen}
          />

          {/* Clear Button */}
          {query && (
            <button
              onClick={handleClear}
              className="absolute right-4 p-1 rounded-full hover:bg-gray-100 transition-colors group/clear"
              aria-label="Clear search"
            >
              <X
                className="text-gray-400 group-hover/clear:text-gray-600 transition-colors"
                size={18}
              />
            </button>
          )}
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && filteredIdps.length > 0 && (
        <div
          ref={dropdownRef}
          id="idp-autocomplete-list"
          role="listbox"
          className="absolute top-full left-0 right-0 mt-2 bg-white backdrop-blur-xl rounded-xl
                   border border-gray-200 shadow-2xl overflow-hidden z-[9999] animate-fade-in-up max-h-80 overflow-y-auto"
          style={{ position: 'absolute', zIndex: 9999 }}
        >
          {filteredIdps.map((idp, index) => {
            const FlagComponent = getFlagComponent(idp.alias);
            const isSelected = index === selectedIndex;

            return (
              <button
                key={idp.alias}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(idp)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-200 border-l-4
                          ${isSelected
                            ? 'bg-gradient-to-r from-[#009ab3]/10 to-[#79d85a]/10 border-[#009ab3]'
                            : 'hover:bg-gray-50 border-transparent'
                          }`}
              >
                {/* Flag */}
                <div className={`flex-shrink-0 transition-transform duration-200 ${isSelected ? 'scale-110' : ''}`}>
                  <FlagComponent size={32} />
                </div>

                {/* Country Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-gray-900 truncate">
                    {idp.displayName.replace(/^DIVE V3\s*-?\s*/i, '').split('(')[0].trim()}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {idp.protocol.toUpperCase()} • {idp.alias}
                  </div>
                </div>

                {/* Selected indicator */}
                {isSelected && (
                  <div className="flex-shrink-0">
                    <div className="w-2 h-2 rounded-full bg-[#009ab3] animate-pulse" />
                  </div>
                )}
              </button>
            );
          })}

          {/* Footer hint */}
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex items-center justify-between gap-2 flex-wrap">
            <span className="whitespace-nowrap">Press <kbd className="px-1 py-0.5 bg-white rounded border border-gray-300 font-mono text-[10px]">↑↓</kbd> to navigate</span>
            <span className="whitespace-nowrap"><kbd className="px-1 py-0.5 bg-white rounded border border-gray-300 font-mono text-[10px]">Enter</kbd> to select</span>
            <span className="whitespace-nowrap"><kbd className="px-1 py-0.5 bg-white rounded border border-gray-300 font-mono text-[10px]">Esc</kbd> to close</span>
          </div>
        </div>
      )}

      {/* No results */}
      {isOpen && query && filteredIdps.length === 0 && (
        <div
          className="absolute top-full left-0 right-0 mt-2 bg-white backdrop-blur-xl rounded-xl
                     border border-gray-200 shadow-2xl p-6 text-center z-[9999] animate-fade-in-up"
          style={{ position: 'absolute', zIndex: 9999 }}
        >
          <div className="text-4xl mb-2">🔍</div>
          <p className="text-gray-600 font-medium text-sm">No coalition partners found</p>
          <p className="text-xs text-gray-400 mt-1">Try searching for a country name or code</p>
        </div>
      )}
    </div>
  );
}

export default IdpSearchBar;

