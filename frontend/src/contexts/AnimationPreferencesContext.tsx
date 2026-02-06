/**
 * Animation Preferences Context
 * 
 * Global context for managing user animation preferences across the app.
 * Provides settings for enabling/disabling animations, speed, and intensity.
 * 
 * @phase Phase 4.4 - Animation Preferences Panel
 * @date 2026-02-06
 */

'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface AnimationPreferences {
  /** Whether animations are enabled globally */
  enabled: boolean;
  /** Animation speed multiplier */
  speed: 'slow' | 'normal' | 'fast';
  /** Animation intensity/scale amount */
  intensity: 'subtle' | 'normal' | 'strong';
}

export interface AnimationPreferencesContextValue {
  /** Current preferences */
  preferences: AnimationPreferences;
  /** Update one or more preferences */
  updatePreferences: (prefs: Partial<AnimationPreferences>) => void;
  /** Reset to defaults */
  resetPreferences: () => void;
}

const DEFAULT_PREFERENCES: AnimationPreferences = {
  enabled: true,
  speed: 'normal',
  intensity: 'normal',
};

const AnimationPreferencesContext = createContext<AnimationPreferencesContextValue | null>(null);

/**
 * Animation Preferences Provider
 * 
 * Wrap your app with this provider to enable animation preferences globally.
 * Preferences are persisted to localStorage.
 * 
 * @example
 * ```tsx
 * <AnimationPreferencesProvider>
 *   <App />
 * </AnimationPreferencesProvider>
 * ```
 */
export function AnimationPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<AnimationPreferences>(DEFAULT_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dive-animation-preferences');
      if (saved) {
        const parsed = JSON.parse(saved);
        setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
      }
    } catch (error) {
      console.error('Failed to load animation preferences:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save preferences to localStorage whenever they change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem('dive-animation-preferences', JSON.stringify(preferences));
      } catch (error) {
        console.error('Failed to save animation preferences:', error);
      }
    }
  }, [preferences, isLoaded]);

  const updatePreferences = (prefs: Partial<AnimationPreferences>) => {
    setPreferences(prev => ({ ...prev, ...prefs }));
  };

  const resetPreferences = () => {
    setPreferences(DEFAULT_PREFERENCES);
  };

  // Don't render children until preferences are loaded to avoid flash
  if (!isLoaded) {
    return null;
  }

  return (
    <AnimationPreferencesContext.Provider
      value={{
        preferences,
        updatePreferences,
        resetPreferences,
      }}
    >
      {children}
    </AnimationPreferencesContext.Provider>
  );
}

/**
 * Hook to access animation preferences
 * 
 * Must be used within AnimationPreferencesProvider.
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { preferences, updatePreferences } = useAnimationPreferences();
 *   
 *   return (
 *     <button onClick={() => updatePreferences({ enabled: !preferences.enabled })}>
 *       {preferences.enabled ? 'Disable' : 'Enable'} Animations
 *     </button>
 *   );
 * }
 * ```
 */
export function useAnimationPreferences(): AnimationPreferencesContextValue {
  const context = useContext(AnimationPreferencesContext);
  
  if (!context) {
    throw new Error('useAnimationPreferences must be used within AnimationPreferencesProvider');
  }
  
  return context;
}

/**
 * Helper to get animation duration based on speed preference
 * 
 * @param baseSpeed - Base animation duration in seconds
 * @param speed - Speed preference
 * @returns Adjusted duration in seconds
 */
export function getAnimationDuration(baseSpeed: number, speed: AnimationPreferences['speed']): number {
  const speedMultipliers = {
    slow: 1.5,
    normal: 1.0,
    fast: 0.5,
  };
  
  return baseSpeed * speedMultipliers[speed];
}

/**
 * Helper to get scale values based on intensity preference
 * 
 * @param intensity - Intensity preference
 * @returns Object with hover and tap scale values
 */
export function getScaleIntensity(intensity: AnimationPreferences['intensity']) {
  const scaleValues = {
    subtle: { hover: 1.01, tap: 0.99 },
    normal: { hover: 1.02, tap: 0.98 },
    strong: { hover: 1.05, tap: 0.95 },
  };
  
  return scaleValues[intensity];
}
