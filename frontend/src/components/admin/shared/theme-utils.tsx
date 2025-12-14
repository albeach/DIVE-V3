/**
 * Theme Utilities for Admin Section
 * 
 * Provides consistent dark mode support and theme utilities:
 * - useAdminTheme hook
 * - Theme-aware card components
 * - CSS class helpers
 */

'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

// ============================================
// Types
// ============================================

type Theme = 'light' | 'dark' | 'system';

interface AdminThemeContextValue {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  isDark: boolean;
}

// ============================================
// Context
// ============================================

const AdminThemeContext = createContext<AdminThemeContextValue | null>(null);

export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    // Get stored preference
    const stored = localStorage.getItem('admin-theme') as Theme | null;
    if (stored) {
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    // Resolve system theme
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const updateResolvedTheme = () => {
      if (theme === 'system') {
        setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
      } else {
        setResolvedTheme(theme);
      }
    };

    updateResolvedTheme();
    mediaQuery.addEventListener('change', updateResolvedTheme);
    return () => mediaQuery.removeEventListener('change', updateResolvedTheme);
  }, [theme]);

  useEffect(() => {
    // Apply to document
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(resolvedTheme);
  }, [resolvedTheme]);

  const handleSetTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem('admin-theme', newTheme);
  };

  return (
    <AdminThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme: handleSetTheme,
        isDark: resolvedTheme === 'dark',
      }}
    >
      {children}
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme() {
  const context = useContext(AdminThemeContext);
  if (!context) {
    // Return defaults if not in provider
    return {
      theme: 'light' as Theme,
      resolvedTheme: 'light' as const,
      setTheme: () => {},
      isDark: false,
    };
  }
  return context;
}

// ============================================
// Theme Toggle Component
// ============================================

import { Sun, Moon, Monitor } from 'lucide-react';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme, isDark } = useAdminTheme();

  const options: { value: Theme; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ];

  return (
    <div className={`inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1 ${className}`}>
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            theme === value
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
          title={label}
        >
          <Icon className="w-4 h-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

// ============================================
// Theme-Aware Components
// ============================================

interface ThemedCardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  elevated?: boolean;
}

const paddingClasses = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function ThemedCard({
  children,
  className = '',
  padding = 'md',
  elevated = true,
}: ThemedCardProps) {
  return (
    <div
      className={`
        bg-white dark:bg-gray-900 
        rounded-xl 
        border border-slate-200 dark:border-gray-700
        ${elevated ? 'shadow-lg dark:shadow-gray-900/20' : ''}
        ${paddingClasses[padding]}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

interface ThemedSectionProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function ThemedSection({
  children,
  title,
  subtitle,
  action,
  className = '',
}: ThemedSectionProps) {
  return (
    <ThemedCard className={className}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          <div>
            {title && (
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </ThemedCard>
  );
}

// ============================================
// CSS Class Helpers
// ============================================

/**
 * Generate theme-aware class names
 */
export const tw = {
  // Text colors
  text: {
    primary: 'text-gray-900 dark:text-white',
    secondary: 'text-gray-600 dark:text-gray-400',
    muted: 'text-gray-500 dark:text-gray-500',
    inverse: 'text-white dark:text-gray-900',
  },
  
  // Background colors
  bg: {
    primary: 'bg-white dark:bg-gray-900',
    secondary: 'bg-gray-50 dark:bg-gray-800',
    muted: 'bg-gray-100 dark:bg-gray-700',
    elevated: 'bg-white dark:bg-gray-800',
  },
  
  // Border colors
  border: {
    default: 'border-gray-200 dark:border-gray-700',
    light: 'border-gray-100 dark:border-gray-800',
    strong: 'border-gray-300 dark:border-gray-600',
  },
  
  // Status colors
  status: {
    success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
  
  // Interactive
  interactive: {
    button: 'bg-blue-600 hover:bg-blue-700 text-white',
    buttonSecondary: 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300',
    link: 'text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300',
  },
  
  // Input
  input: 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500',
};

// ============================================
// Gradient Presets
// ============================================

export const gradients = {
  primary: 'from-blue-600 to-indigo-600',
  success: 'from-green-500 to-emerald-600',
  warning: 'from-amber-500 to-orange-600',
  danger: 'from-red-500 to-rose-600',
  purple: 'from-purple-500 to-indigo-600',
  teal: 'from-teal-500 to-cyan-600',
  slate: 'from-slate-600 to-slate-800',
};

export default {
  AdminThemeProvider,
  useAdminTheme,
  ThemeToggle,
  ThemedCard,
  ThemedSection,
  tw,
  gradients,
};

