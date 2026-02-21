"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

/**
 * Standards Lens Type
 * 
 * Determines which standard perspective to emphasize in the UI:
 * - '5663': Federation/Identity focus (ADatP-5663)
 * - '240': Object/Data focus (ACP-240)
 * - 'unified': Both standards (default)
 */
export type StandardsLens = '5663' | '240' | 'unified';

/**
 * Standards Lens Context Interface
 */
interface StandardsLensContextType {
  activeLens: StandardsLens;
  setActiveLens: (lens: StandardsLens) => void;
  is5663Active: boolean;
  is240Active: boolean;
  isUnifiedActive: boolean;
  getStandardColor: (standard: '5663' | '240' | 'both') => string;
  getStandardGradient: (standard: '5663' | '240' | 'both') => string;
}

const StandardsLensContext = createContext<StandardsLensContextType | undefined>(undefined);

const STORAGE_KEY = 'dive-v3-standards-lens';

/**
 * Standards Lens Provider
 * 
 * Provides global state for switching between 5663/240/unified perspectives.
 * Persists preference to localStorage.
 * 
 * Usage:
 * ```tsx
 * // In layout or root component
 * <StandardsLensProvider>
 *   <App />
 * </StandardsLensProvider>
 * 
 * // In any component
 * const { activeLens, is5663Active, setActiveLens } = useStandardsLens();
 * 
 * if (is5663Active) {
 *   // Show federation-focused UI
 * }
 * ```
 */
export function StandardsLensProvider({ children }: { children: ReactNode }) {
  const [activeLens, setActiveLensState] = useState<StandardsLens>('unified');
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY) as StandardsLens | null;
    if (stored && ['5663', '240', 'unified'].includes(stored)) {
      setActiveLensState(stored);
    }
  }, []);

  // Save to localStorage when changed
  const setActiveLens = (lens: StandardsLens) => {
    setActiveLensState(lens);
    if (mounted) {
      localStorage.setItem(STORAGE_KEY, lens);
    }
  };

  // Helper flags
  const is5663Active = activeLens === '5663';
  const is240Active = activeLens === '240';
  const isUnifiedActive = activeLens === 'unified';

  // Standard color getters
  const getStandardColor = (standard: '5663' | '240' | 'both'): string => {
    switch (standard) {
      case '5663':
        return 'indigo';
      case '240':
        return 'amber';
      case 'both':
        return 'teal';
    }
  };

  const getStandardGradient = (standard: '5663' | '240' | 'both'): string => {
    switch (standard) {
      case '5663':
        return 'from-indigo-500 via-blue-500 to-cyan-500';
      case '240':
        return 'from-amber-500 via-orange-500 to-red-500';
      case 'both':
        return 'from-teal-500 to-cyan-500';
    }
  };

  const value = {
    activeLens,
    setActiveLens,
    is5663Active,
    is240Active,
    isUnifiedActive,
    getStandardColor,
    getStandardGradient,
  };

  return (
    <StandardsLensContext.Provider value={value}>
      {children}
    </StandardsLensContext.Provider>
  );
}

/**
 * Hook to access Standards Lens context
 * 
 * @throws Error if used outside StandardsLensProvider
 */
export function useStandardsLens(): StandardsLensContextType {
  const context = useContext(StandardsLensContext);
  if (!context) {
    throw new Error('useStandardsLens must be used within StandardsLensProvider');
  }
  return context;
}

/**
 * Hook to conditionally render based on active lens
 * 
 * @example
 * const show = useShowInLens('5663');
 * if (!show) return null;
 * return <FederationSpecificComponent />;
 */
export function useShowInLens(requiredLens: '5663' | '240' | 'unified' | 'all'): boolean {
  const { activeLens } = useStandardsLens();
  
  if (requiredLens === 'all') return true;
  if (activeLens === 'unified') return true; // Show everything in unified mode
  
  return activeLens === requiredLens;
}
