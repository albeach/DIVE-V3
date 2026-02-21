/**
 * Clearance Matrix Table Component
 *
 * Interactive 5 levels × 32 countries grid with inline editing
 * Modern 2025 UI with search, filter, sort capabilities
 * Phase 3: MongoDB SSOT Admin UI
 * Date: 2026-01-04
 */

'use client';

import React, { useState, useMemo } from 'react';

interface ClearanceMapping {
    standardLevel: string;
    nationalEquivalents: Record<string, string[]>;
    mfaRequired: boolean;
    aalLevel: number;
    acrLevel: number;
}

interface Props {
    mappings: ClearanceMapping[];
    countries: string[];
    onUpdate: () => void;
}

export function ClearanceMatrixTable({ mappings, countries, onUpdate }: Props) {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterLevel, setFilterLevel] = useState<string>('all');
    const [filterMFA, setFilterMFA] = useState<string>('all');
    const [sortBy, setSortBy] = useState<'level' | 'aal' | 'mappings'>('level');
    const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
    const [editingCell, setEditingCell] = useState<{ level: string; country: string } | null>(null);

    // Filter and sort mappings
    const filteredMappings = useMemo(() => {
        let filtered = [...mappings];

        // Filter by level
        if (filterLevel !== 'all') {
            filtered = filtered.filter(m => m.standardLevel === filterLevel);
        }

        // Filter by MFA
        if (filterMFA === 'required') {
            filtered = filtered.filter(m => m.mfaRequired);
        } else if (filterMFA === 'not-required') {
            filtered = filtered.filter(m => !m.mfaRequired);
        }

        // Sort
        filtered.sort((a, b) => {
            if (sortBy === 'aal') {
                return a.aalLevel - b.aalLevel;
            } else if (sortBy === 'mappings') {
                const aCount = Object.keys(a.nationalEquivalents).length;
                const bCount = Object.keys(b.nationalEquivalents).length;
                return bCount - aCount;
            }
            // Default: sort by level order
            const order = ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
            return order.indexOf(a.standardLevel) - order.indexOf(b.standardLevel);
        });

        return filtered;
    }, [mappings, filterLevel, filterMFA, sortBy]);

    // Filter countries by search
    const filteredCountries = useMemo(() => {
        if (!searchTerm) return countries;
        return countries.filter(c =>
            c.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [countries, searchTerm]);

    const toggleExpand = (level: string, country: string) => {
        const key = `${level}-${country}`;
        const newExpanded = new Set(expandedCells);
        if (newExpanded.has(key)) {
            newExpanded.delete(key);
        } else {
            newExpanded.add(key);
        }
        setExpandedCells(newExpanded);
    };

    const getLevelColor = (level: string) => {
        const colors: Record<string, string> = {
            'UNCLASSIFIED': 'bg-green-100 text-green-800 border-green-200',
            'RESTRICTED': 'bg-yellow-100 text-yellow-800 border-yellow-200',
            'CONFIDENTIAL': 'bg-orange-100 text-orange-800 border-orange-200',
            'SECRET': 'bg-red-100 text-red-800 border-red-200',
            'TOP_SECRET': 'bg-purple-100 text-purple-800 border-purple-200'
        };
        return colors[level] || 'bg-gray-100 text-gray-800';
    };

    const getAALBadge = (aal: number) => {
        const colors: Record<number, string> = {
            1: 'bg-green-500',
            2: 'bg-yellow-500',
            3: 'bg-red-500'
        };
        return (
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold ${colors[aal]}`}>
                {aal}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Search */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            🔍 Search Countries
                        </label>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="USA, FRA, EST..."
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>

                    {/* Filter by Level */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            🔐 Filter by Level
                        </label>
                        <select
                            value={filterLevel}
                            onChange={(e) => setFilterLevel(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                            <option value="all">All Levels</option>
                            <option value="UNCLASSIFIED">UNCLASSIFIED</option>
                            <option value="RESTRICTED">RESTRICTED</option>
                            <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                            <option value="SECRET">SECRET</option>
                            <option value="TOP_SECRET">TOP_SECRET</option>
                        </select>
                    </div>

                    {/* Filter by MFA */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            🛡️ Filter by MFA
                        </label>
                        <select
                            value={filterMFA}
                            onChange={(e) => setFilterMFA(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                            <option value="all">All</option>
                            <option value="required">MFA Required</option>
                            <option value="not-required">No MFA</option>
                        </select>
                    </div>

                    {/* Sort */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            📊 Sort By
                        </label>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                            <option value="level">Clearance Level</option>
                            <option value="aal">AAL Level</option>
                            <option value="mappings">Mapping Count</option>
                        </select>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <span>📊 Showing: {filteredMappings.length} levels</span>
                    <span>🌍 Countries: {filteredCountries.length} of {countries.length}</span>
                    <span>🔢 Total Cells: {filteredMappings.length * filteredCountries.length}</span>
                </div>
            </div>

            {/* Matrix Table */}
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
                            <tr>
                                <th className="sticky left-0 z-10 px-6 py-4 text-left font-semibold bg-gradient-to-r from-indigo-500 to-purple-500">
                                    Level
                                </th>
                                <th className="px-4 py-4 text-center font-semibold">
                                    AAL
                                </th>
                                <th className="px-4 py-4 text-center font-semibold">
                                    MFA
                                </th>
                                {filteredCountries.map(country => (
                                    <th key={country} className="px-4 py-4 text-center font-semibold min-w-[120px]">
                                        {country}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredMappings.map((mapping, idx) => (
                                <tr key={mapping.standardLevel} className={idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800'}>
                                    {/* Level */}
                                    <td className="sticky left-0 z-10 px-6 py-4 font-medium bg-inherit">
                                        <span className={`inline-block px-3 py-1 rounded-lg text-sm font-semibold border-2 ${getLevelColor(mapping.standardLevel)}`}>
                                            {mapping.standardLevel}
                                        </span>
                                    </td>

                                    {/* AAL */}
                                    <td className="px-4 py-4 text-center">
                                        {getAALBadge(mapping.aalLevel)}
                                    </td>

                                    {/* MFA */}
                                    <td className="px-4 py-4 text-center">
                                        {mapping.mfaRequired ? (
                                            <span className="text-green-600 text-xl">✓</span>
                                        ) : (
                                            <span className="text-gray-400 text-xl">–</span>
                                        )}
                                    </td>

                                    {/* Country Mappings */}
                                    {filteredCountries.map(country => {
                                        const equivalents = mapping.nationalEquivalents[country] || [];
                                        const key = `${mapping.standardLevel}-${country}`;
                                        const isExpanded = expandedCells.has(key);

                                        return (
                                            <td key={country} className="px-4 py-4">
                                                {equivalents.length > 0 ? (
                                                    <button
                                                        onClick={() => toggleExpand(mapping.standardLevel, country)}
                                                        className="w-full text-left"
                                                    >
                                                        <div className="space-y-1">
                                                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                                {equivalents[0]}
                                                            </div>
                                                            {equivalents.length > 1 && (
                                                                <>
                                                                    {isExpanded ? (
                                                                        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                                                                            {equivalents.slice(1).map((eq, i) => (
                                                                                <div key={i}>{eq}</div>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="text-xs text-indigo-600 font-medium">
                                                                            +{equivalents.length - 1} more
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </button>
                                                ) : (
                                                    <div className="text-sm text-gray-400 dark:text-gray-500 text-center">
                                                        –
                                                    </div>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Legend */}
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">📖 Legend</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">AAL Levels</p>
                        <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-2">
                                {getAALBadge(1)} <span>AAL1: No MFA</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {getAALBadge(2)} <span>AAL2: MFA Required</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {getAALBadge(3)} <span>AAL3: Hardware Token</span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">Clearance Levels</p>
                        <div className="space-y-1 text-sm">
                            {['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'].map(level => (
                                <div key={level} className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getLevelColor(level)}`}>
                                        {level.substring(0, 3)}
                                    </span>
                                    <span className="text-gray-600 dark:text-gray-400">{level}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">Interactions</p>
                        <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                            <p>🖱️ Click cell to expand all variants</p>
                            <p>🔍 Use filters to narrow view</p>
                            <p>📊 Sort by level, AAL, or count</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
