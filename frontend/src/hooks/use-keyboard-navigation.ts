/**
 * useKeyboardNavigation - Global keyboard navigation hook for admin pages
 *
 * Shortcuts:
 *   j/k         - Navigate lists (next/prev)
 *   Enter       - Select focused item
 *   /           - Focus search input
 *   ?           - Open shortcuts help modal
 *   g then d    - Go to dashboard
 *   g then u    - Go to users
 *   g then i    - Go to IdPs
 *   g then f    - Go to federation
 *   g then a    - Go to analytics
 *   g then c    - Go to compliance
 *   g then s    - Go to certificates (security)
 *   g then l    - Go to audit logs
 *   g then p    - Go to policies
 *   g then m    - Go to clearance management
 *   Escape      - Close modal / deselect
 *
 * @version 1.0.0
 * @date 2026-02-01
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface KeyboardShortcut {
  key: string;
  label: string;
  description: string;
  category: 'navigation' | 'list' | 'action' | 'modal';
  chord?: string;
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  // List navigation
  { key: 'j', label: 'j', description: 'Next item in list', category: 'list' },
  { key: 'k', label: 'k', description: 'Previous item in list', category: 'list' },
  { key: 'Enter', label: 'Enter', description: 'Select / open focused item', category: 'list' },
  { key: '/', label: '/', description: 'Focus search input', category: 'action' },
  { key: '?', label: '?', description: 'Open keyboard shortcuts help', category: 'modal' },
  { key: 'Escape', label: 'Esc', description: 'Close modal / deselect', category: 'modal' },

  // Go-to navigation (chord: g + key)
  { key: 'd', chord: 'g', label: 'g d', description: 'Go to Dashboard', category: 'navigation' },
  { key: 'u', chord: 'g', label: 'g u', description: 'Go to Users', category: 'navigation' },
  { key: 'i', chord: 'g', label: 'g i', description: 'Go to Identity Providers', category: 'navigation' },
  { key: 'f', chord: 'g', label: 'g f', description: 'Go to Federation', category: 'navigation' },
  { key: 'a', chord: 'g', label: 'g a', description: 'Go to Analytics', category: 'navigation' },
  { key: 'c', chord: 'g', label: 'g c', description: 'Go to Compliance', category: 'navigation' },
  { key: 's', chord: 'g', label: 'g s', description: 'Go to Certificates', category: 'navigation' },
  { key: 'l', chord: 'g', label: 'g l', description: 'Go to Audit Logs', category: 'navigation' },
  { key: 'p', chord: 'g', label: 'g p', description: 'Go to Policies', category: 'navigation' },
  { key: 'm', chord: 'g', label: 'g m', description: 'Go to Clearance Management', category: 'navigation' },
];

const GO_TO_ROUTES: Record<string, string> = {
  d: '/admin/dashboard',
  u: '/admin/users',
  i: '/admin/idp',
  f: '/admin/federation',
  a: '/admin/analytics/advanced',
  c: '/admin/compliance',
  s: '/admin/certificates',
  l: '/admin/audit-logs',
  p: '/admin/policies',
  m: '/admin/clearance-management',
};

interface UseKeyboardNavigationOptions {
  /** Total number of items in list */
  listLength?: number;
  /** Callback when selected index changes */
  onIndexChange?: (index: number) => void;
  /** Callback when Enter is pressed on an item */
  onSelect?: (index: number) => void;
  /** Callback when Escape is pressed */
  onEscape?: () => void;
  /** Callback when ? is pressed (open help) */
  onHelp?: () => void;
  /** CSS selector for the search input to focus on / */
  searchSelector?: string;
  /** Whether keyboard navigation is enabled */
  enabled?: boolean;
}

export function useKeyboardNavigation({
  listLength = 0,
  onIndexChange,
  onSelect,
  onEscape,
  onHelp,
  searchSelector = '[data-search-input]',
  enabled = true,
}: UseKeyboardNavigationOptions = {}) {
  const router = useRouter();
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const chordRef = useRef<string | null>(null);
  const chordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isInputFocused = useCallback(() => {
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName.toLowerCase();
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      (active as HTMLElement).isContentEditable
    );
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Don't intercept when inside form inputs (except for Escape)
      if (isInputFocused() && e.key !== 'Escape') return;

      // Chord handling: if 'g' was pressed, check for second key
      if (chordRef.current === 'g') {
        chordRef.current = null;
        if (chordTimeoutRef.current) {
          clearTimeout(chordTimeoutRef.current);
          chordTimeoutRef.current = null;
        }
        const route = GO_TO_ROUTES[e.key];
        if (route) {
          e.preventDefault();
          router.push(route);
          return;
        }
      }

      switch (e.key) {
        case 'g':
          // Start chord sequence
          e.preventDefault();
          chordRef.current = 'g';
          chordTimeoutRef.current = setTimeout(() => {
            chordRef.current = null;
          }, 1000);
          break;

        case 'j':
          e.preventDefault();
          if (listLength > 0) {
            const next = focusedIndex < listLength - 1 ? focusedIndex + 1 : 0;
            setFocusedIndex(next);
            onIndexChange?.(next);
          }
          break;

        case 'k':
          e.preventDefault();
          if (listLength > 0) {
            const prev = focusedIndex > 0 ? focusedIndex - 1 : listLength - 1;
            setFocusedIndex(prev);
            onIndexChange?.(prev);
          }
          break;

        case 'Enter':
          if (focusedIndex >= 0 && focusedIndex < listLength) {
            e.preventDefault();
            onSelect?.(focusedIndex);
          }
          break;

        case '/':
          e.preventDefault();
          const searchEl = document.querySelector(searchSelector) as HTMLElement;
          searchEl?.focus();
          break;

        case '?':
          e.preventDefault();
          setIsHelpOpen(true);
          onHelp?.();
          break;

        case 'Escape':
          e.preventDefault();
          if (isHelpOpen) {
            setIsHelpOpen(false);
          } else {
            setFocusedIndex(-1);
            onEscape?.();
          }
          break;
      }
    },
    [
      enabled,
      isInputFocused,
      focusedIndex,
      listLength,
      onIndexChange,
      onSelect,
      onEscape,
      onHelp,
      searchSelector,
      isHelpOpen,
      router,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (chordTimeoutRef.current) {
        clearTimeout(chordTimeoutRef.current);
      }
    };
  }, [handleKeyDown]);

  // Reset focused index when list length changes
  useEffect(() => {
    if (focusedIndex >= listLength) {
      setFocusedIndex(listLength > 0 ? listLength - 1 : -1);
    }
  }, [listLength, focusedIndex]);

  return {
    focusedIndex,
    setFocusedIndex,
    isHelpOpen,
    setIsHelpOpen,
    shortcuts: KEYBOARD_SHORTCUTS,
  };
}

export default useKeyboardNavigation;
