/**
 * Screen Reader Announcer - Phase 3 (Accessibility)
 * 
 * Announces route changes and important events to screen readers
 * Uses ARIA live regions for dynamic updates
 */

'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export function ScreenReaderAnnouncer() {
  const pathname = usePathname();
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Announce route changes
    const routeName = getRouteName(pathname);
    setMessage(`Navigated to ${routeName}`);

    // Clear message after announcement
    const timeout = setTimeout(() => setMessage(''), 1000);
    return () => clearTimeout(timeout);
  }, [pathname]);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}

/**
 * Get friendly route name from pathname
 */
function getRouteName(pathname: string): string {
  if (pathname === '/') return 'Home';
  if (pathname === '/dashboard') return 'Dashboard';
  if (pathname.startsWith('/resources')) return 'Documents';
  if (pathname.startsWith('/policies')) return 'Policies';
  if (pathname.startsWith('/upload')) return 'Upload';
  if (pathname.startsWith('/admin')) return 'Admin';
  if (pathname.startsWith('/compliance')) return 'Compliance';
  return pathname.split('/').pop() || 'Page';
}

/**
 * Custom hook to announce messages to screen readers
 */
export function useScreenReaderAnnounce() {
  const [message, setMessage] = useState('');

  const announce = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 1000);
  };

  return { message, announce };
}

