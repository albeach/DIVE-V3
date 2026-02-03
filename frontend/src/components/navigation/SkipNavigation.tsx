/**
 * Skip Navigation Link - Phase 3 (Accessibility)
 * 
 * Allows keyboard users to skip directly to main content
 * WCAG 2.1 Level A requirement
 */

'use client';

import React from 'react';

export function SkipNavigation() {
  return (
    <a
      href="#main-content"
      className={`sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] 
                 focus:px-4 focus:py-2 focus:bg-[#4497ac] focus:text-white focus:rounded-lg 
                 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#4497ac] focus:ring-offset-2`}
    >
      Skip to main content
    </a>
  );
}
