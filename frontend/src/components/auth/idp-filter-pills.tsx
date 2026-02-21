"use client";

import { useState } from 'react';

export type FilterRegion = 'all' | 'fvey' | 'eu' | 'nato' | 'baltics' | 'mediterranean' | 'nordic';

interface IdPOption {
  alias: string;
  displayName: string;
  protocol: string;
  enabled: boolean;
}

interface RegionFilterDef {
  id: FilterRegion;
  label: string;
  icon: string;
  description: string;
  matcher: (idp: IdPOption) => boolean;
}

interface IdpFilterPillsProps {
  idps: IdPOption[];
  activeFilter: FilterRegion;
  onFilterChange: (filter: FilterRegion) => void;
}

/**
 * Regional groupings for NATO countries
 * Based on alliance memberships and geographic regions
 */
const REGION_FILTERS: RegionFilterDef[] = [
  {
    id: 'all',
    label: 'All Partners',
    icon: '🌐',
    description: 'All coalition partners',
    matcher: () => true,
  },
  {
    id: 'fvey',
    label: 'Five Eyes',
    icon: '👁️',
    description: 'USA, UK, Canada, Australia, New Zealand',
    matcher: (idp) => {
      const fveyCountries = ['usa', 'gbr', 'can', 'aus', 'nzl'];
      return fveyCountries.some(c => idp.alias.toLowerCase().includes(c));
    },
  },
  {
    id: 'eu',
    label: 'European Union',
    icon: '🇪🇺',
    description: 'EU member states',
    matcher: (idp) => {
      const euCountries = [
        'fra', 'deu', 'ita', 'esp', 'pol', 'nld', 'bel', 'grc', 'prt', 'cze',
        'hun', 'rou', 'bgr', 'svk', 'svn', 'hrv', 'dnk', 'fin', 'swe', 'aut',
        'irl', 'ltu', 'lva', 'est', 'lux', 'mlt', 'cyp'
      ];
      return euCountries.some(c => idp.alias.toLowerCase().includes(c));
    },
  },
  {
    id: 'nato',
    label: 'NATO Core',
    icon: '🛡️',
    description: 'Original NATO members',
    matcher: (idp) => {
      const natoCore = ['usa', 'gbr', 'fra', 'deu', 'ita', 'can', 'nld', 'bel', 'lux', 'nor', 'dnk', 'isl', 'prt'];
      return natoCore.some(c => idp.alias.toLowerCase().includes(c));
    },
  },
  {
    id: 'baltics',
    label: 'Baltics',
    icon: '⚡',
    description: 'Estonia, Latvia, Lithuania',
    matcher: (idp) => {
      const baltics = ['est', 'lva', 'ltu'];
      return baltics.some(c => idp.alias.toLowerCase().includes(c));
    },
  },
  {
    id: 'mediterranean',
    label: 'Mediterranean',
    icon: '🌊',
    description: 'Southern European partners',
    matcher: (idp) => {
      const med = ['ita', 'esp', 'grc', 'tur', 'prt', 'fra', 'alb', 'mne', 'hrv', 'svn'];
      return med.some(c => idp.alias.toLowerCase().includes(c));
    },
  },
  {
    id: 'nordic',
    label: 'Nordic',
    icon: '❄️',
    description: 'Northern European partners',
    matcher: (idp) => {
      const nordic = ['nor', 'dnk', 'swe', 'fin', 'isl'];
      return nordic.some(c => idp.alias.toLowerCase().includes(c));
    },
  },
];

/**
 * Regional Filter Pills Component
 *
 * Features:
 * - Animated filter chips with counts
 * - Active state with gradient background
 * - Smooth transitions on filter change
 * - Responsive layout (horizontal scroll on mobile)
 * - Accessibility support
 */
export function IdpFilterPills({ idps, activeFilter, onFilterChange }: IdpFilterPillsProps) {
  const [hoveredFilter, setHoveredFilter] = useState<FilterRegion | null>(null);

  // Calculate count for each filter
  const getFilterCount = (filter: RegionFilterDef): number => {
    return idps.filter(filter.matcher).length;
  };

  return (
    <div className="relative" style={{ zIndex: 1 }}>
      {/* Filter Pills Container */}
      <div className="relative" style={{ zIndex: 1 }}>
        {/* Horizontal scroll wrapper for mobile */}
        <div className="overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-2 md:flex-wrap md:justify-center min-w-max md:min-w-0">
            {REGION_FILTERS.map((filter) => {
              const count = getFilterCount(filter);
              const isActive = activeFilter === filter.id;
              const isHovered = hoveredFilter === filter.id;

              // Skip filters with 0 results
              if (count === 0 && filter.id !== 'all') {
                return null;
              }

              return (
                <button
                  key={filter.id}
                  onClick={() => onFilterChange(filter.id)}
                  onMouseEnter={() => setHoveredFilter(filter.id)}
                  onMouseLeave={() => setHoveredFilter(null)}
                  className={`
                    relative group flex items-center gap-1.5 px-3 py-1.5 rounded-full
                    font-medium text-xs transition-all duration-300 whitespace-nowrap
                    ${isActive
                      ? 'bg-gradient-to-r from-[#009ab3] to-[#79d85a] text-white shadow-lg scale-105'
                      : 'bg-white/80 backdrop-blur-sm text-gray-700 border border-gray-200 hover:border-[#009ab3] hover:shadow-md hover:scale-102'
                    }
                  `}
                  aria-label={`Filter by ${filter.label}: ${count} partners`}
                  aria-pressed={isActive}
                  title={filter.description}
                >
                  {/* Animated glow effect for active filter */}
                  {isActive && (
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#009ab3] to-[#79d85a] opacity-50 blur animate-pulse" />
                  )}

                  {/* Content */}
                  <div className="relative flex items-center gap-2">
                    {/* Icon */}
                    <span className={`text-sm transition-transform duration-300 ${isActive || isHovered ? 'scale-110' : ''}`}>
                      {filter.icon}
                    </span>

                    {/* Label */}
                    <span className="font-semibold">
                      {filter.label}
                    </span>

                    {/* Count Badge */}
                    <span
                      className={`
                        px-1.5 py-0.5 rounded-full text-[10px] font-bold transition-all duration-300
                        ${isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-gray-100 text-gray-600 group-hover:bg-[#009ab3]/10 group-hover:text-[#009ab3]'
                        }
                      `}
                    >
                      {count}
                    </span>
                  </div>

                  {/* Hover tooltip (desktop only) */}
                  {isHovered && !isActive && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl whitespace-nowrap z-10 animate-fade-in hidden md:block">
                      {filter.description}
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scroll indicators for mobile */}
        <div className="md:hidden absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent pointer-events-none" />
        <div className="md:hidden absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none" />
      </div>

      {/* Active filter description (mobile) */}
      {activeFilter !== 'all' && (
        <div className="mt-3 text-center md:hidden animate-fade-in">
          <p className="text-xs text-gray-500">
            {REGION_FILTERS.find(f => f.id === activeFilter)?.description}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Get filtered IdPs based on active region
 */
export function filterIdPsByRegion(idps: IdPOption[], region: FilterRegion): IdPOption[] {
  const filter = REGION_FILTERS.find(f => f.id === region);
  if (!filter) return idps;
  return idps.filter(filter.matcher);
}

export default IdpFilterPills;

