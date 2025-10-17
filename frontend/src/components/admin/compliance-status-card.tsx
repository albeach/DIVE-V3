/**
 * Compliance Status Card Component
 * 
 * Displays compliance validation results for NATO/DoD standards
 * Phase 2: ACP-240, STANAG 4774/4778, NIST 800-63-3
 */

import React from 'react';

interface ComplianceCheck {
    overall: 'compliant' | 'partial' | 'non-compliant';
    standards: {
        acp240: {
            status: 'pass' | 'partial' | 'fail' | 'unknown';
            evidence: string[];
            gaps: string[];
        };
        stanag4774: {
            status: 'pass' | 'partial' | 'fail' | 'unknown';
            evidence: string[];
            gaps: string[];
        };
        stanag4778: {
            status: 'pass' | 'partial' | 'fail' | 'unknown';
            evidence: string[];
            gaps: string[];
        };
        nist80063: {
            status: 'pass' | 'partial' | 'fail' | 'unknown';
            evidence: string[];
            gaps: string[];
        };
    };
    score: number;
    gaps: string[];
    recommendations: string[];
}

interface ComplianceStatusCardProps {
    complianceCheck: ComplianceCheck;
}

const statusConfig = {
    pass: {
        icon: '✅',
        text: 'Compliant',
        color: 'text-green-600',
        bg: 'bg-green-50',
        border: 'border-green-200'
    },
    partial: {
        icon: '⚠️',
        text: 'Partial',
        color: 'text-yellow-600',
        bg: 'bg-yellow-50',
        border: 'border-yellow-200'
    },
    fail: {
        icon: '❌',
        text: 'Non-Compliant',
        color: 'text-red-600',
        bg: 'bg-red-50',
        border: 'border-red-200'
    },
    unknown: {
        icon: '❓',
        text: 'Unknown',
        color: 'text-gray-600',
        bg: 'bg-gray-50',
        border: 'border-gray-200'
    }
};

export default function ComplianceStatusCard({ complianceCheck }: ComplianceStatusCardProps) {
    const overallConfig = statusConfig[complianceCheck.overall === 'compliant' ? 'pass' : 
                                       complianceCheck.overall === 'partial' ? 'partial' : 'fail'];

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Compliance Status
                </h3>
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${overallConfig.bg} ${overallConfig.border} border`}>
                    <span>{overallConfig.icon}</span>
                    <span className={`font-semibold ${overallConfig.color}`}>
                        {overallConfig.text}
                    </span>
                </div>
            </div>

            <div className="space-y-3">
                {/* ACP-240 */}
                <ComplianceStandard
                    name="ACP-240"
                    fullName="NATO Access Control Policy"
                    status={complianceCheck.standards.acp240.status}
                    evidence={complianceCheck.standards.acp240.evidence}
                    gaps={complianceCheck.standards.acp240.gaps}
                />

                {/* STANAG 4774 */}
                <ComplianceStandard
                    name="STANAG 4774"
                    fullName="Security Labeling"
                    status={complianceCheck.standards.stanag4774.status}
                    evidence={complianceCheck.standards.stanag4774.evidence}
                    gaps={complianceCheck.standards.stanag4774.gaps}
                />

                {/* STANAG 4778 */}
                <ComplianceStandard
                    name="STANAG 4778"
                    fullName="Cryptographic Binding"
                    status={complianceCheck.standards.stanag4778.status}
                    evidence={complianceCheck.standards.stanag4778.evidence}
                    gaps={complianceCheck.standards.stanag4778.gaps}
                />

                {/* NIST 800-63 */}
                <ComplianceStandard
                    name="NIST 800-63-3"
                    fullName="Digital Identity Guidelines"
                    status={complianceCheck.standards.nist80063.status}
                    evidence={complianceCheck.standards.nist80063.evidence}
                    gaps={complianceCheck.standards.nist80063.gaps}
                />
            </div>

            {/* Compliance Score */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Compliance Score
                    </span>
                    <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {complianceCheck.score}/10
                    </span>
                </div>
            </div>

            {/* Gaps and Recommendations */}
            {complianceCheck.gaps.length > 0 && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        Compliance Gaps
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                        {complianceCheck.gaps.slice(0, 5).map((gap, index) => (
                            <li key={index}>{gap}</li>
                        ))}
                    </ul>
                </div>
            )}

            {complianceCheck.recommendations.length > 0 && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        Recommendations
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                        {complianceCheck.recommendations.slice(0, 3).map((rec, index) => (
                            <li key={index}>{rec}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

// Sub-component for individual standard
function ComplianceStandard({
    name,
    fullName,
    status,
    evidence,
    gaps
}: {
    name: string;
    fullName: string;
    status: 'pass' | 'partial' | 'fail' | 'unknown';
    evidence: string[];
    gaps: string[];
}) {
    const config = statusConfig[status];
    
    return (
        <details className="group">
            <summary className="flex items-center justify-between cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="flex items-center gap-3 flex-1">
                    <span className="text-xl">{config.icon}</span>
                    <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                            {name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                            {fullName}
                        </div>
                    </div>
                </div>
                <span className={`text-sm font-semibold ${config.color}`}>
                    {config.text}
                </span>
            </summary>
            
            <div className="mt-2 ml-10 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg text-sm">
                {evidence.length > 0 && (
                    <div className="mb-2">
                        <div className="font-medium text-green-700 dark:text-green-400 mb-1">
                            Evidence:
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
                            {evidence.map((item, index) => (
                                <li key={index}>{item}</li>
                            ))}
                        </ul>
                    </div>
                )}
                
                {gaps.length > 0 && (
                    <div>
                        <div className="font-medium text-red-700 dark:text-red-400 mb-1">
                            Gaps:
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
                            {gaps.map((item, index) => (
                                <li key={index}>{item}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </details>
    );
}

