/**
 * InteractiveBreadcrumbs Component
 *
 * Breadcrumb navigation with:
 * - Dropdown on hover showing sibling pages
 * - Keyboard arrow key navigation
 * - Data sourced from admin-navigation.ts SSOT
 * - Respects prefers-reduced-motion
 *
 * @version 1.0.0
 * @date 2026-01-31
 */

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ADMIN_NAVIGATION, type AdminNavItem } from '@/config/admin-navigation';

export interface BreadcrumbSegment {
  label: string;
  href: string | null;
  siblings?: { label: string; href: string; icon?: React.ComponentType<{ className?: string }> }[];
}

/**
 * Build breadcrumbs from the current path using admin-navigation.ts
 */
function buildBreadcrumbs(pathname: string): BreadcrumbSegment[] {
  const crumbs: BreadcrumbSegment[] = [
    { label: 'Admin', href: '/admin/dashboard', siblings: [] },
  ];

  // Find the matching nav item and build path
  function findInTree(items: AdminNavItem[], depth: number): boolean {
    for (const item of items) {
      if (pathname === item.href || pathname.startsWith(item.href + '/')) {
        const siblings = items
          .filter(i => !i.hidden)
          .map(i => ({ label: i.label, href: i.href, icon: i.icon }));

        crumbs.push({
          label: item.label,
          href: pathname === item.href ? null : item.href,
          siblings,
        });

        if (item.children && item.children.length > 0) {
          findInTree(item.children, depth + 1);
        }

        return true;
      }
    }
    return false;
  }

  // Populate top-level siblings
  crumbs[0].siblings = ADMIN_NAVIGATION
    .filter(i => !i.hidden)
    .map(i => ({ label: i.label, href: i.href, icon: i.icon }));

  findInTree(ADMIN_NAVIGATION, 0);

  return crumbs;
}

export interface InteractiveBreadcrumbsProps {
  className?: string;
}

export function InteractiveBreadcrumbs({ className }: InteractiveBreadcrumbsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const [focusedItem, setFocusedItem] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const crumbs = buildBreadcrumbs(pathname);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number, siblings?: BreadcrumbSegment['siblings']) => {
    if (!siblings || siblings.length === 0) return;

    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpenDropdown(index);
      setFocusedItem(0);
    } else if (e.key === 'Escape') {
      setOpenDropdown(null);
    } else if (e.key === 'ArrowLeft' && index > 0) {
      setOpenDropdown(null);
    } else if (e.key === 'ArrowRight' && index < crumbs.length - 1) {
      setOpenDropdown(null);
    }
  }, [crumbs.length]);

  const handleDropdownKeyDown = useCallback((e: React.KeyboardEvent, siblings: BreadcrumbSegment['siblings']) => {
    if (!siblings) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedItem(prev => Math.min(prev + 1, siblings.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedItem(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      router.push(siblings[focusedItem].href);
      setOpenDropdown(null);
    } else if (e.key === 'Escape') {
      setOpenDropdown(null);
    }
  }, [focusedItem, router]);

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex items-center text-sm', className)}
      ref={dropdownRef}
    >
      <ol className="flex items-center gap-1">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          const hasSiblings = crumb.siblings && crumb.siblings.length > 1;

          return (
            <li key={i} className="flex items-center gap-1 relative">
              {i > 0 && (
                <ChevronRight className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              )}

              {isLast ? (
                <span
                  className="font-medium text-gray-900 dark:text-gray-100 px-1.5 py-1 rounded"
                  aria-current="page"
                >
                  {crumb.label}
                </span>
              ) : (
                <button
                  className={cn(
                    'px-1.5 py-1 rounded text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200',
                    'hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
                    hasSiblings && 'cursor-pointer',
                  )}
                  onClick={() => {
                    if (hasSiblings) {
                      setOpenDropdown(openDropdown === i ? null : i);
                      setFocusedItem(0);
                    } else if (crumb.href) {
                      router.push(crumb.href);
                    }
                  }}
                  onKeyDown={(e) => handleKeyDown(e, i, crumb.siblings)}
                  aria-haspopup={hasSiblings ? 'true' : undefined}
                  aria-expanded={openDropdown === i ? 'true' : undefined}
                >
                  {crumb.label}
                  {hasSiblings && (
                    <ChevronRight className={cn(
                      'inline-block ml-0.5 h-3 w-3 transition-transform',
                      openDropdown === i && 'rotate-90',
                    )} />
                  )}
                </button>
              )}

              {/* Sibling dropdown */}
              <AnimatePresence>
                {openDropdown === i && hasSiblings && crumb.siblings && (
                  <motion.div
                    initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 mt-1 z-50 min-w-[200px] bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 py-1 overflow-hidden"
                    onKeyDown={(e) => handleDropdownKeyDown(e, crumb.siblings)}
                    role="menu"
                  >
                    {crumb.siblings.map((sibling, si) => {
                      const SiblingIcon = sibling.icon;
                      return (
                        <button
                          key={sibling.href}
                          className={cn(
                            'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                            si === focusedItem
                              ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700',
                            pathname === sibling.href && 'font-medium',
                          )}
                          onClick={() => {
                            router.push(sibling.href);
                            setOpenDropdown(null);
                          }}
                          role="menuitem"
                          tabIndex={si === focusedItem ? 0 : -1}
                        >
                          {SiblingIcon && <SiblingIcon className="h-4 w-4 flex-shrink-0" />}
                          <span>{sibling.label}</span>
                          {pathname === sibling.href && (
                            <span className="ml-auto text-indigo-500 dark:text-indigo-400 text-xs">current</span>
                          )}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
