/**
 * Smart Federation Instance Selector - 2025 Modern UX
 *
 * Progressive disclosure pattern for handling 32+ federation instances:
 * - Primary chips: Most relevant instances (current + smart suggestions)
 * - Overflow menu: Searchable dropdown for all instances
 * - Intelligent prioritization: Current country, recent usage, frequency
 * - Keyboard navigation: Arrow keys, enter, escape
 * - Responsive: Adapts to screen size and context
 */

'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Plus,
  Search,
  Check,
  X,
  Globe2,
  Clock,
  Star,
} from 'lucide-react';

// ============================================
// Types & Constants
// ============================================

interface FederationInstance {
  code: string;
  name: string;
  flag: string;
  region: string;
  count?: number;
  isCurrent?: boolean;
  lastUsed?: Date;
  frequency?: number;
}

interface SmartFederationSelectorProps {
  instances: string[];
  selectedInstances: string[];
  onSelectionChange: (instances: string[]) => void;
  disabled?: boolean;
  maxPrimaryChips?: number;
  showCounts?: boolean;
  instanceCounts?: Record<string, number>;
  userCountry?: string;
  className?: string;
}

// Instance metadata with 2025 intelligence
const INSTANCE_METADATA: Record<string, Omit<FederationInstance, 'code' | 'count' | 'isCurrent' | 'lastUsed' | 'frequency'>> = {
  'USA': { name: 'United States', flag: '🇺🇸', region: 'NATO' },
  'FRA': { name: 'France', flag: '🇫🇷', region: 'EU/NATO' },
  'GBR': { name: 'United Kingdom', flag: '🇬🇧', region: 'EU/NATO' },
  'DEU': { name: 'Germany', flag: '🇩🇪', region: 'EU/NATO' },
  'CAN': { name: 'Canada', flag: '🇨🇦', region: 'NATO' },
  'AUS': { name: 'Australia', flag: '🇦🇺', region: 'NATO' },
  'BEL': { name: 'Belgium', flag: '🇧🇪', region: 'EU/NATO' },
  'DNK': { name: 'Denmark', flag: '🇩🇰', region: 'EU/NATO' },
  'ESP': { name: 'Spain', flag: '🇪🇸', region: 'EU/NATO' },
  'EST': { name: 'Estonia', flag: '🇪🇪', region: 'EU/NATO' },
  'HUN': { name: 'Hungary', flag: '🇭🇺', region: 'EU/NATO' },
  'ITA': { name: 'Italy', flag: '🇮🇹', region: 'EU/NATO' },
  'NOR': { name: 'Norway', flag: '🇳🇴', region: 'EU/NATO' },
  'POL': { name: 'Poland', flag: '🇵🇱', region: 'EU/NATO' },
  'PRT': { name: 'Portugal', flag: '🇵🇹', region: 'EU/NATO' },
  'ROU': { name: 'Romania', flag: '🇷🇴', region: 'EU/NATO' },
  'TUR': { name: 'Turkey', flag: '🇹🇷', region: 'EU/NATO' },
  'ALB': { name: 'Albania', flag: '🇦🇱', region: 'NATO' },
  'BGR': { name: 'Bulgaria', flag: '🇧🇬', region: 'EU/NATO' },
  'HRV': { name: 'Croatia', flag: '🇭🇷', region: 'EU/NATO' },
  'CZE': { name: 'Czech Republic', flag: '🇨🇿', region: 'EU/NATO' },
  'SVK': { name: 'Slovakia', flag: '🇸🇰', region: 'EU/NATO' },
  // Add more as needed...
};

// ============================================
// Smart Prioritization Logic - 2025 AI-like UX
// ============================================

function prioritizeInstances(
  instanceCodes: string[],
  selectedInstances: string[],
  userCountry?: string,
  instanceCounts?: Record<string, number>
): FederationInstance[] {

  const instances: FederationInstance[] = instanceCodes.map(code => {
    const metadata = INSTANCE_METADATA[code] || {
      name: code,
      flag: '🏳️',
      region: 'Other'
    };

    // Load persisted usage data (would come from localStorage/API in real app)
    const persisted = typeof window !== 'undefined'
      ? localStorage.getItem(`dive_instance_${code}`)
      : null;

    let lastUsed: Date | undefined;
    let frequency = 0;

    if (persisted) {
      try {
        const data = JSON.parse(persisted);
        lastUsed = new Date(data.lastUsed);
        frequency = data.frequency || 0;
      } catch (e) {}
    }

    return {
      code,
      ...metadata,
      count: instanceCounts?.[code] || 0,
      isCurrent: code === userCountry,
      lastUsed,
      frequency,
    };
  });

  // Smart prioritization algorithm (2025 UX pattern)
  return instances.sort((a, b) => {
    // 1. Selected instances always first
    const aSelected = selectedInstances.includes(a.code);
    const bSelected = selectedInstances.includes(b.code);
    if (aSelected !== bSelected) return aSelected ? -1 : 1;

    // 2. Current user country
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;

    // 3. Recently used (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const aRecent = a.lastUsed && a.lastUsed > thirtyDaysAgo;
    const bRecent = b.lastUsed && b.lastUsed > thirtyDaysAgo;
    if (aRecent !== bRecent) return aRecent ? -1 : 1;

    // 4. Usage frequency
    if (a.frequency !== b.frequency) return b.frequency - a.frequency;

    // 5. Document count (relevance)
    if (a.count !== b.count) return b.count - a.count;

    // 6. Alphabetical fallback
    return a.name.localeCompare(b.name);
  });
}

// ============================================
// Primary Chip Component
// ============================================

interface PrimaryChipProps {
  instance: FederationInstance;
  isSelected: boolean;
  onToggle: () => void;
  onRemove?: () => void;
  disabled?: boolean;
  showCount?: boolean;
}

function PrimaryChip({ instance, isSelected, onToggle, onRemove, disabled, showCount }: PrimaryChipProps) {
  return (
    <motion.button
      onClick={onToggle}
      disabled={disabled}
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      className={`
        relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide
        transition-all duration-200 flex-shrink-0 touch-manipulation
        ${isSelected
          ? instance.isCurrent
            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
            : 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
          : disabled
            ? 'bg-gray-50 dark:bg-gray-800/50 text-gray-300 dark:text-gray-600 cursor-not-allowed'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300'
        }
      `}
      title={`${instance.name} (${instance.region})`}
    >
      {/* Flag */}
      <span className="text-sm">{instance.flag}</span>

      {/* Code */}
      <span>{instance.code}</span>

      {/* Count badge */}
      {showCount && instance.count > 0 && (
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
          isSelected
            ? 'bg-white/20 text-white'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
        }`}>
          {instance.count.toLocaleString()}
        </span>
      )}

      {/* Current instance indicator */}
      {instance.isCurrent && isSelected && (
        <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
      )}

      {/* Remove button for selected items */}
      {isSelected && onRemove && (
        <span
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-0.5 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
          role="button"
          tabIndex={0}
          aria-label={`Remove ${instance.name}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onRemove();
            }
          }}
        >
          <X className="w-3 h-3" />
        </span>
      )}
    </motion.button>
  );
}

// ============================================
// Overflow Dropdown Component
// ============================================

interface OverflowDropdownProps {
  instances: FederationInstance[];
  selectedInstances: string[];
  onToggle: (code: string) => void;
  onClose: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  focusedIndex: number;
  onFocusChange: (index: number) => void;
}

function OverflowDropdown({
  instances,
  selectedInstances,
  onToggle,
  onClose,
  searchQuery,
  onSearchChange,
  focusedIndex,
  onFocusChange
}: OverflowDropdownProps) {

  // Group instances by region for better UX
  const groupedInstances = useMemo(() => {
    const groups: Record<string, FederationInstance[]> = {};
    instances.forEach(instance => {
      const region = instance.region;
      if (!groups[region]) groups[region] = [];
      groups[region].push(instance);
    });
    return groups;
  }, [instances]);

  const filteredInstances = useMemo(() => {
    if (!searchQuery.trim()) return instances;

    const query = searchQuery.toLowerCase();
    return instances.filter(instance =>
      instance.name.toLowerCase().includes(query) ||
      instance.code.toLowerCase().includes(query) ||
      instance.region.toLowerCase().includes(query)
    );
  }, [instances, searchQuery]);

  const flatFilteredInstances = Object.values(groupedInstances).flat()
    .filter(instance => filteredInstances.includes(instance));

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="absolute top-full left-0 right-0 z-50 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl backdrop-blur-sm max-h-96 overflow-hidden"
    >
      {/* Search Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search countries..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            autoFocus
          />
        </div>
      </div>

      {/* Instance List */}
      <div className="max-h-64 overflow-y-auto">
        {Object.entries(groupedInstances).map(([region, regionInstances]) => {
          const filteredRegionInstances = regionInstances.filter(instance =>
            filteredInstances.includes(instance)
          );

          if (filteredRegionInstances.length === 0) return null;

          return (
            <div key={region}>
              {/* Region Header */}
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                  {region}
                </span>
              </div>

              {/* Region Instances */}
              {filteredRegionInstances.map((instance) => {
                const isSelected = selectedInstances.includes(instance.code);
                const globalIndex = flatFilteredInstances.indexOf(instance);
                const isFocused = focusedIndex === globalIndex;

                return (
                  <button
                    key={instance.code}
                    onClick={() => onToggle(instance.code)}
                    className={`
                      w-full px-3 py-2.5 text-left transition-all duration-150 flex items-center justify-between
                      ${isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-900 dark:text-gray-100'
                      }
                      ${isFocused ? 'bg-gray-100 dark:bg-gray-700' : ''}
                    `}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-base flex-shrink-0">{instance.flag}</span>
                      <span className="font-medium truncate">{instance.name}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                        {instance.code}
                      </span>
                      {instance.count > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                          ({instance.count.toLocaleString()})
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          );
        })}

        {/* No Results */}
        {filteredInstances.length === 0 && searchQuery && (
          <div className="px-3 py-8 text-center">
            <Search className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500 opacity-50 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No countries found for "{searchQuery}"
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
          {selectedInstances.length} of {instances.length} selected
        </p>
      </div>
    </motion.div>
  );
}

// ============================================
// Main Component
// ============================================

export default function SmartFederationSelector({
  instances,
  selectedInstances,
  onSelectionChange,
  disabled = false,
  maxPrimaryChips = 4,
  showCounts = true,
  instanceCounts = {},
  userCountry,
  className = '',
}: SmartFederationSelectorProps) {

  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);

  // ============================================
  // Smart Instance Prioritization
  // ============================================

  const prioritizedInstances = useMemo(() =>
    prioritizeInstances(instances, selectedInstances, userCountry, instanceCounts),
    [instances, selectedInstances, userCountry, instanceCounts]
  );

  // Split into primary (shown as chips) and overflow (hidden in dropdown)
  const primaryInstances = prioritizedInstances.slice(0, maxPrimaryChips);
  const overflowInstances = prioritizedInstances.slice(maxPrimaryChips);
  const hasOverflow = overflowInstances.length > 0;

  // ============================================
  // Event Handlers
  // ============================================

  const handleInstanceToggle = useCallback((instanceCode: string) => {
    const newSelection = selectedInstances.includes(instanceCode)
      ? selectedInstances.filter(code => code !== instanceCode)
      : [...selectedInstances, instanceCode];
    onSelectionChange(newSelection);
  }, [selectedInstances, onSelectionChange]);

  const handleOverflowToggle = useCallback(() => {
    setIsOverflowOpen(!isOverflowOpen);
    setSearchQuery('');
    setFocusedIndex(-1);
  }, [isOverflowOpen]);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setFocusedIndex(-1);
  }, []);

  // ============================================
  // Keyboard Navigation
  // ============================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOverflowOpen) return;

      const flatInstances = prioritizedInstances.filter(instance =>
        overflowInstances.includes(instance)
      );

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          setIsOverflowOpen(false);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex(prev => prev < flatInstances.length - 1 ? prev + 1 : 0);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex(prev => prev > 0 ? prev - 1 : flatInstances.length - 1);
          break;
        case 'Enter':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < flatInstances.length) {
            handleInstanceToggle(flatInstances[focusedIndex].code);
          }
          break;
      }
    };

    if (isOverflowOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOverflowOpen, focusedIndex, overflowInstances, prioritizedInstances, handleInstanceToggle]);

  // ============================================
  // Outside Click Handler
  // ============================================

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOverflowOpen(false);
      }
    };

    if (isOverflowOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOverflowOpen]);

  // ============================================
  // Usage Tracking (2025 UX - Learn from user behavior)
  // ============================================

  useEffect(() => {
    selectedInstances.forEach(code => {
      try {
        const existing = localStorage.getItem(`dive_instance_${code}`);
        const data = existing ? JSON.parse(existing) : { frequency: 0, lastUsed: null };
        data.frequency = (data.frequency || 0) + 1;
        data.lastUsed = new Date().toISOString();
        localStorage.setItem(`dive_instance_${code}`, JSON.stringify(data));
      } catch (e) {
        // Ignore localStorage errors
      }
    });
  }, [selectedInstances]);

  // ============================================
  // Render
  // ============================================

  return (
    <div ref={containerRef} className={`relative inline-flex items-center gap-1.5 ${className}`}>
      {/* Primary Chips */}
      {primaryInstances.map((instance) => (
        <PrimaryChip
          key={instance.code}
          instance={instance}
          isSelected={selectedInstances.includes(instance.code)}
          onToggle={() => handleInstanceToggle(instance.code)}
          onRemove={() => handleInstanceToggle(instance.code)}
          disabled={disabled}
          showCount={showCounts}
        />
      ))}

      {/* Overflow Button */}
      {hasOverflow && (
        <motion.button
          onClick={handleOverflowToggle}
          disabled={disabled}
          whileHover={!disabled ? { scale: 1.02 } : {}}
          whileTap={!disabled ? { scale: 0.98 } : {}}
          className={`
            relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold
            transition-all duration-200 touch-manipulation border-2 border-dashed
            ${disabled
              ? 'border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed'
              : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300'
            }
          `}
        >
          <Plus className="w-3 h-3" />
          <span>More</span>
          {overflowInstances.filter(i => selectedInstances.includes(i.code)).length > 0 && (
            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-[10px] font-black">
              {overflowInstances.filter(i => selectedInstances.includes(i.code)).length}
            </span>
          )}
        </motion.button>
      )}

      {/* Overflow Dropdown */}
      <AnimatePresence>
        {isOverflowOpen && (
          <OverflowDropdown
            instances={overflowInstances}
            selectedInstances={selectedInstances}
            onToggle={handleInstanceToggle}
            onClose={() => setIsOverflowOpen(false)}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            focusedIndex={focusedIndex}
            onFocusChange={setFocusedIndex}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// Export Variants
// ============================================

export { SmartFederationSelector };
export type { FederationInstance };
