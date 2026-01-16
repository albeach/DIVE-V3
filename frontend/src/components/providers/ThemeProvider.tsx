'use client';

/**
 * Theme Provider Component
 * 
 * Wraps the app with next-themes for dark mode support.
 * Integrates with Tailwind CSS dark: variant.
 * 
 * Features:
 * - System preference detection
 * - Manual theme toggle (light/dark/system)
 * - Persistent preference (localStorage)
 * - No flash of unstyled content
 * - Accessible theme switching
 * 
 * @version 1.0.0
 * @date 2026-01-16
 */

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { type ThemeProviderProps } from 'next-themes/dist/types';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
