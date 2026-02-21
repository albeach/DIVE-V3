/**
 * Breadcrumbs Component - Phase 3
 *
 * Features:
 * - Show breadcrumb trail on detail pages
 * - Clickable parent navigation
 * - Current page indicator (not clickable)
 * - Truncate long titles
 * - Classification badge support
 * - Mobile responsive
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { Home, ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
  classification?: string;
  translate?: boolean; // Whether label is a translation key
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * Truncate text to max length with ellipsis
 */
function truncate(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Classification badge colors
 */
function classificationColor(classification: string): string {
  switch (classification.toUpperCase()) {
    case 'TOP_SECRET':
    case 'TOP SECRET':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'SECRET':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    case 'CONFIDENTIAL':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center space-x-2 text-sm ${className}`}
    >
      {/* Home icon */}
      <Link
        href="/dashboard"
        className={`flex items-center text-gray-500 hover:text-[#4497ac] dark:text-gray-400
                   dark:hover:text-[#4497ac] transition-colors`}
        aria-label="Home"
      >
        <Home className="h-4 w-4" />
      </Link>

      {/* Breadcrumb items */}
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const displayLabel = truncate(item.label);

        return (
          <React.Fragment key={`${item.href}-${index}`}>
            {/* Separator */}
            <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" />

            {/* Item */}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className={`flex items-center gap-2 text-gray-600 hover:text-[#4497ac]
                           dark:text-gray-300 dark:hover:text-[#4497ac] transition-colors`}
              >
                {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                <span className="truncate max-w-[200px] sm:max-w-none">{displayLabel}</span>
                {item.classification && (
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded ${classificationColor(item.classification)}`}>
                    {item.classification}
                  </span>
                )}
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                <span className="text-gray-900 dark:text-gray-100 font-medium truncate max-w-[200px] sm:max-w-none">
                  {displayLabel}
                </span>
                {item.classification && (
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded ${classificationColor(item.classification)}`}>
                    {item.classification}
                  </span>
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/**
 * Compact breadcrumbs for mobile (show only last 2 items)
 */
export function CompactBreadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  const visibleItems = items.length > 2 ? items.slice(-2) : items;

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center space-x-2 text-sm ${className}`}
    >
      {/* Home icon */}
      <Link
        href="/dashboard"
        className="flex items-center text-gray-500 hover:text-[#4497ac] transition-colors"
        aria-label="Home"
      >
        <Home className="h-4 w-4" />
      </Link>

      {/* Show ellipsis if items were hidden */}
      {items.length > 2 && (
        <>
          <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
          <span className="text-gray-400">...</span>
        </>
      )}

      {/* Show last 2 items */}
      {visibleItems.map((item, index) => {
        const isLast = index === visibleItems.length - 1;
        const displayLabel = truncate(item.label, 30); // Shorter for mobile

        return (
          <React.Fragment key={`${item.href}-${index}`}>
            <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" />

            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-gray-600 hover:text-[#4497ac] transition-colors truncate"
              >
                {displayLabel}
              </Link>
            ) : (
              <span className="text-gray-900 font-medium truncate">
                {displayLabel}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
