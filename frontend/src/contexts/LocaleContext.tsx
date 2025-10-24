/**
 * Locale Context
 * 
 * Global state management for locale/language switching
 * Ensures all components re-render when language changes
 * 
 * Usage:
 * 1. Wrap app with <LocaleProvider>
 * 2. Use useLocale() hook in any component
 * 3. Call changeLocale() to update globally
 */

'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Locale, defaultLocale, getStoredLocale, setStoredLocale } from '@/i18n/config';

// ============================================
// Context Types
// ============================================

interface LocaleContextValue {
    locale: Locale;
    changeLocale: (newLocale: Locale) => void;
}

// ============================================
// Context
// ============================================

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

// ============================================
// Provider Component
// ============================================

interface LocaleProviderProps {
    children: ReactNode;
}

export function LocaleProvider({ children }: LocaleProviderProps) {
    const [locale, setLocale] = useState<Locale>(defaultLocale);
    const [isInitialized, setIsInitialized] = useState(false);

    // Load stored locale on mount (client-side only)
    useEffect(() => {
        const stored = getStoredLocale();
        setLocale(stored);
        setIsInitialized(true);
    }, []);

    // Change locale and persist
    const changeLocale = (newLocale: Locale) => {
        setLocale(newLocale);
        setStoredLocale(newLocale);
    };

    // Don't render children until locale is initialized
    // This prevents flash of default locale
    if (!isInitialized) {
        return null;
    }

    return (
        <LocaleContext.Provider value={{ locale, changeLocale }}>
            {children}
        </LocaleContext.Provider>
    );
}

// ============================================
// Hook
// ============================================

export function useLocale(): LocaleContextValue {
    const context = useContext(LocaleContext);
    
    if (context === undefined) {
        throw new Error('useLocale must be used within a LocaleProvider');
    }
    
    return context;
}

