/**
 * IdP Management Context
 * 
 * Shared state management for IdP Management, Analytics, and Wizard pages
 * Provides:
 * - Global IdP selection state
 * - Real-time updates (polling every 30s)
 * - Filter criteria persistence
 * - Cross-page navigation state
 * - Optimistic UI updates
 * 
 * Phase 1.1: Foundation & Integration
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { IIdPListItem } from '@/types/admin.types';

// ============================================
// Types
// ============================================

export interface IIdPFilter {
    search?: string;
    protocol?: 'oidc' | 'saml' | 'all';
    status?: 'enabled' | 'disabled' | 'all';
    tier?: 'gold' | 'silver' | 'bronze' | 'fail' | 'all';
    country?: string;
}

export interface IIdPManagementState {
    // Selected IdP
    selectedIdPAlias: string | null;
    selectedIdP: IIdPListItem | null;
    
    // Filter state
    filters: IIdPFilter;
    
    // View state
    viewMode: 'grid' | 'list' | 'table';
    
    // Recent activity
    recentIdPs: string[]; // Last 5 IdP aliases viewed
    
    // Refresh trigger
    lastRefresh: number;
}

export interface IIdPManagementContext extends IIdPManagementState {
    // Actions
    selectIdP: (alias: string | null) => void;
    updateFilters: (filters: Partial<IIdPFilter>) => void;
    clearFilters: () => void;
    setViewMode: (mode: 'grid' | 'list' | 'table') => void;
    triggerRefresh: () => void;
    addRecentIdP: (alias: string) => void;
    
    // URL sync
    syncToURL: boolean;
    setSyncToURL: (sync: boolean) => void;
}

// ============================================
// Context
// ============================================

const IdPManagementContext = createContext<IIdPManagementContext | undefined>(undefined);

// ============================================
// Provider
// ============================================

const RECENT_IDPS_KEY = 'dive-v3-recent-idps';
const MAX_RECENT_IDPS = 5;
const AUTO_REFRESH_INTERVAL = 30000; // 30 seconds

interface IdPManagementProviderProps {
    children: ReactNode;
    enableAutoRefresh?: boolean;
}

export function IdPManagementProvider({ children, enableAutoRefresh = true }: IdPManagementProviderProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { status } = useSession();
    
    // ============================================
    // State
    // ============================================
    
    const [selectedIdPAlias, setSelectedIdPAlias] = useState<string | null>(null);
    const [selectedIdP, setSelectedIdP] = useState<IIdPListItem | null>(null);
    const [filters, setFilters] = useState<IIdPFilter>({});
    const [viewMode, setViewModeState] = useState<'grid' | 'list' | 'table'>('grid');
    const [recentIdPs, setRecentIdPs] = useState<string[]>([]);
    const [lastRefresh, setLastRefresh] = useState(Date.now());
    const [syncToURL, setSyncToURL] = useState(true);
    
    // ============================================
    // Initialize from URL on mount
    // ============================================
    
    useEffect(() => {
        if (!syncToURL) return;
        
        const selected = searchParams.get('selected');
        const search = searchParams.get('search');
        const protocol = searchParams.get('protocol') as 'oidc' | 'saml' | 'all' | null;
        const status = searchParams.get('status') as 'enabled' | 'disabled' | 'all' | null;
        const tier = searchParams.get('tier') as 'gold' | 'silver' | 'bronze' | 'fail' | 'all' | null;
        const country = searchParams.get('country');
        const view = searchParams.get('view') as 'grid' | 'list' | 'table' | null;
        
        // Initialize from URL
        if (selected) setSelectedIdPAlias(selected);
        
        const newFilters: IIdPFilter = {};
        if (search) newFilters.search = search;
        if (protocol) newFilters.protocol = protocol;
        if (status) newFilters.status = status;
        if (tier) newFilters.tier = tier;
        if (country) newFilters.country = country;
        
        if (Object.keys(newFilters).length > 0) {
            setFilters(newFilters);
        }
        
        if (view) setViewModeState(view);
    }, []); // Only run on mount
    
    // ============================================
    // Load recent IdPs from localStorage
    // ============================================
    
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(RECENT_IDPS_KEY);
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed)) {
                        setRecentIdPs(parsed.slice(0, MAX_RECENT_IDPS));
                    }
                } catch (error) {
                    console.error('Failed to parse recent IdPs from localStorage', error);
                }
            }
        }
    }, []);
    
    // ============================================
    // Auto-refresh (every 30 seconds)
    // ============================================
    
    useEffect(() => {
        if (!enableAutoRefresh || status !== 'authenticated') return;
        
        const interval = setInterval(() => {
            setLastRefresh(Date.now());
        }, AUTO_REFRESH_INTERVAL);
        
        return () => clearInterval(interval);
    }, [enableAutoRefresh, status]);
    
    // ============================================
    // Sync to URL when state changes
    // ============================================
    
    useEffect(() => {
        if (!syncToURL) return;
        
        const params = new URLSearchParams();
        
        if (selectedIdPAlias) params.set('selected', selectedIdPAlias);
        if (filters.search) params.set('search', filters.search);
        if (filters.protocol && filters.protocol !== 'all') params.set('protocol', filters.protocol);
        if (filters.status && filters.status !== 'all') params.set('status', filters.status);
        if (filters.tier && filters.tier !== 'all') params.set('tier', filters.tier);
        if (filters.country) params.set('country', filters.country);
        if (viewMode !== 'grid') params.set('view', viewMode);
        
        const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
        
        // Only update if different from current URL
        const currentUrl = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
        if (newUrl !== currentUrl) {
            router.replace(newUrl, { scroll: false });
        }
    }, [selectedIdPAlias, filters, viewMode, syncToURL, pathname, router]);
    
    // ============================================
    // Actions
    // ============================================
    
    const selectIdP = useCallback((alias: string | null) => {
        setSelectedIdPAlias(alias);
        
        // Add to recent if selecting (not deselecting)
        if (alias) {
            addRecentIdP(alias);
        }
    }, []);
    
    const updateFilters = useCallback((newFilters: Partial<IIdPFilter>) => {
        setFilters(prev => ({ ...prev, ...newFilters }));
    }, []);
    
    const clearFilters = useCallback(() => {
        setFilters({});
    }, []);
    
    const setViewMode = useCallback((mode: 'grid' | 'list' | 'table') => {
        setViewModeState(mode);
    }, []);
    
    const triggerRefresh = useCallback(() => {
        setLastRefresh(Date.now());
    }, []);
    
    const addRecentIdP = useCallback((alias: string) => {
        setRecentIdPs(prev => {
            // Remove if already exists
            const filtered = prev.filter(a => a !== alias);
            // Add to front
            const updated = [alias, ...filtered].slice(0, MAX_RECENT_IDPS);
            
            // Persist to localStorage
            if (typeof window !== 'undefined') {
                localStorage.setItem(RECENT_IDPS_KEY, JSON.stringify(updated));
            }
            
            return updated;
        });
    }, []);
    
    // ============================================
    // Context Value
    // ============================================
    
    const value: IIdPManagementContext = {
        // State
        selectedIdPAlias,
        selectedIdP,
        filters,
        viewMode,
        recentIdPs,
        lastRefresh,
        
        // Actions
        selectIdP,
        updateFilters,
        clearFilters,
        setViewMode,
        triggerRefresh,
        addRecentIdP,
        
        // URL sync
        syncToURL,
        setSyncToURL
    };
    
    return (
        <IdPManagementContext.Provider value={value}>
            {children}
        </IdPManagementContext.Provider>
    );
}

// ============================================
// Hook
// ============================================

/**
 * useIdPManagement Hook
 * 
 * Access IdP management shared state from any admin page
 * 
 * @example
 * const { selectedIdPAlias, selectIdP, filters, updateFilters } = useIdPManagement();
 */
export function useIdPManagement(): IIdPManagementContext {
    const context = useContext(IdPManagementContext);
    
    if (!context) {
        throw new Error('useIdPManagement must be used within IdPManagementProvider');
    }
    
    return context;
}

/**
 * useSyncedQueryParams Hook
 * 
 * Sync state with URL query parameters for deep linking
 * 
 * @example
 * const [value, setValue] = useSyncedQueryParams('search', '');
 */
export function useSyncedQueryParams<T extends string>(
    key: string,
    defaultValue: T
): [T, (value: T) => void] {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    
    const value = (searchParams.get(key) as T) || defaultValue;
    
    const setValue = useCallback((newValue: T) => {
        const params = new URLSearchParams(searchParams.toString());
        
        if (newValue && newValue !== defaultValue) {
            params.set(key, newValue);
        } else {
            params.delete(key);
        }
        
        const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
        router.replace(newUrl, { scroll: false });
    }, [key, defaultValue, pathname, searchParams, router]);
    
    return [value, setValue];
}

