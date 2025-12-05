/**
 * Skip Links Component - Phase 4 Accessibility
 * 
 * Provides keyboard users with quick navigation to main content areas.
 * Implements WCAG 2.1 SC 2.4.1 (Bypass Blocks) - Level A
 * 
 * Features:
 * - Hidden by default, visible on focus
 * - Links to main content, navigation, and search
 * - Smooth focus transition
 */

'use client';

import React from 'react';

interface SkipLink {
  href: string;
  label: string;
}

interface SkipLinksProps {
  /** Optional additional skip links */
  additionalLinks?: SkipLink[];
}

const defaultLinks: SkipLink[] = [
  { href: '#main-content', label: 'Skip to main content' },
  { href: '#main-navigation', label: 'Skip to navigation' },
  { href: '#search', label: 'Skip to search' },
];

export default function SkipLinks({ additionalLinks = [] }: SkipLinksProps) {
  const allLinks = [...defaultLinks, ...additionalLinks];

  const handleSkipClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const targetId = href.replace('#', '');
    const targetElement = document.getElementById(targetId);
    
    if (targetElement) {
      // Make element focusable if it isn't already
      if (!targetElement.hasAttribute('tabindex')) {
        targetElement.setAttribute('tabindex', '-1');
      }
      
      // Focus and scroll to element
      targetElement.focus({ preventScroll: true });
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <nav 
      aria-label="Skip links"
      className="fixed top-0 left-0 z-[100] p-4"
    >
      <ul className="space-y-1">
        {allLinks.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              onClick={(e) => handleSkipClick(e, link.href)}
              className="
                sr-only focus:not-sr-only
                focus:absolute focus:top-4 focus:left-4
                focus:px-4 focus:py-2
                focus:bg-blue-600 focus:text-white
                focus:rounded-lg focus:shadow-lg
                focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-600
                font-semibold text-sm
                z-[100]
              "
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Hook to add skip link targets to elements
 * 
 * Usage:
 * ```tsx
 * const mainRef = useSkipLinkTarget('main-content');
 * return <main ref={mainRef}>...</main>;
 * ```
 */
export function useSkipLinkTarget(id: string) {
  const ref = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    const element = ref.current;
    if (element) {
      element.id = id;
      // Make element focusable for skip link navigation
      if (!element.hasAttribute('tabindex')) {
        element.setAttribute('tabindex', '-1');
      }
    }
  }, [id]);

  return ref;
}




