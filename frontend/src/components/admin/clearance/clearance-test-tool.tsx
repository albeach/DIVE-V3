/**
 * Clearance Test Tool Component
 *
 * Interactive tool to test clearance mappings
 * Modern 2025 UI with instant feedback, examples
 * Phase 3: MongoDB SSOT Admin UI
 * Date: 2026-01-04
 */

'use client';

import React, { useState } from 'react';

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
}

interface TestResult {
    success: boolean;
    standardLevel?: string;
    aalLevel?: number;
    acrLevel?: number;
    mfaRequired?: boolean;
    error?: string;
    details?: string;
}

export function ClearanceTestTool({ mappings, countries }: Props) {
    const [selectedCountry, setSelectedCountry] = useState<string>('');
    const [nationalClearance, setNationalClearance] = useState<string>('');
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [testHistory, setTestHistory] = useState<Array<{
        country: string;
        input: string;
        result: TestResult;
        timestamp: Date;
    }>>([]);

    const examples: Record<string, string[]> = {
        'USA': ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP SECRET'],
        'FRA': ['NON-PROTÉGÉ', 'CONFIDENTIEL DÉFENSE', 'SECRET DÉFENSE'],
        'GBR': ['OFFICIAL', 'SECRET', 'TOP SECRET'],
        'DEU': ['VS-NUR FÜR DEN DIENSTGEBRAUCH', 'GEHEIM', 'STRENG GEHEIM'],
        'EST': ['AVALIK', 'SALASTATUD', 'KONFIDENTSIAALNE', 'SALAJANE', 'TÄIESTI SALAJANE']
    };

    const testMapping = (country: string, clearance: string) => {
        if (!country || !clearance) {
            setTestResult({
                success: false,
                error: 'Please select a country and enter a clearance level'
            });
            return;
        }

        // Search for matching mapping
        for (const mapping of mappings) {
            const countryEquivalents = mapping.nationalEquivalents[country] || [];
            const match = countryEquivalents.find(
                eq => eq.toLowerCase() === clearance.toLowerCase()
            );

            if (match) {
                const result: TestResult = {
                    success: true,
                    standardLevel: mapping.standardLevel,
                    aalLevel: mapping.aalLevel,
                    acrLevel: mapping.acrLevel,
                    mfaRequired: mapping.mfaRequired,
                    details: `"${clearance}" maps to ${mapping.standardLevel}`
                };

                setTestResult(result);
                setTestHistory(prev => [...prev, {
                    country,
                    input: clearance,
                    result,
                    timestamp: new Date()
                }].slice(-10)); // Keep last 10

                return;
            }
        }

        // No match found
        const result: TestResult = {
            success: false,
            error: `No mapping found for "${clearance}" in ${country}`,
            details: 'This clearance level is not recognized. Check spelling and diacritics.'
        };

        setTestResult(result);
        setTestHistory(prev => [...prev, {
            country,
            input: clearance,
            result,
            timestamp: new Date()
        }].slice(-10));
    };

    const handleTest = () => {
        testMapping(selectedCountry, nationalClearance);
    };

    const loadExample = (example: string) => {
        setNationalClearance(example);
    };

    const clearTest = () => {
        setNationalClearance('');
        setTestResult(null);
    };

    const getLevelColor = (level: string) => {
        const colors: Record<string, string> = {
            'UNCLASSIFIED': 'bg-green-500',
            'RESTRICTED': 'bg-yellow-500',
            'CONFIDENTIAL': 'bg-orange-500',
            'SECRET': 'bg-red-500',
            'TOP_SECRET': 'bg-purple-500'
        };
        return colors[level] || 'bg-gray-500';
    };

    return (
        <div className="space-y-6">
            {/* Test Interface */}
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 p-6">
                <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6 flex items-center gap-2">
                    🧪 Clearance Mapping Test Tool
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Input Section */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                🌍 Country
                            </label>
                            <select
                                value={selectedCountry}
                                onChange={(e) => {
                                    setSelectedCountry(e.target.value);
                                    setTestResult(null);
                                }}
                                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            >
                                <option value="">-- Select a country --</option>
                                {countries.map(country => (
                                    <option key={country} value={country}>
                                        {country}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                🔐 National Clearance Level
                            </label>
                            <input
                                type="text"
                                value={nationalClearance}
                                onChange={(e) => setNationalClearance(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleTest();
                                    }
                                }}
                                placeholder="Enter clearance level..."
                                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                💡 Case-insensitive. Include diacritics if applicable.
                            </p>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={handleTest}
                                disabled={!selectedCountry || !nationalClearance}
                                className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg font-medium hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                🧪 Test Mapping
                            </button>
                            <button
                                onClick={clearTest}
                                className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-all duration-200"
                            >
                                🗑️ Clear
                            </button>
                        </div>

                        {/* Examples */}
                        {selectedCountry && examples[selectedCountry] && (
                            <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    📋 Quick Examples for {selectedCountry}:
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {examples[selectedCountry].map((example, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => loadExample(example)}
                                            className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                                        >
                                            {example}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Result Section */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            📊 Test Result
                        </label>

                        {testResult ? (
                            <div className={`p-6 rounded-xl border-2 ${
                                testResult.success
                                    ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700'
                                    : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700'
                            }`}>
                                {testResult.success ? (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-bold text-lg">
                                            ✅ Mapping Found
                                        </div>

                                        <div className="space-y-3">
                                            <div>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">DIVE Standard Level</p>
                                                <div className={`inline-block px-4 py-2 ${getLevelColor(testResult.standardLevel!)} text-white rounded-lg font-bold`}>
                                                    {testResult.standardLevel}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-3 gap-2">
                                                <div>
                                                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">AAL Level</p>
                                                    <div className="px-3 py-2 bg-indigo-100 text-indigo-800 rounded-lg font-bold text-center">
                                                        {testResult.aalLevel}
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">ACR Level</p>
                                                    <div className="px-3 py-2 bg-purple-100 text-purple-800 rounded-lg font-bold text-center">
                                                        {testResult.acrLevel}
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">MFA</p>
                                                    <div className={`px-3 py-2 ${testResult.mfaRequired ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'} rounded-lg font-bold text-center`}>
                                                        {testResult.mfaRequired ? '✓' : '–'}
                                                    </div>
                                                </div>
                                            </div>

                                            <p className="text-sm text-gray-700 dark:text-gray-300 italic">
                                                {testResult.details}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-bold text-lg">
                                            ❌ No Mapping Found
                                        </div>
                                        <p className="text-red-700 dark:text-red-400 font-medium">
                                            {testResult.error}
                                        </p>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                            {testResult.details}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="p-6 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-center text-gray-500 dark:text-gray-400">
                                <div className="text-4xl mb-2">🔍</div>
                                <p>Enter a country and clearance level to test</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Test History */}
            {testHistory.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                            📜 Recent Tests
                        </h3>
                        <button
                            onClick={() => setTestHistory([])}
                            className="text-sm text-gray-600 dark:text-gray-400 hover:text-red-600"
                        >
                            Clear History
                        </button>
                    </div>

                    <div className="space-y-2">
                        {[...testHistory].reverse().map((test, idx) => (
                            <div
                                key={idx}
                                className={`p-3 rounded-lg border ${
                                    test.result.success
                                        ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700'
                                        : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className={`text-lg ${test.result.success ? 'text-green-600' : 'text-red-600'}`}>
                                            {test.result.success ? '✅' : '❌'}
                                        </span>
                                        <div>
                                            <p className="font-medium text-gray-800 dark:text-gray-200">
                                                {test.country}: "{test.input}"
                                            </p>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                {test.result.success
                                                    ? `→ ${test.result.standardLevel} (AAL${test.result.aalLevel})`
                                                    : test.result.error}
                                            </p>
                                        </div>
                                    </div>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {test.timestamp.toLocaleTimeString()}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Coverage Stats */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-xl shadow-lg border border-indigo-200 dark:border-indigo-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">
                    📊 Coverage Statistics
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                        <div className="text-2xl font-bold text-indigo-600">
                            {mappings.length}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Standard Levels</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                        <div className="text-2xl font-bold text-purple-600">
                            {countries.length}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Countries</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                        <div className="text-2xl font-bold text-green-600">
                            {mappings.reduce((sum, m) => sum + Object.keys(m.nationalEquivalents).length, 0)}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Total Mappings</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                        <div className="text-2xl font-bold text-orange-600">
                            {testHistory.length}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Tests Run</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
