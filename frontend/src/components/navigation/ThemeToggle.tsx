'use client';

/**
 * Theme Toggle Component
 *
 * Allows users to switch between light, dark, and system themes.
 * Integrates with next-themes for persistent preference.
 *
 * Features:
 * - Toggle button with icon (sun/moon)
 * - Dropdown for light/dark/system selection
 * - Smooth transitions
 * - Accessible keyboard navigation
 * - ARIA labels for screen readers
 *
 * @version 1.0.0
 * @date 2026-01-16
 */

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-9 h-9 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse" />
    );
  }

  const Icon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <button
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="
        flex items-center justify-center
        w-9 h-9 rounded-lg
        bg-gray-100 dark:bg-gray-800
        border border-gray-300 dark:border-gray-600
        hover:bg-gray-200 dark:hover:bg-gray-700
        focus:outline-none focus:ring-2 focus:ring-blue-500
        transition-colors duration-200
      "
      aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Current theme: ${theme || 'system'}`}
    >
      <Icon className="w-4 h-4 text-gray-700 dark:text-gray-300" />
    </button>
  );
}

/**
 * Advanced Theme Selector with Dropdown
 * Shows light/dark/system options
 */
export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-32 h-9 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse" />;
  }

  const themes = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  const currentTheme = themes.find(t => t.value === theme) || themes[2];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="
          flex items-center gap-2 px-3 py-2 rounded-lg
          bg-gray-100 dark:bg-gray-800
          border border-gray-300 dark:border-gray-600
          hover:bg-gray-200 dark:hover:bg-gray-700
          focus:outline-none focus:ring-2 focus:ring-blue-500
          transition-colors duration-200
          text-sm font-medium text-gray-700 dark:text-gray-300
        "
        aria-expanded={isOpen}
        aria-label="Select theme"
      >
        <currentTheme.icon className="w-4 h-4" />
        <span className="hidden sm:inline">{currentTheme.label}</span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="
            absolute right-0 mt-2 w-40
            bg-white dark:bg-gray-800
            border border-gray-300 dark:border-gray-600
            rounded-lg shadow-lg
            z-20
            overflow-hidden
          ">
            {themes.map((themeOption) => (
              <button
                key={themeOption.value}
                onClick={() => {
                  setTheme(themeOption.value);
                  setIsOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-4 py-3
                  hover:bg-gray-100 dark:hover:bg-gray-700
                  transition-colors text-left
                  ${theme === themeOption.value ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                `}
              >
                <themeOption.icon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {themeOption.label}
                </span>
                {theme === themeOption.value && (
                  <span className="ml-auto text-blue-600 dark:text-blue-400">✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
