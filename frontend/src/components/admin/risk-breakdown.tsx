/**
 * Risk Score Breakdown Component
 * 
 * Shows detailed breakdown of risk score by category
 * Phase 2: Technical, Authentication, Operational, Compliance
 */

import React from 'react';

interface ScoreBreakdown {
    technicalSecurity: number;
    authenticationStrength: number;
    operationalMaturity: number;
    complianceGovernance: number;
}

interface RiskBreakdownProps {
    breakdown: ScoreBreakdown;
}

export default function RiskBreakdown({ breakdown }: RiskBreakdownProps) {
    const categories = [
        {
            name: 'Technical Security',
            score: breakdown.technicalSecurity,
            maxScore: 40,
            description: 'TLS version, cryptographic algorithms',
            color: 'blue'
        },
        {
            name: 'Authentication Strength',
            score: breakdown.authenticationStrength,
            maxScore: 30,
            description: 'MFA enforcement, identity assurance',
            color: 'green'
        },
        {
            name: 'Operational Maturity',
            score: breakdown.operationalMaturity,
            maxScore: 20,
            description: 'SLA, incident response, patching, support',
            color: 'purple'
        },
        {
            name: 'Compliance & Governance',
            score: breakdown.complianceGovernance,
            maxScore: 10,
            description: 'NATO certification, audit logging',
            color: 'indigo'
        }
    ];

    const getColorClasses = (color: string, score: number, maxScore: number) => {
        const percentage = (score / maxScore) * 100;
        const opacity = percentage >= 80 ? '500' : percentage >= 50 ? '400' : '300';
        
        return {
            bg: `bg-${color}-${opacity}`,
            text: `text-${color}-900`,
            border: `border-${color}-600`
        };
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Risk Score Breakdown
            </h3>
            
            <div className="space-y-3">
                {categories.map((category) => {
                    const percentage = Math.round((category.score / category.maxScore) * 100);
                    
                    return (
                        <div key={category.name} className="space-y-1">
                            <div className="flex justify-between items-center">
                                <div className="flex-1">
                                    <div className="font-medium text-gray-900 dark:text-gray-100">
                                        {category.name}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                        {category.description}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-gray-900 dark:text-gray-100">
                                        {category.score}/{category.maxScore}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {percentage}%
                                    </div>
                                </div>
                            </div>
                            
                            {/* Progress bar */}
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                                <div
                                    className={`h-2.5 rounded-full transition-all duration-300 ${
                                        percentage >= 80 ? 'bg-green-500' :
                                        percentage >= 50 ? 'bg-yellow-500' :
                                        'bg-red-500'
                                    }`}
                                    style={{ width: `${percentage}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center font-bold text-lg">
                    <span className="text-gray-900 dark:text-gray-100">Total Score</span>
                    <span className="text-gray-900 dark:text-gray-100">
                        {breakdown.technicalSecurity + breakdown.authenticationStrength + 
                         breakdown.operationalMaturity + breakdown.complianceGovernance}/100
                    </span>
                </div>
            </div>
        </div>
    );
}
