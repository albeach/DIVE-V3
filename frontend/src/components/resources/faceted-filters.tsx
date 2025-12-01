/**
 * Faceted Filters Component (2025)
 * 
 * Modern faceted search filters with:
 * - Live document counts per facet value
 * - Collapsible sections with memory
 * - Multi-select with AND/OR toggle
 * - Active filter chips with removal
 * - Progressive disclosure for long lists
 * - Mobile-optimized drawer mode
 */

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Shield,
  Globe2,
  Users,
  Lock,
  ChevronDown,
  ChevronRight,
  X,
  Filter,
  SlidersHorizontal,
  Calendar,
  Server,
  Check,
  Minus,
} from 'lucide-react';
import DateRangePicker, { DateRangeDisplay } from './date-range-picker';
import type { DateRange } from './date-range-picker';

// ============================================
// Types
// ============================================

interface FacetItem {
  value: string;
  label: string;
  count: number;
  disabled?: boolean;
  icon?: string;
  color?: string;
}

interface FacetGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: FacetItem[];
  type: 'single' | 'multi';
  defaultExpanded?: boolean;
  showMore?: boolean;
  initialVisible?: number;
}

interface ISelectedFilters {
  classifications: string[];
  countries: string[];
  cois: string[];
  instances: string[];
  encryptionStatus: string;
  dateRange?: { start: string; end: string };
}

interface FacetedFiltersProps {
  facets: {
    classifications: FacetItem[];
    countries: FacetItem[];
    cois: FacetItem[];
    instances: FacetItem[];
    encryptionStatus: FacetItem[];
  };
  selectedFilters: ISelectedFilters;
  onFilterChange: (filters: ISelectedFilters) => void;
  isLoading?: boolean;
  totalCount: number;
  filteredCount: number;
  userAttributes?: {
    clearance?: string;
    country?: string;
    coi?: string[];
  };
  className?: string;
  /** Phase 2: Hide zero-count items instead of disabling */
  hideZeroCounts?: boolean;
  /** Phase 2: Show facet counts in real-time */
  showLiveCounts?: boolean;
  /** Phase 2: Callback when facets need refresh */
  onRefreshFacets?: () => void;
}

// ============================================
// Constants
// ============================================

const CLASSIFICATION_COLORS: Record<string, string> = {
  'UNCLASSIFIED': 'bg-green-100 text-green-800 border-green-200',
  'RESTRICTED': 'bg-blue-100 text-blue-800 border-blue-200',
  'CONFIDENTIAL': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'SECRET': 'bg-orange-100 text-orange-800 border-orange-200',
  'TOP_SECRET': 'bg-red-100 text-red-800 border-red-200',
};

const CLASSIFICATION_ICONS: Record<string, string> = {
  'UNCLASSIFIED': '🟢',
  'RESTRICTED': '🔵',
  'CONFIDENTIAL': '🟡',
  'SECRET': '🟠',
  'TOP_SECRET': '🔴',
};

const INSTANCE_FLAGS: Record<string, string> = {
  'USA': '🇺🇸',
  'FRA': '🇫🇷',
  'GBR': '🇬🇧',
  'DEU': '🇩🇪',
  'CAN': '🇨🇦',
  'AUS': '🇦🇺',
};

// ============================================
// Facet Section Component
// ============================================

interface FacetSectionProps {
  group: FacetGroup;
  selectedValues: string[];
  onToggle: (value: string) => void;
  userHighlight?: string[];
  isLoading?: boolean;
}

function FacetSection({ 
  group, 
  selectedValues, 
  onToggle, 
  userHighlight = [],
  isLoading 
}: FacetSectionProps) {
  const [isExpanded, setIsExpanded] = useState(group.defaultExpanded ?? true);
  const [showAll, setShowAll] = useState(false);
  
  const visibleItems = group.showMore && !showAll 
    ? group.items.slice(0, group.initialVisible || 5)
    : group.items;
  
  const hasMore = group.showMore && group.items.length > (group.initialVisible || 5);
  const activeCount = selectedValues.length;

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
      {/* Section Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-gray-400">{group.icon}</span>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            {group.label}
          </span>
          {activeCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-full">
              {activeCount}
            </span>
          )}
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </motion.div>
      </button>

      {/* Section Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-1.5">
              {visibleItems.map((item) => {
                const isSelected = selectedValues.includes(item.value);
                const isHighlighted = userHighlight.includes(item.value);
                const itemColor = CLASSIFICATION_COLORS[item.value] || '';
                const itemIcon = item.icon || CLASSIFICATION_ICONS[item.value] || INSTANCE_FLAGS[item.value];
                
                return (
                  <button
                    key={item.value}
                    onClick={() => onToggle(item.value)}
                    disabled={item.disabled || isLoading}
                    className={`
                      w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all
                      ${isSelected 
                        ? `${itemColor || 'bg-blue-50 dark:bg-blue-900/30'} border-2 border-blue-400 dark:border-blue-600 shadow-sm`
                        : 'bg-gray-50 dark:bg-gray-800 border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                      }
                      ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                      ${isHighlighted && !isSelected ? 'ring-2 ring-green-400 ring-offset-1' : ''}
                    `}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Checkbox indicator */}
                      <div className={`
                        w-4 h-4 rounded flex items-center justify-center flex-shrink-0
                        ${isSelected 
                          ? 'bg-blue-600 dark:bg-blue-500' 
                          : 'border-2 border-gray-300 dark:border-gray-600'
                        }
                      `}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      
                      {/* Icon */}
                      {itemIcon && (
                        <span className="text-base flex-shrink-0">{itemIcon}</span>
                      )}
                      
                      {/* Label */}
                      <span className={`text-sm font-medium truncate ${
                        isSelected 
                          ? 'text-gray-900 dark:text-gray-100' 
                          : 'text-gray-700 dark:text-gray-300'
                      }`}>
                        {item.label}
                      </span>
                      
                      {/* User badge */}
                      {isHighlighted && (
                        <span className="flex-shrink-0 px-1.5 py-0.5 text-xs font-bold bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">
                          You
                        </span>
                      )}
                    </div>
                    
                    {/* Count badge */}
                    <span className={`
                      ml-2 px-2 py-0.5 text-xs font-semibold rounded-full flex-shrink-0
                      ${isSelected 
                        ? 'bg-blue-600/20 text-blue-900 dark:text-blue-100' 
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }
                      ${isLoading ? 'animate-pulse' : ''}
                    `}>
                      {item.count.toLocaleString()}
                    </span>
                  </button>
                );
              })}
              
              {/* Show more/less */}
              {hasMore && (
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="w-full px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center justify-center gap-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                >
                  {showAll ? (
                    <>
                      <Minus className="w-4 h-4" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronRight className="w-4 h-4" />
                      Show {group.items.length - (group.initialVisible || 5)} more
                    </>
                  )}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function FacetedFilters({
  facets,
  selectedFilters,
  onFilterChange,
  isLoading = false,
  totalCount,
  filteredCount,
  userAttributes,
  className = '',
  hideZeroCounts = false,
  showLiveCounts = true,
  onRefreshFacets,
}: FacetedFiltersProps) {
  
  // Phase 2: Filter zero-count items if enabled
  const filterZeroCounts = useCallback((items: FacetItem[]): FacetItem[] => {
    if (!hideZeroCounts) {
      // Mark zero-count items as disabled instead of hiding
      return items.map(item => ({
        ...item,
        disabled: item.count === 0,
      }));
    }
    return items.filter(item => item.count > 0);
  }, [hideZeroCounts]);

  // Build facet groups
  const facetGroups: FacetGroup[] = useMemo(() => [
    {
      id: 'classifications',
      label: 'Classification',
      icon: <Shield className="w-4 h-4" />,
      items: filterZeroCounts(facets.classifications),
      type: 'multi' as const,
      defaultExpanded: true,
    },
    {
      id: 'instances',
      label: 'Federation Instance',
      icon: <Server className="w-4 h-4" />,
      items: filterZeroCounts(facets.instances),
      type: 'multi' as const,
      defaultExpanded: true,
    },
    {
      id: 'countries',
      label: 'Releasable To',
      icon: <Globe2 className="w-4 h-4" />,
      items: filterZeroCounts(facets.countries),
      type: 'multi' as const,
      defaultExpanded: false,
      showMore: true,
      initialVisible: 6,
    },
    {
      id: 'cois',
      label: 'Communities of Interest',
      icon: <Users className="w-4 h-4" />,
      items: filterZeroCounts(facets.cois),
      type: 'multi' as const,
      defaultExpanded: false,
      showMore: true,
      initialVisible: 5,
    },
    {
      id: 'encryptionStatus',
      label: 'Encryption',
      icon: <Lock className="w-4 h-4" />,
      items: filterZeroCounts(facets.encryptionStatus),
      type: 'multi' as const,
      defaultExpanded: false,
    },
  ], [facets, filterZeroCounts]);

  // Toggle handler for multi-select facets
  const handleToggle = useCallback((groupId: string, value: string) => {
    const currentValues = (selectedFilters as any)[groupId];
    
    if (Array.isArray(currentValues)) {
      const newValues = currentValues.includes(value)
        ? currentValues.filter((v: string) => v !== value)
        : [...currentValues, value];
      
      onFilterChange({
        ...selectedFilters,
        [groupId]: newValues,
      });
    } else {
      // Single value (like encryptionStatus)
      onFilterChange({
        ...selectedFilters,
        [groupId]: currentValues === value ? '' : value,
      });
    }
  }, [selectedFilters, onFilterChange]);

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    onFilterChange({
      classifications: [],
      countries: [],
      cois: [],
      instances: [],
      encryptionStatus: '',
      dateRange: undefined,
    });
  }, [onFilterChange]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    return (
      selectedFilters.classifications.length +
      selectedFilters.countries.length +
      selectedFilters.cois.length +
      selectedFilters.instances.length +
      (selectedFilters.encryptionStatus ? 1 : 0) +
      (selectedFilters.dateRange ? 1 : 0)
    );
  }, [selectedFilters]);

  // Get all active filter chips
  const activeFilterChips = useMemo(() => {
    const chips: Array<{ label: string; group: string; value: string }> = [];
    
    selectedFilters.classifications.forEach(v => {
      chips.push({ label: v.replace('_', ' '), group: 'classifications', value: v });
    });
    selectedFilters.countries.forEach(v => {
      chips.push({ label: `${INSTANCE_FLAGS[v] || ''} ${v}`.trim(), group: 'countries', value: v });
    });
    selectedFilters.cois.forEach(v => {
      chips.push({ label: v, group: 'cois', value: v });
    });
    selectedFilters.instances.forEach(v => {
      chips.push({ label: `${INSTANCE_FLAGS[v] || ''} ${v}`.trim(), group: 'instances', value: v });
    });
    if (selectedFilters.encryptionStatus) {
      chips.push({ 
        label: selectedFilters.encryptionStatus === 'encrypted' ? '🔐 Encrypted' : '📄 Unencrypted', 
        group: 'encryptionStatus', 
        value: selectedFilters.encryptionStatus 
      });
    }
    
    return chips;
  }, [selectedFilters]);

  // User attribute highlights
  const userHighlights = useMemo(() => ({
    classifications: userAttributes?.clearance ? [userAttributes.clearance] : [],
    countries: userAttributes?.country ? [userAttributes.country] : [],
    cois: userAttributes?.coi || [],
    instances: [],
    encryptionStatus: [],
  }), [userAttributes]);

  return (
    <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Filters</h3>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 bg-blue-600 text-white text-xs font-bold rounded-full">
                {activeFilterCount}
              </span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
            >
              Clear all
            </button>
          )}
        </div>
        
        {/* Results summary */}
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          Showing <span className="font-semibold text-gray-900 dark:text-gray-100">{filteredCount.toLocaleString()}</span> of{' '}
          <span className="font-semibold text-gray-900 dark:text-gray-100">{totalCount.toLocaleString()}</span> resources
        </div>
      </div>

      {/* Active Filter Chips */}
      {activeFilterChips.length > 0 && (
        <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap gap-1.5">
            {activeFilterChips.map((chip, idx) => (
              <span
                key={`${chip.group}-${chip.value}-${idx}`}
                className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300"
              >
                {chip.label}
                <button
                  onClick={() => handleToggle(chip.group, chip.value)}
                  className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                >
                  <X className="w-3 h-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Facet Sections */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {facetGroups.map((group) => (
          <FacetSection
            key={group.id}
            group={group}
            selectedValues={
              Array.isArray((selectedFilters as any)[group.id])
                ? (selectedFilters as any)[group.id]
                : (selectedFilters as any)[group.id] ? [(selectedFilters as any)[group.id]] : []
            }
            onToggle={(value) => handleToggle(group.id, value)}
            userHighlight={(userHighlights as any)[group.id]}
            isLoading={isLoading}
          />
        ))}
        
        {/* Date Range Filter Section */}
        <div className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                Creation Date
              </span>
              {selectedFilters.dateRange && (
                <span className="ml-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-full">
                  1
                </span>
              )}
            </div>
            <DateRangePicker
              value={selectedFilters.dateRange}
              onChange={(dateRange) => {
                onFilterChange({
                  ...selectedFilters,
                  dateRange,
                });
              }}
              placeholder="Filter by date range"
            />
          </div>
        </div>
      </div>

      {/* Footer with keyboard hint */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Press <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 font-mono">⌘K</kbd> for quick search
        </p>
      </div>
    </div>
  );
}

// ============================================
// Mobile Filter Drawer
// ============================================

interface MobileFilterDrawerProps extends FacetedFiltersProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileFilterDrawer({ isOpen, onClose, ...props }: MobileFilterDrawerProps) {
  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={onClose}
          />
          
          {/* Drawer */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-y-0 left-0 w-80 max-w-full z-50 lg:hidden overflow-y-auto"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-white dark:bg-gray-800 rounded-full shadow-lg z-10"
            >
              <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            
            <FacetedFilters {...props} className="h-full rounded-none border-0" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================
// Filter Trigger Button for Mobile
// ============================================

interface FilterTriggerButtonProps {
  activeCount: number;
  onClick: () => void;
}

export function FilterTriggerButton({ activeCount, onClick }: FilterTriggerButtonProps) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
    >
      <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters</span>
      {activeCount > 0 && (
        <span className="px-1.5 py-0.5 bg-blue-600 text-white text-xs font-bold rounded-full">
          {activeCount}
        </span>
      )}
    </button>
  );
}

