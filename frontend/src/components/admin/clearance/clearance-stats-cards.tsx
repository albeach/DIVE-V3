/**
 * Clearance Stats Cards Component
 *
 * Modern dashboard cards showing clearance mapping statistics
 * Phase 3: MongoDB SSOT Admin UI
 * Date: 2026-01-04
 * Updated: 2026-02-03 - Added country CRUD operations
 */

'use client';

import React, { useState } from 'react';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { MotionButton } from '@/components/ui/micro-interactions';
import { Plus, Trash2, X, Loader2, Globe, AlertTriangle } from 'lucide-react';

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

// Add Country Modal
function AddCountryModal({ onClose, onAdd }: { onClose: () => void; onAdd: (data: { countryCode: string; name: string; mappings: Record<string, string> }) => Promise<void> }) {
    const [countryCode, setCountryCode] = useState('');
    const [countryName, setCountryName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!countryCode.trim() || !countryName.trim()) {
            setError('Country code and name are required');
            return;
        }
        if (countryCode.length !== 3) {
            setError('Country code must be exactly 3 characters (ISO 3166-1 alpha-3)');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            await onAdd({
                countryCode: countryCode.toUpperCase(),
                name: countryName,
                mappings: {
                    UNCLASSIFIED: countryName + ' - Unclassified',
                    RESTRICTED: countryName + ' - Restricted',
                    CONFIDENTIAL: countryName + ' - Confidential',
                    SECRET: countryName + ' - Secret',
                    TOP_SECRET: countryName + ' - Top Secret',
                }
            });
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add country');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Globe className="w-5 h-5 text-indigo-500" />
                        Add New Country
                    </h3>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Country Code (ISO 3166-1 alpha-3)
                        </label>
                        <input
                            type="text"
                            value={countryCode}
                            onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                            placeholder="e.g., USA, GBR, FRA"
                            maxLength={3}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Country Name
                        </label>
                        <input
                            type="text"
                            value={countryName}
                            onChange={(e) => setCountryName(e.target.value)}
                            placeholder="e.g., United States of America"
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Add Country
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// Delete Country Confirmation
function DeleteCountryModal({ country, onClose, onDelete }: { country: string; onClose: () => void; onDelete: () => Promise<void> }) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDelete = async () => {
        setIsDeleting(true);
        setError(null);
        try {
            await onDelete();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete country');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
                <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                        <Trash2 className="w-8 h-8 text-red-600" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                        Delete Country?
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                        Are you sure you want to delete <strong>{country}</strong>? This will remove all clearance mappings for this country.
                    </p>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="flex-1 px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ClearanceStatsCards({ stats, mappings, countries, onRefresh }: Props) {
    const [showAddModal, setShowAddModal] = useState(false);
    const [deleteCountry, setDeleteCountry] = useState<string | null>(null);

    const handleAddCountry = async (data: { countryCode: string; name: string; mappings: Record<string, string> }) => {
        const response = await fetch('/api/admin/clearance/countries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to add country');
        }

        onRefresh();
    };

    const handleDeleteCountry = async (countryCode: string) => {
        const response = await fetch(`/api/admin/clearance/countries/${countryCode}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to delete country');
        }

        onRefresh();
    };
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
                        className="group relative bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-slate-200 dark:border-gray-700 p-6 hover:shadow-2xl transition-all duration-300 overflow-hidden"
                    >
                        {/* Gradient background (subtle) */}
                        <div
                            className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${card.gradient} opacity-5 rounded-full -mr-16 -mt-16 group-hover:opacity-10 transition-opacity duration-300`}
                        />

                        {/* Content */}
                        <div className="relative">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                                        {card.title}
                                    </p>
                                    <h3 className={`text-4xl font-bold bg-gradient-to-r ${card.gradient} bg-clip-text text-transparent`}>
                                        {typeof card.value === 'number' ? (
                                            <AnimatedCounter value={card.value} />
                                        ) : (
                                            card.value
                                        )}
                                    </h3>
                                </div>
                                <div className="text-4xl">{card.icon}</div>
                            </div>

                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                {card.description}
                            </p>

                            <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r ${card.gradient} bg-opacity-10 text-gray-700 dark:text-gray-300`}>
                                    {card.trend}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Quick Actions */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-slate-200 dark:border-gray-700 p-6">
                <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <span>⚡</span>
                    <span>Quick Actions</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <MotionButton
                        variant="primary"
                        size="lg"
                        glow
                        onClick={onRefresh}
                        className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
                    >
                        <span>🔄</span>
                        <span>Refresh Data</span>
                    </MotionButton>

                    <MotionButton
                        variant="primary"
                        size="lg"
                        glow
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Add Country</span>
                    </MotionButton>

                    <MotionButton
                        variant="primary"
                        size="lg"
                        glow
                        onClick={() => {
                            fetch('/api/admin/clearance/validate', { method: 'POST' })
                                .then(res => res.json())
                                .then(data => alert(data.success ? 'Validation passed!' : `Errors: ${data.data.errors.join(', ')}`))
                                .catch(err => alert('Validation failed: ' + err.message));
                        }}
                        className="flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                    >
                        <span>✅</span>
                        <span>Validate All</span>
                    </MotionButton>

                    <MotionButton
                        variant="primary"
                        size="lg"
                        glow
                        onClick={() => {
                            const data = JSON.stringify({ mappings, countries, stats }, null, 2);
                            const blob = new Blob([data], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `clearance-mappings-${new Date().toISOString()}.json`;
                            a.click();
                        }}
                        className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                    >
                        <span>📥</span>
                        <span>Export JSON</span>
                    </MotionButton>

                    <MotionButton
                        variant="default"
                        size="lg"
                        onClick={() => {
                            window.open('https://www.nato.int/cps/en/natohq/topics_108163.htm', '_blank');
                        }}
                        className="flex items-center justify-center gap-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white hover:from-gray-700 hover:to-gray-800 border-0"
                    >
                        <span>📖</span>
                        <span>NATO Docs</span>
                    </MotionButton>
                </div>
            </div>

            {/* Country Management Card */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-slate-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-indigo-500" />
                    <span>Country Management</span>
                    <span className="ml-auto text-sm font-normal text-gray-500">{countries.length} countries</span>
                </h3>

                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                    {countries.map(country => (
                        <div
                            key={country}
                            className="group inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 rounded-lg border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                        >
                            <span className="font-medium">{country}</span>
                            <button
                                onClick={() => setDeleteCountry(country)}
                                className="opacity-0 group-hover:opacity-100 text-indigo-600 hover:text-red-600 transition-all"
                                title={`Delete ${country}`}
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>

                {countries.length === 0 && (
                    <p className="text-gray-500 text-center py-4">No countries configured. Click "Add Country" to get started.</p>
                )}
            </div>

            {/* Modals */}
            {showAddModal && (
                <AddCountryModal
                    onClose={() => setShowAddModal(false)}
                    onAdd={handleAddCountry}
                />
            )}

            {deleteCountry && (
                <DeleteCountryModal
                    country={deleteCountry}
                    onClose={() => setDeleteCountry(null)}
                    onDelete={() => handleDeleteCountry(deleteCountry)}
                />
            )}

            {/* Info Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* AAL Levels */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-slate-200 dark:border-gray-700 p-6">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                        <span>🔒</span>
                        <span>AAL (Authentication Assurance Levels)</span>
                    </h3>

                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center font-bold text-green-700">
                                1
                            </div>
                            <div>
                                <p className="font-medium text-gray-800 dark:text-gray-200">AAL1: No MFA</p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">UNCLASSIFIED, RESTRICTED</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center font-bold text-yellow-700">
                                2
                            </div>
                            <div>
                                <p className="font-medium text-gray-800 dark:text-gray-200">AAL2: MFA Required</p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">CONFIDENTIAL, SECRET</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center font-bold text-red-700">
                                3
                            </div>
                            <div>
                                <p className="font-medium text-gray-800 dark:text-gray-200">AAL3: Hardware Token</p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">TOP_SECRET</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Multilingual Support */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-slate-200 dark:border-gray-700 p-6">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                        <span>🌐</span>
                        <span>Multilingual Coverage</span>
                    </h3>

                    <div className="space-y-3">
                        <div>
                            <p className="font-medium text-gray-800 dark:text-gray-200 mb-2">Supported Scripts</p>
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
                            <p className="font-medium text-gray-800 dark:text-gray-200 mb-2">Bilingual/Trilingual</p>
                            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                                <p>🇧🇪 Belgium: Dutch/French</p>
                                <p>🇫🇮 Finland: Finnish/Swedish</p>
                                <p>🇱🇺 Luxembourg: FR/DE/LB</p>
                            </div>
                        </div>

                        <div>
                            <p className="font-medium text-gray-800 dark:text-gray-200 mb-2">Diacritic Support</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                All accented characters supported with/without diacritics
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
