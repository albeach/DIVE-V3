/**
 * IdP Quick Switcher Component (Command Palette)
 * 
 * Cmd+K / Ctrl+K to open
 * Fuzzy search across:
 * - All IdPs
 * - Quick Actions (Add IdP, Refresh, Export, etc.)
 * - Navigation (Analytics, Management, Dashboard)
 * 
 * Phase 1.3: Cross-Page Navigation
 */

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
    MagnifyingGlassIcon, 
    PlusIcon, 
    ArrowPathIcon,
    ChartBarIcon,
    Cog6ToothIcon,
    DocumentArrowDownIcon,
    ServerIcon
} from '@heroicons/react/24/outline';
import { useIdPManagement } from '@/contexts/IdPManagementContext';
import { useIdPs } from '@/lib/api/idp-management';
import { IIdPListItem } from '@/types/admin.types';
import { useIdentityDrawer } from '@/contexts/IdentityDrawerContext';

// ============================================
// Types
// ============================================

interface IQuickAction {
    id: string;
    label: string;
    description?: string;
    icon: React.ComponentType<any>;
    action: () => void;
    category: 'idp' | 'action' | 'navigation';
}

// ============================================
// Component
// ============================================

export default function IdPQuickSwitcher() {
    const router = useRouter();
    const { selectIdP, triggerRefresh } = useIdPManagement();
    const { data: idps, refetch } = useIdPs();
    const { open: openIdentity } = useIdentityDrawer();
    
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    
    // ============================================
    // Build actions list
    // ============================================
    
    const allActions: IQuickAction[] = useMemo(() => {
        const actions: IQuickAction[] = [];
        
        // IdPs - Ensure idps is an array before iterating
        if (idps && Array.isArray(idps)) {
            idps.forEach((idp: IIdPListItem) => {
                actions.push({
                    id: `idp-${idp.alias}`,
                    label: idp.displayName,
                    description: `${idp.protocol.toUpperCase()} • ${idp.enabled ? 'Enabled' : 'Disabled'}`,
                    icon: ServerIcon,
                    action: () => {
                        selectIdP(idp.alias);
                        router.push(`/admin/idp?selected=${idp.alias}`);
                        setIsOpen(false);
                    },
                    category: 'idp'
                });
            });
        }
        
        // Quick Actions
        actions.push(
            {
                id: 'action-show-identity',
                label: 'Show Identity Drawer',
                description: 'View your normalized claims',
                icon: Cog6ToothIcon,
                action: () => {
                    openIdentity();
                    setIsOpen(false);
                },
                category: 'action'
            },
            {
                id: 'action-add-idp',
                label: 'Add New IdP',
                description: 'Start the IdP creation wizard',
                icon: PlusIcon,
                action: () => {
                    router.push('/admin/idp/new');
                    setIsOpen(false);
                },
                category: 'action'
            },
            {
                id: 'action-refresh',
                label: 'Refresh All',
                description: 'Reload IdP data',
                icon: ArrowPathIcon,
                action: () => {
                    triggerRefresh();
                    refetch();
                    setIsOpen(false);
                },
                category: 'action'
            },
            {
                id: 'action-export',
                label: 'Export Configuration',
                description: 'Download all IdP configs as JSON',
                icon: DocumentArrowDownIcon,
                action: () => {
                    // TODO: Implement export
                    console.log('Export not yet implemented');
                    setIsOpen(false);
                },
                category: 'action'
            }
        );
        
        // Navigation
        actions.push(
            {
                id: 'nav-management',
                label: 'IdP Management',
                description: 'Manage identity providers',
                icon: Cog6ToothIcon,
                action: () => {
                    router.push('/admin/idp');
                    setIsOpen(false);
                },
                category: 'navigation'
            },
            {
                id: 'nav-analytics',
                label: 'IdP Governance',
                description: 'View analytics and compliance',
                icon: ChartBarIcon,
                action: () => {
                    router.push('/admin/analytics');
                    setIsOpen(false);
                },
                category: 'navigation'
            }
        );
        
        return actions;
    }, [idps, router, selectIdP, triggerRefresh, refetch]);
    
    // ============================================
    // Filter actions by search
    // ============================================
    
    const filteredActions = useMemo(() => {
        if (!search.trim()) return allActions;
        
        const query = search.toLowerCase();
        
        return allActions.filter(action => {
            const labelMatch = action.label.toLowerCase().includes(query);
            const descMatch = action.description?.toLowerCase().includes(query);
            return labelMatch || descMatch;
        });
    }, [allActions, search]);
    
    // Group by category
    const groupedActions = useMemo(() => {
        const groups: Record<string, IQuickAction[]> = {
            idp: [],
            action: [],
            navigation: []
        };
        
        filteredActions.forEach(action => {
            groups[action.category].push(action);
        });
        
        return groups;
    }, [filteredActions]);
    
    // ============================================
    // Keyboard shortcuts
    // ============================================
    
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd+K or Ctrl+K to open
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(prev => !prev);
                setSearch('');
                setSelectedIndex(0);
            }
            
            // Escape to close
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
                setSearch('');
            }
            
            // Arrow keys to navigate
            if (isOpen && filteredActions.length > 0) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedIndex(prev => (prev + 1) % filteredActions.length);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedIndex(prev => (prev - 1 + filteredActions.length) % filteredActions.length);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    filteredActions[selectedIndex]?.action();
                }
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, filteredActions, selectedIndex]);
    
    // Reset selected index when search changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [search]);
    
    if (!isOpen) {
        return null;
    }
    
    return (
        <>
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
                onClick={() => setIsOpen(false)}
            />
            
            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
                <div className="w-full max-w-2xl mx-4 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {/* Search Input */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                        <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search IdPs, actions, or navigate..."
                            className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none text-sm"
                            autoFocus
                        />
                        <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-mono text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-400 rounded">
                            ESC
                        </kbd>
                    </div>
                    
                    {/* Results */}
                    <div className="max-h-96 overflow-y-auto">
                        {filteredActions.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                                No results found for "{search}"
                            </div>
                        ) : (
                            <>
                                {/* IdPs */}
                                {groupedActions.idp.length > 0 && (
                                    <div className="px-2 py-2">
                                        <div className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                            Identity Providers
                                        </div>
                                        {groupedActions.idp.map((action, index) => {
                                            const globalIndex = filteredActions.indexOf(action);
                                            const isSelected = globalIndex === selectedIndex;
                                            
                                            return (
                                                <button
                                                    key={action.id}
                                                    onClick={action.action}
                                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                                                        isSelected
                                                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100'
                                                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                    }`}
                                                >
                                                    <action.icon className="h-5 w-5 flex-shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-medium truncate">{action.label}</div>
                                                        {action.description && (
                                                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                                {action.description}
                                                            </div>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                
                                {/* Quick Actions */}
                                {groupedActions.action.length > 0 && (
                                    <div className="px-2 py-2 border-t border-gray-200 dark:border-gray-700">
                                        <div className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                            Quick Actions
                                        </div>
                                        {groupedActions.action.map((action) => {
                                            const globalIndex = filteredActions.indexOf(action);
                                            const isSelected = globalIndex === selectedIndex;
                                            
                                            return (
                                                <button
                                                    key={action.id}
                                                    onClick={action.action}
                                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                                                        isSelected
                                                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100'
                                                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                    }`}
                                                >
                                                    <action.icon className="h-5 w-5 flex-shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-medium truncate">{action.label}</div>
                                                        {action.description && (
                                                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                                {action.description}
                                                            </div>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                
                                {/* Navigation */}
                                {groupedActions.navigation.length > 0 && (
                                    <div className="px-2 py-2 border-t border-gray-200 dark:border-gray-700">
                                        <div className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                            Navigation
                                        </div>
                                        {groupedActions.navigation.map((action) => {
                                            const globalIndex = filteredActions.indexOf(action);
                                            const isSelected = globalIndex === selectedIndex;
                                            
                                            return (
                                                <button
                                                    key={action.id}
                                                    onClick={action.action}
                                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                                                        isSelected
                                                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100'
                                                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                    }`}
                                                >
                                                    <action.icon className="h-5 w-5 flex-shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-medium truncate">{action.label}</div>
                                                        {action.description && (
                                                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                                {action.description}
                                                            </div>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    
                    {/* Footer */}
                    <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                        <div className="flex items-center gap-4">
                            <span className="flex items-center gap-1">
                                <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">↑</kbd>
                                <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">↓</kbd>
                                navigate
                            </span>
                            <span className="flex items-center gap-1">
                                <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">↵</kbd>
                                select
                            </span>
                        </div>
                        <span>Cmd+K or Ctrl+K to toggle</span>
                    </div>
                </div>
            </div>
        </>
    );
}

