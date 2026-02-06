/**
 * Clearance Editor Component
 *
 * Edit national clearance mappings for a specific country
 * Modern 2025 UI with tag input, validation, preview
 * Phase 3: MongoDB SSOT Admin UI
 * Phase 3.7: Enhanced with progressive disclosure (accordions)
 * Date: 2026-01-04
 * Updated: 2026-02-05
 */

'use client';

import React, { useState, useEffect } from 'react';
import { AccordionWrapper, AccordionItem, AccordionControls } from '@/components/admin/shared';
import { Badge } from '@/components/ui/badge';

interface ClearanceMapping {
    standardLevel: string;
    nationalEquivalents: Record<string, string[]>;
    mfaRequired: boolean;
    aalLevel: number;
    acrLevel?: number;
    description?: string;
    version?: number;
    updatedAt?: Date;
    updatedBy?: string;
}

interface Props {
    mappings: ClearanceMapping[];
    countries: string[];
    onUpdate: () => void;
}

export function ClearanceEditor({ mappings, countries, onUpdate }: Props) {
    const [selectedCountry, setSelectedCountry] = useState<string>('');
    const [editedMappings, setEditedMappings] = useState<Record<string, string[]>>({});
    const [hasChanges, setHasChanges] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [newTag, setNewTag] = useState<Record<string, string>>({});

    const levels = ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];

    // Load country mappings when country changes
    useEffect(() => {
        if (!selectedCountry) return;

        const countryMappings: Record<string, string[]> = {};
        mappings.forEach(mapping => {
            countryMappings[mapping.standardLevel] = mapping.nationalEquivalents[selectedCountry] || [];
        });
        setEditedMappings(countryMappings);
        setHasChanges(false);
        setError(null);
        setSuccess(null);
    }, [selectedCountry, mappings]);

    const addTag = (level: string) => {
        const tag = newTag[level]?.trim();
        if (!tag) return;

        const current = editedMappings[level] || [];
        if (current.includes(tag)) {
            setError(`"${tag}" already exists for ${level}`);
            return;
        }

        setEditedMappings({
            ...editedMappings,
            [level]: [...current, tag]
        });
        setNewTag({ ...newTag, [level]: '' });
        setHasChanges(true);
        setError(null);
    };

    const removeTag = (level: string, tag: string) => {
        setEditedMappings({
            ...editedMappings,
            [level]: (editedMappings[level] || []).filter(t => t !== tag)
        });
        setHasChanges(true);
    };

    const handleSave = async () => {
        if (!selectedCountry || !hasChanges) return;

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await fetch(`/api/admin/clearance/countries/${selectedCountry}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mappings: editedMappings })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Failed to update mappings');
            }

            setSuccess(`✅ Successfully updated ${selectedCountry} clearance mappings`);
            setHasChanges(false);
            onUpdate();

            // Clear success message after 3 seconds
            setTimeout(() => setSuccess(null), 3000);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        if (!selectedCountry) return;

        const countryMappings: Record<string, string[]> = {};
        mappings.forEach(mapping => {
            countryMappings[mapping.standardLevel] = mapping.nationalEquivalents[selectedCountry] || [];
        });
        setEditedMappings(countryMappings);
        setHasChanges(false);
        setError(null);
        setSuccess(null);
    };

    const getLevelInfo = (level: string) => {
        const mapping = mappings.find(m => m.standardLevel === level);
        return mapping ? {
            mfaRequired: mapping.mfaRequired,
            aalLevel: mapping.aalLevel,
            acrLevel: mapping.acrLevel
        } : null;
    };

    return (
        <div className="space-y-6">
            {/* Country Selector */}
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 p-6">
                <div className="flex items-center gap-4">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            🌍 Select Country to Edit
                        </label>
                        <select
                            value={selectedCountry}
                            onChange={(e) => setSelectedCountry(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-lg"
                        >
                            <option value="">-- Select a country --</option>
                            {countries.map(country => (
                                <option key={country} value={country}>
                                    {country}
                                </option>
                            ))}
                        </select>
                    </div>

                    {hasChanges && (
                        <div className="flex gap-2">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-medium hover:shadow-lg transition-all duration-200 disabled:opacity-50"
                            >
                                {saving ? '💾 Saving...' : '💾 Save Changes'}
                            </button>
                            <button
                                onClick={handleReset}
                                disabled={saving}
                                className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-all duration-200 disabled:opacity-50"
                            >
                                ↶ Reset
                            </button>
                        </div>
                    )}
                </div>

                {/* Status Messages */}
                {error && (
                    <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-400">
                        ⚠️ {error}
                    </div>
                )}
                {success && (
                    <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg text-green-700 dark:text-green-400">
                        {success}
                    </div>
                )}
            </div>

            {/* Editor */}
            {selectedCountry && (
                <div className="space-y-4">
                    {/* Expand/Collapse Controls */}
                    <div className="flex items-center justify-between bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 shadow-sm">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                            📂 {levels.length} clearance levels available
                        </div>
                        <AccordionControls
                            onExpandAll={() => {
                                // Force all accordions open (handled by state management)
                                setError(null);
                            }}
                            onCollapseAll={() => {
                                // Force all accordions closed (handled by state management)
                                setError(null);
                            }}
                        />
                    </div>

                    {/* Clearance Levels Accordion */}
                    <AccordionWrapper
                        storageKey={`dive-v3-accordion-clearance-${selectedCountry}`}
                        multiple={true}
                        defaultOpen={['SECRET', 'TOP_SECRET']}
                    >
                        {levels.map(level => {
                            const info = getLevelInfo(level);
                            const tags = editedMappings[level] || [];

                            return (
                                <AccordionItem
                                    key={level}
                                    value={level}
                                    title={level}
                                    subtitle={`${tags.length} variant${tags.length !== 1 ? 's' : ''} defined for ${selectedCountry}`}
                                    badge={
                                        <div className="flex items-center gap-2">
                                            {info?.mfaRequired && (
                                                <Badge variant="warning" size="sm">
                                                    🛡️ MFA
                                                </Badge>
                                            )}
                                            <Badge variant="default" size="sm">
                                                AAL{info?.aalLevel}
                                            </Badge>
                                            <Badge variant="info" size="sm">
                                                ACR{info?.acrLevel}
                                            </Badge>
                                        </div>
                                    }
                                >
                                    {/* Tags Display */}
                                    <div className="mb-4">
                                        <div className="flex flex-wrap gap-2">
                                            {tags.map((tag, index) => (
                                                <div
                                                    key={index}
                                                    className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 rounded-lg border border-indigo-200 dark:border-indigo-700 group hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                                                >
                                                    <span className="font-medium">{tag}</span>
                                                    <button
                                                        onClick={() => removeTag(level, tag)}
                                                        className="text-indigo-600 hover:text-red-600 font-bold transition-colors"
                                                        title="Remove"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ))}
                                            {tags.length === 0 && (
                                                <div className="text-gray-400 dark:text-gray-500 italic">
                                                    No mappings defined for {selectedCountry}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Add Tag Input */}
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newTag[level] || ''}
                                            onChange={(e) => setNewTag({ ...newTag, [level]: e.target.value })}
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    addTag(level);
                                                }
                                            }}
                                            placeholder="Add national clearance equivalent..."
                                            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                        />
                                        <button
                                            onClick={() => addTag(level)}
                                            className="px-6 py-2 bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-600 transition-colors"
                                        >
                                            ➕ Add
                                        </button>
                                    </div>

                                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                        💡 Tip: Press Enter to add. Include variants with/without diacritics.
                                    </p>
                                </AccordionItem>
                            );
                        })}
                    </AccordionWrapper>
                </div>
            )}

            {/* Instructions */}
            {!selectedCountry && (
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-xl shadow-lg border border-indigo-200 dark:border-indigo-700 p-8 text-center">
                    <div className="text-6xl mb-4">📝</div>
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
                        Select a Country to Edit
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        Choose a country from the dropdown above to edit its clearance mappings.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                            <div className="text-2xl mb-2">➕</div>
                            <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">Add Equivalents</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Type and press Enter or click Add button
                            </p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                            <div className="text-2xl mb-2">✕</div>
                            <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">Remove Equivalents</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Click the ✕ button on any tag
                            </p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                            <div className="text-2xl mb-2">💾</div>
                            <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">Save Changes</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Click Save when done editing
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
