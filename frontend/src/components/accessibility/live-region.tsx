/**
 * Live Region Component - Phase 4 Accessibility
 * 
 * Provides screen reader announcements for dynamic content changes.
 * Implements WCAG 2.1 SC 4.1.3 (Status Messages) - Level AA
 * 
 * Features:
 * - Visually hidden but announced by screen readers
 * - Supports polite and assertive modes
 * - Queue management for multiple announcements
 */

'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

// ============================================
// Types
// ============================================

type Politeness = 'polite' | 'assertive' | 'off';

interface Announcement {
  id: string;
  message: string;
  politeness: Politeness;
  timestamp: number;
}

interface LiveRegionContextValue {
  /** Announce a message to screen readers */
  announce: (message: string, politeness?: Politeness) => void;
  /** Clear all announcements */
  clearAnnouncements: () => void;
}

// ============================================
// Context
// ============================================

const LiveRegionContext = createContext<LiveRegionContextValue | null>(null);

// ============================================
// Provider
// ============================================

interface LiveRegionProviderProps {
  children: React.ReactNode;
  /** Minimum time between announcements in ms (default: 1000) */
  debounceMs?: number;
  /** Maximum announcements to queue (default: 5) */
  maxQueue?: number;
}

export function LiveRegionProvider({ 
  children, 
  debounceMs = 1000,
  maxQueue = 5,
}: LiveRegionProviderProps) {
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');
  const [mounted, setMounted] = useState(false);
  
  const queueRef = useRef<Announcement[]>([]);
  const lastAnnouncementRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const processQueue = useCallback(() => {
    if (queueRef.current.length === 0) return;
    
    const now = Date.now();
    const timeSinceLastAnnouncement = now - lastAnnouncementRef.current;
    
    if (timeSinceLastAnnouncement < debounceMs) {
      // Wait for debounce period
      const waitTime = debounceMs - timeSinceLastAnnouncement;
      timeoutRef.current = setTimeout(processQueue, waitTime);
      return;
    }

    const announcement = queueRef.current.shift();
    if (!announcement) return;

    // Clear any existing message first (forces re-announcement)
    if (announcement.politeness === 'assertive') {
      setAssertiveMessage('');
      setTimeout(() => setAssertiveMessage(announcement.message), 50);
    } else {
      setPoliteMessage('');
      setTimeout(() => setPoliteMessage(announcement.message), 50);
    }

    lastAnnouncementRef.current = now;

    // Process next item in queue
    if (queueRef.current.length > 0) {
      timeoutRef.current = setTimeout(processQueue, debounceMs);
    }
  }, [debounceMs]);

  const announce = useCallback((message: string, politeness: Politeness = 'polite') => {
    if (politeness === 'off' || !message.trim()) return;

    const announcement: Announcement = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      message: message.trim(),
      politeness,
      timestamp: Date.now(),
    };

    // Limit queue size
    if (queueRef.current.length >= maxQueue) {
      queueRef.current.shift(); // Remove oldest
    }

    queueRef.current.push(announcement);
    processQueue();
  }, [maxQueue, processQueue]);

  const clearAnnouncements = useCallback(() => {
    queueRef.current = [];
    setPoliteMessage('');
    setAssertiveMessage('');
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  // Screen reader only styles
  const srOnlyStyles: React.CSSProperties = {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  };

  return (
    <LiveRegionContext.Provider value={{ announce, clearAnnouncements }}>
      {children}
      {mounted && createPortal(
        <>
          {/* Polite announcements - wait for user to finish current task */}
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={srOnlyStyles}
          >
            {politeMessage}
          </div>
          
          {/* Assertive announcements - interrupt immediately */}
          <div
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            style={srOnlyStyles}
          >
            {assertiveMessage}
          </div>
        </>,
        document.body
      )}
    </LiveRegionContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

/**
 * Hook to access the live region for screen reader announcements
 * 
 * Usage:
 * ```tsx
 * const { announce } = useLiveRegion();
 * 
 * // Polite announcement (waits for user to finish)
 * announce('Search results updated');
 * 
 * // Assertive announcement (interrupts immediately)
 * announce('Error: Session expired', 'assertive');
 * ```
 */
export function useLiveRegion(): LiveRegionContextValue {
  const context = useContext(LiveRegionContext);
  
  if (!context) {
    // Return no-op if used outside provider (SSR safety)
    return {
      announce: () => {},
      clearAnnouncements: () => {},
    };
  }
  
  return context;
}

// ============================================
// Utility Component
// ============================================

interface AnnounceOnMountProps {
  /** Message to announce */
  message: string;
  /** Politeness level */
  politeness?: Politeness;
  /** Delay before announcing in ms */
  delay?: number;
}

/**
 * Component that announces a message when mounted
 * 
 * Usage:
 * ```tsx
 * {isLoading && <AnnounceOnMount message="Loading results" />}
 * {!isLoading && <AnnounceOnMount message={`${count} results found`} />}
 * ```
 */
export function AnnounceOnMount({ 
  message, 
  politeness = 'polite', 
  delay = 100 
}: AnnounceOnMountProps) {
  const { announce } = useLiveRegion();

  useEffect(() => {
    const timer = setTimeout(() => {
      announce(message, politeness);
    }, delay);

    return () => clearTimeout(timer);
  }, [message, politeness, delay, announce]);

  return null;
}

// ============================================
// Common Announcements
// ============================================

/**
 * Pre-defined announcement functions for common scenarios
 */
export const announcements = {
  /** Announce search results count */
  searchResults: (count: number, query?: string) => {
    if (count === 0) {
      return query 
        ? `No results found for "${query}"`
        : 'No results found';
    }
    return query
      ? `Found ${count} result${count === 1 ? '' : 's'} for "${query}"`
      : `Found ${count} result${count === 1 ? '' : 's'}`;
  },

  /** Announce loading state */
  loading: (context?: string) => {
    return context ? `Loading ${context}` : 'Loading';
  },

  /** Announce error */
  error: (message: string) => {
    return `Error: ${message}`;
  },

  /** Announce success */
  success: (message: string) => {
    return message;
  },

  /** Announce navigation */
  navigation: (page: string) => {
    return `Navigated to ${page}`;
  },

  /** Announce selection */
  selection: (count: number, total?: number) => {
    if (count === 0) return 'No items selected';
    if (total) return `${count} of ${total} item${total === 1 ? '' : 's'} selected`;
    return `${count} item${count === 1 ? '' : 's'} selected`;
  },

  /** Announce filter change */
  filterApplied: (filterName: string, value?: string) => {
    if (value) return `Filter applied: ${filterName} - ${value}`;
    return `Filter applied: ${filterName}`;
  },

  /** Announce filter cleared */
  filterCleared: (filterName?: string) => {
    if (filterName) return `Filter cleared: ${filterName}`;
    return 'All filters cleared';
  },

  /** Announce bookmark action */
  bookmark: (title: string, added: boolean) => {
    return added 
      ? `Bookmarked: ${title}`
      : `Removed bookmark: ${title}`;
  },

  /** Announce modal state */
  modal: (title: string, opened: boolean) => {
    return opened 
      ? `Dialog opened: ${title}`
      : `Dialog closed: ${title}`;
  },
};








