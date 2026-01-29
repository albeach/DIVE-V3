/**
 * Command Palette Context - Global state management for admin command palette
 *
 * Features:
 * - Global open/close state
 * - Recent history persistence (localStorage)
 * - Custom command registry
 * - Recent pages tracking
 *
 * @version 1.0.0
 * @date 2026-01-29
 */

'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AdminNavItem } from '@/config/admin-navigation';

const RECENT_HISTORY_KEY = 'dive-admin-command-palette-recent';
const MAX_RECENT_ITEMS = 10;

interface RecentItem {
  id: string;
  label: string;
  href: string;
  timestamp: number;
}

interface CommandPaletteContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  recentItems: RecentItem[];
  addRecentItem: (item: Omit<RecentItem, 'timestamp'>) => void;
  clearRecentHistory: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | undefined>(undefined);

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const pathname = usePathname();

  // Load recent history from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(RECENT_HISTORY_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setRecentItems(parsed);
        }
      } catch (error) {
        console.error('Failed to load recent history:', error);
      }
    }
  }, []);

  // Save recent history to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && recentItems.length > 0) {
      try {
        localStorage.setItem(RECENT_HISTORY_KEY, JSON.stringify(recentItems));
      } catch (error) {
        console.error('Failed to save recent history:', error);
      }
    }
  }, [recentItems]);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const addRecentItem = useCallback((item: Omit<RecentItem, 'timestamp'>) => {
    setRecentItems((prev) => {
      // Remove duplicate if exists
      const filtered = prev.filter((i) => i.id !== item.id);

      // Add new item at the beginning
      const updated = [
        { ...item, timestamp: Date.now() },
        ...filtered,
      ];

      // Keep only MAX_RECENT_ITEMS
      return updated.slice(0, MAX_RECENT_ITEMS);
    });
  }, []);

  const clearRecentHistory = useCallback(() => {
    setRecentItems([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(RECENT_HISTORY_KEY);
    }
  }, []);

  const value: CommandPaletteContextValue = {
    isOpen,
    open,
    close,
    toggle,
    recentItems,
    addRecentItem,
    clearRecentHistory,
  };

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPaletteContext() {
  const context = useContext(CommandPaletteContext);
  if (context === undefined) {
    throw new Error('useCommandPaletteContext must be used within CommandPaletteProvider');
  }
  return context;
}
