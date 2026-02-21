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

// Recent actions stored in localStorage
const RECENT_ACTIONS_KEY = 'dive-quick-switcher-recent';
const MAX_RECENT_ACTIONS = 10;

function getRecentActions(): string[] {
    if (typeof window === 'undefined') return [];
    try {
        const stored = localStorage.getItem(RECENT_ACTIONS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function addRecentAction(actionId: string) {
    if (typeof window === 'undefined') return;
    try {
        const recent = getRecentActions().filter(id => id !== actionId);
        recent.unshift(actionId);
        localStorage.setItem(RECENT_ACTIONS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_ACTIONS)));
    } catch {
        // localStorage unavailable
    }
}

// Action command parsing: "suspend [name]", "approve [alias]", etc.
function parseActionCommand(input: string): { verb: string; target: string } | null {
    const verbs = ['suspend', 'activate', 'enable', 'disable', 'approve', 'reject', 'test', 'delete', 'view', 'edit'];
    const lower = input.toLowerCase().trim();
    for (const verb of verbs) {
        if (lower.startsWith(verb + ' ')) {
            return { verb, target: input.slice(verb.length + 1).trim() };
        }
    }
    return null;
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
                    if (idps && Array.isArray(idps)) {
                        const exportData = {
                            exportedAt: new Date().toISOString(),
                            count: idps.length,
                            identityProviders: idps.map((idp: IIdPListItem) => ({
                                alias: idp.alias,
                                displayName: idp.displayName,
                                protocol: idp.protocol,
                                enabled: idp.enabled,
                                createdAt: idp.createdAt,
                            })),
                        };
                        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `dive-idp-config-${new Date().toISOString().split('T')[0]}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                    }
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
    
    // Parse action commands like "suspend myIdP"
    const parsedCommand = useMemo(() => parseActionCommand(search), [search]);

    const filteredActions = useMemo(() => {
        if (!search.trim()) {
            // When no search, show recent actions first (if any)
            const recentIds = getRecentActions();
            if (recentIds.length > 0) {
                const recentItems = recentIds
                    .map(id => allActions.find(a => a.id === id))
                    .filter(Boolean) as IQuickAction[];
                const rest = allActions.filter(a => !recentIds.includes(a.id));
                return [...recentItems, ...rest];
            }
            return allActions;
        }

        // If parsed as a command, filter IdPs by target name
        if (parsedCommand) {
            const targetLower = parsedCommand.target.toLowerCase();
            return allActions.filter(action => {
                if (action.category === 'idp') {
                    return action.label.toLowerCase().includes(targetLower);
                }
                return false;
            });
        }

        const query = search.toLowerCase();

        return allActions.filter(action => {
            const labelMatch = action.label.toLowerCase().includes(query);
            const descMatch = action.description?.toLowerCase().includes(query);
            return labelMatch || descMatch;
        });
    }, [allActions, search, parsedCommand]);

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

    // Wrap action execution to track recent actions
    const executeAction = useCallback((action: IQuickAction) => {
        addRecentAction(action.id);
        action.action();
    }, []);
    
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
                    const action = filteredActions[selectedIndex];
                    if (action) executeAction(action);
                }
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, filteredActions, selectedIndex, executeAction]);
    
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
                            placeholder="Search IdPs, actions, or type 'suspend [name]'..."
                            className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none text-sm"
                            autoFocus
                        />
                        <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-mono text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-400 rounded">
                            ESC
                        </kbd>
                    </div>
                    
                    {/* Command indicator */}
                    {parsedCommand && (
                        <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-200 dark:border-indigo-800 text-xs text-indigo-700 dark:text-indigo-400">
                            Command: <span className="font-semibold">{parsedCommand.verb}</span> on IdPs matching &ldquo;{parsedCommand.target}&rdquo;
                        </div>
                    )}

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
                                                    onClick={() => executeAction(action)}
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
                                                    onClick={() => executeAction(action)}
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
                                                    onClick={() => executeAction(action)}
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
