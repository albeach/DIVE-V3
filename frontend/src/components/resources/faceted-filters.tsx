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
import DateRangePicker from './date-range-picker';
import type { DateRange } from './date-range-picker';
import { useTranslation } from '@/hooks/useTranslation';

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
    // instances removed - handled by horizontal selector
    encryptionStatus: FacetItem[];
  };
  hasApproximateCounts?: boolean;
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
  'ALB': '🇦🇱',
  'BEL': '🇧🇪',
  'DNK': '🇩🇰',
  'ESP': '🇪🇸',
  'EST': '🇪🇪',
  'HUN': '🇭🇺',
  'ITA': '🇮🇹',
  'NOR': '🇳🇴',
  'POL': '🇵🇱',
  'PRT': '🇵🇹',
  'ROU': '🇷🇴',
  'TUR': '🇹🇷',
  'BGR': '🇧🇬',
  'HRV': '🇭🇷',
  'CZE': '🇨🇿',
  'SVK': '🇸🇰',
  'NLD': '🇳🇱',
  'SWE': '🇸🇪',
  'FIN': '🇫🇮',
  'IRL': '🇮🇪',
  'AUT': '🇦🇹',
  'CHE': '🇨🇭',
  'LUX': '🇱🇺',
  'SVN': '🇸🇮',
  'BIH': '🇧🇦',
  'SRB': '🇷🇸',
  'MNE': '🇲🇪',
  'MKD': '🇲🇰',
  'ISL': '🇮🇸',
  'LTU': '🇱🇹',
  'LVA': '🇱🇻',
  'MDA': '🇲🇩',
  'UKR': '🇺🇦',
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
  isLoading,
  hasApproximateCounts = false
}: FacetSectionProps & { hasApproximateCounts?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(group.defaultExpanded ?? true);
  const [showAll, setShowAll] = useState(false);

  const visibleItems = group.showMore && !showAll
    ? group.items.slice(0, group.initialVisible || 5)
    : group.items;

  const hasMore = group.showMore && group.items.length > (group.initialVisible || 5);
  const activeCount = selectedValues.length;

  return (
    <div className="border-b border-gray-200/60 dark:border-gray-700/60 last:border-b-0">
      {/* Section Header - 2025 Modern Design */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-all duration-200 group"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Icon with dynamic styling */}
          <div className={`p-1.5 rounded-lg transition-all duration-200 flex-shrink-0 ${
            activeCount > 0
              ? 'bg-blue-100 dark:bg-blue-900/30 shadow-sm'
              : 'bg-gray-100 dark:bg-gray-800/50 group-hover:bg-gray-200 dark:group-hover:bg-gray-700/50'
          }`}>
            {group.icon}
          </div>

          {/* Title and metadata */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-800 dark:text-gray-200 tracking-tight truncate">
                {group.label}
              </span>

              {/* Active count badge */}
              {activeCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="px-2 py-0.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-xs font-bold rounded-full shadow-sm"
                >
                  {activeCount}
                </motion.span>
              )}

              {/* Total count */}
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {group.items.reduce((sum, item) => sum + item.count, 0).toLocaleString()}
              </span>
            </div>

            {/* Contextual subtitle */}
            {activeCount > 0 && (
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 truncate">
                {activeCount === 1 ? '1 filter active' : `${activeCount} filters active`}
              </div>
            )}
          </div>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors flex-shrink-0 ml-2"
        >
          <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" strokeWidth={2.5} />
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
            <div className="px-5 pb-4">

              {/* Filter items */}
              <div className="space-y-1">
                {visibleItems.map((item) => {
                const isSelected = selectedValues.includes(item.value);
                const isHighlighted = userHighlight.includes(item.value);
                const itemColor = CLASSIFICATION_COLORS[item.value] || '';
                const itemIcon = item.icon || CLASSIFICATION_ICONS[item.value] || INSTANCE_FLAGS[item.value];

                // Determine if this filter type should use color-coded design
                const isClassification = group.id === 'classifications';
                const hasColorCoding = isClassification && itemColor;

                // Modern 2025 Compact Pill/Chip Design - Applied to ALL filters
                return (
                  <motion.button
                    key={item.value}
                    onClick={() => onToggle(item.value)}
                    disabled={item.disabled || isLoading}
                    whileHover={!item.disabled && !isLoading ? { scale: 1.01 } : {}}
                    whileTap={!item.disabled && !isLoading ? { scale: 0.99 } : {}}
                    className={`
                      w-full relative overflow-hidden rounded-xl transition-all duration-200 touch-manipulation
                      ${isSelected
                        ? hasColorCoding
                          ? `${itemColor} border-2 border-current shadow-md shadow-current/15`
                          : 'bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-900/40 dark:to-blue-800/30 border-2 border-blue-400/60 dark:border-blue-500/60 shadow-md'
                        : 'bg-white dark:bg-gray-800/50 border-2 border-gray-200/60 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
                      }
                      ${item.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                      ${isHighlighted && !isSelected ? 'ring-1 ring-green-400/60 ring-offset-1 dark:ring-green-500/60' : ''}
                    `}
                  >
                    {/* Gradient overlay for selected state */}
                    {isSelected && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`absolute inset-0 pointer-events-none ${
                          hasColorCoding
                            ? 'bg-gradient-to-br from-white/15 to-transparent'
                            : 'bg-gradient-to-br from-blue-50/30 to-transparent'
                        }`}
                      />
                    )}

                    <div className="relative px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {/* Color indicator dot - compact */}
                        {hasColorCoding ? (
                          <motion.div
                            className={`
                              w-2 h-2 rounded-full flex-shrink-0
                              ${isSelected
                                ? 'ring-1 ring-white/60'
                                : 'ring-1 ring-gray-300 dark:ring-gray-600'
                              }
                            `}
                            style={{
                              backgroundColor: isSelected
                                ? (item.value === 'UNCLASSIFIED' ? '#10b981' :
                                   item.value === 'CONFIDENTIAL' ? '#f59e0b' :
                                   item.value === 'SECRET' ? '#f97316' :
                                   item.value === 'TOP_SECRET' ? '#ef4444' : '#3b82f6')
                                : 'transparent',
                              borderColor: !isSelected
                                ? (item.value === 'UNCLASSIFIED' ? '#10b981' :
                                   item.value === 'CONFIDENTIAL' ? '#f59e0b' :
                                   item.value === 'SECRET' ? '#f97316' :
                                   item.value === 'TOP_SECRET' ? '#ef4444' : '#6b7280')
                                : 'transparent',
                              borderWidth: !isSelected ? '2px' : '0',
                            }}
                            animate={isSelected ? { scale: [1, 1.15, 1] } : {}}
                            transition={{ duration: 0.2 }}
                          />
                        ) : (
                          // Checkmark indicator for non-color-coded filters
                          <motion.div
                            className={`
                              w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 transition-all duration-200
                              ${isSelected
                                ? 'bg-gradient-to-br from-blue-600 to-blue-500 shadow-sm'
                                : 'border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                              }
                            `}
                            animate={isSelected ? { scale: [1, 1.1, 1] } : {}}
                            transition={{ duration: 0.2 }}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                          </motion.div>
                        )}

                        {/* Icon - compact */}
                        {itemIcon && (
                          <span className="text-base flex-shrink-0 leading-none">{itemIcon}</span>
                        )}

                        {/* Label - compact typography */}
                        <span className={`text-xs font-bold tracking-tight ${
                          isSelected
                            ? hasColorCoding ? 'text-current' : 'text-gray-900 dark:text-gray-100'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          {item.label}
                        </span>

                        {/* User badge - compact */}
                        {isHighlighted && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="flex-shrink-0 px-1.5 py-0.5 text-[9px] font-black bg-gradient-to-r from-green-500 to-green-600 text-white rounded-md shadow-sm uppercase tracking-wider"
                          >
                            You
                          </motion.span>
                        )}
                      </div>

                        {/* Count badge - compact */}
                      <motion.div
                        className={`
                          ml-2 px-2 py-0.5 rounded-lg text-xs font-bold flex-shrink-0 min-w-[2.25rem] text-center
                          ${isSelected
                            ? hasColorCoding
                              ? 'bg-white/90 text-current shadow-sm'
                              : 'bg-blue-600/15 text-blue-700 dark:text-blue-300 shadow-sm'
                            : 'bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-400'
                          }
                          ${isLoading ? 'animate-pulse' : ''}
                        `}
                        whileHover={!isLoading ? { scale: 1.05 } : {}}
                      >
                        {item.count.toLocaleString()}
                      </motion.div>
                    </div>

                    {/* Selected indicator - compact checkmark overlay (only for non-color-coded) */}
                    {isSelected && !hasColorCoding && (
                      <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        className="absolute top-1.5 right-1.5 w-4 h-4 bg-white/90 rounded-full flex items-center justify-center shadow-md"
                      >
                        <Check className="w-2.5 h-2.5 text-blue-600" strokeWidth={3} />
                      </motion.div>
                    )}
                  </motion.button>
                );
                })}
              </div>

              {/* Show more/less - Enhanced */}
              {hasMore && (
                <motion.button
                  onClick={() => setShowAll(!showAll)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full px-4 py-2.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold flex items-center justify-center gap-2 hover:bg-gradient-to-r hover:from-blue-50 hover:to-blue-100/50 dark:hover:from-blue-900/20 dark:hover:to-blue-800/10 rounded-xl transition-all duration-200 border border-transparent hover:border-blue-200/50 dark:hover:border-blue-700/50"
                >
                  {showAll ? (
                    <>
                      <Minus className="w-4 h-4" strokeWidth={2.5} />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                      Show {group.items.length - (group.initialVisible || 5)} more
                    </>
                  )}
                </motion.button>
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
  const { t } = useTranslation('resources');

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

  const facetGroups: FacetGroup[] = useMemo(() => [
    {
      id: 'classifications',
      label: t('filters.classification'),
      icon: <Shield className="w-4 h-4" />,
      items: filterZeroCounts(facets.classifications),
      type: 'multi' as const,
      defaultExpanded: true,
    },
    {
      id: 'countries',
      label: t('filters.releasability'),
      icon: <Globe2 className="w-4 h-4" />,
      items: filterZeroCounts(facets.countries),
      type: 'multi' as const,
      defaultExpanded: false,
      showMore: true,
      initialVisible: 6,
    },
    {
      id: 'cois',
      label: t('filters.coi'),
      icon: <Users className="w-4 h-4" />,
      items: filterZeroCounts(facets.cois),
      type: 'multi' as const,
      defaultExpanded: false,
      showMore: true,
      initialVisible: 5,
    },
    {
      id: 'encryptionStatus',
      label: t('filters.encrypted'),
      icon: <Lock className="w-4 h-4" />,
      items: filterZeroCounts(facets.encryptionStatus),
      type: 'multi' as const,
      defaultExpanded: false,
    },
  ], [facets, filterZeroCounts, t]);


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
      instances: [], // Keep for compatibility with filtering logic
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
    encryptionStatus: [],
  }), [userAttributes]);

  // Guard against undefined counts to keep render safe during loading/tests
  const safeFilteredCount = typeof filteredCount === 'number' ? filteredCount : 0;
  const safeTotalCount = typeof totalCount === 'number' ? totalCount : 0;

  return (
    <div className={`bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 rounded-2xl shadow-lg backdrop-blur-sm ${className}`} style={{ boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
      {/* Header - 2025 Modern Design */}
      <div className="px-5 py-4 bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-800 dark:via-gray-800/50 dark:to-gray-800 border-b border-gray-200/80 dark:border-gray-700/80">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30">
              <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" strokeWidth={2.5} />
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 tracking-tight">{t('filters.title')}</h3>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-xs font-bold rounded-full shadow-sm animate-pulse">
                {activeFilterCount}
              </span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold px-2 py-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Results summary - Enhanced typography */}
        <div className="text-xs text-gray-600 dark:text-gray-400">
          Showing <span className="font-bold text-gray-900 dark:text-gray-100">{safeFilteredCount.toLocaleString()}</span> of{' '}
          <span className="font-bold text-gray-900 dark:text-gray-100">{safeTotalCount.toLocaleString()}</span> resources
        </div>
      </div>

      {/* Active Filter Chips - 2025 Modern Design */}
      {activeFilterChips.length > 0 && (
        <div className="px-5 py-3.5 bg-gradient-to-r from-blue-50/80 via-blue-50/50 to-transparent dark:from-blue-900/20 dark:via-blue-900/10 border-b border-blue-100/50 dark:border-gray-700/80">
          <div className="flex flex-wrap gap-2">
            {activeFilterChips.map((chip, idx) => (
              <motion.span
                key={`${chip.group}-${chip.value}-${idx}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-blue-200/60 dark:border-blue-700/60 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300 shadow-sm hover:shadow-md transition-all group"
              >
                {chip.label}
                <button
                  onClick={() => handleToggle(chip.group, chip.value)}
                  className="p-0.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors group-hover:scale-110"
                  aria-label={`Remove ${chip.label} filter`}
                >
                  <X className="w-3 h-3 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors" strokeWidth={2.5} />
                </button>
              </motion.span>
            ))}
          </div>
        </div>
      )}

      {/* Facet Sections */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {facetGroups.every(group => group.items.length === 0) ? (
          <div className="px-5 py-8 text-center">
            <div className="text-gray-400 dark:text-gray-500 mb-2">
              <Filter className="w-8 h-8 mx-auto opacity-50" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              No filters available
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Try adjusting your search criteria
            </p>
          </div>
        ) : (
          facetGroups.map((group) => (
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
        ))
        )}

        {/* Date Range Filter Section - Enhanced */}
        <div className="border-b border-gray-200/60 dark:border-gray-700/60 last:border-b-0">
          <div className="px-5 py-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-1 rounded-md bg-gray-100 dark:bg-gray-800/50">
                <Calendar className="w-4 h-4 text-gray-600 dark:text-gray-400" strokeWidth={2.5} />
              </div>
              <span className="text-sm font-bold text-gray-800 dark:text-gray-200 tracking-tight">
                {t('dateRange.creationDate')}
              </span>
              {selectedFilters.dateRange && (
                <span className="ml-1 px-2 py-0.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-xs font-bold rounded-full shadow-sm">
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

      {/* Footer with keyboard hint - Enhanced */}
      <div className="px-5 py-3 bg-gradient-to-br from-gray-50/80 to-transparent dark:from-gray-800/30 dark:to-transparent border-t border-gray-200/60 dark:border-gray-700/60">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Press <kbd className="px-2 py-1 bg-white dark:bg-gray-700 rounded-md border border-gray-300/60 dark:border-gray-600/60 font-mono text-xs shadow-sm">⌘K</kbd> for quick search
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

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

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
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-white dark:bg-gray-800 rounded-full shadow-lg z-10"
              aria-label="Close filters"
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
  const { t } = useTranslation('resources');

  return (
    <button
      onClick={onClick}
      className="lg:hidden flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
    >
      <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('filters.title')}</span>
      {activeCount > 0 && (
        <span className="px-1.5 py-0.5 bg-blue-600 text-white text-xs font-bold rounded-full">
          {activeCount}
        </span>
      )}
    </button>
  );
}
