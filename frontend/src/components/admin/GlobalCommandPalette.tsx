/**
 * Global Command Palette - Cmd+K admin navigation
 *
 * Features:
 * - Fuzzy search across all 25 admin pages
 * - Quick actions for common tasks
 * - Recent pages history (last 10)
 * - Category filtering
 * - Keyboard navigation
 * - Mobile responsive
 *
 * @version 1.0.0
 * @date 2026-01-29
 */

'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Search,
  X,
  Clock,
  ChevronRight,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import {
  getAdminNavigation,
  searchNavigation,
  getQuickActions,
  getNavItemById,
  AdminNavItem,
  NavCategory,
} from '@/config/admin-navigation';
import { useCommandPaletteContext } from '@/contexts/CommandPaletteContext';
import { Badge } from '@/components/ui/badge';
import { adminAnimations, adminZIndex } from '@/components/admin/shared/theme-tokens';

interface GlobalCommandPaletteProps {
  user?: {
    roles?: string[];
    clearance?: string;
    countryOfAffiliation?: string;
  };
  instanceType?: 'hub' | 'spoke';
}

const CATEGORY_LABELS: Record<NavCategory, string> = {
  overview: 'Overview',
  identity: 'Identity & Access',
  federation: 'Federation',
  policy: 'Policy & Authorization',
  security: 'Security & Certificates',
  audit: 'Audit & Compliance',
  system: 'System & Configuration',
};

/**
 * Global Command Palette Component
 *
 * @example
 * ```tsx
 * <GlobalCommandPalette
 *   user={{ roles: ['hub_admin'], clearance: 'SECRET' }}
 *   instanceType="hub"
 * />
 * ```
 */
export function GlobalCommandPalette({ user, instanceType = 'hub' }: GlobalCommandPaletteProps) {
  const router = useRouter();
  const { isOpen, close, recentItems, addRecentItem, clearRecentHistory } = useCommandPaletteContext();

  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get filtered navigation items
  const allNavItems = useMemo(() => {
    return getAdminNavigation({
      roles: user?.roles || [],
      clearance: user?.clearance,
      countryOfAffiliation: user?.countryOfAffiliation,
      instanceType,
    });
  }, [user, instanceType]);

  // Flatten navigation items (including children)
  const flattenedNavItems = useMemo(() => {
    const flatten = (items: AdminNavItem[]): AdminNavItem[] => {
      return items.flatMap((item) => [
        item,
        ...(item.children ? flatten(item.children) : []),
      ]);
    };
    return flatten(allNavItems);
  }, [allNavItems]);

  // Get quick actions
  const quickActions = useMemo(() => {
    return getQuickActions({
      roles: user?.roles || [],
      instanceType,
    });
  }, [user, instanceType]);

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!search.trim()) {
      return flattenedNavItems;
    }

    const query = search.toLowerCase();
    return flattenedNavItems.filter((item) => {
      // Search in label
      if (item.label.toLowerCase().includes(query)) return true;

      // Search in description
      if (item.description.toLowerCase().includes(query)) return true;

      // Search in keywords
      if (item.searchKeywords?.some((kw) => kw.toLowerCase().includes(query))) return true;

      // Search in category
      if (item.category && CATEGORY_LABELS[item.category].toLowerCase().includes(query)) return true;

      return false;
    });
  }, [flattenedNavItems, search]);

  // Group items by category
  const groupedItems = useMemo(() => {
    const groups: Record<string, AdminNavItem[]> = {
      recent: [],
      quickActions: [],
    };

    // Add recent items (only if no search)
    if (!search.trim()) {
      recentItems.forEach((recent) => {
        const navItem = flattenedNavItems.find((item) => item.href === recent.href);
        if (navItem) {
          groups.recent.push(navItem);
        }
      });

      // Add quick actions
      groups.quickActions = quickActions;
    }

    // Group filtered items by category
    filteredItems.forEach((item) => {
      const category = item.category || 'system';
      if (!groups[category]) {
        groups[category] = [];
      }
      // Avoid duplicates in recent
      if (!groups.recent.some((r) => r.id === item.id)) {
        groups[category].push(item);
      }
    });

    return groups;
  }, [search, filteredItems, recentItems, quickActions, flattenedNavItems]);

  // Get all items in display order for keyboard navigation
  const allDisplayItems = useMemo(() => {
    const items: AdminNavItem[] = [];

    if (groupedItems.recent.length > 0) {
      items.push(...groupedItems.recent);
    }

    if (groupedItems.quickActions && groupedItems.quickActions.length > 0) {
      items.push(...groupedItems.quickActions);
    }

    // Add categorized items
    Object.keys(groupedItems).forEach((key) => {
      if (key !== 'recent' && key !== 'quickActions') {
        items.push(...groupedItems[key]);
      }
    });

    return items;
  }, [groupedItems]);

  // Handle item selection
  const handleSelectItem = useCallback((item: AdminNavItem) => {
    // Add to recent history
    addRecentItem({
      id: item.id,
      label: item.label,
      href: item.href,
    });

    // Navigate
    router.push(item.href);

    // Close palette
    close();
    setSearch('');
    setSelectedIndex(0);
  }, [addRecentItem, router, close]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Arrow Down
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % allDisplayItems.length);
      }

      // Arrow Up
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + allDisplayItems.length) % allDisplayItems.length);
      }

      // Enter
      if (e.key === 'Enter' && allDisplayItems[selectedIndex]) {
        e.preventDefault();
        handleSelectItem(allDisplayItems[selectedIndex]);
      }

      // Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        setSearch('');
        setSelectedIndex(0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, allDisplayItems, selectedIndex, handleSelectItem, close]);

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        {...adminAnimations.fadeIn}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        style={{ zIndex: adminZIndex.commandPalette - 1 }}
        onClick={close}
        aria-hidden="true"
      />

      {/* Command Palette Modal */}
      <div
        className="fixed inset-0 flex items-start justify-center pt-[15vh] px-4"
        style={{ zIndex: adminZIndex.commandPalette }}
      >
        <motion.div
          {...adminAnimations.slideUp}
          className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden"
        >
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-slate-700">
            <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search admin pages, actions, or type a keyword..."
              className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none text-sm"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Clear search"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center px-2 py-1 text-xs font-mono text-gray-500 bg-gray-100 dark:bg-slate-800 dark:text-gray-400 rounded">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-96 overflow-y-auto">
            {allDisplayItems.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {search ? `No results found for "${search}"` : 'No admin pages available'}
              </div>
            ) : (
              <>
                {/* Recent Items */}
                {groupedItems.recent && groupedItems.recent.length > 0 && (
                  <div className="px-2 py-2">
                    <div className="flex items-center justify-between px-2 py-1">
                      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        Recent Pages
                      </div>
                      <button
                        onClick={() => clearRecentHistory()}
                        className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                    {groupedItems.recent.map((item) => {
                      const globalIndex = allDisplayItems.indexOf(item);
                      const isSelected = globalIndex === selectedIndex;
                      return (
                        <CommandItem
                          key={item.id}
                          item={item}
                          isSelected={isSelected}
                          onClick={() => handleSelectItem(item)}
                          prefix={<Clock className="h-4 w-4 text-gray-400" />}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Quick Actions */}
                {groupedItems.quickActions && groupedItems.quickActions.length > 0 && (
                  <div className="px-2 py-2 border-t border-gray-200 dark:border-slate-700">
                    <div className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Quick Actions
                    </div>
                    {groupedItems.quickActions.map((item) => {
                      const globalIndex = allDisplayItems.indexOf(item);
                      const isSelected = globalIndex === selectedIndex;
                      return (
                        <CommandItem
                          key={item.id}
                          item={item}
                          isSelected={isSelected}
                          onClick={() => handleSelectItem(item)}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Categorized Items */}
                {Object.keys(CATEGORY_LABELS).map((category) => {
                  const items = groupedItems[category];
                  if (!items || items.length === 0) return null;

                  return (
                    <div key={category} className="px-2 py-2 border-t border-gray-200 dark:border-slate-700">
                      <div className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        {CATEGORY_LABELS[category as NavCategory]}
                      </div>
                      {items.map((item) => {
                        const globalIndex = allDisplayItems.indexOf(item);
                        const isSelected = globalIndex === selectedIndex;
                        return (
                          <CommandItem
                            key={item.id}
                            item={item}
                            isSelected={isSelected}
                            onClick={() => handleSelectItem(item)}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded">↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded">↵</kbd>
                select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded">/</kbd>
                search
              </span>
            </div>
            <span className="hidden md:inline">Admin Command Palette</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

/**
 * Command Item Component
 */
interface CommandItemProps {
  item: AdminNavItem;
  isSelected: boolean;
  onClick: () => void;
  prefix?: React.ReactNode;
}

function CommandItem({ item, isSelected, onClick, prefix }: CommandItemProps) {
  const Icon = item.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors',
        isSelected
          ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-100'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800'
      )}
    >
      {prefix || <Icon className="h-5 w-5 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate flex items-center gap-2">
          {item.label}
          {item.badge && (
            <Badge variant="warning" size="xs">
              {item.badge}
            </Badge>
          )}
          {item.betaFeature && (
            <Badge variant="info" size="xs">
              BETA
            </Badge>
          )}
        </div>
        {item.description && (
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {item.description}
          </div>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
    </button>
  );
}

export default GlobalCommandPalette;
