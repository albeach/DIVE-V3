"use client";

/**
 * Federated Resource Search Component
 * Phase 3: Distributed Query Federation UI
 * 
 * Enables users to search for resources across all federated instances
 * (USA, FRA, GBR, DEU) with real-time ABAC filtering.
 * 
 * Features:
 * - Instance selection (toggle which countries to search)
 * - Classification filter
 * - COI filter
 * - Real-time search with debouncing
 * - Instance status indicators
 * - Performance metrics display
 * 
 * NATO Compliance: ACP-240 §5.4 (Federated Resource Access)
 */

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Search, Globe2, Shield, Clock, AlertCircle, CheckCircle, Loader2, Filter, X } from 'lucide-react';

// ============================================
// Types
// ============================================

interface IFederatedResource {
    resourceId: string;
    title: string;
    classification: string;
    releasabilityTo: string[];
    COI: string[];
    encrypted: boolean;
    creationDate?: string;
    displayMarking?: string;
    originRealm: string;
    sourceInstance: string;
}

interface IInstanceResult {
    count: number;
    latencyMs: number;
    error?: string;
    circuitBreakerState: string;
}

interface IFederatedSearchResponse {
    totalResults: number;
    results: IFederatedResource[];
    instanceResults: Record<string, IInstanceResult>;
    executionTimeMs: number;
    cacheHit: boolean;
    timestamp: string;
}

interface IFederatedInstance {
    code: string;
    name: string;
    flag: string;
    enabled: boolean;
    available: boolean;
}

// ============================================
// Constants
// ============================================

const INSTANCES: IFederatedInstance[] = [
    { code: 'USA', name: 'United States', flag: '🇺🇸', enabled: true, available: true },
    { code: 'FRA', name: 'France', flag: '🇫🇷', enabled: true, available: true },
    { code: 'GBR', name: 'United Kingdom', flag: '🇬🇧', enabled: true, available: true },
    { code: 'DEU', name: 'Germany', flag: '🇩🇪', enabled: true, available: true },
];

const CLASSIFICATIONS = [
    { value: 'UNCLASSIFIED', label: 'Unclassified', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' },
    { value: 'RESTRICTED', label: 'Restricted', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100' },
    { value: 'CONFIDENTIAL', label: 'Confidential', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100' },
    { value: 'SECRET', label: 'Secret', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100' },
    { value: 'TOP_SECRET', label: 'Top Secret', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' },
];

const COIS = ['NATO', 'NATO-COSMIC', 'FVEY', 'CAN-US', 'US-ONLY', 'EU-RESTRICTED'];

// ============================================
// Component
// ============================================

export function FederatedResourceSearch() {
    const { data: session, status } = useSession();
    
    // Search state
    const [query, setQuery] = useState('');
    const [selectedInstances, setSelectedInstances] = useState<string[]>(['USA', 'FRA', 'GBR', 'DEU']);
    const [selectedClassifications, setSelectedClassifications] = useState<string[]>([]);
    const [selectedCOIs, setSelectedCOIs] = useState<string[]>([]);
    const [showFilters, setShowFilters] = useState(false);
    
    // Results state
    const [results, setResults] = useState<IFederatedSearchResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Instance status
    const [instanceStatus, setInstanceStatus] = useState<Record<string, any>>({});

    // API base URL
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://localhost:4000';

    // Debounced search
    const executeSearch = useCallback(async () => {
        if (!session?.accessToken) return;
        
        setLoading(true);
        setError(null);

        try {
            const body = {
                query: query || undefined,
                classification: selectedClassifications.length ? selectedClassifications : undefined,
                coi: selectedCOIs.length ? selectedCOIs : undefined,
                instances: selectedInstances,
                limit: 50
            };

            const response = await fetch(`${apiUrl}/api/resources/federated-query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.accessToken}`
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || `Search failed: ${response.status}`);
            }

            const data: IFederatedSearchResponse = await response.json();
            setResults(data);
            
            // Update instance status from response
            const status: Record<string, any> = {};
            for (const [code, result] of Object.entries(data.instanceResults)) {
                status[code] = {
                    available: !result.error,
                    latencyMs: result.latencyMs,
                    error: result.error,
                    circuitBreakerState: result.circuitBreakerState
                };
            }
            setInstanceStatus(status);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed');
            setResults(null);
        } finally {
            setLoading(false);
        }
    }, [session?.accessToken, query, selectedInstances, selectedClassifications, selectedCOIs, apiUrl]);

    // Auto-search on filter change (debounced)
    useEffect(() => {
        if (status !== 'authenticated') return;
        
        const timer = setTimeout(() => {
            executeSearch();
        }, 300);

        return () => clearTimeout(timer);
    }, [selectedInstances, selectedClassifications, selectedCOIs, status, executeSearch]);

    // Initial load
    useEffect(() => {
        if (status === 'authenticated' && !results) {
            executeSearch();
        }
    }, [status, results, executeSearch]);

    // Toggle instance selection
    const toggleInstance = (code: string) => {
        setSelectedInstances(prev => 
            prev.includes(code) 
                ? prev.filter(c => c !== code)
                : [...prev, code]
        );
    };

    // Toggle classification
    const toggleClassification = (value: string) => {
        setSelectedClassifications(prev =>
            prev.includes(value)
                ? prev.filter(c => c !== value)
                : [...prev, value]
        );
    };

    // Toggle COI
    const toggleCOI = (value: string) => {
        setSelectedCOIs(prev =>
            prev.includes(value)
                ? prev.filter(c => c !== value)
                : [...prev, value]
        );
    };

    // Clear all filters
    const clearFilters = () => {
        setSelectedClassifications([]);
        setSelectedCOIs([]);
    };

    if (status === 'loading') {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    if (status === 'unauthenticated') {
        return (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-6 text-center">
                <Shield className="w-12 h-12 mx-auto text-yellow-600 dark:text-yellow-400 mb-4" />
                <h3 className="text-lg font-bold text-yellow-800 dark:text-yellow-200 mb-2">
                    Authentication Required
                </h3>
                <p className="text-yellow-700 dark:text-yellow-300">
                    Please sign in to access federated resources.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Search Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white">
                <div className="flex items-center gap-3 mb-4">
                    <Globe2 className="w-8 h-8" />
                    <div>
                        <h2 className="text-2xl font-bold">Federated Resource Search</h2>
                        <p className="text-indigo-200 text-sm">
                            Search across all coalition instances • 29,100+ resources
                        </p>
                    </div>
                </div>

                {/* Search Input */}
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-300" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
                        placeholder="Search resources by title, ID, or keywords..."
                        className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-indigo-200 focus:outline-none focus:ring-2 focus:ring-white/50"
                    />
                    {loading && (
                        <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white animate-spin" />
                    )}
                </div>
            </div>

            {/* Instance Selection */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Globe2 className="w-5 h-5 text-indigo-600" />
                        Federation Instances
                    </h3>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                        <Filter className="w-4 h-4" />
                        {showFilters ? 'Hide Filters' : 'Show Filters'}
                    </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {INSTANCES.map((instance) => {
                        const status = instanceStatus[instance.code];
                        const isSelected = selectedInstances.includes(instance.code);
                        const hasError = status?.error;
                        const circuitOpen = status?.circuitBreakerState === 'open';

                        return (
                            <button
                                key={instance.code}
                                onClick={() => toggleInstance(instance.code)}
                                className={`
                                    relative p-4 rounded-xl border-2 transition-all text-left
                                    ${isSelected 
                                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' 
                                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                    }
                                    ${(hasError || circuitOpen) ? 'opacity-60' : ''}
                                `}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-2xl">{instance.flag}</span>
                                    <span className="font-bold text-gray-900 dark:text-gray-100">
                                        {instance.code}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {instance.name}
                                </div>
                                
                                {/* Status indicator */}
                                <div className="absolute top-2 right-2">
                                    {hasError || circuitOpen ? (
                                        <AlertCircle className="w-4 h-4 text-red-500" />
                                    ) : status?.available ? (
                                        <CheckCircle className="w-4 h-4 text-green-500" />
                                    ) : (
                                        <div className="w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-600" />
                                    )}
                                </div>

                                {/* Latency */}
                                {status?.latencyMs && (
                                    <div className="mt-2 text-xs text-gray-400 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {status.latencyMs}ms
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Advanced Filters */}
            {showFilters && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100">Filters</h3>
                        {(selectedClassifications.length > 0 || selectedCOIs.length > 0) && (
                            <button
                                onClick={clearFilters}
                                className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1"
                            >
                                <X className="w-4 h-4" />
                                Clear filters
                            </button>
                        )}
                    </div>

                    {/* Classification Filter */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                            Classification
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {CLASSIFICATIONS.map((cls) => (
                                <button
                                    key={cls.value}
                                    onClick={() => toggleClassification(cls.value)}
                                    className={`
                                        px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                                        ${selectedClassifications.includes(cls.value)
                                            ? cls.color + ' ring-2 ring-offset-2 ring-indigo-500'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                        }
                                    `}
                                >
                                    {cls.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* COI Filter */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                            Community of Interest (COI)
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {COIS.map((coi) => (
                                <button
                                    key={coi}
                                    onClick={() => toggleCOI(coi)}
                                    className={`
                                        px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                                        ${selectedCOIs.includes(coi)
                                            ? 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-100 ring-2 ring-offset-2 ring-purple-500'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                        }
                                    `}
                                >
                                    {coi}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                        <AlertCircle className="w-5 h-5" />
                        <span>{error}</span>
                    </div>
                </div>
            )}

            {/* Results Summary */}
            {results && (
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                    <div className="flex items-center gap-4 text-sm">
                        <span className="font-bold text-gray-900 dark:text-gray-100">
                            {results.totalResults.toLocaleString()} results
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                            {results.executionTimeMs}ms
                        </span>
                        {results.cacheHit && (
                            <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded text-xs">
                                Cached
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        {Object.entries(results.instanceResults).map(([code, result]) => (
                            <span 
                                key={code}
                                className={`px-2 py-1 rounded ${
                                    result.error 
                                        ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400' 
                                        : 'bg-gray-100 dark:bg-gray-800'
                                }`}
                            >
                                {code}: {result.count}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Results Grid */}
            {results?.results && results.results.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {results.results.map((resource) => (
                        <ResourceCard key={resource.resourceId} resource={resource} />
                    ))}
                </div>
            ) : results && (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No resources found matching your criteria.</p>
                </div>
            )}
        </div>
    );
}

// ============================================
// Resource Card Sub-component
// ============================================

function ResourceCard({ resource }: { resource: IFederatedResource }) {
    const getClassificationColor = (classification: string) => {
        const colors: Record<string, string> = {
            'UNCLASSIFIED': 'bg-green-500',
            'RESTRICTED': 'bg-blue-500',
            'CONFIDENTIAL': 'bg-yellow-500',
            'SECRET': 'bg-orange-500',
            'TOP_SECRET': 'bg-red-500'
        };
        return colors[classification] || 'bg-gray-500';
    };

    const getInstanceFlag = (code: string) => {
        const flags: Record<string, string> = {
            'USA': '🇺🇸',
            'FRA': '🇫🇷',
            'GBR': '🇬🇧',
            'DEU': '🇩🇪'
        };
        return flags[code] || '🌐';
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-all group">
            {/* Classification Banner */}
            <div className={`${getClassificationColor(resource.classification)} h-1.5`} />
            
            <div className="p-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                    <h4 className="font-bold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2">
                        {resource.title}
                    </h4>
                    <span className="text-xl flex-shrink-0" title={`Origin: ${resource.originRealm}`}>
                        {getInstanceFlag(resource.sourceInstance)}
                    </span>
                </div>

                {/* Resource ID */}
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-3 font-mono">
                    {resource.resourceId}
                </div>

                {/* Attributes */}
                <div className="space-y-2">
                    {/* Classification */}
                    <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-gray-400" />
                        <span className={`
                            px-2 py-0.5 rounded text-xs font-bold
                            ${getClassificationColor(resource.classification)} text-white
                        `}>
                            {resource.classification}
                        </span>
                    </div>

                    {/* Releasability */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <Globe2 className="w-4 h-4 text-gray-400" />
                        {resource.releasabilityTo.slice(0, 4).map((country) => (
                            <span 
                                key={country}
                                className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-300"
                            >
                                {country}
                            </span>
                        ))}
                        {resource.releasabilityTo.length > 4 && (
                            <span className="text-xs text-gray-400">
                                +{resource.releasabilityTo.length - 4}
                            </span>
                        )}
                    </div>

                    {/* COI */}
                    {resource.COI && resource.COI.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <Shield className="w-4 h-4 text-purple-400" />
                            {resource.COI.map((coi) => (
                                <span 
                                    key={coi}
                                    className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/50 rounded text-xs text-purple-700 dark:text-purple-300"
                                >
                                    {coi}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Encrypted indicator */}
                    {resource.encrypted && (
                        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                            <Shield className="w-4 h-4" />
                            <span>ZTDF Encrypted</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default FederatedResourceSearch;

