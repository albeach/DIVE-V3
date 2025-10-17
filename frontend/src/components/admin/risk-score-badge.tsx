/**
 * Risk Score Badge Component
 * 
 * Displays comprehensive risk score with tier badge
 * Phase 2: 100-point scoring system
 */

import React from 'react';

interface RiskScoreBadgeProps {
    score: number;
    maxScore?: number;
    tier: 'gold' | 'silver' | 'bronze' | 'fail';
    riskLevel: 'minimal' | 'low' | 'medium' | 'high';
    size?: 'sm' | 'md' | 'lg';
}

const tierConfig = {
    gold: {
        bg: 'bg-yellow-500',
        text: 'text-yellow-900',
        ring: 'ring-yellow-600',
        label: '🥇 Gold',
        description: 'Minimal Risk - Auto-Approved'
    },
    silver: {
        bg: 'bg-gray-400',
        text: 'text-gray-900',
        ring: 'ring-gray-500',
        label: '🥈 Silver',
        description: 'Low Risk - Fast-Track'
    },
    bronze: {
        bg: 'bg-orange-600',
        text: 'text-orange-100',
        ring: 'ring-orange-700',
        label: '🥉 Bronze',
        description: 'Medium Risk - Standard Review'
    },
    fail: {
        bg: 'bg-red-600',
        text: 'text-red-100',
        ring: 'ring-red-700',
        label: '❌ Fail',
        description: 'High Risk - Rejected'
    }
};

export default function RiskScoreBadge({
    score,
    maxScore = 100,
    tier,
    riskLevel,
    size = 'md'
}: RiskScoreBadgeProps) {
    const config = tierConfig[tier];
    const percentage = Math.round((score / maxScore) * 100);
    
    const sizeClasses = {
        sm: 'text-sm px-2 py-1',
        md: 'text-base px-3 py-2',
        lg: 'text-lg px-4 py-3'
    };

    return (
        <div className="inline-flex flex-col gap-2">
            <div className={`inline-flex items-center gap-2 rounded-lg ${config.bg} ${config.text} ${sizeClasses[size]} font-semibold ring-2 ${config.ring} shadow-md`}>
                <span className="text-2xl">{config.label.split(' ')[0]}</span>
                <div className="flex flex-col">
                    <span className="text-lg font-bold">{score}/{maxScore}</span>
                    <span className="text-xs opacity-90">{percentage}%</span>
                </div>
            </div>
            <span className="text-xs text-gray-600 dark:text-gray-400 text-center">
                {config.description}
            </span>
        </div>
    );
}

