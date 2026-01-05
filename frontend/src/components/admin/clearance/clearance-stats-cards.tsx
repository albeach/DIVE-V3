/**
 * Clearance Stats Cards Component
 *
 * Modern dashboard cards showing clearance mapping statistics
 * Phase 3: MongoDB SSOT Admin UI
 * Date: 2026-01-04
 */

'use client';

import React from 'react';

interface ClearanceMapping {
    standardLevel: string;
    nationalEquivalents: Record<string, string[]>;
    mfaRequired: boolean;
    aalLevel: number;
}

interface Stats {
    totalLevels: number;
    totalCountries: number;
    totalMappings: number;
    lastUpdated: Date | null;
}

interface Props {
    stats: Stats | null;
    mappings: ClearanceMapping[];
    countries: string[];
    onRefresh: () => void;
}

export function ClearanceStatsCards({ stats, mappings, countries, onRefresh }: Props) {
    // Calculate additional metrics
    const mfaRequiredCount = mappings.filter(m => m.mfaRequired).length;
    const avgEquivalentsPerCountry = stats
        ? (stats.totalMappings / stats.totalCountries).toFixed(1)
        : '0';

    // Get multilingual countries (countries with scripts/variants)
    const multilingualCountries = ['BEL', 'FIN', 'LUX', 'BGR', 'GRC', 'MKD', 'MNE'];
    const multilingualCount = countries.filter(c => multilingualCountries.includes(c)).length;

    const statCards = [
        {
            title: 'Total Countries',
            value: stats?.totalCountries || 0,
            icon: '🌍',
            gradient: 'from-blue-500 to-cyan-500',
            description: 'NATO members + partners',
            trend: countries.length > 0 ? '+100%' : '0%'
        },
        {
            title: 'Clearance Levels',
            value: stats?.totalLevels || 0,
            icon: '🔐',
            gradient: 'from-purple-500 to-pink-500',
            description: 'UNCLASSIFIED → TOP_SECRET',
            trend: 'Standard'
        },
        {
            title: 'Total Mappings',
            value: stats?.totalMappings || 0,
            icon: '🔢',
            gradient: 'from-green-500 to-emerald-500',
            description: `${stats?.totalLevels || 0} × ${stats?.totalCountries || 0}`,
            trend: `${avgEquivalentsPerCountry} per country`
        },
        {
            title: 'MFA Required',
            value: mfaRequiredCount,
            icon: '🛡️',
            gradient: 'from-orange-500 to-red-500',
            description: `${mfaRequiredCount} of ${stats?.totalLevels || 0} levels`,
            trend: 'AAL2+'
        },
        {
            title: 'Multilingual',
            value: multilingualCount,
            icon: '🌐',
            gradient: 'from-indigo-500 to-purple-500',
            description: 'Multiple scripts/variants',
            trend: `${((multilingualCount / (stats?.totalCountries || 1)) * 100).toFixed(0)}% coverage`
        },
        {
            title: 'Last Updated',
            value: stats?.lastUpdated
                ? new Date(stats.lastUpdated).toLocaleDateString()
                : 'Never',
            icon: '📅',
            gradient: 'from-teal-500 to-green-500',
            description: stats?.lastUpdated
                ? new Date(stats.lastUpdated).toLocaleTimeString()
                : 'Not initialized',
            trend: 'System time'
        }
    ];

    return (
        <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {statCards.map((card, index) => (
                    <div
                        key={index}
                        className="group relative bg-white rounded-2xl shadow-lg border border-slate-200 p-6 hover:shadow-2xl transition-all duration-300 overflow-hidden"
                    >
                        {/* Gradient background (subtle) */}
                        <div
                            className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${card.gradient} opacity-5 rounded-full -mr-16 -mt-16 group-hover:opacity-10 transition-opacity duration-300`}
                        />

                        {/* Content */}
                        <div className="relative">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-600 mb-1">
                                        {card.title}
                                    </p>
                                    <h3 className={`text-4xl font-bold bg-gradient-to-r ${card.gradient} bg-clip-text text-transparent`}>
                                        {card.value}
                                    </h3>
                                </div>
                                <div className="text-4xl">{card.icon}</div>
                            </div>

                            <p className="text-sm text-gray-600 mb-2">
                                {card.description}
                            </p>

                            <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r ${card.gradient} bg-opacity-10 text-gray-700`}>
                                    {card.trend}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
                <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span>⚡</span>
                    <span>Quick Actions</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <button
                        onClick={onRefresh}
                        className="flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-medium hover:shadow-lg hover:scale-105 transition-all duration-200"
                    >
                        <span>🔄</span>
                        <span>Refresh Data</span>
                    </button>

                    <button
                        onClick={() => {
                            fetch('/api/admin/clearance/validate', { method: 'POST' })
                                .then(res => res.json())
                                .then(data => alert(data.success ? '✅ Validation passed!' : `❌ Errors: ${data.data.errors.join(', ')}`))
                                .catch(err => alert('❌ Validation failed: ' + err.message));
                        }}
                        className="flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-medium hover:shadow-lg hover:scale-105 transition-all duration-200"
                    >
                        <span>✅</span>
                        <span>Validate All</span>
                    </button>

                    <button
                        onClick={() => {
                            const data = JSON.stringify({ mappings, countries, stats }, null, 2);
                            const blob = new Blob([data], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `clearance-mappings-${new Date().toISOString()}.json`;
                            a.click();
                        }}
                        className="flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-medium hover:shadow-lg hover:scale-105 transition-all duration-200"
                    >
                        <span>📥</span>
                        <span>Export JSON</span>
                    </button>

                    <button
                        onClick={() => {
                            window.open('https://www.nato.int/cps/en/natohq/topics_108163.htm', '_blank');
                        }}
                        className="flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl font-medium hover:shadow-lg hover:scale-105 transition-all duration-200"
                    >
                        <span>📖</span>
                        <span>NATO Docs</span>
                    </button>
                </div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* AAL Levels */}
                <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <span>🔒</span>
                        <span>AAL (Authentication Assurance Levels)</span>
                    </h3>

                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center font-bold text-green-700">
                                1
                            </div>
                            <div>
                                <p className="font-medium text-gray-800">AAL1: No MFA</p>
                                <p className="text-sm text-gray-600">UNCLASSIFIED, RESTRICTED</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center font-bold text-yellow-700">
                                2
                            </div>
                            <div>
                                <p className="font-medium text-gray-800">AAL2: MFA Required</p>
                                <p className="text-sm text-gray-600">CONFIDENTIAL, SECRET</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center font-bold text-red-700">
                                3
                            </div>
                            <div>
                                <p className="font-medium text-gray-800">AAL3: Hardware Token</p>
                                <p className="text-sm text-gray-600">TOP_SECRET</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Multilingual Support */}
                <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <span>🌐</span>
                        <span>Multilingual Coverage</span>
                    </h3>

                    <div className="space-y-3">
                        <div>
                            <p className="font-medium text-gray-800 mb-2">Supported Scripts</p>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                                    Latin
                                </span>
                                <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                                    Cyrillic
                                </span>
                                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                                    Greek
                                </span>
                            </div>
                        </div>

                        <div>
                            <p className="font-medium text-gray-800 mb-2">Bilingual/Trilingual</p>
                            <div className="text-sm text-gray-600 space-y-1">
                                <p>🇧🇪 Belgium: Dutch/French</p>
                                <p>🇫🇮 Finland: Finnish/Swedish</p>
                                <p>🇱🇺 Luxembourg: FR/DE/LB</p>
                            </div>
                        </div>

                        <div>
                            <p className="font-medium text-gray-800 mb-2">Diacritic Support</p>
                            <p className="text-sm text-gray-600">
                                All accented characters supported with/without diacritics
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
