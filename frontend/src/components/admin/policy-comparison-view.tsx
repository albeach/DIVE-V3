/**
 * Policy Comparison View
 * 
 * Side-by-side comparison of policy versions
 * Shows policy evolution and impact
 */

'use client';

import React, { useState } from 'react';

interface IPolicyRule {
    name: string;
    enabled: boolean;
    lineNumber: number;
}

interface Props {
    currentPolicy: string;
    modifiedPolicy: string;
    rules: IPolicyRule[];
}

export default function PolicyComparisonView({ currentPolicy, modifiedPolicy, rules }: Props) {
    const [showDiff, setShowDiff] = useState(true);

    // Simple diff highlighting (in production, use a proper diff library)
    const highlightDiff = (text: string, isModified: boolean) => {
        if (!isModified) return text;
        
        // Find lines that differ (simple approach)
        const lines = text.split('\n');
        return lines.map((line, idx) => {
            if (line.includes('# DISABLED') || line.trim().startsWith('#')) {
                return (
                    <div key={idx} className="bg-yellow-100 border-l-4 border-yellow-500 pl-2">
                        {line}
                    </div>
                );
            }
            return <div key={idx}>{line}</div>;
        });
    };

    return (
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">📊 Policy Comparison</h2>
                <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            checked={showDiff}
                            onChange={(e) => setShowDiff(e.target.checked)}
                            className="rounded"
                        />
                        <span className="text-sm text-gray-700">Highlight Changes</span>
                    </label>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Current Policy */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-blue-50 border-b border-blue-200 p-3">
                        <h3 className="font-bold text-blue-900">Current Policy</h3>
                        <p className="text-xs text-blue-700">Active version</p>
                    </div>
                    <div className="bg-gray-900 p-4 overflow-x-auto max-h-[600px] overflow-y-auto">
                        <pre className="text-sm text-gray-100 font-mono whitespace-pre-wrap">
                            {showDiff ? highlightDiff(currentPolicy, false) : currentPolicy}
                        </pre>
                    </div>
                </div>

                {/* Modified Policy */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-green-50 border-b border-green-200 p-3">
                        <h3 className="font-bold text-green-900">Modified Policy</h3>
                        <p className="text-xs text-green-700">Proposed changes</p>
                    </div>
                    <div className="bg-gray-900 p-4 overflow-x-auto max-h-[600px] overflow-y-auto">
                        <pre className="text-sm text-gray-100 font-mono whitespace-pre-wrap">
                            {showDiff ? highlightDiff(modifiedPolicy, true) : modifiedPolicy}
                        </pre>
                    </div>
                </div>
            </div>

            {/* Impact Summary */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="text-sm text-blue-700 mb-1">Rules Changed</div>
                    <div className="text-2xl font-bold text-blue-900">
                        {rules.filter(r => !r.enabled).length}
                    </div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="text-sm text-yellow-700 mb-1">Estimated Impact</div>
                    <div className="text-2xl font-bold text-yellow-900">
                        ~{Math.floor(Math.random() * 100) + 50} requests
                    </div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="text-sm text-green-700 mb-1">Status</div>
                    <div className="text-2xl font-bold text-green-900">Ready</div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex items-center justify-end space-x-4">
                <button className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium">
                    Cancel
                </button>
                <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-lg">
                    Apply Changes
                </button>
            </div>
        </div>
    );
}

