/**
 * Risk Factor Analysis Component
 * 
 * Detailed breakdown table of all 11 risk factors
 * Phase 2: Shows evidence, concerns, and recommendations for each factor
 */

import React from 'react';

interface RiskFactor {
    category: 'technical' | 'authentication' | 'operational' | 'compliance';
    factor: string;
    score: number;
    maxScore: number;
    weight: number;
    evidence: string[];
    concerns: string[];
    recommendation?: string;
}

interface RiskFactorAnalysisProps {
    factors: RiskFactor[];
}

const categoryConfig = {
    technical: {
        label: 'Technical Security',
        color: 'blue',
        icon: '🔒'
    },
    authentication: {
        label: 'Authentication Strength',
        color: 'green',
        icon: '🔐'
    },
    operational: {
        label: 'Operational Maturity',
        color: 'purple',
        icon: '⚙️'
    },
    compliance: {
        label: 'Compliance & Governance',
        color: 'indigo',
        icon: '📋'
    }
};

export default function RiskFactorAnalysis({ factors }: RiskFactorAnalysisProps) {
    // Group factors by category
    const factorsByCategory = factors.reduce((acc, factor) => {
        if (!acc[factor.category]) {
            acc[factor.category] = [];
        }
        acc[factor.category].push(factor);
        return acc;
    }, {} as Record<string, RiskFactor[]>);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Risk Factor Analysis
            </h3>

            <div className="space-y-6">
                {Object.entries(factorsByCategory).map(([category, categoryFactors]) => {
                    const config = categoryConfig[category as keyof typeof categoryConfig];
                    const totalScore = categoryFactors.reduce((sum, f) => sum + f.score, 0);
                    const totalMax = categoryFactors.reduce((sum, f) => sum + f.maxScore, 0);

                    return (
                        <div key={category} className="space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-2">
                                    <span className="text-xl">{config.icon}</span>
                                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                                        {config.label}
                                    </h4>
                                </div>
                                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                    {totalScore}/{totalMax} pts
                                </span>
                            </div>

                            <div className="space-y-2">
                                {categoryFactors.map((factor, index) => (
                                    <FactorRow key={`${category}-${index}`} factor={factor} />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Overall Recommendations */}
            <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Priority Recommendations
                </h4>
                <ul className="space-y-2">
                    {factors
                        .filter(f => f.recommendation && f.score < f.maxScore)
                        .sort((a, b) => (b.maxScore - b.score) - (a.maxScore - a.score))
                        .slice(0, 5)
                        .map((factor, index) => (
                            <li key={index} className="flex items-start gap-2 text-sm">
                                <span className="text-blue-600 dark:text-blue-400 font-bold">
                                    {index + 1}.
                                </span>
                                <span className="text-gray-700 dark:text-gray-300">
                                    <strong>{factor.factor}:</strong> {factor.recommendation}
                                </span>
                            </li>
                        ))}
                </ul>
            </div>
        </div>
    );
}

// Individual factor row
function FactorRow({ factor }: { factor: RiskFactor }) {
    const percentage = Math.round((factor.score / factor.maxScore) * 100);
    const isPerfect = percentage === 100;
    const isFailing = percentage < 50;

    return (
        <details className="group">
            <summary className="flex items-center justify-between cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="flex items-center gap-3 flex-1">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
                        isPerfect ? 'bg-green-100 text-green-700' :
                        isFailing ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                    }`}>
                        {percentage}%
                    </div>
                    <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                            {factor.factor}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                            {factor.score}/{factor.maxScore} points
                        </div>
                    </div>
                </div>
                <div className="text-sm">
                    {isPerfect ? (
                        <span className="text-green-600 font-semibold">✓ Perfect</span>
                    ) : factor.concerns.length > 0 ? (
                        <span className="text-red-600 font-semibold">{factor.concerns.length} issues</span>
                    ) : (
                        <span className="text-gray-500">Details</span>
                    )}
                </div>
            </summary>

            <div className="mt-2 ml-16 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg space-y-3 text-sm">
                {factor.evidence.length > 0 && (
                    <div>
                        <div className="font-medium text-green-700 dark:text-green-400 mb-1">
                            ✓ Evidence:
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
                            {factor.evidence.map((item, idx) => (
                                <li key={idx}>{item}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {factor.concerns.length > 0 && (
                    <div>
                        <div className="font-medium text-red-700 dark:text-red-400 mb-1">
                            ⚠ Concerns:
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
                            {factor.concerns.map((item, idx) => (
                                <li key={idx}>{item}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {factor.recommendation && (
                    <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                        <div className="font-medium text-blue-700 dark:text-blue-400 mb-1">
                            💡 Recommendation:
                        </div>
                        <div className="text-gray-700 dark:text-gray-300">
                            {factor.recommendation}
                        </div>
                    </div>
                )}
            </div>
        </details>
    );
}

