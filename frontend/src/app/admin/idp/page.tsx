/**
 * IdP Management Page - 2025 Revamp
 *
 * Modern redesign with:
 * - IdPCard2025 glassmorphism cards
 * - IdPStatsBar with animated counters
 * - IdPQuickSwitcher (Cmd+K command palette)
 * - IdPQuickActions FAB
 * - IdPBatchOperations toolbar
 * - AdminBreadcrumbs navigation
 * - Real-time updates via IdPManagementContext
 * - Responsive masonry grid layout
 * - Beautiful empty states
 * - Slide-out detail panel with tabs
 *
 * Phase 3.1: Page Integration
 */

'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import PageLayout from '@/components/layout/page-layout';
import AdminBreadcrumbs from '@/components/admin/AdminBreadcrumbs';
import IdPCard2025 from '@/components/admin/IdPCard2025';
import IdPStatsBar, { IdPStats } from '@/components/admin/IdPStatsBar';
import IdPQuickSwitcher from '@/components/admin/IdPQuickSwitcher';
import IdPQuickActions from '@/components/admin/IdPQuickActions';
import IdPBatchOperations from '@/components/admin/IdPBatchOperations';
import RecentIdPs from '@/components/admin/RecentIdPs';
import IdPDetailPanel from '@/components/admin/IdPDetailPanel';
import { useIdPManagement, IdPManagementProvider } from '@/contexts/IdPManagementContext';
import { useIdPs, useTestIdP, useDeleteIdP } from '@/lib/api/idp-management';
import { InlineHelp } from '@/components/admin/educational/ContextualHelp';
import {
    MagnifyingGlassIcon,
    FunnelIcon,
    Squares2X2Icon,
    ListBulletIcon,
    PlusIcon,
    XMarkIcon
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';

// Phase 5.3 integrations
import { InteractiveBreadcrumbs } from '@/components/ui/interactive-breadcrumbs';
import { KeyboardShortcutsModal } from '@/components/ui/keyboard-shortcuts-modal';
import { useKeyboardNavigation } from '@/hooks/use-keyboard-navigation';

// ============================================
// Main Component (Wrapped)
// ============================================

export default function IdPManagementPage() {
    return (
        <IdPManagementProvider>
            <IdPManagementPageContent />
        </IdPManagementProvider>
    );
}

// ============================================
// Page Content
// ============================================

function IdPManagementPageContent() {
    const router = useRouter();
    const { data: session } = useSession();

    const {
        selectedIdPAlias,
        selectIdP,
        filters,
        updateFilters,
        clearFilters,
        viewMode,
        setViewMode,
        triggerRefresh
    } = useIdPManagement();

    const { data: idps = [], isLoading, refetch } = useIdPs();
    const testIdPMutation = useTestIdP();
    const deleteIdPMutation = useDeleteIdP();

    const { data: certHealth } = useQuery({
        queryKey: ['admin', 'certificates', 'health'],
        queryFn: async () => {
            const res = await fetch('/api/admin/certificates/health');
            if (!res.ok) return null;
            return res.json();
        },
        staleTime: 60_000,
        retry: false,
    });

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showDetailPanel, setShowDetailPanel] = useState(false);
    const { isHelpOpen, setIsHelpOpen } = useKeyboardNavigation({
        searchSelector: '[data-search-input]',
    });

    // Debug: Log session and IdPs data
    React.useEffect(() => {
        console.log('[IdP Management] Session state:', {
            hasSession: !!session,
            hasAccessToken: !!(session as any)?.accessToken,
            user: session?.user?.email || 'none',
        });
        console.log('[IdP Management] IdPs data:', {
            isLoading,
            idpsType: typeof idps,
            idpsIsArray: Array.isArray(idps),
            idpsLength: Array.isArray(idps) ? idps.length : 'not array',
            idpsData: idps,
        });
    }, [session, idps, isLoading]);

    // ============================================
    // Filter & Stats
    // ============================================

    const filteredIdPs = useMemo(() => {
        // Ensure idps is always an array
        const idpsList = Array.isArray(idps) ? idps : [];
        let filtered = [...idpsList];

        // Search filter
        if (filters.search) {
            const query = filters.search.toLowerCase();
            filtered = filtered.filter(idp =>
                idp.displayName.toLowerCase().includes(query) ||
                idp.alias.toLowerCase().includes(query)
            );
        }

        // Protocol filter
        if (filters.protocol && filters.protocol !== 'all') {
            filtered = filtered.filter(idp => idp.protocol === filters.protocol);
        }

        // Status filter
        if (filters.status && filters.status !== 'all') {
            const isEnabled = filters.status === 'enabled';
            filtered = filtered.filter(idp => idp.enabled === isEnabled);
        }

        return filtered;
    }, [idps, filters]);

    const stats: IdPStats = useMemo(() => {
        const idpsList = Array.isArray(idps) ? idps : [];

        // Calculate warnings from certificate health data
        let warningCount = 0;
        if (certHealth) {
            const certs = Array.isArray(certHealth.certificates) ? certHealth.certificates : [];
            const now = Date.now();
            const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
            warningCount += certs.filter((cert: { expiresAt?: string; status?: string }) => {
                if (cert.status === 'expired' || cert.status === 'revoked') return false;
                const expiresAt = cert.expiresAt ? new Date(cert.expiresAt).getTime() : 0;
                return expiresAt > 0 && expiresAt - now < THIRTY_DAYS_MS;
            }).length;
        }

        return {
            total: idpsList.length,
            online: idpsList.filter(idp => idp.enabled).length,
            offline: idpsList.filter(idp => !idp.enabled).length,
            warning: warningCount,
        };
    }, [idps, certHealth]);

    // ============================================
    // Handlers
    // ============================================

    const handleFilterByStatus = (filter: 'all' | 'online' | 'offline' | 'warning') => {
        if (filter === 'all') {
            updateFilters({ status: 'all' });
        } else if (filter === 'online') {
            updateFilters({ status: 'enabled' });
        } else if (filter === 'offline') {
            updateFilters({ status: 'disabled' });
        }
    };

    const handleTestIdP = async (alias: string) => {
        try {
            const result = await testIdPMutation.mutateAsync(alias);
            alert(result.success ? `✅ ${result.message}` : `❌ ${result.message}`);
        } catch (error) {
            alert('Failed to test IdP connection');
        }
    };

    const handleViewIdP = (alias: string) => {
        selectIdP(alias);
        setShowDetailPanel(true);
    };

    const handleEditIdP = (alias: string) => {
        selectIdP(alias);
        setShowDetailPanel(true);
    };

    const handleDeleteIdP = async (alias: string) => {
        if (confirm(`Are you sure you want to delete ${alias}?`)) {
            try {
                await deleteIdPMutation.mutateAsync(alias);
                refetch();
                alert('IdP deleted successfully');
            } catch (error) {
                alert('Failed to delete IdP');
            }
        }
    };

    const handleViewAnalytics = (alias: string) => {
        router.push(`/admin/analytics?filter=${alias}`);
    };

    const handleToggleSelection = (alias: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(alias)) {
            newSelected.delete(alias);
        } else {
            newSelected.add(alias);
        }
        setSelectedIds(newSelected);
    };

    // ============================================
    // Render
    // ============================================

    if (!session) {
        return (
            <PageLayout user={{}}>
                <div className="text-center py-12">
                    <p className="text-gray-500 dark:text-gray-400">
                        Please sign in to access IdP Management
                    </p>
                </div>
            </PageLayout>
        );
    }

    return (
        <PageLayout user={session.user || {}}>
            <KeyboardShortcutsModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Interactive Breadcrumbs - SSOT for Admin Navigation */}
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            Identity Provider Management
                            <InlineHelp
                                variant="info"
                                size="md"
                                position="bottom"
                                content={{
                                    title: 'Identity Provider Management',
                                    description: 'Centralized management of all external identity providers federated with DIVE V3. Monitor health, test connections, and manage protocol configurations.',
                                    tips: [
                                        'Use the search to quickly find IdPs by name or country',
                                        'Filter by protocol type (OIDC vs SAML) or status',
                                        'Test IdP connections before deploying to production'
                                    ],
                                    learnMoreUrl: '/integration/federation-vs-object',
                                    learnMoreLabel: 'Integration Guide'
                                }}
                            />
                        </h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Manage and monitor your federated identity providers
                        </p>
                    </div>

                    <button
                        onClick={() => router.push('/admin/idp/new')}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
                    >
                        <PlusIcon className="h-5 w-5" />
                        Add New IdP
                    </button>
                </div>

                {/* Stats Bar */}
                <IdPStatsBar
                    stats={stats}
                    onFilterClick={handleFilterByStatus}
                    activeFilter={filters.status === 'enabled' ? 'online' : filters.status === 'disabled' ? 'offline' : 'all'}
                />

                {/* Filters & View Toggle */}
                <div className="flex items-center justify-between gap-4">
                    {/* Search */}
                    <div className="relative flex-1 max-w-md">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input
                            type="text"
                            value={filters.search || ''}
                            onChange={(e) => updateFilters({ search: e.target.value })}
                            placeholder="Search IdPs..."
                            className="w-full pl-10 pr-10 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <InlineHelp
                                variant="help"
                                size="sm"
                                position="bottom"
                                content={{
                                    title: 'IdP Search',
                                    description: 'Search across Identity Provider names, aliases, and countries. Search is case-insensitive and matches partial text.',
                                    examples: [
                                        'Try "germany" to find Germany IdP',
                                        'Search "oidc" to find all OIDC providers',
                                        'Type country codes like "USA" or "FRA"'
                                    ]
                                }}
                            />
                        </div>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex items-center gap-2">
                        {Object.entries(filters).filter(([key, val]) => val && val !== 'all').length > 0 && (
                            <button
                                onClick={clearFilters}
                                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                                Clear filters
                            </button>
                        )}

                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => updateFilters({ protocol: filters.protocol === 'oidc' ? 'all' : 'oidc' })}
                                className={`
                                    px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                                    ${filters.protocol === 'oidc'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}
                                `}
                            >
                                OIDC
                            </button>

                            <button
                                onClick={() => updateFilters({ protocol: filters.protocol === 'saml' ? 'all' : 'saml' })}
                                className={`
                                    px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                                    ${filters.protocol === 'saml'
                                        ? 'bg-green-600 text-white'
                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}
                                `}
                            >
                                SAML
                            </button>

                            <InlineHelp
                                variant="info"
                                size="sm"
                                position="bottom"
                                content={{
                                    title: 'Protocol Filtering',
                                    description: 'Filter IdPs by authentication protocol. OIDC is modern and JSON-based, while SAML is XML-based and used by legacy enterprise systems.',
                                    tips: [
                                        'OIDC: Recommended for new integrations',
                                        'SAML: Required for older enterprise IdPs',
                                        'Click to toggle filter on/off'
                                    ],
                                    learnMoreUrl: '/docs/idp/protocol-comparison'
                                }}
                            />
                        </div>
                    </div>

                    {/* View Toggle */}
                    <div className="flex items-center gap-1 bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`
                                p-2 rounded transition-colors
                                ${viewMode === 'grid'
                                    ? 'bg-white dark:bg-gray-800 text-purple-600 dark:text-purple-400'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}
                            `}
                            title="Grid View"
                        >
                            <Squares2X2Icon className="h-5 w-5" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`
                                p-2 rounded transition-colors
                                ${viewMode === 'list'
                                    ? 'bg-white dark:bg-gray-800 text-purple-600 dark:text-purple-400'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}
                            `}
                            title="List View"
                        >
                            <ListBulletIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Main Content */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* IdP Cards */}
                    <div className="lg:col-span-3">
                        {isLoading ? (
                            <LoadingState />
                        ) : filteredIdPs.length === 0 ? (
                            <EmptyState
                                hasSearch={!!filters.search}
                                onClearFilters={clearFilters}
                                onAddNew={() => router.push('/admin/idp/new')}
                            />
                        ) : (
                            <div className={`
                                ${viewMode === 'grid'
                                    ? 'grid grid-cols-1 md:grid-cols-2 gap-6'
                                    : 'space-y-4'}
                            `}>
                                <AnimatePresence>
                                    {filteredIdPs.map((idp) => (
                                        <IdPCard2025
                                            key={idp.alias}
                                            idp={idp}
                                            onTest={handleTestIdP}
                                            onView={handleViewIdP}
                                            onEdit={handleEditIdP}
                                            onDelete={handleDeleteIdP}
                                            onViewAnalytics={handleViewAnalytics}
                                            selected={selectedIdPAlias === idp.alias}
                                            onClick={() => handleToggleSelection(idp.alias)}
                                        />
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div className="lg:col-span-1 space-y-6">
                        <RecentIdPs />

                        {/* Quick Links */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                                Quick Links
                            </h3>
                            <div className="space-y-2">
                                <a
                                    href="/admin/analytics"
                                    className="block px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                                >
                                    View Analytics Dashboard
                                </a>
                                <a
                                    href="/admin/dashboard"
                                    className="block px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                                >
                                    Super Admin Console
                                </a>
                                <a
                                    href="/integration/federation-vs-object"
                                    className="block px-3 py-2 text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md transition-colors font-medium"
                                >
                                    📖 Integration Guide (NEW)
                                </a>
                                <a
                                    href="/admin/idp/new"
                                    className="block px-3 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md transition-colors font-medium"
                                >
                                    Add New IdP
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Command Palette */}
            <IdPQuickSwitcher />

            {/* Floating Actions */}
            <IdPQuickActions
                onRefresh={() => {
                    refetch();
                    triggerRefresh();
                }}
                onExport={() => {
                    // Ensure idps is an array before exporting
                    const idpsList = Array.isArray(idps) ? idps : [];
                    const data = JSON.stringify(idpsList, null, 2);
                    const blob = new Blob([data], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `idp-config-${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                }}
            />

            {/* Batch Operations */}
            <IdPBatchOperations
                selectedIds={selectedIds}
                onClearSelection={() => setSelectedIds(new Set())}
                onComplete={() => refetch()}
            />

            {/* Detail Panel - Now Functional! */}
            <AnimatePresence>
                {showDetailPanel && selectedIdPAlias && (
                    <IdPDetailPanel
                        idpAlias={selectedIdPAlias}
                        onClose={() => {
                            setShowDetailPanel(false);
                            selectIdP(null);
                        }}
                        onUpdate={() => {
                            refetch(); // Refresh IdP list when changes are made
                        }}
                    />
                )}
            </AnimatePresence>
        </PageLayout>
    );
}

// ============================================
// Loading State
// ============================================

function LoadingState() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse">
                    <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-xl" />
                </div>
            ))}
        </div>
    );
}

// ============================================
// Empty State
// ============================================

interface EmptyStateProps {
    hasSearch: boolean;
    onClearFilters: () => void;
    onAddNew: () => void;
}

function EmptyState({ hasSearch, onClearFilters, onAddNew }: EmptyStateProps) {
    return (
        <div className="text-center py-16 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/10 dark:to-blue-900/10 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700">
            <div className="max-w-md mx-auto">
                <div className="w-16 h-16 mx-auto mb-4 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                    <FunnelIcon className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                </div>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {hasSearch ? 'No matching IdPs found' : 'No Identity Providers yet'}
                </h3>

                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                    {hasSearch
                        ? 'Try adjusting your search or filters'
                        : 'Get started by adding your first Identity Provider'}
                </p>

                <div className="flex items-center justify-center gap-3">
                    {hasSearch ? (
                        <button
                            onClick={onClearFilters}
                            className="px-6 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                        >
                            Clear Filters
                        </button>
                    ) : (
                        <button
                            onClick={onAddNew}
                            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
                        >
                            <PlusIcon className="h-5 w-5" />
                            Add Your First IdP
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
